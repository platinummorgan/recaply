import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockHasAvailableMinutes = jest.fn();
const mockDeductMinutes = jest.fn();
const mockGenerateSummary = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../src/services/supabase', () => ({
  hasAvailableMinutes: (...args: unknown[]) => mockHasAvailableMinutes(...args),
  deductMinutes: (...args: unknown[]) => mockDeductMinutes(...args),
}));

jest.mock('../src/services/llm', () => ({
  generateSummary: (...args: unknown[]) => mockGenerateSummary(...args),
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

function createAuthToken(userId: string, email = 'test@example.com') {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET || 'test-jwt-secret');
}

describe('Audio Summary Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 and logs validation warning when transcript is missing', async () => {
    const token = createAuthToken('user-123');

    const response = await request(app)
      .post('/api/audio/summarize')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('No transcript provided');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'audio_summarize_validation_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        reason: 'missing_transcript',
      }),
    );
  });

  it('deducts one minute after successful summary generation', async () => {
    mockHasAvailableMinutes.mockResolvedValue(true);
    mockGenerateSummary.mockResolvedValue({
      summary: 'Summary text',
      keyPoints: ['Point 1'],
      decisions: ['Decision 1'],
      actionItems: [{ task: 'Action 1' }],
    });

    const token = createAuthToken('user-123');

    const response = await request(app)
      .post('/api/audio/summarize')
      .set('Authorization', `Bearer ${token}`)
      .send({ transcript: 'Meeting transcript content' });

    expect(response.status).toBe(200);
    expect(response.body.summary).toBe('Summary text');
    expect(response.body.minutesUsed).toBe(1);
    expect(mockHasAvailableMinutes).toHaveBeenCalledWith('user-123', 1);
    expect(mockDeductMinutes).toHaveBeenCalledWith('user-123', 1, 'summary');
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'audio_summarize_started',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-123',
        transcriptLength: 'Meeting transcript content'.length,
      }),
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'audio_summarize_completed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-123',
        minutesUsed: 1,
      }),
    );
  });
});
