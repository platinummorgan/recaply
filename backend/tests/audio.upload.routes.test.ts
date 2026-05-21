import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockHasAvailableMinutes = jest.fn();
const mockDeductMinutes = jest.fn();
const mockSaveRecording = jest.fn();
const mockUploadAudioFile = jest.fn();
const mockGetSignedAudioUrl = jest.fn();
const mockTranscribeAudio = jest.fn();
const mockCombineAudioSegments = jest.fn();

jest.mock('../src/services/supabase', () => ({
  hasAvailableMinutes: (...args: unknown[]) => mockHasAvailableMinutes(...args),
  deductMinutes: (...args: unknown[]) => mockDeductMinutes(...args),
  saveRecording: (...args: unknown[]) => mockSaveRecording(...args),
  uploadAudioFile: (...args: unknown[]) => mockUploadAudioFile(...args),
  getSignedAudioUrl: (...args: unknown[]) => mockGetSignedAudioUrl(...args),
  updateRecordingSummary: jest.fn(),
  getUserRecordings: jest.fn(),
  getRecording: jest.fn(),
  deleteRecording: jest.fn(),
}));

jest.mock('../src/services/chunkedTranscription', () => ({
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
}));

jest.mock('../src/services/audioProcessor', () => ({
  combineAudioSegments: (...args: unknown[]) => mockCombineAudioSegments(...args),
}));

import app from '../src/server';

function createAuthToken(userId: string, email = 'audio-test@example.com') {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET || 'test-jwt-secret');
}

describe('Audio Upload Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasAvailableMinutes.mockResolvedValue(true);
    mockCombineAudioSegments.mockResolvedValue(Buffer.from('combined-audio'));
    mockTranscribeAudio.mockResolvedValue({
      text: 'transcribed text',
      durationSeconds: 125,
    });
    mockUploadAudioFile.mockResolvedValue('audio/path/file.m4a');
    mockGetSignedAudioUrl.mockResolvedValue('https://signed.example/audio');
    mockSaveRecording.mockResolvedValue({ id: 'recording-1' });
  });

  it('returns 400 when no audio segments are provided', async () => {
    const token = createAuthToken('user-1');

    const response = await request(app)
      .post('/api/audio/upload-segments')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('No audio segments provided');
    expect(mockCombineAudioSegments).not.toHaveBeenCalled();
  });

  it('returns 403 when user has no available minutes for segment upload', async () => {
    const token = createAuthToken('user-1');
    mockHasAvailableMinutes.mockResolvedValue(false);

    const response = await request(app)
      .post('/api/audio/upload-segments')
      .set('Authorization', `Bearer ${token}`)
      .attach('segments', Buffer.from('segment-1'), 'segment1.m4a')
      .attach('segments', Buffer.from('segment-2'), 'segment2.m4a');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Insufficient minutes');
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
    expect(mockDeductMinutes).not.toHaveBeenCalled();
  });

  it('returns 500 when combining segments fails', async () => {
    const token = createAuthToken('user-1');
    mockCombineAudioSegments.mockRejectedValue(new Error('ffmpeg combine failed'));

    const response = await request(app)
      .post('/api/audio/upload-segments')
      .set('Authorization', `Bearer ${token}`)
      .attach('segments', Buffer.from('segment-1'), 'segment1.m4a')
      .attach('segments', Buffer.from('segment-2'), 'segment2.m4a');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('ffmpeg combine failed');
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
    expect(mockUploadAudioFile).not.toHaveBeenCalled();
    expect(mockDeductMinutes).not.toHaveBeenCalled();
  });

  it('returns 500 when chunked transcription fails after segment combine', async () => {
    const token = createAuthToken('user-1');
    mockTranscribeAudio.mockRejectedValue(new Error('Whisper timeout'));

    const response = await request(app)
      .post('/api/audio/upload-segments')
      .set('Authorization', `Bearer ${token}`)
      .attach('segments', Buffer.from('segment-1'), 'segment1.m4a')
      .attach('segments', Buffer.from('segment-2'), 'segment2.m4a');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Whisper timeout');
    expect(mockUploadAudioFile).not.toHaveBeenCalled();
    expect(mockDeductMinutes).not.toHaveBeenCalled();
  });

  it('returns 500 when storage upload fails after successful transcription', async () => {
    const token = createAuthToken('user-1');
    mockUploadAudioFile.mockRejectedValue(new Error('storage unavailable'));

    const response = await request(app)
      .post('/api/audio/upload-segments')
      .set('Authorization', `Bearer ${token}`)
      .attach('segments', Buffer.from('segment-1'), 'segment1.m4a')
      .attach('segments', Buffer.from('segment-2'), 'segment2.m4a');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('storage unavailable');
    expect(mockDeductMinutes).not.toHaveBeenCalled();
  });

  it('persists meeting metadata for direct uploads', async () => {
    const token = createAuthToken('user-1');
    const meetingAt = '2026-04-22T13:00:00-04:00';

    const response = await request(app)
      .post('/api/audio/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('meetingName', 'Weekly Product Sync')
      .field('meetingLocation', 'HQ Room 4B')
      .field('meetingContext', 'Review roadmap milestones and blockers')
      .field('meetingParticipants', 'Alex Rivera, Taylor Kim')
      .field('meetingAt', meetingAt)
      .attach('audio', Buffer.from('single-audio'), 'weekly-sync.m4a');

    expect(response.status).toBe(200);
    expect(mockSaveRecording).toHaveBeenCalledWith(
      'weekly-sync.m4a',
      'transcribed text',
      expect.any(Number),
      'user-1',
      'audio/path/file.m4a',
      {
        meetingName: 'Weekly Product Sync',
        meetingLocation: 'HQ Room 4B',
        meetingContext: 'Review roadmap milestones and blockers',
        meetingAt: new Date(meetingAt).toISOString(),
        meetingParticipants: ['Alex Rivera', 'Taylor Kim'],
      },
    );
    expect(response.body.meetingName).toBe('Weekly Product Sync');
    expect(response.body.meetingLocation).toBe('HQ Room 4B');
    expect(response.body.meetingContext).toBe('Review roadmap milestones and blockers');
    expect(response.body.meetingAt).toBe(new Date(meetingAt).toISOString());
    expect(response.body.meetingParticipants).toEqual(['Alex Rivera', 'Taylor Kim']);
  });
});
