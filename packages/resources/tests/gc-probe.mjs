// Run as: node --expose-gc gc-probe.mjs. Prints one JSON line.
// Detached children must become unreachable while their parent stays alive.
import { createScope } from "../dist/index.js";

const parent = createScope({ name: "host" });
const references = [];
for (let index = 0; index < 2000; index += 1) {
  const child = parent.resources.child({ name: `s${index}` });
  child.resources.use({ [Symbol.dispose]: () => {} }, "r");
  references.push(new WeakRef(child.resources));
  await child.control.close();
}
for (let round = 0; round < 3; round += 1) {
  await new Promise(resolve => { setTimeout(resolve, 5); });
  globalThis.gc();
}
const alive = references.filter(reference => reference.deref() !== undefined).length;
// Closing the parent only after the collections keeps it reachable during them;
// a probe whose parent is already garbage passes even when children leak.
const parentReport = await parent.control.close();
process.stdout.write(`${JSON.stringify({ alive, parentComplete: parentReport.complete })}\n`);
