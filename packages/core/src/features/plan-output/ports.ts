import type { CompositionPlan, PlanDigest } from "../authoring/internal.js";
import type { JsonValue } from "../canonicalization/ports.js";

/** Already admitted and normalized by composition semantics. */
export type NormalizedPlan = CompositionPlan;

// This consumer owns the driven port; structural typing joins the provider.
export interface CanonicalBytesPort {
  readonly canonicalize: (value: JsonValue) => Uint8Array;
}

export type PlanAndDigest = {
  readonly plan: CompositionPlan;
  readonly digest: PlanDigest;
};

export interface PlanEmissionPort {
  readonly emit: (normalized: NormalizedPlan) => Promise<PlanAndDigest>;
}

export interface PlanOutputDeps {
  readonly canonicalizer: CanonicalBytesPort;
}
