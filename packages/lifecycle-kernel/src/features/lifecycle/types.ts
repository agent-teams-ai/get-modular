declare class GenerationIdentity {
  private readonly generationIdentity: void;
}

declare class CallLeaseIdentity {
  private readonly callLeaseIdentity: void;
}

declare class CustodyLeaseIdentity {
  private readonly custodyLeaseIdentity: void;
}

/** Opaque identity of one executable generation in one kernel. */
export type Generation = GenerationIdentity;

/** Retains an admitted call and its local effect authority until release. */
export type CallLease = CallLeaseIdentity;

/** Retains an acquisition or borrower lifetime, without call authority. */
export type CustodyLease = CustodyLeaseIdentity;

export type Lease = CallLease | CustodyLease;
export type Phase = "staged" | "active" | "quiescing" | "retiring" | "retired";
export type Refusal =
  | "foreign-generation"
  | "foreign-lease"
  | "wrong-lease-kind"
  | "invalid-phase"
  | "admission-closed"
  | "revoked"
  | "released-lease"
  | "retained-work";

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: Refusal };

export interface GenerationSnapshot {
  readonly phase: Phase;
  readonly calls: number;
  readonly custody: number;
}

/** Synchronous bookkeeping. Host policy, effects, and physical cleanup stay outside. */
export interface LifecycleKernel {
  stage(): Generation;
  activate(generation: Generation): Result<"active">;
  quiesce(generation: Generation): Result<"quiescing">;
  resume(generation: Generation): Result<"active">;
  retire(generation: Generation): Result<"retiring" | "retired">;
  beginCall(generation: Generation): Result<CallLease>;
  retainCustody(generation: Generation): Result<CustodyLease>;
  checkCall(lease: CallLease): Result<"admitted">;
  release(lease: Lease): Result<"released" | "already-released">;
  finishRetirement(generation: Generation): Result<"retired">;
  snapshot(generation: Generation): Result<GenerationSnapshot>;
}
