import assert from "node:assert/strict";
import { createScope } from "@get-modular/resources";
import { createStore } from "../dist/index.js";
import { delivered } from "../dist/testing.js";
const mode = process.argv[2];
const tick = () => new Promise(resolve => { setImmediate(resolve); });
const noop = () => {};
const controls = [];
const retained = [];
const timers = [];
const subscriber = createScope({ name: "long-lived-subscriber" });

async function subject(index, control) {
  const payload = { index, data: Array(50).fill(index) };
  const host = createScope({ name: `host${index}` });
  const scope = host.resources.child({ name: "subscriber" });
  const store = createStore({ value: 0, payload }, { name: `store${index}`, resources: host.resources, reportError: noop });
  const facet = store.readonly();
  const handler = () => {
    void payload.data;
    if (mode === "als-retention") timers.push(setInterval(noop, 60000));
  };
  // Completed callbacks must not retain an otherwise unreachable closed store's values.
  // The subscriber-only case keeps the store alive and therefore observes the handler.
  const reference = new WeakRef(mode === "subscriber-closed" ? handler : payload);
  facet.watch(facet.read(["value"]), { resources: mode === "store-closed" ? subscriber.resources : scope.resources,
    name: `watch${index}`, onChange: handler });
  store.set({ value: 1 });
  await delivered({ stores: [facet] });
  if (control) {
    retained.push({ host, store, handler, payload });
  } else if (mode === "subscriber-closed") {
    await scope.control.close(); retained.push({ host, store });
  } else {
    store.close(); await host.control.close(); await delivered({ stores: [facet] });
  }
  return reference;
}

const refs = [];
try {
  for (let index = 0; index < 200; index += 1) {
    refs.push(await subject(index, false));
    controls.push(await subject(index + 200, true));
  }
  let previous = -1; let stable = 0; let alive = refs.length;
  for (let round = 0; round < 10 && stable < 2; round += 1) {
    await tick(); globalThis.gc();
    alive = refs.filter(ref => ref.deref() !== undefined).length;
    stable = alive === previous ? stable + 1 : 0;
    previous = alive;
  }
  const controlAlive = controls.filter(ref => ref.deref() !== undefined).length;
  console.log(JSON.stringify({ alive, controlAlive }));
  assert.ok(alive <= 2, `${mode}: ${alive} retained subjects`);
  assert.equal(controlAlive, 200);
} finally {
  for (const timer of timers) clearInterval(timer);
  await Promise.all(retained.map(({ host }) => host.control.close()));
  await subscriber.control.close();
}
