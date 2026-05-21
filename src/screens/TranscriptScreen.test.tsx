/* eslint-disable import/first */

import React from 'react';
import { Alert, Share } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockCreateSoundAsync = jest.fn();
const mockUseAuth = jest.fn();
const mockClipboardSetStringAsync = jest.fn();

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: (...args: unknown[]) => mockClipboardSetStringAsync(...args),
}));

jest.mock('expo-file-system', () => ({
  Paths: {
    cache: '/tmp/cache',
    document: '/tmp/document',
  },
  File: jest.fn(),
  Directory: jest.fn(),
}));

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: (...args: unknown[]) => mockCreateSoundAsync(...args),
    },
  },
}));

jest.mock('@react-native-community/slider', () => 'Slider');

jest.mock('../context/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

import TranscriptScreen from './TranscriptScreen';

describe('TranscriptScreen', () => {
  const navigation = {
    navigate: jest.fn(),
    replace: jest.fn(),
    goBack: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockUseAuth.mockReturnValue({
      token: 'token-1',
    });
    mockClipboardSetStringAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generates and renders AI summary', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: 'This is a generated summary.',
        actionItems: [{ task: 'Follow up with team' }],
        keyPoints: ['Key point A'],
      }),
    }) as jest.Mock;

    const { getByText, queryByText } = render(
      <TranscriptScreen
        route={{
          params: {
            transcription: 'meeting transcript text',
            filename: 'meeting.m4a',
          },
        }}
        navigation={navigation}
      />,
    );

    fireEvent.press(getByText('✨ Generate AI Summary'));

    await waitFor(() =>
      expect((global.fetch as jest.Mock).mock.calls.some((call) => String(call[0]).includes('/api/audio/summary'))).toBe(true),
    );
    await waitFor(() => expect(queryByText('📝 Summary')).toBeTruthy());
    expect(queryByText('This is a generated summary.')).toBeTruthy();
  });

  it('answers across meetings and opens cited source meeting', async () => {
    global.fetch = jest.fn().mockImplementation(async (input: string) => {
      const url = String(input);

      if (url.includes('/api/audio/ask')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
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
          }),
        };
      }

      if (url.includes('/api/audio/recordings/rec-1')) {
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

      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      };
    }) as jest.Mock;

    const { getByText, getByPlaceholderText, getByDisplayValue, queryByText } = render(
      <TranscriptScreen
        route={{
          params: {
            transcription: 'meeting transcript text',
            filename: 'meeting.m4a',
          },
        }}
        navigation={navigation}
      />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Example: what deadlines did we commit to this week?'),
      'What deadlines did we commit to?',
    );
    fireEvent.press(getByText('Ask'));

    await waitFor(() => expect(queryByText('Deadline is Friday.')).toBeTruthy());
    expect(queryByText('Source Evidence Meeting')).toBeTruthy();

    fireEvent.press(getByText('What blockers remain?'));
    await waitFor(() => expect(getByDisplayValue('What blockers remain?')).toBeTruthy());

    fireEvent.press(getByText('Source Evidence Meeting'));
    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith(
        'Transcript',
        expect.objectContaining({
          recordingId: 'rec-1',
          meetingName: 'Planning Sync',
        }),
      ),
    );
  });

  it('generates follow-up draft with selected tone and supports channel actions', async () => {
    global.fetch = jest.fn().mockImplementation(async (input: string) => {
      const url = String(input);

      if (url.includes('/api/audio/summary')) {
        return {
          ok: true,
          json: async () => ({
            summary: 'Summary for follow-up drafting.',
            actionItems: [
              {
                task: 'Send stakeholder update',
                assignee: 'Alex',
                priority: 'high',
                deadline: '2020-01-01T00:00:00.000Z',
              },
            ],
            keyPoints: ['Budget approved'],
          }),
        };
      }

      if (url.includes('/api/audio/followup-draft')) {
        return {
          ok: true,
          json: async () => ({
            subject: 'Project Sync Follow-up',
            emailBody: 'Thanks all. Please see owners and due dates below.',
            slackMessage: 'Follow-up recap is ready for review.',
            actionChecklist: ['Send recap email', 'Confirm delivery timeline'],
            tone: 'friendly',
            minutesUsed: 1,
          }),
        };
      }

      return {
        ok: false,
        status: 404,
      };
    }) as jest.Mock;

    const { getByText, queryByText } = render(
      <TranscriptScreen
        route={{
          params: {
            recordingId: 'recording-123',
            transcription: 'meeting transcript text',
            filename: 'meeting.m4a',
            meetingName: 'Project Sync',
          },
        }}
        navigation={navigation}
      />,
    );

    fireEvent.press(getByText('✨ Generate AI Summary'));
    await waitFor(() => expect(queryByText('Summary for follow-up drafting.')).toBeTruthy());

    fireEvent.press(getByText('Sales Call'));
    fireEvent.press(getByText('Client Update'));
    fireEvent.press(getByText('Friendly'));
    fireEvent.press(getByText('Draft Follow-up'));

    await waitFor(() => expect(queryByText('Project Sync Follow-up')).toBeTruthy());
    await waitFor(() => expect(queryByText('Strategy Autopilot')).toBeTruthy());
    expect((global.fetch as jest.Mock).mock.calls.some((call) => String(call[0]).includes('/api/audio/followup-draft'))).toBe(true);

    const draftCall = (global.fetch as jest.Mock).mock.calls.find((call) =>
      String(call[0]).includes('/api/audio/followup-draft'),
    );
    expect(draftCall).toBeDefined();
    const draftPayload = JSON.parse(String(draftCall?.[1]?.body || '{}'));
    expect(draftPayload.tone).toBe('friendly');
    expect(draftPayload.meetingType).toBe('sales_call');
    expect(draftPayload.templateStyle).toBe('client_update');

    fireEvent.press(getByText('Copy Email'));
    await waitFor(() => expect(mockClipboardSetStringAsync).toHaveBeenCalledTimes(1));
    expect(String(mockClipboardSetStringAsync.mock.calls[0][0])).toContain('Thanks all.');

    fireEvent.press(getByText('Copy HubSpot'));
    await waitFor(() => expect(mockClipboardSetStringAsync).toHaveBeenCalledTimes(2));
    expect(String(mockClipboardSetStringAsync.mock.calls[1][0])).toContain('HubSpot Engagement Update');

    fireEvent.press(getByText('Share Slack'));
    await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(1));
    fireEvent.press(getByText('48h'));
    fireEvent.press(getByText('Resend Slack Nudge'));
    await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(2));
    expect(String((Share.share as jest.Mock).mock.calls[1][0]?.message || '')).toContain('Escalation (48h)');
    expect(String((Share.share as jest.Mock).mock.calls[1][0]?.message || '')).toContain('Persona: Executive');
    expect(String((Share.share as jest.Mock).mock.calls[1][0]?.message || '')).toContain('[ESCALATED]');

    fireEvent.press(getByText('Copy Follow-up'));
    await waitFor(() => expect(mockClipboardSetStringAsync).toHaveBeenCalledTimes(3));
    expect(String(mockClipboardSetStringAsync.mock.calls[2][0])).toContain('Project Sync Follow-up');
  });

  it('generates reusable output template packs and supports copy/share', async () => {
    global.fetch = jest.fn().mockImplementation(async (input: string) => {
      const url = String(input);

      if (url.includes('/api/audio/summary')) {
        return {
          ok: true,
          json: async () => ({
            summary: 'Launch is on track with one dependency risk.',
            actionItems: [{ task: 'Confirm final QA signoff', assignee: 'Jordan' }],
            keyPoints: ['Budget approved', 'Scope locked'],
          }),
        };
      }

      return {
        ok: false,
        status: 404,
      };
    }) as jest.Mock;

    const { getByText, queryByText } = render(
      <TranscriptScreen
        route={{
          params: {
            recordingId: 'recording-123',
            transcription: 'meeting transcript text',
            filename: 'meeting.m4a',
            meetingName: 'Project Sync',
          },
        }}
        navigation={navigation}
      />,
    );

    fireEvent.press(getByText('✨ Generate AI Summary'));
    await waitFor(() => expect(queryByText('Launch is on track with one dependency risk.')).toBeTruthy());
    await waitFor(() => expect(queryByText('Template Output Packs')).toBeTruthy());

    fireEvent.press(getByText('Client Recap'));
    fireEvent.press(getByText('Copy Pack'));

    await waitFor(() => expect(mockClipboardSetStringAsync).toHaveBeenCalledTimes(1));
    expect(String(mockClipboardSetStringAsync.mock.calls[0][0])).toContain('Client Recap - Project Sync');
    expect(String(mockClipboardSetStringAsync.mock.calls[0][0])).toContain('Confirmed Next Steps:');

    fireEvent.press(getByText('Share Pack'));
    await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(1));
    expect(String((Share.share as jest.Mock).mock.calls[0][0]?.message || '')).toContain('Client Recap - Project Sync');
  });

  it('generates meeting prep brief with selected tone and supports copy/share actions', async () => {
    global.fetch = jest.fn().mockImplementation(async (input: string) => {
      const url = String(input);

      if (url.includes('/api/audio/summary')) {
        return {
          ok: true,
          json: async () => ({
            summary: 'Summary for prep brief generation.',
            actionItems: [{ task: 'Confirm timeline owners' }],
            keyPoints: ['Risk flagged'],
          }),
        };
      }

      if (url.includes('/api/audio/prep-brief')) {
        return {
          ok: true,
          json: async () => ({
            briefSummary: 'Customer timeline and procurement risk should be validated up front.',
            strategicFocus: ['Get owner confirmation for legal redlines'],
            likelyRisks: ['Contract signing may slip by 2 weeks'],
            preCallQuestions: ['What is the final signature path and date?'],
            openingScript: 'Thanks everyone. I want to align on owners and timeline risk first.',
            prepTone: 'challenger',
            minutesUsed: 1,
          }),
        };
      }

      return {
        ok: false,
        status: 404,
      };
    }) as jest.Mock;

    const { getByText, getByPlaceholderText, queryByText } = render(
      <TranscriptScreen
        route={{
          params: {
            recordingId: 'recording-456',
            transcription: 'meeting transcript text',
            filename: 'meeting.m4a',
            meetingName: 'Enterprise Renewal',
          },
        }}
        navigation={navigation}
      />,
    );

    fireEvent.press(getByText('✨ Generate AI Summary'));
    await waitFor(() => expect(queryByText('Summary for prep brief generation.')).toBeTruthy());

    fireEvent.changeText(
      getByPlaceholderText('Example: Align on timeline risks and secure owner commitments'),
      'Challenge assumptions around procurement and launch dependencies.',
    );
    fireEvent.press(getByText('Challenger'));
    fireEvent.press(getByText('Generate Prep Brief'));

    await waitFor(() => expect(queryByText('Customer timeline and procurement risk should be validated up front.')).toBeTruthy());
    expect((global.fetch as jest.Mock).mock.calls.some((call) => String(call[0]).includes('/api/audio/prep-brief'))).toBe(true);

    const prepCall = (global.fetch as jest.Mock).mock.calls.find((call) =>
      String(call[0]).includes('/api/audio/prep-brief'),
    );
    expect(prepCall).toBeDefined();
    const prepPayload = JSON.parse(String(prepCall?.[1]?.body || '{}'));
    expect(prepPayload.prepTone).toBe('challenger');
    expect(prepPayload.prepGoal).toBe('Challenge assumptions around procurement and launch dependencies.');

    fireEvent.press(getByText('Copy Brief'));
    await waitFor(() => expect(mockClipboardSetStringAsync).toHaveBeenCalledTimes(1));
    expect(String(mockClipboardSetStringAsync.mock.calls[0][0])).toContain('Recaply Meeting Prep Brief (challenger)');

    fireEvent.press(getByText('Share Brief'));
    await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(1));
    expect(String((Share.share as jest.Mock).mock.calls[0][0]?.message || '')).toContain('Strategic Focus:');
  });

  it('creates branded share bundles with deep links and supports copy/share actions', async () => {
    global.fetch = jest.fn().mockImplementation(async (input: string) => {
      const url = String(input);

      if (url.includes('/api/audio/summary')) {
        return {
          ok: true,
          json: async () => ({
            summary: 'Launch is on track with one dependency risk.',
            actionItems: [{ task: 'Confirm final QA signoff', assignee: 'Jordan' }],
            keyPoints: ['Budget approved', 'Scope locked'],
          }),
        };
      }

      return {
        ok: false,
        status: 404,
      };
    }) as jest.Mock;

    const { getByText, queryByText } = render(
      <TranscriptScreen
        route={{
          params: {
            recordingId: 'recording-123',
            transcription: 'meeting transcript text',
            filename: 'meeting.m4a',
            meetingName: 'Project Sync',
          },
        }}
        navigation={navigation}
      />,
    );

    fireEvent.press(getByText('✨ Generate AI Summary'));
    await waitFor(() => expect(queryByText('Launch is on track with one dependency risk.')).toBeTruthy());
    await waitFor(() => expect(queryByText('Branded Share Bundle')).toBeTruthy());

    fireEvent.press(getByText('Story Format'));
    fireEvent.press(getByText('Copy Link'));
    await waitFor(() => expect(mockClipboardSetStringAsync).toHaveBeenCalledTimes(1));
    expect(String(mockClipboardSetStringAsync.mock.calls[0][0])).toContain('recaply://transcript?recordingId=recording-123');

    fireEvent.press(getByText('Copy Bundle'));
    await waitFor(() => expect(mockClipboardSetStringAsync).toHaveBeenCalledTimes(2));
    const bundleText = String(mockClipboardSetStringAsync.mock.calls[1][0]);
    expect(bundleText).toContain('Recaply Share Bundle');
    expect(bundleText).toContain('Open in Recaply: recaply://transcript?recordingId=recording-123');
    expect(bundleText).toContain('Install Recaply: https://play.google.com/store/apps/details?id=com.recaply.app');

    fireEvent.press(getByText('Share Bundle'));
    await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(1));
    expect(String((Share.share as jest.Mock).mock.calls[0][0]?.message || '')).toContain('Bundle ID: RCP-');
  });

  it('plays and pauses audio from provided audio URL', async () => {
    const mockPauseAsync = jest.fn().mockResolvedValue(undefined);
    const mockPlayAsync = jest.fn().mockResolvedValue(undefined);

    mockCreateSoundAsync.mockResolvedValue({
      sound: {
        pauseAsync: mockPauseAsync,
        playAsync: mockPlayAsync,
        unloadAsync: jest.fn(),
      },
    });

    const { getByText, queryByText } = render(
      <TranscriptScreen
        route={{
          params: {
            transcription: 'meeting transcript text',
            filename: 'meeting.m4a',
            audioUrl: 'https://example.com/audio.m4a',
          },
        }}
        navigation={navigation}
      />,
    );

    fireEvent.press(getByText('▶️ Play'));

    await waitFor(() => expect(mockCreateSoundAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(queryByText('⏸️ Pause')).toBeTruthy());

    fireEvent.press(getByText('⏸️ Pause'));
    await waitFor(() => expect(mockPauseAsync).toHaveBeenCalledTimes(1));
  });

  it('shows summary error alert when summary API fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as jest.Mock;

    const { getByText } = render(
      <TranscriptScreen
        route={{
          params: {
            transcription: 'meeting transcript text',
            filename: 'meeting.m4a',
          },
        }}
        navigation={navigation}
      />,
    );

    fireEvent.press(getByText('✨ Generate AI Summary'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        expect.stringContaining('Could not generate summary: Failed: 500'),
      ),
    );
  });

  it('shows playback error alert when audio playback fails to initialize', async () => {
    mockCreateSoundAsync.mockRejectedValue(new Error('stream failed'));

    const { getByText } = render(
      <TranscriptScreen
        route={{
          params: {
            transcription: 'meeting transcript text',
            filename: 'meeting.m4a',
            audioUrl: 'https://example.com/audio.m4a',
          },
        }}
        navigation={navigation}
      />,
    );

    fireEvent.press(getByText('▶️ Play'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Playback Error', 'stream failed'),
    );
  });

  it('translates generated summary breakdown to selected language', async () => {
    global.fetch = jest.fn().mockImplementation(async (input: string) => {
      const url = String(input);

      if (url.includes('/api/audio/summary')) {
        return {
          ok: true,
          json: async () => ({
            summary: 'This is an English summary.',
            actionItems: [{ task: 'Prepare a launch update' }],
            keyPoints: ['Launch date confirmed'],
          }),
        };
      }

      if (url.includes('/api/audio/translate-breakdown')) {
        return {
          ok: true,
          json: async () => ({
            targetLanguage: 'Spanish',
            translatedSummary: {
              summary: 'Este es un resumen en espanol.',
              actionItems: [{ task: 'Preparar una actualizacion de lanzamiento' }],
              keyPoints: ['Fecha de lanzamiento confirmada'],
            },
          }),
        };
      }

      return {
        ok: false,
        status: 404,
      };
    }) as jest.Mock;

    const { getByText, queryByText } = render(
      <TranscriptScreen
        route={{
          params: {
            transcription: 'meeting transcript text',
            filename: 'meeting.m4a',
          },
        }}
        navigation={navigation}
      />,
    );

    fireEvent.press(getByText('✨ Generate AI Summary'));
    await waitFor(() => expect(queryByText('This is an English summary.')).toBeTruthy());

    fireEvent.press(getByText('Translate'));
    await waitFor(() => expect(queryByText('Este es un resumen en espanol.')).toBeTruthy());
    expect((global.fetch as jest.Mock).mock.calls.some((call) => String(call[0]).includes('/api/audio/translate-breakdown'))).toBe(true);
  });

  it('shares translated recap in selected language with one tap', async () => {
    global.fetch = jest.fn().mockImplementation(async (input: string) => {
      const url = String(input);

      if (url.includes('/api/audio/translate-breakdown')) {
        return {
          ok: true,
          json: async () => ({
            targetLanguage: 'Spanish',
            translatedSummary: {
              summary: 'Resumen para compartir.',
              actionItems: [{ task: 'Actualizar al equipo' }],
              keyPoints: ['Lanzamiento confirmado'],
            },
            translatedTranscript: 'Transcripcion traducida para compartir.',
          }),
        };
      }

      return {
        ok: false,
        status: 404,
      };
    }) as jest.Mock;

    const { getByText } = render(
      <TranscriptScreen
        route={{
          params: {
            transcription: 'meeting transcript text',
            filename: 'meeting.m4a',
            meetingName: 'Global Planning',
          },
        }}
        navigation={navigation}
      />,
    );

    fireEvent.press(getByText('Share in Selected Language'));

    await waitFor(() => expect(Share.share).toHaveBeenCalled());
    expect((global.fetch as jest.Mock).mock.calls.some((call) => String(call[0]).includes('/api/audio/translate-breakdown'))).toBe(true);
  });

  it('reuses saved translation cache for revisited recordings', async () => {
    global.fetch = jest.fn().mockImplementation(async (input: string) => {
      const url = String(input);

      if (url.includes('/api/audio/recordings/recording-1')) {
        return {
          ok: true,
          json: async () => ({
            id: 'recording-1',
            summary_json: {
              summary: 'This is an English summary.',
              actionItems: [],
              keyPoints: [],
            },
            translation_cache_json: {
              spanish: {
                targetLanguage: 'Spanish',
                translatedSummary: {
                  summary: 'Este es un resumen guardado.',
                  actionItems: [],
                  keyPoints: [],
                },
                translatedTranscript: 'Esta es una transcripcion guardada.',
                updatedAt: '2026-04-25T12:00:00.000Z',
              },
            },
          }),
        };
      }

      if (url.includes('/api/audio/translate-breakdown')) {
        return {
          ok: true,
          json: async () => ({
            targetLanguage: 'Spanish',
            translatedSummary: {
              summary: 'Should not be used',
              actionItems: [],
              keyPoints: [],
            },
          }),
        };
      }

      return {
        ok: false,
        status: 404,
      };
    }) as jest.Mock;

    const { getByText, queryByText } = render(
      <TranscriptScreen
        route={{
          params: {
            recordingId: 'recording-1',
            transcription: 'This is the original transcript.',
            filename: 'meeting.m4a',
          },
        }}
        navigation={navigation}
      />,
    );

    await waitFor(() => expect(queryByText('This is an English summary.')).toBeTruthy());
    await waitFor(() => expect(queryByText('Saved for this recording:')).toBeTruthy());

    fireEvent.press(getByText('Translate'));

    await waitFor(() => expect(queryByText('Este es un resumen guardado.')).toBeTruthy());
    await waitFor(() => expect(queryByText('Esta es una transcripcion guardada.')).toBeTruthy());
    expect((global.fetch as jest.Mock).mock.calls.some((call) => String(call[0]).includes('/api/audio/translate-breakdown'))).toBe(false);
  });

  it('applies export template selection when copying transcript', async () => {
    const { getByText } = render(
      <TranscriptScreen
        route={{
          params: {
            transcription: 'meeting transcript text',
            filename: 'meeting.m4a',
            meetingParticipants: ['Alex', 'Taylor'],
          },
        }}
        navigation={navigation}
      />,
    );

    fireEvent.press(getByText('Brief'));
    fireEvent.press(getByText('Copy Text'));

    await waitFor(() => expect(mockClipboardSetStringAsync).toHaveBeenCalledTimes(1));
    const exported = mockClipboardSetStringAsync.mock.calls[0][0];
    expect(exported).toContain('Participants: Alex, Taylor');
    expect(exported).toContain('=== MEETING SNAPSHOT ===');
    expect(exported).not.toContain('=== TRANSCRIPT ===');
  });
});
