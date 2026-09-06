import assert from "node:assert/strict";
import test from "node:test";
import { createInputAdmission } from "../../../dist-test/features/input-admission/factory.js";
import { createOwnedRawScanner } from "../../../dist-test/features/raw-scanner/owned-iterative/factory.js";

function objectInput() {
  return {
    declarations: [{
      kind: "get-modular.module-declaration",
      schemaVersion: 1,
      moduleId: "test/raw-module",
      implementationId: "test/raw-module/default",
      owner: { authority: "test", path: ["raw-module"] },
      provides: [{
        capabilityId: "test/raw-module",
        compatibility: { family: "exact", familyVersion: 1, token: "test/raw-module/v1" },
      }],
      slots: [],
    }],
    profile: {
      kind: "get-modular.composition-profile",
      schemaVersion: 1,
      profileId: "test/raw-profile",
      roots: ["test/raw-module"],
      selections: [{ moduleId: "test/raw-module", implementationId: "test/raw-module/default" }],
      bindings: [],
    },
  };
}

function rawInput() {
  const input = objectInput();
  const encoder = new TextEncoder();
  return {
    declarations: input.declarations.map(document => encoder.encode(JSON.stringify(document))),
    profile: encoder.encode(JSON.stringify(input.profile)),
  };
}

function record(properties) {
  return Object.create(null, Object.getOwnPropertyDescriptors(properties));
}

function expectedDocuments() {
  return {
    declarations: [record({
      kind: "get-modular.module-declaration",
      schemaVersion: 1,
      moduleId: "test/raw-module",
      implementationId: "test/raw-module/default",
      owner: record({ authority: "test", path: ["raw-module"] }),
      provides: [record({
        capabilityId: "test/raw-module",
        compatibility: record({ family: "exact", familyVersion: 1, token: "test/raw-module/v1" }),
      })],
      slots: [],
    })],
    profile: record({
      kind: "get-modular.composition-profile",
      schemaVersion: 1,
      profileId: "test/raw-profile",
      roots: ["test/raw-module"],
      selections: [record({ moduleId: "test/raw-module", implementationId: "test/raw-module/default" })],
      bindings: [],
    }),
  };
}

function assertOwnedSnapshot(value) {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.getPrototypeOf(value), Array.isArray(value) ? Array.prototype : null);
  for (const child of Object.values(value)) assertOwnedSnapshot(child);
}

function collect(port, method, input) {
  const diagnostics = [];
  const admitted = port[method](input, {
    addUnique(candidate) { diagnostics.push(candidate); },
  });
  return { admitted, diagnostics };
}

function assertAccepted({ admitted, diagnostics }) {
  const expected = expectedDocuments();
  assert.deepStrictEqual(diagnostics, []);
  assert.equal(admitted.hasErrors, false);
  assert.equal(admitted.allDeclarationsAdmitted, true);
  assert.equal(Object.isFrozen(admitted), true);
  assert.deepStrictEqual(admitted.declarations, expected.declarations);
  assert.deepStrictEqual(admitted.profile, expected.profile);
  assert.equal(admitted.profileResources?.selectionCensusComplete, true);
  assertOwnedSnapshot(admitted.declarations);
  assertOwnedSnapshot(admitted.profile);
}

function trackedSubject() {
  const realScanner = createOwnedRawScanner({});
  const calls = { opens: 0 };
  const scanner = Object.freeze({
    open(bytes) {
      calls.opens += 1;
      return realScanner.open(bytes);
    },
  });
  return { port: createInputAdmission({ scanner }), calls };
}

test("construction freezes the admission port without consulting the scanner", () => {
  let reads = 0;
  const scanner = Object.freeze({
    get open() {
      reads += 1;
      throw new Error("scanner must remain untouched");
    },
  });
  const port = createInputAdmission({ scanner });
  assert.equal(reads, 0);
  assert.equal(Object.isFrozen(port), true);
  assert.deepStrictEqual(Object.keys(port).sort(), ["admitObjectInput", "admitRawInput"]);
  assert.equal(typeof port.admitObjectInput, "function");
  assert.equal(typeof port.admitRawInput, "function");
  assertAccepted(collect(port, "admitObjectInput", objectInput()));
  assert.equal(reads, 0);
});

test("the factory raw port uses the real scanner and returns synchronous owned snapshots", () => {
  const { port, calls } = trackedSubject();
  assert.equal(calls.opens, 0);
  const input = rawInput();
  const observation = collect(port, "admitRawInput", input);
  assert.ok(calls.opens > 0);
  input.declarations[0].fill(0);
  input.profile.fill(0);
  assertAccepted(observation);
});

test("the object port owns its snapshots without opening the real scanner", () => {
  const { port, calls } = trackedSubject();
  const input = objectInput();
  const observation = collect(port, "admitObjectInput", input);
  input.declarations[0].owner.path[0] = "changed";
  input.declarations[0].provides[0].compatibility.token = "changed";
  input.profile.selections[0].implementationId = "changed";
  input.profile.roots.length = 0;
  input.declarations.length = 0;
  assertAccepted(observation);
  assert.equal(calls.opens, 0);
});

test("raw and object invocations keep failures, collectors and snapshots independent", () => {
  const { port, calls } = trackedSubject();
  const malformedRaw = rawInput();
  malformedRaw.declarations[0] = Uint8Array.of(0x7b);
  const rawFailure = collect(port, "admitRawInput", malformedRaw);
  assert.equal(rawFailure.admitted.hasErrors, true);
  assert.equal(rawFailure.admitted.allDeclarationsAdmitted, false);
  assert.deepStrictEqual(rawFailure.admitted.declarations, []);
  assert.deepStrictEqual(rawFailure.admitted.profile, expectedDocuments().profile);
  assert.deepStrictEqual(rawFailure.diagnostics.map(candidate => candidate.code), ["decode.invalid-json"]);
  const retainedRawDiagnostics = rawFailure.diagnostics.slice();
  const opensAfterRawFailure = calls.opens;

  const objectSuccess = collect(port, "admitObjectInput", objectInput());
  assertAccepted(objectSuccess);
  const malformedObject = objectInput();
  malformedObject.declarations[0] = null;
  const objectFailure = collect(port, "admitObjectInput", malformedObject);
  assert.equal(objectFailure.admitted.hasErrors, true);
  assert.equal(objectFailure.admitted.allDeclarationsAdmitted, false);
  assert.ok(objectFailure.diagnostics.length > 0);
  const retainedObjectDiagnostics = objectFailure.diagnostics.slice();
  assert.equal(calls.opens, opensAfterRawFailure);

  const rawSuccess = collect(port, "admitRawInput", rawInput());
  assertAccepted(rawSuccess);
  assert.ok(calls.opens > opensAfterRawFailure);
  assert.notStrictEqual(rawSuccess.admitted, objectSuccess.admitted);
  assert.notStrictEqual(rawSuccess.admitted.declarations, objectSuccess.admitted.declarations);
  assert.notStrictEqual(rawSuccess.admitted.declarations[0], objectSuccess.admitted.declarations[0]);
  assert.notStrictEqual(rawSuccess.admitted.profile, objectSuccess.admitted.profile);
  assert.deepStrictEqual(rawFailure.diagnostics, retainedRawDiagnostics);
  assert.deepStrictEqual(objectFailure.diagnostics, retainedObjectDiagnostics);
  assertAccepted(objectSuccess);
});

test("raw admission propagates the selected scanner failure without fallback", () => {
  const failure = new Error("selected scanner failure");
  let opens = 0;
  const port = createInputAdmission({
    scanner: Object.freeze({
      open() {
        opens += 1;
        throw failure;
      },
    }),
  });
  const diagnostics = [];
  assert.throws(() => port.admitRawInput(rawInput(), {
    addUnique(candidate) { diagnostics.push(candidate); },
  }), error => error === failure);
  assert.equal(opens, 1);
  assert.deepStrictEqual(diagnostics, []);
  assertAccepted(collect(port, "admitObjectInput", objectInput()));
  assert.equal(opens, 1);
});

test("raw admission has no implicit provider when the required scanner is omitted", () => {
  const diagnostics = [];
  assert.throws(() => {
    const port = createInputAdmission({});
    port.admitRawInput(rawInput(), {
      addUnique(candidate) { diagnostics.push(candidate); },
    });
  }, TypeError);
  assert.deepStrictEqual(diagnostics, []);
});
