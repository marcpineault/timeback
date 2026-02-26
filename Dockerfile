# ── Build base: lightweight image for dependency install & build ──────
FROM node:20-alpine AS build-base

# ── Runtime base: includes system packages needed for media processing ─
FROM node:20-alpine AS runtime-base
RUN apk add --no-cache ffmpeg fontconfig ttf-dejavu vips chromium nss freetype harfbuzz ca-certificates \
    gcompat libstdc++
ENV CHROME_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# ── Install dependencies (lightweight base — no chromium/ffmpeg) ─────
FROM build-base AS deps
WORKDIR /app

# Skip Chromium download for puppeteer-core
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package.json package-lock.json* ./

# Install dependencies (layer cached when package.json + lockfile are unchanged)
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

# Cap heap to 1.5 GB and limit build workers to reduce peak memory usage.
# This prevents the Railway build daemon from OOM-killing the process
# (which surfaces as "context canceled").
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run build

# ── Production image (runtime base with media tools) ─────────────────
FROM runtime-base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install prisma CLI globally for database migrations
# Placed before COPY commands so this layer stays cached across code changes
RUN npm install -g prisma@6.19.2

# Create directories for uploads and processed files (including /data for Railway volume mount)
RUN mkdir -p /app/uploads /app/processed /data/uploads /data/processed

# Copy built application (changes on every code push)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy runtime deps after standalone so they overlay its node_modules
# Sourced from deps stage (stable — only changes when package.json changes)
COPY --from=deps /app/node_modules/sharp ./node_modules/sharp
COPY --from=deps /app/node_modules/@img ./node_modules/@img
COPY --from=deps /app/node_modules/puppeteer-core ./node_modules/puppeteer-core
COPY --from=deps /app/node_modules/openai ./node_modules/openai

# Silero VAD: ONNX runtime (WASM backend — no native/glibc dependency) and VAD model
COPY --from=deps /app/node_modules/onnxruntime-web ./node_modules/onnxruntime-web
COPY --from=deps /app/node_modules/onnxruntime-common ./node_modules/onnxruntime-common
COPY --from=deps /app/node_modules/@ricky0123 ./node_modules/@ricky0123

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy startup script directly from build context (cached unless start.sh changes)
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

CMD ["./start.sh"]
