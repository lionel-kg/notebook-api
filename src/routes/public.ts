import { Router } from 'express';
import { prisma } from '../prisma.js';
import { HttpError } from '../middleware/error.js';
import { toClientPages } from '../lib/albumContent.js';

/** Lecture sans connexion : tous les albums sont publics (la modification demande d'être connecté). */
export const publicRouter = Router();

publicRouter.get('/albums', async (_req, res) => {
  const albums = await prisma.album.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: {
      id: true,
      title: true,
      subtitle: true,
      deskColor: true,
      updatedAt: true,
      owner: { select: { username: true } },
      _count: { select: { pages: true, photos: true } },
    },
  });
  res.json({
    albums: albums.map(({ _count, owner, ...a }) => ({
      ...a,
      owner: owner.username,
      pageCount: _count.pages,
      photoCount: _count.photos,
    })),
  });
});

publicRouter.get('/albums/:id', async (req, res) => {
  const album = await prisma.album.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      title: true,
      subtitle: true,
      deskColor: true,
      updatedAt: true,
      ownerId: true,
      owner: { select: { username: true } },
    },
  });
  if (!album) throw new HttpError(404, 'Album introuvable');
  const pages = await prisma.page.findMany({ where: { albumId: album.id }, include: { items: true } });
  const { ownerId, owner, ...meta } = album;
  res.json({
    album: { ...meta, owner: owner.username },
    pages: toClientPages(pages),
    // Toute personne connectée peut modifier ; seul l'auteur peut supprimer l'album.
    canEdit: !!req.user,
    isOwner: req.user?.id === ownerId,
  });
});
