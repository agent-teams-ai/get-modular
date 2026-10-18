import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/** Resolve exact compiler identities locally; equal current/minimum versions run once. */
export async function supportedCompilers() {
  const versions = new Map();
  for (const compilerName of ["typescript", "typescript-minimum"]) {
    const manifestPath = require.resolve(`${compilerName}/package.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.name, "typescript");
    if (compilerName === "typescript-minimum") assert.equal(manifest.version, "7.0.2");
    const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(manifest.version);
    assert.ok(match, `${compilerName} must be a pinned stable compiler: ${manifest.version}`);
    const version = match.slice(1).map(Number);
    const [major, minor, patch] = version;
    assert.ok(version.every(Number.isSafeInteger)
      && (major > 7 || (major === 7 && (minor > 0 || patch >= 2))),
    `${compilerName} ${manifest.version} is below the authorized 7.0.2 floor; migrate the active pin first`);
    if (!versions.has(manifest.version)) versions.set(manifest.version, {
      compilerName, version: manifest.version, path: join(dirname(manifestPath), "bin/tsc"),
    });
  }
  return [...versions.values()];
}
