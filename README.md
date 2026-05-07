# LinkedIn Post Generator API

> Production-ready REST API that generates LinkedIn posts for French SMEs.  
> Provide a company description, a brief, and a tone of voice — the service handles prompt engineering, LLM orchestration, Redis caching, and real-time streaming.

**Live:** https://impalia-server.a3s-securite.com/api/v1  
**Swagger UI:** https://impalia-server.a3s-securite.com/api/docs

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Quick Start (Docker)](#quick-start-docker)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Frontend Integration (SSE)](#frontend-integration-sse)
- [Running Tests](#running-tests)
- [Deployment to VPS](#deployment-to-vps)
- [Known Limits](#known-limits)
- [Roadmap](#roadmap)

---

## Features

| Feature | Details |
|---|---|
| **Streaming (SSE)** | Token-by-token delivery via `POST /linkedin-post/generate/stream` — returns `HTTP 200` |
| **Non-streaming** | Full JSON response via `POST /linkedin-post/generate` |
| **Redis cache** | 1-hour TTL, keyed on `(description + brief + tone + lang)` |
| **i18n** | Prompts and all error messages in French 🇫🇷 and English 🇬🇧 via `Accept-Language` |
| **Rate limiting** | 20 req/min per IP in production (translated 429 response) |
| **Prompt injection guard** | 14 pattern checks + special-character ratio heuristic |
| **Health endpoint** | `GET /health` reports Redis connectivity and process uptime |
| **Strict TypeScript** | `strictNullChecks`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| **Test coverage** | 32 unit + 20 E2E tests (all green, fully mocked — no real LLM or Redis needed) |

---

## Architecture

Clean Architecture + DDD — `core/` has **zero framework dependencies**.

```
src/
├── core/                    # Pure TypeScript — Domain + Application
│   ├── linkedin-post/
│   │   ├── domain/          # Entities, Value Objects, Exceptions, Service interfaces
│   │   └── application/     # Use Cases (GenerateLinkedInPostUseCase)
│   └── shared/              # DomainException, ICacheService, ILogger
│
├── infrastructure/          # NestJS adapters — implements core interfaces
│   └── linkedin-post/
│       ├── services/        # OpenAI, Redis cache, Pino logger, Input sanitizer
│       └── linkedin-post.module.ts   # DI wiring
│
├── presentation/            # HTTP layer
│   └── rest/
│       ├── features/        # Controllers + DTOs (with full Swagger docs)
│       └── filters/         # DomainExceptionFilter (i18n error translation)
│
├── i18n/                    # Localisation catalogues (fr / en)
└── test/e2e/                # End-to-end tests (Supertest, fully mocked)
```

**Dependency rule:** `core/` never imports from `infrastructure/` or `presentation/`. All I/O is injected via interfaces (ports).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 + Fastify 5 |
| Language | TypeScript 5 (strict mode) |
| LLM | OpenAI (`gpt-4o-mini`) via official SDK |
| Cache | Redis 7 via ioredis |
| i18n | nestjs-i18n (fr / en) |
| Logging | nestjs-pino (JSON structured) |
| Validation | class-validator + class-transformer |
| Compression | @fastify/compress (gzip/deflate, disabled on SSE routes) |
| Rate limiting | @fastify/rate-limit |
| Security headers | @fastify/helmet (OWASP) |
| Package manager | pnpm 10 |
| Tests | Jest (unit) + Supertest (E2E) |
| Process manager | PM2 (cluster mode, 2 workers) |
| Reverse proxy | Nginx (SSE-aware, TLS termination via Certbot) |

---

## Quick Start (Docker)

**Prerequisites:** Docker Engine ≥ 24.

```bash
# 1. Clone
git clone https://github.com/Dramanable/imp-api.git
cd imp-api

# 2. Configure environment
cp .env.example .env
# Open .env and set:  OPENAI_API_KEY=sk-...

# 3. Start API + Redis
docker compose up -d

# 4. Open Swagger UI
open http://localhost:3000/api/docs
```

The API is available at `http://localhost:3000/api/v1`.

---

## Local Development

```bash
# Install dependencies
pnpm install

# Start Redis (required)
redis-server --daemonize yes

# Start API in watch mode (hot-reload)
pnpm start:dev

# Lint
pnpm lint
```

> **Docker is preferred** — it ensures Redis is available and `.env` is loaded automatically.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | ✅ | — | OpenAI API key (`sk-...`) |
| `LLM_PROVIDER` | | `openai` | LLM backend — only `openai` supported |
| `OPENAI_MODEL` | | `gpt-4o-mini` | OpenAI model name |
| `LLM_TEMPERATURE` | | `0.7` | Sampling temperature (0.0 – 1.0) |
| `LLM_MAX_TOKENS` | | `1024` | Max tokens per completion |
| `PORT` | | `3000` | HTTP server port |
| `NODE_ENV` | | `development` | `development` or `production` |
| `CORS_ORIGIN` | | `*` | Comma-separated allowed origins |
| `LOG_LEVEL` | | `info` | Pino level: `trace` \| `debug` \| `info` \| `warn` \| `error` |
| `CACHE_TTL_MS` | | `3600000` | Cache TTL in milliseconds (default: 1 h) |
| `REDIS_HOST` | | `127.0.0.1` | Redis hostname |
| `REDIS_PORT` | | `6379` | Redis port |
| `REDIS_PASSWORD` | | — | Redis `AUTH` password (optional) |

> **Never commit `.env`** — it is excluded by `.gitignore`. See `.env.example` for the template.

---

## API Reference

Base URL: `/api/v1`

### `POST /linkedin-post/generate` — JSON response

**Request body**

```json
{
  "companyDescription": "TechFlow est une PME spécialisée dans la transformation numérique.",
  "brief": "Annonce de recrutement : ingénieur DevOps senior.",
  "tone": "professional"
}
```

| Field | Type | Constraints |
|---|---|---|
| `companyDescription` | `string` | 1 – 2 000 chars, required |
| `brief` | `string` | 1 – 500 chars, required |
| `tone` | `string` | 1 – 100 chars — predefined (`professional` \| `casual` \| `inspiring` \| `expert`) or any custom string |

**Response `200`**

```json
{
  "post": "🚀 TechFlow recrute un ingénieur DevOps senior...",
  "intentionNote": "L'accroche emoji crée un signal visuel fort dans le fil d'actualité.",
  "fromCache": false
}
```

**Error responses**

| Status | Condition |
|---|---|
| `400` | Missing/empty field, length exceeded, or prompt injection detected |
| `429` | Rate limit exceeded (20 req/min per IP) — includes `retryAfter` in seconds |
| `503` | OpenAI service unavailable |

---

### `POST /linkedin-post/generate/stream` — Server-Sent Events

Same request body as above. Returns `HTTP 200` with `Content-Type: text/event-stream`.

**Event sequence**

```
data: {"type":"chunk","content":"🚀 TechFlow recrute"}

data: {"type":"chunk","content":" un ingénieur DevOps"}

data: {"type":"note","content":"L'accroche emoji crée un signal visuel fort..."}

data: {"type":"done","fromCache":false}
```

| Event type | When | Payload |
|---|---|---|
| `chunk` | During generation, per LLM token | `{ type, content: string }` |
| `note` | After the post is complete | `{ type, content: string }` — full editorial intention note |
| `done` | End of stream | `{ type, fromCache: boolean }` |
| `error` | On domain or LLM error | `{ type, code, message, statusCode }` |

> **Cache behaviour:** identical requests are served from Redis. The post is still streamed as chunks; `done.fromCache` will be `true`.

---

### `GET /health`

```json
{
  "status": "ok",
  "redis": "up",
  "uptime": 3600.5,
  "timestamp": "2026-05-07T10:00:00.000Z"
}
```

`status` is `"degraded"` when Redis is unreachable — the API continues serving requests.

---

## Frontend Integration (SSE)

The stream endpoint always returns **HTTP 200**. Use a `fetch`-based reader (not `EventSource`, which does not support `POST`):

```js
const response = await fetch('/api/v1/linkedin-post/generate/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept-Language': 'fr',
  },
  body: JSON.stringify({ companyDescription, brief, tone }),
});

if (!response.ok) throw new Error(`HTTP ${response.status}`);

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';   // keep incomplete line for next iteration

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));

    if (event.type === 'chunk') appendToPost(event.content);
    if (event.type === 'note')  setEditorialNote(event.content);
    if (event.type === 'done')  setFromCache(event.fromCache);
    if (event.type === 'error') handleError(event);
  }
}
```

> **Vite dev proxy note:** if your frontend runs behind a Vite dev proxy, set `changeOrigin: true` in the proxy config. The API already disables `@fastify/compress` on the stream route to guarantee real-time event delivery.

---

## Running Tests

```bash
# Unit tests (32)
pnpm test --no-coverage

# E2E tests (20) — fully mocked, no real Redis or OpenAI needed
pnpm test:e2e --no-coverage

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:cov
```

---

## Deployment to VPS

### First-time setup (run once)

```bash
# 1. Provision the VPS (Node 24, pnpm, Redis, Nginx, PM2, Certbot)
make vps-setup

# 2. Create the production .env on the VPS
ssh <user>@<vps-ip> "cat > ~/impalia/api/.env"
# Paste your production .env content, then Ctrl+D

# 3. Install Nginx configuration
make vps-nginx

# 4. Obtain TLS certificate (Let's Encrypt)
make vps-ssl

# 5. First deployment
make vps-deploy
```

### Regular deployments

```bash
# Sync code + build + PM2 zero-downtime reload
make vps-deploy

# Build + reload only (skip rsync, faster when only source changed)
make vps-redeploy
```

### Monitoring

```bash
make vps-status    # PM2 + Redis + Nginx status overview
make vps-health    # Curl GET /health on the live server
make vps-tail      # Follow PM2 logs in real time
make vps-logs      # Print last 50 log lines
```

---

## Known Limits

- **Single LLM provider** — only OpenAI is implemented. Anthropic and Mistral can be added via the `createLlmProvider()` factory without touching any other layer.
- **In-memory rate-limit state** — not shared across PM2 workers. A Redis-backed store is needed for exact per-IP accounting in a multi-worker setup.
- **No authentication** — the API is public. Add an API-key guard or OAuth 2.0 before exposing it broadly.
- **No cache invalidation endpoint** — entries expire automatically after `CACHE_TTL_MS` (default 1 h).

---

## Roadmap

1. **Multi-LLM** — Anthropic Claude and Mistral adapters
2. **Authentication** — API key or OAuth 2.0 per client
3. **Distributed rate limiting** — Redis-backed `@fastify/rate-limit` store
4. **Frontend** — React + Vite UI (live streaming display, copy button, tone selector)
5. **CI/CD** — GitHub Actions: lint → test → Docker build → VPS deploy on merge to `main`
6. **Observability** — OpenTelemetry traces + Grafana dashboard

---

## License

Private — Impalia technical assessment. Not for public distribution.
