import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockHasAvailableMinutes = jest.fn();
const mockDeductMinutes = jest.fn();
const mockGetRecording = jest.fn();
const mockGenerateMeetingPrepBrief = jest.fn();
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
  generateFollowUpDraft: jest.fn(),
  generateMeetingPrepBrief: (...args: unknown[]) => mockGenerateMeetingPrepBrief(...args),
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

function createAuthToken(userId: string, email = 'prep-brief-test@example.com') {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET || 'test-jwt-secret');
}

describe('Audio Prep Brief Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasAvailableMinutes.mockResolvedValue(true);
  });

  it('returns 400 when summary/transcript payload is missing', async () => {
    const token = createAuthToken('user-prep-1');

    const response = await request(app)
      .post('/api/audio/prep-brief')
      .set('Authorization', `Bearer ${token}`)
      .send({
        prepGoal: 'Walk in with a clear negotiation position.',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Summary or transcript payload is required');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'audio_prep_brief_validation_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-prep-1',
        reason: 'missing_prep_payload',
      }),
    );
  });

  it('returns 403 when user has no available minutes', async () => {
    const token = createAuthToken('user-prep-2');
    mockHasAvailableMinutes.mockResolvedValue(false);

    const response = await request(app)
      .post('/api/audio/prep-brief')
      .set('Authorization', `Bearer ${token}`)
      .send({
        transcript: 'We reviewed launch blockers and contract concerns.',
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Insufficient minutes');
    expect(mockGenerateMeetingPrepBrief).not.toHaveBeenCalled();
    expect(mockDeductMinutes).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'audio_prep_brief_insufficient_minutes',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-prep-2',
        minutesRequired: 1,
      }),
    );
  });

  it('returns prep brief payload and deducts minutes on success', async () => {
    const token = createAuthToken('user-prep-3');
    mockGetRecording.mockResolvedValue({
      id: 'recording-900',
      user_id: 'user-prep-3',
    });
    mockGenerateMeetingPrepBrief.mockResolvedValue({
      briefSummary: 'Customer procurement and timeline risk were the major themes.',
      strategicFocus: ['Lock owner for legal redlines', 'Confirm launch gate criteria'],
      likelyRisks: ['Procurement cycle slips by 2 weeks'],
      preCallQuestions: ['What is the final legal sign-off date?'],
      openingScript: 'Thanks everyone. I want to align on owners and timeline risk first.',
      prepTone: 'challenger',
    });

    const response = await request(app)
      .post('/api/audio/prep-brief')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recordingId: 'recording-900',
        meetingName: 'Enterprise Renewal Call',
        meetingLocation: 'Zoom',
        meetingContext: 'Contract and launch date alignment',
        meetingAt: '2026-05-03T14:00:00.000Z',
        meetingParticipants: ['Alex', 'Mia'],
        meetingType: 'sales_call',
        prepGoal: 'Get customer agreement on implementation date.',
        prepTone: 'challenger',
        summary: {
          summary: 'Timeline and legal dependencies reviewed.',
          keyPoints: ['Legal redlines pending'],
          actionItems: [{ task: 'Share revised MSA' }],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        briefSummary: 'Customer procurement and timeline risk were the major themes.',
        prepTone: 'challenger',
        minutesUsed: 1,
        recordingId: 'recording-900',
        meetingType: 'sales_call',
      }),
    );
    expect(mockGenerateMeetingPrepBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingName: 'Enterprise Renewal Call',
        meetingLocation: 'Zoom',
        meetingContext: 'Contract and launch date alignment',
        meetingType: 'sales_call',
        prepGoal: 'Get customer agreement on implementation date.',
        prepTone: 'challenger',
        participants: ['Alex', 'Mia'],
      }),
    );
    expect(mockDeductMinutes).toHaveBeenCalledWith('user-prep-3', 1, 'summary');
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'audio_prep_brief_completed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-prep-3',
        minutesUsed: 1,
      }),
    );
  });

  it('returns 403 when recording belongs to another user', async () => {
    const token = createAuthToken('user-prep-4');
    mockGetRecording.mockResolvedValue({
      id: 'recording-901',
      user_id: 'other-user',
    });

    const response = await request(app)
      .post('/api/audio/prep-brief')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recordingId: 'recording-901',
        transcript: 'Quick prep notes.',
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Access denied');
    expect(mockGenerateMeetingPrepBrief).not.toHaveBeenCalled();
    expect(mockDeductMinutes).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'audio_prep_brief_recording_access_denied',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-prep-4',
        recordingId: 'recording-901',
      }),
    );
  });
});
