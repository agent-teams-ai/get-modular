import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

const helper = "architecture/tooling/construction-witness-projection.ts";
const canonical = "tests/qualification/support/construction-witness.ts";
const projection = "packages/core/tests/qualification-support/support/construction-witness.ts";
const authored = Buffer.from("// Authored witness — exact bytes.\r\nexport const witness = true;\r\n", "utf8");
const divergent = Buffer.from("// Divergent copy.\nexport const witness = false;\n", "utf8");

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "gm-witness-projection-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(dirname(join(directory, helper)), { recursive: true });
  await cp(new URL("../" + helper, import.meta.url), join(directory, helper));
  await writeFile(join(directory, "package.json"), '{"private":true,"type":"module"}\n');
  for (const path of [canonical, projection]) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), authored);
  }
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [join(directory, helper), ...args], {
      cwd: directory, encoding: "utf8", timeout: 10_000, maxBuffer: 100_000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.ok(Number.isInteger(result.status));
    return result;
  };
  const noBuildOutputs = async () => {
    for (const path of ["packages/core/dist", "packages/core/dist-stage0",
      "packages/core/src/composition/generated/stage1.ts"]) {
      await assert.rejects(readFile(join(directory, path)), { code: "ENOENT" });
    }
  };
  return { directory, run, noBuildOutputs };
}

test("witness projection check succeeds cold without build output or dependencies", async t => {
  const f = await fixture(t);
  await f.noBuildOutputs();
  await assert.rejects(readFile(join(f.directory, "node_modules")), { code: "ENOENT" });
  const result = f.run("--check");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(await readFile(join(f.directory, canonical)), authored);
  assert.deepEqual(await readFile(join(f.directory, projection)), authored);
  await f.noBuildOutputs();
});

test("witness projection check rejects drift without repairing either file", async t => {
  const f = await fixture(t);
  await writeFile(join(f.directory, projection), divergent);
  const result = f.run("--check");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /build\.construction-witness-projection-drift/u);
  assert.deepEqual(await readFile(join(f.directory, canonical)), authored);
  assert.deepEqual(await readFile(join(f.directory, projection)), divergent);
  await f.noBuildOutputs();
});

const missingCases: readonly (readonly [string, string, string])[] = [
  ["canonical source", canonical, projection],
  ["Core projection", projection, canonical],
];
for (const [name, missing, retained] of missingCases) {
  test("witness projection check preserves missing-file failure for " + name, async t => {
    const f = await fixture(t);
    await rm(join(f.directory, missing));
    const result = f.run("--check");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ENOENT/u);
    await assert.rejects(readFile(join(f.directory, missing)), { code: "ENOENT" });
    assert.deepEqual(await readFile(join(f.directory, retained)), authored);
    await f.noBuildOutputs();
  });
}

test("explicit witness projection write refreshes drift and creates an absent copy with exact bytes", async t => {
  const f = await fixture(t);
  await writeFile(join(f.directory, projection), divergent);
  for (const remove of [false, true]) {
    if (remove) await rm(dirname(join(f.directory, projection)), { recursive: true });
    const result = f.run("--write");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(await readFile(join(f.directory, canonical)), authored);
    assert.deepEqual(await readFile(join(f.directory, projection)), authored);
    const checked = f.run("--check");
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    await f.noBuildOutputs();
  }
});

test("witness projection CLI rejects unsupported options before modifying a divergent copy", async t => {
  const f = await fixture(t);
  await writeFile(join(f.directory, projection), divergent);
  for (const args of [[], ["--unknown"], ["--check", "--write"], ["--write", "extra"]]) {
    const result = f.run(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /construction-witness-projection\.unsupported-options/u);
    assert.deepEqual(await readFile(join(f.directory, canonical)), authored);
    assert.deepEqual(await readFile(join(f.directory, projection)), divergent);
  }
  await f.noBuildOutputs();
});
