import { Controller, Get, Header, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Metrics } from '@smriti/observability';
import { TOKENS } from '../tokens';

@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(@Inject(TOKENS.Metrics) private readonly metrics: Metrics) {}

  @Get()
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(): Promise<string> {
    const { body } = await this.metrics.expose();
    return body;
  }
}
