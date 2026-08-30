import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  createDiagnosticComparator,
  createSchemaValidators,
  jsonValueIdentity,
  validateCanonicalizationQualification,
  validateDecoderQualification,
  validateDiagnosticQualification,
  validateNormalizationQualification,
  validateQualificationCaseManifest,
  validateQualificationLedger,
  validateResolvedResultCodeDisposition,
  validateResourceBoundaryQualification,
  validateStaticConformanceProtocol,
} from "../architecture/checks/v1-qualification.mjs";
import {
  boundedDiagnosticSummary,
  chainGraph,
  createBoundedDiagnosticCollector,
  cycleGraph,
  dependencyOrder,
  diagnosticCandidate,
  graphFacts,
  generateLimitFixture,
  layeredGraph,
  measureResourceFixtures,
  meterLimitFixture,
  mutateLimitFixtureOffByOne,
  runDiagnosticCollectorCase,
  wideGraph,
} from "./qualification/v1-resource-profile.mjs";

const readJson = async relativePath => JSON.parse(
  await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8"),
);
const execFileAsync = promisify(execFile);
const clone = value => structuredClone(value);
const sha256Identity = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
let sharedValidators;
const schemaValidators = schema => {
  sharedValidators ??= createSchemaValidators(schema);
  return sharedValidators;
};

test("resource qualification CLI emits JSON through a cross-platform entrypoint", async () => {
  const script = fileURLToPath(new URL("./qualification/v1-resource-profile.mjs", import.meta.url));
  const { stdout, stderr } = await execFileAsync(process.execPath, [script]);
  assert.equal(stderr, "");
  const report = JSON.parse(stdout);
  assert.equal(report.chainAtDepthLimit.nodes, 2048);
  assert.equal(report.diagnosticStorm.retained, 255);
  assert.equal(
    report.diagnosticStorm.qualificationScope,
    "static-fixture-oracle-no-production-subject",
  );
});

test("diagnostic refinement and total comparator reject targeted mutations",
  runDiagnosticRefinementMutations);

test("diagnostic prerequisites are closed for every code and named limit", async () => {
  const [schema, catalog, profile, contract, snapshots] = await Promise.all([
    readJson("architecture/contracts/v1/composition.schema.json"),
    readJson("architecture/contracts/v1/diagnostic-catalog.json"),
    readJson("architecture/contracts/v1/resource-profile.json"),
    readJson("architecture/qualification/v1/diagnostic-contract.json"),
    readJson("architecture/qualification/v1/diagnostic-snapshots.json"),
  ]);
  const { validateDiagnostic } = schemaValidators(schema);
  const validate = value => validateDiagnosticQualification({
    contract: value,
    snapshots,
    catalog,
    profile,
    coordinateFields: Object.keys(schema.$defs.diagnostic.properties.coordinate.properties),
    validateDiagnostic,
  });
  assert.doesNotThrow(() => validate(contract));

  for (const mutate of [
    value => { value.prerequisiteCatalog.diagnostics.pop(); },
    value => { value.prerequisiteCatalog.diagnostics[0].code = "unknown.code"; },
    value => { value.prerequisiteCatalog.diagnostics[1].code
      = value.prerequisiteCatalog.diagnostics[0].code; },
    value => { value.prerequisiteCatalog.diagnostics[0].prerequisiteGroup = "decode.other"; },
    value => { value.prerequisiteCatalog.factModel.facts[0].factId = "batch.other"; },
    value => { value.prerequisiteCatalog.exactCases[0].factStates
      ["profile.selection-uniqueness"] = "valid"; },
    value => { value.prerequisiteCatalog.diagnostics
      .find(entry => entry.code === "profile.implementation-mismatch")
      .prerequisites.push("profile.selection-uniqueness"); },
    value => { value.prerequisiteCatalog.diagnostics
      .find(entry => entry.code === "profile.unknown-implementation")
      .prerequisites.pop(); },
    value => { value.prerequisiteCatalog.diagnostics
      .find(entry => entry.code === "graph.cycle")
      .prerequisites.push("binding.reached-frontier-complete"); },
    value => { value.prerequisiteCatalog.limits.pop(); },
    value => { value.prerequisiteCatalog.limits[0].limitName = "unknownLimit"; },
    value => { value.prerequisiteCatalog.limits[1].limitName
      = value.prerequisiteCatalog.limits[0].limitName; },
    value => { value.prerequisiteCatalog.limits[0].suppressionScope = "batch"; },
    value => { value.prerequisiteCatalog.executableRule = "evaluate()"; },
  ]) {
    const candidate = clone(contract);
    mutate(candidate);
    assert.throws(() => validate(candidate));
  }
});

test("reserved base diagnostic code cannot be indirectly reactivated", async () => {
  const [schema, catalog, profile, contract, snapshots, boundaries, manifest] =
    await Promise.all([
      readJson("architecture/contracts/v1/composition.schema.json"),
      readJson("architecture/contracts/v1/diagnostic-catalog.json"),
      readJson("architecture/contracts/v1/resource-profile.json"),
      readJson("architecture/qualification/v1/diagnostic-contract.json"),
      readJson("architecture/qualification/v1/diagnostic-snapshots.json"),
      readJson("architecture/qualification/v1/resource-boundary-vectors.json"),
      readJson("architecture/qualification/v1/qualification-case-manifest.json"),
    ]);
  const { validateDocument, validateDiagnostic } = schemaValidators(schema);
  const reservedDiagnostic = {
    code: "output.canonicalization-failed",
    phase: "output",
    path: [],
    coordinate: {},
    details: { reason: "canonicalization" },
  };
  const validateDiagnostics = (contractValue = contract, snapshotsValue = snapshots) => (
    validateDiagnosticQualification({
      contract: contractValue,
      snapshots: snapshotsValue,
      catalog,
      profile,
      coordinateFields: Object.keys(schema.$defs.diagnostic.properties.coordinate.properties),
      validateDiagnostic,
    })
  );
  assert.doesNotThrow(() => validateDiagnostics());
  assert.deepEqual(contract.codeDisposition.reservedNonEmittable,
    ["output.canonicalization-failed"]);
  assert.deepEqual(
    contract.codeDisposition.emittable.toSorted(),
    catalog.ordering.codes
      .filter(code => code !== "output.canonicalization-failed")
      .toSorted(),
  );

  const dispositionReactivation = clone(contract);
  dispositionReactivation.codeDisposition.emittable.push("output.canonicalization-failed");
  dispositionReactivation.codeDisposition.reservedNonEmittable = [];
  assert.throws(() => validateDiagnostics(dispositionReactivation), /code disposition/u);

  const prerequisiteReactivation = clone(contract);
  prerequisiteReactivation.prerequisiteCatalog.diagnostics.splice(-1, 0, {
    code: "output.canonicalization-failed",
    prerequisiteGroup: "output.canonical-plan",
    prerequisites: ["output.plan-eligible"],
    suppressionScope: "output",
  });
  assert.throws(() => validateDiagnostics(prerequisiteReactivation), /prerequisite catalog/u);

  const pathPolicyReactivation = clone(contract);
  pathPolicyReactivation.pathPolicyByCode["output.canonicalization-failed"] = "empty";
  assert.throws(() => validateDiagnostics(pathPolicyReactivation), /path policies/u);

  const variantReactivation = clone(contract);
  variantReactivation.variants.splice(-1, 0, {
    code: "output.canonicalization-failed",
    phases: ["output"],
    coordinate: { required: [], allowed: [] },
    details: { required: ["reason"], reasonValues: ["canonicalization"] },
  });
  assert.throws(() => validateDiagnostics(variantReactivation), /diagnostic variants/u);

  const snapshotReactivation = clone(snapshots);
  snapshotReactivation.snapshots.splice(-1, 0, {
    name: "canonicalization-failed",
    diagnostic: reservedDiagnostic,
  });
  assert.throws(() => validateDiagnostics(contract, snapshotReactivation),
    /unknown diagnostic code/u);

  const adjacencyReactivation = clone(snapshots);
  adjacencyReactivation.rankAdjacency.codes.splice(-1, 1,
    ["graph.cycle", "output.canonicalization-failed"],
    ["output.canonicalization-failed", "diagnostics.truncated"]);
  assert.throws(() => validateDiagnostics(contract, adjacencyReactivation), /rank adjacency/u);

  const collectorReactivation = clone(boundaries);
  collectorReactivation.diagnosticCollector.candidateTemplate.code =
    "output.canonicalization-failed";
  assert.throws(() => validateResourceBoundaryQualification({
    vectors: collectorReactivation,
    profile,
    contract,
    catalog,
    validateDiagnostic,
    maximumOmitted: schema.$defs.diagnostic.properties.details.properties.omitted.maximum,
  }), /unknown diagnostic code/u);

  const staticCaseReactivation = clone(manifest.staticConformanceProtocol);
  staticCaseReactivation.cases[0].expected.diagnostics[0] = reservedDiagnostic;
  assert.throws(() => validateStaticConformanceProtocol({
    protocol: staticCaseReactivation,
    contract,
    catalog,
    validateDocument,
    validateDiagnostic,
  }), /reserved-non-emittable/u);

  assert.throws(() => validateResolvedResultCodeDisposition({
    result: { ok: false, diagnostics: [reservedDiagnostic] },
    contract,
  }), /reserved-non-emittable/u);

  for (const mutate of [
    value => { value.failureEvaluationProtocol.internalFailure.kinds.pop(); },
    value => { value.failureEvaluationProtocol.internalFailure.outcome = "diagnostic-result"; },
    value => { value.failureEvaluationProtocol.internalFailure.publicFaultInjection = "allowed"; },
    value => {
      value.failureEvaluationProtocol.internalFailure.serializedRejectionShape = "object";
    },
  ]) {
    const candidate = clone(contract);
    mutate(candidate);
    assert.throws(() => validateDiagnostics(candidate), /internal failures/u);
  }
});

test("canonical vector bytes and digest are independently reproducible", async () => {
  const vectors = await readJson("architecture/contracts/v1/canonical-vectors.json");
  const [vector] = vectors.positive;
  assert.deepEqual(JSON.parse(vector.canonicalUtf8), vector.envelope);
  const digest = createHash("sha256").update(vector.canonicalUtf8, "utf8").digest("hex");
  assert.equal(vector.digest, `gm-plan:v1:sha-256:${digest}`);
});

test("qualification JSON identity preserves negative zero, types, and structure", async () => {
  const decoder = await readJson("architecture/qualification/v1/decoder-vectors.json");
  const negativeZero = decoder.cases.find(vector => vector.name === "negative-zero");
  const decoded = JSON.parse(negativeZero.source);
  const repaired = JSON.parse(negativeZero.repairedSource);
  const decodedMinimum = decoded.slots[0].cardinality.min;
  const repairedMinimum = repaired.slots[0].cardinality.min;

  assert.ok(Object.is(decodedMinimum, -0));
  assert.ok(Object.is(repairedMinimum, 0));
  assert.ok(!Object.is(repairedMinimum, -0));
  assert.notEqual(jsonValueIdentity(decoded), jsonValueIdentity(repaired));

  const collapseNegativeZeroMutant = clone(decoded);
  collapseNegativeZeroMutant.slots[0].cardinality.min = 0;
  assert.equal(jsonValueIdentity(collapseNegativeZeroMutant), jsonValueIdentity(repaired));
  assert.notEqual(
    jsonValueIdentity(collapseNegativeZeroMutant),
    jsonValueIdentity(decoded),
    "collapsing -0 to 0 must fail the accepted decoded-value identity",
  );

  assert.equal(
    jsonValueIdentity({ z: [1, true], a: { nested: null } }),
    jsonValueIdentity({ a: { nested: null }, z: [1, true] }),
  );
  assert.notEqual(jsonValueIdentity([1]), jsonValueIdentity({ 0: 1 }));
  assert.notEqual(jsonValueIdentity(1), jsonValueIdentity("1"));
});

test("diagnostic schema and catalog expose the same closed code set", async () => {
  const schema = await readJson("architecture/contracts/v1/composition.schema.json");
  const catalog = await readJson("architecture/contracts/v1/diagnostic-catalog.json");
  const schemaCodes = schema.$defs.diagnostic.properties.code.enum;
  assert.deepEqual(schemaCodes, catalog.ordering.codes);
  assert.deepEqual(Object.keys(catalog.detailPolicy), catalog.ordering.codes);
  assert.equal(new Set(catalog.ordering.codes).size, catalog.ordering.codes.length);
});

test("resource profile fixes every allocation-driving dimension", async () => {
  const profile = await readJson("architecture/contracts/v1/resource-profile.json");
  assert.deepEqual(profile.limits, {
    rawDocumentBytes: 1048576,
    aggregateRawBytes: 16777216,
    jsonDepth: 32,
    aggregateStringBytes: 8388608,
    identifierBytes: 128,
    ownerPathSegments: 8,
    declarations: 4096,
    capabilitiesPerDeclaration: 64,
    slotsPerDeclaration: 128,
    totalCapabilities: 65536,
    totalSlots: 65536,
    roots: 1024,
    selections: 4096,
    bindings: 65536,
    graphEdges: 262144,
    providersPerManySlot: 1024,
    graphDepth: 2048,
    diagnostics: 256,
    diagnosticPathSegments: 32,
  });
});

test("resource boundary fixtures remain iterative and bounded", () => {
  for (const [createGraph, expectedFacts, acyclic] of [
    [() => chainGraph(2048), { nodes: 2048, edges: 2047 }, true],
    [() => wideGraph(4096), { nodes: 4096, edges: 4095 }, true],
    [() => layeredGraph(64, 64), { nodes: 4096, edges: 258048 }, true],
    [() => cycleGraph(4096), { nodes: 4096, edges: 4096 }, false],
  ]) {
    const graph = createGraph();
    assert.deepEqual(graphFacts(graph), expectedFacts);
    assert.equal(dependencyOrder(graph).acyclic, acyclic);
  }

  const tie = [[], [], [1], [0]];
  assert.deepEqual(dependencyOrder(tie), {
    acyclic: true,
    order: [0, 1, 2, 3],
  });

  const storm = boundedDiagnosticSummary(65536, 256);
  assert.equal(storm.retained.length, 255);
  assert.deepEqual(storm.truncation, { omitted: 65281 });

  const exactCap = boundedDiagnosticSummary(256, 256);
  assert.equal(exactCap.retained.length, 256);
  assert.equal(exactCap.truncation, null);

  const overCap = boundedDiagnosticSummary(257, 256);
  assert.equal(overCap.retained.length, 255);
  assert.deepEqual(overCap.truncation, { omitted: 2 });
});

test("every named resource limit has executable at and plus-one fixtures", async () => {
  const vectors = await readJson("architecture/qualification/v1/resource-boundary-vectors.json");
  const exercisedFamilies = new Set();
  for (const vector of vectors.cases) {
    for (const expected of [vector.at, vector.over]) {
      const fixture = generateLimitFixture(vector, expected);
      assert.equal(meterLimitFixture(vector, fixture), expected, vector.limitName);
    }
    exercisedFamilies.add(vector.fixtureFamily);
  }
  assert.deepEqual([...exercisedFamilies].sort(), [
    "graph-depth", "graph-edges", "item-count", "json-depth", "raw-bytes",
    "utf8-string-bytes",
  ]);
  for (const family of exercisedFamilies) {
    const vector = vectors.cases.find(candidate => candidate.fixtureFamily === family);
    const fixture = generateLimitFixture(vector, vector.at);
    const mutatedFixture = mutateLimitFixtureOffByOne(vector, fixture);
    assert.equal(
      meterLimitFixture(vector, mutatedFixture),
      vector.at + 1,
      `${family} off-by-one fixture mutation must be detected by the oracle`,
    );
  }
});

test("aggregate string bytes count every decoded UTF-8 key and value occurrence", async () => {
  const vectors = await readJson("architecture/qualification/v1/resource-boundary-vectors.json");
  const vector = vectors.cases.find(candidate => candidate.limitName === "aggregateStringBytes");
  for (const expected of [vector.at, vector.over]) {
    const fixture = generateLimitFixture(vector, expected);
    const entries = fixture.decodedObjects.flatMap(value => Object.entries(value));
    assert.equal(entries.length, fixture.decodedObjects.length);
    assert.ok(entries.length > 1);
    assert.ok(entries.every(([key, value]) => (
      Buffer.byteLength(key, "utf8") > key.length
      && Buffer.byteLength(value, "utf8") > value.length
    )));
    assert.equal(meterLimitFixture(vector, fixture), expected);

    const utf16CodeUnitMutant = entries.reduce(
      (total, [key, value]) => total + key.length + value.length,
      0,
    );
    const stringValueOnlyMutant = entries.reduce(
      (total, [, value]) => total + Buffer.byteLength(value, "utf8"),
      0,
    );
    assert.notEqual(
      utf16CodeUnitMutant,
      expected,
      "UTF-16 code-unit counting must fail the aggregate UTF-8 boundary fixture",
    );
    assert.notEqual(
      stringValueOnlyMutant,
      expected,
      "omitting decoded object-key occurrences must fail the aggregate UTF-8 boundary fixture",
    );
  }
});

test("measurement report covers every admitted adversarial graph shape", () => {
  const report = measureResourceFixtures();
  assert.deepEqual(Object.keys(report), [
    "chainAtDepthLimit",
    "wideAtDeclarationLimit",
    "layeredDense",
    "giantCycle",
    "diagnosticStorm",
  ]);
});

test("qualification ledger rejects changed artifact bytes", async () => {
  const bytes = Buffer.from("accepted", "utf8");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const ledger = {
    schemaVersion: 1,
    algorithm: "sha256-bytes",
    artifacts: [{
      id: "EXAMPLE",
      path: "architecture/qualification/v1/example.json",
      immutableDigest: `sha256:${digest}`,
    }],
  };
  await assert.doesNotReject(() => validateQualificationLedger({
    ledger,
    readBytes: async () => bytes,
    listedPaths: ["architecture/qualification/v1/example.json"],
  }));
  await assert.rejects(() => validateQualificationLedger({
    ledger,
    readBytes: async () => Buffer.from("changed", "utf8"),
    listedPaths: ["architecture/qualification/v1/example.json"],
  }), /differs from the qualification ledger/u);
});

async function runDiagnosticRefinementMutations() {
  const schema = await readJson("architecture/contracts/v1/composition.schema.json");
  const catalog = await readJson("architecture/contracts/v1/diagnostic-catalog.json");
  const profile = await readJson("architecture/contracts/v1/resource-profile.json");
  const contract = await readJson("architecture/qualification/v1/diagnostic-contract.json");
  const snapshots = await readJson("architecture/qualification/v1/diagnostic-snapshots.json");
  const { validateDiagnostic } = schemaValidators(schema);
  const validate = (
    value,
    contractValue = contract,
    diagnosticValidator = validateDiagnostic,
  ) => validateDiagnosticQualification({
    contract: contractValue,
    snapshots: value,
    catalog,
    profile,
    coordinateFields: Object.keys(schema.$defs.diagnostic.properties.coordinate.properties),
    validateDiagnostic: diagnosticValidator,
  });
  const materialize = (snapshotSet, operand) => ({
    ...structuredClone(snapshotSet.snapshots
      .find(snapshot => snapshot.name === operand.snapshot).diagnostic),
    ...structuredClone(operand.override),
  });
  const comparator = createDiagnosticComparator({ contract, catalog });
  assert.doesNotThrow(() => validate(snapshots));

  const wrongPhase = clone(snapshots);
  wrongPhase.snapshots[0].diagnostic.phase = "schema";
  assert.throws(() => validate(wrongPhase), /invalid phase/u);

  const emptyStructuralPath = clone(snapshots);
  emptyStructuralPath.snapshots[1].diagnostic.path = [];
  assert.throws(() => validate(emptyStructuralPath), /structural path/u);

  const extraKnownDetail = clone(snapshots);
  extraKnownDetail.snapshots[0].diagnostic.details.limit = 1;
  assert.throws(() => validate(extraKnownDetail), /exact detail shape/u);

  const reorderedCoordinates = clone(contract);
  [reorderedCoordinates.coordinateFieldOrder[0], reorderedCoordinates.coordinateFieldOrder[1]] = [
    reorderedCoordinates.coordinateFieldOrder[1],
    reorderedCoordinates.coordinateFieldOrder[0],
  ];
  assert.throws(() => validate(snapshots, reorderedCoordinates), /coordinate order/u);

  const changedComparatorPolicy = clone(contract);
  changedComparatorPolicy.comparator.pathPrefixOrder = "longer-first";
  assert.throws(() => validate(snapshots, changedComparatorPolicy), /normative policy/u);

  const illegalLimitSpecific = clone(contract);
  illegalLimitSpecific.pathPolicyByCode["schema.invalid-value"] = "limit-specific";
  assert.throws(() => validate(snapshots, illegalLimitSpecific), /independent authority/u);

  const undefinedPathPolicy = clone(contract);
  delete undefinedPathPolicy.pathPolicyByCode["schema.invalid-value"];
  assert.throws(() => validate(snapshots, undefinedPathPolicy), /exact expected string set/u);

  const reversedAxis = clone(snapshots);
  reversedAxis.orderingCases[0].expected.reverse();
  assert.throws(() => validate(reversedAxis), /expected diagnostic order/u);

  const laterIndexMutation = clone(snapshots);
  laterIndexMutation.orderingCases
    .find(vector => vector.axis === "path.later-index-value")
    .operands[0].override.path[3].value = 12;
  assert.throws(() => validate(laterIndexMutation), /path\.later-index-value/u);

  const asciiFieldWitness = clone(snapshots);
  const fieldValueCase = asciiFieldWitness.orderingCases
    .find(vector => vector.axis === "path.field-value");
  fieldValueCase.operands = [
    {
      name: "field-Z",
      snapshot: "invalid-value",
      override: {
        path: [{ kind: "field", value: "Z" }],
        details: { reason: "invalid-type" },
      },
    },
    {
      name: "field-a",
      snapshot: "invalid-value",
      override: {
        path: [{ kind: "field", value: "a" }],
        details: { reason: "invalid-format" },
      },
    },
  ];
  fieldValueCase.expected = ["field-Z", "field-a"];
  assert.doesNotThrow(() => validate(asciiFieldWitness));
  const [fieldZ, fieldA] = fieldValueCase.operands
    .map(operand => materialize(asciiFieldWitness, operand));
  assert.ok(comparator(fieldZ, fieldA) < 0);
  const foldFieldValues = diagnostic => ({
    ...diagnostic,
    path: diagnostic.path.map(segment => segment.kind === "field"
      ? { ...segment, value: segment.value.toLowerCase() }
      : segment),
  });
  const caseFoldingComparatorMutant = (left, right) => comparator(
    foldFieldValues(left),
    foldFieldValues(right),
  );
  assert.ok(
    caseFoldingComparatorMutant(fieldZ, fieldA) > 0,
    "case folding must fail the ASCII code-unit field-value witness",
  );

  const invalidRefinementOperand = clone(snapshots);
  invalidRefinementOperand.orderingCases
    .find(vector => vector.axis === "coordinate.moduleId.presence")
    .operands[1].override.coordinate.providerImplementationId = "example/provider/default";
  assert.throws(() => validate(invalidRefinementOperand), /forbidden coordinate/u);

  const assertAdjacencyRefinesOperand = (snapshotName, invalidReason) => {
    const adjacencyMutation = clone(snapshots);
    const target = adjacencyMutation.snapshots
      .find(snapshot => snapshot.name === snapshotName).diagnostic;
    let targetValidations = 0;
    const mutateOnAdjacencyValidation = diagnostic => {
      const valid = validateDiagnostic(diagnostic);
      if (diagnostic === target) {
        targetValidations += 1;
        if (targetValidations === 2) diagnostic.details.reason = invalidReason;
      }
      return valid;
    };
    assert.throws(
      () => validate(adjacencyMutation, contract, mutateOnAdjacencyValidation),
      /invalid reason/u,
    );
    assert.equal(targetValidations, 2);
  };
  assertAdjacencyRefinesOperand("invalid-json", "duplicate-key");
  assertAdjacencyRefinesOperand("duplicate-key", "invalid-json");

  const falseDominance = clone(snapshots);
  falseDominance.orderingCases
    .find(vector => vector.axis === "coordinate.moduleId.presence")
    .opposedLaterAxis = "details.rfc8785";
  assert.throws(() => validate(falseDominance), /does not prove dominance/u);

  const duplicateCycleMember = clone(snapshots);
  duplicateCycleMember.snapshots.find(snapshot => snapshot.name === "cycle")
    .diagnostic.details.component.push("example/database/default");
  assert.throws(() => validate(duplicateCycleMember), /unique and sorted/u);

  const unsortedCycleMember = clone(snapshots);
  unsortedCycleMember.snapshots.find(snapshot => snapshot.name === "cycle")
    .diagnostic.details.component.reverse();
  assert.throws(() => validate(unsortedCycleMember), /unique and sorted/u);

  const wrongSccOrder = clone(snapshots);
  wrongSccOrder.sccGraphCases[0].expected.reverse();
  assert.throws(() => validate(wrongSccOrder), /member or outer ordering/u);

  const unsortedSccMembers = clone(snapshots);
  unsortedSccMembers.sccGraphCases[0].expected[1].reverse();
  assert.throws(() => validate(unsortedSccMembers), /SCC membership or ordering/u);

  const overlappingSccs = clone(snapshots);
  overlappingSccs.sccGraphCases[0].expected[1][0] = "example/a/default";
  assert.throws(() => validate(overlappingSccs), /not unique and disjoint/u);

  const wrongSccMembership = clone(snapshots);
  wrongSccMembership.sccGraphCases[0].expected[1][1] = "example/g/default";
  assert.throws(() => validate(wrongSccMembership), /derives different SCC membership/u);

  const mergedDisjointSccs = clone(snapshots);
  mergedDisjointSccs.sccGraphCases[0].edges.push(
    { id: "c-to-d", from: "example/c/default", to: "example/d/default" },
    { id: "d-to-c", from: "example/d/default", to: "example/c/default" },
  );
  for (const permutation of mergedDisjointSccs.sccGraphCases[0].permutations) {
    permutation.edgeOrder.push("c-to-d", "d-to-c");
  }
  assert.throws(() => validate(mergedDisjointSccs), /derives different SCC membership/u);

  const reversedDirectedEdge = clone(snapshots);
  const directedEdge = reversedDirectedEdge.sccGraphCases[0].edges
    .find(edge => edge.id === "b-to-c");
  [directedEdge.from, directedEdge.to] = [directedEdge.to, directedEdge.from];
  assert.throws(() => validate(reversedDirectedEdge), /derives different SCC membership/u);

  const missingSelfCycle = clone(snapshots);
  missingSelfCycle.sccGraphCases[0].edges
    .find(edge => edge.id === "a-self").to = "example/f/default";
  assert.throws(() => validate(missingSelfCycle), /derives different SCC membership/u);

  const missingParallelEdge = clone(snapshots);
  missingParallelEdge.sccGraphCases[0].edges = missingParallelEdge.sccGraphCases[0].edges
    .filter(edge => edge.id !== "z-to-b-parallel");
  for (const permutation of missingParallelEdge.sccGraphCases[0].permutations) {
    permutation.edgeOrder = permutation.edgeOrder
      .filter(edgeId => edgeId !== "z-to-b-parallel");
  }
  assert.throws(() => validate(missingParallelEdge), /legal parallel-edge witness/u);

  const swappedPhaseRanks = clone(catalog);
  [swappedPhaseRanks.ordering.phases[0], swappedPhaseRanks.ordering.phases[1]] = [
    swappedPhaseRanks.ordering.phases[1], swappedPhaseRanks.ordering.phases[0],
  ];
  assert.throws(() => validateDiagnosticQualification({
    contract,
    snapshots,
    catalog: swappedPhaseRanks,
    profile,
    coordinateFields: Object.keys(schema.$defs.diagnostic.properties.coordinate.properties),
    validateDiagnostic,
  }), /phase-rank authority/u);

  const swappedCodeRanks = clone(catalog);
  [swappedCodeRanks.ordering.codes[0], swappedCodeRanks.ordering.codes[1]] = [
    swappedCodeRanks.ordering.codes[1], swappedCodeRanks.ordering.codes[0],
  ];
  assert.throws(() => validateDiagnosticQualification({
    contract,
    snapshots,
    catalog: swappedCodeRanks,
    profile,
    coordinateFields: Object.keys(schema.$defs.diagnostic.properties.coordinate.properties),
    validateDiagnostic,
  }), /code-rank authority/u);

  const skipsMaximumPathPosition = clone(snapshots);
  for (const orderingCase of skipsMaximumPathPosition.orderingCases.filter(
    vector => ["path.later-field-value", "path.later-index-value"].includes(vector.axis),
  )) {
    for (const operand of orderingCase.operands) {
      operand.override.path = operand.override.path.slice(-2);
    }
  }
  assert.throws(() => validate(skipsMaximumPathPosition), /exact path positions/u);

  const shallowDetailJcs = clone(snapshots);
  const nestedDetails = shallowDetailJcs.detailCanonicalizationCases
    .find(detailCase => detailCase.name === "nested-compatibility-details");
  nestedDetails.details = { actual: 2, limit: 1 };
  assert.throws(() => validate(shallowDetailJcs), /exact RFC 8785 detail bytes/u);

  const changedUnicodeDetail = clone(snapshots);
  changedUnicodeDetail.detailCanonicalizationCases
    .find(detailCase => detailCase.name === "unicode-detail-bytes").details.z = "😃";
  assert.throws(() => validate(changedUnicodeDetail), /exact RFC 8785 detail bytes/u);

  const detailsCase = snapshots.orderingCases
    .find(vector => vector.axis === "details.rfc8785");
  const [leftOperand, rightOperand] = detailsCase.operands;
  assert.ok(Buffer.compare(
    Buffer.from(JSON.stringify(leftOperand.override.details), "utf8"),
    Buffer.from(JSON.stringify(rightOperand.override.details), "utf8"),
  ) > 0, "ordinary JSON serialization must oppose the RFC 8785 witness");
  assert.ok(comparator(
    materialize(snapshots, leftOperand),
    materialize(snapshots, rightOperand),
  ) < 0);
}

test("normalization qualification rejects order and canonical-byte drift", async () => {
  const schema = await readJson("architecture/contracts/v1/composition.schema.json");
  const vectors = await readJson("architecture/qualification/v1/normalization-vectors.json");
  const { validateDocument } = schemaValidators(schema);
  const validate = value => validateNormalizationQualification({
    vectors: value,
    validateDocument,
  });
  assert.doesNotThrow(() => validate(vectors));

  const wrongOrder = clone(vectors);
  const order = wrongOrder.cases[0].expectedPlan.dependencyOrder;
  [order[1], order[2]] = [order[2], order[1]];
  assert.throws(() => validate(wrongOrder), /minimum deterministic dependency order/u);

  const wrongCanonicalBytes = clone(vectors);
  wrongCanonicalBytes.cases[0].canonicalUtf8 += " ";
  assert.throws(() => validate(wrongCanonicalBytes), /accepted RFC 8785 value/u);
});

test("resource and decoder qualification reject expectation drift", async () => {
  const schema = await readJson("architecture/contracts/v1/composition.schema.json");
  const catalog = await readJson("architecture/contracts/v1/diagnostic-catalog.json");
  const profile = await readJson("architecture/contracts/v1/resource-profile.json");
  const contract = await readJson("architecture/qualification/v1/diagnostic-contract.json");
  const boundaries = await readJson(
    "architecture/qualification/v1/resource-boundary-vectors.json",
  );
  const decoder = await readJson("architecture/qualification/v1/decoder-vectors.json");
  const canonicalization = await readJson(
    "architecture/qualification/v1/canonicalization-vectors.json",
  );
  const manifest = await readJson(
    "architecture/qualification/v1/qualification-case-manifest.json",
  );
  const acceptedCanonical = await readJson("architecture/contracts/v1/canonical-vectors.json");
  const { validateDocument, validateDiagnostic } = schemaValidators(schema);
  const maximumOmitted = schema.$defs.diagnostic.properties.details
    .properties.omitted.maximum;
  const validateBoundaries = value => validateResourceBoundaryQualification({
    vectors: value,
    profile,
    contract,
    catalog,
    validateDiagnostic,
    maximumOmitted,
  });
  const validateDecoder = value => validateDecoderQualification(value, {
    maxDepth: profile.limits.jsonDepth,
    validateDocument,
  });
  const validateManifest = (manifestValue, decoderValue = decoder,
    canonicalizationValue = canonicalization) => validateQualificationCaseManifest({
    manifest: manifestValue,
    decoderVectors: decoderValue,
    canonicalizationVectors: canonicalizationValue,
    acceptedCanonicalVectors: acceptedCanonical,
    diagnosticContract: contract,
    diagnosticCatalog: catalog,
    validateDocument,
    validateDiagnostic,
  });

  assert.doesNotThrow(() => validateBoundaries(boundaries));
  assert.doesNotThrow(() => validateDecoder(decoder));
  assert.doesNotThrow(() => validateManifest(manifest));

  const rawLocatorRemoved = clone(manifest);
  rawLocatorRemoved.staticConformanceProtocol.cases[0]
    .expected.diagnostics[0].path = [];
  assert.throws(() => validateManifest(rawLocatorRemoved), /raw invocation locator/u);

  const invalidCompanionProfile = clone(manifest);
  invalidCompanionProfile.staticConformanceProtocol.cases[0]
    .schemaValidCompanion.profile.roots = [];
  assert.throws(() => validateManifest(invalidCompanionProfile), /base schema/u);

  const invalidStaticRefinement = clone(manifest);
  invalidStaticRefinement.staticConformanceProtocol.cases[0]
    .expected.diagnostics[0].details.reason = "unknown";
  assert.throws(() => validateManifest(invalidStaticRefinement), /invalid reason/u);

  const missingOverlapOutcome = clone(manifest);
  missingOverlapOutcome.staticConformanceProtocol.cases
    .find(value => value.caseId === "diag.object.duplicate-selection-with-mismatch.v1")
    .expected.diagnostics.pop();
  assert.throws(() => validateManifest(missingOverlapOutcome),
    /exact prerequisite outcome/u);

  const wrongBoundary = clone(boundaries);
  wrongBoundary.cases[0].over += 1;
  assert.throws(() => validateBoundaries(wrongBoundary), /boundary plus one/u);

  const falselyValidManyRange = clone(boundaries);
  falselyValidManyRange.semanticCases
    .find(vector => vector.name === "many-min-cannot-exceed-max").cardinality.max = 4;
  assert.throws(() => validateBoundaries(falselyValidManyRange), /min greater than max/u);

  const wrongSaturation = clone(boundaries);
  wrongSaturation.diagnosticCollector.cases
    .find(vector => vector.failureCount === 262400).expectedFailureCountSaturated = false;
  assert.throws(() => validateBoundaries(wrongSaturation), /bounded-collector expectation/u);

  const unrelatedSchemaFailure = clone(decoder);
  const unrelatedNegativeZero = unrelatedSchemaFailure.cases
    .find(vector => vector.name === "negative-zero");
  unrelatedNegativeZero.source = unrelatedNegativeZero.source
    .replace('"schemaVersion":1', '"schemaVersion":2');
  unrelatedNegativeZero.repairedSource = unrelatedNegativeZero.repairedSource
    .replace('"schemaVersion":1', '"schemaVersion":2');
  assert.throws(() => validateDecoder(unrelatedSchemaFailure), /exactly its one bound/u);

  const broadNegativeZeroRepair = clone(decoder);
  const broadNegative = broadNegativeZeroRepair.cases
    .find(vector => vector.name === "negative-zero");
  broadNegative.source = broadNegative.source.replace('"max":1', '"max":-0');
  broadNegative.repair.span = '"min":-0,"max":-0';
  broadNegative.repair.replacement = '"min":0,"max":0';
  broadNegative.repairedSource = broadNegative.source.replace(
    broadNegative.repair.span, broadNegative.repair.replacement,
  );
  assert.throws(() => validateDecoder(broadNegativeZeroRepair), /exactly its one bound/u);

  const broadLoneSurrogateRepair = clone(decoder);
  const broadSurrogate = broadLoneSurrogateRepair.cases
    .find(vector => vector.name === "lone-surrogate-escape");
  broadSurrogate.source = broadSurrogate.source.replace("module\\ud800", "module\\ud800\\ud800");
  broadSurrogate.repair.span = "\\ud800\\ud800";
  broadSurrogate.repairedSource = broadSurrogate.source.replace(broadSurrogate.repair.span, "");
  assert.throws(() => validateDecoder(broadLoneSurrogateRepair), /exactly its one bound/u);

  const extraJsonFaultInsideFraming = clone(decoder);
  extraJsonFaultInsideFraming.cases
    .find(vector => vector.name === "overlong-utf8").source = "22c0af0a22";
  assert.throws(() => validateDecoder(extraJsonFaultInsideFraming), /isolate its authoritative/u);

  const swappedCommentSources = clone(decoder);
  const swappedCommentManifest = clone(manifest);
  const lineComment = swappedCommentSources.cases.find(vector => vector.name === "line-comment");
  const blockComment = swappedCommentSources.cases.find(vector => vector.name === "block-comment");
  [lineComment.source, blockComment.source] = [blockComment.source, lineComment.source];
  for (const vector of [lineComment, blockComment]) {
    swappedCommentManifest.decoder.cases.find(entry => entry.name === vector.name)
      .sourceBytesSha256 = sha256Identity(Buffer.from(vector.source, "utf8"));
  }
  assert.throws(() => validateManifest(
    swappedCommentManifest, swappedCommentSources, canonicalization,
  ), /independent fixed authority/u);

  const emptyBomBytes = clone(decoder);
  const emptyBomManifest = clone(manifest);
  emptyBomBytes.cases.find(vector => vector.name === "utf8-bom").source = "";
  emptyBomManifest.decoder.cases.find(entry => entry.name === "utf8-bom")
    .sourceBytesSha256 = sha256Identity(Buffer.alloc(0));
  assert.throws(() => validateDecoder(emptyBomBytes), /BOM evidence/u);
  assert.throws(() => validateManifest(
    emptyBomManifest, emptyBomBytes, canonicalization,
  ), /independent fixed authority/u);

  const textEncodedBom = clone(decoder);
  const textBom = textEncodedBom.cases.find(vector => vector.name === "utf8-bom");
  textBom.sourceEncoding = "utf8-text";
  textBom.source = "\ufeff{}";
  assert.throws(() => validateDecoder(textEncodedBom), /BOM evidence/u);

  const textEncodedEofTruncation = clone(decoder);
  textEncodedEofTruncation.cases
    .find(vector => vector.name === "eof-truncated-utf8-three-byte")
    .sourceEncoding = "utf8-text";
  assert.throws(() => validateDecoder(textEncodedEofTruncation),
    /strict-decoder expectation|true EOF-truncated/u);

  const swappedSemanticRepairTuples = clone(decoder);
  const loneTuple = swappedSemanticRepairTuples.cases
    .find(vector => vector.name === "lone-surrogate-escape");
  const negativeTuple = swappedSemanticRepairTuples.cases
    .find(vector => vector.name === "negative-zero");
  for (const field of ["source", "repair", "repairedSource"]) {
    [loneTuple[field], negativeTuple[field]] = [negativeTuple[field], loneTuple[field]];
  }
  assert.throws(() => validateDecoder(swappedSemanticRepairTuples),
    /bound semantic fault|fixed authority|repair/u);

  const missingManifestCategory = clone(manifest);
  missingManifestCategory.decoder.categories.pop();
  assert.throws(() => validateManifest(missingManifestCategory), /manifest categories/u);

  const swappedDecoderCategories = clone(decoder);
  const swappedDecoderManifest = clone(manifest);
  const decoderNames = ["invalid-utf8-unexpected-continuation", "overlong-utf8"];
  const decoderCases = decoderNames.map(name => swappedDecoderCategories.cases
    .find(vector => vector.name === name));
  [decoderCases[0].category, decoderCases[1].category] = [
    decoderCases[1].category, decoderCases[0].category,
  ];
  for (const name of decoderNames) {
    swappedDecoderManifest.decoder.cases.find(entry => entry.name === name).category
      = swappedDecoderCategories.cases.find(vector => vector.name === name).category;
  }
  assert.throws(() => validateManifest(
    swappedDecoderManifest, swappedDecoderCategories, canonicalization,
  ), /independent (?:category|fixed) authority/u);

  const wrongAcceptedSuccessor = clone(manifest);
  wrongAcceptedSuccessor.acceptedCanonicalNegativeSuccessors[1].decoderCase = "negative-zero";
  assert.throws(() => validateManifest(wrongAcceptedSuccessor), /successor authority/u);

  const swappedCanonicalCategories = clone(canonicalization);
  const swappedCanonicalManifest = clone(manifest);
  const canonicalNames = ["object-key-order", "string-escaping"];
  const canonicalCases = canonicalNames.map(name => swappedCanonicalCategories.cases
    .find(vector => vector.name === name));
  [canonicalCases[0].category, canonicalCases[1].category] = [
    canonicalCases[1].category, canonicalCases[0].category,
  ];
  for (const name of canonicalNames) {
    swappedCanonicalManifest.canonicalization.cases.find(entry => entry.name === name).category
      = swappedCanonicalCategories.cases.find(vector => vector.name === name).category;
  }
  assert.throws(() => validateManifest(
    swappedCanonicalManifest, decoder, swappedCanonicalCategories,
  ), /independent (?:category|fixed) authority/u);

  const swappedCanonicalTuples = clone(canonicalization);
  const swappedCanonicalTupleManifest = clone(manifest);
  const objectOrder = swappedCanonicalTuples.cases
    .find(vector => vector.name === "object-key-order");
  const stringEscaping = swappedCanonicalTuples.cases
    .find(vector => vector.name === "string-escaping");
  for (const field of ["value", "canonicalUtf8"]) {
    [objectOrder[field], stringEscaping[field]] = [stringEscaping[field], objectOrder[field]];
  }
  for (const vector of [objectOrder, stringEscaping]) {
    const entry = swappedCanonicalTupleManifest.canonicalization.cases
      .find(candidate => candidate.name === vector.name);
    entry.valueJsonUtf8Sha256 = sha256Identity(
      Buffer.from(JSON.stringify(vector.value), "utf8"),
    );
    entry.canonicalUtf8BytesSha256 = sha256Identity(
      Buffer.from(vector.canonicalUtf8, "utf8"),
    );
  }
  assert.throws(() => validateManifest(
    swappedCanonicalTupleManifest, decoder, swappedCanonicalTuples,
  ),
    /independent fixed authority/u);

  const alreadyCanonicalObjectOrder = clone(canonicalization);
  alreadyCanonicalObjectOrder.cases[0].value = { a: 1, m: 2, z: 0 };
  assert.throws(() => validateCanonicalizationQualification(alreadyCanonicalObjectOrder),
    /fixed authority|already in canonical property order/u);
});

test("bounded top-K uses the normative comparator across exact permutations", async () => {
  const schema = await readJson("architecture/contracts/v1/composition.schema.json");
  const catalog = await readJson("architecture/contracts/v1/diagnostic-catalog.json");
  const contract = await readJson("architecture/qualification/v1/diagnostic-contract.json");
  const boundaries = await readJson(
    "architecture/qualification/v1/resource-boundary-vectors.json",
  );
  const collectorVectors = boundaries.diagnosticCollector;
  const compareDiagnostics = createDiagnosticComparator({ contract, catalog });
  const permutationByName = new Map(
    collectorVectors.permutations.map(permutation => [permutation.name, permutation]),
  );
  const { validateDiagnostic } = schemaValidators(schema);
  let exactSchemaMaximum;

  for (const vector of collectorVectors.cases.filter(candidate => (
    candidate.failureCount <= 258 || candidate.failureCount === 262399
  ))) {
    for (const permutationName of vector.permutationNames) {
      const result = runDiagnosticCollectorCase({
        count: vector.failureCount,
        permutation: permutationByName.get(permutationName),
        template: collectorVectors.candidateTemplate,
        limit: collectorVectors.limit,
        maximumOmitted: collectorVectors.maximumOmitted,
        compareDiagnostics,
      });
      assert.deepEqual(
        result.retained.map(candidate => candidate.id),
        collectorVectors.expectedRetainedIdSets[vector.expectedRetainedIdSet],
      );
      assert.deepEqual(result.truncation, vector.expectedTruncation);
      assert.equal(result.failureCount, vector.expectedSaturatedFailureCount);
      assert.equal(result.failureCountSaturated, vector.expectedFailureCountSaturated);
      assert.equal(result.peakRetained, vector.expectedPeakRetained);
      assert.ok(result.retained.every(candidate => validateDiagnostic(candidate.diagnostic)));
      if (vector.failureCount === 262399) exactSchemaMaximum = result;
    }
  }

  const finalized = createBoundedDiagnosticCollector({
    limit: collectorVectors.limit,
    maximumOmitted: collectorVectors.maximumOmitted,
    compareDiagnostics,
  });
  finalized.finalize();
  assert.throws(() => finalized.add({ id: "late", diagnostic: {} }), /after finalization/u);

  const underlyingCollector = createBoundedDiagnosticCollector({
    limit: collectorVectors.limit,
    maximumOmitted: collectorVectors.maximumOmitted,
    compareDiagnostics,
  });
  let candidatesSeen = 0;
  const ignoresAfterKPlusOne = {
    add(candidate) {
      candidatesSeen += 1;
      if (candidatesSeen <= collectorVectors.limit + 1) underlyingCollector.add(candidate);
    },
    finalize: () => underlyingCollector.finalize(),
  };
  for (let index = 257; index >= 0; index -= 1) {
    ignoresAfterKPlusOne.add(diagnosticCandidate(index, collectorVectors.candidateTemplate));
  }
  const flawed = ignoresAfterKPlusOne.finalize();
  assert.notDeepEqual(
    flawed.retained.map(candidate => candidate.id),
    collectorVectors.expectedRetainedIdSets["first-255"],
    "ignoring candidates after K+1 must fail the reverse 258 late-replacement witness",
  );

  let aboveSchemaMaximum;
  for (const [maximumOmitted, count] of [
    [8, 264],
    [collectorVectors.maximumOmitted, 262400],
  ]) {
    const saturation = runDiagnosticCollectorCase({
      count,
      permutation: { kind: "ascending" },
      template: collectorVectors.candidateTemplate,
      limit: collectorVectors.limit,
      maximumOmitted,
      compareDiagnostics,
    });
    assert.deepEqual(saturation.truncation, { omitted: maximumOmitted });
    assert.equal(saturation.failureCount, (collectorVectors.limit - 1) + maximumOmitted);
    assert.equal(saturation.failureCountSaturated, true);
    assert.equal(saturation.peakRetained, collectorVectors.limit);
    if (count === 262400) aboveSchemaMaximum = saturation;
  }
  assert.deepEqual([
    {
      failureCount: exactSchemaMaximum.failureCount,
      failureCountSaturated: exactSchemaMaximum.failureCountSaturated,
    },
    {
      failureCount: aboveSchemaMaximum.failureCount,
      failureCountSaturated: aboveSchemaMaximum.failureCountSaturated,
    },
  ], [
    { failureCount: 262399, failureCountSaturated: false },
    { failureCount: 262399, failureCountSaturated: true },
  ], "premature saturation at the exact omitted-count maximum must fail");
});
