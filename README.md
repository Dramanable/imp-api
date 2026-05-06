# LinkedIn Post Generator API

A production-ready REST API that generates LinkedIn posts tailored to French SMEs. Provide a company description, a brief, and a tone — the service handles prompt engineering, LLM orchestration, server-side caching, and streaming.

**Live:** https://impalia-server.a3s-securite.com/api/v1  
**Swagger UI:** https://impalia-server.a3s-securite.com/docs

---

## Features

- **Streaming (SSE)** — token-by-token delivery via `POST /linkedin-post/generate/stream`
- **Non-streaming** — full JSON response via `POST /linkedin-post/generate`
- **Server-side cache** — Redis-backed, 1-hour TTL, keyed on (description + brief + tone + lang)
- **Full i18n** — prompts and all error messages localised in French 🇫🇷 and English 🇬🇧
- **Rate limiting** — 20 req/min per IP (translated 429 response)
- **Prompt injection protection** — 14 pattern checks + special-character ratio guard
- **Health endpoint** — `GET /health` reports Redis connectivity and uptime
- **Strict TypeScript** — `strictNullChecks`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **52 tests** — 32 unit + 20 E2E (all green)

---

## Architecture

```
Clean Architecture + DDD
─────────────────────────────────────────────────────
core/          Pure TypeScript — Domain + Application
  ├── linkedin-post/
  │   ├── domain/         Entities, VOs, Exceptions, Service interfaces
  │   └── application/    Use Cases (GenerateLinkedInPostUseCase)
  └── shared/             DomainException, ICacheService, ILogger

infrastructure/  NestJS adapters — implements core interfaces
  └── linkedin-post/
      ├── services/       OpenAI, Redis cache, Pino logger, Input sanitizer
      └── linkedin-post.module.ts   DI wiring

presentation/    HTTP layer
  └── rest/
      ├── features/       Controllers + DTOs
      ├── filters/        DomainExceptionFilter (i18n error translation)
      └── security/       (rate-limit configured in main.ts)
```

**Key rule:** `core/` has zero framework dependencies (no NestJS, no Node.js crypto, no npm packages). Everything external is injected via interfaces.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 + Fastify 5 |
| Language | TypeScript 5 (strict mode) |
| LLM | OpenAI (`gpt-4o-mini`) via official SDK |
| Cache | Redis 7 via ioredis |
| i18n | nestjs-i18n (fr/en) |
| Logging | nestjs-pino (JSON structured) |
| Validation | class-validator + class-transformer |
| Rate limiting | @fastify/rate-limit |
| Security headers | @fastify/helmet |
| Package manager | pnpm 10 |
| Tests | Jest (unit) + Supertest (E2E) + nock (HTTP mocks) |
| Process manager | PM2 (cluster mode, 2 workers) |
| Reverse proxy | Nginx (SSE-aware, TLS termination) |

---

## Quick Start (local with Docker)

**Prerequisites:** Docker Desktop or Docker Engine + `make`

```bash
# 1. Clone the repository
git clone https://github.com/your-org/impalia-linkedin-api.git
cd impalia-linkedin-api/api

# 2. Configure environment
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-...

# 3. Start API + Redis
make dev-up

# 4. Open Swagger UI
open http://localhost:3000/docs
```

The API is now available at `http://localhost:3000/api/v1`.

---

## Local Development (without Docker)

```bash
# Install dependencies
pnpm install

# Start Redis (required)
redis-server &

# Start API in watch mode
pnpm start:dev

# Run all tests
make test
make test-e2e
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | ✅ | — | OpenAI API key |
| `LLM_PROVIDER` | | `openai` | LLM provider (`openai`) |
| `OPENAI_MODEL` | | `gpt-4o-mini` | OpenAI model name |
| `LLM_TEMPERATURE` | | `0.7` | Sampling temperature (0–1) |
| `LLM_MAX_TOKENS` | | `1024` | Max tokens per response |
| `PORT` | | `3000` | HTTP server port |
| `NODE_ENV` | | `development` | `development` or `production` |
| `CORS_ORIGIN` | | `*` | Comma-separated allowed origins |
| `LOG_LEVEL` | | `info` | Pino level: `trace`–`fatal` |
| `CACHE_TTL_MS` | | `3600000` | Cache TTL in milliseconds (1 h) |
| `REDIS_HOST` | | `127.0.0.1` | Redis hostname |
| `REDIS_PORT` | | `6379` | Redis port |
| `REDIS_PASSWORD` | | — | Redis AUTH password (optional) |

---

## API Endpoints

Base path: `/api/v1`

### `POST /linkedin-post/generate`

Generate a LinkedIn post (full JSON response).

**Request**
```json
{
  "companyDescription": "TechFlow est une PME spécialisée dans la transformation numérique.",
  "brief": "Annonce de recrutement : ingénieur DevOps senior.",
  "tone": "professional"
}
```

**Response `200`**
```json
{
  "post": "🚀 Nous recrutons un ingénieur DevOps...",
  "intentionNote": "L'accroche emoji crée un signal visuel fort...",
  "fromCache": false
}
```

**Error responses**

| Status | Condition |
|---|---|
| `400` | Empty input or prompt injection detected |
| `429` | Rate limit exceeded (20 req/min per IP) |
| `503` | LLM service unavailable |

---

### `POST /linkedin-post/generate/stream`

Same inputs as above — streams the response as Server-Sent Events:

```
data: {"type":"chunk","content":"🚀 Nous recrutons"}
data: {"type":"chunk","content":" un ingénieur"}
data: {"type":"note","content":"L'accroche emoji..."}
data: {"type":"done","fromCache":false}
```

On error:
```
data: {"type":"error","code":"linkedin-post.llm.unavailable","message":"Le service est temporairement indisponible...","statusCode":503}
```

---

### `GET /health`

```json
{
  "status": "ok",
  "redis": "up",
  "uptime": 3600.5,
  "timestamp": "2026-05-06T10:00:00.000Z"
}
```

`status` is `"degraded"` when Redis is unreachable (the API continues serving requests).

---

## Deployment to VPS

### First-time setup (run once)

```bash
# 1. Provision the VPS (Node 24, pnpm, Redis, Nginx, PM2, Certbot)
make vps-setup

# 2. Create .env on the VPS with production values
ssh amadou@84.247.160.53 "cat > /home/amadou/impalia/api/.env"
# Paste your production .env, then Ctrl+D

# 3. Install Nginx config
make vps-nginx

# 4. Obtain SSL certificate
make vps-ssl

# 5. First deployment
make vps-deploy
```

### Regular deployments

```bash
# Sync code + build + PM2 reload (zero-downtime)
make vps-deploy

# Or: build + reload without re-syncing (faster)
make vps-redeploy
```

### Monitoring

```bash
make vps-status    # PM2 + Redis + Nginx status
make vps-health    # Hit /api/v1/health on the live server
make vps-tail      # Follow PM2 logs in real time
make vps-logs      # Last 50 log lines
```

---

## Running Tests

```bash
# Unit tests (32)
pnpm test --no-coverage

# E2E tests (20) — no real Redis or OpenAI needed (all mocked)
pnpm test:e2e --no-coverage

# All tests with Docker
make dev-test
```

---

## Known Limits

- **Single LLM provider** — only OpenAI is wired; Anthropic and Mistral are stub-ready via `createLlmProvider()` factory but not implemented.
- **In-memory rate-limit state** — not shared across PM2 workers; each worker has its own counter. A Redis-backed store would be needed for exact per-IP accounting at scale.
- **No authentication** — the API is public. A JWT guard or API-key middleware would be required before production exposure.
- **Cache invalidation** — no manual invalidation endpoint; cache expires after `CACHE_TTL_MS` (default 1 h).

---

## Roadmap (6-month industrialisation)

1. **Multi-LLM** — implement Anthropic Claude and Mistral providers
2. **Auth** — API key or OAuth 2.0 per tenant
3. **Distributed rate limiting** — Redis-backed `@fastify/rate-limit` store
4. **Frontend** — React + Vite UI (streaming display, copy button, tone selector)
5. **CI/CD** — GitHub Actions: lint → test → Docker build → VPS deploy on merge to `main`
6. **Observability** — OpenTelemetry traces + Grafana dashboard

---

## License

Private — Impalia technical assessment. Not for public distribution.
