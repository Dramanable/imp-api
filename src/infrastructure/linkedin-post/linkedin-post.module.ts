import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { I18nService } from 'nestjs-i18n';
import Redis from 'ioredis';
import { POST_GENERATION_SERVICE } from '../../core/linkedin-post/domain/services/post-generation.service.interface';
import { INPUT_SANITIZER } from '../../core/linkedin-post/domain/services/input-sanitizer.service.interface';
import { CACHE_SERVICE } from '../../core/shared/interfaces/cache.interface';
import { LOGGER } from '../../core/shared/interfaces/logger.interface';
import {
  GENERATE_LINKEDIN_POST_USE_CASE,
  GenerateLinkedInPostUseCase,
} from '../../core/linkedin-post/application/use-cases/generate-linkedin-post.use-case';
import { OpenAiPostGenerationService } from './services/openai-post-generation.service';
import { RedisCacheService } from './services/redis-cache.service';
import { InputSanitizerService } from './services/input-sanitizer.service';
import { PinoLoggerService } from './services/pino-logger.service';
import { LinkedInPostController } from '../../presentation/rest/features/linkedin-post/controllers/linkedin-post.controller';
import { HealthController, REDIS_CLIENT_TOKEN } from '../../presentation/rest/features/health/controllers/health.controller';
import { DomainExceptionFilter } from '../../presentation/rest/filters/domain-exception.filter';
import type { IPostGenerationService } from '../../core/linkedin-post/domain/services/post-generation.service.interface';
import type { IInputSanitizer } from '../../core/linkedin-post/domain/services/input-sanitizer.service.interface';
import type { ICacheService } from '../../core/shared/interfaces/cache.interface';
import type { ILogger } from '../../core/shared/interfaces/logger.interface';

/** Injection token for the shared ioredis client. */
export const REDIS_CLIENT = REDIS_CLIENT_TOKEN;
@Module({
  imports: [ConfigModule],
  controllers: [LinkedInPostController, HealthController],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    {
      provide: LOGGER,
      useFactory: (pinoLogger: PinoLogger) => new PinoLoggerService(pinoLogger),
      inject: [PinoLogger],
    },
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis => {
        const host = configService.get<string>('REDIS_HOST', '127.0.0.1');
        const port = configService.get<number>('REDIS_PORT', 6379);
        const password = configService.get<string>('REDIS_PASSWORD');
        return new Redis({
          host,
          port,
          ...(password !== undefined ? { password } : {}),
          // Disable automatic reconnect on connection errors to avoid masking issues.
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        });
      },
      inject: [ConfigService],
    },
    {
      provide: CACHE_SERVICE,
      useFactory: (redisClient: Redis, configService: ConfigService) =>
        new RedisCacheService(
          redisClient,
          configService.get<number>('CACHE_TTL_MS', 3_600_000),
        ),
      inject: [REDIS_CLIENT, ConfigService],
    },
    {
      provide: INPUT_SANITIZER,
      useClass: InputSanitizerService,
    },
    {
      provide: POST_GENERATION_SERVICE,
      useFactory: (configService: ConfigService, i18nService: I18nService) =>
        new OpenAiPostGenerationService(
          configService.getOrThrow<string>('OPENAI_API_KEY'),
          configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
          i18nService,
          configService.get<number>('LLM_TEMPERATURE', 0.7),
          configService.get<number>('LLM_MAX_TOKENS', 1_024),
        ),
      inject: [ConfigService, I18nService],
    },
    {
      provide: GENERATE_LINKEDIN_POST_USE_CASE,
      useFactory: (
        postGenService: IPostGenerationService,
        cacheService: ICacheService,
        logger: ILogger,
        sanitizer: IInputSanitizer,
      ) =>
        new GenerateLinkedInPostUseCase(postGenService, cacheService, logger, sanitizer),
      inject: [POST_GENERATION_SERVICE, CACHE_SERVICE, LOGGER, INPUT_SANITIZER],
    },
  ],
})
export class LinkedInPostModule {}
