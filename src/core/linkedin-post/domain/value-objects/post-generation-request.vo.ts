import { ToneOfVoice } from './tone-of-voice.vo';

/**
 * Immutable value object that carries all inputs required to generate a LinkedIn post.
 *
 * The {@link tone} field accepts any non-empty string. Predefined values (see
 * {@link PREDEFINED_TONES}) receive a richer, localised description from the i18n
 * catalogue; custom strings are forwarded verbatim to the LLM prompt.
 */
export class PostGenerationRequest {
  constructor(
    public readonly companyDescription: string,
    public readonly brief: string,
    /** Any non-empty tone string. Predefined tones get localised labels; custom tones are used as-is. */
    public readonly tone: ToneOfVoice,
    /** BCP-47 language tag (e.g. "fr", "en"). Defaults to French. */
    public readonly lang: string = 'fr',
  ) {}
}
