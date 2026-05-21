import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { logger, serializeError } from './logger';

/**
 * Google Play billing service
 * Verifies purchase tokens from the mobile app
 */

const androidpublisher = google.androidpublisher('v3');

interface PurchaseVerification {
  valid: boolean;
  purchaseState?: number;
  productId?: string;
  orderId?: string;
  purchaseTime?: number;
}

/**
 * Initialize Google Play API client
 */
async function getAuthClient() {
  try {
    const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
    
    if (!serviceAccountPath) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_PATH not configured');
    }

    const keyFile = path.resolve(serviceAccountPath);
    
    if (!fs.existsSync(keyFile)) {
      throw new Error(`Service account file not found: ${keyFile}`);
    }

    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    return await auth.getClient();
  } catch (error) {
    logger.error('googleplay_auth_init_failed', {
      serviceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || null,
      ...serializeError(error),
    });
    throw error;
  }
}

/**
 * Verify a subscription purchase token
 */
export async function verifySubscriptionPurchase(
  packageName: string,
  subscriptionId: string,
  purchaseToken: string
): Promise<PurchaseVerification> {
  try {
    const authClient = await getAuthClient();

    const response = await androidpublisher.purchases.subscriptions.get({
      auth: authClient as any,
      packageName,
      subscriptionId,
      token: purchaseToken,
    });

    const purchase = response.data;

    // paymentState: 0 = pending, 1 = received, 2 = free trial, 3 = deferred
    // Treat paid and free-trial subscriptions as active when not expired.
    const expiryTime = purchase.expiryTimeMillis ? parseInt(purchase.expiryTimeMillis) : 0;
    const now = Date.now();
    const paymentState = purchase.paymentState;
    const isPaidOrTrial = paymentState === 1 || paymentState === 2;
    const isValid = expiryTime > now && isPaidOrTrial;

    return {
      valid: isValid,
      purchaseState: paymentState || undefined,
      orderId: purchase.orderId || undefined,
      purchaseTime: purchase.startTimeMillis ? parseInt(purchase.startTimeMillis) : undefined,
    };
  } catch (error: any) {
    logger.error('googleplay_subscription_verify_failed', {
      packageName,
      subscriptionId,
      ...serializeError(error),
    });
    return { valid: false };
  }
}

/**
 * Verify a one-time product purchase token
 */
export async function verifyProductPurchase(
  packageName: string,
  productId: string,
  purchaseToken: string
): Promise<PurchaseVerification> {
  try {
    const authClient = await getAuthClient();

    const response = await androidpublisher.purchases.products.get({
      auth: authClient as any,
      packageName,
      productId,
      token: purchaseToken,
    });

    const purchase = response.data;

    // consumptionState: 0 = yet to be consumed, 1 = consumed
    // purchaseState: 0 = purchased, 1 = canceled, 2 = pending
    const isValid = purchase.purchaseState === 0 && purchase.consumptionState === 0;

    return {
      valid: isValid,
      purchaseState: purchase.purchaseState || undefined,
      productId,
      orderId: purchase.orderId || undefined,
      purchaseTime: purchase.purchaseTimeMillis ? parseInt(purchase.purchaseTimeMillis) : undefined,
    };
  } catch (error: any) {
    logger.error('googleplay_product_verify_failed', {
      packageName,
      productId,
      ...serializeError(error),
    });
    return { valid: false };
  }
}

/**
 * Get subscription status
 */
export async function getSubscriptionStatus(
  packageName: string,
  subscriptionId: string,
  purchaseToken: string
): Promise<{ active: boolean; expiryTime?: number }> {
  try {
    const authClient = await getAuthClient();

    const response = await androidpublisher.purchases.subscriptions.get({
      auth: authClient as any,
      packageName,
      subscriptionId,
      token: purchaseToken,
    });

    const purchase = response.data;
    const expiryTime = purchase.expiryTimeMillis ? parseInt(purchase.expiryTimeMillis) : 0;
    const now = Date.now();

    return {
      active: expiryTime > now && purchase.paymentState === 1,
      expiryTime,
    };
  } catch (error: any) {
    logger.error('googleplay_subscription_status_failed', {
      packageName,
      subscriptionId,
      ...serializeError(error),
    });
    return { active: false };
  }
}

