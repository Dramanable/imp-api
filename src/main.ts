import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { I18nService, I18nValidationPipe } from 'nestjs-i18n';
import compression from '@fastify/compress';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { AppModule } from './app.module';

/** Resolve the primary language code from an Accept-Language header value. */
function resolveLang(acceptLang?: string): string {
  if (!acceptLang) return 'fr';
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const primary = acceptLang.split(',')[0]!.split(';')[0]!.trim().slice(0, 2).toLowerCase();
  return ['fr', 'en'].includes(primary) ? primary : 'fr';
}

/** Fallback rate-limit message when i18n translation is unavailable. */
function fallbackRateLimit(lang: string): string {
  return lang === 'en'
    ? `Too many requests. Please wait before retrying.`
    : `Trop de requêtes. Veuillez patienter avant de réessayer.`;
}

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

  // ── Compression (gzip → deflate) ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(compression as any, {
    global: true,
    threshold: 1024,
    encodings: ['gzip', 'deflate'],
  });

  // @fastify/compress 8.x produces Content-Length: 0 (empty body) for
  // dynamically-generated string payloads (e.g. swagger-ui-init.js) when any
  // compression encoding is negotiated — this is a known incompatibility with
  // Fastify v5 + Node 24.  Work around it by forcing identity encoding on all
  // Swagger UI routes so the compress onSend hook skips them entirely.
  app.getHttpAdapter().getInstance().addHook(
    'onRequest',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request: any, _reply: any, done: () => void) => {
      if (request.url?.startsWith('/api/docs')) {
        request.headers['accept-encoding'] = 'identity';
      }
      done();
    },
  );

  // ── Rate limiting ────────────────────────────────────────────────────────
  // Protects the LLM endpoint from abuse: 20 requests per minute per IP.
  // The 429 response includes a Retry-After header so clients can back off.
  // Disabled in development to avoid friction during local testing.
  const i18nService = app.get<I18nService>(I18nService);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (isProduction) await app.register(rateLimit as any, {
    max: 20,
    timeWindow: '1 minute',
    errorResponseBuilder: (
      request: { headers: Record<string, string | string[] | undefined> },
      context: { max: number; ttl: number },
    ) => {
      const headerLang = request.headers['accept-language'];
      const acceptLang = Array.isArray(headerLang) ? headerLang.at(0) : headerLang;
      const lang = resolveLang(acceptLang);
      let message: string;
      try {
        const translated = i18nService.t('errors.rate_limit.exceeded', { lang }) as string;
        message = translated && translated !== 'errors.rate_limit.exceeded' ? translated : fallbackRateLimit(lang);
      } catch {
        message = fallbackRateLimit(lang);
      }
      return {
        statusCode: 429,
        error: 'rate_limit.exceeded',
        message,
        retryAfter: Math.ceil(context.ttl / 1000),
      };
    },
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
  // I18nValidationPipe extends ValidationPipe and wires an i18nValidationErrorFactory
  // that translates class-validator constraint messages using the request's I18nContext
  // before the exception is thrown. The ValidationExceptionFilter (registered in
  // LinkedInPostModule via APP_FILTER) catches the resulting I18nValidationException and
  // formats the translated messages into the project's standard error envelope.
  app.useGlobalPipes(
    new I18nValidationPipe({
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
- **gzip / deflate compression** on all non-SSE responses via \`@fastify/compress\`
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
    .addTag('LinkedIn Post Generation', 'Generate LinkedIn posts via LLM (JSON and streaming)')
    .addTag('Health', 'Service health check')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'list',
      filter: true,
      displayRequestDuration: true,
    },
  });

  // ── Start ────────────────────────────────────────────────────────────────
  await app.listen(port, '0.0.0.0');
}
bootstrap();

