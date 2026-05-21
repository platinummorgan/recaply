import {
  API_BASE_URL,
  GROWTH_ROLLUP_MAINTENANCE_URL,
  GROWTH_ROLLUP_MAINTENANCE_RUNS_URL,
  METRICS_URL,
  apiUrl,
  growthRollupMaintenanceUrl,
  growthRollupMaintenanceRunsUrl,
  metricsUrl,
} from './api';

describe('api config', () => {
  it('builds endpoint URLs from the configured base', () => {
    expect(API_BASE_URL.endsWith('/api')).toBe(true);
    expect(apiUrl('/audio/upload')).toBe(`${API_BASE_URL}/audio/upload`);
    expect(apiUrl('auth/login')).toBe(`${API_BASE_URL}/auth/login`);
    expect(METRICS_URL.endsWith('/metrics')).toBe(true);
    expect(metricsUrl()).toBe(METRICS_URL);
    expect(metricsUrl(30)).toBe(`${METRICS_URL}?windowDays=30`);
    expect(metricsUrl(0)).toBe(`${METRICS_URL}?windowDays=1`);
    expect(metricsUrl(365)).toBe(`${METRICS_URL}?windowDays=30`);
    expect(GROWTH_ROLLUP_MAINTENANCE_URL.endsWith('/metrics/growth-rollups/maintenance')).toBe(true);
    expect(growthRollupMaintenanceUrl()).toBe(GROWTH_ROLLUP_MAINTENANCE_URL);
    expect(GROWTH_ROLLUP_MAINTENANCE_RUNS_URL.endsWith('/metrics/growth-rollups/maintenance-runs')).toBe(true);
    expect(growthRollupMaintenanceRunsUrl()).toBe(GROWTH_ROLLUP_MAINTENANCE_RUNS_URL);
    expect(growthRollupMaintenanceRunsUrl(0)).toBe(`${GROWTH_ROLLUP_MAINTENANCE_RUNS_URL}?limit=1`);
    expect(growthRollupMaintenanceRunsUrl(500)).toBe(`${GROWTH_ROLLUP_MAINTENANCE_RUNS_URL}?limit=100`);
  });
});
