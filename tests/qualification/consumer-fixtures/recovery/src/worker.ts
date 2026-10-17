import { createAttempt } from "../../semantic/tests/support/attempt-owner.js";
import { createFileJournal } from "../../semantic/tests/support/journal.js";
import { prepareRecoveryConsumer } from "./consumer.js";
import { OperationOwner } from "./operation-owner.js";
import {
  CANCELLED, SUCCESS, child, errorCode, failure, identity, key, object, profile, record, result, submission, token, witness,
  type ChildWitness, type Identity, type StoredRecord,
} from "./schema.js";
import { SnapshotStore, type StoreStage, type Transition } from "./store.js";

const directory = process.argv[2];
const selected = profile(process.argv[3]);
const grant = token(process.argv[4]);
if (directory === undefined || process.send === undefined) throw failure("fixture.worker.arguments");
let pauseAt: string | undefined = process.argv[5] || undefined;
let injected: { stage: StoreStage; transition: Transition } | undefined;
let owner: OperationOwner | undefined;
let closing = false;
let nextRpc = 0;
const replies = new Map<number, { resolve: (value: unknown) => void; reject: (cause: Error) => void }>();
const holds = new Map<string, () => void>();
const attempts = new Map<string, ReturnType<typeof createAttempt>>();
const dispatches = new Map<string, Promise<void>>();

function send(value: object): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.send === undefined || !process.connected) { reject(failure("fixture.worker.disconnected")); return; }
    process.send(value, cause => cause ? reject(cause) : resolve());
  });
}
function emit(name: string, value: object = {}): void { void send({ type: "event", name, ...value }).catch(() => {}); }
function request(method: string, value: unknown, selectedGrant = grant): Promise<unknown> {
  const rpc = ++nextRpc;
  const response = new Promise<unknown>((resolve, reject) => replies.set(rpc, { resolve, reject }));
  void send({ type: "rpc", rpc, method, grant: selectedGrant, value }).catch(cause => {
    replies.get(rpc)?.reject(cause);
    replies.delete(rpc);
  });
  return response;
}
async function pause(name: string): Promise<void> {
  if (pauseAt !== name) return;
  pauseAt = undefined;
  const gate = Promise.withResolvers<void>();
  holds.set(name, () => gate.resolve());
  emit("barrier", { barrier: name });
  await gate.promise;
  holds.delete(name);
}
function localStop(value: Identity): void {
  attempts.get(key(value))?.requestStop();
  void send({ type: "control-stop", grant, value: { scope: value.scope, id: value.id } }).catch(() => {});
}
const store = new SnapshotStore(directory, async (stage, transition) => {
  if (stage === "rename" && transition === "submit") await pause("acceptance-temp-closed");
  if (injected?.stage === stage && injected.transition === transition) {
    injected = undefined;
    throw failure(`fixture.store.injected-${stage}`);
  }
});
function current(): OperationOwner {
  if (owner === undefined) throw failure("fixture.worker.not-ready");
  return owner;
}
async function observe(value: Identity): Promise<ChildWitness | undefined> {
  const received = await request("observe", { scope: value.scope, id: value.id });
  return received === null ? undefined : witness(received);
}

const prepared = await prepareRecoveryConsumer(async value => {
  const claimed = current().query(value);
  if (claimed?.claim === null || claimed?.claim === undefined || value.signal.aborted) throw failure(CANCELLED);
  const launched = child(await request("launch", {
    scope: value.scope, id: value.id, claim: claimed.claim, payload: value.payload,
  }));
  const acknowledged = await current().recordResult(value, { child: launched, cleanupDebt: false, result: null });
  emit("child-recorded", { record: acknowledged });
  const finished = witness(await request("wait-result", { scope: value.scope, id: value.id }));
  if (value.signal.aborted || finished.result === CANCELLED) throw failure(CANCELLED);
  if (finished.result === null) throw failure("fixture.effect.no-result");
  return finished.result;
});

async function dispatch(accepted: StoredRecord): Promise<void> {
  await pause("before-claim");
  if (closing) return;
  if (current().query(accepted)?.state !== "pending") return;
  // Restored pending work re-enters live admission; persisted identity is not a reservation.
  await request("reserve", submission({ scope: accepted.scope, id: accepted.id, input: accepted.input, fingerprint: accepted.fingerprint }));
  const claimed = await current().claim(accepted);
  if (claimed === undefined) return;
  emit("claimed", { record: claimed });
  await pause("claim-committed");
  if (closing || current().query(claimed)?.cancel) return;
  await request("permission", claimed);
  const journal = await createFileJournal();
  const attempt = createAttempt(prepared, claimed.scope, journal, { capacity: 1 });
  attempts.set(key(claimed), attempt);
  try {
    if (closing || current().query(claimed)?.cancel) attempt.requestStop();
    if (!await attempt.ready) throw failure(CANCELLED);
    let outcome: string;
    try { outcome = await attempt.run({ id: claimed.id, payload: claimed.input, signal: attempt.signal }); }
    catch (cause) {
      if (errorCode(cause) !== CANCELLED) throw cause;
      outcome = CANCELLED;
    }
    const observed = await observe(claimed);
    if (observed !== undefined) {
      const terminal = await current().recordResult(claimed, { ...observed, result: result(outcome) });
      await pause("terminal-committed");
      emit("terminal", { record: terminal });
    }
  } finally {
    const report = await attempt.stop();
    emit("consumer-closed", { complete: report.complete, identity: claimed.scope });
    if (!report.complete) throw failure("fixture.attempt.close-incomplete");
    await journal[Symbol.asyncDispose]();
    attempts.delete(key(claimed));
  }
}
function schedule(value: StoredRecord): void {
  if (dispatches.has(key(value)) || closing) return;
  const running = Promise.resolve().then(() => dispatch(value));
  dispatches.set(key(value), running);
  void running.catch(cause => emit("dispatch-error", { code: errorCode(cause), scope: value.scope, id: value.id }));
}
function continuePending(): void {
  if (selected !== "restart-pending" || closing) return;
  for (const value of current().status().snapshot.records) {
    if (value.state === "pending" && !value.cancel) schedule(value);
  }
}

async function command(message: Record<string, unknown>): Promise<unknown> {
  const name = message.command;
  if (name === "submit") {
    const accepted = await current().submit(submission(message.value));
    await pause("accepted");
    // An acknowledged new live submission can dispatch in either profile; duplicates never trigger it.
    if (accepted.created) schedule(accepted.record);
    return accepted;
  }
  if (name === "query") return current().query(identity(message.value)) ?? null;
  if (name === "status") return current().status();
  if (name === "settle") { await Promise.allSettled(dispatches.values()); return current().status(); }
  if (name === "cancel") return current().cancel(identity(message.value));
  if (name === "reconcile") {
    const reconciled = await current().reconcile(observe);
    await request("reconciled", null);
    continuePending();
    return reconciled;
  }
  if (name === "configure") {
    if (!object(message.value)) throw failure("fixture.ipc.invalid");
    if (message.value.pauseAt !== undefined) {
      if (typeof message.value.pauseAt !== "string" || !["acceptance-temp-closed", "accepted", "before-claim", "claim-committed", "terminal-committed"].includes(message.value.pauseAt)) {
        throw failure("fixture.ipc.invalid");
      }
      pauseAt = message.value.pauseAt;
    }
    if (message.value.fault !== undefined) {
      const fault = message.value.fault;
      if (!object(fault) || (fault.stage !== "write" && fault.stage !== "sync" && fault.stage !== "close" && fault.stage !== "rename" && fault.stage !== "after-rename") ||
        (fault.transition !== "cancel" && fault.transition !== "submit")) throw failure("fixture.ipc.invalid");
      injected = { stage: fault.stage, transition: fault.transition };
    }
    return null;
  }
  if (name === "release") {
    if (typeof message.value !== "string" || !holds.has(message.value)) throw failure("fixture.barrier.missing");
    holds.get(message.value)?.();
    return null;
  }
  if (name === "late-success") {
    const value = identity(message.value);
    const observed = await observe(value);
    if (observed === undefined) throw failure("fixture.effect.missing");
    return current().recordResult(value, { ...observed, result: SUCCESS });
  }
  if (name === "launch-as") {
    if (!object(message.value) || typeof message.value.grant !== "string") throw failure("fixture.ipc.invalid");
    return request("launch", message.value.launch, message.value.grant);
  }
  if (name === "stop") {
    closing = true;
    for (const value of current().status().snapshot.records) localStop(value);
    for (const release of holds.values()) release();
    await Promise.allSettled(dispatches.values());
    await store[Symbol.asyncDispose]();
    return null;
  }
  throw failure("fixture.ipc.invalid");
}

process.on("message", (message: unknown) => {
  if (!object(message)) return;
  if (message.type === "rpc-result" && typeof message.rpc === "number") {
    const pending = replies.get(message.rpc);
    replies.delete(message.rpc);
    if (message.ok === true) pending?.resolve(message.value);
    else pending?.reject(failure(typeof message.code === "string" ? message.code : "fixture.ipc.invalid"));
    return;
  }
  if (message.type !== "command" || typeof message.request !== "number") return;
  const requestId = message.request;
  void command(message).then(async value => {
    await send({ type: "response", request: requestId, ok: true, value });
    if (message.command === "stop") process.disconnect();
  }, cause => send({ type: "response", request: requestId, ok: false, code: errorCode(cause) })).catch(() => {});
});

try {
  owner = await OperationOwner.open(store, selected, {
    reserve: async value => { await request("reserve", value); },
    cancel: localStop,
    freeze: () => {
      void send({ type: "freeze", grant }).catch(() => {});
      emit("frozen");
    },
  });
  await owner.reconcile(observe);
  await request("reconciled", null);
  await send({ type: "ready", pid: process.pid, grant });
  continuePending();
} catch (cause) {
  await send({ type: "fatal", code: errorCode(cause) });
  await store[Symbol.asyncDispose]();
  process.disconnect();
  process.exitCode = 1;
}
