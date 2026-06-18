import { z } from 'zod';

export const createMemorySchema = z.object({
  type: z.enum(['working', 'episodic', 'semantic']),
  content: z.string().min(1).max(10_000),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateMemoryBody = z.infer<typeof createMemorySchema>;

export const createUserSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
});
export type CreateUserBody = z.infer<typeof createUserSchema>;

export const updateMemorySchema = z.object({
  content: z.string().min(1).max(10_000),
});
export type UpdateMemoryBody = z.infer<typeof updateMemorySchema>;

export const retrievalSchema = z.object({
  query: z.string().min(1).max(4_000),
  limit: z.number().int().positive().max(50).optional(),
  sessionId: z.string().min(1).max(128).optional(),
});
export type RetrievalBody = z.infer<typeof retrievalSchema>;

export const appendTurnSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(10_000),
});
export type AppendTurnBody = z.infer<typeof appendTurnSchema>;

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
