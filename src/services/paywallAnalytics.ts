import { Platform } from 'react-native';
import { apiUrl } from '../config/api';

export type PaywallVariant = 'value' | 'roi' | 'unknown';

export type PaywallEventName =
  | 'paywall_viewed'
  | 'paywall_plan_cta_tapped'
  | 'paywall_purchase_request_started'
  | 'paywall_purchase_request_failed'
  | 'paywall_purchase_user_cancelled'
  | 'paywall_purchase_error'
  | 'paywall_purchase_verified'
  | 'paywall_purchase_verification_failed'
  | 'paywall_restore_tapped'
  | 'paywall_restore_no_purchases'
  | 'paywall_restore_completed'
  | 'paywall_restore_failed';

export interface PaywallEventPayload {
  eventName: PaywallEventName;
  variant: PaywallVariant | string;
  tier?: string;
  source?: string;
  outcome?: string;
  productId?: string;
  errorCode?: string;
  platform?: string;
}

export async function trackPaywallEvent(
  token: string | null | undefined,
  payload: PaywallEventPayload,
): Promise<boolean> {
  if (!token) {
    return false;
  }

  try {
    const response = await fetch(apiUrl('/user/paywall-events'), {
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

