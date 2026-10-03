// Run as: node --expose-gc s1-probe.mjs. Prints one JSON line with the fastest
// time in milliseconds of each phase in its split and its whole form.
// Both forms do the same work: SIZE entries spread over PARTS scopes, or held
// by one scope. Linear code takes about as long either way; work per entry
// that grows with its scope makes the whole form slower. Both forms keep the
// same live heap and alternate after a full collection, so collector work
// and a slow moment of the machine reach them alike.
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { createScope } from "../dist/index.js";

const SIZE = 50000;
const PARTS = 25;
const RUNS = 3;
const collect = globalThis.gc;
assert.equal(typeof collect, "function", "run the probe with --expose-gc");
// Capturing a stack for every close reason is a fixed cost per scope that
// would hide growth per entry.
Error.stackTraceLimit = 0;

async function children(parts) {
  const parents = Array.from({ length: parts }, (_, index) => createScope({ name: `host${index}` }));
  const scopes = [];
  collect();
  let started = performance.now();
  for (const parent of parents) {
    for (let index = 0; index < SIZE / parts; index += 1) {
      const child = parent.resources.child({ name: `s${index}` });
      child.resources.use({ [Symbol.dispose]: () => {} }, "r");
      scopes.push(child);
    }
  }
  const create = performance.now() - started;
  for (const parent of parents) assert.equal(getEventListeners(parent.resources.signal, "abort").length, 0);
  collect();
  started = performance.now();
  for (const child of scopes) await child.control.close(); // oldest first in every parent
  const detach = performance.now() - started;
  for (const parent of parents) assert.equal((await parent.control.close()).complete, true);
  return { create, detach };
}

// One shared cause keeps a failed cleanup cheap, so the retry path dominates.
const failure = new Error("x");
async function debts(parts) {
  const scopes = Array.from({ length: parts }, (_, index) => createScope({ name: `m${index}` }));
  for (const scope of scopes) {
    for (let index = 0; index < SIZE / parts; index += 1) {
      scope.resources.use({ [Symbol.dispose]: () => { throw failure; } }, `f${index}`);
    }
  }
  collect();
  const started = performance.now();
  for (const scope of scopes) {
    assert.equal((await scope.control.close()).debts.length, SIZE / parts);
    assert.equal((await scope.control.close()).debts.length, SIZE / parts);
  }
  return { retry: performance.now() - started };
}

const split = {};
const whole = {};
const keep = (target, sample) => {
  for (const [key, value] of Object.entries(sample)) target[key] = Math.min(target[key] ?? Infinity, value);
};
await children(PARTS); // warm-up, not timed
await debts(PARTS);
// Later runs start only within 15 s, so a quadratic build still exits before the test's timeout.
const deadline = performance.now() + 15000;
for (let run = 0; run < RUNS && (run === 0 || performance.now() < deadline); run += 1) {
  keep(split, await children(PARTS));
  keep(whole, await children(1));
  keep(split, await debts(PARTS));
  keep(whole, await debts(1));
}
process.stdout.write(`${JSON.stringify({ split, whole })}\n`);
