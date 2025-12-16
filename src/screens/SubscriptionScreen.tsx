import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { usePurchases } from '../hooks/usePurchases';

interface SubscriptionScreenProps {
  navigation: any;
}

interface PlanFeature {
  name: string;
  free: boolean | string;
  lite: boolean | string;
  pro: boolean | string;
}

const FEATURES: PlanFeature[] = [
  { name: 'Minutes per month', free: '30', lite: '120', pro: 'Unlimited' },
  { name: 'AI Transcription', free: true, lite: true, pro: true },
  { name: 'AI Summaries', free: true, lite: true, pro: true },
  { name: 'Offline Recording', free: true, lite: true, pro: true },
  { name: 'Export to Files', free: true, lite: true, pro: true },
  { name: 'Priority Support', free: false, lite: false, pro: true },
];

const SubscriptionScreen = ({ navigation }: SubscriptionScreenProps) => {
  const { user, refreshUser } = useAuth();
  const { products, loading, purchasing, subscribe, getProduct, PRODUCT_IDS } = usePurchases();

  const currentTier = user?.subscriptionTier || 'free';

  // Get product pricing
  const liteProduct = getProduct(PRODUCT_IDS.LITE);
  const proProduct = getProduct(PRODUCT_IDS.PRO);

  const handlePurchase = async (productId: string, planName: string) => {
    if (!user) {
      Alert.alert('Error', 'Please log in to purchase');
      return;
    }

    await subscribe(productId);
    
    // Note: The purchase success/error is handled in the usePurchases hook
    // After successful purchase, user should refresh to see updated subscription
  };

  const renderCheckmark = (value: boolean | string) => {
    if (value === true) return '✓';
    if (value === false) return '—';
    return value;
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose Your Plan</Text>
        <Text style={styles.subtitle}>
          You're currently on the <Text style={styles.bold}>{currentTier.toUpperCase()}</Text> plan
        </Text>
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading subscription options...</Text>
        </View>
      )}

      {!loading && (
        <>
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
              <Text style={styles.planPrice}>
                {liteProduct?.displayPrice || '$4.99'}/mo
              </Text>
              <Text style={styles.planDescription}>120 minutes per month</Text>
              {currentTier === 'lite' ? (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>Current Plan</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.upgradeButton, purchasing && styles.buttonDisabled]}
                  onPress={() => handlePurchase(PRODUCT_IDS.LITE, 'Lite')}
                  disabled={purchasing}
                >
                  {purchasing ? (
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
              <Text style={styles.planPrice}>
                {proProduct?.displayPrice || '$14.99'}/mo
              </Text>
              <Text style={styles.planDescription}>Unlimited minutes</Text>
              {currentTier === 'pro' ? (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>Current Plan</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.upgradeButton, styles.proButton, purchasing && styles.buttonDisabled]}
                  onPress={() => handlePurchase(PRODUCT_IDS.PRO, 'Pro')}
                  disabled={purchasing}
                >
                  {purchasing ? (
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
              • Manage subscriptions in your account settings{'\n'}
              • Cancel anytime{'\n'}
              • Payment charged to your account at confirmation
            </Text>
            
            <View style={styles.legalLinks}>
              <TouchableOpacity onPress={() => Linking.openURL('https://raw.githubusercontent.com/platinummorgan/recaply/main/docs/terms.html')}>
                <Text style={styles.linkText}>Terms of Use (EULA)</Text>
              </TouchableOpacity>
              <Text style={styles.linkSeparator}> • </Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://raw.githubusercontent.com/platinummorgan/recaply/main/docs/privacy.html')}>
                <Text style={styles.linkText}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666',
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
    marginBottom: 16,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  linkText: {
    fontSize: 12,
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  linkSeparator: {
    fontSize: 12,
    color: '#999',
  },
});

export default SubscriptionScreen;
