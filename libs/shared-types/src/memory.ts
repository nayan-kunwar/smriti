/**
 * Shared, dependency-light memory contracts used across services.
 * This library must not depend on any other internal library.
 */

export type MemoryType = 'working' | 'episodic' | 'semantic';

export type MemoryStatus = 'pending' | 'active' | 'archived' | 'deleted';

export interface MemoryDTO {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  importance: number;
  status: MemoryStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UserDTO {
  id: string;
  name: string | null;
  createdAt: string;
}

export interface CreateUserRequest {
  id?: string;
  name?: string;
}

export interface CreateMemoryRequest {
  userId: string;
  type: MemoryType;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RetrievalRequest {
  userId: string;
  query: string;
  limit?: number;
  sessionId?: string;
}

export interface RetrievedMemory {
  memoryId: string;
  content: string;
  score: number;
}

export interface RetrievalResult {
  context: string[];
  items: RetrievedMemory[];
}

/** A single turn of working (session) memory stored in Redis. */
export interface WorkingMemoryTurn {
  sessionId: string;
  role: string;
  content: string;
}
