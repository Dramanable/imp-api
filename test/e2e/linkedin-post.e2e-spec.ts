import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { join } from 'path';
import { AcceptLanguageResolver, I18nModule, QueryResolver } from 'nestjs-i18n';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LinkedInPostModule } from '../../src/infrastructure/linkedin-post/linkedin-post.module';
import { POST_GENERATION_SERVICE } from '../../src/core/linkedin-post/domain/services/post-generation.service.interface';
import { LOGGER } from '../../src/core/shared/interfaces/logger.interface';
import { GeneratedPost } from '../../src/core/linkedin-post/domain/entities/generated-post.entity';
import { LlmUnavailableException } from '../../src/core/linkedin-post/domain/exceptions/llm-unavailable.exception';
import { DomainExceptionFilter } from '../../src/presentation/rest/filters/domain-exception.filter';

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_PAYLOAD = {
  companyDescription:
    'TechFlow est une PME française spécialisée dans la transformation numérique des PME industrielles.',
  brief: 'Annonce de recrutement : nous cherchons un ingénieur DevOps senior.',
  tone: 'professional',
};

const NULL_LOGGER = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

async function* fakeStream(post: string, note: string): AsyncGenerator<string> {
  yield post;
  yield '---NOTE---';
  yield note;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('LinkedInPostController (e2e)', () => {
  let app: INestApplication<App>;

  const mockPostGenerationService = {
    generate: jest.fn(),
    generateStream: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        I18nModule.forRoot({
          fallbackLanguage: 'fr',
          loaderOptions: {
            path: join(__dirname, '../../src/i18n'),
          },
          resolvers: [
            { use: QueryResolver, options: ['lang'] },
            AcceptLanguageResolver,
          ],
        }),
        LinkedInPostModule,
      ],
    })
      .overrideProvider(POST_GENERATION_SERVICE)
      .useValue(mockPostGenerationService)
      .overrideProvider(LOGGER)
      .useValue(NULL_LOGGER)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── POST /generate ─────────────────────────────────────────────────────────

  describe('POST /api/v1/linkedin-post/generate', () => {
    it('should return 200 with a generated post', async () => {
      mockPostGenerationService.generate.mockResolvedValueOnce(
        new GeneratedPost(
          'Nous recrutons un ingénieur DevOps ! Rejoignez TechFlow.',
          "L'accroche directe cible les professionnels en quête d'opportunités.",
        ),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate')
        .send(VALID_PAYLOAD)
        .expect(200);

      expect(response.body).toHaveProperty('post');
      expect(response.body).toHaveProperty('intentionNote');
      expect(response.body).toHaveProperty('fromCache', false);
      expect(mockPostGenerationService.generate).toHaveBeenCalledTimes(1);
    });

    it('should return the cached response on identical second request', async () => {
      mockPostGenerationService.generate.mockResolvedValueOnce(
        new GeneratedPost('Cached post content', 'Cached intention note'),
      );

      const payload = {
        companyDescription: 'Unique company for cache test',
        brief: 'Unique brief for cache test',
        tone: 'casual',
      };

      await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate')
        .send(payload)
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate')
        .send(payload)
        .expect(200);

      expect(response.body.fromCache).toBe(true);
      expect(response.body.post).toBe('Cached post content');
      expect(mockPostGenerationService.generate).toHaveBeenCalledTimes(1);
    });

    it('should return 400 when companyDescription is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate')
        .send({ ...VALID_PAYLOAD, companyDescription: '' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when brief is missing', async () => {
      const { brief: _brief, ...withoutBrief } = VALID_PAYLOAD;
      await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate')
        .send(withoutBrief)
        .expect(400);
    });

    it('should return 400 when companyDescription exceeds 2000 characters', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate')
        .send({ ...VALID_PAYLOAD, companyDescription: 'a'.repeat(2001) })
        .expect(400);
    });

    it('should return 400 when brief exceeds 500 characters', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate')
        .send({ ...VALID_PAYLOAD, brief: 'b'.repeat(501) })
        .expect(400);
    });

    it('should return 400 when tone is empty', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate')
        .send({ ...VALID_PAYLOAD, tone: '' })
        .expect(400);
    });

    it('should return 400 when tone exceeds 100 characters', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate')
        .send({ ...VALID_PAYLOAD, tone: 'a'.repeat(101) })
        .expect(400);
    });

    it('should accept a custom tone string (open tone-of-voice)', async () => {
      mockPostGenerationService.generate.mockResolvedValueOnce(
        new GeneratedPost('Post with custom tone', 'Note for custom tone'),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate')
        .send({ ...VALID_PAYLOAD, tone: 'empathetic and bold', companyDescription: 'Custom tone company', brief: 'Custom tone brief' })
        .expect(200);

      expect(response.body).toHaveProperty('post', 'Post with custom tone');
    });

    it('should return 503 when the LLM service is unavailable', async () => {
      mockPostGenerationService.generate.mockRejectedValueOnce(
        new LlmUnavailableException('linkedin-post.llm.unavailable'),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate')
        .send({
          companyDescription: 'Company for LLM error test',
          brief: 'Brief for LLM error test',
          tone: 'expert',
        })
        .expect(503);

      expect(response.body).toHaveProperty('statusCode', 503);
      expect(response.body).toHaveProperty('error', 'linkedin-post.llm.unavailable');
    });

    it('should return a validation error message for empty companyDescription', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate')
        .send({ ...VALID_PAYLOAD, companyDescription: '' })
        .expect(400);

      // NestJS ValidationPipe returns message as an array of strings
      const messages: string[] = Array.isArray(response.body.message)
        ? response.body.message
        : [response.body.message];
      expect(messages.some((m: string) => /description/i.test(m))).toBe(true);
    });

    it('should return 400 for empty companyDescription with Accept-Language en', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate')
        .set('Accept-Language', 'en')
        .send({ ...VALID_PAYLOAD, companyDescription: '' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should accept all predefined tone values and custom tone strings', async () => {
      const tones = ['professional', 'casual', 'inspiring', 'expert', 'empathetic and bold'];

      for (const tone of tones) {
        mockPostGenerationService.generate.mockResolvedValueOnce(
          new GeneratedPost(`Post for ${tone}`, `Note for ${tone}`),
        );

        await request(app.getHttpServer())
          .post('/api/v1/linkedin-post/generate')
          .send({
            companyDescription: `Company for tone ${tone} e2e`,
            brief: `Brief for tone ${tone} e2e`,
            tone,
          })
          .expect(200);
      }
    });
  });

  // ── POST /generate/stream ──────────────────────────────────────────────────

  describe('POST /api/v1/linkedin-post/generate/stream', () => {
    function parseSseBody(body: string): Array<Record<string, unknown>> {
      return body
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.replace('data: ', '').trim()));
    }

    it('should stream chunk, note, and done events', async () => {
      mockPostGenerationService.generateStream.mockImplementation(() =>
        fakeStream('Post content here', 'Intention note here.'),
      );

      let rawBody = '';
      const response = await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate/stream')
        .send({
          companyDescription: 'Stream test company unique 1',
          brief: 'Stream test brief unique 1',
          tone: 'inspiring',
        })
        .buffer(true)
        .parse((_res, callback) => {
          let data = '';
          _res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          _res.on('end', () => { rawBody = data; callback(null, data); });
        });

      expect(response.headers['content-type']).toMatch('text/event-stream');

      const events = parseSseBody(rawBody);
      const types = events.map((e) => e.type);

      expect(types).toContain('chunk');
      expect(types).toContain('note');
      expect(types.at(-1)).toBe('done');

      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent?.fromCache).toBe(false);
    });

    it('should return 400 for an empty tone in the streaming payload', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/linkedin-post/generate/stream')
        .send({ ...VALID_PAYLOAD, tone: '' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });
});


