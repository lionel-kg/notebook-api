import "dotenv/config";
import path from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET doit faire au moins 32 caractères.");
}

export const config = {
  port: Number(process.env.PORT ?? 4001),
  jwtSecret,
  clientOrigin: process.env.CLIENT_ORIGIN ?? "https://notebook.lionelkg.com",
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? "./uploads"),
  isProd: process.env.NODE_ENV === "production",
  /** Nombre de proxies devant l'API (pour lire la vraie IP du client, utilisée par le rate-limit). */
  trustProxy: Number(process.env.TRUST_PROXY ?? 1),
  sessionCookie: "tb_session",
  sessionDays: 7,
};
