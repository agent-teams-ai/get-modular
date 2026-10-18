import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkFlatSource } from "./records.mjs";
import { sourceProfile } from "./profile.mjs";

const session = "src/features/session";
const runner = "src/features/runner";
const sessionContracts = `${session}/composition/session.contracts.ts`;
const runnerContracts = `${runner}/composition/runner.contracts.ts`;

async function withEdits(directory, edits, body) {
  const originals = [];
  try {
    for (const [path, change] of edits) {
      const target = join(directory, path);
      const before = await readFile(target, "utf8");
      originals.push([target, before]);
      if (change === null) await rm(target);
      else await writeFile(target, change(before));
    }
    return await body();
  } finally {
    for (const [path, before] of originals) await writeFile(path, before);
  }
}

function hasProblem(result, code) {
  assert.equal(result.outcome, "rejected", JSON.stringify(result));
  assert.ok(result.problems.some(problem => problem.code === `fixture.source.${code}`), JSON.stringify(result.problems));
}

function hasFms(result, code) {
  assert.equal(result.outcome, "rejected", JSON.stringify(result));
  assert.ok(result.fms.diagnostics.some(problem => problem.code === code), JSON.stringify(result.fms));
}

function hasCms(result, code) {
  assert.equal(result.outcome, "rejected", JSON.stringify(result));
  assert.equal(result.cms.code, "conformance.layout.violation");
  assert.ok(result.cms.report.violations.some(problem => problem.code === code), JSON.stringify(result.cms));
}

/** Real mutations of the materialized P1 tree. The caller supplies public owners and the existing compiler helper. */
export async function runSourceScenarios(directory, tools, compile, rejectInputGroup) {
  const rows = [];
  const check = profile => checkFlatSource(directory, tools, profile);
  const baseline = await check();
  assert.equal(baseline.outcome, "passed", JSON.stringify(baseline));
  assert.equal(baseline.inventory.files.length, 21, "A-01 handwritten semantic inventory");
  assert.equal(baseline.graph.edges.length, 31, "A-01 reviewed semantic edge census");
  assert.deepEqual(baseline.graph.unresolvedRuntimeReferences, []);
  const built = compile();
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  rows.push({ row: "A-01", name: "complete actual tree", observed: baseline });

  async function mutation(row, name, edits, verify, profile) {
    await withEdits(directory, edits, async () => {
      const observed = await check(profile);
      await verify(observed);
      rows.push({ row, name, observed });
    });
  }

  await mutation("A-01", "missing required use case", [[`${runner}/application/use-cases/run-job.ts`, null]], result => {
    hasProblem(result, "missing-required-file");
    hasProblem(result, "unresolved-reference");
    const failed = compile();
    assert.notEqual(failed.status, 0);
    assert.match(`${failed.stdout}\n${failed.stderr}`, /error TS2307:/u);
    assert.match(`${failed.stdout}\n${failed.stderr}`, /run-job\.js/u);
    rows.push({ row: "A-01", name: "missing source compiler diagnostic", observed: failed });
  });

  await mutation("A-02", "public feature edge", [[runnerContracts, source =>
    `${source}\nimport type { SessionPort } from "../../session/contracts/session.js";\nexport interface PublicUse { readonly session: SessionPort }\n`]],
  result => assert.equal(result.outcome, "passed", JSON.stringify(result)));
  await mutation("A-02", "private relative edge", [[runnerContracts, source =>
    `${source}\nimport "../../session/application/use-cases/run-job.js";\n`]], result => hasFms(result, "deep-import"));
  for (const [name, specifier] of [
    ["alias", "@fixture/session-private"], ["workspace", "@fixture/session/application/use-cases/run-job"],
    ["self-package", "fixture-semantic/src/features/session/application/use-cases/run-job.js"],
  ]) {
    await mutation("A-02", `unsupported ${name} reference`, [[runnerContracts, source => `${source}\nimport "${specifier}";\n`]],
      result => hasProblem(result, "unsupported-external"));
  }

  await mutation("A-03", "missing literal target", [[runnerContracts, source => `${source}\nimport "./missing.js";\n`]],
    result => hasProblem(result, "unresolved-reference"));
  await mutation("A-03", "unknown external", [[runnerContracts, source => `${source}\nimport "unknown-fixture-package";\n`]],
    result => hasProblem(result, "unsupported-external"));
  await mutation("A-03", "parse failure", [[runnerContracts, () => "export const = ;\n"]],
    result => hasProblem(result, "parse-failure"));

  for (const [name, source, kind] of [
    ["computed dynamic load", 'const target = "./runner-a.module.js";\nvoid import(target);\n', "dynamic"],
    ["aliased computed loader", 'const target = "./runner-a.module.js";\nconst load = require;\nload(target);\n', "commonjs"],
  ]) {
    await mutation("A-04", name, [[runnerContracts, before => `${before}\n${source}`]], result => {
      hasProblem(result, "unresolved-runtime-reference");
      assert.ok(result.graph.unresolvedRuntimeReferences.some(reference => reference.kind === kind));
    });
  }
  await mutation("A-04", "literal dynamic load outside static subset", [[runnerContracts, source =>
    `${source}\nvoid import("./runner-a.module.js");\n`]], result => hasProblem(result, "unsupported-reference-kind"));

  await mutation("A-05", "direct re-export outside selected subset", [[runnerContracts, source =>
    `${source}\nexport { Session } from "../../session/composition/session.contracts.js";\n`]], result => {
    hasProblem(result, "unsupported-export-form");
    assert.ok(result.graph.edges.some(edge => edge.from === runnerContracts && edge.kind === "export"));
  });
  await mutation("A-05", "import then export outside selected subset", [[runnerContracts, source =>
    `${source}\nimport { Session } from "../../session/composition/session.contracts.js";\nexport { Session };\n`]], result => {
    hasProblem(result, "unsupported-export-form");
    assert.ok(result.graph.edges.some(edge => edge.from === runnerContracts && edge.to === sessionContracts && edge.kind === "static"));
  });

  await mutation("A-06", "application cannot import a composition contract", [[`${session}/application/use-cases/run-job.ts`, source =>
    `${source}\nimport type { SessionCapabilities } from "../../composition/session.contracts.js";\n`]],
  result => hasFms(result, "composition-contract-layer"));
  const withoutModuleComposition = { ...sourceProfile, features: { ...sourceProfile.features, moduleComposition: [] } };
  const unlistedRoot = await check(withoutModuleComposition);
  hasFms(unlistedRoot, "composition-contract-layer");
  rows.push({ row: "A-06", name: "moduleComposition is consumed by kernel", observed: unlistedRoot });
  const { useEdges, ...featureRoles } = sourceProfile.features;
  assert.equal(useEdges.length, 1);
  const observedCycles = { ...sourceProfile, features: featureRoles };
  await mutation("A-06", "type-only use cycle without load cycle", [[sessionContracts, source =>
    `${source}\nimport type { RunnerCapabilities } from "../../runner/composition/runner.contracts.js";\n`]], result => {
    hasFms(result, "feature-cycle");
    assert.ok(!result.fms.diagnostics.some(problem => problem.code === "load-cycle"));
  }, observedCycles);
  await mutation("A-06", "actual runtime file cycle", [
    [sessionContracts, source => `${source}\nimport "../../runner/composition/runner.contracts.js";\n`],
    [runnerContracts, source => `${source}\nimport "../../session/composition/session.contracts.js";\n`],
  ], result => { hasFms(result, "feature-cycle"); hasFms(result, "load-cycle"); }, observedCycles);

  await mutation("A-07", "input declaration loses its value importer", [[`${session}/composition/session.inputs.ts`, source => {
    const original = 'import { identityDeclaration } from "./identity.declaration.js";';
    assert.ok(source.includes(original));
    return source.replace(original, "");
  }]], result => hasCms(result, "orphan-declaration"));
  const group = rejectInputGroup();
  assert.equal(group.status, 0, `${group.stdout}\n${group.stderr}`);
  rows.push({ row: "A-07", name: "real input entry in group rejected by Assembly", observed: group });

  await mutation("A-08", "extra runtime export reaches CMS", [[`${runner}/application/use-cases/run-job.ts`, source =>
    `${source}\nexport const extra = 1;\n`]], result => hasCms(result, "use-case-export"));
  await mutation("A-08", "unknown use-case export cannot establish count", [[`${runner}/application/use-cases/run-job.ts`, source =>
    `${source}\nexport const extra = Object.freeze({});\n`]], result => hasProblem(result, "use-case-exports-incomplete"));

  for (const [name, run, code] of [
    ["missing root", () => tools.observeSourceGraph({ consumerRoot: directory, roots: ["absent-src"] }), "SOURCE_DIRECTORY_UNAVAILABLE"],
    ["4 MiB plus one source", () => withEdits(directory, [[runnerContracts, () => " ".repeat(4 * 1024 * 1024 + 1)]],
      () => check()), "SOURCE_FILE_INVALID"],
  ]) {
    await assert.rejects(run, error => {
      assert.equal(error.problem?.code, code);
      rows.push({ row: "A-08", name, observed: error.problem });
      return true;
    });
  }
  assert.equal((await check()).outcome, "passed", "source restored after all mutations");
  return { kind: "research-selected-flat-source", source: "incomplete", authority: sourceProfile.authority,
    adoption: "unchanged", nested: "not-selected", rows };
}
