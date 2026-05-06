import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { I18nService } from 'nestjs-i18n';
import { POST_GENERATION_SERVICE } from '../../core/linkedin-post/domain/services/post-generation.service.interface';
import { CACHE_SERVICE } from '../../core/shared/interfaces/cache.interface';
import { LOGGER } from '../../core/shared/interfaces/logger.interface';
import {
  GENERATE_LINKEDIN_POST_USE_CASE,
  GenerateLinkedInPostUseCase,
} from '../../core/linkedin-post/application/use-cases/generate-linkedin-post.use-case';
import { OpenAiPostGenerationService } from './services/openai-post-generation.service';
import { InMemoryCacheService } from './services/in-memory-cache.service';
import { PinoLoggerService } from './services/pino-logger.service';
import { LinkedInPostController } from '../../presentation/rest/features/linkedin-post/controllers/linkedin-post.controller';
import { DomainExceptionFilter } from '../../presentation/rest/filters/domain-exception.filter';
import type { IPostGenerationService } from '../../core/linkedin-post/domain/services/post-generation.service.interface';
import type { ICacheService } from '../../core/shared/interfaces/cache.interface';
import type { ILogger } from '../../core/shared/interfaces/logger.interface';

@Module({
  imports: [ConfigModule],
  controllers: [LinkedInPostController],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    {
      provide: LOGGER,
      useFactory: (pinoLogger: PinoLogger) => new PinoLoggerService(pinoLogger),
      inject: [PinoLogger],
    },
    {
      provide: CACHE_SERVICE,
      useFactory: (configService: ConfigService) =>
        new InMemoryCacheService(
          configService.get<number>('CACHE_TTL_MS', 3_600_000),
        ),
      inject: [ConfigService],
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
      ) =>
        new GenerateLinkedInPostUseCase(postGenService, cacheService, logger),
      inject: [POST_GENERATION_SERVICE, CACHE_SERVICE, LOGGER],
    },
  ],
})
export class LinkedInPostModule {}
