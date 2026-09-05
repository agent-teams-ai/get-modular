import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Independent expected-output recipe: no input generator, subject census,
// graph traversal, canonicalizer or returned plan supplies these expectations.
export function expectedP500Plan() {
  const module = i => `example/p500/module-${String(i).padStart(4, "0")}`;
  const implementation = i => `${module(i)}/implementation-${"x".repeat(48)}`;
  const bindings = [];
  for (let consumer = 1; consumer < 500; consumer += 1) {
    for (const slotId of ["many", "optional", "required"]) {
      if (slotId === "optional" && consumer === 1) continue;
      const providers = slotId === "many"
        ? Array.from({ length: Math.min(consumer, 48) }, (_, i) => Math.max(0, consumer - 48) + i)
        : [consumer - (slotId === "optional" ? 2 : 1)];
      bindings.push({ consumerImplementationId: implementation(consumer), slotId,
        capabilityId: "example/p500/capability", compatibility: {
          family: "exact", familyVersion: 1, token: "example/p500/capability" },
        providerImplementationIds: providers.map(implementation) });
    }
  }
  return { kind: "get-modular.composition-plan", schemaVersion: 1, profileId: "example/p500/profile",
    roots: [module(499)], selections: Array.from({ length: 500 }, (_, i) => ({ moduleId: module(i), implementationId: implementation(i) })),
    bindings, dependencyOrder: Array.from({ length: 500 }, (_, i) => implementation(i)) };
}

// This small oracle is deliberately restricted to the ASCII/integer fixture
// domain. It is not another general RFC8785 implementation.
function fixtureCanonical(value) {
  if (Array.isArray(value)) return `[${value.map(fixtureCanonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${fixtureCanonical(value[key])}`).join(",")}}`;
  assert.ok(typeof value === "string" && /^[\x20-\x7e]*$/u.test(value) || Number.isSafeInteger(value));
  return JSON.stringify(value);
}
export function expectedDigest(plan) {
  const bytes = fixtureCanonical({ canonicalization: "RFC8785", hashAlgorithm: "SHA-256",
    kind: "get-modular.plan-content", plan, protocolVersion: 1 });
  return `gm-plan:v1:sha-256:${createHash("sha256").update(bytes).digest("hex")}`;
}
// Independently reproduced with Python sorted compact JSON over this closed
// ASCII recipe, not captured from the production compiler or canonicalizer.
export const p500Digest = "gm-plan:v1:sha-256:30ebe42d0c5fd429fe20177551c739bca784e74f97d4c7bf42300c9c46b46f55";
