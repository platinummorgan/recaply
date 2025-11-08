import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('@recaply:auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    subscriptionTier: string;
    minutesUsed?: number;
    minutesLimit: number;
  };
}

export interface TranscriptionResponse {
  transcript: string;
  minutesUsed: number;
}

export interface SummaryResponse {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: Array<{
    task: string;
    assignee?: string;
    priority?: string;
    deadline?: string;
  }>;
  participants?: string[];
  sentiment?: string;
  minutesUsed: number;
}

export interface UsageResponse {
  minutesUsed: number;
  minutesLimit: number;
  minutesRemaining: number | 'unlimited';
  subscriptionTier: string;
}

/**
 * Register new user
 */
export async function register(email: string, password: string): Promise<AuthResponse> {
  const response = await api.post('/auth/register', { email, password });
  
  // Save token
  await AsyncStorage.setItem('@recaply:auth_token', response.data.token);
  
  return response.data;
}

/**
 * Login user
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await api.post('/auth/login', { email, password });
  
  // Save token
  await AsyncStorage.setItem('@recaply:auth_token', response.data.token);
  
  return response.data;
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
  await AsyncStorage.removeItem('@recaply:auth_token');
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn(): Promise<boolean> {
  const token = await AsyncStorage.getItem('@recaply:auth_token');
  return !!token;
}

/**
 * Transcribe audio file
 */
export async function transcribeAudio(audioUri: string): Promise<TranscriptionResponse> {
  const formData = new FormData();
  formData.append('audio', {
    uri: audioUri,
    type: 'audio/mpeg',
    name: 'recording.m4a',
  } as any);

  const response = await api.post('/audio/transcribe', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
}

/**
 * Generate summary from transcript
 */
export async function generateSummary(transcript: string): Promise<SummaryResponse> {
  const response = await api.post('/audio/summarize', { transcript });
  return response.data;
}

/**
 * Process audio (transcribe + summarize)
 */
export async function processAudio(audioUri: string): Promise<{
  transcript: string;
  summary: SummaryResponse;
  minutesUsed: number;
}> {
  const formData = new FormData();
  formData.append('audio', {
    uri: audioUri,
    type: 'audio/mpeg',
    name: 'recording.m4a',
  } as any);

  const response = await api.post('/audio/process', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
}

/**
 * Get user usage stats
 */
export async function getUserUsage(): Promise<UsageResponse> {
  const response = await api.get('/user/usage');
  return response.data;
}

/**
 * Create Stripe checkout session
 */
export async function createCheckoutSession(plan: 'lite' | 'pro'): Promise<{
  sessionId: string;
  url: string;
}> {
  const response = await api.post('/subscription/create-checkout', { plan });
  return response.data;
}

export default api;
