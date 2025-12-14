import express, { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { createUser, getUserByEmail } from '../services/supabase';

const router: Router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if user exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await createUser(email, passwordHash);

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscription_tier,
        minutesLimit: user.minutes_limit,
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Login existing user
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Get user
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscription_tier,
        minutesUsed: user.minutes_used,
        minutesLimit: user.minutes_limit,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/google
 * Authenticate with Google Sign-In
 */
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    console.log('=== Google Sign-In Request ===');
    console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID);
    console.log('Token received:', idToken ? `Yes (length: ${idToken.length})` : 'No');

    if (!idToken) {
      console.log('ERROR: No idToken provided');
      return res.status(400).json({ error: 'Google ID token required' });
    }

    // Verify Google ID token
    console.log('Attempting to verify token with Google...');
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    console.log('✓ Token verified successfully');
    console.log('Email:', payload?.email);
    console.log('Name:', payload?.name);
    
    if (!payload || !payload.email) {
      console.log('ERROR: No payload or email in token');
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const email = payload.email;

    // Check if user exists
    let user = await getUserByEmail(email);

    // If user doesn't exist, create new user
    if (!user) {
      // Generate a random password hash for Google sign-in users
      const randomPassword = Math.random().toString(36).slice(-12);
      const passwordHash = await bcrypt.hash(randomPassword, 10);
      user = await createUser(email, passwordHash);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscription_tier,
        minutesUsed: user.minutes_used,
        minutesLimit: user.minutes_limit,
      },
    });
  } catch (error: any) {
    console.error('Google sign-in error:', error);
    res.status(500).json({ error: 'Google sign-in failed' });
  }
});

export default router;
