import express, { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserUsage, getUserById } from '../services/supabase';
import supabase from '../services/supabase';

const router: Router = express.Router();

/**
 * GET /api/user/me
 * Get current user info
 */
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const user = await getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscription_tier,
        minutesUsed: user.minutes_used,
        minutesLimit: user.minutes_limit,
      },
    });
  } catch (error: any) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

/**
 * GET /api/user/usage
 * Get user's usage stats
 */
router.get('/usage', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const usage = await getUserUsage(userId);

    if (!usage) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(usage);
  } catch (error: any) {
    console.error('Usage fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

/**
 * POST /api/user/set-usage
 * Manually set user's minutes used (for testing)
 */
router.post('/set-usage', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { minutesUsed } = req.body;

    if (typeof minutesUsed !== 'number' || minutesUsed < 0) {
      return res.status(400).json({ error: 'Invalid minutesUsed value' });
    }

    const { error } = await supabase
      .from('users')
      .update({ minutes_used: minutesUsed })
      .eq('id', userId);

    if (error) {
      throw error;
    }

    const user = await getUserById(userId);
    res.json({
      success: true,
      message: `Minutes set to ${minutesUsed}`,
      user: {
        id: user!.id,
        email: user!.email,
        subscriptionTier: user!.subscription_tier,
        minutesUsed: user!.minutes_used,
        minutesLimit: user!.minutes_limit,
      },
    });
  } catch (error: any) {
    console.error('Error setting usage:', error);
    res.status(500).json({ error: 'Failed to set usage' });
  }
});

export default router;
