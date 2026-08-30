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
  validateDecoderQualification,
  validateDiagnosticQualification,
  validateNormalizationQualification,
  validateQualificationCaseManifest,
  validateQualificationLedger,
  validateResourceBoundaryQualification,
} from "../architecture/checks/v1-qualification.mjs";
import {
  boundedDiagnosticSummary,
  chainGraph,
  createBoundedDiagnosticCollector,
  cycleGraph,
  dependencyOrder,
  graphFacts,
  layeredGraph,
  measureResourceFixtures,
  runDiagnosticCollectorCase,
  wideGraph,
} from "./qualification/v1-resource-profile.mjs";

const readJson = async relativePath => JSON.parse(
  await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8"),
);
const execFileAsync = promisify(execFile);
const clone = value => structuredClone(value);

test("canonical vector bytes and digest are independently reproducible", async () => {
  const vectors = await readJson("architecture/contracts/v1/canonical-vectors.json");
  const [vector] = vectors.positive;
  assert.deepEqual(JSON.parse(vector.canonicalUtf8), vector.envelope);
  const digest = createHash("sha256").update(vector.canonicalUtf8, "utf8").digest("hex");
  assert.equal(vector.digest, `gm-plan:v1:sha-256:${digest}`);
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
  const chain = chainGraph(2048);
  const wide = wideGraph(4096);
  const dense = layeredGraph(64, 64);
  const cycle = cycleGraph(4096);

  assert.deepEqual(graphFacts(chain), { nodes: 2048, edges: 2047 });
  assert.deepEqual(graphFacts(wide), { nodes: 4096, edges: 4095 });
  assert.deepEqual(graphFacts(dense), { nodes: 4096, edges: 258048 });
  assert.deepEqual(graphFacts(cycle), { nodes: 4096, edges: 4096 });
  assert.equal(dependencyOrder(chain).acyclic, true);
  assert.equal(dependencyOrder(wide).acyclic, true);
  assert.equal(dependencyOrder(dense).acyclic, true);
  assert.equal(dependencyOrder(cycle).acyclic, false);

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

test("resource qualification CLI emits JSON through a cross-platform entrypoint", async () => {
  const script = fileURLToPath(new URL("./qualification/v1-resource-profile.mjs", import.meta.url));
  const { stdout, stderr } = await execFileAsync(process.execPath, [script]);
  assert.equal(stderr, "");
  const report = JSON.parse(stdout);
  assert.equal(report.chainAtDepthLimit.nodes, 2048);
  assert.equal(report.diagnosticStorm.retained, 255);
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

test("diagnostic refinement and total comparator reject targeted mutations", async () => {
  const schema = await readJson("architecture/contracts/v1/composition.schema.json");
  const catalog = await readJson("architecture/contracts/v1/diagnostic-catalog.json");
  const profile = await readJson("architecture/contracts/v1/resource-profile.json");
  const contract = await readJson("architecture/qualification/v1/diagnostic-contract.json");
  const snapshots = await readJson("architecture/qualification/v1/diagnostic-snapshots.json");
  const { validateDiagnostic } = createSchemaValidators(schema);
  const validate = (value, contractValue = contract) => validateDiagnosticQualification({
    contract: contractValue,
    snapshots: value,
    catalog,
    profile,
    coordinateFields: Object.keys(schema.$defs.diagnostic.properties.coordinate.properties),
    validateDiagnostic,
  });
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

  const reversedAxis = clone(snapshots);
  reversedAxis.orderingCases[0].expected.reverse();
  assert.throws(() => validate(reversedAxis), /expected diagnostic order/u);

  const laterIndexMutation = clone(snapshots);
  laterIndexMutation.orderingCases
    .find(vector => vector.axis === "path.later-index-value")
    .operands[0].override.path[1].value = 12;
  assert.throws(() => validate(laterIndexMutation), /path\.later-index-value/u);

  const invalidRefinementOperand = clone(snapshots);
  invalidRefinementOperand.orderingCases
    .find(vector => vector.axis === "coordinate.moduleId.presence")
    .operands[1].override.coordinate.providerImplementationId = "example/provider/default";
  assert.throws(() => validate(invalidRefinementOperand), /forbidden coordinate/u);

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
  wrongSccOrder.sccOrderingCases[0].expected.reverse();
  assert.throws(() => validate(wrongSccOrder), /SCC-array order/u);

  const overlappingSccs = clone(snapshots);
  overlappingSccs.sccOrderingCases[0].input[1][0] = "example/a/default";
  assert.throws(() => validate(overlappingSccs), /components must be disjoint/u);

  const detailsCase = snapshots.orderingCases
    .find(vector => vector.axis === "details.rfc8785");
  const [leftOperand, rightOperand] = detailsCase.operands;
  assert.ok(Buffer.compare(
    Buffer.from(JSON.stringify(leftOperand.override.details), "utf8"),
    Buffer.from(JSON.stringify(rightOperand.override.details), "utf8"),
  ) > 0, "ordinary JSON serialization must oppose the RFC 8785 witness");
  const snapshotByName = new Map(snapshots.snapshots.map(snapshot => [
    snapshot.name,
    snapshot.diagnostic,
  ]));
  const materialize = operand => ({
    ...structuredClone(snapshotByName.get(operand.snapshot)),
    ...structuredClone(operand.override),
  });
  const comparator = createDiagnosticComparator({ contract, catalog });
  assert.ok(comparator(materialize(leftOperand), materialize(rightOperand)) < 0);
});

test("normalization qualification rejects order and canonical-byte drift", async () => {
  const schema = await readJson("architecture/contracts/v1/composition.schema.json");
  const vectors = await readJson("architecture/qualification/v1/normalization-vectors.json");
  const { validateDocument } = createSchemaValidators(schema);
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
  const { validateDocument, validateDiagnostic } = createSchemaValidators(schema);
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
  });

  assert.doesNotThrow(() => validateBoundaries(boundaries));
  assert.doesNotThrow(() => validateDecoder(decoder));
  assert.doesNotThrow(() => validateManifest(manifest));

  const wrongBoundary = clone(boundaries);
  wrongBoundary.cases[0].over += 1;
  assert.throws(() => validateBoundaries(wrongBoundary), /boundary plus one/u);

  const wrongRetainedId = clone(boundaries);
  wrongRetainedId.diagnosticCollector.expectedRetainedIdSets["first-255"][0]
    = "candidate-999999";
  assert.throws(() => validateBoundaries(wrongRetainedId), /exact retained IDs/u);

  const wrongOmitted = clone(boundaries);
  wrongOmitted.diagnosticCollector.cases
    .find(vector => vector.failureCount === 257).expectedTruncation.omitted = 1;
  assert.throws(() => validateBoundaries(wrongOmitted), /bounded-collector expectation/u);

  const wrongSaturation = clone(boundaries);
  wrongSaturation.diagnosticCollector.cases
    .find(vector => vector.failureCount === 262400).expectedFailureCountSaturated = false;
  assert.throws(() => validateBoundaries(wrongSaturation), /bounded-collector expectation/u);

  const wrongDecoder = clone(decoder);
  wrongDecoder.cases.find(vector => vector.name === "duplicate-object-key")
    .decoderOutcome = "accepted";
  assert.throws(() => validateDecoder(wrongDecoder), /strict-decoder expectation/u);

  const wrongSemanticCode = clone(decoder);
  wrongSemanticCode.cases.find(vector => vector.name === "negative-zero")
    .semanticDiagnosticCode = "schema.unknown-field";
  assert.throws(() => validateDecoder(wrongSemanticCode), /semantic diagnostic expectation/u);

  const unrelatedSchemaFailure = clone(decoder);
  const unrelatedNegativeZero = unrelatedSchemaFailure.cases
    .find(vector => vector.name === "negative-zero");
  unrelatedNegativeZero.source = unrelatedNegativeZero.source
    .replace('"schemaVersion":1', '"schemaVersion":2');
  unrelatedNegativeZero.repairedSource = unrelatedNegativeZero.repairedSource
    .replace('"schemaVersion":1', '"schemaVersion":2');
  assert.throws(() => validateDecoder(unrelatedSchemaFailure), /complete valid V1 document/u);

  const terminalHighSurrogateRepair = clone(decoder);
  const terminalCase = terminalHighSurrogateRepair.cases
    .find(vector => vector.name === "lone-surrogate-escape");
  terminalCase.repair.replacement = "\\ud800\\ud800";
  terminalCase.repairedSource = terminalCase.source.replace(
    "\\ud800",
    terminalCase.repair.replacement,
  );
  assert.throws(() => validateDecoder(terminalHighSurrogateRepair),
    /complete valid V1 document/u);

  const unquotedMalformedUtf8 = clone(decoder);
  unquotedMalformedUtf8.cases.find(vector => vector.name === "invalid-utf8-third-byte")
    .source = "e28228";
  assert.throws(() => validateDecoder(unquotedMalformedUtf8), /otherwise-valid JSON string/u);

  const incompleteValidMultibyteControl = clone(decoder);
  incompleteValidMultibyteControl.cases
    .find(vector => vector.name === "valid-utf8-multibyte-control")
    .source = "22c2a2e282ac22";
  assert.throws(() => validateDecoder(incompleteValidMultibyteControl),
    /two-, three-, and four-byte/u);

  const changedManifestByte = clone(manifest);
  changedManifestByte.decoder.cases[0].sourceBytesSha256
    = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
  assert.throws(() => validateManifest(changedManifestByte), /exact byte binding/u);

  const missingManifestCategory = clone(manifest);
  missingManifestCategory.decoder.categories.pop();
  assert.throws(() => validateManifest(missingManifestCategory), /manifest categories/u);

  const wrongAcceptedSuccessor = clone(manifest);
  wrongAcceptedSuccessor.acceptedCanonicalNegativeSuccessors[1].decoderCase = "negative-zero";
  assert.throws(() => validateManifest(wrongAcceptedSuccessor), /complete repaired successor/u);

  const changedJcsBytes = clone(canonicalization);
  changedJcsBytes.cases[0].canonicalUtf8 += " ";
  assert.throws(() => validateManifest(manifest, decoder, changedJcsBytes),
    /exact byte binding/u);
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
  const { validateDiagnostic } = createSchemaValidators(schema);

  for (const vector of collectorVectors.cases) {
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
    }
  }

  const finalized = createBoundedDiagnosticCollector({
    limit: collectorVectors.limit,
    maximumOmitted: collectorVectors.maximumOmitted,
    compareDiagnostics,
  });
  finalized.finalize();
  assert.throws(() => finalized.add({ id: "late", diagnostic: {} }), /after finalization/u);
});
