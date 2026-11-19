import 'dotenv/config';
import path from 'node:path';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET doit faire au moins 32 caractères.');
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret,
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? './uploads'),
  isProd: process.env.NODE_ENV === 'production',
  sessionCookie: 'tb_session',
  sessionDays: 7,
};
