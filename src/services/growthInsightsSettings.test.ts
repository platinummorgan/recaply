import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT,
  getFollowUpStrategyTaggingLiveAt,
  normalizeFollowUpStrategyTaggingLiveAt,
  resetFollowUpStrategyTaggingLiveAt,
  setFollowUpStrategyTaggingLiveAt,
  toDateInputValue,
} from './growthInsightsSettings';

describe('growthInsightsSettings', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('returns default live date when no value is saved', async () => {
    expect(await getFollowUpStrategyTaggingLiveAt()).toBe(DEFAULT_FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT);
  });

  it('normalizes date-only input and persists it', async () => {
    await setFollowUpStrategyTaggingLiveAt('2026-06-01');
    expect(await getFollowUpStrategyTaggingLiveAt()).toBe('2026-06-01T00:00:00.000Z');
    expect(toDateInputValue('2026-06-01T00:00:00.000Z')).toBe('2026-06-01');
  });

  it('rejects invalid date input', async () => {
    await expect(setFollowUpStrategyTaggingLiveAt('2026-99-99')).rejects.toThrow('Enter a valid date');
  });

  it('resets to default when requested', async () => {
    await setFollowUpStrategyTaggingLiveAt('2026-06-01');
    await resetFollowUpStrategyTaggingLiveAt();
    expect(await getFollowUpStrategyTaggingLiveAt()).toBe(DEFAULT_FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT);
  });

  it('normalizes valid ISO date values', () => {
    expect(normalizeFollowUpStrategyTaggingLiveAt('2026-06-01T14:30:00.000Z')).toBe('2026-06-01T14:30:00.000Z');
  });
});
