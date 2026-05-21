import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockTranslateMeetingBreakdown = jest.fn();
const mockTranslateTranscriptText = jest.fn();
const mockSaveRecordingTranslation = jest.fn();
const mockGetRecording = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../src/services/supabase', () => ({
  hasAvailableMinutes: jest.fn(),
  deductMinutes: jest.fn(),
  saveRecording: jest.fn(),
  updateRecordingSummary: jest.fn(),
  getUserRecordings: jest.fn(),
  getRecording: (...args: unknown[]) => mockGetRecording(...args),
  deleteRecording: jest.fn(),
  uploadAudioFile: jest.fn(),
  getSignedAudioUrl: jest.fn(),
  saveRecordingTranslation: (...args: unknown[]) => mockSaveRecordingTranslation(...args),
}));

jest.mock('../src/services/llm', () => ({
  generateSummary: jest.fn(),
  generateCrossMeetingAnswer: jest.fn(),
  translateMeetingBreakdown: (...args: unknown[]) => mockTranslateMeetingBreakdown(...args),
  translateTranscriptText: (...args: unknown[]) => mockTranslateTranscriptText(...args),
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

function createAuthToken(userId: string, email = 'translate-test@example.com') {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET || 'test-jwt-secret');
}

describe('Audio Translate Breakdown Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRecording.mockResolvedValue({
      id: 'recording-123',
      user_id: 'user-translate-3',
    });
    mockSaveRecordingTranslation.mockResolvedValue(true);
  });

  it('returns 400 when target language is missing', async () => {
    const token = createAuthToken('user-translate-1');

    const response = await request(app)
      .post('/api/audio/translate-breakdown')
      .set('Authorization', `Bearer ${token}`)
      .send({
        summary: { summary: 'Meeting recap', keyPoints: [], actionItems: [] },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Target language is required');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'audio_translate_breakdown_validation_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-translate-1',
        reason: 'missing_target_language',
      }),
    );
  });

  it('returns 400 when summary payload is missing', async () => {
    const token = createAuthToken('user-translate-2');

    const response = await request(app)
      .post('/api/audio/translate-breakdown')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetLanguage: 'Spanish',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Summary or transcript payload is required');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'audio_translate_breakdown_validation_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-translate-2',
        reason: 'missing_translation_payload',
      }),
    );
  });

  it('returns translated breakdown and logs completion context', async () => {
    mockTranslateMeetingBreakdown.mockResolvedValue({
      summary: 'Este es un resumen traducido.',
      keyPoints: ['Punto clave'],
      decisions: [],
      actionItems: [{ task: 'Preparar seguimiento' }],
      participants: ['Alex'],
      sentiment: 'neutral',
    });
    mockTranslateTranscriptText.mockResolvedValue('Transcripcion traducida.');

    const token = createAuthToken('user-translate-3');

    const response = await request(app)
      .post('/api/audio/translate-breakdown')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetLanguage: 'Spanish',
        recordingId: 'recording-123',
        summary: {
          summary: 'This is a translated summary.',
          keyPoints: ['Key point'],
          actionItems: [{ task: 'Prepare follow-up' }],
        },
        transcript: 'This is the transcript body.',
      });

    expect(response.status).toBe(200);
    expect(response.body.targetLanguage).toBe('Spanish');
    expect(response.body.translatedSummary).toEqual(
      expect.objectContaining({
        summary: 'Este es un resumen traducido.',
      }),
    );
    expect(response.body.translatedTranscript).toBe('Transcripcion traducida.');
    expect(response.body.cachePersisted).toBe(true);
    expect(mockSaveRecordingTranslation).toHaveBeenCalledWith(
      'recording-123',
      'Spanish',
      expect.objectContaining({
        summary: 'Este es un resumen traducido.',
      }),
      'Transcripcion traducida.',
    );
    expect(mockTranslateMeetingBreakdown).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'This is a translated summary.',
      }),
      'Spanish',
    );
    expect(mockTranslateTranscriptText).toHaveBeenCalledWith(
      'This is the transcript body.',
      'Spanish',
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'audio_translate_breakdown_completed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-translate-3',
        targetLanguage: 'Spanish',
      }),
    );
  });
});
