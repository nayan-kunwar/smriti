/** Exponential decay factor by memory age. */
export function decayFactor(ageDays: number, halfLifeDays = 30): number {
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/** Apply age-based decay to a stored importance score. */
export function effectiveImportance(importance: number, ageDays: number, halfLifeDays = 30): number {
  return importance * decayFactor(ageDays, halfLifeDays);
}
