/**
 * Base class for all domain exceptions.
 *
 * Uses an i18n key (e.g. `"linkedin-post.validation.brief_required"`) instead of a
 * raw message string, so the presentation layer can translate it for the caller.
 * An optional `context` map can carry structured data for interpolation or logging.
 */
export class DomainException extends Error {
  constructor(
    /** Dot-separated i18n key identifying the error (e.g. `linkedin-post.llm.unavailable`). */
    public readonly key: string,
    /** Structured context passed to i18n interpolation and included in error responses. */
    public readonly context?: Record<string, unknown>,
  ) {
    super(key);
    this.name = this.constructor.name;
  }
}
