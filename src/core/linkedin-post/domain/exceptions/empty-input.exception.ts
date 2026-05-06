import { DomainException } from '../../../shared/exceptions/domain.exception';

export class EmptyInputException extends DomainException {
  constructor(key: string, context?: Record<string, unknown>) {
    super(key, context);
  }
}
