/**
 * Port for structured, levelled logging.
 *
 * All methods accept an optional `context` map for structured fields (e.g.
 * `correlationId`, `action`, `userId`). The implementation must NOT log
 * sensitive data (credentials, tokens, PII) — redaction is the caller's responsibility.
 */
export interface ILogger {
  /** Fine-grained diagnostic information. Not emitted in production by default. */
  debug(message: string, context?: Record<string, unknown>): void;
  /** Normal operational events (request handled, cache hit, etc.). */
  info(message: string, context?: Record<string, unknown>): void;
  /** Unexpected but recoverable situations. */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Errors that require immediate attention or indicate service degradation. */
  error(message: string, context?: Record<string, unknown>): void;
}

/** NestJS DI injection token for the logger service. */
export const LOGGER = Symbol('LOGGER');
