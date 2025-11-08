import axios, {AxiosError} from 'axios';
import {LLM_API_KEY, LLM_API_URL, LLM_MODEL} from '@env';

// Re-export types for convenience
export type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  SummaryResponse,
  ActionItem,
} from '../types/llm';

import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  SummaryResponse,
  ActionItem,
} from '../types/llm';

/**
 * LLM Service for generating meeting summaries using various AI providers
 * Supports OpenAI, Anthropic, and custom endpoints
 */

// Default configuration
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2000;

// System prompts for different tasks
const SUMMARY_SYSTEM_PROMPT = `You are an expert meeting assistant specialized in analyzing meeting transcripts and extracting key information.

Your task is to analyze the provided meeting transcript and generate a structured summary in JSON format with the following fields:

1. summary: A concise 2-3 paragraph overview of the meeting
2. keyPoints: Array of 3-7 most important points discussed (bullet points)
3. decisions: Array of key decisions made during the meeting
4. actionItems: Array of objects with the following structure:
   - task: Clear description of what needs to be done
   - assignee: Person responsible (if mentioned, otherwise null)
   - priority: "high", "medium", or "low" (infer from context)
   - deadline: Any mentioned deadline (if any, otherwise null)
5. participants: Array of participant names (if mentioned)
6. sentiment: Overall meeting tone - "positive", "neutral", or "negative"

Be concise, accurate, and focus on actionable information. Return ONLY valid JSON.`;

/**
 * Get default LLM provider configuration from environment
 */
const getDefaultProvider = (): LLMProvider => {
  return {
    name: 'openai',
    apiKey: LLM_API_KEY || '',
    apiUrl: LLM_API_URL || 'https://api.openai.com/v1/chat/completions',
    model: LLM_MODEL || 'gpt-4',
  };
};

/**
 * Call OpenAI-compatible API
 */
const callOpenAI = async (
  provider: LLMProvider,
  messages: Array<{role: string; content: string}>,
  temperature: number = DEFAULT_TEMPERATURE,
  maxTokens: number = DEFAULT_MAX_TOKENS,
): Promise<LLMResponse> => {
  try {
    const response = await axios.post(
      provider.apiUrl,
      {
        model: provider.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: {type: 'json_object'},
      },
      {
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 60 second timeout
      },
    );

    return {
      content: response.data.choices[0].message.content,
      usage: {
        promptTokens: response.data.usage.prompt_tokens,
        completionTokens: response.data.usage.completion_tokens,
        totalTokens: response.data.usage.total_tokens,
      },
      model: response.data.model,
    };
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('OpenAI API error:', axiosError.response?.data || axiosError.message);
    throw new Error(`OpenAI API call failed: ${axiosError.message}`);
  }
};

/**
 * Call Anthropic Claude API
 */
const callAnthropic = async (
  provider: LLMProvider,
  messages: Array<{role: string; content: string}>,
  temperature: number = DEFAULT_TEMPERATURE,
  maxTokens: number = DEFAULT_MAX_TOKENS,
): Promise<LLMResponse> => {
  try {
    // Extract system message if present
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await axios.post(
      provider.apiUrl,
      {
        model: provider.model,
        max_tokens: maxTokens,
        temperature,
        system: systemMessage?.content,
        messages: userMessages,
      },
      {
        headers: {
          'x-api-key': provider.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    return {
      content: response.data.content[0].text,
      usage: {
        promptTokens: response.data.usage.input_tokens,
        completionTokens: response.data.usage.output_tokens,
        totalTokens: response.data.usage.input_tokens + response.data.usage.output_tokens,
      },
      model: response.data.model,
    };
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Anthropic API error:', axiosError.response?.data || axiosError.message);
    throw new Error(`Anthropic API call failed: ${axiosError.message}`);
  }
};

/**
 * Main LLM request handler - routes to appropriate provider
 */
export const callLLM = async (
  messages: Array<{role: string; content: string}>,
  provider?: LLMProvider,
  temperature?: number,
  maxTokens?: number,
): Promise<LLMResponse> => {
  const llmProvider = provider || getDefaultProvider();

  switch (llmProvider.name) {
    case 'openai':
      return callOpenAI(llmProvider, messages, temperature, maxTokens);
    case 'anthropic':
      return callAnthropic(llmProvider, messages, temperature, maxTokens);
    case 'custom':
      // For custom providers, try OpenAI format first
      return callOpenAI(llmProvider, messages, temperature, maxTokens);
    default:
      throw new Error(`Unsupported LLM provider: ${llmProvider.name}`);
  }
};

/**
 * Generate meeting summary from transcript
 */
export const generateMeetingSummary = async (
  transcript: string,
  provider?: LLMProvider,
): Promise<SummaryResponse> => {
  try {
    if (!transcript || transcript.trim().length === 0) {
      throw new Error('Transcript is empty');
    }

    console.log(`Generating summary for transcript (${transcript.length} chars)...`);

    const messages = [
      {
        role: 'system',
        content: SUMMARY_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: `Please analyze this meeting transcript and provide a structured summary:\n\n${transcript}`,
      },
    ];

    const response = await callLLM(messages, provider, 0.7, 2000);

    // Parse JSON response
    const summaryData = JSON.parse(response.content);

    // Validate and structure the response
    const summary: SummaryResponse = {
      summary: summaryData.summary || 'No summary available',
      keyPoints: summaryData.keyPoints || [],
      decisions: summaryData.decisions || [],
      actionItems: summaryData.actionItems || [],
      participants: summaryData.participants || [],
      sentiment: summaryData.sentiment || 'neutral',
    };

    console.log('Summary generated successfully');
    console.log(`Token usage: ${response.usage?.totalTokens || 'unknown'}`);

    return summary;
  } catch (error) {
    console.error('Error generating summary:', error);
    
    // Return fallback summary in case of error
    return {
      summary: 'Failed to generate AI summary. Please try again or check your API configuration.',
      keyPoints: ['Error occurred during summary generation'],
      decisions: [],
      actionItems: [],
      sentiment: 'neutral',
    };
  }
};

/**
 * Generate quick summary (shorter, faster)
 */
export const generateQuickSummary = async (
  transcript: string,
  provider?: LLMProvider,
): Promise<string> => {
  try {
    const messages = [
      {
        role: 'system',
        content: 'You are a concise meeting assistant. Summarize meetings in 2-3 sentences.',
      },
      {
        role: 'user',
        content: `Briefly summarize this meeting:\n\n${transcript}`,
      },
    ];

    const response = await callLLM(messages, provider, 0.5, 300);
    return response.content;
  } catch (error) {
    console.error('Error generating quick summary:', error);
    return 'Failed to generate summary.';
  }
};

/**
 * Extract action items only
 */
export const extractActionItems = async (
  transcript: string,
  provider?: LLMProvider,
): Promise<ActionItem[]> => {
  try {
    const messages = [
      {
        role: 'system',
        content:
          'Extract action items from meeting transcripts. Return a JSON array of objects with fields: task, assignee, priority, deadline.',
      },
      {
        role: 'user',
        content: `Extract all action items from this meeting:\n\n${transcript}`,
      },
    ];

    const response = await callLLM(messages, provider, 0.5, 1000);
    const actionItems = JSON.parse(response.content);
    return Array.isArray(actionItems) ? actionItems : [];
  } catch (error) {
    console.error('Error extracting action items:', error);
    return [];
  }
};

/**
 * Test LLM connection
 */
export const testLLMConnection = async (provider?: LLMProvider): Promise<boolean> => {
  try {
    const messages = [
      {
        role: 'user',
        content: 'Respond with "OK" if you receive this message.',
      },
    ];

    const response = await callLLM(messages, provider, 0, 10);
    return response.content.toLowerCase().includes('ok');
  } catch (error) {
    console.error('LLM connection test failed:', error);
    return false;
  }
};

/**
 * Estimate token count (rough approximation)
 */
export const estimateTokens = (text: string): number => {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
};

/**
 * Calculate cost estimate based on tokens
 */
export const estimateCost = (tokens: number, model: string = 'gpt-4'): number => {
  // Pricing as of 2025 (approximate)
  const pricing: Record<string, {input: number; output: number}> = {
    'gpt-4': {input: 0.03, output: 0.06}, // per 1K tokens
    'gpt-4-turbo': {input: 0.01, output: 0.03},
    'gpt-3.5-turbo': {input: 0.0005, output: 0.0015},
    'claude-3-opus': {input: 0.015, output: 0.075},
    'claude-3-sonnet': {input: 0.003, output: 0.015},
  };

  const modelPricing = pricing[model] || pricing['gpt-4'];
  // Assume 50/50 split between input and output tokens
  const inputCost = (tokens / 2 / 1000) * modelPricing.input;
  const outputCost = (tokens / 2 / 1000) * modelPricing.output;

  return inputCost + outputCost;
};
