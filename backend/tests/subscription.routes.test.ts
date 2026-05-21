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

describe('Subscription Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 and logs validation warning when verify request fields are missing', async () => {
    const token = createAuthToken('user-1');

    const response = await request(app)
      .post('/api/subscription/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'recaply_lite_monthly' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Missing purchaseToken or productId');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'subscription_verify_validation_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-1',
        reason: 'missing_purchase_token_or_product_id',
        hasPurchaseToken: false,
        hasProductId: true,
      }),
    );
  });

  it('returns 400 and logs validation warning for invalid verify product id', async () => {
    const token = createAuthToken('user-1');

    const response = await request(app)
      .post('/api/subscription/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'invalid_plan', purchaseToken: 'purchase-token-123' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid product ID');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'subscription_verify_validation_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-1',
        reason: 'invalid_product_id',
        productId: 'invalid_plan',
      }),
    );
  });

  it('returns 400 and logs warning when verify token is invalid', async () => {
    mockVerifySubscriptionPurchase.mockResolvedValue({
      valid: false,
      purchaseState: 0,
    });

    const token = createAuthToken('user-1');

    const response = await request(app)
      .post('/api/subscription/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'recaply_lite_monthly', purchaseToken: 'bad-token' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid purchase token');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'subscription_verify_invalid_token',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-1',
        productId: 'recaply_lite_monthly',
        purchaseState: 0,
      }),
    );
  });

  it('updates subscription and logs completion when verify succeeds', async () => {
    mockVerifySubscriptionPurchase.mockResolvedValue({
      valid: true,
      purchaseState: 1,
      orderId: 'GPA.1234-5678',
    });

    const token = createAuthToken('user-1');

    const response = await request(app)
      .post('/api/subscription/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'recaply_lite_monthly', purchaseToken: 'purchase-token-123' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.plan).toBe('lite');
    expect(response.body.minutes).toBe(300);
    expect(mockUpdateUserSubscription).toHaveBeenCalledWith('user-1', 'lite', 300);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'subscription_verify_completed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-1',
        tier: 'lite',
        minutesLimit: 300,
        orderId: 'GPA.1234-5678',
      }),
    );
  });

  it('returns 400 and logs validation warning when status request fields are missing', async () => {
    const token = createAuthToken('user-1');

    const response = await request(app)
      .post('/api/subscription/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'recaply_lite_monthly' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Missing purchaseToken or productId');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'subscription_status_validation_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-1',
        reason: 'missing_purchase_token_or_product_id',
        hasPurchaseToken: false,
        hasProductId: true,
      }),
    );
  });

  it('returns status response and logs completion when status check succeeds', async () => {
    mockVerifySubscriptionPurchase.mockResolvedValue({
      valid: true,
      purchaseState: 1,
      orderId: 'GPA.1234-5678',
    });

    const token = createAuthToken('user-1');

    const response = await request(app)
      .post('/api/subscription/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'recaply_lite_monthly', purchaseToken: 'purchase-token-123' });

    expect(response.status).toBe(200);
    expect(response.body.active).toBe(true);
    expect(response.body.purchaseState).toBe(1);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'subscription_status_completed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-1',
        productId: 'recaply_lite_monthly',
        active: true,
        purchaseState: 1,
      }),
    );
  });

  it('returns 500 and logs error when status check throws', async () => {
    mockVerifySubscriptionPurchase.mockRejectedValue(new Error('status service unavailable'));

    const token = createAuthToken('user-1');

    const response = await request(app)
      .post('/api/subscription/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: 'recaply_lite_monthly', purchaseToken: 'purchase-token-123' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to check subscription status');
    expect(mockLoggerError).toHaveBeenCalledWith(
      'subscription_status_failed',
      expect.objectContaining({
        requestId: expect.any(String),
        userId: 'user-1',
        errorMessage: 'status service unavailable',
      }),
    );
  });
});
