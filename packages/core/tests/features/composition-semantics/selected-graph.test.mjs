import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeSelectedGraph, selectedGraphDepthLimit } from "../../../dist/features/composition-semantics/selected-graph.js";
import { collectGraphFailures } from "../../../dist/features/composition-semantics/graph-diagnostics.js";
import { createDiagnosticCollector } from "../../../dist/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist/features/canonicalization/owned-jcs/factory.js";

const root = new URL("../../../../../", import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const normalization = await json("architecture/qualification/v1/normalization-vectors.json");
const sccCases = (await json("architecture/qualification/v1/diagnostic-snapshots.json")).sccGraphCases;
const clarification = await json("architecture/qualification/implementation-clarifications/cases.json");
const resource = (await json("architecture/qualification/v1/resource-profile-v2.json")).limits;
const withoutStatistics = ({ statistics: _statistics, ...result }) => result;
const rotate = values => values.length ? [...values.slice(1), values[0]] : [];
function permutations(values) {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_item, position) => position !== index)).map(tail => [value, ...tail]));
}

// Independent, deliberately tiny oracle: transitive-closure matrix, mutual
// reachability classes, exhaustive topological permutations and all residual
// paths. No SCC decomposition, heap or Kahn algorithm shared with production.
function tinyOracle(nodes, edges, roots) {
  const ids = [...nodes].sort();
  const at = id => ids.indexOf(id);
  const adjacency = ids.map(() => ids.map(() => false));
  for (const [from, to] of edges) adjacency[at(from)][at(to)] = true;
  const reach = adjacency.map(row => [...row]);
  for (let k = 0; k < ids.length; k += 1) for (let i = 0; i < ids.length; i += 1) for (let j = 0; j < ids.length; j += 1) {
    reach[i][j] ||= reach[i][k] && reach[k][j];
  }
  const grouped = new Set();
  const cyclic = new Set();
  const cycles = [];
  for (let i = 0; i < ids.length; i += 1) {
    if (grouped.has(i)) continue;
    const component = ids.map((_id, index) => index).filter(j => j === i || reach[i][j] && reach[j][i]);
    component.forEach(j => grouped.add(j));
    if (component.length > 1 || adjacency[i][i]) { component.forEach(j => cyclic.add(j)); cycles.push(component.map(j => ids[j])); }
  }
  let residualDepth = 0;
  function pathLength(node, length) {
    residualDepth = Math.max(residualDepth, length);
    for (let next = 0; next < ids.length; next += 1) if (!cyclic.has(next) && adjacency[node][next]) pathLength(next, length + 1);
  }
  for (let i = 0; i < ids.length; i += 1) if (!cyclic.has(i)) pathLength(i, 1);
  const dependencyOrder = cycles.length ? null : permutations(ids).find(order => edges.every(([from, to]) => order.indexOf(from) < order.indexOf(to)));
  const rootClosure = ids.filter((id, i) => roots.some(rootId => id === rootId || reach[i][at(rootId)]));
  return { cycles, dependencyOrder, residualDepth, rootClosure };
}
function checkCounters(analysis) {
  const s = analysis.statistics;
  assert.equal(s.sccEdgeVisits, s.adjacencyEdges * 2);
  assert.ok(s.depthEdgeVisits <= s.adjacencyEdges * 2);
  assert.ok(s.closureEdgeVisits <= s.adjacencyEdges);
  assert.ok(s.peakTraversalFrames <= s.selectedNodes);
  assert.ok(s.peakReady <= s.selectedNodes);
  assert.ok(s.readyComparisons <= 4 * s.selectedNodes * Math.ceil(Math.log2(s.selectedNodes + 1)));
}

test("all 65,536 directed four-node graphs agree with an independent exhaustive oracle", () => {
  const nodes = ["x/a", "x/aa", "x/b", "x/z"];
  const possible = nodes.flatMap(from => nodes.map(to => [from, to]));
  for (let mask = 0; mask < 65_536; mask += 1) {
    const edges = possible.filter((_edge, position) => mask & 2 ** position);
    const roots = nodes.filter((_node, position) => mask & 2 ** position);
    const analysis = analyzeSelectedGraph(rotate(nodes), [...edges].reverse(), roots);
    assert.deepEqual(withoutStatistics(analysis), tinyOracle(nodes, edges, roots), `graph ${mask}`);
    checkCounters(analysis);
  }
});

test("every two-node graph, root subset, node permutation and edge permutation has the same result", () => {
  const nodes = ["x/a", "x/b"];
  const possible = nodes.flatMap(from => nodes.map(to => [from, to]));
  for (let mask = 0; mask < 16; mask += 1) {
    const edges = possible.filter((_edge, position) => mask & 2 ** position);
    for (let rootsMask = 0; rootsMask < 4; rootsMask += 1) {
      const roots = nodes.filter((_node, position) => rootsMask & 2 ** position);
      const expected = tinyOracle(nodes, edges, roots);
      for (const nodeOrder of permutations(nodes)) for (const edgeOrder of permutations(edges)) {
        assert.deepEqual(withoutStatistics(analyzeSelectedGraph(nodeOrder, edgeOrder, [...roots].reverse())), expected);
      }
    }
  }
});

test("kernel projections match the accepted positive-edge graphs without claiming declaration/binding validation", () => {
  for (const fixture of normalization.graphSemantics.cases) {
    // This fixture explicitly supplies its independently established Evalid
    // graph. Selection and whole-binding validation remain separate gates.
    const edges = fixture.expected.Evalid.map(([consumer, _slot, provider]) => [provider, consumer]);
    const roots = fixture.roots.map(moduleId => fixture.declarations.find(([module, implementation]) => module === moduleId && fixture.selected.includes(implementation))[1]);
    for (const order of [values => [...values], values => [...values].reverse(), rotate]) {
      const actual = analyzeSelectedGraph(order(fixture.selected), order(edges), order(roots));
      assert.deepEqual(actual.cycles, fixture.expected.cycles, fixture.name);
      assert.deepEqual(actual.rootClosure, fixture.expected.rootClosure, fixture.name);
      assert.equal(actual.statistics.validEdgeOccurrences, fixture.expected.Evalid.length);
      assert.equal(actual.statistics.adjacencyEdges, fixture.expected.Eadj.length);
      if (fixture.expected.dependencyOrder !== null) assert.deepEqual(actual.dependencyOrder, fixture.expected.dependencyOrder, fixture.name);
      // A null semantic order may reflect a binding failure, not a graph cycle.
      // The kernel's order observation never authorizes a successful plan.
      checkCounters(actual);
    }
  }
});

test("all accepted SCC permutations preserve self, reciprocal, disjoint and parallel-edge components", () => {
  for (const fixture of sccCases) for (const permutation of fixture.permutations) {
    const edges = permutation.edgeOrder.map(id => fixture.edges.find(edge => edge.id === id)).map(edge => [edge.from, edge.to]);
    assert.deepEqual(analyzeSelectedGraph(permutation.nodeOrder, edges, []).cycles, fixture.expected, fixture.name);
  }
});

function recipeGraph(recipe) {
  const id = name => `example/${name}/default`;
  const chain = Array.from({ length: recipe.chainLength }, (_value, index) => id(`n${String(index + 1).padStart(4, "0")}`));
  const nodes = [...chain];
  const roots = chain.length ? [chain.at(-1)] : [];
  const edges = chain.slice(1).map((consumer, index) => [chain[index], consumer]);
  if (recipe.cycle !== "none") { nodes.push(id("a")); roots.push(id("a")); }
  if (recipe.cycle === "pair") { nodes.push(id("b")); edges.push([id("a"), id("b")], [id("b"), id("a")]); }
  if (recipe.cycle === "self") edges.push([id("a"), id("a")]);
  if (recipe.attachment === "cycle-consumes-chain") edges.push([chain.at(-1), id("a")]);
  if (recipe.attachment === "chain-consumes-cycle") edges.push([id("a"), chain[0]]);
  return { nodes, edges, roots };
}

test("accepted ADR0018 mixed cycle/depth recipes execute on the actual graph and diagnostic functions", () => {
  for (const fixture of clarification.graphCases) {
    const input = recipeGraph(fixture.recipe);
    for (const order of [values => [...values], values => [...values].reverse(), rotate]) {
      const analysis = analyzeSelectedGraph(order(input.nodes), order(input.edges), order(input.roots));
      const collector = createDiagnosticCollector(createOwnedJcs().canonicalize);
      collectGraphFailures(analysis, collector);
      assert.deepEqual(collector.finish(), fixture.expected.diagnostics, fixture.id);
      assert.equal(analysis.residualDepth, fixture.recipe.chainLength);
      checkCounters(analysis);
    }
  }
  // Graph/diagnostic projection only: no invocation admission, public compiler,
  // plan/digest or runtime-conformance claim is made by this fixture execution.
  assert.equal(selectedGraphDepthLimit, resource.graphDepth);
});

test("residual depth excludes cycle nodes without splicing across them or changing original closure", () => {
  const nodes = ["x/a", "x/b", "x/cycle", "x/d", "x/e", "x/orphan"];
  const edges = [["x/a", "x/b"], ["x/b", "x/cycle"], ["x/cycle", "x/cycle"], ["x/cycle", "x/d"], ["x/d", "x/e"]];
  const result = analyzeSelectedGraph(nodes, edges, ["x/e"]);
  assert.equal(result.residualDepth, 2);
  assert.deepEqual(result.cycles, [["x/cycle"]]);
  assert.equal(result.dependencyOrder, null);
  assert.deepEqual(result.rootClosure, ["x/a", "x/b", "x/cycle", "x/d", "x/e"]);
  assert.deepEqual(analyzeSelectedGraph(["x/alone"], [], []).rootClosure, []);
  assert.equal(analyzeSelectedGraph(["x/alone"], [], []).residualDepth, 1);
});

test("ASCII-minimal ready choice applies after every release and keeps providers before consumers", () => {
  const result = analyzeSelectedGraph(["x/z", "x/b", "x/aa"], [["x/b", "x/aa"]], ["x/aa"]);
  assert.deepEqual(result.dependencyOrder, ["x/b", "x/aa", "x/z"]);
  assert.deepEqual(result.rootClosure, ["x/aa", "x/b"]);
  assert.deepEqual(analyzeSelectedGraph(["x/a", "x/b"], [["x/a", "x/b"]], ["x/a"]).rootClosure, ["x/a"]);
});

test("parallel valid slot edges retain occurrence accounting but traverse distinct adjacency only", () => {
  const input = new Array(128).fill(["x/provider", "x/consumer"]);
  const result = analyzeSelectedGraph(["x/consumer", "x/provider"], input, ["x/consumer"]);
  assert.equal(result.statistics.validEdgeOccurrences, 128);
  assert.equal(result.statistics.adjacencyEdges, 1);
  assert.equal(result.statistics.sccEdgeVisits, 2);
  assert.equal(result.residualDepth, 2);
  assert.deepEqual(result.dependencyOrder, ["x/provider", "x/consumer"]);
});

test("a graph at the full 262144-edge boundary has bounded traversal and ready-set work", () => {
  const providers = Array.from({ length: 512 }, (_value, i) => `x/p${String(i).padStart(4, "0")}`);
  const consumers = Array.from({ length: 512 }, (_value, i) => `x/c${String(i).padStart(4, "0")}`);
  const edges = providers.flatMap(provider => consumers.map(consumer => [provider, consumer]));
  assert.equal(edges.length, resource.graphEdges);
  const result = analyzeSelectedGraph([...consumers, ...providers], edges, consumers);
  assert.deepEqual(result.cycles, []);
  assert.equal(result.residualDepth, 2);
  assert.deepEqual(result.dependencyOrder, [...providers, ...consumers]);
  assert.deepEqual(result.rootClosure, [...consumers, ...providers]);
  assert.equal(result.statistics.adjacencyEdges, resource.graphEdges);
  checkCounters(result);
});

test("full-size chains and giant cycles are stack-safe even with a deliberately small VM stack", () => {
  const moduleUrl = new URL("../../../dist/features/composition-semantics/selected-graph.js", import.meta.url).href;
  const code = `
    import assert from 'node:assert/strict';
    import { analyzeSelectedGraph } from ${JSON.stringify(moduleUrl)};
    const nodes = Array.from({ length: 4096 }, (_, i) => 'x/n' + String(i).padStart(4, '0'));
    const edges = nodes.slice(1).map((consumer, i) => [nodes[i], consumer]);
    const chain = analyzeSelectedGraph(nodes, edges, [nodes.at(-1)]);
    assert.equal(chain.residualDepth, 2049);
    assert.equal(chain.dependencyOrder.length, 4096);
    assert.equal(chain.rootClosure.length, 4096);
    const cycle = analyzeSelectedGraph(nodes, [...edges, [nodes.at(-1), nodes[0]]], [nodes[0]]);
    assert.deepEqual(cycle.cycles, [nodes]);
    assert.equal(cycle.residualDepth, 0);
    assert.equal(cycle.rootClosure.length, 4096);
    assert.equal(cycle.dependencyOrder, null);
  `;
  execFileSync(process.execPath, ["--stack_size=128", "--input-type=module", "-e", code], { timeout: 20_000, stdio: "pipe" });
});

test("cycle diagnostics keep streaming past the cap without canonicalizer or collector finalization shortcuts", () => {
  const nodes = Array.from({ length: 300 }, (_value, i) => `x/n${String(i).padStart(4, "0")}`);
  const graph = analyzeSelectedGraph([...nodes].reverse(), nodes.map(id => [id, id]), []);
  const collector = createDiagnosticCollector(() => { throw Error("SCC comparison must not use canonical bytes"); });
  collectGraphFailures(graph, collector);
  assert.equal(collector.statistics().saturatedFailureCount, 300);
  const diagnostics = collector.finish();
  assert.equal(diagnostics.length, 256);
  assert.deepEqual(diagnostics[254].details, { component: [nodes[254]] });
  assert.deepEqual(diagnostics[255], { code: "diagnostics.truncated", phase: "output", path: [], coordinate: {}, details: { omitted: 45 } });
  const later = createDiagnosticCollector(createOwnedJcs().canonicalize);
  collectGraphFailures(analyzeSelectedGraph([], [], []), later);
  later.addUnique({ code: "profile.duplicate-root", phase: "profile", path: [], coordinate: { moduleId: "x/a" }, details: { reason: "duplicate" } });
  assert.equal(later.finish().length, 1);
});

test("analysis owns frozen result containers, leaves inputs unchanged and isolates every call", () => {
  const nodes = ["x/constructor", "x/prototype"];
  const edges = [[nodes[0], nodes[0]], [nodes[0], nodes[1]]];
  const roots = [nodes[1]];
  const before = structuredClone({ nodes, edges, roots });
  const result = analyzeSelectedGraph(nodes, edges, roots);
  assert.deepEqual({ nodes, edges, roots }, before);
  for (const container of [result, result.cycles, ...result.cycles, result.rootClosure, result.statistics]) assert.equal(Object.isFrozen(container), true);
  assert.equal(Object.isFrozen(nodes), false);
  nodes.reverse(); edges.length = 0; roots.length = 0;
  assert.deepEqual(result.rootClosure, [...before.nodes].sort());
  assert.deepEqual(result.cycles, [["x/constructor"]]);
  assert.deepEqual(withoutStatistics(analyzeSelectedGraph([], [], [])), { cycles: [], dependencyOrder: [], residualDepth: 0, rootClosure: [] });
});

test("violated internal census preconditions reject without echoing caller identities", () => {
  assert.throws(() => analyzeSelectedGraph(["x/a", "x/a"], [], []), /^Error: Duplicate internal selected-graph node$/);
  assert.throws(() => analyzeSelectedGraph(["x/a"], [["SECRET", "x/a"]], []), /^Error: Unresolved internal selected-graph identity$/);
  assert.throws(() => analyzeSelectedGraph(["x/a"], [], ["SECRET"]), /^Error: Unresolved internal selected-graph identity$/);
  const graph = analyzeSelectedGraph(["x/a"], [["x/a", "x/a"]], []);
  assert.throws(() => collectGraphFailures(graph, { addUnique() { throw Error("internal collector failure"); } }), /internal collector failure/);
});
