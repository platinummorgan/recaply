export type PaywallTier = 'free' | 'lite' | 'pro';
export type PaywallCopyVariant = 'value' | 'roi';
export type PaywallVariantStrategy = 'winner' | 'experiment';

export interface PaywallPlanCopy {
  label?: string;
  featurePunchline?: string;
  ctaLabel?: string;
}

export interface PaywallVariantCopy {
  heroKicker: string;
  heroTitle: string;
  heroSubtitle: string;
  trustPoints: string[];
  valueTitle: string;
  valueBullets: string[];
  planCopy: Record<PaywallTier, PaywallPlanCopy>;
}

export interface OnboardingSlide {
  phase: string;
  title: string;
  description: string;
  metric: string;
  tone: string;
}

const DEFAULT_FALLBACK_VARIANT: PaywallCopyVariant = 'value';
const DEFAULT_WINNER_VARIANT: PaywallCopyVariant = 'roi';
const DEFAULT_ROLLOUT_STRATEGY: PaywallVariantStrategy = 'winner';

function normalizeVariant(value: string | undefined): PaywallCopyVariant | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'value' || normalized === 'roi') {
    return normalized;
  }
  return null;
}

function normalizeStrategy(value: string | undefined): PaywallVariantStrategy | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'winner' || normalized === 'experiment') {
    return normalized;
  }
  return null;
}

export interface PaywallRuntimeConfig {
  forceOverride: PaywallCopyVariant | null;
  winnerVariant: PaywallCopyVariant;
  strategy: PaywallVariantStrategy;
}

export function getPaywallRuntimeConfig(
  env: Partial<Record<string, string | undefined>> = process.env,
): PaywallRuntimeConfig {
  return {
    forceOverride: normalizeVariant(env.EXPO_PUBLIC_PAYWALL_FORCE_VARIANT) || null,
    winnerVariant: normalizeVariant(env.EXPO_PUBLIC_PAYWALL_WINNER_VARIANT) || DEFAULT_WINNER_VARIANT,
    strategy: normalizeStrategy(env.EXPO_PUBLIC_PAYWALL_VARIANT_STRATEGY) || DEFAULT_ROLLOUT_STRATEGY,
  };
}

export interface PaywallVariantResolution {
  variant: PaywallCopyVariant;
  mode: PaywallVariantStrategy;
  reason: 'forced' | 'winner' | 'experiment';
}

export const PAYWALL_COPY_BY_VARIANT: Record<PaywallCopyVariant, PaywallVariantCopy> = {
  value: {
    heroKicker: 'Recaply Plans',
    heroTitle: 'Built To Turn Meetings Into Decisions',
    heroSubtitle: 'Pick the tier that matches your recording volume and unlock faster execution every week.',
    trustPoints: ['Secure cloud sync', 'Fast AI transcripts', 'Action-ready summaries'],
    valueTitle: 'Why teams upgrade',
    valueBullets: [
      'Capture meetings in one tap',
      'Turn raw calls into action items',
      'Search across your entire memory',
    ],
    planCopy: {
      free: {
        label: 'For first-time users',
        featurePunchline: 'Unlimited recordings with monthly AI minutes.',
      },
      lite: {
        label: 'Best for weekly usage',
        featurePunchline: 'Plenty of minutes for recurring meetings.',
      },
      pro: {
        label: 'Most popular',
        featurePunchline: 'Built for heavy daily workflows and teams.',
      },
    },
  },
  roi: {
    heroKicker: 'Scale Your Output',
    heroTitle: 'Save Hours Every Week On Meeting Follow-Through',
    heroSubtitle: 'Choose the plan that converts call time into decisions, ownership, and shipped outcomes.',
    trustPoints: ['No setup friction', 'Minutes that scale', 'Decisions you can execute'],
    valueTitle: 'ROI this unlocks',
    valueBullets: [
      'Reduce recap/admin work after every meeting',
      'Prevent missed action items and deadline drift',
      'Recover decisions instantly without rewatching calls',
    ],
    planCopy: {
      free: {
        label: 'Try the workflow',
        featurePunchline: 'Validate the process before paying.',
      },
      lite: {
        label: 'Best ROI for small teams',
        featurePunchline: 'High output without full-unlimited cost.',
        ctaLabel: 'Start Saving Time',
      },
      pro: {
        label: 'For nonstop meeting volume',
        featurePunchline: 'Unlimited minutes for mission-critical workflows.',
        ctaLabel: 'Maximize Team Output',
      },
    },
  },
};

const ONBOARDING_CORE_SLIDES: OnboardingSlide[] = [
  {
    phase: 'Step 1',
    title: 'Capture Every Important Conversation',
    description: 'Record meetings, calls, and voice notes in one tap with stable offline capture.',
    metric: 'One-tap capture',
    tone: 'Signal',
  },
  {
    phase: 'Step 2',
    title: 'Get Transcript Precision In Minutes',
    description: 'AI transcription turns raw audio into searchable text so your team can move fast.',
    metric: 'Fast processing',
    tone: 'Clarity',
  },
  {
    phase: 'Step 3',
    title: 'Receive Action-Ready Summaries',
    description: 'Recaply extracts decisions, risks, and action items so no follow-up gets lost.',
    metric: 'Decision ready',
    tone: 'Execution',
  },
  {
    phase: 'Step 4',
    title: 'Find Any Insight Instantly',
    description: 'Search across meetings by topic, person, and context without digging through notes.',
    metric: 'Searchable memory',
    tone: 'Recall',
  },
];

const ONBOARDING_VARIANT_FINAL_SLIDE: Record<PaywallCopyVariant, OnboardingSlide> = {
  value: {
    phase: 'Step 5',
    title: 'Start Free, Scale When You Grow',
    description: 'Begin with 30 monthly AI minutes, then move to Lite or Pro as usage expands.',
    metric: '30 free minutes',
    tone: 'Growth',
  },
  roi: {
    phase: 'Step 5',
    title: 'Start Free, Then Unlock More Output',
    description: 'Use Lite or Pro to turn high meeting volume into decisions without post-call backlog.',
    metric: 'Hours saved weekly',
    tone: 'ROI',
  },
};

export function getOnboardingSlides(variant: PaywallCopyVariant): OnboardingSlide[] {
  return [...ONBOARDING_CORE_SLIDES, ONBOARDING_VARIANT_FINAL_SLIDE[variant]];
}

export function getExperimentPaywallVariant(seed: string): PaywallCopyVariant {
  if (!seed) {
    return DEFAULT_FALLBACK_VARIANT;
  }

  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % 100000;
  }

  return hash % 2 === 0 ? 'value' : 'roi';
}

export function resolvePaywallVariant(
  seed: string,
  runtimeConfig: PaywallRuntimeConfig = getPaywallRuntimeConfig(),
): PaywallVariantResolution {
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
    variant: getExperimentPaywallVariant(seed),
    mode: 'experiment',
    reason: 'experiment',
  };
}
