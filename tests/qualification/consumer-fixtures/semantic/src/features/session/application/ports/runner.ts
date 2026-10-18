export interface RunnerPort {
  readonly run: (request: {
    readonly scope: string;
    readonly id: string;
    readonly payload: string;
    readonly signal: AbortSignal;
  }) => Promise<string>;
}
