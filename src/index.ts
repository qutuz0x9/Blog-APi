import 'dotenv/config';
import { app } from './app.js';
import { db } from './prisma/db.js';
import { logger } from './utils/logger.js';

const PORT = Number(process.env['PORT']) || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});

// Close HTTP server and DB connections on Ctrl+C / docker stop
async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
