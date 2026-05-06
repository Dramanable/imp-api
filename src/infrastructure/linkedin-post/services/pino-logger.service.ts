import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ILogger } from '../../../core/shared/interfaces/logger.interface';

/**
 * Infrastructure adapter that bridges the domain ILogger port
 * to the Pino logger provided by nestjs-pino.
 */
@Injectable()
export class PinoLoggerService implements ILogger {
  constructor(private readonly logger: PinoLogger) {}

  debug(message: string, context?: Record<string, unknown>): void {
    this.logger.debug(context ?? {}, message);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logger.info(context ?? {}, message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(context ?? {}, message);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.logger.error(context ?? {}, message);
  }
}
