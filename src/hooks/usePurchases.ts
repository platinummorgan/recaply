import { useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { Platform, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../config/api';
import { PRODUCT_IDS } from '../config/billing';
import type { Purchase, PurchaseError } from 'react-native-iap';
import { trackPaywallEvent, type PaywallVariant } from '../services/paywallAnalytics';

const isExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
const IAP_UNAVAILABLE_MESSAGE = 'In-app purchases are unavailable in Expo Go. Use a development build or installed app.';

type IAPHookResult = {
  connected: boolean;
  subscriptions: { id: string; displayPrice?: string }[];
  requestPurchase: (params: any) => Promise<void>;
  finishTransaction: (params: any) => Promise<void>;
  fetchProducts: (params: any) => Promise<void>;
  getAvailablePurchases: () => Promise<unknown>;
};

type UseIAPHandler = (config: {
  onPurchaseSuccess: (purchase: Purchase) => Promise<void>;
  onPurchaseError: (error: PurchaseError) => void;
}) => IAPHookResult;

const useIAPFallback: UseIAPHandler = () => ({
  connected: true,
  subscriptions: [],
  requestPurchase: async () => {
    throw new Error(IAP_UNAVAILABLE_MESSAGE);
  },
  finishTransaction: async () => {},
  fetchProducts: async () => {},
  getAvailablePurchases: async () => [],
});

let useIAPHandler: UseIAPHandler = useIAPFallback;
let isNativeIapAvailable = false;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const iapModule = require('react-native-iap');
    if (typeof iapModule?.useIAP === 'function') {
      useIAPHandler = iapModule.useIAP as UseIAPHandler;
      isNativeIapAvailable = true;
    }
  } catch {
    useIAPHandler = useIAPFallback;
    isNativeIapAvailable = false;
  }
}

interface PurchaseTrackingContext {
  variant?: PaywallVariant | string;
  tier?: 'free' | 'lite' | 'pro';
  source?: string;
}

export function usePurchases() {
  const [purchasing, setPurchasing] = useState(false);
  const { token, refreshUser } = useAuth();
  const purchaseContextRef = useRef<PurchaseTrackingContext | null>(null);

  const normalizeTrackingContext = (
    context?: PurchaseTrackingContext,
    productId?: string,
  ): PurchaseTrackingContext => {
    const fromProductId = productId === PRODUCT_IDS.LITE
      ? 'lite'
      : productId === PRODUCT_IDS.PRO
        ? 'pro'
        : undefined;

    return {
      variant: context?.variant || 'unknown',
      tier: context?.tier || fromProductId,
      source: context?.source || 'subscription_screen',
    };
  };

  const emitPaywallEvent = async (
    eventName:
      | 'paywall_purchase_request_started'
      | 'paywall_purchase_request_failed'
      | 'paywall_purchase_user_cancelled'
      | 'paywall_purchase_error'
      | 'paywall_purchase_verified'
      | 'paywall_purchase_verification_failed'
      | 'paywall_restore_tapped'
      | 'paywall_restore_no_purchases'
      | 'paywall_restore_completed'
      | 'paywall_restore_failed',
    context?: PurchaseTrackingContext | null,
    extra?: {
      outcome?: string;
      productId?: string;
      errorCode?: string;
    },
  ) => {
    const normalized = normalizeTrackingContext(context || undefined, extra?.productId);
    await trackPaywallEvent(token, {
      eventName,
      variant: normalized.variant || 'unknown',
      tier: normalized.tier,
      source: normalized.source,
      outcome: extra?.outcome,
      productId: extra?.productId,
      errorCode: extra?.errorCode,
      platform: Platform.OS,
    });
  };

  const verifyPurchase = async (purchase: Purchase, context?: PurchaseTrackingContext | null) => {
    try {
      if (!token) throw new Error('Not authenticated');

      let purchaseToken: string;
      if (Platform.OS === 'android') {
        purchaseToken = (purchase as any).purchaseToken || purchase.transactionId || '';
      } else {
        purchaseToken = purchase.transactionId || '';
      }

      const response = await fetch(apiUrl('/purchases/verify'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId: purchase.productId,
          purchaseToken,
          transactionReceipt: (purchase as any).transactionReceipt,
          platform: Platform.OS,
          clientContext: context
            ? {
              variant: context.variant || 'unknown',
              tier: context.tier,
              source: context.source || 'subscription_screen',
            }
            : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to verify purchase');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error verifying purchase:', error);
      throw error;
    }
  };

  const {
    connected,
    subscriptions,
    requestPurchase,
    finishTransaction,
    fetchProducts,
    getAvailablePurchases,
  } = useIAPHandler({
    onPurchaseSuccess: async (purchase: Purchase) => {
      console.log('Purchase successful:', purchase);
      const context = purchaseContextRef.current;

      try {
        await verifyPurchase(purchase, context);
        await emitPaywallEvent('paywall_purchase_verified', context, {
          outcome: 'success',
          productId: purchase.productId,
        });
        await refreshUser();

        await finishTransaction({ purchase, isConsumable: false });

        Alert.alert(
          'Success!',
          'Your subscription has been activated.',
          [{ text: 'OK' }]
        );
      } catch (error: any) {
        console.error('Error verifying purchase:', error);
        await emitPaywallEvent('paywall_purchase_verification_failed', context, {
          outcome: 'failed',
          productId: purchase.productId,
          errorCode: String(error?.code || error?.name || 'verification_failed'),
        });
        Alert.alert(
          'Error',
          'Failed to activate subscription. Please contact support.',
          [{ text: 'OK' }]
        );
      } finally {
        purchaseContextRef.current = null;
        setPurchasing(false);
      }
    },
    onPurchaseError: (error: PurchaseError) => {
      console.error('Purchase error:', error);
      const errorCode = error.code as string;
      const context = purchaseContextRef.current;
      const isUserCanceled = errorCode === 'E_USER_CANCELLED';

      void emitPaywallEvent(
        isUserCanceled ? 'paywall_purchase_user_cancelled' : 'paywall_purchase_error',
        context,
        {
          outcome: isUserCanceled ? 'cancelled' : 'failed',
          errorCode,
        },
      );

      if (!isUserCanceled) {
        Alert.alert('Purchase Error', error.message);
      }

      purchaseContextRef.current = null;
      setPurchasing(false);
    },
  });

  // Fetch products when connected
  useEffect(() => {
    if (connected) {
      console.log('IAP connected, fetching products:', Object.values(PRODUCT_IDS));
      fetchProducts({
        skus: Object.values(PRODUCT_IDS),
        type: 'subs',
      });
    }
  }, [connected]);

  // Log subscriptions when they change
  useEffect(() => {
    console.log('Available subscriptions:', subscriptions.length, subscriptions.map(s => s.id));
  }, [subscriptions]);

  const subscribe = async (productId: string, context?: PurchaseTrackingContext) => {
    const trackingContext = normalizeTrackingContext(context, productId);

    if (!isNativeIapAvailable) {
      Alert.alert('Unavailable in Expo Go', IAP_UNAVAILABLE_MESSAGE);
      return;
    }

    if (purchasing || !connected) {
      if (!connected) {
        void emitPaywallEvent('paywall_purchase_request_failed', trackingContext, {
          outcome: 'store_not_connected',
          productId,
          errorCode: 'STORE_NOT_CONNECTED',
        });
        Alert.alert('Error', 'Store connection not ready. Please try again.');
      }
      return;
    }

    try {
      purchaseContextRef.current = trackingContext;
      setPurchasing(true);
      console.log('Requesting subscription:', productId);
      void emitPaywallEvent('paywall_purchase_request_started', trackingContext, {
        outcome: 'started',
        productId,
      });

      await requestPurchase({
        type: 'subs',
        request: Platform.OS === 'android' ? {
          android: { skus: [productId] },
        } : {
          ios: { sku: productId },
        },
      });
    } catch (error: any) {
      console.error('Error requesting subscription:', error);
      const errorCode = error.code as string;
      void emitPaywallEvent('paywall_purchase_request_failed', trackingContext, {
        outcome: errorCode === 'E_USER_CANCELLED' ? 'cancelled' : 'failed',
        productId,
        errorCode,
      });
      if (errorCode !== 'E_USER_CANCELLED') {
        Alert.alert('Error', 'Failed to start purchase. Please try again.');
      }
      purchaseContextRef.current = null;
      setPurchasing(false);
    }
  };

  const getProduct = (productId: string) => {
    return subscriptions.find((p) => p.id === productId);
  };

  const restorePurchases = async (context?: PurchaseTrackingContext) => {
    const trackingContext = normalizeTrackingContext(context);

    if (!isNativeIapAvailable) {
      Alert.alert('Unavailable in Expo Go', IAP_UNAVAILABLE_MESSAGE);
      return;
    }

    try {
      setPurchasing(true);
      console.log('Restoring purchases...');
      void emitPaywallEvent('paywall_restore_tapped', trackingContext, {
        outcome: 'started',
      });
      
      const availablePurchases = await getAvailablePurchases();
      const purchases = Array.isArray(availablePurchases)
        ? (availablePurchases as Purchase[])
        : [];
      console.log('Available purchases:', purchases.length);

      if (purchases.length === 0) {
        void emitPaywallEvent('paywall_restore_no_purchases', trackingContext, {
          outcome: 'none',
        });
        Alert.alert(
          'No Purchases Found',
          'No previous purchases were found to restore.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Verify each purchase with backend
      for (const purchase of purchases) {
        try {
          await verifyPurchase(purchase, trackingContext);
          await finishTransaction({ purchase, isConsumable: false });
        } catch (error) {
          console.error('Error verifying restored purchase:', error);
        }
      }

      await refreshUser();
      void emitPaywallEvent('paywall_restore_completed', trackingContext, {
        outcome: 'success',
      });

      Alert.alert(
        'Success!',
        'Your purchases have been restored.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Error restoring purchases:', error);
      void emitPaywallEvent('paywall_restore_failed', trackingContext, {
        outcome: 'failed',
        errorCode: String(error?.code || error?.name || 'restore_failed'),
      });
      Alert.alert(
        'Error',
        'Failed to restore purchases. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setPurchasing(false);
    }
  };

  return {
    products: subscriptions,
    loading: isNativeIapAvailable ? !connected : false,
    purchasing,
    subscribe,
    restorePurchases,
    getProduct,
    PRODUCT_IDS,
  };
}
