import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { store } from '../db/store.js';
import { generateToken, AuthenticatedRequest, authenticate } from '../middleware/auth.js';
import { EmailService } from '../services/emailService.js';
import { User } from '../../src/types.js';

const router = Router();

// Register User (Sends OTP)
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Name, email, and password are required.' }
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = store.getUserByEmail(normalizedEmail);

    if (existing) {
      res.status(400).json({
        success: false,
        error: { code: 'USER_EXISTS', message: 'An account with this email address already exists.' }
      });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser: User = {
      id: `USR-${Date.now()}`,
      email: normalizedEmail,
      name: name.trim(),
      isEmailVerified: false,
      isGuest: false,
      createdAt: new Date().toISOString()
    };

    store.createUser(newUser, passwordHash);

    // Generate and send real OTP
    const otpRes = await EmailService.sendOTP(normalizedEmail);

    res.status(201).json({
      success: true,
      user: newUser,
      requiresOtp: true,
      message: otpRes.message,
      previewOtp: otpRes.previewOtp
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message || 'Registration failed' }
    });
  }
});

// Send / Resend OTP
router.post('/send-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Email is required.' }
      });
      return;
    }

    const result = await EmailService.sendOTP(email);
    res.json({ success: true, message: result.message, previewOtp: result.previewOtp });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'OTP_SEND_FAILED', message: err.message || 'Failed to send OTP' }
    });
  }
});

// Verify OTP
router.post('/verify-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Email and OTP code are required.' }
      });
      return;
    }

    const result = EmailService.verifyOTP(email, otp);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_OTP', message: result.message }
      });
      return;
    }

    const user = store.getUserByEmail(email);
    if (user) {
      store.updateUser(user.id, { isEmailVerified: true });
      user.isEmailVerified = true;
      const token = generateToken(user);
      res.json({
        success: true,
        message: 'Email successfully verified!',
        user,
        token
      });
      return;
    }

    res.json({ success: true, message: result.message });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message || 'OTP verification failed' }
    });
  }
});

// Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Email and password are required.' }
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = store.getUserByEmail(normalizedEmail);
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' }
      });
      return;
    }

    const hash = store.getUserPasswordHash(user.id);
    if (!hash) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Credential record not found.' }
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, hash);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' }
      });
      return;
    }

    const token = generateToken(user);
    res.json({ success: true, user, token });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message || 'Login failed' }
    });
  }
});

// Guest Login (Demarcated Guest Account)
router.post('/guest', async (_req: Request, res: Response): Promise<void> => {
  try {
    let guestUser = store.getUserByEmail('guest.demo@databasereviewer.ai');
    if (!guestUser) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('GuestDemo2026Pass!', salt);
      guestUser = {
        id: 'USR-GUEST-001',
        email: 'guest.demo@databasereviewer.ai',
        name: 'Guest Scholar (Demo User)',
        isEmailVerified: true,
        isGuest: true,
        createdAt: new Date().toISOString()
      };
      store.createUser(guestUser, hash);
    }

    const token = generateToken(guestUser);
    res.json({ success: true, user: guestUser, token });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message || 'Guest login failed' }
    });
  }
});

// Get Current User Profile
router.get('/me', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  res.json({ success: true, user: req.user });
});

export default router;
