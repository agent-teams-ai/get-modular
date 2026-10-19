import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
const cwd = dirname(dirname(fileURLToPath(import.meta.url)));
function probe(file, mode, flags = []) {
  const result = spawnSync(process.execPath, [...flags, `tests/${file}.mjs`, mode], {
    cwd, env: { ...process.env, NODE_OPTIONS: "", NODE_TEST_CONTEXT: "" }, timeout: 60000, encoding: "utf8",
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}
for (const mode of ["subscriber-closed", "store-closed", "als-retention"]) {
  test(`T34 T35 T45 T58 T113 T115 [P3 P4 R2 R19] GC ${mode}`, () => {
    const result = probe("gc-probe", mode, ["--expose-gc"]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const counts = JSON.parse(result.stdout.trim());
    assert.ok(counts.alive <= 2); assert.equal(counts.controlAlive, 200);
  });
}
for (const mode of ["fake-before", "fake-clock-before", "no-builtin-module", "no-node"]) {
  test(`T06 T57 T62 T70 T73 [R14] environment ${mode}`, () => {
    const result = probe("env-probe", mode, ["--import", `./tests/env-setup-${mode}.mjs`]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, new RegExp(`ok ${mode}`));
  });
}
test("T55 T109 unhandled fire-and-forget echo exits after exactly one report", () => {
  const result = probe("process-probe", "echo-exit");
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout.split("\n").filter(line => line === "REPORT observation.delivery.echo").length, 1);
});
for (const mode of ["abort-listener-unhandled", "throwing-reporter"]) test(`T42 T66 T109 ${mode} surfaces an uncaught exception`, () => {
  const result = probe("process-probe", mode);
  assert.equal(result.status, 1); assert.match(result.stderr, mode === "throwing-reporter" ? /reporter boom/ : /listener boom/);
});
test("T66 T109 abort listener failure leaves healthy later delivery usable", () => {
  const result = probe("process-probe", "abort-listener");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { uncaught: ["listener boom"], seen: [2] });
});
for (const mode of ["import-idle", "return-isolation"]) test(`T64 T114 [R18] ${mode}`, () => {
  const result = probe("process-probe", mode);
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, new RegExp(`ok ${mode}`));
});
