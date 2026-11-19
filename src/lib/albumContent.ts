import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

/* ------------------------------------------------------------------ */
/* Forme des données échangées avec le client                          */
/* ------------------------------------------------------------------ */

export const BG_IDS = ['creme', 'kraft', 'blanc', 'quadrille', 'ligne', 'toile'] as const;
export const STICKER_KINDS = ['heart', 'plane', 'sun', 'star', 'camera', 'flower', 'post', 'love', 'tag', 'tape'] as const;

const key = z.string().min(1).max(64);
const num = z.number().finite();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide');

const point = z.object({ x: num, y: num });
const stroke = z.object({
  id: key,
  color,
  size: z.number().min(1).max(60),
  pts: z.array(point).min(1).max(5000),
});

const base = { id: key, x: num, y: num, w: z.number().min(1).max(5000), r: num };

const item = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('photo'), h: z.number().min(1).max(5000), photoId: z.string().min(1).max(64), frame: z.boolean() }),
  z.object({ ...base, type: z.literal('sticker'), h: z.number().min(1).max(5000), kind: z.enum(STICKER_KINDS) }),
  z.object({
    ...base,
    type: z.literal('text'),
    text: z.string().max(2000),
    fs: z.number().min(4).max(600),
    color,
    font: z.enum(['hand', 'serif']),
  }),
]);

const page = z.object({
  id: key,
  bg: z.enum(BG_IDS),
  items: z.array(item).max(300),
  strokes: z.array(stroke).max(5000),
});

export const pagesSchema = z.array(page).min(2, "L'album doit garder sa couverture et son dos").max(200);

export type ClientItem = z.infer<typeof item>;
export type ClientPage = z.infer<typeof page>;

/* ------------------------------------------------------------------ */
/* Conversion base de données <-> client                               */
/* ------------------------------------------------------------------ */

type DbPage = Prisma.PageGetPayload<{ include: { items: true } }>;

export function toClientPages(pages: DbPage[]): ClientPage[] {
  return pages
    .sort((a, b) => a.position - b.position)
    .map((p) => ({
      id: p.key,
      bg: p.bg as ClientPage['bg'],
      strokes: (p.strokes ?? []) as ClientPage['strokes'],
      items: p.items
        .sort((a, b) => a.position - b.position)
        .map((it): ClientItem | null => {
          const common = { id: it.key, x: it.x, y: it.y, w: it.w, r: it.r };
          if (it.type === 'photo') {
            if (!it.photoId) return null; // photo supprimée
            return { ...common, type: 'photo', h: it.h ?? it.w, photoId: it.photoId, frame: it.frame ?? true };
          }
          if (it.type === 'sticker') {
            return { ...common, type: 'sticker', h: it.h ?? it.w, kind: it.kind as (typeof STICKER_KINDS)[number] };
          }
          return {
            ...common,
            type: 'text',
            text: it.text ?? '',
            fs: it.fs ?? 40,
            color: it.color ?? '#2b2b2b',
            font: (it.font as 'hand' | 'serif') ?? 'hand',
          };
        })
        .filter((x): x is ClientItem => x !== null),
    }));
}

export function toDbItems(items: ClientItem[]): Prisma.ItemCreateWithoutPageInput[] {
  return items.map((it, position) => {
    const common = { key: it.id, position, type: it.type, x: it.x, y: it.y, w: it.w, r: it.r };
    switch (it.type) {
      case 'photo':
        return { ...common, h: it.h, frame: it.frame, photo: { connect: { id: it.photoId } } };
      case 'sticker':
        return { ...common, h: it.h, kind: it.kind };
      case 'text':
        return { ...common, text: it.text, fs: it.fs, color: it.color, font: it.font };
    }
  });
}

/* ------------------------------------------------------------------ */
/* Contenu d'un nouvel album (même maquette que le design)             */
/* ------------------------------------------------------------------ */

const uid = () => 'i' + randomUUID().replace(/-/g, '').slice(0, 12);

export function defaultPages(title: string, subtitle: string, author: string): ClientPage[] {
  const blank = (): ClientPage => ({ id: uid(), bg: 'creme', items: [], strokes: [] });
  const cover: ClientPage = {
    id: uid(),
    bg: 'toile',
    strokes: [],
    items: [
      {
        id: uid(),
        type: 'text',
        text: title,
        x: 20,
        y: 180,
        w: 420,
        // Taille adaptée pour que le titre tienne sur une ligne au-dessus du sous-titre.
        fs: Math.max(30, Math.min(66, Math.floor(780 / Math.max(1, title.length)))),
        r: -3,
        color: '#e9c98a',
        font: 'serif',
      },
      ...(subtitle
        ? [{ id: uid(), type: 'text' as const, text: subtitle, x: 80, y: 290, w: 300, fs: 46, r: 0, color: '#f6efe2', font: 'hand' as const }]
        : []),
      { id: uid(), type: 'sticker', kind: 'heart', x: 196, y: 400, w: 68, h: 68, r: -8 },
    ],
  };
  const back: ClientPage = {
    id: uid(),
    bg: 'toile',
    strokes: [],
    items: [{ id: uid(), type: 'text', text: `Fait main par\n${author}`, x: 60, y: 250, w: 340, fs: 38, r: 0, color: '#e9c98a', font: 'hand' }],
  };
  return [cover, blank(), blank(), blank(), blank(), back];
}
