import AsyncStorage from '@react-native-async-storage/async-storage';

export const FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT_STORAGE_KEY = '@recaply_followup_strategy_tagging_live_at';
export const DEFAULT_FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT = '2026-05-20T00:00:00.000Z';

function normalizeDateOnlyInput(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const iso = `${value}T00:00:00.000Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  if (parsed.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return iso;
}

export function normalizeFollowUpStrategyTaggingLiveAt(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const dateOnly = normalizeDateOnlyInput(trimmed);
  if (dateOnly) {
    return dateOnly;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

export function toDateInputValue(isoValue: string): string {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    return DEFAULT_FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT.slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

export async function getFollowUpStrategyTaggingLiveAt(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT;
    }
    return normalizeFollowUpStrategyTaggingLiveAt(raw) || DEFAULT_FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT;
  } catch {
    return DEFAULT_FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT;
  }
}

export async function setFollowUpStrategyTaggingLiveAt(value: string): Promise<string> {
  const normalized = normalizeFollowUpStrategyTaggingLiveAt(value);
  if (!normalized) {
    throw new Error('Enter a valid date (YYYY-MM-DD).');
  }
  await AsyncStorage.setItem(FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT_STORAGE_KEY, normalized);
  return normalized;
}

export async function resetFollowUpStrategyTaggingLiveAt(): Promise<string> {
  await AsyncStorage.removeItem(FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT_STORAGE_KEY);
  return DEFAULT_FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT;
}
