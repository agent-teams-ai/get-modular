import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUN_VERSION, PNPM_VERSION, repository, runtimeBins, selectedProfile, toolRuntime } from "./policy.ts";

function run(command: string, args: string[], cwd = repository): number {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.signal !== null) throw new Error(`runtime.child.signal:${result.signal}`);
  return result.status ?? 1;
}
export function assertBun(): void {
  const version = spawnSync("bun", ["--version"], { encoding: "utf8", shell: false });
  if (version.error || version.status !== 0 || version.stdout.trim() !== BUN_VERSION) throw new Error(`runtime.bun.expected:${BUN_VERSION}`);
}
export function pnpm(args: readonly string[], cwd = repository): number {
  // Once installed, invoke the declared pinned pnpm CLI through Node. This
  // preserves argv on Windows without sending caller paths through cmd.exe.
  const require = createRequire(resolve(repository, "package.json"));
  let installed: string | undefined;
  try { installed = require.resolve("pnpm/package.json"); }
  catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "MODULE_NOT_FOUND") throw error; }
  if (installed) {
    const manifest = JSON.parse(readFileSync(installed, "utf8"));
    if (manifest.version !== PNPM_VERSION || typeof manifest.bin?.pnpm !== "string") throw new Error("runtime.pnpm.installed-pin");
    const cli = resolve(dirname(installed), manifest.bin.pnpm);
    const observed = spawnSync("node", [cli, "--pm-on-fail=ignore", "--version"], { cwd, encoding: "utf8" });
    if (observed.error || observed.status !== 0 || observed.stdout.trim() !== PNPM_VERSION) throw new Error("runtime.pnpm.installed-identity");
    return run("node", [cli, ...args], cwd);
  }
  // Only initial installation and lock-only peer qualification use the
  // provisioned toolchain binary, with a finite non-interpolating argv set.
  if (!["install", "peers"].includes((args[0] === "--pm-on-fail=ignore" ? args[1] : args[0]) ?? "") || args.some(arg => !/^[A-Za-z0-9:._=-]+$/u.test(arg))) {
    throw new Error("runtime.pnpm.requires-installed-cli");
  }
  const windows = process.platform === "win32";
  const command = windows ? process.env.ComSpec || "cmd.exe" : "pnpm";
  const version = spawnSync(command, windows ? ["/d", "/s", "/c", "pnpm --pm-on-fail=ignore --version"] : ["--pm-on-fail=ignore", "--version"], { encoding: "utf8", cwd });
  if (version.error || version.status !== 0 || version.stdout.trim() !== PNPM_VERSION) throw new Error(`runtime.pnpm.expected:${PNPM_VERSION}`);
  return run(command, windows ? ["/d", "/s", "/c", `pnpm ${args.join(" ")}`] : [...args], cwd);
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
  return run(runtime, [entry, ...args]);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, id, ...args] = process.argv.slice(2);
  if (!operation || !id) throw new Error("Usage: command.ts run|tool <id> [arguments]");
  process.exitCode = invoke(operation, id, args);
}
