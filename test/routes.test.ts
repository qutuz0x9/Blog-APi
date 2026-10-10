// Integration tests: hit the real routes against a real Postgres.
// Needs a throwaway database that already has the migrations applied:
//   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/test npm test
// Skipped when TEST_DATABASE_URL is unset, so it never touches your dev database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const TEST_DB = process.env['TEST_DATABASE_URL'];

const describeDb = TEST_DB ? describe : describe.skip;

describeDb('route handlers (database)', () => {
  let server: Server;
  let url: string;
  let close: () => Promise<void>;
  const run = Date.now().toString(36); // keeps unique columns from clashing between runs

  async function api(method: string, path: string, body?: unknown) {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  }

  beforeAll(async () => {
    process.env['DATABASE_URL'] = TEST_DB; // set before the app (and its db client) is imported
    const { app } = await import('../src/app.js');
    const { db } = await import('../src/prisma/db.js');
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = async () => {
      server.close();
      await db.close();
    };
  });
  afterAll(() => close());

  describe('users', () => {
    let id: number;

    it('POST creates a user with default role', async () => {
      const res = await api('POST', '/api/users', { email: `u-${run}@test.dev`, name: 'Alice' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Alice');
      expect(res.body.role).toBe('USER');
      id = res.body.id;
    });

    it('POST without required fields returns 400', async () => {
      const res = await api('POST', '/api/users', { name: 'No Email' });
      expect(res.status).toBe(400);
    });

    it('POST with a duplicate email returns 409', async () => {
      const res = await api('POST', '/api/users', { email: `u-${run}@test.dev`, name: 'Dup' });
      expect(res.status).toBe(409);
    });

    it('GET /:id includes profile and posts', async () => {
      const res = await api('GET', `/api/users/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id);
      expect(res.body.posts).toEqual([]);
    });

    it('GET /:id returns 404 for an unknown user', async () => {
      expect((await api('GET', '/api/users/999999999')).status).toBe(404);
    });

    it('GET / lists users', async () => {
      const res = await api('GET', '/api/users');
      expect(res.status).toBe(200);
      expect(res.body.some((u: { id: number }) => u.id === id)).toBeTruthy();
    });

    it('PATCH updates the name', async () => {
      const res = await api('PATCH', `/api/users/${id}`, { name: 'Alice B' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Alice B');
    });

    it('PATCH returns 404 for an unknown user', async () => {
      expect((await api('PATCH', '/api/users/999999999', { name: 'x' })).status).toBe(404);
    });

    it('PUT /:id/profile creates then updates', async () => {
      const created = await api('PUT', `/api/users/${id}/profile`, { bio: 'hi' });
      expect(created.status).toBe(201);
      const updated = await api('PUT', `/api/users/${id}/profile`, { bio: 'hello' });
      expect(updated.status).toBe(200);
      expect(updated.body.bio).toBe('hello');
    });

    it('DELETE removes the user, then 404', async () => {
      expect((await api('DELETE', `/api/users/${id}`)).status).toBe(204);
      expect((await api('DELETE', `/api/users/${id}`)).status).toBe(404);
    });
  });

  describe('categories', () => {
    let id: number;

    it('POST creates, duplicate name returns 409', async () => {
      const res = await api('POST', '/api/categories', { name: `cat-${run}` });
      expect(res.status).toBe(201);
      id = res.body.id;
      expect((await api('POST', '/api/categories', { name: `cat-${run}` })).status).toBe(409);
    });

    it('POST without name returns 400', async () => {
      expect((await api('POST', '/api/categories', {})).status).toBe(400);
    });

    it('GET / and GET /:id work', async () => {
      const list = await api('GET', '/api/categories');
      expect(list.body.some((c: { id: number }) => c.id === id)).toBeTruthy();
      const one = await api('GET', `/api/categories/${id}`);
      expect(one.status).toBe(200);
      expect(one.body.posts).toEqual([]);
      expect((await api('GET', '/api/categories/999999999')).status).toBe(404);
    });

    it('PATCH renames', async () => {
      const res = await api('PATCH', `/api/categories/${id}`, { name: `cat2-${run}` });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe(`cat2-${run}`);
      expect((await api('PATCH', '/api/categories/999999999', { name: 'x' })).status).toBe(404);
    });

    it('DELETE removes, then 404', async () => {
      expect((await api('DELETE', `/api/categories/${id}`)).status).toBe(204);
      expect((await api('DELETE', `/api/categories/${id}`)).status).toBe(404);
    });
  });

  describe('tags', () => {
    let id: number;

    it('POST creates, duplicate returns 409', async () => {
      const res = await api('POST', '/api/tags', { name: `tag-${run}` });
      expect(res.status).toBe(201);
      id = res.body.id;
      expect((await api('POST', '/api/tags', { name: `tag-${run}` })).status).toBe(409);
    });

    it('GET / lists tags', async () => {
      const res = await api('GET', '/api/tags');
      expect(res.body.some((t: { id: number }) => t.id === id)).toBeTruthy();
    });

    it('DELETE removes, then 404', async () => {
      expect((await api('DELETE', `/api/tags/${id}`)).status).toBe(204);
      expect((await api('DELETE', `/api/tags/${id}`)).status).toBe(404);
    });
  });

  describe('posts, comments, tags and likes', () => {
    let userId: number;
    let postId: number;
    let tagId: number;
    let commentId: number;

    beforeAll(async () => {
      userId = (await api('POST', '/api/users', { email: `p-${run}@test.dev`, name: 'Poster' })).body.id;
      tagId = (await api('POST', '/api/tags', { name: `ptag-${run}` })).body.id;
    });
    afterAll(async () => {
      await api('DELETE', `/api/users/${userId}`); // cascades to posts, comments, likes
      await api('DELETE', `/api/tags/${tagId}`);
    });

    it('POST /posts creates a draft', async () => {
      const res = await api('POST', '/api/posts', { title: 'T', content: 'C', authorId: userId });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('DRAFT');
      postId = res.body.id;
    });

    it('POST /posts without required fields returns 400', async () => {
      expect((await api('POST', '/api/posts', { title: 'T' })).status).toBe(400);
    });

    it('POST /posts with an unknown author returns 400', async () => {
      const res = await api('POST', '/api/posts', { title: 'T', content: 'C', authorId: 999999999 });
      expect(res.status).toBe(400);
    });

    it('GET /posts paginates and clamps limit', async () => {
      const res = await api('GET', '/api/posts?page=0&limit=1000');
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(100);
      expect(Array.isArray(res.body.data)).toBeTruthy();
    });

    it('GET /posts/:id returns relations; unknown id is 404', async () => {
      const res = await api('GET', `/api/posts/${postId}`);
      expect(res.status).toBe(200);
      expect(res.body.author.id).toBe(userId);
      expect((await api('GET', '/api/posts/999999999')).status).toBe(404);
    });

    it('PATCH /posts/:id updates status', async () => {
      const res = await api('PATCH', `/api/posts/${postId}`, { status: 'PUBLISHED' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PUBLISHED');
      expect((await api('PATCH', '/api/posts/999999999', { title: 'x' })).status).toBe(404);
    });

    it('attaches and detaches a tag', async () => {
      expect((await api('POST', `/api/posts/${postId}/tags/${tagId}`)).status).toBe(201);
      expect((await api('POST', `/api/posts/${postId}/tags/${tagId}`)).status).toBe(409);
      expect((await api('DELETE', `/api/posts/${postId}/tags/${tagId}`)).status).toBe(204);
      expect((await api('DELETE', `/api/posts/${postId}/tags/${tagId}`)).status).toBe(404);
    });

    it('adds a comment, edits it, deletes it', async () => {
      const bad = await api('POST', `/api/posts/${postId}/comments`, { content: 'x' });
      expect(bad.status).toBe(400);
      const created = await api('POST', `/api/posts/${postId}/comments`, { content: 'hi', authorId: userId });
      expect(created.status).toBe(201);
      commentId = created.body.id;

      expect((await api('PATCH', `/api/comments/${commentId}`, {})).status).toBe(400);
      const edited = await api('PATCH', `/api/comments/${commentId}`, { content: 'edited' });
      expect(edited.body.content).toBe('edited');
      expect((await api('PATCH', '/api/comments/999999999', { content: 'x' })).status).toBe(404);

      expect((await api('DELETE', `/api/comments/${commentId}`)).status).toBe(204);
      expect((await api('DELETE', `/api/comments/${commentId}`)).status).toBe(404);
    });

    it('likes and unlikes a post', async () => {
      expect((await api('POST', `/api/posts/${postId}/likes`, {})).status).toBe(400);
      expect((await api('POST', `/api/posts/${postId}/likes`, { userId })).status).toBe(201);
      expect((await api('POST', `/api/posts/${postId}/likes`, { userId })).status).toBe(409);
      expect((await api('DELETE', `/api/posts/${postId}/likes/${userId}`)).status).toBe(204);
      expect((await api('DELETE', `/api/posts/${postId}/likes/${userId}`)).status).toBe(404);
    });

    it('DELETE /posts/:id removes, then 404', async () => {
      expect((await api('DELETE', `/api/posts/${postId}`)).status).toBe(204);
      expect((await api('DELETE', `/api/posts/${postId}`)).status).toBe(404);
    });
  });
});
