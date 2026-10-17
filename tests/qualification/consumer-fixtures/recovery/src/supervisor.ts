import { fork, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  child, emptySnapshot, errorCode, failure, freshToken, identity, key, object, record, requireLiveResult, result, snapshot, submission, token, witness,
  type ChildWitness, type Identity, type Profile, type Snapshot, type StoredChild, type StoredRecord, type Submission,
} from "./schema.js";
import { SnapshotStore, type StoreStage } from "./store.js";

export interface Launch extends Identity { readonly claim: string; readonly payload: string }
export interface Observation {
  readonly kind: string;
  readonly workerPid?: number;
  readonly barrier?: string;
  readonly code?: string;
  readonly record?: StoredRecord;
  readonly child?: StoredChild;
  readonly complete?: boolean;
}
export interface WorkerClient {
  readonly pid: number;
  readonly grant: string;
  readonly submit: (value: Submission) => Promise<{ readonly created: boolean; readonly record: StoredRecord }>;
  readonly query: (value: Identity) => Promise<StoredRecord | undefined>;
  readonly status: () => Promise<{ readonly frozen: boolean; readonly snapshot: Snapshot }>;
  readonly settle: () => Promise<void>;
  readonly cancel: (value: Identity) => Promise<StoredRecord>;
  readonly reconcile: () => Promise<Snapshot>;
  readonly configure: (value: { readonly pauseAt?: string; readonly fault?: { readonly stage: StoreStage; readonly transition: "cancel" | "submit" } }) => Promise<void>;
  readonly release: (name: string) => Promise<void>;
  readonly lateSuccess: (value: Identity) => Promise<StoredRecord>;
  readonly launchAs: (grant: string, value: Launch) => Promise<StoredChild>;
  readonly terminate: () => Promise<void>;
  readonly stop: () => Promise<void>;
}
interface Connection {
  readonly process: ChildProcess;
  readonly grant: string;
  readonly pid: number;
  readonly ready: ReturnType<typeof Promise.withResolvers<void>>;
  readonly exit: ReturnType<typeof Promise.withResolvers<void>>;
  readonly pending: Map<number, { resolve: (value: unknown) => void; reject: (cause: Error) => void }>;
  exited: boolean;
  frozen: boolean;
  nextRequest: number;
  stderr: string;
}
interface Effect {
  readonly process: ChildProcess;
  readonly operation: Identity;
  readonly path: string;
  readonly held: ReturnType<typeof Promise.withResolvers<void>>;
  readonly exit: ReturnType<typeof Promise.withResolvers<void>>;
  readonly finished: ReturnType<typeof Promise.withResolvers<ChildWitness>>;
  child: StoredChild;
  result: ChildWitness["result"];
  failureCode: string | undefined;
  artifact: string | undefined;
  cleanupDebt: boolean;
  stopRequested: boolean;
}
interface Permission { readonly grant: string; readonly operation: Identity; readonly claim: string; consumed: boolean; revoked: boolean }
interface Reservation { readonly grant: string; readonly operation: Identity; effect?: Effect }
interface HeldLaunch { readonly connection: Connection; readonly value: Launch; readonly complete: (value: StoredChild) => void; readonly reject: (cause: Error) => void }

function send(process: ChildProcess, value: object): void {
  if (process.connected) process.send(value, () => {});
}
function launch(value: unknown): Launch {
  if (!object(value) || typeof value.payload !== "string") throw failure("fixture.ipc.invalid");
  const operation = identity({ scope: value.scope, id: value.id });
  requireLiveResult(operation.scope, value.payload);
  return { ...operation, claim: token(value.claim), payload: value.payload };
}
function processEnv(temporary: string): NodeJS.ProcessEnv {
  return { ...process.env, NODE_PATH: "", NODE_OPTIONS: "", NODE_TEST_CONTEXT: undefined, NODE_USE_ENV_PROXY: "1", TMPDIR: temporary };
}

// This live test process owns every real sibling handle. No persisted field can reconstruct that custody.
export class Supervisor implements AsyncDisposable {
  readonly events: Observation[] = [];
  readonly store: SnapshotStore;
  private readonly observers = new EventEmitter();
  private readonly workers = new Set<Connection>();
  private readonly effects = new Map<string, Effect>();
  private readonly permissions = new Map<string, Permission>();
  private incumbent: Connection | undefined;
  private starting = false;
  private reservation: Reservation | undefined;
  private holdLaunch = false;
  private heldLaunch: HeldLaunch | undefined;
  private holdAcknowledgement = false;
  private heldAcknowledgement: (() => void) | undefined;
  private failCleanup = false;
  private malformedResult = false;
  private grants = 0;
  private launches = 0;
  private handshakes = 0;
  private exits = 0;

  private constructor(readonly directory: string, readonly profile: Profile) {
    this.store = new SnapshotStore(directory);
  }
  static async create(profile: Profile): Promise<Supervisor> {
    const directory = await mkdtemp(join(tmpdir(), "gm-recovery-"));
    const supervisor = new Supervisor(directory, profile);
    await mkdir(join(directory, "worker-tmp"));
    await supervisor.store.replace(emptySnapshot(profile), "initialize");
    return supervisor;
  }
  private emit(value: Observation): void {
    this.events.push(value);
    this.observers.emit("event", value);
  }
  wait(kind: string, matches: (value: Observation) => boolean = () => true): Promise<Observation> {
    const existing = this.events.find(value => value.kind === kind && matches(value));
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise(resolve => {
      const listener = (value: Observation): void => {
        if (value.kind !== kind || !matches(value)) return;
        this.observers.off("event", listener);
        resolve(value);
      };
      this.observers.on("event", listener);
    });
  }
  counts() {
    return { grants: this.grants, launches: this.launches, handshakes: this.handshakes, exits: this.exits,
      occupied: [...this.effects.values()].filter(value => !value.child.exited).length,
      reserved: this.reservation !== undefined };
  }

  async start(pauseAt?: string): Promise<WorkerClient> {
    const expected = await this.store.read();
    if (expected.profile !== this.profile) throw failure("fixture.store.profile");
    // The read may overlap; this synchronous allocation is the single live-supervisor decision.
    if (this.incumbent !== undefined || this.starting) throw failure("fixture.writer.occupied");
    this.starting = true;
    const grant = freshToken();
    let spawned: ChildProcess;
    try {
      spawned = fork(fileURLToPath(new URL("worker.js", import.meta.url)), [this.directory, this.profile, grant, pauseAt ?? ""], {
        stdio: ["ignore", "pipe", "pipe", "ipc"], execArgv: [], env: processEnv(join(this.directory, "worker-tmp")),
      });
    } catch (cause) { this.starting = false; throw cause; }
    if (spawned.pid === undefined) { this.starting = false; throw failure("fixture.worker.no-pid"); }
    const connection: Connection = {
      process: spawned, grant, pid: spawned.pid, ready: Promise.withResolvers<void>(), exit: Promise.withResolvers<void>(),
      pending: new Map(), exited: false, frozen: false, nextRequest: 0, stderr: "",
    };
    this.workers.add(connection);
    this.incumbent = connection;
    this.starting = false;
    this.grants += 1;
    // All event observers are installed before a command or named barrier can be released.
    spawned.stderr?.on("data", (data: Buffer) => { connection.stderr = (connection.stderr + data.toString()).slice(-8192); });
    spawned.stdout?.resume();
    spawned.on("message", (value: unknown) => this.workerMessage(connection, value));
    spawned.once("error", cause => connection.ready.reject(cause));
    spawned.once("exit", () => {
      connection.exited = true;
      if (this.incumbent === connection) this.incumbent = undefined;
      this.revoke(connection);
      for (const pending of connection.pending.values()) pending.reject(failure("fixture.worker.exited"));
      connection.pending.clear();
      connection.ready.reject(failure("fixture.worker.exited"));
      connection.exit.resolve();
      this.emit({ kind: "worker-exit", workerPid: connection.pid });
    });
    await connection.ready.promise;
    const request = (command: string, value: unknown = null): Promise<unknown> => this.command(connection, command, value);
    return {
      pid: connection.pid, grant,
      submit: async value => {
        const answer = await request("submit", value);
        if (!object(answer) || typeof answer.created !== "boolean") throw failure("fixture.ipc.invalid");
        return { created: answer.created, record: record(answer.record) };
      },
      query: async value => {
        const answer = await request("query", { scope: value.scope, id: value.id });
        return answer === null ? undefined : record(answer);
      },
      status: async () => {
        const answer = await request("status");
        if (!object(answer) || typeof answer.frozen !== "boolean") throw failure("fixture.ipc.invalid");
        return { frozen: answer.frozen, snapshot: snapshot(answer.snapshot) };
      },
      settle: async () => { await request("settle"); },
      cancel: async value => record(await request("cancel", { scope: value.scope, id: value.id })),
      reconcile: async () => snapshot(await request("reconcile")),
      configure: async value => { await request("configure", value); },
      release: async name => { await request("release", name); },
      lateSuccess: async value => record(await request("late-success", { scope: value.scope, id: value.id })),
      launchAs: async (selectedGrant, value) => child(await request("launch-as", { grant: selectedGrant, launch: value })),
      terminate: async () => {
        if (!connection.exited) connection.process.kill("SIGKILL");
        await connection.exit.promise;
      },
      stop: async () => {
        if (!connection.exited) await request("stop");
        await connection.exit.promise;
      },
    };
  }

  private command(connection: Connection, command: string, value: unknown): Promise<unknown> {
    if (connection.exited) return Promise.reject(failure("fixture.worker.exited"));
    const request = ++connection.nextRequest;
    const answer = new Promise<unknown>((resolve, reject) => connection.pending.set(request, { resolve, reject }));
    send(connection.process, { type: "command", request, command, value });
    return answer;
  }
  private workerMessage(connection: Connection, value: unknown): void {
    if (!object(value)) return;
    try {
      if (value.type === "ready") { connection.ready.resolve(); this.emit({ kind: "worker-ready", workerPid: connection.pid }); }
      else if (value.type === "fatal") {
        const code = typeof value.code === "string" ? value.code : "fixture.worker.fatal";
        connection.ready.reject(failure(code));
        this.emit({ kind: "worker-fatal", workerPid: connection.pid, code });
      } else if (value.type === "response" && typeof value.request === "number") {
        const pending = connection.pending.get(value.request);
        connection.pending.delete(value.request);
        if (value.ok === true) pending?.resolve(value.value);
        else pending?.reject(failure(typeof value.code === "string" ? value.code : "fixture.ipc.invalid"));
      } else if (value.type === "event" && typeof value.name === "string") {
        this.emit({ kind: value.name, workerPid: connection.pid,
          ...(typeof value.barrier === "string" ? { barrier: value.barrier } : {}),
          ...(typeof value.code === "string" ? { code: value.code } : {}),
          ...(typeof value.complete === "boolean" ? { complete: value.complete } : {}),
          ...(value.record !== undefined ? { record: record(value.record) } : {}),
        });
      } else if (value.type === "freeze" && value.grant === connection.grant && this.incumbent === connection) {
        connection.frozen = true;
        this.revoke(connection);
        this.emit({ kind: "launches-frozen", workerPid: connection.pid });
      } else if (value.type === "control-stop" && value.grant === connection.grant && this.incumbent === connection) {
        const operation = identity(value.value);
        this.revoke(connection, operation);
        const effect = this.effects.get(key(operation));
        if (effect !== undefined) this.stopEffect(effect);
        this.emit({ kind: "revoked", workerPid: connection.pid });
      } else if (value.type === "rpc" && typeof value.rpc === "number" && typeof value.method === "string") {
        const rpc = value.rpc;
        void this.rpc(connection, value.grant, value.method, value.value).then(
          answer => send(connection.process, { type: "rpc-result", rpc, ok: true, value: answer }),
          cause => send(connection.process, { type: "rpc-result", rpc, ok: false, code: errorCode(cause) }),
        );
      }
    } catch (cause) {
      connection.ready.reject(cause);
      this.emit({ kind: "protocol-error", workerPid: connection.pid, code: errorCode(cause) });
    }
  }
  private live(connection: Connection, grant: unknown, ordinary: boolean): void {
    if (this.incumbent !== connection || connection.exited || grant !== connection.grant) throw failure("fixture.writer.stale");
    if (ordinary && connection.frozen) throw failure("fixture.store.frozen");
  }
  private async rpc(connection: Connection, grant: unknown, method: string, value: unknown): Promise<unknown> {
    this.live(connection, grant, method !== "observe" && method !== "wait-result" && method !== "reconciled");
    if (method === "reserve") {
      const operation = submission(value);
      requireLiveResult(operation.scope, operation.input.trim());
      if (this.reservation !== undefined && (this.reservation.grant !== connection.grant || key(this.reservation.operation) !== key(operation))) {
        throw failure("fixture.operation.overloaded");
      }
      this.reservation ??= { grant: connection.grant, operation };
      return null;
    }
    if (method === "permission") {
      const claimed = record(value);
      if (claimed.state !== "claimed" || claimed.claim === null || claimed.cancel || this.reservation?.grant !== connection.grant ||
        key(this.reservation.operation) !== key(claimed)) throw failure("fixture.launch.unpermitted");
      if (this.permissions.has(claimed.claim)) throw failure("fixture.launch.consumed");
      this.permissions.set(claimed.claim, { grant: connection.grant, operation: claimed, claim: claimed.claim, consumed: false, revoked: false });
      return null;
    }
    if (method === "launch") {
      const requested = launch(value);
      if (this.holdLaunch) {
        this.holdLaunch = false;
        return new Promise<StoredChild>((complete, reject) => {
          this.heldLaunch = { connection, value: requested, complete, reject };
          this.emit({ kind: "launch-held", workerPid: connection.pid });
        });
      }
      return this.launchEffect(connection, requested);
    }
    if (method === "observe") {
      const observed = this.effects.get(key(identity(value)));
      return observed === undefined ? null : this.witness(observed);
    }
    if (method === "wait-result") {
      const observed = this.effects.get(key(identity(value)));
      if (observed === undefined) throw failure("fixture.effect.missing");
      const finished = await observed.finished.promise;
      if (observed.failureCode !== undefined) throw failure(observed.failureCode);
      return finished;
    }
    if (method === "reconciled") { connection.frozen = false; return null; }
    throw failure("fixture.ipc.invalid");
  }
  private revoke(connection: Connection, operation?: Identity): void {
    for (const permission of this.permissions.values()) {
      if (permission.grant === connection.grant && (operation === undefined || key(permission.operation) === key(operation))) permission.revoked = true;
    }
    if (this.reservation?.grant === connection.grant && this.reservation.effect === undefined &&
      (operation === undefined || key(this.reservation.operation) === key(operation))) this.reservation = undefined;
  }

  private async launchEffect(connection: Connection, requested: Launch): Promise<StoredChild> {
    this.live(connection, connection.grant, true);
    const permission = this.permissions.get(requested.claim);
    if (permission === undefined || permission.grant !== connection.grant || key(permission.operation) !== key(requested)) throw failure("fixture.launch.unpermitted");
    if (permission.revoked) throw failure("fixture.launch.revoked");
    if (permission.consumed) throw failure("fixture.launch.consumed");
    if (this.reservation?.grant !== connection.grant || key(this.reservation.operation) !== key(requested) || this.reservation.effect !== undefined) {
      throw failure("fixture.operation.overloaded");
    }
    // Consumption precedes fork with no intervening await or foreign callback.
    permission.consumed = true;
    const path = join(this.directory, `effect-${requested.claim}.jsonl`);
    const resultMode = this.malformedResult ? "invalid-result" : "";
    this.malformedResult = false;
    const spawned = fork(fileURLToPath(new URL("effect.js", import.meta.url)), [path, requested.scope, requested.id, requested.payload, resultMode], {
      stdio: ["ignore", "pipe", "pipe", "ipc"], execArgv: [], env: processEnv(join(this.directory, "worker-tmp")),
    });
    if (spawned.pid === undefined) throw failure("fixture.effect.no-pid");
    const observed: Effect = {
      process: spawned, operation: requested, path, held: Promise.withResolvers<void>(), exit: Promise.withResolvers<void>(),
      finished: Promise.withResolvers<ChildWitness>(), child: { pid: spawned.pid, started: false, exited: false, code: null, signal: null },
      result: null, failureCode: undefined, artifact: undefined, cleanupDebt: false, stopRequested: false,
    };
    this.effects.set(key(requested), observed);
    this.reservation.effect = observed;
    spawned.stdout?.resume();
    spawned.stderr?.resume();
    spawned.once("spawn", () => { this.launches += 1; this.emit({ kind: "effect-spawn", child: observed.child }); });
    spawned.once("error", cause => { observed.held.reject(cause); observed.finished.reject(cause); });
    spawned.on("message", (message: unknown) => {
      if (!object(message)) return;
      if (message.type === "held" && message.pid === observed.child.pid) {
        observed.child = { ...observed.child, started: true };
        this.handshakes += 1;
        observed.held.resolve();
        this.emit({ kind: "effect-held", child: observed.child });
        if (observed.stopRequested) send(spawned, { type: "stop" });
      } else if (message.type === "result" && observed.failureCode === undefined) {
        try { observed.result = result(message.value); }
        catch {
          // Keep the handle and live slot until exit. Protocol failure is not a catalog result.
          observed.failureCode = "fixture.effect.invalid-result";
          observed.result = null;
          this.revoke(connection, requested);
          this.stopEffect(observed);
          this.emit({ kind: "effect-failed", code: observed.failureCode, child: observed.child });
        }
      } else if (message.type === "fatal") observed.finished.reject(failure("fixture.effect.failed"));
    });
    spawned.once("exit", (code, signal) => {
      if (signal !== null && signal !== "SIGTERM" && signal !== "SIGKILL") {
        observed.finished.reject(failure("fixture.effect.unexpected-signal"));
      }
      observed.child = child({ ...observed.child, exited: true, code, signal });
      this.exits += 1;
      if (this.reservation?.effect === observed) this.reservation = undefined;
      observed.exit.resolve();
      this.emit({ kind: "effect-exit", child: observed.child });
      void (async () => {
        observed.artifact = await readFile(path, "utf8");
        if (this.failCleanup) { this.failCleanup = false; observed.cleanupDebt = true; }
        else {
          try { await rm(path); }
          catch { observed.cleanupDebt = true; }
        }
        observed.finished.resolve(this.witness(observed));
      })().catch(cause => observed.finished.reject(cause));
    });
    await observed.held.promise;
    if (this.holdAcknowledgement) {
      this.holdAcknowledgement = false;
      await new Promise<void>(resolve => {
        this.heldAcknowledgement = resolve;
        this.emit({ kind: "launch-ack-held", workerPid: connection.pid, child: observed.child });
      });
    }
    return child(observed.child);
  }
  private witness(value: Effect): ChildWitness { return witness({ child: value.child, result: value.result, cleanupDebt: value.cleanupDebt }); }
  private stopEffect(value: Effect): void {
    value.stopRequested = true;
    if (value.child.started && !value.child.exited) send(value.process, { type: "stop" });
  }
  holdNextLaunch(): void { this.holdLaunch = true; }
  holdNextAcknowledgement(): void { this.holdAcknowledgement = true; }
  failNextEffectCleanup(): void { this.failCleanup = true; }
  malformNextEffectResult(): void { this.malformedResult = true; }
  async deliverHeldLaunch(): Promise<void> {
    const held = this.heldLaunch;
    if (held === undefined) throw failure("fixture.barrier.missing");
    this.heldLaunch = undefined;
    try { held.complete(await this.launchEffect(held.connection, held.value)); }
    catch (cause) { held.reject(failure(errorCode(cause))); }
  }
  releaseAcknowledgement(): void { this.heldAcknowledgement?.(); this.heldAcknowledgement = undefined; }
  async complete(value: Identity): Promise<void> {
    const effect = this.effects.get(key(value));
    if (effect === undefined) throw failure("fixture.effect.missing");
    await effect.held.promise;
    send(effect.process, { type: "complete" });
  }
  async stopEffectAndObserve(value: Identity): Promise<ChildWitness> {
    const effect = this.effects.get(key(value));
    if (effect === undefined) throw failure("fixture.effect.missing");
    this.stopEffect(effect);
    await effect.exit.promise;
    return effect.finished.promise;
  }
  async observeEffectExit(value: Identity): Promise<ChildWitness> {
    const effect = this.effects.get(key(value));
    if (effect === undefined) throw failure("fixture.effect.missing");
    await effect.exit.promise;
    return effect.finished.promise;
  }
  async retryEffectCleanup(value: Identity): Promise<void> {
    const effect = this.effects.get(key(value));
    if (effect === undefined || !effect.child.exited) throw failure("fixture.effect.still-alive");
    await rm(effect.path, { force: true });
    effect.cleanupDebt = false;
  }
  async effectArtifact(value: Identity): Promise<string> {
    const effect = this.effects.get(key(value));
    if (effect === undefined) throw failure("fixture.effect.missing");
    return effect.artifact ?? readFile(effect.path, "utf8");
  }
  async retainedEffectArtifact(value: Identity): Promise<string> {
    const effect = this.effects.get(key(value));
    if (effect === undefined) throw failure("fixture.effect.missing");
    return readFile(effect.path, "utf8");
  }
  async [Symbol.asyncDispose](): Promise<void> {
    // Watchdog killing is cleanup of a failed/stuck test, never a successful stop oracle.
    let watchdogUsed = false;
    const watchdog = setTimeout(() => {
      watchdogUsed = true;
      for (const value of this.effects.values()) if (!value.child.exited) value.process.kill("SIGKILL");
      for (const value of this.workers) if (!value.exited) value.process.kill("SIGKILL");
    }, 5000);
    try {
      this.heldLaunch?.reject(failure("fixture.launch.revoked"));
      this.heldLaunch = undefined;
      this.releaseAcknowledgement();
      for (const value of this.effects.values()) this.stopEffect(value);
      await Promise.all([...this.workers].map(async connection => {
        if (!connection.exited) await this.command(connection, "stop", null).catch(() => {});
        await connection.exit.promise;
      }));
      await Promise.all([...this.effects.values()].map(value => value.exit.promise));
      await this.store[Symbol.asyncDispose]();
      await rm(this.directory, { recursive: true, force: true });
      if (watchdogUsed) throw failure("fixture.cleanup.watchdog");
    } finally { clearTimeout(watchdog); }
  }
}
