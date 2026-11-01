import { v4 as uuidv4 } from 'uuid';
import { queues } from '../queue/index.js';
import { logger } from '../utils/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import fs from 'fs';
import path from 'path';

export const uploadPdf = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const userId = req.user.id;
        const token = req.token;
        const { testName, duration } = req.body;
        const rawLanguage = req.body.language;
        const language = ['English', 'Hindi', 'Bilingual'].includes(rawLanguage) ? rawLanguage : 'English';
        const uploadId = uuidv4();
        const jobId = uuidv4();

        // Ensure uploads directory exists
        const uploadDir = path.resolve('uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const finalPath = path.join(uploadDir, `${uploadId}.pdf`);
        fs.renameSync(req.file.path, finalPath);

        logger.info(`Received PDF upload from user ${userId} (language: ${language}). Uploading to Supabase Storage...`);

        // Upload to Supabase Storage
        const fileBuffer = fs.readFileSync(finalPath);
        const { error: storageError } = await supabaseAdmin.storage
            .from('uploads')
            .upload(`${userId}/${uploadId}.pdf`, fileBuffer, {
                contentType: 'application/pdf',
                upsert: false
            });

        if (storageError) {
            logger.error(`Failed to upload to Supabase Storage: ${storageError.message}`);
            // This MUST succeed: Render's local disk is ephemeral, so if the
            // background worker container restarts mid-job, Supabase Storage
            // is the only place the PDF can be recovered from. Failing here
            // is safer than silently continuing and hitting an unrecoverable
            // ENOENT later, deep inside the extraction pipeline.
            try { fs.unlinkSync(finalPath); } catch (_) {}
            return res.status(502).json({
                error: 'Failed to store the PDF durably (Supabase Storage upload failed). Please try again.'
            });
        }
        
        // Satisfy the foreign key constraint by creating an upload record
        const { error: dbError } = await supabaseAdmin.from('uploads').insert({
            id: uploadId,
            user_id: userId,
            original_name: req.file.originalname || 'upload.pdf',
            file_path: `${userId}/${uploadId}.pdf`
        });
        
        if (dbError) {
            logger.warn(`Failed to insert into uploads table: ${dbError.message}`);
        }

        // Add to the first queue in the pipeline
        await queues.pdfUpload.add('process-pdf', {
            uploadId,
            jobId,
            userId,
            filePath: finalPath,
            storagePath: `${userId}/${uploadId}.pdf`,
            token,
            testName,
            duration,
            language
        }, { 
            jobId,
            attempts: 2,
            backoff: { type: 'fixed', delay: 5000 }
        }); // Use custom jobId for tracking

        res.status(202).json({ success: true, jobId });
    } catch (error) {
        next(error);
    }
};
