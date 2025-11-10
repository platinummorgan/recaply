import { useState, useEffect } from 'react';
import { useIAP } from 'react-native-iap';
import { Platform, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import type { Purchase, PurchaseError, ErrorCode } from 'react-native-iap';

const API_URL = 'https://web-production-abd11.up.railway.app';

const PRODUCT_IDS = {
  LITE: 'recaply_lite_monthly',
  PRO: 'recaply_pro_monthly',
};

export function usePurchases() {
  const [purchasing, setPurchasing] = useState(false);
  const { token } = useAuth();

  const {
    connected,
    subscriptions,
    requestPurchase,
    finishTransaction,
    fetchProducts,
  } = useIAP({
    onPurchaseSuccess: async (purchase: Purchase) => {
      console.log('Purchase successful:', purchase);
      
      try {
        // Verify purchase with backend
        await verifyPurchase(purchase);
        
        // Finish the transaction
        await finishTransaction({ purchase, isConsumable: false });
        
        Alert.alert(
          'Success!',
          'Your subscription has been activated.',
          [{ text: 'OK' }]
        );
      } catch (error) {
        console.error('Error verifying purchase:', error);
        Alert.alert(
          'Error',
          'Failed to activate subscription. Please contact support.',
          [{ text: 'OK' }]
        );
      } finally {
        setPurchasing(false);
      }
    },
    onPurchaseError: (error: PurchaseError) => {
      console.error('Purchase error:', error);
      const errorCode = error.code as string;
      if (errorCode !== 'E_USER_CANCELLED') {
        Alert.alert('Purchase Error', error.message);
      }
      setPurchasing(false);
    },
  });

  // Fetch products when connected
  useEffect(() => {
    if (connected) {
      fetchProducts({
        skus: Object.values(PRODUCT_IDS),
        type: 'subs',
      });
    }
  }, [connected]);

  const verifyPurchase = async (purchase: Purchase) => {
    try {
      if (!token) throw new Error('Not authenticated');

      // Get the purchase token - platform specific
      let purchaseToken: string;
      if (Platform.OS === 'android') {
        purchaseToken = (purchase as any).purchaseToken || purchase.transactionId || '';
      } else {
        purchaseToken = purchase.transactionId || '';
      }

      const response = await fetch(`${API_URL}/api/purchases/verify`, {
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
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to verify purchase');
      }

      const result = await response.json();
      console.log('Purchase verified:', result);
      return result;
    } catch (error) {
      console.error('Error verifying purchase:', error);
      throw error;
    }
  };

  const subscribe = async (productId: string) => {
    if (purchasing || !connected) {
      if (!connected) {
        Alert.alert('Error', 'Store connection not ready. Please try again.');
      }
      return;
    }

    try {
      setPurchasing(true);
      console.log('Requesting subscription:', productId);
      
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
      if (errorCode !== 'E_USER_CANCELLED') {
        Alert.alert('Error', 'Failed to start purchase. Please try again.');
      }
      setPurchasing(false);
    }
  };

  const getProduct = (productId: string) => {
    return subscriptions.find((p) => p.id === productId);
  };

  return {
    products: subscriptions,
    loading: !connected,
    purchasing,
    subscribe,
    getProduct,
    PRODUCT_IDS,
  };
}
