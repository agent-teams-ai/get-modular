import assert from "node:assert/strict";
import test from "node:test";
import { createScope } from "@get-modular/resources";
import { createStore } from "../dist/index.js";

type Link = { next: Link | null; payload: unknown };
type Chain = { readonly root: Link; readonly tail: Link; readonly nodes: readonly Link[] };

function chain(depth: number, payload: unknown): Chain {
  const tail: Link = { next: null, payload };
  const nodes = [tail];
  let root = tail;
  for (let index = 1; index < depth; index += 1) {
    root = { next: root, payload: index };
    nodes.push(root);
  }
  return { root, tail, nodes };
}

function assertFrozen(nodes: readonly object[], expected: boolean): void {
  for (const node of nodes) {assert.equal(Object.isFrozen(node), expected);}
}

test("deep initial values and patches preserve graph identity, cycles and frozen snapshots", context => {
  const host = createScope({ name: "deep-values" });
  context.after(() => host.control.close());
  const initial = chain(10_000, "initial");
  initial.tail.next = initial.root;
  const aliases = [initial.root, initial.root];
  const graph = { root: initial.root, again: initial.root, aliases };
  const store = createStore<{ value: unknown }>({ value: graph }, {
    name: "state", resources: host.resources, reportError: () => undefined,
  });
  const before = store.read(["value"]);
  assert.equal(before.revision, 0);
  assert.equal(before.values.value, graph);
  assert.equal(graph.root, graph.again);
  assert.equal(aliases[0], aliases[1]);
  assert.equal(initial.tail.next, initial.root);
  assertFrozen([...initial.nodes, aliases, graph, before, before.values], true);
  assert.throws(() => { initial.tail.payload = "changed"; }, TypeError);

  const replacement = chain(10_000, "replacement");
  replacement.tail.next = replacement.root;
  const next = { root: replacement.root, previous: graph };
  assert.equal(store.set({ value: next }), 1);
  const after = store.read(["value"]);
  assert.equal(after.revision, 1);
  assert.equal(after.values.value, next);
  assert.equal(next.previous, graph);
  assert.equal(replacement.tail.next, replacement.root);
  assertFrozen([...replacement.nodes, next, after, after.values], true);
  assert.equal(before.revision, 0);
  assert.equal(before.values.value, graph);
  assert.equal(initial.tail.payload, "initial");
  assert.equal(store.set({ value: next }), 1);
});

for (const operation of ["createStore", "set"] as const) {
  test(`deep invalid data in ${operation} keeps descriptor order and transfers no ownership`, context => {
    const host = createScope({ name: `deep-rejection-${operation}` });
    context.after(() => host.control.close());
    const options = { name: "state", resources: host.resources, reportError: () => undefined };
    const previous = { label: "previous" };
    const store = createStore<{ value: unknown; sibling: unknown }>({ value: previous, sibling: null }, options);
    const before = store.read(["value", "sibling"]);
    const invalid = chain(10_000, "unowned");
    let reads = 0;
    Object.defineProperty(invalid.tail, "forbidden", { get() { reads += 1; return "not read"; } });
    // The deep branch precedes another rejection, so a breadth-first walk
    // would change which invalid path is reported.
    const value = { first: invalid.root, later: new Date(0) };
    const sibling = { remains: "mutable" };
    const input = { value, sibling };
    assert.throws(() => {
      if (operation === "createStore") {createStore(input, options);}
      else {store.set(input);}
    }, error => {
      assert.ok(error instanceof Error && "code" in error);
      assert.equal(error.code, "observation.values.not-plain");
      assert.match(error.message, /^value\.first\.next\./u);
      assert.match(error.message, /\.forbidden is not plain data$/u);
      return true;
    });
    assert.equal(reads, 0);
    assertFrozen([...invalid.nodes, value, sibling, input], false);
    invalid.tail.payload = "still mutable";
    assert.equal(invalid.tail.payload, "still mutable");
    const after = store.read(["value", "sibling"]);
    assert.equal(after.revision, 0);
    assert.equal(after.values.value, previous);
    assert.equal(after.values.sibling, null);
    assert.equal(before.values.value, previous);
  });
}
