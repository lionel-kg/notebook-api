import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Ressource introuvable' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? 'Données invalides', issues: err.issues });
    return;
  }
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Photo trop lourde (10 Mo max)' : 'Envoi de fichier invalide';
    res.status(400).json({ error: msg });
    return;
  }
  if (typeof err === 'object' && err && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'Album trop volumineux' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
}
