declare const generationBrand: unique symbol;
declare const callLeaseBrand: unique symbol;
declare const custodyLeaseBrand: unique symbol;

/** Opaque identity of one executable generation in one kernel. */
export interface Generation {
  readonly [generationBrand]: true;
}

/** Retains an admitted call and its local effect authority until release. */
export interface CallLease {
  readonly [callLeaseBrand]: true;
}

/** Retains an acquisition or borrower lifetime, without call authority. */
export interface CustodyLease {
  readonly [custodyLeaseBrand]: true;
}

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
