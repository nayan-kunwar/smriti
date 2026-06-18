import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { pingDb, type Db } from '@smriti/postgres';
import type { RedisClient } from '@smriti/redis';
import { TOKENS } from '../tokens';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(TOKENS.Db) private readonly db: Db,
    @Inject(TOKENS.Redis) private readonly redis: RedisClient,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const checks = await Promise.allSettled([pingDb(this.db), this.redis.ping()]);

    const postgres = checks[0].status === 'fulfilled';
    const redis = checks[1].status === 'fulfilled';
    const dependencies = { postgres, redis };

    if (!postgres || !redis) {
      throw new ServiceUnavailableException({ status: 'degraded', dependencies });
    }

    return { status: 'ok', dependencies };
  }
}
