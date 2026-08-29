import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  createSchemaValidators,
  validateDecoderQualification,
  validateDiagnosticQualification,
  validateNormalizationQualification,
  validateQualificationLedger,
  validateResourceBoundaryQualification,
} from "../architecture/checks/v1-qualification.mjs";
import {
  boundedDiagnosticSummary,
  chainGraph,
  cycleGraph,
  dependencyOrder,
  graphFacts,
  layeredGraph,
  measureResourceFixtures,
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

test("diagnostic refinement rejects phase, path, and detail drift", async () => {
  const schema = await readJson("architecture/contracts/v1/composition.schema.json");
  const catalog = await readJson("architecture/contracts/v1/diagnostic-catalog.json");
  const profile = await readJson("architecture/contracts/v1/resource-profile.json");
  const contract = await readJson("architecture/qualification/v1/diagnostic-contract.json");
  const snapshots = await readJson("architecture/qualification/v1/diagnostic-snapshots.json");
  const { validateDiagnostic } = createSchemaValidators(schema);
  const validate = value => validateDiagnosticQualification({
    contract,
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
  const profile = await readJson("architecture/contracts/v1/resource-profile.json");
  const contract = await readJson("architecture/qualification/v1/diagnostic-contract.json");
  const boundaries = await readJson(
    "architecture/qualification/v1/resource-boundary-vectors.json",
  );
  const decoder = await readJson("architecture/qualification/v1/decoder-vectors.json");
  assert.doesNotThrow(() => validateResourceBoundaryQualification({
    vectors: boundaries,
    profile,
    contract,
  }));
  assert.doesNotThrow(() => validateDecoderQualification(decoder, {
    maxDepth: profile.limits.jsonDepth,
  }));

  const wrongBoundary = clone(boundaries);
  wrongBoundary.cases[0].over += 1;
  assert.throws(() => validateResourceBoundaryQualification({
    vectors: wrongBoundary,
    profile,
    contract,
  }), /boundary plus one/u);

  const wrongDecoder = clone(decoder);
  wrongDecoder.cases.find(vector => vector.name === "duplicate-object-key")
    .decoderOutcome = "accepted";
  assert.throws(() => validateDecoderQualification(wrongDecoder, {
    maxDepth: profile.limits.jsonDepth,
  }), /strict-decoder expectation/u);
});
