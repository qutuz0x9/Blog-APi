# Environments Guide: dev, staging, prod

How to run this project in three environments with Docker Compose, and **why** each step is done the way it is.

> **Status:** this is a guide only. Nothing in it has been applied to your project yet.
> Every file shown below was **tested in a scratch copy**: all three environments were built and run side by side, with hot reload, seeding, health checks and the read-only prod container checked. The ports, names and commands are the ones that worked.

## Contents

1. [The idea](#1-the-idea)
2. [What makes one environment differ from another](#2-what-makes-one-environment-differ-from-another)
3. [How Compose combines files](#3-how-compose-combines-files)
4. [Two kinds of env files](#4-two-kinds-of-env-files)
5. [Fix these first (problems in the current files)](#5-fix-these-first-problems-in-the-current-files)
6. [Step by step](#6-step-by-step)
7. [Running each environment](#7-running-each-environment)
8. [Database work per environment](#8-database-work-per-environment)
9. [Moving a change from dev to staging to prod](#9-moving-a-change-from-dev-to-staging-to-prod)
10. [Secrets](#10-secrets)
11. [Troubleshooting](#11-troubleshooting)
12. [Cheat sheet](#12-cheat-sheet)
13. [What this guide leaves for later](#13-what-this-guide-leaves-for-later)

---

## 1. The idea

### What is an environment?

An **environment** is one complete, separate copy of your app and its database, set up for one purpose. Each one has its own database, its own passwords and its own settings, so what happens in one cannot damage another.

### Why three?

| Environment | Purpose | Who uses it | Is breaking it OK? |
|---|---|---|---|
| **dev** | Writing code. Fast feedback, easy debugging. | You | Yes, constantly |
| **staging** | A rehearsal. Runs **exactly like production**, with fake data. You test a release here before real users get it. | You, testers | Yes, that's its job |
| **prod** | The real thing. Real users, real data. | Everyone | **No** |

Why not just two (dev and prod)? Because code that works on your laptop can still fail in production (a missing file, a migration that fails on a bigger database, a setting that differs). **Staging is where you catch those failures**, so users don't.

### What differs between them (for this project)

| | dev | staging | prod |
|---|---|---|---|
| Docker build target | `dev` (all dependencies, watches files) | `production` | `production` |
| How code gets into the container | **Mounted** from your machine, so edits apply instantly | Built into the image | Built into the image |
| Hot reload (`tsx watch`) | Yes | No | No |
| App port on your machine | 3000 | 3001 | 3002 |
| Database port published | `5433` (any machine can connect) | `127.0.0.1:5434` (this machine only) | **None** (unreachable from outside Docker) |
| pgAdmin (database web UI) | Yes, port 8080 | No | No |
| Log level (`LOG_LEVEL`) | `debug` | `info` | `info` |
| Seed (sample data) allowed | Yes | Yes | **No** |
| Restart if it crashes | No | Yes | Yes |
| Read-only filesystem, memory limit | No | No | **Yes** |
| Passwords | Simple, committed to git | Real secrets, **not** in git | Real secrets, **not** in git |
| Project name (isolation) | `blog-dev` | `blog-staging` | `blog-prod` |

Staging and prod are **nearly identical on purpose**. If staging were different, it couldn't warn you about prod problems.

### The core principle: same code, different configuration

Your code never contains "if prod then...". It reads settings (`DATABASE_URL`, `LOG_LEVEL`, `PORT`) from its **environment variables**, and each environment supplies different values. This is rule III of the [twelve-factor app](https://12factor.net/config): *store config in the environment*. The payoff is that the same compiled code runs everywhere, so what you tested in staging is what runs in prod.

---

## 2. What makes one environment differ from another

Four mechanisms do all the work. Knowing which one to use for a given difference is the main skill.

| Mechanism | File(s) | Decides | Example |
|---|---|---|---|
| **Build target** | `Dockerfile` (`FROM ... AS dev`, `AS production`) | *What is inside the image* | dev has TypeScript and `tsx`; production has only compiled JS |
| **Compose override** | `compose.dev.yaml`, `compose.staging.yaml`, `compose.prod.yaml` | *How the containers run* (ports, volumes, restart, limits, extra services) | prod: no DB port, read-only filesystem |
| **Env file** | `.env.dev`, `.env.staging`, `.env.prod` | *Values and secrets* | passwords, log level, image tag |
| **Project name** | `name:` in each override file | *Isolation*: names of containers, volumes and networks | `blog-dev_db-data` vs `blog-prod_db-data` |

Rule of thumb:
- A **value** (password, log level) goes in an **env file**.
- A **behavior** (ports, restart, volumes) goes in a **compose override**.
- A difference in **what's installed** goes in the **Dockerfile**.
- Everything **shared** goes in the base `compose.yml`.

### Why the project name matters so much

Compose prefixes everything it creates with the **project name**: containers (`blog-dev-app-1`), networks and **volumes** (`blog-dev_db-data`). If dev and prod shared a project name, they would share a database volume, and `docker compose down -v` in dev would delete production data. A different name per environment gives each its own volume, so that cannot happen.

The name lives inside each `compose.<env>.yaml` (`name: blog-dev`), not on the command line, so you cannot forget it.

---

## 3. How Compose combines files

You start an environment with two files:

```bash
docker compose -f compose.yml -f compose.dev.yaml up
```

Compose **merges** them: the base first, then the override on top. The rules:

| Kind of value | What happens | Example |
|---|---|---|
| Single value (`image`, `command`, `restart`) | The later file **replaces** it | dev sets `command: npm run dev` |
| Map (`environment`, `build`, `healthcheck`) | Merged **key by key**; the later file wins on conflicts | dev sets only `build.target`, and `build.context` from the base is kept |
| List (`ports`, `tmpfs`) | The lists are **joined** (the override's entries are added) | dev adds `ports: ["3000:3000"]` |
| `volumes` | Merged by **mount path inside the container** | a later entry for the same path replaces the earlier one |
| Top-level `name` | The last file wins | `name: blog-dev` |

Two special tags (Compose 2.24+) let you undo a merge: `!reset` removes the base value, and `!override` replaces a whole list instead of joining it. This project doesn't need them.

**See the result of a merge** (very useful for learning and debugging):

```bash
scripts/dc.sh dev config        # prints the final, merged configuration
```

---

## 4. Two kinds of env files

This is the part that confuses almost everyone, so read it slowly. Docker Compose uses env files in **two different ways**.

| | **Interpolation** (what this guide uses) | **`env_file:` key** |
|---|---|---|
| What it does | Fills in `${VAR}` placeholders **inside the compose YAML itself** | Copies all variables **into a container's environment** |
| Where you set it | `docker compose --env-file .env.dev ...` | `env_file: .env.dev` under a service |
| Used for | `image: blog-app:${IMAGE_TAG}`, `POSTGRES_USER: ${POSTGRES_USER}` | Passing a pile of settings to a container without listing them |

In this project the compose files say `POSTGRES_USER: ${POSTGRES_USER}`, so Compose reads `--env-file` **while reading the YAML**, replaces the placeholder, and passes the final value to the container.

Facts about interpolation (all tested):
- `${VAR}`: use the value. `${VAR:-default}`: use `default` when it's unset or empty. `${VAR:?message}`: **stop with an error** when it's unset or empty.
- When you pass `--env-file`, Compose uses **that file instead of** the default `.env`.
- A variable already set in your **shell** beats the file (`POSTGRES_DB=x scripts/dc.sh dev config` uses `x`).
- A bare `docker compose up` (no `-f`, no `--env-file`) loads only the **base** `compose.yml`, with no env file. With the `:?` checks, it fails immediately with a clear error instead of starting a half-configured stack. Always use the wrapper script from step 8.
- A literal `$` in a value must be written `$$`.

### Where does the plain `.env` fit in?

`.env` is **not** one of the three environments. It's for tools running **on your own machine** (outside Docker): `npm run dev`, the Prisma CLI (`npm run migration:plan`, `npm run db:verify`). Your app code loads it through `import 'dotenv/config'`, which only reads a file named exactly `.env`.

| File | Read by | Contains |
|---|---|---|
| `.env` | Tools on your machine (`dotenv`) | `DATABASE_URL` pointing at `localhost`, `PORT` |
| `.env.dev`, `.env.staging`, `.env.prod` | Docker Compose (`--env-file`) | `POSTGRES_*`, `IMAGE_TAG`, `LOG_LEVEL`, ... |

Keep `POSTGRES_*` **out** of `.env`, so that a bare `docker compose up` fails loudly instead of quietly using the wrong values.

---

## 5. Fix these first (problems in the current files)

These were found in the project as it is now. They would break the three-environment setup, so fix them as part of the steps in section 6.

| # | Problem | What happens | Fixed in |
|---|---|---|---|
| 1 | `compose.yml` says `target: production`, but your `Dockerfile` calls that stage `final` | `docker compose build` fails: *target stage "production" could not be found* | Step 1 (rename the stage to `production`) |
| 2 | The `final` stage never copies `openapi.yaml` | The production app **crashes at startup**: `ENOENT: no such file or directory, open '/app/openapi.yaml'` (the app reads that file when it boots; this was reproduced) | Step 1 |
| 3 | `.dockerignore` only excludes `.env` | `COPY . .` in the build stage would copy `.env.prod` (your production password) **into an image layer**. Anyone with the image can read it, and the `migrate` service uses that image | Step 2 |
| 4 | `.gitignore` only ignores `.env` | `.env.staging` and `.env.prod` would be committed to git | Step 2 |
| 5 | `npm ci --only=production` | Works, but `--only` is deprecated. The current spelling is `--omit=dev` | Step 1 |
| 6 | The prod image contains `dist/prisma/seed.js`, and the seed script **deletes all rows** | One wrong command (`exec app node dist/prisma/seed.js`) wipes the production database | Step 9 (a guard) |

---

## 6. Step by step

Do these in order. Each step says what to do and **why**.

### Planned file layout

```text
.
├── Dockerfile                  # step 1: dev / build / production stages
├── .dockerignore               # step 2
├── .gitignore                  # step 2
├── compose.yml                 # step 3: shared base
├── compose.dev.yaml            # step 4
├── compose.staging.yaml        # step 5
├── compose.prod.yaml           # step 6
├── .env.dev                    # step 7 (committed: throwaway values)
├── .env.staging                # step 7 (NOT committed)
├── .env.prod                   # step 7 (NOT committed)
├── .env.example                # step 7 (committed: template)
├── .env                        # step 10 (NOT committed: your machine's tools)
└── scripts/dc.sh               # step 8: wrapper so you can't mix files up
```

---

### Step 1: Dockerfile with a `dev` stage

```dockerfile
# ---------- base: shared by every stage ----------
FROM node:24.21-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./

# ---------- dev: all dependencies, code comes from a bind mount ----------
FROM base AS dev
ENV NODE_ENV=development
RUN npm ci
COPY . .
CMD ["npm", "run", "dev"]

# ---------- build: compile TypeScript into dist/ ----------
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

# ---------- production: production deps + compiled code only ----------
FROM base AS production
ENV NODE_ENV=production
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY openapi.yaml ./
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Why each part:**

- **`base`** holds what every stage needs (the Node image, the working folder, `package.json`). The other stages start `FROM base`, so none of this is repeated.
- **`node:24.21-slim`** is a smaller Debian-based Node image than the full `node:24.21` (several hundred MB less), and unlike Alpine it avoids compatibility surprises with some npm packages.
- **`dev`** installs **all** dependencies (including `tsx` and the Prisma CLI) and runs `npm run dev`, which is `tsx watch`: it restarts the server whenever a file changes. `COPY . .` puts a copy of the code in the image, but in dev you hide `src/` behind a **bind mount** (step 4), so your edits show up instantly without rebuilding.
- **`build`** compiles TypeScript to `dist/`. It's also what the `migrate` service runs in staging and prod, because it contains the Prisma CLI, `prisma.config.ts` and `migrations/`.
- **`production`** starts again from `base`, installs **only** production dependencies, and copies **just** `dist/` from the build stage. TypeScript, tsx and the Prisma CLI are left behind, so the image is smaller and has less to attack.
- **`COPY openapi.yaml ./`** is fix #2: the app reads this file at startup.
- **`--ignore-scripts`** skips the `postinstall` script (`prisma skills sync`), which needs the Prisma CLI that isn't installed here.
- **`ENV NODE_ENV`** is set per stage, so the image itself decides, with nothing to configure in compose. Express and many libraries switch to faster, quieter behavior when it's `production`.
- **`USER node`** runs the app as an unprivileged user instead of root. If someone breaks into the app, they get far less.
- **Instruction order** matters for speed: `package.json` is copied and `npm ci` runs *before* the code is copied. Docker caches each step, so editing code doesn't reinstall dependencies.

If you'd rather keep your stage name `final`, change `target: production` to `target: final` in `compose.yml` instead. The name just has to match.

---

### Step 2: `.dockerignore` and `.gitignore`

**`.dockerignore`** (files Docker must **not** copy into images):

```text
node_modules
dist
.git
.claude
.env*
```

**`.gitignore`** (files git must **not** track):

```text
.env*
!.env.example
!.env.dev
node_modules/
dist/
```

**Why:**

- `.env*` matches `.env`, `.env.dev`, `.env.staging`, `.env.prod` and any future typo such as `.env.production`. Ignoring by **pattern** is safer than listing names: a forgotten name means a leaked password.
- A line starting with `!` is an **exception** that re-includes a file. `.env.example` (the template) and `.env.dev` (throwaway local values like `dev_password`) are safe to commit, so a new teammate can run `scripts/dc.sh dev up` right after cloning. Tested result: `.env`, `.env.staging`, `.env.prod` and `.env.production` are ignored; `.env.dev` and `.env.example` are tracked.
- In `.dockerignore`, `.env*` has no exceptions. Containers get their values from Compose at runtime, so env files never need to be inside an image. Anything copied into an image can be extracted by anyone who gets that image, and the `migrate` service's image is the build stage, which uses `COPY . .`.

---

### Step 3: the shared base `compose.yml`

Everything that is the same in all environments:

```yaml
# Shared by every environment. compose.<env>.yaml is layered on top of this file.
services:
  db:
    image: postgres:18
    environment:
      POSTGRES_USER: ${POSTGRES_USER:?set POSTGRES_USER in the env file}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in the env file}
      POSTGRES_DB: ${POSTGRES_DB:?set POSTGRES_DB in the env file}
    volumes:
      - db-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - backend

  # One-off job: applies pending migrations, then exits.
  migrate:
    build:
      context: .
      target: build
    image: blog-migrate:${IMAGE_TAG:-local}
    command: npx prisma db migrate
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - backend

  app:
    build:
      context: .
      target: production
    image: blog-app:${IMAGE_TAG:-local}
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      PORT: 3000
      LOG_LEVEL: ${LOG_LEVEL:-info}
      ALLOW_SEED: ${ALLOW_SEED:-false}
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    depends_on:
      migrate:
        condition: service_completed_successfully
    networks:
      - backend
      - frontend

volumes:
  db-data:

networks:
  frontend:
  backend:
```

**Why each part:**

- **No `name:` here.** The project name is per environment, so it lives in the overrides (see section 2).
- **`${POSTGRES_USER:?...}`** makes Compose refuse to start when a value is missing, instead of silently using an empty password. Tested message: `required variable POSTGRES_PASSWORD is missing a value: set POSTGRES_PASSWORD in the env file`.
- **`db-data:/var/lib/postgresql`**: PostgreSQL 18 changed its data location to a per-version folder under `/var/lib/postgresql`. Mounting the old `/var/lib/postgresql/data` makes the container exit with an error (you hit this already).
- **`healthcheck` on `db`** runs `pg_isready` every 5 seconds. `depends_on: condition: service_healthy` then waits for it. "The container started" does not mean "Postgres accepts connections", and the migration would fail in that gap.
- **`migrate`** is a one-off job: it applies the SQL files in `migrations/`, then exits. `service_completed_successfully` makes `app` wait for it, so the tables always exist before the API starts.
- **Host `db`** in `DATABASE_URL`: inside a Compose network, containers reach each other by **service name**. Port `5432` here is the port *inside* the network, which is not the same as a port published to your machine.
- **`image: blog-app:${IMAGE_TAG:-local}`** gives images a name and version. Each env file sets `IMAGE_TAG` (`dev`, `staging`, `1.0.0`), so the three environments never overwrite each other's images, and you can roll back by pointing at an older tag.
- **`LOG_LEVEL`, `ALLOW_SEED`** use `${VAR:-default}`, so they're safe when an env file omits them.
- **`healthcheck` on `app`** calls your `/health` endpoint with Node itself. The slim image has no `curl`, but Node 24 has a built-in `fetch`. `start_period` gives the server 10 seconds to boot before failures count.
- **Two networks:** `backend` connects `db`, `migrate` and `app`. `frontend` is attached only to `app`, ready for a reverse proxy later. The database is never on `frontend`.
- **pgAdmin is not here.** It is a dev tool, and prod must not have a database admin UI. It lives in `compose.dev.yaml`.

---

### Step 4: `compose.dev.yaml`

```yaml
name: blog-dev

services:
  db:
    ports:
      - "5433:5432"          # reach the DB from your machine (psql, Prisma CLI)

  migrate:
    build:
      target: dev
    volumes:
      - ./migrations:/app/migrations   # new migrations show up without a rebuild

  app:
    build:
      target: dev
    command: npm run dev     # tsx watch: restarts when a file in src/ changes
    ports:
      - "3000:3000"
    volumes:
      - ./src:/app/src       # edit on your machine, runs in the container

  pgadmin:
    image: dpage/pgadmin4:latest
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_DEFAULT_EMAIL}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_DEFAULT_PASSWORD}
    ports:
      - "8080:80"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - pgadmin-data:/var/lib/pgadmin
    networks:
      - backend

volumes:
  pgadmin-data:
```

**Why each part:**

- **`ports: "5433:5432"`** has the format `<your machine>:<inside the container>`. It lets tools on your machine reach the dev database. It's `5433` rather than `5432` because **your own Postgres already uses 5432**, and two programs can't share a port. (Inside Docker, the app still uses `db:5432`.)
- **`build.target: dev`** only overrides `target`. The `context: .` from the base is kept (the map-merge rule from section 3).
- **`./src:/app/src` (bind mount):** your `src/` folder on the host **replaces** the `src/` that was baked into the image, so the container sees your edits instantly and `tsx watch` restarts the server. Test result: editing a file restarted the server within seconds.
- **Why mount only `src/` and not the whole project (`.:/app`)?** Mounting everything would hide the container's `node_modules` behind your host's folder (empty, or built for a different OS). The usual workaround is an extra "anonymous volume" that then goes stale when `package.json` changes. Mounting only the folders you edit avoids that problem.
- **`migrate` uses `dev` + `./migrations` mount** so a migration you just created with `npm run migration:plan` is applied on the next `up`, with no image rebuild.
- **pgAdmin** is a web UI for the database at http://localhost:8080. To connect, add a server with host `db`, port `5432` (pgAdmin runs inside the same Docker network).
- **`volumes: pgadmin-data:`** declares the volume used by pgAdmin. Each override can add top-level definitions, and they're merged with the base.

---

### Step 5: `compose.staging.yaml`

```yaml
name: blog-staging

services:
  db:
    restart: unless-stopped
    ports:
      - "127.0.0.1:5434:5432"   # only reachable from this machine
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  app:
    restart: unless-stopped
    ports:
      - "3001:3000"
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
```

**Why:**

- **No `target` override.** Staging uses the base's `production` stage, the same image prod uses. That is the whole point of staging.
- **`restart: unless-stopped`** restarts a container that crashes or after a reboot. You'd want to find out here if the app crashes.
- **`127.0.0.1:5434:5432`** adds the host IP in front: only programs on this machine (or through an SSH tunnel) can reach the database. A plain `5434:5432` would open it to the whole network.
- **`logging` with `max-size` / `max-file`**: Docker stores container output in a file that, by default, **grows forever**. This keeps at most 3 files of 10 MB each per container. Your logger writes to stdout, so this is where your logs live.
- **Port `3001`** lets staging run on the same machine as dev (3000) and prod (3002). On a real server, each environment would be on its own machine and you wouldn't need different ports.

---

### Step 6: `compose.prod.yaml`

```yaml
name: blog-prod

services:
  db:
    restart: unless-stopped      # no ports: the DB is unreachable from outside Docker
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  app:
    restart: unless-stopped
    ports:
      - "3002:3000"
    read_only: true              # container filesystem is read-only
    tmpfs:
      - /tmp                     # ...except a throwaway /tmp
    security_opt:
      - no-new-privileges:true
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
```

**Why:**

- **`db` has no `ports`.** Only containers on the same Docker network can reach it. Nobody on the internet or your LAN can even attempt to connect to your production database. This is the most important line in the file.
- **`read_only: true`** makes the container's filesystem read-only. If an attacker gets into the app, they can't drop files or modify your code. `tmpfs: /tmp` gives a temporary, memory-backed `/tmp` for anything that needs scratch space. Tested: writing to `/app` fails with *Read-only file system*, and `/tmp` works.
- **`no-new-privileges`** stops processes in the container from gaining more rights than they started with.
- **`deploy.resources.limits`** caps the app at 1 CPU and 512 MB. A memory leak then kills (and restarts) one container, instead of freezing the whole server. Adjust the numbers after you observe real usage.
- **Compared with staging**, only the hardening differs (read-only, limits, no published DB port). Read the two files side by side: the **diff between them is the complete list of differences between staging and prod**.
- **Port `3002`:** on a real server, you'd put a reverse proxy (nginx, Caddy, Traefik) in front that handles HTTPS and forwards to the app. See section 13.

---

### Step 7: the env files

**`.env.dev`** (committed: values are throwaway):

```env
IMAGE_TAG=dev
POSTGRES_USER=dev_user
POSTGRES_PASSWORD=dev_password
POSTGRES_DB=blog_dev
LOG_LEVEL=debug
ALLOW_SEED=true
PGADMIN_DEFAULT_EMAIL=admin@example.com
PGADMIN_DEFAULT_PASSWORD=admin
```

**`.env.staging`** (NOT committed):

```env
IMAGE_TAG=staging
POSTGRES_USER=staging_user
POSTGRES_PASSWORD=<generate: see section 10>
POSTGRES_DB=blog_staging
LOG_LEVEL=info
ALLOW_SEED=true
```

**`.env.prod`** (NOT committed):

```env
IMAGE_TAG=1.0.0
POSTGRES_USER=prod_user
POSTGRES_PASSWORD=<generate: see section 10>
POSTGRES_DB=blog_prod
LOG_LEVEL=info
ALLOW_SEED=false
```

**`.env.example`** (committed: a template that shows **which variables exist**, never real secrets):

```env
# Copy to .env.staging or .env.prod and fill in real values.
# Never commit the filled-in copies.
IMAGE_TAG=1.0.0
POSTGRES_USER=app_user
POSTGRES_PASSWORD=change-me
POSTGRES_DB=blog
LOG_LEVEL=info
ALLOW_SEED=false
```

| Variable | Used by | Meaning |
|---|---|---|
| `IMAGE_TAG` | compose image names | Version label of the images (`blog-app:1.0.0`) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `db`, and the `DATABASE_URL` of `migrate` and `app` | The database login and name |
| `LOG_LEVEL` | the app's logger | `debug`, `info`, `warn` or `error` |
| `ALLOW_SEED` | `src/prisma/seed.ts` (step 9) | Whether the destructive seed script may run |
| `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD` | `pgadmin` (dev only) | pgAdmin's first login |

**Why different database names and users per environment** (`blog_dev`, `blog_staging`, `blog_prod`)? The databases are already separate (separate volumes), but different names make mistakes obvious: if a command prints `blog_prod`, you know where you are.

**Important:** these `POSTGRES_*` values are used **only the first time** a database volume is created. After that, Postgres ignores them and keeps the user and password stored in the volume. Changing the file later does **not** change an existing database. See section 11 ("role does not exist" / "password authentication failed").

If a password contains characters like `@`, `/` or `#`, it breaks the `DATABASE_URL` (it would need URL-encoding). Generate passwords with only hex characters (section 10) and you never have to think about it.

---

### Step 8: a wrapper script so you can't mix files up

Every command needs the right pair of files: `--env-file .env.<env>` plus `-f compose.yml -f compose.<env>.yaml`. Typing that by hand is long, and one mistake (prod env file with the dev override) is dangerous. Put it in one script:

**`scripts/dc.sh`** (then run `chmod +x scripts/dc.sh`):

```sh
#!/usr/bin/env sh
# Usage: scripts/dc.sh <dev|staging|prod> <docker compose arguments...>
# Example: scripts/dc.sh dev up -d --build
set -e
env="$1"
[ -n "$env" ] || { echo "Usage: $0 <dev|staging|prod> <docker compose args...>" >&2; exit 1; }
shift
exec docker compose --env-file ".env.$env" -f compose.yml -f "compose.$env.yaml" "$@"
```

**How it works:** the first argument picks the environment, `shift` removes it, and everything else (`up -d --build`, `logs -f app`, `exec ...`) is passed straight to `docker compose`. The environment name builds both file names, so they always match. A misspelled environment fails with "no such file" instead of doing something unexpected.

**Optional npm shortcuts** for `package.json` (you can also just use the script directly):

```json
"docker:dev": "scripts/dc.sh dev up -d --build",
"docker:dev:down": "scripts/dc.sh dev down",
"docker:dev:logs": "scripts/dc.sh dev logs -f app",
"docker:staging": "scripts/dc.sh staging up -d --build",
"docker:prod": "scripts/dc.sh prod up -d --build"
```

---

### Step 9: protect production from the seed script

`src/prisma/seed.ts` **deletes all rows** before inserting sample data. Your production image contains the compiled `dist/prisma/seed.js`. Anyone running `docker compose exec app node dist/prisma/seed.js` in the wrong terminal would wipe the production database. Add this guard at the top of `seed.ts`, right after the imports:

```ts
if (process.env['ALLOW_SEED'] !== 'true') {
  console.error('Refusing to seed: this deletes ALL data. Set ALLOW_SEED=true (dev/staging only).');
  process.exit(1);
}
```

**Why an explicit opt-in instead of checking `NODE_ENV === 'production'`:** staging also runs with `NODE_ENV=production` (it must mirror prod), but you *do* want to seed staging. A dedicated variable lets each environment decide, and the safe default (anything but exactly `true`) is "refuse". Tested: prod refuses, staging and dev seed normally.

---

### Step 10: `.env` for tools on your machine

Your Prisma commands (`npm run migration:plan`, `npm run db:verify`, ...) and `npm run dev` outside Docker read `DATABASE_URL` from `.env`. To work against the **dev stack's** database, point it at the published dev port:

```env
DATABASE_URL="postgresql://dev_user:dev_password@localhost:5433/blog_dev"
PORT=3000
```

Remember from section 4: keep `POSTGRES_*` out of this file. (Your current `.env` points at your own local Postgres on 5432. That is fine too if you prefer to run the database outside Docker. Just know that `migration:plan` needs `DATABASE_URL` defined.)

Staging and prod databases are intentionally **not** reachable from your Prisma CLI. They are changed only through the `migrate` service (section 8).

---

## 7. Running each environment

All commands use the wrapper from step 8. Replace `dev` with `staging` or `prod`.

### First run

```bash
scripts/dc.sh dev up -d --build
```

What happens, in order (this is the `depends_on` chain you wrote):

```
db (wait until healthy) -> migrate (applies migrations, exits 0) -> app (starts, then reports healthy)
```

In dev, `pgadmin` also starts as soon as `db` is healthy.

### Check that it worked

```bash
scripts/dc.sh dev ps -a                  # db: healthy, migrate: Exited (0), app: healthy
curl localhost:3000/health               # dev: 3000, staging: 3001, prod: 3002
scripts/dc.sh dev logs -f app            # follow the app log (Ctrl+C stops watching)
```

`migrate` showing **Exited (0)** is correct: it's a one-off job, and 0 means success.

### Day-to-day

| Task | Command |
|---|---|
| Start (no rebuild) | `scripts/dc.sh dev up -d` |
| Rebuild after changing dependencies or the Dockerfile | `scripts/dc.sh dev up -d --build` |
| Stop, keep data | `scripts/dc.sh dev down` |
| Stop **and delete the database** | `scripts/dc.sh dev down -v` |
| Open a SQL shell | `scripts/dc.sh dev exec db psql -U dev_user -d blog_dev` |
| Shell inside the app container | `scripts/dc.sh dev exec app sh` |

In **dev**, editing a file under `src/` needs **no command at all**: it's mounted and `tsx watch` restarts the server.

### Run all three at the same time

Because ports, project names, volumes and images all differ, the three can run side by side:

| | dev | staging | prod |
|---|---|---|---|
| API | http://localhost:3000 | http://localhost:3001 | http://localhost:3002 |
| Swagger | `:3000/api-docs` | `:3001/api-docs` | `:3002/api-docs` |
| Database (from your machine) | `localhost:5433` | `127.0.0.1:5434` | not reachable |

This is how it was tested: all three up together, each with its own data (dev and staging seeded with 30 posts, prod empty).

---

## 8. Database work per environment

### Two ways to change the schema (and which environment each belongs to)

| Command | What it does | Use in |
|---|---|---|
| `db update` / `db:sync` | Changes the tables to match your schema **right now**. No migration files. | **dev only**, for quick experiments |
| `migration plan` + `db migrate` | Creates a reviewable **migration file**, then applies exactly that file | **everywhere that matters**: staging and prod must only ever run migration files |

Staging and prod run **only** the committed migration files, so what you tested in staging is exactly what runs in prod.

### How a schema change travels

```
1. Edit src/prisma/contract.prisma
2. npm run migration:plan -- --name add_slug     (on your machine: writes migrations/app/<timestamp>_add_slug/)
3. scripts/dc.sh dev up -d                       (dev's migrate service applies it: migrations/ is mounted)
4. Commit the new migration files to git
5. scripts/dc.sh staging up -d --build           (rebuilds the image; its migrate service applies it)
6. Test on staging
7. scripts/dc.sh prod up -d --build              (same migration, same image contents)
```

**Why a rebuild is needed for staging/prod:** their `migrate` service uses the `build` image, and `COPY . .` bakes the `migrations/` folder into it. A new migration needs a new image. (In dev, `migrations/` is mounted, so no rebuild is needed.)

### Seeding

```bash
scripts/dc.sh dev exec app npx tsx src/prisma/seed.ts       # dev: the app container has tsx
scripts/dc.sh staging exec app node dist/prisma/seed.js     # staging: compiled version
```

Never in prod: the `ALLOW_SEED=false` guard (step 9) refuses to run. Also never copy real production data into staging or dev without removing personal information first.

### Backups (do this before every production migration)

```bash
scripts/dc.sh prod exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup_$(date +%F).sql
```

- `-T` turns off the interactive terminal, which is needed when redirecting output to a file.
- The single quotes make the **container's own** shell expand `$POSTGRES_USER` and `$POSTGRES_DB`, so you don't type the password or names.
- To restore into an empty database: `scripts/dc.sh prod exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup_2026-10-08.sql`

A backup you have never restored is only a hope. Practice restoring into **staging** first.

---

## 9. Moving a change from dev to staging to prod

```
write code in dev  ->  commit + tag a version  ->  deploy to staging  ->  test  ->  deploy to prod
```

1. **Build and test in dev** until you're happy. Run `npm run typecheck`.
2. **Commit** your code *and* any new migration files.
3. **Pick a version**, for example `1.1.0`. Set `IMAGE_TAG=1.1.0` in `.env.staging`, then deploy: `scripts/dc.sh staging up -d --build`.
4. **Test on staging**: hit the API, check `scripts/dc.sh staging logs app`, check `ps` shows `healthy`.
5. **Deploy the same version to prod**: set `IMAGE_TAG=1.1.0` in `.env.prod`, **take a backup**, then `scripts/dc.sh prod up -d --build`.
6. **Watch it**: `scripts/dc.sh prod logs -f app` and `ps` for a few minutes.

**About "build once, deploy everywhere":** the ideal is to build the image **once**, push it to a registry, and have staging and prod *pull* that identical image. In this guide, each environment builds from the same Git commit, which is close enough for learning and a single server. Section 13 mentions the registry approach.

### Rolling back

Code is easy: set `IMAGE_TAG` back to the previous version and run `up -d` (the old image still exists locally if you haven't removed it).

The **database is the hard part.** Migrations only go forward. If version 1.1.0 dropped a column, rolling the code back to 1.0.0 doesn't bring the column back. Two habits make rollbacks safe:
- **Take a backup before every prod migration** (section 8).
- **Make risky changes in two releases.** To rename a column: release 1 adds the new column and writes to both, release 2 (later) drops the old one. Old code keeps working with the database at every step. (This is called *expand/contract*.)

---

## 10. Secrets

A **secret** is any value that would cause damage if it leaked: database passwords, API keys, tokens.

**Rules:**
1. **Never commit real secrets.** Git history is permanent: removing a leaked password in a later commit doesn't remove it from history. If it leaks, change the password.
2. **Never put secrets in an image.** That's why `.dockerignore` excludes `.env*`.
3. **Use a different secret in every environment**, so a leak in dev or staging doesn't expose prod.
4. **Generate real secrets; don't invent them.**

```bash
openssl rand -hex 24      # 48 random hex characters, safe inside a DATABASE_URL
```

**Where the real `.env.staging` and `.env.prod` live:** only on the machine that runs that environment (or in your CI system's secret store). Create them there and lock them down:

```bash
chmod 600 .env.prod       # only the owner can read or write it
```

**Know the limit of env files:** values passed to a container are visible to anyone with Docker access on that machine (`docker inspect`). For a single-server hobby or learning setup that's normal. Larger teams use Docker/Swarm secrets, or a secret manager (Vault, AWS Secrets Manager, ...), which this guide doesn't cover.

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `required variable POSTGRES_PASSWORD is missing a value` | You ran `docker compose` directly, or the env file lacks the variable | Use `scripts/dc.sh <env> ...`; check the env file |
| `The "POSTGRES_PASSWORD" variable is not set. Defaulting to a blank string.` | A `${VAR}` without `:?` is missing from the env file | Add it to the env file (it's a warning, not an error) |
| db log: `role "xyz" does not exist` / `password authentication failed`, `migrate` fails | The database volume was created earlier with **different** credentials. Postgres only reads `POSTGRES_*` the first time | Dev/staging: `scripts/dc.sh <env> down -v`, then `up -d --build` (**deletes that environment's data**). Prod: never delete; fix the env file back, or `ALTER USER` inside the database |
| db exits: *"in 18+, these Docker images are configured to store database data in a format ..."* | The volume is mounted at `/var/lib/postgresql/data` | Mount `db-data:/var/lib/postgresql` (step 3) |
| `port is already allocated` | Something else uses that port (your local Postgres on 5432, another stack, `npm run dev` on 3000) | Stop it, or change the left number in `ports` |
| `target stage "production" could not be found` | Dockerfile stage is named `final` | Step 1 (rename the stage, or change `target`) |
| Production app exits: `ENOENT ... openapi.yaml` | `COPY openapi.yaml ./` is missing from the `production` stage | Step 1 |
| `app` stays `Created` and never starts | `migrate` failed, and `app` waits for it | `scripts/dc.sh <env> logs migrate` |
| Dev: edits don't apply | Wrong folder mounted, or the file is outside `src/` | Check `volumes` in `compose.dev.yaml`; changes to `package.json` or `prisma.config.ts` need `up -d --build` |
| Dev: edits don't apply (Docker Desktop on macOS/Windows) | File-change events may not reach the container through the mount | Restart the app with `scripts/dc.sh dev restart app`. Hot reload was tested on Linux only |
| `/health` request lines flood the dev log | The health check calls `/health` every 10 seconds, and the request logger logs each call | Optional: skip logging `/health` in `src/middleware/request-logger.ts` |
| A prod change "did nothing" | You forgot `--build`, or didn't bump `IMAGE_TAG` | `scripts/dc.sh prod up -d --build` |
| Which environment am I in? | | `scripts/dc.sh <env> ps` prints container names that start with `blog-<env>-` |

**First two commands for any problem:**

```bash
scripts/dc.sh <env> ps -a             # which service failed or stopped?
scripts/dc.sh <env> logs <service>    # why?
```

---

## 12. Cheat sheet

```bash
# Replace <env> with dev | staging | prod
scripts/dc.sh <env> up -d --build            # build and start
scripts/dc.sh <env> up -d                    # start
scripts/dc.sh <env> down                     # stop, keep data
scripts/dc.sh <env> down -v                  # stop and DELETE data (never in prod!)
scripts/dc.sh <env> ps -a                    # status
scripts/dc.sh <env> logs -f app              # follow logs
scripts/dc.sh <env> config                   # show the merged configuration
scripts/dc.sh <env> exec app sh              # shell in the app container
scripts/dc.sh <env> exec db psql -U <user> -d <db>    # SQL shell
```

| | dev | staging | prod |
|---|---|---|---|
| Files | `.env.dev` + `compose.dev.yaml` | `.env.staging` + `compose.staging.yaml` | `.env.prod` + `compose.prod.yaml` |
| Project name | `blog-dev` | `blog-staging` | `blog-prod` |
| App | `:3000` | `:3001` | `:3002` |
| DB from your machine | `5433` | `127.0.0.1:5434` | no |
| Build target | `dev` | `production` | `production` |
| Seed | yes | yes | no |
| Delete data with `down -v` | fine | fine | **never** |

---

## 13. What this guide leaves for later

These are the next steps for a real deployment. They're out of scope here, but you now know enough to learn them.

| Topic | What it adds |
|---|---|
| **Reverse proxy + HTTPS** (Caddy, nginx, Traefik) | Handles TLS certificates and forwards traffic to `app` on the `frontend` network, so port 3002 is no longer exposed directly |
| **Image registry** (Docker Hub, GitHub Container Registry) | Build the image once, push it, and have staging and prod `pull` the identical image |
| **CI/CD** (GitHub Actions) | Builds, tests and deploys automatically when you push or tag, instead of running commands by hand |
| **Secret management** (Docker secrets, Vault, cloud secret stores) | Safer than env files on a server |
| **Monitoring and log shipping** | Alerts when the app is down; central search over logs |
| **Automated backups** | A scheduled `pg_dump` that is copied off the machine |
| **Compose `watch`** (`docker compose watch`) | An alternative to bind mounts for dev: syncs files and rebuilds on dependency changes |
