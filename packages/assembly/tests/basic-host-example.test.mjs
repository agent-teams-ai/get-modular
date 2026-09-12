import assert from "node:assert/strict";
import test from "node:test";
import { basicHostExitCode, runBasicHost } from "../examples/basic-host.mjs";

test("the documented basic Host compiles, constructs, and cleans up", async () => {
  let disposed = 0;
  const outcome = await runBasicHost({ onConfigurationDisposed: () => disposed++ });
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.message, "Hello modules, from consumer");
  assert.deepEqual(
    outcome.createdImplementationIds,
    [
      "example/configuration/environment",
      "example/greeting/default",
      "example/application/default",
    ],
  );
  assert.equal(disposed, 1);
  assert.equal(basicHostExitCode(outcome), 0);
  assert.deepEqual(Object.keys(outcome).sort(), ["createdImplementationIds", "message", "status"]);
});

test("the documented basic Host does not start an aborted attempt", async () => {
  const controller = new AbortController();
  controller.abort("consumer stopped");
  const outcome = await runBasicHost({ signal: controller.signal });
  assert.deepEqual(outcome, {
    status: "cancelled",
    reason: "consumer stopped",
    createdImplementationIds: [],
  });
});

for (const cause of [new Error("cleanup"), undefined]) {
  test(`cleanup failure is retained even when work succeeds (${String(cause)})`, async () => {
    const outcome = await runBasicHost({ onConfigurationDisposed() { throw cause; } });
    assert.equal(outcome.status, "succeeded");
    assert.equal(outcome.message, "Hello modules, from consumer");
    assert.deepEqual(outcome.cleanupFailure, { cause });
    assert.equal(basicHostExitCode(outcome), 1);
  });
}

for (const phase of ["factory", "use"]) {
  for (const cause of [new Error("work"), undefined]) {
    test(`${phase} failure preserves primary and cleanup failures (${String(cause)})`, async () => {
      let disposed = 0;
      const cleanupCause = new Error("cleanup");
      const greetingPort = phase === "factory"
        ? { get greet() { throw cause; } }
        : { async greet() { throw cause; } };
      const outcome = await runBasicHost({
        greetingPort,
        onConfigurationDisposed() { disposed++; throw cleanupCause; },
      });
      assert.equal(outcome.status, "failed");
      assert.equal(outcome.phase, phase);
      assert.ok(Object.hasOwn(outcome, "cause"));
      assert.equal(outcome.cause, cause);
      assert.equal(outcome.cleanupFailure.cause, cleanupCause);
      assert.equal(disposed, 1);
      assert.equal(basicHostExitCode(outcome), 1);
      assert.deepEqual(outcome.createdImplementationIds, phase === "factory"
        ? ["example/configuration/environment"]
        : ["example/configuration/environment", "example/greeting/default", "example/application/default"]);
      if (phase === "factory") assert.equal(outcome.code, "assembly.run.factory-rejected");
      for (const key of ["roots", "created", "returned"]) assert.equal(Object.hasOwn(outcome, key), false);
    });
  }
}

test("borrowed work and shared configuration wrappers retain their owners through use", async () => {
  const trace = [];
  let borrowedDisposals = 0;
  const greetingPort = {
    async greet(name, audience) {
      assert.equal(this, greetingPort);
      assert.deepEqual(trace, []);
      await Promise.resolve();
      assert.deepEqual(trace, []);
      trace.push("use");
      return `${name}/${audience}`;
    },
    [Symbol.dispose]() { borrowedDisposals++; },
    [Symbol.asyncDispose]() { borrowedDisposals++; },
  };
  const outcome = await runBasicHost({ greetingPort, onConfigurationDisposed() { trace.push("dispose"); } });
  assert.equal(outcome.message, "modules/consumer");
  assert.deepEqual(trace, ["use", "dispose"]);
  assert.equal(borrowedDisposals, 0);
  assert.equal(basicHostExitCode(outcome), 0);
});
