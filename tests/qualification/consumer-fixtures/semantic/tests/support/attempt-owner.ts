import { createScope, type CloseOptions, type CloseReport } from "@get-modular/resources";
import type { composeSemantic } from "../../src/composition/semantic.root.js";
import type { SessionPort, SessionRequest } from "../../src/features/session/contracts/session.js";
import type { FileJournal } from "./journal.js";

type PreparedSemantic = Extract<Awaited<ReturnType<typeof composeSemantic>>, { status: "prepared" }>["prepared"];
type Phase = "starting" | "ready" | "stopping" | "debt" | "closed";

interface AttemptOptions {
  readonly readiness?: Promise<void>;
  readonly beforePublication?: Promise<void>;
  readonly capacity?: number;
}

export function makeInputs(identity: string, journal: FileJournal) {
  return {
    identity: { "fixture/session/identity": { read: () => identity } },
    journal: { "fixture/session/journal": journal.port },
  };
}

export function createAttempt(prepared: PreparedSemantic, identity: string, journal: FileJournal, options: AttemptOptions = {}) {
  const construction = new AbortController();
  const operations = new AbortController();
  const scope = createScope({ name: identity });
  const acceptedWork = new Set<Promise<void>>();
  const closeStarted = Promise.withResolvers<void>();
  const capacity = options.capacity ?? Number.POSITIVE_INFINITY;
  if (capacity !== Number.POSITIVE_INFINITY && (!Number.isSafeInteger(capacity) || capacity < 1)) {
    throw new Error("fixture.capacity.invalid");
  }
  let phase: Phase = "starting";
  let stopping = false;
  let ingressOpen = false;
  let publications = 0;
  let session: SessionPort | undefined;
  let activeStop: Promise<CloseReport> | undefined;
  let lastReport: CloseReport | undefined;
  let resourcesClosing = false;

  const requestStop = (): void => {
    if (stopping) return;
    stopping = true;
    ingressOpen = false;
    phase = "stopping";
    construction.abort("fixture.attempt.stop");
    operations.abort("fixture.attempt.stop");
  };
  // The owner is returned and retained before any factory can begin.
  const startup = Promise.resolve().then(() => prepared.run({
    signal: construction.signal, scope: scope.resources, inputs: makeInputs(identity, journal),
  }));
  const ready = (async () => {
    const outcome = await startup;
    if (outcome.status !== "succeeded") {
      requestStop();
      return false;
    }
    await options.readiness;
    await options.beforePublication;
    // Publication is one synchronous commit after the final live check; no foreign callback runs here.
    if (stopping) return false;
    session = outcome.roots.session;
    ingressOpen = true;
    publications += 1;
    phase = "ready";
    return true;
  })();
  void ready.catch(() => requestStop());

  const run = (request: SessionRequest): Promise<string> => {
    if (!ingressOpen || session === undefined) {
      return Promise.reject(Object.assign(new Error("Session ingress is closed."), { code: "fixture.ingress.closed" }));
    }
    if (acceptedWork.size >= capacity) {
      return Promise.reject(Object.assign(new Error("Session capacity is occupied; no queue is available."), { code: "fixture.operation.overloaded" }));
    }
    const acceptedSession = session;
    const signal = AbortSignal.any([operations.signal, request.signal]);
    const result = Promise.resolve().then(() => acceptedSession.run({ ...request, signal }));
    // Exactly one ledger owns each accepted operation, through its terminal append.
    const settled = result.then(() => {}, () => {});
    acceptedWork.add(settled);
    void settled.then(() => acceptedWork.delete(settled));
    return result;
  };

  const stop = (): Promise<CloseReport> => {
    requestStop();
    if (activeStop) return activeStop;
    if (lastReport?.complete) return Promise.resolve(lastReport);
    const flight = (async () => {
      await Promise.allSettled([startup, ready]);
      await Promise.all([...acceptedWork]);
      const closing = scope.control.close();
      resourcesClosing = true;
      closeStarted.resolve();
      const report = await closing;
      resourcesClosing = false;
      if (report.complete) {
        await journal.close();
        phase = "closed";
      } else phase = "debt";
      lastReport = report;
      return report;
    })();
    activeStop = flight;
    void flight.then(() => { activeStop = undefined; }, () => { activeStop = undefined; });
    return flight;
  };

  const observeClose = (options: Pick<CloseOptions, "abandon">): Promise<CloseReport> => {
    if (!resourcesClosing) {
      throw Object.assign(new Error("The owner has no active resource-close flight."), { code: "fixture.close.not-started" });
    }
    return scope.control.close(options);
  };
  return {
    startup,
    ready,
    closeStarted: closeStarted.promise,
    signal: operations.signal,
    run,
    requestStop,
    stop,
    close: stop,
    observeClose,
    snapshot: () => ({ identity, phase, ingressOpen, publications, activeWork: acceptedWork.size, lastReport }),
    [Symbol.asyncDispose]: async () => {
      const report = await stop();
      if (!report.complete) {
        throw Object.assign(new Error("Attempt cleanup retained debt and its journal."), {
          code: "fixture.attempt.close-incomplete", identity, phase, report,
        });
      }
      await journal[Symbol.asyncDispose]();
    },
  };
}
