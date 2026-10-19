import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  copyReadyPackages, fixtureCompiler, invokeFixtureNode, withSemanticConsumer,
} from "../support/materialize.mjs";

// The caller supplies an isolated package with exact research-tool tarballs
// already installed. No network install, local link or GM pin change occurs here.
export async function runPackedSourceResearch(toolConsumer) {
  const toolsRoot = resolve(toolConsumer);
  const packageOutputs = await copyReadyPackages(toolsRoot);
  const compiler = await fixtureCompiler("typescript");
  const scenarios = new URL("./scenarios.mjs", import.meta.url).href;
  const helper = new URL("../support/materialize.mjs", import.meta.url).href;
  const program = join(toolsRoot, "source-probe.mjs");
  await writeFile(program, `
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { observeSourceGraph } from "@agent-teams/engineering-foundation/source-graph";
import { checkFeatureModule, STANDARD } from "@agent-teams/feature-module-standard";
import { checkModuleLayout } from "@get-modular/conformance";
import { runSourceScenarios } from ${JSON.stringify(scenarios)};
import { invokeFixtureNode } from ${JSON.stringify(helper)};
const directory = process.argv[2];
const compiler = process.argv[3];
const compile = () => invokeFixtureNode([compiler, "--project", "tsconfig.runtime.json", "--pretty", "false"], directory, "P4 compile");
const groupFile = join(directory, "source-input-group.mjs");
await writeFile(groupFile, 'import assert from "node:assert/strict";\\nimport { group } from "@get-modular/assembly";\\nimport { identityInput } from "./out/src/features/session/composition/session.inputs.js";\\nassert.throws(() => group("invalid-input-group", [identityInput]), { code: "assembly.bind.invalid-group" });\\nconsole.log("assembly.bind.invalid-group");\\n');
const inputGroup = () => invokeFixtureNode([groupFile], directory, "A-07 input in group");
const report = await runSourceScenarios(directory, { observeSourceGraph, checkFeatureModule, standard: STANDARD, checkModuleLayout }, compile, inputGroup);
report.publicTools = {
  foundation: import.meta.resolve("@agent-teams/engineering-foundation/source-graph"),
  fms: import.meta.resolve("@agent-teams/feature-module-standard"),
  cms: import.meta.resolve("@get-modular/conformance"),
};
assert.equal(report.rows.length > 0, true);
console.log(JSON.stringify(report));
`);
  return withSemanticConsumer(async ({ directory, evidence }) => {
    const result = invokeFixtureNode([program, directory, compiler.cli], toolsRoot, "P4 packed research", 60000);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return { kind: "research-selected-flat-source", source: "incomplete", ...JSON.parse(result.stdout),
      compiler: { name: compiler.name, version: compiler.version },
      toolsLock: await readFile(join(toolsRoot, "pnpm-lock.yaml"), "utf8"), packageOutputs, ...evidence };
  });
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  assert.ok(process.argv[2], `Usage: node ${fileURLToPath(import.meta.url)} <installed-research-consumer> <report.json>`);
  assert.ok(process.argv[3], "A report path is required");
  const report = await runPackedSourceResearch(process.argv[2]);
  await writeFile(process.argv[3], `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ kind: report.kind, source: report.source, cases: report.rows.length, report: process.argv[3] }));
}
