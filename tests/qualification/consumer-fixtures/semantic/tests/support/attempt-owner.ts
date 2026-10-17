import { createScope, type CloseReport } from "@get-modular/resources";
import type { composeSemantic } from "../../src/composition/semantic.root.js";
import type { FileJournal } from "./journal.js";

type PreparedSemantic = Extract<Awaited<ReturnType<typeof composeSemantic>>, { status: "prepared" }>["prepared"];

export function makeInputs(identity: string, journal: FileJournal) {
  return {
    identity: { "fixture/session/identity": { read: () => identity } },
    journal: { "fixture/session/journal": journal.port },
  };
}

// P1 owns construction and final close; P2 adds readiness, stop and in-flight operation ownership here.
export function createAttempt(prepared: PreparedSemantic, identity: string, journal: FileJournal) {
  const controller = new AbortController();
  const scope = createScope({ name: identity });
  // Construction starts after this synchronous call has returned the retained owner.
  const startup = Promise.resolve().then(() => prepared.run({
    signal: controller.signal, scope: scope.resources, inputs: makeInputs(identity, journal),
  }));
  let closing: Promise<CloseReport> | undefined;
  const close = async (): Promise<CloseReport> => {
    if (closing) return closing;
    closing = (async () => {
      await Promise.allSettled([startup]);
      const report = await scope.control.close();
      if (report.complete) await journal.close();
      return report;
    })();
    try { return await closing; }
    finally { closing = undefined; }
  };
  return {
    startup,
    signal: controller.signal,
    close,
    [Symbol.asyncDispose]: async () => {
      const report = await close();
      if (!report.complete) {
        throw Object.assign(new Error("Attempt cleanup retained debt and its journal."), { code: "fixture.attempt.close-incomplete", report });
      }
      await journal[Symbol.asyncDispose]();
    },
  };
}
