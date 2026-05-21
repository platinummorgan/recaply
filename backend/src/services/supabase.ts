import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { logger, serializeError } from './logger';

// Load environment variables first (only needed for local development)
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Validate required environment variables
if (!supabaseUrl) {
  throw new Error('SUPABASE_URL environment variable is required');
}
if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_KEY environment variable is required');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey);
const RECORDINGS_BUCKET = process.env.SUPABASE_RECORDINGS_BUCKET || 'recordings';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  subscription_tier: 'free' | 'lite' | 'pro';
  minutes_used: number;
  minutes_limit: number;
  created_at: string;
}

export interface UsageRecord {
  id: string;
  user_id: string;
  minutes_used: number;
  action_type: 'transcription' | 'summary';
  created_at: string;
}

export interface Recording {
  id: string;
  user_id?: string;
  filename: string;
  transcript: string;
  summary_json?: any;
  translation_cache_json?: Record<string, unknown> | null;
  duration_minutes?: number;
  duration_seconds?: number;
  file_size?: number;
  audio_url?: string;
  meeting_name?: string | null;
  meeting_location?: string | null;
  meeting_context?: string | null;
  meeting_at?: string | null;
  meeting_participants?: string[] | null;
  created_at: string;
}

export interface RecordingMetadata {
  meetingName?: string;
  meetingLocation?: string;
  meetingContext?: string;
  meetingAt?: string;
  meetingParticipants?: string[];
}

export interface PaginatedRecordingsResult {
  recordings: Recording[];
  hasMore: boolean;
  nextOffset: number | null;
}

export type GrowthRollupDomain = 'paywall' | 'translation';

export interface GrowthRollupIncrementPayload {
  domain: GrowthRollupDomain;
  eventName: string;
  source?: string;
  variant?: string;
  tier?: string;
  targetLanguage?: string;
  outcome?: string;
  occurredAt?: string;
  count?: number;
}

export interface GrowthRollupDailyRow {
  day: string;
  paywall: number;
  translation: number;
}

export interface GrowthRollupTopPair {
  key: string;
  count: number;
}

export interface GrowthRollupSnapshot {
  available: boolean;
  persistenceEnabled: boolean;
  windowDays: number;
  paywall: {
    total: number;
    byEvent: Record<string, number>;
    bySource: Record<string, number>;
    byVariant: Record<string, number>;
    byTier: Record<string, number>;
    byOutcome: Record<string, number>;
    byEventVariant: Record<string, number>;
    topEventVariantPairs: GrowthRollupTopPair[];
  };
  translation: {
    total: number;
    byEvent: Record<string, number>;
    bySource: Record<string, number>;
    byLanguage: Record<string, number>;
    byOutcome: Record<string, number>;
    byEventSource: Record<string, number>;
    topEventSourcePairs: GrowthRollupTopPair[];
  };
  daily: GrowthRollupDailyRow[];
}

export interface GrowthRollupMaintenanceOptions {
  maxBackfillDays?: number;
  dryRun?: boolean;
  includeCompaction?: boolean;
}

export interface GrowthRollupMaintenanceResult {
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

export type GrowthRollupMaintenanceStatus = 'completed' | 'unavailable' | 'failed';

export interface GrowthRollupMaintenanceRun {
  id: string;
  status: GrowthRollupMaintenanceStatus;
  dryRun: boolean;
  maxBackfillDays: number;
  includeCompaction: boolean;
  persistenceEnabled: boolean;
  available: boolean;
  backfillRowsWritten: number;
  legacyRowsDeleted: number;
  requestId?: string | null;
  errorName?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface GrowthRollupMaintenanceDiagnostics {
  totalRuns: number;
  completedRuns: number;
  unavailableRuns: number;
  failedRuns: number;
  dryRuns: number;
  liveRuns: number;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
}

export interface GrowthRollupMaintenanceHistorySnapshot {
  available: boolean;
  persistenceEnabled: boolean;
  runs: GrowthRollupMaintenanceRun[];
  diagnostics: GrowthRollupMaintenanceDiagnostics;
}

function isGrowthRollupPersistenceEnabled(): boolean {
  if (process.env.ENABLE_GROWTH_ROLLUP_PERSISTENCE === 'true') {
    return true;
  }
  if (process.env.ENABLE_GROWTH_ROLLUP_PERSISTENCE === 'false') {
    return false;
  }
  return process.env.NODE_ENV !== 'test';
}

function isMissingMetadataColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const maybeError = error as { message?: string; code?: string };
  if (maybeError.code === '42703') {
    return true;
  }
  const message = String(maybeError.message || '').toLowerCase();
  return message.includes('column') && message.includes('meeting_');
}

function isMissingTranslationCacheColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const maybeError = error as { message?: string; code?: string };
  if (maybeError.code === '42703') {
    return true;
  }
  const message = String(maybeError.message || '').toLowerCase();
  return message.includes('column') && message.includes('translation_cache_json');
}

function isMissingGrowthRollupStorageError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const maybeError = error as { message?: string; code?: string; hint?: string };
  const code = String(maybeError.code || '').toUpperCase();
  const message = String(maybeError.message || '').toLowerCase();
  const hint = String(maybeError.hint || '').toLowerCase();

  return (
    code === '42P01'
    || code === '42883'
    || code === 'PGRST202'
    || message.includes('growth_event_rollups')
    || message.includes('growth_rollup_maintenance_runs')
    || message.includes('increment_growth_event_rollup')
    || message.includes('record_growth_rollup_maintenance')
    || hint.includes('increment_growth_event_rollup')
    || hint.includes('record_growth_rollup_maintenance')
  );
}

function normalizeGrowthRollupString(value: string | undefined, maxLength: number): string {
  return String(value || '').trim().toLowerCase().slice(0, maxLength);
}

function parseGrowthRollupDay(value?: string): string {
  const parsed = value ? new Date(value) : new Date();
  const safe = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return safe.toISOString().slice(0, 10);
}

function parseGrowthRollupTimestamp(value?: string): Date {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function incrementGrowthRollupCounter(
  counter: Record<string, number>,
  key: string,
  count: number,
): void {
  if (!key || count <= 0) {
    return;
  }
  counter[key] = (counter[key] || 0) + count;
}

function topGrowthRollupEntries(
  counter: Record<string, number>,
  limit: number = 12,
): GrowthRollupTopPair[] {
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

const GROWTH_ROLLUP_BACKFILL_SOURCE = 'translation_cache_backfill';
const GROWTH_ROLLUP_BACKFILL_EVENT = 'translation_content_ready';
const GROWTH_ROLLUP_BACKFILL_OUTCOME = 'backfilled_cache_v1';
const GROWTH_ROLLUP_BACKFILL_PAGE_SIZE = 500;
const GROWTH_ROLLUP_UPSERT_BATCH_SIZE = 300;
const GROWTH_ROLLUP_MAINTENANCE_DEFAULT_HISTORY_LIMIT = 12;

function normalizeGrowthRollupMaintenanceStatus(
  summary?: GrowthRollupMaintenanceResult | null,
  error?: unknown,
): GrowthRollupMaintenanceStatus {
  if (error) {
    return 'failed';
  }
  if (summary?.available) {
    return 'completed';
  }
  return 'unavailable';
}

function normalizeTranslationCacheLanguage(value: string): string {
  return value.trim().toLowerCase().slice(0, 60);
}

function extractStoragePath(audioPathOrUrl?: string | null): string | null {
  if (!audioPathOrUrl) {
    return null;
  }

  if (!/^https?:\/\//i.test(audioPathOrUrl)) {
    return audioPathOrUrl;
  }

  try {
    const url = new URL(audioPathOrUrl);
    const marker = `/storage/v1/object/public/${RECORDINGS_BUCKET}/`;
    const idx = url.pathname.indexOf(marker);

    if (idx === -1) {
      return null;
    }

    const encodedPath = url.pathname.slice(idx + marker.length);
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

/**
 * Upload audio file to Supabase Storage
 */
export async function uploadAudioFile(
  audioBuffer: Buffer,
  filename: string,
  userId: string
): Promise<string> {
  const filepath = `${userId}/${Date.now()}_${filename}`;

  const { data, error } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .upload(filepath, audioBuffer, {
      contentType: 'audio/m4a',
      cacheControl: '3600',
    });

  if (error) {
    logger.error('supabase_upload_audio_failed', {
      userId,
      filename,
      filepath,
      ...serializeError(error),
    });
    throw new Error('Failed to upload audio file');
  }

  // Return storage path instead of a public URL.
  // Consumers should request a short-lived signed URL before playback.
  return data.path;
}

/**
 * Get a short-lived signed URL for audio playback.
 * Supports legacy public URLs by returning them unchanged.
 */
export async function getSignedAudioUrl(audioPathOrUrl?: string | null): Promise<string | null> {
  if (!audioPathOrUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(audioPathOrUrl)) {
    return audioPathOrUrl;
  }

  const { data, error } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrl(audioPathOrUrl, 60 * 60);

  if (error) {
    logger.error('supabase_signed_audio_url_failed', {
      audioPathOrUrl,
      ...serializeError(error),
    });
    return null;
  }

  return data?.signedUrl || null;
}

/**
 * Save a recording
 */
export async function saveRecording(
  filename: string,
  transcription: string,
  fileSize?: number,
  userId?: string,
  audioUrl?: string,
  metadata?: RecordingMetadata,
): Promise<Recording> {
  const insertData: any = {
    filename,
    transcript: transcription,
  };

  // Add optional fields
  if (fileSize) {
    insertData.file_size = fileSize;
  }
  if (userId) {
    insertData.user_id = userId;
  }
  if (audioUrl) {
    insertData.audio_url = audioUrl;
  }
  if (metadata?.meetingName) {
    insertData.meeting_name = metadata.meetingName;
  }
  if (metadata?.meetingLocation) {
    insertData.meeting_location = metadata.meetingLocation;
  }
  if (metadata?.meetingContext) {
    insertData.meeting_context = metadata.meetingContext;
  }
  if (metadata?.meetingAt) {
    insertData.meeting_at = metadata.meetingAt;
  }
  if (metadata?.meetingParticipants && metadata.meetingParticipants.length > 0) {
    insertData.meeting_participants = metadata.meetingParticipants;
  }

  const runInsert = async (payload: Record<string, unknown>) => (
    supabase
      .from('recordings')
      .insert(payload)
      .select()
      .single()
  );

  let { data, error } = await runInsert(insertData);

  // Backward compatibility: if migration was not applied yet, retry without metadata fields.
  if (error && metadata && isMissingMetadataColumnError(error)) {
    logger.warn('supabase_recording_metadata_columns_missing', {
      userId: userId || null,
      filename,
      ...serializeError(error),
    });
    const fallbackInsertData = { ...insertData };
    delete fallbackInsertData.meeting_name;
    delete fallbackInsertData.meeting_location;
    delete fallbackInsertData.meeting_context;
    delete fallbackInsertData.meeting_at;
    delete fallbackInsertData.meeting_participants;
    const retryResult = await runInsert(fallbackInsertData);
    data = retryResult.data;
    error = retryResult.error;
  }

  if (error || !data) {
    logger.error('supabase_recording_save_failed', {
      userId: userId || null,
      filename,
      ...serializeError(error),
    });
    throw new Error('Failed to save recording');
  }

  return data;
}

/**
 * Update recording with summary
 */
export async function updateRecordingSummary(
  recordingId: string,
  summary: string,
  actionItems: string[],
  keyPoints: string[]
): Promise<void> {
  const summaryData = {
    summary,
    actionItems,
    keyPoints,
  };

  const { error } = await supabase
    .from('recordings')
    .update({
      summary_json: summaryData,
    })
    .eq('id', recordingId);

  if (error) {
    logger.error('supabase_recording_summary_update_failed', {
      recordingId,
      ...serializeError(error),
    });
    throw new Error('Failed to update recording');
  }
}

/**
 * Save translated content cache for a recording and target language.
 * Returns true when cache was persisted, false when skipped or unavailable.
 */
export async function saveRecordingTranslation(
  recordingId: string,
  targetLanguage: string,
  translatedSummary?: Record<string, unknown> | null,
  translatedTranscript?: string | null,
): Promise<boolean> {
  const normalizedLanguage = String(targetLanguage || '').trim().slice(0, 60);
  const cacheKey = normalizeTranslationCacheLanguage(normalizedLanguage);
  const normalizedTranscript = typeof translatedTranscript === 'string'
    ? translatedTranscript.trim()
    : '';

  if (!cacheKey || (!translatedSummary && !normalizedTranscript)) {
    return false;
  }

  const { data: existing, error: existingError } = await supabase
    .from('recordings')
    .select('translation_cache_json')
    .eq('id', recordingId)
    .single();

  if (existingError) {
    if (isMissingTranslationCacheColumnError(existingError)) {
      logger.warn('supabase_recording_translation_cache_column_missing', {
        recordingId,
        ...serializeError(existingError),
      });
      return false;
    }
    logger.error('supabase_recording_translation_cache_fetch_failed', {
      recordingId,
      ...serializeError(existingError),
    });
    throw new Error('Failed to fetch recording translation cache');
  }

  const currentCache =
    existing?.translation_cache_json && typeof existing.translation_cache_json === 'object'
      ? existing.translation_cache_json as Record<string, unknown>
      : {};

  const updatedCache = {
    ...currentCache,
    [cacheKey]: {
      targetLanguage: normalizedLanguage,
      translatedSummary: translatedSummary || null,
      translatedTranscript: normalizedTranscript || null,
      updatedAt: new Date().toISOString(),
    },
  };

  const { error } = await supabase
    .from('recordings')
    .update({
      translation_cache_json: updatedCache,
    })
    .eq('id', recordingId);

  if (error) {
    if (isMissingTranslationCacheColumnError(error)) {
      logger.warn('supabase_recording_translation_cache_column_missing', {
        recordingId,
        ...serializeError(error),
      });
      return false;
    }
    logger.error('supabase_recording_translation_cache_update_failed', {
      recordingId,
      targetLanguage: normalizedLanguage,
      ...serializeError(error),
    });
    throw new Error('Failed to update recording translation cache');
  }

  return true;
}

/**
 * Get all recordings (most recent first)
 */
export async function getRecordings(limit: number = 50): Promise<Recording[]> {
  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('supabase_recordings_fetch_failed', {
      limit,
      ...serializeError(error),
    });
    return [];
  }

  return data || [];
}

/**
 * Get recordings for a specific user
 */
export async function getUserRecordings(
  userId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<PaginatedRecordingsResult> {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  const normalizedOffset = Math.max(0, Math.floor(offset));
  const rangeEnd = normalizedOffset + normalizedLimit; // inclusive end; fetch one extra for hasMore

  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(normalizedOffset, rangeEnd);

  if (error) {
    logger.error('supabase_user_recordings_fetch_failed', {
      userId,
      limit: normalizedLimit,
      offset: normalizedOffset,
      ...serializeError(error),
    });
    return {
      recordings: [],
      hasMore: false,
      nextOffset: null,
    };
  }

  const rows = data || [];
  const hasMore = rows.length > normalizedLimit;
  const recordings = hasMore ? rows.slice(0, normalizedLimit) : rows;

  return {
    recordings,
    hasMore,
    nextOffset: hasMore ? normalizedOffset + normalizedLimit : null,
  };
}

/**
 * Get a single recording by ID
 */
export async function getRecording(recordingId: string): Promise<Recording | null> {
  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .eq('id', recordingId)
    .single();

  if (error) {
    logger.error('supabase_recording_fetch_failed', {
      recordingId,
      ...serializeError(error),
    });
    return null;
  }

  return data;
}

/**
 * Delete a recording by ID
 */
export async function deleteRecording(recordingId: string): Promise<void> {
  const { error } = await supabase
    .from('recordings')
    .delete()
    .eq('id', recordingId);

  if (error) {
    logger.error('supabase_recording_delete_failed', {
      recordingId,
      ...serializeError(error),
    });
    throw new Error('Failed to delete recording');
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    logger.error('supabase_user_fetch_by_id_failed', {
      userId,
      ...serializeError(error),
    });
    return null;
  }

  return data;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    logger.error('supabase_user_fetch_by_email_failed', {
      email,
      ...serializeError(error),
    });
  }

  return data || null;
}

/**
 * Create new user
 */
export async function createUser(
  email: string,
  passwordHash: string
): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      email,
      password_hash: passwordHash,
      subscription_tier: 'free',
      minutes_used: 0,
      minutes_limit: parseInt(process.env.FREE_TIER_MINUTES || '30'),
    })
    .select()
    .single();

  if (error) {
    logger.error('supabase_user_create_failed', {
      email,
      ...serializeError(error),
    });
    throw new Error('Failed to create user');
  }

  return data;
}

/**
 * Update user subscription
 */
export async function updateUserSubscription(
  userId: string,
  tier: 'free' | 'lite' | 'pro',
  minutesLimit: number
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      subscription_tier: tier,
      minutes_limit: minutesLimit,
    })
    .eq('id', userId);

  if (error) {
    logger.error('supabase_subscription_update_failed', {
      userId,
      tier,
      minutesLimit,
      ...serializeError(error),
    });
    throw new Error('Failed to update subscription');
  }
}

/**
 * Check if user has available minutes
 */
export async function hasAvailableMinutes(
  userId: string,
  minutesNeeded: number
): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user) return false;

  if (user.subscription_tier === 'pro') return true; // Unlimited

  // Allow using all available minutes (even if request is slightly over)
  // This prevents edge cases where you have 1 minute left but recording is 1.05 minutes
  const remainingMinutes = user.minutes_limit - user.minutes_used;
  
  // If they have any minutes remaining, allow the upload
  // The deductMinutes function will cap it at the limit
  return remainingMinutes > 0;
}

/**
 * Deduct minutes from user
 */
export async function deductMinutes(
  userId: string,
  minutes: number,
  actionType: 'transcription' | 'summary'
): Promise<void> {
  // Get current usage
  const user = await getUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // For non-pro users, cap at their limit (don't let them go over)
  let minutesToDeduct = minutes;
  if (user.subscription_tier !== 'pro') {
    const remainingMinutes = user.minutes_limit - user.minutes_used;
    minutesToDeduct = Math.min(minutes, remainingMinutes);
  }

  const newMinutesUsed = (user.minutes_used || 0) + minutesToDeduct;

  // Update user minutes
  const { error: updateError } = await supabase
    .from('users')
    .update({ minutes_used: newMinutesUsed })
    .eq('id', userId);

  if (updateError) {
    logger.error('supabase_minutes_update_failed', {
      userId,
      minutes,
      minutesToDeduct,
      newMinutesUsed,
      ...serializeError(updateError),
    });
  }

  // Record usage (record the actual minutes, not capped)
  const { error: insertError } = await supabase
    .from('usage_records')
    .insert({
      user_id: userId,
      minutes_used: minutesToDeduct,
      action_type: actionType,
    });

  if (insertError) {
    logger.error('supabase_usage_record_insert_failed', {
      userId,
      actionType,
      minutesToDeduct,
      ...serializeError(insertError),
    });
  }
}

/**
 * Get user usage stats
 */
export async function getUserUsage(userId: string) {
  const user = await getUserById(userId);
  if (!user) return null;

  return {
    minutesUsed: user.minutes_used,
    minutesLimit: user.minutes_limit,
    minutesRemaining: user.subscription_tier === 'pro'
      ? 'unlimited'
      : user.minutes_limit - user.minutes_used,
    subscriptionTier: user.subscription_tier,
  };
}

/**
 * Increment durable daily growth rollups.
 * Uses a database-side function for atomic increment semantics.
 */
export async function incrementGrowthEventRollup(
  payload: GrowthRollupIncrementPayload,
): Promise<boolean> {
  if (!isGrowthRollupPersistenceEnabled()) {
    return false;
  }

  const eventName = normalizeGrowthRollupString(payload.eventName, 80);
  if (!eventName) {
    return false;
  }

  const day = parseGrowthRollupDay(payload.occurredAt);
  const source = normalizeGrowthRollupString(payload.source, 80) || 'unknown';
  const variant = normalizeGrowthRollupString(payload.variant, 40);
  const tier = normalizeGrowthRollupString(payload.tier, 30);
  const targetLanguage = normalizeGrowthRollupString(payload.targetLanguage, 60);
  const outcome = normalizeGrowthRollupString(payload.outcome, 60);
  const count = Math.max(1, Math.floor(Number(payload.count) || 1));

  const { error } = await supabase.rpc('increment_growth_event_rollup', {
    p_day: day,
    p_domain: payload.domain,
    p_event_name: eventName,
    p_source: source,
    p_variant: variant,
    p_tier: tier,
    p_target_language: targetLanguage,
    p_outcome: outcome,
    p_count: count,
  });

  if (error) {
    if (isMissingGrowthRollupStorageError(error)) {
      logger.warn('supabase_growth_rollup_storage_unavailable', {
        day,
        domain: payload.domain,
        eventName,
        ...serializeError(error),
      });
      return false;
    }

    logger.error('supabase_growth_rollup_increment_failed', {
      day,
      domain: payload.domain,
      eventName,
      source,
      variant: variant || null,
      tier: tier || null,
      targetLanguage: targetLanguage || null,
      outcome: outcome || null,
      ...serializeError(error),
    });
    throw new Error('Failed to increment growth rollup');
  }

  return true;
}

function createEmptyGrowthRollupMaintenanceResult(
  persistenceEnabled: boolean,
  dryRun: boolean,
  maxBackfillDays: number,
): GrowthRollupMaintenanceResult {
  return {
    persistenceEnabled,
    available: false,
    dryRun,
    maxBackfillDays,
    backfill: {
      recordingsScanned: 0,
      translationEntriesScanned: 0,
      bucketsPrepared: 0,
      eventsPrepared: 0,
      rowsCleared: 0,
      rowsWritten: 0,
    },
    compaction: {
      attempted: false,
      legacyRowsFound: 0,
      legacyRowsDeleted: 0,
      compactedRowsWritten: 0,
    },
  };
}

/**
 * Run optional growth rollup continuity maintenance:
 * - backfill translation growth rows from existing recording translation cache
 * - compact legacy backfill outcomes in the maintained day window
 */
export async function runGrowthRollupContinuityMaintenance(
  options: GrowthRollupMaintenanceOptions = {},
): Promise<GrowthRollupMaintenanceResult> {
  const persistenceEnabled = isGrowthRollupPersistenceEnabled();
  const dryRun = Boolean(options.dryRun);
  const includeCompaction = options.includeCompaction !== false;
  const maxBackfillDays = Math.min(3650, Math.max(1, Math.floor(Number(options.maxBackfillDays) || 365)));
  const result = createEmptyGrowthRollupMaintenanceResult(persistenceEnabled, dryRun, maxBackfillDays);

  if (!persistenceEnabled) {
    return result;
  }

  const since = parseGrowthRollupTimestamp();
  since.setUTCDate(since.getUTCDate() - (maxBackfillDays - 1));
  const sinceIso = since.toISOString();
  const sinceDay = sinceIso.slice(0, 10);

  const backfillKeyCounts = new Map<string, number>();
  let offset = 0;

  try {
    while (true) {
      const { data, error } = await supabase
        .from('recordings')
        .select('created_at, translation_cache_json')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true })
        .range(offset, offset + GROWTH_ROLLUP_BACKFILL_PAGE_SIZE - 1);

      if (error) {
        if (isMissingTranslationCacheColumnError(error) || isMissingGrowthRollupStorageError(error)) {
          logger.warn('supabase_growth_rollup_backfill_unavailable', {
            sinceDay,
            maxBackfillDays,
            ...serializeError(error),
          });
          return result;
        }
        logger.error('supabase_growth_rollup_backfill_fetch_failed', {
          sinceDay,
          maxBackfillDays,
          offset,
          ...serializeError(error),
        });
        throw new Error('Failed to read recordings for growth rollup backfill');
      }

      const rows = data || [];
      if (rows.length === 0) {
        break;
      }

      for (const row of rows as Array<Record<string, unknown>>) {
        result.backfill.recordingsScanned += 1;
        const createdAtDay = parseGrowthRollupDay(String(row.created_at || ''));
        const cacheRaw = row.translation_cache_json;
        if (!cacheRaw || typeof cacheRaw !== 'object' || Array.isArray(cacheRaw)) {
          continue;
        }

        for (const [cacheLanguageKey, cacheEntryRaw] of Object.entries(cacheRaw as Record<string, unknown>)) {
          result.backfill.translationEntriesScanned += 1;
          const cacheEntry = cacheEntryRaw && typeof cacheEntryRaw === 'object'
            ? cacheEntryRaw as Record<string, unknown>
            : null;
          const language =
            normalizeGrowthRollupString(
              typeof cacheEntry?.targetLanguage === 'string'
                ? cacheEntry.targetLanguage
                : cacheLanguageKey,
              60,
            )
            || normalizeGrowthRollupString(cacheLanguageKey, 60);
          if (!language) {
            continue;
          }

          const entryDay = parseGrowthRollupDay(
            typeof cacheEntry?.updatedAt === 'string' ? cacheEntry.updatedAt : createdAtDay,
          );
          if (entryDay < sinceDay) {
            continue;
          }
          const bucketKey = `${entryDay}|${language}`;
          backfillKeyCounts.set(bucketKey, (backfillKeyCounts.get(bucketKey) || 0) + 1);
        }
      }

      if (rows.length < GROWTH_ROLLUP_BACKFILL_PAGE_SIZE) {
        break;
      }
      offset += GROWTH_ROLLUP_BACKFILL_PAGE_SIZE;
    }

    result.backfill.bucketsPrepared = backfillKeyCounts.size;
    result.backfill.eventsPrepared = Array.from(backfillKeyCounts.values()).reduce((acc, value) => acc + value, 0);

    const { count: existingBackfillRowCount, error: existingBackfillCountError } = await supabase
      .from('growth_event_rollups')
      .select('*', { count: 'exact', head: true })
      .eq('domain', 'translation')
      .eq('event_name', GROWTH_ROLLUP_BACKFILL_EVENT)
      .eq('source', GROWTH_ROLLUP_BACKFILL_SOURCE)
      .eq('outcome', GROWTH_ROLLUP_BACKFILL_OUTCOME)
      .gte('day', sinceDay);

    if (existingBackfillCountError) {
      if (isMissingGrowthRollupStorageError(existingBackfillCountError)) {
        logger.warn('supabase_growth_rollup_storage_unavailable', {
          sinceDay,
          ...serializeError(existingBackfillCountError),
        });
        return result;
      }
      logger.error('supabase_growth_rollup_backfill_count_failed', {
        sinceDay,
        ...serializeError(existingBackfillCountError),
      });
      throw new Error('Failed to inspect existing growth rollup backfill rows');
    }

    result.backfill.rowsCleared = Math.max(0, Number(existingBackfillRowCount) || 0);

    if (!dryRun && result.backfill.rowsCleared > 0) {
      const { error: clearError } = await supabase
        .from('growth_event_rollups')
        .delete()
        .eq('domain', 'translation')
        .eq('event_name', GROWTH_ROLLUP_BACKFILL_EVENT)
        .eq('source', GROWTH_ROLLUP_BACKFILL_SOURCE)
        .eq('outcome', GROWTH_ROLLUP_BACKFILL_OUTCOME)
        .gte('day', sinceDay);

      if (clearError) {
        if (isMissingGrowthRollupStorageError(clearError)) {
          logger.warn('supabase_growth_rollup_storage_unavailable', {
            sinceDay,
            ...serializeError(clearError),
          });
          return result;
        }
        logger.error('supabase_growth_rollup_backfill_clear_failed', {
          sinceDay,
          ...serializeError(clearError),
        });
        throw new Error('Failed to clear existing growth rollup backfill rows');
      }
    }

    const preparedRows = Array.from(backfillKeyCounts.entries()).map(([bucketKey, count]) => {
      const [day, targetLanguage] = bucketKey.split('|');
      return {
        day,
        domain: 'translation',
        event_name: GROWTH_ROLLUP_BACKFILL_EVENT,
        source: GROWTH_ROLLUP_BACKFILL_SOURCE,
        variant: '',
        tier: '',
        target_language: targetLanguage || '',
        outcome: GROWTH_ROLLUP_BACKFILL_OUTCOME,
        count,
      };
    });

    result.backfill.rowsWritten = preparedRows.length;

    if (!dryRun && preparedRows.length > 0) {
      for (let i = 0; i < preparedRows.length; i += GROWTH_ROLLUP_UPSERT_BATCH_SIZE) {
        const chunk = preparedRows.slice(i, i + GROWTH_ROLLUP_UPSERT_BATCH_SIZE);
        const { error: upsertError } = await supabase
          .from('growth_event_rollups')
          .upsert(chunk, {
            onConflict: 'day,domain,event_name,source,variant,tier,target_language,outcome',
          });

        if (upsertError) {
          if (isMissingGrowthRollupStorageError(upsertError)) {
            logger.warn('supabase_growth_rollup_storage_unavailable', {
              sinceDay,
              ...serializeError(upsertError),
            });
            return result;
          }
          logger.error('supabase_growth_rollup_backfill_upsert_failed', {
            sinceDay,
            chunkSize: chunk.length,
            ...serializeError(upsertError),
          });
          throw new Error('Failed to write growth rollup backfill rows');
        }
      }
    }

    if (includeCompaction) {
      result.compaction.attempted = true;
      const { count: legacyCount, error: legacyCountError } = await supabase
        .from('growth_event_rollups')
        .select('*', { count: 'exact', head: true })
        .eq('domain', 'translation')
        .eq('event_name', GROWTH_ROLLUP_BACKFILL_EVENT)
        .eq('source', GROWTH_ROLLUP_BACKFILL_SOURCE)
        .neq('outcome', GROWTH_ROLLUP_BACKFILL_OUTCOME)
        .gte('day', sinceDay);

      if (legacyCountError) {
        if (isMissingGrowthRollupStorageError(legacyCountError)) {
          logger.warn('supabase_growth_rollup_storage_unavailable', {
            sinceDay,
            ...serializeError(legacyCountError),
          });
          return result;
        }
        logger.error('supabase_growth_rollup_compaction_count_failed', {
          sinceDay,
          ...serializeError(legacyCountError),
        });
        throw new Error('Failed to inspect legacy growth rollup rows');
      }

      result.compaction.legacyRowsFound = Math.max(0, Number(legacyCount) || 0);
      result.compaction.compactedRowsWritten = 0;

      if (!dryRun && result.compaction.legacyRowsFound > 0) {
        const { error: legacyDeleteError } = await supabase
          .from('growth_event_rollups')
          .delete()
          .eq('domain', 'translation')
          .eq('event_name', GROWTH_ROLLUP_BACKFILL_EVENT)
          .eq('source', GROWTH_ROLLUP_BACKFILL_SOURCE)
          .neq('outcome', GROWTH_ROLLUP_BACKFILL_OUTCOME)
          .gte('day', sinceDay);

        if (legacyDeleteError) {
          if (isMissingGrowthRollupStorageError(legacyDeleteError)) {
            logger.warn('supabase_growth_rollup_storage_unavailable', {
              sinceDay,
              ...serializeError(legacyDeleteError),
            });
            return result;
          }
          logger.error('supabase_growth_rollup_compaction_delete_failed', {
            sinceDay,
            ...serializeError(legacyDeleteError),
          });
          throw new Error('Failed to compact legacy growth rollup rows');
        }
        result.compaction.legacyRowsDeleted = result.compaction.legacyRowsFound;
      }
    }

    result.available = true;
    return result;
  } catch (error: any) {
    logger.error('supabase_growth_rollup_maintenance_failed', {
      sinceDay,
      maxBackfillDays,
      dryRun,
      includeCompaction,
      ...serializeError(error),
    });
    throw new Error('Failed to run growth rollup continuity maintenance');
  }
}

interface RecordGrowthRollupMaintenanceRunInput {
  requestId?: string | null;
  summary?: GrowthRollupMaintenanceResult | null;
  dryRun: boolean;
  maxBackfillDays: number;
  includeCompaction: boolean;
  error?: unknown;
}

function createEmptyGrowthRollupMaintenanceDiagnostics(): GrowthRollupMaintenanceDiagnostics {
  return {
    totalRuns: 0,
    completedRuns: 0,
    unavailableRuns: 0,
    failedRuns: 0,
    dryRuns: 0,
    liveRuns: 0,
    lastFailureAt: null,
    lastFailureMessage: null,
  };
}

function computeGrowthRollupMaintenanceDiagnostics(
  runs: GrowthRollupMaintenanceRun[],
): GrowthRollupMaintenanceDiagnostics {
  const diagnostics = createEmptyGrowthRollupMaintenanceDiagnostics();
  diagnostics.totalRuns = runs.length;

  for (const run of runs) {
    if (run.status === 'completed') {
      diagnostics.completedRuns += 1;
    } else if (run.status === 'unavailable') {
      diagnostics.unavailableRuns += 1;
    } else if (run.status === 'failed') {
      diagnostics.failedRuns += 1;
      if (!diagnostics.lastFailureAt) {
        diagnostics.lastFailureAt = run.createdAt;
        diagnostics.lastFailureMessage = run.errorMessage || null;
      }
    }

    if (run.dryRun) {
      diagnostics.dryRuns += 1;
    } else {
      diagnostics.liveRuns += 1;
    }
  }

  return diagnostics;
}

/**
 * Persist one maintenance execution summary for operator history.
 */
export async function recordGrowthRollupMaintenanceRun(
  input: RecordGrowthRollupMaintenanceRunInput,
): Promise<boolean> {
  if (!isGrowthRollupPersistenceEnabled()) {
    return false;
  }

  const summary = input.summary || createEmptyGrowthRollupMaintenanceResult(
    true,
    input.dryRun,
    input.maxBackfillDays,
  );
  const serializedError = input.error ? serializeError(input.error) : {};
  const status = normalizeGrowthRollupMaintenanceStatus(summary, input.error);

  const payload = {
    request_id: String(input.requestId || '').trim().slice(0, 80) || null,
    status,
    dry_run: Boolean(input.dryRun),
    max_backfill_days: Math.min(3650, Math.max(1, Math.floor(Number(input.maxBackfillDays) || 365))),
    include_compaction: Boolean(input.includeCompaction),
    persistence_enabled: Boolean(summary.persistenceEnabled),
    available: Boolean(summary.available),
    backfill_rows_written: Math.max(0, Number(summary.backfill?.rowsWritten) || 0),
    legacy_rows_deleted: Math.max(0, Number(summary.compaction?.legacyRowsDeleted) || 0),
    summary_json: summary,
    error_name: String((serializedError as any).errorName || '').trim().slice(0, 120) || null,
    error_message: String((serializedError as any).errorMessage || '').trim().slice(0, 2000) || null,
  };

  const { error } = await supabase
    .from('growth_rollup_maintenance_runs')
    .insert(payload);

  if (error) {
    if (isMissingGrowthRollupStorageError(error)) {
      logger.warn('supabase_growth_rollup_maintenance_history_unavailable', {
        status,
        ...serializeError(error),
      });
      return false;
    }
    logger.error('supabase_growth_rollup_maintenance_history_insert_failed', {
      status,
      ...serializeError(error),
    });
    return false;
  }

  return true;
}

/**
 * Retrieve recent maintenance runs for operator diagnostics.
 */
export async function getGrowthRollupMaintenanceHistory(
  limit: number = GROWTH_ROLLUP_MAINTENANCE_DEFAULT_HISTORY_LIMIT,
): Promise<GrowthRollupMaintenanceHistorySnapshot> {
  const persistenceEnabled = isGrowthRollupPersistenceEnabled();
  const normalizedLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || GROWTH_ROLLUP_MAINTENANCE_DEFAULT_HISTORY_LIMIT)));
  const emptyDiagnostics = createEmptyGrowthRollupMaintenanceDiagnostics();

  const emptySnapshot: GrowthRollupMaintenanceHistorySnapshot = {
    available: false,
    persistenceEnabled,
    runs: [],
    diagnostics: emptyDiagnostics,
  };

  if (!persistenceEnabled) {
    return emptySnapshot;
  }

  const { data, error } = await supabase
    .from('growth_rollup_maintenance_runs')
    .select(
      'id, status, dry_run, max_backfill_days, include_compaction, persistence_enabled, available, backfill_rows_written, legacy_rows_deleted, request_id, error_name, error_message, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(normalizedLimit);

  if (error) {
    if (isMissingGrowthRollupStorageError(error)) {
      logger.warn('supabase_growth_rollup_maintenance_history_unavailable', {
        limit: normalizedLimit,
        ...serializeError(error),
      });
      return emptySnapshot;
    }
    logger.error('supabase_growth_rollup_maintenance_history_fetch_failed', {
      limit: normalizedLimit,
      ...serializeError(error),
    });
    return emptySnapshot;
  }

  const runs = (data || [])
    .map((row: any): GrowthRollupMaintenanceRun | null => {
      const statusRaw = String(row?.status || '').toLowerCase();
      const status: GrowthRollupMaintenanceStatus =
        statusRaw === 'completed' || statusRaw === 'failed' || statusRaw === 'unavailable'
          ? statusRaw
          : 'unavailable';
      const id = String(row?.id || '').trim();
      const createdAt = String(row?.created_at || '').trim();
      if (!id || !createdAt) {
        return null;
      }
      return {
        id,
        status,
        dryRun: Boolean(row?.dry_run),
        maxBackfillDays: Math.min(3650, Math.max(1, Number(row?.max_backfill_days) || 365)),
        includeCompaction: Boolean(row?.include_compaction),
        persistenceEnabled: Boolean(row?.persistence_enabled),
        available: Boolean(row?.available),
        backfillRowsWritten: Math.max(0, Number(row?.backfill_rows_written) || 0),
        legacyRowsDeleted: Math.max(0, Number(row?.legacy_rows_deleted) || 0),
        requestId: typeof row?.request_id === 'string' ? row.request_id : null,
        errorName: typeof row?.error_name === 'string' ? row.error_name : null,
        errorMessage: typeof row?.error_message === 'string' ? row.error_message : null,
        createdAt,
      };
    })
    .filter((entry): entry is GrowthRollupMaintenanceRun => Boolean(entry));

  return {
    available: true,
    persistenceEnabled,
    runs,
    diagnostics: computeGrowthRollupMaintenanceDiagnostics(runs),
  };
}

/**
 * Get persisted growth rollups for a trailing day window.
 */
export async function getGrowthRollupSnapshot(windowDays: number = 7): Promise<GrowthRollupSnapshot> {
  const normalizedWindowDays = Math.min(30, Math.max(1, Math.floor(Number(windowDays) || 7)));
  const persistenceEnabled = isGrowthRollupPersistenceEnabled();

  const emptySnapshot: GrowthRollupSnapshot = {
    available: false,
    persistenceEnabled,
    windowDays: normalizedWindowDays,
    paywall: {
      total: 0,
      byEvent: {},
      bySource: {},
      byVariant: {},
      byTier: {},
      byOutcome: {},
      byEventVariant: {},
      topEventVariantPairs: [],
    },
    translation: {
      total: 0,
      byEvent: {},
      bySource: {},
      byLanguage: {},
      byOutcome: {},
      byEventSource: {},
      topEventSourcePairs: [],
    },
    daily: [],
  };

  if (!persistenceEnabled) {
    return emptySnapshot;
  }

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (normalizedWindowDays - 1));
  const sinceDay = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('growth_event_rollups')
    .select('day, domain, event_name, source, variant, tier, target_language, outcome, count')
    .gte('day', sinceDay)
    .order('day', { ascending: true });

  if (error) {
    if (isMissingGrowthRollupStorageError(error)) {
      logger.warn('supabase_growth_rollup_storage_unavailable', {
        sinceDay,
        windowDays: normalizedWindowDays,
        ...serializeError(error),
      });
      return emptySnapshot;
    }

    logger.error('supabase_growth_rollup_snapshot_fetch_failed', {
      sinceDay,
      windowDays: normalizedWindowDays,
      ...serializeError(error),
    });
    return emptySnapshot;
  }

  const paywallByEvent: Record<string, number> = {};
  const paywallBySource: Record<string, number> = {};
  const paywallByVariant: Record<string, number> = {};
  const paywallByTier: Record<string, number> = {};
  const paywallByOutcome: Record<string, number> = {};
  const paywallByEventVariant: Record<string, number> = {};
  const translationByEvent: Record<string, number> = {};
  const translationBySource: Record<string, number> = {};
  const translationByLanguage: Record<string, number> = {};
  const translationByOutcome: Record<string, number> = {};
  const translationByEventSource: Record<string, number> = {};
  const dailyMap = new Map<string, GrowthRollupDailyRow>();
  let paywallTotal = 0;
  let translationTotal = 0;

  for (const row of data || []) {
    const day = String((row as any)?.day || '').slice(0, 10);
    const domain = String((row as any)?.domain || '').toLowerCase();
    const eventName = String((row as any)?.event_name || '').trim();
    const source = String((row as any)?.source || '').trim().toLowerCase() || 'unknown';
    const variant = String((row as any)?.variant || '').trim().toLowerCase();
    const tier = String((row as any)?.tier || '').trim().toLowerCase();
    const targetLanguage = String((row as any)?.target_language || '').trim().toLowerCase();
    const outcome = String((row as any)?.outcome || '').trim().toLowerCase();
    const count = Math.max(0, Number((row as any)?.count) || 0);

    if (!day || !eventName || !count) {
      continue;
    }

    if (domain === 'paywall') {
      paywallTotal += count;
      const paywallVariant = variant || 'unknown';
      incrementGrowthRollupCounter(paywallByEvent, eventName, count);
      incrementGrowthRollupCounter(paywallBySource, source, count);
      incrementGrowthRollupCounter(paywallByVariant, paywallVariant, count);
      incrementGrowthRollupCounter(paywallByOutcome, outcome, count);
      incrementGrowthRollupCounter(paywallByEventVariant, `${eventName}|${paywallVariant}`, count);
      if (tier) {
        incrementGrowthRollupCounter(paywallByTier, tier, count);
      }
    } else if (domain === 'translation') {
      translationTotal += count;
      incrementGrowthRollupCounter(translationByEvent, eventName, count);
      incrementGrowthRollupCounter(translationBySource, source, count);
      incrementGrowthRollupCounter(translationByOutcome, outcome, count);
      incrementGrowthRollupCounter(translationByEventSource, `${eventName}|${source}`, count);
      if (targetLanguage) {
        incrementGrowthRollupCounter(translationByLanguage, targetLanguage, count);
      }
    } else {
      continue;
    }

    const existing = dailyMap.get(day) || { day, paywall: 0, translation: 0 };
    if (domain === 'paywall') {
      existing.paywall += count;
    } else {
      existing.translation += count;
    }
    dailyMap.set(day, existing);
  }

  return {
    available: true,
    persistenceEnabled,
    windowDays: normalizedWindowDays,
    paywall: {
      total: paywallTotal,
      byEvent: paywallByEvent,
      bySource: paywallBySource,
      byVariant: paywallByVariant,
      byTier: paywallByTier,
      byOutcome: paywallByOutcome,
      byEventVariant: paywallByEventVariant,
      topEventVariantPairs: topGrowthRollupEntries(paywallByEventVariant),
    },
    translation: {
      total: translationTotal,
      byEvent: translationByEvent,
      bySource: translationBySource,
      byLanguage: translationByLanguage,
      byOutcome: translationByOutcome,
      byEventSource: translationByEventSource,
      topEventSourcePairs: topGrowthRollupEntries(translationByEventSource),
    },
    daily: (() => {
      const rows: GrowthRollupDailyRow[] = [];
      const cursor = parseGrowthRollupTimestamp(sinceDay);
      for (let i = 0; i < normalizedWindowDays; i += 1) {
        const day = cursor.toISOString().slice(0, 10);
        rows.push(dailyMap.get(day) || { day, paywall: 0, translation: 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return rows;
    })(),
  };
}

/**
 * Reset monthly usage (call this monthly via cron)
 */
export async function resetMonthlyUsage(): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ minutes_used: 0 })
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all

  if (error) {
    logger.error('supabase_usage_reset_failed', {
      ...serializeError(error),
    });
  }
}

/**
 * Permanently delete a user account and associated data.
 * This removes recordings, usage, user row, and storage objects.
 */
export async function deleteUserAccountData(userId: string): Promise<{
  deletedUser: boolean;
  deletedStorageObjects: number;
}> {
  const { data: recordings, error: recordingsError } = await supabase
    .from('recordings')
    .select('audio_url')
    .eq('user_id', userId);

  if (recordingsError) {
    logger.error('supabase_account_delete_recordings_fetch_failed', {
      userId,
      ...serializeError(recordingsError),
    });
    throw new Error('Failed to prepare account deletion');
  }

  const storagePaths = (recordings || [])
    .map((recording: Pick<Recording, 'audio_url'>) => extractStoragePath(recording.audio_url))
    .filter((path): path is string => !!path);

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(RECORDINGS_BUCKET)
      .remove(storagePaths);

    if (storageError) {
      logger.error('supabase_account_delete_storage_failed', {
        userId,
        storagePathCount: storagePaths.length,
        ...serializeError(storageError),
      });
      throw new Error('Failed to delete account storage files');
    }
  }

  const { error: deleteUsageError } = await supabase
    .from('usage_records')
    .delete()
    .eq('user_id', userId);

  if (deleteUsageError) {
    logger.error('supabase_account_delete_usage_failed', {
      userId,
      ...serializeError(deleteUsageError),
    });
    throw new Error('Failed to delete account usage records');
  }

  const { error: deleteRecordingsError } = await supabase
    .from('recordings')
    .delete()
    .eq('user_id', userId);

  if (deleteRecordingsError) {
    logger.error('supabase_account_delete_recordings_failed', {
      userId,
      ...serializeError(deleteRecordingsError),
    });
    throw new Error('Failed to delete account recordings');
  }

  const { error: deleteUserError } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);

  if (deleteUserError) {
    logger.error('supabase_account_delete_user_failed', {
      userId,
      ...serializeError(deleteUserError),
    });
    throw new Error('Failed to delete user account');
  }

  return {
    deletedUser: true,
    deletedStorageObjects: storagePaths.length,
  };
}

export default supabase;
