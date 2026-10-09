import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../utils/http-error.js';

// PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = e?.cause?.code ?? e?.code;
  return typeof code === 'string' ? code : undefined;
}

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  const code = pgCode(err);
  if (code === PG_UNIQUE_VIOLATION) {
    res.status(409).json({ error: 'Resource already exists' });
    return;
  }
  if (code === PG_FOREIGN_KEY_VIOLATION) {
    res.status(400).json({ error: 'Referenced resource does not exist' });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
