import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";
import { synthetic } from "./fixture.mjs";

test("preparation preserves non-enumerable envelope data and rejects extra fields", async () => {
  const host = await synthetic();
  const composition = structuredClone(host.input.composition);
  Object.defineProperty(composition, "digest", { enumerable: false });
  assert.equal((await host.api.prepare({ ...host.input, composition })).status, "prepared");
  Object.defineProperty(composition, "success", { value: false, enumerable: false });
  assert.equal((await host.api.prepare({ ...host.input, composition })).status, "failed");
  assert.deepEqual(host.trace, []);
});

test("native Promises work inside Node async context without observing symbol getters", async () => {
  const context = new AsyncLocalStorage();
  await context.run("host-scope", async () => {
    const host = await synthetic({ appFactory: async () => ({ instance: context.getStore(), capabilities: {} }) });
    const result = await host.prepared.run();
    assert.equal(result.status, "succeeded");
    assert.equal(result.roots.app, "host-scope");
  });
  let reads = 0;
  const carrier = Promise.resolve({ instance: {}, capabilities: {} });
  Object.defineProperty(carrier, Symbol("metadata"), { get() { reads++; return 1; } });
  const invalid = await synthetic({ appFactory: () => carrier });
  assert.equal((await invalid.prepared.run()).code, "assembly.run.unsupported-carrier");
  assert.equal(reads, 0);
});
