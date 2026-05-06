import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { DomainException } from '../../../core/shared/exceptions/domain.exception';
import { EmptyInputException } from '../../../core/linkedin-post/domain/exceptions/empty-input.exception';
import { LlmUnavailableException } from '../../../core/linkedin-post/domain/exceptions/llm-unavailable.exception';

/** Maps a domain exception to an HTTP status code. */
function resolveStatus(exception: DomainException): HttpStatus {
  if (exception instanceof EmptyInputException) return HttpStatus.BAD_REQUEST;
  if (exception instanceof LlmUnavailableException) return HttpStatus.SERVICE_UNAVAILABLE;
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

/**
 * Translates dot-separated i18n exception keys to a flat `errors.*` key.
 * e.g. 'linkedin-post.validation.company_description_required'
 *   → 'errors.validation.company_description_required'
 */
function toI18nKey(exceptionKey: string): string {
  // Remove the domain prefix ("linkedin-post.") and prepend "errors."
  const withoutDomain = exceptionKey.replace(/^linkedin-post\./, '');
  return `errors.${withoutDomain}`;
}

/** Extract primary language code from an Accept-Language header value. */
function extractLang(acceptLang?: string): string {
  if (!acceptLang) return 'fr';
  const primary = acceptLang.split(',')[0].split(';')[0].trim().slice(0, 2).toLowerCase();
  return ['fr', 'en'].includes(primary) ? primary : 'fr';
}

@Injectable()
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(private readonly i18nService: I18nService) {}

  catch(exception: DomainException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    // Works with both Express and Fastify
    const response = ctx.getResponse<{
      status?: (code: number) => { json: (body: unknown) => void };
      code?: (code: number) => { send: (body: unknown) => void };
    }>();
    const request = ctx.getRequest<{ headers: Record<string, string | string[] | undefined> }>();

    const acceptLang = Array.isArray(request.headers['accept-language'])
      ? request.headers['accept-language'][0]
      : request.headers['accept-language'];

    const lang = extractLang(acceptLang);
    const status = resolveStatus(exception);
    const i18nKey = toI18nKey(exception.key);

    let message: string;
    try {
      message = this.i18nService.t(i18nKey, { lang }) as string;
      if (!message || message === i18nKey) message = exception.key;
    } catch {
      message = exception.key;
    }

    const body = {
      statusCode: status,
      error: exception.key,
      message,
      ...(exception.context ? { context: exception.context } : {}),
    };

    // Support both Fastify reply (code/send) and Express response (status/json)
    if (typeof (response as any).code === 'function') {
      (response as any).code(status).send(body);
    } else if (typeof (response as any).status === 'function') {
      (response as any).status(status).json(body);
    }
  }
}

