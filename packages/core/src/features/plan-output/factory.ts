import type { NormalizedPlan, PlanAndDigest, PlanEmissionPort, PlanOutputDeps } from "./ports.js";

function snapshotPlan(normalized: NormalizedPlan): NormalizedPlan {
  // The closed wire model has fixed container depth. Iteration copies and
  // freezes every layer without recursive traversal or retained input aliases.
  // Ordering and schema validation belong to preceding compiler features.
  return Object.freeze({
    kind: normalized.kind,
    schemaVersion: normalized.schemaVersion,
    profileId: normalized.profileId,
    roots: Object.freeze([...normalized.roots]),
    selections: Object.freeze(normalized.selections.map(selection => Object.freeze({
      moduleId: selection.moduleId,
      implementationId: selection.implementationId,
    }))),
    bindings: Object.freeze(normalized.bindings.map(binding => Object.freeze({
      consumerImplementationId: binding.consumerImplementationId,
      slotId: binding.slotId,
      capabilityId: binding.capabilityId,
      compatibility: Object.freeze({
        family: binding.compatibility.family,
        familyVersion: binding.compatibility.familyVersion,
        token: binding.compatibility.token,
      }),
      providerImplementationIds: Object.freeze([...binding.providerImplementationIds]),
    }))),
    dependencyOrder: Object.freeze([...normalized.dependencyOrder]),
  });
}

/** Pure construction. Domain separation and hashing belong to this feature. */
export function createPlanOutput({ canonicalizer }: PlanOutputDeps): PlanEmissionPort {
  return Object.freeze({
    async emit(normalized: NormalizedPlan): Promise<PlanAndDigest> {
      const plan = snapshotPlan(normalized);
      const envelope = Object.freeze({
        canonicalization: "RFC8785",
        hashAlgorithm: "SHA-256",
        kind: "get-modular.plan-content",
        plan,
        protocolVersion: 1,
      });
      // Own fixed bytes before the async primitive consumes its BufferSource.
      const bytes = new Uint8Array(canonicalizer.canonicalize(envelope));
      const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      const hex = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
      // Internal canonicalizer/platform failures reject; they are not diagnostics.
      return Object.freeze({ plan, digest: `gm-plan:v1:sha-256:${hex}` });
    },
  });
}
