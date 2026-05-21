import { Platform } from 'react-native';
import { apiUrl } from '../config/api';

export type ActivationEventName =
  | 'onboarding_viewed'
  | 'onboarding_skip_tapped'
  | 'onboarding_completed'
  | 'home_instant_value_cta_tapped'
  | 'summary_generate_tapped'
  | 'summary_generate_completed'
  | 'summary_generate_failed'
  | 'summary_followup_draft_tapped'
  | 'summary_followup_draft_completed'
  | 'summary_followup_draft_failed'
  | 'summary_followup_tone_selected'
  | 'summary_followup_meeting_type_selected'
  | 'summary_followup_template_selected'
  | 'summary_followup_copy_tapped'
  | 'summary_followup_share_tapped'
  | 'summary_followup_crm_export_tapped'
  | 'summary_followup_reminder_tapped'
  | 'summary_followup_resend_tapped'
  | 'summary_followup_persona_selected'
  | 'summary_followup_escalation_tapped'
  | 'summary_followup_escalation_triggered'
  | 'summary_export_tapped'
  | 'summary_copy_tapped'
  | 'summary_share_translation_tapped'
  | 'summary_done_tapped';

export interface ActivationEventPayload {
  eventName: ActivationEventName;
  source: string;
  outcome?: string;
  step?: string;
  recordingId?: string;
  errorCode?: string;
  platform?: string;
}

export async function trackActivationEvent(
  token: string | null | undefined,
  payload: ActivationEventPayload,
): Promise<boolean> {
  if (!token) {
    return false;
  }

  try {
    const response = await fetch(apiUrl('/user/activation-events'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...payload,
        platform: payload.platform || Platform.OS,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
