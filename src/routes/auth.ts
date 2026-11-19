import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { HttpError } from '../middleware/error.js';
import { clearSessionCookie, requireAuth, setSessionCookie, signSession } from '../middleware/auth.js';

const BCRYPT_ROUNDS = 12;
// Hash factice pour garder un temps de réponse constant quand l'utilisateur n'existe pas.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-placeholder', BCRYPT_ROUNDS);

const credentials = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Le nom d'utilisateur doit faire au moins 3 caractères")
    .max(32, "Le nom d'utilisateur doit faire au plus 32 caractères")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Le nom d'utilisateur ne peut contenir que lettres, chiffres, _ . -"),
  password: z
    .string()
    .min(8, 'Le mot de passe doit faire au moins 8 caractères')
    .max(128, 'Le mot de passe doit faire au plus 128 caractères'),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessaie dans quelques minutes' },
});

export const authRouter = Router();

authRouter.post('/register', authLimiter, async (req, res) => {
  const { username, password } = credentials.parse(req.body);
  const normalized = username.toLowerCase();
  const exists = await prisma.user.findUnique({ where: { username: normalized } });
  if (exists) throw new HttpError(409, "Ce nom d'utilisateur est déjà pris");

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({ data: { username: normalized, passwordHash } });

  setSessionCookie(res, signSession(user));
  res.status(201).json({ user: { id: user.id, username: user.username } });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(128) }).safeParse(req.body);
  if (!body.success) throw new HttpError(400, "Nom d'utilisateur et mot de passe requis");

  const user = await prisma.user.findUnique({ where: { username: body.data.username.toLowerCase() } });
  const ok = await bcrypt.compare(body.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, "Nom d'utilisateur ou mot de passe incorrect");

  setSessionCookie(res, signSession(user));
  res.json({ user: { id: user.id, username: user.username } });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, username: true } });
  if (!user) {
    clearSessionCookie(res);
    throw new HttpError(401, 'Compte introuvable');
  }
  res.json({ user });
});
