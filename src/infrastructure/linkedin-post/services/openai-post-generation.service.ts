import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { I18nService } from 'nestjs-i18n';
import { IPostGenerationService } from '../../../core/linkedin-post/domain/services/post-generation.service.interface';
import { PostGenerationRequest } from '../../../core/linkedin-post/domain/value-objects/post-generation-request.vo';
import { GeneratedPost } from '../../../core/linkedin-post/domain/entities/generated-post.entity';
import { LlmUnavailableException } from '../../../core/linkedin-post/domain/exceptions/llm-unavailable.exception';
import { PREDEFINED_TONES } from '../../../core/linkedin-post/domain/value-objects/tone-of-voice.vo';

/**
 * Separator injected by the LLM between the LinkedIn post and the editorial intention note.
 * Both the system prompt and this constant must stay in sync.
 */
const NOTE_SEPARATOR = '---NOTE---';

/** Hard cap applied after parsing to enforce the LinkedIn character limit. */
const MAX_POST_CHARS = 1_300;

/**
 * Maps a predefined tone key to its i18n catalogue key.
 * Keys not present in this map are treated as free-form tone descriptions.
 */
const PREDEFINED_TONE_KEYS: ReadonlySet<string> = new Set(Object.values(PREDEFINED_TONES));

/**
 * Concrete implementation of {@link IPostGenerationService} backed by the OpenAI Chat API.
 *
 * Supports both non-streaming (JSON response) and streaming (async generator of string tokens)
 * modes. Prompts are fully localised via nestjs-i18n and injected at runtime.
 *
 * The tone parameter accepts any non-empty string:
 * - **Predefined tones** (professional, casual, inspiring, expert): resolved to a rich,
 *   localised description from the i18n catalogue.
 * - **Custom tones**: passed verbatim to the LLM prompt as the tone description.
 */
@Injectable()
export class OpenAiPostGenerationService implements IPostGenerationService {
  private readonly client: OpenAI | null;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens: number;

  constructor(
    apiKey: string,
    model: string,
    private readonly i18nService: I18nService,
    temperature: number,
    maxTokens: number,
  ) {
    // Guard: do not instantiate the OpenAI client with an empty key to prevent
    // the SDK from throwing an opaque error at construction time.
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = model;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
  }

  // ── Non-streaming ──────────────────────────────────────────────────────────

  async generate(request: PostGenerationRequest): Promise<GeneratedPost> {
    if (!this.client) {
      throw new LlmUnavailableException('linkedin-post.llm.unavailable');
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(request);

    let raw: string;
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });
      raw = completion.choices[0]?.message?.content ?? '';
    } catch {
      throw new LlmUnavailableException('linkedin-post.llm.unavailable');
    }

    return this.parseResponse(raw);
  }

  // ── Streaming ──────────────────────────────────────────────────────────────

  async *generateStream(
    request: PostGenerationRequest,
  ): AsyncGenerator<string> {
    if (!this.client) {
      throw new LlmUnavailableException('linkedin-post.llm.unavailable');
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(request);

    let stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
    try {
      stream = await this.client.chat.completions.create({
        model: this.model,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });
    } catch {
      throw new LlmUnavailableException('linkedin-post.llm.unavailable');
    }

    try {
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content ?? '';
        if (content) yield content;
      }
    } catch {
      throw new LlmUnavailableException('linkedin-post.llm.unavailable');
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Builds the system and user prompts for the given generation request.
   *
   * - System prompt: fetched from the i18n catalogue (`prompts.system`).
   * - User prompt: template from `prompts.user` with `{companyDescription}`, `{brief}`,
   *   and `{tone}` substituted.
   * - Tone label: for predefined tones, a localised description is resolved from
   *   `prompts.tones.<key>`; for custom tones, the raw value is used directly.
   */
  private buildPrompts(request: PostGenerationRequest): {
    systemPrompt: string;
    userPrompt: string;
  } {
    const lang = request.lang ?? 'fr';

    const systemPrompt: string = this.i18nService.t('prompts.system', { lang });
    const userTemplate: string = this.i18nService.t('prompts.user', { lang });

    // Resolve tone label: predefined tones → localised description, custom → verbatim.
    const toneLabel = this.resolveToneLabel(request.tone, lang);

    const userPrompt = userTemplate
      .replace('{companyDescription}', request.companyDescription)
      .replace('{brief}', request.brief)
      .replace('{tone}', toneLabel);

    return { systemPrompt, userPrompt };
  }

  /**
   * Resolves the human-readable tone description for the LLM prompt.
   *
   * Predefined tone keys are translated via the i18n catalogue so the LLM receives
   * a rich, localised description. Unknown strings (custom tones) are forwarded as-is,
   * giving callers full flexibility without changing this service.
   */
  private resolveToneLabel(tone: string, lang: string): string {
    if (PREDEFINED_TONE_KEYS.has(tone)) {
      return this.i18nService.t(`prompts.tones.${tone}`, { lang });
    }
    // Custom tone: pass the raw string directly to the LLM.
    return tone;
  }

  private parseResponse(raw: string): GeneratedPost {
    const sepIdx = raw.indexOf(NOTE_SEPARATOR);
    const post = (sepIdx !== -1 ? raw.slice(0, sepIdx) : raw)
      .trim()
      .slice(0, MAX_POST_CHARS);
    const note = (sepIdx !== -1 ? raw.slice(sepIdx + NOTE_SEPARATOR.length) : '').trim();

    if (!post) {
      throw new LlmUnavailableException('linkedin-post.llm.invalid_response');
    }

    return new GeneratedPost(post, note);
  }
}
