import { Router, Request, Response } from 'express';
import { updateUserSubscription } from '../services/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { verifySubscriptionPurchase } from '../services/googleplay';
import { getSubscriptionPlanByProductId, GOOGLE_PACKAGE_NAME } from '../config/billing';
import { logger, serializeError } from '../services/logger';

const router = Router();

// Apple receipt verification endpoints
const APPLE_PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

/**
 * Verify iOS receipt with Apple
 * Handles both production and sandbox environments
 */
async function verifyAppleReceipt(receiptData: string, expectedProductId: string): Promise<boolean> {
  try {
    // First try production
    let response = await fetch(APPLE_PRODUCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receiptData,
        'password': process.env.APPLE_SHARED_SECRET || '',
        'exclude-old-transactions': true,
      }),
    });

    let result: any = await response.json();

    // If production returns sandbox receipt error (21007), try sandbox
    if (result.status === 21007) {
      logger.info('purchase_ios_sandbox_retry', {
        expectedProductId,
      });
      response = await fetch(APPLE_SANDBOX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'receipt-data': receiptData,
          'password': process.env.APPLE_SHARED_SECRET || '',
          'exclude-old-transactions': true,
        }),
      });
      result = await response.json();
    }

    // Check if verification succeeded
    if (result.status !== 0) {
      logger.warn('purchase_ios_receipt_verification_failed', {
        expectedProductId,
        appleStatus: result.status,
      });
      return false;
    }

    const allReceipts: any[] = [
      ...(result.latest_receipt_info || []),
      ...(result.receipt?.in_app || []),
    ];

    const productReceipts = allReceipts.filter(
      (receipt) => receipt.product_id === expectedProductId
    );

    if (productReceipts.length === 0) {
      logger.warn('purchase_ios_receipt_product_mismatch', {
        expectedProductId,
      });
      return false;
    }

    const latestReceipt = productReceipts.sort((a, b) => {
      const aExpiry = parseInt(a.expires_date_ms || '0', 10);
      const bExpiry = parseInt(b.expires_date_ms || '0', 10);
      return bExpiry - aExpiry;
    })[0];

    const expiryMs = parseInt(latestReceipt.expires_date_ms || '0', 10);
    if (expiryMs > 0 && expiryMs <= Date.now()) {
      logger.warn('purchase_ios_receipt_expired', {
        expectedProductId,
        expiryMs,
      });
      return false;
    }

    if (latestReceipt.cancellation_date_ms) {
      logger.warn('purchase_ios_receipt_canceled', {
        expectedProductId,
      });
      return false;
    }

    logger.info('purchase_ios_receipt_verified', {
      expectedProductId,
    });
    return true;
  } catch (error) {
    logger.error('purchase_ios_receipt_verify_failed', {
      expectedProductId,
      ...serializeError(error),
    });
    return false;
  }
}

/**
 * Verify a purchase from Google Play or Apple App Store
 * After verification, update the user's subscription tier
 */
router.post('/verify', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { productId, purchaseToken, transactionReceipt, platform } = req.body;

    if (!userId) {
      logger.warn('purchase_verify_unauthorized', {
        requestId: req.requestId,
      });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!productId || !platform) {
      logger.warn('purchase_verify_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'missing_required_fields',
        hasProductId: Boolean(productId),
        hasPlatform: Boolean(platform),
      });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    logger.info('purchase_verify_requested', {
      requestId: req.requestId,
      userId,
      platform,
      productId,
      hasPurchaseToken: !!purchaseToken,
      hasTransactionReceipt: !!transactionReceipt,
    });

    const plan = getSubscriptionPlanByProductId(productId);
    if (!plan) {
      logger.warn('purchase_verify_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'invalid_product_id',
        productId,
      });
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    // Verify receipt with Apple/Google
    if (platform === 'ios') {
      if (!transactionReceipt) {
        logger.warn('purchase_verify_validation_failed', {
          requestId: req.requestId,
          userId,
          reason: 'missing_ios_transaction_receipt',
        });
        return res.status(400).json({ error: 'Missing iOS transaction receipt' });
      }

      const isValid = await verifyAppleReceipt(transactionReceipt, productId);
      if (!isValid) {
        logger.warn('purchase_verify_receipt_invalid', {
          requestId: req.requestId,
          userId,
          platform,
          productId,
        });
        return res.status(400).json({ error: 'Invalid receipt' });
      }
    } else if (platform === 'android') {
      if (!purchaseToken) {
        logger.warn('purchase_verify_validation_failed', {
          requestId: req.requestId,
          userId,
          reason: 'missing_android_purchase_token',
        });
        return res.status(400).json({ error: 'Missing Android purchase token' });
      }

      const verification = await verifySubscriptionPurchase(
        GOOGLE_PACKAGE_NAME,
        productId,
        purchaseToken
      );

      if (!verification.valid) {
        logger.warn('purchase_verify_android_invalid_token', {
          requestId: req.requestId,
          userId,
          productId,
          purchaseState: verification.purchaseState,
        });
        return res.status(400).json({
          error: 'Invalid purchase token',
          purchaseState: verification.purchaseState,
        });
      }
    } else {
      logger.warn('purchase_verify_validation_failed', {
        requestId: req.requestId,
        userId,
        reason: 'unsupported_platform',
        platform,
      });
      return res.status(400).json({ error: 'Unsupported platform' });
    }

    logger.info('purchase_verify_subscription_update_started', {
      requestId: req.requestId,
      userId,
      tier: plan.tier,
      minutesLimit: plan.minutesLimit,
      productId: plan.productId,
    });

    // Update user subscription in database
    await updateUserSubscription(userId, plan.tier, plan.minutesLimit);
    logger.info('purchase_verify_completed', {
      requestId: req.requestId,
      userId,
      tier: plan.tier,
      minutesLimit: plan.minutesLimit,
      productId: plan.productId,
    });

    res.json({
      success: true,
      tier: plan.tier,
      minutesLimit: plan.minutesLimit,
      productId: plan.productId,
      message: `Subscription activated: ${plan.tier}`,
    });
  } catch (error: any) {
    logger.error('purchase_verify_failed', {
      requestId: req.requestId,
      userId: req.userId,
      ...serializeError(error),
    });
    res.status(500).json({ error: 'Failed to verify purchase', details: error.message });
  }
});

export default router;
