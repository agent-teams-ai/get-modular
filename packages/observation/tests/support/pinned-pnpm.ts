import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

// Package-local TEST selection deliberately has no repository runtime import.
// The committed Bun catalog is the single pin authority, including Node projections.
function committedPnpmPin(root: string): string {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
  const source = spawnSync("git", ["--no-replace-objects", "--literal-pathspecs", "-c", "core.fsmonitor=false",
    "-C", root, "show", "HEAD:package.json"], {
    env: { ...env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    encoding: "utf8", shell: false, timeout: 30_000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(source.error);
  assert.equal(source.signal, null, "packed.pnpm.source-pin");
  assert.equal(source.status, 0, source.stderr);
  const manifest = JSON.parse(source.stdout) as {
    readonly devDependencies?: { readonly pnpm?: unknown };
    readonly workspaces?: { readonly catalog?: { readonly pnpm?: unknown } };
  };
  const pin = manifest.workspaces?.catalog?.pnpm;
  assert.equal(manifest.devDependencies?.pnpm, "catalog:", "packed.pnpm.source-pin");
  assert.ok(typeof pin === "string" && /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(pin),
    "packed.pnpm.source-pin");
  return pin;
}
export async function pinnedPnpmCli(repositoryRoot: string): Promise<string> {
  const root = await realpath(repositoryRoot);
  const expected = committedPnpmPin(root);
  const require = createRequire(join(root, "package.json"));
  // pnpm 11 exposes its manifest at "."; "pnpm/package.json" is not exported.
  const manifestPath = await realpath(require.resolve("pnpm"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    readonly name?: unknown; readonly version?: unknown; readonly bin?: { readonly pnpm?: unknown };
  };
  assert.equal(manifest.name, "pnpm", "packed.pnpm.installed-name");
  assert.equal(manifest.version, expected, "packed.pnpm.installed-version");
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
  assert.equal(version.stdout.trim(), expected, "packed.pnpm.installed-identity");
  return cli;
}
