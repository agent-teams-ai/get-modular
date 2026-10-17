export interface SessionRequest {
  readonly id: string;
  readonly payload: string;
  readonly signal: AbortSignal;
}

export interface RunnerRequest extends SessionRequest {
  readonly scope: string;
}

export interface SessionPort {
  readonly run: (request: SessionRequest) => Promise<string>;
}

export interface RunnerPort {
  readonly run: (request: RunnerRequest) => Promise<string>;
}

export interface IdentityPort {
  readonly read: () => string;
}

export interface JournalRecord {
  readonly kind: "effect" | "terminal" | "resource-acquired" | "resource-released" | "cleanup-attempt";
  readonly scope: string;
  readonly id: string;
  readonly value: string;
}

export interface JournalPort {
  readonly append: (record: JournalRecord) => Promise<void>;
}
