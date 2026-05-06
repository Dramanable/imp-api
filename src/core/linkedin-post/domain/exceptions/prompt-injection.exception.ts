import { DomainException } from '../../../shared/exceptions/domain.exception';

/**
 * Thrown when user-supplied text contains patterns that look like prompt
 * injection attacks (e.g. instructions to override or ignore the system prompt).
 */
export class PromptInjectionException extends DomainException {
  constructor(key: string, context?: Record<string, unknown>) {
    super(key, context);
  }
}
