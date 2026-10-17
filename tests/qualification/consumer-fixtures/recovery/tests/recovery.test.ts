import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { OperationOwner, readReconcileOnly } from "../src/operation-owner.js";
import {
  BOUNDARY_RESULT, CANCELLED, SUCCESS, bytes, caps, emptySnapshot, failure, freshToken, makeSubmission, record, snapshot, submission,
  type Profile, type StoredRecord,
} from "../src/schema.js";
import { SnapshotStore, type StoreStage } from "../src/store.js";
import { Supervisor, type WorkerClient } from "../src/supervisor.js";

const watchdog = { timeout: 20000 };
const operation = makeSubmission();
const profiles: readonly Profile[] = ["record-only", "restart-pending"];

function pending(id = "operation"): StoredRecord {
  return record({ ...makeSubmission(id), state: "pending", claim: null, cancel: false, cleanupDebt: false, child: null, result: null });
}
async function barrier(supervisor: Supervisor, worker: WorkerClient, name: string): Promise<void> {
  await supervisor.wait("barrier", value => value.workerPid === worker.pid && value.barrier === name);
}
function healthy(supervisor: Supervisor, allowed: readonly string[] = []): void {
  assert.deepEqual(supervisor.events.filter(value => value.kind === "worker-fatal" || value.kind === "protocol-error" ||
    value.kind === "dispatch-error" && !allowed.includes(value.code ?? "")), []);
}
function physical(supervisor: Supervisor, launches: number, exited: number): void {
  const counts = supervisor.counts();
  assert.equal(counts.launches, launches, "actual sibling spawn count");
  assert.equal(counts.handshakes, launches, "actual child acquisition/held handshake count");
  assert.equal(counts.exits, exited, "observed sibling exit count");
  assert.equal(counts.occupied, launches - exited, "live child occupancy is independent of canonical policy state");
}
async function terminal(supervisor: Supervisor, worker: WorkerClient): Promise<StoredRecord> {
  const observed = await supervisor.wait("terminal", value => value.workerPid === worker.pid);
  assert.ok(observed.record);
  await worker.settle();
  return observed.record;
}
async function fileEffect(supervisor: Supervisor): Promise<void> {
  const lines = (await supervisor.effectArtifact(operation)).trim().split("\n");
  assert.equal(lines.length, 1);
  const actual: unknown = JSON.parse(lines[0] ?? "");
  assert.deepEqual(actual, { scope: "recovery", id: "operation", value: SUCCESS });
}

for (const selected of profiles) {
  test(`R-01 ${selected}: synced acceptance temp is ignored after fresh worker restart`, watchdog, async () => {
    await using supervisor = await Supervisor.create(selected);
    const first = await supervisor.start("acceptance-temp-closed");
    const lost = assert.rejects(first.submit(operation), { code: "fixture.worker.exited" });
    await barrier(supervisor, first, "acceptance-temp-closed");
    assert.deepEqual((await supervisor.store.read()).records, []);
    const temporary = (await readdir(supervisor.directory)).filter(name => name.endsWith(".tmp"));
    assert.equal(temporary.length, 1);
    const tempValue: unknown = JSON.parse(await readFile(join(supervisor.directory, temporary[0] ?? ""), "utf8"));
    assert.equal(snapshot(tempValue).records[0]?.state, "pending");
    await first.terminate();
    await lost;
    const fresh = await supervisor.start();
    assert.notEqual(fresh.pid, first.pid);
    await fresh.settle();
    assert.equal(await fresh.query(operation), undefined);
    assert.deepEqual((await supervisor.store.read()).records, []);
    physical(supervisor, 0, 0);
    healthy(supervisor);
  });

  test(`R-02 ${selected}: lost acceptance response is reconciled before any resubmit`, watchdog, async () => {
    await using supervisor = await Supervisor.create(selected);
    const first = await supervisor.start("accepted");
    const lost = assert.rejects(first.submit(operation), { code: "fixture.worker.exited" });
    await barrier(supervisor, first, "accepted");
    assert.equal((await supervisor.store.read()).records[0]?.state, "pending");
    await first.terminate();
    await lost;
    const fresh = await supervisor.start();
    assert.notEqual(fresh.pid, first.pid);
    if (selected === "restart-pending") {
      await supervisor.wait("effect-held");
      await supervisor.complete(operation);
      const completed = await terminal(supervisor, fresh);
      assert.equal(completed.state, "terminal");
      assert.equal(completed.result, SUCCESS);
      physical(supervisor, 1, 1);
      await fileEffect(supervisor);
      assert.equal(supervisor.events.filter(value => value.kind === "consumer-closed" && value.complete).length, 1);
    } else {
      await fresh.settle();
      const retained = (await fresh.status()).snapshot.records[0];
      assert.equal(retained?.state, "pending");
      assert.equal(retained?.claim, null);
      assert.equal(retained?.result, null);
      physical(supervisor, 0, 0);
    }
    // These are intentionally after the positive result/no-dispatch reconciliation oracle.
    const before = await fresh.query(operation);
    const duplicate = await fresh.submit(operation);
    assert.equal(duplicate.created, false);
    assert.deepEqual(duplicate.record, before);
    await fresh.settle();
    assert.deepEqual(await fresh.query(operation), before);
    physical(supervisor, selected === "restart-pending" ? 1 : 0, selected === "restart-pending" ? 1 : 0);
    healthy(supervisor);
  });

  test(`R-03 ${selected}: durable pre-claim cancellation survives restart and duplicate submit`, watchdog, async () => {
    await using supervisor = await Supervisor.create(selected);
    const first = await supervisor.start("before-claim");
    assert.equal((await first.submit(operation)).created, true);
    await barrier(supervisor, first, "before-claim");
    const cancelled = await first.cancel(operation);
    assert.equal(cancelled.claim, null);
    assert.equal(cancelled.cancel, true);
    assert.equal(cancelled.result, CANCELLED);
    await first.terminate();
    const fresh = await supervisor.start();
    assert.notEqual(fresh.pid, first.pid);
    await fresh.settle();
    assert.deepEqual(await fresh.query(operation), cancelled);
    assert.equal((await fresh.submit(operation)).created, false);
    await fresh.settle();
    assert.deepEqual((await supervisor.store.read()).records, [cancelled]);
    physical(supervisor, 0, 0);
    healthy(supervisor);
  });

  test(`R-04 ${selected}: committed unknown claim has no restored launch permission or live slot`, watchdog, async () => {
    await using supervisor = await Supervisor.create(selected);
    const first = await supervisor.start("claim-committed");
    await first.submit(operation);
    await barrier(supervisor, first, "claim-committed");
    const claimed = (await supervisor.store.read()).records[0];
    assert.equal(claimed?.state, "claimed");
    assert.ok(claimed?.claim);
    await first.terminate();
    const fresh = await supervisor.start();
    assert.notEqual(fresh.pid, first.pid);
    assert.notEqual(fresh.grant, first.grant);
    await fresh.settle();
    const quarantined = await fresh.query(operation);
    assert.equal(quarantined?.state, "quarantined");
    assert.equal(quarantined?.claim, claimed.claim);
    assert.equal(quarantined?.child, null);
    assert.equal(supervisor.counts().reserved, false);
    await assert.rejects(fresh.launchAs(fresh.grant, { ...operation, claim: claimed.claim, payload: "hello" }), { code: "fixture.launch.unpermitted" });
    assert.equal((await fresh.submit(operation)).created, false);
    await fresh.settle();
    physical(supervisor, 0, 0);
    healthy(supervisor);
  });

  test(`R-05 ${selected}: lost child acknowledgement retains sibling custody through exit and file debt`, watchdog, async () => {
    await using supervisor = await Supervisor.create(selected);
    supervisor.holdNextAcknowledgement();
    const first = await supervisor.start();
    await first.submit(operation);
    await supervisor.wait("launch-ack-held", value => value.workerPid === first.pid);
    physical(supervisor, 1, 0);
    assert.equal((await supervisor.store.read()).records[0]?.child, null, "the writer has not received child identity");
    assert.equal(await supervisor.effectArtifact(operation), "", "the supervisor-owned sibling really acquired its artifact");
    await first.terminate();
    const fresh = await supervisor.start();
    assert.notEqual(fresh.pid, first.pid);
    await fresh.settle();
    assert.equal((await fresh.query(operation))?.state, "quarantined");
    assert.equal((await fresh.submit(operation)).created, false);
    assert.equal(supervisor.counts().reserved, true, "worker exit does not release the still-live child slot");
    await assert.rejects(fresh.submit(makeSubmission("while-child-alive")), { code: "fixture.operation.overloaded" });
    supervisor.failNextEffectCleanup();
    const exited = await supervisor.stopEffectAndObserve(operation);
    assert.equal(exited.child.started, true);
    assert.equal(exited.child.exited, true);
    assert.equal(exited.child.code, 0);
    assert.equal(exited.child.signal, null);
    assert.equal(exited.cleanupDebt, true);
    assert.equal(await supervisor.retainedEffectArtifact(operation), "", "file cleanup debt retains an actual file after process exit");
    assert.equal(supervisor.counts().reserved, false, "file debt cannot hold a released process slot");
    await fresh.reconcile();
    const retained = await fresh.query(operation);
    assert.equal(retained?.state, "quarantined");
    assert.equal(retained?.child?.exited, true);
    assert.equal(retained?.cleanupDebt, true);
    assert.equal(retained?.result, null);
    await fresh.configure({ pauseAt: "before-claim" });
    const afterExit = makeSubmission("after-exit");
    assert.equal((await fresh.submit(afterExit)).created, true, "observed exit admits unrelated work while file debt remains");
    await barrier(supervisor, fresh, "before-claim");
    await fresh.cancel(afterExit);
    await fresh.release("before-claim");
    await fresh.settle();
    await supervisor.retryEffectCleanup(operation);
    await assert.rejects(supervisor.retainedEffectArtifact(operation), { code: "ENOENT" });
    await fresh.reconcile();
    assert.equal((await fresh.query(operation))?.cleanupDebt, false);
    supervisor.releaseAcknowledgement();
    physical(supervisor, 1, 1);
    healthy(supervisor);
  });

  test(`R-06 ${selected}: committed terminal result survives loss of its response without re-execution`, watchdog, async () => {
    await using supervisor = await Supervisor.create(selected);
    const first = await supervisor.start("terminal-committed");
    await first.submit(operation);
    await supervisor.wait("effect-held");
    await supervisor.complete(operation);
    await barrier(supervisor, first, "terminal-committed");
    const committed = (await supervisor.store.read()).records[0];
    assert.equal(committed?.state, "terminal");
    assert.equal(committed?.result, SUCCESS);
    assert.equal(committed?.child?.exited, true);
    assert.equal(supervisor.events.filter(value => value.kind === "terminal").length, 0);
    await first.terminate();
    const fresh = await supervisor.start();
    assert.notEqual(fresh.pid, first.pid);
    await fresh.settle();
    assert.deepEqual(await fresh.query(operation), committed);
    assert.deepEqual((await fresh.submit(operation)).record, committed);
    await fresh.settle();
    physical(supervisor, 1, 1);
    await fileEffect(supervisor);
    healthy(supervisor);
  });

  test(`R-07 ${selected}: live cancellation stops the sibling and defeats a late success`, watchdog, async () => {
    await using supervisor = await Supervisor.create(selected);
    const worker = await supervisor.start();
    await worker.submit(operation);
    await supervisor.wait("effect-held");
    const chosen = await worker.cancel(operation);
    assert.equal(chosen.cancel, true);
    assert.equal(chosen.state, "terminal");
    assert.equal(chosen.result, CANCELLED);
    const completed = await terminal(supervisor, worker);
    assert.equal(completed.result, CANCELLED);
    assert.equal(completed.child?.exited, true);
    assert.equal(completed.child?.code, 0);
    assert.equal(completed.child?.signal, null);
    assert.equal((await worker.lateSuccess(operation)).result, CANCELLED);
    assert.equal((await supervisor.store.read()).records[0]?.result, CANCELLED);
    assert.equal(await supervisor.effectArtifact(operation), "");
    physical(supervisor, 1, 1);
    healthy(supervisor);
  });

  test(`R-08 ${selected}: duplicate identity precedes capacity-one admission with no queue`, watchdog, async () => {
    await using supervisor = await Supervisor.create(selected);
    const worker = await supervisor.start();
    await worker.submit(operation);
    await supervisor.wait("effect-held");
    await supervisor.wait("child-recorded", value => value.workerPid === worker.pid);
    const before = await worker.query(operation);
    const duplicate = await worker.submit(operation);
    assert.equal(duplicate.created, false);
    assert.deepEqual(duplicate.record, before);
    await assert.rejects(worker.submit(makeSubmission("operation", " conflicting ")), { code: "fixture.operation.conflict" });
    await assert.rejects(worker.submit(makeSubmission("unrelated")), { code: "fixture.operation.overloaded" });
    assert.equal((await supervisor.store.read()).records.length, 1, "record cap cannot mask active-child capacity");
    physical(supervisor, 1, 0);
    await worker.cancel(operation);
    await terminal(supervisor, worker);
    physical(supervisor, 1, 1);
    healthy(supervisor);
  });

  test(`R-09 ${selected}: failed durable cancel freezes launches while local stop and reconciliation remain usable`, watchdog, async () => {
    await using supervisor = await Supervisor.create(selected);
    const worker = await supervisor.start();
    await worker.submit(operation);
    await supervisor.wait("effect-held");
    // Wait until child identity is durably recorded, without using time as ordering.
    const acknowledged = await supervisor.wait("child-recorded", value => value.workerPid === worker.pid);
    assert.ok(acknowledged.record?.claim);
    await worker.configure({ fault: { stage: "rename", transition: "cancel" } });
    await assert.rejects(worker.cancel(operation), { code: "fixture.store.injected-rename" });
    await supervisor.wait("launches-frozen", value => value.workerPid === worker.pid);
    const stopped = await supervisor.observeEffectExit(operation);
    assert.equal(stopped.child.exited, true);
    assert.equal(stopped.child.code, 0);
    assert.equal(stopped.child.signal, null);
    await worker.settle();
    assert.equal((await worker.status()).frozen, true);
    await assert.rejects(worker.submit(makeSubmission("during-freeze")), { code: "fixture.store.frozen" });
    await assert.rejects(worker.launchAs(worker.grant, { ...operation, claim: acknowledged.record.claim, payload: "hello" }), { code: "fixture.store.frozen" });
    await assert.rejects(worker.cancel(operation), { code: "fixture.store.frozen" });
    const lastCommitted = await worker.query(operation);
    assert.equal(lastCommitted?.state, "claimed");
    assert.equal(lastCommitted?.cancel, false);
    assert.equal(lastCommitted?.result, null);
    await worker.reconcile();
    assert.equal((await worker.status()).frozen, false);
    const reconciled = await worker.query(operation);
    assert.equal(reconciled?.state, "quarantined");
    assert.equal(reconciled?.cancel, false, "local cancellation was never acknowledged as a durable cancel");
    assert.equal(reconciled?.result, null);
    assert.equal(reconciled?.child?.exited, true);
    physical(supervisor, 1, 1);
    healthy(supervisor, ["fixture.store.frozen"]);
  });

  test(`R-10 ${selected}: competing startups grant one writer; stale and read-only restored state grant no launch`, watchdog, async () => {
    await using supervisor = await Supervisor.create(selected);
    const older = await supervisor.store.read();
    const competed = await Promise.allSettled([supervisor.start(), supervisor.start()]);
    const winners = competed.filter(value => value.status === "fulfilled");
    const losers = competed.filter(value => value.status === "rejected");
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.equal(supervisor.counts().grants, 1);
    const winner = winners[0];
    const loser = losers[0];
    assert.ok(winner?.status === "fulfilled");
    assert.ok(loser?.status === "rejected");
    assert.equal(typeof loser.reason === "object" && loser.reason !== null && "code" in loser.reason && loser.reason.code, "fixture.writer.occupied");
    const first = winner.value;
    await first.terminate();
    const fresh = await supervisor.start();
    assert.notEqual(fresh.pid, first.pid);
    assert.notEqual(fresh.grant, first.grant);
    await assert.rejects(fresh.launchAs(first.grant, { ...operation, claim: freshToken(), payload: "hello" }), { code: "fixture.writer.stale" });
    const restoredDirectory = join(supervisor.directory, "older-read-only");
    await mkdir(restoredDirectory);
    await using restoredStore = new SnapshotStore(restoredDirectory);
    const oldClaim = record({ ...pending("older-claimed"), state: "claimed", claim: freshToken() });
    await restoredStore.replace(snapshot({ ...older, records: [pending("older-pending"), oldClaim] }), "initialize");
    const restored = await readReconcileOnly(restoredStore);
    assert.equal(restored.generation, older.generation);
    assert.equal(restored.records[0]?.state, "pending");
    assert.equal(restored.records[1]?.state, "quarantined");
    assert.equal(restored.records[1]?.claim, oldClaim.claim);
    assert.deepEqual((await supervisor.store.read()).records, []);
    await fresh.settle();
    assert.equal(supervisor.counts().grants, 2, "read/reconcile-only did not acquire a writer grant");
    physical(supervisor, 0, 0);
    healthy(supervisor);
  });
}

test("launch permission: a revoked delayed current-grant request cannot spawn", watchdog, async () => {
  await using supervisor = await Supervisor.create("record-only");
  supervisor.holdNextLaunch();
  const worker = await supervisor.start();
  await worker.submit(operation);
  await supervisor.wait("launch-held", value => value.workerPid === worker.pid);
  assert.equal((await supervisor.store.read()).records[0]?.state, "claimed");
  assert.equal((await worker.cancel(operation)).result, CANCELLED);
  await supervisor.wait("revoked", value => value.workerPid === worker.pid);
  await supervisor.deliverHeldLaunch();
  await worker.settle();
  assert.equal((await worker.query(operation))?.result, CANCELLED);
  physical(supervisor, 0, 0);
  healthy(supervisor, ["fixture.launch.revoked"]);
});

test("launch permission: replay of a consumed live request adds no physical launch", watchdog, async () => {
  await using supervisor = await Supervisor.create("record-only");
  const worker = await supervisor.start();
  await worker.submit(operation);
  await supervisor.wait("effect-held");
  const claimed = await worker.query(operation);
  assert.ok(claimed?.claim);
  await assert.rejects(worker.launchAs(worker.grant, { ...operation, claim: claimed.claim, payload: "hello" }), { code: "fixture.launch.consumed" });
  physical(supervisor, 1, 0);
  await worker.cancel(operation);
  await terminal(supervisor, worker);
  physical(supervisor, 1, 1);
  healthy(supervisor);
});

test("live catalog: unsupported input rejects before storage, reservation and physical launch", watchdog, async () => {
  await using supervisor = await Supervisor.create("record-only");
  const worker = await supervisor.start();
  const before = await readFile(supervisor.store.canonical);
  const unsupported = makeSubmission("legal-world", " world ");
  assert.deepEqual(submission(unsupported), unsupported, "the storage-only bounded schema remains wide");
  await assert.rejects(worker.submit(unsupported), { code: "fixture.operation.unsupported-input" });
  await assert.rejects(worker.submit(makeSubmission("other-scope", " hello ", "other")), { code: "fixture.operation.unsupported-input" });
  assert.deepEqual(await readFile(supervisor.store.canonical), before);
  assert.equal(supervisor.counts().reserved, false);
  assert.equal((await worker.status()).frozen, false);
  physical(supervisor, 0, 0);
  supervisor.holdNextLaunch();
  await worker.submit(operation);
  await supervisor.wait("launch-held", value => value.workerPid === worker.pid);
  const claimed = await worker.query(operation);
  assert.ok(claimed?.claim);
  await assert.rejects(worker.launchAs(worker.grant, { ...operation, claim: claimed.claim, payload: "world" }), { code: "fixture.operation.unsupported-input" });
  physical(supervisor, 0, 0);
  await supervisor.deliverHeldLaunch();
  await supervisor.wait("effect-held");
  await supervisor.complete(operation);
  assert.equal((await terminal(supervisor, worker)).result, SUCCESS, "the rejected payload did not consume the valid permission");
  physical(supervisor, 1, 1);
  healthy(supervisor);
});

test("live catalog: an early malformed child result remains an owned failure through cooperative exit", watchdog, async () => {
  await using supervisor = await Supervisor.create("record-only");
  supervisor.malformNextEffectResult();
  const worker = await supervisor.start();
  await worker.submit(operation);
  const failed = await supervisor.wait("effect-failed");
  assert.equal(failed.code, "fixture.effect.invalid-result");
  assert.equal(failed.child?.started, true);
  assert.equal(failed.child?.exited, false, "the supervisor retains custody when result decoding fails");
  // Observe the stop caused by the decoder; this test never sends a second stop command.
  const exited = await supervisor.observeEffectExit(operation);
  assert.equal(exited.child.code, 0);
  assert.equal(exited.child.signal, null);
  assert.equal(exited.result, null, "neither the malformed value nor the later stop response becomes a successful result");
  await worker.settle();
  assert.equal(supervisor.events.filter(value => value.kind === "effect-failed").length, 1);
  assert.equal(supervisor.events.filter(value => value.kind === "dispatch-error" && value.code === "fixture.effect.invalid-result").length, 1);
  assert.equal(supervisor.events.filter(value => value.kind === "consumer-closed" && value.complete).length, 1);
  assert.equal(supervisor.events.filter(value => value.kind === "terminal").length, 0);
  assert.equal((await worker.query(operation))?.result, null);
  await worker.reconcile();
  const reconciled = await worker.query(operation);
  assert.equal(reconciled?.state, "quarantined");
  assert.equal(reconciled?.result, null);
  assert.equal(reconciled?.child?.exited, true);
  physical(supervisor, 1, 1);
  healthy(supervisor, ["fixture.effect.invalid-result"]);
});

async function disposableStore(selected: Profile = "restart-pending", seam?: ConstructorParameters<typeof SnapshotStore>[1]) {
  const directory = await mkdtemp(join(tmpdir(), "gm-recovery-store-"));
  const store = new SnapshotStore(directory, seam);
  await store.replace(emptySnapshot(selected), "initialize");
  return { store, directory, [Symbol.asyncDispose]: async () => {
    await store[Symbol.asyncDispose]();
    await rm(directory, { recursive: true, force: true });
  } };
}

test("R-08 store only: acceptance 33 is rejected unchanged and 32 accepted records retain terminal room", watchdog, async () => {
  await using fixture = await disposableStore();
  const owner = await OperationOwner.open(fixture.store, "restart-pending");
  // No supervisor, worker, child, dispatch function or active-capacity predicate is present.
  for (let index = 0; index < 32; index += 1) {
    await owner.submit(submission({ scope: "\\".repeat(31), id: String(index).padStart(2, "0"),
      input: "\n".repeat(447), fingerprint: "\t".repeat(63) }));
  }
  const before = await readFile(fixture.store.canonical);
  await assert.rejects(owner.submit(makeSubmission("thirty-third")), { code: "fixture.store.record-cap" });
  assert.deepEqual(await readFile(fixture.store.canonical), before);
  const accepted = owner.status().snapshot.records;
  assert.equal(accepted.length, 32);
  for (const [index, value] of accepted.entries()) {
    if (index === 0) await owner.cancel(value);
    await owner.recordResult(value, { child: { pid: Number.MAX_SAFE_INTEGER, started: false, exited: false,
      code: -2147483648, signal: "SIGTERM" }, cleanupDebt: false, result: BOUNDARY_RESULT });
  }
  const grown = await fixture.store.read();
  assert.equal(grown.records.length, 32);
  assert.equal(grown.records[0]?.cancel, true);
  assert.equal(grown.records[0]?.result, CANCELLED);
  assert.ok(grown.records.every(value => value.state === "terminal" && value.child?.pid === Number.MAX_SAFE_INTEGER));
  assert.ok(grown.records.slice(1).every(value => value.result === BOUNDARY_RESULT));
  assert.ok(bytes(grown) > before.byteLength);
  assert.ok(bytes(grown) < caps.canonical);
});

test("closed schema: one escaped maximal vector proves 1596-byte records and the terminal-growth reserve", watchdog, async () => {
  const maximal = record({ scope: "\\".repeat(31), id: '"'.repeat(31), input: "\n".repeat(447), fingerprint: "\t".repeat(63),
    state: "quarantined", claim: "f".repeat(32), cancel: false, cleanupDebt: false,
    child: { pid: Number.MAX_SAFE_INTEGER, started: false, exited: false, code: -2147483648, signal: "SIGTERM" }, result: BOUNDARY_RESULT });
  assert.equal(bytes(maximal.scope), 64);
  assert.equal(bytes(maximal.id), 64);
  assert.equal(bytes(maximal.input), 896);
  assert.equal(bytes(maximal.fingerprint), 128);
  assert.equal(bytes(maximal.result), 192);
  assert.equal(bytes(maximal), 1596);
  const complete = snapshot({ format: 1, profile: "restart-pending", generation: "f".repeat(32),
    records: Array.from({ length: 32 }, (_, index) => ({ ...maximal, id: `${String(index).padStart(2, "0")}${'"'.repeat(30)}` })) });
  assert.equal(bytes(complete) - 32 * 1596, 132);
  assert.ok(bytes(complete) <= 32 * caps.record + caps.envelope);
  assert.equal(32 * caps.record + caps.envelope, 61440);
  assert.ok(61440 < caps.canonical);
  await using fixture = await disposableStore();
  await fixture.store.replace(complete, "recordResult");
  assert.deepEqual(await fixture.store.read(), complete);
});

test("closed schema: unknown, missing and encoded-byte overflow reject at admission and canonical reread", watchdog, async () => {
  await using fixture = await disposableStore();
  const owner = await OperationOwner.open(fixture.store, "restart-pending");
  const original = await readFile(fixture.store.canonical);
  const invalidAdmissions = [
    { ...operation, extra: true }, { ...operation, scope: "\\".repeat(32) }, { ...operation, id: '"'.repeat(32) },
    { ...operation, input: "\n".repeat(448) }, { ...operation, fingerprint: "\t".repeat(64) },
  ];
  for (const value of invalidAdmissions) assert.throws(() => owner.submit(value), { code: "fixture.store.schema" });
  assert.throws(() => submission({ scope: "recovery", id: "operation", input: "hello" }), { code: "fixture.store.schema" });
  assert.deepEqual(await readFile(fixture.store.canonical), original);
  const valid = snapshot({ ...emptySnapshot("restart-pending"), records: [pending()] });
  const withoutChild = Object.fromEntries(Object.entries(pending()).filter(([name]) => name !== "child"));
  const invalidCanonical: readonly unknown[] = [
    { ...valid, extra: true }, { ...valid, generation: "not-a-generation" },
    { ...valid, records: [{ ...pending(), extra: true }] }, { ...valid, records: [withoutChild] },
    { ...valid, records: [{ ...pending(), input: "\n".repeat(448) }] },
    { ...valid, records: [{ ...pending(), result: "x".repeat(190) }] },
    { ...valid, records: [{ ...pending(), child: { pid: 1, started: true, exited: false, code: null, signal: "SIGINT" } }] },
  ];
  for (const value of invalidCanonical) {
    await writeFile(fixture.store.canonical, JSON.stringify(value), "utf8");
    await assert.rejects(owner.reconcile(), { code: "fixture.store.schema" });
    assert.equal(owner.status().frozen, true);
  }
  await assert.rejects(owner.submit(operation), { code: "fixture.store.frozen" });
  await writeFile(fixture.store.canonical, "{invalid", "utf8");
  await assert.rejects(owner.reconcile(), SyntaxError);
  assert.equal(owner.status().frozen, true);
  await rm(fixture.store.canonical);
  await assert.rejects(owner.reconcile(), { code: "ENOENT" });
  assert.equal(owner.status().frozen, true);
  await fixture.store.replace(emptySnapshot("restart-pending"), "initialize");
  await owner.reconcile();
  assert.equal(owner.status().frozen, false);
  assert.equal((await owner.submit(operation)).created, true);
});

test("storage freeze: one real-file fault group covers write, sync, close and rename without a profile matrix", watchdog, async context => {
  const stages: readonly StoreStage[] = ["write", "sync", "close", "rename"];
  for (const stage of stages) await context.test(stage, async () => {
    let fail = true;
    let localStops = 0;
    await using fixture = await disposableStore("restart-pending", (at, transition) => {
      if (transition === "submit" && at === stage && fail) { fail = false; throw failure(`fixture.store.injected-${stage}`); }
    });
    const owner = await OperationOwner.open(fixture.store, "restart-pending", { cancel: () => { localStops += 1; } });
    const before = await readFile(fixture.store.canonical);
    await assert.rejects(owner.submit(operation), { code: `fixture.store.injected-${stage}` });
    assert.equal(owner.status().frozen, true);
    assert.deepEqual(await readFile(fixture.store.canonical), before);
    await assert.rejects(owner.submit(makeSubmission("blocked")), { code: "fixture.store.frozen" });
    await assert.rejects(owner.claim(operation), { code: "fixture.store.frozen" });
    await assert.rejects(owner.cancel(operation), { code: "fixture.store.frozen" });
    assert.equal(localStops, 1, "local cancellation is independent of the failed durable command");
    await owner.reconcile();
    assert.equal(owner.status().frozen, false);
    assert.deepEqual(owner.status().snapshot.records, []);
    assert.equal((await owner.submit(operation)).created, true);
  });
});

test("ambiguous replacement: no acceptance acknowledgement; reconciliation trusts the actual renamed canonical", watchdog, async () => {
  let fail = true;
  await using fixture = await disposableStore("restart-pending", (stage, transition) => {
    if (transition === "submit" && stage === "after-rename" && fail) { fail = false; throw failure("fixture.store.injected-after-rename"); }
  });
  const owner = await OperationOwner.open(fixture.store, "restart-pending");
  await assert.rejects(owner.submit(operation), { code: "fixture.store.injected-after-rename" });
  assert.equal(owner.status().frozen, true);
  assert.deepEqual(owner.status().snapshot.records, [], "an intended value is not a committed in-memory acknowledgement");
  assert.equal((await fixture.store.read()).records[0]?.state, "pending", "the real canonical replacement did complete");
  await assert.rejects(owner.submit(operation), { code: "fixture.store.frozen" });
  await owner.reconcile();
  assert.equal(owner.status().frozen, false);
  assert.equal((await owner.submit(operation)).created, false);
  assert.equal(owner.status().snapshot.records[0]?.state, "pending");
});
