import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * Temps réel : chaque album est un « salon ». Les navigateurs qui ont l'album ouvert s'y abonnent
 * via /api/ws?album=<id> et reçoivent les changements enregistrés par les autres.
 * Canal en lecture seule : les modifications passent toujours par l'API HTTP (authentifiée).
 */

const PING_MS = 20_000; // < 30 s : délai d'inactivité du proxy Next.js
const MAX_CLIENTS = 2000;

type Client = WebSocket & { alive?: boolean; albumId?: string };
const rooms = new Map<string, Set<Client>>();
let total = 0;

function send(ws: WebSocket, data: string) {
  if (ws.readyState === WebSocket.OPEN) ws.send(data);
}

function broadcastRaw(albumId: string, data: string) {
  const room = rooms.get(albumId);
  if (room) for (const ws of room) send(ws, data);
}

function sendPresence(albumId: string) {
  broadcastRaw(albumId, JSON.stringify({ type: 'presence', count: rooms.get(albumId)?.size ?? 0 }));
}

export type RealtimeEvent =
  | { type: 'pages'; pages: unknown; by: string; clientId: string | null }
  | { type: 'deleted'; by: string };

/** Diffuse un évènement à toutes les personnes qui regardent cet album. */
export function broadcast(albumId: string, event: RealtimeEvent) {
  broadcastRaw(albumId, JSON.stringify(event));
}

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const albumId = url.searchParams.get('album') ?? '';
    if (url.pathname !== '/api/ws' || !/^[a-z0-9]{10,40}$/i.test(albumId) || total >= MAX_CLIENTS) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws: Client) => {
      ws.alive = true;
      ws.albumId = albumId;
      total++;
      let room = rooms.get(albumId);
      if (!room) rooms.set(albumId, (room = new Set()));
      room.add(ws);
      sendPresence(albumId);

      ws.on('pong', () => (ws.alive = true));
      // Les navigateurs n'envoient rien : tout message entrant est ignoré.
      ws.on('error', () => ws.terminate());
      ws.on('close', () => {
        total--;
        room.delete(ws);
        if (room.size === 0) rooms.delete(albumId);
        else sendPresence(albumId);
      });
    });
  });

  // Ping régulier : garde la connexion ouverte à travers les proxys et coupe les clients disparus.
  const timer = setInterval(() => {
    for (const ws of wss.clients as Set<Client>) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
  }, PING_MS);
  wss.on('close', () => clearInterval(timer));

  return wss;
}
