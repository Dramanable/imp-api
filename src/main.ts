import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import compression from '@fastify/compress';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true },
  );

  // ── Logging ─────────────────────────────────────────────────────────────
  // Replace the default NestJS logger with the Pino instance configured in AppModule.
  app.useLogger(app.get(Logger));

  // Resolve configuration via ConfigService (never read process.env directly here).
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const corsOrigin = config.get<string>('CORS_ORIGIN', '*');
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';

  // ── Security headers (OWASP hardening) ──────────────────────────────────
  // Helmet sets Content-Security-Policy, X-Frame-Options, HSTS, etc.
  // crossOriginResourcePolicy is relaxed to allow Swagger UI assets across origins.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(helmet as any, {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // CSP is only enforced in production to keep the Swagger UI usable in dev.
    contentSecurityPolicy: isProduction,
  });

  // ── Compression (Brotli → gzip → deflate) ───────────────────────────────
  // Compresses all non-SSE responses above 1 KB.
  // SSE responses set their own Content-Type and are excluded automatically.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(compression as any, {
    global: true,
    threshold: 1024,
    encodings: ['br', 'gzip', 'deflate'],
  });

  // ── Rate limiting ────────────────────────────────────────────────────────
  // Protects the LLM endpoint from abuse: 20 requests per minute per IP.
  // The 429 response includes a Retry-After header so clients can back off.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(rateLimit as any, {
    max: 20,
    timeWindow: '1 minute',
    errorResponseBuilder: (
      _request: unknown,
      context: { max: number; ttl: number },
    ) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded: ${context.max} requests per minute allowed.`,
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
  });

  // ── Routing ─────────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── CORS ─────────────────────────────────────────────────────────────────
  // Allowed origins come from CORS_ORIGIN env variable (comma-separated list).
  // Falls back to '*' in development — lock this down in production.
  const origins = corsOrigin === '*' ? '*' : corsOrigin.split(',').map((o) => o.trim());
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept-Language',
      'Accept-Encoding',
      'X-Correlation-Id',
    ],
  });

  // ── Validation ───────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // Strip unknown properties silently.
      forbidNonWhitelisted: true, // Reject requests with unknown properties.
      transform: true,            // Auto-cast primitive types.
    }),
  );

  // ── Swagger (OpenAPI) ────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('LinkedIn Post Generator API')
    .setDescription(
      `## Overview
A backend service that generates LinkedIn posts tailored to French SMEs.
Provide your company description, a short brief, and the desired tone of voice —
the service handles prompt engineering, LLM orchestration, caching, and streaming.

## Key features
- **Fully localised** prompts and error messages (French 🇫🇷 / English 🇬🇧) via \`Accept-Language\`
- **Open tone-of-voice**: use predefined suggestions or any custom string (e.g. \`"empathetic and bold"\`)
- **Server-side cache** (in-memory, TTL configurable via \`CACHE_TTL_MS\`) to avoid redundant LLM calls
- **Streaming endpoint** (\`POST /linkedin-post/generate/stream\`) using Server-Sent Events
- **Brotli / gzip compression** on all non-SSE responses via \`@fastify/compress\`
- **Security headers** (Helmet/OWASP) via \`@fastify/helmet\`
- **Structured JSON logging** with Pino
- LinkedIn post limited to **1,300 characters** (LinkedIn platform limit)

## Authentication
No authentication is required. The OpenAI API key is stored server-side and never exposed to clients.

## Language detection
Set the \`Accept-Language\` header to \`fr\` (default) or \`en\`.
Both the LLM prompt and error messages are served in the selected language.

## Tone of voice
The \`tone\` field accepts any non-empty string (max 100 characters):
- Predefined values (\`professional\`, \`casual\`, \`inspiring\`, \`expert\`) get a rich, localised description sent to the LLM.
- Custom strings (e.g. \`"bienveillant et direct"\`) are forwarded verbatim — giving you full creative control.`,
    )
    .setVersion('1.0')
    .addServer(`http://localhost:${port}`, 'Local development')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  // ── Start ────────────────────────────────────────────────────────────────
  await app.listen(port, '0.0.0.0');
}
bootstrap();

