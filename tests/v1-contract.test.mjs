import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
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

  const storm = boundedDiagnosticSummary(65536, 256);
  assert.equal(storm.retained.length, 255);
  assert.deepEqual(storm.truncation, { omitted: 65281 });
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
