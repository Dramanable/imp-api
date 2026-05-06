/**
 * Predefined tone-of-voice identifiers surfaced in the API and Swagger UI.
 * The API accepts any non-empty string, including custom tones not listed here.
 * When a predefined key is supplied, the LLM receives a richer, localised description
 * of the tone (from the i18n catalogue). Custom strings are passed verbatim.
 */
export const PREDEFINED_TONES = {
  PROFESSIONAL: 'professional',
  CASUAL: 'casual',
  INSPIRING: 'inspiring',
  EXPERT: 'expert',
} as const;

/** Union of the built-in tone values. */
export type PredefinedTone = (typeof PREDEFINED_TONES)[keyof typeof PREDEFINED_TONES];

/**
 * A tone-of-voice value is any non-empty string.
 * Predefined values get a rich, localised description; custom values are forwarded as-is.
 */
export type ToneOfVoice = string;
