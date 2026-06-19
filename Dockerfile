# syntax=docker/dockerfile:1

# ---------- builder ----------
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY cart-service/package.json cart-service/package.json
COPY cart-service/tsconfig.json cart-service/tsconfig.json
COPY cart-service/src cart-service/src
RUN npx tsc -p cart-service/tsconfig.json && test -f cart-service/dist/main.js

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node cart-service/package.json cart-service/package.json
COPY --chown=node:node --from=builder /app/cart-service/dist cart-service/dist


EXPOSE 4000
USER node
CMD ["node", "cart-service/dist/main.js"]
