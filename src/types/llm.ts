export interface SummaryResponse {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  participants?: string[];
  duration?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface ActionItem {
  task: string;
  assignee?: string;
  priority?: 'high' | 'medium' | 'low';
  deadline?: string;
  status?: 'pending' | 'in-progress' | 'completed';
}

export interface LLMProvider {
  name: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  apiUrl: string;
  model: string;
}

export interface LLMRequest {
  transcript: string;
  provider?: LLMProvider;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}
