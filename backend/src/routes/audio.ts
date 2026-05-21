import express, { Router, Response } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { transcribeAudio } from '../services/chunkedTranscription';
import {
  generateSummary,
  generateCrossMeetingAnswer,
  generateFollowUpDraft,
  generateMeetingPrepBrief,
  translateMeetingBreakdown,
  translateTranscriptText,
} from '../services/llm';
import { hasAvailableMinutes, deductMinutes, saveRecording, updateRecordingSummary, getUserRecordings, getRecording, deleteRecording, uploadAudioFile, getSignedAudioUrl, saveRecordingTranslation } from '../services/supabase';
import { combineAudioSegments } from '../services/audioProcessor';
import { logger, serializeError } from '../services/logger';

const router: Router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max for long meetings
});
const ASK_MINUTES_COST = 1;
const FOLLOWUP_DRAFT_MINUTES_COST = 1;
const PREP_BRIEF_MINUTES_COST = 1;

type RecordingMetadataInput = {
  meetingName?: string;
  meetingLocation?: string;
  meetingContext?: string;
  meetingAt?: string;
  meetingParticipants?: string[];
};

function normalizeMetadataValue(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, maxLength);
}

function parseMeetingAt(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function parseMeetingParticipants(value: unknown): string[] | undefined {
  let candidates: string[] = [];

  if (Array.isArray(value)) {
    candidates = value.map((entry) => String(entry));
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          candidates = parsed.map((entry) => String(entry));
        } else {
          candidates = [trimmed];
        }
      } catch {
        candidates = trimmed.split(',');
      }
    } else {
      candidates = trimmed.split(',');
    }
  } else if (value != null) {
    candidates = [String(value)];
  }

  const normalized = Array.from(
    new Set(
      candidates
        .map((entry) => normalizeMetadataValue(entry, 60))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  ).slice(0, 20);

  return normalized.length > 0 ? normalized : undefined;
}

function getMeetingParticipantsForResponse(recording: any, metadata: RecordingMetadataInput): string[] {
  if (Array.isArray(recording?.meeting_participants)) {
    return recording.meeting_participants.filter(
      (entry: unknown): entry is string => typeof entry === 'string' && entry.trim().length > 0,
    );
  }
  return metadata.meetingParticipants || [];
}

function parseRecordingMetadata(body: Record<string, unknown>): RecordingMetadataInput {
  return {
    meetingName: normalizeMetadataValue(body.meetingName, 120),
    meetingLocation: normalizeMetadataValue(body.meetingLocation, 160),
    meetingContext: normalizeMetadataValue(body.meetingContext, 2000),
    meetingAt: parseMeetingAt(body.meetingAt),
    meetingParticipants: parseMeetingParticipants(body.meetingParticipants),
  };
}

function normalizeQuestion(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 1000);
}

function normalizeTargetLanguage(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 60);
}

function normalizeRecordingId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 120);
}

function normalizeFollowUpTone(value: unknown): 'formal' | 'friendly' | 'neutral' {
  if (typeof value !== 'string') {
    return 'neutral';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'formal' || normalized === 'friendly' || normalized === 'neutral') {
    return normalized;
  }
  return 'neutral';
}

function normalizePrepTone(value: unknown): 'balanced' | 'challenger' | 'supportive' {
  if (typeof value !== 'string') {
    return 'balanced';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'balanced' || normalized === 'challenger' || normalized === 'supportive') {
    return normalized;
  }
  return 'balanced';
}

function normalizeFollowUpMeetingType(value: unknown): string | undefined {
  const normalized = normalizeMetadataValue(value, 60);
  if (!normalized) {
    return undefined;
  }
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9 _-]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

function normalizeFollowUpTemplateStyle(value: unknown): string | undefined {
  const normalized = normalizeMetadataValue(value, 60);
  if (!normalized) {
    return undefined;
  }
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9 _-]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

function parseSummaryPayload(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  return null;
}

function parseTranscriptPayload(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 100000);
}

function safeMeetingTitle(recording: any): string {
  const fromMetadata = typeof recording?.meeting_name === 'string' ? recording.meeting_name.trim() : '';
  const fromFilename = typeof recording?.filename === 'string' ? recording.filename.trim() : '';
  return fromMetadata || fromFilename || 'Untitled meeting';
}

function truncateTranscriptForAsk(transcript: string): string {
  const normalized = transcript.trim();
  if (normalized.length <= 5000) {
    return normalized;
  }
  return `${normalized.slice(0, 5000)}\n...[truncated]`;
}

function buildCitationSnippet(transcript: string, question: string): string {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript) {
    return '';
  }
  const lowerTranscript = cleanTranscript.toLowerCase();
  const questionTerms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 4)
    .slice(0, 8);

  for (const term of questionTerms) {
    const idx = lowerTranscript.indexOf(term);
    if (idx >= 0) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(cleanTranscript.length, idx + 200);
      const prefix = start > 0 ? '... ' : '';
      const suffix = end < cleanTranscript.length ? ' ...' : '';
      return `${prefix}${cleanTranscript.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
    }
  }

  return cleanTranscript.slice(0, 220).replace(/\s+/g, ' ').trim();
}

/**
 * POST /api/audio/upload
 * Upload and transcribe audio (requires authentication)
 */
router.post('/upload', authenticate, upload.single('audio'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      logger.warn('audio_upload_validation_failed', {
        requestId: req.requestId,
        reason: 'missing_audio_file',
      });
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const userId = req.userId!;
    const audioBuffer = req.file.buffer;
    const filename = req.file.originalname;
    const recordingMetadata = parseRecordingMetadata(req.body || {});

    logger.info('audio_upload_started', {
      requestId: req.requestId,
      userId,
      filename,
      sizeBytes: audioBuffer.length,
      hasMeetingMetadata: Boolean(
        recordingMetadata.meetingName
          || recordingMetadata.meetingLocation
          || recordingMetadata.meetingContext
          || recordingMetadata.meetingAt
          || (recordingMetadata.meetingParticipants && recordingMetadata.meetingParticipants.length > 0),
      ),
    });
    
    // Check if user has ANY available minutes
    const hasMinutes = await hasAvailableMinutes(userId, 1);
    if (!hasMinutes) {
      logger.warn('audio_upload_insufficient_minutes', {
        requestId: req.requestId,
        userId,
      });
      return res.status(403).json({ 
        error: 'Insufficient minutes',
        message: 'You have reached your monthly limit. Please upgrade your plan to continue.'
      });
    }
    
    // Transcribe and get actual duration
    const { text: transcription, durationSeconds } = await transcribeAudio(audioBuffer, filename);
    const actualMinutes = Math.ceil(durationSeconds / 60);
    logger.info('audio_upload_transcription_completed', {
      requestId: req.requestId,
      userId,
      durationSeconds,
      actualMinutes,
    });
    
    // Important: Use transcription duration for billing (this is the actual audio duration from ffprobe)
    // Not the sum of chunk durations from Whisper responses

    // Upload audio file to Supabase Storage
    const audioPath = await uploadAudioFile(audioBuffer, filename, userId);
    const audioUrl = await getSignedAudioUrl(audioPath);
    logger.info('audio_upload_storage_uploaded', {
      requestId: req.requestId,
      userId,
      audioPath,
    });

    // Save to database with user_id and audio URL
    const recording = await saveRecording(
      filename,
      transcription,
      audioBuffer.length,
      userId,
      audioPath,
      recordingMetadata,
    );

    // Deduct actual minutes from user's account
    await deductMinutes(userId, actualMinutes, 'transcription');
    logger.info('audio_upload_minutes_deducted', {
      requestId: req.requestId,
      userId,
      minutesUsed: actualMinutes,
    });

    res.json({
      transcription,
      filename,
      size: audioBuffer.length,
      recordingId: recording.id,
      audioUrl,
      minutesUsed: actualMinutes,
      meetingName: recording.meeting_name || recordingMetadata.meetingName || null,
      meetingLocation: recording.meeting_location || recordingMetadata.meetingLocation || null,
      meetingContext: recording.meeting_context || recordingMetadata.meetingContext || null,
      meetingAt: recording.meeting_at || recordingMetadata.meetingAt || null,
      meetingParticipants: getMeetingParticipantsForResponse(recording, recordingMetadata),
    });
  } catch (error: any) {
    logger.error('audio_upload_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
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
      logger.warn('audio_upload_segments_validation_failed', {
        requestId: req.requestId,
        reason: 'no_audio_segments',
      });
      return res.status(400).json({ error: 'No audio segments provided' });
    }

    const userId = req.userId!;
    const segments = req.files.map(file => file.buffer);
    const filename = req.files[0].originalname;
    const recordingMetadata = parseRecordingMetadata(req.body || {});

    logger.info('audio_upload_segments_started', {
      requestId: req.requestId,
      userId,
      segmentCount: segments.length,
      filename,
      hasMeetingMetadata: Boolean(
        recordingMetadata.meetingName
          || recordingMetadata.meetingLocation
          || recordingMetadata.meetingContext
          || recordingMetadata.meetingAt
          || (recordingMetadata.meetingParticipants && recordingMetadata.meetingParticipants.length > 0),
      ),
    });
    
    // Combine all segments into one audio file
    const combinedAudioBuffer = await combineAudioSegments(segments);
    logger.info('audio_upload_segments_combined', {
      requestId: req.requestId,
      userId,
      combinedSizeBytes: combinedAudioBuffer.length,
    });

    // Check if user has ANY available minutes
    const hasMinutes = await hasAvailableMinutes(userId, 1);
    if (!hasMinutes) {
      logger.warn('audio_upload_segments_insufficient_minutes', {
        requestId: req.requestId,
        userId,
      });
      return res.status(403).json({ 
        error: 'Insufficient minutes',
        message: 'You have reached your monthly limit. Please upgrade your plan to continue.'
      });
    }
    
    // Transcribe the combined audio and get actual duration
    const { text: transcription, durationSeconds } = await transcribeAudio(combinedAudioBuffer, filename);
    const actualMinutes = Math.ceil(durationSeconds / 60);
    logger.info('audio_upload_segments_transcription_completed', {
      requestId: req.requestId,
      userId,
      durationSeconds,
      actualMinutes,
    });

    // Upload combined audio file to Supabase Storage
    const audioPath = await uploadAudioFile(combinedAudioBuffer, filename, userId);
    const audioUrl = await getSignedAudioUrl(audioPath);
    logger.info('audio_upload_segments_storage_uploaded', {
      requestId: req.requestId,
      userId,
      audioPath,
    });

    // Save to database with user_id and audio URL
    const recording = await saveRecording(
      filename,
      transcription,
      combinedAudioBuffer.length,
      userId,
      audioPath,
      recordingMetadata,
    );

    // Deduct actual minutes from user's account
    await deductMinutes(userId, actualMinutes, 'transcription');
    logger.info('audio_upload_segments_minutes_deducted', {
      requestId: req.requestId,
      userId,
      minutesUsed: actualMinutes,
    });

    res.json({
      transcription,
      filename,
      size: combinedAudioBuffer.length,
      recordingId: recording.id,
      audioUrl,
      minutesUsed: actualMinutes,
      segmentCount: segments.length,
      meetingName: recording.meeting_name || recordingMetadata.meetingName || null,
      meetingLocation: recording.meeting_location || recordingMetadata.meetingLocation || null,
      meetingContext: recording.meeting_context || recordingMetadata.meetingContext || null,
      meetingAt: recording.meeting_at || recordingMetadata.meetingAt || null,
      meetingParticipants: getMeetingParticipantsForResponse(recording, recordingMetadata),
    });
  } catch (error: any) {
    logger.error('audio_upload_segments_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
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
      logger.warn('audio_summary_validation_failed', {
        requestId: req.requestId,
        reason: 'missing_transcript',
        hasRecordingId: Boolean(recordingId),
      });
      return res.status(400).json({ error: 'No transcript provided' });
    }

    logger.info('audio_summary_started', {
      requestId: req.requestId,
      userId: req.userId,
      transcriptLength: transcript.length,
      hasRecordingId: Boolean(recordingId),
    });
    
    // Generate summary
    const summary = await generateSummary(transcript);

    logger.info('audio_summary_generated', {
      requestId: req.requestId,
      userId: req.userId,
      summaryLength: summary.summary?.length || 0,
      keyPointsCount: summary.keyPoints?.length || 0,
      actionItemsCount: summary.actionItems?.length || 0,
    });

    // Update recording if ID provided
    if (recordingId) {
      await updateRecordingSummary(
        recordingId,
        summary.summary,
        summary.actionItems.map(item => item.task),
        summary.keyPoints
      );
      logger.info('audio_summary_recording_updated', {
        requestId: req.requestId,
        userId: req.userId,
        recordingId,
      });
    }

    res.json(summary);
  } catch (error: any) {
    logger.error('audio_summary_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: error.message || 'Summary generation failed' });
  }
});

/**
 * POST /api/audio/followup-draft
 * Generate follow-up drafts (email + Slack + checklist) from summary/transcript context.
 */
router.post('/followup-draft', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const summaryPayload = parseSummaryPayload(req.body?.summary);
    const transcriptPayload = parseTranscriptPayload(req.body?.transcript);
    const recordingId = normalizeRecordingId(req.body?.recordingId);
    const tone = normalizeFollowUpTone(req.body?.tone);
    const meetingName = normalizeMetadataValue(req.body?.meetingName, 120);
    const meetingLocation = normalizeMetadataValue(req.body?.meetingLocation, 160);
    const meetingContext = normalizeMetadataValue(req.body?.meetingContext, 2000);
    const meetingAt = parseMeetingAt(req.body?.meetingAt);
    const meetingParticipants = parseMeetingParticipants(req.body?.meetingParticipants);
    const meetingType = normalizeFollowUpMeetingType(req.body?.meetingType);
    const templateStyle = normalizeFollowUpTemplateStyle(req.body?.templateStyle);

    if (!summaryPayload && !transcriptPayload) {
      logger.warn('audio_followup_draft_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'missing_draft_payload',
      });
      return res.status(400).json({ error: 'Summary or transcript payload is required' });
    }

    const hasMinutes = await hasAvailableMinutes(userId, FOLLOWUP_DRAFT_MINUTES_COST);
    if (!hasMinutes) {
      logger.warn('audio_followup_draft_insufficient_minutes', {
        requestId: req.requestId,
        userId,
        minutesRequired: FOLLOWUP_DRAFT_MINUTES_COST,
      });
      return res.status(403).json({
        error: 'Insufficient minutes',
        message: 'You have reached your monthly limit. Please upgrade your plan to draft follow-up messages.',
      });
    }

    if (recordingId) {
      const recording = await getRecording(recordingId);
      if (!recording) {
        logger.warn('audio_followup_draft_recording_not_found', {
          requestId: req.requestId,
          userId,
          recordingId,
        });
        return res.status(404).json({ error: 'Recording not found' });
      }
      if (recording.user_id !== userId) {
        logger.warn('audio_followup_draft_recording_access_denied', {
          requestId: req.requestId,
          userId,
          recordingId,
        });
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    logger.info('audio_followup_draft_started', {
      requestId: req.requestId,
      userId,
      recordingId: recordingId || null,
      tone,
      meetingType: meetingType || null,
      templateStyle: templateStyle || null,
      hasSummary: Boolean(summaryPayload),
      transcriptLength: transcriptPayload?.length || 0,
    });

    const draft = await generateFollowUpDraft({
      meetingName: meetingName || undefined,
      meetingLocation: meetingLocation || undefined,
      meetingContext: meetingContext || undefined,
      meetingAt: meetingAt || undefined,
      meetingType: meetingType || undefined,
      templateStyle: templateStyle || undefined,
      participants: meetingParticipants || undefined,
      summary: summaryPayload,
      transcript: transcriptPayload,
      tone,
    });

    await deductMinutes(userId, FOLLOWUP_DRAFT_MINUTES_COST, 'summary');

    logger.info('audio_followup_draft_completed', {
      requestId: req.requestId,
      userId,
      recordingId: recordingId || null,
      tone: draft.tone,
      meetingType: meetingType || null,
      templateStyle: templateStyle || null,
      subjectLength: draft.subject.length,
      checklistCount: draft.actionChecklist.length,
      minutesUsed: FOLLOWUP_DRAFT_MINUTES_COST,
    });

    res.json({
      ...draft,
      minutesUsed: FOLLOWUP_DRAFT_MINUTES_COST,
      recordingId: recordingId || null,
      meetingType: meetingType || null,
      templateStyle: templateStyle || null,
    });
  } catch (error: any) {
    logger.error('audio_followup_draft_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: error.message || 'Failed to generate follow-up draft' });
  }
});

/**
 * POST /api/audio/prep-brief
 * Generate meeting prep brief + pre-call question kit from summary/transcript context.
 */
router.post('/prep-brief', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const summaryPayload = parseSummaryPayload(req.body?.summary);
    const transcriptPayload = parseTranscriptPayload(req.body?.transcript);
    const recordingId = normalizeRecordingId(req.body?.recordingId);
    const prepTone = normalizePrepTone(req.body?.prepTone);
    const prepGoal = normalizeMetadataValue(req.body?.prepGoal, 400);
    const meetingName = normalizeMetadataValue(req.body?.meetingName, 120);
    const meetingLocation = normalizeMetadataValue(req.body?.meetingLocation, 160);
    const meetingContext = normalizeMetadataValue(req.body?.meetingContext, 2000);
    const meetingAt = parseMeetingAt(req.body?.meetingAt);
    const meetingParticipants = parseMeetingParticipants(req.body?.meetingParticipants);
    const meetingType = normalizeFollowUpMeetingType(req.body?.meetingType);

    if (!summaryPayload && !transcriptPayload) {
      logger.warn('audio_prep_brief_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'missing_prep_payload',
      });
      return res.status(400).json({ error: 'Summary or transcript payload is required' });
    }

    const hasMinutes = await hasAvailableMinutes(userId, PREP_BRIEF_MINUTES_COST);
    if (!hasMinutes) {
      logger.warn('audio_prep_brief_insufficient_minutes', {
        requestId: req.requestId,
        userId,
        minutesRequired: PREP_BRIEF_MINUTES_COST,
      });
      return res.status(403).json({
        error: 'Insufficient minutes',
        message: 'You have reached your monthly limit. Please upgrade your plan to generate prep briefs.',
      });
    }

    if (recordingId) {
      const recording = await getRecording(recordingId);
      if (!recording) {
        logger.warn('audio_prep_brief_recording_not_found', {
          requestId: req.requestId,
          userId,
          recordingId,
        });
        return res.status(404).json({ error: 'Recording not found' });
      }
      if (recording.user_id !== userId) {
        logger.warn('audio_prep_brief_recording_access_denied', {
          requestId: req.requestId,
          userId,
          recordingId,
        });
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    logger.info('audio_prep_brief_started', {
      requestId: req.requestId,
      userId,
      recordingId: recordingId || null,
      prepTone,
      prepGoalLength: prepGoal?.length || 0,
      meetingType: meetingType || null,
      hasSummary: Boolean(summaryPayload),
      transcriptLength: transcriptPayload?.length || 0,
    });

    const prepBrief = await generateMeetingPrepBrief({
      meetingName: meetingName || undefined,
      meetingLocation: meetingLocation || undefined,
      meetingContext: meetingContext || undefined,
      meetingAt: meetingAt || undefined,
      meetingType: meetingType || undefined,
      participants: meetingParticipants || undefined,
      summary: summaryPayload,
      transcript: transcriptPayload,
      prepGoal: prepGoal || undefined,
      prepTone,
    });

    await deductMinutes(userId, PREP_BRIEF_MINUTES_COST, 'summary');

    logger.info('audio_prep_brief_completed', {
      requestId: req.requestId,
      userId,
      recordingId: recordingId || null,
      prepTone: prepBrief.prepTone,
      meetingType: meetingType || null,
      strategicFocusCount: prepBrief.strategicFocus.length,
      likelyRisksCount: prepBrief.likelyRisks.length,
      preCallQuestionsCount: prepBrief.preCallQuestions.length,
      openingScriptLength: prepBrief.openingScript.length,
      minutesUsed: PREP_BRIEF_MINUTES_COST,
    });

    res.json({
      ...prepBrief,
      minutesUsed: PREP_BRIEF_MINUTES_COST,
      recordingId: recordingId || null,
      meetingType: meetingType || null,
    });
  } catch (error: any) {
    logger.error('audio_prep_brief_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: error.message || 'Failed to generate meeting prep brief' });
  }
});

/**
 * GET /api/audio/recordings
 * Get recordings for the authenticated user
 */
router.get('/recordings', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const requestedLimit = Number(req.query.limit);
    const requestedOffset = Number(req.query.offset);

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
      : 50;
    const offset = Number.isFinite(requestedOffset)
      ? Math.max(0, Math.floor(requestedOffset))
      : 0;

    const { recordings, hasMore, nextOffset } = await getUserRecordings(req.userId!, limit, offset);
    const recordingsWithSignedUrls = await Promise.all(
      recordings.map(async (recording) => ({
        ...recording,
        audio_url: await getSignedAudioUrl(recording.audio_url),
      }))
    );
    res.json({
      recordings: recordingsWithSignedUrls,
      pagination: {
        limit,
        offset,
        hasMore,
        nextOffset,
      },
    });
  } catch (error: any) {
    logger.error('audio_recordings_fetch_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: 'Failed to fetch recordings' });
  }
});

/**
 * POST /api/audio/translate-breakdown
 * Translate summary/action/key-point breakdown into a target language.
 */
router.post('/translate-breakdown', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const targetLanguage = normalizeTargetLanguage(req.body?.targetLanguage);
    const summaryPayload = parseSummaryPayload(req.body?.summary);
    const transcriptPayload = parseTranscriptPayload(req.body?.transcript);
    const recordingId = normalizeRecordingId(req.body?.recordingId);

    if (!targetLanguage) {
      logger.warn('audio_translate_breakdown_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'missing_target_language',
      });
      return res.status(400).json({ error: 'Target language is required' });
    }

    if (!summaryPayload && !transcriptPayload) {
      logger.warn('audio_translate_breakdown_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'missing_translation_payload',
      });
      return res.status(400).json({ error: 'Summary or transcript payload is required' });
    }

    if (recordingId) {
      const recording = await getRecording(recordingId);
      if (!recording) {
        logger.warn('audio_translate_breakdown_recording_not_found', {
          requestId: req.requestId,
          userId,
          recordingId,
        });
        return res.status(404).json({ error: 'Recording not found' });
      }
      if (recording.user_id !== userId) {
        logger.warn('audio_translate_breakdown_recording_access_denied', {
          requestId: req.requestId,
          userId,
          recordingId,
        });
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    logger.info('audio_translate_breakdown_started', {
      requestId: req.requestId,
      userId,
      targetLanguage,
      recordingId: recordingId || null,
    });

    const translatedSummary = summaryPayload
      ? await translateMeetingBreakdown(summaryPayload, targetLanguage)
      : null;
    const translatedTranscript = transcriptPayload
      ? await translateTranscriptText(transcriptPayload, targetLanguage)
      : null;
    const cachePersisted = recordingId
      ? await saveRecordingTranslation(
        recordingId,
        targetLanguage,
        translatedSummary as Record<string, unknown> | null,
        translatedTranscript,
      )
      : false;

    logger.info('audio_translate_breakdown_completed', {
      requestId: req.requestId,
      userId,
      targetLanguage,
      recordingId: recordingId || null,
      cachePersisted,
      keyPointsCount: translatedSummary?.keyPoints?.length || 0,
      actionItemsCount: translatedSummary?.actionItems?.length || 0,
      transcriptLength: translatedTranscript?.length || 0,
    });

    res.json({
      targetLanguage,
      translatedSummary,
      translatedTranscript,
      recordingId: recordingId || null,
      cachePersisted,
    });
  } catch (error: any) {
    logger.error('audio_translate_breakdown_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: error.message || 'Failed to translate meeting breakdown' });
  }
});

/**
 * POST /api/audio/ask
 * Ask a question across the user's meeting history.
 */
router.post('/ask', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const question = normalizeQuestion(req.body?.question);
    const requestedLimit = Number(req.body?.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(40, Math.max(5, Math.floor(requestedLimit)))
      : 20;
    const userId = req.userId!;

    if (!question) {
      logger.warn('audio_ask_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'missing_question',
      });
      return res.status(400).json({ error: 'Question is required' });
    }

    const hasMinutes = await hasAvailableMinutes(userId, ASK_MINUTES_COST);
    if (!hasMinutes) {
      logger.warn('audio_ask_insufficient_minutes', {
        requestId: req.requestId,
        userId,
        minutesRequired: ASK_MINUTES_COST,
      });
      return res.status(403).json({
        error: 'Insufficient minutes',
        message: 'You have reached your monthly limit. Please upgrade your plan to continue asking questions.',
      });
    }

    logger.info('audio_ask_started', {
      requestId: req.requestId,
      userId,
      questionLength: question.length,
      requestedMeetingLimit: limit,
      minutesCost: ASK_MINUTES_COST,
    });

    const { recordings } = await getUserRecordings(userId, limit, 0);
    const meetings = recordings
      .filter((recording) => typeof recording.transcript === 'string' && recording.transcript.trim().length > 0)
      .map((recording) => ({
        id: String(recording.id),
        meetingName: safeMeetingTitle(recording),
        meetingAt: recording.meeting_at || recording.created_at || undefined,
        transcript: truncateTranscriptForAsk(recording.transcript),
        fullTranscript: recording.transcript,
      }));

    if (meetings.length === 0) {
      logger.info('audio_ask_no_meetings', {
        requestId: req.requestId,
        userId,
      });
      return res.status(404).json({ error: 'No meeting transcripts available yet' });
    }

    const llmResult = await generateCrossMeetingAnswer(
      question,
      meetings.map((meeting) => ({
        id: meeting.id,
        meetingName: meeting.meetingName,
        meetingAt: meeting.meetingAt,
        transcript: meeting.transcript,
      })),
    );

    const meetingById = new Map(meetings.map((meeting) => [meeting.id, meeting] as const));
    const citations = llmResult.citations
      .map((citation) => {
        const meeting = meetingById.get(citation.recordingId);
        if (!meeting) {
          return null;
        }
        return {
          recordingId: meeting.id,
          meetingName: meeting.meetingName,
          meetingAt: meeting.meetingAt || null,
          reason: citation.reason,
          snippet: buildCitationSnippet(meeting.fullTranscript, question),
        };
      })
      .filter((citation): citation is NonNullable<typeof citation> => Boolean(citation));

    await deductMinutes(userId, ASK_MINUTES_COST, 'summary');

    logger.info('audio_ask_completed', {
      requestId: req.requestId,
      userId,
      meetingCount: meetings.length,
      citationsCount: citations.length,
      minutesUsed: ASK_MINUTES_COST,
    });

    res.json({
      question,
      answer: llmResult.answer,
      citations,
      followUpQuestions: llmResult.followUpQuestions,
      meetingsSearched: meetings.length,
      minutesUsed: ASK_MINUTES_COST,
    });
  } catch (error: any) {
    logger.error('audio_ask_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: error.message || 'Failed to answer across meetings' });
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
      logger.warn('audio_recording_not_found', {
        requestId: req.requestId,
        userId: req.userId,
        recordingId: req.params.id,
      });
      return res.status(404).json({ error: 'Recording not found' });
    }
    // Verify the recording belongs to the authenticated user
    if (recording.user_id !== req.userId) {
      logger.warn('audio_recording_access_denied', {
        requestId: req.requestId,
        userId: req.userId,
        recordingId: req.params.id,
      });
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      ...recording,
      audio_url: await getSignedAudioUrl(recording.audio_url),
    });
  } catch (error: any) {
    logger.error('audio_recording_fetch_failed', {
      requestId: req.requestId,
      userId: req.userId,
      recordingId: req.params.id,
      ...serializeError(error),
    });
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
      logger.warn('audio_recording_not_found', {
        requestId: req.requestId,
        userId: req.userId,
        recordingId: req.params.id,
      });
      return res.status(404).json({ error: 'Recording not found' });
    }
    if (recording.user_id !== req.userId) {
      logger.warn('audio_recording_access_denied', {
        requestId: req.requestId,
        userId: req.userId,
        recordingId: req.params.id,
      });
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await deleteRecording(req.params.id);
    logger.info('audio_recording_deleted', {
      requestId: req.requestId,
      userId: req.userId,
      recordingId: req.params.id,
    });
    res.json({ success: true, message: 'Recording deleted' });
  } catch (error: any) {
    logger.error('audio_recording_delete_failed', {
      requestId: req.requestId,
      userId: req.userId,
      recordingId: req.params.id,
      ...serializeError(error),
    });
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
      logger.warn('audio_transcribe_validation_failed', {
        requestId: req.requestId,
        reason: 'missing_audio_file',
      });
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const userId = req.userId!;
    const audioBuffer = req.file.buffer;
    const filename = req.file.originalname;

    // Check if user has ANY minutes available
    const hasMinutes = await hasAvailableMinutes(userId, 1);
    if (!hasMinutes) {
      logger.warn('audio_transcribe_insufficient_minutes', {
        requestId: req.requestId,
        userId,
      });
      return res.status(403).json({ 
        error: 'Insufficient minutes',
        message: 'Please upgrade your plan to transcribe more audio',
      });
    }

    // Transcribe and get actual duration
    logger.info('audio_transcribe_started', {
      requestId: req.requestId,
      userId,
      filename,
      sizeBytes: audioBuffer.length,
    });
    const { text: transcript, durationSeconds } = await transcribeAudio(audioBuffer, filename);
    const actualMinutes = Math.ceil(durationSeconds / 60);

    // Deduct actual minutes
    await deductMinutes(userId, actualMinutes, 'transcription');
    logger.info('audio_transcribe_completed', {
      requestId: req.requestId,
      userId,
      durationSeconds,
      minutesUsed: actualMinutes,
    });

    res.json({
      transcript,
      minutesUsed: actualMinutes,
    });
  } catch (error: any) {
    logger.error('audio_transcribe_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
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
      logger.warn('audio_summarize_validation_failed', {
        requestId: req.requestId,
        reason: 'missing_transcript',
      });
      return res.status(400).json({ error: 'No transcript provided' });
    }

    const userId = req.userId!;

    // Estimate minutes (1 minute per summary)
    const minutesNeeded = 1;

    // Check if user has enough minutes
    const hasMinutes = await hasAvailableMinutes(userId, minutesNeeded);
    if (!hasMinutes) {
      logger.warn('audio_summarize_insufficient_minutes', {
        requestId: req.requestId,
        userId,
      });
      return res.status(403).json({ 
        error: 'Insufficient minutes',
        message: 'Please upgrade your plan to generate more summaries',
      });
    }

    // Generate summary
    logger.info('audio_summarize_started', {
      requestId: req.requestId,
      userId,
      transcriptLength: transcript.length,
    });
    const summary = await generateSummary(transcript);

    // Deduct minutes
    await deductMinutes(userId, minutesNeeded, 'summary');
    logger.info('audio_summarize_completed', {
      requestId: req.requestId,
      userId,
      minutesUsed: minutesNeeded,
      keyPointsCount: summary.keyPoints?.length || 0,
      actionItemsCount: summary.actionItems?.length || 0,
    });

    res.json({
      ...summary,
      minutesUsed: minutesNeeded,
    });
  } catch (error: any) {
    logger.error('audio_summarize_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
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
      logger.warn('audio_process_validation_failed', {
        requestId: req.requestId,
        reason: 'missing_audio_file',
      });
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const userId = req.userId!;
    const audioBuffer = req.file.buffer;
    const filename = req.file.originalname;

    // Check if user has ANY minutes available (will add 1 for summary)
    const hasMinutes = await hasAvailableMinutes(userId, 1);
    if (!hasMinutes) {
      logger.warn('audio_process_insufficient_minutes', {
        requestId: req.requestId,
        userId,
      });
      return res.status(403).json({ 
        error: 'Insufficient minutes',
        message: 'Please upgrade your plan',
      });
    }

    // Transcribe and get actual duration
    logger.info('audio_process_started', {
      requestId: req.requestId,
      userId,
      filename,
      sizeBytes: audioBuffer.length,
    });
    const { text: transcript, durationSeconds } = await transcribeAudio(audioBuffer, filename);
    const actualMinutes = Math.ceil(durationSeconds / 60) + 1; // +1 for summary
    logger.info('audio_process_transcription_completed', {
      requestId: req.requestId,
      userId,
      durationSeconds,
      projectedMinutesUsed: actualMinutes,
    });

    // Summarize
    const summary = await generateSummary(transcript);

    // Deduct actual minutes
    await deductMinutes(userId, actualMinutes, 'transcription');
    logger.info('audio_process_completed', {
      requestId: req.requestId,
      userId,
      minutesUsed: actualMinutes,
      keyPointsCount: summary.keyPoints?.length || 0,
      actionItemsCount: summary.actionItems?.length || 0,
    });

    res.json({
      transcript,
      summary,
      minutesUsed: actualMinutes,
    });
  } catch (error: any) {
    logger.error('audio_process_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: error.message || 'Processing failed' });
  }
});

export default router;
