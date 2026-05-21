import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/server';

function createAuthToken(userId: string, email = 'paywall-test@example.com') {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET || 'test-jwt-secret');
}

describe('User Paywall Events Route', () => {
  afterEach(() => {
    delete process.env.METRICS_API_KEY;
  });

  it('returns 401 when auth token is missing', async () => {
    const response = await request(app).post('/api/user/paywall-events').send({
      eventName: 'paywall_viewed',
      variant: 'value',
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('No token provided');
  });

  it('returns 400 when eventName is missing', async () => {
    const token = createAuthToken('user-paywall-1');

    const response = await request(app)
      .post('/api/user/paywall-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variant: 'value',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('eventName is required');
  });

  it('returns 400 for unsupported eventName', async () => {
    const token = createAuthToken('user-paywall-2');

    const response = await request(app)
      .post('/api/user/paywall-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'not_supported',
        variant: 'value',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Unsupported paywall event');
  });

  it('tracks paywall event and exposes counters in /metrics', async () => {
    const token = createAuthToken('user-paywall-3');

    const eventResponse = await request(app)
      .post('/api/user/paywall-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'paywall_plan_cta_tapped',
        variant: 'roi',
        tier: 'pro',
        source: 'subscription_screen',
        outcome: 'intent',
        platform: 'android',
      });

    expect(eventResponse.status).toBe(200);
    expect(eventResponse.body.success).toBe(true);
    expect(eventResponse.body.eventName).toBe('paywall_plan_cta_tapped');
    expect(eventResponse.body.variant).toBe('roi');

    const metricsResponse = await request(app).get('/metrics');

    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.body.paywall).toBeDefined();
    expect(metricsResponse.body.paywall.total).toBeGreaterThan(0);
    expect(metricsResponse.body.paywall.byEvent.paywall_plan_cta_tapped).toBeGreaterThan(0);
    expect(metricsResponse.body.paywall.byVariant.roi).toBeGreaterThan(0);
    expect(metricsResponse.body.paywall.byTier.pro).toBeGreaterThan(0);
    expect(metricsResponse.body.paywall.bySource.subscription_screen).toBeGreaterThan(0);
    expect(metricsResponse.body.paywall.byEventVariant['paywall_plan_cta_tapped|roi']).toBeGreaterThan(0);
  });
});
