import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

function countedItems(count) {
  requireNonNegativeSafeInteger(count, "resource fixture count");
  return new Array(count);
}

function jsonDocument(byteCount) {
  if (byteCount < 2) throw new RangeError("a valid padded JSON document needs two bytes");
  return Buffer.from(`{}${" ".repeat(byteCount - 2)}`, "utf8");
}

function rawDocumentBatch(byteCount) {
  const maximum = 1048576;
  const count = Math.ceil(byteCount / maximum);
  if (count === 0) return [];
  const base = Math.floor(byteCount / count);
  const larger = byteCount % count;
  return Array.from({ length: count }, (_, index) => (
    jsonDocument(base + (index < larger ? 1 : 0))
  ));
}

const MAXIMUM_AGGREGATE_STRING_CHUNK_BYTES = 1048576;

function aggregateStringChunk(byteCount) {
  const key = "é";
  const keyBytes = Buffer.byteLength(key, "utf8");
  const valuePrefix = "€";
  const valuePrefixBytes = Buffer.byteLength(valuePrefix, "utf8");
  const remaining = byteCount - keyBytes - valuePrefixBytes;
  if (remaining < 0) {
    throw new TypeError("aggregate string chunk cannot contain its multibyte key and value");
  }
  const value = `${valuePrefix}${"😀".repeat(Math.floor(remaining / 4))}${
    "a".repeat(remaining % 4)
  }`;
  return { [key]: value };
}

function aggregateStringFixture(byteCount) {
  const chunkCount = Math.ceil(byteCount / MAXIMUM_AGGREGATE_STRING_CHUNK_BYTES);
  const baseChunkBytes = Math.floor(byteCount / chunkCount);
  const largerChunks = byteCount % chunkCount;
  return {
    decodedObjects: Array.from(
      { length: chunkCount },
      (_, index) => aggregateStringChunk(baseChunkBytes + (index < largerChunks ? 1 : 0)),
    ),
  };
}

export function generateLimitFixture(vector, count) {
  requireNonNegativeSafeInteger(count, `${vector.limitName} fixture count`);
  switch (vector.fixtureShape) {
    case "single-document":
    case "declaration-document":
    case "profile-document": return { document: jsonDocument(count) };
    case "document-batch": {
      const profileBytes = count >= 2 ? 2 : 0;
      return {
        documents: rawDocumentBatch(count - profileBytes),
        ...(profileBytes > 0 ? { profile: jsonDocument(profileBytes) } : {}),
      };
    }
    case "json-value-occurrences": return { value: new Array(count - 1).fill(null) };
    case "nested-arrays": {
      let value = 0;
      for (let index = 0; index < count; index += 1) value = [value];
      return { value };
    }
    case "decoded-object-key-and-string-values": return aggregateStringFixture(count);
    case "portable-id": return { identifier: "a".repeat(count) };
    case "owner-path": return { owner: { path: countedItems(count) } };
    case "declarations": return { declarations: countedItems(count) };
    case "provides": return { declaration: { provides: countedItems(count) } };
    case "slots": return { declaration: { slots: countedItems(count) } };
    case "aggregate-provides": return { declarations: [{ provides: countedItems(count) }] };
    case "aggregate-slots": return { declarations: [{ slots: countedItems(count) }] };
    case "roots": return { profile: { roots: countedItems(count) } };
    case "selections": return { profile: { selections: countedItems(count) } };
    case "bindings": return { profile: { bindings: countedItems(count) } };
    case "provider-edges": return {
      bindings: [{ providerImplementationIds: countedItems(count) }],
    };
    case "providers": return {
      binding: { providerImplementationIds: Array.from({ length: count }, (_, index) => index) },
    };
    case "dependency-chain": return { graph: chainGraph(count) };
    case "diagnostics": return { diagnostics: countedItems(count) };
    case "diagnostic-path": return { diagnostic: { path: countedItems(count) } };
    default: throw new TypeError(`unknown resource fixture shape ${vector.fixtureShape}`);
  }
}

export function meterLimitFixture(vector, fixture) {
  switch (vector.fixtureShape) {
    case "single-document":
    case "declaration-document":
    case "profile-document": return fixture.document.byteLength;
    case "json-value-occurrences": return fixture.value.length + 1;
    case "document-batch": return fixture.documents.reduce(
      (total, document) => total + document.byteLength, fixture.profile?.byteLength ?? 0,
    );
    case "nested-arrays": {
      let depth = 0;
      let value = fixture.value;
      while (Array.isArray(value)) {
        depth += 1;
        if (value.length !== 1) throw new TypeError("depth fixture must have one child");
        [value] = value;
      }
      return depth;
    }
    case "decoded-object-key-and-string-values": return fixture.decodedObjects.reduce(
      (total, value) => total + Object.entries(value).reduce(
        (objectTotal, [key, stringValue]) => objectTotal
          + Buffer.byteLength(key, "utf8")
          + Buffer.byteLength(stringValue, "utf8"),
        0,
      ),
      0,
    );
    case "portable-id": return Buffer.byteLength(fixture.identifier, "utf8");
    case "owner-path": return fixture.owner.path.length;
    case "declarations": return fixture.declarations.length;
    case "provides": return fixture.declaration.provides.length;
    case "slots": return fixture.declaration.slots.length;
    case "aggregate-provides": return fixture.declarations.reduce(
      (total, declaration) => total + declaration.provides.length, 0,
    );
    case "aggregate-slots": return fixture.declarations.reduce(
      (total, declaration) => total + declaration.slots.length, 0,
    );
    case "roots": return fixture.profile.roots.length;
    case "selections": return fixture.profile.selections.length;
    case "bindings": return fixture.profile.bindings.length;
    case "provider-edges": return fixture.bindings.reduce(
      (total, binding) => total + binding.providerImplementationIds.length, 0,
    );
    case "providers": return fixture.binding.providerImplementationIds.length;
    case "dependency-chain": return fixture.graph.length;
    case "diagnostics": return fixture.diagnostics.length;
    case "diagnostic-path": return fixture.diagnostic.path.length;
    default: throw new TypeError(`unknown resource fixture shape ${vector.fixtureShape}`);
  }
}

export function mutateLimitFixtureOffByOne(vector, fixture) {
  switch (vector.fixtureFamily) {
    case "raw-bytes": return fixture.document
      ? { document: Buffer.concat([fixture.document, Buffer.from(" ")]) }
      : { documents: [...fixture.documents.slice(0, -1), Buffer.concat([
        fixture.documents.at(-1), Buffer.from(" "),
      ])] };
    case "json-depth": return { value: [fixture.value] };
    case "utf8-string-bytes": {
      if (vector.fixtureShape === "portable-id") {
        return { identifier: `${fixture.identifier}a` };
      }
      const [first, ...rest] = fixture.decodedObjects;
      const [[key, value]] = Object.entries(first);
      return { decodedObjects: [{ [key]: `${value}a` }, ...rest] };
    }
    case "item-count": return {
      owner: { path: new Array(fixture.owner.path.length + 1) },
    };
    case "graph-edges": return {
      bindings: [{
        providerImplementationIds: new Array(
          fixture.bindings[0].providerImplementationIds.length + 1,
        ),
      }],
    };
    case "graph-depth": return {
      graph: [...fixture.graph, [fixture.graph.length - 1]],
    };
    default: throw new TypeError(`unknown resource fixture family ${vector.fixtureFamily}`);
  }
}

export function dependencyOrder(graph) {
  const dependents = Array.from({ length: graph.length }, () => []);
  const indegree = graph.map(dependencies => dependencies.length);
  for (let consumer = 0; consumer < graph.length; consumer += 1) {
    for (const provider of graph[consumer]) dependents[provider].push(consumer);
  }

  const ready = [];
  const pushReady = value => {
    ready.push(value);
    let index = ready.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (ready[parent] <= ready[index]) break;
      [ready[parent], ready[index]] = [ready[index], ready[parent]];
      index = parent;
    }
  };
  const popReady = () => {
    const first = ready[0];
    const last = ready.pop();
    if (ready.length > 0) {
      ready[0] = last;
      let index = 0;
      for (;;) {
        const left = (index * 2) + 1;
        const right = left + 1;
        let smallest = index;
        if (left < ready.length && ready[left] < ready[smallest]) smallest = left;
        if (right < ready.length && ready[right] < ready[smallest]) smallest = right;
        if (smallest === index) break;
        [ready[index], ready[smallest]] = [ready[smallest], ready[index]];
        index = smallest;
      }
    }
    return first;
  };
  for (let index = 0; index < indegree.length; index += 1) {
    if (indegree[index] === 0) pushReady(index);
  }

  const order = [];
  while (ready.length > 0) {
    const provider = popReady();
    order.push(provider);
    for (const consumer of dependents[provider]) {
      indegree[consumer] -= 1;
      if (indegree[consumer] === 0) pushReady(consumer);
    }
  }
  return { acyclic: order.length === graph.length, order };
}

const DEFAULT_MAXIMUM_OMITTED = 262144;

export const DEFAULT_DIAGNOSTIC_CANDIDATE_TEMPLATE = Object.freeze({
  idPrefix: "candidate-",
  decimalWidth: 6,
  code: "profile.unknown-root",
  phase: "profile",
  path: Object.freeze([]),
  coordinateField: "moduleId",
  coordinateValuePrefix: "example/candidate-",
  details: Object.freeze({ reason: "unknown" }),
});

function requireNonNegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
}

function requireCollectorOptions({ limit, maximumOmitted, compareDiagnostics }) {
  if (!Number.isSafeInteger(limit) || limit < 2) {
    throw new TypeError("diagnostic limit must be a safe integer of at least two");
  }
  if (!Number.isSafeInteger(maximumOmitted) || maximumOmitted < 1) {
    throw new TypeError("maximum omitted count must be a positive safe integer");
  }
  if (!Number.isSafeInteger((limit - 1) + maximumOmitted)) {
    throw new TypeError("diagnostic count saturation threshold must be a safe integer");
  }
  if (typeof compareDiagnostics !== "function") {
    throw new TypeError("compareDiagnostics must be the normative diagnostic comparator");
  }
}

function requireCandidate(candidate) {
  if (candidate === null
    || typeof candidate !== "object"
    || typeof candidate.id !== "string"
    || candidate.id.length === 0
    || candidate.diagnostic === null
    || typeof candidate.diagnostic !== "object"
    || Array.isArray(candidate.diagnostic)) {
    throw new TypeError("diagnostic candidate must contain a string ID and structured diagnostic");
  }
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function normalizedComparison(compareDiagnostics, left, right) {
  const result = compareDiagnostics(left.diagnostic, right.diagnostic);
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new TypeError("diagnostic comparator must return a finite number");
  }
  return result < 0 ? -1 : result > 0 ? 1 : 0;
}

/**
 * Retains the lowest K structured candidates in a max heap while streaming.
 * The comparator is injected so this fixture never becomes a second ordering
 * authority. At finalization, 0..K failures are returned without truncation;
 * K+1 or more return the first K-1 candidates and a bounded omitted count.
 */
export function createBoundedDiagnosticCollector({
  limit,
  maximumOmitted = DEFAULT_MAXIMUM_OMITTED,
  compareDiagnostics,
}) {
  requireCollectorOptions({ limit, maximumOmitted, compareDiagnostics });
  const heap = [];
  const saturatedFailureCount = (limit - 1) + maximumOmitted;
  let failureCount = 0;
  let failureCountSaturated = false;
  let truncated = false;
  let peakRetained = 0;
  let finalized = false;
  let finalResult;

  const compare = (left, right) => normalizedComparison(
    compareDiagnostics,
    left,
    right,
  );

  const siftUp = startIndex => {
    let index = startIndex;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compare(heap[parent], heap[index]) >= 0) break;
      [heap[parent], heap[index]] = [heap[index], heap[parent]];
      index = parent;
    }
  };

  const siftDown = startIndex => {
    let index = startIndex;
    for (;;) {
      const left = (index * 2) + 1;
      const right = left + 1;
      let largest = index;
      if (left < heap.length && compare(heap[left], heap[largest]) > 0) largest = left;
      if (right < heap.length && compare(heap[right], heap[largest]) > 0) largest = right;
      if (largest === index) return;
      [heap[index], heap[largest]] = [heap[largest], heap[index]];
      index = largest;
    }
  };

  const add = candidate => {
    if (finalized) throw new Error("cannot add a diagnostic after finalization");
    requireCandidate(candidate);
    if (failureCount >= limit) truncated = true;
    if (failureCount < saturatedFailureCount) {
      failureCount += 1;
    } else {
      failureCountSaturated = true;
    }

    if (heap.length < limit) {
      heap.push(candidate);
      siftUp(heap.length - 1);
      peakRetained = Math.max(peakRetained, heap.length);
      return;
    }
    if (compare(candidate, heap[0]) < 0) {
      heap[0] = candidate;
      siftDown(0);
    }
  };

  const finalize = () => {
    if (finalized) return finalResult;
    finalized = true;
    const ordered = [...heap].sort(compare);
    const retained = Object.freeze(truncated ? ordered.slice(0, limit - 1) : ordered);
    const omitted = truncated
      ? Math.min(maximumOmitted, failureCount - retained.length)
      : 0;
    finalResult = Object.freeze({
      retained,
      truncation: truncated ? Object.freeze({ omitted }) : null,
      failureCount,
      failureCountSaturated,
      peakRetained,
    });
    return finalResult;
  };

  return Object.freeze({ add, finalize });
}

export function boundedStructuredDiagnostics(candidates, options) {
  if (candidates === null
    || candidates === undefined
    || typeof candidates[Symbol.iterator] !== "function") {
    throw new TypeError("diagnostic candidates must be an iterable");
  }
  const collector = createBoundedDiagnosticCollector(options);
  for (const candidate of candidates) collector.add(candidate);
  return collector.finalize();
}

export function diagnosticCandidate(index, template = DEFAULT_DIAGNOSTIC_CANDIDATE_TEMPLATE) {
  requireNonNegativeSafeInteger(index, "diagnostic candidate index");
  const {
    idPrefix,
    decimalWidth,
    code,
    phase,
    path,
    coordinateField,
    coordinateValuePrefix,
    details,
  } = template;
  if (typeof idPrefix !== "string"
    || !Number.isSafeInteger(decimalWidth)
    || decimalWidth < 1
    || typeof code !== "string"
    || typeof phase !== "string"
    || !Array.isArray(path)
    || typeof coordinateField !== "string"
    || typeof coordinateValuePrefix !== "string"
    || details === null
    || typeof details !== "object"
    || Array.isArray(details)) {
    throw new TypeError("invalid structured diagnostic candidate template");
  }
  const suffix = String(index).padStart(decimalWidth, "0");
  if (suffix.length !== decimalWidth) {
    throw new RangeError("diagnostic candidate index exceeds the configured decimal width");
  }
  return {
    id: `${idPrefix}${suffix}`,
    diagnostic: {
      code,
      phase,
      path: structuredClone(path),
      coordinate: { [coordinateField]: `${coordinateValuePrefix}${suffix}` },
      details: structuredClone(details),
    },
  };
}

export function* diagnosticPermutationIndexes(count, permutation) {
  requireNonNegativeSafeInteger(count, "diagnostic permutation count");
  if (permutation?.kind === "ascending") {
    for (let index = 0; index < count; index += 1) yield index;
    return;
  }
  if (permutation?.kind === "reverse") {
    for (let index = count - 1; index >= 0; index -= 1) yield index;
    return;
  }
  if (permutation?.kind === "stride") {
    requireNonNegativeSafeInteger(permutation.start, "diagnostic permutation start");
    if (!Number.isSafeInteger(permutation.stride) || permutation.stride < 1) {
      throw new TypeError("diagnostic permutation stride must be a positive safe integer");
    }
    if (count === 0) return;
    if (greatestCommonDivisor(permutation.stride, count) !== 1) {
      throw new RangeError("diagnostic permutation stride must be coprime to its count");
    }
    let index = permutation.start % count;
    for (let offset = 0; offset < count; offset += 1) {
      yield index;
      index = (index + permutation.stride) % count;
    }
    return;
  }
  throw new TypeError("unknown diagnostic permutation kind");
}

export function* structuredDiagnosticCandidates({
  count,
  permutation,
  template = DEFAULT_DIAGNOSTIC_CANDIDATE_TEMPLATE,
}) {
  for (const index of diagnosticPermutationIndexes(count, permutation)) {
    yield diagnosticCandidate(index, template);
  }
}

export function runDiagnosticCollectorCase({
  count,
  permutation,
  template = DEFAULT_DIAGNOSTIC_CANDIDATE_TEMPLATE,
  limit,
  maximumOmitted = DEFAULT_MAXIMUM_OMITTED,
  compareDiagnostics,
}) {
  return boundedStructuredDiagnostics(
    structuredDiagnosticCandidates({ count, permutation, template }),
    { limit, maximumOmitted, compareDiagnostics },
  );
}

// Retained for consumers that only need arithmetic sizing. Executable ordering
// evidence uses createBoundedDiagnosticCollector with structured candidates.
export function boundedDiagnosticSummary(
  total,
  limit,
  maximumOmitted = DEFAULT_MAXIMUM_OMITTED,
) {
  requireNonNegativeSafeInteger(total, "diagnostic total");
  if (!Number.isSafeInteger(limit) || limit < 2) {
    throw new TypeError("diagnostic limit must be a safe integer of at least two");
  }
  if (!Number.isSafeInteger(maximumOmitted) || maximumOmitted < 1) {
    throw new TypeError("maximum omitted count must be a positive safe integer");
  }
  if (total <= limit) {
    return {
      retained: Array.from({ length: total }, (_, index) => index),
      truncation: null,
    };
  }
  const retained = Array.from(
    { length: limit - 1 },
    (_, index) => index,
  );
  return {
    retained,
    truncation: { omitted: Math.min(maximumOmitted, total - retained.length) },
  };
}

export function measureResourceFixtures({
  compareDiagnostics,
  diagnosticCandidateTemplate = DEFAULT_DIAGNOSTIC_CANDIDATE_TEMPLATE,
} = {}) {
  const fixtures = {
    chainAtDepthLimit: () => chainGraph(2048),
    wideAtDeclarationLimit: () => wideGraph(4096),
    layeredDense: () => layeredGraph(64, 64),
    giantCycle: () => cycleGraph(4096),
  };
  const measurements = {};
  for (const [name, createGraph] of Object.entries(fixtures)) {
    const graph = createGraph();
    const started = performance.now();
    const result = dependencyOrder(graph);
    measurements[name] = {
      ...graphFacts(graph),
      acyclic: result.acyclic,
      elapsedMilliseconds: Number((performance.now() - started).toFixed(3)),
    };
  }
  const diagnosticStorm = typeof compareDiagnostics === "function"
    ? runDiagnosticCollectorCase({
      count: 65536,
      permutation: { kind: "ascending" },
      template: diagnosticCandidateTemplate,
      limit: 256,
      maximumOmitted: DEFAULT_MAXIMUM_OMITTED,
      compareDiagnostics,
    })
    : boundedDiagnosticSummary(65536, 256, DEFAULT_MAXIMUM_OMITTED);
  const saturationProbe = boundedDiagnosticSummary(
    262400,
    256,
    DEFAULT_MAXIMUM_OMITTED,
  );
  measurements.diagnosticStorm = {
    qualificationScope: "static-fixture-oracle-no-production-subject",
    candidates: 65536,
    retained: diagnosticStorm.retained.length,
    omitted: diagnosticStorm.truncation.omitted,
    maximumOmitted: DEFAULT_MAXIMUM_OMITTED,
    collector: typeof compareDiagnostics === "function"
      ? "structured-streaming-max-heap"
      : "arithmetic-sizing-only",
    peakRetained: diagnosticStorm.peakRetained ?? diagnosticStorm.retained.length,
    firstRetainedId: diagnosticStorm.retained[0]?.id,
    lastRetainedId: diagnosticStorm.retained.at(-1)?.id,
    saturationProbe: {
      candidates: 262400,
      retained: saturationProbe.retained.length,
      actualOmitted: 262400 - saturationProbe.retained.length,
      omitted: saturationProbe.truncation.omitted,
      omittedSaturated: saturationProbe.truncation.omitted === DEFAULT_MAXIMUM_OMITTED,
    },
  };
  return measurements;
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { qualifyResourceProfileV2 } = await import("./support/resource-profile-v2.mjs");
  await qualifyResourceProfileV2({ generateLimitFixture, meterLimitFixture });
  process.stdout.write(`${JSON.stringify(measureResourceFixtures(), null, 2)}\n`);
}
