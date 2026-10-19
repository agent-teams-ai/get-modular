// E2E fixture unit 18: measure/index helpers used by the review-budget validation change.

export type MeasureInput = {
  readonly id: string;
  readonly weight: number;
  readonly tags: readonly string[];
};

export type MeasureResult = {
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

export function measureMeasure(input: MeasureInput): MeasureResult {
  const normalized = input.weight + EPSILON;
  const score = clamp(Math.log1p(normalized), 0, 10);
  const ranked = stableRank(input.tags, normalized);
  const label = ranked.length > 0 ? `${input.id}:${ranked[0]}` : input.id;
  return { id: input.id, score, label, ranked };
}

export function indexAcross(inputs: readonly MeasureInput[]): readonly MeasureResult[] {
  const seen = new Set<string>();
  const results: MeasureResult[] = [];
  for (const input of inputs) {
    if (seen.has(input.id)) continue;
    seen.add(input.id);
    results.push(measureMeasure(input));
  }
  return results.sort((left, right) => right.score - left.score);
}

export function summarize(results: readonly MeasureResult[]): string {
  const total = results.reduce((acc, result) => acc + result.score, 0);
  return `${results.length} entries, aggregate ${total.toFixed(3)}`;
}
