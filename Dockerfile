# PlayMeld Dockerfile - multi-stage for production
# Supports both Next.js app and BullMQ worker

# Base stage with Node.js
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

# Dependencies stage
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --only=production --ignore-scripts && npm cache clean --force
# Also install dev deps for build
RUN npm ci --ignore-scripts

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma? No, Drizzle - no extra step
# Build Next.js
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Production runner stage for Next.js
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# For Drizzle migrations
COPY --from=builder /app/db ./db
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]

# Worker stage - for BullMQ worker
FROM base AS worker
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production --ignore-scripts
COPY --from=deps /app/node_modules ./node_modules

COPY lib ./lib
COPY db ./db
COPY drizzle.config.ts ./

ENV NODE_ENV production

# Worker command
CMD ["npm", "run", "worker"]
