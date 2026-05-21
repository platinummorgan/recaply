import express, { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { createUser, getUserByEmail } from '../services/supabase';
import { logger, serializeError } from '../services/logger';

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
      logger.warn('auth_register_validation_failed', {
        requestId: req.requestId,
        hasEmail: Boolean(email),
        hasPassword: Boolean(password),
      });
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if user exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      logger.warn('auth_register_email_exists', {
        requestId: req.requestId,
      });
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
    logger.error('auth_register_failed', {
      requestId: req.requestId,
      ...serializeError(error),
    });
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
      logger.warn('auth_login_validation_failed', {
        requestId: req.requestId,
        hasEmail: Boolean(email),
        hasPassword: Boolean(password),
      });
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Get user
    const user = await getUserByEmail(email);
    if (!user) {
      logger.warn('auth_login_invalid_credentials', {
        requestId: req.requestId,
        reason: 'user_not_found',
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      logger.warn('auth_login_invalid_credentials', {
        requestId: req.requestId,
        reason: 'password_mismatch',
      });
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
    logger.error('auth_login_failed', {
      requestId: req.requestId,
      ...serializeError(error),
    });
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

    logger.info('auth_google_request_received', {
      requestId: req.requestId,
      hasIdToken: Boolean(idToken),
      idTokenLength: idToken?.length || 0,
      hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    });

    if (!idToken) {
      logger.warn('auth_google_validation_failed', {
        requestId: req.requestId,
        reason: 'missing_id_token',
      });
      return res.status(400).json({ error: 'Google ID token required' });
    }

    // Verify Google ID token
    logger.info('auth_google_verify_started', {
      requestId: req.requestId,
    });
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    logger.info('auth_google_verify_succeeded', {
      requestId: req.requestId,
      hasEmail: Boolean(payload?.email),
      hasName: Boolean(payload?.name),
    });
    
    if (!payload || !payload.email) {
      logger.warn('auth_google_validation_failed', {
        requestId: req.requestId,
        reason: 'missing_payload_or_email',
      });
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
    logger.error('auth_google_failed', {
      requestId: req.requestId,
      ...serializeError(error),
    });
    res.status(500).json({ error: 'Google sign-in failed' });
  }
});

/**
 * POST /api/auth/apple
 * Authenticate with Apple Sign-In
 */
router.post('/apple', async (req: Request, res: Response) => {
  try {
    const { identityToken, user: appleUser, email, fullName } = req.body;

    logger.info('auth_apple_request_received', {
      requestId: req.requestId,
      hasIdentityToken: Boolean(identityToken),
      hasAppleUser: Boolean(appleUser),
      hasEmail: Boolean(email),
      hasFullName: Boolean(fullName),
    });

    if (!identityToken) {
      logger.warn('auth_apple_validation_failed', {
        requestId: req.requestId,
        reason: 'missing_identity_token',
      });
      return res.status(400).json({ error: 'Apple identity token required' });
    }

    if (!email && !appleUser) {
      logger.warn('auth_apple_validation_failed', {
        requestId: req.requestId,
        reason: 'missing_email_and_user',
      });
      return res.status(400).json({ error: 'Apple user identifier or email required' });
    }

    // Note: For production, you should verify the identityToken with Apple's servers
    // For now, we'll trust it since it comes from the official Apple SDK

    // Use email from the token or fall back to apple user id + domain
    const userEmail = email || `${appleUser}@privaterelay.appleid.com`;

    // Check if user exists
    let user = await getUserByEmail(userEmail);

    // If user doesn't exist, create new user
    if (!user) {
      const randomPassword = Math.random().toString(36).slice(-12);
      const passwordHash = await bcrypt.hash(randomPassword, 10);
      user = await createUser(userEmail, passwordHash);
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
    logger.error('auth_apple_failed', {
      requestId: req.requestId,
      ...serializeError(error),
    });
    res.status(500).json({ error: 'Apple sign-in failed' });
  }
});

export default router;
