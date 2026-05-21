import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/server';

function createAuthToken(userId: string, email = 'translation-test@example.com') {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET || 'test-jwt-secret');
}

describe('User Translation Events Route', () => {
  afterEach(() => {
    delete process.env.METRICS_API_KEY;
  });

  it('returns 401 when auth token is missing', async () => {
    const response = await request(app).post('/api/user/translation-events').send({
      eventName: 'translation_action_started',
      source: 'transcript_translate',
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('No token provided');
  });

  it('returns 400 when eventName is missing', async () => {
    const token = createAuthToken('user-translation-1');

    const response = await request(app)
      .post('/api/user/translation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source: 'transcript_translate',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('eventName is required');
  });

  it('returns 400 for unsupported eventName', async () => {
    const token = createAuthToken('user-translation-2');

    const response = await request(app)
      .post('/api/user/translation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'unsupported_translation_event',
        source: 'transcript_translate',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Unsupported translation event');
  });

  it('tracks translation events and exposes counters in /metrics', async () => {
    const token = createAuthToken('user-translation-3');

    const startedResponse = await request(app)
      .post('/api/user/translation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'translation_action_started',
        source: 'transcript_translate',
        targetLanguage: 'Spanish',
        platform: 'android',
      });

    expect(startedResponse.status).toBe(200);
    expect(startedResponse.body.success).toBe(true);
    expect(startedResponse.body.eventName).toBe('translation_action_started');
    expect(startedResponse.body.source).toBe('transcript_translate');

    const completedResponse = await request(app)
      .post('/api/user/translation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'translation_content_ready',
        source: 'transcript_translate',
        targetLanguage: 'Spanish',
        outcome: 'fresh',
        platform: 'android',
      });

    expect(completedResponse.status).toBe(200);
    expect(completedResponse.body.success).toBe(true);

    const metricsResponse = await request(app).get('/metrics');

    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.body.translation).toBeDefined();
    expect(metricsResponse.body.translation.total).toBeGreaterThan(0);
    expect(metricsResponse.body.translation.byEvent.translation_action_started).toBeGreaterThan(0);
    expect(metricsResponse.body.translation.byEvent.translation_content_ready).toBeGreaterThan(0);
    expect(metricsResponse.body.translation.bySource.transcript_translate).toBeGreaterThan(0);
    expect(metricsResponse.body.translation.byLanguage.spanish).toBeGreaterThan(0);
    expect(metricsResponse.body.translation.byOutcome.fresh).toBeGreaterThan(0);
    expect(
      metricsResponse.body.translation.byEventSource['translation_content_ready|transcript_translate'],
    ).toBeGreaterThan(0);
    expect(Object.keys(metricsResponse.body.translation.byHour || {}).length).toBeGreaterThan(0);
  });

  it('accepts translation insights CTA events', async () => {
    const token = createAuthToken('user-translation-4');

    const response = await request(app)
      .post('/api/user/translation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'translation_insights_cta_tapped',
        source: 'insights_translation_cta_global',
        outcome: 'winner',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.eventName).toBe('translation_insights_cta_tapped');
  });
});
