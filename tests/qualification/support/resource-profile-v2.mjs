import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const add = (actual, increment, limit) => actual > limit
  ? actual : Math.min(limit + 1, actual + increment);

export function meterJsonResources(values, limits) {
  const result = { jsonValueOccurrences: 0, aggregateStringBytes: 0, jsonDepth: 0,
    rejection: null };
  const active = new WeakSet();
  const stack = [...values].reverse().map(value => ({ value, depth: 1 }));
  const reject = reason => { result.rejection ??= reason; };
  while (stack.length) {
    const frame = stack.pop();
    if (frame.leave) {
      active.delete(frame.value);
      continue;
    }
    result.jsonValueOccurrences = add(result.jsonValueOccurrences, 1,
      limits.jsonValueOccurrences);
    const { value } = frame;
    if (typeof value === "string") {
      result.aggregateStringBytes = add(result.aggregateStringBytes,
        Buffer.byteLength(value), limits.aggregateStringBytes);
      continue;
    }
    if (value === null || ["boolean", "number"].includes(typeof value)) continue;
    if (typeof value !== "object") {
      reject("unsupported-value-type");
      continue;
    }
    if (active.has(value)) {
      reject("cycle-back-reference");
      continue;
    }
    active.add(value);
    stack.push({ value, leave: true });
    result.jsonDepth = Math.max(result.jsonDepth, frame.depth);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length) reject("symbol-property");
    if (Array.isArray(value)) {
      let indexes = 0;
      for (const [name, descriptor] of Object.entries(descriptors)) {
        if (name === "length") continue;
        const index = Number(name);
        if (!Number.isInteger(index) || String(index) !== name || index >= value.length) {
          reject("extended-array-property");
          continue;
        }
        indexes += 1;
        if (!descriptor.enumerable) reject("non-enumerable-property");
        if (!("value" in descriptor)) {
          reject("accessor-property");
          continue;
        }
        stack.push({ value: descriptor.value, depth: frame.depth + 1 });
      }
      const holes = value.length - indexes;
      if (holes) {
        result.jsonValueOccurrences = add(result.jsonValueOccurrences, holes,
          limits.jsonValueOccurrences);
        reject("sparse-array");
      }
      continue;
    }
    for (const [key, descriptor] of Object.entries(descriptors)) {
      result.aggregateStringBytes = add(result.aggregateStringBytes,
        Buffer.byteLength(key), limits.aggregateStringBytes);
      if (!descriptor.enumerable) reject("non-enumerable-property");
      if (!("value" in descriptor)) {
        reject("accessor-property");
        continue;
      }
      stack.push({ value: descriptor.value, depth: frame.depth + 1 });
    }
  }
  return result;
}

export function meterRawResources(declarations, profile, limits) {
  let aggregateRawBytes = 0;
  let declarationRawDocumentBytes = 0;
  for (const document of declarations) {
    declarationRawDocumentBytes = Math.max(declarationRawDocumentBytes, document.byteLength);
    aggregateRawBytes = add(aggregateRawBytes, document.byteLength, limits.aggregateRawBytes);
  }
  aggregateRawBytes = add(aggregateRawBytes, profile.byteLength, limits.aggregateRawBytes);
  return { declarationRawDocumentBytes: Math.min(limits.declarationRawDocumentBytes + 1,
    declarationRawDocumentBytes),
  profileRawDocumentBytes: Math.min(limits.profileRawDocumentBytes + 1, profile.byteLength),
  aggregateRawBytes };
}

const compatibility = () => ({ family: "exact", familyVersion: 1,
  token: "example/p500/capability" });
const declaration = (moduleId, implementationId, slots) => ({
  kind: "get-modular.module-declaration", schemaVersion: 1, moduleId, implementationId,
  owner: { authority: "qualification", path: ["p500"] },
  provides: [{ capabilityId: "example/p500/capability", compatibility: compatibility() }], slots,
});
const slot = (slotId, cardinality) => ({ slotId, capabilityId: "example/p500/capability",
  compatibility: compatibility(), cardinality });

export function generateDenseProfile(recipe) {
  const declarations = [], selections = [], bindings = [], ids = [];
  for (let index = 0; index < recipe.moduleCount; index += 1) {
    const moduleId = `example/p500/module-${String(index).padStart(4, "0")}`;
    const implementationId = `${moduleId}/implementation-${"x".repeat(
      recipe.implementationIdPadding)}`;
    ids.push({ moduleId, implementationId });
    const slots = [];
    if (index) slots.push(slot("required", { kind: "required" }));
    if (index > 1) slots.push(slot("optional", { kind: "optional" }));
    if (index) slots.push(slot("many", { kind: "many", min: 1,
      max: recipe.manyWindow, order: "profile" }));
    declarations.push(declaration(moduleId, implementationId, slots));
    selections.push({ moduleId, implementationId });
    const bind = (slotId, providers) => bindings.push({ consumerImplementationId: implementationId,
      slotId, providerImplementationIds: providers.map(value => value.implementationId) });
    if (index) bind("required", [ids[index - 1]]);
    if (index > 1) bind("optional", [ids[index - 2]]);
    if (index) bind("many", ids.slice(Math.max(0, index - recipe.manyWindow), index));
  }
  return { declarations, profile: { kind: "get-modular.composition-profile", schemaVersion: 1,
    profileId: "example/p500/profile", roots: [ids[recipe.rootModuleIndex].moduleId],
    selections, bindings } };
}

export function independentlyGenerateDenseProfile(recipe) {
  const all = Array.from({ length: recipe.moduleCount }, (_, index) => {
    const moduleId = `example/p500/module-${String(index).padStart(4, "0")}`;
    return { moduleId, implementationId: `${moduleId}/implementation-${
      "x".repeat(recipe.implementationIdPadding)}` };
  });
  const independentSlot = (slotId, cardinality) => ({ slotId,
    capabilityId: "example/p500/capability", compatibility: {
      family: "exact", familyVersion: 1, token: "example/p500/capability" }, cardinality });
  const declarations = all.map(({ moduleId, implementationId }, index) => ({
    kind: "get-modular.module-declaration", schemaVersion: 1, moduleId, implementationId,
    owner: { authority: "qualification", path: ["p500"] },
    provides: [{ capabilityId: "example/p500/capability", compatibility: {
      family: "exact", familyVersion: 1, token: "example/p500/capability" } }],
    slots: [
      ...(index ? [independentSlot("required", { kind: "required" })] : []),
      ...(index > 1 ? [independentSlot("optional", { kind: "optional" })] : []),
      ...(index ? [independentSlot("many", { kind: "many", min: 1,
        max: recipe.manyWindow, order: "profile" })] : []),
    ],
  }));
  const binding = (consumer, slotId, providers) => ({
    consumerImplementationId: consumer.implementationId, slotId,
    providerImplementationIds: providers.map(value => value.implementationId),
  });
  const bindings = all.flatMap((consumer, index) => [
    ...(index ? [binding(consumer, "required", [all[index - 1]])] : []),
    ...(index > 1 ? [binding(consumer, "optional", [all[index - 2]])] : []),
    ...(index ? [binding(consumer, "many",
      all.slice(Math.max(0, index - recipe.manyWindow), index))] : []),
  ]);
  return { declarations, profile: { kind: "get-modular.composition-profile", schemaVersion: 1,
    profileId: "example/p500/profile", roots: [all[recipe.rootModuleIndex].moduleId],
    selections: all.map(value => ({ ...value })), bindings } };
}

function dependencyOrder(graph) {
  const dependents = Array.from({ length: graph.length }, () => []);
  const indegree = graph.map(providers => providers.length);
  for (let consumer = 0; consumer < graph.length; consumer += 1) {
    for (const provider of graph[consumer]) dependents[provider].push(consumer);
  }
  const ready = indegree.map((value, index) => value === 0 ? index : -1)
    .filter(value => value >= 0);
  const order = [];
  while (ready.length) {
    const provider = ready.shift();
    order.push(provider);
    for (const consumer of dependents[provider]) {
      indegree[consumer] -= 1;
      if (indegree[consumer] === 0) {
        ready.push(consumer);
        ready.sort((left, right) => left - right);
      }
    }
  }
  return { acyclic: order.length === graph.length, order };
}

export function meterCompositionResources({ declarations, profile }) {
  const index = new Map(profile.selections.map((value, ordinal) =>
    [value.implementationId, ordinal]));
  const selected = new Set(index.keys());
  const graph = Array.from({ length: selected.size }, () => new Set());
  let Einput = 0, Evalid = 0, providersPerManySlot = 0;
  for (const binding of profile.bindings) {
    Einput += binding.providerImplementationIds.length;
    if (binding.slotId === "many") providersPerManySlot = Math.max(
      providersPerManySlot, binding.providerImplementationIds.length);
    const unique = new Set(binding.providerImplementationIds);
    const valid = unique.size === binding.providerImplementationIds.length
      && selected.has(binding.consumerImplementationId)
      && binding.providerImplementationIds.every(provider => selected.has(provider));
    if (!valid) continue;
    Evalid += binding.providerImplementationIds.length;
    for (const provider of binding.providerImplementationIds) {
      graph[index.get(binding.consumerImplementationId)].add(index.get(provider));
    }
  }
  const dependencies = graph.map(value => [...value]);
  const order = dependencyOrder(dependencies);
  const depths = new Array(graph.length).fill(1);
  for (const consumer of order.order) for (const provider of dependencies[consumer]) {
    depths[consumer] = Math.max(depths[consumer], depths[provider] + 1);
  }
  const byModule = new Map(profile.selections.map(value =>
    [value.moduleId, value.implementationId]));
  const reachable = new Set(profile.roots.map(root => byModule.get(root)));
  const pending = [...reachable];
  while (pending.length) {
    const consumer = index.get(pending.pop());
    for (const provider of dependencies[consumer] ?? []) {
      const id = profile.selections[provider].implementationId;
      if (!reachable.has(id)) { reachable.add(id); pending.push(id); }
    }
  }
  return { declarations: declarations.length,
    capabilitiesPerDeclaration: Math.max(...declarations.map(value => value.provides.length)),
    slotsPerDeclaration: Math.max(...declarations.map(value => value.slots.length)),
    totalCapabilities: declarations.reduce((sum, value) => sum + value.provides.length, 0),
    totalSlots: declarations.reduce((sum, value) => sum + value.slots.length, 0),
    roots: profile.roots.length, selections: profile.selections.length,
    bindings: profile.bindings.length, providersPerManySlot, Einput, Evalid,
    Eadj: dependencies.reduce((sum, value) => sum + value.length, 0),
    graphDepth: Math.max(...depths), acyclic: order.acyclic,
    reachableSelections: reachable.size };
}

const sha256 = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export function observeDenseProfile(fixture, limits) {
  const declarationDocuments = fixture.declarations.map(value => Buffer.from(JSON.stringify(value)));
  const profileDocument = Buffer.from(JSON.stringify(fixture.profile));
  const declarationCorpus = Buffer.from(JSON.stringify(fixture.declarations));
  return { ...meterCompositionResources(fixture),
    ...meterRawResources(declarationDocuments, profileDocument, limits),
    ...meterJsonResources([...fixture.declarations, fixture.profile], limits),
    declarationCorpusBytes: declarationCorpus.byteLength,
    declarationCorpusSha256: sha256(declarationCorpus),
    profileBytes: profileDocument.byteLength, profileSha256: sha256(profileDocument) };
}

function independentCounts(recipe) {
  const many = recipe.manyWindow * (recipe.manyWindow + 1) / 2
    + (recipe.moduleCount - 1 - recipe.manyWindow) * recipe.manyWindow;
  return { declarations: recipe.moduleCount, totalCapabilities: recipe.moduleCount,
    totalSlots: (recipe.moduleCount - 1) * 2 + recipe.moduleCount - 2,
    roots: 1, selections: recipe.moduleCount,
    bindings: (recipe.moduleCount - 1) * 2 + recipe.moduleCount - 2,
    Einput: many + recipe.moduleCount * 2 - 3,
    Evalid: many + recipe.moduleCount * 2 - 3, Eadj: many,
    graphDepth: recipe.moduleCount, reachableSelections: recipe.moduleCount };
}

export async function qualifyResourceProfileV2({ generateLimitFixture, meterLimitFixture }) {
  const readJson = relative => readFile(new URL(relative, import.meta.url), "utf8").then(JSON.parse);
  const [profile, historical, vectors, diagnosticContract] = await Promise.all([
    readJson("../../../architecture/qualification/v1/resource-profile-v2.json"),
    readJson("../../../architecture/contracts/v1/resource-profile.json"),
    readJson("../../../architecture/qualification/v1/resource-boundary-vectors.json"),
    readJson("../../../architecture/qualification/v1/diagnostic-contract.json"),
  ]);
  assert.equal(profile.profileVersion, 2);
  assert.equal("rawDocumentBytes" in profile.limits, false);
  for (const [name, value] of Object.entries(historical.limits)) {
    if (name !== "rawDocumentBytes") assert.equal(profile.limits[name], value);
  }
  assert.equal(profile.limits.declarationRawDocumentBytes, historical.limits.rawDocumentBytes);
  assert.equal(profile.limits.profileRawDocumentBytes, 8388608);
  assert.equal(profile.limits.jsonValueOccurrences, 2097152);
  assert.deepEqual(vectors.profileV2.cases.map(value => value.limitName).sort(),
    Object.keys(profile.limits).sort());
  for (const vector of vectors.profileV2.cases) {
    assert.equal(vector.at, profile.limits[vector.limitName]);
    assert.equal(vector.over, vector.at + 1);
    assert.ok(vector.phase && vector.unit);
    assert.equal(diagnosticContract.limitPhases[vector.limitName], vector.phase);
    assert.ok(["empty", "structural"].includes(
      diagnosticContract.limitPathPolicies[vector.limitName],
    ));
    for (const expected of [vector.at, vector.over]) {
      const boundary = generateLimitFixture(vector, expected);
      assert.equal(meterLimitFixture(vector, boundary), expected);
      if (vector.fixtureFamily === "raw-bytes") {
        const documents = boundary.documents ?? [boundary.document];
        for (const document of documents) JSON.parse(document.toString("utf8").trimEnd());
      }
    }
  }
  assert.equal(vectors.profileV2.providerCounting.providerImplementationIds.length, 2);
  assert.equal(new Set(vectors.profileV2.providerCounting.providerImplementationIds).size, 1);
  assert.deepEqual(meterJsonResources([new Array(3)], profile.limits), {
    jsonValueOccurrences: 4, aggregateStringBytes: 0, jsonDepth: 1,
    rejection: "sparse-array" });
  const shared = { shared: "value" };
  assert.equal(meterJsonResources([[shared, shared]], profile.limits).jsonValueOccurrences, 5);
  const cycle = {}; cycle.self = cycle;
  assert.deepEqual(meterJsonResources([cycle], profile.limits), {
    jsonValueOccurrences: 2, aggregateStringBytes: 4, jsonDepth: 1,
    rejection: "cycle-back-reference" });
  let invoked = 0;
  const accessor = {};
  Object.defineProperty(accessor, "secret", { enumerable: true,
    get() { invoked += 1; return 1; } });
  assert.equal(meterJsonResources([accessor], profile.limits).rejection, "accessor-property");
  assert.equal(invoked, 0);
  assert.deepEqual(meterJsonResources([{ unknown: 1, wrong: Symbol("x") }], profile.limits), {
    jsonValueOccurrences: 3, aggregateStringBytes: 12, jsonDepth: 1,
    rejection: "unsupported-value-type" });
  const hidden = {}; Object.defineProperty(hidden, "value", { value: 1 });
  assert.equal(meterJsonResources([hidden], profile.limits).rejection,
    "non-enumerable-property");
  const extended = []; extended.extra = 1;
  assert.equal(meterJsonResources([extended], profile.limits).rejection,
    "extended-array-property");
  assert.equal(meterJsonResources([1, 2, 3, 4], { ...profile.limits,
    jsonValueOccurrences: 2 }).jsonValueOccurrences, 3);
  assert.deepEqual(meterRawResources([Buffer.alloc(8)], Buffer.alloc(9), {
    declarationRawDocumentBytes: 2, profileRawDocumentBytes: 3, aggregateRawBytes: 4,
  }), { declarationRawDocumentBytes: 3, profileRawDocumentBytes: 4,
    aggregateRawBytes: 5 });
  const recipe = vectors.profileV2.p500;
  const fixture = generateDenseProfile(recipe);
  assert.deepEqual(independentlyGenerateDenseProfile(recipe), fixture);
  const observed = observeDenseProfile(fixture, profile.limits);
  assert.deepEqual(observed, recipe.expected);
  for (const [name, expected] of Object.entries(independentCounts(recipe))) {
    assert.equal(observed[name], expected);
  }
  assert.equal(observed.acyclic, true);
  assert.equal(observed.rejection, null);
  assert.ok(observed.profileBytes > 1048576 && observed.profileBytes < 8388608);
  assert.ok(observed.aggregateRawBytes < 16777216);
  for (const sizing of vectors.profileV2.sizingObservations) {
    const sized = observeDenseProfile(generateDenseProfile({ ...recipe,
      moduleCount: sizing.scale, rootModuleIndex: sizing.scale - 1 }), profile.limits);
    assert.deepEqual({ profileBytes: sized.profileBytes, bindings: sized.bindings,
      Einput: sized.Einput, Eadj: sized.Eadj }, sizing.expected);
  }
}
