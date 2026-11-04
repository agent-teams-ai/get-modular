import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { createScope, type Scope } from "../dist/index.js";

type Subject = { readonly child: Scope; readonly reference: WeakRef<object> };
async function subject(mode: "closed" | "live" | "failed"): Promise<Subject> {
  const parent = createScope({ name: "parent" });
  const payload = { bytes: Array<number>(1000).fill(1) };
  parent.resources.use({ [Symbol.dispose](): void { assert.equal(payload.bytes.length, 1000); } }, "parent-resource");
  const child = parent.resources.child({ name: mode });
  if (mode === "failed") {
    child.resources.use({ [Symbol.dispose](): void { throw new Error("retained debt"); } }, "failed-resource");
  }
  if (mode !== "live") { assert.equal((await child.control.close()).complete, mode === "closed"); }
  return { child, reference: new WeakRef(payload) };
}

async function collect(): Promise<void> {
  assert.ok(globalThis.gc, "this probe requires --expose-gc");
  for (let round = 0; round < 8; round += 1) {
    await setImmediate();
    globalThis.gc();
  }
}

const closed: Scope[] = [];
const controls: Scope[] = [];
const releasedReferences: WeakRef<object>[] = [];
const controlReferences: WeakRef<object>[] = [];
for (let index = 0; index < 24; index += 1) {
  const released = await subject("closed");
  closed.push(released.child);
  releasedReferences.push(released.reference);
  for (const mode of ["live", "failed"] as const) {
    const retained = await subject(mode);
    controls.push(retained.child);
    controlReferences.push(retained.reference);
  }
}
await collect();
const retainedByClosed = releasedReferences.filter(reference => reference.deref() !== undefined).length;
const retainedByControls = controlReferences.filter(reference => reference.deref() !== undefined).length;
assert.ok(retainedByClosed <= 1, `${retainedByClosed} closed children retain their former parents`);
assert.equal(retainedByControls, 48, "live and failed children retain the ancestry needed for cleanup and retry");
assert.equal(closed.length, 24, "closed child handles remain reachable during collection");
closed.length = 0;
controls.length = 0;
await collect();
const afterDrop = [...releasedReferences, ...controlReferences].filter(reference => reference.deref() !== undefined).length;
assert.ok(afterDrop <= 1, `${afterDrop} payloads remain after dropping every child handle`);
process.stdout.write(`${JSON.stringify({ retainedByClosed, retainedByControls, afterDrop })}\n`);
