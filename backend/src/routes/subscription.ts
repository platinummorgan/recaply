import express, { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { updateUserSubscription } from '../services/supabase';
import { verifySubscriptionPurchase } from '../services/googleplay';

const router: Router = express.Router();

// Package name from your app's build.gradle
const PACKAGE_NAME = 'com.recaply.app'; // TODO: Update with your actual package name

// Subscription product IDs from Google Play Console
const SUBSCRIPTION_IDS: Record<string, { sku: string; minutes: number }> = {
  lite: { sku: 'recaply_lite_monthly', minutes: 300 },
  pro: { sku: 'recaply_pro_monthly', minutes: 999999 },
};

/**
 * POST /api/subscription/verify
 * Verify Google Play purchase and update user subscription
 */
router.post('/verify', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { purchaseToken, productId } = req.body;
    const userId = req.userId!;

    if (!purchaseToken || !productId) {
      return res.status(400).json({ error: 'Missing purchaseToken or productId' });
    }

    // Find the plan based on product ID
    const planKey = Object.keys(SUBSCRIPTION_IDS).find(
      (key) => SUBSCRIPTION_IDS[key].sku === productId
    );

    if (!planKey) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    // Verify the purchase with Google Play
    const verification = await verifySubscriptionPurchase(
      PACKAGE_NAME,
      productId,
      purchaseToken
    );

    if (!verification.valid) {
      return res.status(400).json({ error: 'Invalid purchase token' });
    }

    // Update user subscription in database
    const plan = planKey as 'lite' | 'pro';
    const minutes = SUBSCRIPTION_IDS[plan].minutes;
    await updateUserSubscription(userId, plan, minutes);

    res.json({
      success: true,
      plan,
      minutes,
      orderId: verification.orderId,
    });
  } catch (error: any) {
    console.error('Purchase verification error:', error);
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

    if (!purchaseToken || !productId) {
      return res.status(400).json({ error: 'Missing purchaseToken or productId' });
    }

    const verification = await verifySubscriptionPurchase(
      PACKAGE_NAME,
      productId,
      purchaseToken
    );

    res.json({
      active: verification.valid,
      purchaseState: verification.purchaseState,
    });
  } catch (error: any) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check subscription status' });
  }
});

export default router;
