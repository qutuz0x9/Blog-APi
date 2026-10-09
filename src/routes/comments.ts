import { Router } from 'express';
import { db } from '../prisma/db.js';
import { HttpError, parseId, requireFields } from '../utils/http-error.js';

const router = Router();
const Comment = db.orm.public.Comment;

router.patch('/:id', async (req, res) => {
  requireFields(req.body, ['content']);
  const comment = await Comment.where({ id: parseId(req.params.id) }).update({ content: req.body.content });
  if (!comment) throw new HttpError(404, 'Comment not found');
  res.json(comment);
});

router.delete('/:id', async (req, res) => {
  const comment = await Comment.where({ id: parseId(req.params.id) }).delete();
  if (!comment) throw new HttpError(404, 'Comment not found');
  res.status(204).end();
});

export default router;
