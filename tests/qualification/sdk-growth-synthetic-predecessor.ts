import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
function record(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}

/** The legacy synthetic input is an active refusal, never a native predecessor. */
export async function assertLegacyProvenanceRefusal(root: string, cli: string, foundationVersion: string): Promise<void> {
  let result: unknown;
  try {
    result = { ...await execute(process.execPath, [cli, "check", "package.public-api-compatibility", "--consumer", root, "--format", "json"],
      { cwd: root, timeout: 120_000, maxBuffer: 8_000_000 }), code: 0 };
  } catch (error) { result = error; }
  const failure = record(result);
  assert.equal(failure.code, 3, `${String(failure.stdout)}\n${String(failure.stderr)}`);
  assert.equal(failure.signal, null);
  assert.equal(failure.killed, false);
  assert.equal(typeof failure.stdout, "string");
  assert.deepEqual(JSON.parse(failure.stdout as string), {
    reportSchemaVersion: 1, foundationVersion, coverage: "selected", outcome: "failed",
    summary: { errors: 0, warnings: 0, infos: 0 }, capabilities: [{
      capabilityId: "package.public-api-compatibility", capabilityConfigSchemaVersion: 2, diagnostics: [], outcome: "failed",
      problem: { code: "UNEXPECTED_FAILURE", message: "An unexpected failure occurred.",
        phase: "public-api-compatibility-execution", retryable: false },
      summary: { errors: 0, warnings: 0, infos: 0 },
    }],
  });
  await assert.rejects(readFile(join(root, "reports/sdk.json")), (error: unknown) => record(error).code === "ENOENT");
}

/** Observe a distinct real empty synthetic package with the installed native
 * extractor. Restore exact candidate bytes even if extraction rejects. */
export async function extractNativeSyntheticPredecessor(root: string, observe: () => Promise<unknown>, extractorVersion: string): Promise<Record<string, unknown>> {
  const manifestPath = join(root, "packages/sdk/package.json");
  const declarationPath = join(root, "packages/sdk/dist/index.d.ts");
  const runtimePath = join(root, "packages/sdk/dist/index.js");
  const manifestBytes = await readFile(manifestPath);
  const declaration = await readFile(declarationPath);
  const runtime = await readFile(runtimePath);
  try {
    const manifest = record(JSON.parse(manifestBytes.toString("utf8")));
    assert.equal(manifest.version, "0.2.0");
    await writeFile(manifestPath, `${JSON.stringify({ ...manifest, version: "0.1.0" }, null, 2)}\n`);
    await writeFile(declarationPath, "export {};\n");
    await writeFile(runtimePath, "export {};\n");
    const snapshot = record(await observe());
    assert.equal(snapshot.schemaVersion, 1);
    assert.equal(snapshot.packageName, manifest.name);
    assert.equal(snapshot.packageVersion, "0.1.0");
    assert.equal(snapshot.extractorVersion, extractorVersion);
    assert.deepEqual(snapshot.entrypoints, [{ exportPath: ".", items: [] }]);
    return snapshot;
  } finally {
    await writeFile(manifestPath, manifestBytes);
    await writeFile(declarationPath, declaration);
    await writeFile(runtimePath, runtime);
  }
}
