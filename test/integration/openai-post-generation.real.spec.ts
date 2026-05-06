/**
 * Real integration tests for OpenAiPostGenerationService.
 *
 * These tests make ACTUAL HTTP requests to the OpenAI API using the credentials
 * from the .env file. They are intentionally separate from the unit/e2e tests
 * that use mocks.
 *
 * Requirements:
 *   - OPENAI_API_KEY must be set in .env
 *   - Network access to api.openai.com must be available
 *
 * Run with:
 *   npm run test:integration
 */

import { Test, TestingModule } from '@nestjs/testing';
import { join } from 'path';
import { AcceptLanguageResolver, I18nModule, I18nService, QueryResolver } from 'nestjs-i18n';
import { OpenAiPostGenerationService } from '../../src/infrastructure/linkedin-post/services/openai-post-generation.service';
import { PostGenerationRequest } from '../../src/core/linkedin-post/domain/value-objects/post-generation-request.vo';
import { GeneratedPost } from '../../src/core/linkedin-post/domain/entities/generated-post.entity';
import { LlmUnavailableException } from '../../src/core/linkedin-post/domain/exceptions/llm-unavailable.exception';

// ── Guards ────────────────────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE ?? '0.7');
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS ?? '1024', 10);

const RUN_TESTS = OPENAI_API_KEY.length > 0;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STANDARD_REQUEST = new PostGenerationRequest(
  'TechFlow est une PME française spécialisée dans la transformation numérique des PME industrielles.',
  'Annonce de recrutement : nous cherchons un ingénieur DevOps senior.',
  'professional',
  'fr',
);

const ENGLISH_REQUEST = new PostGenerationRequest(
  'TechFlow is a French SME specialised in digital transformation for industrial companies.',
  'Recruitment announcement: we are looking for a senior DevOps engineer.',
  'professional',
  'en',
);

const CUSTOM_TONE_REQUEST = new PostGenerationRequest(
  'BeautyLab est une startup cosmétique engagée dans la beauté naturelle et éthique.',
  'Lancement de notre nouvelle gamme de soins bio certifiés Ecocert.',
  'chaleureux et inspirant',
  'fr',
);

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('OpenAiPostGenerationService (real API)', () => {
  let service: OpenAiPostGenerationService;

  beforeAll(async () => {
    if (!RUN_TESTS) return;

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        I18nModule.forRoot({
          fallbackLanguage: 'fr',
          loaderOptions: { path: join(__dirname, '../../src/i18n') },
          resolvers: [
            { use: QueryResolver, options: ['lang'] },
            AcceptLanguageResolver,
          ],
        }),
      ],
    }).compile();

    const i18nService = module.get<I18nService>(I18nService);

    service = new OpenAiPostGenerationService(
      OPENAI_API_KEY,
      OPENAI_MODEL,
      i18nService,
      LLM_TEMPERATURE,
      LLM_MAX_TOKENS,
    );

    console.log(`\n  ► Model : ${OPENAI_MODEL}`);
    console.log(`  ► Key   : ${OPENAI_API_KEY.slice(0, 12)}…\n`);
  });

  // ── generate() ────────────────────────────────────────────────────────────

  describe('generate() — non-streaming', () => {
    it('should return a GeneratedPost with non-empty post and note', async () => {
      if (!RUN_TESTS) return;

      const result = await service.generate(STANDARD_REQUEST);

      expect(result).toBeInstanceOf(GeneratedPost);
      expect(result.post).toBeTruthy();
      expect(result.post.length).toBeGreaterThan(10);
      expect(result.intentionNote).toBeTruthy();

      console.log('\n  ── Post généré (fr / professional) ──');
      console.log(result.post);
      console.log('\n  ── Note éditoriale ──');
      console.log(result.intentionNote);
    });

    it('should respect the 1300-character limit on the generated post', async () => {
      if (!RUN_TESTS) return;

      const result = await service.generate(STANDARD_REQUEST);

      expect(result.post.length).toBeLessThanOrEqual(1300);
    });

    it('should generate a post in English when lang=en', async () => {
      if (!RUN_TESTS) return;

      const result = await service.generate(ENGLISH_REQUEST);

      expect(result).toBeInstanceOf(GeneratedPost);
      expect(result.post).toBeTruthy();

      console.log('\n  ── Post généré (en / professional) ──');
      console.log(result.post);
    });

    it('should use a custom tone correctly', async () => {
      if (!RUN_TESTS) return;

      const result = await service.generate(CUSTOM_TONE_REQUEST);

      expect(result).toBeInstanceOf(GeneratedPost);
      expect(result.post).toBeTruthy();

      console.log('\n  ── Post généré (fr / custom tone) ──');
      console.log(result.post);
    });

    it('should throw LlmUnavailableException when api key is invalid', async () => {
      if (!RUN_TESTS) return;

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          I18nModule.forRoot({
            fallbackLanguage: 'fr',
            loaderOptions: { path: join(__dirname, '../../src/i18n') },
            resolvers: [
              { use: QueryResolver, options: ['lang'] },
              AcceptLanguageResolver,
            ],
          }),
        ],
      }).compile();

      const i18n = module.get<I18nService>(I18nService);
      const badService = new OpenAiPostGenerationService(
        'sk-invalid-key-000000000000',
        OPENAI_MODEL,
        i18n,
        LLM_TEMPERATURE,
        LLM_MAX_TOKENS,
      );

      await expect(badService.generate(STANDARD_REQUEST)).rejects.toBeInstanceOf(
        LlmUnavailableException,
      );
    });

    it('should throw LlmUnavailableException when api key is empty', async () => {
      if (!RUN_TESTS) return;

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          I18nModule.forRoot({
            fallbackLanguage: 'fr',
            loaderOptions: { path: join(__dirname, '../../src/i18n') },
            resolvers: [
              { use: QueryResolver, options: ['lang'] },
              AcceptLanguageResolver,
            ],
          }),
        ],
      }).compile();

      const i18n = module.get<I18nService>(I18nService);
      const emptyKeyService = new OpenAiPostGenerationService(
        '',
        OPENAI_MODEL,
        i18n,
        LLM_TEMPERATURE,
        LLM_MAX_TOKENS,
      );

      await expect(emptyKeyService.generate(STANDARD_REQUEST)).rejects.toBeInstanceOf(
        LlmUnavailableException,
      );
    });
  });

  // ── generateStream() ──────────────────────────────────────────────────────

  describe('generateStream() — streaming', () => {
    it('should yield chunks and the ---NOTE--- separator', async () => {
      if (!RUN_TESTS) return;

      const streamRequest = new PostGenerationRequest(
        'DevStream est une agence digitale spécialisée dans le développement web moderne.',
        'Partage de notre dernier projet : refonte complète du site e-commerce d\'un client retail.',
        'inspiring',
        'fr',
      );

      const chunks: string[] = [];
      for await (const chunk of service.generateStream(streamRequest)) {
        chunks.push(chunk);
      }

      const fullText = chunks.join('');
      expect(chunks.length).toBeGreaterThan(0);
      expect(fullText.length).toBeGreaterThan(10);

      console.log('\n  ── Stream complet (fr / inspiring) ──');
      console.log(fullText);
      console.log(`\n  ► ${chunks.length} chunks reçus`);
    });

    it('should stream a consistent result matching non-streaming output structure', async () => {
      if (!RUN_TESTS) return;

      const streamRequest = new PostGenerationRequest(
        'GreenBuild est une société de construction éco-responsable basée à Lyon.',
        'Annonce de notre certification HQE pour notre nouveau projet de bureaux.',
        'expert',
        'fr',
      );

      const chunks: string[] = [];
      for await (const chunk of service.generateStream(streamRequest)) {
        chunks.push(chunk);
      }

      const fullText = chunks.join('');
      // The stream should contain the NOTE separator used to split post from intention note
      expect(fullText).toContain('---NOTE---');

      const [post, note] = fullText.split('---NOTE---');
      expect(post.trim().length).toBeGreaterThan(10);
      expect(note.trim().length).toBeGreaterThan(10);
    });

    it('should throw LlmUnavailableException during streaming when api key is invalid', async () => {
      if (!RUN_TESTS) return;

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          I18nModule.forRoot({
            fallbackLanguage: 'fr',
            loaderOptions: { path: join(__dirname, '../../src/i18n') },
            resolvers: [
              { use: QueryResolver, options: ['lang'] },
              AcceptLanguageResolver,
            ],
          }),
        ],
      }).compile();

      const i18n = module.get<I18nService>(I18nService);
      const badService = new OpenAiPostGenerationService(
        'sk-invalid-key-000000000000',
        OPENAI_MODEL,
        i18n,
        LLM_TEMPERATURE,
        LLM_MAX_TOKENS,
      );

      const gen = badService.generateStream(STANDARD_REQUEST);
      await expect(gen.next()).rejects.toBeInstanceOf(LlmUnavailableException);
    });
  });
});
