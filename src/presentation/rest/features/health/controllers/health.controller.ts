import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type Redis from 'ioredis';

/** Injection token for the shared ioredis client. Defined here to avoid circular imports. */
export const REDIS_CLIENT_TOKEN = Symbol('REDIS_CLIENT');

/** Shape of the health check response. */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  redis: 'up' | 'down';
  uptime: number;
  timestamp: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(REDIS_CLIENT_TOKEN) private readonly redisClient: Redis,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Check the health of the API and its dependencies' })
  @ApiResponse({
    status: 200,
    description: 'API is running. Redis may be degraded.',
    schema: {
      example: {
        status: 'ok',
        redis: 'up',
        uptime: 42.5,
        timestamp: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  async health(): Promise<HealthResponse> {
    const redis = await this.pingRedis();
    return {
      status: redis === 'up' ? 'ok' : 'degraded',
      redis,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  private async pingRedis(): Promise<'up' | 'down'> {
    try {
      const result = await this.redisClient.ping();
      return result === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
