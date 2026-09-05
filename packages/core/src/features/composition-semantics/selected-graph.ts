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

/**
 * Owner-private graph kernel, after bounded selected-node census and complete
 * binding validation. IDs are unique, admitted ASCII strings; all endpoints
 * and roots belong to this selected graph. Edges are Evalid occurrences from
 * wholly valid bindings, not surviving individual providers of a failed row.
 * Callers still own diagnostic prerequisites, reachability-frontier validity,
 * Einput limits, normalization of plan bindings and successful-plan eligibility.
 */
export function analyzeSelectedGraph(implementationIds: readonly string[], edges: readonly ProviderEdge[], roots: readonly string[]): SelectedGraphAnalysis {
  const nodes = [...implementationIds].sort();
  const rank = new Map(nodes.map((id, index) => [id, index]));
  if (rank.size !== nodes.length) throw new Error("Duplicate internal selected-graph node");
  const vertex = (id: string): number => {
    const result = rank.get(id);
    if (result === undefined) throw new Error("Unresolved internal selected-graph identity");
    return result;
  };
  const outgoing: number[][] = nodes.map(() => []);
  const incoming: number[][] = nodes.map(() => []);
  const unique: Set<number>[] = nodes.map(() => new Set<number>());
  let adjacencyEdges = 0;
  for (const [providerId, consumerId] of edges) {
    const provider = vertex(providerId);
    const consumer = vertex(consumerId);
    if (unique[provider]!.has(consumer)) continue;
    unique[provider]!.add(consumer);
    outgoing[provider]!.push(consumer);
    incoming[consumer]!.push(provider);
    adjacencyEdges += 1;
  }
  const decomposition = graphComponents(outgoing, incoming);
  const cyclic = new Uint8Array(nodes.length);
  const cycles: (readonly string[])[] = [];
  for (const component of decomposition.members) {
    if (component.length === 1 && !unique[component[0]!]!.has(component[0]!)) continue;
    for (const member of component) cyclic[member] = 1;
    cycles.push(Object.freeze(component.map(member => nodes[member]!)));
  }

  const indegree = new Uint32Array(nodes.length);
  const depth = new Uint16Array(nodes.length);
  const ready = new ReadyQueue();
  let depthEdgeVisits = 0;
  let residualSize = 0;
  for (let node = 0; node < nodes.length; node += 1) {
    if (cyclic[node]) continue;
    residualSize += 1;
    depth[node] = 1;
    for (const provider of incoming[node]!) {
      depthEdgeVisits += 1;
      if (!cyclic[provider]) indegree[node] = indegree[node]! + 1;
    }
    if (indegree[node] === 0) ready.push(node);
  }
  const order: string[] = [];
  let residualDepth = 0;
  while (ready.size > 0) {
    const node = ready.take();
    order.push(nodes[node]!);
    residualDepth = Math.max(residualDepth, depth[node]!);
    for (const consumer of outgoing[node]!) {
      depthEdgeVisits += 1;
      if (cyclic[consumer]) continue;
      depth[consumer] = Math.min(selectedGraphDepthLimit + 1, Math.max(depth[consumer]!, depth[node]! + 1));
      indegree[consumer] = indegree[consumer]! - 1;
      if (indegree[consumer] === 0) ready.push(consumer);
    }
  }
  if (order.length !== residualSize) throw new Error("Cyclic internal residual graph");

  // Closure keeps the original graph, including cycles, and follows the
  // opposite direction: consumers depend on their providers. This observation
  // alone does not authorize an unreachable diagnostic on an invalid frontier.
  const reached = new Uint8Array(nodes.length);
  const pending: number[] = [];
  let peakTraversalFrames = decomposition.peakFrames;
  let closureEdgeVisits = 0;
  for (const id of roots) {
    const node = vertex(id);
    if (!reached[node]) { reached[node] = 1; pending.push(node); }
  }
  peakTraversalFrames = Math.max(peakTraversalFrames, pending.length);
  while (pending.length > 0) {
    const node = pending.pop()!;
    for (const provider of incoming[node]!) {
      closureEdgeVisits += 1;
      if (!reached[provider]) {
        reached[provider] = 1;
        pending.push(provider);
        peakTraversalFrames = Math.max(peakTraversalFrames, pending.length);
      }
    }
  }
  return Object.freeze({ cycles: Object.freeze(cycles), dependencyOrder: cycles.length ? null : Object.freeze(order), residualDepth,
    rootClosure: Object.freeze(nodes.filter((_node, index) => reached[index])),
    statistics: Object.freeze({ selectedNodes: nodes.length, validEdgeOccurrences: edges.length, adjacencyEdges,
      sccEdgeVisits: decomposition.edgeVisits, depthEdgeVisits, closureEdgeVisits, peakTraversalFrames,
      peakReady: ready.peakSize, readyComparisons: ready.comparisons }),
  });
}
