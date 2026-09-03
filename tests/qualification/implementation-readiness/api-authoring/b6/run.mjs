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
  const permutedMetadata = Object.create(null);
  for (const [key, value] of [["ключ", "Unicode Cyrillic"], ["then", "literal"], ["__proto__", "literal"], ["café", "Unicode NFC"], ["constructor", "literal"]]) {
    Object.defineProperty(permutedMetadata, key, { value, enumerable: true, configurable: true, writable: true });
  }
  const permuted = { id: "consumer", version: "1.0.0", dependencies: mod.moduleWithHostileKeys.dependencies, metadata: permutedMetadata };
  assert.equal(mod.canonicalSnapshot(permuted), snapshot, "equivalent insertion orders must produce the same snapshot");
  for (const invalid of [
    { value: undefined, label: "undefined" },
    { value: Symbol("symbol"), label: "symbol" },
    { value: Number.NaN, label: "NaN" },
    { value: () => {}, label: "function" },
    { value: 1.5, label: "fractional number" },
    { value: Number.MAX_SAFE_INTEGER + 1, label: "unsafe integer" },
    { value: "\uD800", label: "high lone surrogate" },
    { value: "\uDC00", label: "low lone surrogate" },
  ]) {
    assert.throws(() => mod.canonicalSnapshot({ invalid: invalid.value }), /unsupported JSON value/u,
      invalid.label);
  }
  for (const [value, label] of [
    [Object.assign([], { toJSON() { return null; } }), "array toJSON"],
    [(() => { const array = []; Object.defineProperty(array, "0", { get() { return 1; }, enumerable: true }); return array; })(), "array accessor"],
    [(() => { const array = []; array[0] = 1; Object.defineProperty(array, "extra", { value: 2, enumerable: true }); return array; })(), "array extra key"],
    [(() => { const array = []; array.length = 1; return array; })(), "sparse array"],
    [(() => { const array = []; array[0] = 1; array[Symbol("metadata")] = 2; return array; })(), "array symbol"],
    [(() => { const array = [1]; array["00"] = 2; return array; })(), "non-canonical array index"],
    [-0, "negative zero"],
    [(() => { const object = {}; object.self = object; return object; })(), "cycle"],
    [(() => { const array = []; array.length = 10_001; return array; })(), "array length limit"],
    [(() => { const object = { value: 1 }; Object.defineProperty(object, "hidden", { value: 2, enumerable: false }); return object; })(), "object non-enumerable"],
    [(() => { const object = { value: 1 }; Object.defineProperty(object, Symbol("metadata"), { value: 2, enumerable: true }); return object; })(), "object symbol"],
    [(() => { const object = {}; Object.defineProperty(object, "\uD800", { value: 1, enumerable: true }); return object; })(), "object key lone surrogate"],
  ]) {
    assert.throws(() => mod.canonicalSnapshot(value), /unsupported JSON value/u, label);
  }
  const inheritedToJson = Array.prototype.toJSON;
  try {
    Object.defineProperty(Array.prototype, "toJSON", { value: () => null, configurable: true });
    assert.throws(() => mod.canonicalSnapshot([1]), /unsupported JSON value/u, "inherited array toJSON");
  } finally {
    if (inheritedToJson === undefined) delete Array.prototype.toJSON;
    else Object.defineProperty(Array.prototype, "toJSON", { value: inheritedToJson, configurable: true });
  }
  console.log(JSON.stringify({ scenarios: mod.scenarioResults, snapshotBytes: Buffer.byteLength(snapshot), importSideEffects: "none", compileOutput: "ephemeral" }, null, 2));
} finally {
  await rm(outputRoot, { recursive: true, force: true });
}
