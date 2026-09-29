# PM-Central — portable production image.
# Builds the Next.js standalone server so the app runs the same on any host
# (Railway, Render, Fly, a VPS) or locally via docker-compose. Requires a
# Postgres DATABASE_URL at runtime.

# ---- deps: install all packages (build needs devDependencies) ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# openssl is required by Prisma's query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json ./
# No lockfile is committed, so use install (not ci). postinstall runs
# `prisma generate`, which needs the schema present.
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

# ---- build: generate client + compile the app ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---- run: minimal standalone server ----
FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# Standalone server + static assets + public files.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Ensure the Prisma client + query engine are present alongside the traced deps.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
EXPOSE 3000
CMD ["node", "server.js"]
