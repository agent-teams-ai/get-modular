import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as resources from "../dist/index.js";
import { runSemanticSuite } from "./semantic-suite.mjs";

const tests = dirname(fileURLToPath(import.meta.url));
const distURL = pathToFileURL(join(tests, "../dist/index.js")).href;
const node = (args, input) => spawnSync(process.execPath, args,
  { encoding: "utf8", input, timeout: 60000, env: { ...process.env, NODE_OPTIONS: "" } });

test("local build scope semantics", async (context) => {
  await runSemanticSuite(resources, context);
});

test("R5 only the late refusal is pre-handled: a setup that throws without await still crashes", () => {
  const result = node(["--input-type=module", "-"], `
    import { createScope } from ${JSON.stringify(distURL)};
    void createScope({ name: "m" }).resources.setup({ name: "x", setup: () => { throw new Error("setup-boom"); }, cleanup: () => {} });
  `);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /setup-boom/u);
});

test("G1 a detached child is collectable while its parent stays reachable", () => {
  const result = node(["--expose-gc", join(tests, "gc-probe.mjs")]);
  assert.equal(result.status, 0, result.stderr);
  const { alive, parentComplete } = JSON.parse(result.stdout);
  assert.ok(alive <= 20, `children still reachable after detach: ${alive} of 2000`);
  assert.equal(parentComplete, true);
});

// S1 runs in a probe process with --expose-gc. It times the same 50k entries
// spread over 25 scopes and held by one scope; linear code takes about as long
// either way. The bound keeps at least 1.4x room above the slowest clean run
// measured under CPU load and below the mildest quadratic mutant: attach
// copying the slot list, detach splicing or compacting per child, retry
// unshifting or copying the failed list. Absolute timings are only reported.
test("S1 attach, detach and failed retries stay linear at 50k children", (context) => {
  const bound = 3;
  const result = node(["--expose-gc", join(tests, "s1-probe.mjs")]);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const { split, whole } = JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
  context.diagnostic(JSON.stringify({ split, whole }));
  for (const key of ["create", "detach", "retry"]) {
    const ratio = whole[key] / split[key];
    assert.ok(ratio <= bound, `${key} grows with the scope: ${ratio.toFixed(2)}x > ${bound}x`);
  }
});
