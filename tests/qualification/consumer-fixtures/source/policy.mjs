import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { invokeFixtureNode } from "../support/materialize.mjs";
import { sourceInventory } from "./records.mjs";
import { sourceProfile } from "./profile.mjs";

const require = createRequire(import.meta.url);
const configurationPath = "architecture/foundation/source-dependencies.yaml";
const configuration = await readFile(new URL("./source-dependencies.yaml", import.meta.url));

/** Runs the installed public policy owner against the real disposable semantic source. */
export async function checkInstalledSourcePolicy(directory) {
  const manifestPath = require.resolve("@agent-teams/engineering-foundation/package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const bin = manifest.bin?.["agent-teams-foundation"];
  assert.equal(typeof bin, "string", "Foundation must expose its public CLI bin");
  const result = invokeFixtureNode([
    join(dirname(manifestPath), bin), "check", "architecture.source-dependencies",
    "--consumer", directory, "--format", "json",
  ], directory, "P4 installed source policy", 30000);
  assert.ok(result.status === 0 || result.status === 1, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.capabilities.length, 1);
  assert.equal(report.capabilities[0].capabilityId, "architecture.source-dependencies");
  assert.equal(result.status, report.outcome === "passed" ? 0 : 1, JSON.stringify(report));
  return { exit: result.status, report };
}

function rejects(result, suffix) {
  assert.equal(result.exit, 1, JSON.stringify(result));
  assert.equal(result.report.outcome, "violations", JSON.stringify(result.report));
  assert.ok(result.report.capabilities[0].diagnostics.some(item =>
    item.ruleId === `architecture.source-dependencies.${suffix}`), JSON.stringify(result.report));
}

/** Partial P4 enforcement; it does not replace the separately missing admitted FMS/CMS fact chain. */
export async function runInstalledSourcePolicyScenarios(directory, packageOutputs) {
  await mkdir(join(directory, "architecture/foundation"), { recursive: true });
  await writeFile(join(directory, configurationPath), configuration);
  await writeFile(join(directory, "foundation.config.yaml"), [
    "schemaVersion: 1", "project:", "  id: semantic-consumer-fixture", "capabilities:",
    "  architecture.source-dependencies:", `    configPath: ${configurationPath}`, "",
  ].join("\n"));
  await writeFile(join(directory, "pnpm-workspace.yaml"), "packages: []\n");
  await writeFile(join(directory, "package.json"), `${JSON.stringify({
    name: "fixture-semantic", private: true, type: "module",
    dependencies: Object.fromEntries(["assembly", "core", "resources"].map(name =>
      [`@get-modular/${name}`, packageOutputs[name].version])),
  }, null, 2)}\n`);

  const inventory = await sourceInventory(directory, sourceProfile.roots);
  assert.deepEqual(inventory.files, [...sourceProfile.requiredFiles].sort(), "P4 complete actual source inventory");
  const rows = [];
  const baseline = await checkInstalledSourcePolicy(directory);
  assert.equal(baseline.exit, 0, JSON.stringify(baseline));
  rows.push({ row: "A-01", name: "installed flat policy accepts complete actual tree", observed: baseline });

  async function mutation(row, name, path, contents, expected) {
    const target = join(directory, path);
    const original = await readFile(target, "utf8");
    try {
      if (contents === null) await rm(target);
      else await writeFile(target, contents(original));
      const observed = await checkInstalledSourcePolicy(directory);
      if (expected === null) assert.equal(observed.exit, 0, JSON.stringify(observed));
      else rejects(observed, expected);
      rows.push({ row, name, observed });
    } finally {
      await writeFile(target, original);
    }
  }

  const runner = "src/features/runner/composition/runner.contracts.ts";
  const application = "src/features/session/application/use-cases/run-job.ts";
  await mutation("A-01", "missing required use case remains an unresolved target",
    "src/features/runner/application/use-cases/run-job.ts", null, "unresolved-local-import");
  await mutation("A-02", "public sibling surface is permitted", runner,
    source => `${source}\nimport type { SessionPort } from "../../session/contracts/session.js";\nexport interface PublicUse { readonly session: SessionPort }\n`, null);
  await mutation("A-02", "private sibling import is outside the declared edge", runner,
    source => `${source}\nimport "../../session/application/use-cases/run-job.js";\n`, "forbidden-boundary-dependency");
  const privateTarget = join(directory, "src/features/session/contracts/private.ts");
  await writeFile(privateTarget, "export const privateValue = 1;\n");
  try {
    await mutation("A-02", "non-entrypoint target cannot cross a permitted boundary", runner,
      source => `${source}\nimport "../../session/contracts/private.js";\n`, "cross-boundary-local-import-not-entrypoint");
  } finally {
    await rm(privateTarget);
  }
  for (const [name, specifier, expected] of [
    ["alias", "@fixture/session-private", "undeclared-external-dependency"],
    ["workspace", "@fixture/session/application/use-cases/run-job", "undeclared-external-dependency"],
    ["self-package", "fixture-semantic/src/features/session/application/use-cases/run-job.js", "self-package-import-boundary-unresolved"],
  ]) {
    await mutation("A-02", `unsupported ${name} reference`, runner,
      source => `${source}\nimport "${specifier}";\n`, expected);
  }
  await mutation("A-03", "missing literal target", runner,
    source => `${source}\nimport "./missing.js";\n`, "unresolved-local-import");
  await mutation("A-03", "unknown external", runner,
    source => `${source}\nimport "unknown-fixture-package";\n`, "undeclared-external-dependency");
  await mutation("A-03", "parse failure", runner, () => "export const = ;\n", "source-parse-error");
  for (const [name, contents] of [
    ["computed dynamic load", 'const target = "./runner-a.module.js";\nvoid import(target);\n'],
    ["aliased computed loader", 'const target = "./runner-a.module.js";\nconst load = require;\nload(target);\n'],
  ]) {
    await mutation("A-04", name, runner, source => `${source}\n${contents}`, "unresolved-runtime-reference");
  }
  await mutation("A-06", "application cannot import a composition contract", application,
    source => `${source}\nimport type { SessionCapabilities } from "../../composition/session.contracts.js";\n`,
    "forbidden-boundary-dependency");
  await mutation("A-06", "application cannot import Get Modular", application,
    source => `${source}\nimport { group } from "@get-modular/assembly";\n`, "forbidden-package-dependency");
  await mutation("A-06", "application cannot import filesystem IO", application,
    source => `${source}\nimport "node:fs/promises";\n`, "forbidden-builtin-dependency");

  const restored = await checkInstalledSourcePolicy(directory);
  assert.equal(restored.exit, 0, JSON.stringify(restored));
  assert.deepEqual(await sourceInventory(directory, sourceProfile.roots), inventory, "P4 mutation inventory restored");
  const manifestPath = require.resolve("@agent-teams/engineering-foundation/package.json");
  return { kind: "installed-flat-source-policy", source: "incomplete", adoption: "unchanged",
    foundation: { version: JSON.parse(await readFile(manifestPath, "utf8")).version, manifestPath },
    profile: { path: "tests/qualification/consumer-fixtures/source/source-dependencies.yaml",
      digest: `sha256:${createHash("sha256").update(configuration).digest("hex")}` }, inventory, rows };
}
