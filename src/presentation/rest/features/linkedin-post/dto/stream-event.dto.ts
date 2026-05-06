import { ApiProperty } from '@nestjs/swagger';

/**
 * SSE event emitted during a streaming LinkedIn post generation.
 * Each event is serialised as:  data: <JSON>\n\n
 */

export class StreamEventChunkDto {
  @ApiProperty({
    description: 'Discriminant for this event type.',
    example: 'chunk',
    enum: ['chunk'],
  })
  type: 'chunk';

  @ApiProperty({
    description:
      'A token fragment of the LinkedIn post content. ' +
      'Concatenate all `chunk` events in order to reconstruct the full post.',
    example: '🚀 Nous recrutons un',
  })
  content: string;
}

export class StreamEventNoteDto {
  @ApiProperty({
    description: 'Discriminant for this event type.',
    example: 'note',
    enum: ['note'],
  })
  type: 'note';

  @ApiProperty({
    description:
      'The full editorial intention note, emitted once after all post chunks. ' +
      'Explains the creative and editorial choices made for this post.',
    example:
      "L'accroche emoji crée un signal visuel fort dans le fil d'actualité LinkedIn. " +
      'Le ton professionnel et direct cible les développeurs expérimentés en recherche active.',
  })
  content: string;
}

export class StreamEventDoneDto {
  @ApiProperty({
    description: 'Discriminant for this event type.',
    example: 'done',
    enum: ['done'],
  })
  type: 'done';

  @ApiProperty({
    description:
      'Indicates whether the response was served from the in-memory cache. ' +
      'When `true`, no LLM call was made.',
    example: false,
  })
  fromCache: boolean;
}

export class StreamEventErrorDto {
  @ApiProperty({
    description: 'Discriminant for this event type.',
    example: 'error',
    enum: ['error'],
  })
  type: 'error';

  @ApiProperty({
    description: 'Machine-readable error code (i18n key).',
    example: 'linkedin-post.llm.unavailable',
  })
  code: string;

  @ApiProperty({
    description: 'HTTP status code that corresponds to this error.',
    example: 503,
  })
  statusCode: number;
}
