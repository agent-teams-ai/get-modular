import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
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
assert.ok(isRecord(foundation) && foundation.version === "1.7.2" && isRecord(foundation.bin));
const cliBin = foundation.bin["agent-teams-foundation"];
assert.ok(typeof cliBin === "string");
const cli = join(dirname(foundationPath), cliBin);
const compiler = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
const currentPolicy: unknown = parse(
  await readFile(new URL("../architecture/foundation/repository-agent-workflow.yaml", import.meta.url), "utf8"),
);
assert.ok(isRecord(currentPolicy));
const historicalPolicy = {
  ...currentPolicy,
  changedChecks: [{ id: "docs", script: "docs:changed", extensions: [".md", ".yaml", ".yml"], passPaths: false }],
};
const validSource = 'export const answer: string = "42";\n';
const invalidSource = "export const answer: string = 42;\n";
const identity = {
  // Do not let inherited Git overrides route a TEST operation to another tree.
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
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
  try {
    const files: Record<string, string> = {
      "package.json": JSON.stringify({
        name: "get-modular-changed-workflow-test", private: true, type: "module",
        scripts: { "check:changed": "node check-fast.mts", "check:fast": "node check-fast.mts",
          check: "node check-fast.mts", "docs:changed": "node docs-check.mts" },
      }),
      ".gitignore": "node_modules/\n",
      "AGENTS.md": "# TEST workflow\nUse pnpm check:changed, pnpm check:fast and pnpm check.\n",
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
      // Real project-aware compiler, with no changed path arguments or shell quoting.
      "check-fast.mts": [
        'import assert from "node:assert/strict";',
        'import { spawnSync } from "node:child_process";',
        "assert.equal(process.argv.length, 2, 'check:fast must not receive changed paths');",
        `const result = spawnSync(process.execPath, [${JSON.stringify(compiler)}, "-p", "tsconfig.base.json", "--noEmit"], { stdio: "inherit" });`,
        "if (result.error) throw result.error;",
        "process.exitCode = result.status ?? 1;",
      ].join("\n"),
      "docs-check.mts": [
        'import assert from "node:assert/strict";',
        'import { readFile } from "node:fs/promises";',
        'assert.match(await readFile("README.md", "utf8"), /^# /u);',
      ].join("\n"),
    };
    for (const [path, contents] of Object.entries(files)) await put(root, path, contents);
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
  // An existing project error must be exposed after a config-only edit.
  for (const path of [
    "tsconfig.base.json", "packages/core/tsconfig.typecheck.json",
    "packages/core/package.json",
    "packages/assembly/tsconfig.json", "packages/lifecycle-kernel/tsconfig.json",
    "packages/resources/tsconfig.json", "packages/conformance/tsconfig.json",
    "tests/tsconfig.tooling-node-policy.json", ".oxlintrc.json", ".npmrc",
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
