import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
interface CompilerIdentity {
  readonly compilerName: string;
  readonly version: string;
  readonly path: string;
}

/** Resolve exact compiler identities locally; equal current/minimum versions run once. */
export async function supportedCompilers(): Promise<readonly CompilerIdentity[]> {
  const versions = new Map<string, CompilerIdentity>();
  for (const compilerName of ["typescript", "typescript-minimum"]) {
    const manifestPath = require.resolve(`${compilerName}/package.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { readonly name?: unknown; readonly version?: unknown };
    assert.equal(manifest.name, "typescript");
    assert.equal(typeof manifest.version, "string");
    const observedVersion = manifest.version as string;
    if (compilerName === "typescript-minimum") { assert.equal(manifest.version, "7.0.2"); }
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(observedVersion);
    assert.ok(match !== null && match[0] === observedVersion,
      `${compilerName} must be a pinned stable compiler: ${manifest.version}`);
    const version = match.slice(1).map(Number);
    const [major = 0, minor = 0, patch = 0] = version;
    assert.ok(version.every(Number.isSafeInteger)
      && (major > 7 || (major === 7 && (minor > 0 || patch >= 2))),
    `${compilerName} ${manifest.version} is below the authorized 7.0.2 floor; migrate the active pin first`);
    if (!versions.has(observedVersion)) { versions.set(observedVersion, {
      compilerName, version: observedVersion, path: join(dirname(manifestPath), "bin/tsc"),
    }); }
  }
  return [...versions.values()];
}
