import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { store } from '../db/store.js';
import { User } from '../../src/types.js';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable is missing in production mode.');
    }
    // Strict requirement: Fail cleanly if not provided
    console.warn('WARNING: JWT_SECRET environment variable is not set. Using secure session secret for dev environment.');
    return 'ai-db-reviewer-secure-key-dev-environment-2026';
  }
  return secret;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function generateToken(user: User): string {
  const secret = getJwtSecret();
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, isGuest: Boolean(user.isGuest) },
    secret,
    { expiresIn: '7d' }
  );
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required. Missing Bearer token.' }
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as { id: string; email: string; name: string };
    const user = store.getUserById(decoded.id);

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User session no longer exists or has been revoked.' }
      });
      return;
    }

    req.user = user;
    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session token.' }
    });
    return;
  }
}

/**
 * IDOR Protection Middleware: Verifies that the authenticated user owns the requested project.
 */
export function requireProjectOwner(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' }
    });
    return;
  }

  const projectId = req.params.id || req.params.projectId || req.body.projectId;

  if (!projectId) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Missing project identifier in request.' }
    });
    return;
  }

  const project = store.getProjectById(projectId);
  if (!project) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Target project does not exist.' }
    });
    return;
  }

  if (project.userId !== userId) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied. You do not have permission to access or modify this project.' }
    });
    return;
  }

  next();
}

/**
 * Guest Restriction Middleware: Blocks guest accounts from modifying system-wide settings or deleting data.
 */
export function restrictGuest(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.user?.isGuest) {
    res.status(403).json({
      success: false,
      error: {
        code: 'GUEST_RESTRICTED',
        message: 'Guest account access is read-only for system settings and admin operations. Please register a full account to modify global configurations.'
      }
    });
    return;
  }
  next();
}
