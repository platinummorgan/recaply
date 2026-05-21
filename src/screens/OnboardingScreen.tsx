import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOnboardingSlides, resolvePaywallVariant } from '../config/paywallMessaging';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { useAuth } from '../context/AuthContext';
import { trackActivationEvent } from '../services/activationAnalytics';
import {
  getDefaultTranslationLanguage,
  setDefaultTranslationLanguage,
  TRANSLATION_LANGUAGE_OPTIONS,
} from '../services/translationPreferences';

const { width } = Dimensions.get('window');

interface OnboardingScreenProps {
  navigation: any;
}

const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';
const ONBOARDING_OUTCOME_POINTS = [
  'Capture with context',
  'Generate executive summaries',
  'Share in any language',
];

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ navigation }) => {
  const { token } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [preferredLanguage, setPreferredLanguage] = useState('Spanish');
  const scrollViewRef = useRef<ScrollView>(null);
  const slideMotion = useRef(new Animated.Value(0)).current;
  const paywallVariant = useMemo(() => resolvePaywallVariant('onboarding').variant, []);
  const slides = useMemo(() => getOnboardingSlides(paywallVariant), [paywallVariant]);
  const activeSlide = slides[currentSlide];
  const progressPercent = Math.round(((currentSlide + 1) / slides.length) * 100);
  const remainingSteps = Math.max(slides.length - currentSlide - 1, 0);
  const readinessSignal = remainingSteps === 0 ? 'Ready to launch' : `${remainingSteps} steps left`;
  const slideMotionStyle = useMemo(
    () => ({
      opacity: slideMotion,
      transform: [
        {
          translateY: slideMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [18, 0],
          }),
        },
      ],
    }),
    [slideMotion],
  );

  useEffect(() => {
    slideMotion.setValue(0);
    const animation = Animated.timing(slideMotion, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [currentSlide, slideMotion]);

  useEffect(() => {
    void loadPreferredLanguage();
  }, []);

  useEffect(() => {
    void trackActivationEvent(token, {
      eventName: 'onboarding_viewed',
      source: 'onboarding_screen',
      step: 'landing',
    });
  }, [token]);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      const nextSlide = currentSlide + 1;
      setCurrentSlide(nextSlide);
      scrollViewRef.current?.scrollTo({ x: width * nextSlide, animated: true });
    }
  };

  const completeOnboarding = async (mode: 'skip' | 'completed') => {
    void trackActivationEvent(token, {
      eventName: 'onboarding_completed',
      source: 'onboarding_screen',
      outcome: mode,
      step: `slide_${currentSlide + 1}`,
    });
    try {
      await setDefaultTranslationLanguage(preferredLanguage);
    } catch {
      // Keep onboarding completion resilient if preference persistence fails.
    }
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Home');
    }
  };

  const handleSkip = async () => {
    void trackActivationEvent(token, {
      eventName: 'onboarding_skip_tapped',
      source: 'onboarding_screen',
      step: `slide_${currentSlide + 1}`,
    });
    await completeOnboarding('skip');
  };

  const handleGetStarted = async () => {
    await completeOnboarding('completed');
  };

  const handleScroll = (event: any) => {
    const slideIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentSlide(slideIndex);
  };

  async function loadPreferredLanguage() {
    const preferred = await getDefaultTranslationLanguage();
    setPreferredLanguage(preferred);
  }

  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <View style={styles.container}>
      <View style={styles.bgOrbTop} />
      <View style={styles.bgOrbBottom} />

      {!isLastSlide && (
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>Onboarding {currentSlide + 1} / {slides.length}</Text>
        <Text style={styles.progressLabel}>{progressPercent}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {slides.map((slide, index) => (
          <View key={`${slide.phase}-${index}`} style={styles.slide}>
            <Animated.View style={[styles.slideCard, currentSlide === index ? slideMotionStyle : undefined]}>
              <Text style={styles.phase}>{slide.phase}</Text>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.description}>{slide.description}</Text>

              <View style={styles.metricRow}>
                <View style={styles.metricPill}>
                  <Text style={styles.metricLabel}>{slide.metric}</Text>
                </View>
                <View style={styles.tonePill}>
                  <Text style={styles.toneLabel}>{slide.tone}</Text>
                </View>
              </View>
            </Animated.View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.pagination}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              currentSlide === index && styles.activeDot,
            ]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <View style={styles.outcomeRail}>
          <Text style={styles.outcomeRailTitle}>What You Unlock</Text>
          <View style={styles.outcomeRailRow}>
            {ONBOARDING_OUTCOME_POINTS.map((point) => (
              <View key={point} style={styles.outcomePill}>
                <Text style={styles.outcomePillText}>{point}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.outcomeRailMeta}>
            {activeSlide?.metric || 'High-impact workflow'}  •  {readinessSignal}
          </Text>
        </View>
        <View style={styles.languagePanel}>
          <Text style={styles.languagePanelTitle}>Preferred Translation Language</Text>
          <Text style={styles.languagePanelHint}>
            Recaply will preselect this language when sharing multilingual recaps.
          </Text>
          <View style={styles.languageChipRow}>
            {TRANSLATION_LANGUAGE_OPTIONS.map((language) => {
              const selected = preferredLanguage === language;
              return (
                <TouchableOpacity
                  key={language}
                  style={[styles.languageChip, selected && styles.languageChipActive]}
                  onPress={() => setPreferredLanguage(language)}
                >
                  <Text style={[styles.languageChipText, selected && styles.languageChipTextActive]}>
                    {language}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <Text style={styles.footerHint}>{isLastSlide ? 'You are ready to capture with context.' : 'Swipe or tap Next to continue.'}</Text>
        {isLastSlide ? (
          <TouchableOpacity style={styles.button} onPress={handleGetStarted}>
            <Text style={styles.buttonText}>Get Started</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.button} onPress={handleNext}>
            <Text style={styles.buttonText}>Next</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceDark,
  },
  bgOrbTop: {
    position: 'absolute',
    top: -120,
    right: -40,
    width: 280,
    height: 280,
    borderRadius: 999,
    backgroundColor: '#1b3e67',
    opacity: 0.65,
  },
  bgOrbBottom: {
    position: 'absolute',
    bottom: -160,
    left: -40,
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: '#0b5fff',
    opacity: 0.25,
  },
  skipButton: {
    position: 'absolute',
    top: 52,
    right: spacing.md,
    zIndex: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: '#1f3854',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: '#335473',
  },
  skipText: {
    color: colors.textOnDark,
    fontSize: 13,
    fontFamily: typography.heading,
  },
  progressHeader: {
    marginTop: 54,
    marginHorizontal: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    color: colors.textOnDarkMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: typography.heading,
  },
  progressTrack: {
    marginTop: 8,
    marginHorizontal: spacing.xl,
    height: 6,
    borderRadius: 99,
    backgroundColor: '#294a6a',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  slide: {
    width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  slideCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    borderWidth: 1,
    borderColor: '#375676',
    backgroundColor: '#13263b',
    gap: 10,
  },
  phase: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textOnDarkMuted,
    fontFamily: typography.heading,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
    color: colors.textOnDark,
    fontFamily: typography.display,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textOnDarkMuted,
    fontFamily: typography.body,
  },
  metricRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metricPill: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  metricLabel: {
    color: colors.surface,
    fontSize: 12,
    fontFamily: typography.heading,
  },
  tonePill: {
    backgroundColor: '#1f3854',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: '#3f5f80',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  toneLabel: {
    color: colors.textOnDark,
    fontSize: 12,
    fontFamily: typography.heading,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: '#385978',
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: colors.surface,
    width: 28,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl + spacing.xs,
    gap: 10,
  },
  outcomeRail: {
    borderWidth: 1,
    borderColor: '#355677',
    backgroundColor: '#102235',
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: 8,
  },
  outcomeRailTitle: {
    fontSize: 12,
    color: colors.textOnDark,
    fontFamily: typography.heading,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  outcomeRailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  outcomePill: {
    borderWidth: 1,
    borderColor: '#466b8f',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1a324b',
  },
  outcomePillText: {
    fontSize: 11,
    color: colors.textOnDark,
    fontFamily: typography.heading,
  },
  outcomeRailMeta: {
    fontSize: 11,
    color: '#9eb8d4',
    fontFamily: typography.body,
  },
  languagePanel: {
    borderWidth: 1,
    borderColor: '#3f5f80',
    backgroundColor: '#13263b',
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: 8,
  },
  languagePanelTitle: {
    fontSize: 12,
    color: colors.textOnDark,
    fontFamily: typography.heading,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  languagePanelHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textOnDarkMuted,
    fontFamily: typography.body,
  },
  languageChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  languageChip: {
    borderWidth: 1,
    borderColor: '#4a6582',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1f3854',
  },
  languageChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  languageChipText: {
    fontSize: 11,
    color: colors.textOnDark,
    fontFamily: typography.heading,
  },
  languageChipTextActive: {
    color: colors.surface,
  },
  footerHint: {
    fontSize: 12,
    color: colors.textOnDarkMuted,
    textAlign: 'center',
    fontFamily: typography.body,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 15,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.surface,
    fontSize: 16,
    fontFamily: typography.heading,
  },
});

export default OnboardingScreen;

export const isOnboardingComplete = async (): Promise<boolean> => {
  const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
  return value === 'true';
};

export const resetOnboarding = async (): Promise<void> => {
  await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
};
