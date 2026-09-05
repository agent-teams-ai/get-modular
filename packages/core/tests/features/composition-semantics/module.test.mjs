import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import canonicalizeOracle from "canonicalize";
import { createCompositionSemantics } from "../../../dist-test/features/composition-semantics/factory.js";
import { createInputAdmission } from "../../../dist-test/features/input-admission/factory.js";
import { createOwnedJcs } from "../../../dist-test/features/canonicalization/owned-jcs/factory.js";

const snapshots = JSON.parse(await readFile(new URL(
  "../../../../../architecture/qualification/v1/diagnostic-snapshots.json", import.meta.url,
), "utf8"));
const witness = snapshots.orderingCases.find(value => value.name === "details-use-rfc8785-key-order-and-utf8-bytes");
assert.ok(witness);
const byName = new Map(snapshots.snapshots.map(value => [value.name, value.diagnostic]));
const operands = witness.operands.map(operand => {
  assert.ok(byName.has(operand.snapshot));
  return { ...structuredClone(byName.get(operand.snapshot)), ...structuredClone(operand.override ?? {}) };
});
assert.equal(operands.length, 2);
for (const key of ["code", "phase", "coordinate", "path"]) {
  assert.deepEqual(operands[0][key], operands[1][key]);
}
// Expected detail order comes from the independent development oracle.
operands.sort((left, right) => Buffer.compare(
  Buffer.from(canonicalizeOracle(left.details)), Buffer.from(canonicalizeOracle(right.details)),
));
assert.notEqual(canonicalizeOracle(operands[0].details), canonicalizeOracle(operands[1].details));

function collect(semantics, candidates) {
  const collector = semantics.newCollector();
  for (const candidate of candidates) collector.addUnique(candidate);
  return collector.finish();
}

test("uses injected detail bytes and keeps separate factory bindings", () => {
  const owned = createCompositionSemantics({ canonicalizer: createOwnedJcs({}) });
  const reversedBytes = new Map(operands.map((value, index) => [
    canonicalizeOracle(value.details), 1 - index,
  ]));
  let calls = 0;
  const replacement = createCompositionSemantics({ canonicalizer: {
    canonicalize(value) {
      calls += 1;
      const byte = reversedBytes.get(canonicalizeOracle(value));
      assert.notEqual(byte, undefined);
      return Uint8Array.of(byte);
    },
  } });
  assert.equal(calls, 0, "construction does not invoke the canonicalizer");
  for (const order of [operands, [...operands].reverse()]) {
    assert.deepEqual(collect(replacement, order), [...operands].reverse());
    assert.deepEqual(collect(owned, order), operands);
  }
  assert.ok(calls > 0);
  const restored = createCompositionSemantics({ canonicalizer: createOwnedJcs({}) });
  assert.deepEqual(collect(restored, operands), operands);
});

test("interleaved invocation collectors preserve admission failures and independent success", () => {
  const semantics = createCompositionSemantics({ canonicalizer: createOwnedJcs({}) });
  const admission = createInputAdmission({});
  const failedCollector = semantics.newCollector();
  const goodCollector = semantics.newCollector();
  assert.notEqual(failedCollector, goodCollector);
  assert.equal(Object.isFrozen(semantics), true);
  const failedInput = admission.admitObjectInput(
    { declarations: [], profile: { schemaVersion: 2 } }, failedCollector,
  );
  const input = {
    declarations: [{
      kind: "get-modular.module-declaration", schemaVersion: 1,
      moduleId: "example/root", implementationId: "example/root/default",
      owner: { authority: "example", path: ["root"] }, provides: [], slots: [],
    }],
    profile: {
      kind: "get-modular.composition-profile", schemaVersion: 1,
      profileId: "example/profile", roots: ["example/root"],
      selections: [{ moduleId: "example/root", implementationId: "example/root/default" }],
      bindings: [],
    },
  };
  const admitted = admission.admitObjectInput(input, goodCollector);
  assert.deepEqual(semantics.analyze(admitted, goodCollector), {
    ok: true,
    plan: {
      kind: "get-modular.composition-plan", schemaVersion: 1,
      profileId: "example/profile", roots: ["example/root"],
      selections: [{ moduleId: "example/root", implementationId: "example/root/default" }],
      bindings: [], dependencyOrder: ["example/root/default"],
    },
  });
  const failed = semantics.analyze(failedInput, failedCollector);
  assert.equal(failed.ok, false);
  assert.ok(failed.diagnostics.length > 0);
  assert.equal(Object.hasOwn(failed, "plan"), false);
  assert.equal(Object.hasOwn(failed, "digest"), false);
  assert.deepEqual(goodCollector.finish(), []);
  const next = semantics.newCollector();
  assert.equal(next.statistics().saturatedFailureCount, 0);
  assert.deepEqual(next.finish(), []);
});

test("propagates injected canonicalizer failure without manufacturing a diagnostic", () => {
  const failure = new Error("private-canonicalizer-failure");
  const semantics = createCompositionSemantics({ canonicalizer: {
    canonicalize() { throw failure; },
  } });
  const collector = semantics.newCollector();
  collector.addUnique(operands[0]);
  assert.throws(() => collector.addUnique(operands[1]), error => error === failure);
  assert.deepEqual(semantics.newCollector().finish(), []);
});
