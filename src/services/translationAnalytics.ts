import { Platform } from 'react-native';
import { apiUrl } from '../config/api';

export type TranslationEventName =
  | 'translation_action_started'
  | 'translation_content_ready'
  | 'translation_request_failed'
  | 'translation_share_started'
  | 'translation_share_completed'
  | 'translation_share_failed'
  | 'translation_discovery_opened'
  | 'translation_insights_cta_tapped'
  | 'translation_insights_cta_opened';

export interface TranslationEventPayload {
  eventName: TranslationEventName;
  source: string;
  targetLanguage?: string;
  outcome?: string;
  recordingId?: string;
  errorCode?: string;
  platform?: string;
}

export async function trackTranslationEvent(
  token: string | null | undefined,
  payload: TranslationEventPayload,
): Promise<boolean> {
  if (!token) {
    return false;
  }

  try {
    const response = await fetch(apiUrl('/user/translation-events'), {
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
