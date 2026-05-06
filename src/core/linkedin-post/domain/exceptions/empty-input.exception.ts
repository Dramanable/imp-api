import { DomainException } from '../../../shared/exceptions/domain.exception';

/**
 * Thrown when a required input field is empty or contains only whitespace.
 * Maps to HTTP 400 Bad Request in the presentation layer.
 */
export class EmptyInputException extends DomainException {
  constructor(key: string, context?: Record<string, unknown>) {
    super(key, context);
  }
}
