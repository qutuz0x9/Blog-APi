import { Router } from 'express';
import { db } from '../prisma/db.js';
import { HttpError, parseId, requireFields } from '../utils/http-error.js';

const router = Router();
const User = db.orm.public.User;
const Profile = db.orm.public.Profile;

router.get('/', async (_req, res) => {
  const users = await User.orderBy((u) => u.id.asc()).all();
  res.json(users);
});

router.get('/:id', async (req, res) => {
  const user = await User.where({ id: parseId(req.params.id) })
    .include('profile')
    .include('posts')
    .first();
  if (!user) throw new HttpError(404, 'User not found');
  res.json(user);
});

router.post('/', async (req, res) => {
  requireFields(req.body, ['email', 'name']);
  const { email, name, role } = req.body;
  const user = await User.create({ email, name, role });
  res.status(201).json(user);
});

router.patch('/:id', async (req, res) => {
  const { email, name, role } = req.body;
  const user = await User.where({ id: parseId(req.params.id) }).update({ email, name, role });
  if (!user) throw new HttpError(404, 'User not found');
  res.json(user);
});

router.delete('/:id', async (req, res) => {
  const user = await User.where({ id: parseId(req.params.id) }).delete();
  if (!user) throw new HttpError(404, 'User not found');
  res.status(204).end();
});

// Profile (one-to-one): create it if missing, otherwise update it
router.put('/:id/profile', async (req, res) => {
  const userId = parseId(req.params.id);
  const { bio, avatarUrl } = req.body;
  const updated = await Profile.where({ userId }).update({ bio, avatarUrl });
  if (updated) {
    res.json(updated);
    return;
  }
  const created = await Profile.create({ userId, bio, avatarUrl });
  res.status(201).json(created);
});

export default router;
