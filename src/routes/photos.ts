import { Router } from 'express';
import path from 'node:path';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { HttpError } from '../middleware/error.js';

export const photosRouter = Router();

/** Sert une photo à tout le monde : les albums sont publics. */
photosRouter.get('/:id', async (req, res) => {
  const photo = await prisma.photo.findUnique({ where: { id: req.params.id } });
  if (!photo) throw new HttpError(404, 'Photo introuvable');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type(photo.mimeType);
  res.sendFile(path.join(config.uploadDir, photo.filename), { dotfiles: 'deny' });
});
