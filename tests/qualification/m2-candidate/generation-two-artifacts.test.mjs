// Independent closed static checker and corpus. No Core or proposal-patch imports.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildGenerationTwo } from './generation-two-artifacts.mjs';
import { mutationEvidence } from './mutation-evidence.mjs';

// These pins and expectations come from the supplied normative texts, not the builder.
const PINS = [
  ['architecture/contracts/v1/composition.schema.json', '2b4ad547782fa36748fa937f8fe9896da3c022c3e78e68c8edc06c47ffe36562'],
  ['architecture/contracts/v1/diagnostic-catalog.json', 'd59875576b4619dd01713bf108db14144030e30d8f0245e35f80c73563a4ca96'],
  ['architecture/qualification/v1/diagnostic-contract.json', '3f7d8a7a4a5a9d7b54f72d5e0915df3e437ab056107ab50294fa65a8e69b6c94'],
  ['architecture/qualification/v1/diagnostic-snapshots.json', 'c7806cca2e72bd04374b2c0d7a4a1c59da806f96abc54b9339eb53c13f4d5eda'],
  ['architecture/qualification/implementation-clarifications/contract.json', 'e38f74d26959ae342c183764bd0e5623940339816baf51f9b893391a622a1ac9'],
  ['architecture/qualification/implementation-clarifications/cases.json', 'dde24d56296754825a3afa084261518177e296516d04cb59e06f996417cd2fe7'],
  ['architecture/authority/implementation-clarifications-ledger.json', '9a813cd8b7b7fe26d249569d02b25710c3f47895b330ad0858a68c483aa7c345'],
  ['docs/decisions/0020-define-diagnostic-coverage-outside-object-resource-admission.md', 'c63b2b8782329459a1f84c8b34927e48fed7d501de6adbc9e93b8aa942ccfece'],
  ['architecture/authority/object-resource-coverage-ledger.json', '358413860f9a47204f211a1787ebbca402e8a7d93b3b6d0e798b00897b897ab3']
];
const CARRIER = 'input.invalid-byte-carrier';
const RECORD = 'binding.duplicate-record';
const RESERVED = 'output.canonicalization-failed';
const PHASES = ['decode', 'schema', 'declaration', 'profile', 'binding', 'graph', 'output'];
const CODES = [
  CARRIER, 'decode.invalid-json', 'decode.duplicate-key', 'input.limit-exceeded',
  'schema.unsupported-version', 'schema.unknown-field', 'schema.invalid-value', 'schema.non-plain-value', 'identity.invalid',
  'declaration.duplicate-implementation', 'declaration.duplicate-capability', 'declaration.duplicate-slot',
  'profile.duplicate-root', 'profile.unknown-root', 'profile.duplicate-selection', 'profile.unknown-module',
  'profile.unknown-implementation', 'profile.implementation-mismatch', 'profile.missing-selection', 'profile.unreachable-selection',
  RECORD, 'binding.duplicate', 'binding.missing', 'binding.unknown-consumer', 'binding.unknown-slot',
  'binding.unknown-provider', 'binding.provider-not-selected', 'binding.cardinality', 'binding.capability-missing',
  'binding.compatibility-mismatch', 'graph.cycle', RESERVED, 'diagnostics.truncated'
];
const EMITTABLE = CODES.filter(code => code !== RESERVED);
const REASONS = ['not-uint8array', 'unusable-view', 'shared-storage', 'not-document-list'];
const NEW_FACTS = [
  { factId: 'document.byte-carrier-admitted', scope: 'document' },
  { factId: 'binding.record-coordinate-census-complete', scope: 'profile' },
  { factId: 'binding.record-uniqueness', scope: 'binding' }
];
const NEW_ROWS = [
  { code: CARRIER, prerequisiteGroup: 'decode.byte-carrier', prerequisites: [], suppressionScope: 'document' },
  { code: RECORD, prerequisiteGroup: 'binding.record-census', prerequisites: ['document.schema-valid', 'binding.record-coordinate-census-complete'], suppressionScope: 'binding' }
];
const NEW_VARIANTS = [
  { code: CARRIER, phases: ['decode'], coordinate: { required: [], allowed: [] }, details: { required: ['reason'], reasonValues: REASONS } },
  { code: RECORD, phases: ['binding'], coordinate: { required: ['implementationId', 'slotId'], allowed: ['implementationId', 'slotId'] }, details: { required: ['reason'], reasonValues: ['duplicate'] } }
];
const f = value => ({ kind: 'field', value });
const ix = value => ({ kind: 'index', value });
const d = (code, phase, path, coordinate, details) => ({ code, phase, path, coordinate, details });
const COUNT_DIAGNOSTIC = d('input.limit-exceeded', 'declaration', [], {}, { limitName: 'declarations', limit: 4096, actual: 4097 });
const ADDED_SNAPSHOTS = [
  { name: 'g2-carrier-not-uint8array', diagnostic: d(CARRIER, 'decode', [f('declarations'), ix(0)], {}, { reason: 'not-uint8array' }) },
  { name: 'g2-carrier-unusable-view', diagnostic: d(CARRIER, 'decode', [f('profile')], {}, { reason: 'unusable-view' }) },
  { name: 'g2-carrier-shared-storage', diagnostic: d(CARRIER, 'decode', [f('declarations'), ix(1)], {}, { reason: 'shared-storage' }) },
  { name: 'g2-wrapper-declarations', diagnostic: d(CARRIER, 'decode', [f('declarations')], {}, { reason: 'not-document-list' }) },
  { name: 'g2-wrapper-profile', diagnostic: d(CARRIER, 'decode', [f('profile')], {}, { reason: 'not-document-list' }) },
  { name: 'g2-duplicate-record', diagnostic: d(RECORD, 'binding', [], { implementationId: 'example/consumer/default', slotId: 'dependency' }, { reason: 'duplicate' }) },
  { name: 'g2-early-declarations-limit', diagnostic: COUNT_DIAGNOSTIC }
];
const ADDED_ORDERING = [
  { name: 'g2-carrier-code-before-json', axis: 'code', operands: [{ name: 'json', snapshot: 'invalid-json' }, { name: 'carrier', snapshot: 'g2-carrier-not-uint8array' }], expected: ['carrier', 'json'], opposedLaterAxis: 'path.length' },
  { name: 'g2-record-code-before-provider', axis: 'code', operands: [{ name: 'provider', snapshot: 'duplicate-provider' }, { name: 'record', snapshot: 'g2-duplicate-record' }], expected: ['record', 'provider'], opposedLaterAxis: 'coordinate.implementationId.value' },
  { name: 'g2-binding-phase-before-unreachable', axis: 'phase', operands: [{ name: 'unreachable', snapshot: 'unreachable-selection' }, { name: 'record', snapshot: 'g2-duplicate-record' }], expected: ['record', 'unreachable'], opposedLaterAxis: 'code' }
];
const EXPECTED_REFINEMENTS = {
  authority: 'ADR-0013-plus-ADR-0014-and-explicit-owner-selections-proposed-only',
  baseExactCases: 'unchanged-v1-seventeen-fact-projections',
  evidenceScope: 'static-contract-and-fact-eligibility-not-input-derivation',
  byteCarrier: {
    classificationOrder: ['brand', 'shared-storage', 'usable-state'],
    stateMeaning: { valid: 'genuine-usable-non-shared-Uint8Array', invalid: 'classified-document-carrier-failed', unavailable: 'wrapper-failure-or-early-declaration-count-stop' },
    objectEntry: 'valid-after-wrapper-and-count-admission',
    rawBytesAfterInvalidOrUnavailableCarrier: 'unavailable',
    rejectedCarrierAggregateContribution: 0,
    carrierFailureAloneMakesBatchUnavailable: false,
    failedDocumentDerivatives: 'no-decoder-schema-or-document-byte-limit-candidate',
    independentDocuments: 'continue-unless-batch-byte-admission-invalid',
    preflight: 'classify-all-then-document-and-aggregate-byte-limits-before-copy',
    copy: 'intrinsic-owned-Uint8Array-constructor-visible-elements-only',
    ownership: 'synchronous-fixed-non-shared-snapshot-before-any-continuation'
  },
  rawWrapper: {
    policy: 'A-owner-selected-proposed-only',
    arrayBrand: 'realm-neutral-Array.isArray',
    inspectionOrder: ['own-wrapper-data-fields', 'array-and-own-data-length', 'declarations-count', 'own-data-declaration-indexes', 'classify-all-carriers', 'byte-preflight', 'copy-eligible-carriers'],
    shapeFailures: [
      { field: 'declarations', conditions: ['missing', 'accessor', 'not-array', 'missing-or-accessor-index'], path: [f('declarations')] },
      { field: 'profile', conditions: ['missing', 'accessor'], path: [f('profile')] }
    ],
    shapeFailureReason: 'not-document-list',
    shapeFailureScope: 'whole-wrapper-all-document-facts-unavailable',
    getterCalls: 0,
    inheritedFields: 'ignored',
    additionalOwnWrapperFields: 'ignored',
    ownDataUndefined: 'per-document-not-uint8array',
    count: {
      limit: 4096, positiveEvidence: 'admitted-own-data-length-greater-than-limit', unavailableCount: 'no-limit-candidate',
      stopBefore: ['index-descriptors', 'carrier-reflection', 'copy'], byteFacts: 'all-unavailable', documentFacts: 'all-unavailable', diagnostic: COUNT_DIAGNOSTIC
    }
  },
  bindingRecords: {
    coordinate: ['consumerImplementationId', 'slotId'],
    censusScope: 'all-schema-admitted-records-including-unselected-consumers',
    censusStates: { valid: 'all-admitted-occurrences-counted-even-if-repeated', unavailable: 'profile-or-coordinate-not-admitted' },
    uniquenessStates: { valid: 'one-occurrence', invalid: 'more-than-one-occurrence', unavailable: 'census-unavailable-or-zero-occurrences' },
    zeroOccurrences: 'accepted-binding.missing-including-optional-and-many-min-zero',
    candidate: 'one-normalized-diagnostic-per-repeated-coordinate',
    invalidGroup: {
      planBindings: 'none', validEdges: 'none', resolution: 'no-winner-or-row-combination', reachedFrontier: 'incomplete-only-when-reached',
      positiveSubgraph: 'preserve-other-valid-edges-and-independent-scc', unreachedInvalidFrontier: 'does-not-invalidate-untraversed-proof'
    },
    rowLocalDiagnostics: 'unchanged-prerequisites-and-normalized-deduplication',
    unknownConsumerAndSlot: 'independent-positive-diagnostics-remain-eligible',
    cardinality: 'per-row-raw-provider-length-never-combined',
    resourceAccounting: { bindings: 'all-record-occurrences', graphEdges: 'all-provider-occurrences-for-selected-consumers-before-rejection', providersPerManySlot: 'per-row-before-duplicate-rejection' },
    collector: 'unchanged-normalize-deduplicate-top-k-and-omitted'
  }
};
const REMAINING = [
  'combined-successor-acceptance-and-owner-scope-expansion',
  'complete-ADR-0013-and-ADR-0014-input-recipes-and-semantic-mutations',
  'full-document-ADR-0018-raw-number-results',
  'independent-exact-subject-results-and-successor-ledger',
  'production-entrypoint-and-runtime-qualification-before-exposure',
  'publication-and-release-custody'
];
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const eq = assert.deepStrictEqual;
const clone = structuredClone;
const keys = (object, expected) => eq(Object.keys(object).sort(), [...expected].sort());
const legacy = row => row.code !== CARRIER && row.code !== RECORD;
const limit = (candidate, name) => candidate.contract.prerequisiteCatalog.limits.find(row => row.limitName === name);
const variant = (candidate, code) => candidate.contract.variants.find(row => row.code === code);
const snapshot = (candidate, name) => candidate.snapshots.snapshots.find(row => row.name === name).diagnostic;
const row = (candidate, code) => candidate.contract.prerequisiteCatalog.diagnostics.find(item => item.code === code);

function assertJson(value) {
  let visits = 0;
  const ancestors = new Set();
  function visit(item, depth) {
    assert(++visits <= 100000 && depth <= 128, 'finite private JSON budget');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return;
    if (typeof item === 'number') { assert(Number.isSafeInteger(item) && !Object.is(item, -0)); return; }
    assert.equal(typeof item, 'object');
    assert(!ancestors.has(item), 'cyclic private candidate');
    const array = Array.isArray(item);
    assert.equal(Object.getPrototypeOf(item), array ? Array.prototype : Object.prototype);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    eq(Object.getOwnPropertySymbols(item), []);
    if (array) {
      assert(item.length <= 100000);
      eq(Object.keys(descriptors).sort(), [...Array.from({ length: item.length }, (_, i) => String(i)), 'length'].sort());
    }
    ancestors.add(item);
    for (const [name, descriptor] of Object.entries(descriptors)) {
      assert(Object.hasOwn(descriptor, 'value'), 'accessor private field');
      if (array && name === 'length') continue;
      assert.equal(descriptor.enumerable, true);
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(item);
  }
  visit(value, 0);
}

// Invert only independently specified changes, then compare every legacy field.
// This never invokes buildGenerationTwo and never derives expectations from a mutant.
function changed(actual, base, key, expected) {
  eq(actual[key], expected);
  if (Object.hasOwn(base, key)) actual[key] = clone(base[key]);
  else delete actual[key];
}
function checkCandidate(base, candidate) {
  assertJson(candidate);
  keys(candidate, ['kind', 'candidateVersion', 'status', 'scope', 'baseSource', 'sourceHashes', 'proposalBasis', 'carryForward', 'remaining', 'schema', 'catalog', 'contract', 'snapshots']);
  eq(candidate.kind, 'get-modular.private-generation-two-candidate');
  eq(candidate.candidateVersion, 2);
  eq(candidate.status, 'proposed-only');
  eq(candidate.scope, 'static-artifact-candidate');
  eq(candidate.baseSource, 'eea7fd1f7a6034bc8a09358cc13ecb3103e8ab07');
  eq(candidate.sourceHashes, Object.fromEntries(PINS.map(([path, sha]) => [path, `sha256:${sha}`])));
  eq(candidate.proposalBasis, {
    observation: 'supplied-base-text-not-current-proposal-file-observation',
    proposals: [
      { authority: 'ADR-0013', sha256: 'sha256:be6014c8ee6b8445b41fa6a4892e633cf39c973cbb9702b7f5a41a8bd149445d' },
      { authority: 'ADR-0014', sha256: 'sha256:eb071dcbd4d766ff65f8fb08635e3b4a7613c7f4cba38b00ec1047b2e81d9e6a' }
    ],
    ownerSelections: ['early-declarations-count-before-index-or-carrier-inspection', 'wrapper-policy-A']
  });
  eq(candidate.carryForward, PINS.slice(4).map(([path, sha], i) => ({ authority: i < 3 ? 'ADR-0018' : 'ADR-0020', path, sha256: `sha256:${sha}`, application: 'unchanged-entire-artifact' })));
  eq(candidate.remaining, REMAINING);
  const { schema: s, catalog: a, contract: c, snapshots: v } = clone(candidate);
  changed(s, base.schema, '$id', 'urn:get-modular:private:m2-candidate:generation2:composition-schema');
  changed(s, base.schema, 'title', 'Get Modular proposed diagnostic generation 2 composition contract');
  changed(s.$defs.diagnostic.properties.code, base.schema.$defs.diagnostic.properties.code, 'enum', CODES);
  changed(s.$defs.diagnostic.properties.details.properties.reason, base.schema.$defs.diagnostic.properties.details.properties.reason, 'enum', [...base.schema.$defs.diagnostic.properties.details.properties.reason.enum, ...REASONS]);
  eq(s, base.schema);
  changed(a, base.catalog, 'catalogVersion', 2);
  changed(a.ordering, base.catalog.ordering, 'codes', CODES);
  changed(a.detailPolicy, base.catalog.detailPolicy, CARRIER, ['reason']);
  changed(a.detailPolicy, base.catalog.detailPolicy, RECORD, ['reason']);
  eq(a, base.catalog);
  const p = c.prerequisiteCatalog;
  eq(p.factModel.facts, [...base.contract.prerequisiteCatalog.factModel.facts, ...NEW_FACTS]);
  eq(p.factModel.facts.length, 20);
  const facts = new Set(p.factModel.facts.map(fact => fact.factId));
  eq(facts.size, 20);
  eq(p.factModel.maximumPrerequisitesPerCandidate, 4);
  for (const entry of [...p.diagnostics, ...p.limits]) {
    assert(!facts.has(entry.prerequisiteGroup), 'fact/group namespace collision');
    assert(entry.prerequisites.length <= 4);
    eq(new Set(entry.prerequisites).size, entry.prerequisites.length);
    for (const prerequisite of entry.prerequisites) assert(facts.has(prerequisite));
  }
  changed(c, base.contract, 'contractVersion', 2);
  changed(c.codeDisposition, base.contract.codeDisposition, 'policy', 'closed-ordered-partition-of-proposed-generation-two-catalog');
  changed(c.codeDisposition, base.contract.codeDisposition, 'emittable', EMITTABLE);
  eq(c.codeDisposition.reservedNonEmittable, [RESERVED]);
  changed(c.boundedEmissionProtocol, base.contract.boundedEmissionProtocol, 'indexOverflow', 'stop-before-unrepresentable-index');
  changed(c.pathPolicyByCode, base.contract.pathPolicyByCode, CARRIER, 'structural');
  changed(c.pathPolicyByCode, base.contract.pathPolicyByCode, RECORD, 'empty');
  eq(c.variants.map(item => item.code), EMITTABLE);
  eq(c.variants.filter(item => !legacy(item)), NEW_VARIANTS);
  c.variants = c.variants.filter(legacy);
  eq(p.diagnostics.map(item => item.code), EMITTABLE);
  eq(p.diagnostics.filter(item => !legacy(item)), NEW_ROWS);
  p.diagnostics = p.diagnostics.filter(legacy);
  p.factModel.facts = p.factModel.facts.slice(0, 17);
  for (const name of ['declarationRawDocumentBytes', 'profileRawDocumentBytes', 'declarations']) {
    const actual = p.limits.find(item => item.limitName === name);
    const previous = base.contract.prerequisiteCatalog.limits.find(item => item.limitName === name);
    changed(actual, previous, 'prerequisites', name === 'declarations' ? [] : ['document.byte-carrier-admitted']);
  }
  changed(c, base.contract, 'proposedRefinements', EXPECTED_REFINEMENTS);
  eq(c, base.contract);
  changed(v, base.snapshots, 'vectorVersion', 2);
  changed(v, base.snapshots, 'snapshots', [...base.snapshots.snapshots, ...ADDED_SNAPSHOTS]);
  changed(v, base.snapshots, 'orderingCases', [...base.snapshots.orderingCases, ...ADDED_ORDERING]);
  changed(v.rankAdjacency, base.snapshots.rankAdjacency, 'codes', EMITTABLE.slice(1).map((code, i) => [EMITTABLE[i], code]));
  eq(v, base.snapshots);
}

// Finite fixture encoding, not a general-purpose JCS adapter or raw-number parser.
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const cmp = (a, b) => a === b ? 0 : a < b ? -1 : 1;
function compare(a, b) {
  let order = cmp(PHASES.indexOf(a.phase), PHASES.indexOf(b.phase)) || cmp(CODES.indexOf(a.code), CODES.indexOf(b.code));
  for (const key of ['moduleId', 'implementationId', 'slotId', 'providerImplementationId']) {
    if (order) return order;
    order = cmp(Object.hasOwn(a.coordinate, key), Object.hasOwn(b.coordinate, key));
    if (!order && Object.hasOwn(a.coordinate, key)) order = cmp(a.coordinate[key], b.coordinate[key]);
  }
  if (order) return order;
  for (let i = 0; i < Math.min(a.path.length, b.path.length); i++) {
    order = cmp(['field', 'index'].indexOf(a.path[i].kind), ['field', 'index'].indexOf(b.path[i].kind)) || cmp(a.path[i].value, b.path[i].value);
    if (order) return order;
  }
  return cmp(a.path.length, b.path.length) || Buffer.compare(Buffer.from(stable(a.details)), Buffer.from(stable(b.details)));
}
function checkSnapshotShapes(candidate) {
  for (const item of candidate.snapshots.snapshots) {
    keys(item, ['name', 'diagnostic']);
    const value = item.diagnostic;
    keys(value, ['code', 'phase', 'path', 'coordinate', 'details']);
    assert(EMITTABLE.includes(value.code));
    const shape = variant(candidate, value.code);
    assert(shape.phases.includes(value.phase));
    keys(value.coordinate, shape.coordinate.allowed);
    for (const name of shape.coordinate.required) assert(Object.hasOwn(value.coordinate, name));
    for (const [name, identity] of Object.entries(value.coordinate)) {
      const definition = name === 'slotId' ? candidate.schema.$defs.localToken : candidate.schema.$defs.portableId;
      assert.equal(typeof identity, 'string');
      assert(identity.length >= definition.minLength && identity.length <= definition.maxLength);
      assert(new RegExp(definition.pattern).test(identity));
    }
    keys(value.details, shape.details.required);
    if (shape.details.reasonValues) assert(shape.details.reasonValues.includes(value.details.reason));
    assert(value.path.length <= 32);
    for (const segment of value.path) {
      keys(segment, ['kind', 'value']);
      assert(['field', 'index'].includes(segment.kind));
      if (segment.kind === 'index') assert(Number.isInteger(segment.value) && segment.value >= 0 && segment.value <= 65535);
      else assert(typeof segment.value === 'string' && /^[A-Za-z][A-Za-z0-9]*$/.test(segment.value));
    }
    let policy = candidate.contract.pathPolicyByCode[value.code];
    if (policy === 'limit-specific') {
      policy = candidate.contract.limitPathPolicies[value.details.limitName];
      eq(value.phase, candidate.contract.limitPhases[value.details.limitName]);
      eq(value.details.actual, value.details.limit + 1);
    }
    if (policy === 'empty') eq(value.path, []);
    else { eq(policy, 'structural'); assert(value.path.length > 0); }
  }
}
const eligible = (entry, facts) => entry.prerequisites.every(id => facts[id] === 'valid');

function candidateBytes(value) {
  assertJson(value); // Admission precedes encoding; never stringify a malformed control.
  return Buffer.from(stable(value), 'utf8');
}
function checkedCandidate(base, candidate) {
  try { checkCandidate(base, candidate); }
  catch (error) { error.privateCheck = 'checkCandidate'; throw error; }
}
const appendSourceNewline = bytes => Buffer.concat([bytes, Buffer.from('\n')]);
const NON_JSON_CONTROLS = ['unsupported-undefined', 'unsupported-symbol', 'unsupported-getter', 'unsupported-nan'];
// These map static artifact corruptions to existing/new rejection test IDs.
// They do not stand for execution of a compiler implementing these mutations.
const ADR0014_STATIC_MUTATIONS = {
  overloadedCode: ['reject:record-overloaded-code'],
  codeRank: ['reject:record-rank'],
  prerequisiteOrderGroupScope: ['reject:record-prerequisite-order', 'reject:record-prerequisite-group', 'reject:record-prerequisite-scope'],
  missingOrRemappedFacts: ['reject:fact-removed', 'reject:fact-unknown', 'reject:fact-scope'],
  perOccurrenceOutput: ['reject:record-per-occurrence'],
  arrayIndexPath: ['reject:record-path-index'],
  winnerSelection: ['reject:record-first-winner', 'reject:record-last-winner'],
  rowCombination: ['reject:record-row-merge', 'reject:record-row-concatenation', 'reject:record-row-intersection', 'reject:record-row-sort', 'reject:record-row-fallback'],
  invalidGroupContribution: ['reject:invalid-group-edge-leak', 'reject:record-plan-binding-leak'],
  independentFactSuppression: ['reject:independent-scc-suppressed', 'reject:unreached-frontier-global-suppression', 'reject:legacy-binding-prerequisite'],
  collectorEarlyStop: ['reject:collector-stop-k-plus-one'],
  resourceDeduplication: ['reject:resource-deduplication', 'reject:graph-resource-deduplication', 'reject:many-resource-deduplication'],
};
const MUTATIONS = [
  ['removed-schema-code', c => c.schema.$defs.diagnostic.properties.code.enum.splice(0, 1)],
  ['unknown-catalog-code', c => c.catalog.ordering.codes.push('binding.future')],
  ['carrier-rank', c => c.catalog.ordering.codes.reverse()],
  ['record-rank', c => c.contract.codeDisposition.emittable.reverse()],
  ['schema-carrier-reasons', c => c.schema.$defs.diagnostic.properties.details.properties.reason.enum.pop()],
  ['catalog-detail-policy', c => c.catalog.detailPolicy[RECORD].push('count')],
  ['revived-reserved', c => c.contract.codeDisposition.emittable.push(RESERVED)],
  ['removed-reserved', c => c.catalog.ordering.codes.splice(c.catalog.ordering.codes.indexOf(RESERVED), 1)],
  ['phase-order', c => c.catalog.ordering.phases.reverse()],
  ['record-coordinate-missing', c => variant(c, RECORD).coordinate.required.pop()],
  ['record-coordinate-extra', c => variant(c, RECORD).coordinate.allowed.push('providerImplementationId')],
  ['record-path-policy', c => { c.contract.pathPolicyByCode[RECORD] = 'structural'; }],
  ['record-path-index', c => snapshot(c, 'g2-duplicate-record').path.push(ix(0))],
  ['record-details-extra', c => { snapshot(c, 'g2-duplicate-record').details.count = 2; }],
  ['carrier-reason-variant', c => variant(c, CARRIER).details.reasonValues.pop()],
  ['carrier-unknown-reason', c => { snapshot(c, 'g2-carrier-not-uint8array').details.reason = 'unknown'; }],
  ['carrier-phase', c => { snapshot(c, 'g2-carrier-not-uint8array').phase = 'schema'; }],
  ['carrier-coordinate', c => { snapshot(c, 'g2-carrier-not-uint8array').coordinate.slotId = 'dependency'; }],
  ['wrapper-path', c => snapshot(c, 'g2-wrapper-declarations').path.push(ix(0))],
  ['declaration-byte-prerequisite', c => { limit(c, 'declarationRawDocumentBytes').prerequisites = []; }],
  ['profile-byte-prerequisite', c => { limit(c, 'profileRawDocumentBytes').prerequisites = []; }],
  ['early-count-prerequisite', c => { limit(c, 'declarations').prerequisites = ['batch.raw-bytes-admitted']; }],
  ['early-count-phase', c => { c.contract.limitPhases.declarations = 'decode'; }],
  ['early-count-reason', c => { snapshot(c, 'g2-early-declarations-limit').details.reason = 'limit'; }],
  ['fact-removed', c => c.contract.prerequisiteCatalog.factModel.facts.pop()],
  ['fact-unknown', c => { c.contract.prerequisiteCatalog.factModel.facts[19].factId = 'binding.future'; }],
  ['fact-scope', c => { c.contract.prerequisiteCatalog.factModel.facts[18].scope = 'binding'; }],
  ['fact-order', c => c.contract.prerequisiteCatalog.factModel.facts.reverse()],
  ['fact-group-collision', c => { row(c, RECORD).prerequisiteGroup = 'binding.record-uniqueness'; }],
  ['record-prerequisite-order', c => row(c, RECORD).prerequisites.reverse()],
  ['invalid-fact-as-own-prerequisite', c => row(c, RECORD).prerequisites.push('binding.record-uniqueness')],
  ['prerequisite-maximum', c => { c.contract.prerequisiteCatalog.factModel.maximumPrerequisitesPerCandidate = 5; }],
  ['legacy-binding-prerequisite', c => row(c, 'binding.unknown-provider').prerequisites.push('binding.record-uniqueness')],
  ['independent-scc-suppressed', c => { c.contract.proposedRefinements.bindingRecords.invalidGroup.positiveSubgraph = 'suppress-all'; }],
  ['duplicate-makes-census-incomplete', c => { c.contract.proposedRefinements.bindingRecords.censusStates.valid = 'unique-only'; }],
  ['invalid-group-edge-leak', c => { c.contract.proposedRefinements.bindingRecords.invalidGroup.validEdges = 'first-row'; }],
  ['unreached-frontier-global-suppression', c => { c.contract.proposedRefinements.bindingRecords.invalidGroup.unreachedInvalidFrontier = 'suppress'; }],
  ['resource-deduplication', c => { c.contract.proposedRefinements.bindingRecords.resourceAccounting.bindings = 'unique-coordinates'; }],
  ['wrapper-accessor-policy', c => c.contract.proposedRefinements.rawWrapper.shapeFailures[1].conditions.pop()],
  ['wrapper-index-policy', c => c.contract.proposedRefinements.rawWrapper.shapeFailures[0].conditions.pop()],
  ['wrapper-getter', c => { c.contract.proposedRefinements.rawWrapper.getterCalls = 1; }],
  ['own-undefined-as-missing', c => { c.contract.proposedRefinements.rawWrapper.ownDataUndefined = 'not-document-list'; }],
  ['late-count-inspection', c => c.contract.proposedRefinements.rawWrapper.inspectionOrder.reverse()],
  ['unavailable-count-candidate', c => { c.contract.proposedRefinements.rawWrapper.count.unavailableCount = 'emit'; }],
  ['count-byte-facts-valid', c => { c.contract.proposedRefinements.rawWrapper.count.byteFacts = 'valid'; }],
  ['carrier-poisons-batch', c => { c.contract.proposedRefinements.byteCarrier.carrierFailureAloneMakesBatchUnavailable = true; }],
  ['index-overflow-echo', c => { c.contract.boundedEmissionProtocol.indexOverflow = 'emit-index'; }],
  ['legacy-code-reason', c => { variant(c, 'binding.duplicate').details.reasonValues = ['duplicate-record']; }],
  ['legacy-comparator', c => { c.contract.comparator.missingCoordinate = 'after-present'; }],
  ['legacy-snapshot-reordered', c => c.snapshots.snapshots.reverse()],
  ['legacy-case-changed', c => c.contract.prerequisiteCatalog.exactCases[0].eligibleCodes.pop()],
  ['missing-new-adjacency', c => c.snapshots.rankAdjacency.codes.shift()],
  ['reserved-in-snapshot-adjacency', c => c.snapshots.rankAdjacency.codes.push(['graph.cycle', RESERVED])],
  ['unknown-root-field', c => { c.accepted = true; }],
  ['unknown-nested-field', c => { c.contract.proposedRefinements.byteCarrier.extension = {}; }],
  ['clarification-reference', c => { c.carryForward[0].sha256 = 'sha256:' + '0'.repeat(64); }],
  ['coverage-reference', c => { c.carryForward[4].sha256 = 'sha256:' + '0'.repeat(64); }],
  ['accepted-status', c => { c.status = 'accepted'; }],
  ['old-generation', c => { c.snapshots.vectorVersion = 1; }],
  ['source-hash-drift', c => { c.sourceHashes[PINS[0][0]] = 'sha256:' + '0'.repeat(64); }],
  ['record-overloaded-code', c => { snapshot(c, 'g2-duplicate-record').code = 'binding.duplicate'; }],
  ['record-prerequisite-group', c => { row(c, RECORD).prerequisiteGroup = 'binding.slot-frontier'; }],
  ['record-prerequisite-scope', c => { row(c, RECORD).suppressionScope = 'profile'; }],
  ['record-per-occurrence', c => c.snapshots.snapshots.push(clone(c.snapshots.snapshots.find(item => item.name === 'g2-duplicate-record')))],
  ['record-first-winner', c => { c.contract.proposedRefinements.bindingRecords.invalidGroup.resolution = 'first-row'; }],
  ['record-last-winner', c => { c.contract.proposedRefinements.bindingRecords.invalidGroup.resolution = 'last-row'; }],
  ['record-row-merge', c => { c.contract.proposedRefinements.bindingRecords.invalidGroup.resolution = 'merge'; }],
  ['record-row-concatenation', c => { c.contract.proposedRefinements.bindingRecords.invalidGroup.resolution = 'concatenate'; }],
  ['record-row-intersection', c => { c.contract.proposedRefinements.bindingRecords.invalidGroup.resolution = 'intersect'; }],
  ['record-row-sort', c => { c.contract.proposedRefinements.bindingRecords.invalidGroup.resolution = 'sort'; }],
  ['record-row-fallback', c => { c.contract.proposedRefinements.bindingRecords.invalidGroup.resolution = 'fallback'; }],
  ['collector-stop-k-plus-one', c => { c.contract.proposedRefinements.bindingRecords.collector = 'stop-at-k-plus-one'; }],
  ['graph-resource-deduplication', c => { c.contract.proposedRefinements.bindingRecords.resourceAccounting.graphEdges = 'unique-providers'; }],
  ['many-resource-deduplication', c => { c.contract.proposedRefinements.bindingRecords.resourceAccounting.providersPerManySlot = 'unique-providers-per-row'; }],
  ['record-plan-binding-leak', c => { c.contract.proposedRefinements.bindingRecords.invalidGroup.planBindings = 'first-row'; }],
  ['unsupported-undefined', c => { c.extra = undefined; }],
  ['unsupported-symbol', c => { c[Symbol('extra')] = true; }],
  ['unsupported-getter', c => { Object.defineProperty(c, 'extra', { enumerable: true, get() { throw new Error('getter invoked'); } }); }],
  ['unsupported-nan', c => { c.extra = NaN; }]
];

test('private generation two: closed static artifact corpus', async t => {
  const sourceBytes = Object.fromEntries(PINS.map(([path, sha]) => {
    const bytes = readFileSync(new URL(`../../../${path}`, import.meta.url));
    eq(hash(bytes), `sha256:${sha}`, path);
    return [path, bytes];
  }));
  const names = ['schema', 'catalog', 'contract', 'snapshots'];
  const base = Object.fromEntries(PINS.slice(0, 4).map(([path], i) => [names[i], JSON.parse(sourceBytes[path].toString('utf8'))]));
  const subjectUrl = new URL('./generation-two-artifacts.mjs', import.meta.url);
  const runnerUrl = new URL(import.meta.url);
  const subjectBytes = readFileSync(subjectUrl);
  const runnerBytes = readFileSync(runnerUrl);
  const candidate = buildGenerationTwo(sourceBytes);
  eq(MUTATIONS.length, 79);
  eq(new Set(MUTATIONS.map(([id]) => id)).size, 79);
  eq(MUTATIONS.filter(([id]) => NON_JSON_CONTROLS.includes(id)).map(([id]) => id), NON_JSON_CONTROLS);
  const baseCandidateBytes = candidateBytes(candidate);
  const evidence = mutationEvidence('generation-two-artifacts', runnerBytes, [
    ...MUTATIONS.filter(([id]) => !NON_JSON_CONTROLS.includes(id)).map(([id, change]) => ({
      mutationId: `reject:${id}`, targetKind: 'candidate-artifact',
      sourcePath: 'tests/qualification/m2-candidate/generation-two-artifacts.mjs',
      sourceBytes: subjectBytes, baseBytes: baseCandidateBytes, change,
      caseId: `reject:${id}`, entryPoint: 'checkCandidate', checker: 'checkCandidate', rejectedBy: 'checkCandidate',
    })),
    ...PINS.map(([path]) => ({
      mutationId: `source-fingerprint:${path}`, targetKind: 'accepted-source-bytes',
      sourcePath: path, sourceBytes: sourceBytes[path], baseBytes: sourceBytes[path], change: appendSourceNewline,
      caseId: `source-fingerprint:${path}`, entryPoint: 'buildGenerationTwo', checker: 'buildGenerationTwo', rejectedBy: null,
    })),
  ]);
  const checks = [
    ['closed-contract-and-unchanged-legacy', () => checkCandidate(base, candidate)],
    ['complete-snapshots-and-dispositions', () => {
      checkSnapshotShapes(candidate);
      eq(CODES.length, 33);
      eq(EMITTABLE.length, 32);
      eq(base.snapshots.snapshots.length, 30);
      eq(candidate.snapshots.snapshots.length, 37);
      eq(new Set(candidate.snapshots.snapshots.map(item => item.name)).size, 37);
      eq(new Set(candidate.snapshots.snapshots.map(item => item.diagnostic.code)).size, 32);
      assert(!candidate.snapshots.snapshots.some(item => item.diagnostic.code === RESERVED));
      eq([...new Set(candidate.snapshots.snapshots.filter(item => item.diagnostic.code === CARRIER).map(item => item.diagnostic.details.reason))], REASONS);
    }],
    ['all-new-rank-adjacencies', () => {
      const pairs = candidate.snapshots.rankAdjacency.codes;
      eq(pairs.length, 31);
      for (const pair of [[CARRIER, 'decode.invalid-json'], ['profile.unreachable-selection', RECORD], [RECORD, 'binding.duplicate']]) assert(pairs.some(item => JSON.stringify(item) === JSON.stringify(pair)));
      assert(!pairs.some(pair => pair.includes(RESERVED)));
      eq(CODES.filter(code => code !== CARRIER && code !== RECORD), base.catalog.ordering.codes);
      eq(candidate.snapshots.rankAdjacency.phases, base.snapshots.rankAdjacency.phases);
    }],
    ['legacy-and-new-ordering-operands', () => {
      const byName = new Map(candidate.snapshots.snapshots.map(item => [item.name, item.diagnostic]));
      for (const entry of candidate.snapshots.orderingCases) {
        const operands = entry.operands.map(operand => ({ name: operand.name, value: { ...byName.get(operand.snapshot), ...operand.override } }));
        for (const input of [operands, [...operands].reverse()]) eq([...input].sort((a, b) => compare(a.value, b.value)).map(item => item.name), entry.expected, entry.name);
      }
      for (const entry of candidate.snapshots.detailCanonicalizationCases) eq(Buffer.from(stable(entry.details)).toString('hex'), entry.canonicalUtf8Hex);
    }],
    ['fact-eligibility-and-independent-rows', () => {
      const facts = Object.fromEntries([...base.contract.prerequisiteCatalog.factModel.facts, ...NEW_FACTS].map(item => [item.factId, 'valid']));
      eq(Object.keys(facts).length, 20);
      for (const entry of base.contract.prerequisiteCatalog.exactCases) {
        const states = { ...facts, ...entry.factStates };
        eq(entry.candidateCodes.filter(code => eligible(row(candidate, code), states)), entry.eligibleCodes);
        eq(entry.candidateCodes.filter(code => !eligible(row(candidate, code), states)), entry.suppressedCodes);
      }
      const independent = ['binding.duplicate', 'binding.unknown-consumer', 'binding.unknown-slot', 'binding.unknown-provider', 'binding.provider-not-selected', 'binding.cardinality', 'binding.capability-missing', 'binding.compatibility-mismatch', 'graph.cycle'];
      const reached = { ...facts, 'binding.record-uniqueness': 'invalid', 'binding.reached-frontier-complete': 'invalid' };
      for (const code of [RECORD, ...independent]) assert(eligible(row(candidate, code), reached), code);
      assert(!eligible(row(candidate, 'profile.unreachable-selection'), reached));
      assert(eligible(row(candidate, 'profile.unreachable-selection'), { ...reached, 'binding.reached-frontier-complete': 'valid' }));
      assert(!eligible(row(candidate, RECORD), { ...facts, 'binding.record-coordinate-census-complete': 'unavailable' }));
      const failedCarrier = { ...facts, 'document.byte-carrier-admitted': 'invalid', 'document.raw-bytes-admitted': 'unavailable', 'document.decoded': 'unavailable', 'document.schema-valid': 'unavailable' };
      assert(eligible(row(candidate, CARRIER), failedCarrier));
      for (const code of ['decode.invalid-json', 'decode.duplicate-key', 'schema.invalid-value']) assert(!eligible(row(candidate, code), failedCarrier));
      for (const name of ['declarationRawDocumentBytes', 'profileRawDocumentBytes']) assert(!eligible(limit(candidate, name), failedCarrier));
      assert(eligible(limit(candidate, 'aggregateRawBytes'), failedCarrier));
      // Eligibility is conditional on an already established positive candidate, not its generation.
      const early = { ...facts, 'batch.raw-bytes-admitted': 'unavailable', 'document.raw-bytes-admitted': 'unavailable', 'document.byte-carrier-admitted': 'unavailable' };
      assert(eligible(limit(candidate, 'declarations'), early));
      for (const entry of [...candidate.contract.prerequisiteCatalog.diagnostics, ...candidate.contract.prerequisiteCatalog.limits]) {
        for (const prerequisite of entry.prerequisites) for (const state of ['invalid', 'unavailable']) assert(!eligible(entry, { ...facts, [prerequisite]: state }));
      }
    }],
    ['deterministic-owned-transformation', () => {
      const again = buildGenerationTwo(sourceBytes);
      eq(again, candidate);
      snapshot(again, 'duplicate-provider').details.reason = 'changed';
      eq(snapshot(candidate, 'duplicate-provider').details.reason, 'duplicate');
      for (const [path, sha] of PINS) eq(hash(sourceBytes[path]), `sha256:${sha}`);
    }],
    ['closed-source-bundle', () => {
      assert.throws(() => buildGenerationTwo({ ...sourceBytes, extra: Buffer.from('x') }), /base-source-shape/);
      const missing = { ...sourceBytes };
      delete missing[PINS[0][0]];
      assert.throws(() => buildGenerationTwo(missing), /base-source-shape/);
    }]
  ];
  for (const [id, mutate] of MUTATIONS) checks.push([`reject:${id}`, async () => {
    if (NON_JSON_CONTROLS.includes(id)) {
      const corrupt = clone(candidate);
      mutate(corrupt);
      assert.throws(() => checkedCandidate(base, corrupt), {
        name: 'AssertionError', code: 'ERR_ASSERTION', privateCheck: 'checkCandidate',
      });
      return; // Supplemental integrity control: no JSON payload identity is claimed.
    }
    await evidence.run(`reject:${id}`, corrupt => checkedCandidate(base, corrupt), candidateBytes);
  }]);
  for (const [path] of PINS) checks.push([`source-fingerprint:${path}`, async () => {
    await evidence.run(`source-fingerprint:${path}`, bytes => buildGenerationTwo({ ...sourceBytes, [path]: bytes }));
  }]);
  checks.push(['observation-bytes-stable', () => {
    eq(readFileSync(subjectUrl), subjectBytes);
    eq(readFileSync(runnerUrl), runnerBytes);
    for (const [path] of PINS) eq(readFileSync(new URL(`../../../${path}`, import.meta.url)), sourceBytes[path]);
  }]);
  const ids = checks.map(([id]) => id);
  eq(new Set(ids).size, ids.length);
  let completed = 0;
  for (const [id, run] of checks) await t.test(id, async () => { await run(); completed++; });
  if (completed !== checks.length) return; // Never emit a successful observation after a failed check.
  const mutationReport = evidence.report();
  eq(mutationReport.rows.length, 84);
  const mutationIds = new Set(mutationReport.rows.map(item => item.mutationId));
  for (const mapped of Object.values(ADR0014_STATIC_MUTATIONS)) {
    for (const id of mapped) assert(mutationIds.has(id), `missing static mutation witness: ${id}`);
  }
  eq(candidateBytes(candidate), baseCandidateBytes);
  const candidateHashes = Object.fromEntries(['schema', 'catalog', 'contract', 'snapshots'].map(name => [name, hash(Buffer.from(stable(candidate[name])))]));
  t.diagnostic(JSON.stringify({
    kind: 'get-modular.private-generation-two-test-observation',
    status: 'proposed-only',
    scope: 'static-artifacts-and-table-eligibility-only',
    baseSource: candidate.baseSource,
    baseSourceRole: 'declared-reference-not-an-executed-Git-subject',
    sourceHashes: Object.fromEntries(PINS.map(([path]) => [path, hash(sourceBytes[path])])),
    subject: { path: 'tests/qualification/m2-candidate/generation-two-artifacts.mjs', sha256: hash(subjectBytes) },
    runner: { path: 'tests/qualification/m2-candidate/generation-two-artifacts.test.mjs', sha256: hash(runnerBytes) },
    candidateHashEncoding: 'sorted-key-json-utf8-safe-integer-subset',
    candidateHashes: { candidate: hash(Buffer.from(stable(candidate))), ...candidateHashes },
    closedTestCount: completed,
    testIds: ids,
    adr0014StaticMutationCategories: ADR0014_STATIC_MUTATIONS,
    supplementalIntegrityControls: NON_JSON_CONTROLS.map(id => ({
      testId: `reject:${id}`, exclusionReason: 'non-json-integrity-control-no-payload-digest',
    })),
    remaining: REMAINING
  }));
  t.diagnostic(JSON.stringify(mutationReport));
});
