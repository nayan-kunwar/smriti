import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadConfig } from '@smriti/config';
import { HealthController } from './health/health.controller';
import { MemoriesController } from './memories/memories.controller';
import { MetricsController } from './metrics/metrics.controller';
import { SessionsController } from './sessions/sessions.controller';
import { UsersController } from './users/users.controller';
import { buildProviders } from './providers';

const config = loadConfig();

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: config.rateLimit.ttlMs,
        limit: config.rateLimit.max,
      },
    ]),
  ],
  controllers: [
    MemoriesController,
    UsersController,
    SessionsController,
    HealthController,
    MetricsController,
  ],
  providers: [
    ...buildProviders(),
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
