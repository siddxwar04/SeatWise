# Build context is the REPO ROOT, so the workspace lockfile is available and
# npm can resolve the workspace graph in one install.
#
#   docker build -f apps/api/Dockerfile --target production .

FROM node:22-alpine AS base
WORKDIR /app
# Prisma's query engine needs OpenSSL; the alpine image does not ship it.
RUN apk add --no-cache openssl

# --- dependencies -----------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci --include-workspace-root --workspace @tastyfood/api

# --- development ------------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npx prisma generate
EXPOSE 4000
CMD ["npm", "run", "dev"]

# --- production -------------------------------------------------------------
# There is no build step: the source is plain JavaScript and ships as-is.
FROM base AS production
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --omit=dev --include-workspace-root --workspace @tastyfood/api \
  && npm cache clean --force

COPY apps/api/src ./apps/api/src
COPY apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
RUN npx prisma generate

# Drop root. The node image ships an unprivileged `node` user already.
USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
