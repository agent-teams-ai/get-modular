// Fixture consistency only: no production imports, compiler calls, filesystem
// fixtures, accepted-authority edits, or M2 acceptance claims.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import canonicalize from 'canonicalize';
import { canonicalize as secondCanonicalize } from 'json-canonicalize';
import { meterJsonResources } from '../support/resource-profile-v2.mjs';
import {
  duplicateRecordResourceSource, duplicateRecordResourcePolicy,
  duplicateRecordResourceRecipes, duplicateRecordResourceStream,
  materializeDuplicateRecordResource, duplicateRecordResourceCases,
} from './duplicate-record-resources.mjs';

const source = '51ca2bf68ac311b8bd0af101eaa9e8df1a4ac564';
const root = new URL('../../../', import.meta.url);
const artifacts = [
  ['architecture/contracts/v1/composition.schema.json',
    '2b4ad547782fa36748fa937f8fe9896da3c022c3e78e68c8edc06c47ffe36562'],
  ['architecture/qualification/v1/diagnostic-contract.json',
    '3f7d8a7a4a5a9d7b54f72d5e0915df3e437ab056107ab50294fa65a8e69b6c94'],
  ['architecture/contracts/v1/diagnostic-catalog.json',
    'd59875576b4619dd01713bf108db14144030e30d8f0245e35f80c73563a4ca96'],
  ['architecture/qualification/v1/resource-profile-v2.json',
    '9cc605e8a5b6b9553c4c12c1355eaf033daae8b7ecf000f7a159d88262c0674c'],
  ['architecture/qualification/v1/resource-boundary-vectors.json',
    'e33d0890b4b6a398b2f79c262ab5ec79dde02ac7ef7600e321dd32b42dc8a24d'],
  ['docs/decisions/0014-close-duplicate-binding-record-semantics.md',
    'eb071dcbd4d766ff65f8fb08635e3b4a7613c7f4cba38b00ec1047b2e81d9e6a'],
];
const artifactBytes = await Promise.all(artifacts.map(([path]) => readFile(new URL(path, root))));
const [schema, contract, catalog, resource, boundaries] = artifactBytes.slice(0, 5)
  .map(bytes => JSON.parse(bytes.toString('utf8')));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(schema);
const validateDeclaration = ajv.getSchema(`${schema.$id}#/$defs/moduleDeclaration`);
const validateProfile = ajv.getSchema(`${schema.$id}#/$defs/compositionProfile`);
const validateAcceptedDiagnostic = ajv.getSchema(`${schema.$id}#/$defs/diagnostic`);

// Separate in-memory candidate validator. The accepted schema stays unchanged;
// adding this one member does not create the generation-2 successor contract.
const candidateSchema = structuredClone(schema);
const candidateCodes = candidateSchema.$defs.diagnostic.properties.code.enum;
candidateCodes.splice(candidateCodes.indexOf('binding.duplicate'), 0, 'binding.duplicate-record');
const candidateAjv = new Ajv2020({ strict: true, allErrors: true });
candidateAjv.addSchema(candidateSchema);
const validateCandidateDiagnostic = candidateAjv.getSchema(`${candidateSchema.$id}#/$defs/diagnostic`);

// Independent literal recipe inventory, including two equal-valued resource
// limits whose JSON pointers must not be interchangeable.
const expectedRecipes = [
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
];

// Independent complete normalized result rows. These never come from an input
// analyzer, the materializer's expected object, or a compiler subject.
const expectedResults = [
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
];

// B, Einput, maximum independent many-row length, JSON value occurrences,
// aggregate UTF-8 bytes of all decoded object keys and string values.
const dimensionRows = [
  [65536, 0, 0, 262198, 3867154],
  [65537, 0, 0, 262202, 3867213],
  [256, 262144, 1024, 263222, 802066],
  [257, 262145, 1024, 263227, 802128],
  [2, 1025, 1024, 1087, 3723],
  [2, 1026, 1025, 1088, 3726],
];
const expectedHistograms = [
  [[0, 65536]], [[0, 65537]], [[1024, 256]],
  [[1, 1], [1024, 256]], [[1, 1], [1024, 1]], [[1, 1], [1025, 1]],
];
const schemaAdmitted = [true, false, true, true, true, false];
const coordinateKey = row => JSON.stringify([row.consumerImplementationId, row.slotId]);

function pointer(value, path) {
  assert.ok(path.startsWith('/'));
  // This closed pointer inventory needs no escapes or arbitrary traversal API.
  for (const segment of path.slice(1).split('/')) {
    assert.ok(Object.hasOwn(value, segment), `missing authority pointer ${path}`);
    value = value[segment];
  }
  return value;
}

function assertRecipeInventory(recipes) {
  assert.deepEqual(recipes, expectedRecipes, 'closed recipe inventory');
  assert.equal(new Set(recipes.map(recipe => recipe.caseId)).size, 6);
  for (const { parameters: p } of recipes) {
    assert.equal(p.resourcePointer, `/limits/${p.limitName}`);
    assert.equal(pointer(resource, p.resourcePointer), p.limit);
    const boundary = pointer(boundaries, p.boundaryPointer);
    assert.equal(boundary.limitName, p.limitName);
    assert.equal(boundary.at, p.limit);
    assert.equal(boundary.over, p.limit + 1);
    assert.equal(boundary.overOutcome, 'input.limit-exceeded');
    assert.equal(boundary.phase, contract.limitPhases[p.limitName]);
    assert.equal(p.actual, p.limit + (p.boundary === 'over' ? 1 : 0));
  }
}

function assertExpected(index, result) {
  assert.deepEqual(result, expectedResults[index], 'complete expected result');
  assert.deepEqual(Object.keys(result).sort(), ['diagnostics', 'ok']);
}

function expectedDimensions(index) {
  const [bindings, graphEdges, providersPerManySlot, jsonValueOccurrences, aggregateStringBytes] = dimensionRows[index];
  return {
    declarations: 2, capabilitiesPerDeclaration: 1, slotsPerDeclaration: 1,
    totalCapabilities: 1, totalSlots: 1, roots: 1, selections: 2,
    ownerPathSegments: 1, identifierBytes: 3, jsonDepth: 4, rejection: null,
    bindings, graphEdges, providersPerManySlot, jsonValueOccurrences, aggregateStringBytes,
    suppliedProviderOccurrences: graphEdges, bindingCoordinates: 1,
  };
}

// This observer counts occurrences, without validating providers or repairing
// records. Only the existing JSON resource meter is reused, not its graph meter.
function dimensions(input) {
  const { declarations, profile } = input;
  const selected = new Set(profile.selections.map(row => row.implementationId));
  const byImplementation = new Map(declarations.map(row => [row.implementationId, row]));
  let graphEdges = 0;
  let suppliedProviderOccurrences = 0;
  let providersPerManySlot = 0;
  let identifierBytes = 0;
  const id = value => { identifierBytes = Math.max(identifierBytes, Buffer.byteLength(value, 'utf8')); };
  id(profile.profileId);
  for (const declaration of declarations) {
    id(declaration.moduleId); id(declaration.implementationId); id(declaration.owner.authority);
    for (const segment of declaration.owner.path) id(segment);
    for (const capability of declaration.provides) {
      id(capability.capabilityId); id(capability.compatibility.token);
    }
    for (const slot of declaration.slots) {
      id(slot.slotId); id(slot.capabilityId); id(slot.compatibility.token);
    }
  }
  for (const rootId of profile.roots) id(rootId);
  for (const selection of profile.selections) { id(selection.moduleId); id(selection.implementationId); }
  for (const row of profile.bindings) {
    const count = row.providerImplementationIds.length;
    suppliedProviderOccurrences += count;
    if (selected.has(row.consumerImplementationId)) graphEdges += count;
    const slot = byImplementation.get(row.consumerImplementationId)?.slots.find(item => item.slotId === row.slotId);
    if (slot?.cardinality.kind === 'many') providersPerManySlot = Math.max(providersPerManySlot, count);
    id(row.consumerImplementationId); id(row.slotId);
    for (const provider of row.providerImplementationIds) id(provider);
  }
  return {
    ...meterJsonResources([...declarations, profile], resource.limits),
    declarations: declarations.length,
    capabilitiesPerDeclaration: Math.max(0, ...declarations.map(row => row.provides.length)),
    slotsPerDeclaration: Math.max(0, ...declarations.map(row => row.slots.length)),
    totalCapabilities: declarations.reduce((sum, row) => sum + row.provides.length, 0),
    totalSlots: declarations.reduce((sum, row) => sum + row.slots.length, 0),
    roots: profile.roots.length, selections: profile.selections.length,
    ownerPathSegments: Math.max(0, ...declarations.map(row => row.owner.path.length)),
    identifierBytes, bindings: profile.bindings.length, graphEdges, providersPerManySlot,
    suppliedProviderOccurrences,
    bindingCoordinates: new Set(profile.bindings.map(coordinateKey)).size,
  };
}

function assertDimensions(input, index) {
  assert.deepEqual(dimensions(input), expectedDimensions(index), 'resource dimensions');
}

// A second constructor for exactly these six worlds, independent of the
// materializer, its helpers, and its run parameters. This is not a compiler.
function independentInput(index) {
  assert.ok(Number.isInteger(index) && index >= 0 && index < 6);
  const providerRows = [];
  if (index < 2) {
    for (let ordinal = 0; ordinal < 65536 + index; ordinal += 1) providerRows.push([]);
  } else if (index < 4) {
    for (let ordinal = 0; ordinal < 256; ordinal += 1) providerRows.push(new Array(1024).fill('a/p'));
    if (index === 3) providerRows.push(['a/p']);
  } else {
    providerRows.push(new Array(index === 4 ? 1024 : 1025).fill('a/p'), ['a/p']);
  }
  return {
    declarations: [
      { kind: 'get-modular.module-declaration', schemaVersion: 1,
        moduleId: 'a/c', implementationId: 'a/c', owner: { authority: 't', path: ['t'] },
        provides: [], slots: [{ slotId: 's', capabilityId: 'a/k',
          compatibility: { family: 'exact', familyVersion: 1, token: 'a/k' },
          cardinality: { kind: 'many', min: 0, max: 1024, order: 'profile' } }],
      },
      { kind: 'get-modular.module-declaration', schemaVersion: 1,
        moduleId: 'a/p', implementationId: 'a/p', owner: { authority: 't', path: ['t'] },
        provides: [{ capabilityId: 'a/k', compatibility: { family: 'exact', familyVersion: 1, token: 'a/k' } }],
        slots: [],
      },
    ],
    profile: { kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'a/f',
      roots: ['a/c'], selections: [
        { moduleId: 'a/c', implementationId: 'a/c' },
        { moduleId: 'a/p', implementationId: 'a/p' },
      ],
      bindings: providerRows.map(providerImplementationIds => ({
        consumerImplementationId: 'a/c', slotId: 's', providerImplementationIds,
      })),
    },
  };
}

function independentCase(index) {
  const recipe = expectedRecipes[index];
  return { caseId: recipe.caseId, entryPoint: 'compileCompositionV1', proposedOnly: true,
    source, parameters: structuredClone(recipe.parameters), input: independentInput(index),
    expected: structuredClone(expectedResults[index]) };
}

function assertFrozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) assertFrozen(child);
  }
}

function assertFreshTree(value, seen) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(seen.has(value), false, 'no internal or cross-materialization object aliases');
  seen.add(value);
  assert.equal(Object.getPrototypeOf(value), Array.isArray(value) ? Array.prototype : Object.prototype);
  assert.equal(Object.isFrozen(value), false, 'materializations are caller-owned');
  for (const child of Object.values(value)) assertFreshTree(child, seen);
}

function assertDiagnosticRecords(result) {
  const ranks = [...catalog.ordering.codes];
  ranks.splice(ranks.indexOf('binding.duplicate'), 0, 'binding.duplicate-record');
  const phases = catalog.ordering.phases;
  for (const diagnostic of result.diagnostics) {
    assert.deepEqual(Object.keys(diagnostic).sort(), ['code', 'coordinate', 'details', 'path', 'phase']);
    assert.equal(validateCandidateDiagnostic(diagnostic), true, JSON.stringify(validateCandidateDiagnostic.errors));
    assert.equal(validateAcceptedDiagnostic(diagnostic), diagnostic.code !== 'binding.duplicate-record');
    const variant = diagnostic.code === 'binding.duplicate-record' ? {
      phases: ['binding'], coordinate: { required: ['implementationId', 'slotId'], allowed: ['implementationId', 'slotId'] },
      details: { required: ['reason'], reasonValues: ['duplicate'] },
    } : contract.variants.find(row => row.code === diagnostic.code);
    assert.ok(variant);
    assert.ok(variant.phases.includes(diagnostic.phase));
    assert.deepEqual(Object.keys(diagnostic.coordinate).sort(), [...variant.coordinate.required].sort());
    assert.deepEqual(Object.keys(diagnostic.coordinate).sort(), [...variant.coordinate.allowed].sort());
    assert.deepEqual(Object.keys(diagnostic.details).sort(), [...variant.details.required].sort());
    if (variant.details.reasonValues) assert.ok(variant.details.reasonValues.includes(diagnostic.details.reason));
    if (diagnostic.code === 'input.limit-exceeded') {
      const { limitName, limit, actual } = diagnostic.details;
      assert.equal(limit, resource.limits[limitName]);
      assert.equal(actual, limit + 1);
      assert.equal(diagnostic.phase, contract.limitPhases[limitName]);
      const policy = contract.limitPathPolicies[limitName];
      assert.ok(['empty', 'structural'].includes(policy));
      assert.equal(diagnostic.path.length === 0, policy === 'empty');
    } else {
      assert.deepEqual(diagnostic.path, []);
    }
  }
  assert.equal(new Set(result.diagnostics.map(row => canonicalize(row))).size, result.diagnostics.length);
  // These finite outcomes have distinct codes. Complete literals independently
  // fix every remaining axis; no general comparator is reimplemented here.
  for (let index = 1; index < result.diagnostics.length; index += 1) {
    const left = result.diagnostics[index - 1];
    const right = result.diagnostics[index];
    if (left.phase !== right.phase) assert.ok(phases.indexOf(left.phase) < phases.indexOf(right.phase));
    else assert.ok(ranks.indexOf(left.code) < ranks.indexOf(right.code));
  }
}

test('pins exact source, authorities, candidate labels and six ordered resource recipes', () => {
  assert.equal(duplicateRecordResourceSource, source);
  artifactBytes.forEach((bytes, index) => assert.equal(sha256(bytes), artifacts[index][1], artifacts[index][0]));
  assert.deepEqual(duplicateRecordResourcePolicy, {
    status: 'proposed-fixture-only', recommendation: 'A; owner selection not recorded',
    boundary: 'object', execution: 'fixture-consistency-only; no Core subject',
    envelope: 'inside object occurrence/string/depth admission',
    resource: { source, path: 'architecture/qualification/v1/resource-profile-v2.json',
      sha256: 'sha256:9cc605e8a5b6b9553c4c12c1355eaf033daae8b7ecf000f7a159d88262c0674c',
      profileId: 'get-modular/resource-profile/v1-standard', profileVersion: 2 },
    identityTokens: {
      consumerModuleId: 'a/c', consumerImplementationId: 'a/c',
      providerModuleId: 'a/p', providerImplementationId: 'a/p',
      capabilityId: 'a/k', compatibilityToken: 'a/k', profileId: 'a/f',
      slotId: 's', ownerAuthority: 't', ownerPath: ['t'],
    },
    duplicateRecord: { code: 'binding.duplicate-record', prerequisiteGroup: 'binding.record-census',
      prerequisites: ['document.schema-valid', 'binding.record-coordinate-census-complete'], suppressionScope: 'binding' },
    rawByteLimits: 'not applicable to these object invocations; no JSON entry point',
  });
  assert.equal(resource.profileId, duplicateRecordResourcePolicy.resource.profileId);
  assert.equal(resource.profileVersion, 2);
  assertRecipeInventory(duplicateRecordResourceRecipes);
  assertFrozen(duplicateRecordResourcePolicy);
  assertFrozen(duplicateRecordResourceRecipes);
  assertFrozen(duplicateRecordResourceStream);
  assert.deepEqual(catalog.ordering.codes, schema.$defs.diagnostic.properties.code.enum);
  assert.equal(catalog.ordering.codes.includes('binding.duplicate-record'), false);
  assert.equal(contract.prerequisiteCatalog.factModel.facts.length, 17);
});

test('rejects missing, extra, duplicate, reordered, off-by-one and wrong-resource recipes', () => {
  const clone = () => structuredClone(expectedRecipes);
  const mutants = [expectedRecipes.slice(1), [...expectedRecipes, structuredClone(expectedRecipes[0])]];
  const duplicate = clone(); duplicate[5] = structuredClone(duplicate[4]); mutants.push(duplicate);
  const reordered = clone(); [reordered[0], reordered[1]] = [reordered[1], reordered[0]]; mutants.push(reordered);
  const offByOne = clone(); offByOne[1].parameters.actual = 65538; mutants.push(offByOne);
  const wrongLimit = clone(); wrongLimit[4].parameters.limit = 1023; mutants.push(wrongLimit);
  const wrongRun = clone(); wrongRun[2].parameters.runs[0].records = 255; mutants.push(wrongRun);
  const wrongRow = clone(); wrongRow[0].parameters.resourcePointer = '/limits/totalSlots'; mutants.push(wrongRow);
  // Equality of the numeric limits must not let a substituted row pass.
  assert.equal(resource.limits.bindings, resource.limits.totalSlots);
  const wrongBoundary = clone(); wrongBoundary[0].parameters.boundaryPointer = '/profileV2/cases/12'; mutants.push(wrongBoundary);
  for (const mutant of mutants) assert.throws(() => assertRecipeInventory(mutant), /closed recipe inventory/u);
  assert.throws(() => materializeDuplicateRecordResource('od006.resources.v1/bindings/65538'), /Unknown closed resource/u);
  assert.throws(() => materializeDuplicateRecordResource(expectedRecipes[0].caseId, {}), /one closed resource/u);
  assert.throws(() => [...duplicateRecordResourceCases({})], /takes no parameters/u);
});

test('every expansion is a complete fresh tree matching the independent finite constructor', () => {
  const acrossMaterializations = new WeakSet();
  const ids = [];
  let index = 0;
  for (const value of duplicateRecordResourceCases()) {
    ids.push(value.caseId);
    assert.deepEqual(Object.keys(value).sort(), ['caseId', 'entryPoint', 'expected', 'input', 'parameters', 'proposedOnly', 'source']);
    assert.deepEqual(value, independentCase(index));
    const again = materializeDuplicateRecordResource(value.caseId);
    assert.deepEqual(value, again);
    assertFreshTree(value, acrossMaterializations);
    assertFreshTree(again, acrossMaterializations);
    value.input.declarations[0].owner.path[0] = 'changed';
    value.input.profile.bindings[0].providerImplementationIds.push('a/x');
    value.parameters.runs[0].records += 1;
    value.expected.diagnostics[0].details.changed = true;
    assert.deepEqual(again, independentCase(index));
    index += 1;
  }
  assert.equal(index, 6);
  assert.deepEqual(ids, expectedRecipes.map(row => row.caseId));
  assertRecipeInventory(duplicateRecordResourceRecipes);
});

test('calculates all independent object and semantic dimensions without an unrelated overflow', () => {
  const rawOnly = ['declarationRawDocumentBytes', 'profileRawDocumentBytes', 'aggregateRawBytes'];
  for (let index = 0; index < 6; index += 1) {
    const value = materializeDuplicateRecordResource(expectedRecipes[index].caseId);
    const input = value.input;
    const observed = dimensions(input);
    assertDimensions(input, index);
    const [records, references, , occurrences, strings] = dimensionRows[index];
    // Consumer=23 values/214 string bytes; provider=17/170;
    // profile excluding binding rows=14/146. Every binding adds 4/59,
    // and every three-byte provider reference adds 1/3, even when repeated.
    assert.equal(occurrences, 54 + 4 * records + references);
    assert.equal(strings, 530 + 59 * records + 3 * references);
    const declarationCounts = meterJsonResources(input.declarations, resource.limits);
    assert.equal(declarationCounts.jsonValueOccurrences, 40);
    assert.equal(declarationCounts.aggregateStringBytes, 384);
    const emptyProfileCounts = meterJsonResources([{ ...input.profile, bindings: [] }], resource.limits);
    assert.equal(emptyProfileCounts.jsonValueOccurrences, 14);
    assert.equal(emptyProfileCounts.aggregateStringBytes, 146);
    // The invocation wrapper and outer declaration list are not documents.
    const withWrapper = meterJsonResources([input], resource.limits);
    assert.equal(withWrapper.jsonValueOccurrences, occurrences + 2);
    assert.equal(withWrapper.aggregateStringBytes, strings + 19);
    assert.equal(withWrapper.jsonDepth, 6);

    // Both selected implementations are distinct. The only possible raw edge
    // is c->p and p has no slots, so even a subgraph retaining invalid rows
    // could have depth at most two. The eligible repeated-group graph has no
    // edges; its depth, when graph prerequisites are available, is one.
    assert.deepEqual(input.profile.selections, [
      { moduleId: 'a/c', implementationId: 'a/c' }, { moduleId: 'a/p', implementationId: 'a/p' },
    ]);
    assert.deepEqual(input.declarations[1].slots, []);
    for (const row of input.profile.bindings) {
      assert.equal(row.consumerImplementationId, 'a/c');
      assert.equal(row.slotId, 's');
      for (const provider of row.providerImplementationIds) assert.equal(provider, 'a/p');
    }
    const graphDepthUpperBound = references === 0 ? 1 : 2;
    const bounded = { ...observed, graphDepth: graphDepthUpperBound,
      diagnostics: value.expected.diagnostics.length,
      diagnosticPathSegments: Math.max(...value.expected.diagnostics.map(row => row.path.length)) };
    assert.equal(observed[value.parameters.limitName], value.parameters.actual);
    for (const [name, limit] of Object.entries(resource.limits)) {
      if (rawOnly.includes(name)) continue;
      assert.ok(Object.hasOwn(bounded, name), `unaccounted resource ${name}`);
      if (name === value.parameters.limitName) {
        assert.equal(bounded[name] > limit, value.parameters.boundary === 'over');
      } else {
        assert.ok(bounded[name] <= limit, `unrelated ${name} overflow in ${value.caseId}`);
      }
    }
    assert.ok(observed.jsonValueOccurrences < resource.limits.jsonValueOccurrences);
    assert.ok(observed.aggregateStringBytes < resource.limits.aggregateStringBytes);
    assert.ok(observed.jsonDepth < resource.limits.jsonDepth);
    // No JSON.stringify byte length is used as an object resource or raw-byte
    // admission claim. The raw entry point is absent from this generator.
    assert.equal(value.entryPoint, 'compileCompositionV1');
  }
});

test('only the named structural maximum fails schema at bindings+1 and many+1', () => {
  for (let index = 0; index < 6; index += 1) {
    const { input } = materializeDuplicateRecordResource(expectedRecipes[index].caseId);
    for (const declaration of input.declarations) {
      assert.equal(validateDeclaration(declaration), true, JSON.stringify(validateDeclaration.errors));
    }
    assert.equal(validateProfile(input.profile), schemaAdmitted[index]);
    if (schemaAdmitted[index]) continue;
    const location = index === 1 ? '/bindings' : '/bindings/0/providerImplementationIds';
    const limit = index === 1 ? 65536 : 1024;
    assert.deepEqual(validateProfile.errors.map(({ keyword, instancePath, params }) => ({ keyword, instancePath, params })),
      [{ keyword: 'maxItems', instancePath: location, params: { limit } }]);
    const repaired = structuredClone(input.profile);
    if (index === 1) repaired.bindings.pop();
    else repaired.bindings[0].providerImplementationIds.pop();
    assert.equal(validateProfile(repaired), true, JSON.stringify(validateProfile.errors));
    assert.equal(repaired.bindings.length > 1, true, 'repair does not remove repeated coordinates');
  }
});

test('counts selected-consumer references before validation and meters each many row independently', () => {
  for (let index = 0; index < 6; index += 1) {
    const { input } = materializeDuplicateRecordResource(expectedRecipes[index].caseId);
    const histogram = new Map();
    for (const row of input.profile.bindings) {
      const length = row.providerImplementationIds.length;
      histogram.set(length, (histogram.get(length) ?? 0) + 1);
      assert.equal(new Set(row.providerImplementationIds).size, length === 0 ? 0 : 1);
    }
    assert.deepEqual([...histogram].sort((left, right) => left[0] - right[0]), expectedHistograms[index]);
    assert.equal(new Set(input.profile.bindings.map(coordinateKey)).size, 1);
    assert.ok(input.profile.bindings.length > 1);
  }
  const many = dimensions(independentInput(4));
  assert.equal(many.graphEdges, 1025);
  assert.equal(many.providersPerManySlot, 1024, 'two many rows are not concatenated for a resource count');
  const graph = dimensions(independentInput(3));
  assert.equal(graph.graphEdges, 262145);
  assert.equal(graph.providersPerManySlot, 1024);

  // Small mutations of a finite world test the observer, not additional
  // generator cases or compiler expectations. Lookup failure cannot erase
  // provider occurrences belonging to a selected consumer.
  const probe = independentInput(2);
  probe.profile.bindings[0].providerImplementationIds[0] = 'a/x';
  assert.equal(dimensions(probe).graphEdges, 262144, 'unknown provider is still an occurrence');
  probe.profile.bindings[0].slotId = 'x';
  assert.equal(dimensions(probe).graphEdges, 262144, 'unknown slot does not erase selected-consumer references');
  probe.profile.bindings[0].consumerImplementationId = 'a/x';
  assert.equal(dimensions(probe).graphEdges, 261120, 'only selected-consumer rows enter Einput');
  assert.equal(dimensions(probe).suppliedProviderOccurrences, 262144);
});

test('rejects dedup-before-count mutants by independent numeric dimensions before any hashing', () => {
  for (let index = 0; index < 6; index += 1) {
    const original = independentInput(index);
    const target = expectedRecipes[index].parameters.limitName;
    const mutant = structuredClone(original);
    if (target === 'providersPerManySlot') {
      for (const row of mutant.profile.bindings) row.providerImplementationIds = [...new Set(row.providerImplementationIds)];
    } else {
      const firstByCoordinate = new Map();
      for (const row of mutant.profile.bindings) {
        if (!firstByCoordinate.has(coordinateKey(row))) firstByCoordinate.set(coordinateKey(row), row);
      }
      mutant.profile.bindings = [...firstByCoordinate.values()];
    }
    assert.notEqual(dimensions(mutant)[target], expectedRecipes[index].parameters.actual);
    assert.throws(() => assertDimensions(mutant, index), /resource dimensions/u);
    assertDimensions(original, index);
  }
  const providerDedup = independentInput(3);
  for (const row of providerDedup.profile.bindings) row.providerImplementationIds = [...new Set(row.providerImplementationIds)];
  assert.equal(dimensions(providerDedup).graphEdges, 257);
  assert.throws(() => assertDimensions(providerDedup, 3), /resource dimensions/u);
  // A valid-edge-only counter would see zero after group invalidation, while
  // independently pinned supplied occurrences still require 262145.
  const observed = dimensions(independentInput(3));
  assert.throws(() => assert.deepEqual({ ...observed, graphEdges: 0 }, expectedDimensions(3),
    'resource dimensions'), /resource dimensions/u);
});

test('pins resource prerequisites, full ordered failures and repeated-group suppression witnesses', () => {
  const limitRows = contract.prerequisiteCatalog.limits;
  for (const [name, group, prerequisites, scope] of [
    ['bindings', 'profile.binding-count', ['document.decoded'], 'profile'],
    ['graphEdges', 'graph.edge-count', ['profile.selection-census-complete'], 'graph'],
    ['providersPerManySlot', 'binding.provider-count', ['binding.consumer-census-complete', 'binding.slot-census-complete'], 'binding'],
  ]) {
    assert.deepEqual(limitRows.find(row => row.limitName === name), {
      limitName: name, prerequisiteGroup: group, prerequisites, suppressionScope: scope,
    });
  }
  for (const code of ['binding.duplicate', 'binding.cardinality']) {
    assert.deepEqual(contract.prerequisiteCatalog.diagnostics.find(row => row.code === code).prerequisites,
      ['document.schema-valid', 'binding.consumer-census-complete', 'binding.slot-census-complete']);
  }
  assert.deepEqual(contract.prerequisiteCatalog.diagnostics.find(row => row.code === 'profile.unreachable-selection').prerequisites,
    ['profile.root-census-complete', 'profile.selection-census-complete', 'binding.reached-frontier-complete', 'graph.selected-node-census-complete']);

  for (let index = 0; index < 6; index += 1) {
    const value = materializeDuplicateRecordResource(expectedRecipes[index].caseId);
    assertExpected(index, value.expected);
    assertDiagnosticRecords(value.expected);
    const { declarations, profile } = value.input;
    assert.deepEqual(profile.roots, ['a/c']);
    assert.deepEqual(declarations[0].slots, [{ slotId: 's', capabilityId: 'a/k',
      compatibility: { family: 'exact', familyVersion: 1, token: 'a/k' },
      cardinality: { kind: 'many', min: 0, max: 1024, order: 'profile' } }]);
    assert.deepEqual(declarations[1].provides, [{ capabilityId: 'a/k',
      compatibility: { family: 'exact', familyVersion: 1, token: 'a/k' } }]);
    assert.deepEqual(declarations[1].slots, []);
    assert.ok(profile.bindings.length > 1);
    assert.deepEqual([...new Set(profile.bindings.map(coordinateKey))], [JSON.stringify(['a/c', 's'])]);
    if (schemaAdmitted[index]) {
      // There is exactly one repeated group and no other binding coordinate.
      // Hence every reference is excluded from the positive graph. The reached
      // root's frontier is incomplete, so p cannot produce an unproved
      // unreachable-selection diagnostic. No edge can prove an SCC.
      const groupReferences = profile.bindings.reduce((sum, row) => sum + row.providerImplementationIds.length, 0);
      assert.equal(groupReferences, dimensionRows[index][1]);
      const referencesOutsideGroup = profile.bindings.filter(row => coordinateKey(row) !== JSON.stringify(['a/c', 's']))
        .reduce((sum, row) => sum + row.providerImplementationIds.length, 0);
      assert.equal(referencesOutsideGroup, 0);
      assert.equal(value.expected.diagnostics.filter(row => row.code === 'binding.duplicate-record').length, 1);
      for (const row of profile.bindings) assert.ok(row.providerImplementationIds.length <= 1024);
      assert.equal(value.expected.diagnostics.some(row => row.code === 'binding.cardinality'), false);
    } else {
      // A resource-only count remains independently provable from the decoded
      // container and known consumer/slot. The invalid profile cannot satisfy
      // document.schema-valid for duplicate-record, duplicate-provider, or the
      // length-1025 row's cardinality derivative. No group census is claimed.
      assert.equal(value.expected.diagnostics.length, 1);
      assert.equal(value.expected.diagnostics[0].code, 'input.limit-exceeded');
    }
    assert.equal(value.expected.diagnostics.some(row => ['profile.unreachable-selection', 'graph.cycle', 'diagnostics.truncated'].includes(row.code)), false);
    assert.equal(Object.hasOwn(value.expected, 'plan'), false);
    assert.equal(Object.hasOwn(value.expected, 'digest'), false);
  }
  // Graph overflow is graph-scoped, not a global earlier-phase stop barrier.
  assert.deepEqual(expectedResults[3].diagnostics.map(row => row.phase), ['binding', 'binding', 'graph']);
  assert.equal(expectedResults[3].diagnostics[1].code, 'binding.duplicate');
  for (const index of [0, 2, 4]) assert.equal(expectedResults[index].ok, false);
});

test('rejects wrong normalized records, ordering, partial matches and fabricated success output', () => {
  const mutations = [
    result => { result.diagnostics[0].coordinate.slotId = 'x'; },
    result => { delete result.diagnostics[0].coordinate.slotId; },
    result => { result.diagnostics[0].details.count = 256; },
    result => { result.diagnostics[0].path = [{ kind: 'index', value: 0 }]; },
    result => { result.diagnostics[0].code = 'binding.duplicate'; },
    result => { result.diagnostics.reverse(); },
    result => { result.diagnostics.pop(); },
    result => { result.diagnostics.push(structuredClone(result.diagnostics[0])); },
    result => { result.diagnostics[2].details.actual = 262144; },
    result => { result.diagnostics = result.diagnostics.map(({ code }) => ({ code })); },
    result => { result.ok = true; },
    result => { result.plan = {}; },
    result => { result.digest = 'fabricated'; },
  ];
  for (const mutate of mutations) {
    const mutant = structuredClone(expectedResults[3]);
    mutate(mutant);
    assert.throws(() => assertExpected(3, mutant), /complete expected result/u);
  }
  const extraDerivative = structuredClone(expectedResults[5]);
  extraDerivative.diagnostics.push(structuredClone(expectedResults[4].diagnostics[0]));
  assert.throws(() => assertExpected(5, extraDerivative), /complete expected result/u);
});

test('independently reconstructs and dual-JCS hashes exactly six complete ordered case rows', t => {
  assert.deepEqual(duplicateRecordResourceStream, {
    generatorId: 'od006.resources.v1', rowCount: 6,
    order: 'duplicateRecordResourceRecipes array order',
    encoding: 'RFC8785 complete case UTF-8 followed by one LF per case',
    hashAlgorithm: 'SHA-256',
    digestCustody: 'test emits an observation for retention; no precomputed digest claimed',
  });
  assertRecipeInventory(duplicateRecordResourceRecipes);
  const firstHash = createHash('sha256');
  const secondHash = createHash('sha256');
  const ids = [];
  let count = 0;
  for (const actual of duplicateRecordResourceCases()) {
    assert.ok(count < 6, 'no extra stream row');
    const independent = independentCase(count);
    assert.deepEqual(actual, independent);
    assertExpected(count, actual.expected);
    assertDimensions(actual.input, count);
    const firstBytes = canonicalize(actual);
    const secondBytes = secondCanonicalize(independent);
    assert.equal(firstBytes, secondBytes, 'independent JCS implementations must agree before hashing');
    firstHash.update(firstBytes, 'utf8').update('\n', 'utf8');
    secondHash.update(secondBytes, 'utf8').update('\n', 'utf8');
    ids.push(actual.caseId);
    count += 1;
  }
  assert.equal(count, 6);
  assert.deepEqual(ids, expectedRecipes.map(row => row.caseId));
  const digest = firstHash.digest('hex');
  assert.equal(digest, secondHash.digest('hex'));
  assert.equal(digest.length, 64);
  // This is an execution-time observation for main to retain, not a fabricated
  // checked-in hash, successor ledger, production result, or acceptance claim.
  t.diagnostic(JSON.stringify({ scope: 'proposed-fixture-consistency-only', source,
    generatorId: 'od006.resources.v1', rowCount: count,
    serialization: 'RFC8785 complete case UTF-8 plus LF', sha256: `sha256:${digest}` }));
});
