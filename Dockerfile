# ── Build base: lightweight image for dependency install & build ──────
FROM node:20-alpine AS build-base

# ── Runtime base: includes system packages needed for media processing ─
FROM node:20-alpine AS runtime-base
RUN apk add --no-cache ffmpeg fontconfig ttf-dejavu vips chromium nss freetype harfbuzz ca-certificates
ENV CHROME_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# ── Install dependencies (lightweight base — no chromium/ffmpeg) ─────
FROM build-base AS deps
WORKDIR /app

# Skip Chromium download for puppeteer-core
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package.json package-lock.json* ./

# Cache npm downloads for faster reinstalls after lockfile changes
RUN npm ci

# ── Build the application ────────────────────────────────────────────
FROM build-base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Dummy DATABASE_URL for prisma generate (not used for actual DB connection)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
# Skip Prisma engine checksum verification (helps with network issues in CI)
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

# Build args for Next.js public env vars (required at build time)
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

# Build the application
RUN npm run build

# ── Production image (runtime base with media tools) ─────────────────
FROM runtime-base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create directories for uploads and processed files (including /data for Railway volume mount)
RUN mkdir -p /app/uploads /app/processed /data/uploads /data/processed

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder /app/node_modules/@img ./node_modules/@img
COPY --from=builder /app/node_modules/puppeteer-core ./node_modules/puppeteer-core
COPY --from=builder /app/node_modules/openai ./node_modules/openai

# Install prisma CLI globally for database migrations
RUN npm install -g prisma@6.19.2

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy and use startup script that runs migrations before starting
COPY --from=builder /app/start.sh ./start.sh
RUN chmod +x ./start.sh

CMD ["./start.sh"]
