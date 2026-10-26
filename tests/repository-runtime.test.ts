import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, cp, link, mkdir, mkdtemp, open, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { assertM3NativeController, assertM3NodePin, m3NodePinPath } from "./qualification/support/m3-node-policy.ts";
import { pinnedPnpmCli } from "./qualification/support/pinned-pnpm.ts";
import { BUN_VERSION, PNPM_VERSION, project, selectedProfile, toolRuntime } from "../architecture/tooling/runtime/policy.ts";
import { assertRetainedHistory, retainHistory } from "../architecture/tooling/runtime/retained-history.ts";
import { provisionedPnpmCli } from "../architecture/tooling/runtime/command.ts";

const repository = resolve(import.meta.dirname, "..");
const pnpmProbePaths = [
  "packages/observation/tests/support/pnpm-probe.ts",
  "packages/lifecycle-kernel/tests/support/pnpm-probe.ts",
  "packages/resources/tests/support/pnpm-probe.ts",
  "packages/conformance/tests/support/pnpm-probe.ts",
];
const pnpmResolvers = [pinnedPnpmCli, ...pnpmProbePaths.map(entry => async (root: string): Promise<string> => {
  const result = spawnSync(await realpath(process.execPath), [join(repository, entry), root], {
    cwd: repository, env, encoding: "utf8", shell: false, timeout: 30_000, maxBuffer: 64 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
})];
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
      workspaces: { packages: [], catalog: { pnpm: PNPM_VERSION } }, devDependencies: { pnpm: "catalog:", "@agent-teams/engineering-foundation": "2.0.1", "stack-toolchain": "0.1.1" }, scripts: { observe: "node observe.ts" } };
    await put(root, "package.json", JSON.stringify(manifest, null, 2) + "\n");
    await put(root, ".gitignore", "node_modules/\n.get-modular-node-profile.json\n");
    await put(root, "observe.ts", "console.log(JSON.stringify({ node: process.versions.node, bun: process.versions.bun ?? null }));\n");
    await put(root, "architecture/foundation/repository-agent-workflow.yaml", "schemaVersion: 2\npackageManager: bun\ninstructions: {}\n");
    await put(root, "architecture/foundation/dependency-declarations.yaml", "schemaVersion: 2\npackageManager:\n  kind: bun\n  workspaceManifest: pnpm-workspace.yaml\n");
    await put(root, ".bun-version", "1.4.3\n");
    await put(root, "pnpm-workspace.yaml", `packages: []\ncatalog: {pnpm: "${PNPM_VERSION}"}\n`);
    for (const path of [".gitattributes", "architecture/tooling/runtime/policy.ts", "architecture/tooling/runtime/command.ts",
      "architecture/tooling/runtime/dev.ts", "architecture/tooling/runtime/admission.ts",
      "architecture/tooling/runtime/projection-custody.ts",
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
    assert.equal(run(root, "git", ["-c", "core.autocrlf=true", "checkout-index", "--all", "--force"]).status, 0);
    for (const path of ["package.json", "architecture/foundation/repository-agent-workflow.yaml",
      "architecture/foundation/dependency-declarations.yaml"]) {
      assert.equal((await readFile(join(root, path), "utf8")).includes("\r"), false, `${path} must retain source LF attributes`);
    }
    await body(root, temporary);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

// A manager-only cosmetic migration would fail these actual runtime assertions.
test("Bun manager preserves explicit Node qualification and runtime tools execute in Bun", async () => {
  await fixture(async root => {
    const bin = "node_modules/@agent-teams/engineering-foundation";
    await put(root, `${bin}/package.json`, JSON.stringify({ name: "@agent-teams/engineering-foundation", version: "2.0.1", type: "module",
      bin: { "agent-teams-foundation": "observe.ts" } }));
    await put(root, `${bin}/observe.ts`, "console.log(JSON.stringify({ bun: process.versions.bun ?? null, args: process.argv.slice(2), nodeExecutable: process.env.AGENT_TEAMS_FOUNDATION_NODE_EXECUTABLE }));\n");
    const tool = run(root, "node", ["architecture/tooling/runtime/command.ts", "tool", "agent-teams-foundation", "status"],
      { AGENT_TEAMS_FOUNDATION_NODE_EXECUTABLE: "untrusted-inherited-node" });
    assert.equal(tool.status, 0, tool.stderr);
    assert.deepEqual(JSON.parse(tool.stdout), { bun: "1.4.3", args: ["status"], nodeExecutable: await realpath(process.execPath) });
    const wrongController = run(root, "bun", ["architecture/tooling/runtime/command.ts", "tool", "agent-teams-foundation"]);
    assert.notEqual(wrongController.status, 0);
    assert.match(wrongController.stderr, /runtime.foundation.requires-node-controller/u);
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

// Stack's native process adapter requires Node even when Bun owns the install.
test("Stack uses the physical supported Node controller in the Bun profile", async () => {
  await fixture(async root => {
    const bin = "node_modules/stack-toolchain";
    await put(root, `${bin}/package.json`, JSON.stringify({ name: "stack-toolchain", version: "0.1.1", type: "module",
      bin: { "stack-toolchain": "observe.js" } }));
    // Published package bins are JavaScript; Node does not strip installed TS.
    await put(root, `${bin}/observe.js`, "console.log(JSON.stringify({ bun: process.versions.bun ?? null, executable: process.execPath, args: process.argv.slice(2) }));\n");
    const node = await realpath(process.execPath);
    const args = ["doctor", "literal space & ; $(untouched)"];
    const tool = ["architecture/tooling/runtime/command.ts", "tool", "stack-toolchain", ...args];
    // An empty PATH proves neither the Node child nor its package bin uses a shim.
    const invoked = run(root, node, tool, { PATH: "", Path: "" });
    assert.equal(invoked.status, 0, invoked.stderr);
    assert.deepEqual(JSON.parse(invoked.stdout), { bun: null, executable: node, args });
    const bun = run(root, "bun", tool);
    assert.notEqual(bun.status, 0);
    assert.match(bun.stderr, /runtime.stack.requires-node-controller/u);
    assert.equal(bun.stdout, "", "a rejected controller must not invoke the package bin");
    for (const version of ["24.20.99", "26.9.99", "25.0.0"]) {
      const unsupported = run(root, node, ["--input-type=module", "--eval",
        `Object.defineProperty(process.versions, "node", { value: ${JSON.stringify(version)} }); const { invoke } = await import("./architecture/tooling/runtime/command.ts"); process.exitCode = invoke("tool", "stack-toolchain", []);`]);
      assert.notEqual(unsupported.status, 0, version);
      assert.match(unsupported.stderr, /NODE_VERSION_PREFLIGHT_FAILED/u, version);
      assert.equal(unsupported.stdout, "", "unsupported Node must fail before package invocation");
    }
    await put(root, `${bin}/package.json`, JSON.stringify({ name: "stack-toolchain", version: "0.1.0", type: "module",
      bin: { "stack-toolchain": "observe.js" } }));
    const stale = run(root, node, tool);
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /runtime.tool.dependency-pin/u);
    assert.equal(stale.stdout, "");
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

test("Node rollback captures main for unset or empty GitHub bases and preserves explicit PR baselines", async () => {
  await fixture(async (root, temporary) => {
    const baseline = run(root, "git", ["rev-parse", "HEAD"]).stdout.trim();
    for (const base of ["main", "release/next"]) {
      assert.equal(run(root, "git", ["update-ref", `refs/remotes/origin/${base}`, baseline]).status, 0);
    }
    await put(root, "after-baseline.txt", "source HEAD differs from the retained baseline\n");
    assert.equal(run(root, "git", ["add", "after-baseline.txt"]).status, 0);
    assert.equal(run(root, "git", ["commit", "-m", "test: advance disposable source beyond baseline"]).status, 0);
    const head = run(root, "git", ["rev-parse", "HEAD"]).stdout.trim();
    assert.notEqual(head, baseline);
    const cases = [[undefined, "main"], ["", "main"], ["release/next", "release/next"]] as const;
    for (const [index, [base, expectedBase]] of cases.entries()) {
      const target = join(temporary, `node-profile-${index}`);
      const prepared = run(root, "node", ["architecture/tooling/runtime/dev.ts", "prepare-node", target],
        { GITHUB_BASE_REF: base });
      assert.equal(prepared.status, 0, prepared.stdout + prepared.stderr);
      assert.equal(run(target, "git", ["rev-parse", "HEAD"]).stdout.trim(), head);
      assert.equal(run(target, "git", ["rev-parse", `refs/remotes/origin/${expectedBase}`]).stdout.trim(), baseline);
    }
    const invalidTarget = join(temporary, "invalid-baseline");
    const rejected = run(root, "node", ["architecture/tooling/runtime/dev.ts", "prepare-node", invalidTarget],
      { GITHUB_BASE_REF: "bad ref" });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /check-ref-format refs\/remotes\/origin\/bad ref/u);
    await assert.rejects(realpath(invalidTarget), { code: "ENOENT" });
  });
});

test("bootstrap pnpm uses the real provisioned JS entry without executing shell wrappers", async () => {
  const installed = createRequire(join(repository, "package.json")).resolve("pnpm");
  const manifest = JSON.parse(await readFile(installed, "utf8"));
  assert.equal(manifest.version, PNPM_VERSION);
  await fixture(async (root, temporary) => {
    const prefix = join(temporary, "provisioned pnpm & literal space");
    let packageRoot = join(prefix, "node_modules/pnpm");
    await cp(dirname(installed), packageRoot, { recursive: true, dereference: true });
    let cli = await realpath(join(packageRoot, manifest.bin.pnpm));
    const launcher = join(prefix, "node_modules/.bin/pnpm.cmd");
    await mkdir(dirname(launcher), { recursive: true });
    // The real package is the execution subject. This poison wrapper must never run.
    await writeFile(launcher, "@echo SHELL_WRAPPER_EXECUTED & exit /b 77\r\n");
    // Windows sync/CJS resolution can retain an 8.3 spelling; compare both
    // physical paths through the same asynchronous realpath authority.
    assert.equal(await realpath(provisionedPnpmCli({ PATH: dirname(launcher) })), cli);
    assert.equal(await realpath(provisionedPnpmCli({ PATH: "", npm_execpath: cli })), cli);
    assert.throws(() => provisionedPnpmCli({ PATH: "", ComSpec: launcher }), /provisioned-manifest-unavailable/u);
    // Match action-setup's real self-update layout: an old bootstrap remains
    // beside .bin while the selected real package lives under PNPM_HOME/global.
    const home = dirname(launcher), selected = join(home, "global/v11/owned-install/node_modules/pnpm");
    await cp(packageRoot, selected, { recursive: true, dereference: true });
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ ...manifest, version: "11.7.0" }));
    packageRoot = selected; cli = await realpath(join(packageRoot, manifest.bin.pnpm));
    const updatedLauncher = join(home, "bin/pnpm.cmd");
    await mkdir(dirname(updatedLauncher), { recursive: true });
    await copyFile(launcher, updatedLauncher);
    const bootstrapEnvironment = { PATH: dirname(updatedLauncher), Path: dirname(updatedLauncher),
      PNPM_HOME: home, npm_execpath: "", ComSpec: updatedLauncher,
      npm_config_offline: "true", COREPACK_ENABLE_NETWORK: "0" };
    assert.equal(await realpath(provisionedPnpmCli(bootstrapEnvironment)), cli);
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "bootstrap-TEST", private: true,
      type: "module", packageManager: "bun@1.4.3" }));
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n");
    const invoke = (args: string[]) => run(root, process.execPath, ["--input-type=module", "--eval",
      `import {pnpm} from ${JSON.stringify(pathToFileURL(join(root, "architecture/tooling/runtime/command.ts")).href)}; process.exitCode=pnpm(${JSON.stringify(args)});`], bootstrapEnvironment);
    // The fixture copy has no installed pnpm, so this exercises initial provisioning.
    const passed = invoke(["--pm-on-fail=ignore", "peers", "check", "--lockfile-only"]);
    assert.equal(passed.status, 0, passed.stdout + passed.stderr);
    assert.doesNotMatch(passed.stdout + passed.stderr, /SHELL_WRAPPER_EXECUTED/u);
    for (const args of [["--version"], ["run", "observe"], ["install", ";echo"]]) {
      const rejected = invoke(args);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /runtime.pnpm.requires-installed-cli/u);
    }
    for (const mutation of [{ ...manifest, version: "11.19.0" }, { ...manifest, name: "other" },
      { ...manifest, bin: { pnpm: "../outside.mjs" } }, { ...manifest, bin: { pnpm: "bin/pnpm.cmd" } }]) {
      await writeFile(join(packageRoot, "package.json"), JSON.stringify(mutation));
      assert.throws(() => provisionedPnpmCli(bootstrapEnvironment), /runtime.pnpm.installed-pin/u);
    }
    await writeFile(join(packageRoot, "package.json"), JSON.stringify(manifest));
    const actualCli = await readFile(cli);
    await writeFile(cli, "console.log('11.19.0');\n");
    const wrongCli = invoke(["peers", "check", "--lockfile-only"]);
    assert.notEqual(wrongCli.status, 0);
    assert.match(wrongCli.stderr, /runtime.pnpm.installed-identity/u);
    await writeFile(cli, actualCli);
    await put(root, "outside.mjs", "throw new Error('outside package');\n");
    await symlink(join(root, "outside.mjs"), join(packageRoot, "bin/escaped.mjs"), "file");
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ ...manifest, bin: { pnpm: "bin/escaped.mjs" } }));
    assert.throws(() => provisionedPnpmCli(bootstrapEnvironment), /runtime.pnpm.installed-pin/u);
    const global = join(home, "global/v11");
    for (let index = 0; index < 64; index++) await mkdir(join(global, `limit-${index}`));
    assert.throws(() => provisionedPnpmCli(bootstrapEnvironment), /runtime.pnpm.provisioned-layout-limit/u);
  });
});

test("Node rollback dispatch uses the actual installed pnpm public root export", async () => {
  const installed = createRequire(join(repository, "package.json")).resolve("pnpm");
  const manifest = JSON.parse(await readFile(installed, "utf8"));
  assert.equal(manifest.name, "pnpm");
  assert.equal(manifest.version, PNPM_VERSION);
  assert.deepEqual(manifest.exports, { ".": "./package.json" });
  for (const resolvePnpm of pnpmResolvers) {
    assert.equal(await realpath(await resolvePnpm(repository)), await realpath(join(dirname(installed), manifest.bin.pnpm)));
  }
  await fixture(async (root, temporary) => {
    const target = join(temporary, "node-profile");
    assert.equal(run(root, "node", ["architecture/tooling/runtime/dev.ts", "prepare-node", target]).status, 0);
    const packageRoot = join(target, "node_modules/pnpm");
    await cp(dirname(installed), packageRoot, { recursive: true, dereference: true });
    const resolver = createRequire(join(target, "package.json"));
    assert.equal(await realpath(resolver.resolve("pnpm")), await realpath(join(packageRoot, "package.json")));
    assert.throws(() => resolver.resolve("pnpm/package.json"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
    for (const resolvePnpm of pnpmResolvers) {
      assert.equal(await realpath(await resolvePnpm(target)), await realpath(join(packageRoot, manifest.bin.pnpm)));
    }

    await put(target, "node_modules/@agent-teams/engineering-foundation/package.json", JSON.stringify({
      name: "@agent-teams/engineering-foundation", version: "2.0.1", type: "module",
      bin: { "agent-teams-foundation": "observe.js" },
    }));
    await put(target, "node_modules/@agent-teams/engineering-foundation/observe.js",
      'console.log(JSON.stringify({ bun: process.versions.bun ?? null, nodeExecutable: process.env.AGENT_TEAMS_FOUNDATION_NODE_EXECUTABLE }));\n');
    const foundation = run(target, "node", ["architecture/tooling/runtime/command.ts", "tool", "agent-teams-foundation"],
      { AGENT_TEAMS_FOUNDATION_NODE_EXECUTABLE: "untrusted-inherited-node" });
    assert.equal(foundation.status, 0, foundation.stderr);
    assert.deepEqual(JSON.parse(foundation.stdout), { bun: null, nodeExecutable: await realpath(process.execPath) });

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
      for (const resolvePnpm of pnpmResolvers) await assert.rejects(resolvePnpm(target), /packed.pnpm.installed-(?:name|version|bin)/u);
    }
    await writeFile(join(packageRoot, "package.json"), JSON.stringify(manifest));
    await writeFile(join(packageRoot, manifest.bin.pnpm), "console.log('11.19.0');\n");
    const wrongCli = run(target, "node", args);
    assert.notEqual(wrongCli.status, 0);
    assert.match(wrongCli.stderr, /runtime.pnpm.installed-identity/u);
    for (const resolvePnpm of pnpmResolvers) await assert.rejects(resolvePnpm(target), /packed.pnpm.installed-identity/u);
    for (const bin of ["../outside.mjs", "/outside.mjs", "C:/outside.mjs", "https://host/pnpm.mjs",
      "bin/pnpm.cmd", "bin/pnpm.mjs --help", "bin/../pnpm.mjs", "bin/pnpm.mjs\n"]) {
      await writeFile(join(packageRoot, "package.json"), JSON.stringify({ ...manifest, bin: { pnpm: bin } }));
      for (const resolvePnpm of pnpmResolvers) await assert.rejects(resolvePnpm(target), /packed.pnpm.installed-bin/u);
    }
    const outside = join(temporary, "outside.mjs"), marker = join(temporary, "outside-executed");
    await writeFile(outside, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "ran"); console.log("11.20.0");\n`);
    await symlink(outside, join(packageRoot, "bin/escaped.mjs"), "file");
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ ...manifest, bin: { pnpm: "bin/escaped.mjs" } }));
    for (const resolvePnpm of pnpmResolvers) await assert.rejects(resolvePnpm(target), /packed.pnpm.installed-path/u);
    await assert.rejects(readFile(marker), { code: "ENOENT" });
    await mkdir(join(packageRoot, "bin/directory.mjs"));
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ ...manifest, bin: { pnpm: "bin/directory.mjs" } }));
    for (const resolvePnpm of pnpmResolvers) await assert.rejects(resolvePnpm(target), /packed.pnpm.installed-path/u);
    const source = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
    source.workspaces = { packages: [], catalog: { pnpm: `^${PNPM_VERSION}` } };
    await writeFile(join(target, "package.json"), JSON.stringify(source));
    assert.equal(run(target, "git", ["add", "package.json"]).status, 0);
    assert.equal(run(target, "git", ["commit", "-m", "test: retain nonexact catalog rejection"]).status, 0);
    for (const resolvePnpm of pnpmResolvers.slice(1)) await assert.rejects(resolvePnpm(target), /packed.pnpm.source-pin/u);
  });
});

test("Node dispatch refuses every changed manager projection before executing a tool or script", async () => {
  await fixture(async (root, temporary) => {
    const target = join(temporary, "node-profile");
    assert.equal(run(root, "node", ["architecture/tooling/runtime/dev.ts", "prepare-node", target]).status, 0);
    const sentinel = join(target, "tool-executed");
    await put(target, "node_modules/@agent-teams/engineering-foundation/package.json", JSON.stringify({
      name: "@agent-teams/engineering-foundation", version: "2.0.1", type: "module",
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
  assert.equal(toolRuntime("bun", "stack-toolchain"), "node");
  assert.equal(toolRuntime("node", "stack-toolchain"), "node");
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

test("M3 retains actual Node 24 cells and binds each controller to its exact committed pin", async () => {
  assert.equal(m3NodePinPath("node"), ".node-compat-version");
  for (const action of ["pack", "native", "collect"]) assert.equal(m3NodePinPath(action), ".node-version");
  assert.equal(assertM3NodePin("24.21.0\n", "24.21.0\n", "v24.21.0"), "24.21.0");
  assert.equal(assertM3NodePin("26.11.1\n", "26.11.1\n", "v26.11.1"), "26.11.1");
  assert.throws(() => assertM3NodePin("26.11.1\n", "24.21.0\n", "v26.11.1"), /m3.node.pin-source-drift/u);
  assert.throws(() => assertM3NodePin("24.21.0\n", "24.21.0\n", "v26.11.1"), /m3.node.runtime-pin-mismatch/u);
  assert.throws(() => assertM3NodePin("26.11.1\n", "26.11.1\n", "v24.21.0"), /m3.node.runtime-pin-mismatch/u);
  assert.throws(() => assertM3NodePin("26.11.1-rc.1\n", "26.11.1-rc.1\n", "v26.11.1-rc.1"));
  assert.throws(() => m3NodePinPath("unknown"), /m3.node.unknown-action/u);
  const sourceCommit = run(repository, "git", ["rev-parse", "HEAD"]).stdout.trim();
  const nativePin = (await readFile(join(repository, ".node-version"), "utf8")).trim();
  assert.equal(assertM3NativeController(repository, sourceCommit, `v${nativePin}`), nativePin);
  assert.throws(() => assertM3NativeController(repository, sourceCommit, "v24.21.0"), /m3.node.runtime-pin-mismatch/u);
  assert.throws(() => assertM3NativeController(repository, "HEAD", `v${nativePin}`), /m3.node.invalid-source-commit/u);
});

test("M3 bounds physical Node bytes separately and retains file custody checks", async () => {
  const { readM3NodeExecutable } = await import("./qualification/m3-pack-subject.mjs");
  const executable = await realpath(process.execPath);
  const observed = await readM3NodeExecutable(executable);
  const actual = await readFile(executable);
  assert.equal(observed.length, actual.length);
  assert.equal(createHash("sha256").update(observed).digest("hex"),
    createHash("sha256").update(actual).digest("hex"));
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "gm-m3-node-TEST-")));
  try {
    const candidate = join(temporary, "candidate");
    const handle = await open(candidate, "wx");
    try { await handle.truncate(192 * 1024 * 1024 + 1); }
    finally { await handle.close(); }
    await assert.rejects(readM3NodeExecutable(candidate), /pack.file/u);
    await writeFile(candidate, "physical executable fixture");
    await link(candidate, join(temporary, "hardlink"));
    await assert.rejects(readM3NodeExecutable(candidate), /pack.file/u);
    await rm(join(temporary, "hardlink"));
    await symlink(candidate, join(temporary, "alias"), "file");
    await assert.rejects(readM3NodeExecutable(join(temporary, "alias")), /pack.path-alias/u);
    await assert.rejects(readM3NodeExecutable(temporary), /pack.file/u);
    assert.deepEqual(await readM3NodeExecutable(candidate), await readFile(candidate));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});


test("explicit retained history survives a selected clone without a regular branch", async () => {
  await fixture(async (root, temporary) => {
    const initial = run(root, "git", ["rev-parse", "HEAD"]).stdout.trim();
    await put(root, "retained-only.txt", "historical observation\n");
    assert.equal(run(root, "git", ["add", "retained-only.txt"]).status, 0);
    assert.equal(run(root, "git", ["commit", "-m", "test: create detached retained observation"]).status, 0);
    const commit = run(root, "git", ["rev-parse", "HEAD"]).stdout.trim();
    const tree = run(root, "git", ["rev-parse", "HEAD^{tree}"]).stdout.trim();
    assert.equal(run(root, "git", ["reset", "--hard", initial]).status, 0);
    const pin = { commit, tree, ref: "refs/qualification/retained-observation-test" };
    const selected = join(temporary, "selected");
    assert.equal(run(root, "git", ["clone", "--no-local", root, selected]).status, 0);
    assert.notEqual(run(selected, "git", ["cat-file", "-t", commit]).status, 0);
    retainHistory(root, root, pin);
    retainHistory(selected, root, pin);
    assertRetainedHistory(selected, pin);
    assert.equal(run(selected, "git", ["show", `${commit}:retained-only.txt`]).stdout, "historical observation\n");
    assert.equal(run(selected, "git", ["for-each-ref", "--format=%(refname)", "refs/heads"]).stdout.trim(), "refs/heads/main");
    assert.throws(() => assertRetainedHistory(selected, { ...pin, tree: initial }), /runtime.history.tree/u);
  });
});
