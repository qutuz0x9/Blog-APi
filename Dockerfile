# Base image for Node.js application
FROM node:24.21 AS base 
WORKDIR /app
COPY package*.json ./

# Development stage for Node.js application
FROM base AS dev
ENV NODE_ENV=development
RUN npm ci
# compose.dev.yaml bind-mounts src/ and migrations/ over these copies
COPY . .
CMD ["npm", "run", "dev"]

# Build stage for Node.js application
FROM base AS build
RUN npm ci 
COPY . .
RUN npm run build

# Final stage: production dependencies and compiled code only
FROM base AS final
ENV NODE_ENV=production
# --ignore-scripts skips postinstall (it needs the prisma CLI, a dev dependency)
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
# The app reads openapi.yaml at startup (Swagger docs)
COPY openapi.yaml ./
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
