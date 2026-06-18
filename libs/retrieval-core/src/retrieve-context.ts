import { rankCandidates, type RankingWeights } from '@smriti/ranking';
import type { RetrievalRequest, RetrievalResult } from '@smriti/shared-types';
import type { Clock, QueryEmbedder, RetrievalCachePort, VectorSearchPort, WorkingMemoryPort } from './ports';

export interface RetrieveContextDeps {
  embedder: QueryEmbedder;
  vectorSearch: VectorSearchPort;
  cache?: RetrievalCachePort;
  workingMemory?: WorkingMemoryPort;
  clock?: Clock;
  weights?: RankingWeights;
}

export interface RetrieveContextOptions {
  /** Number of candidates pulled from vector search before ranking. */
  candidateLimit?: number;
  /** Final number of memories returned. */
  topN?: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * The synchronous retrieval pipeline:
 * cache -> embed -> vector search -> rank -> build context -> cache.
 * See docs/architecture/retrieval-pipeline-design.md.
 */
export class RetrieveContextUseCase {
  private readonly clock: Clock;

  constructor(
    private readonly deps: RetrieveContextDeps,
    private readonly options: RetrieveContextOptions = {},
  ) {
    this.clock = deps.clock ?? { now: () => new Date() };
  }

  async execute(
    request: RetrievalRequest,
  ): Promise<{ result: RetrievalResult; cacheHit: boolean }> {
    const candidateLimit = this.options.candidateLimit ?? 20;
    const topN = request.limit ?? this.options.topN ?? 5;
    const query = request.query.trim();

    if (this.deps.cache) {
      const cached = await this.deps.cache.get(request.userId, query);
      if (cached) {
        return { result: cached, cacheHit: true };
      }
    }

    const embedding = await this.deps.embedder.embed(query);
    const candidates = await this.deps.vectorSearch.search({
      userId: request.userId,
      embedding,
      limit: candidateLimit,
    });

    const now = this.clock.now().getTime();
    const ranked = rankCandidates(
      candidates.map((candidate) => ({
        memoryId: candidate.memoryId,
        content: candidate.content,
        similarity: candidate.similarity,
        importance: candidate.importance,
        ageDays: Math.max(0, (now - candidate.createdAt.getTime()) / MS_PER_DAY),
      })),
      topN,
      this.deps.weights,
    );

    const result: RetrievalResult = {
      context: dedupe(ranked.map((item) => item.content)),
      items: ranked.map((item) => ({
        memoryId: item.memoryId,
        content: item.content,
        score: Number(item.score.toFixed(6)),
      })),
    };

    if (request.sessionId && this.deps.workingMemory) {
      const turns = await this.deps.workingMemory.list(request.sessionId);
      const sessionContext = turns.map((turn) => `${turn.role}: ${turn.content}`);
      result.context = [...sessionContext, ...result.context];
    }

    if (this.deps.cache) {
      await this.deps.cache.set(request.userId, query, result);
    }

    return { result, cacheHit: false };
  }
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}
