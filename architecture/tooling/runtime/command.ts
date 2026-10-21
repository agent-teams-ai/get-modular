import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, delimiter, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUN_VERSION, PNPM_VERSION, repository, runtimeBins, selectedProfile, toolRuntime } from "./policy.ts";

function run(command: string, args: string[], cwd = repository, environment = process.env): number {
  const result = spawnSync(command, args, { cwd, env: environment, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.signal !== null) throw new Error(`runtime.child.signal:${result.signal}`);
  return result.status ?? 1;
}
export function assertBun(): void {
  const version = spawnSync("bun", ["--version"], { encoding: "utf8", shell: false });
  if (version.error || version.status !== 0 || version.stdout.trim() !== BUN_VERSION) throw new Error(`runtime.bun.expected:${BUN_VERSION}`);
}
function pinnedPnpmEntry(path: string): string {
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const bin: unknown = manifest.bin?.pnpm;
  if (manifest.name !== "pnpm" || manifest.version !== PNPM_VERSION || typeof bin !== "string"
    || !/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:cjs|mjs|js)$/u.test(bin)) {
    throw new Error("runtime.pnpm.installed-pin");
  }
  const root = realpathSync(dirname(path));
  const cli = realpathSync(resolve(root, bin));
  const child = relative(root, cli);
  if (child.startsWith("..") || isAbsolute(child) || !statSync(cli).isFile()) {
    throw new Error("runtime.pnpm.installed-pin");
  }
  return cli;
}
function assertPnpmIdentity(cli: string, cwd: string): void {
  const observed = spawnSync(realpathSync(process.execPath), [cli, "--pm-on-fail=ignore", "--version"], {
    cwd, encoding: "utf8", shell: false,
  });
  if (observed.error || observed.status !== 0 || observed.stdout.trim() !== PNPM_VERSION) {
    throw new Error("runtime.pnpm.installed-identity");
  }
}
export function provisionedPnpmCli(environment: NodeJS.ProcessEnv = process.env): string {
  // Locate metadata beside the provisioned launcher; never execute a .cmd/.ps1
  // wrapper or interpolate a PATH/ComSpec value into a shell command.
  const anchors: string[] = [];
  // The pinned action bootstraps an older pnpm, then self-update installs the
  // selected package in this public v11 layout and writes PNPM_HOME/bin shims.
  const home = environment.PNPM_HOME;
  if (home && isAbsolute(home)) {
    const global = resolve(home, "global/v11");
    if (existsSync(global)) {
      const entries = readdirSync(global, { withFileTypes: true });
      if (entries.length > 64) throw new Error("runtime.pnpm.provisioned-layout-limit");
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const anchor = resolve(global, entry.name, "package.json");
        let path: string;
        try { path = createRequire(anchor).resolve("pnpm"); }
        catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "MODULE_NOT_FOUND") throw error;
          continue;
        }
        const metadata = JSON.parse(readFileSync(path, "utf8"));
        if (metadata.name === "pnpm" && metadata.version === PNPM_VERSION) return pinnedPnpmEntry(path);
      }
    }
  }
  const executable = environment.npm_execpath;
  if (executable && isAbsolute(executable) && /^pnpm\.(?:cjs|mjs|js)$/u.test(basename(executable))) {
    anchors.push(realpathSync(executable));
  }
  for (const directory of (environment.PATH ?? environment.Path ?? "").split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    for (const name of ["pnpm", "pnpm.cmd", "pnpm.ps1", "pnpm.exe"]) {
      const launcher = resolve(directory, name);
      if (existsSync(launcher) && statSync(launcher).isFile()) {
        anchors.push(realpathSync(launcher));
      }
    }
  }
  for (const anchor of anchors) {
    let path: string;
    try { path = createRequire(anchor).resolve("pnpm"); }
    catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "MODULE_NOT_FOUND") throw error;
      continue;
    }
    return pinnedPnpmEntry(path);
  }
  throw new Error("runtime.pnpm.provisioned-manifest-unavailable");
}
export function pnpm(args: readonly string[], cwd = repository): number {
  if ("bun" in process.versions) throw new Error("runtime.pnpm.requires-node-controller");
  // Once installed, invoke the declared pinned pnpm CLI through Node. This
  // preserves argv on Windows without sending caller paths through cmd.exe.
  const require = createRequire(resolve(repository, "package.json"));
  let installed: string | undefined;
  // pnpm exposes its package metadata through ".", not "./package.json".
  try { installed = require.resolve("pnpm"); }
  catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "MODULE_NOT_FOUND") throw error; }
  if (installed) {
    const cli = pinnedPnpmEntry(installed);
    assertPnpmIdentity(cli, cwd);
    return run(realpathSync(process.execPath), [cli, ...args], cwd);
  }
  // Only initial installation and lock-only peer qualification use the
  // provisioned toolchain binary, with a finite non-interpolating argv set.
  if (!["install", "peers"].includes((args[0] === "--pm-on-fail=ignore" ? args[1] : args[0]) ?? "") || args.some(arg => !/^[A-Za-z0-9:._=-]+$/u.test(arg))) {
    throw new Error("runtime.pnpm.requires-installed-cli");
  }
  const cli = provisionedPnpmCli();
  assertPnpmIdentity(cli, cwd);
  return run(realpathSync(process.execPath), [cli, ...args], cwd);
}
export function invoke(operation: string, id: string, args: string[]): number {
  const profile = selectedProfile();
  if (operation === "run") {
    const manifest = JSON.parse(readFileSync(resolve(repository, "package.json"), "utf8"));
    if (!/^[a-z0-9][a-z0-9:._-]*$/u.test(id) || !Object.hasOwn(manifest.scripts, id)) throw new Error("runtime.script.unknown");
    if (profile === "node") return pnpm(["run", id, ...args]);
    assertBun();
    return run("bun", ["run", id, ...args]);
  }
  if (operation !== "tool") throw new Error("runtime.operation.unknown");
  const runtime = toolRuntime(profile, id);
  if (runtime === "bun") assertBun();
  let entry = resolve(repository, id);
  const packageName = runtimeBins[id];
  if (packageName !== undefined) {
    const require = createRequire(resolve(repository, "package.json"));
    const path = require.resolve(`${packageName}/package.json`);
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    const owner = JSON.parse(readFileSync(resolve(repository, "package.json"), "utf8"));
    if (typeof owner.devDependencies?.[packageName] !== "string" || owner.devDependencies[packageName] !== manifest.version) {
      throw new Error("runtime.tool.dependency-pin");
    }
    const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[id];
    if (typeof bin !== "string") throw new Error("runtime.tool.bin-unavailable");
    entry = resolve(dirname(path), bin);
  }
  if (id === "agent-teams-foundation") {
    if ("bun" in process.versions) throw new Error("runtime.foundation.requires-node-controller");
    // Foundation verifies this public Node port when its CLI runs in Bun.
    return run(runtime, [entry, ...args], repository, { ...process.env,
      AGENT_TEAMS_FOUNDATION_NODE_EXECUTABLE: realpathSync(process.execPath) });
  }
  return run(runtime, [entry, ...args]);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, id, ...args] = process.argv.slice(2);
  if (!operation || !id) throw new Error("Usage: command.ts run|tool <id> [arguments]");
  process.exitCode = invoke(operation, id, args);
}
