import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import compression from '@fastify/compress';
import helmet from '@fastify/helmet';
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

  // ── Security headers (OWASP hardening) ──────────────────────────────────
  // Helmet sets Content-Security-Policy, X-Frame-Options, HSTS, etc.
  // crossOriginResourcePolicy is relaxed to allow Swagger UI assets across origins.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(helmet as any, {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Disable CSP in development so Swagger UI works without 'nonce' configuration.
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  });

  // ── Compression (Brotli → gzip → deflate) ───────────────────────────────
  // Compress all non-SSE responses. The SSE endpoint sets its own headers and
  // the stream bypass is handled at the Fastify level via the content-type check.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(compression as any, {
    global: true,
    // Only compress responses above 1 KB.
    threshold: 1024,
    encodings: ['br', 'gzip', 'deflate'],
  });

  // ── Routing ─────────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── CORS ─────────────────────────────────────────────────────────────────
  // Allowed origins come from the CORS_ORIGIN env variable (comma-separated list).
  // Falls back to '*' when absent (development only – lock this down in production).
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
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
  const config = new DocumentBuilder()
    .setTitle('LinkedIn Post Generator API')
    .setDescription(
      `## Overview
A backend service that generates LinkedIn posts tailored to French SMEs.
Provide your company description, a short brief, and the desired tone of voice —
the service handles prompt engineering, LLM orchestration, caching, and streaming.

## Key features
- **Fully localised** prompts and error messages (French 🇫🇷 / English 🇬🇧) via \`Accept-Language\`
- **Open tone-of-voice**: predefined suggestions or any custom string (e.g. \`"empathetic and bold"\`)
- **Server-side cache** (in-memory, TTL configurable via \`CACHE_TTL_MS\`) to avoid redundant LLM calls
- **Streaming endpoint** (\`POST /linkedin-post/generate/stream\`) using Server-Sent Events
- **Brotli / gzip compression** on all non-SSE responses
- **Structured JSON logging** with Pino
- LinkedIn post limited to **1,300 characters** (platform limit)

## Authentication
No authentication is required. The OpenAI API key is stored server-side and never exposed.

## Language detection
Set the \`Accept-Language\` header to \`fr\` (default) or \`en\`.
Both the LLM prompt and error messages will be in the selected language.`,
    )
    .setVersion('1.0')
    .addServer('http://localhost:3000', 'Local development')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  // ── Start ────────────────────────────────────────────────────────────────
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
