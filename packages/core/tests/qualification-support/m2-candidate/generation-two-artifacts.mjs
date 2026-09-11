// Private proposed-only artifact preparation. No compiler, acceptance or publication surface.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { findRepoRoot, repoFileUrl } from '../support/load-repo-json.mjs';
import { pathToFileURL } from 'node:url';

const BASE_SOURCE = 'eea7fd1f7a6034bc8a09358cc13ecb3103e8ab07';
const SOURCES = [
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
const REASONS = ['not-uint8array', 'unusable-view', 'shared-storage', 'not-document-list'];
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const field = value => ({ kind: 'field', value });
const index = value => ({ kind: 'index', value });
const diagnostic = (code, phase, path, coordinate, details) => ({ code, phase, path, coordinate, details });
const earlyCount = () => diagnostic('input.limit-exceeded', 'declaration', [], {}, {
  limitName: 'declarations', limit: 4096, actual: 4097
});
const insertCodes = codes => [CARRIER, ...codes.flatMap(code => code === 'binding.duplicate' ? [RECORD, code] : [code])];
const insertRows = (rows, carrier, record) => [carrier, ...rows.flatMap(row => row.code === 'binding.duplicate' ? [record, row] : [row])];

export function readAcceptedSources() {
  return Object.fromEntries(SOURCES.map(([path]) => [path, readFileSync(new URL(path, pathToFileURL(findRepoRoot() + '/')))]));
}

function authenticatedBase(sourceBytes) {
  if (!sourceBytes || Object.getPrototypeOf(sourceBytes) !== Object.prototype ||
      Reflect.ownKeys(sourceBytes).length !== SOURCES.length ||
      SOURCES.some(([path]) => !Object.hasOwn(sourceBytes, path))) throw new Error('base-source-shape');
  const sourceHashes = {};
  for (const [path, expected] of SOURCES) {
    const descriptor = Object.getOwnPropertyDescriptor(sourceBytes, path);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !Buffer.isBuffer(descriptor.value)) throw new Error('base-source-shape');
    const actual = digest(descriptor.value);
    if (actual !== `sha256:${expected}`) throw new Error(`base-fingerprint: ${path}`);
    sourceHashes[path] = actual;
  }
  // Parsing follows exact-byte authentication; arbitrary object extensions cannot enter the base.
  const [schema, catalog, contract, snapshots] = SOURCES.slice(0, 4).map(([path]) => JSON.parse(sourceBytes[path].toString('utf8')));
  return { schema, catalog, contract, snapshots, sourceHashes };
}

function proposedRefinements() {
  return {
    authority: 'ADR-0013-plus-ADR-0014-and-explicit-owner-selections-proposed-only',
    baseExactCases: 'unchanged-v1-seventeen-fact-projections',
    evidenceScope: 'static-contract-and-fact-eligibility-not-input-derivation',
    byteCarrier: {
      classificationOrder: ['brand', 'shared-storage', 'usable-state'],
      stateMeaning: {
        valid: 'genuine-usable-non-shared-Uint8Array',
        invalid: 'classified-document-carrier-failed',
        unavailable: 'wrapper-failure-or-early-declaration-count-stop'
      },
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
        { field: 'declarations', conditions: ['missing', 'accessor', 'not-array', 'missing-or-accessor-index'], path: [field('declarations')] },
        { field: 'profile', conditions: ['missing', 'accessor'], path: [field('profile')] }
      ],
      shapeFailureReason: 'not-document-list',
      shapeFailureScope: 'whole-wrapper-all-document-facts-unavailable',
      getterCalls: 0,
      inheritedFields: 'ignored',
      additionalOwnWrapperFields: 'ignored',
      ownDataUndefined: 'per-document-not-uint8array',
      count: {
        limit: 4096,
        positiveEvidence: 'admitted-own-data-length-greater-than-limit',
        unavailableCount: 'no-limit-candidate',
        stopBefore: ['index-descriptors', 'carrier-reflection', 'copy'],
        byteFacts: 'all-unavailable',
        documentFacts: 'all-unavailable',
        diagnostic: earlyCount()
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
        planBindings: 'none',
        validEdges: 'none',
        resolution: 'no-winner-or-row-combination',
        reachedFrontier: 'incomplete-only-when-reached',
        positiveSubgraph: 'preserve-other-valid-edges-and-independent-scc',
        unreachedInvalidFrontier: 'does-not-invalidate-untraversed-proof'
      },
      rowLocalDiagnostics: 'unchanged-prerequisites-and-normalized-deduplication',
      unknownConsumerAndSlot: 'independent-positive-diagnostics-remain-eligible',
      cardinality: 'per-row-raw-provider-length-never-combined',
      resourceAccounting: {
        bindings: 'all-record-occurrences',
        graphEdges: 'all-provider-occurrences-for-selected-consumers-before-rejection',
        providersPerManySlot: 'per-row-before-duplicate-rejection'
      },
      collector: 'unchanged-normalize-deduplicate-top-k-and-omitted'
    }
  };
}

function additionalSnapshots() {
  return [
    { name: 'g2-carrier-not-uint8array', diagnostic: diagnostic(CARRIER, 'decode', [field('declarations'), index(0)], {}, { reason: 'not-uint8array' }) },
    { name: 'g2-carrier-unusable-view', diagnostic: diagnostic(CARRIER, 'decode', [field('profile')], {}, { reason: 'unusable-view' }) },
    { name: 'g2-carrier-shared-storage', diagnostic: diagnostic(CARRIER, 'decode', [field('declarations'), index(1)], {}, { reason: 'shared-storage' }) },
    { name: 'g2-wrapper-declarations', diagnostic: diagnostic(CARRIER, 'decode', [field('declarations')], {}, { reason: 'not-document-list' }) },
    { name: 'g2-wrapper-profile', diagnostic: diagnostic(CARRIER, 'decode', [field('profile')], {}, { reason: 'not-document-list' }) },
    { name: 'g2-duplicate-record', diagnostic: diagnostic(RECORD, 'binding', [], { implementationId: 'example/consumer/default', slotId: 'dependency' }, { reason: 'duplicate' }) },
    { name: 'g2-early-declarations-limit', diagnostic: earlyCount() }
  ];
}

function additionalOrdering() {
  return [
    { name: 'g2-carrier-code-before-json', axis: 'code', operands: [{ name: 'json', snapshot: 'invalid-json' }, { name: 'carrier', snapshot: 'g2-carrier-not-uint8array' }], expected: ['carrier', 'json'], opposedLaterAxis: 'path.length' },
    { name: 'g2-record-code-before-provider', axis: 'code', operands: [{ name: 'provider', snapshot: 'duplicate-provider' }, { name: 'record', snapshot: 'g2-duplicate-record' }], expected: ['record', 'provider'], opposedLaterAxis: 'coordinate.implementationId.value' },
    { name: 'g2-binding-phase-before-unreachable', axis: 'phase', operands: [{ name: 'unreachable', snapshot: 'unreachable-selection' }, { name: 'record', snapshot: 'g2-duplicate-record' }], expected: ['record', 'unreachable'], opposedLaterAxis: 'code' }
  ];
}

// Supplying the fixed byte bundle makes this a finite pure transformation.
// The default reads only the exact relative immutable files above, never proposal work in progress.
export function buildGenerationTwo(sourceBytes = readAcceptedSources()) {
  const { schema, catalog, contract, snapshots, sourceHashes } = authenticatedBase(sourceBytes);
  schema.$id = 'urn:get-modular:private:m2-candidate:generation2:composition-schema';
  schema.title = 'Get Modular proposed diagnostic generation 2 composition contract';
  schema.$defs.diagnostic.properties.code.enum = insertCodes(schema.$defs.diagnostic.properties.code.enum);
  schema.$defs.diagnostic.properties.details.properties.reason.enum.push(...REASONS);
  catalog.catalogVersion = 2;
  catalog.ordering.codes = insertCodes(catalog.ordering.codes);
  catalog.detailPolicy[CARRIER] = ['reason'];
  catalog.detailPolicy[RECORD] = ['reason'];
  contract.contractVersion = 2;
  contract.codeDisposition.policy = 'closed-ordered-partition-of-proposed-generation-two-catalog';
  contract.codeDisposition.emittable = insertCodes(contract.codeDisposition.emittable);
  contract.boundedEmissionProtocol.indexOverflow = 'stop-before-unrepresentable-index';
  contract.pathPolicyByCode[CARRIER] = 'structural';
  contract.pathPolicyByCode[RECORD] = 'empty';
  contract.variants = insertRows(contract.variants,
    { code: CARRIER, phases: ['decode'], coordinate: { required: [], allowed: [] }, details: { required: ['reason'], reasonValues: [...REASONS] } },
    { code: RECORD, phases: ['binding'], coordinate: { required: ['implementationId', 'slotId'], allowed: ['implementationId', 'slotId'] }, details: { required: ['reason'], reasonValues: ['duplicate'] } });
  const prerequisites = contract.prerequisiteCatalog;
  prerequisites.factModel.facts.push(
    { factId: 'document.byte-carrier-admitted', scope: 'document' },
    { factId: 'binding.record-coordinate-census-complete', scope: 'profile' },
    { factId: 'binding.record-uniqueness', scope: 'binding' });
  prerequisites.diagnostics = insertRows(prerequisites.diagnostics,
    { code: CARRIER, prerequisiteGroup: 'decode.byte-carrier', prerequisites: [], suppressionScope: 'document' },
    { code: RECORD, prerequisiteGroup: 'binding.record-census', prerequisites: ['document.schema-valid', 'binding.record-coordinate-census-complete'], suppressionScope: 'binding' });
  for (const row of prerequisites.limits) {
    if (row.limitName === 'declarationRawDocumentBytes' || row.limitName === 'profileRawDocumentBytes') row.prerequisites = ['document.byte-carrier-admitted'];
    if (row.limitName === 'declarations') row.prerequisites = [];
  }
  contract.proposedRefinements = proposedRefinements();
  snapshots.vectorVersion = 2;
  snapshots.snapshots.push(...additionalSnapshots());
  snapshots.orderingCases.push(...additionalOrdering());
  const emittable = contract.codeDisposition.emittable;
  snapshots.rankAdjacency.codes = emittable.slice(1).map((code, i) => [emittable[i], code]);
  return {
    kind: 'get-modular.private-generation-two-candidate',
    candidateVersion: 2,
    status: 'proposed-only',
    scope: 'static-artifact-candidate',
    baseSource: BASE_SOURCE,
    sourceHashes,
    proposalBasis: {
      observation: 'supplied-base-text-not-current-proposal-file-observation',
      proposals: [
        { authority: 'ADR-0013', sha256: 'sha256:be6014c8ee6b8445b41fa6a4892e633cf39c973cbb9702b7f5a41a8bd149445d' },
        { authority: 'ADR-0014', sha256: 'sha256:eb071dcbd4d766ff65f8fb08635e3b4a7613c7f4cba38b00ec1047b2e81d9e6a' }
      ],
      ownerSelections: ['early-declarations-count-before-index-or-carrier-inspection', 'wrapper-policy-A']
    },
    carryForward: SOURCES.slice(4).map(([path, hash], i) => ({ authority: i < 3 ? 'ADR-0018' : 'ADR-0020', path, sha256: `sha256:${hash}`, application: 'unchanged-entire-artifact' })),
    remaining: [
      'combined-successor-acceptance-and-owner-scope-expansion',
      'complete-ADR-0013-and-ADR-0014-input-recipes-and-semantic-mutations',
      'full-document-ADR-0018-raw-number-results',
      'independent-exact-subject-results-and-successor-ledger',
      'production-entrypoint-and-runtime-qualification-before-exposure',
      'publication-and-release-custody'
    ],
    schema, catalog, contract, snapshots
  };
}
