import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { AppCard } from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';
import {
  apiUrl,
  growthRollupMaintenanceRunsUrl,
  growthRollupMaintenanceUrl,
  metricsUrl,
} from '../config/api';
import { useAuth } from '../context/AuthContext';
import {
  getRecordingTranslationLanguages,
  summarizeTranslationUsage,
  type TranslationUsageSummary,
} from '../services/translationUsage';
import { trackTranslationEvent } from '../services/translationAnalytics';
import {
  resolveTranslationGrowthVariant,
  TRANSLATION_GROWTH_COPY_BY_VARIANT,
} from '../config/translationGrowthMessaging';
import {
  DEFAULT_FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT,
  getFollowUpStrategyTaggingLiveAt,
} from '../services/growthInsightsSettings';

const METRICS_API_KEY_STORAGE_KEY = 'paywall_metrics_api_key';
type MetricsWindowDays = 1 | 7 | 30;
const METRICS_WINDOW_PRESETS: MetricsWindowDays[] = [1, 7, 30];
const MS_PER_DAY = 1000 * 60 * 60 * 24;

type CounterMap = Record<string, number>;

interface EventVariantPair {
  key: string;
  count: number;
}

interface PaywallMetricsSnapshot {
  total: number;
  byEvent: CounterMap;
  byVariant: CounterMap;
  byTier: CounterMap;
  byOutcome: CounterMap;
  bySource: CounterMap;
  byEventVariant: CounterMap;
  topEventVariantPairs: EventVariantPair[];
}

interface TranslationMetricsSnapshot {
  total: number;
  byEvent: CounterMap;
  bySource: CounterMap;
  byLanguage: CounterMap;
  byOutcome: CounterMap;
  byEventSource: CounterMap;
  byHour: CounterMap;
  topEventSourcePairs: EventVariantPair[];
}

interface ActivationMetricsSnapshot {
  total: number;
  byEvent: CounterMap;
  bySource: CounterMap;
  byOutcome: CounterMap;
  byStep: CounterMap;
  byEventSource: CounterMap;
  byHour: CounterMap;
  topEventSourcePairs: EventVariantPair[];
}

interface GrowthRollupDailySnapshot {
  day: string;
  paywall: number;
  translation: number;
}

interface GrowthRollupsSnapshot {
  available: boolean;
  persistenceEnabled: boolean;
  windowDays: number;
  paywall: {
    total: number;
    byEvent: CounterMap;
    bySource: CounterMap;
    byVariant: CounterMap;
    byTier: CounterMap;
    byOutcome: CounterMap;
    byEventVariant: CounterMap;
    topEventVariantPairs: EventVariantPair[];
  };
  translation: {
    total: number;
    byEvent: CounterMap;
    bySource: CounterMap;
    byLanguage: CounterMap;
    byOutcome: CounterMap;
    byEventSource: CounterMap;
    topEventSourcePairs: EventVariantPair[];
  };
  daily: GrowthRollupDailySnapshot[];
}

interface MetricsPayload {
  service: string;
  startedAt?: string;
  paywall: PaywallMetricsSnapshot;
  translation: TranslationMetricsSnapshot;
  activation: ActivationMetricsSnapshot;
  growthRollups: GrowthRollupsSnapshot;
}

interface TranslationInsightsState {
  totalRecordings: number;
  translatableRecordings: number;
  summary: TranslationUsageSummary;
  latestTranslatableRecording: any | null;
  latestTranslatedRecording: any | null;
}

interface CompactBarRow {
  key: string;
  label: string;
  count: number;
  ratio: number;
}

interface GrowthRollupMaintenanceSnapshot {
  persistenceEnabled: boolean;
  available: boolean;
  dryRun: boolean;
  maxBackfillDays: number;
  backfill: {
    recordingsScanned: number;
    translationEntriesScanned: number;
    bucketsPrepared: number;
    eventsPrepared: number;
    rowsCleared: number;
    rowsWritten: number;
  };
  compaction: {
    attempted: boolean;
    legacyRowsFound: number;
    legacyRowsDeleted: number;
    compactedRowsWritten: number;
  };
}

type GrowthRollupMaintenanceStatus = 'completed' | 'unavailable' | 'failed';

interface GrowthRollupMaintenanceRunSnapshot {
  id: string;
  status: GrowthRollupMaintenanceStatus;
  dryRun: boolean;
  maxBackfillDays: number;
  includeCompaction: boolean;
  persistenceEnabled: boolean;
  available: boolean;
  backfillRowsWritten: number;
  legacyRowsDeleted: number;
  requestId: string | null;
  errorName: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface GrowthRollupMaintenanceDiagnosticsSnapshot {
  totalRuns: number;
  completedRuns: number;
  unavailableRuns: number;
  failedRuns: number;
  dryRuns: number;
  liveRuns: number;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
}

interface GrowthRollupMaintenanceHistorySnapshot {
  available: boolean;
  persistenceEnabled: boolean;
  runs: GrowthRollupMaintenanceRunSnapshot[];
  diagnostics: GrowthRollupMaintenanceDiagnosticsSnapshot;
}

function normalizeCounterMap(value: unknown): CounterMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result: CounterMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const count = Number(raw);
    if (!key || !Number.isFinite(count) || count < 0) {
      continue;
    }
    result[key] = Math.floor(count);
  }
  return result;
}

function normalizeEventVariantPairs(value: unknown): EventVariantPair[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const key = String((entry as Record<string, unknown>).key || '').trim();
      const count = Number((entry as Record<string, unknown>).count || 0);
      if (!key || !Number.isFinite(count) || count < 0) {
        return null;
      }
      return { key, count: Math.floor(count) };
    })
    .filter((entry): entry is EventVariantPair => Boolean(entry))
    .slice(0, 12);
}

function normalizeGrowthRollupMaintenanceSnapshot(value: unknown): GrowthRollupMaintenanceSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const backfillRaw = payload.backfill && typeof payload.backfill === 'object'
    ? payload.backfill as Record<string, unknown>
    : null;
  const compactionRaw = payload.compaction && typeof payload.compaction === 'object'
    ? payload.compaction as Record<string, unknown>
    : null;

  if (!backfillRaw || !compactionRaw) {
    return null;
  }

  return {
    persistenceEnabled: Boolean(payload.persistenceEnabled),
    available: Boolean(payload.available),
    dryRun: Boolean(payload.dryRun),
    maxBackfillDays: Math.min(3650, Math.max(1, Number(payload.maxBackfillDays) || 365)),
    backfill: {
      recordingsScanned: Math.max(0, Number(backfillRaw.recordingsScanned) || 0),
      translationEntriesScanned: Math.max(0, Number(backfillRaw.translationEntriesScanned) || 0),
      bucketsPrepared: Math.max(0, Number(backfillRaw.bucketsPrepared) || 0),
      eventsPrepared: Math.max(0, Number(backfillRaw.eventsPrepared) || 0),
      rowsCleared: Math.max(0, Number(backfillRaw.rowsCleared) || 0),
      rowsWritten: Math.max(0, Number(backfillRaw.rowsWritten) || 0),
    },
    compaction: {
      attempted: Boolean(compactionRaw.attempted),
      legacyRowsFound: Math.max(0, Number(compactionRaw.legacyRowsFound) || 0),
      legacyRowsDeleted: Math.max(0, Number(compactionRaw.legacyRowsDeleted) || 0),
      compactedRowsWritten: Math.max(0, Number(compactionRaw.compactedRowsWritten) || 0),
    },
  };
}

function normalizeGrowthRollupMaintenanceHistorySnapshot(value: unknown): GrowthRollupMaintenanceHistorySnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const runs = Array.isArray(payload.runs)
    ? payload.runs
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const row = entry as Record<string, unknown>;
        const id = typeof row.id === 'string' ? row.id.trim() : '';
        const createdAt = typeof row.createdAt === 'string' ? row.createdAt.trim() : '';
        const statusRaw = typeof row.status === 'string' ? row.status.toLowerCase() : 'unavailable';
        const status: GrowthRollupMaintenanceStatus =
          statusRaw === 'completed' || statusRaw === 'failed' || statusRaw === 'unavailable'
            ? statusRaw
            : 'unavailable';
        if (!id || !createdAt) {
          return null;
        }
        return {
          id,
          status,
          dryRun: Boolean(row.dryRun),
          maxBackfillDays: Math.min(3650, Math.max(1, Number(row.maxBackfillDays) || 365)),
          includeCompaction: Boolean(row.includeCompaction),
          persistenceEnabled: Boolean(row.persistenceEnabled),
          available: Boolean(row.available),
          backfillRowsWritten: Math.max(0, Number(row.backfillRowsWritten) || 0),
          legacyRowsDeleted: Math.max(0, Number(row.legacyRowsDeleted) || 0),
          requestId: typeof row.requestId === 'string' ? row.requestId : null,
          errorName: typeof row.errorName === 'string' ? row.errorName : null,
          errorMessage: typeof row.errorMessage === 'string' ? row.errorMessage : null,
          createdAt,
        };
      })
      .filter((entry): entry is GrowthRollupMaintenanceRunSnapshot => Boolean(entry))
    : [];

  const diagnosticsRaw = payload.diagnostics && typeof payload.diagnostics === 'object'
    ? payload.diagnostics as Record<string, unknown>
    : null;

  const diagnostics: GrowthRollupMaintenanceDiagnosticsSnapshot = {
    totalRuns: Math.max(0, Number(diagnosticsRaw?.totalRuns) || 0),
    completedRuns: Math.max(0, Number(diagnosticsRaw?.completedRuns) || 0),
    unavailableRuns: Math.max(0, Number(diagnosticsRaw?.unavailableRuns) || 0),
    failedRuns: Math.max(0, Number(diagnosticsRaw?.failedRuns) || 0),
    dryRuns: Math.max(0, Number(diagnosticsRaw?.dryRuns) || 0),
    liveRuns: Math.max(0, Number(diagnosticsRaw?.liveRuns) || 0),
    lastFailureAt: typeof diagnosticsRaw?.lastFailureAt === 'string' ? diagnosticsRaw.lastFailureAt : null,
    lastFailureMessage: typeof diagnosticsRaw?.lastFailureMessage === 'string'
      ? diagnosticsRaw.lastFailureMessage
      : null,
  };

  return {
    available: Boolean(payload.available),
    persistenceEnabled: Boolean(payload.persistenceEnabled),
    runs,
    diagnostics,
  };
}

function normalizeMetricsPayload(value: unknown): MetricsPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const paywallRaw = payload.paywall;
  if (!paywallRaw || typeof paywallRaw !== 'object') {
    return null;
  }
  const translationRaw = payload.translation;
  const activationRaw = payload.activation;
  const growthRollupsRaw = payload.growthRollups;

  const paywall = paywallRaw as Record<string, unknown>;
  const translation = translationRaw && typeof translationRaw === 'object'
    ? translationRaw as Record<string, unknown>
    : null;
  const activation = activationRaw && typeof activationRaw === 'object'
    ? activationRaw as Record<string, unknown>
    : null;
  const growthRollups = growthRollupsRaw && typeof growthRollupsRaw === 'object'
    ? growthRollupsRaw as Record<string, unknown>
    : null;
  const growthPaywall = growthRollups?.paywall && typeof growthRollups.paywall === 'object'
    ? growthRollups.paywall as Record<string, unknown>
    : null;
  const growthTranslation = growthRollups?.translation && typeof growthRollups.translation === 'object'
    ? growthRollups.translation as Record<string, unknown>
    : null;
  const daily = Array.isArray(growthRollups?.daily)
    ? growthRollups?.daily
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const row = entry as Record<string, unknown>;
        const day = typeof row.day === 'string' ? row.day.slice(0, 10) : '';
        if (!day) {
          return null;
        }
        return {
          day,
          paywall: Math.max(0, Number(row.paywall) || 0),
          translation: Math.max(0, Number(row.translation) || 0),
        };
      })
      .filter((entry): entry is GrowthRollupDailySnapshot => Boolean(entry))
    : [];

  return {
    service: String(payload.service || 'recaply-backend'),
    startedAt: typeof payload.startedAt === 'string' ? payload.startedAt : undefined,
    paywall: {
      total: Math.max(0, Number(paywall.total) || 0),
      byEvent: normalizeCounterMap(paywall.byEvent),
      byVariant: normalizeCounterMap(paywall.byVariant),
      byTier: normalizeCounterMap(paywall.byTier),
      byOutcome: normalizeCounterMap(paywall.byOutcome),
      bySource: normalizeCounterMap(paywall.bySource),
      byEventVariant: normalizeCounterMap(paywall.byEventVariant),
      topEventVariantPairs: normalizeEventVariantPairs(paywall.topEventVariantPairs),
    },
    translation: {
      total: Math.max(0, Number(translation?.total) || 0),
      byEvent: normalizeCounterMap(translation?.byEvent),
      bySource: normalizeCounterMap(translation?.bySource),
      byLanguage: normalizeCounterMap(translation?.byLanguage),
      byOutcome: normalizeCounterMap(translation?.byOutcome),
      byEventSource: normalizeCounterMap(translation?.byEventSource),
      byHour: normalizeCounterMap(translation?.byHour),
      topEventSourcePairs: normalizeEventVariantPairs(translation?.topEventSourcePairs),
    },
    activation: {
      total: Math.max(0, Number(activation?.total) || 0),
      byEvent: normalizeCounterMap(activation?.byEvent),
      bySource: normalizeCounterMap(activation?.bySource),
      byOutcome: normalizeCounterMap(activation?.byOutcome),
      byStep: normalizeCounterMap(activation?.byStep),
      byEventSource: normalizeCounterMap(activation?.byEventSource),
      byHour: normalizeCounterMap(activation?.byHour),
      topEventSourcePairs: normalizeEventVariantPairs(activation?.topEventSourcePairs),
    },
    growthRollups: {
      available: Boolean(growthRollups?.available),
      persistenceEnabled: Boolean(growthRollups?.persistenceEnabled),
      windowDays: Math.min(30, Math.max(1, Number(growthRollups?.windowDays) || 7)),
      paywall: {
        total: Math.max(0, Number(growthPaywall?.total) || 0),
        byEvent: normalizeCounterMap(growthPaywall?.byEvent),
        bySource: normalizeCounterMap(growthPaywall?.bySource),
        byVariant: normalizeCounterMap(growthPaywall?.byVariant),
        byTier: normalizeCounterMap(growthPaywall?.byTier),
        byOutcome: normalizeCounterMap(growthPaywall?.byOutcome),
        byEventVariant: normalizeCounterMap(growthPaywall?.byEventVariant),
        topEventVariantPairs: normalizeEventVariantPairs(growthPaywall?.topEventVariantPairs),
      },
      translation: {
        total: Math.max(0, Number(growthTranslation?.total) || 0),
        byEvent: normalizeCounterMap(growthTranslation?.byEvent),
        bySource: normalizeCounterMap(growthTranslation?.bySource),
        byLanguage: normalizeCounterMap(growthTranslation?.byLanguage),
        byOutcome: normalizeCounterMap(growthTranslation?.byOutcome),
        byEventSource: normalizeCounterMap(growthTranslation?.byEventSource),
        topEventSourcePairs: normalizeEventVariantPairs(growthTranslation?.topEventSourcePairs),
      },
      daily,
    },
  };
}

function getEventVariantCount(snapshot: PaywallMetricsSnapshot, eventName: string, variant: string): number {
  return snapshot.byEventVariant[`${eventName}|${variant}`] || 0;
}

function formatPercent(numerator: number, denominator: number): string {
  if (!denominator) {
    return '0%';
  }
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function topCounterEntries(counter: CounterMap, limit: number = 8): [string, number][] {
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function sumCounterEntries(counter: CounterMap, predicate: (key: string) => boolean): number {
  return Object.entries(counter).reduce((total, [key, count]) => (
    predicate(key) ? total + count : total
  ), 0);
}

function normalizeDisplayLabel(value: string): string {
  const sanitized = value.replace(/\|/g, ' • ').replace(/_/g, ' ').trim();
  if (!sanitized) {
    return 'unknown';
  }
  return sanitized;
}

const FOLLOW_UP_PERSONA_KEYS = ['team', 'executive', 'client'] as const;
type FollowUpPersonaKey = typeof FOLLOW_UP_PERSONA_KEYS[number];
type FollowUpStrategyMode = 'recommended' | 'manual';

function isFollowUpResendOutcomeKey(key: string): boolean {
  return key.startsWith('email_') || key.startsWith('slack_');
}

function isEscalatedFollowUpResendOutcomeKey(key: string): boolean {
  return isFollowUpResendOutcomeKey(key) && /_escalated(?:_(?:recommended|manual))?$/.test(key);
}

function parseFollowUpStrategyModeFromOutcomeKey(key: string): FollowUpStrategyMode | null {
  const match = key.match(/_(recommended|manual)$/);
  if (!match) {
    return null;
  }
  return match[1] === 'recommended' ? 'recommended' : 'manual';
}

function parseFollowUpPersonaFromOutcomeKey(key: string): FollowUpPersonaKey | null {
  const match = key.match(/_(team|executive|client)(?:_escalated)?(?:_(?:recommended|manual))?$/);
  if (!match) {
    return null;
  }
  const persona = match[1];
  if (persona === 'team' || persona === 'executive' || persona === 'client') {
    return persona;
  }
  return null;
}

function buildCompactBarRows(entries: [string, number][], limit: number = 6): CompactBarRow[] {
  if (!entries.length) {
    return [];
  }
  const sliced = entries.slice(0, limit);
  const maxCount = Math.max(1, ...sliced.map(([, count]) => count));
  return sliced.map(([key, count]) => ({
    key,
    label: normalizeDisplayLabel(key),
    count,
    ratio: count / maxCount,
  }));
}

function formatShortDay(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return day;
  }
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function resolvePostTaggingWindowCapDays(liveAtIso: string): number {
  const parsed = new Date(liveAtIso);
  if (Number.isNaN(parsed.getTime())) {
    return 30;
  }
  const deltaMs = Date.now() - parsed.getTime();
  if (deltaMs <= 0) {
    return 1;
  }
  return Math.min(30, Math.max(1, Math.floor(deltaMs / MS_PER_DAY) + 1));
}

function resolveMetricsWindowCapPreset(capDays: number): MetricsWindowDays {
  if (capDays >= 30) {
    return 30;
  }
  if (capDays >= 7) {
    return 7;
  }
  return 1;
}

function resolveEffectiveMetricsWindowDays(
  requestedWindowDays: MetricsWindowDays,
  postTaggingOnly: boolean,
  capPreset: MetricsWindowDays,
): MetricsWindowDays {
  if (!postTaggingOnly) {
    return requestedWindowDays;
  }
  if (requestedWindowDays <= capPreset) {
    return requestedWindowDays;
  }
  return capPreset;
}

function formatMaintenanceStatusLabel(status: GrowthRollupMaintenanceStatus): string {
  if (status === 'completed') {
    return 'Completed';
  }
  if (status === 'failed') {
    return 'Failed';
  }
  return 'Unavailable';
}

interface ActivationFunnelStageDefinition {
  key: string;
  label: string;
}

interface ActivationFunnelStageRow {
  key: string;
  label: string;
  count: number;
  fromPreviousRate: string;
  fromStartRate: string;
  dropFromPreviousCount: number;
  dropFromPreviousRate: string;
}

interface ActivationDropoffDiagnostic {
  message: string;
  action: string;
}

const ACTIVATION_CORE_STAGES: ActivationFunnelStageDefinition[] = [
  { key: 'onboarding_viewed', label: 'Onboarding viewed' },
  { key: 'onboarding_completed', label: 'Onboarding completed' },
  { key: 'home_instant_value_cta_tapped', label: 'Instant Value tapped' },
  { key: 'summary_generate_tapped', label: 'Summary generate tapped' },
  { key: 'summary_generate_completed', label: 'Summary generated' },
];

function getActivationActionHint(toStageKey: string): string {
  if (toStageKey === 'onboarding_completed') {
    return 'Shorten onboarding steps and reinforce skip/completion value on slide 1.';
  }
  if (toStageKey === 'home_instant_value_cta_tapped') {
    return 'Increase Instant Value CTA prominence and add explicit first-action copy on Home.';
  }
  if (toStageKey === 'summary_generate_tapped') {
    return 'Nudge users to tap Generate Summary immediately after opening a recording.';
  }
  if (toStageKey === 'summary_generate_completed') {
    return 'Investigate summary failure rate and latency before translation/share prompts.';
  }
  return 'Investigate this transition with source mix and session replay diagnostics.';
}

export default function PaywallInsightsScreen({ navigation }: any) {
  const { token, user } = useAuth();
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [metricsKey, setMetricsKey] = useState('');
  const [metricsKeyDraft, setMetricsKeyDraft] = useState('');
  const [translationInsights, setTranslationInsights] = useState<TranslationInsightsState | null>(null);
  const [translationInsightsError, setTranslationInsightsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [openingTranslationCta, setOpeningTranslationCta] = useState(false);
  const [windowDays, setWindowDays] = useState<MetricsWindowDays>(7);
  const [usePostTaggingWindow, setUsePostTaggingWindow] = useState(false);
  const [followUpStrategyTaggingLiveAt, setFollowUpStrategyTaggingLiveAt] = useState(
    DEFAULT_FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT,
  );
  const [maintenanceBackfillDaysDraft, setMaintenanceBackfillDaysDraft] = useState('365');
  const [maintenanceRunning, setMaintenanceRunning] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [maintenanceResult, setMaintenanceResult] = useState<GrowthRollupMaintenanceSnapshot | null>(null);
  const [maintenanceCompletedAt, setMaintenanceCompletedAt] = useState<string | null>(null);
  const [maintenanceHistory, setMaintenanceHistory] = useState<GrowthRollupMaintenanceHistorySnapshot | null>(null);
  const [maintenanceHistoryLoading, setMaintenanceHistoryLoading] = useState(false);
  const [maintenanceHistoryError, setMaintenanceHistoryError] = useState<string | null>(null);
  const translationGrowthSeed = user?.email || user?.id || '';
  const translationGrowthResolution = useMemo(
    () => resolveTranslationGrowthVariant(translationGrowthSeed),
    [translationGrowthSeed],
  );
  const translationGrowthCopy = TRANSLATION_GROWTH_COPY_BY_VARIANT[translationGrowthResolution.variant];
  const postTaggingWindowCapDays = useMemo(
    () => resolvePostTaggingWindowCapDays(followUpStrategyTaggingLiveAt),
    [followUpStrategyTaggingLiveAt],
  );
  const postTaggingWindowCapPreset = useMemo(
    () => resolveMetricsWindowCapPreset(postTaggingWindowCapDays),
    [postTaggingWindowCapDays],
  );
  const postTaggingLiveDateLabel = useMemo(() => {
    const parsed = new Date(followUpStrategyTaggingLiveAt);
    if (Number.isNaN(parsed.getTime())) {
      return followUpStrategyTaggingLiveAt;
    }
    return parsed.toLocaleDateString();
  }, [followUpStrategyTaggingLiveAt]);
  const effectiveWindowDays = useMemo(
    () => resolveEffectiveMetricsWindowDays(windowDays, usePostTaggingWindow, postTaggingWindowCapPreset),
    [windowDays, usePostTaggingWindow, postTaggingWindowCapPreset],
  );

  React.useEffect(() => {
    void initialize();
  }, []);

  async function initialize() {
    let strategyTaggingLiveAt = DEFAULT_FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT;
    try {
      strategyTaggingLiveAt = await getFollowUpStrategyTaggingLiveAt();
      setFollowUpStrategyTaggingLiveAt(strategyTaggingLiveAt);
      const stored = (await AsyncStorage.getItem(METRICS_API_KEY_STORAGE_KEY)) || '';
      setMetricsKey(stored);
      setMetricsKeyDraft(stored);
      await refreshAll(stored, windowDays, true, usePostTaggingWindow, strategyTaggingLiveAt);
    } catch {
      await refreshAll('', windowDays, true, usePostTaggingWindow, strategyTaggingLiveAt);
    }
  }

  async function refreshAll(
    key: string,
    requestedWindowDays: MetricsWindowDays,
    initialLoad = false,
    postTaggingOnlyOverride: boolean = usePostTaggingWindow,
    strategyTaggingLiveAtOverride: string = followUpStrategyTaggingLiveAt,
  ) {
    const effectiveCapPreset = resolveMetricsWindowCapPreset(
      resolvePostTaggingWindowCapDays(strategyTaggingLiveAtOverride),
    );
    const effectiveRequestedWindowDays = resolveEffectiveMetricsWindowDays(
      requestedWindowDays,
      postTaggingOnlyOverride,
      effectiveCapPreset,
    );
    await Promise.all([
      fetchMetrics(key, effectiveRequestedWindowDays, initialLoad),
      fetchTranslationInsights(),
      fetchMaintenanceHistory(key),
    ]);
  }

  function buildMetricsHeaders(rawKey: string): Record<string, string> {
    const headers: Record<string, string> = {};
    const trimmedKey = rawKey.trim();
    if (trimmedKey) {
      headers['x-metrics-key'] = trimmedKey;
    }
    return headers;
  }

  async function fetchMetrics(key: string, requestedWindowDays: MetricsWindowDays, initialLoad = false) {
    if (initialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const headers = buildMetricsHeaders(key);

      const response = await fetch(metricsUrl(requestedWindowDays), { headers });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const reason = response.status === 403
          ? 'Metrics key rejected. Enter a valid key or remove key protection on backend.'
          : `Failed to load metrics (${response.status})`;
        throw new Error(payload?.error ? `${reason} ${payload.error}` : reason);
      }

      const normalized = normalizeMetricsPayload(payload);
      if (!normalized) {
        throw new Error('Metrics payload missing growth counters');
      }

      setMetrics(normalized);
      setError(null);
      setLastRefreshedAt(new Date().toISOString());
    } catch (fetchError: any) {
      setError(String(fetchError?.message || 'Failed to fetch metrics'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function fetchMaintenanceHistory(key: string) {
    setMaintenanceHistoryLoading(true);
    setMaintenanceHistoryError(null);
    try {
      const response = await fetch(growthRollupMaintenanceRunsUrl(12), {
        headers: buildMetricsHeaders(key),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const reason = response.status === 403
          ? 'Metrics key rejected for maintenance history.'
          : `Failed to load maintenance history (${response.status})`;
        throw new Error(payload?.error ? `${reason} ${payload.error}` : reason);
      }

      const normalized = normalizeGrowthRollupMaintenanceHistorySnapshot(payload);
      if (!normalized) {
        throw new Error('Maintenance history response missing required fields.');
      }

      setMaintenanceHistory(normalized);
      setMaintenanceHistoryError(null);
    } catch (historyError: any) {
      setMaintenanceHistoryError(String(historyError?.message || 'Failed to load maintenance history.'));
    } finally {
      setMaintenanceHistoryLoading(false);
    }
  }

  async function saveMetricsKey() {
    try {
      const normalized = metricsKeyDraft.trim();
      await AsyncStorage.setItem(METRICS_API_KEY_STORAGE_KEY, normalized);
      setMetricsKey(normalized);
      await refreshAll(normalized, windowDays, false);
      Alert.alert('Saved', 'Metrics key saved locally for future refreshes.');
    } catch (saveError: any) {
      Alert.alert('Save Failed', String(saveError?.message || 'Could not save metrics key.'));
    }
  }

  async function clearMetricsKey() {
    await AsyncStorage.removeItem(METRICS_API_KEY_STORAGE_KEY);
    setMetricsKey('');
    setMetricsKeyDraft('');
    await refreshAll('', windowDays, false);
  }

  async function selectMetricsWindowDays(nextWindowDays: MetricsWindowDays) {
    if (nextWindowDays === windowDays) {
      return;
    }
    setWindowDays(nextWindowDays);
    await refreshAll(metricsKey, nextWindowDays, false);
  }

  async function selectLiftScope(postTaggingOnly: boolean) {
    if (postTaggingOnly === usePostTaggingWindow) {
      return;
    }
    setUsePostTaggingWindow(postTaggingOnly);
    await refreshAll(metricsKey, windowDays, false, postTaggingOnly);
  }

  function openGrowthSettings() {
    navigation.navigate('Settings');
  }

  function resolveMaintenanceBackfillDays(): number | null {
    const raw = maintenanceBackfillDaysDraft.trim();
    if (!raw) {
      return 365;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Math.min(3650, Math.max(1, Math.floor(parsed)));
  }

  function resolveActiveMetricsKey(): string {
    const draft = metricsKeyDraft.trim();
    if (draft) {
      return draft;
    }
    return metricsKey.trim();
  }

  async function runGrowthRollupMaintenance(dryRun: boolean) {
    if (maintenanceRunning) {
      return;
    }

    const maxBackfillDays = resolveMaintenanceBackfillDays();
    if (!maxBackfillDays) {
      setMaintenanceError('Backfill days must be a number between 1 and 3650.');
      return;
    }

    const activeMetricsKey = resolveActiveMetricsKey();
    setMaintenanceRunning(true);
    setMaintenanceError(null);

    try {
      const response = await fetch(growthRollupMaintenanceUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildMetricsHeaders(activeMetricsKey),
        },
        body: JSON.stringify({
          dryRun,
          maxBackfillDays,
          includeCompaction: true,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const reason = response.status === 403
          ? 'Metrics key rejected. Save a valid key before running maintenance.'
          : `Maintenance request failed (${response.status})`;
        throw new Error(payload?.error ? `${reason} ${payload.error}` : reason);
      }

      const normalized = normalizeGrowthRollupMaintenanceSnapshot(payload);
      if (!normalized) {
        throw new Error('Maintenance response missing summary fields.');
      }

      setMaintenanceResult(normalized);
      setMaintenanceCompletedAt(new Date().toISOString());
      setMaintenanceError(null);
      await fetchMaintenanceHistory(activeMetricsKey);

      if (!dryRun) {
        await refreshAll(activeMetricsKey, windowDays, false);
      }
    } catch (maintenanceRunError: any) {
      setMaintenanceError(String(maintenanceRunError?.message || 'Failed to run maintenance.'));
    } finally {
      setMaintenanceRunning(false);
    }
  }

  function confirmLiveGrowthRollupMaintenance() {
    Alert.alert(
      'Run Live Maintenance',
      'This will write durable growth rollup rows and compact legacy backfill rows. Run a dry run first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run Live',
          style: 'destructive',
          onPress: () => {
            void runGrowthRollupMaintenance(false);
          },
        },
      ],
    );
  }

  async function fetchTranslationInsights() {
    if (!token) {
      setTranslationInsights(null);
      setTranslationInsightsError('Sign in to view translation usage analytics.');
      return;
    }

    try {
      const response = await fetch(apiUrl('/audio/recordings?limit=200&offset=0'), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load translations (${response.status})`);
      }

      const payload = await response.json().catch(() => ({}));
      const recordings = Array.isArray(payload?.recordings) ? payload.recordings : [];
      const translatableRecordings = recordings.filter((recording: any) => (
        Boolean(recording?.summary_json) || Boolean(recording?.transcript || recording?.transcription)
      )).length;
      const summary = summarizeTranslationUsage(recordings);
      const latestTranslatableRecording = recordings.find((recording: any) => (
        Boolean(recording?.summary_json) || Boolean(recording?.transcript || recording?.transcription)
      )) || null;
      const latestTranslatedRecording = recordings.find(
        (recording: any) => getRecordingTranslationLanguages(recording).length > 0,
      ) || null;

      setTranslationInsights({
        totalRecordings: recordings.length,
        translatableRecordings,
        summary,
        latestTranslatableRecording,
        latestTranslatedRecording,
      });
      setTranslationInsightsError(null);
    } catch (translationError: any) {
      setTranslationInsightsError(String(translationError?.message || 'Failed to fetch translation analytics'));
    }
  }

  async function openTranslationActionFromInsights() {
    if (openingTranslationCta) {
      return;
    }

    const source = `insights_translation_cta_${translationGrowthResolution.variant}`;
    void trackTranslationEvent(token, {
      eventName: 'translation_insights_cta_tapped',
      source,
      outcome: translationGrowthResolution.reason,
    });

    const target = translationInsights?.latestTranslatedRecording
      || translationInsights?.latestTranslatableRecording;

    if (!target) {
      Alert.alert('Translation Flow', translationGrowthCopy.insights.ctaEmptyHint);
      return;
    }

    try {
      setOpeningTranslationCta(true);
      navigation.navigate('Transcript', {
        transcription: target.transcript || target.transcription,
        filename: target.filename,
        recordingId: target.id,
        meetingName: target.meeting_name,
        meetingLocation: target.meeting_location,
        meetingContext: target.meeting_context,
        meetingAt: target.meeting_at,
        meetingParticipants: target.meeting_participants,
      });

      const targetRecordingId = typeof target.id === 'string' ? target.id : String(target.id || '');
      void trackTranslationEvent(token, {
        eventName: 'translation_insights_cta_opened',
        source,
        recordingId: targetRecordingId || undefined,
        outcome: translationInsights?.latestTranslatedRecording ? 'translated_recording' : 'translatable_recording',
      });
    } finally {
      setOpeningTranslationCta(false);
    }
  }

  const variantRows = useMemo(() => {
    if (!metrics) {
      return [];
    }

    const known = ['value', 'roi', 'unknown'];
    const dynamic = Object.keys(metrics.paywall.byVariant)
      .map((key) => key.toLowerCase())
      .filter((key) => !known.includes(key));
    const variants = [...known, ...dynamic];

    return variants.map((variant) => {
      const views = getEventVariantCount(metrics.paywall, 'paywall_viewed', variant);
      const intents = getEventVariantCount(metrics.paywall, 'paywall_plan_cta_tapped', variant);
      const verified = getEventVariantCount(metrics.paywall, 'paywall_purchase_verified', variant);
      const restoreSuccess = getEventVariantCount(metrics.paywall, 'paywall_restore_completed', variant);

      return {
        variant,
        views,
        intents,
        verified,
        restoreSuccess,
        tapRate: formatPercent(intents, views),
        purchaseRate: formatPercent(verified, intents),
      };
    });
  }, [metrics]);

  const topEvents = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return Object.entries(metrics.paywall.byEvent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [metrics]);

  const translationTopEvents = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return Object.entries(metrics.translation.byEvent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [metrics]);

  const translationTopLanguages = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return Object.entries(metrics.translation.byLanguage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [metrics]);

  const translationHourlyTrend = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return Object.entries(metrics.translation.byHour)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12);
  }, [metrics]);

  const activationCoreStageRows = useMemo((): ActivationFunnelStageRow[] => {
    if (!metrics) {
      return [];
    }

    const rows: ActivationFunnelStageRow[] = [];
    const startCount = Math.max(0, metrics.activation.byEvent[ACTIVATION_CORE_STAGES[0].key] || 0);

    ACTIVATION_CORE_STAGES.forEach((stage, index) => {
      const count = Math.max(0, metrics.activation.byEvent[stage.key] || 0);
      const previousCount = index > 0 ? rows[index - 1].count : count;
      const rawDrop = Math.max(previousCount - count, 0);

      rows.push({
        key: stage.key,
        label: stage.label,
        count,
        fromPreviousRate: index === 0 ? '100%' : formatPercent(count, previousCount),
        fromStartRate: formatPercent(count, startCount),
        dropFromPreviousCount: rawDrop,
        dropFromPreviousRate: index === 0 ? '0%' : formatPercent(rawDrop, previousCount),
      });
    });

    return rows;
  }, [metrics]);

  const activationBiggestDropoff = useMemo((): ActivationDropoffDiagnostic => {
    if (!activationCoreStageRows.length) {
      return {
        message: 'No activation stage data yet.',
        action: 'Run a few onboarding-to-summary sessions to populate diagnostics.',
      };
    }

    let biggestIndex = -1;
    let biggestDrop = 0;

    for (let index = 1; index < activationCoreStageRows.length; index += 1) {
      const dropCount = activationCoreStageRows[index].dropFromPreviousCount;
      if (dropCount > biggestDrop) {
        biggestDrop = dropCount;
        biggestIndex = index;
      }
    }

    if (biggestIndex < 1 || biggestDrop <= 0) {
      return {
        message: 'No material drop-off detected across core activation stages.',
        action: 'Focus next on post-summary actions (share/export/copy) to improve monetizable behavior.',
      };
    }

    const toRow = activationCoreStageRows[biggestIndex];
    const fromRow = activationCoreStageRows[biggestIndex - 1];
    return {
      message: `Biggest drop-off: ${fromRow.label} -> ${toRow.label} (${toRow.dropFromPreviousCount}, ${toRow.dropFromPreviousRate}).`,
      action: getActivationActionHint(toRow.key),
    };
  }, [activationCoreStageRows]);

  const activationTopEvents = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return Object.entries(metrics.activation.byEvent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [metrics]);

  const activationTopSources = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return topCounterEntries(metrics.activation.bySource, 6);
  }, [metrics]);

  const activationTopEventSourcePairs = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return (metrics.activation.topEventSourcePairs || []).slice(0, 8);
  }, [metrics]);
  const followUpReminderCadenceOutcomes = useMemo(() => {
    if (!metrics) {
      return [] as [string, number][];
    }
    return Object.entries(metrics.activation.byOutcome)
      .filter(([key]) => key.startsWith('cadence_'))
      .map(([key, count]) => [key.replace(/^cadence_/, ''), count] as [string, number])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6);
  }, [metrics]);
  const followUpPersonaSelectionOutcomes = useMemo(() => {
    if (!metrics) {
      return [] as [string, number][];
    }
    return FOLLOW_UP_PERSONA_KEYS
      .map((persona) => [persona, Math.max(0, metrics.activation.byOutcome[persona] || 0)] as [string, number])
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [metrics]);
  const followUpResendPersonaOutcomes = useMemo(() => {
    if (!metrics) {
      return [] as [string, number][];
    }
    const counts = new Map<FollowUpPersonaKey, number>();
    Object.entries(metrics.activation.byOutcome).forEach(([key, count]) => {
      if (!isFollowUpResendOutcomeKey(key)) {
        return;
      }
      const persona = parseFollowUpPersonaFromOutcomeKey(key);
      if (!persona) {
        return;
      }
      counts.set(persona, (counts.get(persona) || 0) + count);
    });
    return Array.from(counts.entries())
      .map(([persona, count]) => [persona, count] as [string, number])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [metrics]);
  const followUpEscalationToggleOutcomes = useMemo(() => {
    if (!metrics) {
      return [] as [string, number][];
    }
    return Object.entries(metrics.activation.byOutcome)
      .filter(([key]) => key === 'enabled' || key === 'disabled')
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [metrics]);
  const followUpEscalationThresholdOutcomes = useMemo(() => {
    if (!metrics) {
      return [] as [string, number][];
    }
    return Object.entries(metrics.activation.byOutcome)
      .filter(([key]) => key.startsWith('threshold_') && key.endsWith('h'))
      .map(([key, count]) => [key.replace(/^threshold_/, ''), count] as [string, number])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [metrics]);
  const followUpResendOutcomes = useMemo(() => {
    if (!metrics) {
      return [] as [string, number][];
    }
    return Object.entries(metrics.activation.byOutcome)
      .filter(([key]) => key.startsWith('email_') || key.startsWith('slack_'))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8);
  }, [metrics]);
  const followUpEscalatedResendOutcomes = useMemo(() => {
    if (!metrics) {
      return [] as [string, number][];
    }
    return Object.entries(metrics.activation.byOutcome)
      .filter(([key]) => isEscalatedFollowUpResendOutcomeKey(key))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8);
  }, [metrics]);
  const followUpReminderEventCount = metrics?.activation.byEvent.summary_followup_reminder_tapped || 0;
  const followUpResendEventCount = metrics?.activation.byEvent.summary_followup_resend_tapped || 0;
  const followUpPersonaSelectEventCount = metrics?.activation.byEvent.summary_followup_persona_selected || 0;
  const followUpEscalationTappedEventCount = metrics?.activation.byEvent.summary_followup_escalation_tapped || 0;
  const followUpEscalationTriggeredEventCount = metrics?.activation.byEvent.summary_followup_escalation_triggered || 0;
  const followUpRecommendationShownCount = metrics?.activation.byStep.followup_strategy_recommendation_shown || 0;
  const followUpRecommendationApplyCount = metrics?.activation.byStep.followup_strategy_recommendation_apply || 0;
  const followUpResendSuccessCount = metrics
    ? sumCounterEntries(
      metrics.activation.byOutcome,
      (key) => isFollowUpResendOutcomeKey(key) && !key.includes('_failed'),
    )
    : 0;
  const followUpResendFailedCount = metrics
    ? sumCounterEntries(
      metrics.activation.byOutcome,
      (key) => isFollowUpResendOutcomeKey(key) && key.includes('_failed'),
    )
    : 0;
  const followUpEscalatedResendCount = metrics
    ? sumCounterEntries(metrics.activation.byOutcome, (key) => isEscalatedFollowUpResendOutcomeKey(key))
    : 0;
  const followUpRecommendedResendSuccessCount = metrics
    ? sumCounterEntries(
      metrics.activation.byOutcome,
      (key) =>
        isFollowUpResendOutcomeKey(key)
        && !key.includes('_failed')
        && parseFollowUpStrategyModeFromOutcomeKey(key) === 'recommended',
    )
    : 0;
  const followUpRecommendedResendFailedCount = metrics
    ? sumCounterEntries(
      metrics.activation.byOutcome,
      (key) =>
        isFollowUpResendOutcomeKey(key)
        && key.includes('_failed')
        && parseFollowUpStrategyModeFromOutcomeKey(key) === 'recommended',
    )
    : 0;
  const followUpManualResendSuccessCount = metrics
    ? sumCounterEntries(
      metrics.activation.byOutcome,
      (key) =>
        isFollowUpResendOutcomeKey(key)
        && !key.includes('_failed')
        && parseFollowUpStrategyModeFromOutcomeKey(key) === 'manual',
    )
    : 0;
  const followUpManualResendFailedCount = metrics
    ? sumCounterEntries(
      metrics.activation.byOutcome,
      (key) =>
        isFollowUpResendOutcomeKey(key)
        && key.includes('_failed')
        && parseFollowUpStrategyModeFromOutcomeKey(key) === 'manual',
    )
    : 0;
  const followUpUntaggedResendSuccessCount = metrics
    ? sumCounterEntries(
      metrics.activation.byOutcome,
      (key) =>
        isFollowUpResendOutcomeKey(key)
        && !key.includes('_failed')
        && parseFollowUpStrategyModeFromOutcomeKey(key) == null,
    )
    : 0;
  const followUpUntaggedResendFailedCount = metrics
    ? sumCounterEntries(
      metrics.activation.byOutcome,
      (key) =>
        isFollowUpResendOutcomeKey(key)
        && key.includes('_failed')
        && parseFollowUpStrategyModeFromOutcomeKey(key) == null,
    )
    : 0;
  const followUpRecommendedResendTotal = followUpRecommendedResendSuccessCount + followUpRecommendedResendFailedCount;
  const followUpManualResendTotal = followUpManualResendSuccessCount + followUpManualResendFailedCount;
  const followUpUntaggedResendTotal = followUpUntaggedResendSuccessCount + followUpUntaggedResendFailedCount;
  const followUpStrategyLiftDelta = followUpRecommendedResendTotal > 0 && followUpManualResendTotal > 0
    ? (followUpRecommendedResendSuccessCount / followUpRecommendedResendTotal)
      - (followUpManualResendSuccessCount / followUpManualResendTotal)
    : null;
  const followUpStrategyLiftLabel = followUpStrategyLiftDelta == null
    ? 'n/a'
    : `${followUpStrategyLiftDelta >= 0 ? '+' : ''}${Math.round(followUpStrategyLiftDelta * 100)}pp`;

  const growthPaywallTopSources = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return topCounterEntries(metrics.growthRollups.paywall.bySource, 6);
  }, [metrics]);

  const growthPaywallTopVariants = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return topCounterEntries(metrics.growthRollups.paywall.byVariant, 6);
  }, [metrics]);

  const growthTranslationTopSources = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return topCounterEntries(metrics.growthRollups.translation.bySource, 6);
  }, [metrics]);

  const growthTranslationTopLanguages = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return topCounterEntries(metrics.growthRollups.translation.byLanguage, 6);
  }, [metrics]);

  const growthDailyTrend = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return metrics.growthRollups.daily.slice(-14);
  }, [metrics]);

  const growthPaywallDailyMax = useMemo(() => {
    if (!growthDailyTrend.length) {
      return 1;
    }
    return Math.max(1, ...growthDailyTrend.map((row) => row.paywall));
  }, [growthDailyTrend]);

  const growthTranslationDailyMax = useMemo(() => {
    if (!growthDailyTrend.length) {
      return 1;
    }
    return Math.max(1, ...growthDailyTrend.map((row) => row.translation));
  }, [growthDailyTrend]);

  const growthTrendStartLabel = growthDailyTrend.length > 0 ? formatShortDay(growthDailyTrend[0].day) : '';
  const growthTrendEndLabel = growthDailyTrend.length > 0
    ? formatShortDay(growthDailyTrend[growthDailyTrend.length - 1].day)
    : '';
  const growthTrendTotal = growthDailyTrend.reduce(
    (acc, row) => ({
      paywall: acc.paywall + row.paywall,
      translation: acc.translation + row.translation,
    }),
    { paywall: 0, translation: 0 },
  );

  const compactPaywallSources = useMemo(
    () => buildCompactBarRows(growthPaywallTopSources, 6),
    [growthPaywallTopSources],
  );
  const compactPaywallVariants = useMemo(
    () => buildCompactBarRows(growthPaywallTopVariants, 6),
    [growthPaywallTopVariants],
  );
  const compactTranslationSources = useMemo(
    () => buildCompactBarRows(growthTranslationTopSources, 6),
    [growthTranslationTopSources],
  );
  const compactTranslationLanguages = useMemo(
    () => buildCompactBarRows(growthTranslationTopLanguages, 6),
    [growthTranslationTopLanguages],
  );
  const compactActivationSources = useMemo(
    () => buildCompactBarRows(activationTopSources, 6),
    [activationTopSources],
  );
  const compactPaywallPairs = useMemo(
    () => buildCompactBarRows(metrics?.growthRollups.paywall.topEventVariantPairs.map((entry) => [entry.key, entry.count]) || [], 8),
    [metrics],
  );
  const compactTranslationPairs = useMemo(
    () => buildCompactBarRows(metrics?.growthRollups.translation.topEventSourcePairs.map((entry) => [entry.key, entry.count]) || [], 8),
    [metrics],
  );
  const compactActivationPairs = useMemo(
    () => buildCompactBarRows(activationTopEventSourcePairs.map((entry) => [entry.key, entry.count]), 8),
    [activationTopEventSourcePairs],
  );
  const compactFollowUpPersonaSelections = useMemo(
    () => buildCompactBarRows(followUpPersonaSelectionOutcomes, 3),
    [followUpPersonaSelectionOutcomes],
  );
  const compactFollowUpResendPersonaOutcomes = useMemo(
    () => buildCompactBarRows(followUpResendPersonaOutcomes, 3),
    [followUpResendPersonaOutcomes],
  );
  const compactFollowUpEscalationThresholds = useMemo(
    () => buildCompactBarRows(followUpEscalationThresholdOutcomes, 3),
    [followUpEscalationThresholdOutcomes],
  );

  function renderCompactBarSection(title: string, rows: CompactBarRow[], tone: 'paywall' | 'translation' | 'activation') {
    if (!rows.length) {
      return null;
    }
    return (
      <View style={styles.compactBarSection}>
        <Text style={styles.translationTopTitle}>{title}</Text>
        {rows.map((row) => (
          <View key={`${title}-${row.key}`} style={styles.compactBarRow}>
            <View style={styles.compactBarMeta}>
              <Text numberOfLines={1} style={styles.compactBarLabel}>{row.label}</Text>
              <Text style={styles.compactBarCount}>{row.count}</Text>
            </View>
            <View style={styles.compactBarTrack}>
              <View
                style={[
                  styles.compactBarFill,
                  tone === 'paywall'
                    ? styles.compactBarFillPaywall
                    : (tone === 'translation'
                      ? styles.compactBarFillTranslation
                      : styles.compactBarFillActivation),
                  { width: `${Math.max(6, Math.round(row.ratio * 100))}%` },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    );
  }

  const maintenanceDiagnostics = maintenanceHistory?.diagnostics || null;
  const maintenanceRecentRuns = (maintenanceHistory?.runs || []).slice(0, 6);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppCard variant="dark" style={styles.heroCard}>
        <Text style={styles.heroTitle}>Growth Insights</Text>
        <Text style={styles.heroSubtitle}>Live paywall and translation counters from backend `/metrics`.</Text>
        <Text style={styles.heroMeta}>Source: {metrics?.service || 'recaply-backend'}</Text>
        <Text style={styles.heroMeta}>Last refresh: {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleString() : 'Not loaded yet'}</Text>
      </AppCard>

      <AppCard style={styles.keyCard}>
        <Text style={styles.sectionTitle}>Metrics Key (optional)</Text>
        <Text style={styles.sectionHint}>
          Use this only if backend `METRICS_API_KEY` is enabled.
        </Text>
        <TextInput
          value={metricsKeyDraft}
          onChangeText={setMetricsKeyDraft}
          placeholder="x-metrics-key value"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.keyInput}
        />
        <View style={styles.keyActions}>
          <AppButton label="Save Key" onPress={() => void saveMetricsKey()} style={styles.keyActionButton} />
          <AppButton label="Clear" variant="info" onPress={() => void clearMetricsKey()} style={styles.keyActionButton} />
        </View>
        <Text style={styles.keyStatus}>Saved key: {metricsKey ? 'Configured' : 'Not set'}</Text>
      </AppCard>

      <AppCard style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Total Events</Text>
            <Text style={styles.summaryValue}>{metrics?.paywall.total || 0}</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Variants Seen</Text>
            <Text style={styles.summaryValue}>{Object.keys(metrics?.paywall.byVariant || {}).length}</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Tracked Events</Text>
            <Text style={styles.summaryValue}>{Object.keys(metrics?.paywall.byEvent || {}).length}</Text>
          </View>
        </View>
        <View style={styles.windowControlsWrap}>
          <Text style={styles.windowControlsLabel}>Trend Window</Text>
          <View style={styles.windowControlsRow}>
            {METRICS_WINDOW_PRESETS.map((option) => {
              const selected = windowDays === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.windowControlChip, selected && styles.windowControlChipActive]}
                  onPress={() => void selectMetricsWindowDays(option)}
                  disabled={refreshing}
                >
                  <Text style={[styles.windowControlChipText, selected && styles.windowControlChipTextActive]}>
                    {option}d
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.windowControlsLabel}>Lift Scope</Text>
          <View style={styles.windowControlsRow}>
            <TouchableOpacity
              style={[styles.windowControlChip, !usePostTaggingWindow && styles.windowControlChipActive]}
              onPress={() => void selectLiftScope(false)}
              disabled={refreshing}
            >
              <Text style={[styles.windowControlChipText, !usePostTaggingWindow && styles.windowControlChipTextActive]}>
                All Window
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.windowControlChip, usePostTaggingWindow && styles.windowControlChipActive]}
              onPress={() => void selectLiftScope(true)}
              disabled={refreshing}
            >
              <Text style={[styles.windowControlChipText, usePostTaggingWindow && styles.windowControlChipTextActive]}>
                Post-tagging only
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.windowControlHintRow}>
            <Text style={styles.windowControlHint}>
              {usePostTaggingWindow
                ? `Post-tagging scope active (live ${postTaggingLiveDateLabel}; cap ${postTaggingWindowCapPreset}d). Effective window ${effectiveWindowDays}d.`
                : `All-window scope active. Effective window ${effectiveWindowDays}d.`}
            </Text>
            <TouchableOpacity
              style={styles.windowControlHintLink}
              onPress={openGrowthSettings}
              disabled={refreshing}
            >
              <Text style={styles.windowControlHintLinkText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
        <AppButton
          label={refreshing ? 'Refreshing...' : 'Refresh Metrics'}
          variant="primary"
          onPress={() => void refreshAll(metricsKey, windowDays, false)}
          loading={refreshing}
          disabled={refreshing}
          style={styles.refreshButton}
        />
      </AppCard>

      <AppCard style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Operator Controls</Text>
        <Text style={styles.sectionHint}>
          Run durable growth rollup maintenance from the app (dry-run or live).
        </Text>
        <Text style={styles.operatorGuardrail}>
          Live mode writes/compacts rows in `growth_event_rollups`. Use dry-run first, then execute live.
        </Text>
        <TextInput
          value={maintenanceBackfillDaysDraft}
          onChangeText={setMaintenanceBackfillDaysDraft}
          placeholder="Backfill days (1-3650)"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          style={styles.operatorInput}
        />
        <View style={styles.keyActions}>
          <AppButton
            label={maintenanceRunning ? 'Running...' : 'Run Dry-Run'}
            variant="info"
            onPress={() => void runGrowthRollupMaintenance(true)}
            loading={maintenanceRunning}
            disabled={maintenanceRunning}
            style={styles.keyActionButton}
          />
          <AppButton
            label={maintenanceRunning ? 'Running...' : 'Run Live'}
            variant="warning"
            onPress={confirmLiveGrowthRollupMaintenance}
            loading={maintenanceRunning}
            disabled={maintenanceRunning}
            style={styles.keyActionButton}
          />
        </View>
        <Text style={styles.keyStatus}>
          Maintenance auth key: {resolveActiveMetricsKey() ? 'Configured' : 'Not set'}
        </Text>
        {maintenanceError ? (
          <Text style={styles.operatorError}>{maintenanceError}</Text>
        ) : null}
        {maintenanceResult ? (
          <>
            <Text style={styles.translationMeta}>
              Last run: {maintenanceCompletedAt ? new Date(maintenanceCompletedAt).toLocaleString() : 'just now'} ·
              {' '}
              {maintenanceResult.dryRun ? 'Dry-run' : 'Live'} · Window {maintenanceResult.maxBackfillDays}d
            </Text>
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Recordings</Text>
                <Text style={styles.summaryValue}>{maintenanceResult.backfill.recordingsScanned}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Entries</Text>
                <Text style={styles.summaryValue}>{maintenanceResult.backfill.translationEntriesScanned}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Rows Written</Text>
                <Text style={styles.summaryValue}>{maintenanceResult.backfill.rowsWritten}</Text>
              </View>
            </View>
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Rows Cleared</Text>
                <Text style={styles.summaryValue}>{maintenanceResult.backfill.rowsCleared}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Legacy Found</Text>
                <Text style={styles.summaryValue}>{maintenanceResult.compaction.legacyRowsFound}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Legacy Deleted</Text>
                <Text style={styles.summaryValue}>{maintenanceResult.compaction.legacyRowsDeleted}</Text>
              </View>
            </View>
          </>
        ) : null}
        {maintenanceHistoryLoading ? (
          <Text style={styles.translationMeta}>Loading maintenance history...</Text>
        ) : null}
        {maintenanceHistoryError ? (
          <Text style={styles.operatorError}>{maintenanceHistoryError}</Text>
        ) : null}
        {maintenanceDiagnostics ? (
          <>
            <Text style={styles.translationMeta}>
              Persisted history diagnostics ({maintenanceDiagnostics.totalRuns} runs)
            </Text>
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Completed</Text>
                <Text style={styles.summaryValue}>{maintenanceDiagnostics.completedRuns}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Unavailable</Text>
                <Text style={styles.summaryValue}>{maintenanceDiagnostics.unavailableRuns}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Failed</Text>
                <Text style={styles.summaryValue}>{maintenanceDiagnostics.failedRuns}</Text>
              </View>
            </View>
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Dry Runs</Text>
                <Text style={styles.summaryValue}>{maintenanceDiagnostics.dryRuns}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Live Runs</Text>
                <Text style={styles.summaryValue}>{maintenanceDiagnostics.liveRuns}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Last Failure</Text>
                <Text style={styles.summaryValue}>
                  {maintenanceDiagnostics.lastFailureAt ? formatShortDay(maintenanceDiagnostics.lastFailureAt.slice(0, 10)) : '-'}
                </Text>
              </View>
            </View>
            {maintenanceDiagnostics.lastFailureMessage ? (
              <Text style={styles.operatorHint}>
                Latest failure: {maintenanceDiagnostics.lastFailureMessage}
              </Text>
            ) : null}
          </>
        ) : null}
        {maintenanceRecentRuns.length > 0 ? (
          <View style={styles.translationTopList}>
            <Text style={styles.translationTopTitle}>Recent maintenance runs</Text>
            {maintenanceRecentRuns.map((run) => (
              <View key={run.id} style={styles.operatorRunRow}>
                <View style={styles.operatorRunHeader}>
                  <Text style={styles.operatorRunWhen}>{new Date(run.createdAt).toLocaleString()}</Text>
                  <View
                    style={[
                      styles.operatorStatusBadge,
                      run.status === 'completed'
                        ? styles.operatorStatusCompleted
                        : (run.status === 'failed'
                          ? styles.operatorStatusFailed
                          : styles.operatorStatusUnavailable),
                    ]}
                  >
                    <Text
                      style={[
                        styles.operatorStatusText,
                        run.status === 'completed'
                          ? styles.operatorStatusTextCompleted
                          : (run.status === 'failed'
                            ? styles.operatorStatusTextFailed
                            : styles.operatorStatusTextUnavailable),
                      ]}
                    >
                      {formatMaintenanceStatusLabel(run.status)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.operatorRunMeta}>
                  {run.dryRun ? 'Dry-run' : 'Live'} · Window {run.maxBackfillDays}d · Wrote {run.backfillRowsWritten} · Deleted {run.legacyRowsDeleted}
                </Text>
                {run.errorMessage ? (
                  <Text style={styles.operatorRunError}>{run.errorMessage}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </AppCard>

      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading paywall metrics...</Text>
        </View>
      )}

      {!loading && error && (
        <AppCard style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not load insights</Text>
          <Text style={styles.errorText}>{error}</Text>
        </AppCard>
      )}

      {!loading && metrics && (
        <>
          <AppCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Translation Usage</Text>
            <Text style={styles.sectionHint}>Adoption of multilingual recap workflows.</Text>
            {translationInsightsError ? (
              <Text style={styles.translationErrorText}>{translationInsightsError}</Text>
            ) : translationInsights ? (
              <>
                <View style={styles.translationSummaryRow}>
                  <View style={styles.translationSummaryPill}>
                    <Text style={styles.summaryLabel}>Translated Meetings</Text>
                    <Text style={styles.summaryValue}>{translationInsights.summary.translatedRecordingCount}</Text>
                  </View>
                  <View style={styles.translationSummaryPill}>
                    <Text style={styles.summaryLabel}>Language Variants</Text>
                    <Text style={styles.summaryValue}>{translationInsights.summary.totalLanguageVariants}</Text>
                  </View>
                </View>
                <View style={styles.translationSummaryRow}>
                  <View style={styles.translationSummaryPill}>
                    <Text style={styles.summaryLabel}>Translatable Meetings</Text>
                    <Text style={styles.summaryValue}>{translationInsights.translatableRecordings}</Text>
                  </View>
                  <View style={styles.translationSummaryPill}>
                    <Text style={styles.summaryLabel}>Coverage</Text>
                    <Text style={styles.summaryValue}>
                      {formatPercent(
                        translationInsights.summary.translatedRecordingCount,
                        translationInsights.translatableRecordings,
                      )}
                    </Text>
                  </View>
                </View>
                {translationInsights.summary.latestTranslationAt && (
                  <Text style={styles.translationMeta}>
                    Last translated: {new Date(translationInsights.summary.latestTranslationAt).toLocaleString()}
                  </Text>
                )}
                {translationInsights.summary.topLanguages.length > 0 && (
                  <View style={styles.translationTopList}>
                    <Text style={styles.translationTopTitle}>Top languages</Text>
                    {translationInsights.summary.topLanguages.slice(0, 6).map((entry) => (
                      <View key={entry.language} style={styles.listRow}>
                        <Text style={styles.listLabel}>{entry.language}</Text>
                        <Text style={styles.listValue}>{entry.count}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.translationGrowthActionWrap}>
                  <Text style={styles.translationGrowthActionTitle}>{translationGrowthCopy.insights.title}</Text>
                  <Text style={styles.translationGrowthActionSubtitle}>{translationGrowthCopy.insights.subtitle}</Text>
                  <AppButton
                    label={openingTranslationCta
                      ? 'Opening...'
                      : (translationInsights.latestTranslatedRecording
                        ? translationGrowthCopy.insights.ctaLabel
                        : translationGrowthCopy.insights.ctaFallbackLabel)}
                    variant="dark"
                    style={styles.translationGrowthActionButton}
                    onPress={() => void openTranslationActionFromInsights()}
                    loading={openingTranslationCta}
                    disabled={openingTranslationCta}
                  />
                </View>
              </>
            ) : (
              <Text style={styles.sectionHint}>No translation analytics loaded yet.</Text>
            )}
          </AppCard>

          <AppCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Translation Funnel Events</Text>
            <Text style={styles.sectionHint}>In-app translation action and sharing conversion.</Text>
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Actions</Text>
                <Text style={styles.summaryValue}>
                  {metrics.translation.byEvent.translation_action_started || 0}
                </Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Ready</Text>
                <Text style={styles.summaryValue}>
                  {metrics.translation.byEvent.translation_content_ready || 0}
                </Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Failed</Text>
                <Text style={styles.summaryValue}>
                  {metrics.translation.byEvent.translation_request_failed || 0}
                </Text>
              </View>
            </View>
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Share Start</Text>
                <Text style={styles.summaryValue}>
                  {metrics.translation.byEvent.translation_share_started || 0}
                </Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Share Done</Text>
                <Text style={styles.summaryValue}>
                  {metrics.translation.byEvent.translation_share_completed || 0}
                </Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Share Fail</Text>
                <Text style={styles.summaryValue}>
                  {metrics.translation.byEvent.translation_share_failed || 0}
                </Text>
              </View>
            </View>
            <Text style={styles.translationMeta}>
              Ready rate:{' '}
              {formatPercent(
                metrics.translation.byEvent.translation_content_ready || 0,
                metrics.translation.byEvent.translation_action_started || 0,
              )}{' '}
              • Share completion:{' '}
              {formatPercent(
                metrics.translation.byEvent.translation_share_completed || 0,
                metrics.translation.byEvent.translation_share_started || 0,
              )}
            </Text>

            {translationTopLanguages.length > 0 && (
              <View style={styles.translationTopList}>
                <Text style={styles.translationTopTitle}>Top requested languages (event stream)</Text>
                {translationTopLanguages.map(([language, count]) => (
                  <View key={language} style={styles.listRow}>
                    <Text style={styles.listLabel}>{language}</Text>
                    <Text style={styles.listValue}>{count}</Text>
                  </View>
                ))}
              </View>
            )}

            {translationTopEvents.length > 0 && (
              <View style={styles.translationTopList}>
                <Text style={styles.translationTopTitle}>Top translation events</Text>
                {translationTopEvents.map(([eventName, count]) => (
                  <View key={eventName} style={styles.listRow}>
                    <Text style={styles.listLabel}>{eventName}</Text>
                    <Text style={styles.listValue}>{count}</Text>
                  </View>
                ))}
              </View>
            )}

            {translationHourlyTrend.length > 0 && (
              <View style={styles.translationTopList}>
                <Text style={styles.translationTopTitle}>Recent hourly trend (UTC)</Text>
                {translationHourlyTrend.map(([hour, count]) => (
                  <View key={hour} style={styles.listRow}>
                    <Text style={styles.listLabel}>{hour}</Text>
                    <Text style={styles.listValue}>{count}</Text>
                  </View>
                ))}
              </View>
            )}
          </AppCard>

          <AppCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Activation Funnel</Text>
            <Text style={styles.sectionHint}>
              Onboarding to first summary conversion with explicit drop-off diagnostics.
            </Text>
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Events Tracked</Text>
                <Text style={styles.summaryValue}>{metrics.activation.total}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Core Completion</Text>
                <Text style={styles.summaryValue}>
                  {formatPercent(
                    metrics.activation.byEvent.summary_generate_completed || 0,
                    metrics.activation.byEvent.onboarding_viewed || 0,
                  )}
                </Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Summary Fail Rate</Text>
                <Text style={styles.summaryValue}>
                  {formatPercent(
                    metrics.activation.byEvent.summary_generate_failed || 0,
                    metrics.activation.byEvent.summary_generate_tapped || 0,
                  )}
                </Text>
              </View>
            </View>
            <View style={styles.activationDiagnosticCallout}>
              <Text style={styles.activationDiagnosticTitle}>{activationBiggestDropoff.message}</Text>
              <Text style={styles.activationDiagnosticBody}>{activationBiggestDropoff.action}</Text>
            </View>
            {activationCoreStageRows.map((row, index) => (
              <View key={`activation-stage-${row.key}`} style={styles.listRow}>
                <View style={styles.activationStageLabelWrap}>
                  <Text style={styles.listLabel}>{index + 1}. {row.label}</Text>
                  <Text style={styles.variantRate}>
                    Step {row.fromPreviousRate} • Start {row.fromStartRate}
                  </Text>
                </View>
                <Text style={styles.listValue}>{row.count}</Text>
              </View>
            ))}
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Share (Translated)</Text>
                <Text style={styles.summaryValue}>
                  {metrics.activation.byEvent.summary_share_translation_tapped || 0}
                </Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Export</Text>
                <Text style={styles.summaryValue}>
                  {metrics.activation.byEvent.summary_export_tapped || 0}
                </Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Copy</Text>
                <Text style={styles.summaryValue}>
                  {metrics.activation.byEvent.summary_copy_tapped || 0}
                </Text>
              </View>
            </View>
            <Text style={styles.translationTopTitle}>Follow-up Reminder Outcomes</Text>
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Reminder Taps</Text>
                <Text style={styles.summaryValue}>{followUpReminderEventCount}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Resend Taps</Text>
                <Text style={styles.summaryValue}>{followUpResendEventCount}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Resend Success</Text>
                <Text style={styles.summaryValue}>
                  {formatPercent(followUpResendSuccessCount, followUpResendSuccessCount + followUpResendFailedCount)}
                </Text>
              </View>
            </View>
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Rec Shown</Text>
                <Text style={styles.summaryValue}>{followUpRecommendationShownCount}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Rec Applied</Text>
                <Text style={styles.summaryValue}>{followUpRecommendationApplyCount}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Rec Apply Rate</Text>
                <Text style={styles.summaryValue}>
                  {formatPercent(followUpRecommendationApplyCount, followUpRecommendationShownCount)}
                </Text>
              </View>
            </View>
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Persona Selections</Text>
                <Text style={styles.summaryValue}>{followUpPersonaSelectEventCount}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Escalation Rule Changes</Text>
                <Text style={styles.summaryValue}>{followUpEscalationTappedEventCount}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Escalated Share</Text>
                <Text style={styles.summaryValue}>
                  {formatPercent(followUpEscalatedResendCount, followUpResendSuccessCount + followUpResendFailedCount)}
                </Text>
              </View>
            </View>
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Escalation Triggers</Text>
                <Text style={styles.summaryValue}>{followUpEscalationTriggeredEventCount}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Rec Success</Text>
                <Text style={styles.summaryValue}>
                  {formatPercent(followUpRecommendedResendSuccessCount, followUpRecommendedResendTotal)}
                </Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Manual Success</Text>
                <Text style={styles.summaryValue}>
                  {formatPercent(followUpManualResendSuccessCount, followUpManualResendTotal)}
                </Text>
              </View>
            </View>
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Strategy Lift</Text>
                <Text style={styles.summaryValue}>{followUpStrategyLiftLabel}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Legacy/Untagged</Text>
                <Text style={styles.summaryValue}>{followUpUntaggedResendTotal}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Legacy Success</Text>
                <Text style={styles.summaryValue}>
                  {formatPercent(followUpUntaggedResendSuccessCount, followUpUntaggedResendTotal)}
                </Text>
              </View>
            </View>
            <Text style={styles.translationMeta}>
              Strategy lift compares tagged resend outcomes (`recommended` vs `manual`); legacy/untagged outcomes are excluded from lift.
            </Text>
            {renderCompactBarSection('Reminder persona selection mix', compactFollowUpPersonaSelections, 'activation')}
            {renderCompactBarSection('Resend outcomes by persona', compactFollowUpResendPersonaOutcomes, 'activation')}
            {renderCompactBarSection('Escalation threshold mix', compactFollowUpEscalationThresholds, 'activation')}
            {followUpReminderCadenceOutcomes.length > 0 && (
              <View style={styles.translationTopList}>
                <Text style={styles.translationTopTitle}>Top reminder cadences</Text>
                {followUpReminderCadenceOutcomes.map(([cadence, count]) => (
                  <View key={`followup-cadence-${cadence}`} style={styles.listRow}>
                    <Text style={styles.listLabel}>{normalizeDisplayLabel(cadence)}</Text>
                    <Text style={styles.listValue}>{count}</Text>
                  </View>
                ))}
              </View>
            )}
            {followUpEscalationToggleOutcomes.length > 0 && (
              <View style={styles.translationTopList}>
                <Text style={styles.translationTopTitle}>Escalation rule toggle mix</Text>
                {followUpEscalationToggleOutcomes.map(([outcome, count]) => (
                  <View key={`followup-escalation-toggle-${outcome}`} style={styles.listRow}>
                    <Text style={styles.listLabel}>{normalizeDisplayLabel(outcome)}</Text>
                    <Text style={styles.listValue}>{count}</Text>
                  </View>
                ))}
              </View>
            )}
            {followUpResendOutcomes.length > 0 && (
              <View style={styles.translationTopList}>
                <Text style={styles.translationTopTitle}>Top resend outcomes</Text>
                {followUpResendOutcomes.map(([outcome, count]) => (
                  <View key={`followup-resend-${outcome}`} style={styles.listRow}>
                    <Text style={styles.listLabel}>{normalizeDisplayLabel(outcome)}</Text>
                    <Text style={styles.listValue}>{count}</Text>
                  </View>
                ))}
              </View>
            )}
            {followUpEscalatedResendOutcomes.length > 0 && (
              <View style={styles.translationTopList}>
                <Text style={styles.translationTopTitle}>Top escalated resend outcomes</Text>
                {followUpEscalatedResendOutcomes.map(([outcome, count]) => (
                  <View key={`followup-resend-escalated-${outcome}`} style={styles.listRow}>
                    <Text style={styles.listLabel}>{normalizeDisplayLabel(outcome)}</Text>
                    <Text style={styles.listValue}>{count}</Text>
                  </View>
                ))}
              </View>
            )}
            {activationTopEvents.length > 0 && (
              <View style={styles.translationTopList}>
                <Text style={styles.translationTopTitle}>Top activation events</Text>
                {activationTopEvents.map(([eventName, count]) => (
                  <View key={`activation-event-${eventName}`} style={styles.listRow}>
                    <Text style={styles.listLabel}>{normalizeDisplayLabel(eventName)}</Text>
                    <Text style={styles.listValue}>{count}</Text>
                  </View>
                ))}
              </View>
            )}
            {renderCompactBarSection('Activation source mix', compactActivationSources, 'activation')}
            {renderCompactBarSection('Activation event-source pairs', compactActivationPairs, 'activation')}
          </AppCard>

          <AppCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Durable Trend Rollups</Text>
            <Text style={styles.sectionHint}>
              Restart-safe daily growth counters for the selected window.
            </Text>
            <View style={styles.translationSummaryRow}>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Persistence</Text>
                <Text style={styles.summaryValue}>
                  {metrics.growthRollups.available ? 'On' : 'Off'}
                </Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Paywall Total</Text>
                <Text style={styles.summaryValue}>{metrics.growthRollups.paywall.total}</Text>
              </View>
              <View style={styles.translationSummaryPill}>
                <Text style={styles.summaryLabel}>Translation Total</Text>
                <Text style={styles.summaryValue}>{metrics.growthRollups.translation.total}</Text>
              </View>
            </View>
            {!metrics.growthRollups.persistenceEnabled && (
              <Text style={styles.translationMeta}>
                Persistence is disabled via backend env (`ENABLE_GROWTH_ROLLUP_PERSISTENCE=false`).
              </Text>
            )}
            {metrics.growthRollups.persistenceEnabled && !metrics.growthRollups.available && (
              <Text style={styles.translationMeta}>
                Persistence is enabled, but rollup storage is unavailable. Apply growth rollup DB migration.
              </Text>
            )}
            {growthDailyTrend.length > 0 && (
              <View style={styles.trendPanel}>
                <View style={styles.trendPanelHead}>
                  <Text style={styles.trendPanelTitle}>14-day momentum (UTC)</Text>
                  <Text style={styles.trendPanelMeta}>
                    P {growthTrendTotal.paywall} · T {growthTrendTotal.translation}
                  </Text>
                </View>
                <View style={styles.sparkLane}>
                  <View style={styles.sparkLaneHead}>
                    <View style={[styles.sparkLegendDot, styles.sparkLegendPaywall]} />
                    <Text style={styles.sparkLaneTitle}>Paywall</Text>
                    <Text style={styles.sparkLaneMeta}>max {growthPaywallDailyMax}</Text>
                  </View>
                  <View style={styles.sparkBarsRail}>
                    {growthDailyTrend.map((row) => (
                      <View key={`trend-paywall-${row.day}`} style={styles.sparkBarSlot}>
                        <View
                          style={[
                            styles.sparkBar,
                            styles.sparkBarPaywall,
                            {
                              height: Math.max(4, Math.round((row.paywall / growthPaywallDailyMax) * 34)),
                            },
                          ]}
                        />
                      </View>
                    ))}
                  </View>
                </View>
                <View style={styles.sparkLane}>
                  <View style={styles.sparkLaneHead}>
                    <View style={[styles.sparkLegendDot, styles.sparkLegendTranslation]} />
                    <Text style={styles.sparkLaneTitle}>Translation</Text>
                    <Text style={styles.sparkLaneMeta}>max {growthTranslationDailyMax}</Text>
                  </View>
                  <View style={styles.sparkBarsRail}>
                    {growthDailyTrend.map((row) => (
                      <View key={`trend-translation-${row.day}`} style={styles.sparkBarSlot}>
                        <View
                          style={[
                            styles.sparkBar,
                            styles.sparkBarTranslation,
                            {
                              height: Math.max(4, Math.round((row.translation / growthTranslationDailyMax) * 34)),
                            },
                          ]}
                        />
                      </View>
                    ))}
                  </View>
                </View>
                <View style={styles.sparkTimelineMeta}>
                  <Text style={styles.sparkTimelineLabel}>{growthTrendStartLabel}</Text>
                  <Text style={styles.sparkTimelineLabel}>{growthTrendEndLabel}</Text>
                </View>
              </View>
            )}
            {renderCompactBarSection('Persisted paywall sources', compactPaywallSources, 'paywall')}
            {renderCompactBarSection('Persisted paywall variants', compactPaywallVariants, 'paywall')}
            {renderCompactBarSection('Persisted translation sources', compactTranslationSources, 'translation')}
            {renderCompactBarSection('Persisted translation languages', compactTranslationLanguages, 'translation')}
            {renderCompactBarSection('Persisted paywall event-variant pairs', compactPaywallPairs, 'paywall')}
            {renderCompactBarSection('Persisted translation event-source pairs', compactTranslationPairs, 'translation')}
          </AppCard>

          <AppCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Variant Funnel</Text>
            <Text style={styles.sectionHint}>View to CTA Tap to Purchase Verified</Text>
            <View style={styles.variantTableHead}>
              <Text style={[styles.tableCell, styles.colVariant]}>Variant</Text>
              <Text style={[styles.tableCell, styles.colMetric]}>Views</Text>
              <Text style={[styles.tableCell, styles.colMetric]}>Taps</Text>
              <Text style={[styles.tableCell, styles.colMetric]}>Verified</Text>
            </View>
            {variantRows.map((row) => (
              <View key={row.variant} style={styles.variantRow}>
                <View style={styles.colVariant}>
                  <Text style={styles.variantName}>{row.variant}</Text>
                  <Text style={styles.variantRate}>Tap {row.tapRate} • Buy {row.purchaseRate}</Text>
                </View>
                <Text style={[styles.tableCell, styles.colMetric]}>{row.views}</Text>
                <Text style={[styles.tableCell, styles.colMetric]}>{row.intents}</Text>
                <Text style={[styles.tableCell, styles.colMetric]}>{row.verified}</Text>
              </View>
            ))}
          </AppCard>

          <AppCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Top Events</Text>
            {topEvents.map(([eventName, count]) => (
              <View key={eventName} style={styles.listRow}>
                <Text style={styles.listLabel}>{eventName}</Text>
                <Text style={styles.listValue}>{count}</Text>
              </View>
            ))}
          </AppCard>

          <AppCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Top Event-Variant Pairs</Text>
            {(metrics.paywall.topEventVariantPairs || []).slice(0, 8).map((entry) => (
              <View key={entry.key} style={styles.listRow}>
                <Text style={styles.listLabel}>{entry.key}</Text>
                <Text style={styles.listValue}>{entry.count}</Text>
              </View>
            ))}
          </AppCard>
        </>
      )}

      {!loading && !metrics && !error && (
        <AppCard style={styles.sectionCard}>
          <Text style={styles.sectionHint}>No metrics loaded yet.</Text>
        </AppCard>
      )}

      <TouchableOpacity style={styles.footerHintWrap} onPress={() => void refreshAll(metricsKey, windowDays, false)}>
        <Text style={styles.footerHint}>Tap to refresh after running new subscription tests.</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  heroCard: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: radii.xl,
  },
  heroTitle: {
    fontSize: 28,
    color: colors.textOnDark,
    fontFamily: typography.display,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textOnDarkMuted,
    fontFamily: typography.body,
  },
  heroMeta: {
    marginTop: 8,
    fontSize: 11,
    color: colors.textOnDarkMuted,
    fontFamily: typography.heading,
  },
  keyCard: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    borderRadius: radii.lg,
  },
  keyInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
    color: colors.textPrimary,
    fontFamily: typography.body,
    fontSize: 13,
  },
  keyActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  keyActionButton: {
    flex: 1,
  },
  keyStatus: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  operatorGuardrail: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
    color: colors.warningText,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: typography.body,
  },
  operatorInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
    color: colors.textPrimary,
    fontFamily: typography.body,
    fontSize: 13,
  },
  operatorError: {
    marginTop: 8,
    fontSize: 12,
    color: colors.danger,
    fontFamily: typography.heading,
  },
  operatorHint: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: typography.body,
  },
  operatorRunRow: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: 10,
    gap: 4,
  },
  operatorRunHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  operatorRunWhen: {
    flex: 1,
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  operatorRunMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  operatorRunError: {
    fontSize: 11,
    color: colors.danger,
    fontFamily: typography.body,
  },
  operatorStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  operatorStatusCompleted: {
    borderColor: '#8bd4ae',
    backgroundColor: '#e8f7ef',
  },
  operatorStatusFailed: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSoft,
  },
  operatorStatusUnavailable: {
    borderColor: '#d8dff0',
    backgroundColor: '#eef2fa',
  },
  operatorStatusText: {
    fontSize: 10,
    fontFamily: typography.heading,
  },
  operatorStatusTextCompleted: {
    color: colors.successDark,
  },
  operatorStatusTextFailed: {
    color: colors.danger,
  },
  operatorStatusTextUnavailable: {
    color: colors.textSecondary,
  },
  summaryCard: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryPill: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  summaryValue: {
    marginTop: 4,
    fontSize: 20,
    color: colors.textPrimary,
    fontFamily: typography.display,
  },
  refreshButton: {
    marginTop: 10,
  },
  windowControlsWrap: {
    marginTop: 10,
    gap: 8,
  },
  windowControlsLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  windowControlsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  windowControlChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  windowControlChipActive: {
    borderColor: colors.surfaceDark,
    backgroundColor: colors.surfaceDark,
  },
  windowControlChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  windowControlChipTextActive: {
    color: colors.textOnDark,
  },
  windowControlHint: {
    flex: 1,
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.body,
    lineHeight: 16,
  },
  windowControlHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  windowControlHintLink: {
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    backgroundColor: colors.accentInfoSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  windowControlHintLinkText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  translationSummaryRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  translationSummaryPill: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: colors.accentInfoSoft,
    alignItems: 'center',
  },
  translationMeta: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  translationTopList: {
    marginTop: 8,
    gap: 4,
  },
  translationTopTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  compactBarSection: {
    marginTop: 10,
    gap: 6,
  },
  compactBarRow: {
    gap: 4,
  },
  compactBarMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  compactBarLabel: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  compactBarCount: {
    fontSize: 12,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  compactBarTrack: {
    height: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.borderMuted,
    overflow: 'hidden',
  },
  compactBarFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  compactBarFillPaywall: {
    backgroundColor: colors.accentStrong,
  },
  compactBarFillTranslation: {
    backgroundColor: colors.success,
  },
  compactBarFillActivation: {
    backgroundColor: colors.warning,
  },
  trendPanel: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: 10,
    gap: 8,
  },
  trendPanelHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  trendPanelTitle: {
    fontSize: 12,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  trendPanelMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  sparkLane: {
    gap: 4,
  },
  sparkLaneHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sparkLegendDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  sparkLegendPaywall: {
    backgroundColor: colors.accentStrong,
  },
  sparkLegendTranslation: {
    backgroundColor: colors.success,
  },
  sparkLaneTitle: {
    flex: 1,
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  sparkLaneMeta: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  sparkBarsRail: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  sparkBarSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sparkBar: {
    width: '78%',
    borderRadius: radii.pill,
    minHeight: 4,
  },
  sparkBarPaywall: {
    backgroundColor: colors.accentStrong,
  },
  sparkBarTranslation: {
    backgroundColor: colors.success,
  },
  sparkTimelineMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sparkTimelineLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  translationErrorText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.danger,
    fontFamily: typography.heading,
  },
  translationGrowthActionWrap: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: 10,
    gap: 6,
  },
  translationGrowthActionTitle: {
    fontSize: 13,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  translationGrowthActionSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    fontFamily: typography.body,
  },
  translationGrowthActionButton: {
    marginTop: 2,
  },
  loadingWrap: {
    marginTop: spacing.lg,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  errorCard: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSoft,
  },
  errorTitle: {
    fontSize: 14,
    color: colors.danger,
    fontFamily: typography.heading,
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
    lineHeight: 18,
  },
  sectionCard: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  sectionHint: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  activationDiagnosticCallout: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  activationDiagnosticTitle: {
    fontSize: 12,
    color: colors.warningText,
    fontFamily: typography.heading,
  },
  activationDiagnosticBody: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    fontFamily: typography.body,
  },
  variantTableHead: {
    marginTop: 12,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
  },
  variantRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tableCell: {
    fontSize: 12,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  colVariant: {
    flex: 1.7,
  },
  colMetric: {
    flex: 1,
    textAlign: 'right',
  },
  variantName: {
    fontSize: 13,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  variantRate: {
    marginTop: 3,
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  listRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  listLabel: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  activationStageLabelWrap: {
    flex: 1,
  },
  listValue: {
    fontSize: 12,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  footerHintWrap: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    alignItems: 'center',
  },
  footerHint: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
});
