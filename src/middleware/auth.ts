import type { NextFunction, Request, Response } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySessionToken } from '../lib/crypto.ts';
import {
  type DbUser,
  getOrCreateFirebaseUser,
  getUserByUid,
} from '../db/repository.ts';

export interface AuthRequest extends Request {
  dbUser?: DbUser;
}

async function resolveUserFromToken(token: string): Promise<DbUser | null> {
  if (token.startsWith('qd.')) {
    const payload = verifySessionToken(token);
    if (!payload) return null;
    return await getUserByUid(payload.uid);
  }

  const decoded = await adminAuth.verifyIdToken(token);
  const email = decoded.email || `${decoded.uid}@firebase.local`;
  return await getOrCreateFirebaseUser(
    decoded.uid,
    email,
    decoded.name,
    decoded.picture
  );
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const dbUser = await resolveUserFromToken(token);
    if (!dbUser) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
    req.dbUser = dbUser;
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      const dbUser = await resolveUserFromToken(token);
      if (dbUser) req.dbUser = dbUser;
    } catch {
      // Ignore invalid optional auth
    }
  }
  next();
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.dbUser || req.dbUser.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  next();
};

export async function verifySocketToken(token: string): Promise<DbUser | null> {
  try {
    return await resolveUserFromToken(token);
  } catch {
    return null;
  }
}
