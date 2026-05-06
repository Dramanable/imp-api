/**
 * Immutable entity representing the outcome of a successful LinkedIn post generation.
 *
 * - `post` — the LinkedIn post body (≤ 1,300 characters, per platform limit).
 * - `intentionNote` — 2–4 sentence editorial note explaining the creative choices made.
 * - `generatedAt` — timestamp when the entity was created (used for cache TTL tracking).
 */
export class GeneratedPost {
  constructor(
    /** LinkedIn post body. Maximum 1,300 characters (enforced by the service). */
    public readonly post: string,
    /** Editorial intention note explaining the creative choices (2–4 sentences). */
    public readonly intentionNote: string,
    /** UTC timestamp of generation. Defaults to the current time. */
    public readonly generatedAt: Date = new Date(),
  ) {}
}
