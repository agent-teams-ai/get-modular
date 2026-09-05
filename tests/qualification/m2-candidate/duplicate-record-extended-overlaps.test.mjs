// Proposed fixture consistency only. This file imports no Core subject and
// never executes compileCompositionV1. Its assertions are not M2 acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import canonicalize from 'canonicalize';
import { canonicalize as secondCanonicalize } from 'json-canonicalize';
import { extendedOverlapSource, extendedOverlapPolicy, extendedOverlapRecipes,
  materializeDuplicateRecordExtendedOverlap, duplicateRecordExtendedOverlapCases,
} from './duplicate-record-extended-overlaps.mjs';

const root = new URL('../../../', import.meta.url);
const paths = [
  'architecture/contracts/v1/composition.schema.json',
  'architecture/qualification/v1/diagnostic-contract.json',
  'architecture/contracts/v1/diagnostic-catalog.json',
  'architecture/qualification/v1/resource-profile-v2.json',
];
const sourceBytes = await Promise.all(paths.map(path => readFile(new URL(path, root))));
const [schema, contract, catalog, resource] = sourceBytes.map(bytes => JSON.parse(bytes.toString('utf8')));
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(schema);
const validateDeclaration = ajv.getSchema(`${schema.$id}#/$defs/moduleDeclaration`);
const validateProfile = ajv.getSchema(`${schema.$id}#/$defs/compositionProfile`);
const validateAcceptedDiagnostic = ajv.getSchema(`${schema.$id}#/$defs/diagnostic`);

// An in-memory allowance for this one proposed member, in a separate validator.
// This is not a complete generation-2 schema/catalog or an accepted authority.
const proposedSchema = structuredClone(schema);
const proposedCodes = proposedSchema.$defs.diagnostic.properties.code.enum;
proposedCodes.splice(proposedCodes.indexOf('binding.duplicate'), 0, 'binding.duplicate-record');
const proposedAjv = new Ajv2020({ strict: true, allErrors: true });
proposedAjv.addSchema(proposedSchema);
const validateCandidateDiagnostic = proposedAjv.getSchema(`${proposedSchema.$id}#/$defs/diagnostic`);

const prefix = 'od006.extended-overlap.v1/';
const c = 'example/c/default';
const p = 'example/p/default';
const q = 'example/q/default';
const a = 'example/a/default';
const b = 'example/b/default';
const link = { family: 'exact', familyVersion: 1, token: 'example/link' };
const at = suffix => materializeDuplicateRecordExtendedOverlap(`${prefix}${suffix}`);
const nodeId = index => `example/n${String(index).padStart(4, '0')}/default`;
const key = row => JSON.stringify([row.consumerImplementationId, row.slotId]);
const edgeOrder = edges => edges.map(edge => JSON.stringify(edge)).sort();
const invocationInputs = value => value.input ? [value.input] : [value.inputs.forward, value.inputs.reverse];

// Deliberately separate literal inventory: removing, inserting, reordering or
// changing a recipe must fail, without treating a stream hash as semantic proof.
const expectedRecipes = [
  ['many-row-dedup', { kind: 'many-reasons', min: 1, max: 2,
    providerRows: [[], ['p', 'p', 'p'], ['p', 'p', 'p']] }],
  ['malformed-consumer-coordinate', { kind: 'malformed-coordinate',
    field: 'consumerImplementationId', value: 7, rows: [3, 4] }],
  ['malformed-slot-coordinate', { kind: 'malformed-coordinate', field: 'slotId', value: 7, rows: [3, 4] }],
  ['schema-invalid-profile', { kind: 'schema-invalid-profile', field: 'unlisted', value: true }],
  ['same-consumer-second-slot', { kind: 'second-slot', recordCount: 2 }],
  ['pair-none-2048', { kind: 'pair-depth', chainLength: 2048, attachment: 'none' }],
  ['pair-none-2049', { kind: 'pair-depth', chainLength: 2049, attachment: 'none' }],
  ['pair-cycle-consumes-chain-2048', { kind: 'pair-depth', chainLength: 2048, attachment: 'cycle-consumes-chain' }],
  ['pair-cycle-consumes-chain-2049', { kind: 'pair-depth', chainLength: 2049, attachment: 'cycle-consumes-chain' }],
  ['pair-chain-consumes-cycle-2048', { kind: 'pair-depth', chainLength: 2048, attachment: 'chain-consumes-cycle' }],
  ['pair-chain-consumes-cycle-2049', { kind: 'pair-depth', chainLength: 2049, attachment: 'chain-consumes-cycle' }],
  ['self-bridge-1024-1025', { kind: 'self-bridge', chainLength: 2049, splitAfter: 1024 }],
  ['ordered-many-reversal', { kind: 'ordered-many-reversal', min: 1, max: 2,
    forward: ['p', 'q'], reverse: ['q', 'p'] }],
].map(([suffix, parameters]) => ({ caseId: `${prefix}${suffix}`, parameters }));

function assertFrozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) assertFrozen(child);
  }
}

function objectsIn(value, seen = new Set()) {
  if (value !== null && typeof value === 'object') {
    assert.equal(seen.has(value), false, 'each input is a tree without internal object aliases');
    seen.add(value);
    assert.equal(Object.getPrototypeOf(value), Array.isArray(value) ? Array.prototype : Object.prototype);
    assert.equal(Object.getOwnPropertySymbols(value).length, 0);
    for (const name of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      assert.equal(Object.hasOwn(descriptor, 'value'), true);
      if (!(Array.isArray(value) && name === 'length')) assert.equal(descriptor.enumerable, true);
    }
    if (Array.isArray(value)) for (let index = 0; index < value.length; index += 1) {
      assert.equal(Object.hasOwn(value, index), true);
    }
    for (const child of Object.values(value)) objectsIn(child, seen);
  }
  return seen;
}

function countValues(value) {
  return 1 + (value !== null && typeof value === 'object'
    ? Object.values(value).reduce((sum, child) => sum + countValues(child), 0) : 0);
}

function maximumValueDepth(value) {
  if (value === null || typeof value !== 'object') return 1;
  return 1 + Math.max(0, ...Object.values(value).map(maximumValueDepth));
}

// Exact JSON value occurrences here count object/array/scalar values, not keys.
// The separate encoded-size upper bound also covers keys and invocation wrapping.
function dimensions(input) {
  const declarations = input.declarations;
  const profile = input.profile;
  return [declarations.length, profile.selections.length, profile.roots.length,
    declarations.reduce((sum, item) => sum + item.slots.length, 0),
    profile.bindings.length,
    profile.bindings.reduce((sum, row) => sum + row.providerImplementationIds.length, 0),
    new Set(profile.bindings.map(key)).size,
    declarations.reduce((sum, item) => sum + countValues(item), countValues(profile))];
}

// Columns: declarations, selections, roots, slots, binding occurrences,
// provider occurrences, raw coordinate pairs, document JSON value occurrences.
// A malformed raw pair is not a schema-admitted semantic coordinate.
const expectedDimensions = [
  [2, 2, 1, 1, 3, 6, 1, 78],
  [2, 2, 1, 1, 5, 6, 2, 86],
  [2, 2, 1, 1, 5, 6, 2, 86],
  [2, 2, 1, 1, 3, 6, 1, 79],
  [3, 3, 1, 4, 5, 5, 4, 129],
  [2051, 2051, 3, 2050, 2051, 2051, 2050, 69735],
  [2052, 2052, 3, 2051, 2052, 2052, 2051, 69769],
  [2051, 2051, 3, 2051, 2052, 2052, 2051, 69749],
  [2052, 2052, 3, 2052, 2053, 2053, 2052, 69783],
  [2051, 2051, 3, 2051, 2052, 2052, 2051, 69749],
  [2052, 2052, 3, 2052, 2053, 2053, 2052, 69783],
  [2051, 2051, 2, 2051, 2052, 2052, 2051, 69748],
  [3, 3, 1, 1, 1, 2, 1, 86],
];

// Independent literal expected records. No input analysis generates diagnostics.
const duplicate = { code: 'binding.duplicate-record', phase: 'binding', path: [],
  coordinate: { implementationId: c, slotId: 'dependency' }, details: { reason: 'duplicate' } };
const duplicateProvider = { code: 'binding.duplicate', phase: 'binding', path: [],
  coordinate: { implementationId: c, slotId: 'dependency', providerImplementationId: p },
  details: { reason: 'duplicate' } };
const cardinalityZero = { code: 'binding.cardinality', phase: 'binding', path: [],
  coordinate: { implementationId: c, slotId: 'dependency' },
  details: { expectedCardinality: 'many', actualCardinality: 0 } };
const cardinalityThree = { code: 'binding.cardinality', phase: 'binding', path: [],
  coordinate: { implementationId: c, slotId: 'dependency' },
  details: { expectedCardinality: 'many', actualCardinality: 3 } };
const pairCycle = { code: 'graph.cycle', phase: 'graph', path: [], coordinate: {}, details: { component: [a, b] } };
const selfCycle = { code: 'graph.cycle', phase: 'graph', path: [], coordinate: {}, details: { component: [a] } };
const localCycle = { code: 'graph.cycle', phase: 'graph', path: [], coordinate: {}, details: { component: [c, q] } };
const depthOverflow = { code: 'input.limit-exceeded', phase: 'graph', path: [], coordinate: {},
  details: { limitName: 'graphDepth', limit: 2048, actual: 2049 } };
const typeFailure = (index, field) => ({ code: 'schema.invalid-value', phase: 'schema',
  path: [{ kind: 'field', value: 'profile' }, { kind: 'field', value: 'bindings' },
    { kind: 'index', value: index }, { kind: 'field', value: field }],
  coordinate: {}, details: { reason: 'invalid-type' } });
const expectedDiagnosticArrays = [
  [duplicate, duplicateProvider, cardinalityZero, cardinalityThree],
  [typeFailure(3, 'consumerImplementationId'), typeFailure(4, 'consumerImplementationId')],
  [typeFailure(3, 'slotId'), typeFailure(4, 'slotId')],
  [{ code: 'schema.unknown-field', phase: 'schema', path: [{ kind: 'field', value: 'profile' }],
    coordinate: {}, details: { reason: 'unknown-field' } }],
  [duplicate, localCycle],
  [duplicate, pairCycle],
  [duplicate, depthOverflow, pairCycle],
  [duplicate, pairCycle],
  [duplicate, depthOverflow, pairCycle],
  [duplicate, pairCycle],
  [duplicate, depthOverflow, pairCycle],
  [duplicate, selfCycle],
];

function assertAllowedDiagnostics(diagnostics) {
  const variants = new Map(contract.variants.map(item => [item.code, item]));
  variants.set('binding.duplicate-record', {
    phases: ['binding'], coordinate: {
      required: ['implementationId', 'slotId'], allowed: ['implementationId', 'slotId'],
    }, details: { required: ['reason'], reasonValues: ['duplicate'] },
  });
  const codeRank = [...catalog.ordering.codes];
  codeRank.splice(codeRank.indexOf('binding.duplicate'), 0, 'binding.duplicate-record');
  const phases = schema.$defs.diagnostic.properties.phase.enum;
  for (const item of diagnostics) {
    assert.deepEqual(Object.keys(item).sort(), ['code', 'coordinate', 'details', 'path', 'phase']);
    assert.equal(validateCandidateDiagnostic(item), true, JSON.stringify(validateCandidateDiagnostic.errors));
    assert.equal(validateAcceptedDiagnostic(item), item.code !== 'binding.duplicate-record');
    const variant = variants.get(item.code);
    assert.ok(variant, 'only an accepted emittable member or the one proposed member is allowed');
    assert.ok(variant.phases.includes(item.phase));
    assert.deepEqual(Object.keys(item.coordinate).sort(), [...variant.coordinate.required].sort());
    assert.deepEqual(Object.keys(item.coordinate).sort(), [...variant.coordinate.allowed].sort());
    assert.deepEqual(Object.keys(item.details).sort(), [...variant.details.required].sort());
    if (variant.details.reasonValues) assert.ok(variant.details.reasonValues.includes(item.details.reason));
    if (item.code === 'binding.duplicate-record' || contract.pathPolicyByCode[item.code] === 'empty') {
      assert.deepEqual(item.path, []);
    }
    assert.equal(contract.codeDisposition.reservedNonEmittable.includes(item.code), false);
  }
  assert.equal(new Set(diagnostics.map(item => canonicalize(item))).size, diagnostics.length);
  for (let index = 1; index < diagnostics.length; index += 1) {
    const left = diagnostics[index - 1];
    const right = diagnostics[index];
    if (left.phase !== right.phase) assert.ok(phases.indexOf(left.phase) < phases.indexOf(right.phase));
    else assert.ok(codeRank.indexOf(left.code) <= codeRank.indexOf(right.code));
  }
  // Equal-code path/detail order is independently pinned by the full arrays
  // above and by the explicit index and canonical-detail assertions below.
}

// Inspect only these schema-valid closed worlds. This is a construction witness,
// not a diagnostic generator, SCC implementation, depth algorithm or compiler.
// The sole excluded coordinate is explicitly identified by the test; all other
// rows must prove every positive local prerequisite before being called eligible.
function positiveRowWitness(input, excludeDuplicate = true) {
  const declarations = new Map(input.declarations.map(item => [item.implementationId, item]));
  assert.equal(declarations.size, input.declarations.length);
  assert.equal(new Set(input.declarations.map(item => item.moduleId)).size, declarations.size);
  const selected = new Map(input.profile.selections.map(item => [item.implementationId, item.moduleId]));
  assert.equal(selected.size, declarations.size);
  for (const declaration of declarations.values()) {
    assert.equal(selected.get(declaration.implementationId), declaration.moduleId);
    assert.deepEqual(declaration.provides, [{ capabilityId: 'example/link', compatibility: link }]);
    assert.deepEqual(declaration.owner, { authority: 'example', path: ['overlap'] });
    assert.equal(new Set(declaration.slots.map(item => item.slotId)).size, declaration.slots.length);
  }
  assert.equal(new Set(input.profile.roots).size, input.profile.roots.length);
  for (const root of input.profile.roots) assert.ok([...selected.values()].includes(root));
  const groups = new Map();
  for (const row of input.profile.bindings) {
    const consumer = declarations.get(row.consumerImplementationId);
    assert.ok(consumer);
    const slot = consumer.slots.find(item => item.slotId === row.slotId);
    assert.ok(slot);
    assert.equal(slot.capabilityId, 'example/link');
    assert.deepEqual(slot.compatibility, link);
    for (const provider of row.providerImplementationIds) {
      assert.ok(selected.has(provider));
      assert.deepEqual(declarations.get(provider).provides, [{ capabilityId: slot.capabilityId, compatibility: slot.compatibility }]);
    }
    if (!groups.has(key(row))) groups.set(key(row), []);
    groups.get(key(row)).push(row);
  }
  for (const declaration of declarations.values()) for (const slot of declaration.slots) {
    assert.ok(groups.has(JSON.stringify([declaration.implementationId, slot.slotId])), 'no missing binding coordinate');
  }
  const excludedKey = JSON.stringify([c, 'dependency']);
  const edges = [];
  const excluded = [];
  for (const [coordinate, rows] of groups) {
    if (excludeDuplicate && coordinate === excludedKey) {
      assert.ok(rows.length > 1);
      excluded.push(...rows);
      continue;
    }
    assert.equal(rows.length, 1);
    const row = rows[0];
    const cardinality = declarations.get(row.consumerImplementationId).slots.find(item => item.slotId === row.slotId).cardinality;
    const count = row.providerImplementationIds.length;
    if (cardinality.kind === 'required') assert.equal(count, 1);
    else {
      assert.deepEqual(cardinality, { kind: 'many', min: 1, max: 2, order: 'profile' });
      assert.ok(count >= 1 && count <= 2);
    }
    assert.equal(new Set(row.providerImplementationIds).size, count);
    for (const provider of row.providerImplementationIds) edges.push([row.consumerImplementationId, provider]);
  }
  assert.equal(excluded.length > 0, excludeDuplicate);
  return { edges, excluded, groups };
}

function assertAllRequired(input) {
  for (const declaration of input.declarations) for (const slot of declaration.slots) {
    assert.deepEqual(slot.cardinality, { kind: 'required' });
  }
  for (const row of input.profile.bindings) assert.equal(row.providerImplementationIds.length, 1);
}

function assertEdgeAbsent(edges, consumer, provider) {
  assert.equal(edges.some(edge => edge[0] === consumer && edge[1] === provider), false);
}

function consecutiveEdges(first, last) {
  const edges = [];
  for (let index = first + 1; index <= last; index += 1) edges.push([nodeId(index), nodeId(index - 1)]);
  return edges;
}

test('freezes the thirteen-case proposed domain and returns fresh caller-owned trees', () => {
  assert.equal(extendedOverlapSource, '730665ff7fe7e6c993dad8f98a437f849f49d4f5');
  assert.deepEqual(extendedOverlapRecipes, expectedRecipes);
  assertFrozen(extendedOverlapRecipes);
  assertFrozen(extendedOverlapPolicy);
  assert.deepEqual(extendedOverlapPolicy, {
    status: 'proposed-fixture-only', recommendation: 'A; owner selection not recorded',
    boundary: 'object', execution: 'fixture-consistency-only; no Core subject',
    envelope: 'inside object occurrence/string/depth admission',
    duplicateRecord: { code: 'binding.duplicate-record', prerequisiteGroup: 'binding.record-census',
      prerequisites: ['document.schema-valid', 'binding.record-coordinate-census-complete'], suppressionScope: 'binding' },
  });
  const cases = [...duplicateRecordExtendedOverlapCases()];
  assert.deepEqual(cases.map(item => item.caseId), expectedRecipes.map(item => item.caseId));
  assert.equal(new Set(cases.map(item => item.caseId)).size, 13);
  assert.equal(cases.flatMap(invocationInputs).length, 14);
  for (const value of cases) {
    assert.equal(value.proposedOnly, true);
    assert.equal(value.entryPoint, 'compileCompositionV1');
    const again = materializeDuplicateRecordExtendedOverlap(value.caseId);
    assert.deepEqual(value, again);
    const firstObjects = invocationInputs(value).flatMap(input => [...objectsIn(input)]);
    const secondObjects = new Set(invocationInputs(again).flatMap(input => [...objectsIn(input)]));
    assert.equal(new Set(firstObjects).size, firstObjects.length);
    for (const object of firstObjects) assert.equal(secondObjects.has(object), false);
    assert.notEqual(value.parameters, again.parameters);
    if (value.expected) {
      assert.notEqual(value.expected.diagnostics, again.expected.diagnostics);
      value.expected.diagnostics[0].details.changed = true;
      assert.equal(Object.hasOwn(again.expected.diagnostics[0].details, 'changed'), false);
    }
    invocationInputs(value)[0].declarations[0].owner.path[0] = 'changed';
    assert.equal(invocationInputs(again)[0].declarations[0].owner.path[0], 'overlap');
  }
  assert.throws(() => materializeDuplicateRecordExtendedOverlap(''), /Unknown closed/u);
  assert.throws(() => materializeDuplicateRecordExtendedOverlap(`${prefix}pair-none-2050`), /Unknown closed/u);
  assert.deepEqual(extendedOverlapRecipes, expectedRecipes);
});

test('binds unchanged accepted schema/rank prerequisites and exact complete candidate arrays', () => {
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  // Source custody only; these hashes are not semantic or execution evidence.
  assert.equal(digest(sourceBytes[0]), '2b4ad547782fa36748fa937f8fe9896da3c022c3e78e68c8edc06c47ffe36562');
  assert.equal(digest(sourceBytes[1]), '3f7d8a7a4a5a9d7b54f72d5e0915df3e437ab056107ab50294fa65a8e69b6c94');
  assert.deepEqual(catalog.ordering.codes, schema.$defs.diagnostic.properties.code.enum);
  assert.equal(catalog.ordering.codes.includes('binding.duplicate-record'), false);
  assert.equal(contract.prerequisiteCatalog.factModel.facts.length, 17);
  const graphPrerequisites = ['graph.selected-node-census-complete', 'graph.positive-edge-subgraph-complete'];
  assert.deepEqual(contract.prerequisiteCatalog.limits.find(item => item.limitName === 'graphDepth').prerequisites, graphPrerequisites);
  assert.deepEqual(contract.prerequisiteCatalog.diagnostics.find(item => item.code === 'graph.cycle').prerequisites, graphPrerequisites);
  for (const code of ['binding.duplicate', 'binding.cardinality']) assert.deepEqual(
    contract.prerequisiteCatalog.diagnostics.find(item => item.code === code).prerequisites,
    ['document.schema-valid', 'binding.consumer-census-complete', 'binding.slot-census-complete']);
  assert.deepEqual(contract.prerequisiteCatalog.diagnostics.find(item => item.code === 'profile.unreachable-selection').prerequisites,
    ['profile.root-census-complete', 'profile.selection-census-complete', 'binding.reached-frontier-complete', 'graph.selected-node-census-complete']);
  const failures = [...duplicateRecordExtendedOverlapCases()].filter(value => value.expected);
  assert.equal(failures.length, 12);
  failures.forEach((value, index) => {
    assert.deepEqual(Object.keys(value).sort(), ['caseId', 'entryPoint', 'expected', 'input', 'parameters', 'proposedOnly']);
    assert.deepEqual(value.expected, { ok: false, diagnostics: expectedDiagnosticArrays[index] });
    assertAllowedDiagnostics(value.expected.diagnostics);
  });
  const zeroBytes = canonicalize(cardinalityZero.details);
  const threeBytes = canonicalize(cardinalityThree.details);
  assert.equal(zeroBytes, '{"actualCardinality":0,"expectedCardinality":"many"}');
  assert.equal(threeBytes, '{"actualCardinality":3,"expectedCardinality":"many"}');
  assert.equal(secondCanonicalize(cardinalityZero.details), zeroBytes);
  assert.equal(secondCanonicalize(cardinalityThree.details), threeBytes);
  assert.ok(Buffer.compare(Buffer.from(zeroBytes), Buffer.from(threeBytes)) < 0);
});

test('pins exact construction sizes and keeps every invocation inside the object envelope', () => {
  assert.equal(resource.limits.jsonValueOccurrences, 2097152);
  assert.equal(resource.limits.aggregateStringBytes, 8388608);
  assert.equal(resource.limits.jsonDepth, 32);
  assert.equal(resource.limits.graphDepth, 2048);
  const cases = [...duplicateRecordExtendedOverlapCases()];
  cases.forEach((value, index) => {
    for (const input of invocationInputs(value)) {
      assert.deepEqual(dimensions(input), expectedDimensions[index], value.caseId);
      assert.equal(countValues(input), expectedDimensions[index][7] + 2);
      const documents = [...input.declarations, input.profile];
      assert.equal(Math.max(...documents.map(maximumValueDepth)), 5);
      assert.equal(maximumValueDepth(input), 7);
      for (const declaration of input.declarations) {
        assert.equal(validateDeclaration(declaration), true, JSON.stringify(validateDeclaration.errors));
        assert.ok(declaration.slots.length <= resource.limits.slotsPerDeclaration);
        assert.ok(declaration.provides.length <= resource.limits.capabilitiesPerDeclaration);
      }
      const shouldAdmitSchema = !['malformed-coordinate', 'schema-invalid-profile'].includes(value.parameters.kind);
      assert.equal(validateProfile(input.profile), shouldAdmitSchema);
      const [declarations, selections, roots, slots, bindings, references] = dimensions(input);
      assert.ok(declarations <= resource.limits.declarations);
      assert.ok(selections <= resource.limits.selections);
      assert.ok(roots <= resource.limits.roots);
      assert.ok(slots <= resource.limits.totalSlots);
      assert.ok(declarations <= resource.limits.totalCapabilities);
      assert.ok(bindings <= resource.limits.bindings);
      assert.ok(references <= resource.limits.graphEdges);
      for (const row of input.profile.bindings) assert.ok(row.providerImplementationIds.length <= resource.limits.providersPerManySlot);
      // These ASCII tree encodings upper-bound string bytes and value counts,
      // including keys/wrapper overhead. No raw-byte admission claim is made.
      const bound = Buffer.byteLength(JSON.stringify(input), 'utf8');
      assert.ok(bound < Math.min(resource.limits.aggregateStringBytes, resource.limits.jsonValueOccurrences));
      assert.ok(maximumValueDepth(input) < resource.limits.jsonDepth);
    }
  });
  // Independently counted required-slot pair recipe: 34*N + 103 + 14*attachment.
  assert.equal(34 * 2048 + 103, 69735);
  assert.equal(34 * 2049 + 103 + 14, 69783);
  // Split bridge: 2049 chain nodes, a, c; 2051 slots; 2052 supplied rows.
  assert.equal(34 * 2049 + 82, 69748);
});

test('many rows count all occurrences, deduplicate reasons and retain exactly four diagnostics', () => {
  const value = at('many-row-dedup');
  const rows = value.input.profile.bindings;
  assert.deepEqual(rows.map(row => row.providerImplementationIds), [[], [p, p, p], [p, p, p]]);
  assert.deepEqual(value.input.declarations[0].slots[0].cardinality, { kind: 'many', min: 1, max: 2, order: 'profile' });
  const witness = positiveRowWitness(value.input);
  assert.equal(witness.groups.size, 1);
  assert.equal(witness.excluded.length, 3);
  assert.deepEqual(witness.edges, []);
  assert.equal(rows.reduce((sum, row) => sum + row.providerImplementationIds.length, 0), 6);
  assert.deepEqual(rows.map(row => row.providerImplementationIds.length), [0, 3, 3]);
  assert.deepEqual(rows.map(row => new Set(row.providerImplementationIds).size), [0, 1, 1]);
  assert.deepEqual(value.input.profile.roots, ['example/c']);
  assert.deepEqual(value.input.profile.selections.map(item => item.implementationId), [c, p]);
  assert.deepEqual(value.expected.diagnostics, [duplicate, duplicateProvider, cardinalityZero, cardinalityThree]);
  // Both length-three rows justify the same provider coordinate and cardinality
  // detail. Deduplication follows occurrence counting. The reached c frontier
  // is incomplete, so the absent c->p edge cannot justify an unreachable error.
  assert.equal(value.expected.diagnostics.filter(item => item.code === 'binding.duplicate').length, 1);
  assert.deepEqual(value.expected.diagnostics.filter(item => item.code === 'binding.cardinality')
    .map(item => item.details.actualCardinality), [0, 3]);
});

test('malformed coordinate types and a schema-invalid profile suppress all profile semantic derivatives', () => {
  for (const [suffix, field] of [
    ['malformed-consumer-coordinate', 'consumerImplementationId'], ['malformed-slot-coordinate', 'slotId'],
  ]) {
    const value = at(suffix);
    const input = value.input.profile;
    assert.equal(validateProfile(input), false);
    assert.deepEqual(validateProfile.errors.map(({ keyword, instancePath, params }) => ({ keyword, instancePath, params })),
      [3, 4].map(index => ({ keyword: 'type', instancePath: `/bindings/${index}/${field}`, params: { type: 'string' } })));
    assert.deepEqual(input.bindings.slice(0, 3).map(row => row.providerImplementationIds), [[], [p, p, p], [p, p, p]]);
    assert.deepEqual(input.bindings.slice(0, 3).map(row => [row.consumerImplementationId, row.slotId]),
      [[c, 'dependency'], [c, 'dependency'], [c, 'dependency']]);
    for (const index of [3, 4]) {
      assert.equal(input.bindings[index][field], 7);
      assert.deepEqual(input.bindings[index].providerImplementationIds, []);
    }
    assert.deepEqual(value.expected.diagnostics, [typeFailure(3, field), typeFailure(4, field)]);
    assert.deepEqual(value.expected.diagnostics.map(item => item.path[2].value), [3, 4]);
    const repaired = structuredClone(input);
    repaired.bindings.splice(3, 2);
    assert.equal(validateProfile(repaired), true);
    // There remains a syntactically valid repeated c group in the original
    // document, but document.schema-valid is unavailable for semantic census.
    // No semantic graph is constructed from the original malformed profile.
    assert.equal(value.expected.diagnostics.some(item => item.phase !== 'schema'), false);
  }
  const value = at('schema-invalid-profile');
  assert.equal(validateProfile(value.input.profile), false);
  assert.deepEqual(validateProfile.errors.map(({ keyword, instancePath, params }) => ({ keyword, instancePath, params })),
    [{ keyword: 'additionalProperties', instancePath: '', params: { additionalProperty: 'unlisted' } }]);
  assert.deepEqual(value.input.profile.bindings.map(row => row.providerImplementationIds), [[], [p, p, p], [p, p, p]]);
  assert.deepEqual(value.expected.diagnostics, expectedDiagnosticArrays[3]);
  assert.deepEqual(value.expected.diagnostics[0].path, [{ kind: 'field', value: 'profile' }]);
  const repaired = structuredClone(value.input.profile);
  delete repaired.unlisted;
  assert.equal(validateProfile(repaired), true);
});

test('a valid second slot of the same consumer proves its own SCC while the first group has no edge', () => {
  const value = at('same-consumer-second-slot');
  assertAllRequired(value.input);
  const witness = positiveRowWitness(value.input);
  assert.deepEqual(value.input.profile.bindings.map(row => [row.consumerImplementationId, row.slotId, row.providerImplementationIds]), [
    [c, 'dependency', [p]], [c, 'dependency', [p]], [c, 'second', [q]], [p, 'back', [c]], [q, 'back', [c]],
  ]);
  assert.equal(witness.groups.size, 4);
  assert.equal(witness.excluded.length, 2);
  assert.deepEqual(edgeOrder(witness.edges), edgeOrder([[c, q], [p, c], [q, c]]));
  assertEdgeAbsent(witness.edges, c, p);
  assert.deepEqual(value.input.profile.roots, ['example/c']);
  assert.deepEqual(value.expected.diagnostics, [duplicate, localCycle]);
  // c<->q is positive independently of the invalid first slot. p only points
  // into that SCC; admitting either duplicate c->p row would wrongly enlarge
  // its component. Suppressing all c slots would wrongly erase the real SCC.
  // Reached c has an incomplete frontier, so p's unreachable derivative is absent.
});

test('pair overlaps preserve independent SCC/depth results and delete cyclic incidents before depth', () => {
  const cases = [...duplicateRecordExtendedOverlapCases()].filter(value => value.parameters.kind === 'pair-depth');
  assert.equal(cases.length, 6);
  for (const value of cases) {
    const { chainLength: n, attachment } = value.parameters;
    assertAllRequired(value.input);
    const witness = positiveRowWitness(value.input);
    const last = nodeId(n);
    assert.deepEqual(value.input.declarations.map(item => item.implementationId),
      [a, b, c, ...Array.from({ length: n }, (_, index) => nodeId(index + 1))]);
    assert.deepEqual(witness.excluded.map(row => row.providerImplementationIds), [[last], [c]]);
    assertEdgeAbsent(witness.edges, c, last);
    assertEdgeAbsent(witness.edges, c, c);
    const chain = consecutiveEdges(1, n);
    const incident = [[a, b], [b, a]];
    if (attachment === 'cycle-consumes-chain') incident.push([a, last]);
    if (attachment === 'chain-consumes-cycle') incident.push([nodeId(1), a]);
    assert.deepEqual(edgeOrder(witness.edges), edgeOrder([...chain, ...incident]));
    assert.equal(witness.edges.length, n + 1 + (attachment === 'none' ? 0 : 1));
    const cyclic = new Set([a, b]);
    const residual = witness.edges.filter(([consumer, provider]) => !cyclic.has(consumer) && !cyclic.has(provider));
    assert.deepEqual(edgeOrder(residual), edgeOrder(chain));
    assert.equal(witness.edges.length - residual.length, attachment === 'none' ? 2 : 3);
    const residualVertices = value.input.profile.selections.map(item => item.implementationId).filter(id => !cyclic.has(id));
    assert.deepEqual(residualVertices, [c, ...Array.from({ length: n }, (_, index) => nodeId(index + 1))]);
    assert.equal(residualVertices.length, n + 1);
    assert.equal(residual.length, n - 1);
    assert.deepEqual(value.input.profile.roots, ['example/c', 'example/a', `example/n${String(n).padStart(4, '0')}`]);
    // The complete edge equality is a closed certificate: a<->b is the only
    // SCC, attachment is one-way, residual chain ordinals strictly decrease,
    // and c is isolated. Its longest residual path is exactly n nodes.
    // Every selection is reached: c and a are roots, a reaches b, and the
    // last chain root reaches the entire chain, with or without attachment.
    assert.deepEqual(value.expected.diagnostics, n === 2048
      ? [duplicate, pairCycle] : [duplicate, depthOverflow, pairCycle]);
  }
});

test('removing a self-cyclic bridge never splices its two residual chains', () => {
  const value = at('self-bridge-1024-1025');
  assertAllRequired(value.input);
  const witness = positiveRowWitness(value.input);
  assert.deepEqual(value.input.declarations.map(item => item.implementationId),
    [a, c, ...Array.from({ length: 2049 }, (_, index) => nodeId(index + 1))]);
  assert.deepEqual(witness.excluded.map(row => row.providerImplementationIds), [[nodeId(2049)], [c]]);
  const low = consecutiveEdges(1, 1024);
  const high = consecutiveEdges(1025, 2049);
  const incident = [[a, a], [nodeId(1025), a], [a, nodeId(1024)]];
  assert.deepEqual(edgeOrder(witness.edges), edgeOrder([...low, ...high, ...incident]));
  assert.equal(witness.edges.length, 2050);
  const residual = witness.edges.filter(([consumer, provider]) => consumer !== a && provider !== a);
  assert.deepEqual(edgeOrder(residual), edgeOrder([...low, ...high]));
  assert.equal(residual.length, 2047);
  assert.equal(witness.edges.length - residual.length, 3);
  assertEdgeAbsent(residual, nodeId(1025), nodeId(1024));
  assertEdgeAbsent(witness.edges, c, nodeId(2049));
  assertEdgeAbsent(witness.edges, c, c);
  const residualVertices = value.input.profile.selections.map(item => item.implementationId).filter(id => id !== a);
  assert.equal(residualVertices.length, 2050);
  assert.deepEqual(residualVertices, [c, ...Array.from({ length: 2049 }, (_, index) => nodeId(index + 1))]);
  assert.equal(low.length + 1, 1024);
  assert.equal(high.length + 1, 1025);
  assert.equal(Math.max(1024, 1025, 1), 1025);
  assert.deepEqual(value.input.profile.roots, ['example/c', 'example/n2049']);
  // Before removal the final root reaches high chain, a, then low chain.
  // After removal there is no connecting edge: no SCC contraction or splice.
  assert.deepEqual(value.expected.diagnostics, [duplicate, selfCycle]);
});

test('valid ordered-many reversal is an explicit plan/digest inequality relation, never equivalence', () => {
  const value = at('ordered-many-reversal');
  assert.deepEqual(Object.keys(value).sort(), ['caseId', 'entryPoint', 'expectedRelation', 'inputs', 'parameters', 'proposedOnly']);
  assert.equal(Object.hasOwn(value, 'expected'), false);
  assert.deepEqual(value.expectedRelation, {
    kind: 'ordered-many-plan-and-digest-inequality', scope: 'future-Core-results; fixture consistency only here',
    bothResults: 'success', coordinate: { implementationId: c, slotId: 'dependency' },
    forwardPlanProviders: [p, q], reversePlanProviders: [q, p],
    plansEqual: false, digestsEqual: false, equivalence: 'different',
  });
  const { forward, reverse } = value.inputs;
  assert.deepEqual(forward.profile.bindings[0].providerImplementationIds, [p, q]);
  assert.deepEqual(reverse.profile.bindings[0].providerImplementationIds, [q, p]);
  const aligned = structuredClone(reverse);
  aligned.profile.bindings[0].providerImplementationIds = [p, q];
  assert.deepEqual(aligned, forward, 'provider order is the only invocation difference');
  for (const input of [forward, reverse]) {
    assert.deepEqual(input.profile.roots, ['example/c']);
    assert.deepEqual(input.declarations.map(item => [item.implementationId, item.slots.length]), [[c, 1], [p, 0], [q, 0]]);
    assert.deepEqual(input.declarations[0].slots[0].cardinality, { kind: 'many', min: 1, max: 2, order: 'profile' });
    const witness = positiveRowWitness(input, false);
    assert.equal(witness.groups.size, 1);
    assert.deepEqual(witness.excluded, []);
    assert.deepEqual(edgeOrder(witness.edges), edgeOrder([[c, p], [c, q]]));
  }
  assert.notDeepEqual(value.expectedRelation.forwardPlanProviders, value.expectedRelation.reversePlanProviders);
  // Positive rows, distinct providers, leaf endpoints and c as sole root prove
  // these closed inputs are valid and fully reachable. Ordered-many semantics
  // require the indicated different plan binding arrays and digest inequality.
  // This checks the relational fixture specification, not returned plans or
  // digests. No fabricated full success result, guessed hash or Core call exists.
});
