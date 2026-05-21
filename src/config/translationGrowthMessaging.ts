export type TranslationGrowthCopyVariant = 'global' | 'velocity';
export type TranslationGrowthVariantStrategy = 'winner' | 'experiment';

export interface TranslationDiscoveryCopy {
  kicker: string;
  title: string;
  emptyStateText: string;
  withHistoryText: (languageVariantCount: number, recordingCount: number) => string;
  ctaTranslated: string;
  ctaDefault: string;
}

export interface TranslationInsightsCopy {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaFallbackLabel: string;
  ctaEmptyHint: string;
}

export interface TranslationGrowthCopy {
  discovery: TranslationDiscoveryCopy;
  insights: TranslationInsightsCopy;
}

const DEFAULT_FALLBACK_VARIANT: TranslationGrowthCopyVariant = 'global';
const DEFAULT_WINNER_VARIANT: TranslationGrowthCopyVariant = 'global';
const DEFAULT_ROLLOUT_STRATEGY: TranslationGrowthVariantStrategy = 'winner';

function normalizeVariant(value: string | undefined): TranslationGrowthCopyVariant | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'global' || normalized === 'velocity') {
    return normalized;
  }
  return null;
}

function normalizeStrategy(value: string | undefined): TranslationGrowthVariantStrategy | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'winner' || normalized === 'experiment') {
    return normalized;
  }
  return null;
}

export interface TranslationGrowthRuntimeConfig {
  forceOverride: TranslationGrowthCopyVariant | null;
  winnerVariant: TranslationGrowthCopyVariant;
  strategy: TranslationGrowthVariantStrategy;
}

export function getTranslationGrowthRuntimeConfig(
  env: Partial<Record<string, string | undefined>> = process.env,
): TranslationGrowthRuntimeConfig {
  return {
    forceOverride: normalizeVariant(env.EXPO_PUBLIC_TRANSLATION_GROWTH_FORCE_VARIANT) || null,
    winnerVariant:
      normalizeVariant(env.EXPO_PUBLIC_TRANSLATION_GROWTH_WINNER_VARIANT) || DEFAULT_WINNER_VARIANT,
    strategy:
      normalizeStrategy(env.EXPO_PUBLIC_TRANSLATION_GROWTH_VARIANT_STRATEGY) || DEFAULT_ROLLOUT_STRATEGY,
  };
}

export interface TranslationGrowthVariantResolution {
  variant: TranslationGrowthCopyVariant;
  mode: TranslationGrowthVariantStrategy;
  reason: 'forced' | 'winner' | 'experiment';
}

export const TRANSLATION_GROWTH_COPY_BY_VARIANT: Record<
  TranslationGrowthCopyVariant,
  TranslationGrowthCopy
> = {
  global: {
    discovery: {
      kicker: 'Global Reach',
      title: 'Multilingual Recaps',
      emptyStateText: 'Translate any meeting breakdown instantly and share with international teams.',
      withHistoryText: (languageVariantCount, recordingCount) =>
        `You already have ${languageVariantCount} language variant${
          languageVariantCount === 1 ? '' : 's'
        } across ${recordingCount} meeting${recordingCount === 1 ? '' : 's'}.`,
      ctaTranslated: 'Open multilingual',
      ctaDefault: 'Open latest',
    },
    insights: {
      title: 'Activate Translation Growth',
      subtitle: 'Jump straight into a translation-ready meeting and continue the multilingual workflow.',
      ctaLabel: 'Open Translation-Ready Meeting',
      ctaFallbackLabel: 'Open Latest Translatable Meeting',
      ctaEmptyHint: 'Capture or summarize a meeting first to unlock this shortcut.',
    },
  },
  velocity: {
    discovery: {
      kicker: 'Faster Shareouts',
      title: 'Cross-Language Alignment',
      emptyStateText: 'Convert one recap into any language and keep teams aligned in minutes, not hours.',
      withHistoryText: (languageVariantCount, recordingCount) =>
        `${recordingCount} meeting${recordingCount === 1 ? '' : 's'} already translated into ${languageVariantCount} language variant${
          languageVariantCount === 1 ? '' : 's'
        }.`,
      ctaTranslated: 'Ship Multilingual Update',
      ctaDefault: 'Translate Latest Meeting',
    },
    insights: {
      title: 'Recover Translation Momentum',
      subtitle: 'Use your strongest translation-ready recording as the next conversion touchpoint.',
      ctaLabel: 'Resume Translation Flow',
      ctaFallbackLabel: 'Start Translation Flow',
      ctaEmptyHint: 'No translatable recordings yet. Capture one meeting to seed this funnel.',
    },
  },
};

export function getExperimentTranslationGrowthVariant(seed: string): TranslationGrowthCopyVariant {
  if (!seed) {
    return DEFAULT_FALLBACK_VARIANT;
  }

  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % 100000;
  }

  return hash % 2 === 0 ? 'global' : 'velocity';
}

export function resolveTranslationGrowthVariant(
  seed: string,
  runtimeConfig: TranslationGrowthRuntimeConfig = getTranslationGrowthRuntimeConfig(),
): TranslationGrowthVariantResolution {
  if (runtimeConfig.forceOverride) {
    return {
      variant: runtimeConfig.forceOverride,
      mode: runtimeConfig.strategy,
      reason: 'forced',
    };
  }

  if (runtimeConfig.strategy === 'winner') {
    return {
      variant: runtimeConfig.winnerVariant,
      mode: 'winner',
      reason: 'winner',
    };
  }

  return {
    variant: getExperimentTranslationGrowthVariant(seed),
    mode: 'experiment',
    reason: 'experiment',
  };
}
