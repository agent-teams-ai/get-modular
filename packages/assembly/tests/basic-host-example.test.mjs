import assert from "node:assert/strict";
import test from "node:test";
import { runBasicHost } from "../examples/basic-host.mjs";

test("the documented basic Host compiles, constructs, and cleans up", async () => {
  let disposed = 0;
  const outcome = await runBasicHost({ onConfigurationDisposed: () => disposed++ });
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.message, "Hello modules, from consumer");
  assert.deepEqual(
    outcome.created.map(({ implementationId }) => implementationId),
    [
      "example/configuration/environment",
      "example/greeting/default",
      "example/application/default",
    ],
  );
  assert.equal(disposed, 1);
});

test("the documented basic Host does not start an aborted attempt", async () => {
  const controller = new AbortController();
  controller.abort("consumer stopped");
  const outcome = await runBasicHost({ signal: controller.signal });
  assert.deepEqual(outcome, {
    status: "cancelled",
    reason: "consumer stopped",
    created: [],
  });
});
