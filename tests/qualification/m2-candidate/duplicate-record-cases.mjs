// Independent, proposed ADR-0014 fixture recipes. This is not a compiler,
// accepted successor contract, or evidence that Core implements M2.
const moduleIds = ["example/consumer", "example/provider-one", "example/provider-two", "example/provider-three"];
const implementations = moduleIds.map(id => `${id}/default`);
const providers = implementations.slice(1);
const compatibility = { family: "exact", familyVersion: 1, token: "example/service/v1" };
const capabilityId = "example/service";
const cardinalities = ["required", "optional", "many"];
const recipes = ["valid-identical", "valid-conflicting", "one-row-cardinality-invalid"];

function cardinalityFor(kind) {
  return kind === "many" ? { kind, min: 1, max: 2, order: "profile" } : { kind };
}

function providerRow(kind, recipe, position, recordCount) {
  if (recipe === "one-row-cardinality-invalid" && position === recordCount - 1) {
    return kind === "required" ? [] : kind === "optional" ? providers.slice(0, 2) : [...providers];
  }
  const offset = recipe === "valid-conflicting" ? position : 0;
  if (kind === "optional" && recipe !== "valid-conflicting") return [];
  return kind === "many" ? [providers[offset], providers[(offset + 1) % providers.length]] : [providers[offset]];
}

function makeCase(kind, recordCount, recipe) {
  const declarations = moduleIds.map((moduleId, index) => ({
    kind: "get-modular.module-declaration", schemaVersion: 1,
    moduleId, implementationId: implementations[index],
    owner: { authority: "example", path: [moduleId.slice("example/".length)] },
    provides: index === 0 ? [] : [{ capabilityId, compatibility: { ...compatibility } }],
    slots: index !== 0 ? [] : [{ slotId: "dependency", capabilityId,
      compatibility: { ...compatibility }, cardinality: cardinalityFor(kind) }],
  }));
  const profile = {
    kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "example/duplicate-record-profile",
    roots: [moduleIds[0]],
    selections: moduleIds.map((moduleId, index) => ({ moduleId, implementationId: implementations[index] })),
    bindings: Array.from({ length: recordCount }, (_, position) => ({
      consumerImplementationId: implementations[0], slotId: "dependency",
      providerImplementationIds: providerRow(kind, recipe, position, recordCount),
    })),
  };
  const diagnostics = [{ code: "binding.duplicate-record", phase: "binding", path: [],
    coordinate: { implementationId: implementations[0], slotId: "dependency" }, details: { reason: "duplicate" } }];
  if (recipe === "one-row-cardinality-invalid") diagnostics.push({
    code: "binding.cardinality", phase: "binding", path: [],
    coordinate: { implementationId: implementations[0], slotId: "dependency" },
    details: { expectedCardinality: kind, actualCardinality: kind === "required" ? 0 : kind === "optional" ? 2 : 3 },
  });
  // The root reaches the invalid repeated group: its incomplete frontier
  // suppresses unproved unreachable providers. No group edge proves a cycle.
  return { caseId: `od006.cardinality.v1/${kind}/${recordCount}/${recipe}`,
    entryPoint: "compileCompositionV1", proposedOnly: true,
    parameters: { cardinality: kind, recordCount, recipe },
    input: { declarations, profile }, expected: { ok: false, diagnostics } };
}

export function* duplicateRecordBaseCases() {
  for (const kind of cardinalities) for (const count of [2, 3]) for (const recipe of recipes) {
    yield makeCase(kind, count, recipe);
  }
}

// Each input list has at most three members. Enumerate in source-index order,
// remove identical permutations by exact JSON data spelling, never by a Set
// of provider identities across different binding records.
function uniquePermutations(values) {
  if (values.length === 0) return [[]];
  const result = [];
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    for (const rest of uniquePermutations(values.filter((_, other) => other !== index))) {
      const row = [values[index], ...rest];
      const key = JSON.stringify(row);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(row);
    }
  }
  return result;
}

function* providerOrders(rows, index = 0, prefix = []) {
  if (index === rows.length) { yield prefix; return; }
  for (const ids of uniquePermutations(rows[index].providerImplementationIds)) {
    yield* providerOrders(rows, index + 1, [...prefix, { ...rows[index], providerImplementationIds: ids }]);
  }
}

export function* duplicateRecordPermutationCases() {
  for (const source of duplicateRecordBaseCases()) {
    let recordRank = 0;
    for (const records of uniquePermutations(source.input.profile.bindings)) {
      let providerRank = 0;
      for (const bindings of providerOrders(records)) {
        const value = structuredClone(source);
        value.caseId = `${source.caseId}/records-${String(recordRank).padStart(6, "0")}/providers-${String(providerRank).padStart(6, "0")}`;
        value.sourceCaseId = source.caseId;
        value.input.profile.bindings = structuredClone(bindings);
        yield value;
        providerRank += 1;
      }
      recordRank += 1;
    }
  }
}
