# syntax=docker/dockerfile:1.7

# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=NODE_AUTH_TOKEN \
    --mount=type=cache,target=/root/.npm \
    NODE_AUTH_TOKEN="$(cat /run/secrets/NODE_AUTH_TOKEN)" npm ci

# ---- prisma generate ----
FROM node:20-alpine AS prisma
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
RUN npx prisma generate

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=prisma /app/node_modules ./node_modules
COPY package.json tsconfig.json tsconfig.base.json tsconfig.build.json ./
COPY src ./src
RUN npx tsc --project tsconfig.build.json

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --chown=app:app --from=deps /app/node_modules ./node_modules
COPY --chown=app:app --from=prisma /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=app:app --from=build /app/dist ./dist
COPY --chown=app:app package.json ./
COPY --chown=app:app prisma ./prisma
USER app
EXPOSE 3000
CMD ["node", "dist/server.js"]
