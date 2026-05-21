import express, { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { updateUserSubscription } from '../services/supabase';
import { verifySubscriptionPurchase } from '../services/googleplay';
import { getSubscriptionPlanByProductId, GOOGLE_PACKAGE_NAME } from '../config/billing';
import { logger, serializeError } from '../services/logger';

const router: Router = express.Router();

/**
 * POST /api/subscription/verify
 * Verify Google Play purchase and update user subscription
 */
router.post('/verify', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { purchaseToken, productId } = req.body;
    const userId = req.userId!;

    logger.info('subscription_verify_requested', {
      requestId: req.requestId,
      userId,
      productId: productId || null,
      hasPurchaseToken: Boolean(purchaseToken),
    });

    if (!purchaseToken || !productId) {
      logger.warn('subscription_verify_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'missing_purchase_token_or_product_id',
        hasPurchaseToken: Boolean(purchaseToken),
        hasProductId: Boolean(productId),
      });
      return res.status(400).json({ error: 'Missing purchaseToken or productId' });
    }

    const plan = getSubscriptionPlanByProductId(productId);
    if (!plan) {
      logger.warn('subscription_verify_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'invalid_product_id',
        productId,
      });
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    // Verify the purchase with Google Play
    const verification = await verifySubscriptionPurchase(
      GOOGLE_PACKAGE_NAME,
      productId,
      purchaseToken
    );

    if (!verification.valid) {
      logger.warn('subscription_verify_invalid_token', {
        requestId: req.requestId,
        userId,
        productId,
        purchaseState: verification.purchaseState,
      });
      return res.status(400).json({ error: 'Invalid purchase token' });
    }

    // Update user subscription in database
    await updateUserSubscription(userId, plan.tier, plan.minutesLimit);
    logger.info('subscription_verify_completed', {
      requestId: req.requestId,
      userId,
      tier: plan.tier,
      minutesLimit: plan.minutesLimit,
      orderId: verification.orderId || null,
    });

    res.json({
      success: true,
      plan: plan.tier,
      minutes: plan.minutesLimit,
      orderId: verification.orderId,
    });
  } catch (error) {
    logger.error('subscription_verify_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: 'Failed to verify purchase' });
  }
});

/**
 * POST /api/subscription/status
 * Check if user's subscription is still active
 */
router.post('/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { purchaseToken, productId } = req.body;
    const userId = req.userId!;

    logger.info('subscription_status_requested', {
      requestId: req.requestId,
      userId,
      productId: productId || null,
      hasPurchaseToken: Boolean(purchaseToken),
    });

    if (!purchaseToken || !productId) {
      logger.warn('subscription_status_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'missing_purchase_token_or_product_id',
        hasPurchaseToken: Boolean(purchaseToken),
        hasProductId: Boolean(productId),
      });
      return res.status(400).json({ error: 'Missing purchaseToken or productId' });
    }

    const verification = await verifySubscriptionPurchase(
      GOOGLE_PACKAGE_NAME,
      productId,
      purchaseToken
    );

    logger.info('subscription_status_completed', {
      requestId: req.requestId,
      userId,
      productId,
      active: verification.valid,
      purchaseState: verification.purchaseState,
    });

    res.json({
      active: verification.valid,
      purchaseState: verification.purchaseState,
    });
  } catch (error) {
    logger.error('subscription_status_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: 'Failed to check subscription status' });
  }
});

export default router;
