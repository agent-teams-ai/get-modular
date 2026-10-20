import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { assertM3NodePin, m3NodePinPath } from "./qualification/support/m3-node-policy.ts";
import { BUN_VERSION, PNPM_VERSION, project, selectedProfile, toolRuntime } from "../architecture/tooling/runtime/policy.ts";

const repository = resolve(import.meta.dirname, "..");
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")
  && key !== "GET_MODULAR_RUNTIME_PROFILE")), ROOT_CI_RUNTIME_PROFILE: "bun",
  GIT_AUTHOR_NAME: "iliya", GIT_AUTHOR_EMAIL: "iliyazelenkog@gmail.com",
  GIT_COMMITTER_NAME: "iliya", GIT_COMMITTER_EMAIL: "iliyazelenkog@gmail.com" };

async function put(root: string, path: string, text: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}
function run(root: string, command: string, args: string[], extra: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(command, args, { cwd: root, env: { ...env, ...extra }, encoding: "utf8", timeout: 30_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return result;
}
async function fixture(body: (root: string, temporary: string) => Promise<void>): Promise<void> {
  const temporary = await mkdtemp(join(tmpdir(), "gm-runtime-TEST-"));
  const root = join(temporary, "source");
  try {
    const manifest = { name: "gm-runtime-test", private: true, type: "module", packageManager: `bun@${BUN_VERSION}`,
      engines: { node: ">=24.21.0 <25 || >=26.10.0 <27", bun: BUN_VERSION }, trustedDependencies: [],
      workspaces: { packages: [], catalog: {} }, devDependencies: { "@agent-teams/engineering-foundation": "2.0.0" }, scripts: { observe: "node observe.ts" } };
    await put(root, "package.json", JSON.stringify(manifest, null, 2) + "\n");
    await put(root, ".gitignore", "node_modules/\n.get-modular-node-profile.json\n");
    await put(root, "observe.ts", "console.log(JSON.stringify({ node: process.versions.node, bun: process.versions.bun ?? null }));\n");
    await put(root, "architecture/foundation/repository-agent-workflow.yaml", "schemaVersion: 2\npackageManager: bun\ninstructions: {}\n");
    await put(root, "architecture/foundation/dependency-declarations.yaml", "schemaVersion: 2\npackageManager:\n  kind: bun\n  workspaceManifest: pnpm-workspace.yaml\n");
    await put(root, ".bun-version", "1.4.3\n");
    await put(root, "pnpm-workspace.yaml", "packages: []\ncatalog: {}\n");
    for (const path of ["architecture/tooling/runtime/policy.ts", "architecture/tooling/runtime/command.ts",
      "architecture/tooling/runtime/dev.ts", "architecture/tooling/runtime/admission.ts",
      "architecture/checks/node-version.mjs", "architecture/checks/tracked-workspace-integrity.mjs",
      "architecture/checks/tracked-file-custody.mjs"]) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await copyFile(join(repository, path), join(root, path));
    }
    assert.equal(run(root, "git", ["init", "--initial-branch=main"]).status, 0);
    for (const variable of ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"]) {
      assert.match(run(root, "git", ["var", variable]).stdout, /^iliya <iliyazelenkog@gmail\.com> /u);
    }
    assert.equal(run(root, "git", ["add", "--all"]).status, 0);
    assert.equal(run(root, "git", ["commit", "-m", "test: initialize disposable runtime profile"]).status, 0);
    await body(root, temporary);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

// A manager-only cosmetic migration would fail these actual runtime assertions.
test("Bun manager preserves explicit Node qualification and runtime tools execute in Bun", async () => {
  await fixture(async root => {
    const bin = "node_modules/@agent-teams/engineering-foundation";
    await put(root, `${bin}/package.json`, JSON.stringify({ name: "@agent-teams/engineering-foundation", version: "2.0.0", type: "module",
      bin: { "agent-teams-foundation": "observe.ts" } }));
    await put(root, `${bin}/observe.ts`, "console.log(JSON.stringify({ bun: process.versions.bun ?? null, args: process.argv.slice(2) }));\n");
    const tool = run(root, "node", ["architecture/tooling/runtime/command.ts", "tool", "agent-teams-foundation", "status"]);
    assert.equal(tool.status, 0, tool.stderr);
    assert.deepEqual(JSON.parse(tool.stdout), { bun: "1.4.3", args: ["status"] });
    const command = run(root, "node", ["architecture/tooling/runtime/command.ts", "run", "observe"]);
    assert.equal(command.status, 0, command.stderr);
    assert.equal(JSON.parse(command.stdout).bun, null, "literal Node commands must survive Bun dispatch");
    await put(root, `${bin}/package.json`, JSON.stringify({ name: "@agent-teams/engineering-foundation", version: "1.10.0",
      bin: { "agent-teams-foundation": "observe.ts" } }));
    const stale = run(root, "node", ["architecture/tooling/runtime/command.ts", "tool", "agent-teams-foundation"]);
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /runtime.tool.dependency-pin/u);
    assert.notEqual(run(root, "node", ["architecture/tooling/runtime/command.ts", "tool", "../observe.ts"]).status, 0);
    assert.notEqual(run(root, "node", ["architecture/tooling/runtime/command.ts", "run", "observe;invalid"]).status, 0);
  });
});

test("Node rollback derives only manager metadata in an external checkout and rejects drift", async () => {
  await fixture(async (root, temporary) => {
    const original = await readFile(join(root, "package.json"), "utf8");
    const target = join(temporary, "node-profile");
    const prepared = run(root, "node", ["architecture/tooling/runtime/dev.ts", "prepare-node", target]);
    assert.equal(prepared.status, 0, prepared.stdout + prepared.stderr);
    assert.equal(await readFile(join(root, "package.json"), "utf8"), original, "source checkout must stay untouched");
    const derived = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
    assert.equal(derived.packageManager, "pnpm@11.20.0");
    assert.equal(derived.workspaces, undefined);
    assert.deepEqual(derived.scripts, JSON.parse(original).scripts);
    assert.equal(await readFile(join(target, "architecture/foundation/repository-agent-workflow.yaml"), "utf8"),
      "schemaVersion: 2\npackageManager: pnpm\ninstructions: {}\n");
    const verified = run(target, "node", ["architecture/tooling/runtime/dev.ts", "verify"]);
    assert.equal(verified.status, 0, verified.stdout + verified.stderr);
    await writeFile(join(target, "observe.ts"), "throw new Error('changed source');\n");
    assert.notEqual(run(target, "node", ["architecture/tooling/runtime/dev.ts", "verify"]).status, 0,
      "projection verification must not hide other source changes");
    await writeFile(join(target, "package.json"), JSON.stringify({ ...derived, scripts: {} }));
    const drift = run(target, "node", ["architecture/tooling/runtime/dev.ts", "verify"]);
    assert.notEqual(drift.status, 0);
    assert.match(drift.stderr, /runtime.projection.drift:package.json/u);
    assert.notEqual(run(root, "node", ["architecture/tooling/runtime/dev.ts", "prepare-node", target]).status, 0);
    assert.notEqual(run(root, "node", ["architecture/tooling/runtime/command.ts", "run", "observe"],
      { GET_MODULAR_RUNTIME_PROFILE: "node" }).status, 0, "Node must refuse the Bun installation root");
  });
});

test("Node rollback dispatch uses the actual installed pnpm public root export", async () => {
  const installed = createRequire(join(repository, "package.json")).resolve("pnpm");
  const manifest = JSON.parse(await readFile(installed, "utf8"));
  assert.equal(manifest.name, "pnpm");
  assert.equal(manifest.version, PNPM_VERSION);
  assert.deepEqual(manifest.exports, { ".": "./package.json" });
  await fixture(async (root, temporary) => {
    const target = join(temporary, "node-profile");
    assert.equal(run(root, "node", ["architecture/tooling/runtime/dev.ts", "prepare-node", target]).status, 0);
    const packageRoot = join(target, "node_modules/pnpm");
    await cp(dirname(installed), packageRoot, { recursive: true, dereference: true });
    const resolver = createRequire(join(target, "package.json"));
    assert.equal(resolver.resolve("pnpm"), join(packageRoot, "package.json"));
    assert.throws(() => resolver.resolve("pnpm/package.json"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });

    const args = ["architecture/tooling/runtime/command.ts", "run", "observe"];
    const control = run(target, "node", args, {
      pnpm_config_verify_deps_before_run: "false", npm_config_offline: "true", COREPACK_ENABLE_NETWORK: "0",
    });
    assert.equal(control.status, 0, control.stdout + control.stderr);
    const observation = control.stdout.trim().split(/\r?\n/u).find(line => line.startsWith("{\"node\":"));
    assert.ok(observation, control.stdout);
    assert.deepEqual(JSON.parse(observation), { node: process.versions.node, bun: null });

    for (const mutation of [{ ...manifest, name: "other" }, { ...manifest, version: "11.19.0" },
      { ...manifest, bin: {} }]) {
      await writeFile(join(packageRoot, "package.json"), JSON.stringify(mutation));
      const rejected = run(target, "node", args);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /runtime.pnpm.installed-pin/u);
    }
    await writeFile(join(packageRoot, "package.json"), JSON.stringify(manifest));
    await writeFile(join(packageRoot, manifest.bin.pnpm), "console.log('11.19.0');\n");
    const wrongCli = run(target, "node", args);
    assert.notEqual(wrongCli.status, 0);
    assert.match(wrongCli.stderr, /runtime.pnpm.installed-identity/u);
  });
});

test("Node dispatch refuses every changed manager projection before executing a tool or script", async () => {
  await fixture(async (root, temporary) => {
    const target = join(temporary, "node-profile");
    assert.equal(run(root, "node", ["architecture/tooling/runtime/dev.ts", "prepare-node", target]).status, 0);
    const sentinel = join(target, "tool-executed");
    await put(target, "node_modules/@agent-teams/engineering-foundation/package.json", JSON.stringify({
      name: "@agent-teams/engineering-foundation", version: "2.0.0", type: "module",
      bin: { "agent-teams-foundation": "sentinel.js" },
    }));
    await put(target, "node_modules/@agent-teams/engineering-foundation/sentinel.js",
      `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(sentinel)}, "executed");`);
    const tool = ["architecture/tooling/runtime/command.ts", "tool", "agent-teams-foundation"];
    const control = run(target, "node", tool);
    assert.equal(control.status, 0, control.stderr);
    assert.equal(await readFile(sentinel, "utf8"), "executed", "valid projection must execute the actual tool");
    await rm(sentinel);
    for (const path of ["package.json", "architecture/foundation/repository-agent-workflow.yaml",
      "architecture/foundation/dependency-declarations.yaml"]) {
      const original = await readFile(join(target, path), "utf8");
      const mutation = path === "package.json" ? JSON.stringify({ ...JSON.parse(original), scripts: { observe: "node poison.ts" } })
        : original + "# projection drift\n";
      await writeFile(join(target, path), mutation);
      for (const args of [tool, ["architecture/tooling/runtime/command.ts", "run", "observe"],
        ["architecture/tooling/runtime/dev.ts", "run", "observe"]]) {
        const rejected = run(target, "node", args);
        assert.notEqual(rejected.status, 0, path);
        assert.match(rejected.stderr, /runtime.projection.drift:/u, path);
        await assert.rejects(readFile(sentinel), { code: "ENOENT" });
      }
      await writeFile(join(target, path), original);
    }
  });
});

test("both runtime roles and Node projection fail closed for unknown inputs", () => {
  assert.equal(toolRuntime("bun", "agent-teams-foundation"), "bun");
  assert.equal(toolRuntime("node", "agent-teams-foundation"), "node");
  assert.throws(() => toolRuntime("bun", "node_modules/typescript/bin/tsc"), /runtime.tool.unknown/u);
  assert.throws(() => project("architecture/foundation/repository-agent-workflow.yaml", "schemaVersion: 1\npackageManager: bun\n"));
  assert.throws(() => project("package.json", '{"packageManager":"pnpm@11.20.0"}'));
  const saved = process.env.GET_MODULAR_RUNTIME_PROFILE;
  try {
    process.env.GET_MODULAR_RUNTIME_PROFILE = "other";
    assert.throws(() => selectedProfile(), /runtime.profile.unknown/u);
  } finally {
    if (saved === undefined) delete process.env.GET_MODULAR_RUNTIME_PROFILE;
    else process.env.GET_MODULAR_RUNTIME_PROFILE = saved;
  }
});

// Reject inconsistent source metadata before frozen install can load anything.
test("Bun admission compares both workspace representations before installation", async () => {
  await fixture(async root => {
    const valid = run(root, "bun", ["architecture/tooling/runtime/admission.ts"]);
    assert.equal(valid.status, 0, valid.stderr);
    await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []\ncatalog: {typescript: 7.0.2}\n");
    const rejected = run(root, "node", ["architecture/tooling/runtime/dev.ts", "install"]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /runtime.bun.workspace-projection-drift/u);
    assert.doesNotMatch(rejected.stderr, /runtime.install.bun-lock-pending/u);
    await put(root, "node_modules/.pnpm/marker", "opposite manager");
    const mixed = run(root, "node", ["architecture/tooling/runtime/dev.ts", "install"]);
    assert.notEqual(mixed.status, 0);
    assert.match(mixed.stderr, /runtime.install.mixed-or-unknown-manager/u);

  });
});

test("M3 retains actual Node 24 cells and binds each controller to its exact committed pin", () => {
  assert.equal(m3NodePinPath("node"), ".node-compat-version");
  for (const action of ["pack", "native", "collect"]) assert.equal(m3NodePinPath(action), ".node-version");
  assert.equal(assertM3NodePin("24.21.0\n", "24.21.0\n", "v24.21.0"), "24.21.0");
  assert.equal(assertM3NodePin("26.11.1\n", "26.11.1\n", "v26.11.1"), "26.11.1");
  assert.throws(() => assertM3NodePin("26.11.1\n", "24.21.0\n", "v26.11.1"), /m3.node.pin-source-drift/u);
  assert.throws(() => assertM3NodePin("24.21.0\n", "24.21.0\n", "v26.11.1"), /m3.node.runtime-pin-mismatch/u);
  assert.throws(() => assertM3NodePin("26.11.1\n", "26.11.1\n", "v24.21.0"), /m3.node.runtime-pin-mismatch/u);
  assert.throws(() => assertM3NodePin("26.11.1-rc.1\n", "26.11.1-rc.1\n", "v26.11.1-rc.1"));
  assert.throws(() => m3NodePinPath("unknown"), /m3.node.unknown-action/u);
});
