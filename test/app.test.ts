import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { app } from '../src/app.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { HttpError } from '../src/utils/http-error.js';

function listen(a: express.Express): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = a.listen(0, () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
  });
}

describe('app (no database needed)', () => {
  let server: Server;
  let url: string;
  beforeAll(async () => ({ server, url } = await listen(app)));
  afterAll(() => server.close());

  it('GET /health returns ok', async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('unknown route returns 404 JSON', async () => {
    const res = await fetch(`${url}/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Route GET /nope not found' });
  });

  it('invalid id is rejected with 400 before touching the DB', async () => {
    const res = await fetch(`${url}/api/tags/abc`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid id' });
  });

  it('missing required fields returns 400', async () => {
    const res = await fetch(`${url}/api/tags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing required fields: name' });
  });
});

describe('errorHandler', () => {
  const errors: Record<string, unknown> = {
    http: new HttpError(418, 'teapot'),
    unique: { code: '23505' },
    fk: { cause: { code: '23503' } },
    other: new Error('boom'),
  };
  let server: Server;
  let url: string;

  beforeAll(async () => {
    const a = express();
    a.get('/:kind', (req) => {
      throw errors[req.params.kind as string];
    });
    a.use(errorHandler);
    ({ server, url } = await listen(a));
  });
  afterAll(() => server.close());

  const cases: [string, number, string][] = [
    ['http', 418, 'teapot'],
    ['unique', 409, 'Resource already exists'],
    ['fk', 400, 'Referenced resource does not exist'],
    ['other', 500, 'Internal server error'],
  ];
  for (const [kind, status, error] of cases) {
    it(`maps ${kind} error to ${status}`, async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await fetch(`${url}/${kind}`);
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error });
      spy.mockRestore();
    });
  }
});
