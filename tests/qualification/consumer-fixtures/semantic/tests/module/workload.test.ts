import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { assemblyFor, group } from "@get-modular/assembly";
import type { CloseReport } from "@get-modular/resources";
import type { SemanticCapabilities } from "../../src/composition/semantic.root.js";
import { sessionGroup } from "../../src/features/session/composition/session.group.js";
import { identityInput, journalInput } from "../../src/features/session/composition/session.inputs.js";
import { sessionModule } from "../../src/features/session/composition/session.module.js";
import type { JournalPort, JournalRecord } from "../../src/features/session/contracts/session.js";
import { lifetimeControls, lifetimeRunner } from "../features/runner/lifetime.js";
import { createAttempt } from "../support/attempt-owner.js";
import { barrier } from "../support/barriers.js";
import { createFileJournal, type FileJournal } from "../support/journal.js";

type Controls = ReturnType<typeof lifetimeControls>;
interface Instance {
  readonly identity: string;
  readonly controls: Controls;
  readonly journal: FileJournal;
  readonly attempt: ReturnType<typeof createAttempt>;
}
interface Admission {
  readonly instance: number;
  readonly request: number;
  readonly id: string;
  readonly status: "accepted" | "overloaded";
}
type Terminal = { readonly instance: number; readonly id: string } & (
  { readonly status: "succeeded"; readonly value: string } |
  { readonly status: "failed"; readonly cause: unknown }
);

const watchdog = { timeout: 15000 };
const complete = { complete: true, settled: true, debts: [] };
const controlsByJournal = new WeakMap<JournalPort, Controls>();
// The entries and preparation stay fixed; only declared per-run inputs select test controls.
const preparation = await assemblyFor<SemanticCapabilities>().prepare({
  profileId: "fixture/semantic/workload-test",
  modules: [group("runner", [lifetimeRunner(journal => {
    const controls = controlsByJournal.get(journal);
    assert.ok(controls, "Every run must supply its own registered journal.");
    return controls;
  })]), sessionGroup],
  roots: { session: sessionModule },
  inputs: { identity: identityInput, journal: journalInput },
});
assert.equal(preparation.status, "prepared");
if (preparation.status !== "prepared") throw new Error("fixture.preparation.failed");
const prepared = preparation.prepared;

async function createInstance(identity: string, controls: Controls): Promise<Instance> {
  const journal = await createFileJournal();
  controlsByJournal.set(journal.port, controls);
  const attempt = createAttempt(prepared, identity, journal, { capacity: Number.POSITIVE_INFINITY });
  return { identity, controls, journal, attempt };
}

async function disposeInstances(instances: readonly Instance[]): Promise<void> {
  for (const instance of instances) {
    instance.controls.holdEffect?.release();
    instance.attempt.requestStop();
  }
  const results = await Promise.allSettled(instances.map(async ({ attempt }) => {
    if (!(await attempt.stop()).complete) assert.deepEqual(await attempt.stop(), complete);
    await attempt[Symbol.asyncDispose]();
  }));
  const failures: unknown[] = results.flatMap(result => result.status === "rejected" ? [result.reason] : []);
  if (failures.length > 0) throw new AggregateError(failures, "fixture.workload.cleanup-failed");
}

function hasCode(cause: unknown, code: string): boolean {
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === code;
}

function failedCleanup(report: CloseReport, context: TestContext): void {
  assert.equal(report.complete, false);
  assert.equal(report.settled, true);
  assert.equal(report.debts.length, 1);
  const debt = report.debts[0];
  assert.ok(debt);
  assert.equal(debt.path.at(-1), "runner-a");
  assert.equal(debt.path.at(-2), "fixture/runner/runner-a/default");
  assert.equal(debt.state, "failed");
  if (debt.state !== "failed") throw new Error("fixture.expected-failed-debt");
  assert.ok(hasCode(debt.cause, "fixture.cleanup.failed"));
  context.diagnostic(JSON.stringify({ kind: "consumer-workload", row: "W-03", flight: 1,
    complete: report.complete, settled: report.settled, debt: { path: debt.path, state: debt.state,
      code: "fixture.cleanup.failed" } }));
}

async function finalInstance(instance: Instance) {
  const snapshot = instance.attempt.snapshot();
  assert.equal(snapshot.phase, "closed");
  assert.equal(snapshot.ingressOpen, false);
  assert.equal(snapshot.activeWork, 0);
  assert.deepEqual(snapshot.lastReport, complete);
  assert.ok(instance.controls.resource);
  await assert.rejects(instance.controls.resource.probe(), { code: "EBADF" });
  await assert.rejects(instance.journal.probe(), { code: "EBADF" });
  const records = await instance.journal.read();
  assert.equal(records.filter(record => record.kind === "resource-acquired").length, 1);
  const releases = records.filter(record => record.kind === "resource-released");
  assert.deepEqual(releases, [{ kind: "resource-released", scope: "runner", id: "A", value: "A" }]);
  assert.equal(records.at(-1)?.kind, "resource-released");
  const firstCleanup = records.findIndex(record => record.kind === "cleanup-attempt");
  assert.ok(firstCleanup > 0);
  const cleanup = records.filter(record => record.kind === "cleanup-attempt");
  assert.equal(cleanup.length, instance.controls.cleanupAttempts);
  for (const [index, record] of records.entries()) {
    if (record.kind === "terminal") assert.ok(index < firstCleanup, "Terminal persistence precedes cleanup.");
  }
  return { identity: instance.identity, enteredIds: [...instance.controls.enteredIds],
    effects: records.filter(record => record.kind === "effect"),
    terminals: records.filter(record => record.kind === "terminal"),
    cleanupAttempts: cleanup.length, physicalReleases: releases.length,
    resourceProbe: "EBADF", journalProbe: "EBADF", snapshot, records };
}

test("W-01: stopping the held left run preserves fresh right work after physical release", watchdog, async context => {
  const instances: Instance[] = [];
  try {
    const left = await createInstance("left", lifetimeControls({ waitForCancellation: true }));
    instances.push(left);
    const right = await createInstance("right", lifetimeControls());
    instances.push(right);
    assert.deepEqual(await Promise.all(instances.map(instance => instance.attempt.ready)), [true, true]);
    const caller = new AbortController();
    const pending = assert.rejects(left.attempt.run({ id: "left-held", payload: "hello", signal: caller.signal }),
      { code: "fixture.operation.cancelled" });
    await left.controls.entered.reached;
    assert.equal(await right.attempt.run({ id: "right-before", payload: " hello ", signal: caller.signal }), "right:A:hello");
    const stopping = left.attempt.stop();
    await pending;
    assert.deepEqual(await stopping, complete);
    assert.equal(caller.signal.aborted, false);
    await assert.rejects(left.attempt.run({ id: "left-closed", payload: "hello", signal: caller.signal }),
      { code: "fixture.ingress.closed" });
    const leftState = await finalInstance(left);
    assert.ok(right.controls.resource);
    await right.controls.resource.probe();
    await right.journal.probe();
    assert.equal(await right.attempt.run({ id: "right-after", payload: " world ", signal: caller.signal }), "right:A:world");
    assert.deepEqual(await right.attempt.stop(), complete);
    const rightState = await finalInstance(right);
    assert.deepEqual(leftState.enteredIds, ["left-held"]);
    assert.deepEqual(leftState.effects, []);
    assert.deepEqual(leftState.terminals, [
      { kind: "terminal", scope: "left", id: "left-held", value: "fixture.operation.cancelled" },
    ]);
    assert.deepEqual(rightState.enteredIds, ["right-before", "right-after"]);
    assert.deepEqual(rightState.effects, [
      { kind: "effect", scope: "right", id: "right-before", value: "right:A:hello" },
      { kind: "effect", scope: "right", id: "right-after", value: "right:A:world" },
    ]);
    assert.deepEqual(rightState.terminals, rightState.effects.map(record => ({ ...record, kind: "terminal" })));
    assert.equal(leftState.cleanupAttempts, 1);
    assert.equal(rightState.cleanupAttempts, 1);
    context.diagnostic(JSON.stringify({ kind: "consumer-workload", rows: ["W-01"],
      preparation: "shared", instances: [leftState, rightState], watchers: 0 }));
  } finally { await disposeInstances(instances); }
});

const byId = (left: JournalRecord, right: JournalRecord) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

test("W-02/W-03: 64 admissions share capacity 16 and all 16 retained owners release, including a cleanup retry", watchdog, async context => {
  const instances: Instance[] = [];
  try {
    for (let index = 0; index < 16; index += 1) {
      const controls = index === 1 ? lifetimeControls({ waitForCancellation: true }) :
        lifetimeControls({ holdEffect: barrier(), cleanupFailures: index === 15 ? 1 : 0 });
      instances.push(await createInstance(`w-${String(index).padStart(2, "0")}`, controls));
    }
    assert.deepEqual(await Promise.all(instances.map(instance => instance.attempt.ready)), Array<boolean>(16).fill(true));
    assert.equal(new Set(instances.map(instance => instance.journal.port)).size, 16);
    assert.equal(new Set(instances.map(instance => instance.controls.resource)).size, 16);
    assert.equal(new Set(instances.map(instance => instance.attempt.signal)).size, 16);
    const caller = new AbortController();
    const admissions: Admission[] = [];
    const work: { readonly instance: number; readonly completion: Promise<Terminal> }[] = [];
    let active = 0;
    let peak = 0;
    // Synchronous admission is test scheduling; the session remains the only operation owner.
    function submit(index: number, request: number): void {
      const instance = instances[index];
      assert.ok(instance);
      const id = `${instance.identity}:request-${request}`;
      if (active >= 16) {
        admissions.push({ instance: index, request, id, status: "overloaded" });
        return;
      }
      active += 1;
      peak = Math.max(peak, active);
      admissions.push({ instance: index, request, id, status: "accepted" });
      const completion = instance.attempt.run({ id, payload: ` payload-${request} `, signal: caller.signal }).then(
        (value): Terminal => ({ instance: index, id, status: "succeeded", value }),
        (cause: unknown): Terminal => ({ instance: index, id, status: "failed", cause }),
      ).finally(() => { active -= 1; });
      work.push({ instance: index, completion });
    }
    submit(0, 0);
    submit(0, 1);
    for (let index = 1; index < 15; index += 1) submit(index, 0);
    for (let index = 0; index < 16; index += 1) {
      for (let request = 0; request < 4; request += 1) {
        if ((index === 0 && request < 2) || (index > 0 && index < 15 && request === 0)) continue;
        submit(index, request);
      }
    }
    assert.equal(admissions.length, 64);
    const accepted = admissions.filter(item => item.status === "accepted");
    assert.equal(accepted.length, 16);
    assert.equal(admissions.filter(item => item.status === "overloaded").length, 48);
    assert.equal(active, 16);
    assert.equal(peak, 16);
    const distribution = [2, ...Array<number>(14).fill(1), 0];
    assert.deepEqual(instances.map((_, index) => accepted.filter(item => item.instance === index).length), distribution);
    await Promise.all(instances.slice(0, 15).map(instance => instance.controls.entered.reached));
    assert.deepEqual(instances.map(instance => instance.controls.enteredIds.length), distribution);
    assert.deepEqual(instances.map(instance => instance.attempt.snapshot().activeWork), distribution);
    for (const instance of instances) {
      assert.deepEqual((await instance.journal.read()).filter(record => record.kind === "effect" || record.kind === "terminal"), []);
    }
    assert.equal(active, 16, "All 64 observations precede any permit release.");

    const singleton = instances[1];
    const cancelled = work.find(item => item.instance === 1);
    assert.ok(singleton && cancelled);
    assert.equal(singleton.controls.holdEffect, undefined, "Cancellation has no externally released hold.");
    const stopping = singleton.attempt.stop();
    const cancelledTerminal = await cancelled.completion;
    assert.equal(cancelledTerminal.status, "failed");
    if (cancelledTerminal.status !== "failed") throw new Error("fixture.expected-cancellation");
    assert.ok(hasCode(cancelledTerminal.cause, "fixture.operation.cancelled"));
    assert.deepEqual(await stopping, complete);
    assert.equal(active, 15);
    assert.equal(caller.signal.aborted, false);
    for (const instance of instances) instance.controls.holdEffect?.release();
    const terminals = await Promise.all(work.map(item => item.completion));
    assert.equal(terminals.filter(item => item.status === "succeeded").length, 15);
    assert.equal(terminals.filter(item => item.status === "failed").length, 1);
    assert.equal(active, 0);
    for (const terminal of terminals) {
      const admission = accepted.find(item => item.id === terminal.id);
      assert.ok(admission);
      if (terminal.status === "succeeded") {
        assert.equal(terminal.value, `${instances[admission.instance]?.identity}:A:payload-${admission.request}`);
      } else assert.equal(terminal.instance, 1);
    }

    for (const instance of instances.slice(0, 15)) assert.deepEqual(await instance.attempt.stop(), complete);
    const last = instances[15];
    assert.ok(last);
    assert.deepEqual(last.controls.enteredIds, []);
    // The caller keeps no first report; the same attempt still owns retry authority.
    failedCleanup(await last.attempt.stop(), context);
    assert.equal(last.attempt.snapshot().phase, "debt");
    assert.equal(last.controls.cleanupAttempts, 1);
    assert.ok(last.controls.resource);
    await last.controls.resource.probe();
    await last.journal.probe();
    assert.deepEqual((await last.journal.read()).filter(record => record.kind === "resource-released"), []);
    assert.deepEqual(await last.attempt.stop(), complete);

    const observed = await Promise.all(instances.map(finalInstance));
    const acceptedIds = accepted.map(item => item.id).toSorted();
    const observedIds = observed.flatMap(instance => instance.enteredIds).toSorted();
    // Sort complete lists after every stop/retry; never remove duplicate runner entries.
    assert.deepEqual(observedIds, acceptedIds);
    for (const [index, instance] of observed.entries()) {
      const requests = accepted.filter(item => item.instance === index);
      assert.deepEqual(instance.enteredIds.toSorted(), requests.map(item => item.id).toSorted());
      assert.deepEqual(instance.effects.toSorted(byId), index === 1 ? [] : requests.map((item): JournalRecord => ({
        kind: "effect", scope: instance.identity, id: item.id, value: `${instance.identity}:A:payload-${item.request}`,
      })).toSorted(byId));
      assert.deepEqual(instance.terminals.toSorted(byId), requests.map((item): JournalRecord => ({
        kind: "terminal", scope: instance.identity, id: item.id,
        value: index === 1 ? "fixture.operation.cancelled" : `${instance.identity}:A:payload-${item.request}`,
      })).toSorted(byId));
      assert.equal(instance.cleanupAttempts, index === 15 ? 2 : 1);
    }
    assert.equal(observed.reduce((sum, instance) => sum + instance.cleanupAttempts, 0), 17);
    assert.equal(observed.reduce((sum, instance) => sum + instance.physicalReleases, 0), 16);
    context.diagnostic(JSON.stringify({ kind: "consumer-workload", rows: ["W-02", "W-03"], preparation: "shared",
      limit: 16, requestsPerInstance: 4, admissions, acceptedIds, observedIds,
      distribution: observed.map(instance => instance.enteredIds.length), accepted: accepted.length,
      overloaded: admissions.length - accepted.length, peak, active,
      successes: terminals.filter(item => item.status === "succeeded").length,
      cancellations: terminals.filter(item => item.status === "failed").length,
      cleanupAttempts: observed.reduce((sum, instance) => sum + instance.cleanupAttempts, 0),
      physicalReleases: observed.reduce((sum, instance) => sum + instance.physicalReleases, 0),
      instances: observed, watchers: 0 }));
  } finally { await disposeInstances(instances); }
});
