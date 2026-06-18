import { describe, expect, it } from 'vitest';
import { findConsolidationGroupsByEmbedding } from './consolidation';

describe('findConsolidationGroupsByEmbedding', () => {
  it('groups vectors above the similarity threshold', () => {
    const groups = findConsolidationGroupsByEmbedding(
      [
        { id: 'a', content: 'one', importance: 1, embedding: [1, 0, 0] },
        { id: 'b', content: 'two', importance: 2, embedding: [0.99, 0.01, 0] },
        { id: 'c', content: 'three', importance: 1, embedding: [0, 1, 0] },
      ],
      0.9,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].survivingId).toBe('b');
    expect(groups[0].mergedIds).toEqual(['a']);
  });
});
