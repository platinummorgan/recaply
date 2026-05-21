import express, { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  getUserUsage,
  getUserById,
  deleteUserAccountData,
  incrementGrowthEventRollup,
} from '../services/supabase';
import supabase from '../services/supabase';
import { logger, serializeError } from '../services/logger';
import { observeActivationEvent, observePaywallEvent, observeTranslationEvent } from '../services/metrics';

const router: Router = express.Router();

const ALLOWED_PAYWALL_EVENTS = new Set([
  'paywall_viewed',
  'paywall_plan_cta_tapped',
  'paywall_purchase_request_started',
  'paywall_purchase_request_failed',
  'paywall_purchase_user_cancelled',
  'paywall_purchase_error',
  'paywall_purchase_verified',
  'paywall_purchase_verification_failed',
  'paywall_restore_tapped',
  'paywall_restore_no_purchases',
  'paywall_restore_completed',
  'paywall_restore_failed',
]);

const ALLOWED_TRANSLATION_EVENTS = new Set([
  'translation_action_started',
  'translation_content_ready',
  'translation_request_failed',
  'translation_share_started',
  'translation_share_completed',
  'translation_share_failed',
  'translation_discovery_opened',
  'translation_insights_cta_tapped',
  'translation_insights_cta_opened',
]);

const ALLOWED_ACTIVATION_EVENTS = new Set([
  'onboarding_viewed',
  'onboarding_skip_tapped',
  'onboarding_completed',
  'home_instant_value_cta_tapped',
  'summary_generate_tapped',
  'summary_generate_completed',
  'summary_generate_failed',
  'summary_followup_draft_tapped',
  'summary_followup_draft_completed',
  'summary_followup_draft_failed',
  'summary_followup_tone_selected',
  'summary_followup_meeting_type_selected',
  'summary_followup_template_selected',
  'summary_followup_copy_tapped',
  'summary_followup_share_tapped',
  'summary_followup_crm_export_tapped',
  'summary_followup_reminder_tapped',
  'summary_followup_resend_tapped',
  'summary_followup_persona_selected',
  'summary_followup_escalation_tapped',
  'summary_followup_escalation_triggered',
  'summary_export_tapped',
  'summary_copy_tapped',
  'summary_share_translation_tapped',
  'summary_done_tapped',
]);

function normalizeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

function normalizePaywallVariant(value: unknown): string {
  const normalized = normalizeString(value, 30);
  if (!normalized) {
    return 'unknown';
  }
  return normalized.toLowerCase();
}

function normalizePaywallTier(value: unknown): string | undefined {
  const normalized = normalizeString(value, 20);
  if (!normalized) {
    return undefined;
  }
  return normalized.toLowerCase();
}

function normalizePaywallSource(value: unknown): string | undefined {
  return normalizeString(value, 60)?.toLowerCase() || undefined;
}

function normalizePaywallOutcome(value: unknown): string | undefined {
  return normalizeString(value, 60)?.toLowerCase() || undefined;
}

function normalizeTranslationSource(value: unknown): string | undefined {
  return normalizeString(value, 60)?.toLowerCase() || undefined;
}

function normalizeTranslationOutcome(value: unknown): string | undefined {
  return normalizeString(value, 60)?.toLowerCase() || undefined;
}

function normalizeTranslationLanguage(value: unknown): string | undefined {
  return normalizeString(value, 60)?.toLowerCase() || undefined;
}

function normalizeActivationSource(value: unknown): string | undefined {
  return normalizeString(value, 60)?.toLowerCase() || undefined;
}

function normalizeActivationOutcome(value: unknown): string | undefined {
  return normalizeString(value, 60)?.toLowerCase() || undefined;
}

function normalizeActivationStep(value: unknown): string | undefined {
  return normalizeString(value, 40)?.toLowerCase() || undefined;
}

/**
 * GET /api/user/me
 * Get current user info
 */
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const user = await getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscription_tier,
        minutesUsed: user.minutes_used,
        minutesLimit: user.minutes_limit,
      },
    });
  } catch (error: any) {
    logger.error('user_profile_fetch_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

/**
 * GET /api/user/usage
 * Get user's usage stats
 */
router.get('/usage', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const usage = await getUserUsage(userId);

    if (!usage) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(usage);
  } catch (error: any) {
    logger.error('user_usage_fetch_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

/**
 * POST /api/user/paywall-events
 * Track frontend paywall conversion events for observability and experiments.
 */
router.post('/paywall-events', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const eventName = normalizeString(req.body?.eventName, 80);
    const variant = normalizePaywallVariant(req.body?.variant);
    const tier = normalizePaywallTier(req.body?.tier);
    const source = normalizePaywallSource(req.body?.source);
    const outcome = normalizePaywallOutcome(req.body?.outcome);
    const productId = normalizeString(req.body?.productId, 120);
    const platform = normalizeString(req.body?.platform, 20);
    const errorCode = normalizeString(req.body?.errorCode, 80);

    if (!eventName) {
      logger.warn('paywall_event_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'missing_event_name',
      });
      return res.status(400).json({ error: 'eventName is required' });
    }

    if (!ALLOWED_PAYWALL_EVENTS.has(eventName)) {
      logger.warn('paywall_event_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'unsupported_event_name',
        eventName,
      });
      return res.status(400).json({ error: 'Unsupported paywall event' });
    }

    observePaywallEvent({
      eventName,
      variant,
      tier,
      source,
      outcome,
    });
    void incrementGrowthEventRollup({
      domain: 'paywall',
      eventName,
      source,
      variant,
      tier,
      outcome,
    }).catch((persistError) => {
      logger.warn('growth_rollup_increment_failed', {
        requestId: req.requestId,
        userId,
        domain: 'paywall',
        eventName,
        ...serializeError(persistError),
      });
    });

    logger.info('paywall_event_tracked', {
      requestId: req.requestId,
      userId,
      eventName,
      variant,
      tier: tier || null,
      source: source || null,
      outcome: outcome || null,
      productId: productId || null,
      platform: platform || null,
      errorCode: errorCode || null,
    });

    res.json({
      success: true,
      eventName,
      variant,
    });
  } catch (error: any) {
    logger.error('paywall_event_track_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: 'Failed to track paywall event' });
  }
});

/**
 * POST /api/user/translation-events
 * Track translation funnel events for growth observability.
 */
router.post('/translation-events', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const eventName = normalizeString(req.body?.eventName, 80);
    const source = normalizeTranslationSource(req.body?.source);
    const targetLanguage = normalizeTranslationLanguage(req.body?.targetLanguage);
    const outcome = normalizeTranslationOutcome(req.body?.outcome);
    const platform = normalizeString(req.body?.platform, 20);
    const errorCode = normalizeString(req.body?.errorCode, 80);
    const recordingId = normalizeString(req.body?.recordingId, 120);

    if (!eventName) {
      logger.warn('translation_event_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'missing_event_name',
      });
      return res.status(400).json({ error: 'eventName is required' });
    }

    if (!ALLOWED_TRANSLATION_EVENTS.has(eventName)) {
      logger.warn('translation_event_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'unsupported_event_name',
        eventName,
      });
      return res.status(400).json({ error: 'Unsupported translation event' });
    }

    observeTranslationEvent({
      eventName,
      source,
      targetLanguage,
      outcome,
    });
    void incrementGrowthEventRollup({
      domain: 'translation',
      eventName,
      source,
      targetLanguage,
      outcome,
    }).catch((persistError) => {
      logger.warn('growth_rollup_increment_failed', {
        requestId: req.requestId,
        userId,
        domain: 'translation',
        eventName,
        ...serializeError(persistError),
      });
    });

    logger.info('translation_event_tracked', {
      requestId: req.requestId,
      userId,
      eventName,
      source: source || null,
      targetLanguage: targetLanguage || null,
      outcome: outcome || null,
      platform: platform || null,
      errorCode: errorCode || null,
      recordingId: recordingId || null,
    });

    res.json({
      success: true,
      eventName,
      source: source || 'unknown',
    });
  } catch (error: any) {
    logger.error('translation_event_track_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: 'Failed to track translation event' });
  }
});

/**
 * POST /api/user/activation-events
 * Track onboarding-to-summary activation funnel events.
 */
router.post('/activation-events', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const eventName = normalizeString(req.body?.eventName, 80);
    const source = normalizeActivationSource(req.body?.source);
    const outcome = normalizeActivationOutcome(req.body?.outcome);
    const step = normalizeActivationStep(req.body?.step);
    const platform = normalizeString(req.body?.platform, 20);
    const errorCode = normalizeString(req.body?.errorCode, 80);
    const recordingId = normalizeString(req.body?.recordingId, 120);

    if (!eventName) {
      logger.warn('activation_event_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'missing_event_name',
      });
      return res.status(400).json({ error: 'eventName is required' });
    }

    if (!ALLOWED_ACTIVATION_EVENTS.has(eventName)) {
      logger.warn('activation_event_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'unsupported_event_name',
        eventName,
      });
      return res.status(400).json({ error: 'Unsupported activation event' });
    }

    observeActivationEvent({
      eventName,
      source,
      outcome,
      step,
    });

    logger.info('activation_event_tracked', {
      requestId: req.requestId,
      userId,
      eventName,
      source: source || null,
      outcome: outcome || null,
      step: step || null,
      platform: platform || null,
      errorCode: errorCode || null,
      recordingId: recordingId || null,
    });

    res.json({
      success: true,
      eventName,
      source: source || 'unknown',
    });
  } catch (error: any) {
    logger.error('activation_event_track_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: 'Failed to track activation event' });
  }
});

/**
 * DELETE /api/user/account
 * Permanently delete authenticated user's account and associated data.
 */
router.delete('/account', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const user = await getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deletionResult = await deleteUserAccountData(userId);

    logger.warn('account_deleted', {
      requestId: req.requestId,
      userId,
      deletedStorageObjects: deletionResult.deletedStorageObjects,
    });

    res.json({
      success: true,
      message: 'Account and associated data deleted',
      deletedStorageObjects: deletionResult.deletedStorageObjects,
    });
  } catch (error: any) {
    logger.error('account_deletion_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });

    res.status(500).json({ error: 'Failed to delete account' });
  }
});

const isTestEndpointEnabled =
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_ENDPOINTS === 'true';

if (isTestEndpointEnabled) {
  /**
   * POST /api/user/set-usage
   * Manually set user's minutes used (for local testing only)
   */
  router.post('/set-usage', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { minutesUsed } = req.body;

      if (typeof minutesUsed !== 'number' || minutesUsed < 0) {
        return res.status(400).json({ error: 'Invalid minutesUsed value' });
      }

      const { error } = await supabase
        .from('users')
        .update({ minutes_used: minutesUsed })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      const user = await getUserById(userId);
      res.json({
        success: true,
        message: `Minutes set to ${minutesUsed}`,
        user: {
          id: user!.id,
          email: user!.email,
          subscriptionTier: user!.subscription_tier,
          minutesUsed: user!.minutes_used,
          minutesLimit: user!.minutes_limit,
        },
      });
    } catch (error: any) {
      logger.error('set_usage_failed', {
        requestId: req.requestId,
        userId: req.userId,
        ...serializeError(error),
      });
      res.status(500).json({ error: 'Failed to set usage' });
    }
  });
}

export default router;
