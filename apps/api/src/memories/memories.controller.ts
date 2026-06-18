import { Body, Controller, Delete, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import type { Principal } from '@smriti/auth';
import type {
  CreateMemoryUseCase,
  DeleteMemoryUseCase,
  UpdateMemoryUseCase,
} from '@smriti/memory-core';
import type { Metrics } from '@smriti/observability';
import { getTraceparent } from '@smriti/observability';
import type { RetrieveContextUseCase } from '@smriti/retrieval-core';
import { CurrentUser } from '../http/current-user.decorator';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { TOKENS } from '../tokens';
import {
  createMemorySchema,
  retrievalSchema,
  updateMemorySchema,
  type CreateMemoryBody,
  type RetrievalBody,
  type UpdateMemoryBody,
} from '../dto';

@Controller('memories')
export class MemoriesController {
  constructor(
    @Inject(TOKENS.CreateMemoryUseCase) private readonly createMemory: CreateMemoryUseCase,
    @Inject(TOKENS.UpdateMemoryUseCase) private readonly updateMemory: UpdateMemoryUseCase,
    @Inject(TOKENS.DeleteMemoryUseCase) private readonly deleteMemory: DeleteMemoryUseCase,
    @Inject(TOKENS.RetrieveContextUseCase)
    private readonly retrieveContext: RetrieveContextUseCase,
    @Inject(TOKENS.Metrics) private readonly metrics: Metrics,
  ) {}

  @Post()
  @HttpCode(202)
  async create(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createMemorySchema)) body: CreateMemoryBody,
  ) {
    const memory = await this.createMemory.execute(
      {
        userId: principal.userId,
        type: body.type,
        content: body.content,
        metadata: body.metadata,
      },
      getTraceparent(),
    );
    return { memory };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMemorySchema)) body: UpdateMemoryBody,
  ) {
    const memory = await this.updateMemory.execute(id, body.content, getTraceparent());
    return { memory };
  }

  @Post('context')
  @HttpCode(200)
  async context(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(retrievalSchema)) body: RetrievalBody,
  ) {
    const stop = this.metrics.retrievalLatency.startTimer();
    const { result, cacheHit } = await this.retrieveContext.execute({
      userId: principal.userId,
      query: body.query,
      limit: body.limit,
      sessionId: body.sessionId,
    });
    stop({ cache_hit: String(cacheHit) });
    this.metrics.contextCacheEvents.inc({ result: cacheHit ? 'hit' : 'miss' });
    return result;
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() _principal: Principal, @Param('id') id: string) {
    await this.deleteMemory.execute(id);
  }
}
