import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createSchemaValidators,
  validateFuturePackedSubjectEvidenceMinimum,
  validateStaticConformanceProtocol,
} from "../../architecture/checks/v1-qualification.mjs";

const readJson = async relativePath => JSON.parse(
  await readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8"),
);
const keys = value => Object.keys(value).sort();
const clone = value => structuredClone(value);
const forbiddenDescriptorKeys = new Set([
  "status", "timestamp", "callerLabel", "runtime", "reportId",
  "expectedCode", "expectedPattern", "expectedAlternates", "actualOutput",
]);
const exactDiagnosticKeys = ["code", "coordinate", "details", "path", "phase"];
const exactResultKeys = ["diagnostics", "ok"];

function collectSchemaFields(value, fields = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaFields(item, fields);
  } else if (value !== null && typeof value === "object") {
    if (value.properties !== undefined) {
      for (const field of Object.keys(value.properties)) fields.add(field);
    }
    for (const child of Object.values(value)) collectSchemaFields(child, fields);
  }
  return fields;
}

function assertNoForbiddenKeys(value, label) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${label}[${index}]`));
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbiddenDescriptorKeys.has(key), `${label} contains forbidden ${key}`);
      assertNoForbiddenKeys(child, `${label}.${key}`);
    }
  }
}

function validateDescriptor(descriptor, generatorIds, knownFields) {
  const hasInput = Object.hasOwn(descriptor, "input");
  const hasGenerator = Object.hasOwn(descriptor, "generatorId");
  assert.notEqual(hasInput, hasGenerator, `${descriptor.caseId} must select one input source`);
  assert.deepEqual(keys(descriptor), [
    "caseId", "entryPoint", hasInput ? "input" : "generatorId", "expected",
    ...(hasInput ? ["schemaValidCompanion"] : []),
  ].sort());
  assert.match(descriptor.caseId, /^diag\.[a-z0-9.-]+\.v1$/u);
  assert.ok(["compileCompositionV1", "compileCompositionJsonV1"]
    .includes(descriptor.entryPoint));
  if (hasGenerator) assert.ok(generatorIds.has(descriptor.generatorId));
  if (hasInput) {
    assert.deepEqual(
      keys(descriptor.input),
      descriptor.entryPoint === "compileCompositionV1"
        ? ["declarations", "profile"]
        : ["declarationsUtf8", "profileUtf8"],
    );
    assert.deepEqual(keys(descriptor.schemaValidCompanion), ["declarations", "profile"]);
    assert.ok(descriptor.schemaValidCompanion.declarations.length > 0);
    assert.ok(descriptor.schemaValidCompanion.profile.roots.length > 0);
    assert.ok(descriptor.schemaValidCompanion.profile.selections.length > 0);
  }
  assert.deepEqual(keys(descriptor.expected), exactResultKeys);
  assert.equal(descriptor.expected.ok, false);
  assert.ok(descriptor.expected.diagnostics.length > 0);
  assert.ok(!Object.hasOwn(descriptor.expected, "plan"));
  assert.ok(!Object.hasOwn(descriptor.expected, "digest"));
  assertNoForbiddenKeys(descriptor, descriptor.caseId);

  for (const diagnostic of descriptor.expected.diagnostics) {
    assert.deepEqual(keys(diagnostic), exactDiagnosticKeys);
    assert.ok(Array.isArray(diagnostic.path));
    assert.ok(diagnostic.path.length <= 32);
    for (const segment of diagnostic.path) {
      assert.ok(segment.kind === "index" || segment.kind === "field");
      if (segment.kind === "index") {
        assert.ok(segment.value <= 65535);
        assert.ok(Number.isSafeInteger(segment.value) && segment.value >= 0);
      } else {
        assert.ok(knownFields.has(segment.value), `unknown emitted field ${segment.value}`);
      }
    }
  }
}

test("bounded diagnostic protocol fixes prefixes, coordinates, barriers, and suppression", async () => {
  const [contract, snapshots, manifest, schema, catalog] = await Promise.all([
    readJson("architecture/qualification/v1/diagnostic-contract.json"),
    readJson("architecture/qualification/v1/diagnostic-snapshots.json"),
    readJson("architecture/qualification/v1/qualification-case-manifest.json"),
    readJson("architecture/contracts/v1/composition.schema.json"),
    readJson("architecture/contracts/v1/diagnostic-catalog.json"),
  ]);
  const { validateDocument, validateDiagnostic } = createSchemaValidators(schema);
  assert.doesNotThrow(() => validateStaticConformanceProtocol({
    protocol: manifest.staticConformanceProtocol,
    contract,
    catalog,
    validateDocument,
    validateDiagnostic,
  }));
  const duplicateCandidateProtocol = clone(manifest.staticConformanceProtocol);
  const duplicateCandidate = duplicateCandidateProtocol.cases
    .find(descriptor => descriptor.caseId === "diag.object.semantic-coordinate.v1");
  duplicateCandidate.expected.diagnostics.push(
    clone(duplicateCandidate.expected.diagnostics[0]),
  );
  assert.throws(() => validateStaticConformanceProtocol({
    protocol: duplicateCandidateProtocol,
    contract,
    catalog,
    validateDocument,
    validateDiagnostic,
  }), /duplicates a normalized diagnostic candidate/u);
  const emission = contract.boundedEmissionProtocol;
  assert.equal(emission.maximumPathSegments, 32);
  assert.deepEqual(emission.invocationPrefixes.rawDeclaration, [
    { kind: "field", value: "declarations" },
    { kind: "index", source: "document-ordinal" },
  ]);
  assert.equal(emission.maximumIndex, 65535);
  assert.deepEqual(emission.invocationPrefixes.rawProfile, [
    { kind: "field", value: "profile" },
  ]);
  assert.equal(emission.prefixSegmentsCountTowardMaximum, true);
  assert.deepEqual(emission.pathPolicyComposition, {
    basePolicyScope: "document-local",
    order: ["derive-safe-local-path", "stop-before-unknown-key", "prepend-invocation-prefix", "clip-to-32"],
    structuralMayBeSatisfiedByInvocationPrefix: true,
  });
  assert.equal(
    emission.beforeIdentity,
    "invocation-prefix-and-schema-known-structural-position-only",
  );
  assert.equal(
    emission.afterIdentity,
    "normalized-semantic-coordinate-replaces-caller-order",
  );
  assert.equal(
    emission.unknownKey,
    "stop-before-key-never-echo-hash-or-truncate-spelling",
  );

  const evaluation = contract.failureEvaluationProtocol;
  assert.equal(evaluation.phases, "classification-and-sort-only");
  assert.equal(evaluation.prerequisites, "fact-local");
  assert.equal(evaluation.independentFactsContinue, true);
  assert.equal(evaluation.failedPrerequisite, "suppress-dependent-derivatives-only");
  assert.deepEqual(evaluation.unreachableSelection, {
    phase: "graph",
    requires: ["valid-root", "valid-selections", "valid-reachability-bindings"],
  });
  assert.deepEqual(evaluation.failureResult, {
    required: ["ok", "diagnostics"],
    forbidden: ["plan", "digest"],
    reservedCode: "successor-qualification-failure",
  });
  assert.deepEqual(evaluation.internalFailure, {
    kinds: ["canonicalizer", "hash", "platform"],
    outcome: "reject-promise",
    diagnosticEmission: "forbidden",
    publicFaultInjection: "forbidden",
    serializedRejectionShape: "forbidden",
  });
  assert.deepEqual(contract.codeDisposition.reservedNonEmittable,
    ["output.canonicalization-failed"]);
  assert.ok(!contract.codeDisposition.emittable.includes("output.canonicalization-failed"));
  assert.deepEqual(
    [...contract.codeDisposition.emittable, ...contract.codeDisposition.reservedNonEmittable]
      .toSorted(),
    [...catalog.ordering.codes].toSorted(),
  );
  const factModel = contract.prerequisiteCatalog.factModel;
  assert.deepEqual(factModel.states, ["valid", "invalid", "unavailable"]);
  assert.equal(factModel.maximumPrerequisitesPerCandidate, 4);
  assert.deepEqual(factModel.eligibility, {
    allPrerequisitesValid: "candidate-eligible",
    anyPrerequisiteInvalidOrUnavailable: "candidate-suppressed",
    independentCandidates: "continue",
    ordering: "normative-comparator-after-eligibility",
  });
  assert.equal(new Set(factModel.facts.map(value => value.factId)).size,
    factModel.facts.length);
  const unreachableVariant = contract.variants
    .find(variant => variant.code === "profile.unreachable-selection");
  assert.deepEqual(unreachableVariant.phases, ["graph"]);
  assert.equal(
    snapshots.snapshots.find(snapshot => snapshot.name === "unreachable-selection")
      .diagnostic.phase,
    "graph",
  );

  const protocol = manifest.staticConformanceProtocol;
  assert.equal(protocol.authority, "static-expectations-never-executed-evidence");
  assert.equal(
    protocol.descriptorPolicy.rawInlineEncoding,
    "UTF-8 bytes of declarationsUtf8 and profileUtf8 without transformation",
  );
  assert.deepEqual(protocol.descriptorPolicy.forbiddenExpectationForms,
    ["partial", "code-only", "pattern", "alternate", "subject-derived"]);
  const generatorIds = new Set(protocol.generators.map(generator => generator.generatorId));
  assert.equal(generatorIds.size, protocol.generators.length);
  for (const generator of protocol.generators) {
    assert.deepEqual(keys(generator), ["algorithm", "bounds", "generatorId", "parameterless"]);
    assert.equal(generator.parameterless, true);
    assert.match(generator.generatorId, /\/v1$/u);
    assert.ok(generator.bounds.emittedPathSegments <= 32);
  }
  const knownFields = collectSchemaFields(schema);
  knownFields.add("declarations");
  knownFields.add("profile");
  const ids = new Set();
  for (const descriptor of protocol.cases) {
    validateDescriptor(descriptor, generatorIds, knownFields);
    assert.ok(!ids.has(descriptor.caseId));
    ids.add(descriptor.caseId);
  }

  const byId = new Map(protocol.cases.map(descriptor => [descriptor.caseId, descriptor]));
  const multi = byId.get("diag.raw.multi-document-independent.v1");
  assert.deepEqual(multi.expected.diagnostics.map(value => value.path.slice(0, 2)), [
    [{ kind: "field", value: "declarations" }, { kind: "index", value: 0 }],
    [{ kind: "field", value: "declarations" }, { kind: "index", value: 2 }],
    [{ kind: "field", value: "declarations" }, { kind: "index", value: 1 }],
  ]);
  assert.deepEqual(
    byId.get("diag.raw.hostile-profile-key.v1").expected.diagnostics[0].path,
    [{ kind: "field", value: "profile" }],
  );
  const serializedHostileExpected = JSON.stringify(
    byId.get("diag.raw.hostile-profile-key.v1").expected,
  );
  assert.ok(!serializedHostileExpected.includes("password"));
  assert.ok(!/[a-f0-9]{64}/u.test(serializedHostileExpected));
  assert.ok(!serializedHostileExpected.includes("truncat"));

  const semantic = byId.get("diag.object.semantic-coordinate.v1")
    .expected.diagnostics[0];
  assert.deepEqual(semantic.path, []);
  assert.deepEqual(semantic.coordinate, {
    implementationId: "example/consumer/default",
  });
  const clipping = byId.get("diag.raw.prefix-inclusive-clipping.v1")
    .expected.diagnostics[0].path;
  assert.equal(clipping.length, 32);
  assert.deepEqual(clipping.slice(0, 2), [
    { kind: "field", value: "declarations" },
    { kind: "index", value: 0 },
  ]);

  const mixedCodes = byId.get("diag.object.independent-declaration-and-graph.v1")
    .expected.diagnostics.map(value => [value.phase, value.code]);
  assert.deepEqual(mixedCodes, [
    ["declaration", "declaration.duplicate-capability"],
    ["graph", "profile.unreachable-selection"],
  ]);
  const suppressed = byId.get("diag.object.invalid-binding-suppresses-unreachable.v1")
    .expected.diagnostics;
  assert.deepEqual(suppressed.map(value => value.code), ["binding.unknown-provider"]);
  assert.deepEqual(byId.get("diag.object.duplicate-selection-with-mismatch.v1")
    .expected.diagnostics.map(value => value.code), [
    "profile.duplicate-selection", "profile.implementation-mismatch",
  ]);
  assert.deepEqual(byId.get("diag.object.negative-census-suppression.v1")
    .expected.diagnostics.map(value => value.code), [
    "declaration.duplicate-implementation",
  ]);
  assert.deepEqual(byId.get("diag.object.independent-scc-with-invalid-edge.v1")
    .expected.diagnostics.map(value => value.code), [
    "binding.unknown-provider", "graph.cycle",
  ]);
  assert.ok(protocol.cases.filter(descriptor => Object.hasOwn(descriptor, "input"))
    .every(descriptor => (
      descriptor.schemaValidCompanion.profile.roots.length > 0
      && descriptor.schemaValidCompanion.profile.selections.length > 0
    )));
  assert.ok(protocol.cases.every(descriptor => (
    !Object.hasOwn(descriptor.expected, "plan")
    && !Object.hasOwn(descriptor.expected, "digest")
  )));

  assert.deepEqual(
    new Set(snapshots.rejectedProtocolMutants.map(mutant => mutant.rule)),
    new Set([
      "normalized-coordinate-after-identity", "prefix-inclusive-32-segment-cap",
      "stop-before-unknown-key", "never-transform-unknown-key",
      "never-mark-unknown-key", "independent-facts-continue",
      "suppress-local-derivative", "unreachable-is-graph-phase",
      "unreachable-requires-valid-bindings", "failure-forbids-plan-and-digest",
      "overlapping-failures-remain-independent",
      "negative-claims-require-complete-census",
      "positive-scc-remains-independent",
    ]),
  );
});

test("static descriptors reject incomplete, alternate, instance, and leaking mutations", async () => {
  const [manifest, schema] = await Promise.all([
    readJson("architecture/qualification/v1/qualification-case-manifest.json"),
    readJson("architecture/contracts/v1/composition.schema.json"),
  ]);
  const protocol = manifest.staticConformanceProtocol;
  const generators = new Set(protocol.generators.map(value => value.generatorId));
  const knownFields = collectSchemaFields(schema);
  knownFields.add("declarations");
  knownFields.add("profile");
  const baseline = protocol.cases[0];

  for (const mutate of [
    value => { value.expected = { code: "decode.invalid-json" }; },
    value => { value.expectedAlternates = [value.expected]; },
    value => { value.status = "passed"; },
    value => { value.actualOutput = value.expected; },
    value => { value.generatorId = protocol.generators[0].generatorId; },
    value => { delete value.schemaValidCompanion; },
    value => { value.expected.plan = {}; },
    value => { value.expected.diagnostics[0].path.push({ kind: "field", value: "password" }); },
  ]) {
    const mutant = clone(baseline);
    mutate(mutant);
    assert.throws(() => validateDescriptor(mutant, generators, knownFields));
  }
});
test("diagnostic protocol rejects every named cascade, barrier, redaction, and clipping mutant", async () => {
  const [manifest, snapshots, schema, contract, catalog] = await Promise.all([
    readJson("architecture/qualification/v1/qualification-case-manifest.json"),
    readJson("architecture/qualification/v1/diagnostic-snapshots.json"),
    readJson("architecture/contracts/v1/composition.schema.json"),
    readJson("architecture/qualification/v1/diagnostic-contract.json"),
    readJson("architecture/contracts/v1/diagnostic-catalog.json"),
  ]);
  const { validateDocument, validateDiagnostic } = createSchemaValidators(schema);
  const protocol = manifest.staticConformanceProtocol;
  const knownFields = collectSchemaFields(schema);
  knownFields.add("declarations");
  knownFields.add("profile");
  const generators = new Set(protocol.generators.map(value => value.generatorId));
  const validate = value => {
    validateStaticConformanceProtocol({
      protocol: value,
      contract,
      catalog,
      validateDocument,
      validateDiagnostic,
    });
    for (const descriptor of value.cases) {
      validateDescriptor(descriptor, generators, knownFields);
    }
    const byId = new Map(value.cases.map(descriptor => [descriptor.caseId, descriptor]));
    assert.deepEqual(byId.get("diag.object.semantic-coordinate.v1")
      .expected.diagnostics[0].path, []);
    const clipping = byId.get("diag.raw.prefix-inclusive-clipping.v1")
      .expected.diagnostics[0].path;
    assert.equal(clipping.length, 32);
    assert.deepEqual(clipping.slice(0, 2), [
      { kind: "field", value: "declarations" }, { kind: "index", value: 0 },
    ]);
    assert.deepEqual(byId.get("diag.object.independent-declaration-and-graph.v1")
      .expected.diagnostics.map(value => [value.phase, value.code]), [
      ["declaration", "declaration.duplicate-capability"],
      ["graph", "profile.unreachable-selection"],
    ]);
    assert.deepEqual(byId.get("diag.object.invalid-binding-suppresses-unreachable.v1")
      .expected.diagnostics.map(value => value.code), ["binding.unknown-provider"]);
    assert.equal(byId.get("diag.object.valid-prerequisites-unreachable.v1")
      .expected.diagnostics[0].phase, "graph");
    assert.deepEqual(byId.get("diag.object.duplicate-selection-with-mismatch.v1")
      .expected.diagnostics.map(value => value.code), [
      "profile.duplicate-selection", "profile.implementation-mismatch",
    ]);
    assert.deepEqual(byId.get("diag.object.negative-census-suppression.v1")
      .expected.diagnostics.map(value => value.code), [
      "declaration.duplicate-implementation",
    ]);
    assert.deepEqual(byId.get("diag.object.independent-scc-with-invalid-edge.v1")
      .expected.diagnostics.map(value => value.code), [
      "binding.unknown-provider", "graph.cycle",
    ]);
  };
  assert.doesNotThrow(() => validate(protocol));

  const unreachable = clone(protocol.cases.find(descriptor => (
    descriptor.caseId === "diag.object.valid-prerequisites-unreachable.v1"
  )).expected.diagnostics[0]);
  const mutations = {
    "caller-index-after-identity": value => value.cases[3]
      .expected.diagnostics[0].path.push({ kind: "index", value: 0 }),
    "raw-prefix-excluded-from-limit": value => value.cases[10]
      .expected.diagnostics[0].path.splice(0, 2),
    "hostile-key-echo": value => value.cases[1]
      .expected.diagnostics[0].path.push({ kind: "field", value: "password=DO-NOT-EMIT" }),
    "hostile-key-hash": value => value.cases[1]
      .expected.diagnostics[0].path.push({ kind: "field", value: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }),
    "hostile-key-truncation-marker": value => value.cases[1]
      .expected.diagnostics[0].path.push({ kind: "field", value: "password..." }),
    "global-phase-barrier": value => value.cases[4].expected.diagnostics.pop(),
    "invalid-binding-unreachable-cascade": value => value.cases[5]
      .expected.diagnostics.push(clone(unreachable)),
    "unreachable-profile-phase": value => {
      value.cases[6].expected.diagnostics[0].phase = "profile";
    },
    "unreachable-without-binding-prerequisite": value => value.cases[5]
      .expected.diagnostics.push(clone(unreachable)),
    "duplicate-selection-suppresses-mismatch": value => value.cases
      .find(candidate => (
        candidate.caseId === "diag.object.duplicate-selection-with-mismatch.v1"
      )).expected.diagnostics.pop(),
    "incomplete-identity-census-emits-negative": value => value.cases
      .find(candidate => candidate.caseId === "diag.object.negative-census-suppression.v1")
      .expected.diagnostics.push(clone(snapshots.snapshots
        .find(candidate => candidate.name === "unknown-implementation").diagnostic)),
    "invalid-independent-edge-suppresses-scc": value => value.cases
      .find(candidate => candidate.caseId === "diag.object.independent-scc-with-invalid-edge.v1")
      .expected.diagnostics.pop(),
    "plan-with-diagnostics": value => {
      value.cases[0].expected.plan = {};
    },
  };
  for (const mutant of snapshots.rejectedProtocolMutants) {
    const candidate = clone(protocol);
    mutations[mutant.name](candidate);
    assert.throws(() => validate(candidate), mutant.name);
  }

  const contextuallyUnknownKeyLeak = clone(protocol);
  const hostileProfile = contextuallyUnknownKeyLeak.cases.find(descriptor => (
    descriptor.caseId === "diag.raw.hostile-profile-key.v1"
  ));
  const hostileInput = hostileProfile.input.profileUtf8;
  hostileProfile.input.profileUtf8 = hostileInput.replace(
    '"password=DO-NOT-EMIT":true',
    '"moduleId":true',
  );
  assert.notEqual(hostileProfile.input.profileUtf8, hostileInput);
  hostileProfile.expected.diagnostics[0].path.push({ kind: "field", value: "moduleId" });
  assert.throws(
    () => validate(contextuallyUnknownKeyLeak),
    /must stop before an unknown field/u,
  );

  const reservedStaticResult = clone(protocol);
  reservedStaticResult.cases[0].expected.diagnostics[0] = {
    code: "output.canonicalization-failed",
    phase: "output",
    path: [],
    coordinate: {},
    details: { reason: "canonicalization" },
  };
  assert.throws(() => validate(reservedStaticResult), /reserved-non-emittable/u);
});


test("future packed evidence minimum is closed and is not a report shape", async () => {
  const manifest = await readJson(
    "architecture/qualification/v1/qualification-case-manifest.json",
  );
  const minimum = manifest.staticConformanceProtocol.futurePackedSubjectEvidenceMinimum;
  assert.doesNotThrow(() => validateFuturePackedSubjectEvidenceMinimum(minimum));
  assert.equal(
    minimum.purpose,
    "minimum-bindings-only-not-report-schema-api-runner-or-attestation",
  );
  assert.equal(minimum.subject, "one-exact-packed-archive");
  assert.deepEqual(minimum.compilerEntrypoints, [
    "compileCompositionV1", "compileCompositionJsonV1",
  ]);
  assert.deepEqual(minimum.matrixCases.map(value => value.caseId), [
    "node-24-linux",
    "node-24-macos",
    "node-24-windows",
    "chromium-window",
    "chromium-dedicated-worker",
    "electron-desktop-smoke",
  ]);
  assert.match(minimum.bindingRequirements.packedArchiveSha256, /archive-bytes-not-package/u);
  assert.deepEqual(
    minimum.matrixCases.find(value => value.caseId === "chromium-window")
      .applicableExtraBindings,
    ["browserExactBuild"],
  );
  assert.deepEqual(
    minimum.matrixCases.find(value => value.caseId === "electron-desktop-smoke")
      .applicableExtraBindings,
    [
      "electronExactRelease",
      "electronEmbeddedNodeExactVersion",
      "electronEmbeddedChromiumExactBuild",
    ],
  );
  assert.ok(!Object.hasOwn(minimum, "runner"));
  assert.ok(!Object.hasOwn(minimum, "attestation"));
  assert.ok(!Object.hasOwn(minimum, "instances"));

  for (const mutate of [
    value => { value.required = ["packedArchiveSha256"]; },
    value => { value.callerLabel = "nightly"; },
    value => { value.instances = [{ status: "passed" }]; },
    value => {
      value.bindingRequirements.packedArchiveSha256 = "package-name-and-version";
    },
    value => { delete value.bindingRequirements.operatingSystemExactBuild; },
    value => { value.matrixCases[0].caseId = "node-latest-linux"; },
    value => { value.matrixCases[3].applicableExtraBindings = []; },
    value => { value.matrixCases[5].applicableExtraBindings.pop(); },
  ]) {
    const candidate = clone(minimum);
    mutate(candidate);
    assert.throws(() => validateFuturePackedSubjectEvidenceMinimum(candidate));
  }
});
