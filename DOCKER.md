# Docker Guide

How this project runs with Docker and Docker Compose, written for a first-time user.

## 1. Key ideas

| Term | Meaning |
|---|---|
| **Image** | A packaged, read-only template: your code plus Node.js plus dependencies. Built from the `Dockerfile`. |
| **Container** | A running copy of an image, like a small isolated machine. One image can make many containers. |
| **Dockerfile** | The recipe for building an image, step by step. |
| **Docker Compose** | A tool that starts several containers together from one file, `docker-compose.yml`. |
| **Service** | One entry in `docker-compose.yml` (`db`, `migrate`, `app`). Compose builds or pulls an image for each one and creates its containers. |
| **Volume** | Storage outside the container, so data survives when the container is removed. |
| **Build cache** | Saved results of earlier build steps. Docker reuses them when nothing changed, which makes rebuilds fast. |

Image vs container: the **image** is the template, and the **container** is a running copy made from it.

## 2. The files

| File | Purpose |
|---|---|
| `Dockerfile` | Builds the images, in two stages: `build` and `production`. |
| `docker-compose.yml` | Defines the three services and how they connect. |
| `.dockerignore` | Files Docker should **not** copy into the image (`node_modules`, `.env`, `.git`, …). |

## 3. The Dockerfile: a multi-stage build

```dockerfile
# ---------- Build stage ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci                      # ALL dependencies (including dev ones like typescript)
COPY . .
RUN npm run build               # compile src/*.ts -> dist/*.js

# ---------- Run stage ----------
FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts   # ONLY production dependencies
COPY --from=build /app/dist ./dist       # take just the compiled code from stage 1
COPY openapi.yaml ./
USER node                                # don't run as root
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### How it works

1. **Stage `build`** installs everything and compiles TypeScript. It is big, because it contains TypeScript, tsx, the Prisma CLI and the source code.
2. **Stage `production`** starts again from a clean `node:24-alpine`. It installs only production dependencies, then copies **only** `dist/` from the build stage using `COPY --from=build`.
3. **Only the last stage becomes the final image.** Everything else in the build stage is left behind, so the final image is much smaller.

```
build stage (big, temporary)          production stage (final image)
┌──────────────────────────┐          ┌──────────────────────────┐
│ all node_modules         │          │ prod node_modules only   │
│ src/ (TypeScript)        │  COPY    │                          │
│ dist/ (compiled JS) ─────┼────────► │ dist/                    │
│ typescript, prisma CLI…  │          │ openapi.yaml             │
└──────────────────────────┘          └──────────────────────────┘
   kept only in build cache                 revision_docker-app
```

Normally the build stage **does not** become a named image. It only stays in the build cache. (This project is an exception; see section 5.)

### Why copy `package.json` before the rest of the code?

Docker caches each step. If `package.json` and `package-lock.json` haven't changed, Docker reuses the slow `npm ci` step from the cache and only re-runs the steps after `COPY . .`. Editing your code then doesn't reinstall all dependencies.

## 4. docker-compose.yml: the three services

```yaml
services:
  db:        # PostgreSQL database
  migrate:   # one-off job: creates/updates the tables, then exits
  app:       # the API on port 3000
```

### `db`

- Uses the official `postgres:17-alpine` image, downloaded from Docker Hub rather than built locally.
- Stores its data in the `db-data` **volume**, so data survives `docker compose down`.
- Has a **health check** (`pg_isready`), so the other services can wait until the database is ready to accept connections.
- Its port is **not** published to your machine. Only the other containers can reach it, by the hostname `db`.

### `migrate`

```yaml
migrate:
  build:
    context: .
    target: build              # build only up to the "build" stage
  command: npx prisma db migrate
  depends_on:
    db:
      condition: service_healthy
```

- Runs `prisma db migrate`, which applies any migrations in `migrations/` that haven't run yet, then **exits**.
- Starts only after `db` is healthy.
- Uses the **build stage**, because the `prisma` CLI is a dev dependency and the production image doesn't have it.

### `app`

```yaml
app:
  build:
    context: .
    target: production
  ports:
    - "3000:3000"              # <your machine port>:<container port>
  environment:
    DATABASE_URL: postgresql://user:password@db:5432/blog
  depends_on:
    migrate:
      condition: service_completed_successfully
```

- Runs the small production image (`node dist/index.js`).
- `ports: "3000:3000"` makes the API reachable at http://localhost:3000 from your machine.
- In `DATABASE_URL`, the host is `db`, the service name. Compose puts all services on one private network where they find each other by name.
- Starts only after `migrate` **finished successfully**, so the tables already exist.

### Startup order

```
db (wait until healthy) ──► migrate (run, exit 0) ──► app (start, port 3000)
```

## 5. Names: why there is a "migrate" image and a "migrate-1" container

Compose builds names from the **project name** (the folder name, `revision_docker`) and the **service name**:

| Kind | Pattern | Examples |
|---|---|---|
| Image | `<project>-<service>:latest` | `revision_docker-app:latest`, `revision_docker-migrate:latest` |
| Container | `<project>-<service>-<number>` | `revision_docker-app-1`, `revision_docker-migrate-1`, `revision_docker-db-1` |

- `latest` is the default **tag** (version label) of an image.
- `-1` is the copy number. A service can run several copies (`-1`, `-2`, …).
- `db` has no locally built image. It uses the downloaded `postgres:17-alpine`.

### Why a `revision_docker-migrate` image exists at all

The build stage is normally not saved as an image. Here it is, because the `migrate` service asks for it with `target: build`. That tells Docker to stop at the build stage and save the result as this service's image.

### Why it's so big

| Image | Built from | Contains | Size (approx.) |
|---|---|---|---|
| `revision_docker-app` | `production` stage | Production dependencies + compiled `dist/` | ~540 MB |
| `revision_docker-migrate` | `build` stage | **All** dependencies (Prisma CLI, TypeScript, tsx, …) + source code | ~2.1 GB |

The size difference is the point of the multi-stage build. The image you actually run as your API stays small.

### Why the `migrate-1` container shows "Exited (0)"

That's normal. It's a one-off job: it applies migrations and stops. Exit code `0` means **success**. When there's nothing new to apply, it does nothing and exits in about a second. A stopped container uses no CPU or memory.

## 6. Commands

Run all commands from the project folder.

### Start and stop

```bash
docker compose up -d --build    # build images (if needed) and start everything in the background
docker compose up -d            # start without rebuilding
docker compose stop             # pause containers (start again with: docker compose start)
docker compose down             # remove containers and network (database data is KEPT)
docker compose down -v          # remove containers AND the volume (database data is DELETED)
```

- `-d` ("detached") runs everything in the background and gives you your terminal back.
- `--build` rebuilds images first. Use it whenever you change code.

### Check status and logs

```bash
docker compose ps -a            # list containers and their status (-a includes stopped ones)
docker compose logs -f app      # follow the app's output (Ctrl+C to stop watching)
docker compose logs migrate     # see what the migration did
docker images                   # list images
```

### Run commands inside containers

```bash
docker compose exec app node dist/prisma/seed.js   # fill the database with sample data
docker compose exec db psql -U user -d blog        # SQL shell (\dt = list tables, \q = quit)
docker compose exec app sh                         # shell inside the app container (exit to leave)
```

`exec` runs a command inside a container that is **already running**.

### Use the API

- Swagger UI: http://localhost:3000/api-docs (open an endpoint, then **Try it out**, then **Execute**)
- Health check: http://localhost:3000/health
- curl: `curl localhost:3000/api/posts`

## 7. Everyday workflow

| You changed... | Run |
|---|---|
| Code in `src/` | `docker compose up -d --build` |
| The schema (`src/prisma/contract.prisma`) | `npm run migration:plan -- --name <change>`, then `docker compose up -d --build` (the `migrate` service applies the new migration) |
| `package.json` dependencies | `docker compose up -d --build` (the `npm ci` step re-runs) |
| Nothing, you just want it running | `docker compose up -d` |
| You want a fresh, empty database | `docker compose down -v`, then `docker compose up -d --build` |

## 8. Troubleshooting

| Problem | What to do |
|---|---|
| Something isn't working | Run `docker compose ps -a` to find the stopped or failed service, then `docker compose logs <service>` to see why. |
| `port is already allocated` for 3000 | Something else is using port 3000 (for example `npm run dev`). Stop it, or change the left side of `"3000:3000"` (e.g. `"3001:3000"`) and use http://localhost:3001. |
| `migrate` exited with a non-zero code | Read `docker compose logs migrate`. Usually a migration problem; `app` won't start until it succeeds. |
| Code changes don't show up | You forgot `--build`. Run `docker compose up -d --build`. |
| Old data you don't want | `docker compose down -v` deletes the database volume. |
| Disk filling up with old images | `docker image prune` removes unused, untagged images. `docker builder prune` clears the build cache. |
