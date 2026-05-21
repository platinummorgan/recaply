/* eslint-disable import/first */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockUseAuth = jest.fn();
const mockGetRecordingTranslationLanguages = jest.fn();
const mockSummarizeTranslationUsage = jest.fn();
const mockGetFollowUpStrategyTaggingLiveAt = jest.fn();

jest.mock('../context/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

jest.mock('../services/translationUsage', () => ({
  getRecordingTranslationLanguages: (...args: unknown[]) => mockGetRecordingTranslationLanguages(...args),
  summarizeTranslationUsage: (...args: unknown[]) => mockSummarizeTranslationUsage(...args),
}));

jest.mock('../services/translationAnalytics', () => ({
  trackTranslationEvent: jest.fn(),
}));

jest.mock('../services/growthInsightsSettings', () => ({
  DEFAULT_FOLLOW_UP_STRATEGY_TAGGING_LIVE_AT: '2026-05-20T00:00:00.000Z',
  getFollowUpStrategyTaggingLiveAt: (...args: unknown[]) => mockGetFollowUpStrategyTaggingLiveAt(...args),
}));

jest.mock('../config/api', () => ({
  apiUrl: (path: string) => `http://localhost${path}`,
  metricsUrl: (windowDays?: number) => `http://localhost/metrics?windowDays=${windowDays ?? 7}`,
  growthRollupMaintenanceUrl: () => 'http://localhost/metrics/growth-rollups/maintenance',
  growthRollupMaintenanceRunsUrl: (limit?: number) =>
    `http://localhost/metrics/growth-rollups/maintenance-runs${Number.isFinite(limit) ? `?limit=${limit}` : ''}`,
}));

import PaywallInsightsScreen from './PaywallInsightsScreen';

function configureFetch() {
  global.fetch = jest.fn().mockImplementation(async (input: string) => {
    const url = String(input);

    if (url.includes('/metrics/growth-rollups/maintenance-runs')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          available: true,
          persistenceEnabled: true,
          runs: [],
          diagnostics: {
            totalRuns: 0,
            completedRuns: 0,
            unavailableRuns: 0,
            failedRuns: 0,
            dryRuns: 0,
            liveRuns: 0,
            lastFailureAt: null,
            lastFailureMessage: null,
          },
        }),
      };
    }

    if (url.includes('/metrics?windowDays=')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          service: 'recaply-backend',
          startedAt: '2026-05-19T13:00:00.000Z',
          paywall: {
            total: 0,
            byEvent: {},
            byVariant: {},
            byTier: {},
            byOutcome: {},
            bySource: {},
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
            byHour: {},
            topEventSourcePairs: [],
          },
          activation: {
            total: 210,
            byEvent: {
              onboarding_viewed: 100,
              onboarding_completed: 70,
              home_instant_value_cta_tapped: 60,
              summary_generate_tapped: 20,
              summary_generate_completed: 15,
              summary_generate_failed: 5,
              summary_share_translation_tapped: 8,
              summary_export_tapped: 4,
              summary_copy_tapped: 6,
              summary_followup_reminder_tapped: 9,
              summary_followup_resend_tapped: 7,
              summary_followup_persona_selected: 6,
              summary_followup_escalation_tapped: 5,
              summary_followup_escalation_triggered: 3,
            },
            bySource: {
              onboarding: 100,
              home_dashboard: 60,
              transcript_screen: 50,
            },
            byOutcome: {
              completed: 85,
              failed: 5,
              cadence_24h: 4,
              cadence_48h: 5,
              team: 2,
              executive: 3,
              client: 1,
              enabled: 3,
              disabled: 2,
              threshold_24h: 2,
              threshold_72h: 1,
              slack_48h_team_manual: 2,
              email_24h_client_recommended: 1,
              slack_48h_executive_escalated_recommended: 2,
              email_24h_team_manual: 1,
              slack_failed_manual: 1,
              email_24h_team: 1,
              email_failed: 1,
            },
            byStep: {
              step_1: 100,
              step_2: 70,
              followup_strategy_recommendation_shown: 6,
              followup_strategy_recommendation_apply: 4,
            },
            byEventSource: {
              'summary_generate_tapped|transcript_screen': 20,
              'home_instant_value_cta_tapped|home_dashboard': 60,
            },
            byHour: {},
            topEventSourcePairs: [
              { key: 'home_instant_value_cta_tapped|home_dashboard', count: 60 },
              { key: 'summary_generate_tapped|transcript_screen', count: 20 },
            ],
          },
          growthRollups: {
            available: true,
            persistenceEnabled: true,
            windowDays: 7,
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
          },
        }),
      };
    }

    if (url.includes('/audio/recordings?')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          recordings: [],
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

describe('PaywallInsightsScreen', () => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
      token: 'token-1',
    });
    mockGetRecordingTranslationLanguages.mockReturnValue([]);
    mockSummarizeTranslationUsage.mockReturnValue({
      translatedRecordingCount: 0,
      totalLanguageVariants: 0,
      latestTranslationAt: null,
      topLanguages: [],
    });
    mockGetFollowUpStrategyTaggingLiveAt.mockResolvedValue('2026-05-20T00:00:00.000Z');
    configureFetch();
  });

  it('renders activation funnel diagnostics and source mix from metrics payload', async () => {
    const { getByText } = render(<PaywallInsightsScreen navigation={navigation} />);

    await waitFor(() => expect(getByText('Activation Funnel')).toBeTruthy());
    expect(getByText(/Biggest drop-off:/)).toBeTruthy();
    expect(getByText('Core Completion')).toBeTruthy();
    expect(getByText('Activation source mix')).toBeTruthy();
    expect(getByText('home dashboard')).toBeTruthy();
    expect(getByText('Top activation events')).toBeTruthy();
    expect(getByText('Follow-up Reminder Outcomes')).toBeTruthy();
    expect(getByText('Top reminder cadences')).toBeTruthy();
    expect(getByText('Reminder persona selection mix')).toBeTruthy();
    expect(getByText('Resend outcomes by persona')).toBeTruthy();
    expect(getByText('Escalation threshold mix')).toBeTruthy();
    expect(getByText('Escalation rule toggle mix')).toBeTruthy();
    expect(getByText('Top escalated resend outcomes')).toBeTruthy();
    expect(getByText('Rec Apply Rate')).toBeTruthy();
    expect(getByText('Strategy Lift')).toBeTruthy();
    expect(getByText('Legacy/Untagged')).toBeTruthy();
    expect(getByText('Legacy Success')).toBeTruthy();
    expect(getByText(/legacy\/untagged outcomes are excluded from lift/i)).toBeTruthy();
    expect(getByText('Lift Scope')).toBeTruthy();
    expect(getByText('All Window')).toBeTruthy();
    expect(getByText('Post-tagging only')).toBeTruthy();
    expect(getByText('Open Settings')).toBeTruthy();
    fireEvent.press(getByText('Open Settings'));
    expect(navigation.navigate).toHaveBeenCalledWith('Settings');
    expect(getByText('48h')).toBeTruthy();
  });
});
