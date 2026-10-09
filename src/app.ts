import { readFileSync } from 'node:fs';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import usersRouter from './routes/users.js';
import categoriesRouter from './routes/categories.js';
import tagsRouter from './routes/tags.js';
import postsRouter from './routes/posts.js';
import commentsRouter from './routes/comments.js';
import { errorHandler, notFound } from './middleware/error-handler.js';

// OpenAPI spec lives at the project root; served as Swagger UI at /api-docs
const openApiDocument = YAML.parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));

export const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.use('/api/users', usersRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/comments', commentsRouter);

app.use(notFound);
app.use(errorHandler);
