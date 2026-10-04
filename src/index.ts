import 'dotenv/config';
import { app } from './app';
import { db } from './prisma/db';

const PORT = Number(process.env['PORT']) || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Close HTTP server and DB connections on Ctrl+C / docker stop
async function shutdown() {
  server.close();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
