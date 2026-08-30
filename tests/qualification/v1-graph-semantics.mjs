import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const compareAscii = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const compareTuple = (left, right) => {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = compareAscii(left[index], right[index]);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
};
const clone = value => structuredClone(value);

const CASE_AUTHORITY = [
  "all-selected-modules-are-roots",
  "branching-transitive-multi-root",
  "cycle-is-composition-failure-not-activation",
  "invalid-reference-suppresses-only-dependent-reachability",
  "parallel-slots-preserve-references-and-deduplicate-adjacency",
  "provider-as-root-does-not-reach-consumer",
  "selected-unreachable-has-no-hidden-root",
  "unselected-declaration-and-binding-are-graph-inert",
];

function exactUniqueStrings(values, label) {
  assert.ok(Array.isArray(values), `${label} must be an array`);
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
  assert.ok(values.every(value => typeof value === "string"), `${label} must contain strings`);
}

function deriveCycles(nodes, adjacency) {
  const forward = new Map(nodes.map(node => [node, new Set()]));
  const reverse = new Map(nodes.map(node => [node, new Set()]));
  for (const [from, to] of adjacency) {
    forward.get(from).add(to);
    reverse.get(to).add(from);
  }

  const visited = new Set();
  const finished = [];
  for (const root of [...nodes].sort(compareAscii)) {
    if (visited.has(root)) continue;
    visited.add(root);
    const stack = [{ node: root, index: 0, neighbors: [...forward.get(root)].sort(compareAscii) }];
    while (stack.length > 0) {
      const frame = stack.at(-1);
      if (frame.index < frame.neighbors.length) {
        const neighbor = frame.neighbors[frame.index];
        frame.index += 1;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push({
            node: neighbor,
            index: 0,
            neighbors: [...forward.get(neighbor)].sort(compareAscii),
          });
        }
      } else {
        finished.push(frame.node);
        stack.pop();
      }
    }
  }

  const assigned = new Set();
  const cycles = [];
  for (const root of finished.toReversed()) {
    if (assigned.has(root)) continue;
    const component = [];
    const pending = [root];
    assigned.add(root);
    while (pending.length > 0) {
      const node = pending.pop();
      component.push(node);
      for (const neighbor of [...reverse.get(node)].sort(compareAscii).toReversed()) {
        if (!assigned.has(neighbor)) {
          assigned.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    component.sort(compareAscii);
    if (component.length > 1 || adjacency.some(([from, to]) => (
      from === component[0] && to === component[0]
    ))) cycles.push(component);
  }
  return cycles.sort(compareTuple);
}

function dependencyOrder(nodes, adjacency) {
  const indegree = new Map(nodes.map(node => [node, 0]));
  const dependents = new Map(nodes.map(node => [node, new Set()]));
  for (const [provider, consumer] of adjacency) {
    if (!dependents.get(provider).has(consumer)) {
      dependents.get(provider).add(consumer);
      indegree.set(consumer, indegree.get(consumer) + 1);
    }
  }
  const ready = nodes.filter(node => indegree.get(node) === 0).sort(compareAscii);
  const order = [];
  while (ready.length > 0) {
    const provider = ready.shift();
    order.push(provider);
    for (const consumer of [...dependents.get(provider)].sort(compareAscii)) {
      indegree.set(consumer, indegree.get(consumer) - 1);
      if (indegree.get(consumer) === 0) {
        ready.push(consumer);
        ready.sort(compareAscii);
      }
    }
  }
  return order.length === nodes.length ? order : null;
}

function deriveCase(vector) {
  const declarations = vector.declarations.map(([moduleId, implementationId]) => ({
    moduleId,
    implementationId,
  }));
  exactUniqueStrings(declarations.map(value => value.moduleId), `${vector.name} module IDs`);
  exactUniqueStrings(declarations.map(value => value.implementationId),
    `${vector.name} implementation IDs`);
  exactUniqueStrings(vector.selected, `${vector.name} selections`);
  exactUniqueStrings(vector.roots, `${vector.name} roots`);

  const declarationByImplementation = new Map(
    declarations.map(declaration => [declaration.implementationId, declaration]),
  );
  const selected = [...vector.selected].sort(compareAscii);
  const selectedSet = new Set(selected);
  for (const implementationId of selected) {
    assert.ok(declarationByImplementation.has(implementationId),
      `${vector.name} selects an unknown implementation`);
  }
  const selectedByModule = new Map(selected.map(implementationId => {
    const declaration = declarationByImplementation.get(implementationId);
    return [declaration.moduleId, implementationId];
  }));

  const selectedBindings = vector.bindings.filter(([consumer]) => selectedSet.has(consumer));
  const Einput = selectedBindings.reduce((total, binding) => total + binding[2].length, 0);
  const invalidConsumers = new Set();
  const diagnostics = [];
  const Evalid = [];
  for (const [consumer, slot, providers] of selectedBindings) {
    const unknownProviders = providers.filter(provider => !declarationByImplementation.has(provider));
    const unselectedProviders = providers.filter(provider => (
      declarationByImplementation.has(provider) && !selectedSet.has(provider)
    ));
    if (unknownProviders.length > 0 || unselectedProviders.length > 0) {
      invalidConsumers.add(consumer);
      for (const provider of unknownProviders) {
        diagnostics.push({
          code: "binding.unknown-provider",
          phase: "binding",
          path: [],
          coordinate: {
            implementationId: consumer,
            slotId: slot,
            providerImplementationId: provider,
          },
          details: { reason: "unknown" },
        });
      }
      continue;
    }
    for (const provider of providers) Evalid.push([consumer, slot, provider]);
  }
  Evalid.sort(compareTuple);

  const Eadj = [...new Map(Evalid.map(([consumer, , provider]) => [
    `${provider}\u0000${consumer}`,
    [provider, consumer],
  ])).values()].sort(compareTuple);
  const providersByConsumer = new Map(selected.map(implementationId => [implementationId, []]));
  for (const [consumer, , provider] of Evalid) providersByConsumer.get(consumer).push(provider);

  const rootImplementations = vector.roots.map(moduleId => selectedByModule.get(moduleId));
  assert.ok(rootImplementations.every(Boolean), `${vector.name} has an unresolved root`);
  const reached = new Set(rootImplementations);
  const pending = [...rootImplementations];
  let incompleteReachedFrontier = false;
  while (pending.length > 0) {
    const consumer = pending.pop();
    if (invalidConsumers.has(consumer)) incompleteReachedFrontier = true;
    for (const provider of providersByConsumer.get(consumer)) {
      if (!reached.has(provider)) {
        reached.add(provider);
        pending.push(provider);
      }
    }
  }

  const unreachable = selected.filter(implementationId => !reached.has(implementationId));
  const unreachableSuppressed = incompleteReachedFrontier ? unreachable : [];
  if (!incompleteReachedFrontier) {
    for (const implementationId of unreachable) {
      diagnostics.push({
        code: "profile.unreachable-selection",
        phase: "graph",
        path: [],
        coordinate: {
          moduleId: declarationByImplementation.get(implementationId).moduleId,
          implementationId,
        },
        details: { reason: "unreachable" },
      });
    }
  }
  diagnostics.sort((left, right) => (
    compareAscii(left.phase, right.phase) || compareAscii(left.code, right.code)
      || compareAscii(JSON.stringify(left.coordinate), JSON.stringify(right.coordinate))
  ));

  const cycles = deriveCycles(selected, Eadj);
  if (cycles.length > 0) {
    for (const component of cycles) {
      diagnostics.push({
        code: "graph.cycle",
        phase: "graph",
        path: [],
        coordinate: {},
        details: { component },
      });
    }
  }

  return {
    resourceDeclarations: declarations.length,
    selected,
    Einput,
    Evalid,
    Eadj,
    rootClosure: [...reached].sort(compareAscii),
    unreachableSuppressed,
    dependencyOrder: invalidConsumers.size > 0 ? null : dependencyOrder(selected, Eadj),
    cycles,
    diagnostics,
  };
}

function permuteCase(vector) {
  const reversed = clone(vector);
  reversed.declarations.reverse();
  reversed.selected.reverse();
  reversed.roots.reverse();
  reversed.bindings.reverse();
  for (const binding of reversed.bindings) binding[2].reverse();
  return reversed;
}

function validateGraphSemantics(graph) {
  assert.equal(graph?.kind, "get-modular.bounded-graph-semantics");
  assert.equal(graph.oracleVersion, 1);
  assert.deepEqual(graph.directions, {
    rootClosure: "consumer-to-provider",
    adjacency: "provider-to-consumer",
    dependencyOrder: "provider-before-consumer",
  });
  assert.deepEqual(graph.edgePopulations, {
    Einput: "provider entries on selected-consumer bindings before validation",
    Evalid: "provider entries on bindings that pass selected-reference validation",
    Eadj: "distinct valid provider-to-consumer endpoint pairs",
  });
  assert.deepEqual(graph.permutationAxes, ["declarations", "bindings", "roots", "nodes", "edges"]);
  assert.deepEqual(graph.semanticBoundary, {
    meaning: "composition-graph-only",
    activationOrder: null,
    lifecycleEvents: [],
  });
  assert.deepEqual(graph.cases.map(vector => vector.name).sort(compareAscii), CASE_AUTHORITY);

  for (const vector of graph.cases) {
    assert.deepEqual(deriveCase(vector), vector.expected, vector.name);
    assert.deepEqual(deriveCase(permuteCase(vector)), vector.expected,
      `${vector.name} input permutation`);
  }
}

const vectors = JSON.parse(await readFile(
  new URL("../../architecture/qualification/v1/normalization-vectors.json", import.meta.url),
  "utf8",
));

test("bounded graph evidence fixes reachability, execution, and failure directions", () => {
  assert.doesNotThrow(() => validateGraphSemantics(vectors.graphSemantics));
});

test("bounded graph evidence rejects semantic and oracle mutations", () => {
  const mutations = [
    value => { value.directions.rootClosure = "provider-to-consumer"; },
    value => { value.semanticBoundary.activationOrder = "start-order"; },
    value => { value.cases.pop(); },
    value => { value.cases[0].expected.Einput += 1; },
    value => { value.cases.find(item => item.name === "provider-as-root-does-not-reach-consumer")
      .expected.diagnostics[0].phase = "profile"; },
    value => { value.cases.find(item => item.name
      === "invalid-reference-suppresses-only-dependent-reachability")
      .expected.unreachableSuppressed.pop(); },
    value => { value.cases.find(item => item.name
      === "parallel-slots-preserve-references-and-deduplicate-adjacency")
      .expected.Eadj.push(["x/db-i", "x/app-i"]); },
    value => { value.cases.find(item => item.name
      === "cycle-is-composition-failure-not-activation").expected.cycles = []; },
  ];
  for (const mutate of mutations) {
    const candidate = clone(vectors.graphSemantics);
    mutate(candidate);
    assert.throws(() => validateGraphSemantics(candidate));
  }
});
