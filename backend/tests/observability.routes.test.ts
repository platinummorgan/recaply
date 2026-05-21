import request from 'supertest';
import app from '../src/server';

describe('Observability Routes', () => {
  afterEach(() => {
    delete process.env.METRICS_API_KEY;
  });

  it('returns health status with request id', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.requestId).toBeTruthy();
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
  });

  it('returns 403 for /metrics when API key is configured but missing', async () => {
    process.env.METRICS_API_KEY = 'secret-key';

    const response = await request(app).get('/metrics');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
  });

  it('returns metrics snapshot when key is provided', async () => {
    process.env.METRICS_API_KEY = 'secret-key';

    const response = await request(app)
      .get('/metrics?windowDays=30')
      .set('x-metrics-key', 'secret-key');

    expect(response.status).toBe(200);
    expect(response.body.service).toBe('recaply-backend');
    expect(response.body.requests).toBeDefined();
    expect(response.body.latencyMs).toBeDefined();
    expect(response.body.errors).toBeDefined();
    expect(response.body.growthRollups).toBeDefined();
    expect(response.body.growthRollups.windowDays).toBe(30);
    expect(response.body.growthRollups.available).toBe(false);
    expect(response.body.growthRollups.paywall.bySource).toEqual({});
    expect(response.body.growthRollups.paywall.byVariant).toEqual({});
    expect(response.body.growthRollups.paywall.topEventVariantPairs).toEqual([]);
    expect(response.body.growthRollups.translation.bySource).toEqual({});
    expect(response.body.growthRollups.translation.byLanguage).toEqual({});
    expect(response.body.growthRollups.translation.topEventSourcePairs).toEqual([]);
    expect(response.body.activation).toBeDefined();
    expect(response.body.activation.total).toBeGreaterThanOrEqual(0);
    expect(response.body.activation.byEvent).toBeDefined();
    expect(response.body.activation.bySource).toBeDefined();
  });

  it('returns 403 for growth rollup maintenance when API key is configured but missing', async () => {
    process.env.METRICS_API_KEY = 'secret-key';

    const response = await request(app)
      .post('/metrics/growth-rollups/maintenance')
      .send({
        dryRun: true,
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
  });

  it('returns maintenance summary when key is provided', async () => {
    process.env.METRICS_API_KEY = 'secret-key';

    const response = await request(app)
      .post('/metrics/growth-rollups/maintenance')
      .set('x-metrics-key', 'secret-key')
      .send({
        dryRun: true,
        maxBackfillDays: 30,
        includeCompaction: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.persistenceEnabled).toBe(false);
    expect(response.body.available).toBe(false);
    expect(response.body.dryRun).toBe(true);
    expect(response.body.maxBackfillDays).toBe(30);
    expect(response.body.backfill).toBeDefined();
    expect(response.body.compaction).toBeDefined();
  });

  it('returns 403 for maintenance history when API key is configured but missing', async () => {
    process.env.METRICS_API_KEY = 'secret-key';

    const response = await request(app)
      .get('/metrics/growth-rollups/maintenance-runs?limit=10');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
  });

  it('returns maintenance history snapshot when key is provided', async () => {
    process.env.METRICS_API_KEY = 'secret-key';

    const response = await request(app)
      .get('/metrics/growth-rollups/maintenance-runs?limit=10')
      .set('x-metrics-key', 'secret-key');

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(false);
    expect(response.body.persistenceEnabled).toBe(false);
    expect(Array.isArray(response.body.runs)).toBe(true);
    expect(response.body.diagnostics).toBeDefined();
    expect(response.body.diagnostics.totalRuns).toBe(0);
  });
});
