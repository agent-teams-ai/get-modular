// Executed by packed-root.test.ts before Effect exists in the consumer installation.
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { createScope } from "@get-modular/resources";
import { eventTargetProgress } from "./event-target.ts";
import { Progress as SessionProgress, prepareProgressSession, runNeutralProgressExample } from "./neutral-session.ts";
import { progressFixture, type ProgressEvent } from "./progress.ts";

assert.throws(() => import.meta.resolve("effect"), { code: "ERR_MODULE_NOT_FOUND" });

// The complete ordinary example uses real listeners, while an external sibling
// demonstrates that session cleanup cannot retire the borrowed source.
const target = new EventTarget();
const ordinary = eventTargetProgress(target);
const externalSeen: ProgressEvent[] = [];
const external = ordinary.source.subscribe(value => { externalSeen.push(value); return undefined; });
try {
  for (let session = 0; session < 2; session += 1) {
    const summary = await runNeutralProgressExample(target);
    assert.deepEqual(summary.first, { count: 2, completed: 1 });
    assert.deepEqual(summary.sibling, { count: 4, completed: 3 });
    assert.deepEqual(summary.fresh, { count: 1, completed: 3 });
    assert.equal(summary.reports.length, 2);
    assert.ok(summary.reports.every(report => report.complete && report.settled && report.debts.length === 0));
    assert.equal(getEventListeners(target, "progress").length, 1, "only the external listener remains");
  }
  const mutable = { jobId: "still-alive", completed: 4 };
  ordinary.publish(mutable);
  mutable.completed = 99;
  assert.equal(externalSeen.length, 9);
  assert.deepEqual(externalSeen.at(-1), { jobId: "still-alive", completed: 4 });
  assert.ok(Object.isFrozen(externalSeen.at(-1)), "published records stay stable");
} finally { external(); }
assert.equal(getEventListeners(target, "progress").length, 0);

// The same module handles synchronous registration emissions and an owned
// construction failure. Each attempt closes only its own acquired resources.
const sessionGraph = await prepareProgressSession();
const failedBody = createScope({ name: "failed-body" });
const bodyFailure = new Error("session work failed");
let readRetired = () => ({ count: 0, completed: 0 });
await assert.rejects(async () => {
  try {
    const outcome = await sessionGraph.run({ scope: failedBody.resources,
      inputs: { source: { [SessionProgress.id]: ordinary.source } } });
    assert.equal(outcome.status, "succeeded");
    if (outcome.status !== "succeeded") throw new Error("progress construction failed");
    readRetired = outcome.roots.receiver.read;
    assert.equal(getEventListeners(target, "progress").length, 1);
    ordinary.publish({ jobId: "failed-body", completed: 1 });
    throw bodyFailure;
  } finally {
    const report = await failedBody.control.close();
    assert.ok(report.complete && report.settled);
  }
}, error => error === bodyFailure);
assert.equal(getEventListeners(target, "progress").length, 0);
ordinary.publish({ jobId: "late", completed: 99 });
assert.deepEqual(readRetired(), { count: 1, completed: 1 }, "retired consumer sees no later work");

for (const failure of [undefined, new Error("registration refused")]) {
  const synchronous = progressFixture({ initial: [{ jobId: "registration", completed: 7 }],
    ...(failure === undefined ? {} : { acquireFailure: failure }) });
  const attempt = createScope({ name: "registration" });
  try {
    const outcome = await sessionGraph.run({ scope: attempt.resources,
      inputs: { source: { [SessionProgress.id]: synchronous.source } } });
    if (failure === undefined) {
      assert.equal(outcome.status, "succeeded");
      if (outcome.status !== "succeeded") throw new Error("progress construction failed");
      assert.deepEqual(outcome.roots.receiver.read(), { count: 1, completed: 7 });
    } else {
      assert.equal(outcome.status, "failed");
      if (outcome.status !== "failed") throw new Error("progress construction must fail");
      assert.equal(outcome.cause, failure);
    }
  } finally {
    const report = await attempt.control.close();
    assert.ok(report.complete && report.settled);
  }
  assert.equal(synchronous.inspect().live, 0);
  assert.equal(synchronous.inspect().acquired, synchronous.inspect().released);
}

// Reusing a callback must still create independent subscriptions.
const independent = progressFixture();
const independentSeen: ProgressEvent[] = [];
const sharedListener = (value: ProgressEvent): undefined => { independentSeen.push(value); return undefined; };
const first = independent.source.subscribe(sharedListener);
const second = independent.source.subscribe(sharedListener);
assert.deepEqual(independent.inspect(), { live: 2, acquired: 2, released: 0 });
independent.emit({ jobId: "independent", completed: 1 });
assert.deepEqual(independentSeen.map(value => value.completed), [1, 1]);
first();
try {
  independent.emit({ jobId: "independent", completed: 2 });
  assert.deepEqual(independentSeen.map(value => value.completed), [1, 1, 2]);
  assert.deepEqual(independent.inspect(), { live: 1, acquired: 2, released: 1 });
} finally { second(); }
assert.deepEqual(independent.inspect(), { live: 0, acquired: 2, released: 2 });

// Rolling back a failed acquisition must not remove an existing registration.
const rollback = progressFixture({ initial: [{ jobId: "rollback", completed: 0 }] });
const rollbackSeen: ProgressEvent[] = [];
const acquisitionFailure = new Error("second subscription rejected");
let deliveries = 0;
const repeatedListener = (value: ProgressEvent): undefined => {
  deliveries += 1;
  if (deliveries === 2) throw acquisitionFailure;
  rollbackSeen.push(value);
  return undefined;
};
const survivor = rollback.source.subscribe(repeatedListener);
try {
  assert.throws(() => rollback.source.subscribe(repeatedListener), error => error === acquisitionFailure);
  assert.deepEqual(rollback.inspect(), { live: 1, acquired: 1, released: 0 });
  rollback.emit({ jobId: "rollback", completed: 1 });
  assert.deepEqual(rollbackSeen.map(value => value.completed), [0, 1]);
} finally { survivor(); }
assert.deepEqual(rollback.inspect(), { live: 0, acquired: 1, released: 1 });
