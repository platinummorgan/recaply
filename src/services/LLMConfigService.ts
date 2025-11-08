import AsyncStorage from '@react-native-async-storage/async-storage';
import {LLMProvider} from '../types/llm';

const LLM_CONFIG_KEY = '@recaply:llm_config';

/**
 * LLM Configuration Manager
 * Handles storing and retrieving LLM provider settings
 */

// Available LLM providers
export const LLM_PROVIDERS = {
  OPENAI: {
    name: 'openai' as const,
    displayName: 'OpenAI (GPT)',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    requiresKey: true,
  },
  ANTHROPIC: {
    name: 'anthropic' as const,
    displayName: 'Anthropic (Claude)',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
    requiresKey: true,
  },
  GROQ: {
    name: 'openai' as const, // Groq uses OpenAI-compatible API
    displayName: 'Groq (Fast)',
    apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['mixtral-8x7b-32768', 'llama2-70b-4096'],
    requiresKey: true,
  },
  LOCAL: {
    name: 'custom' as const,
    displayName: 'Local/Custom',
    apiUrl: 'http://localhost:11434/v1/chat/completions',
    models: ['llama2', 'mistral', 'custom'],
    requiresKey: false,
  },
};

export interface LLMConfig {
  provider: keyof typeof LLM_PROVIDERS;
  apiKey: string;
  apiUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

// Default configuration
const DEFAULT_CONFIG: LLMConfig = {
  provider: 'OPENAI',
  apiKey: '',
  apiUrl: LLM_PROVIDERS.OPENAI.apiUrl,
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 2000,
};

/**
 * Save LLM configuration
 */
export const saveLLMConfig = async (config: Partial<LLMConfig>): Promise<void> => {
  try {
    const currentConfig = await getLLMConfig();
    const newConfig = {...currentConfig, ...config};
    await AsyncStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(newConfig));
  } catch (error) {
    console.error('Error saving LLM config:', error);
    throw new Error('Failed to save LLM configuration');
  }
};

/**
 * Get LLM configuration
 */
export const getLLMConfig = async (): Promise<LLMConfig> => {
  try {
    const configStr = await AsyncStorage.getItem(LLM_CONFIG_KEY);
    if (configStr) {
      return JSON.parse(configStr);
    }
    return DEFAULT_CONFIG;
  } catch (error) {
    console.error('Error loading LLM config:', error);
    return DEFAULT_CONFIG;
  }
};

/**
 * Convert LLMConfig to LLMProvider format
 */
export const configToProvider = (config: LLMConfig): LLMProvider => {
  const providerInfo = LLM_PROVIDERS[config.provider];
  return {
    name: providerInfo.name,
    apiKey: config.apiKey,
    apiUrl: config.apiUrl,
    model: config.model,
  };
};

/**
 * Get current LLM provider
 */
export const getCurrentProvider = async (): Promise<LLMProvider> => {
  const config = await getLLMConfig();
  return configToProvider(config);
};

/**
 * Validate API key format
 */
export const validateApiKey = (provider: keyof typeof LLM_PROVIDERS, apiKey: string): boolean => {
  if (!apiKey || apiKey.trim().length === 0) {
    return false;
  }

  switch (provider) {
    case 'OPENAI':
      return apiKey.startsWith('sk-');
    case 'ANTHROPIC':
      return apiKey.startsWith('sk-ant-');
    case 'GROQ':
      return apiKey.startsWith('gsk_');
    case 'LOCAL':
      return true; // No key required for local
    default:
      return apiKey.length > 10;
  }
};

/**
 * Clear LLM configuration
 */
export const clearLLMConfig = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LLM_CONFIG_KEY);
  } catch (error) {
    console.error('Error clearing LLM config:', error);
  }
};

/**
 * Get estimated cost per minute of audio
 */
export const getEstimatedCostPerMinute = (provider: keyof typeof LLM_PROVIDERS): number => {
  // Average tokens per minute of transcribed speech: ~150-200 words = ~200-250 tokens
  // Summary generation: ~500-1000 tokens
  // Total: ~700-1250 tokens per minute
  const avgTokensPerMinute = 1000;

  const costPer1KTokens: Record<string, number> = {
    OPENAI: 0.04, // Average of input/output for GPT-4
    ANTHROPIC: 0.04, // Average for Claude
    GROQ: 0.001, // Very cheap
    LOCAL: 0, // Free
  };

  return (avgTokensPerMinute / 1000) * (costPer1KTokens[provider] || 0.04);
};
