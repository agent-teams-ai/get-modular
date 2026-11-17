// Executed by packed-root.test.ts before Effect exists in the consumer installation.
import assert from "node:assert/strict";
import { assemblyFor, declareModule, defineContract, implement, input, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { progressFixture, type ProgressEvent, type ProgressSource } from "./progress.ts";

assert.throws(() => import.meta.resolve("effect"), { code: "ERR_MODULE_NOT_FOUND" });
const Progress = defineContract<ProgressSource>()({ id: "neutral/progress", revision: 1 });
interface Ports extends CapabilitiesOf<typeof Progress> {}
const owner = { authority: "neutral", path: ["progress"] };
const source = input<Ports>()(declareModule({ moduleId: "neutral/source", implementationId: "neutral/source",
  owner, provides: [Progress.provide()], slots: [] }));
const receiver = implement<Ports>()(declareModule({ moduleId: "neutral/receiver", implementationId: "neutral/receiver",
  owner, provides: [], slots: [Progress.slot("progress", required())] }),
async deps => ({ instance: deps.progress, capabilities: {} }));
const preparation = await assemblyFor<Ports>().prepare({ profileId: "neutral/progress",
  modules: [receiver], roots: { receiver }, inputs: { source } });
assert.equal(preparation.status, "prepared");
if (preparation.status !== "prepared") throw new Error("neutral recipe preparation failed");
const fixture = progressFixture();
const outcome = await preparation.prepared.run({ inputs: { source: { [Progress.id]: fixture.source } } });
assert.equal(outcome.status, "succeeded");
if (outcome.status !== "succeeded") throw new Error("neutral recipe construction failed");
assert.equal(outcome.roots.receiver, fixture.source);
const seen: ProgressEvent[] = [];
const unsubscribe = outcome.roots.receiver.subscribe(value => { seen.push(value); return undefined; });
try {
  const duplicate = { jobId: "ordinary", completed: 1 };
  fixture.emit(duplicate);
  fixture.emit(duplicate);
  assert.deepEqual(seen, [duplicate, duplicate]);
} finally { unsubscribe(); }
assert.deepEqual(fixture.inspect(), { live: 0, acquired: 1, released: 1 });

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
