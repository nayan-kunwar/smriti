import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import { UnauthorizedError } from '@smriti/auth';
import { DomainError, MemoryNotFoundError, ProfileNotFoundError, UserAlreadyExistsError, UserNotFoundError, ValidationError } from '@smriti/memory-core';
import type { FastifyReply } from 'fastify';

/** Maps domain and HTTP exceptions to consistent JSON error responses. */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const { status, body } = this.toResponse(exception);
    void reply.status(status).send(body);
  }

  private toResponse(exception: unknown): {
    status: number;
    body: { error: string; message: string; details?: unknown };
  } {
    if (exception instanceof UnauthorizedError) {
      return { status: 401, body: { error: 'UNAUTHORIZED', message: exception.message } };
    }
    if (exception instanceof MemoryNotFoundError) {
      return { status: 404, body: { error: exception.code, message: exception.message } };
    }
    if (exception instanceof UserNotFoundError || exception instanceof ProfileNotFoundError) {
      return { status: 404, body: { error: exception.code, message: exception.message } };
    }
    if (exception instanceof UserAlreadyExistsError) {
      return { status: 409, body: { error: exception.code, message: exception.message } };
    }
    if (exception instanceof ValidationError) {
      return { status: 400, body: { error: exception.code, message: exception.message } };
    }
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      return {
        status: exception.getStatus(),
        body:
          typeof response === 'string'
            ? { error: 'HTTP_ERROR', message: response }
            : { error: 'HTTP_ERROR', message: exception.message, details: response },
      };
    }
    if (exception instanceof DomainError) {
      return { status: 422, body: { error: exception.code, message: exception.message } };
    }
    return {
      status: 500,
      body: { error: 'INTERNAL_ERROR', message: 'Internal server error' },
    };
  }
}
