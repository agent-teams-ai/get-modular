import assert from "node:assert/strict";
import { createScope } from "@get-modular/resources";

const mode = process.argv[2];
const runtime: { getBuiltinModule: ((name: string) => unknown) | undefined } = process;
const original = runtime.getBuiltinModule;
assert.ok(original !== undefined);
let clock = 0;
if (mode === "no-builtin") {runtime.getBuiltinModule = undefined;}
else {
  runtime.getBuiltinModule = name => {
    if (name === "node:perf_hooks" && mode === "deadline") {return { performance: { now: () => clock } };}
    if (name === "node:util") {
      if (mode === "missing-detector") {return { types: {} };}
      if (mode === "missing-util") {return;}
      if (mode === "throwing-util") {throw new Error("optional facility unavailable");}
    }
    return original(name);
  };
}
const { createStore, ObservationError } = await import("../dist/index.js");
const { delivered, settled } = await import("../dist/testing.js");
if (mode === "deadline") {
  for (const wait of [delivered, settled]) {
    clock = 0;
    const waiting = wait({ stores: [], timeoutMs: 1 });
    clock = 2;
    await assert.rejects(waiting, { code: "observation.testing.timeout" });
  }
} else {
  const host = createScope({ name: "optional-proxy-detector" });
  const options = { name: "data", resources: host.resources, reportError: (): undefined => {} };
  try {
    const data = { nested: [1, 2], empty: Object.create(null) as Record<string, unknown> };
    const store = createStore<{ readonly data: unknown }>({ data }, options), facet = store.readonly();
    assert.equal(store.read(["data"]).values.data, data);
    assert.equal(Object.isFrozen(data), true);
    assert.equal(Object.isFrozen(data.nested), true);
    assert.equal(Object.isFrozen(data.empty), true);
    let deliveries = 0;
    facet.watch(facet.read(["data"]), { resources: host.resources, name: "ordinary", onChange: () => { deliveries += 1; } });
    store.set({ data: { nested: [3], empty: {} } });
    await delivered({ stores: [facet] });
    assert.equal(deliveries, 1);
    if (mode === "missing-detector") {
      const cause = new Error("reflection refused");
      const throwing = new Proxy({ data: 0 }, { getPrototypeOf: () => { throw cause; } });
      const fresh = { nested: [] as number[], empty: {} };
      assert.throws(() => createStore(throwing, options),
        error => error instanceof ObservationError && error.code === "observation.values.not-plain" && error.cause === cause);
      assert.throws(() => store.set({ data: { ...fresh, extra: throwing } }),
        error => error instanceof ObservationError && error.code === "observation.values.not-plain" && error.cause === cause);
      assert.equal(Object.isFrozen(fresh.nested), false);
      const revoked = Proxy.revocable({ data: fresh }, {});
      revoked.revoke();
      assert.throws(() => Reflect.apply(store.set, undefined, [revoked.proxy]),
        error => error instanceof ObservationError && error.code === "observation.values.not-plain" && error.cause instanceof TypeError);
      const freezing = new Proxy({}, { preventExtensions: () => { throw cause; } });
      assert.throws(() => store.set({ data: { ...fresh, extra: freezing } }),
        error => error instanceof ObservationError && error.code === "observation.values.not-plain" && error.cause === cause);
      assert.equal(store.read(["data"]).revision, 1);
      await delivered({ stores: [facet] });
      assert.equal(deliveries, 1);
    }
  } finally {
    assert.deepEqual(await host.control.close(), { complete: true, settled: true, debts: [] });
  }
}
process.stdout.write(`ok ${mode}\n`);
