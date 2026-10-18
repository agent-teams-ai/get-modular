import assert from "node:assert/strict";
import { declareModule } from "@get-modular/assembly";
import { contractSuite } from "@get-modular/conformance";
import { Runner } from "../../../src/features/session/composition/session.contracts.js";
import type { JournalPort, JournalRecord, RunnerPort } from "../../../src/features/session/contracts/session.js";

export const fakeDeclaration = declareModule({
  moduleId: "fixture/session/runner-fake",
  implementationId: "fixture/session/runner-fake/test",
  owner: { authority: "fixture", path: ["session"] },
  provides: [Runner.provide()],
  slots: [],
});

export function createFake(journal: JournalPort): RunnerPort {
  return {
    run: async request => {
      if (request.signal.aborted) {
        throw Object.assign(new Error("Fake cancelled before its effect."), { code: "fixture.operation.cancelled" });
      }
      if (request.payload === "!fail") {
        throw Object.assign(new Error("Requested fake failure."), { code: "fixture.runner.failed" });
      }
      const value = `${request.scope}:fake:${request.payload}`;
      await journal.append({ kind: "effect", scope: request.scope, id: request.id, value });
      return value;
    },
  };
}

export function ownerSuite(tag: string, readRecords: () => Promise<readonly JournalRecord[]>) {
  return contractSuite(Runner, {
    "preserves payload and records one successful effect": async (runner, context) => {
      const value = await runner.run({ scope: "suite", id: "success", payload: " hello ", signal: context.signal });
      assert.equal(value, `suite:${tag}: hello `);
      assert.deepEqual((await readRecords()).filter(record => record.kind === "effect"), [
        { kind: "effect", scope: "suite", id: "success", value: `suite:${tag}: hello ` },
      ]);
    },
    "fails without an effect": async (runner, context) => {
      await assert.rejects(runner.run({ scope: "suite", id: "failure", payload: "!fail", signal: context.signal }), {
        code: "fixture.runner.failed",
      });
      assert.deepEqual((await readRecords()).filter(record => record.kind === "effect"), []);
    },
    "cancels before starting an effect": async runner => {
      const controller = new AbortController();
      controller.abort("contract-case");
      await assert.rejects(runner.run({ scope: "suite", id: "cancel", payload: "hello", signal: controller.signal }), {
        code: "fixture.operation.cancelled",
      });
      assert.deepEqual((await readRecords()).filter(record => record.kind === "effect"), []);
    },
  });
}
