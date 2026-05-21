describe('Request Log Context', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLogLevel = process.env.LOG_LEVEL;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalGoogleServiceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
  let stdoutWriteSpy: jest.SpyInstance;
  let stderrWriteSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'info';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

    stdoutWriteSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrWriteSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
    process.env.LOG_LEVEL = originalLogLevel;
    process.env.JWT_SECRET = originalJwtSecret;
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH = originalGoogleServiceAccountPath;
    jest.dontMock('axios');
    jest.unmock('axios');
    jest.dontMock('@supabase/supabase-js');
    jest.unmock('@supabase/supabase-js');
    jest.dontMock('fluent-ffmpeg');
    jest.unmock('fluent-ffmpeg');
    jest.dontMock('../src/services/supabase');
    jest.unmock('../src/services/supabase');
    jest.dontMock('../src/services/googleplay');
    jest.unmock('../src/services/googleplay');
    jest.dontMock('../src/services/llm');
    jest.unmock('../src/services/llm');
  });

  function parseEntries(lines: string[]) {
    return lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Record<string, unknown>[];
  }

  it('propagates requestId and authenticated user fields to logger entries', async () => {
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const { authenticate } = require('../src/middleware/auth');
    const { logger } = require('../src/services/logger');

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.get('/secure', authenticate, (_req: any, res: any) => {
      logger.info('service_context_check');
      res.status(200).json({ ok: true });
    });

    const token = jwt.sign(
      { userId: 'user-ctx-1', email: 'ctx@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .get('/secure')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const lines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(lines);
    const entry = entries.find((item) => item.message === 'service_context_check');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected service_context_check log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-1');
    expect(entry.userEmail).toBe('ctx@example.com');
  });

  it('propagates authenticated context into llm service error logs', async () => {
    jest.doMock('axios', () => ({
      __esModule: true,
      default: {
        post: jest.fn().mockRejectedValue(new Error('llm unavailable')),
      },
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const { authenticate } = require('../src/middleware/auth');
    const { generateSummary } = require('../src/services/llm');

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.post('/summary-fail', authenticate, async (_req: any, res: any) => {
      try {
        await generateSummary('transcript text');
        res.status(200).json({ ok: true });
      } catch {
        res.status(500).json({ ok: false });
      }
    });

    const token = jwt.sign(
      { userId: 'user-ctx-2', email: 'ctx2@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/summary-fail')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(500);

    const stderrLines = stderrWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stderrLines);
    const entry = entries.find((item) => item.message === 'summary_generation_failed');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected summary_generation_failed log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-2');
    expect(entry.userEmail).toBe('ctx2@example.com');
  });

  it('propagates authenticated context into googleplay service error logs', async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_PATH;

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const { authenticate } = require('../src/middleware/auth');
    const { verifySubscriptionPurchase } = require('../src/services/googleplay');

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.get('/googleplay-fail', authenticate, async (_req: any, res: any) => {
      const result = await verifySubscriptionPurchase(
        'com.recaply.app',
        'recaply_lite_monthly',
        'token-123',
      );
      res.status(200).json(result);
    });

    const token = jwt.sign(
      { userId: 'user-ctx-3', email: 'ctx3@example.com' },
      process.env.JWT_SECRET,
    );

    const response = await request(app)
      .get('/googleplay-fail')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.valid).toBe(false);

    const stderrLines = stderrWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stderrLines);
    const entry = entries.find((item) => item.message === 'googleplay_subscription_verify_failed');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected googleplay_subscription_verify_failed log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-3');
    expect(entry.userEmail).toBe('ctx3@example.com');
  });

  it('propagates authenticated context into transcription service error logs', async () => {
    jest.doMock('axios', () => ({
      __esModule: true,
      default: {
        post: jest.fn().mockRejectedValue(new Error('transcription provider down')),
      },
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const { authenticate } = require('../src/middleware/auth');
    const { transcribeAudio } = require('../src/services/transcription');

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.post('/transcription-fail', authenticate, async (_req: any, res: any) => {
      try {
        await transcribeAudio(Buffer.from('audio-bytes'), 'failing-file.m4a');
        res.status(200).json({ ok: true });
      } catch {
        res.status(500).json({ ok: false });
      }
    });

    const token = jwt.sign(
      { userId: 'user-ctx-4', email: 'ctx4@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/transcription-fail')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(500);

    const stderrLines = stderrWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stderrLines);
    const entry = entries.find((item) => item.message === 'transcription_request_failed');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected transcription_request_failed log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-4');
    expect(entry.userEmail).toBe('ctx4@example.com');
  });

  it('propagates authenticated context into supabase storage upload failure logs', async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test-project.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        storage: {
          from: () => ({
            upload: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'storage upload unavailable', code: '500' },
            }),
          }),
        },
      }),
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const { authenticate } = require('../src/middleware/auth');
    const { uploadAudioFile } = require('../src/services/supabase');

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.post('/supabase-upload-fail', authenticate, async (_req: any, res: any) => {
      try {
        await uploadAudioFile(Buffer.from('audio-bytes'), 'storage-fail.m4a', 'user-ctx-5');
        res.status(200).json({ ok: true });
      } catch {
        res.status(500).json({ ok: false });
      }
    });

    const token = jwt.sign(
      { userId: 'user-ctx-5', email: 'ctx5@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/supabase-upload-fail')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(500);

    const stderrLines = stderrWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stderrLines);
    const entry = entries.find((item) => item.message === 'supabase_upload_audio_failed');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected supabase_upload_audio_failed log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-5');
    expect(entry.userEmail).toBe('ctx5@example.com');
  });

  it('propagates authenticated context into chunked transcription failure logs', async () => {
    jest.doMock('fluent-ffmpeg', () => {
      const ffmpegMock: any = jest.fn();
      ffmpegMock.ffprobe = (_file: string, callback: (error: Error) => void) => {
        callback(new Error('ffprobe unavailable'));
      };
      return {
        __esModule: true,
        default: ffmpegMock,
      };
    });

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const { authenticate } = require('../src/middleware/auth');
    const { transcribeAudioWithChunking } = require('../src/services/chunkedTranscription');

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.post('/chunked-transcription-fail', authenticate, async (_req: any, res: any) => {
      try {
        await transcribeAudioWithChunking(Buffer.from('audio-bytes'), 'chunked-fail.m4a');
        res.status(200).json({ ok: true });
      } catch {
        res.status(500).json({ ok: false });
      }
    });

    const token = jwt.sign(
      { userId: 'user-ctx-6', email: 'ctx6@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/chunked-transcription-fail')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(500);

    const stderrLines = stderrWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stderrLines);
    const entry = entries.find((item) => item.message === 'chunked_transcription_failed');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected chunked_transcription_failed log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-6');
    expect(entry.userEmail).toBe('ctx6@example.com');
  });

  it('propagates authenticated context into audio segment combine failure logs', async () => {
    jest.doMock('fluent-ffmpeg', () => {
      const ffmpegMock: any = jest.fn(() => {
        const handlers: Record<string, (error?: Error) => void> = {};
        const chain: any = {
          input: () => chain,
          inputOptions: () => chain,
          audioCodec: () => chain,
          on: (event: string, callback: (error?: Error) => void) => {
            handlers[event] = callback;
            return chain;
          },
          save: () => {
            setImmediate(() => handlers.error?.(new Error('ffmpeg combine failed')));
            return chain;
          },
        };
        return chain;
      });
      ffmpegMock.ffprobe = jest.fn();
      return {
        __esModule: true,
        default: ffmpegMock,
      };
    });

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const { authenticate } = require('../src/middleware/auth');
    const { combineAudioSegments } = require('../src/services/audioProcessor');

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.post('/audio-combine-fail', authenticate, async (_req: any, res: any) => {
      try {
        await combineAudioSegments([Buffer.from('seg-1'), Buffer.from('seg-2')]);
        res.status(200).json({ ok: true });
      } catch {
        res.status(500).json({ ok: false });
      }
    });

    const token = jwt.sign(
      { userId: 'user-ctx-7', email: 'ctx7@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/audio-combine-fail')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(500);

    const stderrLines = stderrWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stderrLines);
    const entry = entries.find((item) => item.message === 'audio_segments_combine_failed');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected audio_segments_combine_failed log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-7');
    expect(entry.userEmail).toBe('ctx7@example.com');
  });

  it('propagates authenticated context into chunked transcription retry warning logs', async () => {
    jest.doMock('axios', () => ({
      __esModule: true,
      default: {
        post: jest.fn().mockRejectedValue(new Error('whisper timeout')),
      },
    }));

    jest.doMock('fluent-ffmpeg', () => {
      const ffmpegMock: any = jest.fn();
      ffmpegMock.ffprobe = (_file: string, callback: (error: null, metadata: { format: { duration: number } }) => void) => {
        callback(null, { format: { duration: 60 } });
      };
      return {
        __esModule: true,
        default: ffmpegMock,
      };
    });

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const { authenticate } = require('../src/middleware/auth');
    const { transcribeAudioWithChunking } = require('../src/services/chunkedTranscription');

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.post('/chunked-transcription-retry-warn', authenticate, async (_req: any, res: any) => {
      try {
        await transcribeAudioWithChunking(Buffer.from('audio-bytes'), 'chunked-retry-warn.m4a');
        res.status(200).json({ ok: true });
      } catch {
        res.status(500).json({ ok: false });
      }
    });

    const token = jwt.sign(
      { userId: 'user-ctx-8', email: 'ctx8@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/chunked-transcription-retry-warn')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(500);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'chunked_transcription_chunk_attempt_failed');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected chunked_transcription_chunk_attempt_failed log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-8');
    expect(entry.userEmail).toBe('ctx8@example.com');
  }, 20000);

  it('propagates authenticated context into audio segment cleanup warning logs', async () => {
    jest.doMock('fluent-ffmpeg', () => {
      const ffmpegMock: any = jest.fn(() => {
        const handlers: Record<string, (error?: Error) => void> = {};
        const chain: any = {
          input: () => chain,
          inputOptions: () => chain,
          audioCodec: () => chain,
          on: (event: string, callback: (error?: Error) => void) => {
            handlers[event] = callback;
            return chain;
          },
          save: () => {
            setImmediate(() => handlers.error?.(new Error('ffmpeg combine failed')));
            return chain;
          },
        };
        return chain;
      });
      ffmpegMock.ffprobe = jest.fn();
      return {
        __esModule: true,
        default: ffmpegMock,
      };
    });

    const express = require('express');
    const fs = require('fs');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const { authenticate } = require('../src/middleware/auth');
    const { combineAudioSegments } = require('../src/services/audioProcessor');

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.post('/audio-cleanup-warn', authenticate, async (_req: any, res: any) => {
      try {
        await combineAudioSegments([Buffer.from('seg-a'), Buffer.from('seg-b')]);
        res.status(200).json({ ok: true });
      } catch {
        res.status(500).json({ ok: false });
      }
    });

    const existsSpy = jest
      .spyOn(fs, 'existsSync')
      .mockImplementation(() => { throw new Error('existsSync failed'); });

    const token = jwt.sign(
      { userId: 'user-ctx-9', email: 'ctx9@example.com' },
      process.env.JWT_SECRET,
    );

    try {
      await request(app)
        .post('/audio-cleanup-warn')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(500);
    } finally {
      existsSpy.mockRestore();
    }

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'audio_segments_cleanup_failed');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected audio_segments_cleanup_failed log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-9');
    expect(entry.userEmail).toBe('ctx9@example.com');
  });

  it('propagates request context into unauthenticated auth route validation warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      getUserByEmail: jest.fn(),
      createUser: jest.fn(),
      updateUserSubscription: jest.fn(),
      getUserUsage: jest.fn(),
      getUserById: jest.fn(),
      hasAvailableMinutes: jest.fn(),
      deductMinutes: jest.fn(),
      saveRecording: jest.fn(),
      updateRecordingSummary: jest.fn(),
      getUserRecordings: jest.fn(),
      getRecording: jest.fn(),
      deleteRecording: jest.fn(),
      uploadAudioFile: jest.fn(),
      getSignedAudioUrl: jest.fn(),
    }));

    const express = require('express');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const authRoutes = require('../src/routes/auth').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/auth', authRoutes);

    await request(app)
      .post('/api/auth/register')
      .send({})
      .expect(400);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'auth_register_validation_failed');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected auth_register_validation_failed log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBeUndefined();
    expect(entry.userEmail).toBeUndefined();
  });

  it('propagates authenticated context into audio ask insufficient-minutes warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      hasAvailableMinutes: jest.fn().mockResolvedValue(false),
      deductMinutes: jest.fn(),
      saveRecording: jest.fn(),
      updateRecordingSummary: jest.fn(),
      getUserRecordings: jest.fn(),
      getRecording: jest.fn(),
      deleteRecording: jest.fn(),
      uploadAudioFile: jest.fn(),
      getSignedAudioUrl: jest.fn(),
    }));

    jest.doMock('../src/services/llm', () => ({
      generateSummary: jest.fn(),
      generateCrossMeetingAnswer: jest.fn(),
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const audioRoutes = require('../src/routes/audio').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/audio', audioRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-10', email: 'ctx10@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/api/audio/ask')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'What did we decide?' })
      .expect(403);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'audio_ask_insufficient_minutes');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected audio_ask_insufficient_minutes log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-10');
    expect(entry.userEmail).toBe('ctx10@example.com');
  });

  it('propagates authenticated context into purchases invalid-token warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    jest.doMock('../src/services/googleplay', () => ({
      verifySubscriptionPurchase: jest.fn().mockResolvedValue({
        valid: false,
        purchaseState: 0,
      }),
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const { authenticate } = require('../src/middleware/auth');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', authenticate, purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-11', email: 'ctx11@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/api/purchases/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'android',
        productId: 'recaply_lite_monthly',
        purchaseToken: 'bad-token',
      })
      .expect(400);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'purchase_verify_android_invalid_token');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected purchase_verify_android_invalid_token log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-11');
    expect(entry.userEmail).toBe('ctx11@example.com');
  });

  it('propagates authenticated context into subscription invalid-token warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    jest.doMock('../src/services/googleplay', () => ({
      verifySubscriptionPurchase: jest.fn().mockResolvedValue({
        valid: false,
        purchaseState: 0,
      }),
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const { authenticate } = require('../src/middleware/auth');
    const subscriptionRoutes = require('../src/routes/subscription').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/subscription', authenticate, subscriptionRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-12', email: 'ctx12@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/api/subscription/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: 'recaply_lite_monthly',
        purchaseToken: 'bad-token',
      })
      .expect(400);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'subscription_verify_invalid_token');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected subscription_verify_invalid_token log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-12');
    expect(entry.userEmail).toBe('ctx12@example.com');
  });

  it('propagates request context into unauthenticated google-auth validation warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      getUserByEmail: jest.fn(),
      createUser: jest.fn(),
      updateUserSubscription: jest.fn(),
      getUserUsage: jest.fn(),
      getUserById: jest.fn(),
      hasAvailableMinutes: jest.fn(),
      deductMinutes: jest.fn(),
      saveRecording: jest.fn(),
      updateRecordingSummary: jest.fn(),
      getUserRecordings: jest.fn(),
      getRecording: jest.fn(),
      deleteRecording: jest.fn(),
      uploadAudioFile: jest.fn(),
      getSignedAudioUrl: jest.fn(),
    }));

    const express = require('express');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const authRoutes = require('../src/routes/auth').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/auth', authRoutes);

    await request(app)
      .post('/api/auth/google')
      .send({})
      .expect(400);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'auth_google_validation_failed');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected auth_google_validation_failed log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBeUndefined();
    expect(entry.userEmail).toBeUndefined();
    expect(entry.reason).toBe('missing_id_token');
  });

  it('propagates authenticated context into audio recording access-denied warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      hasAvailableMinutes: jest.fn(),
      deductMinutes: jest.fn(),
      saveRecording: jest.fn(),
      updateRecordingSummary: jest.fn(),
      getUserRecordings: jest.fn(),
      getRecording: jest.fn().mockResolvedValue({
        id: 'recording-ctx-1',
        user_id: 'someone-else',
        filename: 'meeting.m4a',
        transcript: 'text',
      }),
      deleteRecording: jest.fn(),
      uploadAudioFile: jest.fn(),
      getSignedAudioUrl: jest.fn(),
    }));

    jest.doMock('../src/services/llm', () => ({
      generateSummary: jest.fn(),
      generateCrossMeetingAnswer: jest.fn(),
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const audioRoutes = require('../src/routes/audio').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/audio', audioRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-13', email: 'ctx13@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .get('/api/audio/recordings/recording-ctx-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'audio_recording_access_denied');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected audio_recording_access_denied log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-13');
    expect(entry.userEmail).toBe('ctx13@example.com');
    expect(entry.recordingId).toBe('recording-ctx-1');
  });

  it('propagates request context into unauthenticated apple-auth validation warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      getUserByEmail: jest.fn(),
      createUser: jest.fn(),
      updateUserSubscription: jest.fn(),
      getUserUsage: jest.fn(),
      getUserById: jest.fn(),
      hasAvailableMinutes: jest.fn(),
      deductMinutes: jest.fn(),
      saveRecording: jest.fn(),
      updateRecordingSummary: jest.fn(),
      getUserRecordings: jest.fn(),
      getRecording: jest.fn(),
      deleteRecording: jest.fn(),
      uploadAudioFile: jest.fn(),
      getSignedAudioUrl: jest.fn(),
    }));

    const express = require('express');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const authRoutes = require('../src/routes/auth').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/auth', authRoutes);

    await request(app)
      .post('/api/auth/apple')
      .send({})
      .expect(400);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'auth_apple_validation_failed');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected auth_apple_validation_failed log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBeUndefined();
    expect(entry.userEmail).toBeUndefined();
    expect(entry.reason).toBe('missing_identity_token');
  });

  it('propagates authenticated context into audio process validation warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      hasAvailableMinutes: jest.fn(),
      deductMinutes: jest.fn(),
      saveRecording: jest.fn(),
      updateRecordingSummary: jest.fn(),
      getUserRecordings: jest.fn(),
      getRecording: jest.fn(),
      deleteRecording: jest.fn(),
      uploadAudioFile: jest.fn(),
      getSignedAudioUrl: jest.fn(),
    }));

    jest.doMock('../src/services/llm', () => ({
      generateSummary: jest.fn(),
      generateCrossMeetingAnswer: jest.fn(),
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const audioRoutes = require('../src/routes/audio').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/audio', audioRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-14', email: 'ctx14@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/api/audio/process')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'audio_process_validation_failed');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected audio_process_validation_failed log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-14');
    expect(entry.userEmail).toBe('ctx14@example.com');
    expect(entry.reason).toBe('missing_audio_file');
  });

  it('propagates authenticated context into iOS receipt product-mismatch warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    const originalFetch = (global as any).fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        status: 0,
        latest_receipt_info: [
          {
            product_id: 'wrong_product',
            expires_date_ms: String(Date.now() + 60_000),
          },
        ],
      }),
    });

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-15', email: 'ctx15@example.com' },
      process.env.JWT_SECRET,
    );

    try {
      await request(app)
        .post('/api/purchases/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({
          platform: 'ios',
          productId: 'recaply_lite_monthly',
          transactionReceipt: 'receipt-product-mismatch',
        })
        .expect(400);
    } finally {
      (global as any).fetch = originalFetch;
    }

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'purchase_ios_receipt_product_mismatch');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected purchase_ios_receipt_product_mismatch log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-15');
    expect(entry.userEmail).toBe('ctx15@example.com');
    expect(entry.expectedProductId).toBe('recaply_lite_monthly');
  });

  it('propagates authenticated context into iOS receipt-expired warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    const originalFetch = (global as any).fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        status: 0,
        latest_receipt_info: [
          {
            product_id: 'recaply_lite_monthly',
            expires_date_ms: String(Date.now() - 60_000),
          },
        ],
      }),
    });

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-16', email: 'ctx16@example.com' },
      process.env.JWT_SECRET,
    );

    try {
      await request(app)
        .post('/api/purchases/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({
          platform: 'ios',
          productId: 'recaply_lite_monthly',
          transactionReceipt: 'receipt-expired',
        })
        .expect(400);
    } finally {
      (global as any).fetch = originalFetch;
    }

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'purchase_ios_receipt_expired');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected purchase_ios_receipt_expired log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-16');
    expect(entry.userEmail).toBe('ctx16@example.com');
    expect(entry.expectedProductId).toBe('recaply_lite_monthly');
    expect(entry.expiryMs).toEqual(expect.any(Number));
  });

  it('propagates authenticated context into iOS receipt-verification-failed warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    const originalFetch = (global as any).fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        status: 21010,
      }),
    });

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-17', email: 'ctx17@example.com' },
      process.env.JWT_SECRET,
    );

    try {
      await request(app)
        .post('/api/purchases/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({
          platform: 'ios',
          productId: 'recaply_lite_monthly',
          transactionReceipt: 'receipt-verification-failed',
        })
        .expect(400);
    } finally {
      (global as any).fetch = originalFetch;
    }

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'purchase_ios_receipt_verification_failed');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected purchase_ios_receipt_verification_failed log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-17');
    expect(entry.userEmail).toBe('ctx17@example.com');
    expect(entry.expectedProductId).toBe('recaply_lite_monthly');
    expect(entry.appleStatus).toBe(21010);
  });

  it('propagates authenticated context into iOS receipt-canceled warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    const originalFetch = (global as any).fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        status: 0,
        latest_receipt_info: [
          {
            product_id: 'recaply_lite_monthly',
            expires_date_ms: String(Date.now() + 60_000),
            cancellation_date_ms: String(Date.now()),
          },
        ],
      }),
    });

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-18', email: 'ctx18@example.com' },
      process.env.JWT_SECRET,
    );

    try {
      await request(app)
        .post('/api/purchases/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({
          platform: 'ios',
          productId: 'recaply_lite_monthly',
          transactionReceipt: 'receipt-canceled',
        })
        .expect(400);
    } finally {
      (global as any).fetch = originalFetch;
    }

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'purchase_ios_receipt_canceled');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected purchase_ios_receipt_canceled log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-18');
    expect(entry.userEmail).toBe('ctx18@example.com');
    expect(entry.expectedProductId).toBe('recaply_lite_monthly');
  });

  it('propagates authenticated context into purchases missing-required-fields validation warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-19', email: 'ctx19@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/api/purchases/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find(
      (item) =>
        item.message === 'purchase_verify_validation_failed' &&
        item.reason === 'missing_required_fields',
    );

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected purchase_verify_validation_failed missing_required_fields log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-19');
    expect(entry.userEmail).toBe('ctx19@example.com');
    expect(entry.hasProductId).toBe(false);
    expect(entry.hasPlatform).toBe(false);
  });

  it('propagates authenticated context into purchases invalid-product validation warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-20', email: 'ctx20@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/api/purchases/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'ios',
        productId: 'invalid_product_id',
      })
      .expect(400);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find(
      (item) =>
        item.message === 'purchase_verify_validation_failed' &&
        item.reason === 'invalid_product_id',
    );

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected purchase_verify_validation_failed invalid_product_id log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-20');
    expect(entry.userEmail).toBe('ctx20@example.com');
    expect(entry.productId).toBe('invalid_product_id');
  });

  it('propagates authenticated context into purchases missing-ios-receipt validation warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-21', email: 'ctx21@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/api/purchases/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'ios',
        productId: 'recaply_lite_monthly',
      })
      .expect(400);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find(
      (item) =>
        item.message === 'purchase_verify_validation_failed' &&
        item.reason === 'missing_ios_transaction_receipt',
    );

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected purchase_verify_validation_failed missing_ios_transaction_receipt log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-21');
    expect(entry.userEmail).toBe('ctx21@example.com');
  });

  it('propagates authenticated context into purchases missing-android-token validation warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-22', email: 'ctx22@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/api/purchases/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'android',
        productId: 'recaply_lite_monthly',
      })
      .expect(400);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find(
      (item) =>
        item.message === 'purchase_verify_validation_failed' &&
        item.reason === 'missing_android_purchase_token',
    );

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected purchase_verify_validation_failed missing_android_purchase_token log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-22');
    expect(entry.userEmail).toBe('ctx22@example.com');
  });

  it('propagates authenticated context into purchases unsupported-platform validation warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-23', email: 'ctx23@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/api/purchases/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'web',
        productId: 'recaply_lite_monthly',
      })
      .expect(400);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find(
      (item) =>
        item.message === 'purchase_verify_validation_failed' &&
        item.reason === 'unsupported_platform',
    );

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected purchase_verify_validation_failed unsupported_platform log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-23');
    expect(entry.userEmail).toBe('ctx23@example.com');
    expect(entry.platform).toBe('web');
  });

  it('propagates request context into purchases unauthorized warnings when token lacks userId', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { email: 'ctx24@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/api/purchases/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'ios',
        productId: 'recaply_lite_monthly',
        transactionReceipt: 'receipt-unused',
      })
      .expect(401);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'purchase_verify_unauthorized');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected purchase_verify_unauthorized log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBeUndefined();
    expect(entry.userEmail).toBe('ctx24@example.com');
  });

  it('propagates authenticated context into purchases iOS invalid-receipt warnings', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    const originalFetch = (global as any).fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        status: 21010,
      }),
    });

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-25', email: 'ctx25@example.com' },
      process.env.JWT_SECRET,
    );

    try {
      await request(app)
        .post('/api/purchases/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({
          platform: 'ios',
          productId: 'recaply_lite_monthly',
          transactionReceipt: 'receipt-invalid',
        })
        .expect(400);
    } finally {
      (global as any).fetch = originalFetch;
    }

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'purchase_verify_receipt_invalid');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected purchase_verify_receipt_invalid log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-25');
    expect(entry.userEmail).toBe('ctx25@example.com');
    expect(entry.platform).toBe('ios');
    expect(entry.productId).toBe('recaply_lite_monthly');
  });

  it('propagates authenticated context into purchases requested info events', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn(),
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-26', email: 'ctx26@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/api/purchases/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'ios',
        productId: 'invalid_product_id',
      })
      .expect(400);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const entry = entries.find((item) => item.message === 'purchase_verify_requested');

    expect(entry).toBeTruthy();
    if (!entry) {
      throw new Error('Expected purchase_verify_requested log entry');
    }
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.userId).toBe('user-ctx-26');
    expect(entry.userEmail).toBe('ctx26@example.com');
    expect(entry.platform).toBe('ios');
    expect(entry.productId).toBe('invalid_product_id');
    expect(entry.hasPurchaseToken).toBe(false);
    expect(entry.hasTransactionReceipt).toBe(false);
  });

  it('propagates authenticated context into purchases subscription update info events', async () => {
    const mockUpdateUserSubscription = jest.fn().mockResolvedValue(undefined);
    const mockVerifySubscriptionPurchase = jest.fn().mockResolvedValue({
      valid: true,
      purchaseState: 1,
    });

    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: mockUpdateUserSubscription,
    }));

    jest.doMock('../src/services/googleplay', () => ({
      verifySubscriptionPurchase: mockVerifySubscriptionPurchase,
    }));

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-27', email: 'ctx27@example.com' },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/api/purchases/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'android',
        productId: 'recaply_lite_monthly',
        purchaseToken: 'valid-token',
      })
      .expect(200);

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const startEntry = entries.find((item) => item.message === 'purchase_verify_subscription_update_started');
    const completedEntry = entries.find((item) => item.message === 'purchase_verify_completed');

    expect(startEntry).toBeTruthy();
    if (!startEntry) {
      throw new Error('Expected purchase_verify_subscription_update_started log entry');
    }
    expect(startEntry.requestId).toEqual(expect.any(String));
    expect(startEntry.userId).toBe('user-ctx-27');
    expect(startEntry.userEmail).toBe('ctx27@example.com');
    expect(startEntry.tier).toBe('lite');
    expect(startEntry.minutesLimit).toBe(300);

    expect(completedEntry).toBeTruthy();
    if (!completedEntry) {
      throw new Error('Expected purchase_verify_completed log entry');
    }
    expect(completedEntry.requestId).toEqual(expect.any(String));
    expect(completedEntry.userId).toBe('user-ctx-27');
    expect(completedEntry.userEmail).toBe('ctx27@example.com');
    expect(completedEntry.tier).toBe('lite');
    expect(completedEntry.minutesLimit).toBe(300);
  });

  it('propagates authenticated context into purchases iOS sandbox-retry info events', async () => {
    jest.doMock('../src/services/supabase', () => ({
      updateUserSubscription: jest.fn().mockResolvedValue(undefined),
    }));

    const originalFetch = (global as any).fetch;
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce({
        json: jest.fn().mockResolvedValue({ status: 21007 }),
      })
      .mockResolvedValueOnce({
        json: jest.fn().mockResolvedValue({
          status: 0,
          latest_receipt_info: [
            {
              product_id: 'recaply_lite_monthly',
              expires_date_ms: String(Date.now() + 60_000),
            },
          ],
        }),
      });

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const { requestContext } = require('../src/middleware/requestContext');
    const purchasesRoutes = require('../src/routes/purchases').default;

    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use('/api/purchases', purchasesRoutes);

    const token = jwt.sign(
      { userId: 'user-ctx-28', email: 'ctx28@example.com' },
      process.env.JWT_SECRET,
    );

    try {
      await request(app)
        .post('/api/purchases/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({
          platform: 'ios',
          productId: 'recaply_lite_monthly',
          transactionReceipt: 'receipt-sandbox-retry',
        })
        .expect(200);
    } finally {
      (global as any).fetch = originalFetch;
    }

    const stdoutLines = stdoutWriteSpy.mock.calls.map((args) => String(args[0]).trim());
    const entries = parseEntries(stdoutLines);
    const sandboxRetryEntry = entries.find((item) => item.message === 'purchase_ios_sandbox_retry');
    const receiptVerifiedEntry = entries.find((item) => item.message === 'purchase_ios_receipt_verified');

    expect(sandboxRetryEntry).toBeTruthy();
    if (!sandboxRetryEntry) {
      throw new Error('Expected purchase_ios_sandbox_retry log entry');
    }
    expect(sandboxRetryEntry.requestId).toEqual(expect.any(String));
    expect(sandboxRetryEntry.userId).toBe('user-ctx-28');
    expect(sandboxRetryEntry.userEmail).toBe('ctx28@example.com');
    expect(sandboxRetryEntry.expectedProductId).toBe('recaply_lite_monthly');

    expect(receiptVerifiedEntry).toBeTruthy();
    if (!receiptVerifiedEntry) {
      throw new Error('Expected purchase_ios_receipt_verified log entry');
    }
    expect(receiptVerifiedEntry.requestId).toEqual(expect.any(String));
    expect(receiptVerifiedEntry.userId).toBe('user-ctx-28');
    expect(receiptVerifiedEntry.userEmail).toBe('ctx28@example.com');
    expect(receiptVerifiedEntry.expectedProductId).toBe('recaply_lite_monthly');
  });
});
