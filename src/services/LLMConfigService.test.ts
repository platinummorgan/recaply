import {
  LLM_PROVIDERS,
  configToProvider,
  getEstimatedCostPerMinute,
  validateApiKey,
} from './LLMConfigService';

describe('LLMConfigService', () => {
  it('validates provider-specific API key formats', () => {
    expect(validateApiKey('OPENAI', 'sk-test-key')).toBe(true);
    expect(validateApiKey('OPENAI', 'bad-key')).toBe(false);

    expect(validateApiKey('ANTHROPIC', 'sk-ant-demo')).toBe(true);
    expect(validateApiKey('ANTHROPIC', 'sk-demo')).toBe(false);

    expect(validateApiKey('GROQ', 'gsk_demo')).toBe(true);
    expect(validateApiKey('GROQ', 'sk-demo')).toBe(false);

    expect(validateApiKey('LOCAL', 'anything')).toBe(true);
    expect(validateApiKey('OPENAI', '')).toBe(false);
  });

  it('maps UI config shape to provider payload', () => {
    const provider = configToProvider({
      provider: 'GROQ',
      apiKey: 'gsk_demo',
      apiUrl: LLM_PROVIDERS.GROQ.apiUrl,
      model: LLM_PROVIDERS.GROQ.models[0],
      temperature: 0.4,
      maxTokens: 1200,
    });

    expect(provider).toEqual({
      name: 'openai',
      apiKey: 'gsk_demo',
      apiUrl: LLM_PROVIDERS.GROQ.apiUrl,
      model: LLM_PROVIDERS.GROQ.models[0],
    });
  });

  it('returns zero estimated cost for local provider', () => {
    expect(getEstimatedCostPerMinute('LOCAL')).toBe(0);
  });
});
