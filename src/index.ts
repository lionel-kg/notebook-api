import fs from 'node:fs';
import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './prisma.js';

fs.mkdirSync(config.uploadDir, { recursive: true });

const server = createApp().listen(config.port, () => {
  console.log(`API prête sur http://localhost:${config.port}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
