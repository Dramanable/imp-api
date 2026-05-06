import { DomainException } from '../../../shared/exceptions/domain.exception';

/**
 * Thrown when the LLM provider is unreachable, returns an error, or produces
 * an unparseable response.
 * Maps to HTTP 503 Service Unavailable in the presentation layer.
 */
export class LlmUnavailableException extends DomainException {
  constructor(key: string, context?: Record<string, unknown>) {
    super(key, context);
  }
}
