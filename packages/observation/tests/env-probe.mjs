import assert from "node:assert/strict";
import { createScope } from "@get-modular/resources";
import { createStore } from "../dist/index.js";
import { asyncDetection, delivered, settled } from "../dist/testing.js";
const mode = process.argv[2];
const host = createScope({ name: "environment" });
const reports = [];
const make = name => createStore({ a: 0 }, { resources: host.resources, name, reportError: report => { reports.push(report); } });
const one = make("one"); const facet = one.readonly(); let calls = 0;
facet.watch(facet.read(["a"]), { resources: host.resources, name: "echo", onChange: () => { calls += 1; if (calls < 5) one.set({ a: 2 }); } });
one.set({ a: 1 });
await delivered({ stores: [facet], timeoutMs: 2000 });
assert.equal(calls, 1); assert.equal(reports.length, 1); assert.equal(reports[0].cause.code, "observation.delivery.echo");
assert.equal(asyncDetection, !["no-builtin-module", "no-node"].includes(mode));
if (mode === "fake-clock-before") {
  assert.equal(performance.now(), 123); assert.equal(Date.now(), 123);
  let release;
  facet.load(facet.read(["a"]), { resources: host.resources, name: "held", loader: () => new Promise(resolve => { release = resolve; }),
    onLoading: () => undefined, onResult: () => undefined, onError: () => undefined });
  await delivered({ stores: [facet] });
  await assert.rejects(settled({ stores: [facet], timeoutMs: 20 }), { code: "observation.testing.timeout" });
  release(1); await settled();
}
if (!asyncDetection) {
  const loaderStore = make("loader"); const loadFacet = loaderStore.readonly(); let loads = 0;
  loadFacet.load(loadFacet.read(["a"]), { resources: host.resources, name: "load-echo",
    loader: () => { loads += 1; if (loads < 5) loaderStore.set({ a: 1 }); return 1; },
    onLoading: () => undefined, onResult: () => undefined, onError: () => undefined });
  await settled(); assert.equal(loads, 1);
  assert.equal(reports.filter(report => report.subscription === "load-echo" && report.cause.code === "observation.delivery.echo").length, 1);
  for (const writeOnRead of [0, 1, 2]) {
    const source = make(`constructor-${writeOnRead}`); const read = source.readonly();
    let reads = 0; let calls = 0; const results = []; const errors = [];
    read.load(read.read(["a"]), { resources: host.resources, name: `constructor-${writeOnRead}`,
      loader: () => {
        calls += 1;
        const promise = Promise.resolve("result");
        if (calls === 1) Object.defineProperty(promise, "constructor", { get() {
          reads += 1; if (reads === writeOnRead) source.set({ a: 1 }); return Promise;
        } });
        return promise;
      },
      onLoading: () => undefined, onResult: value => { results.push(value); }, onError: cause => { errors.push(cause); },
    });
    await settled({ stores: [read] });
    assert.equal(calls, 1); assert.equal(reads, 1); assert.equal(source.read(["a"]).revision, 0);
    assert.equal(source.read(["a"]).values.a, 0);
    assert.deepEqual(results, writeOnRead === 1 ? [] : ["result"]);
    assert.deepEqual(errors.map(cause => cause.code), writeOnRead === 1 ? ["observation.delivery.echo"] : []);
    const attributed = reports.filter(report => report.subscription === `constructor-${writeOnRead}`);
    assert.equal(attributed.length, Number(writeOnRead === 1));
    if (writeOnRead === 1) assert.equal(attributed[0].cause, errors[0]);
  }
  const left = make("left"); const right = make("right"); let chain = 0;
  for (const [source, target] of [[left, right], [right, left]]) {
    const read = source.readonly(); read.watch(read.read(["a"]), { resources: host.resources, name: "cascade", onChange: ({ values }) => {
      chain += 1; if (chain < 100) target.set({ a: values.a + 1 });
    } });
  }
  left.set({ a: 1 }); await delivered(); assert.equal(chain, 65);
  assert.equal(reports.filter(report => report.cause.code === "observation.delivery.cascade").length, 1);
}
await host.control.close();
console.log(`ok ${mode}`);
