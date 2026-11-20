import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { broadcast } from '../realtime.js';
import { defaultPages, pagesSchema, toClientPages, toDbItems, type ClientPage } from '../lib/albumContent.js';

export const albumsRouter = Router();

const albumMeta = z.object({
  title: z.string().trim().min(1, 'Le titre est requis').max(80),
  subtitle: z.string().trim().max(80).default(''),
  deskColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

/** Vérifie que l'album appartient à l'utilisateur connecté (réservé à la suppression). */
async function ownedAlbum(albumId: string, userId: string) {
  const album = await prisma.album.findFirst({ where: { id: albumId, ownerId: userId } });
  if (!album) throw new HttpError(404, 'Album introuvable');
  return album;
}

/** Tout utilisateur connecté peut modifier n'importe quel album : on vérifie seulement qu'il existe. */
async function editableAlbum(albumId: string) {
  const album = await prisma.album.findUnique({ where: { id: albumId } });
  if (!album) throw new HttpError(404, 'Album introuvable');
  return album;
}

async function writePages(albumId: string, pages: ClientPage[]) {
  // Toutes les photos référencées doivent appartenir à cet album.
  const photoIds = [...new Set(pages.flatMap((p) => p.items.flatMap((it) => (it.type === 'photo' ? [it.photoId] : []))))];
  if (photoIds.length) {
    const count = await prisma.photo.count({ where: { albumId, id: { in: photoIds } } });
    if (count !== photoIds.length) throw new HttpError(400, 'Photo inconnue dans cet album');
  }
  const keys = new Set(pages.map((p) => p.id));
  if (keys.size !== pages.length) throw new HttpError(400, 'Identifiants de pages en double');

  await prisma.$transaction(
    async (tx) => {
      await tx.page.deleteMany({ where: { albumId } });
      for (const [position, p] of pages.entries()) {
        await tx.page.create({
          data: {
            albumId,
            key: p.id,
            position,
            bg: p.bg,
            strokes: p.strokes,
            items: { create: toDbItems(p.items) },
          },
        });
      }
      await tx.album.update({ where: { id: albumId }, data: { updatedAt: new Date() } });
    },
    { timeout: 30_000 },
  );
}

/* ---------------------------- Albums ---------------------------- */

albumsRouter.get('/', async (req, res) => {
  const albums = await prisma.album.findMany({
    where: { ownerId: req.user!.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      subtitle: true,
      deskColor: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { pages: true, photos: true } },
    },
  });
  res.json({
    albums: albums.map(({ _count, ...a }) => ({ ...a, pageCount: _count.pages, photoCount: _count.photos })),
  });
});

albumsRouter.post('/', async (req, res) => {
  const meta = albumMeta.parse(req.body);
  const album = await prisma.album.create({
    data: { ownerId: req.user!.id, title: meta.title, subtitle: meta.subtitle, deskColor: meta.deskColor },
  });
  await writePages(album.id, defaultPages(meta.title, meta.subtitle, req.user!.username));
  res.status(201).json({ album });
});

albumsRouter.get('/:id', async (req, res) => {
  const album = await editableAlbum(req.params.id);
  const pages = await prisma.page.findMany({ where: { albumId: album.id }, include: { items: true } });
  res.json({ album, pages: toClientPages(pages) });
});

albumsRouter.patch('/:id', async (req, res) => {
  await editableAlbum(req.params.id);
  const meta = albumMeta.partial().parse(req.body);
  const album = await prisma.album.update({ where: { id: req.params.id }, data: meta });
  res.json({ album });
});

albumsRouter.delete('/:id', async (req, res) => {
  const album = await ownedAlbum(req.params.id, req.user!.id);
  const photos = await prisma.photo.findMany({ where: { albumId: album.id }, select: { filename: true } });
  await prisma.album.delete({ where: { id: album.id } });
  await Promise.all(photos.map((p) => fs.rm(path.join(config.uploadDir, p.filename), { force: true })));
  broadcast(album.id, { type: 'deleted', by: req.user!.username });
  res.status(204).end();
});

/** Remplace tout le contenu (pages, éléments, dessins) — appelé par l'enregistrement automatique. */
albumsRouter.put('/:id/pages', async (req, res) => {
  const album = await editableAlbum(req.params.id);
  const pages = pagesSchema.parse(req.body?.pages);
  await writePages(album.id, pages);
  // Identifiant de l'onglet qui enregistre : il ignore sa propre diffusion.
  const header = req.get('x-client-id');
  const clientId = header && /^[\w-]{1,64}$/.test(header) ? header : null;
  broadcast(album.id, { type: 'pages', pages, by: req.user!.username, clientId });
  res.json({ ok: true, savedAt: new Date().toISOString() });
});

/* ---------------------------- Photos ---------------------------- */

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadDir),
    filename: (_req, file, cb) => cb(null, randomUUID() + (MIME_EXT[file.mimetype] ?? '')),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (MIME_EXT[file.mimetype]) cb(null, true);
    else cb(new HttpError(400, 'Format non pris en charge (JPEG, PNG, WebP ou GIF)'));
  },
});

albumsRouter.post('/:id/photos', async (req, res, next) => {
  try {
    await editableAlbum(req.params.id);
  } catch (e) {
    return next(e);
  }
  upload.single('photo')(req, res, async (err?: unknown) => {
    try {
      if (err) throw err;
      if (!req.file) throw new HttpError(400, 'Aucune photo reçue');
      const dims = z
        .object({ width: z.coerce.number().int().min(1).max(20000), height: z.coerce.number().int().min(1).max(20000) })
        .safeParse(req.body);
      if (!dims.success) {
        await fs.rm(req.file.path, { force: true });
        throw new HttpError(400, 'Dimensions de la photo manquantes');
      }
      const photo = await prisma.photo.create({
        data: {
          albumId: req.params.id,
          filename: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
          width: dims.data.width,
          height: dims.data.height,
        },
      });
      res.status(201).json({ photo: { id: photo.id, width: photo.width, height: photo.height } });
    } catch (e) {
      next(e);
    }
  });
});
