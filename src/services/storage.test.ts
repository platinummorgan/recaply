import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addToQueue,
  getFollowUpStrategyRecommendation,
  getHighlightsLibrary,
  getPinnedRecordingIds,
  getRecordingCardDensity,
  getPendingCount,
  getUploadQueue,
  getSettings,
  recordFollowUpStrategyUsage,
  removeHighlightFromLibrary,
  removeFromQueue,
  saveHighlightToLibrary,
  setRecordingCardDensity,
  setPinnedRecordingIds,
  togglePinnedRecordingId,
  updateQueueItemStatus,
  updateSettings,
} from './storage';

describe('storage upload queue', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      now += 1;
      return now;
    });
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds queued uploads and counts only pending items', async () => {
    const idA = await addToQueue('file://audio-a.m4a', 'audio-a.m4a', 'token-a');
    const idB = await addToQueue('file://audio-b.m4a', 'audio-b.m4a');

    const queue = await getUploadQueue();
    expect(queue.find((item) => item.id === idA)?.token).toBe('token-a');

    await updateQueueItemStatus(idB, 'failed');
    const pendingCount = await getPendingCount();
    expect(pendingCount).toBe(1);
  });

  it('updates item status and removes queue items', async () => {
    const idA = await addToQueue('file://audio-a.m4a', 'audio-a.m4a');
    const idB = await addToQueue('file://audio-b.m4a', 'audio-b.m4a');

    await updateQueueItemStatus(idA, 'uploading');
    let queue = await getUploadQueue();
    expect(queue.find((item) => item.id === idA)?.status).toBe('uploading');

    await removeFromQueue(idA);
    queue = await getUploadQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(idB);
  });
});

describe('storage settings', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns defaults and merges updates', async () => {
    expect(await getSettings()).toEqual({
      wifiOnly: false,
      allowCellular: true,
    });

    await updateSettings({ wifiOnly: true });
    expect(await getSettings()).toEqual({
      wifiOnly: true,
      allowCellular: true,
    });
  });
});

describe('storage pinned recordings', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns empty by default and toggles pinned IDs', async () => {
    expect(await getPinnedRecordingIds()).toEqual([]);

    let updated = await togglePinnedRecordingId('rec-1');
    expect(updated).toEqual(['rec-1']);
    expect(await getPinnedRecordingIds()).toEqual(['rec-1']);

    updated = await togglePinnedRecordingId('rec-1');
    expect(updated).toEqual([]);
    expect(await getPinnedRecordingIds()).toEqual([]);
  });

  it('persists normalized unique pinned IDs', async () => {
    await setPinnedRecordingIds(['1', '2', '1']);
    expect(await getPinnedRecordingIds()).toEqual(['1', '2']);
  });
});

describe('storage recording card density', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults to detailed and persists compact when set', async () => {
    expect(await getRecordingCardDensity()).toBe('detailed');
    await setRecordingCardDensity('compact');
    expect(await getRecordingCardDensity()).toBe('compact');
  });
});

describe('storage follow-up strategy recommendations', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns meeting-type defaults when no history exists', async () => {
    const recommendation = await getFollowUpStrategyRecommendation('sales_call');
    expect(recommendation.persona).toBe('executive');
    expect(recommendation.escalationEnabled).toBe(true);
    expect(recommendation.escalationThresholdHours).toBe(24);
    expect(recommendation.source).toBe('default');
  });

  it('learns persona/escalation settings from resend outcomes', async () => {
    await recordFollowUpStrategyUsage({
      meetingType: 'sales_call',
      persona: 'executive',
      escalationEnabled: true,
      escalationThresholdHours: 24,
      success: true,
    });
    await recordFollowUpStrategyUsage({
      meetingType: 'sales_call',
      persona: 'executive',
      escalationEnabled: true,
      escalationThresholdHours: 24,
      success: true,
    });
    await recordFollowUpStrategyUsage({
      meetingType: 'sales_call',
      persona: 'team',
      escalationEnabled: false,
      escalationThresholdHours: 24,
      success: false,
    });
    await recordFollowUpStrategyUsage({
      meetingType: 'sales_call',
      persona: 'team',
      escalationEnabled: false,
      escalationThresholdHours: 24,
      success: false,
    });

    const recommendation = await getFollowUpStrategyRecommendation('sales_call');
    expect(recommendation.persona).toBe('executive');
    expect(recommendation.escalationEnabled).toBe(true);
    expect(recommendation.escalationThresholdHours).toBe(24);
    expect(recommendation.source).toBe('historical');
    expect(recommendation.sampleSize).toBeGreaterThanOrEqual(4);
  });
});

describe('storage highlights library', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    let now = 2000;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      now += 1;
      return now;
    });
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('saves highlights and de-duplicates duplicate entries', async () => {
    const first = await saveHighlightToLibrary({
      recordingId: 'rec-1',
      meetingName: 'Planning Sync',
      meetingAt: '2026-05-01T13:00:00.000Z',
      source: 'summary',
      text: 'Ship by Friday.',
    });

    const second = await saveHighlightToLibrary({
      recordingId: 'rec-1',
      meetingName: 'Planning Sync',
      meetingAt: '2026-05-01T13:00:00.000Z',
      source: 'summary',
      text: 'Ship by Friday.',
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.id).toBe(second?.id);

    const library = await getHighlightsLibrary();
    expect(library).toHaveLength(1);
    expect(library[0].text).toBe('Ship by Friday.');
  });

  it('orders latest highlights first and removes entries by id', async () => {
    const first = await saveHighlightToLibrary({
      recordingId: 'rec-1',
      meetingName: 'Planning Sync',
      source: 'key_point',
      text: 'Budget approved.',
    });
    const second = await saveHighlightToLibrary({
      recordingId: 'rec-2',
      meetingName: 'Client Review',
      source: 'action_item',
      text: 'Send revised proposal.',
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    let library = await getHighlightsLibrary();
    expect(library).toHaveLength(2);
    expect(library[0].id).toBe(second?.id);
    expect(library[1].id).toBe(first?.id);

    await removeHighlightFromLibrary(second?.id || '');
    library = await getHighlightsLibrary();
    expect(library).toHaveLength(1);
    expect(library[0].id).toBe(first?.id);
  });
});
