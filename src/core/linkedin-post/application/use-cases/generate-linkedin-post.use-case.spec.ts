import { GenerateLinkedInPostUseCase } from './generate-linkedin-post.use-case';
import { GeneratedPost } from '../../domain/entities/generated-post.entity';
import { EmptyInputException } from '../../domain/exceptions/empty-input.exception';
import { LlmUnavailableException } from '../../domain/exceptions/llm-unavailable.exception';
import { IPostGenerationService } from '../../domain/services/post-generation.service.interface';
import { ICacheService } from '../../../shared/interfaces/cache.interface';
import { ILogger } from '../../../shared/interfaces/logger.interface';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGeneratedPost = new GeneratedPost(
  '🚀 Nous recrutons un ingénieur DevOps senior !',
  "L'accroche emoji crée un signal visuel fort.",
);

function makeMockService(
  generateFn?: () => Promise<GeneratedPost>,
  streamFn?: () => AsyncGenerator<string>,
): IPostGenerationService {
  return {
    generate: jest.fn(generateFn ?? (() => Promise.resolve(mockGeneratedPost))),
    generateStream: jest.fn(
      streamFn ??
        (async function* () {
          yield '🚀 Nous recrutons';
          yield '---NOTE---';
          yield "L'accroche emoji crée un signal visuel fort.";
        }),
    ),
  };
}

function makeMockCache(): ICacheService {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(function <T>(key: string): Promise<T | null> {
      const val = store.get(key);
      return Promise.resolve(val !== undefined ? (val as T) : null);
    }) as ICacheService['get'],
    set: jest.fn(function <T>(key: string, value: T): Promise<void> {
      store.set(key, value);
      return Promise.resolve();
    }) as ICacheService['set'],
  };
}

const mockLogger: ILogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const BASE_INPUT = {
  companyDescription: 'TechFlow, spécialiste de la transformation numérique.',
  brief: 'Annonce de recrutement DevOps senior.',
  tone: 'professional', // predefined tone
  lang: 'fr',
  correlationId: 'test-correlation-id',
};

// ── Tests: execute() (non-streaming) ─────────────────────────────────────────

describe('GenerateLinkedInPostUseCase.execute()', () => {
  let service: IPostGenerationService;
  let cache: ICacheService;
  let useCase: GenerateLinkedInPostUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeMockService();
    cache = makeMockCache();
    useCase = new GenerateLinkedInPostUseCase(service, cache, mockLogger);
  });

  it('should call the generation service and return a result', async () => {
    const result = await useCase.execute(BASE_INPUT);

    expect(result.post).toBe(mockGeneratedPost.post);
    expect(result.intentionNote).toBe(mockGeneratedPost.intentionNote);
    expect(result.fromCache).toBe(false);
    expect(service.generate).toHaveBeenCalledTimes(1);
  });

  it('should store the result in cache', async () => {
    await useCase.execute(BASE_INPUT);

    expect(cache.set).toHaveBeenCalledWith(
      expect.any(String),
      mockGeneratedPost,
    );
  });

  it('should return cached result on second identical call', async () => {
    await useCase.execute(BASE_INPUT);
    const result = await useCase.execute(BASE_INPUT);

    expect(result.fromCache).toBe(true);
    expect(service.generate).toHaveBeenCalledTimes(1); // LLM called only once
  });

  it('should include lang in the cache key (different languages = different entries)', async () => {
    await useCase.execute({ ...BASE_INPUT, lang: 'fr' });
    await useCase.execute({ ...BASE_INPUT, lang: 'en' });

    expect(service.generate).toHaveBeenCalledTimes(2);
  });

  it('should throw EmptyInputException when companyDescription is empty', async () => {
    await expect(
      useCase.execute({ ...BASE_INPUT, companyDescription: '' }),
    ).rejects.toBeInstanceOf(EmptyInputException);
  });

  it('should throw EmptyInputException when companyDescription is only spaces', async () => {
    await expect(
      useCase.execute({ ...BASE_INPUT, companyDescription: '   ' }),
    ).rejects.toBeInstanceOf(EmptyInputException);
  });

  it('should throw EmptyInputException when brief is empty', async () => {
    await expect(
      useCase.execute({ ...BASE_INPUT, brief: '' }),
    ).rejects.toBeInstanceOf(EmptyInputException);
  });

  it('should rethrow LlmUnavailableException from the service', async () => {
    (service.generate as jest.Mock).mockRejectedValueOnce(
      new LlmUnavailableException('linkedin-post.llm.unavailable'),
    );

    await expect(useCase.execute(BASE_INPUT)).rejects.toBeInstanceOf(
      LlmUnavailableException,
    );
  });

  it('should wrap unknown service errors in LlmUnavailableException', async () => {
    (service.generate as jest.Mock).mockRejectedValueOnce(
      new Error('Network timeout'),
    );

    await expect(useCase.execute(BASE_INPUT)).rejects.toBeInstanceOf(
      LlmUnavailableException,
    );
  });
});

// ── Tests: executeStream() ────────────────────────────────────────────────────

describe('GenerateLinkedInPostUseCase.executeStream()', () => {
  let service: IPostGenerationService;
  let cache: ICacheService;
  let useCase: GenerateLinkedInPostUseCase;

  async function collectEvents(input = BASE_INPUT) {
    const events: Array<{ type: string; content?: string; fromCache?: boolean }> = [];
    for await (const event of useCase.executeStream(input)) {
      events.push(event);
    }
    return events;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeMockService();
    cache = makeMockCache();
    useCase = new GenerateLinkedInPostUseCase(service, cache, mockLogger);
  });

  it('should emit chunk, note, and done events', async () => {
    (service.generateStream as jest.Mock).mockImplementation(async function* () {
      yield '🚀 Nous recrutons';
      yield '---NOTE---';
      yield "L'accroche emoji.";
    });

    const events = await collectEvents();

    expect(events.some((e) => e.type === 'chunk')).toBe(true);
    expect(events.some((e) => e.type === 'note')).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
    expect(events.at(-1)?.fromCache).toBe(false);
  });

  it('should not emit separator bytes in chunk events', async () => {
    (service.generateStream as jest.Mock).mockImplementation(async function* () {
      yield 'Post content here---NOTE---Note here';
    });

    const events = await collectEvents();
    const chunks = events.filter((e) => e.type === 'chunk');
    const allChunkContent = chunks.map((e) => e.content).join('');

    expect(allChunkContent).not.toContain('---NOTE---');
    expect(allChunkContent).toBe('Post content here');
  });

  it('should emit note event with intention note content', async () => {
    const expectedNote = 'Note éditoriale importante.';
    (service.generateStream as jest.Mock).mockImplementation(async function* () {
      yield `Post content---NOTE---${expectedNote}`;
    });

    const events = await collectEvents();
    const noteEvent = events.find((e) => e.type === 'note');

    expect(noteEvent?.content).toBe(expectedNote);
  });

  it('should store parsed result in cache after streaming', async () => {
    (service.generateStream as jest.Mock).mockImplementation(async function* () {
      yield 'Contenu du post---NOTE---Note ici.';
    });

    await collectEvents();

    expect(cache.set).toHaveBeenCalledTimes(1);
    const [, cachedPost] = (cache.set as jest.Mock).mock.calls[0] as [string, GeneratedPost];
    expect(cachedPost.post).toBe('Contenu du post');
    expect(cachedPost.intentionNote).toBe('Note ici.');
  });

  it('should replay cache as fake stream chunks (fromCache: true)', async () => {
    // Populate cache via first call
    (service.generateStream as jest.Mock).mockImplementation(async function* () {
      yield 'Cached post---NOTE---Cached note.';
    });
    await collectEvents();

    // Second call with identical input should use cache
    const events = await collectEvents();

    expect(events.at(-1)?.fromCache).toBe(true);
    expect(service.generateStream).toHaveBeenCalledTimes(1);
  });

  it('should throw EmptyInputException before streaming when inputs are invalid', async () => {
    const gen = useCase.executeStream({ ...BASE_INPUT, companyDescription: '' });
    await expect(gen.next()).rejects.toBeInstanceOf(EmptyInputException);
  });

  it('should rethrow LlmUnavailableException from the stream', async () => {
    (service.generateStream as jest.Mock).mockImplementation(async function* () {
      throw new LlmUnavailableException('linkedin-post.llm.unavailable');
      yield ''; // make TypeScript happy
    });

    const gen = useCase.executeStream(BASE_INPUT);
    await expect(gen.next()).rejects.toBeInstanceOf(LlmUnavailableException);
  });
});
