import { PostGenerationRequest } from '../../domain/value-objects/post-generation-request.vo';
import { GeneratedPost } from '../../domain/entities/generated-post.entity';
import { IPostGenerationService } from '../../domain/services/post-generation.service.interface';
import { IInputSanitizer } from '../../domain/services/input-sanitizer.service.interface';
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
    private readonly inputSanitizer: IInputSanitizer,
  ) {}

  // ── Non-streaming (JSON response) ─────────────────────────────────────────

  async execute(
    input: GenerateLinkedInPostInput,
  ): Promise<GenerateLinkedInPostOutput> {
    const { companyDescription, brief, tone, lang, correlationId } = input;

    this.inputSanitizer.validate(companyDescription, brief);
    this.validateInputs(companyDescription, brief);

    const cacheKey = this.buildCacheKey(companyDescription, brief, tone, lang);

    const cached = await this.cacheService.get<GeneratedPost>(cacheKey);
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

    await this.cacheService.set(cacheKey, generatedPost);

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

    this.inputSanitizer.validate(companyDescription, brief);
    this.validateInputs(companyDescription, brief);

    const cacheKey = this.buildCacheKey(companyDescription, brief, tone, lang);

    // Cache hit → emit cached content as a fake stream
    const cached = await this.cacheService.get<GeneratedPost>(cacheKey);
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
    // Post tokens are emitted as `chunk` events immediately (holding back
    // NOTE_SEPARATOR.length bytes to avoid splitting the separator across yields).
    // Once the separator is found, note tokens are emitted as cumulative `note`
    // events so the frontend can render the note progressively instead of waiting
    // for the full LLM response to finish.
    let accumulated = '';
    let postYieldedTo = 0;    // position up to which post chunks have been emitted
    let sepFound = false;
    let noteFrom = 0;         // position in accumulated where note content starts
    let noteCumulativeLen = 0; // length of note text already emitted (for delta tracking)

    const request = new PostGenerationRequest(companyDescription, brief, tone, lang);

    try {
      for await (const token of this.postGenerationService.generateStream(request)) {
        accumulated += token;

        if (!sepFound) {
          const idx = accumulated.indexOf(NOTE_SEPARATOR);
          if (idx !== -1) {
            // Yield remaining post bytes before the separator
            if (idx > postYieldedTo) {
              yield { type: 'chunk', content: accumulated.slice(postYieldedTo, idx) };
            }
            sepFound = true;
            noteFrom = idx + NOTE_SEPARATOR.length;
            // Emit any note content already buffered in the same token batch
            const initialNote = accumulated.slice(noteFrom).trim();
            if (initialNote) {
              noteCumulativeLen = initialNote.length;
              yield { type: 'note', content: initialNote };
            }
          } else {
            // Safe to yield post bytes (hold back separator.length to avoid splitting)
            const safeUpTo = accumulated.length - NOTE_SEPARATOR.length;
            if (safeUpTo > postYieldedTo) {
              yield { type: 'chunk', content: accumulated.slice(postYieldedTo, safeUpTo) };
              postYieldedTo = safeUpTo;
            }
          }
        } else {
          // Progressive note streaming – emit cumulative note content as it arrives
          const currentNote = accumulated.slice(noteFrom).trim();
          if (currentNote.length > noteCumulativeLen) {
            noteCumulativeLen = currentNote.length;
            yield { type: 'note', content: currentNote };
          }
        }
      }

      // Flush remaining post bytes if the separator was never found
      if (!sepFound && accumulated.length > postYieldedTo) {
        yield { type: 'chunk', content: accumulated.slice(postYieldedTo) };
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

    // Extract final values for caching
    const sepIdx = accumulated.indexOf(NOTE_SEPARATOR);
    const post = (sepIdx !== -1 ? accumulated.slice(0, sepIdx) : accumulated)
      .trim()
      .slice(0, MAX_POST_CHARS);
    const note = (sepIdx !== -1 ? accumulated.slice(sepIdx + NOTE_SEPARATOR.length) : '').trim();

    // Cache fire-and-forget – a Redis failure must never block the `done` event
    this.cacheService.set(cacheKey, new GeneratedPost(post, note)).catch((err) => {
      this.logger.warn('Failed to cache streamed post (non-fatal)', {
        action: 'GenerateLinkedInPostStream',
        correlationId,
        error: String(err),
      });
    });

    this.logger.info('LinkedIn post streamed successfully', {
      action: 'GenerateLinkedInPostStream',
      postLength: post.length,
      correlationId,
    });

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
