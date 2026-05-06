import { PostGenerationRequest } from '../value-objects/post-generation-request.vo';
import { GeneratedPost } from '../entities/generated-post.entity';

export interface IPostGenerationService {
  /**
   * Generates a LinkedIn post and its editorial intention note.
   * Returns the complete result once generation is done.
   * Used for cache-hit responses and non-streaming contexts.
   */
  generate(request: PostGenerationRequest): Promise<GeneratedPost>;

  /**
   * Streams raw LLM tokens.
   * The output follows this convention:
   *   <post content up to 1300 chars>---NOTE---<editorial intention note>
   * Used by the streaming endpoint for real-time UX.
   */
  generateStream(request: PostGenerationRequest): AsyncGenerator<string>;
}

export const POST_GENERATION_SERVICE = Symbol('POST_GENERATION_SERVICE');
