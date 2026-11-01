import { Worker } from 'bullmq';
import { getRedisConnection, queues, getBullOptions } from '../queue/index.js';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { splitPdfIntoChunk, getTotalPages } from '../services/pdf.service.js';
import { ensureLocalFile } from '../services/storageSync.js';

export const createPdfWorker = (io) => {
    return new Worker('pdf-upload', async job => {
        const { uploadId, userId, filePath, storagePath, token, testName, duration, language = 'English' } = job.data;
        const supabase = supabaseAdmin;
        
        io.to(userId).emit('job-started', { jobId: job.id });
        
        try {
            // Render's disk is ephemeral — recover the file from Supabase
            // Storage if a container restart wiped it before this ran.
            await ensureLocalFile(filePath, storagePath);

            // 1. Create Job Record in DB
            const { data: jobRecord, error: jobErr } = await supabase.from('jobs').insert({
                id: job.id,
                user_id: userId,
                upload_id: uploadId,
                status: 'processing',
                progress: 5
            }).select().single();
            if (jobErr) throw jobErr;

            io.to(userId).emit('upload-progress', { jobId: job.id, progress: 10 });
            
            const totalPages = await getTotalPages(filePath);
            
            const maxPages = parseInt(process.env.MAX_PAGES_PER_UPLOAD || '60');
            if (totalPages > maxPages) {
                throw new Error(`Upload exceeds maximum allowed pages (${maxPages}). Your PDF has ${totalPages} pages.`);
            }
            
            // Check Daily Budget
            const redis = getRedisConnection();
            const today = new Date().toISOString().split('T')[0];
            const spent = await redis.get(`daily_spend_inr:${today}`);
            const budget = parseFloat(process.env.DAILY_BUDGET_INR || '500');
            if (spent && parseFloat(spent) >= budget) {
                throw new Error(`AI Extraction is temporarily paused (daily budget reached). Please try again tomorrow.`);
            }
            
            await supabase.from('jobs').update({ total_pages: totalPages, status: 'processing', progress: 10 }).eq('id', job.id);
            
            io.to(userId).emit('job-progress', { 
                jobId: job.id, 
                progress: 10, 
                pagesCompleted: 0, 
                totalPages,
                questionsExtracted: 0 
            });
            
            const fileHash = job.data.fileHash;

            // 1. Check for whole-file dedupe
            if (fileHash) {
                const { data: completedJobs, error: checkErr } = await supabase
                    .from('jobs')
                    .select('id, test_id, extracted_questions')
                    .eq('status', 'completed')
                    .not('extracted_questions', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(10);
                
                if (!checkErr && completedJobs && completedJobs.length > 0) {
                    // Find a job that matches the hash
                    const { data: uploads } = await supabase.from('uploads').select('id').eq('file_hash', fileHash);
                    const uploadIds = (uploads || []).map(u => u.id);
                    
                    const dedupeJob = completedJobs.find(cj => {
                        // In a real scenario we'd join jobs with uploads where file_hash = fileHash.
                        // We will do a separate query to be safe.
                        return true; // We'll query properly below
                    });
                }
                
                // Actual robust query for dedupe:
                const { data: dedupeCandidates, error: dedupeErr } = await supabase
                    .rpc('find_completed_job_by_hash', { p_hash: fileHash, p_version: 'v3' });
                
                // Since we don't have RPC, let's do two queries:
                const { data: matchingUploads } = await supabase.from('uploads').select('id').eq('file_hash', fileHash);
                if (matchingUploads && matchingUploads.length > 0) {
                    const matchUploadIds = matchingUploads.map(u => u.id);
                    const { data: matchingJobs } = await supabase.from('jobs')
                        .select('id, test_id, extracted_questions, total_pages, metadata')
                        .in('upload_id', matchUploadIds)
                        .eq('status', 'completed')
                        .limit(1);
                    
                    if (matchingJobs && matchingJobs.length > 0) {
                        const matchingJob = matchingJobs[0];
                        if (matchingJob.metadata?.promptVersion === 'v4' && !matchingJob.metadata?.needsReview && !job.data.forceReextract) {
                            logger.info(`[DEDUPE] Found completed job ${matchingJob.id} for hash ${fileHash}. Bypassing AI.`);
                            
                            // Send directly to saveWorker or clone here?
                            // Dedupe requires we create a new `tests` row and duplicate `questions`.
                            // It's safer to queue it to saveWorker with the questions array from the old job!
                            // Wait, the `questions` array is NOT stored in `jobs.extracted_questions` (it's just a count).
                            // It's stored in `tests` and `questions` tables.
                            // Let's pass this to a special job, or handle it in `saveWorker`.
                            // Let's just bypass AI and image workers, and send to `saveWorker` with the `sourceTestId`!
                            await queues.saveData.add('save-data', {
                                jobId: job.id,
                                userId,
                                testName,
                                duration,
                                dedupeSourceTestId: matchingJob.test_id
                            });
                            
                            return; // Stop pdfWorker here!
                        }
                    }
                }
            }

            // Queue up AI extraction job
            await queues.aiExtraction.add('extract-pdf', {
                jobId: job.id,
                userId,
                filePath,
                storagePath,
                totalPages,
                token,
                testName,
                duration,
                fileHash,
                language
            }, {
                attempts: 2,
                backoff: { type: 'fixed', delay: 5000 }
            });

        } catch (error) {
            logger.error(`PDF Worker failed: ${error.message}`);
            io.to(userId).emit('job-failed', { jobId: job.id, error: error.message });
            await supabase.from('jobs').update({ status: 'failed', error_message: error.message }).eq('id', job.id);
            throw error;
        }
    }, { 
        ...getBullOptions(),
        concurrency: 1,
        lockDuration: 120000,
        stalledInterval: 60000,
        maxStalledCount: 1
    });
};
