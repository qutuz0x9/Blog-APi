import { Router } from 'express';
import { db } from '../prisma/db';
import { HttpError, parseId, requireFields } from '../utils/http-error';

const router = Router();
const Tag = db.orm.public.Tag;

router.get('/', async (_req, res) => {
  const tags = await Tag.orderBy((t) => t.name.asc()).all();
  res.json(tags);
});

router.post('/', async (req, res) => {
  requireFields(req.body, ['name']);
  const tag = await Tag.create({ name: req.body.name });
  res.status(201).json(tag);
});

router.delete('/:id', async (req, res) => {
  const tag = await Tag.where({ id: parseId(req.params.id) }).delete();
  if (!tag) throw new HttpError(404, 'Tag not found');
  res.status(204).end();
});

export default router;
