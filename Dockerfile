# ─────────────────────────────────────────────────────────────────────────────
#  Multi-stage Dockerfile — LinkedIn Post Generator API
#  Stack: NestJS 11 + Fastify + Node 24 Alpine
#
#  Stages:
#   builder    – install all deps + compile TypeScript → dist/
#   production – install prod-only deps + copy dist/   → slim image
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Enable corepack and pin pnpm version for reproducible installs
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Install ALL dependencies (devDependencies needed for the TypeScript build)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and compile
# nest-cli.json copies i18n/** assets into dist/ automatically
COPY . .
RUN pnpm build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:24-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Install production dependencies only (no devDependencies)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from the builder stage.
# dist/i18n/ is included automatically (nest-cli assets: "i18n/**/*").
COPY --from=builder /app/dist ./dist

# Non-root user for security (OWASP: least-privilege principle)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# Health check via the /api/v1/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/main"]
