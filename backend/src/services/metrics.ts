import { getGrowthRollupSnapshot } from './supabase';

interface DurationStats {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

interface RequestMetric {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}

interface PaywallEventMetric {
  eventName: string;
  variant: string;
  tier?: string;
  source?: string;
  outcome?: string;
}

interface TranslationEventMetric {
  eventName: string;
  source?: string;
  targetLanguage?: string;
  outcome?: string;
  occurredAt?: string;
}

interface ActivationEventMetric {
  eventName: string;
  source?: string;
  outcome?: string;
  step?: string;
  occurredAt?: string;
}

const startedAtMs = Date.now();

const durationStats: DurationStats = {
  count: 0,
  totalMs: 0,
  minMs: Number.POSITIVE_INFINITY,
  maxMs: 0,
};

const routeCounters = new Map<string, number>();
const statusClassCounters = new Map<string, number>([
  ['2xx', 0],
  ['3xx', 0],
  ['4xx', 0],
  ['5xx', 0],
]);
const paywallEventCounters = new Map<string, number>();
const paywallVariantCounters = new Map<string, number>();
const paywallTierCounters = new Map<string, number>();
const paywallEventVariantCounters = new Map<string, number>();
const paywallOutcomeCounters = new Map<string, number>();
const paywallSourceCounters = new Map<string, number>();
const translationEventCounters = new Map<string, number>();
const translationSourceCounters = new Map<string, number>();
const translationLanguageCounters = new Map<string, number>();
const translationOutcomeCounters = new Map<string, number>();
const translationEventSourceCounters = new Map<string, number>();
const translationHourCounters = new Map<string, number>();
const activationEventCounters = new Map<string, number>();
const activationSourceCounters = new Map<string, number>();
const activationOutcomeCounters = new Map<string, number>();
const activationStepCounters = new Map<string, number>();
const activationEventSourceCounters = new Map<string, number>();
const activationHourCounters = new Map<string, number>();

let requestsTotal = 0;
let errorsTotal = 0;
let rateLimitedTotal = 0;
let paywallEventsTotal = 0;
let translationEventsTotal = 0;
let activationEventsTotal = 0;

function normalizePath(path: string): string {
  const noQuery = path.split('?')[0] || '/';
  const withUuidRedacted = noQuery.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi,
    '/:id'
  );
  return withUuidRedacted.replace(/\/\d+(?=\/|$)/g, '/:id');
}

export function observeRequest(metric: RequestMetric): void {
  requestsTotal += 1;

  durationStats.count += 1;
  durationStats.totalMs += metric.durationMs;
  durationStats.minMs = Math.min(durationStats.minMs, metric.durationMs);
  durationStats.maxMs = Math.max(durationStats.maxMs, metric.durationMs);

  const routeKey = `${metric.method} ${normalizePath(metric.path)}`;
  routeCounters.set(routeKey, (routeCounters.get(routeKey) || 0) + 1);

  const statusClass = `${Math.floor(metric.statusCode / 100)}xx`;
  statusClassCounters.set(statusClass, (statusClassCounters.get(statusClass) || 0) + 1);
}

export function incrementErrors(): void {
  errorsTotal += 1;
}

export function incrementRateLimited(): void {
  rateLimitedTotal += 1;
}

function incrementCounter(counter: Map<string, number>, key: string): void {
  if (!key) {
    return;
  }
  counter.set(key, (counter.get(key) || 0) + 1);
}

function topCounterEntries(counter: Map<string, number>, limit = 20): Array<{ key: string; count: number }> {
  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function getUtcHourBucket(rawTimestamp?: string): string {
  const parsed = rawTimestamp ? new Date(rawTimestamp) : new Date();
  const timestamp = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return `${timestamp.toISOString().slice(0, 13)}:00:00Z`;
}

export function observePaywallEvent(metric: PaywallEventMetric): void {
  const eventName = String(metric.eventName || '').trim();
  const variant = String(metric.variant || '').trim().toLowerCase() || 'unknown';
  const tier = String(metric.tier || '').trim().toLowerCase() || '';
  const source = String(metric.source || '').trim().toLowerCase() || '';
  const outcome = String(metric.outcome || '').trim().toLowerCase() || '';

  if (!eventName) {
    return;
  }

  paywallEventsTotal += 1;
  incrementCounter(paywallEventCounters, eventName);
  incrementCounter(paywallVariantCounters, variant);
  incrementCounter(paywallEventVariantCounters, `${eventName}|${variant}`);
  incrementCounter(paywallTierCounters, tier);
  incrementCounter(paywallOutcomeCounters, outcome);
  incrementCounter(paywallSourceCounters, source);
}

export function observeTranslationEvent(metric: TranslationEventMetric): void {
  const eventName = String(metric.eventName || '').trim();
  const source = String(metric.source || '').trim().toLowerCase() || 'unknown';
  const targetLanguage = String(metric.targetLanguage || '').trim().toLowerCase();
  const outcome = String(metric.outcome || '').trim().toLowerCase();
  const hourBucket = getUtcHourBucket(metric.occurredAt);

  if (!eventName) {
    return;
  }

  translationEventsTotal += 1;
  incrementCounter(translationEventCounters, eventName);
  incrementCounter(translationSourceCounters, source);
  incrementCounter(translationLanguageCounters, targetLanguage);
  incrementCounter(translationOutcomeCounters, outcome);
  incrementCounter(translationEventSourceCounters, `${eventName}|${source}`);
  incrementCounter(translationHourCounters, hourBucket);
}

export function observeActivationEvent(metric: ActivationEventMetric): void {
  const eventName = String(metric.eventName || '').trim();
  const source = String(metric.source || '').trim().toLowerCase() || 'unknown';
  const outcome = String(metric.outcome || '').trim().toLowerCase();
  const step = String(metric.step || '').trim().toLowerCase();
  const hourBucket = getUtcHourBucket(metric.occurredAt);

  if (!eventName) {
    return;
  }

  activationEventsTotal += 1;
  incrementCounter(activationEventCounters, eventName);
  incrementCounter(activationSourceCounters, source);
  incrementCounter(activationOutcomeCounters, outcome);
  incrementCounter(activationStepCounters, step);
  incrementCounter(activationEventSourceCounters, `${eventName}|${source}`);
  incrementCounter(activationHourCounters, hourBucket);
}

export async function getMetricsSnapshot(windowDays: number = 7) {
  const averageMs = durationStats.count > 0 ? durationStats.totalMs / durationStats.count : 0;
  const growthRollups = await getGrowthRollupSnapshot(windowDays);

  return {
    service: 'recaply-backend',
    startedAt: new Date(startedAtMs).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000),
    requests: {
      total: requestsTotal,
      byStatusClass: Object.fromEntries(statusClassCounters.entries()),
      topRoutes: Array.from(routeCounters.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([route, count]) => ({ route, count })),
    },
    latencyMs: {
      average: Number(averageMs.toFixed(2)),
      min: durationStats.count > 0 ? durationStats.minMs : 0,
      max: durationStats.maxMs,
    },
    errors: {
      total: errorsTotal,
      rateLimited: rateLimitedTotal,
    },
    paywall: {
      total: paywallEventsTotal,
      byEvent: Object.fromEntries(paywallEventCounters.entries()),
      byVariant: Object.fromEntries(paywallVariantCounters.entries()),
      byTier: Object.fromEntries(paywallTierCounters.entries()),
      byOutcome: Object.fromEntries(paywallOutcomeCounters.entries()),
      bySource: Object.fromEntries(paywallSourceCounters.entries()),
      byEventVariant: Object.fromEntries(paywallEventVariantCounters.entries()),
      topEventVariantPairs: topCounterEntries(paywallEventVariantCounters),
    },
    translation: {
      total: translationEventsTotal,
      byEvent: Object.fromEntries(translationEventCounters.entries()),
      bySource: Object.fromEntries(translationSourceCounters.entries()),
      byLanguage: Object.fromEntries(translationLanguageCounters.entries()),
      byOutcome: Object.fromEntries(translationOutcomeCounters.entries()),
      byEventSource: Object.fromEntries(translationEventSourceCounters.entries()),
      byHour: Object.fromEntries(translationHourCounters.entries()),
      topEventSourcePairs: topCounterEntries(translationEventSourceCounters),
    },
    activation: {
      total: activationEventsTotal,
      byEvent: Object.fromEntries(activationEventCounters.entries()),
      bySource: Object.fromEntries(activationSourceCounters.entries()),
      byOutcome: Object.fromEntries(activationOutcomeCounters.entries()),
      byStep: Object.fromEntries(activationStepCounters.entries()),
      byEventSource: Object.fromEntries(activationEventSourceCounters.entries()),
      byHour: Object.fromEntries(activationHourCounters.entries()),
      topEventSourcePairs: topCounterEntries(activationEventSourceCounters),
    },
    growthRollups,
  };
}
