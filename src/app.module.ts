import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { AcceptLanguageResolver, I18nModule, QueryResolver } from 'nestjs-i18n';
import { LoggerModule } from 'nestjs-pino';
import { LinkedInPostModule } from './infrastructure/linkedin-post/linkedin-post.module';

@Module({
  imports: [
    // ── Configuration ─────────────────────────────────────────────────────
    ConfigModule.forRoot({ isGlobal: true }),

    // ── Internationalisation ───────────────────────────────────────────────
    // Default language: French. Supports fr and en.
    // Language is resolved from the Accept-Language header or the `lang` query param.
    I18nModule.forRoot({
      fallbackLanguage: 'fr',
      loaderOptions: {
        path: join(__dirname, 'i18n'),
        watch: true,
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
      ],
    }),

    // ── Structured logging with Pino ──────────────────────────────────────
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('LOG_LEVEL', 'info'),
          transport:
            config.get<string>('NODE_ENV') !== 'production'
              ? { target: 'pino-pretty', options: { colorize: true, singleLine: false } }
              : undefined,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),

    // ── Feature modules ────────────────────────────────────────────────────
    LinkedInPostModule,
  ],
})
export class AppModule {}

