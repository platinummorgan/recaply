import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables first (only needed for local development)
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Validate required environment variables
if (!supabaseUrl) {
  throw new Error('SUPABASE_URL environment variable is required');
}
if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_KEY environment variable is required');
}

console.log('Initializing Supabase client...');
console.log('SUPABASE_URL:', supabaseUrl.substring(0, 30) + '...');
console.log('SUPABASE_SERVICE_KEY:', supabaseServiceKey.substring(0, 30) + '...');

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey);

export interface User {
  id: string;
  email: string;
  password_hash: string;
  subscription_tier: 'free' | 'lite' | 'pro';
  minutes_used: number;
  minutes_limit: number;
  created_at: string;
}

export interface UsageRecord {
  id: string;
  user_id: string;
  minutes_used: number;
  action_type: 'transcription' | 'summary';
  created_at: string;
}

export interface Recording {
  id: string;
  user_id?: string;
  filename: string;
  transcript: string;
  summary_json?: any;
  duration_minutes?: number;
  duration_seconds?: number;
  file_size?: number;
  audio_url?: string;
  created_at: string;
}

/**
 * Upload audio file to Supabase Storage
 */
export async function uploadAudioFile(
  audioBuffer: Buffer,
  filename: string,
  userId: string
): Promise<string> {
  const bucket = 'recordings';
  const filepath = `${userId}/${Date.now()}_${filename}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filepath, audioBuffer, {
      contentType: 'audio/m4a',
      cacheControl: '3600',
    });

  if (error) {
    console.error('Error uploading audio:', error);
    throw new Error('Failed to upload audio file');
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(filepath);

  return urlData.publicUrl;
}

/**
 * Save a recording
 */
export async function saveRecording(
  filename: string,
  transcription: string,
  fileSize?: number,
  userId?: string,
  audioUrl?: string
): Promise<Recording> {
  const insertData: any = {
    filename,
    transcript: transcription,
  };

  // Add optional fields
  if (fileSize) {
    insertData.file_size = fileSize;
  }
  if (userId) {
    insertData.user_id = userId;
  }
  if (audioUrl) {
    insertData.audio_url = audioUrl;
  }

  const { data, error } = await supabase
    .from('recordings')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Error saving recording:', error);
    throw new Error('Failed to save recording');
  }

  return data;
}

/**
 * Update recording with summary
 */
export async function updateRecordingSummary(
  recordingId: string,
  summary: string,
  actionItems: string[],
  keyPoints: string[]
): Promise<void> {
  const summaryData = {
    summary,
    actionItems,
    keyPoints,
  };

  const { error } = await supabase
    .from('recordings')
    .update({
      summary_json: summaryData,
    })
    .eq('id', recordingId);

  if (error) {
    console.error('Error updating recording:', error);
    throw new Error('Failed to update recording');
  }
}

/**
 * Get all recordings (most recent first)
 */
export async function getRecordings(limit: number = 50): Promise<Recording[]> {
  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recordings:', error);
    return [];
  }

  return data || [];
}

/**
 * Get recordings for a specific user
 */
export async function getUserRecordings(userId: string, limit: number = 50): Promise<Recording[]> {
  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching user recordings:', error);
    return [];
  }

  return data || [];
}

/**
 * Get a single recording by ID
 */
export async function getRecording(recordingId: string): Promise<Recording | null> {
  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .eq('id', recordingId)
    .single();

  if (error) {
    console.error('Error fetching recording:', error);
    return null;
  }

  return data;
}

/**
 * Delete a recording by ID
 */
export async function deleteRecording(recordingId: string): Promise<void> {
  const { error } = await supabase
    .from('recordings')
    .delete()
    .eq('id', recordingId);

  if (error) {
    console.error('Error deleting recording:', error);
    throw new Error('Failed to delete recording');
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user:', error);
    return null;
  }

  return data;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    console.error('Error fetching user:', error);
  }

  return data || null;
}

/**
 * Create new user
 */
export async function createUser(
  email: string,
  passwordHash: string
): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      email,
      password_hash: passwordHash,
      subscription_tier: 'free',
      minutes_used: 0,
      minutes_limit: parseInt(process.env.FREE_TIER_MINUTES || '30'),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating user:', error);
    throw new Error('Failed to create user');
  }

  return data;
}

/**
 * Update user subscription
 */
export async function updateUserSubscription(
  userId: string,
  tier: 'free' | 'lite' | 'pro',
  minutesLimit: number
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      subscription_tier: tier,
      minutes_limit: minutesLimit,
    })
    .eq('id', userId);

  if (error) {
    console.error('Error updating subscription:', error);
    throw new Error('Failed to update subscription');
  }
}

/**
 * Check if user has available minutes
 */
export async function hasAvailableMinutes(
  userId: string,
  minutesNeeded: number
): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user) return false;

  if (user.subscription_tier === 'pro') return true; // Unlimited

  // Allow using all available minutes (even if request is slightly over)
  // This prevents edge cases where you have 1 minute left but recording is 1.05 minutes
  const remainingMinutes = user.minutes_limit - user.minutes_used;
  
  // If they have any minutes remaining, allow the upload
  // The deductMinutes function will cap it at the limit
  return remainingMinutes > 0;
}

/**
 * Deduct minutes from user
 */
export async function deductMinutes(
  userId: string,
  minutes: number,
  actionType: 'transcription' | 'summary'
): Promise<void> {
  // Get current usage
  const user = await getUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // For non-pro users, cap at their limit (don't let them go over)
  let minutesToDeduct = minutes;
  if (user.subscription_tier !== 'pro') {
    const remainingMinutes = user.minutes_limit - user.minutes_used;
    minutesToDeduct = Math.min(minutes, remainingMinutes);
  }

  const newMinutesUsed = (user.minutes_used || 0) + minutesToDeduct;

  // Update user minutes
  const { error: updateError } = await supabase
    .from('users')
    .update({ minutes_used: newMinutesUsed })
    .eq('id', userId);

  if (updateError) {
    console.error('Error updating minutes:', updateError);
  }

  // Record usage (record the actual minutes, not capped)
  const { error: insertError } = await supabase
    .from('usage_records')
    .insert({
      user_id: userId,
      minutes_used: minutesToDeduct,
      action_type: actionType,
    });

  if (insertError) {
    console.error('Error recording usage:', insertError);
  }
}

/**
 * Get user usage stats
 */
export async function getUserUsage(userId: string) {
  const user = await getUserById(userId);
  if (!user) return null;

  return {
    minutesUsed: user.minutes_used,
    minutesLimit: user.minutes_limit,
    minutesRemaining: user.subscription_tier === 'pro'
      ? 'unlimited'
      : user.minutes_limit - user.minutes_used,
    subscriptionTier: user.subscription_tier,
  };
}

/**
 * Reset monthly usage (call this monthly via cron)
 */
export async function resetMonthlyUsage(): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ minutes_used: 0 })
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all

  if (error) {
    console.error('Error resetting usage:', error);
  }
}

export default supabase;
