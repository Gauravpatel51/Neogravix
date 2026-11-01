import React, { useState, useEffect, useCallback, useRef } from 'react'
import { saveTest } from '../utils/storage'
import { useSettings } from '../utils/SettingsContext'
import { Clock, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, AlertTriangle, Menu, X, Check, ChevronsRight, ChevronsLeft, ZoomIn, Edit3, FileText, ExternalLink } from 'lucide-react'
import NotesPad from '../components/NotesPad'
import { useAuth } from '../utils/useAuth'
import { createNotification } from '../api/notifications'
import { startTestAttempt, saveAttemptState, submitAttempt, recordViolation } from '../api/exam'
import { CameraProctor } from '../utils/cameraProctor'
import { CAMERA_PROCTORING_ENABLED } from '../config/proctoring'
import { Camera, Eye, VideoOff } from 'lucide-react'

import MathText from '../components/MathText'


const TOTAL_SECONDS = 3 * 60 * 60

const formatOptionText = (text, opt, hasDiagram) => {
  if (!text || typeof text !== 'string') return `Option ${opt}`;
  const trimmed = text.trim();
  const match = trimmed.match(/^[\(\[\{]?([1-4a-dA-D]|option\s*[a-d1-4])[\)\]\}]?[\.\:\-\s]+(.+)$/i);
  if (match && match[2].trim().length > 0) {
    return match[2].trim();
  }
  if (/^[\(\[\{]?[1-4a-dA-D][\)\]\}]?\.?$/.test(trimmed)) {
    if (hasDiagram) {
      return `${trimmed} — (Refer to diagram/question)`;
    }
    return `Option ${opt}`;
  }
  return trimmed;
};

export default function ExamPage({ test, setPage, setActiveTest }) {
  const { profile, user } = useAuth()
  const { settings } = useSettings()
  const totalSeconds = test.duration || TOTAL_SECONDS
  
  const [attemptId, setAttemptId] = useState(null)
  const [questionStates, setQuestionStates] = useState({})
  const [questionTimeSpent, setQuestionTimeSpent] = useState({})
  
  const [current, setCurrent] = useState(0)
  const [timeLeft, setTimeLeft] = useState(totalSeconds)
  
  const [showSubmit, setShowSubmit] = useState(false)
  
  const questions = test.questions || []
  
  // New States for Redesign
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [expandedSubjects, setExpandedSubjects] = useState({})
  const [zoomedImage, setZoomedImage] = useState(null)
  const [brokenImages, setBrokenImages] = useState({})
  
  // Notes Pad State
  const [showNotes, setShowNotes] = useState(false)
  const [showNotesPrompt, setShowNotesPrompt] = useState(false)

  // Anti-Cheating & Proctoring State
  const [violationCount, setViolationCount] = useState(0)
  const [showViolationWarning, setShowViolationWarning] = useState(false)
  const [violationReason, setViolationReason] = useState('Exited Fullscreen')
  const MAX_VIOLATIONS = 5

  const proctoringMode = test?.proctoringMode || (typeof localStorage !== 'undefined' ? localStorage.getItem('neogravix_proctoring_mode') : 'none') || 'none'
  const isCameraMode = CAMERA_PROCTORING_ENABLED && proctoringMode === 'camera'

  const videoRef = useRef(null)
  const proctorRef = useRef(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraWarningText, setCameraWarningText] = useState(null)

  // Group questions by subject
  let subjectGroups = []
  questions.forEach((q, idx) => {
    const sub = q.subject || 'Other'
    const key = sub.charAt(0).toUpperCase() + sub.slice(1)
    
    let group = subjectGroups.find(g => g.name === key)
    if (!group) {
      group = { name: key, questions: [] }
      subjectGroups.push(group)
    }
    group.questions.push({ ...q, absoluteIndex: idx })
  })

  const displayGroups = settings.groupSubject ? subjectGroups : [{
    name: 'All Questions',
    questions: questions.map((q, idx) => ({ ...q, absoluteIndex: idx }))
  }]

  // Default expand all subjects
  useEffect(() => {
    if (Object.keys(expandedSubjects).length === 0 && displayGroups.length > 0) {
      const initial = {}
      displayGroups.forEach(g => initial[g.name] = true)
      setExpandedSubjects(initial)
    }
  }, [displayGroups])

  // Load Attempt State
  useEffect(() => {
    let mounted = true
    const init = async () => {
      if (profile?.id && test?.id) {
        try {
          const attempt = await startTestAttempt(profile.id, test.id)
          if (mounted) {
            setAttemptId(attempt.id)
            setQuestionStates(attempt.question_states || {})
            const localCount = localStorage.getItem(`attempt_${test.id}_violations`) || localStorage.getItem(`attempt_${attempt.id}_violations`)
            const restoredCount = Math.max(attempt.violation_count || 0, localCount ? Number(localCount) : 0)
            setViolationCount(restoredCount)
            const elapsed = Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000)
            setTimeLeft(Math.max(0, totalSeconds - elapsed))
          }
        } catch (err) {
          console.error("Failed to start/resume attempt", err)
        }
      } else {
        // Fallback for missing profile
        setQuestionStates({})
      }
    }
    init()
    return () => mounted = false
  }, [profile?.id, test?.id, totalSeconds])

  // Track Visited automatically
  useEffect(() => {
    const q = questions[current]
    if (q) {
      setQuestionStates(prev => {
        if (!prev[q.id]?.visited) {
          return { ...prev, [q.id]: { ...(prev[q.id] || {}), visited: true, updatedAt: Date.now() } }
        }
        return prev
      })
    }
  }, [current, questions])

  // Timer
  useEffect(() => {
    if (timeLeft <= 0) { handleSubmit(); return }
    const t = setInterval(() => {
      setTimeLeft(p => {
        if (p <= 1) { clearInterval(t); handleSubmit(); return 0 }
        return p - 1
      })
      if (!showSubmit) {
        setQuestionTimeSpent(prev => {
          const currentQId = questions[current]?.id;
          if (!currentQId) return prev;
          return { ...prev, [currentQId]: (prev[currentQId] || 0) + 1 };
        })
      }
    }, 1000)
    return () => clearInterval(t)
  }, [current, questions, showSubmit])

  // Keyboard Shortcuts
  useEffect(() => {
    if (!settings.enableShortcuts) return;
    const handleKeyDown = (e) => {
      if (showSubmit) return;
      if (e.key === 'ArrowRight') setCurrent(p => Math.min(questions.length - 1, p + 1))
      if (e.key === 'ArrowLeft') setCurrent(p => Math.max(0, p - 1))
      if (['a', 'b', 'c', 'd'].includes(e.key.toLowerCase())) {
         const q = questions[current];
         if (q) handleAnswer(q.id, e.key.toUpperCase())
      }
    }
    
    // Global hotkey for notes
    const handleNotesHotkey = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setShowNotes(p => !p);
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keydown', handleNotesHotkey)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keydown', handleNotesHotkey)
    }
  }, [current, questions, settings.enableShortcuts, showSubmit])

  // Auto-save questionStates to backend
  useEffect(() => {
    if (!attemptId || !settings.autoSaveAnswers) return;
    const timer = setTimeout(() => {
      saveAttemptState(attemptId, questionStates, totalSeconds - timeLeft).catch(console.error)
    }, 2000) // debounce save every 2s after changes
    return () => clearTimeout(timer)
  }, [questionStates, attemptId, settings.autoSaveAnswers, totalSeconds, timeLeft])

  // Anti-Cheating: Monitor Fullscreen
  useEffect(() => {
    const handleFullscreenChange = async () => {
      if (!document.fullscreenElement && !showSubmit) {
        // Exited fullscreen!
        const newCount = violationCount + 1;
        setViolationCount(newCount);
        
        if (attemptId && profile?.id) {
          recordViolation(attemptId, profile.id, 'Exited Fullscreen').catch(console.error)
        }

        if (newCount >= MAX_VIOLATIONS) {
           // Auto submit directly behind the scenes
           await handleSubmit(true); 
        } else {
           setShowViolationWarning(true);
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    }
  }, [violationCount, attemptId, profile?.id, showSubmit]);
  // Camera Proctoring Lifecycle
  useEffect(() => {
    if (!isCameraMode) {
      // "Without camera" mode: NEVER calls getUserMedia!
      return;
    }

    let active = true;
    const proctor = new CameraProctor({
      videoElement: videoRef.current,
      initialViolationCount: violationCount,
      onStateChange: (state) => {
        if (!active) return;
        if (state.status === 'warning') {
          setCameraWarningText(state.activeWarning);
        } else {
          setCameraWarningText(null);
        }
      },
      onViolation: async ({ violationType, violationCount: newCount, autoSubmit, snapshotBase64 }) => {
        if (!active) return;
        setViolationCount(newCount);
        setViolationReason(violationType);

        try {
          localStorage.setItem(`attempt_${test?.id}_violations`, String(newCount));
          if (attemptId) localStorage.setItem(`attempt_${attemptId}_violations`, String(newCount));
        } catch (e) {}

        if (attemptId && profile?.id) {
          recordViolation(attemptId, profile.id, violationType, snapshotBase64).catch(console.error);
        }

        if (autoSubmit || newCount >= MAX_VIOLATIONS) {
          await handleSubmit(true);
        } else {
          setShowViolationWarning(true);
        }
      },
      onFallbackToWithoutCamera: ({ reason }) => {
        if (!active) return;
        console.warn('[ExamPage] Camera/model unavailable. Falling back to without-camera:', reason);
        setCameraActive(false);
      }
    });

    proctorRef.current = proctor;
    proctor.start().then(() => {
      if (active) setCameraActive(true);
    }).catch(err => {
      console.warn('[ExamPage] Camera start error:', err);
      if (active) setCameraActive(false);
    });

    return () => {
      active = false;
      proctor.stop();
    };
  }, [isCameraMode, attemptId, profile?.id, handleSubmit]);


  const requestFullscreenAgain = () => {
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen(); // Safari
      } else if (document.documentElement.msRequestFullscreen) {
        document.documentElement.msRequestFullscreen(); // IE11
      }
    } catch (err) {
      console.error("Failed to restore fullscreen:", err);
    }
    setShowViolationWarning(false);
  }

  const formatTime = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const handleAnswer = (qid, option) => {
    setQuestionStates(prev => {
      const qs = prev[qid] || {}
      const newOption = qs.selectedOption === option ? null : option
      return {
        ...prev,
        [qid]: { ...qs, selectedOption: newOption, visited: true, updatedAt: Date.now() }
      }
    })
  }

  const handleMarkReview = (qid) => {
    setQuestionStates(prev => {
      const qs = prev[qid] || {}
      return {
        ...prev,
        [qid]: { ...qs, markedForReview: !qs.markedForReview, visited: true, updatedAt: Date.now() }
      }
    })
    setCurrent(p => Math.min(questions.length - 1, p + 1)) // move next
  }

  const triggerSubmit = () => {
    if (settings.confirmSubmit) setShowSubmit(true);
    else setShowNotesPrompt(true);
  }

  const handleSubmit = useCallback(async (isViolationAutoSubmit = false) => {
    let score = 0, maxScore = 0
    questions.forEach(q => {
      maxScore += 4
      const ans = questionStates[q.id]?.selectedOption
      if (ans) {
        if (ans === q.correct) score += 4
        else score -= 1
      }
    })

    const finalStats = { score, maxScore, timeTaken: totalSeconds - timeLeft }

    if (attemptId) {
      await submitAttempt(attemptId, finalStats, questionStates)
    }

    // Keep legacy local save for backward compatibility in other parts of app for now
    const legacyAnswers = {}
    Object.keys(questionStates).forEach(k => {
      if (questionStates[k].selectedOption) legacyAnswers[k] = questionStates[k].selectedOption
    })
    const completed = { ...test, answers: legacyAnswers, completed: true, completedAt: Date.now(), finalScore: score, maxScore, timeTaken: totalSeconds - timeLeft }
    saveTest(completed)
    
    // Trigger notification
    if (profile?.id) {
      const acc = maxScore > 0 ? Math.round(((score > 0 ? score : 0) / maxScore) * 100) : 0; // rough accuracy mapping
      createNotification(profile.id, {
        title: 'Test Result Published',
        message: `Your result for ${test.name} is ready. Score: ${score}/${maxScore}.`,
        type: 'result',
        actionUrl: null
      });
    }

    setActiveTest(completed)
    
    if (isViolationAutoSubmit === true) {
      // Don't navigate, let the violation modal handle it
      return;
    }
    
    setPage('analysis')
  }, [questionStates, timeLeft, test, questions, profile?.id, attemptId])

  const q = questions[current]
  const attempted = Object.values(questionStates).filter(qs => !!qs.selectedOption).length
  const reviewCount = Object.values(questionStates).filter(qs => qs.markedForReview).length
  const timerColor = timeLeft < 600 ? 'var(--red)' : timeLeft < 1800 ? 'var(--yellow)' : 'var(--green)'
  const subjectColor = (sub) => sub === 'Physics' ? '#a5b4fc' : sub === 'Chemistry' ? '#6ee7b7' : '#fcd34d'
  const questionFontSize = settings.fontSize === 'Large' ? 20 : settings.fontSize === 'Small' ? 14 : 16;

  // Palette Logic
  const getStatus = (q) => {
    const qs = questionStates[q.id] || {}
    const isAns = !!qs.selectedOption
    const isMark = !!qs.markedForReview
    const isVis = !!qs.visited

    if (isAns && isMark) return 'answered-marked'
    if (isMark) return 'marked'
    if (isAns) return 'answered'
    if (isVis) return 'not-answered'
    return 'not-visited'
  }

  const getStatusColors = (status) => {
    switch(status) {
      case 'answered-marked': return { bg: '#a855f730', border: '#a855f7', color: '#d8b4fe' }
      case 'marked': return { bg: '#a855f730', border: '#a855f7', color: '#d8b4fe' }
      case 'answered': return { bg: 'color-mix(in srgb, var(--green) 19%, transparent)', border: 'var(--green)', color: '#6ee7b7' }
      case 'not-answered': return { bg: 'color-mix(in srgb, var(--red) 19%, transparent)', border: 'var(--red)', color: '#fca5a5' }
      case 'not-visited': default: return { bg: 'var(--surface2)', border: 'var(--border)', color: '#94a3b8' }
    }
  }

  const getSubjectSummary = (group) => {
    let ans = 0, notAns = 0, notVis = 0, mark = 0, ansMark = 0;
    group.questions.forEach(q => {
      const s = getStatus(q);
      if (s === 'answered-marked') ansMark++;
      else if (s === 'marked') mark++;
      else if (s === 'answered') ans++;
      else if (s === 'not-answered') notAns++;
      else notVis++;
    })
    return { ans, notAns, notVis, mark, ansMark, total: group.questions.length }
  }

  // Auto Collapse Completed
  useEffect(() => {
    if (settings.collapseCompleted && settings.groupSubject) {
       setExpandedSubjects(prev => {
          const next = { ...prev };
          let changed = false;
          displayGroups.forEach(g => {
             const sum = getSubjectSummary(g);
             if (sum.ans + sum.ansMark === sum.total && next[g.name] !== false) {
                next[g.name] = false;
                changed = true;
             }
          });
          return changed ? next : prev;
       });
    }
  }, [questionStates, displayGroups, settings.collapseCompleted, settings.groupSubject])


  // Navigation Logic
  const currSubKey = (q?.subject || 'Other').charAt(0).toUpperCase() + (q?.subject || 'Other').slice(1)
  const currentSubIdx = subjectGroups.findIndex(g => g.name === currSubKey)
  
  const handleNextSubject = () => {
    if (currentSubIdx >= 0 && currentSubIdx < subjectGroups.length - 1) {
      setCurrent(subjectGroups[currentSubIdx + 1].questions[0].absoluteIndex)
    }
  }

  const handlePrevSubject = () => {
    if (currentSubIdx > 0) {
      setCurrent(subjectGroups[currentSubIdx - 1].questions[0].absoluteIndex)
    }
  }

  const paletteContent = (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 700 }}>QUESTION PALETTE</div>
        <button className="mobile-only-close" onClick={() => setIsPaletteOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'none' }}>
          <X size={20} />
        </button>
      </div>

      {/* Legend */}
      {settings.showStatusLegend && (
        <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 12, marginBottom: 16, border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: 'var(--surface2)', border: '1px solid var(--border)' }} /> Not Visited
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: 'color-mix(in srgb, var(--red) 19%, transparent)', border: '1px solid var(--red)' }} /> Not Answered
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: 'color-mix(in srgb, var(--green) 19%, transparent)', border: '1px solid var(--green)' }} /> Answered
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: '#a855f730', border: '1px solid #a855f7' }} /> Marked
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8', gridColumn: '1 / -1' }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: '#a855f730', border: '1px solid #a855f7', position: 'relative' }}>
                <div style={{ position: 'absolute', bottom: -4, right: -4, background: 'var(--green)', borderRadius: '50%', width: 10, height: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={8} color="white" strokeWidth={4} />
                </div>
              </div> Answered & Marked for Review
            </div>
          </div>
        </div>
      )}

      <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
        {displayGroups.map(group => {
          const summary = getSubjectSummary(group)
          const isExpanded = expandedSubjects[group.name]
          const pct = Math.round(((summary.ans + summary.ansMark) / summary.total) * 100)

          return (
            <div key={group.name} style={{ marginBottom: 12 }}>
              <button onClick={() => setExpandedSubjects(p => ({...p, [group.name]: !p[group.name]}))} 
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', background: 'var(--surface2)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 8, color: '#e2e8f0', cursor: 'pointer', fontWeight: 600, fontSize: 13, alignItems: 'center' }}>
                <span>{isExpanded ? '▼' : '▶'} {group.name} {settings.showAnsweredCount && `(${summary.total})`}</span>
              </button>
              
              {isExpanded && (
                 <div style={{ padding: '10px 4px' }}>
                    {settings.showSubjectProgress && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                          <span>Answered: <strong style={{color:'var(--green)'}}>{summary.ans + summary.ansMark}</strong></span>
                          <span>|</span>
                          <span>Remaining: <strong>{summary.total - (summary.ans + summary.ansMark)}</strong></span>
                        </div>
                        <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
                        </div>
                      </div>
                    )}
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                      {group.questions.map(qq => {
                         const status = getStatus(qq)
                         const colors = getStatusColors(status)
                         const isCurrent = current === qq.absoluteIndex
                         return (
                           <button key={qq.id} onClick={() => { setCurrent(qq.absoluteIndex); setIsPaletteOpen(false) }} style={{
                              width: '100%', aspectRatio: '1', borderRadius: 6, padding: 0,
                              border: `2px solid ${isCurrent ? 'white' : colors.border}`,
                              background: colors.bg, color: colors.color,
                              fontSize: 12, fontWeight: 700, cursor: 'pointer', position: 'relative',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: isCurrent ? '0 0 0 2px var(--accent)' : 'none'
                           }}>
                             {qq.absoluteIndex + 1}
                             {status === 'answered-marked' && (
                               <div style={{ position: 'absolute', bottom: -5, right: -5, background: 'var(--green)', borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--bg)' }}>
                                 <Check size={10} color="white" strokeWidth={3} />
                               </div>
                             )}
                           </button>
                         )
                      })}
                    </div>
                 </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: '100vh', position: 'relative', flexDirection: settings.palettePosition === 'Left' ? 'row-reverse' : 'row' }}>
      


      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', paddingBottom: 60, pointerEvents: showViolationWarning ? 'none' : 'auto', filter: showViolationWarning ? 'blur(4px)' : 'none' }}>
        {/* Top Bar */}
        <div style={{
          background: 'var(--bg)', borderBottom: '1px solid var(--border)',
          padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 50
        }}>
          <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {test.name}
            {settings.defaultLanguage !== 'English' && <span style={{ fontSize: 11, background: 'var(--border)', padding: '2px 8px', borderRadius: 10, marginLeft: 10 }}>{settings.defaultLanguage}</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            
            {/* Live Violation Badge */}
            {violationCount > 0 && (
              <div style={{ 
                background: 'color-mix(in srgb, var(--red) 15%, transparent)', 
                border: '1px solid color-mix(in srgb, var(--red) 40%, transparent)', 
                color: 'var(--red)', 
                padding: '6px 12px', 
                borderRadius: 20, 
                marginRight: 16, 
                fontSize: 12, 
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <AlertTriangle size={14} />
                <span className="hide-on-mobile">Violations:</span> {violationCount}/{MAX_VIOLATIONS}
              </div>
            )}

            <button onClick={() => setShowNotes(p => !p)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', marginRight: 16 }}>
              <Edit3 size={18} color={showNotes ? 'var(--accent)' : '#94a3b8'} />
            </button>



            {settings.showRemaining && (
              <div style={{ fontSize: 13, color: 'var(--muted)', marginRight: 16, fontWeight: 600 }} className="hide-on-mobile">
                <span style={{ color: 'var(--green)' }}>{attempted}</span> / {questions.length} Ans
              </div>
            )}

            {/* Timer */}
            {settings.showTimer && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: `${timerColor}15`, border: `1px solid ${timerColor}40`,
                padding: '6px 14px', borderRadius: 30, marginRight: 12
              }}>
                <Clock size={15} color={timerColor} />
                <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 16, color: timerColor, letterSpacing: 1 }}>
                  {formatTime(timeLeft)}
                </span>
                {settings.showQuestionTimer && (
                  <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4, fontWeight: 600 }}>
                    ({formatTime(questionTimeSpent[q?.id] || 0)})
                  </span>
                )}
              </div>
            )}

            <button className="mobile-palette-toggle" onClick={() => setIsPaletteOpen(true)} style={{
              background: 'var(--surface2)', color: '#e2e8f0', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', marginRight: 12, display: 'none'
            }}>
              <Menu size={18} />
            </button>

            <button onClick={triggerSubmit} style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent2))', color: 'white',
              border: 'none', borderRadius: 10, padding: '8px 16px',
              fontWeight: 700, fontSize: 13, cursor: 'pointer'
            }}>Submit</button>
          </div>
        </div>

        {/* Question */}
        {q ? (
          <div style={{ flex: 1, padding: '24px 20px', maxWidth: 760, margin: '0 auto', width: '100%' }}>
            {/* Q Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 16, color: '#e2e8f0' }}>
                  Question {current + 1}
                </span>
                <span style={{ fontSize: 12, color: subjectColor(currSubKey), background: `${subjectColor(currSubKey)}20`, padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>
                  {currSubKey}
                </span>
              </div>
            </div>

            {/* Question Text & Diagram */}
            {(() => {
              const rawDiagSrc = q.imageUrl || q.diagramUrl || q.diagram;
              const isBroken = !!brokenImages[q.id];
              const diagSrc = isBroken ? null : rawDiagSrc;
              const hasDiagIntent = !!q.hasDiagram || /\b((?:given|shown|represented|accompanying|following)\s+(?:diagrams?|figures?|figs?\.?|graphs?|charts?|schematics?|circuits?|body\s*plans?)|(?:diagrams?|figures?|figs?\.?|graphs?|charts?)\s+(?:given|shown|represented|below|above)|in\s+the\s+(?:given\s+)?(?:diagrams?|figures?)|shown\s+in\s+(?:the\s+)?(?:given\s+)?(?:diagrams?|figures?)|structure\s+shown)\b/i.test(q.question || '');
              const isMissingImage = hasDiagIntent && !diagSrc;
              const pdfUrl = q.pdfUrl || test.pdfUrl;

              const isDiagramAbove = diagSrc && /\b(figure\s+(given\s+)?above|above\s+figure)\b/i.test(q.question || '');
              const diagramNode = diagSrc ? (
                <div style={{ marginTop: isDiagramAbove ? 0 : 20, marginBottom: isDiagramAbove ? 20 : 0, textAlign: 'center', position: 'relative', display: 'inline-block' }}>
                  <img 
                    src={diagSrc} 
                    alt="Question Diagram" 
                    onClick={() => setZoomedImage(diagSrc)}
                    onError={() => setBrokenImages(prev => ({ ...prev, [q.id]: true }))}
                    style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 8, border: '1px solid var(--border)', cursor: 'zoom-in', background: '#ffffff', padding: 6, display: 'block' }} 
                  />
                  <div style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(0,0,0,0.65)', color: 'white', padding: '4px 8px', borderRadius: 6, fontSize: 11, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ZoomIn size={14} /> Click to zoom
                  </div>
                </div>
              ) : null;

              const warningBox = isMissingImage ? (
                <div style={{
                  marginTop: 16,
                  marginBottom: 16,
                  padding: '12px 16px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertTriangle size={18} color="#f87171" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#fca5a5', fontWeight: 500 }}>
                      Diagram reference detected, but image is unavailable.
                    </span>
                  </div>
                  {pdfUrl && (
                    <button
                      type="button"
                      onClick={() => window.open(pdfUrl, '_blank')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.5)',
                        borderRadius: 8,
                        color: '#fecaca',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <FileText size={14} /> Open original PDF <ExternalLink size={12} />
                    </button>
                  )}
                </div>
              ) : null;

              return (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 24, lineHeight: 1.7, fontSize: questionFontSize }}>
                  {isDiagramAbove && diagramNode && <div style={{ textAlign: 'center' }}>{diagramNode}</div>}
                  <MathText text={q.question} />
                  {!isDiagramAbove && diagramNode && <div style={{ textAlign: 'center' }}>{diagramNode}</div>}
                  {warningBox}
                </div>
              );
            })()}

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
              {['A', 'B', 'C', 'D'].map(opt => {
                const selected = questionStates[q.id]?.selectedOption === opt
                const optionImageUrl = q.optionImageUrls?.[opt]
                return (
                  <button key={opt} onClick={() => handleAnswer(q.id, opt)} style={{
                    padding: optionImageUrl ? '12px 16px' : '16px 20px', borderRadius: 12, border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                    background: selected ? 'var(--accent)15' : 'var(--surface)',
                    color: selected ? 'var(--accent)' : '#e2e8f0',
                    textAlign: 'left', cursor: 'pointer', fontSize: questionFontSize - 1, fontWeight: selected ? 600 : 400,
                    transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 14
                  }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: selected ? 'var(--accent)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: selected ? 'white' : '#94a3b8', flexShrink: 0 }}>{opt}</span>
                    {optionImageUrl ? (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <img
                          src={optionImageUrl}
                          alt={`Option ${opt}`}
                          onClick={(e) => { e.stopPropagation(); setZoomedImage(optionImageUrl); }}
                          style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 6, objectFit: 'contain', cursor: 'zoom-in', border: '1px solid var(--border)' }}
                        />
                      </div>
                    ) : (
                      <span style={{ flex: 1, marginTop: 3 }}>
                        <MathText text={formatOptionText(q.options?.[opt], opt, !!(q.imageUrl || q.diagramUrl))} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Navigation (Prev/Next Question & Review) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: '240px' }}>
                <button onClick={() => setCurrent(p => Math.max(0, p - 1))} disabled={current === 0}
                  style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: current === 0 ? '#334155' : '#e2e8f0', cursor: current === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 600 }}>
                  <ChevronLeft size={18} /> Prev
                </button>
                <button onClick={() => setCurrent(p => Math.min(questions.length - 1, p + 1))} disabled={current === questions.length - 1}
                  style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: current === questions.length - 1 ? '#334155' : '#e2e8f0', cursor: current === questions.length - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 600 }}>
                  Next <ChevronRight size={18} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: '240px' }}>
                {questionStates[q.id]?.markedForReview ? (
                  <button onClick={() => handleMarkReview(q.id)}
                    style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid #a855f7', background: 'transparent', color: '#a855f7', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 600 }}>
                    Unmark Review
                  </button>
                ) : (
                  <button onClick={() => handleMarkReview(q.id)}
                    style={{ flex: 1, padding: '14px', borderRadius: 12, border: 'none', background: '#a855f720', color: '#d8b4fe', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 600 }}>
                    <Bookmark size={18} /> Mark for Review & Next
                  </button>
                )}
              </div>
            </div>

            {/* Subject Navigation */}
            {settings.groupSubject && (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: 24 }}>
                 <button onClick={handlePrevSubject} disabled={currentSubIdx <= 0}
                  style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: currentSubIdx <= 0 ? '#334155' : '#94a3b8', cursor: currentSubIdx <= 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                  <ChevronsLeft size={16} /> Prev Subject
                </button>
                <button onClick={handleNextSubject} disabled={currentSubIdx >= subjectGroups.length - 1}
                  style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: currentSubIdx >= subjectGroups.length - 1 ? '#334155' : '#94a3b8', cursor: currentSubIdx >= subjectGroups.length - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                  Next Subject <ChevronsRight size={16} />
                </button>
              </div>
            )}
            
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No questions available.</div>
        )}
      </div>

      {/* Question Palette - Desktop Sidebar */}
      <div className="palette-desktop" style={{ width: 280, background: 'var(--bg)', borderLeft: settings.palettePosition === 'Left' ? 'none' : '1px solid var(--border)', borderRight: settings.palettePosition === 'Left' ? '1px solid var(--border)' : 'none', position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>
        {paletteContent}
      </div>

      {/* Question Palette - Mobile Bottom Sheet / Overlay */}
      {isPaletteOpen && (
        <div className="palette-mobile-overlay" style={{ position: 'fixed', inset: 0, background: '#000000a0', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '85%', maxWidth: 360, background: 'var(--bg)', height: '100vh', overflow: 'hidden', boxShadow: '-5px 0 25px rgba(0,0,0,0.5)' }}>
             {paletteContent}
          </div>
        </div>
      )}

      {/* Submit Confirm Modal */}
      {showSubmit && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000090', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 32, maxWidth: 380, width: '90%', textAlign: 'center' }}>
            <AlertTriangle size={40} color="var(--yellow)" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 20, marginBottom: 8 }}>Submit Test?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8 }}>
              You have answered <strong style={{ color: 'var(--green)' }}>{attempted}</strong> out of <strong style={{ color: 'var(--text)' }}>{questions.length}</strong> questions.
            </p>
            {reviewCount > 0 && (
              <p style={{ color: '#a855f7', fontSize: 14, marginBottom: 8, fontWeight: 600, background: '#a855f715', padding: '8px', borderRadius: 8 }}>
                You have {reviewCount} questions marked for review.
              </p>
            )}
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
              Time remaining: <strong style={{ color: timerColor }}>{formatTime(timeLeft)}</strong>
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowSubmit(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontWeight: 600 }}>Return to Test</button>
              <button onClick={() => { setShowSubmit(false); setShowNotesPrompt(true); }} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--accent), var(--accent2))', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                {reviewCount > 0 ? 'Proceed to Submit' : 'Proceed to Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Pad Prompt Modal */}
      {showNotesPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000090', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 32, maxWidth: 380, width: '90%', textAlign: 'center' }}>
            <Edit3 size={40} color="var(--accent)" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 20, marginBottom: 8 }}>Save your notes?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
              Do you want to save your rough work and notes for future reference?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => { handleSubmit(); }} style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--green), #10b981)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                Save Notes & Submit
              </button>
              <button onClick={() => { localStorage.removeItem(`notes_${test?.id}`); handleSubmit(); }} style={{ padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--red)', fontWeight: 600, cursor: 'pointer' }}>
                Discard Notes & Submit
              </button>
              <button onClick={() => { setShowNotesPrompt(false); setShowSubmit(true); }} style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Pad UI */}
      <NotesPad testId={test?.id} isVisible={showNotes} onClose={() => setShowNotes(false)} />

      {/* Zoomed Image Modal */}
      {zoomedImage && (
        <div 
          onClick={() => setZoomedImage(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, cursor: 'zoom-out', padding: 20 }}
        >
          <img src={zoomedImage} alt="Zoomed Diagram" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }} />
          <button style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '50%', padding: 10, cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>
      )}

      {/* Anti-Cheating Violation Modal */}
      {showViolationWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--surface)', border: '2px solid var(--red)', borderRadius: 24, padding: 40, maxWidth: 420, width: '90%', textAlign: 'center', boxShadow: '0 0 50px rgba(239, 68, 68, 0.4)' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'color-mix(in srgb, var(--red) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
               <AlertTriangle size={36} color="var(--red)" />
            </div>
            
            <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 26, fontWeight: 700, color: 'var(--red)', marginBottom: 12 }}>
              ⚠ Warning!
            </h2>
            
            <p style={{ color: '#e2e8f0', fontSize: 16, lineHeight: 1.6, marginBottom: 16, fontWeight: 600 }}>
              {violationReason}
            </p>

            <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              This activity has been recorded as a violation.
            </p>

            <div style={{ background: 'color-mix(in srgb, var(--red) 10%, var(--surface))', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 12, padding: '16px', marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Violation Count</div>
              <strong style={{ fontSize: 24, color: 'var(--red)', fontFamily: 'Space Grotesk' }}>{violationCount} / {MAX_VIOLATIONS}</strong>
            </div>

            <p style={{ color: '#e2e8f0', fontSize: 14, marginBottom: 32 }}>
              Please return to Fullscreen to continue your examination.
            </p>
            
            <button 
              onClick={requestFullscreenAgain} 
              style={{ width: '100%', padding: '16px', borderRadius: 12, border: 'none', background: 'var(--red)', color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 20px rgba(239, 68, 68, 0.3)' }}
            >
              Return to Examination
            </button>
          </div>
        </div>
      )}

      {/* Max Violations Reached Auto-Submit Modal */}
      {violationCount >= MAX_VIOLATIONS && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.98)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: 'var(--surface)', border: '2px solid var(--red)', borderRadius: 24, padding: 40, maxWidth: 440, width: '90%', textAlign: 'center', boxShadow: '0 0 60px rgba(239, 68, 68, 0.6)' }}>
            <AlertTriangle size={48} color="var(--red)" style={{ margin: '0 auto 24px' }} />
            
            <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 26, fontWeight: 700, color: 'var(--red)', marginBottom: 16 }}>
              Test Automatically Submitted
            </h2>
            
            <p style={{ color: '#e2e8f0', fontSize: 16, lineHeight: 1.6, marginBottom: 24, fontWeight: 500 }}>
              You have exceeded the maximum of ${MAX_VIOLATIONS} allowed proctoring violations.
            </p>

            <div style={{ background: 'color-mix(in srgb, var(--red) 10%, var(--surface))', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 12, padding: '16px', marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Maximum Violations Reached</div>
              <strong style={{ fontSize: 24, color: 'var(--red)', fontFamily: 'Space Grotesk' }}>{MAX_VIOLATIONS} / {MAX_VIOLATIONS}</strong>
            </div>

            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 32 }}>
              Your examination has been submitted automatically. This action cannot be reversed. Redirecting to analysis in a few seconds...
            </p>
            
            <button 
              onClick={() => setPage('analysis')} 
              style={{ width: '100%', padding: '16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--accent), var(--accent2))', color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
            >
              View Analysis
            </button>
          </div>
        </div>
      )}


      {/* Floating Camera Proctoring PiP Feed */}
      {isCameraMode && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 154,
          background: 'var(--surface, #111827)',
          border: '1px solid var(--border, #1f2d45)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
          zIndex: 90
        }}>
          <div style={{ position: 'relative', width: 154, height: 115, background: '#0b0f19' }}>
            <video
              ref={videoRef}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              autoPlay
              playsInline
              muted
            />
            <div style={{
              position: 'absolute',
              top: 6,
              left: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '2px 8px',
              borderRadius: 99,
              background: 'rgba(0,0,0,0.75)',
              fontSize: 10,
              fontWeight: 700,
              color: cameraWarningText ? '#fbbf24' : (cameraActive ? '#34d399' : '#94a3b8')
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: cameraWarningText ? '#fbbf24' : (cameraActive ? '#34d399' : '#64748b'),
                boxShadow: cameraActive ? (cameraWarningText ? '0 0 6px #fbbf24' : '0 0 6px #34d399') : 'none'
              }} />
              {cameraWarningText ? 'Alert' : (cameraActive ? 'Proctored' : 'Initializing')}
            </div>
          </div>
          {cameraWarningText && (
            <div style={{
              padding: '4px 6px',
              fontSize: 10,
              color: '#fbbf24',
              background: 'rgba(251, 191, 36, 0.15)',
              textAlign: 'center',
              fontWeight: 600,
              borderTop: '1px solid rgba(251, 191, 36, 0.2)'
            }}>
              ⚠️ {cameraWarningText}
            </div>
          )}
        </div>
      )}

      <style>{`
        .palette-desktop { display: block; }
        .mobile-palette-toggle { display: none !important; }
        .palette-mobile-overlay { display: none !important; }
        
        @media (max-width: 900px) { 
          .palette-desktop { display: none !important; } 
          .mobile-palette-toggle { display: flex !important; align-items: center; justify-content: center; }
          .palette-mobile-overlay { display: flex !important; }
          .mobile-only-close { display: block !important; }
          .hide-on-mobile { display: none !important; }
        }
      `}</style>
    </div>
  )
}
