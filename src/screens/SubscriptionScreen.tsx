import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

// IAP will only work in standalone builds, not Expo Go
let IAP: any = null;
try {
  IAP = require('react-native-iap');
} catch (e) {
  console.log('IAP not available in Expo Go - purchase functionality disabled');
}

interface SubscriptionScreenProps {
  navigation: any;
}

const SUBSCRIPTION_SKUS = {
  lite: 'recaply_lite_monthly',
  pro: 'recaply_pro_monthly',
};

interface PlanFeature {
  name: string;
  free: boolean | string;
  lite: boolean | string;
  pro: boolean | string;
}

const FEATURES: PlanFeature[] = [
  { name: 'Minutes per month', free: '30', lite: '300', pro: 'Unlimited' },
  { name: 'AI Transcription', free: true, lite: true, pro: true },
  { name: 'AI Summaries', free: true, lite: true, pro: true },
  { name: 'Offline Recording', free: true, lite: true, pro: true },
  { name: 'Export to Files', free: true, lite: true, pro: true },
  { name: 'Priority Support', free: false, lite: false, pro: true },
];

const SubscriptionScreen = ({ navigation }: SubscriptionScreenProps) => {
  const { user, token, refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    if (IAP) {
      initIAP();
      return () => {
        IAP.endConnection();
      };
    }
  }, []);

  const initIAP = async () => {
    if (!IAP) return;
    try {
      await IAP.initConnection();
      const availableProducts = await IAP.getSubscriptions(
        Object.values(SUBSCRIPTION_SKUS)
      );
      setProducts(availableProducts);
    } catch (error) {
      console.error('IAP init error:', error);
    }
  };

  const handlePurchase = async (sku: string, planName: string) => {
    if (!IAP) {
      Alert.alert(
        'Not Available in Expo Go',
        'In-app purchases only work in standalone builds. For testing, you can manually upgrade accounts via the backend API.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!user || !token) {
      Alert.alert('Error', 'Please log in to purchase');
      return;
    }

    setIsLoading(true);
    try {
      // Request purchase
      await IAP.requestSubscription({ sku, andDangerouslyFinishTransactionAutomaticallyIOS: false });

      // Listen for purchase update
      const purchaseUpdateSubscription = IAP.purchaseUpdatedListener(
        async (purchase: any) => {
          const { purchaseToken, productId, transactionReceipt } = purchase;

          if (purchaseToken) {
            // Verify purchase with backend
            const response = await fetch('https://web-production-abd11.up.railway.app/api/subscription/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                purchaseToken,
                productId,
              }),
            });

            if (response.ok) {
              const data = await response.json();
              Alert.alert(
                'Success!',
                `Welcome to Recaply ${planName}! You now have ${data.minutes === 999999 ? 'unlimited' : data.minutes} minutes.`,
                [
                  {
                    text: 'OK',
                    onPress: async () => {
                      await refreshUser();
                      navigation.goBack();
                    },
                  },
                ]
              );

              // Acknowledge purchase (Android)
              if (purchase.purchaseStateAndroid === 1 && purchaseToken) {
                await IAP.acknowledgePurchaseAndroid(purchaseToken);
              }
              
              // Finish transaction (iOS)
              await IAP.finishTransaction({ purchase });
            } else {
              Alert.alert('Error', 'Failed to verify purchase. Please contact support.');
            }
          }

          purchaseUpdateSubscription.remove();
        }
      );

      const purchaseErrorSubscription = IAP.purchaseErrorListener((error: any) => {
        console.warn('Purchase error:', error);
        if (error.code !== 'E_USER_CANCELLED') {
          Alert.alert('Purchase Failed', error.message);
        }
        purchaseErrorSubscription.remove();
      });
    } catch (error: any) {
      console.error('Purchase error:', error);
      if (error.code !== 'E_USER_CANCELLED') {
        Alert.alert('Purchase Failed', error.message || 'Unable to complete purchase');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderCheckmark = (value: boolean | string) => {
    if (value === true) return '✓';
    if (value === false) return '—';
    return value;
  };

  const currentTier = user?.subscriptionTier || 'free';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose Your Plan</Text>
        <Text style={styles.subtitle}>
          You're currently on the <Text style={styles.bold}>{currentTier.toUpperCase()}</Text> plan
        </Text>
      </View>

      {/* Feature Comparison Table */}
      <View style={styles.tableContainer}>
        <View style={styles.tableHeader}>
          <View style={[styles.col, styles.featureCol]}>
            <Text style={styles.tableHeaderText}>Features</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.tableHeaderText}>Free</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.tableHeaderText}>Lite</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.tableHeaderText}>Pro</Text>
          </View>
        </View>

        {FEATURES.map((feature, index) => (
          <View key={index} style={styles.tableRow}>
            <View style={[styles.col, styles.featureCol]}>
              <Text style={styles.featureText}>{feature.name}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.valueText}>{renderCheckmark(feature.free)}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.valueText}>{renderCheckmark(feature.lite)}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.valueText}>{renderCheckmark(feature.pro)}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Plan Cards */}
      <View style={styles.plans}>
        {/* Free Plan */}
        <View style={[styles.planCard, currentTier === 'free' && styles.currentPlan]}>
          <Text style={styles.planName}>Free</Text>
          <Text style={styles.planPrice}>$0/mo</Text>
          <Text style={styles.planDescription}>30 minutes per month</Text>
          {currentTier === 'free' && (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>Current Plan</Text>
            </View>
          )}
        </View>

        {/* Lite Plan */}
        <View style={[styles.planCard, currentTier === 'lite' && styles.currentPlan]}>
          <Text style={styles.planName}>Lite</Text>
          <Text style={styles.planPrice}>$9/mo</Text>
          <Text style={styles.planDescription}>300 minutes per month</Text>
          {currentTier === 'lite' ? (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>Current Plan</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.upgradeButton, isLoading && styles.buttonDisabled]}
              onPress={() => handlePurchase(SUBSCRIPTION_SKUS.lite, 'Lite')}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.upgradeButtonText}>Upgrade</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Pro Plan */}
        <View style={[styles.planCard, styles.proPlan, currentTier === 'pro' && styles.currentPlan]}>
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>POPULAR</Text>
          </View>
          <Text style={styles.planName}>Pro</Text>
          <Text style={styles.planPrice}>$19/mo</Text>
          <Text style={styles.planDescription}>Unlimited minutes</Text>
          {currentTier === 'pro' ? (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>Current Plan</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.upgradeButton, styles.proButton, isLoading && styles.buttonDisabled]}
              onPress={() => handlePurchase(SUBSCRIPTION_SKUS.pro, 'Pro')}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.upgradeButtonText}>Upgrade</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          • Subscriptions auto-renew unless canceled 24 hours before renewal{'\n'}
          • Manage subscriptions in Google Play Store{'\n'}
          • Cancel anytime
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  bold: {
    fontWeight: '600',
    color: '#007AFF',
  },
  tableContainer: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingVertical: 12,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCol: {
    flex: 2,
    alignItems: 'flex-start',
    paddingLeft: 12,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
  },
  featureText: {
    fontSize: 14,
    color: '#333',
  },
  valueText: {
    fontSize: 14,
    color: '#666',
  },
  plans: {
    paddingHorizontal: 16,
    gap: 16,
  },
  planCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    position: 'relative',
  },
  proPlan: {
    borderColor: '#007AFF',
  },
  currentPlan: {
    backgroundColor: '#f0f9ff',
    borderColor: '#34C759',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  planName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  planPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 8,
  },
  planDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  upgradeButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  proButton: {
    backgroundColor: '#007AFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  currentBadge: {
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  currentBadgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    lineHeight: 18,
  },
});

export default SubscriptionScreen;
