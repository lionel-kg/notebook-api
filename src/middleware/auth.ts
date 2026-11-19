import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from './error.js';

export interface SessionPayload {
  sub: string;
  username: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; username: string };
    }
  }
}

export function signSession(user: { id: string; username: string }): string {
  return jwt.sign({ username: user.username } satisfies Omit<SessionPayload, 'sub'>, config.jwtSecret, {
    subject: user.id,
    expiresIn: `${config.sessionDays}d`,
    algorithm: 'HS256',
  });
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.sessionCookie, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.sessionCookie, { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/' });
}

/** Exige une session valide (cookie httpOnly). */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token: string | undefined = req.cookies?.[config.sessionCookie];
  if (!token) throw new HttpError(401, 'Non connecté');
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload & SessionPayload;
    if (!payload.sub) throw new Error('no sub');
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    throw new HttpError(401, 'Session expirée, reconnecte-toi');
  }
}
