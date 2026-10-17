import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor, group } from "@get-modular/assembly";
import type { CloseReport } from "@get-modular/resources";
import type { SemanticCapabilities } from "../../src/composition/semantic.root.js";
import { sessionGroup } from "../../src/features/session/composition/session.group.js";
import { identityInput, journalInput } from "../../src/features/session/composition/session.inputs.js";
import { sessionModule } from "../../src/features/session/composition/session.module.js";
import { lifetimeControls, lifetimeRunner } from "../features/runner/lifetime.js";
import { createAttempt } from "../support/attempt-owner.js";
import { barrier } from "../support/barriers.js";
import { createFileJournal, type FileJournal } from "../support/journal.js";

const watchdog = { timeout: 10000 };
const complete = { complete: true, settled: true, debts: [] };

async function prepare(controls: ReturnType<typeof lifetimeControls>) {
  const prepared = await assemblyFor<SemanticCapabilities>().prepare({
    profileId: "fixture/semantic/lifetime-test",
    modules: [group("runner", [lifetimeRunner(controls)]), sessionGroup],
    roots: { session: sessionModule },
    inputs: { identity: identityInput, journal: journalInput },
  });
  assert.equal(prepared.status, "prepared");
  if (prepared.status !== "prepared") throw new Error("fixture.preparation.failed");
  return prepared.prepared;
}

function hasCode(cause: unknown, code: string): boolean {
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === code;
}

function failedDebt(report: CloseReport, code: string): void {
  assert.equal(report.complete, false);
  assert.equal(report.settled, true);
  assert.equal(report.debts.length, 1);
  const debt = report.debts[0];
  assert.ok(debt);
  assert.equal(debt.path.at(-1), "runner-a");
  assert.equal(debt.path.at(-2), "fixture/runner/runner-a/default");
  assert.equal(debt.state, "failed");
  if (debt.state !== "failed") throw new Error("fixture.expected-failed-debt");
  assert.ok(hasCode(debt.cause, code));
}

async function released(controls: ReturnType<typeof lifetimeControls>, journal: FileJournal): Promise<void> {
  assert.ok(controls.resource);
  await assert.rejects(controls.resource.probe(), { code: "EBADF" });
  const records = await journal.read();
  assert.equal(records.filter(record => record.kind === "resource-released").length, 1);
  assert.equal(records.at(-1)?.kind, "resource-released");
  await assert.rejects(journal.probe(), { code: "EBADF" });
}

test("L-01: a valid late factory result remains owned after stop and cannot publish", watchdog, async () => {
  const holdReturn = barrier();
  const controls = lifetimeControls({ holdReturn });
  const journal = await createFileJournal();
  await using attempt = createAttempt(await prepare(controls), "late-factory", journal);
  try {
    await controls.acquired.reached;
    assert.ok(controls.resource);
    await controls.resource.probe();
    const stopping = attempt.stop();
    assert.deepEqual(attempt.snapshot(), { identity: "late-factory", phase: "stopping", ingressOpen: false,
      publications: 0, activeWork: 0, lastReport: undefined });
    await assert.rejects(attempt.run({ id: "refused", payload: "hello", signal: attempt.signal }), { code: "fixture.ingress.closed" });
    holdReturn.release();
    const outcome = await attempt.startup;
    assert.equal(outcome.status, "cancelled");
    assert.deepEqual(outcome.created.map(entry => entry.implementationId), ["fixture/runner/runner-a/default"]);
    assert.equal(await attempt.ready, false);
    assert.deepEqual(await stopping, complete);
    assert.deepEqual(controls.enteredIds, []);
    assert.deepEqual((await journal.read()).filter(record => record.kind === "effect"), []);
    await released(controls, journal);
  } finally { holdReturn.release(); }
});

test("L-02: late test-owned readiness cannot reopen stopped ingress", watchdog, async () => {
  const readiness = barrier();
  const controls = lifetimeControls();
  const journal = await createFileJournal();
  await using attempt = createAttempt(await prepare(controls), "late-readiness", journal, { readiness: readiness.reached });
  try {
    assert.equal((await attempt.startup).status, "succeeded");
    assert.equal(attempt.snapshot().publications, 0);
    const stopping = attempt.stop();
    await journal.probe();
    readiness.release();
    assert.equal(await attempt.ready, false);
    assert.deepEqual(await stopping, complete);
    assert.equal(attempt.snapshot().ingressOpen, false);
    assert.equal(attempt.snapshot().publications, 0);
    assert.deepEqual(controls.enteredIds, []);
    await released(controls, journal);
  } finally { readiness.release(); }
});

test("L-03: stop before the publication commit prevents publication", watchdog, async () => {
  const publication = barrier();
  const controls = lifetimeControls();
  const journal = await createFileJournal();
  await using attempt = createAttempt(await prepare(controls), "stop-first", journal, { beforePublication: publication.reached });
  try {
    assert.equal((await attempt.startup).status, "succeeded");
    attempt.requestStop();
    publication.release();
    assert.equal(await attempt.ready, false);
    assert.equal(attempt.snapshot().publications, 0);
    await assert.rejects(attempt.run({ id: "after-stop", payload: "hello", signal: attempt.signal }), { code: "fixture.ingress.closed" });
    assert.deepEqual(await attempt.stop(), complete);
    await released(controls, journal);
  } finally { publication.release(); }
});

test("L-03: a committed publication is retained when stop later closes ingress", watchdog, async () => {
  const controls = lifetimeControls();
  const journal = await createFileJournal();
  await using attempt = createAttempt(await prepare(controls), "publish-first", journal);
  assert.equal(await attempt.ready, true);
  assert.equal(attempt.snapshot().publications, 1);
  assert.equal(await attempt.run({ id: "before-stop", payload: " hello ", signal: attempt.signal }), "publish-first:A:hello");
  attempt.requestStop();
  assert.equal(attempt.snapshot().publications, 1);
  assert.equal(attempt.snapshot().ingressOpen, false);
  await assert.rejects(attempt.run({ id: "after-stop", payload: "hello", signal: attempt.signal }), { code: "fixture.ingress.closed" });
  assert.deepEqual(await attempt.stop(), complete);
  assert.equal(attempt.snapshot().publications, 1);
  await released(controls, journal);
});

test("L-04: an accepted callback requests stop without joining its own drain", watchdog, async () => {
  const participantStopped = barrier();
  const finishParticipant = barrier();
  const controls = lifetimeControls();
  const journal = await createFileJournal();
  const events: string[] = [];
  const callbackJournal: FileJournal = { ...journal, port: { append: async record => {
    if (record.kind === "terminal") {
      assert.equal(attempt.requestStop(), undefined);
      assert.equal(attempt.signal.aborted, true);
      events.push("request-stop");
      participantStopped.release();
      await finishParticipant.reached;
      await journal.probe();
    }
    await journal.port.append(record);
    if (record.kind === "terminal") events.push("participant-finished");
  } } };
  await using attempt = createAttempt(await prepare(controls), "participant", callbackJournal);
  try {
    assert.equal(await attempt.ready, true);
    const operation = attempt.run({ id: "callback", payload: "hello", signal: attempt.signal });
    await participantStopped.reached;
    assert.equal(attempt.snapshot().activeWork, 1);
    const stopping = attempt.stop();
    await journal.probe();
    finishParticipant.release();
    assert.equal(await operation, "participant:A:hello");
    assert.deepEqual(await stopping, complete);
    assert.deepEqual(events, ["request-stop", "participant-finished"]);
    assert.equal(attempt.snapshot().activeWork, 0);
    const records = await journal.read();
    assert.ok(records.findIndex(record => record.kind === "terminal") < records.findIndex(record => record.kind === "cleanup-attempt"));
    await released(controls, journal);
  } finally { finishParticipant.release(); }
});

test("L-05: stop itself releases work waiting only on the operation cancellation signal", watchdog, async () => {
  const controls = lifetimeControls({ waitForCancellation: true });
  const journal = await createFileJournal();
  await using attempt = createAttempt(await prepare(controls), "cancel-work", journal);
  assert.equal(await attempt.ready, true);
  const caller = new AbortController();
  const cancelled = assert.rejects(attempt.run({ id: "pending", payload: "hello", signal: caller.signal }), { code: "fixture.operation.cancelled" });
  await controls.entered.reached;
  const stopping = attempt.stop();
  await cancelled;
  assert.deepEqual(await stopping, complete);
  assert.equal(caller.signal.aborted, false);
  assert.equal(attempt.snapshot().activeWork, 0);
  const records = await journal.read();
  assert.deepEqual(records.filter(record => record.kind === "effect"), []);
  assert.deepEqual(records.filter(record => record.kind === "terminal"), [
    { kind: "terminal", scope: "cancel-work", id: "pending", value: "fixture.operation.cancelled" },
  ]);
  assert.ok(records.findIndex(record => record.kind === "terminal") < records.findIndex(record => record.kind === "cleanup-attempt"));
  await released(controls, journal);
});

test("L-06: setup owns and physically releases its partial acquisition before rethrowing", watchdog, async () => {
  const controls = lifetimeControls({ failSetup: true });
  const journal = await createFileJournal();
  await using attempt = createAttempt(await prepare(controls), "partial-setup", journal);
  const outcome = await attempt.startup;
  assert.equal(outcome.status, "failed");
  if (outcome.status !== "failed") throw new Error("fixture.expected-setup-failure");
  assert.equal(outcome.code, "assembly.run.factory-rejected");
  assert.ok(hasCode(outcome.cause, "fixture.setup.failed"));
  assert.deepEqual(outcome.created, []);
  assert.deepEqual(controls.events, ["partial-release-complete"]);
  assert.equal(controls.cleanupAttempts, 0);
  assert.ok(controls.resource);
  await assert.rejects(controls.resource.probe(), { code: "EBADF" });
  assert.equal((await journal.read()).filter(record => record.kind === "resource-released").length, 1);
  await journal.probe();
  assert.deepEqual(await attempt.stop(), complete);
  await released(controls, journal);
});

test("L-07: the retained attempt retries after its first incomplete report is discarded", watchdog, async () => {
  const holdRelease = barrier();
  const controls = lifetimeControls({ cleanupFailures: 1, holdRelease });
  const journal = await createFileJournal();
  await using attempt = createAttempt(await prepare(controls), "retry-owner", journal);
  try {
    assert.equal(await attempt.ready, true);
    // No caller variable retains the first report; the attempt remains the retry authority.
    failedDebt(await attempt.stop(), "fixture.cleanup.failed");
    assert.equal(attempt.snapshot().phase, "debt");
    assert.equal(attempt.snapshot().lastReport?.complete, false);
    assert.ok(controls.resource);
    await controls.resource.probe();
    const retry = attempt.stop();
    await controls.releaseEntered.reached;
    await journal.port.append({ kind: "terminal", scope: "retry-owner", id: "journal-witness", value: "retry-journal-alive" });
    assert.ok((await journal.read()).some(record => record.value === "retry-journal-alive"));
    await journal.probe();
    await controls.resource.probe();
    holdRelease.release();
    assert.deepEqual(await retry, complete);
    assert.equal(controls.cleanupAttempts, 2);
    assert.deepEqual(controls.events, ["cleanup:1", "cleanup:2", "release-complete"]);
    assert.deepEqual((await journal.read()).filter(record => record.kind === "cleanup-attempt").map(record => record.value), ["1", "2"]);
    await released(controls, journal);
  } finally { holdRelease.release(); }
});

test("L-07 counterexample: early native journal close makes the same owner's retry fail", watchdog, async () => {
  const controls = lifetimeControls({ cleanupFailures: 1 });
  const original = await createFileJournal();
  let backing = original;
  const journal: FileJournal = {
    port: { append: record => backing.port.append(record) },
    read: () => backing.read(), probe: () => backing.probe(), close: () => backing.close(),
    [Symbol.asyncDispose]: () => backing[Symbol.asyncDispose](),
  };
  const attempt = createAttempt(await prepare(controls), "early-journal", journal);
  try {
    assert.equal(await attempt.ready, true);
    failedDebt(await attempt.stop(), "fixture.cleanup.failed");
    await original.close();
    await assert.rejects(original.probe(), { code: "EBADF" });
    failedDebt(await attempt.stop(), "EBADF");
    assert.equal(controls.cleanupAttempts, 2);
    assert.deepEqual(controls.events, ["cleanup:1", "cleanup:2"]);
    assert.ok(controls.resource);
    await controls.resource.probe();
  } finally {
    // Restore only the broken test prerequisite so this deliberate counterexample leaves no native handle behind.
    backing = await createFileJournal();
    try {
      assert.deepEqual(await attempt.stop(), complete);
      assert.ok(controls.resource);
      await assert.rejects(controls.resource.probe(), { code: "EBADF" });
    } finally {
      await attempt[Symbol.asyncDispose]();
      await original[Symbol.asyncDispose]();
    }
  }
});

test("L-08: one abandoning observer cannot replace the owner's shared close flight", watchdog, async () => {
  const holdRelease = barrier();
  const controls = lifetimeControls({ holdRelease });
  const journal = await createFileJournal();
  await using attempt = createAttempt(await prepare(controls), "abandon-observer", journal);
  try {
    assert.equal(await attempt.ready, true);
    assert.throws(() => attempt.observeClose({}), { code: "fixture.close.not-started" });
    assert.equal(controls.cleanupAttempts, 0);
    const owner = attempt.stop();
    assert.equal(attempt.stop(), owner);
    await attempt.closeStarted;
    await controls.releaseEntered.reached;
    const abandon = new AbortController();
    const observing = attempt.observeClose({ abandon: abandon.signal });
    abandon.abort("fixture.waiter.abandon");
    const snapshot = await observing;
    assert.equal(snapshot.complete, false);
    assert.equal(snapshot.settled, false);
    assert.ok(snapshot.debts.some(debt => debt.state === "pending"));
    assert.equal(attempt.snapshot().lastReport, undefined);
    assert.equal(controls.cleanupAttempts, 1);
    assert.ok(controls.resource);
    await controls.resource.probe();
    await journal.probe();
    holdRelease.release();
    const final = await owner;
    assert.deepEqual(final, complete);
    assert.equal(attempt.snapshot().lastReport, final);
    assert.equal(attempt.snapshot().phase, "closed");
    assert.equal(controls.cleanupAttempts, 1);
    assert.throws(() => attempt.observeClose({}), { code: "fixture.close.not-started" });
    await released(controls, journal);
  } finally { holdRelease.release(); }
});

test("L-09: the effect port checks permission after its hold while terminal and cleanup writes stay authorized", watchdog, async () => {
  const holdEffect = barrier();
  const controls = lifetimeControls({ holdEffect });
  const journal = await createFileJournal();
  await using attempt = createAttempt(await prepare(controls), "effect-permission", journal);
  try {
    assert.equal(await attempt.ready, true);
    const caller = new AbortController();
    const refused = assert.rejects(attempt.run({ id: "effect-refused", payload: "hello", signal: caller.signal }), { code: "fixture.effect.forbidden" });
    await controls.effectHeld.reached;
    controls.effectAllowed = false;
    holdEffect.release();
    await refused;
    assert.equal(caller.signal.aborted, false);
    assert.deepEqual((await journal.read()).filter(record => record.kind === "effect"), []);
    assert.deepEqual((await journal.read()).filter(record => record.kind === "terminal"), [
      { kind: "terminal", scope: "effect-permission", id: "effect-refused", value: "fixture.effect.forbidden" },
    ]);
    assert.deepEqual(await attempt.stop(), complete);
    assert.equal((await journal.read()).filter(record => record.kind === "cleanup-attempt").length, 1);
    await released(controls, journal);
  } finally { holdEffect.release(); }
});

test("L-10: capacity one rejects overload without entry, and private stop cancels the accepted operation", watchdog, async () => {
  const controls = lifetimeControls({ waitForCancellation: true });
  const journal = await createFileJournal();
  await using attempt = createAttempt(await prepare(controls), "capacity-one", journal, { capacity: 1 });
  assert.equal(await attempt.ready, true);
  const caller = new AbortController();
  const cancelled = assert.rejects(attempt.run({ id: "accepted", payload: "hello", signal: caller.signal }), { code: "fixture.operation.cancelled" });
  await controls.entered.reached;
  await assert.rejects(attempt.run({ id: "overloaded", payload: "hello", signal: caller.signal }), { code: "fixture.operation.overloaded" });
  assert.equal(attempt.snapshot().activeWork, 1);
  assert.deepEqual(controls.enteredIds, ["accepted"]);
  assert.equal(attempt.requestStop(), undefined);
  await assert.rejects(attempt.run({ id: "closed", payload: "hello", signal: caller.signal }), { code: "fixture.ingress.closed" });
  await cancelled;
  assert.deepEqual(await attempt.stop(), complete);
  assert.equal(caller.signal.aborted, false);
  assert.equal(attempt.snapshot().activeWork, 0);
  assert.deepEqual(controls.enteredIds, ["accepted"]);
  assert.deepEqual((await journal.read()).filter(record => record.kind === "effect"), []);
  assert.deepEqual((await journal.read()).filter(record => record.kind === "terminal").map(record => record.id), ["accepted"]);
  await released(controls, journal);
});
