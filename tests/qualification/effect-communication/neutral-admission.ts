// Executed from installed public archives before Effect is installed.
import assert from "node:assert/strict";
import { createStore, type ListenerError, type ReadonlyStore } from "@get-modular/observation";
import { delivered, liveSubscriptions } from "@get-modular/observation/testing";
import { createScope, scoped } from "@get-modular/resources";
import { watchProgress, type ProgressState } from "./watch-progress.ts";

assert.throws(() => import.meta.resolve("effect"), { code: "ERR_MODULE_NOT_FOUND" });
const owner = createScope({ name: "ordinary-admission" });
const reports: ListenerError[] = [];
const store = createStore({ completed: 0 }, { name: "ordinary-progress", resources: owner.resources,
  maxSubscriptions: 1, reportError: report => { reports.push(report); return undefined; } });
const facet = store.readonly();
const first = owner.resources.child({ name: "first" });
const second = owner.resources.child({ name: "refused" });
let refusedCause: unknown;
const traced: ReadonlyStore<ProgressState> = {
  ...facet,
  watch: (snapshot, spec) => {
    try { return facet.watch(snapshot, spec); }
    catch (cause) { refusedCause = cause; throw cause; }
  },
};
try {
  const seen: number[] = [];
  const admission = watchProgress(facet, { name: "progress/latest", resources: first.resources,
    onChange: snapshot => { seen.push(snapshot.values.completed); return undefined; } });
  assert.equal(admission.status, "subscribed");
  if (admission.status !== "subscribed") throw new Error("initial watch refused");
  seen.push(admission.initial.values.completed);
  assert.equal(liveSubscriptions(facet), 1);

  const refused = watchProgress(traced, { name: "progress/latest", resources: second.resources,
    onChange: () => { assert.fail("a refused watch must not receive changes"); } });
  assert.equal(refused.status, "refused");
  if (refused.status !== "refused") throw new Error("subscription limit was not enforced");
  assert.equal(refused.failure._tag, "ProgressSubscriptionLimit");
  assert.equal(refused.failure.cause, refusedCause);
  assert.ok(refusedCause instanceof Error && "code" in refusedCause
    && refusedCause.code === "observation.subscriptions.limit");
  assert.equal(liveSubscriptions(facet), 1);
  // Cancellation may carry any owner reason, including the earlier limit error.
  const cancelledWatch = scoped("cancelled-watch", (_deps: undefined, { resources }) =>
    watchProgress(facet, { name: "progress/latest", resources, onChange: () => undefined }));
  let reasonReads = 0;
  const arbitraryReason = { get code() { reasonReads += 1; throw new Error("do not inspect cancellation reasons"); } };
  for (const reason of [refusedCause, arbitraryReason]) {
    assert.throws(() => cancelledWatch(undefined, {
      signal: AbortSignal.abort(reason), scope: owner.resources,
    }), cause => cause === reason, "scope cancellation remains a throw with the original reason");
  }
  assert.equal(reasonReads, 0, "an arbitrary cancelled reason must not be inspected for admission classification");
  assert.equal(liveSubscriptions(facet), 1);
  // An untyped caller's invalid spec must retain Observation's original failure.
  assert.throws(() => Reflect.apply(watchProgress, undefined, [traced, {
    name: "invalid", resources: undefined, onChange: () => undefined,
  }]), cause => cause === refusedCause && cause instanceof Error && "code" in cause
    && cause.code === "observation.argument.invalid");
  const refusedClose = await second.control.close();
  assert.equal(refusedClose.complete && refusedClose.settled, true);

  store.set({ completed: 1 });
  await delivered({ stores: [facet] });
  assert.deepEqual(seen, [0, 1], "the admitted consumer survives another's refusal");
  const firstClose = await first.control.close();
  assert.equal(firstClose.complete && firstClose.settled, true);
  assert.equal(liveSubscriptions(facet), 0);

  // A new caller decision after capacity is released, never an automatic retry.
  const third = owner.resources.child({ name: "readmitted" });
  const recovered: number[] = [];
  const readmission = watchProgress(facet, { name: "progress/latest", resources: third.resources,
    onChange: snapshot => { recovered.push(snapshot.values.completed); return undefined; } });
  assert.equal(readmission.status, "subscribed");
  if (readmission.status !== "subscribed") throw new Error("released capacity was not reusable");
  recovered.push(readmission.initial.values.completed);
  store.set({ completed: 2 });
  await delivered({ stores: [facet] });
  assert.deepEqual(recovered, [1, 2]);
  assert.deepEqual(seen, [0, 1], "retired consumers stay detached");
  const thirdClose = await third.control.close();
  assert.equal(thirdClose.complete && thirdClose.settled, true);
  assert.equal(liveSubscriptions(facet), 0);
  assert.deepEqual(reports, []);
} finally {
  const report = await owner.control.close();
  assert.equal(report.complete && report.settled, true);
  assert.equal(liveSubscriptions(facet), 0);
}
