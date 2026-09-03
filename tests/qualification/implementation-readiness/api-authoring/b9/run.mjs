import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const fixtureRoot = fileURLToPath(new URL("./", import.meta.url));
const outputRoot = await mkdtemp(join(tmpdir(), "get-modular-b9-"));
const tsc = join(repositoryRoot, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
try {
  const compile = spawnSync(tsc, ["-p", join(fixtureRoot, "tsconfig.json"), "--outDir", outputRoot], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(compile.status, 0, `${compile.stdout}\n${compile.stderr}`);
  const mod = await import(pathToFileURL(join(outputRoot, "fixture.js")).href);
  const required = mod.required();
  const requiredAgain = mod.required();
  assert.deepEqual(required, { kind: "required" });
  assert.notStrictEqual(required, requiredAgain);
  assert.equal(Object.getPrototypeOf(required), Object.prototype);
  required.kind = "mutated";
  assert.equal(requiredAgain.kind, "required");
  const optional = mod.optional();
  const optionalAgain = mod.optional();
  assert.deepEqual(optional, { kind: "optional" });
  assert.notStrictEqual(optional, optionalAgain);
  assert.equal(Object.getPrototypeOf(optional), Object.prototype);
  optional.kind = "mutated";
  assert.equal(optionalAgain.kind, "optional");
  const cardinality = mod.many({ min: 0, max: 8 });
  const cardinalityAgain = mod.many({ min: 0, max: 8 });
  assert.notStrictEqual(cardinality, cardinalityAgain);
  assert.equal(Object.getPrototypeOf(cardinality), Object.prototype);
  cardinality.max = 9;
  assert.deepEqual(cardinality, { kind: "many", min: 0, max: 9, order: "profile" });
  assert.equal(cardinalityAgain.max, 8);
  const input = { moduleId: "identity-check" };
  assert.strictEqual(mod.defineModule(input), input);
  assert.equal(mod.exactShapeModule.slots.transforms.order, "profile");
  console.log(JSON.stringify({
    evidenceStatus: "exact-helper-shape-runtime-probe",
    compilerHandoff: "not-executed",
    declarationIdentity: "preserved",
    helperMutation: "preserved",
  }, null, 2));
} finally {
  await rm(outputRoot, { recursive: true, force: true });
}
