import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface User {
  id: string;
  email: string;
  password_hash: string;
  subscription_tier: 'free' | 'lite' | 'pro';
  minutes_used: number;
  minutes_limit: number;
  created_at: Date;
}

export interface UsageRecord {
  id: string;
  user_id: string;
  minutes_used: number;
  action_type: 'transcription' | 'summary';
  created_at: Date;
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

/**
 * Create new user
 */
export async function createUser(
  email: string,
  passwordHash: string
): Promise<User> {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, subscription_tier, minutes_used, minutes_limit) 
     VALUES ($1, $2, 'free', 0, $3) 
     RETURNING *`,
    [email, passwordHash, parseInt(process.env.FREE_TIER_MINUTES || '30')]
  );
  return result.rows[0];
}

/**
 * Update user subscription
 */
export async function updateUserSubscription(
  userId: string,
  tier: 'free' | 'lite' | 'pro',
  minutesLimit: number
): Promise<void> {
  await pool.query(
    'UPDATE users SET subscription_tier = $1, minutes_limit = $2 WHERE id = $3',
    [tier, minutesLimit, userId]
  );
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
  
  return (user.minutes_used + minutesNeeded) <= user.minutes_limit;
}

/**
 * Deduct minutes from user
 */
export async function deductMinutes(
  userId: string,
  minutes: number,
  actionType: 'transcription' | 'summary'
): Promise<void> {
  await pool.query(
    'UPDATE users SET minutes_used = minutes_used + $1 WHERE id = $2',
    [minutes, userId]
  );

  // Record usage
  await pool.query(
    'INSERT INTO usage_records (user_id, minutes_used, action_type) VALUES ($1, $2, $3)',
    [userId, minutes, actionType]
  );
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
 * Reset monthly usage (called by cron job)
 */
export async function resetMonthlyUsage(): Promise<void> {
  await pool.query('UPDATE users SET minutes_used = 0');
}

export default pool;
