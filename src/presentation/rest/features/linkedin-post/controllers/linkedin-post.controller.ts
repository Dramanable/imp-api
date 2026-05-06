import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import type { FastifyReply } from 'fastify';
import {
  GENERATE_LINKEDIN_POST_USE_CASE,
  GenerateLinkedInPostUseCase,
} from '../../../../../core/linkedin-post/application/use-cases/generate-linkedin-post.use-case';
import { EmptyInputException } from '../../../../../core/linkedin-post/domain/exceptions/empty-input.exception';
import { GeneratePostDto } from '../dto/generate-post.dto';
import { GeneratePostResponseDto } from '../dto/generate-post-response.dto';
import { StreamEventChunkDto, StreamEventDoneDto, StreamEventNoteDto } from '../dto/stream-event.dto';

@ApiTags('LinkedIn Post Generation')
@Controller('linkedin-post')
export class LinkedInPostController {
  constructor(
    @Inject(GENERATE_LINKEDIN_POST_USE_CASE)
    private readonly generateLinkedInPostUseCase: GenerateLinkedInPostUseCase,
  ) {}

  // ── Non-streaming endpoint ─────────────────────────────────────────────────

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate a LinkedIn post (JSON response)',
    description: `Generates a LinkedIn post (max 1,300 characters) and an editorial intention note.

**Request language** is detected from the \`Accept-Language\` header (default: \`fr\`).
- LLM prompt templates are fully localised (French / English).
- All error messages are also localised.

Results are **cached server-side** for 1 hour based on the combination of
\`companyDescription\`, \`brief\`, \`tone\`, and language. Identical requests served
from cache return \`fromCache: true\` and incur no additional LLM cost.

For a streaming experience (token-by-token), use \`POST /linkedin-post/generate/stream\`.`,
  })
  @ApiHeader({
    name: 'Accept-Language',
    required: false,
    description: 'BCP-47 language tag. Supported: `fr` (default), `en`.',
    example: 'fr',
  })
  @ApiHeader({
    name: 'X-Correlation-Id',
    required: false,
    description: 'Optional request identifier for distributed tracing.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiBody({ type: GeneratePostDto })
  @ApiResponse({
    status: 200,
    description: 'LinkedIn post successfully generated or served from cache.',
    type: GeneratePostResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: `Validation error. Possible causes:
- \`companyDescription\` is empty or missing
- \`brief\` is empty or missing
- \`companyDescription\` exceeds 2,000 characters
- \`brief\` exceeds 500 characters
- \`tone\` is not one of: \`professional\`, \`casual\`, \`inspiring\`, \`expert\`
- Unknown fields are present (strict mode)`,
    schema: {
      example: {
        statusCode: 400,
        error: 'linkedin-post.validation.company_description_required',
        message: 'La description de l\'entreprise est requise.',
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'The LLM service is temporarily unavailable.',
    schema: {
      example: {
        statusCode: 503,
        error: 'linkedin-post.llm.unavailable',
        message: 'Le service de génération est temporairement indisponible. Veuillez réessayer dans quelques instants.',
      },
    },
  })
  async generate(
    @Body() dto: GeneratePostDto,
    @Headers('accept-language') acceptLang?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<GeneratePostResponseDto> {
    return this.generateLinkedInPostUseCase.execute({
      companyDescription: dto.companyDescription,
      brief: dto.brief,
      tone: dto.tone,
      lang: extractLang(acceptLang),
      correlationId: correlationId ?? randomUUID(),
    });
  }

  // ── Streaming endpoint (SSE) ───────────────────────────────────────────────

  @Post('generate/stream')
  @ApiOperation({
    summary: 'Stream a LinkedIn post generation (Server-Sent Events)',
    description: `Streams the LinkedIn post token by token using **Server-Sent Events (SSE)**.

Each event is a \`data: <JSON>\\n\\n\` line. Three event types are emitted in order:

| Type | Description | Example payload |
|------|-------------|-----------------|
| \`chunk\` | A fragment of the LinkedIn post | \`{"type":"chunk","content":"🚀 Nous recrutons"}\` |
| \`note\` | The full editorial intention note (emitted once, at the end) | \`{"type":"note","content":"L'accroche emoji..."}\` |
| \`done\` | Stream completed | \`{"type":"done","fromCache":false}\` |

**Cache behaviour**: identical requests (same description + brief + tone + language)
are served from the in-memory cache. The post is still emitted as chunks for a
consistent streaming UX; \`done.fromCache\` will be \`true\`.

**Error handling**: if a domain error occurs, a \`data: {"type":"error","code":"...","statusCode":...}\`
event is emitted before the stream closes.

**Frontend integration example (JavaScript):**
\`\`\`js
const response = await fetch('/api/v1/linkedin-post/generate/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept-Language': 'fr' },
  body: JSON.stringify({ companyDescription, brief, tone }),
});
const reader = response.body.getReader();
// read chunks and parse SSE events...
\`\`\``,
  })
  @ApiProduces('text/event-stream')
  @ApiHeader({
    name: 'Accept-Language',
    required: false,
    description: 'BCP-47 language tag. Supported: `fr` (default), `en`.',
    example: 'fr',
  })
  @ApiHeader({
    name: 'X-Correlation-Id',
    required: false,
    description: 'Optional request identifier for distributed tracing.',
  })
  @ApiBody({ type: GeneratePostDto })
  @ApiResponse({
    status: 200,
    description: `SSE stream. Content-Type: \`text/event-stream\`.
Each line is \`data: <JSON>\\n\\n\`. See the description above for event types.`,
    schema: {
      type: 'string',
      example: [
        'data: {"type":"chunk","content":"🚀 Nous recrutons un ingénieur"}',
        '',
        'data: {"type":"chunk","content":" DevOps senior !"}',
        '',
        'data: {"type":"note","content":"L\'accroche emoji crée un signal visuel fort."}',
        '',
        'data: {"type":"done","fromCache":false}',
        '',
      ].join('\n'),
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error (same codes as the non-streaming endpoint).',
  })
  @ApiResponse({
    status: 503,
    description: 'LLM service unavailable.',
  })
  async stream(
    @Body() dto: GeneratePostDto,
    @Res() reply: FastifyReply,
    @Headers('accept-language') acceptLang?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<void> {
    const raw = reply.raw;
    raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    raw.setHeader('Cache-Control', 'no-cache');
    raw.setHeader('Connection', 'keep-alive');
    raw.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
    raw.flushHeaders?.();

    const sendEvent = (event: StreamEventChunkDto | StreamEventNoteDto | StreamEventDoneDto | { type: 'error'; code: string; statusCode: number }) => {
      raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      for await (const event of this.generateLinkedInPostUseCase.executeStream({
        companyDescription: dto.companyDescription,
        brief: dto.brief,
        tone: dto.tone,
        lang: extractLang(acceptLang),
        correlationId: correlationId ?? randomUUID(),
      })) {
        sendEvent(event);
      }
    } catch (error) {
      if (error instanceof EmptyInputException) {
        sendEvent({ type: 'error', code: (error as EmptyInputException).key, statusCode: 400 });
      } else {
        sendEvent({ type: 'error', code: 'linkedin-post.llm.unavailable', statusCode: 503 });
      }
    } finally {
      raw.end();
    }
  }
}

/** Extract the primary language code from an Accept-Language header value. */
function extractLang(acceptLang?: string): string {
  if (!acceptLang) return 'fr';
  // Array indexing is safe here: split always returns at least one element.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const part0 = acceptLang.split(',')[0]!;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const primary = part0.split(';')[0]!.trim().slice(0, 2).toLowerCase();
  return ['fr', 'en'].includes(primary) ? primary : 'fr';
}

