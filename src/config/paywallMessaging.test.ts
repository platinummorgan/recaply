import { getOnboardingSlides, resolvePaywallVariant, type PaywallRuntimeConfig } from './paywallMessaging';

describe('paywallMessaging config', () => {
  it('defaults to winner mode and roi winner variant', () => {
    const runtimeConfig: PaywallRuntimeConfig = {
      forceOverride: null,
      winnerVariant: 'roi',
      strategy: 'winner',
    };
    const resolution = resolvePaywallVariant('user-seed', runtimeConfig);
    expect(resolution.mode).toBe('winner');
    expect(resolution.reason).toBe('winner');
    expect(resolution.variant).toBe('roi');
  });

  it('supports rollout fallback to experiment mode', () => {
    const runtimeConfig: PaywallRuntimeConfig = {
      forceOverride: null,
      winnerVariant: 'roi',
      strategy: 'experiment',
    };
    const resolution = resolvePaywallVariant('abc@example.com', runtimeConfig);
    expect(resolution.mode).toBe('experiment');
    expect(resolution.reason).toBe('experiment');
    expect(['value', 'roi']).toContain(resolution.variant);
  });

  it('supports forced variant override for rapid rollback', () => {
    const runtimeConfig: PaywallRuntimeConfig = {
      forceOverride: 'value',
      winnerVariant: 'roi',
      strategy: 'experiment',
    };
    const resolution = resolvePaywallVariant('another-seed', runtimeConfig);
    expect(resolution.reason).toBe('forced');
    expect(resolution.variant).toBe('value');
  });

  it('builds onboarding slides with variant-specific closing promise', () => {
    const valueSlides = getOnboardingSlides('value');
    const roiSlides = getOnboardingSlides('roi');

    expect(valueSlides).toHaveLength(5);
    expect(roiSlides).toHaveLength(5);
    expect(valueSlides[4].title).toBe('Start Free, Scale When You Grow');
    expect(roiSlides[4].title).toBe('Start Free, Then Unlock More Output');
  });
});
