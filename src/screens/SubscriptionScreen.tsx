import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
  Animated,
  Easing,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { usePurchases } from '../hooks/usePurchases';
import { PLAN_LIMITS, PLAN_PRICE_FALLBACK } from '../config/billing';
import {
  PAYWALL_COPY_BY_VARIANT,
  type PaywallTier,
  resolvePaywallVariant,
} from '../config/paywallMessaging';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { AppCard } from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';
import { trackPaywallEvent } from '../services/paywallAnalytics';

interface SubscriptionScreenProps {
  navigation: any;
}

type Tier = PaywallTier;

interface PlanConfig {
  tier: Tier;
  title: string;
  label: string;
  valueLine: string;
  featurePunchline: string;
  ctaLabel: string;
  highlighted?: boolean;
}

const PLAN_CONFIG: PlanConfig[] = [
  {
    tier: 'free',
    title: 'Starter',
    label: 'For first-time users',
    valueLine: `${PLAN_LIMITS.FREE_MINUTES} min per month`,
    featurePunchline: 'Unlimited recordings with monthly AI minutes.',
    ctaLabel: 'Current Plan',
  },
  {
    tier: 'lite',
    title: 'Lite',
    label: 'Best for weekly usage',
    valueLine: `${PLAN_LIMITS.LITE_MINUTES} min per month`,
    featurePunchline: 'Plenty of minutes for recurring meetings.',
    ctaLabel: 'Choose Lite',
  },
  {
    tier: 'pro',
    title: 'Pro',
    label: 'Most popular',
    valueLine: 'Unlimited minutes',
    featurePunchline: 'Built for heavy daily workflows and teams.',
    ctaLabel: 'Go Pro',
    highlighted: true,
  },
];

const SubscriptionScreen = ({ navigation }: SubscriptionScreenProps) => {
  const { user, token } = useAuth();
  const { loading, purchasing, subscribe, restorePurchases, getProduct, PRODUCT_IDS } = usePurchases();

  const currentTier = (user?.subscriptionTier || 'free') as Tier;
  const minutesUsed = user?.minutesUsed || 0;
  const minutesLimit = user?.minutesLimit || PLAN_LIMITS.FREE_MINUTES;
  const isPro = currentTier === 'pro';
  const usagePercent = isPro ? 0 : Math.min(100, Math.round((minutesUsed / Math.max(minutesLimit, 1)) * 100));

  const liteProduct = getProduct(PRODUCT_IDS.LITE);
  const proProduct = getProduct(PRODUCT_IDS.PRO);

  const litePrice = liteProduct?.displayPrice || PLAN_PRICE_FALLBACK.LITE;
  const proPrice = proProduct?.displayPrice || PLAN_PRICE_FALLBACK.PRO;
  const paywallResolution = useMemo(
    () => resolvePaywallVariant(`${user?.id || ''}:${user?.email || ''}`),
    [user?.id, user?.email],
  );
  const paywallVariant = paywallResolution.variant;
  const paywallCopy = PAYWALL_COPY_BY_VARIANT[paywallVariant];
  const planConfig = useMemo(
    () => PLAN_CONFIG.map((plan) => ({
      ...plan,
      ...(paywallCopy.planCopy[plan.tier] || {}),
    })),
    [paywallCopy],
  );
  const paywallSource = useMemo(() => {
    if (paywallResolution.reason === 'forced') {
      return 'subscription_screen_forced';
    }
    if (paywallResolution.mode === 'experiment') {
      return 'subscription_screen_experiment';
    }
    return 'subscription_screen_winner';
  }, [paywallResolution.mode, paywallResolution.reason]);
  const heroMotion = useRef(new Animated.Value(0)).current;
  const bodyMotion = useRef(new Animated.Value(0)).current;
  const conversionSignal = isPro
    ? 'Unlimited minutes active'
    : `${Math.max(minutesLimit - minutesUsed, 0).toFixed(0)} min left this cycle`;
  const recommendationTier: Tier = isPro
    ? 'pro'
    : minutesUsed >= PLAN_LIMITS.LITE_MINUTES * 0.75
      ? 'pro'
      : 'lite';
  const recommendationLabel = recommendationTier === 'pro' ? 'Pro recommended' : 'Lite recommended';
  const recommendationReason = recommendationTier === 'pro'
    ? 'Your usage pattern points to Pro for uninterrupted daily capture.'
    : 'Lite should comfortably cover your current monthly cadence.';
  const conversionSignals = useMemo(
    () => [
      currentTier === 'pro'
        ? 'Unlimited workflow active'
        : `${Math.max(minutesLimit - minutesUsed, 0).toFixed(0)} minutes still available`,
      'Restore-ready purchases and cancel-anytime billing',
      paywallVariant === 'roi' ? 'ROI-first strategy copy active' : 'Value-first strategy copy active',
    ],
    [currentTier, minutesLimit, minutesUsed, paywallVariant],
  );
  const heroMotionStyle = useMemo(
    () => ({
      opacity: heroMotion,
      transform: [
        {
          translateY: heroMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [16, 0],
          }),
        },
      ],
    }),
    [heroMotion],
  );
  const bodyMotionStyle = useMemo(
    () => ({
      opacity: bodyMotion,
      transform: [
        {
          translateY: bodyMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [20, 0],
          }),
        },
      ],
    }),
    [bodyMotion],
  );

  useEffect(() => {
    void trackPaywallEvent(token, {
      eventName: 'paywall_viewed',
      variant: paywallVariant,
      tier: currentTier,
      source: paywallSource,
      outcome: 'impression',
    });
  }, [token, paywallVariant, currentTier, paywallSource]);

  useEffect(() => {
    heroMotion.setValue(0);
    bodyMotion.setValue(0);
    const animation = Animated.parallel([
      Animated.timing(heroMotion, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(bodyMotion, {
        toValue: 1,
        duration: 440,
        delay: 90,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [paywallVariant, currentTier, heroMotion, bodyMotion]);

  const handlePurchase = async (tier: Tier) => {
    if (!user) {
      Alert.alert('Error', 'Please log in to purchase');
      return;
    }

    if (tier === 'free') {
      return;
    }

    const productId = tier === 'lite' ? PRODUCT_IDS.LITE : PRODUCT_IDS.PRO;
    await trackPaywallEvent(token, {
      eventName: 'paywall_plan_cta_tapped',
      variant: paywallVariant,
      tier,
      source: paywallSource,
      outcome: 'intent',
      productId,
    });
    await subscribe(productId, {
      variant: paywallVariant,
      tier,
      source: paywallSource,
    });
  };

  const handleRestore = async () => {
    await restorePurchases({
      variant: paywallVariant,
      tier: currentTier,
      source: paywallSource,
    });
  };

  const getPlanPrice = (tier: Tier) => {
    if (tier === 'free') {
      return '$0';
    }
    if (tier === 'lite') {
      return litePrice;
    }
    return proPrice;
  };

  const renderPlanCard = (plan: PlanConfig) => {
    const isCurrent = currentTier === plan.tier;
    const isFree = plan.tier === 'free';
    const isHighlighted = Boolean(plan.highlighted);

    return (
      <AppCard
        key={plan.tier}
        style={[
          styles.planCard,
          isHighlighted && styles.planCardHighlighted,
          isCurrent && styles.planCardCurrent,
        ]}
      >
        {isHighlighted && <Text style={styles.planBadge}>MOST POPULAR</Text>}
        <Text style={styles.planTitle}>{plan.title}</Text>
        <Text style={styles.planLabel}>{plan.label}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.planPrice}>{getPlanPrice(plan.tier)}</Text>
          <Text style={styles.priceCadence}>/month</Text>
        </View>
        <Text style={styles.planValueLine}>{plan.valueLine}</Text>
        <Text style={styles.planPunchline}>{plan.featurePunchline}</Text>

        {isCurrent ? (
          <View style={styles.currentPlanBadge}>
            <Text style={styles.currentPlanText}>Current Plan</Text>
          </View>
        ) : (
          <AppButton
            label={isFree ? 'Included' : plan.ctaLabel}
            variant={isHighlighted ? 'dark' : 'primary'}
            style={styles.planCta}
            onPress={() => void handlePurchase(plan.tier)}
            disabled={isFree || purchasing}
            loading={!isFree && purchasing}
          />
        )}
      </AppCard>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View pointerEvents="none" style={styles.bgOrbTop} />
      <View pointerEvents="none" style={styles.bgOrbBottom} />

      <Animated.View style={heroMotionStyle}>
        <AppCard variant="dark" style={styles.heroCard}>
          <View style={styles.heroGlowPrimary} />
          <View style={styles.heroGlowSecondary} />
          <Text style={styles.heroKicker}>{paywallCopy.heroKicker}</Text>
          <Text style={styles.heroTitle}>{paywallCopy.heroTitle}</Text>
          <Text style={styles.heroSubtitle}>
            {paywallCopy.heroSubtitle}
          </Text>

          <View style={styles.heroSignalRow}>
            <View style={styles.heroSignalChip}>
              <Text style={styles.heroSignalText}>Cancel anytime</Text>
            </View>
            <View style={styles.heroSignalChip}>
              <Text style={styles.heroSignalText}>{conversionSignal}</Text>
            </View>
          </View>

          <View style={styles.trustRow}>
            {paywallCopy.trustPoints.map((point) => (
              <View key={point} style={styles.trustChip}>
                <Text style={styles.trustChipText}>{point}</Text>
              </View>
            ))}
          </View>
        </AppCard>
      </Animated.View>

      <Animated.View style={bodyMotionStyle}>
        <AppCard style={styles.usageCard}>
          <View style={styles.usageTopRow}>
            <Text style={styles.usageTitle}>This month usage</Text>
            <Text style={styles.usageValue}>
              {isPro ? 'Unlimited' : `${minutesUsed.toFixed(0)} / ${minutesLimit.toFixed(0)} min`}
            </Text>
          </View>
          {!isPro && (
            <>
              <View style={styles.usageTrack}>
                <View style={[styles.usageFill, { width: `${usagePercent}%` }]} />
              </View>
              <Text style={styles.usageHint}>
                {Math.max(minutesLimit - minutesUsed, 0).toFixed(0)} minutes remaining this cycle
              </Text>
            </>
          )}
        </AppCard>

        <AppCard style={styles.planStrategyCard}>
          <View style={styles.planStrategyHeader}>
            <Text style={styles.planStrategyKicker}>Plan Fit Engine</Text>
            <View
              style={[
                styles.planStrategyBadge,
                recommendationTier === 'pro' && styles.planStrategyBadgePro,
              ]}
            >
              <Text style={styles.planStrategyBadgeText}>{recommendationLabel}</Text>
            </View>
          </View>
          <Text style={styles.planStrategyTitle}>{recommendationReason}</Text>
          <Text style={styles.planStrategyText}>
            Choose the tier that supports your real meeting load, then scale without losing recap quality.
          </Text>
          <View style={styles.planStrategySignalRow}>
            {conversionSignals.map((signal) => (
              <View key={signal} style={styles.planStrategySignalChip}>
                <Text style={styles.planStrategySignalText}>{signal}</Text>
              </View>
            ))}
          </View>
        </AppCard>

        <AppCard style={styles.valueCard}>
          <Text style={styles.valueTitle}>{paywallCopy.valueTitle}</Text>
          <View style={styles.valueList}>
            {paywallCopy.valueBullets.map((bullet) => (
              <View key={bullet} style={styles.valueItem}>
                <View style={styles.valueDot} />
                <Text style={styles.valueText}>{bullet}</Text>
              </View>
            ))}
          </View>
        </AppCard>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Loading subscription options...</Text>
          </View>
        ) : (
          <View style={styles.planStack}>{planConfig.map(renderPlanCard)}</View>
        )}

        <AppButton
          label={purchasing ? 'Restoring...' : 'Restore Purchases'}
          variant="info"
          style={styles.restoreButton}
          onPress={() => void handleRestore()}
          disabled={purchasing}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Subscriptions renew automatically unless canceled at least 24 hours before renewal.
          </Text>
          <Text style={styles.footerText}>
            Manage or cancel from your app-store account settings at any time.
          </Text>
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => Linking.openURL('https://htmlpreview.github.io/?https://github.com/platinummorgan/recaply/blob/main/docs/terms.html')}>
              <Text style={styles.linkText}>Terms of Use</Text>
            </TouchableOpacity>
            <Text style={styles.linkSeparator}>|</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://htmlpreview.github.io/?https://github.com/platinummorgan/recaply/blob/main/docs/privacy.html')}>
              <Text style={styles.linkText}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
          </View>
      </Animated.View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    paddingTop: 6,
    paddingBottom: spacing.xl + spacing.md,
  },
  bgOrbTop: {
    position: 'absolute',
    top: -120,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#dce8ff',
    opacity: 0.75,
  },
  bgOrbBottom: {
    position: 'absolute',
    top: 320,
    left: -70,
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: '#edf4ff',
    opacity: 0.88,
  },
  heroCard: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    overflow: 'hidden',
    borderRadius: radii.xl,
    position: 'relative',
    borderColor: '#2d4968',
  },
  heroGlowPrimary: {
    position: 'absolute',
    top: -80,
    right: -20,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#24476f',
    opacity: 0.45,
  },
  heroGlowSecondary: {
    position: 'absolute',
    bottom: -90,
    left: -30,
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: '#0b5fff',
    opacity: 0.25,
  },
  heroKicker: {
    color: colors.textOnDarkMuted,
    fontSize: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontFamily: typography.heading,
  },
  heroTitle: {
    marginTop: 8,
    fontSize: 30,
    lineHeight: 34,
    color: colors.textOnDark,
    fontFamily: typography.display,
  },
  heroSubtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textOnDarkMuted,
    fontFamily: typography.body,
  },
  heroSignalRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroSignalChip: {
    backgroundColor: '#17314a',
    borderWidth: 1,
    borderColor: '#355474',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroSignalText: {
    color: colors.textOnDark,
    fontSize: 11,
    fontFamily: typography.heading,
  },
  trustRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  trustChip: {
    backgroundColor: '#1e3550',
    borderColor: '#335373',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  trustChipText: {
    color: colors.textOnDark,
    fontSize: 11,
    fontFamily: typography.heading,
  },
  usageCard: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderColor: '#d2dff2',
    backgroundColor: '#fbfdff',
  },
  planStrategyCard: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    borderColor: '#b7cbeb',
    backgroundColor: '#eef4ff',
  },
  planStrategyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  planStrategyKicker: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    color: colors.textMuted,
    fontFamily: typography.heading,
  },
  planStrategyBadge: {
    borderWidth: 1,
    borderColor: '#97b5e7',
    backgroundColor: '#dce9ff',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  planStrategyBadgePro: {
    borderColor: '#5279c7',
    backgroundColor: '#c9ddff',
  },
  planStrategyBadgeText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  planStrategyTitle: {
    marginTop: 6,
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  planStrategyText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  planStrategySignalRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  planStrategySignalChip: {
    borderWidth: 1,
    borderColor: '#bfd1ef',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  planStrategySignalText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  usageTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  usageTitle: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  usageValue: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  usageTrack: {
    height: 10,
    backgroundColor: colors.borderMuted,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  usageFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  usageHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  valueCard: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    borderColor: '#d2dff2',
    backgroundColor: '#fbfdff',
  },
  valueTitle: {
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 10,
    fontFamily: typography.heading,
  },
  valueList: {
    gap: 8,
  },
  valueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  valueDot: {
    width: 8,
    height: 8,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  valueText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  loadingContainer: {
    marginTop: spacing.md,
    padding: spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  planStack: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  planCard: {
    borderRadius: radii.xl,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: '#fbfdff',
  },
  planCardHighlighted: {
    borderColor: colors.accent,
    backgroundColor: '#f4f8ff',
  },
  planCardCurrent: {
    borderColor: colors.success,
    backgroundColor: '#edf9f2',
  },
  planBadge: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    fontSize: 10,
    letterSpacing: 0.8,
    backgroundColor: colors.accent,
    color: colors.surface,
    fontFamily: typography.heading,
    overflow: 'hidden',
  },
  planTitle: {
    fontSize: 24,
    color: colors.textPrimary,
    fontFamily: typography.display,
  },
  planLabel: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  priceRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  planPrice: {
    fontSize: 34,
    color: colors.accentDark,
    fontFamily: typography.display,
  },
  priceCadence: {
    marginBottom: 6,
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  planValueLine: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  planPunchline: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  planCta: {
    marginTop: spacing.md,
  },
  currentPlanBadge: {
    marginTop: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  currentPlanText: {
    fontSize: 14,
    color: colors.surface,
    fontFamily: typography.heading,
  },
  restoreButton: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
  },
  footer: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  legalLinks: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  linkText: {
    color: colors.accent,
    fontSize: 12,
    textDecorationLine: 'underline',
    fontFamily: typography.heading,
  },
  linkSeparator: {
    color: colors.textMuted,
    fontSize: 12,
  },
});

export default SubscriptionScreen;
