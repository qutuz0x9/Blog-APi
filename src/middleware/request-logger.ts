import type { RequestHandler } from 'express';
import { logger } from '../utils/logger.js';

// Logs one line per request when the response is sent, e.g.
// 2026-10-08T12:00:00.000Z [INFO] GET /api/posts 200 12.3ms
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`;
    if (res.statusCode >= 500) logger.error(message);
    else if (res.statusCode >= 400) logger.warn(message);
    else logger.info(message);
  });

  next();
};
