import { Router, Request, Response } from 'express';
import { updateUserSubscription } from '../services/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * Verify a purchase from Google Play or Apple App Store
 * After verification, update the user's subscription tier
 */
router.post('/verify', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { productId, purchaseToken, transactionReceipt, platform } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!productId || !purchaseToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`[Purchases] Verifying ${platform} purchase for user ${userId}`, {
      productId,
      purchaseToken: purchaseToken.substring(0, 20) + '...',
    });

    // TODO: Implement actual verification with Google Play Billing or Apple App Store
    // For now, we trust the client (for closed testing only!)
    // In production, you MUST verify with the store servers:
    //
    // Android: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions/get
    // iOS: https://developer.apple.com/documentation/appstorereceipts/verifyreceipt

    // Map product IDs to subscription tiers
    let tier: 'lite' | 'pro' = 'lite';
    let minutesLimit = 120;

    if (productId === 'recaply_pro_monthly') {
      tier = 'pro';
      minutesLimit = 999999; // Unlimited
    } else if (productId === 'recaply_lite_monthly') {
      tier = 'lite';
      minutesLimit = 120;
    } else {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    console.log(`[Purchases] Updating user ${userId} to ${tier} tier`);

    // Update user subscription in database
    await updateUserSubscription(userId, tier, minutesLimit);

    res.json({
      success: true,
      tier,
      minutesLimit,
      message: `Subscription activated: ${tier}`,
    });
  } catch (error: any) {
    console.error('[Purchases] Error verifying purchase:', error);
    res.status(500).json({ error: 'Failed to verify purchase', details: error.message });
  }
});

export default router;
