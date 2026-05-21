import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockUpdateUserSubscription = jest.fn();
const mockVerifySubscriptionPurchase = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../src/services/supabase', () => ({
  updateUserSubscription: (...args: unknown[]) => mockUpdateUserSubscription(...args),
}));

jest.mock('../src/services/googleplay', () => ({
  verifySubscriptionPurchase: (...args: unknown[]) => mockVerifySubscriptionPurchase(...args),
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

describe('Purchases Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when Android purchase token is missing', async () => {
    const token = createAuthToken('user-1');

    const response = await request(app)
      .post('/api/purchases/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'android',
        productId: 'recaply_lite_monthly',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Missing Android purchase token');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'purchase_verify_validation_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-1',
        reason: 'missing_android_purchase_token',
      }),
    );
  });

  it('returns 400 when Android purchase verification reports invalid token', async () => {
    mockVerifySubscriptionPurchase.mockResolvedValue({
      valid: false,
      purchaseState: 0,
    });

    const token = createAuthToken('user-1');

    const response = await request(app)
      .post('/api/purchases/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'android',
        productId: 'recaply_lite_monthly',
        purchaseToken: 'bad-token',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid purchase token');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'purchase_verify_android_invalid_token',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-1',
        productId: 'recaply_lite_monthly',
        purchaseState: 0,
      }),
    );
  });

  it('updates subscription when Android purchase verification succeeds', async () => {
    mockVerifySubscriptionPurchase.mockResolvedValue({
      valid: true,
      purchaseState: 1,
      orderId: 'GPA.1234-5678',
    });

    const token = createAuthToken('user-1');

    const response = await request(app)
      .post('/api/purchases/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'android',
        productId: 'recaply_lite_monthly',
        purchaseToken: 'purchase-token-123',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.tier).toBe('lite');
    expect(response.body.minutesLimit).toBe(300);
    expect(mockUpdateUserSubscription).toHaveBeenCalledWith('user-1', 'lite', 300);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'purchase_verify_requested',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-1',
        platform: 'android',
        productId: 'recaply_lite_monthly',
      }),
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'purchase_verify_completed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-1',
        tier: 'lite',
        minutesLimit: 300,
      }),
    );
  });
});
