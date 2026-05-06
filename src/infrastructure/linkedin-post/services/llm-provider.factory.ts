import { I18nService } from 'nestjs-i18n';
import { ConfigService } from '@nestjs/config';
import { IPostGenerationService } from '../../../core/linkedin-post/domain/services/post-generation.service.interface';
import { OpenAiPostGenerationService } from './openai-post-generation.service';

/**
 * Supported LLM provider identifiers.
 *
 * Add a new value here and a corresponding branch in {@link createLlmProvider}
 * when integrating a new provider.
 */
export type LlmProvider = 'openai';

/**
 * Factory that resolves the concrete {@link IPostGenerationService} implementation
 * based on the `LLM_PROVIDER` environment variable.
 *
 * Defaults to `openai` when the variable is not set.
 *
 * To add a new provider:
 * 1. Add its identifier to the {@link LlmProvider} union type.
 * 2. Create a class that implements {@link IPostGenerationService}.
 * 3. Add a `case` below and instantiate your class.
 *
 * @throws {Error} If an unsupported `LLM_PROVIDER` value is configured.
 */
export function createLlmProvider(
  config: ConfigService,
  i18nService: I18nService,
): IPostGenerationService {
  const provider = config.get<string>('LLM_PROVIDER', 'openai') as LlmProvider;

  switch (provider) {
    case 'openai':
      return new OpenAiPostGenerationService(
        config.getOrThrow<string>('OPENAI_API_KEY'),
        config.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
        i18nService,
        config.get<number>('LLM_TEMPERATURE', 0.7),
        config.get<number>('LLM_MAX_TOKENS', 1_024),
      );

    default: {
      // Exhaustiveness check — TypeScript will error here if a new LlmProvider
      // value is added to the union without a corresponding case.
      const _exhaustive: never = provider;
      throw new Error(
        `Unsupported LLM_PROVIDER: "${String(_exhaustive)}". Supported values: openai`,
      );
    }
  }
}
