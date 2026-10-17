export interface EffectsPort {
  readonly record: (effect: {
    readonly scope: string;
    readonly id: string;
    readonly value: string;
    readonly signal: AbortSignal;
  }) => Promise<void>;
}
