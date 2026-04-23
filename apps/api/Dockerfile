# Multi-stage Dockerfile for the NestJS API.
#
# - `deps` installs ONLY production dependencies into a clean layer
#   (cached unless package.json / pnpm-lock changes).
# - `build` adds dev deps, generates the Prisma client, and runs
#   `nest build` so the image at the end ships pre-compiled JS, not
#   ts-node.
# - `runner` is a slim node:20-alpine that copies just the production
#   node_modules + dist + prisma assets. ~150MB total.
#
# Built from the monorepo root so pnpm workspaces resolve correctly:
#   docker build -f apps/api/Dockerfile -t codesensei-api .

# ─── deps stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /repo

RUN corepack enable

# Copy workspace manifests first so the install layer caches on lockfile only
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/

RUN pnpm install --frozen-lockfile

# ─── build stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /repo

RUN corepack enable

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY . .

WORKDIR /repo/apps/api
RUN pnpm db:generate
RUN pnpm build

# Drop dev dependencies from node_modules so the runner stage gets a
# slim production tree.
RUN pnpm prune --prod

# ─── runner stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /repo/apps/api

ENV NODE_ENV=production \
    API_PORT=3001

RUN addgroup -S nodejs && adduser -S nest -G nodejs

# Copy compiled JS + production node_modules + Prisma generated client
COPY --from=build --chown=nest:nodejs /repo/apps/api/dist ./dist
COPY --from=build --chown=nest:nodejs /repo/apps/api/node_modules ./node_modules
COPY --from=build --chown=nest:nodejs /repo/apps/api/prisma ./prisma
COPY --from=build --chown=nest:nodejs /repo/apps/api/package.json ./

USER nest

EXPOSE 3001

# Healthcheck hits the same /health endpoint the app exposes; Docker
# marks the container unhealthy if it returns non-2xx for 30s.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.API_PORT||3001)+'/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
