import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { PNPM_VERSION } from "../../../architecture/tooling/runtime/policy.ts";

// TEST-only selection of the installed pinned package, independent of launcher
// shims and inherited npm_execpath. Callers retain their explicit Node argv.
export async function pinnedPnpmCli(repositoryRoot: string): Promise<string> {
  const root = await realpath(repositoryRoot);
  const require = createRequire(join(root, "package.json"));
  // pnpm 11 exposes its manifest at "."; "pnpm/package.json" is not exported.
  const manifestPath = await realpath(require.resolve("pnpm"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    readonly name?: unknown; readonly version?: unknown; readonly bin?: { readonly pnpm?: unknown };
  };
  assert.equal(manifest.name, "pnpm", "packed.pnpm.installed-name");
  assert.equal(manifest.version, PNPM_VERSION, "packed.pnpm.installed-version");
  const bin = manifest.bin?.pnpm;
  assert.ok(typeof bin === "string"
    && /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:c?js|mjs)$/u.test(bin), "packed.pnpm.installed-bin");
  const packageRoot = dirname(manifestPath);
  const cli = await realpath(join(packageRoot, bin));
  const suffix = relative(packageRoot, cli);
  assert.ok(suffix !== "" && suffix !== ".." && !suffix.startsWith(`..${sep}`)
    && !isAbsolute(suffix) && (await lstat(cli)).isFile(), "packed.pnpm.installed-path");
  const node = await realpath(process.execPath);
  const version = spawnSync(node, [cli, "--pm-on-fail=ignore", "--version"], {
    cwd: root, encoding: "utf8", shell: false, timeout: 30_000, maxBuffer: 64 * 1024,
  });
  assert.ifError(version.error);
  assert.equal(version.signal, null, "packed.pnpm.installed-identity");
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), PNPM_VERSION, "packed.pnpm.installed-identity");
  return cli;
}
