import express, { Router, Response } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { transcribeAudio, estimateAudioMinutes } from '../services/transcription';
import { generateSummary } from '../services/llm';
import { hasAvailableMinutes, deductMinutes, saveRecording, updateRecordingSummary, getRecordings, getUserRecordings, getRecording, deleteRecording, uploadAudioFile } from '../services/supabase';
import { combineAudioSegments } from '../services/audioProcessor';

const router: Router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max for long meetings
});

/**
 * POST /api/audio/upload
 * Upload and transcribe audio (requires authentication)
 */
router.post('/upload', authenticate, upload.single('audio'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const userId = req.userId!;
    const audioBuffer = req.file.buffer;
    const filename = req.file.originalname;

    console.log(`Transcribing audio for user ${userId}: ${filename}, size: ${audioBuffer.length} bytes`);
    
    // Estimate duration and check if user has available minutes
    const estimatedMinutes = estimateAudioMinutes(audioBuffer.length);
    console.log(`Estimated duration: ${estimatedMinutes} minutes`);
    
    const hasMinutes = await hasAvailableMinutes(userId, estimatedMinutes);
    if (!hasMinutes) {
      return res.status(403).json({ 
        error: 'Insufficient minutes',
        message: 'You have reached your monthly limit. Please upgrade your plan to continue.'
      });
    }
    
    // Transcribe
    const transcription = await transcribeAudio(audioBuffer, filename);

    // Upload audio file to Supabase Storage
    const audioUrl = await uploadAudioFile(audioBuffer, filename, userId);
    console.log(`Audio uploaded to: ${audioUrl}`);

    // Save to database with user_id and audio URL
    const recording = await saveRecording(filename, transcription, audioBuffer.length, userId, audioUrl);

    // Deduct minutes from user's account
    await deductMinutes(userId, estimatedMinutes, 'transcription');
    console.log(`Deducted ${estimatedMinutes} minutes from user ${userId}`);

    res.json({
      transcription,
      filename,
      size: audioBuffer.length,
      recordingId: recording.id,
      audioUrl: audioUrl,
      minutesUsed: estimatedMinutes,
    });
  } catch (error: any) {
    console.error('Upload/transcription error:', error);
    res.status(500).json({ error: error.message || 'Transcription failed' });
  }
});

/**
 * POST /api/audio/upload-segments
 * Upload and transcribe multiple audio segments (requires authentication)
 */
router.post('/upload-segments', authenticate, upload.array('segments', 50), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: 'No audio segments provided' });
    }

    const userId = req.userId!;
    const segments = req.files.map(file => file.buffer);
    const filename = req.files[0].originalname;

    console.log(`Combining ${segments.length} audio segments for user ${userId}`);
    
    // Combine all segments into one audio file
    const combinedAudioBuffer = await combineAudioSegments(segments);
    console.log(`Combined audio size: ${combinedAudioBuffer.length} bytes`);

    // Estimate duration and check if user has available minutes
    const estimatedMinutes = estimateAudioMinutes(combinedAudioBuffer.length);
    console.log(`Estimated duration: ${estimatedMinutes} minutes`);
    
    const hasMinutes = await hasAvailableMinutes(userId, estimatedMinutes);
    if (!hasMinutes) {
      return res.status(403).json({ 
        error: 'Insufficient minutes',
        message: 'You have reached your monthly limit. Please upgrade your plan to continue.'
      });
    }
    
    // Transcribe the combined audio
    const transcription = await transcribeAudio(combinedAudioBuffer, filename);

    // Upload combined audio file to Supabase Storage
    const audioUrl = await uploadAudioFile(combinedAudioBuffer, filename, userId);
    console.log(`Combined audio uploaded to: ${audioUrl}`);

    // Save to database with user_id and audio URL
    const recording = await saveRecording(filename, transcription, combinedAudioBuffer.length, userId, audioUrl);

    // Deduct minutes from user's account
    await deductMinutes(userId, estimatedMinutes, 'transcription');
    console.log(`Deducted ${estimatedMinutes} minutes from user ${userId}`);

    res.json({
      transcription,
      filename,
      size: combinedAudioBuffer.length,
      recordingId: recording.id,
      audioUrl: audioUrl,
      minutesUsed: estimatedMinutes,
      segmentCount: segments.length,
    });
  } catch (error: any) {
    console.error('Multi-segment upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to process audio segments' });
  }
});

/**
 * POST /api/audio/summary
 * Generate summary (requires authentication)
 */
router.post('/summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { transcript, recordingId } = req.body;

    if (!transcript) {
      console.error('No transcript in request body:', req.body);
      return res.status(400).json({ error: 'No transcript provided' });
    }

    console.log(`Generating summary for transcript (${transcript.length} chars)`);
    console.log('First 100 chars:', transcript.substring(0, 100));
    
    // Generate summary
    const summary = await generateSummary(transcript);

    console.log('Summary generated successfully:', {
      summary: summary.summary?.substring(0, 50),
      keyPoints: summary.keyPoints?.length,
      actionItems: summary.actionItems?.length,
    });

    // Update recording if ID provided
    if (recordingId) {
      await updateRecordingSummary(
        recordingId,
        summary.summary,
        summary.actionItems.map(item => item.task),
        summary.keyPoints
      );
    }

    res.json(summary);
  } catch (error: any) {
    console.error('Summary error details:', {
      message: error.message,
      response: error.response?.data,
      stack: error.stack,
    });
    res.status(500).json({ error: error.message || 'Summary generation failed' });
  }
});

/**
 * GET /api/audio/recordings
 * Get recordings for the authenticated user
 */
router.get('/recordings', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const recordings = await getUserRecordings(req.userId!, 50);
    res.json({ recordings });
  } catch (error: any) {
    console.error('Error fetching recordings:', error);
    res.status(500).json({ error: 'Failed to fetch recordings' });
  }
});

/**
 * GET /api/audio/recordings/:id
 * Get a single recording by ID (user must own it)
 */
router.get('/recordings/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const recording = await getRecording(req.params.id);
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    // Verify the recording belongs to the authenticated user
    if (recording.user_id !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(recording);
  } catch (error: any) {
    console.error('Error fetching recording:', error);
    res.status(500).json({ error: 'Failed to fetch recording' });
  }
});

/**
 * DELETE /api/audio/recordings/:id
 * Delete a recording by ID (user must own it)
 */
router.delete('/recordings/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // First verify the recording exists and belongs to the user
    const recording = await getRecording(req.params.id);
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    if (recording.user_id !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await deleteRecording(req.params.id);
    res.json({ success: true, message: 'Recording deleted' });
  } catch (error: any) {
    console.error('Error deleting recording:', error);
    res.status(500).json({ error: 'Failed to delete recording' });
  }
});

/**
 * POST /api/audio/transcribe
 * Transcribe audio file
 */
router.post('/transcribe', authenticate, upload.single('audio'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const userId = req.userId!;
    const audioBuffer = req.file.buffer;
    const filename = req.file.originalname;

    // Estimate minutes
    const estimatedMinutes = estimateAudioMinutes(audioBuffer.length);

    // Check if user has enough minutes
    const hasMinutes = await hasAvailableMinutes(userId, estimatedMinutes);
    if (!hasMinutes) {
      return res.status(403).json({ 
        error: 'Insufficient minutes',
        message: 'Please upgrade your plan to transcribe more audio',
      });
    }

    // Transcribe
    console.log(`Transcribing audio for user ${userId}: ${filename}`);
    const transcript = await transcribeAudio(audioBuffer, filename);

    // Deduct minutes
    await deductMinutes(userId, estimatedMinutes, 'transcription');

    res.json({
      transcript,
      minutesUsed: estimatedMinutes,
    });
  } catch (error: any) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: error.message || 'Transcription failed' });
  }
});

/**
 * POST /api/audio/summarize
 * Generate summary from transcript
 */
router.post('/summarize', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    const userId = req.userId!;

    // Estimate minutes (1 minute per summary)
    const minutesNeeded = 1;

    // Check if user has enough minutes
    const hasMinutes = await hasAvailableMinutes(userId, minutesNeeded);
    if (!hasMinutes) {
      return res.status(403).json({ 
        error: 'Insufficient minutes',
        message: 'Please upgrade your plan to generate more summaries',
      });
    }

    // Generate summary
    console.log(`Generating summary for user ${userId}`);
    const summary = await generateSummary(transcript);

    // Deduct minutes
    await deductMinutes(userId, minutesNeeded, 'summary');

    res.json({
      ...summary,
      minutesUsed: minutesNeeded,
    });
  } catch (error: any) {
    console.error('Summary error:', error);
    res.status(500).json({ error: error.message || 'Summary generation failed' });
  }
});

/**
 * POST /api/audio/process
 * Complete workflow: transcribe + summarize
 */
router.post('/process', authenticate, upload.single('audio'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const userId = req.userId!;
    const audioBuffer = req.file.buffer;
    const filename = req.file.originalname;

    // Estimate minutes (transcription + summary)
    const estimatedMinutes = estimateAudioMinutes(audioBuffer.length) + 1;

    // Check if user has enough minutes
    const hasMinutes = await hasAvailableMinutes(userId, estimatedMinutes);
    if (!hasMinutes) {
      return res.status(403).json({ 
        error: 'Insufficient minutes',
        message: 'Please upgrade your plan',
      });
    }

    // Transcribe
    console.log(`Processing audio for user ${userId}: ${filename}`);
    const transcript = await transcribeAudio(audioBuffer, filename);

    // Summarize
    const summary = await generateSummary(transcript);

    // Deduct minutes
    await deductMinutes(userId, estimatedMinutes, 'transcription');

    res.json({
      transcript,
      summary,
      minutesUsed: estimatedMinutes,
    });
  } catch (error: any) {
    console.error('Processing error:', error);
    res.status(500).json({ error: error.message || 'Processing failed' });
  }
});

export default router;
