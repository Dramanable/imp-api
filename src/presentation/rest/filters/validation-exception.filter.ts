import { ArgumentsHost, Injectable } from '@nestjs/common';
import { I18nValidationException, I18nValidationExceptionFilter } from 'nestjs-i18n';

/**
 * Catches `I18nValidationException` (thrown by `I18nValidationPipe`) and formats
 * the response to match the project's standard error envelope:
 *   { statusCode, error, message }
 *
 * The constraint messages are already translated by `I18nValidationExceptionFilter`'s
 * `formatI18nErrors()` call before `buildResponseBody()` is invoked, so the strings
 * received here are the final, localised messages in the request's language.
 *
 * Registered via `APP_FILTER` in `LinkedInPostModule` so it gets full NestJS DI.
 */
@Injectable()
export class ValidationExceptionFilter extends I18nValidationExceptionFilter {
  constructor() {
    // detailedErrors: false → normalizeValidationErrors() returns a flat string[].
    super({ detailedErrors: false });
  }

  protected override buildResponseBody(
    _host: ArgumentsHost,
    exc: I18nValidationException,
    error: string[] | object,
  ): Record<string, unknown> {
    // With detailedErrors: false, error is always string[]
    const messages: string[] = Array.isArray(error) ? (error as string[]) : [];

    return {
      statusCode: exc.getStatus(),
      error: 'validation.error',
      // Return a single string when there is only one error (cleaner for simple cases),
      // otherwise return the full array so the client knows every failing field.
      message: messages.length === 1 ? (messages[0] ?? 'Validation failed') : messages,
    };
  }
}
