import {
  TRANSLATION_GROWTH_COPY_BY_VARIANT,
  resolveTranslationGrowthVariant,
  type TranslationGrowthRuntimeConfig,
} from './translationGrowthMessaging';

describe('translationGrowthMessaging config', () => {
  it('defaults to winner mode and global winner variant', () => {
    const runtimeConfig: TranslationGrowthRuntimeConfig = {
      forceOverride: null,
      winnerVariant: 'global',
      strategy: 'winner',
    };

    const resolution = resolveTranslationGrowthVariant('user-seed', runtimeConfig);
    expect(resolution.mode).toBe('winner');
    expect(resolution.reason).toBe('winner');
    expect(resolution.variant).toBe('global');
  });

  it('supports experiment rollout mode', () => {
    const runtimeConfig: TranslationGrowthRuntimeConfig = {
      forceOverride: null,
      winnerVariant: 'global',
      strategy: 'experiment',
    };

    const resolution = resolveTranslationGrowthVariant('abc@example.com', runtimeConfig);
    expect(resolution.mode).toBe('experiment');
    expect(resolution.reason).toBe('experiment');
    expect(['global', 'velocity']).toContain(resolution.variant);
  });

  it('supports forced variant override for rollback', () => {
    const runtimeConfig: TranslationGrowthRuntimeConfig = {
      forceOverride: 'velocity',
      winnerVariant: 'global',
      strategy: 'experiment',
    };

    const resolution = resolveTranslationGrowthVariant('another-seed', runtimeConfig);
    expect(resolution.reason).toBe('forced');
    expect(resolution.variant).toBe('velocity');
  });

  it('contains both discovery and insights copy blocks for each variant', () => {
    const global = TRANSLATION_GROWTH_COPY_BY_VARIANT.global;
    const velocity = TRANSLATION_GROWTH_COPY_BY_VARIANT.velocity;

    expect(global.discovery.title).toBeTruthy();
    expect(global.insights.ctaLabel).toBeTruthy();
    expect(velocity.discovery.title).toBeTruthy();
    expect(velocity.insights.ctaLabel).toBeTruthy();
  });
});
