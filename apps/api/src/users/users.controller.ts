import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type {
  CreateUserUseCase,
  GetUserProfileUseCase,
  GetUserUseCase,
  ListMemoriesUseCase,
} from '@smriti/memory-core';
import type { UserDTO } from '@smriti/shared-types';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { createUserSchema, listQuerySchema, type CreateUserBody, type ListQuery } from '../dto';
import { TOKENS } from '../tokens';

function toUserDTO(user: { id: string; name: string | null; createdAt: Date }): UserDTO {
  return { id: user.id, name: user.name, createdAt: user.createdAt.toISOString() };
}

@Controller('users')
export class UsersController {
  constructor(
    @Inject(TOKENS.CreateUserUseCase) private readonly createUser: CreateUserUseCase,
    @Inject(TOKENS.GetUserUseCase) private readonly getUser: GetUserUseCase,
    @Inject(TOKENS.GetUserProfileUseCase) private readonly getUserProfile: GetUserProfileUseCase,
    @Inject(TOKENS.ListMemoriesUseCase) private readonly listMemories: ListMemoriesUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  async create(@Body(new ZodValidationPipe(createUserSchema)) body: CreateUserBody) {
    const user = await this.createUser.execute(body);
    return { user: toUserDTO(user) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const user = await this.getUser.execute(id);
    return { user: toUserDTO(user) };
  }

  @Get(':id/profile')
  async profile(@Param('id') id: string) {
    return this.getUserProfile.execute(id);
  }

  @Get(':id/memories')
  async memories(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    const items = await this.listMemories.execute(id, {
      limit: query.limit,
      offset: query.offset,
    });
    return { items, count: items.length };
  }
}
