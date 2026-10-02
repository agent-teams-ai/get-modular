import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { getEventListeners } from "node:events";
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

// Relative bounds only: linear work grows about tenfold between the sizes,
// quadratic work up to a hundredfold. The fastest of three runs filters
// scheduler and collector noise; absolute timings are reported, not asserted.
test("S1 attach, detach and failed retries stay linear at 50k children", async (context) => {
  const { createScope } = resources;
  const childrenRun = async (count) => {
    const parent = createScope({ name: "host" });
    const children = [];
    let started = performance.now();
    for (let index = 0; index < count; index += 1) {
      const child = parent.resources.child({ name: `s${index}` });
      child.resources.use({ [Symbol.dispose]: () => {} }, "r");
      children.push(child);
    }
    const create = performance.now() - started;
    assert.equal(getEventListeners(parent.resources.signal, "abort").length, 0);
    started = performance.now();
    for (const child of children) await child.control.close();
    const detach = performance.now() - started;
    assert.equal((await parent.control.close()).complete, true);
    return { create, detach };
  };
  const debtsRun = async (count) => {
    const scope = createScope({ name: "m" });
    for (let index = 0; index < count; index += 1) {
      scope.resources.use({ [Symbol.dispose]: () => { throw new Error("x"); } }, `f${index}`);
    }
    const started = performance.now();
    await scope.control.close();
    await scope.control.close();
    return { retry: performance.now() - started };
  };
  const fastest = async (run, count) => {
    const runs = [];
    for (let attempt = 0; attempt < 3; attempt += 1) runs.push(await run(count));
    return Object.fromEntries(Object.keys(runs[0]).map(key => [key, Math.min(...runs.map(entry => entry[key]))]));
  };
  const small = { ...await fastest(childrenRun, 5000), ...await fastest(debtsRun, 2000) };
  const large = { ...await fastest(childrenRun, 50000), ...await fastest(debtsRun, 20000) };
  context.diagnostic(JSON.stringify({ small, large }));
  for (const [key, bound] of [["create", 25], ["detach", 20], ["retry", 20]]) {
    assert.ok(large[key] <= bound * Math.max(small[key], 1), `${key} grows superlinearly`);
  }
});
