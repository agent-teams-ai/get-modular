import assert from "node:assert/strict";
import test from "node:test";
import { admitObjectInput } from "../../../dist-test/features/input-admission/object-admission.js";
import { createDiagnosticCollector } from "../../../dist-test/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist-test/features/canonicalization/owned-jcs/factory.js";
const world = () => ({ declarations: [{ kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: "x/m", implementationId: "x/i", owner: { authority: "x", path: ["m"] }, provides: [], slots: [] }],
  profile: { kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "x/p", roots: ["x/m"],
    selections: [{ moduleId: "x/m", implementationId: "x/i" }], bindings: [] } });
const field = value => ({ kind: "field", value });
const limitDiagnostic = (limitName, phase) => ({ code: "input.limit-exceeded", phase, coordinate: {}, path: [],
  details: { limitName, limit: 4096, actual: 4097 } });
function admit(input) {
  const collector = createDiagnosticCollector(createOwnedJcs().canonicalize);
  const value = admitObjectInput(input, collector);
  return { value, diagnostics: collector.finish() };
}

const wrapperDiagnostic = fieldName => ({ code: "schema.non-plain-value", phase: "schema", coordinate: {},
  path: [field(fieldName)], details: { reason: "non-plain-value" } });

test("M2 wrapper failures never invoke accessors or admit partial document facts", () => {
  let calls = 0;
  const getter = () => { calls += 1; throw new Error("must not run"); };
  for (const fieldName of ["declarations", "profile"]) {
    for (const kind of ["missing", "inherited", "accessor"]) {
      const input = world();
      const value = input[fieldName];
      delete input[fieldName];
      if (kind === "inherited") Object.setPrototypeOf(input, { [fieldName]: value });
      if (kind === "accessor") Object.defineProperty(input, fieldName, { get: getter });
      const { value: admitted, diagnostics } = admit(input);
      assert.deepEqual(diagnostics, [wrapperDiagnostic(fieldName)]);
      assert.deepEqual(admitted, { declarations: [], allDeclarationsAdmitted: false,
        profile: null, profileResources: null, hasErrors: true });
    }
  }
  assert.equal(calls, 0);
});

test("M2 admitted count overflow precedes indices but follows both wrapper fields", () => {
  for (const count of [4097, 65536, 4294967295]) {
    const declarations = [];
    declarations.length = count;
    Object.defineProperty(declarations, "0", { get() { assert.fail("overflow must precede index inspection"); } });
    assert.deepEqual(admit({ declarations, profile: undefined }).diagnostics,
      [limitDiagnostic("declarations", "declaration")]);
    const input = { declarations };
    Object.defineProperty(input, "profile", { get() { assert.fail("wrapper getter"); } });
    assert.deepEqual(admit(input).diagnostics, [wrapperDiagnostic("profile")]);
  }
});

test("M2 bounded index holes and accessors invalidate the complete wrapper", () => {
  for (const kind of ["missing", "accessor"]) {
    const input = world();
    input.declarations.length = 2;
    if (kind === "accessor") Object.defineProperty(input.declarations, "1", {
      get() { assert.fail("index accessor"); } });
    const result = admit(input);
    assert.deepEqual(result.diagnostics, [wrapperDiagnostic("declarations")]);
    assert.equal(result.value.profile, null);
    assert.deepEqual(result.value.declarations, []);
  }
});
