import { Router } from 'express';
import { db } from '../prisma/db';
import { HttpError, parseId, requireFields } from '../utils/http-error';

const router = Router();
const { Post, PostTag, Comment, Like } = db.orm.public;

// GET /posts?page=1&limit=10
router.get('/', async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
  const posts = await Post.include('author', (a) => a.select('id', 'name'))
    .include('category')
    .orderBy((p) => p.createdAt.desc())
    .limit(limit)
    .offset((page - 1) * limit)
    .all();
  res.json({ page, limit, data: posts });
});

router.get('/:id', async (req, res) => {
  const post = await Post.where({ id: parseId(req.params.id) })
    .include('author', (a) => a.select('id', 'name'))
    .include('category')
    .include('tags', (t) => t.include('tag'))
    .include('comments', (c) => c.include('author', (a) => a.select('id', 'name')))
    .include('likes')
    .first();
  if (!post) throw new HttpError(404, 'Post not found');
  res.json(post);
});

router.post('/', async (req, res) => {
  requireFields(req.body, ['title', 'content', 'authorId']);
  const { title, content, status, authorId, categoryId } = req.body;
  const post = await Post.create({ title, content, status, authorId, categoryId });
  res.status(201).json(post);
});

router.patch('/:id', async (req, res) => {
  const { title, content, status, categoryId } = req.body;
  const post = await Post.where({ id: parseId(req.params.id) }).update({ title, content, status, categoryId });
  if (!post) throw new HttpError(404, 'Post not found');
  res.json(post);
});

router.delete('/:id', async (req, res) => {
  const post = await Post.where({ id: parseId(req.params.id) }).delete();
  if (!post) throw new HttpError(404, 'Post not found');
  res.status(204).end();
});

// Tags (many-to-many through PostTag)
router.post('/:id/tags/:tagId', async (req, res) => {
  const link = await PostTag.create({ postId: parseId(req.params.id), tagId: parseId(req.params.tagId) });
  res.status(201).json(link);
});

router.delete('/:id/tags/:tagId', async (req, res) => {
  const link = await PostTag.where({ postId: parseId(req.params.id), tagId: parseId(req.params.tagId) }).delete();
  if (!link) throw new HttpError(404, 'Tag is not attached to this post');
  res.status(204).end();
});

// Comments
router.post('/:id/comments', async (req, res) => {
  requireFields(req.body, ['content', 'authorId']);
  const { content, authorId } = req.body;
  const comment = await Comment.create({ content, authorId, postId: parseId(req.params.id) });
  res.status(201).json(comment);
});

// Likes (body: { userId })
router.post('/:id/likes', async (req, res) => {
  requireFields(req.body, ['userId']);
  const like = await Like.create({ userId: req.body.userId, postId: parseId(req.params.id) });
  res.status(201).json(like);
});

router.delete('/:id/likes/:userId', async (req, res) => {
  const like = await Like.where({ postId: parseId(req.params.id), userId: parseId(req.params.userId) }).delete();
  if (!like) throw new HttpError(404, 'Like not found');
  res.status(204).end();
});

export default router;
