import assert from "node:assert/strict";
import test from "node:test";
import { compileComposition, defineModule, required, type CompileCompositionResult, type Diagnostic } from "@get-modular/core";
import { assemblyFor, declareModule, defineContract, formatFailure, group, implement } from "@get-modular/assembly";
import type { AssemblyPreparationResult, CapabilitiesOf, UnresolvedBinding } from "@get-modular/assembly";

type CoreFailure = Extract<CompileCompositionResult, { readonly ok: false }>;
type PreparationFailure = Extract<AssemblyPreparationResult<never>, { readonly status: "failed" }>;

test("formatFailure keeps real Core binding facts and hides pre-Core Assembly authoring strings", async () => {
  const owner = { authority: "formatter", path: ["test"] };
  const expected = { family: "exact", familyVersion: 1, token: "formatter/value/r2" } as const;
  const provider = defineModule({
    kind: "get-modular.module-declaration", schemaVersion: 1, owner,
    moduleId: "formatter/provider", implementationId: "formatter/provider/default", slots: [],
    provides: [{ capabilityId: "formatter/value", compatibility: { ...expected, token: "formatter/value/r1" } }],
  });
  const consumer = defineModule({
    kind: "get-modular.module-declaration", schemaVersion: 1, owner,
    moduleId: "formatter/consumer", implementationId: "formatter/consumer/default", provides: [],
    slots: [{ slotId: "value", capabilityId: "formatter/value", compatibility: expected, cardinality: required() }],
  });
  const failed = await compileComposition({ declarations: [provider, consumer], profile: {
    kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "formatter/test", roots: [consumer.moduleId],
    selections: [provider, consumer].map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
    bindings: [{ consumerImplementationId: consumer.implementationId, slotId: "value", providerImplementationIds: [provider.implementationId] }],
  } });
  assert(!failed.ok);
  const original = structuredClone(failed);
  const text = formatFailure(failed);
  for (const fact of ["binding.compatibility-mismatch [binding]", "formatter/consumer/default", "formatter/provider/default",
    'slotId: "value"', "formatter/value/r2", "formatter/value/r1"]) {assert(text.includes(fact), fact);}
  assert.deepEqual(failed, original);

  // Entry snapshots admit bounded strings before Core checks identity grammar.
  const Value = defineContract<number>()({ id: "PRIVATE CAPABILITY\n\u001b", revision: 1 });
  type Capabilities = CapabilitiesOf<typeof Value>;
  let calls = 0;
  const entry = implement<Capabilities>()(declareModule({
    moduleId: "PRIVATE MODULE", implementationId: "PRIVATE ENTRY\n\u001b", owner,
    provides: [], slots: [Value.slot("PRIVATE SLOT\u202e", required())],
  }), async () => { calls++; return { instance: undefined, capabilities: {} }; });
  const unresolved = await assemblyFor<Capabilities>().prepare({
    profileId: "formatter/unresolved", modules: [group("PRIVATE GROUP\n", [entry])], roots: { entry },
  });
  assert(unresolved.status === "failed");
  assert.equal(unresolved.error.code, "assembly.prepare.unresolved-binding");
  const hidden = formatFailure(unresolved), local = formatFailure(unresolved, { includeAuthoringContext: true });
  assert.match(hidden, /Reported authoring items: 1/u);
  assert(!hidden.includes("PRIVATE"));
  for (const fact of ["PRIVATE CAPABILITY\\u000a\\u001b", "PRIVATE ENTRY\\u000a\\u001b", "PRIVATE SLOT\\u202e",
    "PRIVATE GROUP\\u000a", "candidates: []"]) {assert(local.includes(fact), fact);}
  assert(!local.includes("\u001b") && !local.includes("\u202e"));
  const duplicate = await assemblyFor<Capabilities>().prepare({
    profileId: "formatter/duplicate", modules: [group("PRIVATE GROUP", [entry, entry])], roots: { entry },
  });
  assert(duplicate.status === "failed");
  assert.equal(duplicate.error.code, "assembly.prepare.duplicate-module");
  assert(!formatFailure(duplicate).includes("PRIVATE"));
  assert(formatFailure(duplicate, { includeAuthoringContext: true }).includes("PRIVATE ENTRY\\u000a\\u001b"));
  assert.equal(calls, 0);
});

test("formatFailure bounds display while keeping Core order and upstream omission separate", () => {
  const diagnostics: Diagnostic[] = Array.from({ length: 255 }, (_, index) => ({
    code: "binding.missing", phase: "binding", path: [],
    coordinate: { implementationId: `formatter/n${index}`, slotId: "value" }, details: { reason: "missing" },
  }));
  diagnostics.push({ code: "diagnostics.truncated", phase: "output", path: [], coordinate: {}, details: { omitted: 262_144 } });
  const failure: CoreFailure = { ok: false, diagnostics }, original = structuredClone(failure);
  const text = formatFailure(failure);
  assert.match(text, /Core diagnostics omitted: at least 262144\./u);
  assert.match(text, /Display diagnostics omitted: 224\./u);
  assert(text.indexOf('"formatter/n0"') < text.indexOf('"formatter/n31"'));
  assert(!text.includes('"formatter/n32"'));
  assert.deepEqual(failure, original);

  const cause: UnresolvedBinding[] = Array.from({ length: 33 }, () => ({
    consumerImplementationId: "a\n".repeat(64), slotId: "b\u202e".repeat(64), capabilityId: "c".repeat(128),
    cardinality: "required", groupPath: [], candidates: Array.from({ length: 10 }, (_, index) => `formatter/provider${index}`),
  }));
  const unresolved: PreparationFailure = { status: "failed", error: { code: "assembly.prepare.unresolved-binding", cause }, diagnostics: [] };
  const local = formatFailure(unresolved, { includeAuthoringContext: true });
  assert(local.length <= 16_384);
  assert(local.endsWith("[Display shortened.]"));
  assert(local.includes('"formatter/provider7"') && !local.includes('"formatter/provider8"'));
  assert(local.includes("2 members omitted"));
  const small: PreparationFailure = { ...unresolved, error: { ...unresolved.error, cause: cause.map(row => ({ ...row,
    consumerImplementationId: "formatter/consumer", slotId: "value", capabilityId: "formatter/value", candidates: [] })) } };
  assert.match(formatFailure(small, { includeAuthoringContext: true }), /Display authoring items omitted: 1\./u);
});

test("formatFailure never reads opaque causes, accessors or unknown diagnostic contents", () => {
  let calls = 0;
  const secret = "PLANTED SECRET";
  const opaque = Object.defineProperties({}, {
    message: { get() { calls++; return secret; } }, stack: { get() { calls++; return secret; } },
    toJSON: { value() { calls++; return secret; } }, then: { get() { calls++; return secret; } },
  });
  const generic: PreparationFailure = { status: "failed", error: { code: "assembly.prepare.invalid-input", cause: opaque }, diagnostics: [] };
  const getterCause: PreparationFailure = { status: "failed", error: { code: "assembly.prepare.unresolved-binding", cause: [] }, diagnostics: [] };
  Object.defineProperty(getterCause.error, "cause", { get() { calls++; return secret; } });
  const unknown: PreparationFailure = { status: "failed", error: { code: "assembly.prepare.invalid-input", cause: opaque }, diagnostics: [] };
  Object.defineProperty(unknown.error, "code", { value: secret });
  const badCore: CoreFailure = { ok: false, diagnostics: [{
    code: "binding.missing", phase: "binding", path: [], coordinate: { implementationId: "formatter/consumer", slotId: "value" }, details: { reason: "missing" },
  }] };
  Object.defineProperty(badCore.diagnostics[0], "code", { get() { calls++; return secret; } });
  const getterItem = Object.defineProperty({}, "consumerImplementationId", { get() { calls++; return secret; } });
  const malformed: PreparationFailure = { status: "failed", error: { code: "assembly.prepare.unresolved-binding", cause: [getterItem] }, diagnostics: [] };
  for (const failure of [generic, getterCause, unknown, badCore, malformed]) {
    for (const includeAuthoringContext of [false, true]) {
      const text = formatFailure(failure, { includeAuthoringContext });
      assert(text.length > 0 && !text.includes(secret));
    }
  }
  assert.equal(calls, 0);
});
