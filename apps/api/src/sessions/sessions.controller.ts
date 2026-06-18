import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import type { WorkingMemoryStore } from '@smriti/redis';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { appendTurnSchema, type AppendTurnBody } from '../dto';
import { TOKENS } from '../tokens';

@Controller('sessions')
export class SessionsController {
  constructor(@Inject(TOKENS.WorkingMemory) private readonly workingMemory: WorkingMemoryStore) {}

  @Post(':sessionId/turns')
  @HttpCode(201)
  async appendTurn(
    @Param('sessionId') sessionId: string,
    @Body(new ZodValidationPipe(appendTurnSchema)) body: AppendTurnBody,
  ) {
    await this.workingMemory.append({ sessionId, role: body.role, content: body.content });
    return { ok: true };
  }

  @Get(':sessionId/turns')
  async listTurns(@Param('sessionId') sessionId: string) {
    const turns = await this.workingMemory.list(sessionId);
    return { sessionId, turns, count: turns.length };
  }

  @Delete(':sessionId/turns')
  @HttpCode(204)
  async clearTurns(@Param('sessionId') sessionId: string) {
    await this.workingMemory.clear(sessionId);
  }
}
