import type { ListOptions, UserProfile } from '@smriti/shared-types';
import type { Memory, NewMemory } from './domain';
import type { NewUser, User } from './user-domain';

/**
 * Repository port for memory persistence. Implemented by the postgres adapter.
 * The domain owns this interface; infrastructure depends on the domain.
 */
export interface MemoryRepository {
  insert(memory: NewMemory): Promise<Memory>;
  findById(id: string): Promise<Memory | null>;
  listByUser(userId: string, options: ListOptions): Promise<Memory[]>;
  updateContent(id: string, content: string): Promise<Memory>;
  softDelete(id: string): Promise<void>;
  setImportance(id: string, importance: number): Promise<void>;
  setStatus(id: string, status: Memory['status']): Promise<void>;
  applyDecayImportance(cutoffDate: Date, decayFactor: number): Promise<number>;
  distinctActiveUserIds(limit?: number): Promise<string[]>;
}

export interface UserRepository {
  insert(user: NewUser): Promise<User>;
  findById(id: string): Promise<User | null>;
  listIds(limit?: number): Promise<string[]>;
}

export interface ProfileRepository {
  get(userId: string): Promise<{ profile: UserProfile; updatedAt: Date } | null>;
}

/** Invalidates cached retrieval results after memory writes. */
export interface ContextCacheInvalidator {
  invalidateUser(userId: string): Promise<void>;
}

/** Outbound port for publishing domain events. */
export interface EventPublisher {
  publish(event: {
    eventName: string;
    partitionKey: string;
    payload: Record<string, unknown>;
    traceparent?: string;
  }): Promise<void>;
}

/** Injectable clock so use cases stay deterministic and testable. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Injectable id generator. */
export interface IdGenerator {
  next(): string;
}
