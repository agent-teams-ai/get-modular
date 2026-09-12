import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { declaration, profile } from "./fixture.mjs";

// Both roots are installed by the existing disposable packed-consumer harness.
const roots = [import.meta.dirname, process.argv[2]];
const copies = [];
for (const root of roots) {
  const require = createRequire(join(root, "package.json"));
  const assemblyPath = require.resolve("@get-modular/assembly");
  const corePath = createRequire(assemblyPath).resolve("@get-modular/core");
  assert.equal(await realpath(assemblyPath), join(root, "node_modules/@get-modular/assembly/dist/index.js"));
  assert.equal(await realpath(corePath), join(root, "node_modules/@get-modular/core/dist/index.js"));
  assert.equal(dirname(dirname(corePath)), join(root, "node_modules/@get-modular/core"));
  copies.push({ assemblyPath, corePath,
    assembly: await import(pathToFileURL(assemblyPath).href), core: await import(pathToFileURL(corePath).href) });
}
assert.notEqual(copies[0].assemblyPath, copies[1].assemblyPath);
assert.notEqual(copies[0].corePath, copies[1].corePath);
assert.notEqual(copies[0].assembly.assemblyFor, copies[1].assembly.assemblyFor);
const item = declaration("copy-root");
const selectedProfile = profile([item]);
const calls = [0, 0];
const subjects = [];
for (const [index, copy] of copies.entries()) {
  const producer = copy.assembly.assemblyFor();
  const receiver = copy.assembly.assemblyFor();
  assert.notEqual(producer, receiver);
  const handle = producer.bindFactory(item, async () => {
    calls[index]++;
    return { instance: { value: "local" }, capabilities: {} };
  });
  const composition = await copy.core.compileComposition({ declarations: [item], profile: selectedProfile });
  assert.ok("plan" in composition, JSON.stringify(composition));
  // Same-copy assemblyFor instances exchange handles successfully, in each copy.
  const input = { composition, factories: [handle], roots: { app: handle } };
  const ready = await receiver.prepare(input);
  assert.equal(ready.status, "prepared", JSON.stringify(ready));
  const outcome = await ready.prepared.run();
  assert.equal(outcome.status, "succeeded", JSON.stringify(outcome));
  assert.deepEqual(outcome.roots.app, { value: "local" });
  subjects.push({ receiver, input, handle });
}
assert.deepEqual(calls, [1, 1]);
assert.deepEqual(subjects[0].input.composition, subjects[1].input.composition);
calls.fill(0);
for (const [local, foreign] of [[subjects[0], subjects[1]], [subjects[1], subjects[0]]]) {
  const refused = await local.receiver.prepare({ ...local.input,
    factories: [foreign.handle], roots: { app: foreign.handle },
  });
  assert.equal(refused.status, "failed");
  assert.equal(refused.error.code, "assembly.prepare.handles");
  assert.deepEqual(refused.diagnostics, []);
  assert.deepEqual(calls, [0, 0]);
}
console.log("package-copy:passed");
