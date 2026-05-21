import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const LEGACY_NOTIFICATIONS_KEY = 'notifications';
const NOTIFICATIONS_ENABLED_KEY = '@recaply_notifications_enabled';
const WIN_BACK_CADENCE_KEY = '@recaply_win_back_cadence';
const WIN_BACK_HOUR_KEY = '@recaply_win_back_hour';
const WIN_BACK_MINUTE_KEY = '@recaply_win_back_minute';
const WIN_BACK_NOTIFICATION_ID_KEY = '@recaply_win_back_notification_id';
const WIN_BACK_NOTIFICATION_SLOT_KEY = '@recaply_win_back_notification_slot';
const WIN_BACK_PERMISSION_PROMPT_DAY_KEY = '@recaply_win_back_permission_prompt_day';
const WEEKLY_RECAP_DISMISSED_WEEK_KEY = '@recaply_weekly_recap_dismissed_week';
const ENGAGEMENT_NOTIFICATION_CHANNEL = 'engagement-reminders';

export interface WinBackSnapshot {
  recordingsCount: number;
  recordedToday: boolean;
  daysSinceLastRecording: number | null;
  currentStreak: number;
  meetingsLast7Days: number;
}

export interface WeeklyRecapStats {
  weekKey: string;
  weekStartMs: number;
  meetingsThisWeek: number;
  summarizedThisWeek: number;
  unsummarizedThisWeek: number;
  progressPercent: number;
  targetCount: number;
  headline: string;
  detail: string;
  ctaLabel: string;
  reentryMode: 'record' | 'summarize' | 'review';
}

export interface EngagementRecording {
  id?: string | number;
  created_at?: string | null;
  meeting_at?: string | null;
  meetingAt?: string | null;
  summary_json?: unknown;
}

export type WinBackCadence = 'smart' | 'daily';

export interface EngagementPreferences {
  notificationsEnabled: boolean;
  winBackCadence: WinBackCadence;
  reminderHour: number;
  reminderMinute: number;
}

const DEFAULT_ENGAGEMENT_PREFERENCES: EngagementPreferences = {
  notificationsEnabled: true,
  winBackCadence: 'smart',
  reminderHour: 18,
  reminderMinute: 15,
};

function parseBoolean(raw: string | null): boolean | null {
  if (raw === null) {
    return null;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'boolean') {
      return parsed;
    }
  } catch {
    // Ignore malformed payload and keep fallback behavior.
  }
  return null;
}

function parseInteger(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}

function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toSlotKey(date: Date): string {
  const dayKey = toDayKey(date);
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${dayKey}T${hour}:${minute}`;
}

function getStartOfWeek(date: Date): Date {
  const start = new Date(date);
  const dayOfWeek = start.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  start.setDate(start.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);
  return start;
}

function parseRecordingTimestamp(recording: EngagementRecording): number | null {
  const candidate = String(recording.meeting_at || recording.meetingAt || recording.created_at || '');
  const parsed = new Date(candidate);
  const millis = parsed.getTime();
  return Number.isNaN(millis) ? null : millis;
}

function shouldScheduleWinBack(snapshot: WinBackSnapshot, cadence: WinBackCadence): boolean {
  if (snapshot.recordedToday) {
    return false;
  }
  if (cadence === 'daily') {
    return true;
  }
  if (snapshot.recordingsCount === 0) {
    return true;
  }
  if (snapshot.daysSinceLastRecording === null) {
    return true;
  }
  return snapshot.daysSinceLastRecording >= 1;
}

function getNextWinBackTrigger(reminderHour: number, reminderMinute: number, now = new Date()): Date {
  const normalizedHour = Math.max(0, Math.min(23, reminderHour));
  const normalizedMinute = Math.max(0, Math.min(59, reminderMinute));
  const trigger = new Date(now);
  trigger.setHours(normalizedHour, normalizedMinute, 0, 0);
  if (trigger.getTime() <= now.getTime()) {
    trigger.setDate(trigger.getDate() + 1);
  }
  return trigger;
}

function buildWinBackCopy(snapshot: WinBackSnapshot): { title: string; body: string } {
  if (snapshot.recordingsCount === 0) {
    return {
      title: 'Start your first meeting capture',
      body: 'Record one meeting and Recaply will turn it into searchable notes.',
    };
  }

  if ((snapshot.daysSinceLastRecording ?? 0) >= 3) {
    return {
      title: 'Restart your recap streak',
      body: `It has been ${snapshot.daysSinceLastRecording} days. Capture one meeting to get your momentum back.`,
    };
  }

  if (snapshot.currentStreak >= 2) {
    return {
      title: 'Keep your streak alive today',
      body: 'A quick capture today keeps your weekly recap and search context strong.',
    };
  }

  return {
    title: 'Quick reminder to capture today',
    body: 'Record one meeting now so your weekly recap stays complete.',
  };
}

async function ensureEngagementChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    await Notifications.setNotificationChannelAsync(ENGAGEMENT_NOTIFICATION_CHANNEL, {
      name: 'Engagement reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      vibrationPattern: [0, 120, 120, 120],
    });
  } catch {
    // Ignore channel failures to keep the app usable.
  }
}

async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === 'granted') {
      return true;
    }
    if (!existing.canAskAgain) {
      return false;
    }

    const todayKey = toDayKey(new Date());
    const lastPromptDay = await AsyncStorage.getItem(WIN_BACK_PERMISSION_PROMPT_DAY_KEY);
    if (lastPromptDay === todayKey) {
      return false;
    }

    await AsyncStorage.setItem(WIN_BACK_PERMISSION_PROMPT_DAY_KEY, todayKey);
    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === 'granted';
  } catch {
    return false;
  }
}

async function cancelWinBackNotification(): Promise<void> {
  try {
    const notificationId = await AsyncStorage.getItem(WIN_BACK_NOTIFICATION_ID_KEY);
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    }
  } catch {
    // Keep control flow resilient if notification cancellation fails.
  } finally {
    await AsyncStorage.multiRemove([WIN_BACK_NOTIFICATION_ID_KEY, WIN_BACK_NOTIFICATION_SLOT_KEY]);
  }
}

export async function areEngagementNotificationsEnabled(): Promise<boolean> {
  const preferences = await getEngagementPreferences();
  return preferences.notificationsEnabled;
}

export async function getEngagementPreferences(): Promise<EngagementPreferences> {
  try {
    const [notificationsRaw, cadenceRaw, hourRaw, minuteRaw, legacyNotificationsRaw] = await AsyncStorage.multiGet([
      NOTIFICATIONS_ENABLED_KEY,
      WIN_BACK_CADENCE_KEY,
      WIN_BACK_HOUR_KEY,
      WIN_BACK_MINUTE_KEY,
      LEGACY_NOTIFICATIONS_KEY,
    ]).then((entries) => entries.map((entry) => entry[1]));

    const preferred = parseBoolean(notificationsRaw);
    if (preferred !== null) {
      // noop
    }
    const legacy = parseBoolean(legacyNotificationsRaw);

    const storedCadence = cadenceRaw === 'daily' || cadenceRaw === 'smart'
      ? cadenceRaw
      : null;
    const storedHour = parseInteger(hourRaw);
    const storedMinute = parseInteger(minuteRaw);

    return {
      notificationsEnabled: preferred ?? legacy ?? DEFAULT_ENGAGEMENT_PREFERENCES.notificationsEnabled,
      winBackCadence: storedCadence ?? DEFAULT_ENGAGEMENT_PREFERENCES.winBackCadence,
      reminderHour: storedHour !== null && storedHour >= 0 && storedHour <= 23
        ? storedHour
        : DEFAULT_ENGAGEMENT_PREFERENCES.reminderHour,
      reminderMinute: storedMinute !== null && storedMinute >= 0 && storedMinute <= 59
        ? storedMinute
        : DEFAULT_ENGAGEMENT_PREFERENCES.reminderMinute,
    };
  } catch {
    return DEFAULT_ENGAGEMENT_PREFERENCES;
  }
}

export async function updateEngagementPreferences(
  updates: Partial<EngagementPreferences>,
): Promise<EngagementPreferences> {
  const current = await getEngagementPreferences();
  const next: EngagementPreferences = {
    notificationsEnabled: updates.notificationsEnabled ?? current.notificationsEnabled,
    winBackCadence: updates.winBackCadence ?? current.winBackCadence,
    reminderHour: updates.reminderHour ?? current.reminderHour,
    reminderMinute: updates.reminderMinute ?? current.reminderMinute,
  };

  const normalized: EngagementPreferences = {
    notificationsEnabled: next.notificationsEnabled,
    winBackCadence: next.winBackCadence === 'daily' ? 'daily' : 'smart',
    reminderHour: Math.max(0, Math.min(23, Math.round(next.reminderHour))),
    reminderMinute: Math.max(0, Math.min(59, Math.round(next.reminderMinute))),
  };

  await AsyncStorage.multiSet([
    [NOTIFICATIONS_ENABLED_KEY, normalized.notificationsEnabled ? 'true' : 'false'],
    [LEGACY_NOTIFICATIONS_KEY, normalized.notificationsEnabled ? 'true' : 'false'],
    [WIN_BACK_CADENCE_KEY, normalized.winBackCadence],
    [WIN_BACK_HOUR_KEY, String(normalized.reminderHour)],
    [WIN_BACK_MINUTE_KEY, String(normalized.reminderMinute)],
  ]);

  if (!normalized.notificationsEnabled) {
    await cancelWinBackNotification();
  }

  return normalized;
}

export async function syncWinBackNotification(snapshot: WinBackSnapshot): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }

  try {
    const preferences = await getEngagementPreferences();
    if (!preferences.notificationsEnabled) {
      await cancelWinBackNotification();
      return;
    }

    if (!shouldScheduleWinBack(snapshot, preferences.winBackCadence)) {
      await cancelWinBackNotification();
      return;
    }

    const hasPermission = await ensureNotificationPermission();
    if (!hasPermission) {
      return;
    }

    await ensureEngagementChannel();

    const triggerDate = getNextWinBackTrigger(preferences.reminderHour, preferences.reminderMinute);
    const nextSlotKey = toSlotKey(triggerDate);
    const [existingSlotKey, existingId] = await AsyncStorage.multiGet([
      WIN_BACK_NOTIFICATION_SLOT_KEY,
      WIN_BACK_NOTIFICATION_ID_KEY,
    ]).then((entries) => entries.map((entry) => entry[1]));

    if (existingId && existingSlotKey === nextSlotKey) {
      return;
    }

    if (existingId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(existingId);
      } catch {
        // Continue with re-scheduling even if old cancellation fails.
      }
    }

    const copy = buildWinBackCopy(snapshot);
    const trigger: Notifications.NotificationTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate.getTime(),
      ...(Platform.OS === 'android' ? { channelId: ENGAGEMENT_NOTIFICATION_CHANNEL } : {}),
    };

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.title,
        body: copy.body,
        sound: true,
        data: {
          type: 'win_back',
        },
      },
      trigger,
    });

    await AsyncStorage.multiSet([
      [WIN_BACK_NOTIFICATION_ID_KEY, notificationId],
      [WIN_BACK_NOTIFICATION_SLOT_KEY, nextSlotKey],
    ]);
  } catch {
    // Keep Home screen resilient if engagement scheduling fails.
  }
}

export function getCurrentWeekKey(referenceDate = new Date()): string {
  return toDayKey(getStartOfWeek(referenceDate));
}

export function buildWeeklyRecapStats(
  recordings: EngagementRecording[],
  targetCount: number,
): WeeklyRecapStats {
  const now = new Date();
  const weekStart = getStartOfWeek(now);
  const weekStartMs = weekStart.getTime();

  const weekRecordings = recordings.filter((recording) => {
    const timestamp = parseRecordingTimestamp(recording);
    return timestamp !== null && timestamp >= weekStartMs;
  });
  const meetingsThisWeek = weekRecordings.length;
  const summarizedThisWeek = weekRecordings.filter((recording) => Boolean(recording.summary_json)).length;
  const unsummarizedThisWeek = Math.max(meetingsThisWeek - summarizedThisWeek, 0);
  const progressPercent = Math.min(
    100,
    Math.round((meetingsThisWeek / Math.max(targetCount, 1)) * 100),
  );

  let headline = 'No captures yet this week';
  let detail = 'Start one meeting capture to seed your weekly recap narrative.';
  let ctaLabel = 'Capture this week';
  let reentryMode: WeeklyRecapStats['reentryMode'] = 'record';

  if (meetingsThisWeek > 0 && unsummarizedThisWeek > 0) {
    headline = `${meetingsThisWeek} meetings captured this week`;
    detail = `${unsummarizedThisWeek} meeting${unsummarizedThisWeek === 1 ? '' : 's'} still need summary context.`;
    ctaLabel = 'Open next unsummarized';
    reentryMode = 'summarize';
  } else if (meetingsThisWeek >= targetCount) {
    headline = 'Weekly target completed';
    detail = `Strong execution. ${summarizedThisWeek} summaries already ready to share.`;
    ctaLabel = 'Review this week';
    reentryMode = 'review';
  } else if (meetingsThisWeek > 0) {
    const remaining = Math.max(targetCount - meetingsThisWeek, 0);
    headline = `${meetingsThisWeek}/${targetCount} meetings captured`;
    detail = remaining > 0
      ? `${remaining} more capture${remaining === 1 ? '' : 's'} to hit your weekly cadence goal.`
      : 'Great momentum. Keep capturing to stay ahead.';
    ctaLabel = 'Capture next meeting';
    reentryMode = 'record';
  }

  return {
    weekKey: toDayKey(weekStart),
    weekStartMs,
    meetingsThisWeek,
    summarizedThisWeek,
    unsummarizedThisWeek,
    progressPercent,
    targetCount,
    headline,
    detail,
    ctaLabel,
    reentryMode,
  };
}

export async function getDismissedWeeklyRecapWeekKey(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(WEEKLY_RECAP_DISMISSED_WEEK_KEY);
  } catch {
    return null;
  }
}

export async function dismissWeeklyRecapForWeek(weekKey: string): Promise<void> {
  try {
    await AsyncStorage.setItem(WEEKLY_RECAP_DISMISSED_WEEK_KEY, weekKey);
  } catch {
    // Ignore persistence failures; card dismissal will still apply in-memory.
  }
}
