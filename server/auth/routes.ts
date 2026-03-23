import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import passport from './passport';
import { getDb } from '../db';
import { users } from '../../drizzle/schema';
import { initializePrePopulatedChores } from '../db-helpers';

const router = Router();

// ============= EMAIL/PASSWORD AUTH =============

// Register with email and password
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    // Check if user already exists
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.insert(users).values({
      email,
      name,
      passwordHash,
      loginMethod: 'email',
      role: 'user',
      lastSignedIn: new Date(),
    });

    const newUserId = Number((result as any).insertId || (result as any)[0]?.insertId);
    const newUser = await db.select().from(users).where(eq(users.id, newUserId)).limit(1);

    // Seed prepopulated chores for the new user
    try {
      await initializePrePopulatedChores(newUserId);
    } catch (e) {
      console.warn('Failed to initialize prepopulated chores:', e);
    }

    // Log the user in via session
    req.login(newUser[0], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to establish session' });
      }
      return res.json({ success: true, user: newUser[0] });
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// Login with email and password
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    // Find user by email
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = result[0];

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last signed in
    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

    // Log the user in via session
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to establish session' });
      }
      return res.json({ success: true, user });
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ============= GOOGLE OAUTH =============

// Initiate Google OAuth flow
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=auth_failed' }),
  (req, res) => {
    // Successful authentication
    res.redirect('/');
  }
);

// Logout route
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Get current user
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.json({ user: null });
  }
});

export default router;
