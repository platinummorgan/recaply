import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RecordingMetadata } from '../types/recording';

const QUEUE_KEY = '@recaply_upload_queue';
const SETTINGS_KEY = '@recaply_settings';
const PINNED_RECORDING_IDS_KEY = '@recaply_pinned_recording_ids';
const RECORDING_CARD_DENSITY_KEY = '@recaply_recording_card_density';
const FOLLOW_UP_STRATEGY_HISTORY_KEY = '@recaply_followup_strategy_history_v1';
const HIGHLIGHTS_LIBRARY_KEY = '@recaply_highlights_library_v1';
const MAX_HIGHLIGHTS_LIBRARY_ITEMS = 250;

export interface QueuedUpload {
  id: string;
  audioUri: string;
  filename: string;
  timestamp: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  token?: string; // Optional for backward compatibility
  metadata?: RecordingMetadata;
}

export interface AppSettings {
  wifiOnly: boolean;
  allowCellular: boolean;
}

export type RecordingCardDensity = 'compact' | 'detailed';
export type FollowUpMeetingType =
  | 'general'
  | 'project_update'
  | 'sales_call'
  | 'client_success'
  | 'one_on_one'
  | 'interview';
export type FollowUpReminderPersona = 'team' | 'executive' | 'client';
export type FollowUpEscalationThresholdHours = 0 | 24 | 72;
export type SavedHighlightSource = 'summary' | 'action_item' | 'key_point' | 'transcript' | 'follow_up';

export interface SavedHighlight {
  id: string;
  recordingId: string;
  meetingName: string;
  meetingAt?: string;
  source: SavedHighlightSource;
  text: string;
  createdAt: number;
}

export interface SaveHighlightInput {
  recordingId: string;
  meetingName: string;
  meetingAt?: string;
  source: SavedHighlightSource;
  text: string;
}

interface StrategyCounter {
  attempts: number;
  success: number;
}

interface FollowUpMeetingStrategyStats {
  persona: Record<FollowUpReminderPersona, StrategyCounter>;
  threshold: Record<'0' | '24' | '72', StrategyCounter>;
  escalationEnabled: StrategyCounter;
  escalationDisabled: StrategyCounter;
  updatedAt: number;
}

interface FollowUpStrategyHistory {
  version: 1;
  byMeetingType: Partial<Record<FollowUpMeetingType, FollowUpMeetingStrategyStats>>;
}

export interface FollowUpStrategyUsageInput {
  meetingType: FollowUpMeetingType;
  persona: FollowUpReminderPersona;
  escalationEnabled: boolean;
  escalationThresholdHours: FollowUpEscalationThresholdHours;
  success: boolean;
}

export interface FollowUpStrategyRecommendation {
  meetingType: FollowUpMeetingType;
  persona: FollowUpReminderPersona;
  escalationEnabled: boolean;
  escalationThresholdHours: FollowUpEscalationThresholdHours;
  source: 'default' | 'hybrid' | 'historical';
  sampleSize: number;
  reason: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  wifiOnly: false,
  allowCellular: true,
};

const FOLLOW_UP_DEFAULT_STRATEGY_BY_MEETING_TYPE: Record<
  FollowUpMeetingType,
  {
    persona: FollowUpReminderPersona;
    escalationEnabled: boolean;
    escalationThresholdHours: FollowUpEscalationThresholdHours;
  }
> = {
  general: { persona: 'team', escalationEnabled: false, escalationThresholdHours: 24 },
  project_update: { persona: 'team', escalationEnabled: true, escalationThresholdHours: 24 },
  sales_call: { persona: 'executive', escalationEnabled: true, escalationThresholdHours: 24 },
  client_success: { persona: 'client', escalationEnabled: true, escalationThresholdHours: 24 },
  one_on_one: { persona: 'team', escalationEnabled: false, escalationThresholdHours: 24 },
  interview: { persona: 'executive', escalationEnabled: false, escalationThresholdHours: 72 },
};

function normalizeFollowUpMeetingType(value: unknown): FollowUpMeetingType {
  const raw = String(value || '').trim();
  if (
    raw === 'general' ||
    raw === 'project_update' ||
    raw === 'sales_call' ||
    raw === 'client_success' ||
    raw === 'one_on_one' ||
    raw === 'interview'
  ) {
    return raw;
  }
  return 'general';
}

function createCounter(raw?: Partial<StrategyCounter> | null): StrategyCounter {
  return {
    attempts: Math.max(0, Math.floor(Number(raw?.attempts) || 0)),
    success: Math.max(0, Math.floor(Number(raw?.success) || 0)),
  };
}

function createEmptyMeetingStrategyStats(): FollowUpMeetingStrategyStats {
  return {
    persona: {
      team: createCounter(),
      executive: createCounter(),
      client: createCounter(),
    },
    threshold: {
      '0': createCounter(),
      '24': createCounter(),
      '72': createCounter(),
    },
    escalationEnabled: createCounter(),
    escalationDisabled: createCounter(),
    updatedAt: Date.now(),
  };
}

function normalizeMeetingStrategyStats(value: unknown): FollowUpMeetingStrategyStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyMeetingStrategyStats();
  }
  const parsed = value as Record<string, unknown>;
  const personaRaw = parsed.persona && typeof parsed.persona === 'object'
    ? parsed.persona as Record<string, unknown>
    : {};
  const thresholdRaw = parsed.threshold && typeof parsed.threshold === 'object'
    ? parsed.threshold as Record<string, unknown>
    : {};

  return {
    persona: {
      team: createCounter(personaRaw.team as Partial<StrategyCounter>),
      executive: createCounter(personaRaw.executive as Partial<StrategyCounter>),
      client: createCounter(personaRaw.client as Partial<StrategyCounter>),
    },
    threshold: {
      '0': createCounter(thresholdRaw['0'] as Partial<StrategyCounter>),
      '24': createCounter(thresholdRaw['24'] as Partial<StrategyCounter>),
      '72': createCounter(thresholdRaw['72'] as Partial<StrategyCounter>),
    },
    escalationEnabled: createCounter(parsed.escalationEnabled as Partial<StrategyCounter>),
    escalationDisabled: createCounter(parsed.escalationDisabled as Partial<StrategyCounter>),
    updatedAt: Math.max(0, Math.floor(Number(parsed.updatedAt) || Date.now())),
  };
}

function normalizeFollowUpStrategyHistory(value: unknown): FollowUpStrategyHistory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { version: 1, byMeetingType: {} };
  }

  const parsed = value as Record<string, unknown>;
  const byMeetingTypeRaw = parsed.byMeetingType && typeof parsed.byMeetingType === 'object'
    ? parsed.byMeetingType as Record<string, unknown>
    : {};
  const byMeetingType: Partial<Record<FollowUpMeetingType, FollowUpMeetingStrategyStats>> = {};

  for (const [meetingTypeRaw, statsRaw] of Object.entries(byMeetingTypeRaw)) {
    const meetingType = normalizeFollowUpMeetingType(meetingTypeRaw);
    byMeetingType[meetingType] = normalizeMeetingStrategyStats(statsRaw);
  }

  return {
    version: 1,
    byMeetingType,
  };
}

function getCounterSuccessRate(counter: StrategyCounter): number {
  if (!counter.attempts) {
    return 0;
  }
  return counter.success / counter.attempts;
}

function formatMeetingTypeLabel(meetingType: FollowUpMeetingType): string {
  return meetingType.replace(/_/g, ' ');
}

function normalizeHighlightSource(value: unknown): SavedHighlightSource {
  const raw = String(value || '').trim();
  if (
    raw === 'summary'
    || raw === 'action_item'
    || raw === 'key_point'
    || raw === 'transcript'
    || raw === 'follow_up'
  ) {
    return raw;
  }
  return 'summary';
}

function normalizeHighlightText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

function normalizeSavedHighlight(value: unknown): SavedHighlight | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const parsed = value as Record<string, unknown>;
  const recordingId = String(parsed.recordingId || '').trim();
  const meetingName = String(parsed.meetingName || '').trim().slice(0, 120);
  const text = normalizeHighlightText(parsed.text);
  if (!recordingId || !meetingName || !text) {
    return null;
  }

  const id = String(parsed.id || '').trim() || `${Date.now()}`;
  const createdAt = Math.max(0, Math.floor(Number(parsed.createdAt) || Date.now()));
  const meetingAt = String(parsed.meetingAt || '').trim().slice(0, 80);

  return {
    id,
    recordingId,
    meetingName,
    meetingAt: meetingAt || undefined,
    source: normalizeHighlightSource(parsed.source),
    text,
    createdAt,
  };
}

function buildHighlightDedupeKey(highlight: Pick<SavedHighlight, 'recordingId' | 'source' | 'text'>): string {
  return `${highlight.recordingId}__${highlight.source}__${highlight.text.toLowerCase()}`;
}

function normalizeHighlightsLibrary(value: unknown): SavedHighlight[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed = value
    .map((entry) => normalizeSavedHighlight(entry))
    .filter((entry): entry is SavedHighlight => Boolean(entry));
  const seen = new Set<string>();
  const unique: SavedHighlight[] = [];

  for (const entry of parsed) {
    const dedupeKey = buildHighlightDedupeKey(entry);
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    unique.push(entry);
  }

  return unique
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_HIGHLIGHTS_LIBRARY_ITEMS);
}

export function computeFollowUpStrategyRecommendation(
  meetingType: FollowUpMeetingType,
  history: FollowUpStrategyHistory,
): FollowUpStrategyRecommendation {
  const normalizedMeetingType = normalizeFollowUpMeetingType(meetingType);
  const defaults = FOLLOW_UP_DEFAULT_STRATEGY_BY_MEETING_TYPE[normalizedMeetingType];
  const stats = history.byMeetingType[normalizedMeetingType];

  if (!stats) {
    return {
      meetingType: normalizedMeetingType,
      persona: defaults.persona,
      escalationEnabled: defaults.escalationEnabled,
      escalationThresholdHours: defaults.escalationThresholdHours,
      source: 'default',
      sampleSize: 0,
      reason: `Using ${formatMeetingTypeLabel(normalizedMeetingType)} baseline strategy.`,
    };
  }

  let persona = defaults.persona;
  let escalationEnabled = defaults.escalationEnabled;
  let escalationThresholdHours = defaults.escalationThresholdHours;
  let usedHistoryForPersona = false;
  let usedHistoryForEscalation = false;
  let usedHistoryForThreshold = false;

  const personaCandidates = (['team', 'executive', 'client'] as FollowUpReminderPersona[])
    .map((entry) => ({
      persona: entry,
      counter: stats.persona[entry],
      rate: getCounterSuccessRate(stats.persona[entry]),
    }))
    .filter((entry) => entry.counter.attempts >= 2)
    .sort((a, b) => (
      b.rate - a.rate ||
      b.counter.attempts - a.counter.attempts ||
      a.persona.localeCompare(b.persona)
    ));

  if (personaCandidates.length > 0) {
    const bestPersona = personaCandidates[0];
    persona = bestPersona.persona;
    usedHistoryForPersona = true;
  }

  const enabledCounter = stats.escalationEnabled;
  const disabledCounter = stats.escalationDisabled;
  const enabledRate = getCounterSuccessRate(enabledCounter);
  const disabledRate = getCounterSuccessRate(disabledCounter);

  if (enabledCounter.attempts >= 2 || disabledCounter.attempts >= 2) {
    if (enabledCounter.attempts >= 2 && (disabledCounter.attempts < 2 || enabledRate >= disabledRate + 0.05)) {
      escalationEnabled = true;
      usedHistoryForEscalation = true;
    } else if (disabledCounter.attempts >= 2 && (enabledCounter.attempts < 2 || disabledRate >= enabledRate + 0.05)) {
      escalationEnabled = false;
      usedHistoryForEscalation = true;
    }
  }

  if (escalationEnabled) {
    const thresholdCandidates = ([0, 24, 72] as FollowUpEscalationThresholdHours[])
      .map((hours) => {
        const key = String(hours) as '0' | '24' | '72';
        const counter = stats.threshold[key];
        return {
          threshold: hours,
          counter,
          rate: getCounterSuccessRate(counter),
        };
      })
      .filter((entry) => entry.counter.attempts >= 2)
      .sort((a, b) => (
        b.rate - a.rate ||
        b.counter.attempts - a.counter.attempts ||
        a.threshold - b.threshold
      ));
    if (thresholdCandidates.length > 0) {
      escalationThresholdHours = thresholdCandidates[0].threshold;
      usedHistoryForThreshold = true;
    }
  }

  const sampleSize = Object.values(stats.persona).reduce((total, counter) => total + counter.attempts, 0);
  const usedHistoryCount = [usedHistoryForPersona, usedHistoryForEscalation, usedHistoryForThreshold]
    .filter(Boolean)
    .length;
  const source: FollowUpStrategyRecommendation['source'] =
    usedHistoryCount === 0 ? 'default' : usedHistoryCount === 3 ? 'historical' : 'hybrid';

  return {
    meetingType: normalizedMeetingType,
    persona,
    escalationEnabled,
    escalationThresholdHours,
    source,
    sampleSize,
    reason: sampleSize > 0
      ? `Based on ${sampleSize} prior resend attempt(s) for ${formatMeetingTypeLabel(normalizedMeetingType)} meetings.`
      : `Using ${formatMeetingTypeLabel(normalizedMeetingType)} baseline strategy.`,
  };
}

/**
 * Get all pending uploads from queue
 */
export async function getUploadQueue(): Promise<QueuedUpload[]> {
  try {
    const json = await AsyncStorage.getItem(QUEUE_KEY);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.error('Failed to load upload queue:', error);
    return [];
  }
}

/**
 * Add a new recording to the upload queue
 */
export async function addToQueue(
  audioUri: string,
  filename: string,
  token?: string,
  metadata?: RecordingMetadata,
): Promise<string> {
  try {
    const queue = await getUploadQueue();
    const newUpload: QueuedUpload = {
      id: Date.now().toString(),
      audioUri,
      filename,
      timestamp: Date.now(),
      status: 'pending',
    };

    if (token) {
      newUpload.token = token;
    }
    if (metadata) {
      newUpload.metadata = metadata;
    }

    queue.push(newUpload);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    console.log('Added to queue:', newUpload.id);
    return newUpload.id;
  } catch (error) {
    console.error('Failed to add to queue:', error);
    throw error;
  }
}

/**
 * Update status of a queued upload
 */
export async function updateQueueItemStatus(
  id: string,
  status: QueuedUpload['status']
): Promise<void> {
  try {
    const queue = await getUploadQueue();
    const index = queue.findIndex((item) => item.id === id);
    if (index !== -1) {
      queue[index].status = status;
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      console.log('Updated queue item:', id, status);
    }
  } catch (error) {
    console.error('Failed to update queue item:', error);
  }
}

/**
 * Remove an item from the queue
 */
export async function removeFromQueue(id: string): Promise<void> {
  try {
    const queue = await getUploadQueue();
    const filtered = queue.filter((item) => item.id !== id);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
    console.log('Removed from queue:', id);
  } catch (error) {
    console.error('Failed to remove from queue:', error);
  }
}

/**
 * Get app settings
 */
export async function getSettings(): Promise<AppSettings> {
  try {
    const json = await AsyncStorage.getItem(SETTINGS_KEY);
    return json ? { ...DEFAULT_SETTINGS, ...JSON.parse(json) } : DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Failed to load settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Update app settings
 */
export async function updateSettings(settings: Partial<AppSettings>): Promise<void> {
  try {
    const current = await getSettings();
    const updated = { ...current, ...settings };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    console.log('Settings updated:', updated);
  } catch (error) {
    console.error('Failed to update settings:', error);
    throw error;
  }
}

/**
 * Get count of pending uploads
 */
export async function getPendingCount(): Promise<number> {
  const queue = await getUploadQueue();
  return queue.filter((item) => item.status === 'pending').length;
}

/**
 * Clear upload queue metadata from local storage
 */
export async function clearUploadQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch (error) {
    console.error('Failed to clear upload queue:', error);
  }
}

/**
 * Get locally pinned recording IDs.
 */
export async function getPinnedRecordingIds(): Promise<string[]> {
  try {
    const json = await AsyncStorage.getItem(PINNED_RECORDING_IDS_KEY);
    const parsed = json ? JSON.parse(json) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((id) => String(id));
  } catch (error) {
    console.error('Failed to load pinned recording IDs:', error);
    return [];
  }
}

/**
 * Overwrite locally pinned recording IDs.
 */
export async function setPinnedRecordingIds(recordingIds: string[]): Promise<void> {
  try {
    const unique = Array.from(new Set(recordingIds.map((id) => String(id))));
    await AsyncStorage.setItem(PINNED_RECORDING_IDS_KEY, JSON.stringify(unique));
  } catch (error) {
    console.error('Failed to save pinned recording IDs:', error);
    throw error;
  }
}

/**
 * Toggle a single recording pin and return the updated ID list.
 */
export async function togglePinnedRecordingId(recordingId: string): Promise<string[]> {
  const normalizedId = String(recordingId);
  const current = await getPinnedRecordingIds();
  const updated = current.includes(normalizedId)
    ? current.filter((id) => id !== normalizedId)
    : [...current, normalizedId];
  await setPinnedRecordingIds(updated);
  return updated;
}

/**
 * Get preferred recording-card density for Home list rendering.
 */
export async function getRecordingCardDensity(): Promise<RecordingCardDensity> {
  try {
    const value = await AsyncStorage.getItem(RECORDING_CARD_DENSITY_KEY);
    if (value === 'compact' || value === 'detailed') {
      return value;
    }
    return 'detailed';
  } catch (error) {
    console.error('Failed to load recording card density:', error);
    return 'detailed';
  }
}

/**
 * Persist preferred recording-card density for Home list rendering.
 */
export async function setRecordingCardDensity(density: RecordingCardDensity): Promise<void> {
  try {
    await AsyncStorage.setItem(RECORDING_CARD_DENSITY_KEY, density);
  } catch (error) {
    console.error('Failed to save recording card density:', error);
    throw error;
  }
}

/**
 * Load historical follow-up resend strategy performance.
 */
export async function getFollowUpStrategyHistory(): Promise<FollowUpStrategyHistory> {
  try {
    const json = await AsyncStorage.getItem(FOLLOW_UP_STRATEGY_HISTORY_KEY);
    if (!json) {
      return { version: 1, byMeetingType: {} };
    }
    return normalizeFollowUpStrategyHistory(JSON.parse(json));
  } catch (error) {
    console.error('Failed to load follow-up strategy history:', error);
    return { version: 1, byMeetingType: {} };
  }
}

/**
 * Persist resend strategy performance signal for recommendation tuning.
 */
export async function recordFollowUpStrategyUsage(input: FollowUpStrategyUsageInput): Promise<void> {
  try {
    const history = await getFollowUpStrategyHistory();
    const meetingType = normalizeFollowUpMeetingType(input.meetingType);
    const persona = input.persona === 'executive' || input.persona === 'client' ? input.persona : 'team';
    const thresholdHours: FollowUpEscalationThresholdHours =
      input.escalationThresholdHours === 0 || input.escalationThresholdHours === 72
        ? input.escalationThresholdHours
        : 24;
    const thresholdKey = String(thresholdHours) as '0' | '24' | '72';
    const stats = history.byMeetingType[meetingType]
      ? normalizeMeetingStrategyStats(history.byMeetingType[meetingType])
      : createEmptyMeetingStrategyStats();

    stats.persona[persona].attempts += 1;
    if (input.success) {
      stats.persona[persona].success += 1;
    }

    if (input.escalationEnabled) {
      stats.escalationEnabled.attempts += 1;
      stats.threshold[thresholdKey].attempts += 1;
      if (input.success) {
        stats.escalationEnabled.success += 1;
        stats.threshold[thresholdKey].success += 1;
      }
    } else {
      stats.escalationDisabled.attempts += 1;
      if (input.success) {
        stats.escalationDisabled.success += 1;
      }
    }

    stats.updatedAt = Date.now();
    history.byMeetingType[meetingType] = stats;
    await AsyncStorage.setItem(FOLLOW_UP_STRATEGY_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to record follow-up strategy usage:', error);
  }
}

/**
 * Build a follow-up strategy recommendation from meeting type + historical resend outcomes.
 */
export async function getFollowUpStrategyRecommendation(
  meetingType: FollowUpMeetingType,
): Promise<FollowUpStrategyRecommendation> {
  const history = await getFollowUpStrategyHistory();
  return computeFollowUpStrategyRecommendation(meetingType, history);
}

/**
 * Load saved cross-meeting highlights library.
 */
export async function getHighlightsLibrary(): Promise<SavedHighlight[]> {
  try {
    const json = await AsyncStorage.getItem(HIGHLIGHTS_LIBRARY_KEY);
    if (!json) {
      return [];
    }
    return normalizeHighlightsLibrary(JSON.parse(json));
  } catch (error) {
    console.error('Failed to load highlights library:', error);
    return [];
  }
}

/**
 * Save a highlight entry to the local highlights library.
 * Existing matching entries are de-duplicated and returned.
 */
export async function saveHighlightToLibrary(input: SaveHighlightInput): Promise<SavedHighlight | null> {
  const recordingId = String(input.recordingId || '').trim();
  const meetingName = String(input.meetingName || '').trim().slice(0, 120);
  const text = normalizeHighlightText(input.text);
  if (!recordingId || !meetingName || !text) {
    return null;
  }

  const source = normalizeHighlightSource(input.source);
  const meetingAt = String(input.meetingAt || '').trim().slice(0, 80);

  try {
    const existing = await getHighlightsLibrary();
    const candidateKey = buildHighlightDedupeKey({ recordingId, source, text });
    const duplicate = existing.find((entry) => buildHighlightDedupeKey(entry) === candidateKey);
    if (duplicate) {
      return duplicate;
    }

    const createdAt = Date.now();
    const newEntry: SavedHighlight = {
      id: `${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
      recordingId,
      meetingName,
      meetingAt: meetingAt || undefined,
      source,
      text,
      createdAt,
    };

    const updated = [newEntry, ...existing].slice(0, MAX_HIGHLIGHTS_LIBRARY_ITEMS);
    await AsyncStorage.setItem(HIGHLIGHTS_LIBRARY_KEY, JSON.stringify(updated));
    return newEntry;
  } catch (error) {
    console.error('Failed to save highlight to library:', error);
    return null;
  }
}

/**
 * Remove one saved highlight entry by id.
 */
export async function removeHighlightFromLibrary(highlightId: string): Promise<void> {
  const normalizedId = String(highlightId || '').trim();
  if (!normalizedId) {
    return;
  }

  try {
    const library = await getHighlightsLibrary();
    const filtered = library.filter((entry) => entry.id !== normalizedId);
    await AsyncStorage.setItem(HIGHLIGHTS_LIBRARY_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove highlight from library:', error);
  }
}
