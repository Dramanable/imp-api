/**
 * Integration tests for OpenAiPostGenerationService.
 *
 * These tests use nock to intercept real HTTP requests to the OpenAI API
 * without requiring a real API key or network access.
 *
 * nock works by patching Node's `http.request` / `https.request` — the OpenAI
 * SDK ultimately uses the native `https` module, so nock can intercept its calls.
 */

import nock from 'nock';
import { Test, TestingModule } from '@nestjs/testing';
import { join } from 'path';
import { AcceptLanguageResolver, I18nModule, I18nService, QueryResolver } from 'nestjs-i18n';
import { OpenAiPostGenerationService } from './openai-post-generation.service';
import { PostGenerationRequest } from '../../../core/linkedin-post/domain/value-objects/post-generation-request.vo';
import { LlmUnavailableException } from '../../../core/linkedin-post/domain/exceptions/llm-unavailable.exception';

// ── Helpers ───────────────────────────────────────────────────────────────────

const OPENAI_BASE = 'https://api.openai.com';
const CHAT_PATH = '/v1/chat/completions';

/** Builds a minimal OpenAI non-streaming chat completion response body. */
function openAiChatResponse(content: string) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1700000000,
    model: 'gpt-4o-mini',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
  };
}

/** Builds a Server-Sent Events stream body that the OpenAI SDK expects for streaming. */
function openAiStreamResponse(chunks: string[]): string {
  const lines = chunks
    .map((content, index) => {
      const data = {
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            delta: index === chunks.length - 1 ? {} : { content },
            finish_reason: index === chunks.length - 1 ? 'stop' : null,
          },
        ],
      };
      return `data: ${JSON.stringify(data)}\n\n`;
    })
    .join('');
  return lines + 'data: [DONE]\n\n';
}

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('OpenAiPostGenerationService (integration with nock)', () => {
  let service: OpenAiPostGenerationService;

  beforeAll(async () => {
    // Prevent any unmocked HTTP requests from going out during tests.
    nock.disableNetConnect();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        I18nModule.forRoot({
          fallbackLanguage: 'fr',
          loaderOptions: { path: join(__dirname, '../../../i18n') },
          resolvers: [
            { use: QueryResolver, options: ['lang'] },
            AcceptLanguageResolver,
          ],
        }),
      ],
    }).compile();

    const i18nService = module.get<I18nService>(I18nService);
    service = new OpenAiPostGenerationService(
      'sk-test-api-key',
      'gpt-4o-mini',
      i18nService,
      0.7,
      1024,
    );
  });

  afterAll(() => {
    nock.enableNetConnect();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  // ── generate() (non-streaming) ─────────────────────────────────────────────

  describe('generate()', () => {
    it('should return a GeneratedPost with post and intentionNote', async () => {
      const postContent = '🚀 Nous recrutons un ingénieur DevOps senior !';
      const noteContent = "L'accroche emoji crée un signal visuel fort.";

      nock(OPENAI_BASE)
        .post(CHAT_PATH)
        .reply(200, openAiChatResponse(`${postContent}---NOTE---${noteContent}`));

      const request = new PostGenerationRequest(
        'TechFlow, spécialiste DevOps.',
        'Recrutement ingénieur DevOps.',
        'professional',
        'fr',
      );

      const result = await service.generate(request);

      expect(result.post).toBe(postContent);
      expect(result.intentionNote).toBe(noteContent);
    });

    it('should cap the post at 1300 characters', async () => {
      const longPost = 'A'.repeat(2000);
      const note = 'Short note.';

      nock(OPENAI_BASE)
        .post(CHAT_PATH)
        .reply(200, openAiChatResponse(`${longPost}---NOTE---${note}`));

      const request = new PostGenerationRequest(
        'TechFlow.',
        'Brief test.',
        'casual',
        'en',
      );

      const result = await service.generate(request);

      expect(result.post.length).toBeLessThanOrEqual(1300);
    });

    it('should throw LlmUnavailableException on HTTP 500', async () => {
      nock(OPENAI_BASE).post(CHAT_PATH).reply(500, { error: { message: 'Internal Server Error' } });

      const request = new PostGenerationRequest(
        'TechFlow.',
        'Brief test.',
        'professional',
        'fr',
      );

      await expect(service.generate(request)).rejects.toBeInstanceOf(
        LlmUnavailableException,
      );
    });

    it('should throw LlmUnavailableException when OpenAI is unreachable', async () => {
      nock(OPENAI_BASE).post(CHAT_PATH).replyWithError('ECONNREFUSED');

      const request = new PostGenerationRequest(
        'TechFlow.',
        'Brief test.',
        'inspiring',
        'fr',
      );

      await expect(service.generate(request)).rejects.toBeInstanceOf(
        LlmUnavailableException,
      );
    });

    it('should throw LlmUnavailableException when the response has no content', async () => {
      nock(OPENAI_BASE)
        .post(CHAT_PATH)
        .reply(200, openAiChatResponse(''));

      const request = new PostGenerationRequest(
        'TechFlow.',
        'Brief test.',
        'expert',
        'en',
      );

      await expect(service.generate(request)).rejects.toBeInstanceOf(
        LlmUnavailableException,
      );
    });

    it('should work with a custom (non-predefined) tone', async () => {
      const content = 'Post content.---NOTE---Note content.';

      nock(OPENAI_BASE).post(CHAT_PATH).reply(200, openAiChatResponse(content));

      const request = new PostGenerationRequest(
        'TechFlow.',
        'Brief test.',
        'bienveillant et direct',
        'fr',
      );

      const result = await service.generate(request);
      expect(result.post).toBe('Post content.');
    });
  });

  // ── generateStream() ──────────────────────────────────────────────────────

  describe('generateStream()', () => {
    it('should yield tokens from the streaming response', async () => {
      const chunks = ['🚀 Nous re', 'crutons', '---NOTE---', "L'accroche.", ''];

      nock(OPENAI_BASE)
        .post(CHAT_PATH)
        .reply(200, openAiStreamResponse(chunks), {
          'Content-Type': 'text/event-stream',
          'Transfer-Encoding': 'chunked',
        });

      const request = new PostGenerationRequest(
        'TechFlow.',
        'Recrutement.',
        'professional',
        'fr',
      );

      const tokens: string[] = [];
      for await (const token of service.generateStream(request)) {
        tokens.push(token);
      }

      expect(tokens.length).toBeGreaterThan(0);
      const combined = tokens.join('');
      expect(combined).toContain('🚀 Nous recrutons');
    });

    it('should throw LlmUnavailableException on streaming HTTP error', async () => {
      nock(OPENAI_BASE).post(CHAT_PATH).replyWithError('ECONNRESET');

      const request = new PostGenerationRequest(
        'TechFlow.',
        'Brief.',
        'casual',
        'en',
      );

      const gen = service.generateStream(request);
      await expect(gen.next()).rejects.toBeInstanceOf(LlmUnavailableException);
    });
  });
});
