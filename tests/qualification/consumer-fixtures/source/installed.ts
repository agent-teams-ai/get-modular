import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { checkModuleLayout } from "@get-modular/conformance";
import { fixtureCompiler, invokeFixtureNode, treeIdentity } from "../support/materialize.mjs";
import { runSourceScenarios } from "./scenarios.mjs";

const require = createRequire(import.meta.url);
type ToolName = "@agent-teams/engineering-foundation" | "@agent-teams/feature-module-standard";
const workspaceManifest = JSON.parse(await readFile(new URL("../../../../package.json", import.meta.url), "utf8")) as {
  readonly devDependencies: Readonly<Record<ToolName, string>>;
};

async function installedTool(name: ToolName, entry: string) {
  const manifestPath = require.resolve(`${name}/package.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { readonly name: unknown; readonly version: unknown };
  const expectedVersion = workspaceManifest.devDependencies[name];
  assert.match(expectedVersion, /^\d+\.\d+\.\d+$/u, `${name}: exact supported development pin`);
  assert.equal(manifest.name, name);
  assert.equal(manifest.version, expectedVersion, `${name}: installed version matches the committed pin`);
  return { name, version: manifest.version, entry, resolution: import.meta.resolve(entry),
    package: await treeIdentity(dirname(manifestPath)) };
}

/** The ordinary P4 route uses released public tools and the existing real-file A scenarios. */
export async function runInstalledSourceScenarios(directory: string) {
  const [foundation, fms] = await Promise.all([
    installedTool("@agent-teams/engineering-foundation", "@agent-teams/engineering-foundation/source-graph"),
    installedTool("@agent-teams/feature-module-standard", "@agent-teams/feature-module-standard"),
  ]);
  const { observeSourceGraph } = await import("@agent-teams/engineering-foundation/source-graph");
  const { checkFeatureModule, STANDARD } = await import("@agent-teams/feature-module-standard");
  const compiler = await fixtureCompiler("typescript") as { readonly name: string; readonly version: unknown; readonly cli: string };
  const compile = () => invokeFixtureNode([
    compiler.cli, "--project", "tsconfig.runtime.json", "--pretty", "false",
  ], directory, "A-01 installed source compile");
  const groupFile = join(directory, "source-input-group.mjs");
  await writeFile(groupFile, [
    'import assert from "node:assert/strict";',
    'import { group } from "@get-modular/assembly";',
    'import { identityInput } from "./out/src/features/session/composition/session.inputs.js";',
    'assert.throws(() => group("invalid-input-group", [identityInput]), { code: "assembly.bind.invalid-group" });',
    'console.log("assembly.bind.invalid-group");', "",
  ].join("\n"));
  const rejectInputGroup = () => invokeFixtureNode([groupFile], directory, "A-07 input in group");
  const observed = await runSourceScenarios(directory, {
    observeSourceGraph, checkFeatureModule, standard: STANDARD, checkModuleLayout,
  }, compile, rejectInputGroup) as {
    readonly authority: unknown; readonly adoption: unknown; readonly nested: unknown; readonly rows: readonly unknown[];
  };
  assert.equal(observed.rows.length, 26, "all selected A-01 through A-08 observations execute");
  return { kind: "installed-selected-flat-source", source: "passed", ...observed,
    compiler: { name: compiler.name, version: compiler.version },
    publicTools: { foundation, fms, cms: { entry: "@get-modular/conformance",
      resolution: import.meta.resolve("@get-modular/conformance") } } };
}
