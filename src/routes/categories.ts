import { Router } from 'express';
import { db } from '../prisma/db';
import { HttpError, parseId, requireFields } from '../utils/http-error';

const router = Router();
const Category = db.orm.public.Category;

router.get('/', async (_req, res) => {
  const categories = await Category.orderBy((c) => c.name.asc()).all();
  res.json(categories);
});

router.get('/:id', async (req, res) => {
  const category = await Category.where({ id: parseId(req.params.id) }).include('posts').first();
  if (!category) throw new HttpError(404, 'Category not found');
  res.json(category);
});

router.post('/', async (req, res) => {
  requireFields(req.body, ['name']);
  const category = await Category.create({ name: req.body.name });
  res.status(201).json(category);
});

router.patch('/:id', async (req, res) => {
  const category = await Category.where({ id: parseId(req.params.id) }).update({ name: req.body.name });
  if (!category) throw new HttpError(404, 'Category not found');
  res.json(category);
});

router.delete('/:id', async (req, res) => {
  const category = await Category.where({ id: parseId(req.params.id) }).delete();
  if (!category) throw new HttpError(404, 'Category not found');
  res.status(204).end();
});

export default router;
