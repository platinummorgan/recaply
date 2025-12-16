import { Router, Request, Response } from 'express';
import { updateUserSubscription } from '../services/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';

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

    let result = await response.json();

    // If production returns sandbox receipt error (21007), try sandbox
    if (result.status === 21007) {
      console.log('[Purchases] Sandbox receipt detected, trying sandbox environment');
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
      console.error('[Purchases] Apple receipt verification failed:', result.status);
      return false;
    }

    // Verify the product ID matches
    const latestReceipt = result.latest_receipt_info?.[0] || result.receipt?.in_app?.[0];
    if (!latestReceipt) {
      console.error('[Purchases] No receipt info found');
      return false;
    }

    if (latestReceipt.product_id !== expectedProductId) {
      console.error('[Purchases] Product ID mismatch:', latestReceipt.product_id, 'vs', expectedProductId);
      return false;
    }

    console.log('[Purchases] Apple receipt verified successfully');
    return true;
  } catch (error) {
    console.error('[Purchases] Error verifying Apple receipt:', error);
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
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!productId || !purchaseToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`[Purchases] Verifying ${platform} purchase for user ${userId}`, {
      productId,
      purchaseToken: purchaseToken.substring(0, 20) + '...',
    });

    // Verify receipt with Apple/Google
    if (platform === 'ios' && transactionReceipt) {
      const isValid = await verifyAppleReceipt(transactionReceipt, productId);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid receipt' });
      }
    }
    // Note: Android verification would go here for production
    // For now we accept Android purchases (sandbox testing)

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
