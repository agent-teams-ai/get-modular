// Closed candidate worlds for proposed ADR-0014. No Core subject or collector
// supplies expected results; generation-2 acceptance remains a separate gate.
import { duplicateRecordOverlapCases } from "./duplicate-record-cases.mjs";

const capability = { capabilityId: "example/service", compatibility: {
  family: "exact", familyVersion: 1, token: "example/service/v1" } };
const duplicate = (moduleId, slotId) => ({ code: "binding.duplicate-record", phase: "binding",
  path: [], coordinate: { implementationId: `${moduleId}/default`, slotId }, details: { reason: "duplicate" } });

function world(groups) {
  const modules = new Map();
  for (const [moduleId, slotId] of groups) {
    if (!modules.has(moduleId)) modules.set(moduleId, { kind: "get-modular.module-declaration", schemaVersion: 1,
      moduleId, implementationId: `${moduleId}/default`, owner: { authority: "example", path: ["ordering"] },
      provides: [], slots: [] });
    modules.get(moduleId).slots.push({ slotId, ...structuredClone(capability), cardinality: { kind: "optional" } });
  }
  const declarations = [...modules.values()];
  return { declarations, profile: { kind: "get-modular.composition-profile", schemaVersion: 1,
    profileId: "example/ordering", roots: [...modules.keys()],
    selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
    bindings: groups.flatMap(([moduleId, slotId]) => Array.from({ length: 2 }, () => ({
      consumerImplementationId: `${moduleId}/default`, slotId, providerImplementationIds: [] }))) } };
}

export function* duplicateRecordOrderingCases() {
  const phase = [...duplicateRecordOverlapCases()].find(value => value.parameters.fault === "unreached-invalid-frontier");
  yield { ...phase, caseId: "od006.ordering.axes.v1/phase-before-code", parameters: { axis: "phase-before-code" } };

  const input = world([["example/z", "dependency"]]);
  for (const moduleId of ["example/a", "example/provider-one", "example/provider-two"]) {
    const declaration = world([[moduleId, "dependency"]]).declarations[0];
    if (moduleId === "example/a") declaration.slots[0].cardinality = { kind: "many", min: 1, max: 3, order: "profile" };
    else { declaration.slots = []; declaration.provides = [structuredClone(capability)]; }
    input.declarations.push(declaration);
    input.profile.selections.push({ moduleId, implementationId: `${moduleId}/default` });
    input.profile.roots.push(moduleId);
  }
  input.profile.bindings.unshift({ consumerImplementationId: "example/a/default", slotId: "dependency",
    providerImplementationIds: ["example/provider-two/default", "example/provider-two/default", "example/provider-one/default"] });
  yield { caseId: "od006.ordering.axes.v1/code-before-coordinate", entryPoint: "compileCompositionV1", proposedOnly: true,
    parameters: { axis: "code-before-coordinate" }, input, expected: { ok: false, diagnostics: [
      duplicate("example/z", "dependency"), { code: "binding.duplicate", phase: "binding", path: [],
        coordinate: { implementationId: "example/a/default", slotId: "dependency", providerImplementationId: "example/provider-two/default" },
        details: { reason: "duplicate" } } ] } };

  yield { caseId: "od006.ordering.axes.v1/coordinate-ascii", entryPoint: "compileCompositionV1", proposedOnly: true,
    parameters: { axis: "coordinate-ascii" }, input: world([
      ["example/c-2", "slot-0"], ["example/c-10", "slot-2"], ["example/c-10", "slot-10"] ]),
    expected: { ok: false, diagnostics: [duplicate("example/c-10", "slot-10"),
      duplicate("example/c-10", "slot-2"), duplicate("example/c-2", "slot-0")] } };
}

export function* duplicateRecordShuffledOrderingCases() {
  for (const source of duplicateRecordOrderingCases()) {
    const value = structuredClone(source);
    value.caseId = source.caseId.replace("ordering.axes", "ordering.seeded-shuffle");
    value.sourceCaseId = source.caseId;
    let state = 0x4f440006;
    for (const list of [value.input.declarations, value.input.profile.roots,
      value.input.profile.selections, value.input.profile.bindings]) {
      for (let index = list.length - 1; index > 0; index -= 1) {
        state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
        const other = (state >>> 0) % (index + 1);
        [list[index], list[other]] = [list[other], list[index]];
      }
    }
    yield value;
  }
}

export function* duplicateRecordCollectorCases() {
  for (const count of [256, 257, 258]) for (const order of ["ascending", "reverse", "stride-17"]) {
    const moduleId = index => `example/c${String(index).padStart(4, "0")}`;
    const indices = Array.from({ length: count }, (_, index) => order === "ascending" ? index
      : order === "reverse" ? count - 1 - index : (count - 1 + index * 17) % count);
    // Formulaic oracle from the closed proposal: 256 returns all; overflow
    // reserves one record for truncation, retaining only coordinates 0..254.
    const diagnostics = Array.from({ length: count === 256 ? 256 : 255 }, (_, index) => duplicate(moduleId(index), "dependency"));
    if (count > 256) diagnostics.push({ code: "diagnostics.truncated", phase: "output", path: [],
      coordinate: {}, details: { omitted: count - 255 } });
    yield { caseId: `od006.collector.v1/${count}/${order}`, entryPoint: "compileCompositionV1", proposedOnly: true,
      parameters: { count, order }, input: world(indices.map(index => [moduleId(index), "dependency"])),
      expected: { ok: false, diagnostics } };
  }
}
