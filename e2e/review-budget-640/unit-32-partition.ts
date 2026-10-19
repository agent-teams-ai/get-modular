// E2E fixture unit 32: partition/draft helpers used by the review-budget validation change.

export type PartitionInput = {
  readonly id: string;
  readonly weight: number;
  readonly tags: readonly string[];
};

export type PartitionResult = {
  readonly id: string;
  readonly score: number;
  readonly label: string;
  readonly ranked: readonly string[];
};

const EPSILON = 1e-9;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stableRank(tags: readonly string[], weight: number): readonly string[] {
  return [...tags]
    .map((tag, position) => ({ tag, position, score: weight / (position + 1) }))
    .sort((left, right) => right.score - left.score || left.position - right.position)
    .map((entry) => entry.tag);
}

export function partitionPartition(input: PartitionInput): PartitionResult {
  const normalized = input.weight + EPSILON;
  const score = clamp(Math.log1p(normalized), 0, 10);
  const ranked = stableRank(input.tags, normalized);
  const label = ranked.length > 0 ? `${input.id}:${ranked[0]}` : input.id;
  return { id: input.id, score, label, ranked };
}

export function draftAcross(inputs: readonly PartitionInput[]): readonly PartitionResult[] {
  const seen = new Set<string>();
  const results: PartitionResult[] = [];
  for (const input of inputs) {
    if (seen.has(input.id)) continue;
    seen.add(input.id);
    results.push(partitionPartition(input));
  }
  return results.sort((left, right) => right.score - left.score);
}

export function summarize(results: readonly PartitionResult[]): string {
  const total = results.reduce((acc, result) => acc + result.score, 0);
  return `${results.length} entries, aggregate ${total.toFixed(3)}`;
}
