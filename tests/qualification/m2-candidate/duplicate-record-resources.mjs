// PROPOSED-ONLY ADR-0014 resource fixtures. No Core subject is imported or run.
// compileCompositionV1 is an immutable evidence entry-point label only.
// All six invocations stay inside object occurrence/string/depth admission.
export const duplicateRecordResourceSource = '51ca2bf68ac311b8bd0af101eaa9e8df1a4ac564';

function freezeTree(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

export const duplicateRecordResourcePolicy = freezeTree({
  status: 'proposed-fixture-only',
  recommendation: 'A; owner selection not recorded',
  boundary: 'object',
  execution: 'fixture-consistency-only; no Core subject',
  envelope: 'inside object occurrence/string/depth admission',
  resource: {
    source: '51ca2bf68ac311b8bd0af101eaa9e8df1a4ac564',
    path: 'architecture/qualification/v1/resource-profile-v2.json',
    sha256: 'sha256:9cc605e8a5b6b9553c4c12c1355eaf033daae8b7ecf000f7a159d88262c0674c',
    profileId: 'get-modular/resource-profile/v1-standard',
    profileVersion: 2,
  },
  identityTokens: {
    consumerModuleId: 'a/c', consumerImplementationId: 'a/c',
    providerModuleId: 'a/p', providerImplementationId: 'a/p',
    capabilityId: 'a/k', compatibilityToken: 'a/k', profileId: 'a/f',
    slotId: 's', ownerAuthority: 't', ownerPath: ['t'],
  },
  duplicateRecord: {
    code: 'binding.duplicate-record', prerequisiteGroup: 'binding.record-census',
    prerequisites: ['document.schema-valid', 'binding.record-coordinate-census-complete'],
    suppressionScope: 'binding',
  },
  rawByteLimits: 'not applicable to these object invocations; no JSON entry point',
});

// Entire ordered domain. A run supplies independent records, each containing
// exactly providers occurrences of a/p. No caller-selected parameters or seed.
// Numeric values are independently checked against both pinned JSON pointers.
export const duplicateRecordResourceRecipes = freezeTree([
  { caseId: 'od006.resources.v1/bindings/at', parameters: {
    limitName: 'bindings', boundary: 'at', limit: 65536, actual: 65536,
    resourcePointer: '/limits/bindings', boundaryPointer: '/profileV2/cases/15',
    runs: [{ records: 65536, providers: 0 }],
  } },
  { caseId: 'od006.resources.v1/bindings/over', parameters: {
    limitName: 'bindings', boundary: 'over', limit: 65536, actual: 65537,
    resourcePointer: '/limits/bindings', boundaryPointer: '/profileV2/cases/15',
    runs: [{ records: 65537, providers: 0 }],
  } },
  { caseId: 'od006.resources.v1/graphEdges/at', parameters: {
    limitName: 'graphEdges', boundary: 'at', limit: 262144, actual: 262144,
    resourcePointer: '/limits/graphEdges', boundaryPointer: '/profileV2/cases/16',
    runs: [{ records: 256, providers: 1024 }],
  } },
  { caseId: 'od006.resources.v1/graphEdges/over', parameters: {
    limitName: 'graphEdges', boundary: 'over', limit: 262144, actual: 262145,
    resourcePointer: '/limits/graphEdges', boundaryPointer: '/profileV2/cases/16',
    runs: [{ records: 256, providers: 1024 }, { records: 1, providers: 1 }],
  } },
  { caseId: 'od006.resources.v1/providersPerManySlot/at', parameters: {
    limitName: 'providersPerManySlot', boundary: 'at', limit: 1024, actual: 1024,
    resourcePointer: '/limits/providersPerManySlot', boundaryPointer: '/profileV2/cases/17',
    runs: [{ records: 1, providers: 1024 }, { records: 1, providers: 1 }],
  } },
  { caseId: 'od006.resources.v1/providersPerManySlot/over', parameters: {
    limitName: 'providersPerManySlot', boundary: 'over', limit: 1024, actual: 1025,
    resourcePointer: '/limits/providersPerManySlot', boundaryPointer: '/profileV2/cases/17',
    runs: [{ records: 1, providers: 1025 }, { records: 1, providers: 1 }],
  } },
]);

export const duplicateRecordResourceStream = freezeTree({
  generatorId: 'od006.resources.v1', rowCount: 6,
  order: 'duplicateRecordResourceRecipes array order',
  encoding: 'RFC8785 complete case UTF-8 followed by one LF per case',
  hashAlgorithm: 'SHA-256',
  digestCustody: 'test emits an observation for retention; no precomputed digest claimed',
});

// Literal complete outcomes, separate from construction and resource metering.
// The two structural overflows also violate their corresponding profile
// maxItems constraint. document.schema-valid is therefore not valid: neither
// duplicate-record nor row-local duplicate/cardinality derivatives are eligible.
// graphEdges overflow does not invalidate profile schema or suppress independent
// binding facts. Its graph phase sorts after those binding diagnostics.
const expectedResults = freezeTree([
  { ok: false, diagnostics: [
    { code: 'binding.duplicate-record', phase: 'binding', path: [],
      coordinate: { implementationId: 'a/c', slotId: 's' }, details: { reason: 'duplicate' } },
  ] },
  { ok: false, diagnostics: [
    { code: 'input.limit-exceeded', phase: 'profile',
      path: [{ kind: 'field', value: 'profile' }, { kind: 'field', value: 'bindings' }],
      coordinate: {}, details: { limitName: 'bindings', limit: 65536, actual: 65537 } },
  ] },
  { ok: false, diagnostics: [
    { code: 'binding.duplicate-record', phase: 'binding', path: [],
      coordinate: { implementationId: 'a/c', slotId: 's' }, details: { reason: 'duplicate' } },
    { code: 'binding.duplicate', phase: 'binding', path: [],
      coordinate: { implementationId: 'a/c', slotId: 's', providerImplementationId: 'a/p' },
      details: { reason: 'duplicate' } },
  ] },
  { ok: false, diagnostics: [
    { code: 'binding.duplicate-record', phase: 'binding', path: [],
      coordinate: { implementationId: 'a/c', slotId: 's' }, details: { reason: 'duplicate' } },
    { code: 'binding.duplicate', phase: 'binding', path: [],
      coordinate: { implementationId: 'a/c', slotId: 's', providerImplementationId: 'a/p' },
      details: { reason: 'duplicate' } },
    { code: 'input.limit-exceeded', phase: 'graph', path: [], coordinate: {},
      details: { limitName: 'graphEdges', limit: 262144, actual: 262145 } },
  ] },
  { ok: false, diagnostics: [
    { code: 'binding.duplicate-record', phase: 'binding', path: [],
      coordinate: { implementationId: 'a/c', slotId: 's' }, details: { reason: 'duplicate' } },
    { code: 'binding.duplicate', phase: 'binding', path: [],
      coordinate: { implementationId: 'a/c', slotId: 's', providerImplementationId: 'a/p' },
      details: { reason: 'duplicate' } },
  ] },
  { ok: false, diagnostics: [
    { code: 'input.limit-exceeded', phase: 'binding',
      path: [{ kind: 'field', value: 'profile' }, { kind: 'field', value: 'bindings' },
        { kind: 'index', value: 0 }, { kind: 'field', value: 'providerImplementationIds' }],
      coordinate: {}, details: { limitName: 'providersPerManySlot', limit: 1024, actual: 1025 } },
  ] },
]);

const compatibility = () => ({ family: 'exact', familyVersion: 1, token: 'a/k' });

function declaration(id, consumer) {
  return {
    kind: 'get-modular.module-declaration', schemaVersion: 1,
    moduleId: id, implementationId: id, owner: { authority: 't', path: ['t'] },
    provides: consumer ? [] : [{ capabilityId: 'a/k', compatibility: compatibility() }],
    slots: consumer ? [{ slotId: 's', capabilityId: 'a/k', compatibility: compatibility(),
      cardinality: { kind: 'many', min: 0, max: 1024, order: 'profile' } }] : [],
  };
}

function constructInput(parameters) {
  const declarations = [declaration('a/c', true), declaration('a/p', false)];
  const bindings = [];
  for (const run of parameters.runs) {
    for (let index = 0; index < run.records; index += 1) {
      bindings.push({ consumerImplementationId: 'a/c', slotId: 's',
        providerImplementationIds: Array.from({ length: run.providers }, () => 'a/p') });
    }
  }
  return { declarations, profile: {
    kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'a/f',
    roots: ['a/c'],
    selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
    bindings,
  } };
}

export function materializeDuplicateRecordResource(caseId) {
  if (arguments.length !== 1 || typeof caseId !== 'string') {
    throw new Error('Expected one closed resource case ID');
  }
  const index = duplicateRecordResourceRecipes.findIndex(recipe => recipe.caseId === caseId);
  if (index < 0) throw new Error(`Unknown closed resource case: ${caseId}`);
  const parameters = structuredClone(duplicateRecordResourceRecipes[index].parameters);
  return {
    caseId, entryPoint: 'compileCompositionV1', proposedOnly: true,
    source: duplicateRecordResourceSource, parameters,
    input: constructInput(parameters), expected: structuredClone(expectedResults[index]),
  };
}

// Fresh, mutable, caller-owned trees on every expansion, including repeated rows.
export function* duplicateRecordResourceCases() {
  if (arguments.length !== 0) throw new Error('The closed resource generator takes no parameters');
  for (const { caseId } of duplicateRecordResourceRecipes) {
    yield materializeDuplicateRecordResource(caseId);
  }
}
