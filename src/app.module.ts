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
    // formatter: simple dot-notation {path.to.value} interpolation used by
    // class-validator messages (e.g. {constraints.0} for the first constraint).
    I18nModule.forRoot({
      fallbackLanguage: 'fr',
      formatter: (template: string, ...formatterArgs: unknown[]): string => {
        const data = formatterArgs.find(
          (a): a is Record<string, unknown> =>
            typeof a === 'object' && a !== null && !Array.isArray(a),
        ) ?? {};
        return template.replace(/\{([^{}]+)\}/g, (_match, rawPath: string) => {
          const parts = rawPath.trim().split('.');
          let value: unknown = data;
          for (const part of parts) {
            if (value === null || value === undefined || typeof value !== 'object') {
              return '';
            }
            value = (value as Record<string, unknown>)[part];
          }
          return value !== undefined && value !== null ? String(value) : '';
        });
      },
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
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            level: config.get<string>('LOG_LEVEL', 'info'),
            ...(isProd
              ? {}
              : {
                  transport: {
                    target: 'pino-pretty',
                    options: { colorize: true, singleLine: false },
                  },
                }),
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
        };
      },
    }),

    // ── Feature modules ────────────────────────────────────────────────────
    LinkedInPostModule,
  ],
})
export class AppModule {}

