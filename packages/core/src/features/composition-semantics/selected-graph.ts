import { graphComponents } from "./graph-components.js";
import { ReadyQueue } from "./ready-queue.js";

export const selectedGraphDepthLimit = 2048;
export type ProviderEdge = readonly [providerImplementationId: string, consumerImplementationId: string];
export type SelectedGraphAnalysis = {
  readonly cycles: readonly (readonly string[])[];
  readonly dependencyOrder: readonly string[] | null;
  // Depth of the induced residual DAG, never a depth of a cyclic graph.
  // Zero denotes an empty residual graph; overflow saturates at 2049.
  readonly residualDepth: number;
  readonly rootClosure: readonly string[];
  readonly statistics: {
    readonly selectedNodes: number;
    readonly validEdgeOccurrences: number;
    readonly adjacencyEdges: number;
    readonly sccEdgeVisits: number;
    readonly depthEdgeVisits: number;
    readonly closureEdgeVisits: number;
    readonly peakTraversalFrames: number;
    readonly peakReady: number;
    readonly readyComparisons: number;
  };
};

type Vertex = (id: string) => number;

function defined<T>(value: T | undefined): T {
  if (value === undefined) {throw new Error("Missing internal selected-graph value");}
  return value;
}

function ordered(values: readonly string[]): string[] {
  const result = [...values];
  result.sort();
  return result;
}

function buildAdjacency(nodes: readonly string[], edges: readonly ProviderEdge[], vertex: Vertex) {
  const outgoing: number[][] = nodes.map(() => []);
  const incoming: number[][] = nodes.map(() => []);
  const unique: Set<number>[] = nodes.map(() => new Set<number>());
  let adjacencyEdges = 0;
  for (const [providerId, consumerId] of edges) {
    const provider = vertex(providerId);
    const consumer = vertex(consumerId);
    if (defined(unique[provider]).has(consumer)) {continue;}
    defined(unique[provider]).add(consumer);
    defined(outgoing[provider]).push(consumer);
    defined(incoming[consumer]).push(provider);
    adjacencyEdges += 1;
  }
  return { outgoing, incoming, unique, adjacencyEdges };
}

function findCycles(nodes: readonly string[], unique: readonly Set<number>[],
  outgoing: readonly number[][], incoming: readonly number[][]) {
  const decomposition = graphComponents(outgoing, incoming);
  const cyclic = new Uint8Array(nodes.length);
  const cycles: (readonly string[])[] = [];
  for (const component of decomposition.members) {
    if (component.length === 1 && !defined(unique[defined(component[0])]).has(defined(component[0]))) {continue;}
    for (const member of component) {cyclic[member] = 1;}
    cycles.push(Object.freeze(component.map(member => defined(nodes[member]))));
  }
  return { decomposition, cyclic, cycles };
}

function analyzeResidual(nodes: readonly string[], cyclic: Uint8Array,
  outgoing: readonly number[][], incoming: readonly number[][]) {
  const indegree = new Uint32Array(nodes.length);
  const depth = new Uint16Array(nodes.length);
  const ready = new ReadyQueue();
  let depthEdgeVisits = 0;
  let residualSize = 0;
  for (let node = 0; node < nodes.length; node += 1) {
    if (cyclic[node]) {continue;}
    residualSize += 1;
    depth[node] = 1;
    for (const provider of defined(incoming[node])) {
      depthEdgeVisits += 1;
      if (!cyclic[provider]) {indegree[node] = defined(indegree[node]) + 1;}
    }
    if (indegree[node] === 0) {ready.push(node);}
  }
  const order: string[] = [];
  let residualDepth = 0;
  while (ready.size > 0) {
    const node = ready.take();
    order.push(defined(nodes[node]));
    residualDepth = Math.max(residualDepth, defined(depth[node]));
    for (const consumer of defined(outgoing[node])) {
      depthEdgeVisits += 1;
      if (cyclic[consumer]) {continue;}
      depth[consumer] = Math.min(selectedGraphDepthLimit + 1, Math.max(defined(depth[consumer]), defined(depth[node]) + 1));
      indegree[consumer] = defined(indegree[consumer]) - 1;
      if (indegree[consumer] === 0) {ready.push(consumer);}
    }
  }
  if (order.length !== residualSize) {throw new Error("Cyclic internal residual graph");}
  return { order, residualDepth, depthEdgeVisits, peakReady: ready.peakSize, readyComparisons: ready.comparisons };
}

function findRootClosure(nodes: readonly string[], roots: readonly string[], vertex: Vertex,
  incoming: readonly number[][], initialPeak: number) {
  const reached = new Uint8Array(nodes.length);
  const pending: number[] = [];
  let peakTraversalFrames = initialPeak;
  let closureEdgeVisits = 0;
  for (const id of roots) {
    const node = vertex(id);
    if (!reached[node]) { reached[node] = 1; pending.push(node); }
  }
  peakTraversalFrames = Math.max(peakTraversalFrames, pending.length);
  while (pending.length > 0) {
    const node = pending.pop()!;
    for (const provider of defined(incoming[node])) {
      closureEdgeVisits += 1;
      if (!reached[provider]) {
        reached[provider] = 1;
        pending.push(provider);
        peakTraversalFrames = Math.max(peakTraversalFrames, pending.length);
      }
    }
  }
  return { rootClosure: nodes.filter((_node, index) => reached[index]), closureEdgeVisits, peakTraversalFrames };
}

/**
 * Owner-private graph kernel, after bounded selected-node census and complete
 * binding validation. IDs are unique, admitted ASCII strings; all endpoints
 * and roots belong to this selected graph. Edges are Evalid occurrences from
 * wholly valid bindings, not surviving individual providers of a failed row.
 * Callers still own diagnostic prerequisites, reachability-frontier validity,
 * Einput limits, normalization of plan bindings and successful-plan eligibility.
 */
export function analyzeSelectedGraph(implementationIds: readonly string[], edges: readonly ProviderEdge[], roots: readonly string[]): SelectedGraphAnalysis {
  const nodes = ordered(implementationIds);
  const rank = new Map(nodes.map((id, index) => [id, index] as const));
  if (rank.size !== nodes.length) {throw new Error("Duplicate internal selected-graph node");}
  const vertex = (id: string): number => {
    const result = rank.get(id);
    if (result === undefined) {throw new Error("Unresolved internal selected-graph identity");}
    return result;
  };
  const { outgoing, incoming, unique, adjacencyEdges } = buildAdjacency(nodes, edges, vertex);
  const { decomposition, cyclic, cycles } = findCycles(nodes, unique, outgoing, incoming);
  const residual = analyzeResidual(nodes, cyclic, outgoing, incoming);

  // Closure keeps the original graph, including cycles, and follows the
  // opposite direction: consumers depend on their providers. This observation
  // alone does not authorize an unreachable diagnostic on an invalid frontier.
  const closure = findRootClosure(nodes, roots, vertex, incoming, decomposition.peakFrames);
  return Object.freeze({ cycles: Object.freeze(cycles), dependencyOrder: cycles.length ? null : Object.freeze(residual.order),
    residualDepth: residual.residualDepth, rootClosure: Object.freeze(closure.rootClosure),
    statistics: Object.freeze({ selectedNodes: nodes.length, validEdgeOccurrences: edges.length, adjacencyEdges,
      sccEdgeVisits: decomposition.edgeVisits, depthEdgeVisits: residual.depthEdgeVisits,
      closureEdgeVisits: closure.closureEdgeVisits, peakTraversalFrames: closure.peakTraversalFrames,
      peakReady: residual.peakReady, readyComparisons: residual.readyComparisons }),
  });
}
