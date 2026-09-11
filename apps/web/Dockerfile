# Build context is the REPO ROOT.
#
#   docker build -f apps/web/Dockerfile --target production .

FROM node:22-alpine AS base
WORKDIR /app

# --- dependencies -----------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci --include-workspace-root --workspace @seatwise/web

# --- development ------------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/web ./apps/web
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# --- build ------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN npm run build

# --- production -------------------------------------------------------------
# Static files only — nginx serves them directly. No Node process in prod.
#
# nginx.conf is a template, not a config file: it's copied into
# /etc/nginx/templates/, where the base image's entrypoint scripts run it
# through envsubst (substituting ${API_URL} from the container's environment)
# and write the result to /etc/nginx/conf.d/default.conf before nginx starts.
# This is what lets nginx proxy /api/* to a backend whose address is only
# known at deploy time (see nginx.conf.template for why that proxy exists).
FROM nginx:1.27-alpine AS production
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
# Railway assigns the port at runtime via $PORT and envsubst (the base image's
# entrypoint) needs it defined to render the template; 80 is just the local /
# docker-compose fallback when nothing overrides it.
ENV PORT=80
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
