import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import request from 'supertest';

const mockGetUserByEmail = jest.fn();
const mockCreateUser = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
let verifyIdTokenSpy: jest.SpyInstance;

jest.mock('../src/services/supabase', () => ({
  getUserByEmail: (...args: unknown[]) => mockGetUserByEmail(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
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

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyIdTokenSpy = jest.spyOn(OAuth2Client.prototype as any, 'verifyIdToken');
  });

  it('returns 400 when registering with missing fields', async () => {
    const response = await request(app).post('/api/auth/register').send({ email: '' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Email and password required');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'auth_register_validation_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        hasEmail: false,
        hasPassword: false,
      }),
    );
  });

  it('returns 400 when registering with an existing email', async () => {
    mockGetUserByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'existing@example.com',
    });

    const response = await request(app).post('/api/auth/register').send({
      email: 'existing@example.com',
      password: 'secret123',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Email already registered');
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('logs in successfully with valid credentials', async () => {
    const passwordHash = await bcrypt.hash('secret123', 10);

    mockGetUserByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      password_hash: passwordHash,
      subscription_tier: 'free',
      minutes_used: 0,
      minutes_limit: 30,
    });

    const response = await request(app).post('/api/auth/login').send({
      email: 'user@example.com',
      password: 'secret123',
    });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.email).toBe('user@example.com');
    expect(response.body.user.subscriptionTier).toBe('free');
  });

  it('returns 400 when Google sign-in token is missing', async () => {
    const response = await request(app).post('/api/auth/google').send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Google ID token required');
    expect(verifyIdTokenSpy).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'auth_google_request_received',
      expect.objectContaining({
        requestId: expect.any(String),
        hasIdToken: false,
      }),
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'auth_google_validation_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        reason: 'missing_id_token',
      }),
    );
  });

  it('returns 401 when Google token payload has no email', async () => {
    verifyIdTokenSpy.mockResolvedValue({
      getPayload: () => ({ sub: 'google-user-1' }),
    });

    const response = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'google-id-token' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid Google token');
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('returns 400 when Apple identity token is missing', async () => {
    const response = await request(app).post('/api/auth/apple').send({
      user: 'apple-user-123',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Apple identity token required');
  });

  it('returns 400 when Apple request has neither email nor user identifier', async () => {
    const response = await request(app).post('/api/auth/apple').send({
      identityToken: 'apple-identity-token',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Apple user identifier or email required');
    expect(mockGetUserByEmail).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'auth_apple_validation_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        reason: 'missing_email_and_user',
      }),
    );
  });

  it('creates Apple user with private relay fallback when email is unavailable', async () => {
    const fallbackEmail = 'apple-user-123@privaterelay.appleid.com';

    mockGetUserByEmail.mockResolvedValueOnce(null);
    mockCreateUser.mockResolvedValueOnce({
      id: 'user-apple-1',
      email: fallbackEmail,
      subscription_tier: 'free',
      minutes_used: 0,
      minutes_limit: 30,
    });

    const response = await request(app).post('/api/auth/apple').send({
      identityToken: 'apple-identity-token',
      user: 'apple-user-123',
    });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(fallbackEmail);
    expect(mockGetUserByEmail).toHaveBeenCalledWith(fallbackEmail);
    expect(mockCreateUser).toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'auth_apple_request_received',
      expect.objectContaining({
        requestId: expect.any(String),
        hasIdentityToken: true,
        hasAppleUser: true,
        hasEmail: false,
      }),
    );
  });
});
