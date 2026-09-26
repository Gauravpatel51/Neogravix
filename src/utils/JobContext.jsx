import React, { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './useAuth';
import { fetchAPI, BACKEND_URL } from '../api/apiClient';
import { saveTest } from './storage';

const JobContext = createContext(null);

export function JobProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [activeJobs, setActiveJobs] = useState({}); // Map of jobId to job data
  const [dismissedJobs, setDismissedJobs] = useState(new Set());

  useEffect(() => {
    if (!user) {
        if (socket) socket.disconnect();
        // Clear jobs when user logs out
        setActiveJobs({});
        setDismissedJobs(new Set());
        return;
    }

    const newSocket = io(BACKEND_URL);

    newSocket.on('connect', () => {
      console.log('Connected to backend socket');
      newSocket.emit('join', user.uid);
    });

    newSocket.on('reconnect', () => {
      console.log('Reconnected to backend socket. Re-joining room...');
      newSocket.emit('join', user.uid);
    });

    newSocket.on('disconnect', (reason) => {
      console.warn('Disconnected from backend socket:', reason);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connect error:', error.message);
    });

    if (newSocket.connected) {
      newSocket.emit('join', user.uid);
    }

    const mergeJob = (prevJobs, jobId, patch) => {
      const old = prevJobs[jobId] || {};
      const newProgress = Math.max(old.progress || 0, patch.progress ?? 0);
      return {
          ...prevJobs,
          [jobId]: { ...old, ...patch, progress: newProgress }
      };
    };

    newSocket.on('upload-progress', (data) => {
        setActiveJobs(prev => mergeJob(prev, data.jobId, {
            status: 'uploading',
            progress: data.progress,
            statusText: 'Uploading PDF...'
        }));
    });

    newSocket.on('job-started', (data) => {
        setActiveJobs(prev => mergeJob(prev, data.jobId, { status: 'processing' }));
    });

    newSocket.on('job-progress', (data) => {
        setActiveJobs(prev => mergeJob(prev, data.jobId, { 
            status: 'processing', 
            progress: data.progress,
            pagesCompleted: data.pagesCompleted,
            totalPages: data.totalPages,
            questionsExtracted: data.questionsExtracted,
            failedPages: data.failedPages || prev[data.jobId]?.failedPages
        }));
    });

    newSocket.on('job-completed', (data) => {
        const generatedTestId = data.testId || `test_${Date.now()}`;
        if (data.questions && user?.uid) {
            saveTest(user.uid, {
                id: generatedTestId,
                name: data.testName || 'AI Extracted Test',
                questions: data.questions,
                duration: data.duration || 3 * 3600,
                pdfUrl: data.pdfUrl,
                createdAt: Date.now(),
                completed: false
            });
            setTimeout(() => {
                window.dispatchEvent(new Event('storage'));
            }, 500);
        }

        setActiveJobs(prev => mergeJob(prev, data.jobId, { status: 'completed', progress: 100, testId: generatedTestId }));
    });

    newSocket.on('job-failed', (data) => {
        if (data.jobId) {
            setActiveJobs(prev => ({
                ...prev,
                [data.jobId]: { ...prev[data.jobId], status: 'failed', error: data.error }
            }));
        } else {
            console.error("Job failed:", data.error);
        }
    });

    setSocket(newSocket);

    // Fetch existing active jobs from backend via API on mount
    fetchExistingJobs();

    let consecutiveErrors = 0;
    // 10-second Polling fallback for guaranteed UI updates even without WebSockets
    const pollInterval = setInterval(async () => {
        try {
            await fetchExistingJobs();
            consecutiveErrors = 0;
        } catch (err) {
            consecutiveErrors++;
            console.warn(`[Jobs Polling] Pausing due to error (${consecutiveErrors}/3)`);
            if (consecutiveErrors >= 3) {
                console.error('[Jobs Polling] Auto-stopping poll interval to prevent server crash.');
                clearInterval(pollInterval);
            }
        }
    }, 10000);

    return () => {
        clearInterval(pollInterval);
        newSocket.disconnect();
    };
  }, [user]);

  const fetchExistingJobs = async () => {
      const res = await fetchAPI(`/api/jobs?t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.jobs) {
          setActiveJobs(prev => {
              const updated = { ...prev };
              data.jobs.forEach(job => {
                  if (job.status === 'processing' || job.status === 'queued') {
                      const newProgress = Math.max(updated[job.id]?.progress || 0, job.progress || 0);
                      updated[job.id] = {
                          status: job.status,
                          progress: newProgress,
                          pagesCompleted: job.pages_completed || 0,
                          totalPages: job.total_pages || 0,
                          questionsExtracted: job.extracted_questions || 0,
                          failedPages: job.metadata?.failedPages || updated[job.id]?.failedPages
                      };
                  } else if (job.status === 'failed') {
                      if (!updated[job.id] || updated[job.id].status !== 'failed') {
                          updated[job.id] = {
                              status: 'failed',
                              error: job.error_message || 'Extraction failed'
                          };
                      }
                  } else if (job.status === 'completed') {
                      if (!updated[job.id] || updated[job.id].status !== 'completed') {
                          updated[job.id] = {
                              ...updated[job.id],
                              status: 'completed',
                              progress: 100,
                              failedPages: job.metadata?.failedPages || updated[job.id]?.failedPages
                          };
                      }
                  }
              });
              return updated;
          });
      }
  };

  const uploadPdf = async (file, testName, duration, language = 'English') => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('testName', testName);
      formData.append('duration', duration);
      formData.append('language', language);

      const res = await fetchAPI('/api/upload', {
          method: 'POST',
          body: formData
      });

      if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Upload failed');
      }

      const data = await res.json();
      setActiveJobs(prev => ({
          ...prev,
          [data.jobId]: { status: 'queued', progress: 0 }
      }));

      return data.jobId;
  };

  const clearJob = (jobId) => {
      setDismissedJobs(prev => new Set(prev).add(jobId));
  };

  const clearAllJobs = () => {
      setDismissedJobs(new Set(Object.keys(activeJobs)));
  };

  const visibleActiveJobs = Object.fromEntries(
      Object.entries(activeJobs).filter(([id]) => !dismissedJobs.has(id))
  );

  return (
    <JobContext.Provider value={{ activeJobs: visibleActiveJobs, uploadPdf, clearJob, clearAllJobs }}>
      {children}
    </JobContext.Provider>
  );
}

export const useJob = () => useContext(JobContext);
