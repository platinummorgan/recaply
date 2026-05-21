import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockHasAvailableMinutes = jest.fn();
const mockDeductMinutes = jest.fn();
const mockGetRecording = jest.fn();
const mockGenerateFollowUpDraft = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../src/services/supabase', () => ({
  hasAvailableMinutes: (...args: unknown[]) => mockHasAvailableMinutes(...args),
  deductMinutes: (...args: unknown[]) => mockDeductMinutes(...args),
  getRecording: (...args: unknown[]) => mockGetRecording(...args),
  saveRecording: jest.fn(),
  updateRecordingSummary: jest.fn(),
  getUserRecordings: jest.fn(),
  deleteRecording: jest.fn(),
  uploadAudioFile: jest.fn(),
  getSignedAudioUrl: jest.fn(),
  saveRecordingTranslation: jest.fn(),
}));

jest.mock('../src/services/llm', () => ({
  generateSummary: jest.fn(),
  generateCrossMeetingAnswer: jest.fn(),
  generateFollowUpDraft: (...args: unknown[]) => mockGenerateFollowUpDraft(...args),
  translateMeetingBreakdown: jest.fn(),
  translateTranscriptText: jest.fn(),
}));

jest.mock('../src/services/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
  serializeError: (error: unknown) => ({
    errorMessage: error instanceof Error ? error.message : String(error),
  }),
}));

import app from '../src/server';

function createAuthToken(userId: string, email = 'followup-test@example.com') {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET || 'test-jwt-secret');
}

describe('Audio Follow-up Draft Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasAvailableMinutes.mockResolvedValue(true);
  });

  it('returns 400 when summary/transcript payload is missing', async () => {
    const token = createAuthToken('user-followup-1');

    const response = await request(app)
      .post('/api/audio/followup-draft')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Summary or transcript payload is required');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'audio_followup_draft_validation_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-followup-1',
        reason: 'missing_draft_payload',
      }),
    );
  });

  it('returns 403 when user has no available minutes', async () => {
    const token = createAuthToken('user-followup-2');
    mockHasAvailableMinutes.mockResolvedValue(false);

    const response = await request(app)
      .post('/api/audio/followup-draft')
      .set('Authorization', `Bearer ${token}`)
      .send({
        transcript: 'We reviewed launch blockers and next steps.',
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Insufficient minutes');
    expect(mockGenerateFollowUpDraft).not.toHaveBeenCalled();
    expect(mockDeductMinutes).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'audio_followup_draft_insufficient_minutes',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-followup-2',
        minutesRequired: 1,
      }),
    );
  });

  it('returns draft payload and deducts minutes on success', async () => {
    const token = createAuthToken('user-followup-3');
    mockGetRecording.mockResolvedValue({
      id: 'recording-123',
      user_id: 'user-followup-3',
    });
    mockGenerateFollowUpDraft.mockResolvedValue({
      subject: 'Launch Planning Follow-up',
      emailBody: 'Thanks everyone. Owners and due dates are below.',
      slackMessage: 'Launch follow-up recap posted.',
      actionChecklist: ['Send updated roadmap', 'Confirm QA cutover date'],
      tone: 'neutral',
    });

    const response = await request(app)
      .post('/api/audio/followup-draft')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recordingId: 'recording-123',
        meetingName: 'Launch Planning',
        meetingLocation: 'HQ Boardroom',
        meetingContext: 'Final launch readiness review',
        meetingAt: '2026-05-01T15:00:00.000Z',
        meetingType: 'project_update',
        templateStyle: 'action_push',
        meetingParticipants: ['Alex', 'Mia'],
        summary: {
          summary: 'Launch timeline and QA ownership were confirmed.',
          keyPoints: ['Timeline confirmed'],
          actionItems: [{ task: 'Send roadmap' }],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        subject: 'Launch Planning Follow-up',
        slackMessage: 'Launch follow-up recap posted.',
        tone: 'neutral',
        minutesUsed: 1,
        recordingId: 'recording-123',
        meetingType: 'project_update',
        templateStyle: 'action_push',
      }),
    );
    expect(mockGenerateFollowUpDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingName: 'Launch Planning',
        meetingLocation: 'HQ Boardroom',
        meetingContext: 'Final launch readiness review',
        meetingType: 'project_update',
        templateStyle: 'action_push',
        participants: ['Alex', 'Mia'],
        tone: 'neutral',
      }),
    );
    expect(mockDeductMinutes).toHaveBeenCalledWith('user-followup-3', 1, 'summary');
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'audio_followup_draft_completed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-followup-3',
        minutesUsed: 1,
      }),
    );
  });

  it('returns 403 when recording belongs to another user', async () => {
    const token = createAuthToken('user-followup-4');
    mockGetRecording.mockResolvedValue({
      id: 'recording-555',
      user_id: 'other-user',
    });

    const response = await request(app)
      .post('/api/audio/followup-draft')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recordingId: 'recording-555',
        transcript: 'Quick standup notes.',
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Access denied');
    expect(mockGenerateFollowUpDraft).not.toHaveBeenCalled();
    expect(mockDeductMinutes).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'audio_followup_draft_recording_access_denied',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-followup-4',
        recordingId: 'recording-555',
      }),
    );
  });
});
