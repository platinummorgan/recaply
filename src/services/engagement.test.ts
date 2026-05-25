/* eslint-disable import/first */

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockCancelScheduledNotificationAsync = jest.fn();
const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancelScheduledNotificationAsync(...args),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannelAsync(...args),
  SchedulableTriggerInputTypes: {
    DATE: 'date',
  },
  AndroidImportance: {
    DEFAULT: 'default',
  },
  AndroidNotificationVisibility: {
    PRIVATE: 'private',
  },
}));

import {
  areEngagementNotificationsEnabled,
  buildWeeklyRecapStats,
  dismissWeeklyRecapForWeek,
  getEngagementPreferences,
  getDismissedWeeklyRecapWeekKey,
  syncWinBackNotification,
  updateEngagementPreferences,
} from './engagement';

describe('engagement weekly recap stats', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds summarize-first weekly recap stats when unsummarized meetings exist', () => {
    const now = new Date();
    const withinWeek = now.toISOString();
    const stats = buildWeeklyRecapStats(
      [
        { id: 'a', meeting_at: withinWeek, summary_json: { summary: 'ready' } },
        { id: 'b', meeting_at: withinWeek, summary_json: null },
      ],
      5,
    );

    expect(stats.meetingsThisWeek).toBe(2);
    expect(stats.summarizedThisWeek).toBe(1);
    expect(stats.unsummarizedThisWeek).toBe(1);
    expect(stats.reentryMode).toBe('summarize');
    expect(stats.ctaLabel).toBe('Open next unsummarized');
  });

  it('builds record-first weekly recap stats when no meetings are captured this week', () => {
    const stats = buildWeeklyRecapStats([], 5);
    expect(stats.meetingsThisWeek).toBe(0);
    expect(stats.reentryMode).toBe('record');
    expect(stats.ctaLabel).toBe('Capture this week');
  });

  it('persists weekly recap dismissal by week key', async () => {
    expect(await getDismissedWeeklyRecapWeekKey()).toBeNull();
    await dismissWeeklyRecapForWeek('2026-04-20');
    expect(await getDismissedWeeklyRecapWeekKey()).toBe('2026-04-20');
  });
});

describe('engagement win-back notification scheduling', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.clear();

    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockScheduleNotificationAsync.mockResolvedValue('notif-1');
    mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('schedules once and cancels when user records again', async () => {
    await syncWinBackNotification({
      recordingsCount: 3,
      recordedToday: false,
      daysSinceLastRecording: 2,
      currentStreak: 2,
      meetingsLast7Days: 3,
    });
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);

    await syncWinBackNotification({
      recordingsCount: 3,
      recordedToday: false,
      daysSinceLastRecording: 2,
      currentStreak: 2,
      meetingsLast7Days: 3,
    });
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);

    await syncWinBackNotification({
      recordingsCount: 3,
      recordedToday: true,
      daysSinceLastRecording: 0,
      currentStreak: 3,
      meetingsLast7Days: 4,
    });
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
  });

  it('honors stored cadence and reminder time preferences', async () => {
    await updateEngagementPreferences({
      notificationsEnabled: true,
      winBackCadence: 'daily',
      reminderHour: 9,
      reminderMinute: 0,
    });

    await syncWinBackNotification({
      recordingsCount: 4,
      recordedToday: false,
      daysSinceLastRecording: 0,
      currentStreak: 1,
      meetingsLast7Days: 4,
    });

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const firstCall = mockScheduleNotificationAsync.mock.calls[0][0];
    expect(firstCall.content.title).toBeTruthy();
    const scheduledDate = new Date(firstCall.trigger.date);
    expect(scheduledDate.getHours()).toBe(9);
    expect(scheduledDate.getMinutes()).toBe(0);
  });
});

describe('engagement preferences', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults to enabled smart reminders and persists updates', async () => {
    expect(await areEngagementNotificationsEnabled()).toBe(true);

    await updateEngagementPreferences({
      notificationsEnabled: true,
      winBackCadence: 'daily',
      reminderHour: 12,
      reminderMinute: 30,
    });

    expect(await getEngagementPreferences()).toEqual({
      notificationsEnabled: true,
      winBackCadence: 'daily',
      reminderHour: 12,
      reminderMinute: 30,
    });
  });

  it('disabling notifications cancels any scheduled win-back notification', async () => {
    await syncWinBackNotification({
      recordingsCount: 2,
      recordedToday: false,
      daysSinceLastRecording: 2,
      currentStreak: 2,
      meetingsLast7Days: 3,
    });

    await updateEngagementPreferences({ notificationsEnabled: false });
    expect(await areEngagementNotificationsEnabled()).toBe(false);
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
  });
});
