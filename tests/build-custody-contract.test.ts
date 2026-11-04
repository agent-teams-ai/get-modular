import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { parse, stringify } from "yaml";

function record(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value));
  return Object.fromEntries(Object.entries(value));
}

function records(value: unknown): Record<string, unknown>[] {
  assert(Array.isArray(value));
  return value.map(record);
}

function strings(value: unknown): string[] {
  assert(Array.isArray(value) && value.every(item => typeof item === "string"));
  return value;
}

const repository = new URL("../", import.meta.url);
const witness = "tests/qualification/support/construction-witness.ts";
const consumer = "packages/core/tests/qualification/construction-witness.test.ts";
const production = "packages/core/src/features/canonicalization/owned-jcs/factory.ts";
const policyPath = "architecture/foundation/source-dependencies.yaml";

test("construction witness is an exact development entrypoint and remains forbidden in production", async t => {
  const directory = await mkdtemp(join(tmpdir(), "gm-witness-boundary-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const policy = record(parse(await readFile(new URL(policyPath, repository), "utf8")));
  const subjects = new Map([
    ["repository.development", witness],
    ["core-development", consumer],
    ["core-canonicalization-owned-jcs", production],
  ]);
  const boundaries = records(policy.boundaries)
    .filter(boundary => typeof boundary.id === "string" && subjects.has(boundary.id))
    .map(boundary => {
      assert.equal(typeof boundary.id, "string");
      const id = String(boundary.id);
      const path = subjects.get(id);
      assert(path);
      const allow = record(boundary.allow);
      // Preserve the actual entrypoint and dependency decisions. Only the
      // disposable fixture's physical source inventory is reduced.
      return {
        ...boundary,
        roots: [path],
        entrypoints: strings(boundary.entrypoints).filter(entry => entry === path),
        allow: { ...allow, boundaries: strings(allow.boundaries).filter(target => subjects.has(target)) },
      };
    });
  assert.equal(boundaries.length, 3);
  const configuration = {
    ...policy, packageRoots: ["packages/core"], rootPackage: true,
    governedRoots: [witness, consumer, production].map(path => dirname(path)), boundaries,
  };
  const files = new Map([
    ["package.json", JSON.stringify({ name: "@get-modular/repository", private: true, type: "module" })],
    ["packages/core/package.json", await readFile(new URL("packages/core/package.json", repository), "utf8")],
    ["pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n'],
    ["foundation.config.yaml", stringify({ schemaVersion: 1, project: { id: "witness-boundary" },
      capabilities: { "architecture.source-dependencies": { configPath: policyPath } } })],
    [policyPath, stringify(configuration)],
    [witness, "export const proof = true;\n"],
    [consumer, 'import { proof } from "../../../../tests/qualification/support/construction-witness.ts"; export const checked = proof;\n'],
    [production, "export const factory = true;\n"],
  ]);
  for (const [path, contents] of files) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), contents);
  }
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("@agent-teams/engineering-foundation/package.json");
  const manifest = record(JSON.parse(await readFile(manifestPath, "utf8")));
  const bin = record(manifest.bin)["agent-teams-foundation"];
  assert.equal(typeof bin, "string");
  const command = join(dirname(manifestPath), String(bin));
  const check = () => {
    const result = spawnSync(process.execPath, [command, "check", "architecture.source-dependencies",
      "--consumer", directory, "--format", "json"], { encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000 });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return { status: result.status, report: record(JSON.parse(result.stdout)) };
  };
  const admitted = check();
  assert.equal(admitted.status, 0, JSON.stringify(admitted.report));
  assert.equal(admitted.report.outcome, "passed", JSON.stringify(admitted.report));
  await writeFile(join(directory, production),
    'import { proof } from "../../../../../../tests/qualification/support/construction-witness.ts"; export const factory = proof;\n');
  const rejected = check();
  assert.notEqual(rejected.status, 0);
  assert.equal(rejected.report.outcome, "violations", JSON.stringify(rejected.report));
  const diagnostics = records(rejected.report.capabilities).flatMap(capability => records(capability.diagnostics));
  assert(diagnostics.some(diagnostic => diagnostic.ruleId === "architecture.source-dependencies.cross-package-relative-import"),
    JSON.stringify(rejected.report));
});

test("migrated build qualification tests retain strict checking and normal test selection", async () => {
  const project = record(JSON.parse(await readFile(new URL("tests/tsconfig.native-tooling.json", repository), "utf8")));
  const files = strings(project.files);
  const manifest = record(JSON.parse(await readFile(new URL("package.json", repository), "utf8")));
  const scripts = record(manifest.scripts);
  assert.equal(scripts["core:test"], 'node --test "packages/core/tests/**/*.test.mjs" "packages/core/tests/**/*.test.ts"');
  for (const path of [consumer, "packages/core/tests/qualification/production-generation.test.ts",
    "packages/core/tests/package/build-closure.test.ts"]) {
    assert(files.includes(`../${path}`), path);
    await readFile(new URL(path, repository));
  }
  const governance = scripts["governance:test"];
  assert.equal(typeof governance, "string");
  for (const name of ["generated-production-source.test.ts", "tracked-file-custody.test.ts", "build-custody-contract.test.ts"]) {
    assert(files.includes(name), name);
    assert(String(governance).split(" ").includes(`tests/${name}`), name);
  }
});
