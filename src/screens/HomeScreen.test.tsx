/* eslint-disable import/first */

import React from 'react';
import { Alert, Share } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockUseAuth = jest.fn();
const mockGetRecordingCardDensity = jest.fn();
const mockGetPendingCount = jest.fn();
const mockGetPinnedRecordingIds = jest.fn();
const mockGetHighlightsLibrary = jest.fn();
const mockGetUploadQueue = jest.fn();
const mockRemoveHighlightFromLibrary = jest.fn();
const mockRemoveFromQueue = jest.fn();
const mockSetRecordingCardDensity = jest.fn();
const mockSetPinnedRecordingIds = jest.fn();
const mockTogglePinnedRecordingId = jest.fn();
const mockProcessQueue = jest.fn();
const mockBuildWeeklyRecapStats = jest.fn();
const mockDismissWeeklyRecapForWeek = jest.fn();
const mockGetDismissedWeeklyRecapWeekKey = jest.fn();
const mockSyncWinBackNotification = jest.fn();

jest.mock('expo-file-system', () => ({
  deleteAsync: jest.fn(),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

jest.mock('../services/storage', () => ({
  getRecordingCardDensity: (...args: unknown[]) => mockGetRecordingCardDensity(...args),
  getPendingCount: (...args: unknown[]) => mockGetPendingCount(...args),
  getPinnedRecordingIds: (...args: unknown[]) => mockGetPinnedRecordingIds(...args),
  getHighlightsLibrary: (...args: unknown[]) => mockGetHighlightsLibrary(...args),
  getUploadQueue: (...args: unknown[]) => mockGetUploadQueue(...args),
  removeHighlightFromLibrary: (...args: unknown[]) => mockRemoveHighlightFromLibrary(...args),
  removeFromQueue: (...args: unknown[]) => mockRemoveFromQueue(...args),
  setRecordingCardDensity: (...args: unknown[]) => mockSetRecordingCardDensity(...args),
  setPinnedRecordingIds: (...args: unknown[]) => mockSetPinnedRecordingIds(...args),
  togglePinnedRecordingId: (...args: unknown[]) => mockTogglePinnedRecordingId(...args),
}));

jest.mock('../services/uploadQueue', () => ({
  processQueue: (...args: unknown[]) => mockProcessQueue(...args),
}));

jest.mock('../services/engagement', () => ({
  buildWeeklyRecapStats: (...args: unknown[]) => mockBuildWeeklyRecapStats(...args),
  dismissWeeklyRecapForWeek: (...args: unknown[]) => mockDismissWeeklyRecapForWeek(...args),
  getDismissedWeeklyRecapWeekKey: (...args: unknown[]) => mockGetDismissedWeeklyRecapWeekKey(...args),
  syncWinBackNotification: (...args: unknown[]) => mockSyncWinBackNotification(...args),
}));

jest.mock('../config/api', () => ({
  apiUrl: (path: string) => `http://localhost${path}`,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import HomeScreen from './HomeScreen';

function configureFetch(options?: { askStatus?: number; askPayload?: any }) {
  const askStatus = options?.askStatus ?? 200;
  const askPayload = options?.askPayload ?? {
    answer: 'Deadline is Friday.',
    citations: [
      {
        recordingId: 'rec-1',
        meetingName: 'Source Evidence Meeting',
        meetingAt: '2026-04-24T13:00:00.000Z',
        reason: 'Contains committed due dates.',
        snippet: 'We agreed to ship by Friday end of day.',
      },
    ],
    followUpQuestions: ['What blockers remain?'],
  };

  global.fetch = jest.fn().mockImplementation(async (input: string) => {
    const url = String(input);

    if (url.includes('/audio/recordings?')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          recordings: [
            {
              id: 'rec-1',
              filename: 'planning-sync.m4a',
              created_at: '2026-04-24T13:00:00.000Z',
              transcript: 'We agreed to ship by Friday end of day.',
              summary_json: null,
              meeting_name: 'Planning Sync',
            },
          ],
          pagination: {
            hasMore: false,
            nextOffset: 1,
          },
        }),
      };
    }

    if (url.endsWith('/audio/ask')) {
      return {
        ok: askStatus >= 200 && askStatus < 300,
        status: askStatus,
        json: async () => askPayload,
      };
    }

    if (url.endsWith('/audio/recordings/rec-1')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'rec-1',
          filename: 'planning-sync.m4a',
          transcript: 'We agreed to ship by Friday end of day.',
          audio_url: 'https://example.com/planning-sync.m4a',
          meeting_name: 'Planning Sync',
          meeting_location: 'HQ',
          meeting_context: 'Launch timeline',
          meeting_at: '2026-04-24T13:00:00.000Z',
        }),
      };
    }

    if (url.endsWith('/audio/translate-breakdown')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          targetLanguage: 'Spanish',
          translatedSummary: {
            summary: 'Resumen semanal traducido.',
          },
          translatedTranscript: 'Recap semanal traducido.',
        }),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    };
  }) as jest.Mock;
}

describe('HomeScreen', () => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        subscriptionTier: 'free',
        minutesUsed: 2,
        minutesLimit: 30,
      },
      token: 'token-1',
    });

    mockGetRecordingCardDensity.mockResolvedValue('detailed');
    mockGetPendingCount.mockResolvedValue(0);
    mockGetPinnedRecordingIds.mockResolvedValue([]);
    mockGetHighlightsLibrary.mockResolvedValue([]);
    mockGetUploadQueue.mockResolvedValue([]);
    mockRemoveHighlightFromLibrary.mockResolvedValue(undefined);
    mockRemoveFromQueue.mockResolvedValue(undefined);
    mockSetRecordingCardDensity.mockResolvedValue(undefined);
    mockSetPinnedRecordingIds.mockResolvedValue(undefined);
    mockTogglePinnedRecordingId.mockResolvedValue([]);
    mockProcessQueue.mockResolvedValue(undefined);
    mockBuildWeeklyRecapStats.mockImplementation((recordings: { summary_json?: unknown }[]) => {
      const meetings = recordings.length;
      const summarized = recordings.filter((recording) => Boolean(recording.summary_json)).length;
      const unsummarized = Math.max(meetings - summarized, 0);
      return {
        weekKey: '2026-04-21',
        weekStartMs: new Date('2026-04-21T00:00:00.000Z').getTime(),
        meetingsThisWeek: meetings,
        summarizedThisWeek: summarized,
        unsummarizedThisWeek: unsummarized,
        progressPercent: meetings > 0 ? 20 : 0,
        targetCount: 5,
        headline: 'Weekly recap heading',
        detail: 'Weekly recap detail',
        ctaLabel: unsummarized > 0 ? 'Open next unsummarized' : 'Capture next meeting',
        reentryMode: unsummarized > 0 ? 'summarize' : 'record',
      };
    });
    mockDismissWeeklyRecapForWeek.mockResolvedValue(undefined);
    mockGetDismissedWeeklyRecapWeekKey.mockResolvedValue(null);
    mockSyncWinBackNotification.mockResolvedValue(undefined);

    configureFetch();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('navigates to Ask and Highlights from workspace links', async () => {
    const { getByText } = render(<HomeScreen navigation={navigation} />);
    await waitFor(() => expect(getByText('Ask Recaply')).toBeTruthy());

    fireEvent.press(getByText('Ask Recaply'));
    expect(navigation.navigate).toHaveBeenCalledWith('Ask');

    fireEvent.press(getByText('Highlights'));
    expect(navigation.navigate).toHaveBeenCalledWith('Highlights');
  });

  it('opens weekly recap unsummarized item and supports dismissal', async () => {
    const { getByText, getAllByText, queryByText } = render(<HomeScreen navigation={navigation} />);

    fireEvent.press(getByText('Show'));
    await waitFor(() => expect(queryByText('Weekly recap heading')).toBeTruthy());
    fireEvent.press(getByText('Open next unsummarized'));

    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith(
        'Transcript',
        expect.objectContaining({
          recordingId: 'rec-1',
          meetingName: 'Planning Sync',
        }),
      ),
    );

    fireEvent.press(getAllByText('Hide')[1]);
    await waitFor(() => expect(mockDismissWeeklyRecapForWeek).toHaveBeenCalledWith('2026-04-21'));
  });

  it('shares weekly recap summary from the re-entry card', async () => {
    const { getByText } = render(<HomeScreen navigation={navigation} />);
    fireEvent.press(getByText('Show'));
    await waitFor(() => expect(getByText('Share Weekly Recap')).toBeTruthy());

    fireEvent.press(getByText('Share Weekly Recap'));
    await waitFor(() => expect(Share.share).toHaveBeenCalled());
  });

  it('shares translated weekly recap from the re-entry card', async () => {
    const { getByText } = render(<HomeScreen navigation={navigation} />);
    fireEvent.press(getByText('Show'));
    await waitFor(() => expect(getByText('Share Recap in Spanish')).toBeTruthy());

    fireEvent.press(getByText('Share Recap in Spanish'));
    await waitFor(() => expect(Share.share).toHaveBeenCalled());
    expect((global.fetch as jest.Mock).mock.calls.some((call) => String(call[0]).includes('/audio/translate-breakdown'))).toBe(true);
  });
});
