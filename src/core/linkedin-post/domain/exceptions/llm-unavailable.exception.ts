import { DomainException } from '../../../shared/exceptions/domain.exception';

export class LlmUnavailableException extends DomainException {
  constructor(key: string, context?: Record<string, unknown>) {
    super(key, context);
  }
}
