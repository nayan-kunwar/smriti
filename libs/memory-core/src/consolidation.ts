/**
 * Near-duplicate detection for semantic memory consolidation. Pure and
 * deterministic. Groups memories whose significant-token sets overlap beyond a
 * Jaccard threshold, picking the highest-importance (then earliest) memory as
 * the survivor.
 */
export interface ConsolidationCandidate {
  id: string;
  content: string;
  importance: number;
}

export interface ConsolidationGroup {
  survivingId: string;
  mergedIds: string[];
}

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'are', 'was']);

function significantTokens(content: string): Set<string> {
  return new Set(
    content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3 && !STOP_WORDS.has(token)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return intersection / union;
}

export function findConsolidationGroups(
  candidates: ConsolidationCandidate[],
  threshold = 0.3,
): ConsolidationGroup[] {
  const tokens = candidates.map((candidate) => significantTokens(candidate.content));
  const assigned = new Array<boolean>(candidates.length).fill(false);
  const groups: ConsolidationGroup[] = [];

  for (let i = 0; i < candidates.length; i++) {
    if (assigned[i]) continue;
    const members = [i];
    assigned[i] = true;

    for (let j = i + 1; j < candidates.length; j++) {
      if (assigned[j]) continue;
      if (jaccard(tokens[i], tokens[j]) >= threshold) {
        members.push(j);
        assigned[j] = true;
      }
    }

    if (members.length < 2) continue;

    const survivor = members.reduce((best, idx) =>
      candidates[idx].importance > candidates[best].importance ? idx : best,
    );
    groups.push({
      survivingId: candidates[survivor].id,
      mergedIds: members.filter((idx) => idx !== survivor).map((idx) => candidates[idx].id),
    });
  }

  return groups;
}

export interface EmbeddingConsolidationCandidate extends ConsolidationCandidate {
  embedding: number[];
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Group near-duplicate memories by embedding cosine similarity. */
export function findConsolidationGroupsByEmbedding(
  candidates: EmbeddingConsolidationCandidate[],
  threshold = 0.92,
): ConsolidationGroup[] {
  const assigned = new Array<boolean>(candidates.length).fill(false);
  const groups: ConsolidationGroup[] = [];

  for (let i = 0; i < candidates.length; i++) {
    if (assigned[i]) continue;
    const members = [i];
    assigned[i] = true;

    for (let j = i + 1; j < candidates.length; j++) {
      if (assigned[j]) continue;
      if (cosineSimilarity(candidates[i].embedding, candidates[j].embedding) >= threshold) {
        members.push(j);
        assigned[j] = true;
      }
    }

    if (members.length < 2) continue;

    const survivor = members.reduce((best, idx) =>
      candidates[idx].importance > candidates[best].importance ? idx : best,
    );
    groups.push({
      survivingId: candidates[survivor].id,
      mergedIds: members.filter((idx) => idx !== survivor).map((idx) => candidates[idx].id),
    });
  }

  return groups;
}
