import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const fixtureRoot = fileURLToPath(new URL("./", import.meta.url));
const outputRoot = await mkdtemp(join(tmpdir(), "get-modular-b6-"));
const tsc = join(repositoryRoot, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
try {
  const compile = spawnSync(tsc, ["-p", join(fixtureRoot, "tsconfig.json"), "--outDir", outputRoot], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(compile.status, 0, `${compile.stdout}\n${compile.stderr}`);
  const source = readFileSync(new URL("./fixture.ts", import.meta.url), "utf8");
  assert(!source.includes("node:fs") && !source.includes("node:module"));
  const mod = await import(pathToFileURL(join(outputRoot, "fixture.js")).href);
  const snapshot = mod.canonicalSnapshot(mod.moduleWithHostileKeys);
  assert(snapshot.includes("__proto__") && snapshot.includes("constructor") && snapshot.includes("then") && snapshot.includes("café") && snapshot.includes("ключ"));
  const parsed = JSON.parse(snapshot);
  assert.equal(parsed.metadata["__proto__"], "literal");
  assert.deepEqual(Object.keys(parsed.metadata), ["__proto__", "café", "constructor", "then", "ключ"]);
  for (const invalid of [
    { value: undefined, label: "undefined" },
    { value: Symbol("symbol"), label: "symbol" },
    { value: Number.NaN, label: "NaN" },
    { value: () => {}, label: "function" },
  ]) {
    assert.throws(() => mod.canonicalSnapshot({ invalid: invalid.value }), /unsupported JSON value/u,
      invalid.label);
  }
  console.log(JSON.stringify({ scenarios: mod.scenarioResults, snapshotBytes: Buffer.byteLength(snapshot), importSideEffects: "none", compileOutput: "ephemeral" }, null, 2));
} finally {
  await rm(outputRoot, { recursive: true, force: true });
}
