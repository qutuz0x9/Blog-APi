// Fills the database with sample data. Run with `npm run db:seed`.
// WARNING: deletes all existing rows first, so only run it against a dev database.
import { db } from './db';

// Small seeded random generator so every run produces the same data
let seed = 42;
function random(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const randomInt = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;
const pick = <T>(items: T[]): T => items[randomInt(0, items.length - 1)]!;
const pickMany = <T>(items: T[], count: number): T[] =>
  [...items].sort(() => random() - 0.5).slice(0, count);

const FIRST_NAMES = [
  'Ali', 'Sara', 'Omar', 'Lina', 'Youssef', 'Mona', 'Karim', 'Nour', 'Hassan', 'Laila',
  'Adam', 'Mariam', 'Tarek', 'Hana', 'Ziad', 'Farah', 'Khaled', 'Salma', 'Rami', 'Dina',
];
const LAST_NAMES = ['Hassan', 'Ibrahim', 'Mahmoud', 'Saleh', 'Nasser', 'Fathy', 'Mostafa', 'Adel'];

const CATEGORIES = ['Docker', 'Backend', 'Databases', 'DevOps', 'TypeScript'];
const TAGS = [
  'docker', 'compose', 'postgres', 'prisma', 'express',
  'typescript', 'nodejs', 'linux', 'ci-cd', 'beginner',
];

const POST_TITLES = [
  'Getting started with Docker', 'Understanding Docker images and layers', 'Writing a good Dockerfile',
  'Multi-stage builds explained', 'Docker volumes vs bind mounts', 'Networking between containers',
  'Docker Compose for local development', 'Environment variables in containers', 'Health checks in Docker',
  'Shrinking your Docker images', 'Running PostgreSQL in Docker', 'Backing up a Postgres database',
  'Indexes in PostgreSQL', 'Transactions made simple', 'Designing a relational schema',
  'Prisma 8 first steps', 'Migrations without fear', 'Express 5: what changed',
  'Error handling in Express', 'Structuring an Express project', 'REST API design tips',
  'Pagination done right', 'TypeScript for backend developers', 'Strict mode in TypeScript',
  'Generics in practice', 'Linux commands every dev needs', 'Intro to CI/CD pipelines',
  'Deploying containers to production', 'Logging in Node.js apps', 'Securing your API',
];

const PARAGRAPHS = [
  'This post walks through the basics step by step, with examples you can run locally.',
  'We will look at common mistakes and how to avoid them in real projects.',
  'By the end you should be comfortable using this in your own applications.',
  'Here is a practical example taken from a small project I built recently.',
  'The official documentation is great, but this is the short version I wish I had.',
];

const COMMENTS = [
  'Great post, thanks!', 'This helped me a lot.', 'Very clear explanation.',
  'Can you write a follow-up on this?', 'I had the same problem last week.',
  'Bookmarked for later.', 'Nice examples.', 'Short and useful.',
  'I think there is a typo in the second example.', 'Exactly what I was looking for.',
  'How does this work in production?', 'Thanks for sharing!',
];

const STATUSES = ['PUBLISHED', 'PUBLISHED', 'PUBLISHED', 'DRAFT', 'ARCHIVED'] as const;

await db.transaction(async (tx) => {
  const { User, Profile, Category, Tag, Post, PostTag, Comment, Like } = tx.orm.public;

  console.log('Clearing existing data...');
  // Deleting users cascades to profiles, posts, post tags, comments and likes
  await User.where((u) => u.id.gt(0)).deleteAll();
  await Category.where((c) => c.id.gt(0)).deleteAll();
  await Tag.where((t) => t.id.gt(0)).deleteAll();

  const users = await User.createAll(
    FIRST_NAMES.map((first, i) => ({
      name: `${first} ${pick(LAST_NAMES)}`,
      email: `${first.toLowerCase()}${i + 1}@example.com`,
      role: i < 2 ? ('ADMIN' as const) : ('USER' as const),
    })),
  );

  // About two thirds of the users get a profile
  await Profile.createAll(
    users
      .filter(() => random() < 0.7)
      .map((u) => ({
        userId: u.id,
        bio: `Hi, I'm ${u.name.split(' ')[0]} and I write about backend development.`,
        avatarUrl: `https://i.pravatar.cc/150?u=${u.email}`,
      })),
  );

  const categories = await Category.createAll(CATEGORIES.map((name) => ({ name })));
  const tags = await Tag.createAll(TAGS.map((name) => ({ name })));

  const posts = await Post.createAll(
    POST_TITLES.map((title) => ({
      title,
      content: pickMany(PARAGRAPHS, 3).join('\n\n'),
      status: pick([...STATUSES]),
      authorId: pick(users).id,
      categoryId: random() < 0.9 ? pick(categories).id : null,
    })),
  );

  // 1 to 3 tags per post
  const postTags = await PostTag.createAll(
    posts.flatMap((p) => pickMany(tags, randomInt(1, 3)).map((t) => ({ postId: p.id, tagId: t.id }))),
  );

  // 100 comments spread across the posts
  const comments = await Comment.createAll(
    Array.from({ length: 100 }, () => ({
      content: pick(COMMENTS),
      postId: pick(posts).id,
      authorId: pick(users).id,
    })),
  );

  // Each user likes 30% to 70% of the posts
  const likes = await Like.createAll(
    users.flatMap((u) =>
      pickMany(posts, randomInt(9, 21)).map((p) => ({ userId: u.id, postId: p.id })),
    ),
  );

  console.table({
    users: users.length,
    categories: categories.length,
    tags: tags.length,
    posts: posts.length,
    postTags: postTags.length,
    comments: comments.length,
    likes: likes.length,
  });
});

console.log('Seeding finished.');
await db.close();
