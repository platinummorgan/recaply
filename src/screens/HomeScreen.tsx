import React, { useMemo, useState, useEffect } from 'react';
import { Alert, View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, TextInput, Share, Image } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getRecordingCardDensity,
  getPendingCount,
  getPinnedRecordingIds as loadPinnedRecordingIdsStorage,
  getUploadQueue,
  removeFromQueue,
  setRecordingCardDensity,
  setPinnedRecordingIds as savePinnedRecordingIds,
  type RecordingCardDensity,
  togglePinnedRecordingId,
  type QueuedUpload,
} from '../services/storage';
import { processQueue } from '../services/uploadQueue';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../config/api';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { AppCard } from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';
import {
  getDefaultTranslationLanguage,
  setDefaultTranslationLanguage,
} from '../services/translationPreferences';
import {
  getRecordingTranslationLanguages,
  summarizeTranslationUsage,
} from '../services/translationUsage';
import {
  buildWeeklyRecapStats,
  dismissWeeklyRecapForWeek,
  getDismissedWeeklyRecapWeekKey,
  syncWinBackNotification,
} from '../services/engagement';
import { trackTranslationEvent, type TranslationEventName } from '../services/translationAnalytics';
import {
  resolveTranslationGrowthVariant,
  TRANSLATION_GROWTH_COPY_BY_VARIANT,
} from '../config/translationGrowthMessaging';
import { trackActivationEvent } from '../services/activationAnalytics';

type RecordingFilter = 'all' | 'summarized' | 'transcriptOnly' | 'pinned';
type RecordingSort = 'newest' | 'oldest' | 'name' | 'pinnedFirst';
type RecordingGroup = 'none' | 'date' | 'summary';
type RefineSection = 'filter' | 'sort' | 'group' | 'density';
const RECORDINGS_PAGE_SIZE = 20;
const RETENTION_WEEKLY_GOAL = 5;
const DISCOVERY_TRANSLATION_LANGUAGES = ['English', 'Spanish', 'French', 'Portuguese', 'Japanese'];

function toTrackingErrorCode(error: unknown): string | undefined {
  const raw = String((error as any)?.message || error || '').trim();
  if (!raw) {
    return undefined;
  }

  return raw
    .slice(0, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default function HomeScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const [recordings, setRecordings] = useState<any[]>([]);
  const [queuedRecordings, setQueuedRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [recordingFilter, setRecordingFilter] = useState<RecordingFilter>('all');
  const [pinnedRecordingIds, setPinnedRecordingIdsState] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<RecordingSort>('newest');
  const [groupMode, setGroupMode] = useState<RecordingGroup>('none');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkUpdatingPins, setIsBulkUpdatingPins] = useState(false);
  const [showHomeInsights, setShowHomeInsights] = useState(false);
  const [showRefinePanel, setShowRefinePanel] = useState(false);
  const [openRefineSection, setOpenRefineSection] = useState<RefineSection | null>('filter');
  const [deletingRecordingId, setDeletingRecordingId] = useState<string | null>(null);
  const [deletingQueuedId, setDeletingQueuedId] = useState<string | null>(null);
  const [weeklyShareLanguage, setWeeklyShareLanguage] = useState<string>(DISCOVERY_TRANSLATION_LANGUAGES[0]);
  const [weeklyShareTranslateLoading, setWeeklyShareTranslateLoading] = useState(false);
  const [cardDensity, setCardDensityState] = useState<RecordingCardDensity>('detailed');
  const [hasMoreRecordings, setHasMoreRecordings] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [partialLoadError, setPartialLoadError] = useState<string | null>(null);
  const [dismissedWeeklyRecapWeekKey, setDismissedWeeklyRecapWeekKey] = useState<string | null>(null);
  const pinnedSet = useMemo(() => new Set(pinnedRecordingIds), [pinnedRecordingIds]);
  const selectedSet = useMemo(() => new Set(selectedRecordingIds), [selectedRecordingIds]);
  const pendingDisplayCount = Math.max(pendingCount, queuedRecordings.length);
  const summarizedCount = recordings.filter((recording) => Boolean(recording.summary_json)).length;
  const transcriptOnlyCount = Math.max(recordings.length - summarizedCount, 0);
  const pinnedCount = recordings.filter((recording) => pinnedSet.has(String(recording.id))).length;
  const minutesUsed = user?.minutesUsed || 0;
  const minutesLimit = user?.minutesLimit || 30;
  const plan = user?.subscriptionTier || 'free';
  const isPro = plan === 'pro';
  const usageRatio = isPro ? 0 : Math.min(1, minutesUsed / Math.max(minutesLimit, 1));
  const usagePercent = isPro ? 0 : Math.round(usageRatio * 100);
  const minutesRemaining = isPro ? 'Unlimited' : `${Math.max(minutesLimit - minutesUsed, 0).toFixed(0)} min left`;
  const latestRecording = recordings[0] || null;
  const latestSummarizedRecording = recordings.find((recording) => Boolean(recording.summary_json)) || null;
  const instantValueRecording = latestSummarizedRecording || latestRecording;
  const instantValueHeading = latestSummarizedRecording
    ? 'Latest summary is ready to ship'
    : latestRecording
      ? 'Convert your latest meeting into action'
      : 'Capture one meeting to unlock instant value';
  const instantValueDetail = latestSummarizedRecording
    ? 'Open your freshest AI breakdown, extract actions, and share outcomes fast.'
    : latestRecording
      ? 'One tap turns raw transcript into clear actions, key points, and multilingual share output.'
      : 'Record now, then generate a summary to create immediate share-ready output for your team.';
  const instantValueCta = latestSummarizedRecording
    ? 'Open Latest Summary'
    : latestRecording
      ? 'Open Latest Meeting'
      : 'Start First Recording';
  const summaryCoveragePercent = recordings.length > 0 ? Math.round((summarizedCount / recordings.length) * 100) : 0;
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.email ? user.email.split('@')[0].split('.')[0] : 'Operator';
  const firstNameLabel = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const todayLabel = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const focusSignal = pendingDisplayCount > 0
    ? `${pendingDisplayCount} uploads waiting`
    : recordings.length === 0
      ? 'Ready for first capture'
      : `${summaryCoveragePercent}% meetings summarized`;
  const retentionStats = useMemo(() => {
    const nowDate = new Date();
    const dayMillis = 24 * 60 * 60 * 1000;
    const startOfTodayDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const startOfToday = startOfTodayDate.getTime();
    const uniqueDays = Array.from(
      new Set(
        recordings
          .map((recording) => {
            const raw = String(recording.meeting_at || recording.created_at || '');
            const parsed = new Date(raw);
            if (Number.isNaN(parsed.getTime())) {
              return null;
            }
            return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
          })
          .filter((value): value is number => typeof value === 'number'),
      ),
    ).sort((a, b) => b - a);

    const latestDay = uniqueDays[0] ?? null;
    const recordedToday = latestDay === startOfToday;

    let currentStreak = 0;
    if (latestDay !== null) {
      let cursor = latestDay;
      for (const day of uniqueDays) {
        if (day === cursor) {
          currentStreak += 1;
          cursor -= dayMillis;
          continue;
        }
        if (day < cursor) {
          break;
        }
      }
    }

    const daysSinceLastRecording = latestDay === null
      ? null
      : Math.max(0, Math.floor((startOfToday - latestDay) / dayMillis));

    const meetingsLast7Days = recordings.filter((recording) => {
      const raw = String(recording.meeting_at || recording.created_at || '');
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return false;
      }
      return parsed.getTime() >= (startOfToday - 6 * dayMillis);
    }).length;
    const weeklyProgressPercent = Math.min(
      100,
      Math.round((meetingsLast7Days / RETENTION_WEEKLY_GOAL) * 100),
    );

    let headline = 'Start your first streak';
    let detail = 'Record one meeting today to begin your daily capture momentum.';
    let ctaLabel = 'Start recording';

    if (recordings.length > 0) {
      if ((daysSinceLastRecording ?? 0) >= 3) {
        headline = `It has been ${daysSinceLastRecording} days`;
        detail = 'Capture one meeting now to re-activate your streak and stay consistent.';
        ctaLabel = 'Resume streak';
      } else if (!recordedToday) {
        headline = currentStreak >= 2 ? `${currentStreak}-day streak at risk` : 'Keep momentum today';
        detail = 'One short capture today keeps your meeting memory warm and searchable.';
        ctaLabel = 'Keep streak alive';
      } else if (currentStreak >= 2) {
        headline = `${currentStreak}-day streak active`;
        detail = 'Strong consistency. Keep this cadence to build a defensible meeting memory.';
        ctaLabel = 'Record another';
      } else {
        headline = 'Momentum started today';
        detail = 'Nice start. Capture again tomorrow to lock in a retention streak.';
        ctaLabel = 'Record another';
      }
    }

    return {
      headline,
      detail,
      ctaLabel,
      currentStreak,
      recordedToday,
      daysSinceLastRecording,
      meetingsLast7Days,
      weeklyProgressPercent,
    };
  }, [recordings]);
  const weeklyRecapStats = useMemo(
    () => buildWeeklyRecapStats(recordings, RETENTION_WEEKLY_GOAL),
    [recordings],
  );
  const showWeeklyRecapCard = recordings.length > 0 && dismissedWeeklyRecapWeekKey !== weeklyRecapStats.weekKey;
  const nextUnsummarizedThisWeek = useMemo(
    () =>
      recordings
        .filter((recording) => !recording.summary_json)
        .filter((recording) => {
          const timestamp = getRecordingTimestamp(recording);
          return timestamp !== null && timestamp >= weeklyRecapStats.weekStartMs;
        })
        .sort((a, b) => {
          const aTime = getRecordingTimestamp(a) ?? 0;
          const bTime = getRecordingTimestamp(b) ?? 0;
          return bTime - aTime;
        })[0] || null,
    [recordings, weeklyRecapStats.weekStartMs],
  );
  const weekRecordings = useMemo(
    () =>
      recordings
        .filter((recording) => {
          const timestamp = getRecordingTimestamp(recording);
          return timestamp !== null && timestamp >= weeklyRecapStats.weekStartMs;
        })
        .sort((a, b) => {
          const aTime = getRecordingTimestamp(a) ?? 0;
          const bTime = getRecordingTimestamp(b) ?? 0;
          return bTime - aTime;
        }),
    [recordings, weeklyRecapStats.weekStartMs],
  );
  const translationDiscoveryStats = useMemo(() => {
    const usage = summarizeTranslationUsage(recordings);
    const topLanguages = usage.topLanguages.map((entry) => entry.language).slice(0, 5);
    const latestTranslatableRecording = recordings.find((recording) => (
      Boolean(recording.summary_json) || Boolean(recording.transcript || recording.transcription)
    )) || null;
    const latestTranslatedRecording = recordings.find(
      (recording) => getRecordingTranslationLanguages(recording).length > 0,
    ) || null;

    return {
      translatedRecordingCount: usage.translatedRecordingCount,
      translatedLanguageCount: usage.totalLanguageVariants,
      topLanguages,
      latestTranslationAt: usage.latestTranslationAt,
      latestTranslatableRecording,
      latestTranslatedRecording,
    };
  }, [recordings]);
  const translationGrowthSeed = user?.email || user?.id || '';
  const translationGrowthResolution = useMemo(
    () => resolveTranslationGrowthVariant(translationGrowthSeed),
    [translationGrowthSeed],
  );
  const translationGrowthCopy = TRANSLATION_GROWTH_COPY_BY_VARIANT[translationGrowthResolution.variant];

  const visibleRecordings = useMemo(() => {
    if (recordingFilter === 'summarized') {
      return recordings.filter((recording) => Boolean(recording.summary_json));
    }
    if (recordingFilter === 'transcriptOnly') {
      return recordings.filter((recording) => !recording.summary_json);
    }
    if (recordingFilter === 'pinned') {
      return recordings.filter((recording) => pinnedSet.has(String(recording.id)));
    }
    return recordings;
  }, [pinnedSet, recordingFilter, recordings]);
  const pinnedQuickJumpRecordings = useMemo(
    () =>
      recordings
        .filter((recording) => pinnedSet.has(String(recording.id)))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3),
    [pinnedSet, recordings],
  );

  const managedRecordings = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const searched = visibleRecordings.filter((recording) => {
      if (!normalizedSearch) {
        return true;
      }
      const title = getRecordingTitle(recording).toLowerCase();
      const location = getRecordingLocation(recording).toLowerCase();
      const context = getRecordingContext(recording).toLowerCase();
      const transcript = String(recording.transcript || recording.transcription || '').toLowerCase();
      return (
        title.includes(normalizedSearch)
        || location.includes(normalizedSearch)
        || context.includes(normalizedSearch)
        || transcript.includes(normalizedSearch)
      );
    });

    return searched.sort((a, b) => {
      if (sortMode === 'pinnedFirst') {
        const aPinned = pinnedSet.has(String(a.id)) ? 1 : 0;
        const bPinned = pinnedSet.has(String(b.id)) ? 1 : 0;
        if (aPinned !== bPinned) {
          return bPinned - aPinned;
        }
      }

      if (sortMode === 'name') {
        return getRecordingTitle(a).localeCompare(getRecordingTitle(b));
      }

      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sortMode === 'oldest' ? aTime - bTime : bTime - aTime;
    });
  }, [pinnedSet, searchQuery, sortMode, visibleRecordings]);

  const groupedRecordings = useMemo(() => {
    if (groupMode === 'none') {
      return [{ label: 'All recordings', items: managedRecordings }];
    }

    const map = new Map<string, any[]>();

    managedRecordings.forEach((recording) => {
      const key = groupMode === 'summary'
        ? (recording.summary_json ? 'Summarized' : 'Transcript Only')
        : getDateGroupLabel(recording.created_at);

      const existing = map.get(key) || [];
      existing.push(recording);
      map.set(key, existing);
    });

    const groups = Array.from(map.entries()).map(([label, items]) => ({ label, items }));
    if (groupMode === 'summary') {
      const order = ['Summarized', 'Transcript Only'];
      groups.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
    }

    return groups;
  }, [groupMode, managedRecordings]);
  const visibleSelectableIds = useMemo(
    () => managedRecordings.map((recording) => String(recording.id)),
    [managedRecordings],
  );
  const allVisibleSelected = useMemo(
    () => visibleSelectableIds.length > 0 && visibleSelectableIds.every((id) => selectedSet.has(id)),
    [selectedSet, visibleSelectableIds],
  );

  useEffect(() => {
    fetchRecordings({ reset: true });
    loadPinnedRecordings();
    loadCardDensity();
    loadQueuedRecordings();
    loadPendingCount();
    loadWeeklyRecapDismissState();
    loadDefaultWeeklyShareLanguage();
    
    // Refresh pending count every 5 seconds
    const interval = setInterval(() => {
      loadPendingCount();
      loadQueuedRecordings();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    void syncWinBackNotification({
      recordingsCount: recordings.length,
      recordedToday: retentionStats.recordedToday,
      daysSinceLastRecording: retentionStats.daysSinceLastRecording,
      currentStreak: retentionStats.currentStreak,
      meetingsLast7Days: retentionStats.meetingsLast7Days,
    });
  }, [
    loading,
    recordings.length,
    retentionStats.currentStreak,
    retentionStats.daysSinceLastRecording,
    retentionStats.meetingsLast7Days,
    retentionStats.recordedToday,
  ]);

  async function trackHomeTranslationEvent(
    eventName: TranslationEventName,
    source: string,
    details?: {
      targetLanguage?: string;
      outcome?: string;
      errorCode?: string;
      recordingId?: string;
    },
  ) {
    await trackTranslationEvent(token, {
      eventName,
      source,
      targetLanguage: details?.targetLanguage,
      outcome: details?.outcome,
      errorCode: details?.errorCode,
      recordingId: details?.recordingId,
    });
  }

  async function trackHomeActivationEvent(
    eventName: 'home_instant_value_cta_tapped',
    outcome: string,
  ) {
    await trackActivationEvent(token, {
      eventName,
      source: 'home_screen',
      outcome,
      step: 'instant_value',
      recordingId: instantValueRecording ? String(instantValueRecording.id || '') : undefined,
    });
  }

  async function loadPendingCount() {
    const count = await getPendingCount();
    setPendingCount(count);
  }

  async function loadDefaultWeeklyShareLanguage() {
    const preferred = await getDefaultTranslationLanguage();
    if (DISCOVERY_TRANSLATION_LANGUAGES.includes(preferred)) {
      setWeeklyShareLanguage(preferred);
    } else {
      setWeeklyShareLanguage(DISCOVERY_TRANSLATION_LANGUAGES[0]);
    }
  }

  async function loadWeeklyRecapDismissState() {
    const weekKey = await getDismissedWeeklyRecapWeekKey();
    setDismissedWeeklyRecapWeekKey(weekKey);
  }

  async function loadPinnedRecordings() {
    const pinned = await loadPinnedRecordingIdsStorage();
    setPinnedRecordingIdsState(pinned);
  }

  async function loadCardDensity() {
    const density = await getRecordingCardDensity();
    setCardDensityState(density);
  }

  async function loadQueuedRecordings() {
    const queue = await getUploadQueue();
    setQueuedRecordings(queue.filter(item => item.status !== 'completed'));
  }

  async function onRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      // Process upload queue first (pass token for backward compatibility with old queue items)
      try {
        await processQueue(token || undefined);
      } catch (error) {
        console.error('Error refreshing:', error);
        setRefreshError('Queue retry failed during refresh. Showing latest known status.');
      }

      // Reload queue and recordings even if queue processing failed
      await loadQueuedRecordings();
      await fetchRecordings({ reset: true });
    } finally {
      setRefreshing(false);
    }
  }

  async function fetchRecordings(options?: { reset?: boolean }) {
    const reset = options?.reset === true;
    const offset = reset ? 0 : nextOffset;
    const hadLoadedRecordings = recordings.length > 0;

    try {
      if (reset) {
        setLoading(true);
        setInitialLoadError(null);
        setPartialLoadError(null);
      } else {
        setIsLoadingMore(true);
        setPartialLoadError(null);
      }

      const response = await fetch(
        apiUrl(`/audio/recordings?limit=${RECORDINGS_PAGE_SIZE}&offset=${offset}`),
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch recordings (${response.status})`);
      }

      const data = await response.json();
      const loadedRecordings = data.recordings || [];
      const pagination = data.pagination || {};

      setRecordings((current) => {
        if (reset) {
          return loadedRecordings;
        }

        const existingIds = new Set(current.map((recording) => String(recording.id)));
        const additions = loadedRecordings.filter(
          (recording: any) => !existingIds.has(String(recording.id)),
        );
        return [...current, ...additions];
      });

      const hasMore = Boolean(pagination.hasMore);
      const computedNextOffset = typeof pagination.nextOffset === 'number'
        ? pagination.nextOffset
        : offset + loadedRecordings.length;
      setHasMoreRecordings(hasMore);
      setNextOffset(computedNextOffset);

      if (reset) {
        setSelectionMode(false);
        setSelectedRecordingIds([]);
        setRefreshError(null);
        setPartialLoadError(null);
      }

      await loadPendingCount(); // Refresh pending count too
      await loadQueuedRecordings(); // Refresh queue too
    } catch (error) {
      console.error('Error fetching recordings:', error);
      if (reset) {
        if (hadLoadedRecordings) {
          setRefreshError('Could not refresh recordings. Showing previously loaded items.');
        } else {
          setInitialLoadError('Could not load recordings. Check your connection and retry.');
        }
      } else {
        setPartialLoadError('Could not load older recordings. Tap retry to continue.');
      }
    } finally {
      if (reset) {
        setLoading(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  }

  async function loadMoreRecordings() {
    if (loading || refreshing || isLoadingMore || !hasMoreRecordings) {
      return;
    }
    await fetchRecordings({ reset: false });
  }

  async function shareRecaplyInvite() {
    try {
      const inviteMessage = [
        'I have been using Recaply to turn meetings into summaries and action items.',
        'If you want faster notes and follow-ups, try it with me.',
      ].join('\n');

      await Share.share({
        message: inviteMessage,
        title: 'Invite to Recaply',
      });
    } catch {
      // Keep UI responsive even when share sheet fails.
    }
  }

  async function shareWeeklyRecap() {
    if (weekRecordings.length === 0) {
      Alert.alert('Weekly Recap', 'Capture at least one meeting this week before sharing.');
      return;
    }

    try {
      const base = buildWeeklyRecapShareBase();

      await Share.share({
        title: 'Recaply Weekly Recap',
        message: base.message,
      });
    } catch {
      // Keep UI responsive even if share sheet fails.
    }
  }

  function buildWeeklyRecapShareBase() {
    const weekStartLabel = new Date(weeklyRecapStats.weekStartMs).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });
    const highlightLines = weekRecordings
      .slice(0, 3)
      .map((recording) => `- ${getRecordingTitle(recording)}`);
    const nextFocus = weeklyRecapStats.unsummarizedThisWeek > 0
      ? `${weeklyRecapStats.unsummarizedThisWeek} meeting${weeklyRecapStats.unsummarizedThisWeek === 1 ? '' : 's'} still need summary context.`
      : 'All captured meetings are summarized.';
    const message = [
      `Recaply Weekly Recap (${weekStartLabel})`,
      `Captured: ${weeklyRecapStats.meetingsThisWeek}`,
      `Summarized: ${weeklyRecapStats.summarizedThisWeek}`,
      `Pending summaries: ${weeklyRecapStats.unsummarizedThisWeek}`,
      `Weekly goal progress: ${weeklyRecapStats.meetingsThisWeek}/${weeklyRecapStats.targetCount} (${weeklyRecapStats.progressPercent}%)`,
      '',
      'Top meetings:',
      ...highlightLines,
      '',
      `Next focus: ${nextFocus}`,
    ].join('\n');

    return {
      weekStartLabel,
      highlightLines,
      nextFocus,
      message,
    };
  }

  async function shareWeeklyRecapInLanguage() {
    if (!token) {
      Alert.alert('Share Translation', 'Sign in to share translated recap content.');
      return;
    }
    if (weekRecordings.length === 0) {
      Alert.alert('Share Translation', 'Capture at least one meeting this week before sharing.');
      return;
    }

    let shareStarted = false;

    try {
      setWeeklyShareTranslateLoading(true);
      const base = buildWeeklyRecapShareBase();
      void trackHomeTranslationEvent('translation_action_started', 'home_weekly_share', {
        targetLanguage: weeklyShareLanguage,
      });
      const response = await fetch(apiUrl('/audio/translate-breakdown'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          summary: {
            summary: base.message,
            actionItems: base.highlightLines.map((line) => line.replace('- ', '')),
            keyPoints: [
              `Captured ${weeklyRecapStats.meetingsThisWeek} meetings`,
              `Summarized ${weeklyRecapStats.summarizedThisWeek} meetings`,
              `Pending summaries ${weeklyRecapStats.unsummarizedThisWeek}`,
              base.nextFocus,
            ],
          },
          transcript: base.message,
          targetLanguage: weeklyShareLanguage,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Failed (${response.status})`);
      }

      const payload = await response.json();
      const translatedSummary = String(
        payload?.translatedSummary?.summary
          || payload?.summary?.summary
          || '',
      ).trim();
      const translatedTranscript = String(payload?.translatedTranscript || '').trim();
      const resolvedLanguage = String(payload?.targetLanguage || weeklyShareLanguage).trim();
      const translatedMessage = translatedSummary || translatedTranscript;

      if (!translatedMessage) {
        void trackHomeTranslationEvent('translation_request_failed', 'home_weekly_share', {
          targetLanguage: resolvedLanguage || weeklyShareLanguage,
          outcome: 'empty_translation_response',
        });
        Alert.alert('Share Translation', 'No translated recap was returned.');
        return;
      }

      void trackHomeTranslationEvent('translation_content_ready', 'home_weekly_share', {
        targetLanguage: resolvedLanguage || weeklyShareLanguage,
        outcome: 'fresh',
      });
      shareStarted = true;
      void trackHomeTranslationEvent('translation_share_started', 'home_weekly_share', {
        targetLanguage: resolvedLanguage || weeklyShareLanguage,
      });
      await Share.share({
        title: `Recaply Weekly Recap (${resolvedLanguage})`,
        message: translatedMessage,
      });
      await setDefaultTranslationLanguage(resolvedLanguage || weeklyShareLanguage);
      void trackHomeTranslationEvent('translation_share_completed', 'home_weekly_share', {
        targetLanguage: resolvedLanguage || weeklyShareLanguage,
      });
    } catch (error: any) {
      if (shareStarted) {
        void trackHomeTranslationEvent('translation_share_failed', 'home_weekly_share', {
          targetLanguage: weeklyShareLanguage,
          errorCode: toTrackingErrorCode(error),
        });
      } else {
        void trackHomeTranslationEvent('translation_request_failed', 'home_weekly_share', {
          targetLanguage: weeklyShareLanguage,
          errorCode: toTrackingErrorCode(error),
        });
      }
      Alert.alert('Share Translation', error?.message || 'Could not translate weekly recap.');
    } finally {
      setWeeklyShareTranslateLoading(false);
    }
  }

  function openTranslationDiscoveryRecording() {
    const target = translationDiscoveryStats.latestTranslatedRecording
      || translationDiscoveryStats.latestTranslatableRecording;
    if (!target) {
      Alert.alert('Translation Discovery', 'Capture a meeting first to unlock translation workflows.');
      return;
    }
    const targetRecordingId = typeof target.id === 'string' ? target.id : String(target.id || '');
    void trackHomeTranslationEvent('translation_discovery_opened', 'home_discovery', {
      targetLanguage: weeklyShareLanguage,
      recordingId: targetRecordingId || undefined,
      outcome: `${translationGrowthResolution.variant}_${translationGrowthResolution.reason}`,
    });
    openRecording(target);
  }

  async function dismissWeeklyRecapCard() {
    setDismissedWeeklyRecapWeekKey(weeklyRecapStats.weekKey);
    try {
      await dismissWeeklyRecapForWeek(weeklyRecapStats.weekKey);
    } catch {
      // Keep dismissal responsive even if persistence fails.
    }
  }

  function openRecording(recording: any) {
    navigation.navigate('Transcript', {
      transcription: recording.transcript || recording.transcription,
      filename: recording.filename,
      recordingId: recording.id,
      meetingName: recording.meeting_name,
      meetingLocation: recording.meeting_location,
      meetingContext: recording.meeting_context,
      meetingAt: recording.meeting_at,
      meetingParticipants: recording.meeting_participants,
    });
  }

  function openWeeklyRecapPrimaryAction() {
    if (weeklyRecapStats.reentryMode === 'summarize' && nextUnsummarizedThisWeek) {
      openRecording(nextUnsummarizedThisWeek);
      return;
    }

    if (weeklyRecapStats.reentryMode === 'review') {
      setRecordingFilter('all');
      setSortMode('newest');
      setGroupMode('date');
      setShowRefinePanel(true);
      return;
    }

    navigation.navigate('Record');
  }

  function openWeeklyRecapSecondaryAction() {
    if (weeklyRecapStats.reentryMode === 'record') {
      setRecordingFilter('all');
      setSortMode('newest');
      setGroupMode('date');
      setShowRefinePanel(true);
      return;
    }

    navigation.navigate('Record');
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return 'Date unknown';
    }
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getRecordingTitle(recording: any): string {
    return String(recording.meeting_name || recording.meetingName || recording.filename || 'Untitled recording');
  }

  function getRecordingLocation(recording: any): string {
    return String(recording.meeting_location || recording.meetingLocation || '');
  }

  function getRecordingContext(recording: any): string {
    return String(recording.meeting_context || recording.meetingContext || '');
  }

  function getRecordingParticipants(recording: any): string[] {
    const raw = recording.meeting_participants || recording.meetingParticipants;
    if (Array.isArray(raw)) {
      return raw
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0);
    }
    if (typeof raw === 'string') {
      return raw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    }
    return [];
  }

  function getRecordingDate(recording: any): string {
    const date = String(recording.meeting_at || recording.meetingAt || recording.created_at || '');
    return formatDate(date);
  }

  function getRecordingTimestamp(recording: any): number | null {
    const raw = String(recording.meeting_at || recording.meetingAt || recording.created_at || '');
    const parsed = new Date(raw);
    const millis = parsed.getTime();
    return Number.isNaN(millis) ? null : millis;
  }

  function getRecordingMetaLine(recording: any): string {
    const parts = [getRecordingDate(recording)];
    const location = getRecordingLocation(recording).trim();
    if (location) {
      parts.push(location);
    }
    const participants = getRecordingParticipants(recording);
    if (participants.length > 0) {
      parts.push(`${participants.length} participant${participants.length === 1 ? '' : 's'}`);
    }
    return parts.join('  •  ');
  }

  function hasRecordingMetadata(recording: any): boolean {
    return Boolean(
      getRecordingLocation(recording).trim()
      || getRecordingContext(recording).trim()
      || String(recording.meeting_at || recording.meetingAt || '').trim()
      || getRecordingParticipants(recording).length > 0,
    );
  }

  function getFilterLabel(filter: RecordingFilter): string {
    if (filter === 'summarized') return 'Summarized';
    if (filter === 'transcriptOnly') return 'Transcript only';
    if (filter === 'pinned') return 'Pinned';
    return 'All';
  }

  function getSortLabel(sort: RecordingSort): string {
    if (sort === 'pinnedFirst') return 'Pinned first';
    if (sort === 'oldest') return 'Oldest';
    if (sort === 'name') return 'A-Z';
    return 'Newest';
  }

  function getGroupLabel(group: RecordingGroup): string {
    if (group === 'date') return 'Group by date';
    if (group === 'summary') return 'Group by summary';
    return 'No groups';
  }

  function getDensityLabel(density: RecordingCardDensity): string {
    return density === 'compact' ? 'Compact cards' : 'Detailed cards';
  }

  async function togglePinned(recordingId: string | number) {
    try {
      const updated = await togglePinnedRecordingId(String(recordingId));
      setPinnedRecordingIdsState(updated);
    } catch {
      // Keep list usable even if local persistence fails.
    }
  }

  async function updateCardDensity(density: RecordingCardDensity) {
    setCardDensityState(density);
    try {
      await setRecordingCardDensity(density);
    } catch {
      // Keep user-selected mode even if persistence fails.
    }
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => {
      if (current) {
        setSelectedRecordingIds([]);
      }
      return !current;
    });
  }

  function toggleSelectedRecording(recordingId: string | number) {
    const normalizedId = String(recordingId);
    setSelectedRecordingIds((current) => (
      current.includes(normalizedId)
        ? current.filter((id) => id !== normalizedId)
        : [...current, normalizedId]
    ));
  }

  function selectAllVisibleRecordings() {
    setSelectedRecordingIds((current) => {
      const currentSet = new Set(current);
      visibleSelectableIds.forEach((id) => currentSet.add(id));
      return Array.from(currentSet);
    });
  }

  function clearSelection() {
    setSelectedRecordingIds([]);
  }

  function confirmBulkDelete() {
    if (selectedRecordingIds.length === 0) {
      Alert.alert('No Selection', 'Select at least one recording to delete.');
      return;
    }

    Alert.alert(
      'Delete Selected Recordings',
      `Delete ${selectedRecordingIds.length} selected recording(s)? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteSelectedRecordings() },
      ],
    );
  }

  async function deleteSelectedRecordings() {
    if (!token || selectedRecordingIds.length === 0 || isBulkUpdatingPins) {
      return;
    }

    try {
      setIsBulkDeleting(true);
      const targets = [...selectedRecordingIds];
      const results = await Promise.all(
        targets.map(async (id) => {
          try {
            const response = await fetch(apiUrl(`/audio/recordings/${id}`), {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            return { id, ok: response.ok };
          } catch {
            return { id, ok: false };
          }
        }),
      );

      const deletedIds = results.filter((result) => result.ok).map((result) => result.id);
      const failedCount = results.length - deletedIds.length;

      if (deletedIds.length > 0) {
        setRecordings((current) => current.filter((recording) => !deletedIds.includes(String(recording.id))));
        const nextPinned = pinnedRecordingIds.filter((id) => !deletedIds.includes(id));
        setPinnedRecordingIdsState(nextPinned);
        await savePinnedRecordingIds(nextPinned);
      }

      setSelectedRecordingIds([]);
      setSelectionMode(false);

      if (failedCount > 0) {
        Alert.alert('Delete Partially Complete', `${deletedIds.length} deleted, ${failedCount} failed.`);
      } else {
        Alert.alert('Delete Complete', `${deletedIds.length} recording(s) deleted.`);
      }
    } catch {
      Alert.alert('Delete Failed', 'Could not delete selected recordings.');
    } finally {
      setIsBulkDeleting(false);
    }
  }

  function confirmSingleDelete(recording: any) {
    const recordingId = String(recording.id);
    const recordingTitle = getRecordingTitle(recording);

    Alert.alert(
      'Delete Meeting',
      `Delete "${recordingTitle}" from your dashboard? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void deleteSingleRecording(recordingId),
        },
      ],
    );
  }

  async function deleteSingleRecording(recordingId: string) {
    if (!token || isBulkDeleting || isBulkUpdatingPins) {
      return;
    }

    try {
      setDeletingRecordingId(recordingId);
      const response = await fetch(apiUrl(`/audio/recordings/${recordingId}`), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        Alert.alert('Delete Failed', 'Could not delete this meeting.');
        return;
      }

      setRecordings((current) => current.filter((recording) => String(recording.id) !== recordingId));
      setSelectedRecordingIds((current) => current.filter((id) => id !== recordingId));

      if (pinnedRecordingIds.includes(recordingId)) {
        const nextPinned = pinnedRecordingIds.filter((id) => id !== recordingId);
        setPinnedRecordingIdsState(nextPinned);
        await savePinnedRecordingIds(nextPinned);
      }
    } catch {
      Alert.alert('Delete Failed', 'Could not delete this meeting.');
    } finally {
      setDeletingRecordingId(null);
    }
  }

  function confirmDeleteQueued(item: QueuedUpload) {
    const title = item.metadata?.meetingName || item.filename;
    Alert.alert(
      'Remove Pending Upload',
      `Remove "${title}" from pending uploads?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void deleteQueuedRecording(item),
        },
      ],
    );
  }

  async function deleteQueuedRecording(item: QueuedUpload) {
    if (deletingQueuedId || isBulkDeleting || isBulkUpdatingPins) {
      return;
    }

    try {
      setDeletingQueuedId(item.id);
      await removeFromQueue(item.id);
      try {
        await FileSystem.deleteAsync(item.audioUri, { idempotent: true });
      } catch {
        // Keep UI responsive even if local file cleanup fails.
      }
      setQueuedRecordings((current) => current.filter((entry) => entry.id !== item.id));
      await loadPendingCount();
    } catch {
      Alert.alert('Remove Failed', 'Could not remove this pending upload.');
    } finally {
      setDeletingQueuedId(null);
    }
  }

  function openRecordingTranscript(recording: any) {
    navigation.navigate('Transcript', {
      transcription: recording.transcript || recording.transcription || '',
      filename: recording.filename,
      recordingId: recording.id,
      audioUrl: recording.audio_url,
      meetingName: recording.meeting_name,
      meetingLocation: recording.meeting_location,
      meetingContext: recording.meeting_context,
      meetingAt: recording.meeting_at,
      meetingParticipants: recording.meeting_participants,
    });
  }

  function openInstantValueFlow() {
    const outcome = latestSummarizedRecording
      ? 'open_latest_summary'
      : latestRecording
        ? 'open_latest_meeting'
        : 'start_first_recording';
    void trackHomeActivationEvent('home_instant_value_cta_tapped', outcome);
    if (instantValueRecording) {
      openRecordingTranscript(instantValueRecording);
      return;
    }
    navigation.navigate('Record');
  }

  async function applyBulkPinState(shouldPin: boolean) {
    if (selectedRecordingIds.length === 0 || isBulkDeleting) {
      return;
    }

    try {
      setIsBulkUpdatingPins(true);
      const selectedIds = new Set(selectedRecordingIds.map((id) => String(id)));
      const currentPinned = new Set(pinnedRecordingIds.map((id) => String(id)));

      if (shouldPin) {
        selectedIds.forEach((id) => currentPinned.add(id));
      } else {
        selectedIds.forEach((id) => currentPinned.delete(id));
      }

      const updated = Array.from(currentPinned);
      setPinnedRecordingIdsState(updated);
      await savePinnedRecordingIds(updated);
    } catch {
      Alert.alert('Update Failed', 'Could not update selected pinned recordings.');
    } finally {
      setIsBulkUpdatingPins(false);
    }
  }

  function toggleRefinePanel() {
    setShowRefinePanel((current) => {
      const next = !current;
      if (next && !openRefineSection) {
        setOpenRefineSection('filter');
      }
      return next;
    });
  }

  function toggleRefineSection(section: RefineSection) {
    setOpenRefineSection((current) => (current === section ? null : section));
  }

  function resetRefinements() {
    setRecordingFilter('all');
    setSortMode('newest');
    setGroupMode('none');
    void updateCardDensity('detailed');
    setSearchQuery('');
  }

  function renderFilterChip(filter: RecordingFilter, label: string, count: number) {
    const active = recordingFilter === filter;
    return (
      <TouchableOpacity
        key={filter}
        style={[styles.filterChip, active && styles.filterChipActive]}
        onPress={() => setRecordingFilter(filter)}
      >
        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
          {label} ({count})
        </Text>
      </TouchableOpacity>
    );
  }

  function renderSortChip(value: RecordingSort, label: string) {
    const active = sortMode === value;
    return (
      <TouchableOpacity
        key={value}
        style={[styles.filterChip, active && styles.filterChipActive]}
        onPress={() => setSortMode(value)}
      >
        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  function renderGroupChip(value: RecordingGroup, label: string) {
    const active = groupMode === value;
    return (
      <TouchableOpacity
        key={value}
        style={[styles.filterChip, active && styles.filterChipActive]}
        onPress={() => setGroupMode(value)}
      >
        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  function renderDensityChip(value: RecordingCardDensity, label: string) {
    const active = cardDensity === value;
    return (
      <TouchableOpacity
        key={value}
        style={[styles.filterChip, active && styles.filterChipActive]}
        onPress={() => void updateCardDensity(value)}
      >
        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildPreviewSnippet(source: string, query: string) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return source;
    }

    const lowerSource = source.toLowerCase();
    const lowerQuery = trimmedQuery.toLowerCase();
    const matchIndex = lowerSource.indexOf(lowerQuery);
    if (matchIndex === -1) {
      return source;
    }

    const contextBefore = 40;
    const contextAfter = 100;
    const start = Math.max(0, matchIndex - contextBefore);
    const end = Math.min(source.length, matchIndex + trimmedQuery.length + contextAfter);
    const prefix = start > 0 ? '... ' : '';
    const suffix = end < source.length ? ' ...' : '';
    return `${prefix}${source.slice(start, end).trim()}${suffix}`;
  }

  function renderPreviewText(source: string, numberOfLines: number, style: any) {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      return (
        <Text style={style} numberOfLines={numberOfLines}>
          {source}
        </Text>
      );
    }

    const snippet = buildPreviewSnippet(source, trimmedQuery);
    const parts = snippet.split(new RegExp(`(${escapeRegExp(trimmedQuery)})`, 'ig'));
    const normalizedQuery = trimmedQuery.toLowerCase();

    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {parts.map((part, index) => (
          part.toLowerCase() === normalizedQuery ? (
            <Text key={`match-${index}`} style={styles.matchHighlight}>
              {part}
            </Text>
          ) : (
            <Text key={`plain-${index}`}>{part}</Text>
          )
        ))}
      </Text>
    );
  }

  function getDateGroupLabel(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((startOfToday.getTime() - startOfDate.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return 'Last 7 Days';
    if (now.getFullYear() === date.getFullYear() && now.getMonth() === date.getMonth()) return 'Earlier This Month';
    return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.accent]}
          tintColor={colors.accent}
        />
      }
    >
      <View pointerEvents="none" style={styles.bgGlowTop} />
      <View pointerEvents="none" style={styles.bgGlowMid} />
      <View style={[styles.brandHeader, { paddingTop: Math.max(insets.top + 4, 14) }]}>
        <View style={styles.brandIdentityRow}>
          <View style={styles.brandLogoShell}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.brandLogo}
              resizeMode="cover"
            />
          </View>
          <View style={styles.brandCopyBlock}>
            <Text style={styles.brandWordmark}>Recaply</Text>
            <Text style={styles.brandTagline}>Meeting intelligence platform</Text>
          </View>
        </View>
        <View style={styles.brandStatusChip}>
          <View style={styles.brandStatusDot} />
          <Text style={styles.brandStatusText}>LIVE</Text>
        </View>
      </View>

      <AppCard variant="dark" style={styles.heroCard}>
        <View style={styles.heroGlowPrimary} />
        <View style={styles.heroGlowSecondary} />
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.heroKicker}>Operations Console</Text>
            <Text style={styles.title}>{`${greeting}, ${firstNameLabel}`}</Text>
            <Text style={styles.subtitle}>Capture meetings. Turn decisions into shipped work.</Text>
          </View>
          <TouchableOpacity style={styles.settingsPill} onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.settingsPillText}>Settings</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroMetaRow}>
          <View style={styles.heroMetaChip}>
            <Text style={styles.heroMetaText}>{todayLabel}</Text>
          </View>
          <View style={[styles.heroMetaChip, styles.heroMetaChipAccent]}>
            <Text style={[styles.heroMetaText, styles.heroMetaTextAccent]}>{focusSignal}</Text>
          </View>
        </View>

        {user && (
          <>
            <View style={styles.planRow}>
              <Text style={styles.planLabel}>Plan</Text>
              <View style={[styles.planBadge, plan === 'pro' && styles.planBadgePro]}>
                <Text style={styles.planText}>{plan.toUpperCase()}</Text>
              </View>
            </View>

            {!isPro && (
              <>
                <View style={styles.usageTrack}>
                  <View style={[styles.usageFill, { width: `${usagePercent}%` }]} />
                </View>
                <View style={styles.usageMetaRow}>
                  <Text style={styles.usageMetaText}>{minutesUsed.toFixed(0)} / {minutesLimit.toFixed(0)} min used</Text>
                  <Text style={styles.usageMetaText}>{minutesRemaining}</Text>
                </View>
              </>
            )}

            {isPro && (
              <Text style={styles.usageMetaText}>Unlimited minutes active</Text>
            )}
          </>
        )}

        <View style={styles.heroActions}>
          <AppButton
            label="New Recording"
            variant="warning"
            style={styles.recordButton}
            textStyle={styles.recordButtonText}
            onPress={() => navigation.navigate('Record')}
          />
          {!isPro && (
            <AppButton
              label="Upgrade"
              style={styles.upgradeButton}
              textStyle={styles.upgradeButtonText}
              onPress={() => navigation.navigate('Subscription')}
            />
          )}
        </View>
      </AppCard>

      <View style={styles.metricsRow}>
        <AppCard style={styles.metricCard}>
          <Text style={styles.metricValue}>{recordings.length}</Text>
          <Text style={styles.metricLabel}>Recordings</Text>
          <Text style={styles.metricHint}>{recordings.length === 0 ? 'Start now' : 'Total captured'}</Text>
        </AppCard>
        <AppCard style={styles.metricCard}>
          <Text style={styles.metricValue}>{summarizedCount}</Text>
          <Text style={styles.metricLabel}>Summaries</Text>
          <Text style={styles.metricHint}>{summaryCoveragePercent}% coverage</Text>
        </AppCard>
        <AppCard style={styles.metricCard}>
          <Text style={styles.metricValue}>{pendingDisplayCount}</Text>
          <Text style={styles.metricLabel}>Pending</Text>
          <Text style={styles.metricHint}>{pendingDisplayCount > 0 ? 'Needs review' : 'Queue clear'}</Text>
        </AppCard>
      </View>

      {latestRecording && (
        <TouchableOpacity
          onPress={() => navigation.navigate('Transcript', {
            transcription: latestRecording.transcript || latestRecording.transcription,
            filename: latestRecording.filename,
            recordingId: latestRecording.id,
            meetingName: latestRecording.meeting_name,
            meetingLocation: latestRecording.meeting_location,
            meetingContext: latestRecording.meeting_context,
            meetingAt: latestRecording.meeting_at,
            meetingParticipants: latestRecording.meeting_participants,
          })}
        >
          <AppCard style={styles.latestCard}>
            <Text style={styles.latestLabel}>Latest meeting</Text>
            <Text style={styles.latestTitle} numberOfLines={1}>{getRecordingTitle(latestRecording)}</Text>
            <Text style={styles.latestMeta}>{getRecordingMetaLine(latestRecording)}</Text>
          </AppCard>
        </TouchableOpacity>
      )}

      <AppCard style={styles.homeExtrasToggleCard}>
        <View style={styles.homeExtrasToggleRow}>
          <View style={styles.homeExtrasToggleCopy}>
            <Text style={styles.homeExtrasToggleTitle}>Dashboard Extras</Text>
            <Text style={styles.homeExtrasToggleText}>
              Weekly recap, growth loops, translation insights, and pinned quick actions.
            </Text>
          </View>
          <TouchableOpacity style={styles.homeExtrasToggleButton} onPress={() => setShowHomeInsights((current) => !current)}>
            <Text style={styles.homeExtrasToggleButtonText}>{showHomeInsights ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
      </AppCard>

      {showHomeInsights && (
        <>
          <AppCard variant="dark" style={styles.instantValueCard}>
            <View style={styles.instantValueGlowA} />
            <View style={styles.instantValueGlowB} />
            <Text style={styles.instantValueKicker}>Instant Value</Text>
            <Text style={styles.instantValueTitle}>{instantValueHeading}</Text>
            <Text style={styles.instantValueText}>{instantValueDetail}</Text>
            <View style={styles.instantValueSignalRow}>
              <View style={styles.instantValueSignalChip}>
                <Text style={styles.instantValueSignalText}>{summaryCoveragePercent}% summarized</Text>
              </View>
              <View style={styles.instantValueSignalChip}>
                <Text style={styles.instantValueSignalText}>
                  {translationDiscoveryStats.translatedLanguageCount} translated language variants
                </Text>
              </View>
            </View>
            <View style={styles.instantValueFlowRow}>
              <View style={styles.instantValueFlowStep}>
                <Text style={styles.instantValueFlowLabel}>Capture</Text>
              </View>
              <Text style={styles.instantValueFlowArrow}>→</Text>
              <View style={styles.instantValueFlowStep}>
                <Text style={styles.instantValueFlowLabel}>Summarize</Text>
              </View>
              <Text style={styles.instantValueFlowArrow}>→</Text>
              <View style={styles.instantValueFlowStep}>
                <Text style={styles.instantValueFlowLabel}>Share</Text>
              </View>
            </View>
            <AppButton
              label={instantValueCta}
              variant="warning"
              style={styles.instantValueButton}
              textStyle={styles.instantValueButtonText}
              onPress={openInstantValueFlow}
            />
          </AppCard>

          <AppCard style={styles.retentionCard}>
            <View style={styles.retentionHeaderRow}>
              <View style={styles.retentionHeaderCopy}>
                <Text style={styles.retentionKicker}>Retention Loop</Text>
                <Text style={styles.retentionTitle}>{retentionStats.headline}</Text>
                <Text style={styles.retentionDetail}>{retentionStats.detail}</Text>
              </View>
              <View style={styles.retentionPill}>
                <Text style={styles.retentionPillValue}>{retentionStats.currentStreak}</Text>
                <Text style={styles.retentionPillLabel}>day streak</Text>
              </View>
            </View>

            <View style={styles.retentionProgressRow}>
              <Text style={styles.retentionProgressLabel}>
                Weekly cadence {retentionStats.meetingsLast7Days}/{RETENTION_WEEKLY_GOAL}
              </Text>
              <Text style={styles.retentionProgressLabel}>{retentionStats.weeklyProgressPercent}%</Text>
            </View>
            <View style={styles.retentionProgressTrack}>
              <View
                style={[
                  styles.retentionProgressFill,
                  { width: `${retentionStats.weeklyProgressPercent}%` },
                ]}
              />
            </View>

            <AppButton
              label={retentionStats.ctaLabel}
              style={styles.retentionActionButton}
              onPress={() => navigation.navigate('Record')}
            />
          </AppCard>

          {showWeeklyRecapCard && (
            <AppCard style={styles.weeklyRecapCard}>
              <View style={styles.weeklyRecapHeader}>
                <View style={styles.weeklyRecapCopy}>
                  <Text style={styles.weeklyRecapKicker}>Weekly Re-entry</Text>
                  <Text style={styles.weeklyRecapTitle}>{weeklyRecapStats.headline}</Text>
                  <Text style={styles.weeklyRecapDetail}>{weeklyRecapStats.detail}</Text>
                </View>
                <TouchableOpacity style={styles.weeklyRecapDismiss} onPress={() => void dismissWeeklyRecapCard()}>
                  <Text style={styles.weeklyRecapDismissText}>Hide</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.weeklyRecapMetricRow}>
                <View style={styles.weeklyRecapMetric}>
                  <Text style={styles.weeklyRecapMetricValue}>{weeklyRecapStats.meetingsThisWeek}</Text>
                  <Text style={styles.weeklyRecapMetricLabel}>Captured</Text>
                </View>
                <View style={styles.weeklyRecapMetric}>
                  <Text style={styles.weeklyRecapMetricValue}>{weeklyRecapStats.summarizedThisWeek}</Text>
                  <Text style={styles.weeklyRecapMetricLabel}>Summarized</Text>
                </View>
                <View style={styles.weeklyRecapMetric}>
                  <Text style={styles.weeklyRecapMetricValue}>{weeklyRecapStats.unsummarizedThisWeek}</Text>
                  <Text style={styles.weeklyRecapMetricLabel}>Pending</Text>
                </View>
              </View>

              <View style={styles.weeklyRecapProgressRow}>
                <Text style={styles.weeklyRecapProgressText}>
                  Weekly goal {weeklyRecapStats.meetingsThisWeek}/{weeklyRecapStats.targetCount}
                </Text>
                <Text style={styles.weeklyRecapProgressText}>{weeklyRecapStats.progressPercent}%</Text>
              </View>
              <View style={styles.weeklyRecapProgressTrack}>
                <View
                  style={[
                    styles.weeklyRecapProgressFill,
                    { width: `${weeklyRecapStats.progressPercent}%` },
                  ]}
                />
              </View>

              <View style={styles.weeklyRecapActionRow}>
                <AppButton
                  label={weeklyRecapStats.ctaLabel}
                  style={styles.weeklyRecapPrimaryButton}
                  onPress={openWeeklyRecapPrimaryAction}
                />
                <AppButton
                  label={weeklyRecapStats.reentryMode === 'record' ? 'Review week' : 'Record now'}
                  variant="dark"
                  style={styles.weeklyRecapSecondaryButton}
                  onPress={openWeeklyRecapSecondaryAction}
                />
              </View>
              {weekRecordings.length > 0 && (
                <>
                  <AppButton
                    label="Share Weekly Recap"
                    variant="info"
                    style={styles.weeklyRecapShareButton}
                    onPress={() => void shareWeeklyRecap()}
                  />
                  <View style={styles.weeklyShareLanguageRow}>
                    {DISCOVERY_TRANSLATION_LANGUAGES.map((language) => {
                      const selected = weeklyShareLanguage === language;
                      return (
                        <TouchableOpacity
                          key={language}
                          style={[styles.weeklyShareLanguageChip, selected && styles.weeklyShareLanguageChipActive]}
                          onPress={() => {
                            setWeeklyShareLanguage(language);
                            void setDefaultTranslationLanguage(language);
                          }}
                        >
                          <Text
                            style={[
                              styles.weeklyShareLanguageChipText,
                              selected && styles.weeklyShareLanguageChipTextActive,
                            ]}
                          >
                            {language}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <AppButton
                    label={weeklyShareTranslateLoading ? 'Translating recap...' : `Share Recap in ${weeklyShareLanguage}`}
                    variant="dark"
                    style={styles.weeklyRecapTranslateShareButton}
                    onPress={() => void shareWeeklyRecapInLanguage()}
                    loading={weeklyShareTranslateLoading}
                    disabled={weeklyShareTranslateLoading}
                  />
                </>
              )}
            </AppCard>
          )}

          <AppCard style={styles.translationDiscoveryCard}>
            <View style={styles.translationDiscoveryHeader}>
              <View style={styles.translationDiscoveryCopy}>
                <Text style={styles.translationDiscoveryKicker}>{translationGrowthCopy.discovery.kicker}</Text>
                <Text style={styles.translationDiscoveryTitle}>{translationGrowthCopy.discovery.title}</Text>
                <Text style={styles.translationDiscoveryText}>
                  {translationDiscoveryStats.translatedLanguageCount > 0
                    ? translationGrowthCopy.discovery.withHistoryText(
                      translationDiscoveryStats.translatedLanguageCount,
                      translationDiscoveryStats.translatedRecordingCount,
                    )
                    : translationGrowthCopy.discovery.emptyStateText}
                </Text>
                {translationDiscoveryStats.latestTranslationAt && (
                  <Text style={styles.translationDiscoveryMeta}>
                    Last translation: {new Date(translationDiscoveryStats.latestTranslationAt).toLocaleDateString()}
                  </Text>
                )}
              </View>
              <AppButton
                label={translationDiscoveryStats.latestTranslatedRecording
                  ? translationGrowthCopy.discovery.ctaTranslated
                  : translationGrowthCopy.discovery.ctaDefault}
                variant="dark"
                style={styles.translationDiscoveryButton}
                onPress={openTranslationDiscoveryRecording}
              />
            </View>
            {translationDiscoveryStats.topLanguages.length > 0 && (
              <View style={styles.translationDiscoveryLanguageRow}>
                {translationDiscoveryStats.topLanguages.map((language) => (
                  <View key={language} style={styles.translationDiscoveryLanguageChip}>
                    <Text style={styles.translationDiscoveryLanguageChipText}>{language}</Text>
                  </View>
                ))}
              </View>
            )}
          </AppCard>

          <AppCard style={styles.growthCard}>
            <View style={styles.growthTopRow}>
              <View style={styles.growthCopyBlock}>
                <Text style={styles.growthTitle}>Invite and Grow</Text>
                <Text style={styles.growthText}>
                  Share Recaply with your team and build a shared meeting memory system.
                </Text>
              </View>
              <AppButton
                label="Invite"
                variant="dark"
                style={styles.growthInviteButton}
                onPress={() => void shareRecaplyInvite()}
              />
            </View>
          </AppCard>

          {pinnedQuickJumpRecordings.length > 0 && (
            <AppCard style={styles.pinnedQuickRail}>
              <View style={styles.pinnedQuickRailHeader}>
                <Text style={styles.pinnedQuickRailTitle}>Pinned Quick Access</Text>
                <TouchableOpacity onPress={() => setRecordingFilter('pinned')}>
                  <Text style={styles.pinnedQuickRailAction}>View all</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.pinnedQuickCards}>
                {pinnedQuickJumpRecordings.map((recording) => (
                  <TouchableOpacity
                    key={recording.id}
                    style={styles.pinnedQuickCard}
                    onPress={() =>
                      navigation.navigate('Transcript', {
                        transcription: recording.transcript || recording.transcription,
                        filename: recording.filename,
                        recordingId: recording.id,
                        meetingName: recording.meeting_name,
                        meetingLocation: recording.meeting_location,
                        meetingContext: recording.meeting_context,
                        meetingAt: recording.meeting_at,
                        meetingParticipants: recording.meeting_participants,
                      })
                    }
                  >
                    <Text style={styles.pinnedQuickName} numberOfLines={1}>
                      {getRecordingTitle(recording)}
                    </Text>
                    <Text style={styles.pinnedQuickMeta} numberOfLines={1}>
                      {getRecordingMetaLine(recording)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </AppCard>
          )}
        </>
      )}

      <AppCard style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionKicker}>Workspace</Text>
            <Text style={styles.sectionTitle}>Meeting Library</Text>
          </View>
          <View style={styles.sectionActions}>
            <TouchableOpacity onPress={onRefresh} disabled={refreshing || isBulkDeleting || isBulkUpdatingPins}>
              <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleSelectionMode} disabled={isBulkDeleting || isBulkUpdatingPins}>
              <Text style={styles.selectText}>{selectionMode ? 'Cancel' : 'Select'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {initialLoadError && recordings.length === 0 && !loading && (
          <AppCard style={[styles.statusBanner, styles.statusBannerError]}>
            <Text style={styles.statusBannerTitle}>Unable to load recordings</Text>
            <Text style={styles.statusBannerMessage}>{initialLoadError}</Text>
            <AppButton
              label="Retry Load"
              variant="danger"
              style={styles.statusRetryButton}
              onPress={() => fetchRecordings({ reset: true })}
              disabled={loading || refreshing || isBulkDeleting || isBulkUpdatingPins}
            />
          </AppCard>
        )}

        {refreshError && recordings.length > 0 && (
          <AppCard style={[styles.statusBanner, styles.statusBannerWarning]}>
            <Text style={styles.statusBannerTitle}>Refresh issue</Text>
            <Text style={styles.statusBannerMessage}>{refreshError}</Text>
            <AppButton
              label={refreshing ? 'Retrying...' : 'Retry Refresh'}
              variant="warning"
              style={styles.statusRetryButton}
              onPress={onRefresh}
              disabled={refreshing || isBulkDeleting || isBulkUpdatingPins}
              loading={refreshing}
            />
          </AppCard>
        )}

        {partialLoadError && recordings.length > 0 && hasMoreRecordings && (
          <AppCard style={[styles.statusBanner, styles.statusBannerWarning]}>
            <Text style={styles.statusBannerTitle}>Partial history loaded</Text>
            <Text style={styles.statusBannerMessage}>{partialLoadError}</Text>
            <AppButton
              label={isLoadingMore ? 'Retrying...' : 'Retry Load More'}
              variant="warning"
              style={styles.statusRetryButton}
              onPress={loadMoreRecordings}
              disabled={isLoadingMore || refreshing || isBulkDeleting || isBulkUpdatingPins || selectionMode}
              loading={isLoadingMore}
            />
          </AppCard>
        )}

        {selectionMode && (
          <View style={styles.bulkBar}>
            <View style={styles.bulkMeta}>
              <Text style={styles.bulkText}>
                {selectedRecordingIds.length} selected
                {visibleSelectableIds.length > 0 ? ` of ${visibleSelectableIds.length} visible` : ''}
              </Text>
              <View style={styles.bulkQuickActions}>
                <TouchableOpacity
                  style={styles.bulkQuickActionButton}
                  onPress={allVisibleSelected ? clearSelection : selectAllVisibleRecordings}
                  disabled={isBulkDeleting || isBulkUpdatingPins || visibleSelectableIds.length === 0}
                >
                  <Text style={styles.bulkQuickActionText}>
                    {allVisibleSelected ? 'Unselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bulkQuickActionButton}
                  onPress={clearSelection}
                  disabled={isBulkDeleting || isBulkUpdatingPins || selectedRecordingIds.length === 0}
                >
                  <Text style={styles.bulkQuickActionText}>Clear</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.bulkQuickActions}>
                <TouchableOpacity
                  style={[styles.bulkQuickActionButton, styles.bulkPinActionButton]}
                  onPress={() => void applyBulkPinState(true)}
                  disabled={isBulkDeleting || isBulkUpdatingPins || selectedRecordingIds.length === 0}
                >
                  <Text style={[styles.bulkQuickActionText, styles.bulkPinActionText]}>
                    {isBulkUpdatingPins ? 'Updating...' : 'Pin Selected'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkQuickActionButton, styles.bulkPinActionButton]}
                  onPress={() => void applyBulkPinState(false)}
                  disabled={isBulkDeleting || isBulkUpdatingPins || selectedRecordingIds.length === 0}
                >
                  <Text style={[styles.bulkQuickActionText, styles.bulkPinActionText]}>
                    Unpin Selected
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <AppButton
              label={isBulkDeleting ? 'Deleting...' : 'Delete Selected'}
              variant="danger"
              style={styles.bulkDeleteButton}
              onPress={confirmBulkDelete}
              disabled={isBulkDeleting || isBulkUpdatingPins || selectedRecordingIds.length === 0}
              loading={isBulkDeleting}
            />
          </View>
        )}

        {queuedRecordings.length > 0 && (
          <View style={styles.pendingStrip}>
            <View>
              <Text style={styles.pendingStripTitle}>{pendingDisplayCount} uploads waiting</Text>
              <Text style={styles.pendingStripSubtitle}>Queued recordings retry automatically</Text>
            </View>
            <AppButton
              label="Retry now"
              variant="warning"
              style={styles.retryButton}
              textStyle={styles.retryButtonText}
              onPress={onRefresh}
              disabled={refreshing || isBulkUpdatingPins}
            />
          </View>
        )}

        <View style={styles.workspaceLinksRow}>
          <TouchableOpacity style={styles.workspaceLinkCard} onPress={() => navigation.navigate('Ask')}>
            <Text style={styles.workspaceLinkTitle}>Ask Recaply</Text>
            <Text style={styles.workspaceLinkText}>Ask across meetings with cited answers.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.workspaceLinkCard} onPress={() => navigation.navigate('Highlights')}>
            <Text style={styles.workspaceLinkTitle}>Highlights</Text>
            <Text style={styles.workspaceLinkText}>Manage saved key moments in one place.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.refineHeaderRow}>
          <View style={styles.refineHeaderCopy}>
            <Text style={styles.refineTitle}>View Controls</Text>
            <Text style={styles.refineSummaryText}>
              {getFilterLabel(recordingFilter)} • {getSortLabel(sortMode)} • {getGroupLabel(groupMode)} • {getDensityLabel(cardDensity)}
            </Text>
          </View>
          <View style={styles.refineHeaderActions}>
            {(recordingFilter !== 'all'
              || sortMode !== 'newest'
              || groupMode !== 'none'
              || cardDensity !== 'detailed'
              || searchQuery.trim().length > 0) && (
              <TouchableOpacity style={styles.refineResetButton} onPress={resetRefinements}>
                <Text style={styles.refineResetButtonText}>Reset</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.refineToggle} onPress={toggleRefinePanel}>
              <Text style={styles.refineToggleText}>{showRefinePanel ? 'Hide' : 'Refine'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.refineActiveRow}>
          {searchQuery.trim().length > 0 && (
            <TouchableOpacity style={styles.refineActiveChip} onPress={() => setSearchQuery('')}>
              <Text style={styles.refineActiveChipText}>
                Search: {searchQuery.trim().slice(0, 24)}
                {searchQuery.trim().length > 24 ? '...' : ''}
              </Text>
            </TouchableOpacity>
          )}
          {recordingFilter !== 'all' && (
            <TouchableOpacity style={styles.refineActiveChip} onPress={() => setRecordingFilter('all')}>
              <Text style={styles.refineActiveChipText}>Filter: {getFilterLabel(recordingFilter)}</Text>
            </TouchableOpacity>
          )}
          {sortMode !== 'newest' && (
            <TouchableOpacity style={styles.refineActiveChip} onPress={() => setSortMode('newest')}>
              <Text style={styles.refineActiveChipText}>Sort: {getSortLabel(sortMode)}</Text>
            </TouchableOpacity>
          )}
          {groupMode !== 'none' && (
            <TouchableOpacity style={styles.refineActiveChip} onPress={() => setGroupMode('none')}>
              <Text style={styles.refineActiveChipText}>Group: {getGroupLabel(groupMode)}</Text>
            </TouchableOpacity>
          )}
          {cardDensity !== 'detailed' && (
            <TouchableOpacity style={styles.refineActiveChip} onPress={() => void updateCardDensity('detailed')}>
              <Text style={styles.refineActiveChipText}>Cards: {getDensityLabel(cardDensity)}</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.resultsText}>
          Showing {managedRecordings.length} of {recordings.length} loaded recordings
          {hasMoreRecordings ? ' (more available)' : ''}
        </Text>

        {showRefinePanel && (
          <View style={styles.refinePanel}>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search title, location, context, or transcript..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.trim().length > 0 && (
                <TouchableOpacity style={styles.searchClearButton} onPress={() => setSearchQuery('')}>
                  <Text style={styles.searchClearButtonText}>Clear</Text>
                </TouchableOpacity>
                )}
            </View>

            <View style={styles.refineAccordion}>
              <TouchableOpacity style={styles.refineSectionToggle} onPress={() => toggleRefineSection('filter')}>
                <View style={styles.refineSectionHeading}>
                  <Text style={styles.refineSectionLabel}>Filter</Text>
                  <Text style={styles.refineSectionCurrent}>{getFilterLabel(recordingFilter)}</Text>
                </View>
                <Text style={styles.refineSectionToggleGlyph}>{openRefineSection === 'filter' ? '-' : '+'}</Text>
              </TouchableOpacity>
              {openRefineSection === 'filter' && (
                <View style={styles.refineSectionBody}>
                  <View style={styles.filterWrapRow}>
                    {renderFilterChip('all', 'All', recordings.length)}
                    {renderFilterChip('summarized', 'Summarized', summarizedCount)}
                    {renderFilterChip('transcriptOnly', 'Transcript only', transcriptOnlyCount)}
                    {renderFilterChip('pinned', 'Pinned', pinnedCount)}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.refineAccordion}>
              <TouchableOpacity style={styles.refineSectionToggle} onPress={() => toggleRefineSection('sort')}>
                <View style={styles.refineSectionHeading}>
                  <Text style={styles.refineSectionLabel}>Sort</Text>
                  <Text style={styles.refineSectionCurrent}>{getSortLabel(sortMode)}</Text>
                </View>
                <Text style={styles.refineSectionToggleGlyph}>{openRefineSection === 'sort' ? '-' : '+'}</Text>
              </TouchableOpacity>
              {openRefineSection === 'sort' && (
                <View style={styles.refineSectionBody}>
                  <View style={styles.filterWrapRow}>
                    {renderSortChip('pinnedFirst', 'Pinned First')}
                    {renderSortChip('newest', 'Newest')}
                    {renderSortChip('oldest', 'Oldest')}
                    {renderSortChip('name', 'A-Z')}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.refineAccordion}>
              <TouchableOpacity style={styles.refineSectionToggle} onPress={() => toggleRefineSection('group')}>
                <View style={styles.refineSectionHeading}>
                  <Text style={styles.refineSectionLabel}>Grouping</Text>
                  <Text style={styles.refineSectionCurrent}>{getGroupLabel(groupMode)}</Text>
                </View>
                <Text style={styles.refineSectionToggleGlyph}>{openRefineSection === 'group' ? '-' : '+'}</Text>
              </TouchableOpacity>
              {openRefineSection === 'group' && (
                <View style={styles.refineSectionBody}>
                  <View style={styles.filterWrapRow}>
                    {renderGroupChip('none', 'No groups')}
                    {renderGroupChip('date', 'By date')}
                    {renderGroupChip('summary', 'By summary')}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.refineAccordion}>
              <TouchableOpacity style={styles.refineSectionToggle} onPress={() => toggleRefineSection('density')}>
                <View style={styles.refineSectionHeading}>
                  <Text style={styles.refineSectionLabel}>Card style</Text>
                  <Text style={styles.refineSectionCurrent}>{getDensityLabel(cardDensity)}</Text>
                </View>
                <Text style={styles.refineSectionToggleGlyph}>{openRefineSection === 'density' ? '-' : '+'}</Text>
              </TouchableOpacity>
              {openRefineSection === 'density' && (
                <View style={styles.refineSectionBody}>
                  <View style={styles.filterWrapRow}>
                    {renderDensityChip('detailed', 'Detailed')}
                    {renderDensityChip('compact', 'Compact')}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {pinnedCount > 0 && (
          <View style={styles.pinnedSummaryStrip}>
            <View style={styles.pinnedSummaryMeta}>
              <Text style={styles.pinnedSummaryTitle}>{pinnedCount} pinned recordings</Text>
              <Text style={styles.pinnedSummaryText}>Use pinned items to keep key meetings one tap away.</Text>
            </View>
            <View style={styles.pinnedSummaryActions}>
              <TouchableOpacity
                style={styles.pinnedSummaryAction}
                onPress={() => setRecordingFilter('pinned')}
              >
                <Text style={styles.pinnedSummaryActionText}>View Pinned</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pinnedSummaryAction}
                onPress={() => setSortMode('pinnedFirst')}
              >
                <Text style={styles.pinnedSummaryActionText}>Pinned First</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Queued/Pending Recordings */}
        {queuedRecordings.map((item) => (
          <AppCard
            key={item.id}
            style={[styles.recordingCard, styles.pendingCard]}
          >
            <View style={styles.pendingHeader}>
              <Text style={styles.recordingTitle}>
                {item.metadata?.meetingName || item.filename}
              </Text>
              <View style={[
                styles.statusBadge,
                item.status === 'uploading' && styles.uploadingBadge,
                item.status === 'failed' && styles.failedBadge,
              ]}>
                <Text style={styles.statusText}>
                  {item.status === 'uploading' ? 'Uploading' :
                   item.status === 'failed' ? 'Failed' :
                   'Pending'}
                </Text>
              </View>
            </View>
            <Text style={styles.recordingDate}>
              {item.metadata?.meetingAt
                ? formatDate(item.metadata.meetingAt)
                : `${new Date(item.timestamp).toLocaleDateString()} ${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </Text>
            {item.metadata?.meetingLocation && (
              <Text style={styles.pendingMeta}>{item.metadata.meetingLocation}</Text>
            )}
            {item.metadata?.meetingParticipants && item.metadata.meetingParticipants.length > 0 && (
              <Text style={styles.pendingMeta} numberOfLines={1}>
                Participants: {item.metadata.meetingParticipants.join(', ')}
              </Text>
            )}
            {item.metadata?.meetingContext && (
              <Text style={styles.pendingMeta} numberOfLines={1}>{item.metadata.meetingContext}</Text>
            )}
            <Text style={styles.pendingNote}>
              {item.status === 'failed' ? 'Tap refresh to retry upload' : 'Will upload automatically when online'}
            </Text>
            <View style={styles.pendingActionsRow}>
              <TouchableOpacity
                style={styles.pendingDeleteButton}
                onPress={() => confirmDeleteQueued(item)}
                disabled={deletingQueuedId === item.id || item.status === 'uploading'}
              >
                <Text style={styles.pendingDeleteButtonText}>
                  {item.status === 'uploading'
                    ? 'Uploading...'
                    : deletingQueuedId === item.id
                      ? 'Removing...'
                      : 'Remove'}
                </Text>
              </TouchableOpacity>
            </View>
          </AppCard>
        ))}

        {/* Uploaded Recordings */}
        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : initialLoadError && recordings.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Could not load recording history</Text>
            <Text style={styles.emptySubtext}>Tap "Retry Load" above or pull down to try again.</Text>
          </View>
        ) : recordings.length === 0 && queuedRecordings.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No meetings captured yet</Text>
            <Text style={styles.emptySubtext}>Tap "New Recording" to start your first one</Text>
          </View>
        ) : managedRecordings.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No recordings match current filters</Text>
            <Text style={styles.emptySubtext}>Try clearing search or changing sort/group options</Text>
          </View>
        ) : (
          groupedRecordings.map((group) => (
            <View key={group.label} style={styles.groupContainer}>
              {groupMode !== 'none' && <Text style={styles.groupTitle}>{group.label}</Text>}
              {group.items.map((recording) => (
                <AppCard
                  key={recording.id}
                  style={[
                    styles.recordingCard,
                    recording.summary_json && styles.recordingCardSummarized,
                    pinnedSet.has(String(recording.id)) && styles.recordingCardPinned,
                    cardDensity === 'compact' && styles.recordingCardCompact,
                  ]}
                >
                  <View style={styles.recordingTopRow}>
                    <Text style={styles.recordingTitle} numberOfLines={1}>{getRecordingTitle(recording)}</Text>
                    {selectionMode ? (
                      <TouchableOpacity
                        style={[styles.selectButton, selectedSet.has(String(recording.id)) && styles.selectButtonActive]}
                        onPress={() => toggleSelectedRecording(recording.id)}
                      >
                        <Text style={[styles.selectButtonText, selectedSet.has(String(recording.id)) && styles.selectButtonTextActive]}>
                          {selectedSet.has(String(recording.id)) ? 'Selected' : 'Select'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.pinButton, pinnedSet.has(String(recording.id)) && styles.pinButtonActive]}
                        onPress={() => togglePinned(recording.id)}
                      >
                        <Text style={[styles.pinButtonText, pinnedSet.has(String(recording.id)) && styles.pinButtonTextActive]}>
                          {pinnedSet.has(String(recording.id)) ? 'Pinned' : 'Pin'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={[styles.recordingDate, cardDensity === 'compact' && styles.recordingDateCompact]}>
                    {getRecordingMetaLine(recording)}
                  </Text>
                  {getRecordingContext(recording).trim() !== '' && cardDensity !== 'compact' && (
                    <Text style={styles.recordingMetaContext} numberOfLines={2}>
                      {getRecordingContext(recording)}
                    </Text>
                  )}
                  {getRecordingParticipants(recording).length > 0 && cardDensity !== 'compact' && (
                    <Text style={styles.recordingMetaContext} numberOfLines={1}>
                      Participants: {getRecordingParticipants(recording).join(', ')}
                    </Text>
                  )}
                  {renderPreviewText(
                    String(recording.transcript || recording.transcription || ''),
                    cardDensity === 'compact' ? 1 : 2,
                    cardDensity === 'compact' ? styles.recordingPreviewCompact : styles.recordingPreview,
                  )}
                  <View style={[styles.recordingFooterRow, cardDensity === 'compact' && styles.recordingFooterRowCompact]}>
                    <View style={styles.recordingBadgeRow}>
                      {hasRecordingMetadata(recording) && (
                        <View style={styles.metadataBadge}>
                          <Text style={styles.metadataBadgeText}>Context</Text>
                        </View>
                      )}
                      {recording.summary_json && (
                        <View style={styles.summaryBadge}>
                          <Text style={styles.summaryBadgeText}>Summarized</Text>
                        </View>
                      )}
                    </View>
                    {!selectionMode && (
                      <View style={styles.recordingActionRow}>
                        <TouchableOpacity
                          style={styles.openButton}
                          onPress={() => navigation.navigate('Transcript', {
                            transcription: recording.transcript || recording.transcription,
                            filename: recording.filename,
                            recordingId: recording.id,
                            meetingName: recording.meeting_name,
                            meetingLocation: recording.meeting_location,
                            meetingContext: recording.meeting_context,
                            meetingAt: recording.meeting_at,
                            meetingParticipants: recording.meeting_participants,
                          })}
                        >
                          <Text style={styles.openButtonText}>Open</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteInlineButton}
                          onPress={() => confirmSingleDelete(recording)}
                          disabled={deletingRecordingId === String(recording.id)}
                        >
                          <Text style={styles.deleteInlineButtonText}>
                            {deletingRecordingId === String(recording.id) ? 'Deleting...' : 'Delete'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </AppCard>
              ))}
            </View>
          ))
        )}

        {!loading && hasMoreRecordings && (
          <AppButton
            label={isLoadingMore ? 'Loading more...' : 'Load older recordings'}
            variant="dark"
            style={styles.loadMoreButton}
            onPress={loadMoreRecordings}
            disabled={isLoadingMore || refreshing || isBulkDeleting || isBulkUpdatingPins || selectionMode}
            loading={isLoadingMore}
          />
        )}
      </AppCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    paddingTop: 0,
    paddingBottom: 28,
  },
  brandHeader: {
    marginHorizontal: spacing.md,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  brandIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  brandLogoShell: {
    width: 48,
    height: 48,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
  brandLogo: {
    width: '100%',
    height: '100%',
  },
  brandCopyBlock: {
    gap: 2,
  },
  brandWordmark: {
    fontSize: 22,
    color: colors.textPrimary,
    fontFamily: typography.display,
  },
  brandTagline: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  brandStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#bfd4ff',
    backgroundColor: '#e8f1ff',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.pill,
  },
  brandStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: colors.success,
  },
  brandStatusText: {
    fontSize: 11,
    color: colors.accentInfoText,
    letterSpacing: 0.6,
    fontFamily: typography.heading,
  },
  bgGlowTop: {
    position: 'absolute',
    top: -130,
    right: -40,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: '#dbe7ff',
    opacity: 0.7,
  },
  bgGlowMid: {
    position: 'absolute',
    top: 250,
    left: -70,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#edf4ff',
    opacity: 0.8,
  },
  heroCard: {
    marginTop: 6,
    marginHorizontal: spacing.md,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderColor: '#314b68',
    overflow: 'hidden',
    shadowColor: colors.surfaceDark,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 6,
  },
  heroGlowPrimary: {
    position: 'absolute',
    top: -70,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: '#1e6dff',
    opacity: 0.35,
  },
  heroGlowSecondary: {
    position: 'absolute',
    bottom: -90,
    left: -50,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#335f92',
    opacity: 0.35,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroKicker: {
    fontSize: 11,
    color: colors.textOnDarkMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: typography.heading,
  },
  title: {
    marginTop: 8,
    fontSize: 32,
    lineHeight: 36,
    fontFamily: typography.display,
    color: colors.textOnDark,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textOnDarkMuted,
    marginTop: 8,
    lineHeight: 21,
    fontFamily: typography.body,
  },
  heroMetaRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroMetaChip: {
    backgroundColor: '#17314a',
    borderWidth: 1,
    borderColor: '#355474',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroMetaChipAccent: {
    backgroundColor: '#0b5fff',
    borderColor: '#5d91ff',
  },
  heroMetaText: {
    color: colors.textOnDark,
    fontSize: 11,
    fontFamily: typography.heading,
  },
  heroMetaTextAccent: {
    color: colors.surface,
  },
  settingsPill: {
    backgroundColor: '#1a354f',
    borderWidth: 1,
    borderColor: '#3c5f82',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  settingsPillText: {
    color: colors.textOnDark,
    fontSize: 13,
    fontFamily: typography.heading,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 10,
  },
  planLabel: {
    color: colors.textOnDarkMuted,
    fontSize: 13,
    fontFamily: typography.heading,
    marginRight: 8,
  },
  planBadge: {
    backgroundColor: colors.accentStrong,
    borderWidth: 1,
    borderColor: colors.accentDark,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  planBadgePro: {
    backgroundColor: colors.successDark,
    borderColor: colors.success,
  },
  planText: {
    color: colors.surface,
    fontSize: 12,
    fontFamily: typography.heading,
  },
  usageTrack: {
    height: 11,
    backgroundColor: '#17314a',
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  usageFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  usageMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  usageMetaText: {
    fontSize: 12,
    color: colors.textOnDarkMuted,
    fontFamily: typography.body,
  },
  heroActions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
  recordButton: {
    flex: 1,
    paddingVertical: 14,
  },
  recordButtonText: {
    color: colors.surface,
    fontSize: 17,
    fontFamily: typography.heading,
  },
  upgradeButton: {
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  upgradeButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontFamily: typography.heading,
  },
  metricsRow: {
    marginTop: 14,
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    gap: 8,
  },
  instantValueCard: {
    marginTop: 12,
    marginHorizontal: spacing.md,
    borderColor: '#334f71',
    overflow: 'hidden',
  },
  instantValueGlowA: {
    position: 'absolute',
    top: -80,
    right: -10,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#2d89ff',
    opacity: 0.28,
  },
  instantValueGlowB: {
    position: 'absolute',
    bottom: -110,
    left: -20,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#1377d8',
    opacity: 0.22,
  },
  instantValueKicker: {
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.textOnDarkMuted,
    fontFamily: typography.heading,
  },
  instantValueTitle: {
    marginTop: 6,
    fontSize: 22,
    lineHeight: 27,
    color: colors.textOnDark,
    fontFamily: typography.display,
  },
  instantValueText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textOnDarkMuted,
    fontFamily: typography.body,
  },
  instantValueSignalRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  instantValueSignalChip: {
    borderWidth: 1,
    borderColor: '#4f749a',
    backgroundColor: '#17314a',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  instantValueSignalText: {
    fontSize: 11,
    color: colors.textOnDark,
    fontFamily: typography.heading,
  },
  instantValueFlowRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: 6,
  },
  instantValueFlowStep: {
    borderWidth: 1,
    borderColor: '#4a6a8f',
    backgroundColor: '#1e3a58',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  instantValueFlowLabel: {
    fontSize: 11,
    color: colors.textOnDark,
    fontFamily: typography.heading,
  },
  instantValueFlowArrow: {
    color: '#8db4df',
    fontSize: 13,
    fontFamily: typography.heading,
  },
  instantValueButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
  },
  instantValueButtonText: {
    color: colors.surface,
    fontFamily: typography.heading,
  },
  retentionCard: {
    marginTop: 12,
    marginHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#c8d9f6',
    backgroundColor: '#f5f9ff',
  },
  retentionHeaderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  retentionHeaderCopy: {
    flex: 1,
  },
  retentionKicker: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.textMuted,
    fontFamily: typography.heading,
  },
  retentionTitle: {
    marginTop: 4,
    fontSize: 18,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  retentionDetail: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  retentionPill: {
    minWidth: 74,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: '#e8f0ff',
    borderWidth: 1,
    borderColor: '#bfd4ff',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  retentionPillValue: {
    fontSize: 24,
    color: colors.accentInfoText,
    fontFamily: typography.display,
  },
  retentionPillLabel: {
    marginTop: 2,
    fontSize: 10,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  retentionProgressRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  retentionProgressLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  retentionProgressTrack: {
    marginTop: 6,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: '#d9e4f4',
    overflow: 'hidden',
  },
  retentionProgressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  retentionActionButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
  },
  weeklyRecapCard: {
    marginTop: 12,
    marginHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#f0d6ad',
    backgroundColor: '#fff8ef',
  },
  weeklyRecapHeader: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  weeklyRecapCopy: {
    flex: 1,
  },
  weeklyRecapKicker: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.warningText,
    fontFamily: typography.heading,
  },
  weeklyRecapTitle: {
    marginTop: 4,
    fontSize: 17,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  weeklyRecapDetail: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  weeklyRecapDismiss: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#f2c786',
    borderRadius: radii.pill,
    backgroundColor: '#ffeacc',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  weeklyRecapDismissText: {
    fontSize: 11,
    color: colors.warningText,
    fontFamily: typography.heading,
  },
  weeklyRecapMetricRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  weeklyRecapMetric: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#f1ddb7',
    backgroundColor: '#fff2df',
    borderRadius: radii.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  weeklyRecapMetricValue: {
    fontSize: 20,
    color: colors.textPrimary,
    fontFamily: typography.display,
  },
  weeklyRecapMetricLabel: {
    marginTop: 2,
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  weeklyRecapProgressRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weeklyRecapProgressText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  weeklyRecapProgressTrack: {
    marginTop: 6,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: '#ead6b6',
    overflow: 'hidden',
  },
  weeklyRecapProgressFill: {
    height: '100%',
    backgroundColor: '#d98a12',
  },
  weeklyRecapActionRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  weeklyRecapPrimaryButton: {
    flex: 1,
  },
  weeklyRecapSecondaryButton: {
    flex: 1,
  },
  weeklyRecapShareButton: {
    marginTop: 8,
  },
  weeklyShareLanguageRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weeklyShareLanguageChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#dec8a6',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  weeklyShareLanguageChipActive: {
    backgroundColor: colors.surfaceDark,
    borderColor: colors.surfaceDark,
  },
  weeklyShareLanguageChipText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  weeklyShareLanguageChipTextActive: {
    color: colors.textOnDark,
  },
  weeklyRecapTranslateShareButton: {
    marginTop: 8,
  },
  translationDiscoveryCard: {
    marginTop: 12,
    marginHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#b8d0ff',
    backgroundColor: '#edf4ff',
  },
  translationDiscoveryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  translationDiscoveryCopy: {
    flex: 1,
  },
  translationDiscoveryKicker: {
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
    fontFamily: typography.heading,
  },
  translationDiscoveryTitle: {
    marginTop: 3,
    fontSize: 16,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  translationDiscoveryText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  translationDiscoveryMeta: {
    marginTop: 5,
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.heading,
  },
  translationDiscoveryButton: {
    paddingHorizontal: 14,
  },
  translationDiscoveryLanguageRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  translationDiscoveryLanguageChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  translationDiscoveryLanguageChipText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  growthCard: {
    marginTop: 12,
    marginHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#b8d0ff',
    backgroundColor: '#edf4ff',
  },
  growthTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  growthCopyBlock: {
    flex: 1,
  },
  growthTitle: {
    fontSize: 16,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  growthText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  growthInviteButton: {
    paddingHorizontal: 18,
  },
  metricCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
    borderColor: '#d2ddf0',
  },
  metricValue: {
    fontSize: 24,
    fontFamily: typography.display,
    color: colors.textPrimary,
  },
  metricLabel: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  metricHint: {
    marginTop: 4,
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  homeExtrasToggleCard: {
    marginTop: 10,
    marginHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#d2deef',
    backgroundColor: '#f8fbff',
  },
  homeExtrasToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  homeExtrasToggleCopy: {
    flex: 1,
    gap: 3,
  },
  homeExtrasToggleTitle: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  homeExtrasToggleText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    fontFamily: typography.body,
  },
  homeExtrasToggleButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  homeExtrasToggleButtonText: {
    fontSize: 12,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  latestCard: {
    marginTop: 12,
    marginHorizontal: spacing.md,
    padding: 14,
  },
  latestLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
    fontFamily: typography.heading,
  },
  latestTitle: {
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  latestMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  pinnedQuickRail: {
    marginTop: 12,
    marginHorizontal: spacing.md,
    padding: 12,
  },
  pinnedQuickRailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  pinnedQuickRailTitle: {
    fontSize: 14,
    fontFamily: typography.heading,
    color: colors.textPrimary,
  },
  pinnedQuickRailAction: {
    fontSize: 12,
    fontFamily: typography.heading,
    color: colors.accentInfoText,
  },
  pinnedQuickCards: {
    flexDirection: 'row',
    gap: 8,
  },
  pinnedQuickCard: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  pinnedQuickName: {
    fontSize: 12,
    fontFamily: typography.heading,
    color: colors.textPrimary,
  },
  pinnedQuickMeta: {
    marginTop: 4,
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  sectionCard: {
    marginTop: 14,
    marginHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#d2dbea',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  sectionKicker: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
    fontFamily: typography.heading,
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sectionTitle: {
    marginTop: 4,
    fontSize: 24,
    fontFamily: typography.display,
    color: colors.textPrimary,
  },
  statusBanner: {
    marginBottom: 12,
  },
  statusBannerError: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
  },
  statusBannerWarning: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
    borderWidth: 1,
  },
  statusBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  statusBannerMessage: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  statusRetryButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  refreshText: {
    fontSize: 14,
    color: colors.accentStrong,
    fontFamily: typography.heading,
  },
  selectText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  bulkBar: {
    marginBottom: 12,
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  bulkMeta: {
    flex: 1,
  },
  bulkText: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: '700',
  },
  bulkQuickActions: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  bulkQuickActionButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  bulkQuickActionText: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: '700',
  },
  bulkPinActionButton: {
    borderColor: colors.accentInfoBorder,
    backgroundColor: colors.accentInfoSoft,
  },
  bulkPinActionText: {
    color: colors.accentInfoText,
  },
  bulkDeleteButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  pendingStrip: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  pendingStripTitle: {
    color: colors.warningText,
    fontSize: 14,
    fontWeight: '700',
  },
  pendingStripSubtitle: {
    color: colors.warningText,
    fontSize: 12,
    marginTop: 2,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryButtonText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  workspaceLinksRow: {
    marginBottom: 12,
    flexDirection: 'row',
    gap: 8,
  },
  workspaceLinkCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  workspaceLinkTitle: {
    fontSize: 13,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  workspaceLinkText: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    fontFamily: typography.body,
  },
  refineHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  refineHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  refineTitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.textMuted,
    fontFamily: typography.heading,
  },
  refineHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refineResetButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  refineResetButtonText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  refineToggle: {
    backgroundColor: colors.accentInfoSoft,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  refineToggleText: {
    fontSize: 12,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  refineActiveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  refineActiveChip: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refineActiveChipText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  refineSummaryText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    fontFamily: typography.body,
  },
  refinePanel: {
    backgroundColor: '#f6f9ff',
    borderWidth: 1,
    borderColor: '#d2ddf0',
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 14,
  },
  refineAccordion: {
    borderWidth: 1,
    borderColor: '#d8e4f6',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    marginTop: 8,
    overflow: 'hidden',
  },
  refineSectionToggle: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  refineSectionHeading: {
    flex: 1,
    gap: 2,
  },
  refineSectionCurrent: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  refineSectionToggleGlyph: {
    fontSize: 18,
    color: colors.textMuted,
    fontFamily: typography.heading,
    lineHeight: 18,
  },
  refineSectionBody: {
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  refineSectionLabel: {
    fontSize: 12,
    color: colors.textPrimary,
    textTransform: 'none',
    letterSpacing: 0.3,
    fontFamily: typography.heading,
  },
  filterWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    paddingRight: 18,
  },
  filterChip: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: colors.surfaceDark,
    borderColor: colors.surfaceDark,
  },
  filterChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  filterChipTextActive: {
    color: colors.textOnDark,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  searchClearButton: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchClearButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  resultsText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
    fontFamily: typography.heading,
  },
  pinnedSummaryStrip: {
    marginBottom: 12,
    backgroundColor: colors.accentInfoSoft,
    borderColor: colors.accentInfoBorder,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 10,
    gap: 8,
  },
  pinnedSummaryMeta: {
    gap: 2,
  },
  pinnedSummaryTitle: {
    fontSize: 13,
    color: colors.accentInfoText,
    fontWeight: '700',
  },
  pinnedSummaryText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  pinnedSummaryActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  pinnedSummaryAction: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pinnedSummaryActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accentInfoText,
  },
  groupContainer: {
    marginBottom: 6,
  },
  groupTitle: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: typography.heading,
    marginBottom: 8,
    marginTop: 2,
  },
  emptyState: {
    backgroundColor: '#fbfdff',
    borderRadius: radii.lg,
    padding: 36,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#d7e3f4',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 5,
    fontFamily: typography.heading,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    fontFamily: typography.body,
  },
  recordingCard: {
    backgroundColor: '#fcfdff',
    borderRadius: radii.md,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dbe5f3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  recordingCardSummarized: {
    borderColor: '#c8dbff',
    backgroundColor: '#f7faff',
  },
  recordingCardPinned: {
    borderColor: '#f3d083',
    backgroundColor: '#fffcf5',
  },
  recordingCardCompact: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  recordingTitle: {
    fontSize: 16,
    fontFamily: typography.heading,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  recordingTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  pinButton: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pinButtonActive: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  pinButtonText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  pinButtonTextActive: {
    color: colors.warningText,
  },
  selectButton: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectButtonActive: {
    backgroundColor: colors.accentInfoSoft,
    borderColor: colors.accentInfoBorder,
  },
  selectButtonText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  selectButtonTextActive: {
    color: colors.accentInfoText,
  },
  recordingDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
  },
  recordingDateCompact: {
    marginBottom: 6,
  },
  recordingPreview: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  recordingPreviewCompact: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  recordingMetaContext: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  matchHighlight: {
    backgroundColor: colors.warningSoft,
    color: colors.warningText,
    fontWeight: '700',
  },
  summaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentInfoSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.md,
  },
  summaryBadgeText: {
    fontSize: 12,
    fontFamily: typography.heading,
    color: colors.accentInfoText,
  },
  metadataBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.md,
  },
  metadataBadgeText: {
    fontSize: 12,
    fontFamily: typography.heading,
    color: colors.warningText,
  },
  pendingCard: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
    borderWidth: 1,
  },
  pendingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#f59e0b',
  },
  uploadingBadge: {
    backgroundColor: '#3b82f6',
  },
  failedBadge: {
    backgroundColor: '#ef4444',
  },
  statusText: {
    fontSize: 11,
    color: colors.surface,
    fontWeight: '600',
  },
  pendingNote: {
    fontSize: 12,
    color: colors.warningText,
    fontStyle: 'italic',
    marginTop: 4,
  },
  pendingMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pendingActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  pendingDeleteButton: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pendingDeleteButtonText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  recordingFooterRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recordingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flexShrink: 1,
  },
  recordingFooterRowCompact: {
    marginTop: 8,
  },
  openButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  openButtonText: {
    color: colors.surface,
    fontSize: 12,
    fontFamily: typography.heading,
  },
  deleteInlineButton: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteInlineButtonText: {
    color: colors.danger,
    fontSize: 12,
    fontFamily: typography.heading,
  },
  loadMoreButton: {
    marginTop: 4,
    marginBottom: 6,
  },
});
