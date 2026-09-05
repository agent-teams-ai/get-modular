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

const rowFaults = ["duplicate-provider", "unknown-provider", "provider-not-selected",
  "cardinality-under", "cardinality-over", "capability-missing", "compatibility-mismatch"];

export function* duplicateRecordRowFailureCases() {
  for (const fault of rowFaults) for (const recordCount of [2, 3]) {
    for (let faultPosition = 0; faultPosition < recordCount; faultPosition += 1) {
      const value = makeCase("many", recordCount, "valid-identical");
      value.caseId = `od006.row-failures.v1/${fault}/${recordCount}/${String(faultPosition).padStart(2, "0")}`;
      value.parameters = { cardinality: "many", recordCount, fault, faultPosition };
      const row = value.input.profile.bindings[faultPosition];
      const coordinate = { implementationId: implementations[0], slotId: "dependency" };
      let code;
      let details;
      switch (fault) {
        case "duplicate-provider":
          row.providerImplementationIds = [providers[0], providers[0]];
          coordinate.providerImplementationId = providers[0];
          code = "binding.duplicate"; details = { reason: "duplicate" }; break;
        case "unknown-provider":
          row.providerImplementationIds = ["example/absent/default"];
          coordinate.providerImplementationId = "example/absent/default";
          code = "binding.unknown-provider"; details = { reason: "unknown" }; break;
        case "provider-not-selected":
          row.providerImplementationIds = [providers[2]];
          value.input.profile.selections.pop();
          coordinate.providerImplementationId = providers[2];
          code = "binding.provider-not-selected"; details = { reason: "mismatch" }; break;
        case "cardinality-under":
          row.providerImplementationIds = [];
          code = "binding.cardinality"; details = { expectedCardinality: "many", actualCardinality: 0 }; break;
        case "cardinality-over":
          row.providerImplementationIds = [...providers];
          code = "binding.cardinality"; details = { expectedCardinality: "many", actualCardinality: 3 }; break;
        case "capability-missing":
          row.providerImplementationIds = [providers[2]];
          value.input.declarations[3].provides = [];
          coordinate.providerImplementationId = providers[2];
          code = "binding.capability-missing"; details = { reason: "missing" }; break;
        case "compatibility-mismatch": {
          row.providerImplementationIds = [providers[2]];
          const actual = { ...compatibility, token: "example/service/v2" };
          value.input.declarations[3].provides[0].compatibility = actual;
          coordinate.providerImplementationId = providers[2];
          code = "binding.compatibility-mismatch";
          details = { expectedCompatibility: { ...compatibility }, actualCompatibility: { ...actual } }; break;
        }
        default: throw new Error("Unknown closed row-fault recipe");
      }
      value.expected.diagnostics.push({ code, phase: "binding", path: [], coordinate, details });
      yield value;
    }
  }
}

export function* duplicateRecordOverlapCases() {
  for (const fault of ["unknown-consumer", "unknown-slot"]) {
    const value = makeCase("required", 2, "valid-identical");
    value.caseId = `od006.overlap.${fault}.v1`;
    value.parameters = { fault };
    value.input.declarations = [value.input.declarations[0]];
    value.input.declarations[0].slots = [];
    value.input.profile.selections = [value.input.profile.selections[0]];
    const consumer = fault === "unknown-consumer" ? "example/absent/default" : implementations[0];
    for (const row of value.input.profile.bindings) {
      row.consumerImplementationId = consumer;
      row.providerImplementationIds = [];
    }
    value.expected.diagnostics[0].coordinate.implementationId = consumer;
    value.expected.diagnostics.push({ code: `binding.${fault}`, phase: "binding", path: [],
      coordinate: fault === "unknown-consumer" ? { implementationId: consumer }
        : { implementationId: consumer, slotId: "dependency" }, details: { reason: "unknown" } });
    yield value;
  }
  {
    const value = makeCase("required", 2, "valid-identical");
    value.caseId = "od006.overlap.unselected-consumer.v1";
    value.parameters = { fault: "unselected-consumer" };
    value.input.declarations = value.input.declarations.slice(0, 2);
    value.input.profile.roots = [moduleIds[1]];
    value.input.profile.selections = [value.input.profile.selections[1]];
    yield value;
  }
  {
    const value = makeCase("required", 2, "valid-identical");
    value.caseId = "od006.graph.reached-incomplete-independent-scc.v1";
    value.parameters = { fault: "reached-incomplete-independent-scc" };
    value.input.declarations[0].provides = [{ capabilityId, compatibility: { ...compatibility } }];
    // This individually compatible self-reference MUST NOT become a graph edge
    // from the invalid group. The other two nodes prove a separate real SCC.
    value.input.profile.bindings[0].providerImplementationIds = [implementations[0]];
    for (const [consumerIndex, providerIndex] of [[2, 3], [3, 2]]) {
      value.input.declarations[consumerIndex].slots = structuredClone(value.input.declarations[0].slots);
      value.input.profile.bindings.push({ consumerImplementationId: implementations[consumerIndex],
        slotId: "dependency", providerImplementationIds: [implementations[providerIndex]] });
    }
    value.expected.diagnostics.push({ code: "graph.cycle", phase: "graph", path: [], coordinate: {},
      details: { component: ["example/provider-three/default", "example/provider-two/default"] } });
    yield value;
  }
  {
    const value = makeCase("required", 2, "valid-identical");
    value.caseId = "od006.graph.unreached-invalid-frontier.v1";
    value.parameters = { fault: "unreached-invalid-frontier" };
    value.input.profile.roots = [moduleIds[1]];
    for (const moduleId of ["example/consumer", "example/provider-three", "example/provider-two"]) {
      value.expected.diagnostics.push({ code: "profile.unreachable-selection", phase: "graph", path: [],
        coordinate: { moduleId, implementationId: `${moduleId}/default` }, details: { reason: "unreachable" } });
    }
    yield value;
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
  for (const source of [...duplicateRecordBaseCases(), ...duplicateRecordRowFailureCases()]) {
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
