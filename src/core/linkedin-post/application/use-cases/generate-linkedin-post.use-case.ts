import { PostGenerationRequest } from '../../domain/value-objects/post-generation-request.vo';
import { GeneratedPost } from '../../domain/entities/generated-post.entity';
import { IPostGenerationService } from '../../domain/services/post-generation.service.interface';
import { ICacheService } from '../../../shared/interfaces/cache.interface';
import { ILogger } from '../../../shared/interfaces/logger.interface';
import { EmptyInputException } from '../../domain/exceptions/empty-input.exception';
import { LlmUnavailableException } from '../../domain/exceptions/llm-unavailable.exception';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input accepted by both execute() and executeStream(). */
export interface GenerateLinkedInPostInput {
  companyDescription: string;
  brief: string;
  /** Any non-empty string. Predefined tones get localised i18n labels; custom strings are used verbatim. */
  tone: string;
  /** BCP-47 language tag. Defaults to 'fr'. */
  lang: string;
  correlationId: string;
}

export interface GenerateLinkedInPostOutput {
  post: string;
  intentionNote: string;
  fromCache: boolean;
}

export type StreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'note'; content: string }
  | { type: 'done'; fromCache: boolean };

export const GENERATE_LINKEDIN_POST_USE_CASE = Symbol(
  'GENERATE_LINKEDIN_POST_USE_CASE',
);

/** Separator injected by the LLM between the post and the intention note. */
const NOTE_SEPARATOR = '---NOTE---';
/** Maximum size of the LinkedIn post (platform limit). */
const MAX_POST_CHARS = 1_300;

export class GenerateLinkedInPostUseCase {
  constructor(
    private readonly postGenerationService: IPostGenerationService,
    private readonly cacheService: ICacheService,
    private readonly logger: ILogger,
  ) {}

  // ── Non-streaming (JSON response) ─────────────────────────────────────────

  async execute(
    input: GenerateLinkedInPostInput,
  ): Promise<GenerateLinkedInPostOutput> {
    const { companyDescription, brief, tone, lang, correlationId } = input;

    this.validateInputs(companyDescription, brief);

    const cacheKey = this.buildCacheKey(companyDescription, brief, tone, lang);

    const cached = this.cacheService.get<GeneratedPost>(cacheKey);
    if (cached) {
      this.logger.debug('Cache hit for LinkedIn post generation', {
        action: 'GenerateLinkedInPost',
        tone,
        lang,
        correlationId,
      });
      return { post: cached.post, intentionNote: cached.intentionNote, fromCache: true };
    }

    this.logger.debug('Generating LinkedIn post via LLM', {
      action: 'GenerateLinkedInPost',
      tone,
      lang,
      correlationId,
    });

    let generatedPost: GeneratedPost;
    try {
      const request = new PostGenerationRequest(companyDescription, brief, tone, lang);
      generatedPost = await this.postGenerationService.generate(request);
    } catch (error) {
      if (error instanceof LlmUnavailableException) throw error;
      this.logger.error('LLM service error', {
        action: 'GenerateLinkedInPost',
        correlationId,
        error: String(error),
      });
      throw new LlmUnavailableException('linkedin-post.llm.unavailable', { correlationId });
    }

    this.cacheService.set(cacheKey, generatedPost);

    this.logger.info('LinkedIn post generated successfully', {
      action: 'GenerateLinkedInPost',
      postLength: generatedPost.post.length,
      correlationId,
    });

    return { post: generatedPost.post, intentionNote: generatedPost.intentionNote, fromCache: false };
  }

  // ── Streaming (Server-Sent Events) ───────────────────────────────────────

  async *executeStream(
    input: GenerateLinkedInPostInput,
  ): AsyncGenerator<StreamEvent> {
    const { companyDescription, brief, tone, lang, correlationId } = input;

    this.validateInputs(companyDescription, brief);

    const cacheKey = this.buildCacheKey(companyDescription, brief, tone, lang);

    // Cache hit → emit cached content as a fake stream
    const cached = this.cacheService.get<GeneratedPost>(cacheKey);
    if (cached) {
      this.logger.debug('Cache hit for LinkedIn post stream', {
        action: 'GenerateLinkedInPostStream',
        tone,
        lang,
        correlationId,
      });
      const CHUNK_SIZE = 12;
      for (let i = 0; i < cached.post.length; i += CHUNK_SIZE) {
        yield { type: 'chunk', content: cached.post.slice(i, i + CHUNK_SIZE) };
      }
      yield { type: 'note', content: cached.intentionNote };
      yield { type: 'done', fromCache: true };
      return;
    }

    this.logger.debug('Streaming LinkedIn post via LLM', {
      action: 'GenerateLinkedInPostStream',
      tone,
      lang,
      correlationId,
    });

    // Stream tokens from LLM while buffering to detect the ---NOTE--- boundary.
    // We keep a window of NOTE_SEPARATOR.length bytes un-yielded to avoid
    // accidentally streaming part of the separator as post content.
    let accumulated = '';
    let yieldedUpTo = 0;
    let sepFound = false;

    const request = new PostGenerationRequest(companyDescription, brief, tone, lang);

    try {
      for await (const token of this.postGenerationService.generateStream(request)) {
        accumulated += token;

        if (!sepFound) {
          const sepIdx = accumulated.indexOf(NOTE_SEPARATOR);
          if (sepIdx !== -1) {
            if (sepIdx > yieldedUpTo) {
              yield { type: 'chunk', content: accumulated.slice(yieldedUpTo, sepIdx) };
            }
            yieldedUpTo = accumulated.length;
            sepFound = true;
          } else {
            const safeUpTo = accumulated.length - NOTE_SEPARATOR.length;
            if (safeUpTo > yieldedUpTo) {
              yield { type: 'chunk', content: accumulated.slice(yieldedUpTo, safeUpTo) };
              yieldedUpTo = safeUpTo;
            }
          }
        }
      }

      // Flush remaining post bytes if no separator was found
      if (!sepFound && accumulated.length > yieldedUpTo) {
        yield { type: 'chunk', content: accumulated.slice(yieldedUpTo) };
      }
    } catch (error) {
      if (error instanceof LlmUnavailableException) throw error;
      this.logger.error('LLM stream error', {
        action: 'GenerateLinkedInPostStream',
        correlationId,
        error: String(error),
      });
      throw new LlmUnavailableException('linkedin-post.llm.unavailable', { correlationId });
    }

    // Parse accumulated content and persist to cache
    const sepIdx = accumulated.indexOf(NOTE_SEPARATOR);
    const post = (sepIdx !== -1 ? accumulated.slice(0, sepIdx) : accumulated)
      .trim()
      .slice(0, MAX_POST_CHARS);
    const note = (sepIdx !== -1 ? accumulated.slice(sepIdx + NOTE_SEPARATOR.length) : '').trim();

    this.cacheService.set(cacheKey, new GeneratedPost(post, note));

    this.logger.info('LinkedIn post streamed successfully', {
      action: 'GenerateLinkedInPostStream',
      postLength: post.length,
      correlationId,
    });

    yield { type: 'note', content: note };
    yield { type: 'done', fromCache: false };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private validateInputs(companyDescription: string, brief: string): void {
    if (!companyDescription?.trim()) {
      throw new EmptyInputException(
        'linkedin-post.validation.company_description_required',
      );
    }
    if (!brief?.trim()) {
      throw new EmptyInputException('linkedin-post.validation.brief_required');
    }
  }

  private buildCacheKey(
    companyDescription: string,
    brief: string,
    tone: string,
    lang: string,
  ): string {
    return JSON.stringify({ companyDescription, brief, tone, lang });
  }
}
