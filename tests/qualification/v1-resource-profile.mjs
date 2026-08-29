import { performance } from "node:perf_hooks";

export function chainGraph(nodeCount) {
  return Array.from({ length: nodeCount }, (_, index) => (
    index === 0 ? [] : [index - 1]
  ));
}

export function wideGraph(nodeCount) {
  return Array.from({ length: nodeCount }, (_, index) => (
    index === 0 ? [] : [0]
  ));
}

export function layeredGraph(layerCount, width) {
  const graph = Array.from({ length: layerCount * width }, () => []);
  for (let layer = 1; layer < layerCount; layer += 1) {
    const previousStart = (layer - 1) * width;
    const currentStart = layer * width;
    for (let offset = 0; offset < width; offset += 1) {
      graph[currentStart + offset] = Array.from(
        { length: width },
        (_, dependencyOffset) => previousStart + dependencyOffset,
      );
    }
  }
  return graph;
}

export function cycleGraph(nodeCount) {
  return Array.from({ length: nodeCount }, (_, index) => [
    (index + nodeCount - 1) % nodeCount,
  ]);
}

export function graphFacts(graph) {
  return {
    nodes: graph.length,
    edges: graph.reduce((total, dependencies) => total + dependencies.length, 0),
  };
}

export function dependencyOrder(graph) {
  const dependents = Array.from({ length: graph.length }, () => []);
  const indegree = graph.map(dependencies => dependencies.length);
  for (let consumer = 0; consumer < graph.length; consumer += 1) {
    for (const provider of graph[consumer]) dependents[provider].push(consumer);
  }

  const ready = [];
  for (let index = 0; index < indegree.length; index += 1) {
    if (indegree[index] === 0) ready.push(index);
  }
  ready.sort((left, right) => left - right);

  const order = [];
  for (let cursor = 0; cursor < ready.length; cursor += 1) {
    const provider = ready[cursor];
    order.push(provider);
    for (const consumer of dependents[provider]) {
      indegree[consumer] -= 1;
      if (indegree[consumer] === 0) ready.push(consumer);
    }
  }
  return { acyclic: order.length === graph.length, order };
}

export function boundedDiagnosticSummary(total, limit) {
  const retained = Array.from(
    { length: Math.min(total, limit - 1) },
    (_, index) => index,
  );
  return total > retained.length
    ? { retained, truncation: { omitted: total - retained.length } }
    : { retained, truncation: null };
}

export function measureResourceFixtures() {
  const fixtures = {
    chainAtDepthLimit: chainGraph(2048),
    wideAtDeclarationLimit: wideGraph(4096),
    layeredDense: layeredGraph(64, 64),
    giantCycle: cycleGraph(4096),
  };
  const measurements = {};
  for (const [name, graph] of Object.entries(fixtures)) {
    const started = performance.now();
    const result = dependencyOrder(graph);
    measurements[name] = {
      ...graphFacts(graph),
      acyclic: result.acyclic,
      elapsedMilliseconds: Number((performance.now() - started).toFixed(3)),
    };
  }
  measurements.diagnosticStorm = {
    candidates: 65536,
    retained: boundedDiagnosticSummary(65536, 256).retained.length,
    omitted: boundedDiagnosticSummary(65536, 256).truncation.omitted,
  };
  return measurements;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.stdout.write(`${JSON.stringify(measureResourceFixtures(), null, 2)}\n`);
}
