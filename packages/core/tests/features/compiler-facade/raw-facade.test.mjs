import assert from "node:assert/strict";
import test from "node:test";
import { rawDocumentCases } from "../../../../../tests/qualification/m2-candidate/raw-document-cases.mjs";
import { createCompilerFacade } from "../../../dist-test/features/compiler-facade/factory.js";
import { createOwnedJcs } from "../../../dist-test/features/canonicalization/owned-jcs/factory.js";
import { createOwnedRawScanner } from "../../../dist-test/features/raw-scanner/owned-iterative/factory.js";
import { createInputAdmission } from "../../../dist-test/features/input-admission/factory.js";
import { createCompositionSemantics } from "../../../dist-test/features/composition-semantics/factory.js";
import { createPlanOutput } from "../../../dist-test/features/plan-output/factory.js";

const entries = [
  ["compileComposition", "admitObjectInput"],
  ["compileCompositionJson", "admitRawInput"],
];
const plan = name => Object.freeze({
  kind: "get-modular.composition-plan", schemaVersion: 1, profileId: `example/${name}`,
  roots: [], selections: [], bindings: [], dependencyOrder: [],
});
const digest = `gm-plan:v1:sha-256:${"0".repeat(64)}`;

test("one private facade dispatches overlapping calls and preserves output results", async () => {
  const events = [];
  const collectors = [];
  const admittedByCollector = new Map();
  const pending = new Map();
  function admit(method, input, collector) {
    events.push(method);
    const admitted = { profile: input.profile };
    admittedByCollector.set(collector, admitted);
    return admitted;
  }
  const facade = createCompilerFacade({
    admission: {
      admitObjectInput(input, collector) { return admit("object", input, collector); },
      admitRawInput(input, collector) { return admit("raw", input, collector); },
    },
    semantics: {
      newCollector() {
        const collector = {};
        collectors.push(collector);
        events.push("collector");
        return collector;
      },
      analyze(admitted, collector) {
        assert.equal(admitted, admittedByCollector.get(collector));
        events.push("analysis");
        return { ok: true, plan: plan(admitted.profile) };
      },
    },
    output: { emit(value) {
      events.push("output");
      return new Promise(resolve => pending.set(value.profileId, resolve));
    } },
  });
  assert.deepEqual(events, []);
  assert.ok(Object.isFrozen(facade));
  const rawInput = { declarations: [], profile: "raw" };
  const objectInput = { declarations: [], profile: "object" };
  const raw = facade.compileCompositionJson(rawInput);
  const object = facade.compileComposition(objectInput);
  assert.ok(raw instanceof Promise && object instanceof Promise);
  assert.deepEqual(events, [
    "collector", "raw", "analysis", "output",
    "collector", "object", "analysis", "output",
  ]);
  assert.equal(new Set(collectors).size, 2);
  rawInput.profile = objectInput.profile = "changed";
  const emittedObject = { plan: plan("emitted-object"), digest };
  pending.get("example/object")(emittedObject);
  const objectResult = await object;
  assert.deepEqual(objectResult, { ok: true, ...emittedObject });
  assert.equal(objectResult.plan, emittedObject.plan);
  const emittedRaw = { plan: plan("emitted-raw"), digest };
  pending.get("example/raw")(emittedRaw);
  const rawResult = await raw;
  assert.deepEqual(rawResult, { ok: true, ...emittedRaw });
  assert.equal(rawResult.plan, emittedRaw.plan);
  assert.ok(Object.isFrozen(rawResult) && Object.isFrozen(objectResult));
});

for (const [entry, admissionMethod] of entries) {
  for (const boundary of ["collector", "admission", "analysis", "output", "async-output"]) {
    test(`${entry}: ${boundary} failure rejects without throwing synchronously`, async () => {
      const failure = new Error(`${entry}: ${boundary}`);
      const fail = () => { throw failure; };
      const facade = createCompilerFacade({
        admission: {
          [admissionMethod]: boundary === "admission" ? fail : input => input,
        },
        semantics: {
          newCollector: boundary === "collector" ? fail : () => ({}),
          analyze: boundary === "analysis" ? fail : () => ({ ok: true, plan: plan("root") }),
        },
        output: {
          emit: boundary === "output" ? fail : boundary === "async-output"
            ? () => Promise.reject(failure) : async value => ({ plan: value, digest }),
        },
      });
      let promise;
      assert.doesNotThrow(() => {
        promise = facade[entry]({ declarations: [], profile: null });
      });
      assert.ok(promise instanceof Promise);
      await assert.rejects(promise, error => error === failure);
    });
  }

  test(`${entry}: semantic failure is returned intact without output`, async () => {
    const failure = Object.freeze({ ok: false, diagnostics: Object.freeze([]) });
    const facade = createCompilerFacade({
      admission: { [admissionMethod]: input => input },
      semantics: { newCollector: () => ({}), analyze: () => failure },
      output: { emit() { assert.fail("output called on failure"); } },
    });
    assert.equal(await facade[entry]({ declarations: [], profile: null }), failure);
  });
}

// This is the private facade seam, not public entry or completed M2 qualification.
const baseline = rawDocumentCases().next().value;
assert.equal(baseline.caseId, "od005.raw-document.v1/baseline");
function inputFor(entry) {
  const materialize = document => {
    assert.equal(document.kind, "utf8");
    return entry === "compileCompositionJson"
      ? new TextEncoder().encode(document.source) : JSON.parse(document.source);
  };
  return {
    declarations: baseline.inputRecipe.declarations.map(materialize),
    profile: materialize(baseline.inputRecipe.profile),
  };
}

for (const [entry] of entries) {
  test(`${entry}: real providers own input before return while output awaits`, async () => {
    const canonicalizer = createOwnedJcs({});
    const admission = createInputAdmission({ scanner: createOwnedRawScanner({}) });
    const semantics = createCompositionSemantics({ canonicalizer });
    const output = createPlanOutput({ canonicalizer });
    let release;
    let outputCalls = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const facade = createCompilerFacade({
      admission, semantics,
      output: { async emit(value) {
        outputCalls += 1;
        await gate;
        return output.emit(value);
      } },
    });
    const input = inputFor(entry);
    const pending = facade[entry](input);
    assert.ok(pending instanceof Promise);
    assert.equal(outputCalls, 1, "real admission and analysis precede return");
    if (entry === "compileCompositionJson") {
      for (const view of [...input.declarations, input.profile]) view.fill(0);
    } else {
      for (const declaration of input.declarations) declaration.moduleId = "changed";
      input.profile.roots.length = 0;
    }
    input.declarations.length = 0;
    input.profile = undefined;
    release();
    assert.deepEqual(await pending, baseline.expected);
    const bad = inputFor("compileCompositionJson");
    bad.profile = undefined;
    assert.deepEqual(await facade.compileCompositionJson(bad), {
      ok: false, diagnostics: [{
        code: "input.invalid-byte-carrier", phase: "decode",
        path: [{ kind: "field", value: "profile" }], coordinate: {},
        details: { reason: "not-uint8array" },
      }],
    });
    assert.equal(outputCalls, 1, "real admission failure never reaches output");
  });
}
