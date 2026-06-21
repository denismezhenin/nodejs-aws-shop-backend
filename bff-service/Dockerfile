# syntax=docker/dockerfile:1

# ---------- builder ----------
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json && test -f dist/server.js

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node --from=builder /app/dist ./dist

EXPOSE 8080
USER node
CMD ["node", "dist/server.js"]
