import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockGetUserRecordings = jest.fn();
const mockHasAvailableMinutes = jest.fn();
const mockDeductMinutes = jest.fn();
const mockGenerateCrossMeetingAnswer = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../src/services/supabase', () => ({
  getUserRecordings: (...args: unknown[]) => mockGetUserRecordings(...args),
  hasAvailableMinutes: (...args: unknown[]) => mockHasAvailableMinutes(...args),
  deductMinutes: (...args: unknown[]) => mockDeductMinutes(...args),
  saveRecording: jest.fn(),
  updateRecordingSummary: jest.fn(),
  getRecording: jest.fn(),
  deleteRecording: jest.fn(),
  uploadAudioFile: jest.fn(),
  getSignedAudioUrl: jest.fn(),
}));

jest.mock('../src/services/llm', () => ({
  generateSummary: jest.fn(),
  generateCrossMeetingAnswer: (...args: unknown[]) => mockGenerateCrossMeetingAnswer(...args),
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

function createAuthToken(userId: string, email = 'ask-test@example.com') {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET || 'test-jwt-secret');
}

describe('Audio Ask Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasAvailableMinutes.mockResolvedValue(true);
  });

  it('returns 400 when question is missing', async () => {
    const token = createAuthToken('user-ask-1');

    const response = await request(app)
      .post('/api/audio/ask')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Question is required');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'audio_ask_validation_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-ask-1',
        reason: 'missing_question',
      }),
    );
  });

  it('returns 404 when user has no transcript-bearing meetings', async () => {
    const token = createAuthToken('user-ask-2');
    mockGetUserRecordings.mockResolvedValue({
      recordings: [],
      hasMore: false,
      nextOffset: null,
    });

    const response = await request(app)
      .post('/api/audio/ask')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'What did we decide last week?' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('No meeting transcripts available yet');
    expect(mockGenerateCrossMeetingAnswer).not.toHaveBeenCalled();
    expect(mockDeductMinutes).not.toHaveBeenCalled();
  });

  it('returns 403 when user has no available minutes for ask', async () => {
    const token = createAuthToken('user-ask-2b');
    mockHasAvailableMinutes.mockResolvedValue(false);

    const response = await request(app)
      .post('/api/audio/ask')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'What did we decide last week?' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Insufficient minutes');
    expect(mockGetUserRecordings).not.toHaveBeenCalled();
    expect(mockGenerateCrossMeetingAnswer).not.toHaveBeenCalled();
    expect(mockDeductMinutes).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'audio_ask_insufficient_minutes',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-ask-2b',
        minutesRequired: 1,
      }),
    );
  });

  it('returns an answer with citations across meetings', async () => {
    const token = createAuthToken('user-ask-3');
    mockGetUserRecordings.mockResolvedValue({
      recordings: [
        {
          id: 'rec-1',
          filename: 'weekly_sync.m4a',
          meeting_name: 'Weekly Sync',
          meeting_at: '2026-04-20T13:00:00.000Z',
          transcript: 'We decided to ship Android beta on Friday and assigned QA checks to Mia.',
        },
      ],
      hasMore: false,
      nextOffset: null,
    });
    mockGenerateCrossMeetingAnswer.mockResolvedValue({
      answer: 'Android beta is planned for Friday with QA owned by Mia.',
      citations: [
        { recordingId: 'rec-1', reason: 'Contains explicit ship date and QA owner.' },
      ],
      followUpQuestions: ['Do we have launch blockers?'],
    });

    const response = await request(app)
      .post('/api/audio/ask')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'What is the Android beta timeline and who owns QA?' });

    expect(response.status).toBe(200);
    expect(response.body.answer).toContain('Android beta');
    expect(response.body.citations).toHaveLength(1);
    expect(response.body.minutesUsed).toBe(1);
    expect(response.body.citations[0]).toEqual(
      expect.objectContaining({
        recordingId: 'rec-1',
        meetingName: 'Weekly Sync',
      }),
    );
    expect(mockHasAvailableMinutes).toHaveBeenCalledWith('user-ask-3', 1);
    expect(mockDeductMinutes).toHaveBeenCalledWith('user-ask-3', 1, 'summary');
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'audio_ask_completed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-ask-3',
        citationsCount: 1,
        minutesUsed: 1,
      }),
    );
  });
});
