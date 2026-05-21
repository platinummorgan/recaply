import { API_BASE_URL as ENV_API_BASE_URL } from '@env';

const FALLBACK_API_ROOT = 'https://web-production-abd11.up.railway.app';

function normalizeApiRoot(rawUrl?: string): string {
  const trimmed = (rawUrl || '').trim();
  const withFallback = trimmed || FALLBACK_API_ROOT;
  const withoutTrailingSlash = withFallback.replace(/\/+$/, '');

  if (withoutTrailingSlash.endsWith('/api')) {
    return withoutTrailingSlash.slice(0, -4);
  }

  return withoutTrailingSlash;
}

export const API_ROOT_URL = normalizeApiRoot(ENV_API_BASE_URL);
export const API_BASE_URL = `${API_ROOT_URL}/api`;
export const METRICS_URL = `${API_ROOT_URL}/metrics`;
export const GROWTH_ROLLUP_MAINTENANCE_URL = `${API_ROOT_URL}/metrics/growth-rollups/maintenance`;
export const GROWTH_ROLLUP_MAINTENANCE_RUNS_URL = `${API_ROOT_URL}/metrics/growth-rollups/maintenance-runs`;

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export function metricsUrl(windowDays?: number): string {
  if (!Number.isFinite(windowDays)) {
    return METRICS_URL;
  }

  const normalizedWindowDays = Math.min(30, Math.max(1, Math.floor(windowDays as number)));
  return `${METRICS_URL}?windowDays=${normalizedWindowDays}`;
}

export function growthRollupMaintenanceUrl(): string {
  return GROWTH_ROLLUP_MAINTENANCE_URL;
}

export function growthRollupMaintenanceRunsUrl(limit?: number): string {
  if (!Number.isFinite(limit)) {
    return GROWTH_ROLLUP_MAINTENANCE_RUNS_URL;
  }

  const normalizedLimit = Math.min(100, Math.max(1, Math.floor(limit as number)));
  return `${GROWTH_ROLLUP_MAINTENANCE_RUNS_URL}?limit=${normalizedLimit}`;
}
