import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { parse, stringify } from "yaml";

interface Step {
  readonly id: string;
  readonly script: string;
  readonly paths: readonly string[];
  readonly outcome: "passed" | "violations";
  readonly output: string;
}

interface ChangedReport {
  readonly reportSchemaVersion: 1;
  readonly outcome: "passed" | "violations";
  readonly coverage: "changed" | "fast-full";
  readonly changedPaths: readonly string[];
  readonly steps: readonly Step[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOutcome(value: unknown): value is Step["outcome"] {
  return value === "passed" || value === "violations";
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isStep(value: unknown): value is Step {
  return isRecord(value) && typeof value.id === "string" &&
    typeof value.script === "string" && isStrings(value.paths) &&
    isOutcome(value.outcome) && typeof value.output === "string";
}

function isReport(value: unknown): value is ChangedReport {
  return isRecord(value) && value.reportSchemaVersion === 1 &&
    isOutcome(value.outcome) && (value.coverage === "changed" || value.coverage === "fast-full") &&
    isStrings(value.changedPaths) && Array.isArray(value.steps) && value.steps.every(isStep);
}

const require = createRequire(import.meta.url);
const foundationPath = require.resolve("@agent-teams/engineering-foundation/package.json");
const foundation: unknown = JSON.parse(await readFile(foundationPath, "utf8"));
assert.ok(isRecord(foundation) && foundation.version === "2.1.1" && isRecord(foundation.bin));
const cliBin = foundation.bin["agent-teams-foundation"];
assert.ok(typeof cliBin === "string");
const cli = join(dirname(foundationPath), cliBin);
const compiler = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
const nodeExecutable = await realpath(process.execPath);
assert.equal(process.versions.bun, undefined, "workflow fixture controller must execute in Node");
const bunProbe = spawnSync("bun", ["--print", "JSON.stringify({execPath:process.execPath,version:process.versions.bun})"],
  { encoding: "utf8", timeout: 10_000, shell: false });
assert.equal(bunProbe.error, undefined);
assert.equal(bunProbe.status, 0, bunProbe.stderr);
const bunIdentity: unknown = JSON.parse(bunProbe.stdout);
assert.ok(isRecord(bunIdentity) && bunIdentity.version === "1.4.3" && typeof bunIdentity.execPath === "string");
const bunExecutable = await realpath(bunIdentity.execPath);
const pnpmPath = require.resolve("pnpm");
const pnpm: unknown = JSON.parse(await readFile(pnpmPath, "utf8"));
assert.ok(isRecord(pnpm) && pnpm.name === "pnpm" && pnpm.version === "11.20.0" && isRecord(pnpm.bin));
const pnpmBin = pnpm.bin.pnpm;
assert.ok(typeof pnpmBin === "string");
const pnpmEntrypoint = await realpath(join(dirname(pnpmPath), pnpmBin));
const pnpmProbe = spawnSync(nodeExecutable, [pnpmEntrypoint, "--pm-on-fail=ignore", "--version"],
  { encoding: "utf8", timeout: 10_000, shell: false });
assert.equal(pnpmProbe.error, undefined);
assert.equal(pnpmProbe.status, 0, pnpmProbe.stderr);
assert.equal(pnpmProbe.stdout.trim(), "11.20.0");
const currentPolicy: unknown = parse(
  await readFile(new URL("../architecture/foundation/repository-agent-workflow.yaml", import.meta.url), "utf8"),
);
assert.ok(isRecord(currentPolicy));
const coreMetadataPaths = [
  "packages/core/package.json", "packages/core/tsconfig.json",
  "packages/core/tsconfig.seed.json", "packages/core/tsconfig.stage0.json",
  "packages/core/tsconfig.test.json", "packages/core/tsconfig.typecheck.json",
] as const;
const historicalPolicy = {
  ...currentPolicy,
  changedChecks: [{ id: "docs", script: "docs:changed", extensions: [".md", ".yaml", ".yml"], passPaths: false }],
};
const validSource = 'export const answer: string = "42";\n';
const invalidSource = "export const answer: string = 42;\n";
const identity = {
  // Do not let inherited Git overrides route a TEST operation to another tree.
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  AGENT_TEAMS_FOUNDATION_NODE_EXECUTABLE: nodeExecutable,
  AGENT_TEAMS_FOUNDATION_BUN_EXECUTABLE: bunExecutable,
  AGENT_TEAMS_FOUNDATION_PNPM_ENTRYPOINT: pnpmEntrypoint,
  GET_MODULAR_TEST_COMPILER: compiler,
  GIT_AUTHOR_NAME: "iliya",
  GIT_AUTHOR_EMAIL: "iliyazelenkog@gmail.com",
  GIT_COMMITTER_NAME: "iliya",
  GIT_COMMITTER_EMAIL: "iliyazelenkog@gmail.com",
};

function git(root: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, env: identity, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout.trim();
}

async function put(root: string, path: string, contents: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents);
}

async function fixture(
  policy: Record<string, unknown>,
  body: (root: string) => Promise<void>,
  source = validSource,
): Promise<void> {
  // TMPDIR is supplied by the caller's disposable TEST job on verified scratch.
  const root = await realpath(await mkdtemp(join(tmpdir(), "gm-changed-workflow-TEST-")));
  const manager = policy.packageManager === "bun" ? "bun" : "pnpm";
  try {
    const files: Record<string, string> = {
      "package.json": JSON.stringify({
        name: "get-modular-changed-workflow-test", private: true, type: "module",
        packageManager: manager === "bun" ? "bun@1.4.3" : "pnpm@11.20.0",
        scripts: { "check:changed": "node check-fast.ts", "check:fast": "node check-fast.ts",
          check: "node check-fast.ts", "docs:changed": "node docs-check.ts" },
      }),
      ".gitignore": "node_modules/\n",
      "AGENTS.md": `# TEST workflow\nUse ${manager} run check:changed, ${manager} run check:fast and ${manager} run check.\n`,
      "CLAUDE.md": "@AGENTS.md\n",
      "GEMINI.md": "@AGENTS.md\n",
      ".github/copilot-instructions.md": "Read and follow ../AGENTS.md.\n",
      "foundation.config.yaml": stringify({ schemaVersion: 2, project: { id: "changed-workflow-test" },
        capabilities: { "repository.agent-workflow": { configPath: "architecture/foundation/repository-agent-workflow.yaml" } } }),
      "architecture/foundation/repository-agent-workflow.yaml": stringify(policy),
      "tsconfig.base.json": JSON.stringify({ compilerOptions: {
        target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, types: [],
      }, files: ["src/index.ts"] }),
      "src/index.ts": source,
      "README.md": "# Disposable workflow test\n",
    };
    for (const [path, contents] of Object.entries(files)) await put(root, path, contents);
    for (const name of ["check-fast.ts", "docs-check.ts"]) {
      await copyFile(new URL(`./fixtures/repository-agent-workflow/${name}`, import.meta.url), join(root, name));
    }
    // Prime the selected real manager before the baseline commit. Run the existing,
    // valid docs script once now so that genuine lock lives in the baseline commit instead
    // of appearing as a changed path (and a fast-full escalation) in the first measured run.
    const primed = spawnSync(manager, ["run", "docs:changed"], {
      cwd: root, env: identity, encoding: "utf8", timeout: 60_000,
      shell: process.platform === "win32",
    });
    assert.equal(primed.error, undefined, primed.stderr);
    assert.equal(primed.signal, null, primed.stderr);
    assert.equal(primed.status, 0, primed.stdout + primed.stderr);
    git(root, "init", "--initial-branch=main");
    assert.equal(await realpath(git(root, "rev-parse", "--show-toplevel")), root);
    for (const variable of ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"]) {
      assert.match(git(root, "var", variable), /^iliya <iliyazelenkog@gmail\.com> /u);
    }
    git(root, "add", "--all");
    git(root, "commit", "--message", "test: initialize disposable workflow fixture");
    await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function changed(root: string): { readonly exit: number | null; readonly report: ChangedReport } {
  const preflight = spawnSync(process.execPath, [join(import.meta.dirname, "../architecture/checks/compiler-floor.ts")],
    { encoding: "utf8", timeout: 10_000 });
  assert.equal(preflight.error, undefined, preflight.stderr);
  assert.equal(preflight.status, 0, preflight.stderr);
  const result = spawnSync(process.execPath, [
    cli, "agent-workflow", "changed", "--consumer", root,
    "--base", "refs/heads/main", "--format", "json",
  ], { env: identity, encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000 });
  assert.equal(result.error, undefined, result.stderr);
  const report: unknown = JSON.parse(result.stdout);
  assert.ok(isReport(report), result.stdout || result.stderr);
  return { exit: result.status, report };
}

function codeStep(report: ChangedReport): Step {
  const step = report.steps.find(candidate => candidate.script === "check:fast");
  assert.ok(step, JSON.stringify(report));
  assert.deepEqual(step.paths, [], "compiler must retain project context");
  return step;
}

test("full-scan roots retain Core metadata coverage within the published schema bound", async () => {
  const schema: unknown = JSON.parse(await readFile(
    join(dirname(foundationPath), "schemas/repository-agent-workflow/v2.schema.json"), "utf8",
  ));
  assert.ok(isRecord(schema) && isRecord(schema.properties) && isRecord(schema.properties.fullScanPaths));
  const maximum = schema.properties.fullScanPaths.maxItems;
  assert.ok(typeof maximum === "number");
  assert.equal(maximum, 64);
  const paths = currentPolicy.fullScanPaths;
  assert.ok(isStrings(paths));
  assert.equal(paths.length, 64);
  assert.ok(paths.length <= maximum);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.includes("packages/core"));
  for (const path of coreMetadataPaths) {
    assert.ok(paths.some(prefix => path === prefix || path.startsWith(`${prefix}/`)), path);
  }
});

test("changed workflow rejects invalid TypeScript through published Foundation", async () => {
  // The real compiler control makes a vacuous fixture or recording stub fail.
  await fixture(historicalPolicy, async root => {
    await put(root, "src/index.ts", invalidSource);
    const control = spawnSync(process.execPath, [compiler, "-p", "tsconfig.base.json", "--noEmit"],
      { cwd: root, encoding: "utf8", timeout: 30_000 });
    assert.equal(control.status, 1, control.stderr);
    assert.match(control.stdout, /TS2322/u);
    const old = changed(root);
    assert.equal(old.exit, 0);
    assert.equal(old.report.outcome, "passed");
    assert.deepEqual(old.report.steps, []);
  });
  await fixture(currentPolicy, async root => {
    await put(root, "src/index.ts", invalidSource);
    const rejected = changed(root);
    assert.equal(rejected.exit, 1, JSON.stringify(rejected.report));
    assert.equal(rejected.report.outcome, "violations");
    assert.deepEqual(rejected.report.changedPaths, ["src/index.ts"]);
    assert.equal(codeStep(rejected.report).outcome, "violations");
    assert.match(codeStep(rejected.report).output, /TS2322/u);
    await put(root, "README.md", "# Mixed docs and invalid code\n");
    const mixed = changed(root);
    assert.equal(mixed.exit, 1, JSON.stringify(mixed.report));
    assert.ok(mixed.report.steps.some(step => step.script === "docs:changed"));
    assert.equal(codeStep(mixed.report).outcome, "violations");
    await put(root, "src/index.ts", 'export const answer: string = "valid change";\n');
    const corrected = changed(root);
    assert.equal(corrected.exit, 0, JSON.stringify(corrected.report));
    assert.equal(codeStep(corrected.report).outcome, "passed");
  });
  await fixture(currentPolicy, async root => {
    await put(root, "README.md", "# Docs only\n");
    const docs = changed(root);
    assert.equal(docs.exit, 0, JSON.stringify(docs.report));
    assert.deepEqual(docs.report.steps.map(step => step.script), ["docs:changed"]);
  }, invalidSource);
});

test("changed workflow escalates compiler and check configuration", async () => {
  // Every full-scan trigger, including non-code Core files, must expose an existing project error.
  for (const path of [
    "tsconfig.base.json", ...coreMetadataPaths,
    "packages/core/README.md",
    "packages/assembly/tsconfig.json", "packages/lifecycle-kernel/tsconfig.json",
    "packages/resources/tsconfig.json", "packages/conformance/tsconfig.json",
    "tests/tsconfig.tooling-node-policy.json", ".oxlintrc.json", ".npmrc",
    "tests/qualification/consumer-fixtures/semantic/tsconfig.types.json",
    "tests/qualification/consumer-fixtures/semantic/tsconfig.runtime.json",
    "tests/qualification/consumer-fixtures/semantic/tsconfig.negative.json",
    "tests/qualification/consumer-fixtures/recovery/tsconfig.runtime.json",
    "tests/tsconfig.consumer-fixtures.json",
    "tests/qualification/consumer-fixtures/source/source-dependencies.yaml",
    "architecture/checks/native-public-api-migration-admission.ts",
  ]) {
    await fixture(currentPolicy, async root => {
      if (path === "tsconfig.base.json") {
        await put(root, path, JSON.stringify({ compilerOptions: { strict: true, types: [] },
          files: ["src/index.ts"] }));
      } else {
        await put(root, path, path === ".npmrc" ? "ignore-scripts=true\n" : "{}\n");
      }
      const result = changed(root);
      assert.equal(result.exit, 1, `${path}: ${JSON.stringify(result.report)}`);
      assert.equal(result.report.coverage, "fast-full", path);
      assert.equal(codeStep(result.report).outcome, "violations", path);
      assert.match(codeStep(result.report).output, /TS2322/u);
    }, invalidSource);
  }
});

interface CheckChangedCustody {
  readonly classification: "frozen-closure" | "cooperating-exclusive" | "mutable";
  readonly binding: "qualified-host-precondition" | "unverified";
}

interface CheckChangedReport {
  readonly reportSchemaVersion: 2;
  readonly outcome: "passed" | "feedback-only" | "not-checked" | "uncovered" | "failed" | "cancelled" | "stale";
  readonly reason: string;
  readonly inputCustody: CheckChangedCustody;
  readonly plannedChecks: readonly { readonly id: string; readonly target: string; readonly reason: string }[];
  readonly steps: readonly { readonly id: string; readonly script: string; readonly exitCode: number | null; readonly qualifiedFacets: readonly string[] }[];
  readonly coverage: readonly { readonly path: string; readonly facet: string | null; readonly state: string; readonly checkIds: readonly string[] }[];
}

function isCheckChangedCustody(value: unknown): value is CheckChangedCustody {
  return isRecord(value) &&
    (value.classification === "frozen-closure" || value.classification === "cooperating-exclusive" || value.classification === "mutable") &&
    (value.binding === "qualified-host-precondition" || value.binding === "unverified");
}

function isCheckChangedReport(value: unknown): value is CheckChangedReport {
  return isRecord(value) && value.reportSchemaVersion === 2 &&
    (value.outcome === "passed" || value.outcome === "feedback-only" || value.outcome === "not-checked" ||
      value.outcome === "uncovered" || value.outcome === "failed" || value.outcome === "cancelled" || value.outcome === "stale") &&
    typeof value.reason === "string" && isCheckChangedCustody(value.inputCustody) &&
    Array.isArray(value.plannedChecks) && Array.isArray(value.steps) && Array.isArray(value.coverage);
}

function checkChanged(root: string): { readonly exit: number | null; readonly report: CheckChangedReport } {
  const result = spawnSync(process.execPath, [
    cli, "agent-workflow", "check-changed", "--consumer", root,
    "--base", "refs/heads/main", "--format", "json",
  ], { env: identity, encoding: "utf8", timeout: 120_000, maxBuffer: 2_000_000 });
  assert.equal(result.error, undefined, result.stderr);
  const report: unknown = JSON.parse(result.stdout);
  assert.ok(isCheckChangedReport(report), result.stdout || result.stderr);
  return { exit: result.status, report };
}

test("check-changed reports v2 repository coverage with unverified mutable custody", async () => {
  await fixture(currentPolicy, async root => {
    await put(root, "src/index.ts", 'export const answer: string = "43";\n');
    git(root, "checkout", "-b", "test-change");
    git(root, "add", "--all");
    git(root, "commit", "--message", "test: change source");
    const { exit, report } = checkChanged(root);
    assert.equal(exit, 0, JSON.stringify(report));
    assert.equal(report.reportSchemaVersion, 2);
    assert.equal(report.outcome, "feedback-only", report.reason);
    assert.equal(report.reason, "mutable-input-binding-unverified");
    assert.equal(report.inputCustody.classification, "mutable");
    assert.equal(report.inputCustody.binding, "unverified");
    assert.deepEqual(report.plannedChecks.map(entry => entry.id), ["repository"]);
    assert.ok(report.steps.some(step => step.script === "check" && step.exitCode === 0), JSON.stringify(report.steps));
    const row = report.coverage.find(candidate => candidate.path === "src/index.ts");
    assert.ok(row, JSON.stringify(report.coverage));
    assert.deepEqual(row.checkIds, ["repository"]);
    for (const step of report.steps) assert.deepEqual(step.qualifiedFacets, []);
    assert.ok(report.coverage.every(candidate => candidate.state !== "checked"), JSON.stringify(report.coverage));
  });
});

test("check-changed rejects v1 and legacy v2 policies before executing checks", async () => {
  for (const schemaVersion of [1, 2]) {
    const legacy: Record<string, unknown> = {
      schemaVersion,
      ...(schemaVersion === 2 ? { packageManager: currentPolicy.packageManager } : {}),
      instructions: currentPolicy.instructions,
      scripts: currentPolicy.scripts,
      changedChecks: [{ id: "docs", script: "docs:changed", extensions: [".md", ".yaml", ".yml"], passPaths: false }],
      fullScanPaths: ["package.json"],
    };
    await fixture(legacy, async root => {
      const marker = join(root, "check-executed");
      await put(root, "check-fast.ts",
        'import { writeFileSync } from "node:fs";\nwriteFileSync("check-executed", "executed");\n');
      await put(root, "src/index.ts", 'export const answer: string = "43";\n');
      git(root, "checkout", "-b", "test-change");
      git(root, "add", "--all");
      git(root, "commit", "--message", "test: change source");
      const result = spawnSync(process.execPath, [
        cli, "agent-workflow", "check-changed", "--consumer", root,
        "--base", "refs/heads/main", "--format", "json",
      ], { env: identity, encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000 });
      assert.equal(result.error, undefined, result.stderr);
      assert.notEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, schemaVersion === 1
        ? /check-changed requires repository-agent-workflow\/v2/u
        : /check-changed requires explicit repository scopes, requiredFacets, supplies and observations/u);
      await assert.rejects(readFile(marker), { code: "ENOENT" });
    });
  }
});
