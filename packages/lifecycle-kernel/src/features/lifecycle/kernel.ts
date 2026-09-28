import type {
  CallLease, CustodyLease, Generation, GenerationSnapshot, Lease,
  LifecycleKernel, Phase, Refusal, Result,
} from "./types.js";

interface GenerationRecord {
  phase: Phase;
  calls: number;
  custody: number;
}

interface LeaseRecord {
  readonly kind: "call" | "custody";
  readonly generation: GenerationRecord;
  released: boolean;
}

function accepted<T>(value: T): Result<T> {
  return Object.freeze({ ok: true, value });
}

function refused(reason: Refusal): Result<never> {
  return Object.freeze({ ok: false, reason });
}

/** Each instance owns its membership maps; neither map strongly retains keys. */
export function createLifecycleKernel(): LifecycleKernel {
  const generations = new WeakMap<Generation, GenerationRecord>();
  const leases = new WeakMap<Lease, LeaseRecord>();

  function stage(): Generation {
    const generation = Object.freeze(Object.create(null)) as Generation;
    generations.set(generation, { phase: "staged", calls: 0, custody: 0 });
    return generation;
  }

  function activate(generation: Generation): Result<"active"> {
    const record = generations.get(generation);
    if (!record) { return refused("foreign-generation"); }
    if (record.phase !== "staged") { return refused("invalid-phase"); }
    record.phase = "active";
    return accepted("active");
  }

  function quiesce(generation: Generation): Result<"quiescing"> {
    const record = generations.get(generation);
    if (!record) { return refused("foreign-generation"); }
    if (record.phase === "quiescing") { return accepted("quiescing"); }
    if (record.phase !== "active") { return refused("invalid-phase"); }
    record.phase = "quiescing";
    return accepted("quiescing");
  }

  function resume(generation: Generation): Result<"active"> {
    const record = generations.get(generation);
    if (!record) { return refused("foreign-generation"); }
    if (record.phase !== "quiescing") { return refused("invalid-phase"); }
    record.phase = "active";
    return accepted("active");
  }

  function retire(generation: Generation): Result<"retiring" | "retired"> {
    const record = generations.get(generation);
    if (!record) { return refused("foreign-generation"); }
    if (record.phase === "retired") { return accepted("retired"); }
    record.phase = "retiring";
    return accepted("retiring");
  }

  function beginCall(generation: Generation): Result<CallLease> {
    const record = generations.get(generation);
    if (!record) { return refused("foreign-generation"); }
    if (record.phase !== "active") { return refused("admission-closed"); }
    const lease = Object.freeze(Object.create(null)) as CallLease;
    leases.set(lease, { kind: "call", generation: record, released: false });
    record.calls++;
    return accepted(lease);
  }

  function retainCustody(generation: Generation): Result<CustodyLease> {
    const record = generations.get(generation);
    if (!record) { return refused("foreign-generation"); }
    if (record.phase !== "staged" && record.phase !== "active") {
      return refused("admission-closed");
    }
    const lease = Object.freeze(Object.create(null)) as CustodyLease;
    leases.set(lease, { kind: "custody", generation: record, released: false });
    record.custody++;
    return accepted(lease);
  }

  function checkCall(lease: CallLease): Result<"admitted"> {
    const record = leases.get(lease);
    if (!record) { return refused("foreign-lease"); }
    if (record.kind !== "call") { return refused("wrong-lease-kind"); }
    if (record.released) { return refused("released-lease"); }
    if (record.generation.phase === "retiring" || record.generation.phase === "retired") {
      return refused("revoked");
    }
    return accepted("admitted");
  }

  function release(lease: Lease): Result<"released" | "already-released"> {
    const record = leases.get(lease);
    if (!record) { return refused("foreign-lease"); }
    if (record.released) { return accepted("already-released"); }
    record.released = true;
    if (record.kind === "call") { record.generation.calls--; }
    else { record.generation.custody--; }
    return accepted("released");
  }

  function finishRetirement(generation: Generation): Result<"retired"> {
    const record = generations.get(generation);
    if (!record) { return refused("foreign-generation"); }
    if (record.phase === "retired") { return accepted("retired"); }
    if (record.phase !== "retiring") { return refused("invalid-phase"); }
    if (record.calls !== 0 || record.custody !== 0) { return refused("retained-work"); }
    record.phase = "retired";
    return accepted("retired");
  }

  function snapshot(generation: Generation): Result<GenerationSnapshot> {
    const record = generations.get(generation);
    if (!record) { return refused("foreign-generation"); }
    return accepted(Object.freeze({
      phase: record.phase, calls: record.calls, custody: record.custody,
    }));
  }

  return Object.freeze({
    stage, activate, quiesce, resume, retire, beginCall, retainCustody,
    checkCall, release, finishRetirement, snapshot,
  });
}
