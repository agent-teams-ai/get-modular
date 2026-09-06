// Private proposed-only fixture inventory. No Core subject, acceptance or custody.
// Complete source rows are retained unchanged. Fingerprints bind file bytes only;
// the referenced existing runners own independent semantic fixture checks.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { types } from 'node:util';
import canonicalize from 'canonicalize';
import { duplicateRecordBaseCases, duplicateRecordRowFailureCases,
  duplicateRecordOverlapCases, duplicateRecordPermutationCases } from './duplicate-record-cases.mjs';
import { duplicateRecordOrderingCases, duplicateRecordShuffledOrderingCases,
  duplicateRecordCollectorCases } from './duplicate-record-ordering.mjs';
import { extendedOverlapSource, extendedOverlapPolicy, extendedOverlapRecipes,
  materializeDuplicateRecordExtendedOverlap } from './duplicate-record-extended-overlaps.mjs';
import { duplicateRecordResourceSource, duplicateRecordResourcePolicy,
  duplicateRecordResourceRecipes, duplicateRecordResourceStream,
  duplicateRecordResourceCases } from './duplicate-record-resources.mjs';
import { rawDocumentSource, rawNumberCoverage, retainedRawCoverage,
  rawDocumentCases, materializeRawDocumentInput } from './raw-document-cases.mjs';

export const combinedInventorySource = '9b5cbd564e5700585ab934aaf86d878a01d7939f';
const root = new URL('../../../', import.meta.url);
const directory = 'tests/qualification/m2-candidate/';
const subjectPath = directory + 'combined-case-inventory.mjs';
const runnerPath = directory + 'combined-case-inventory.test.mjs';
const resourcePath = 'architecture/qualification/v1/resource-profile-v2.json';
const scope = 'fixture-consistency-only';
const relationId = 'od006.extended-overlap.v1/ordered-many-reversal';
const jcsEncoding = 'RFC8785 UTF-8 of each complete source case followed by one LF; SHA-256 over concatenation';
const rawEncoding = 'JSON.stringify of each complete rawDocumentCases row in original property order, UTF-8 plus one LF; SHA-256 over concatenation';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = (path, bytes) => ({ path, sha256: `sha256:${hash(bytes)}` });

// Closed byte identities for the reviewed fixtures and integrated runners. These are
// neither caller-selected files nor a claim about a currently executed Git tree.
const pins = [
  [directory + 'duplicate-record-cases.mjs', '23cafc4dded1a2d501c3d11d58b89cfe9b8d07c11a3afd616c457c5bbb41598a'],
  [directory + 'duplicate-record-cases.test.mjs', '9eb5b8a21bbed9f57d7f4bac69389e36ce0d49915ce4587f02013f800a98aa2f'],
  [directory + 'duplicate-record-ordering.mjs', '0cd972bd0f5f539c194f499c748993c94e5eabd06da8e19235b171ec1b7675a2'],
  [directory + 'duplicate-record-recipes.json', 'ce31bf0953e30b1aeec43fa7a5e507ed8b3553d1567d1c5dde8238761ec18063'],
  [directory + 'duplicate-record-extended-overlaps.mjs', 'cc8c58b92b5b3e1c55babe04a1515bc1f40358078cdb16a674acb74633df7924'],
  [directory + 'duplicate-record-extended-overlaps.test.mjs', '29f9fe5736336283d3c41067ed6fd4315ca13985ab92aa1e2cd627d6f04e9a6f'],
  [directory + 'duplicate-record-resources.mjs', '906a691943332033331114b9d30b3ba61869cd61948875df52a28e1dd51b6e9f'],
  [directory + 'duplicate-record-resources.test.mjs', 'b2ecc8b9786dc20afbabe7213b2c12c19c3a8fd9bcee05683ebf5fd7128fb009'],
  [directory + 'raw-document-cases.mjs', 'e43c73562223ea3d21c8fde0377fbc1378e787602692167d1b3b9166c032a881'],
  [directory + 'raw-document-cases.test.mjs', '5805453eb047295a9dbef838946e8e3c777603f443cfa2006fb0bc15c185b98a'],
  [directory + 'generation-two-artifacts.mjs', '849751b93ad7c162a44eb335659c1cfd0615894f5b5b3e06b553aa5e9299ba25'],
  [directory + 'generation-two-artifacts.test.mjs', '1139018049f30fdc4d2613f14e802d34ca259bc2a3bf2da4a67ccd86399143c5'],
  [directory + 'raw-carrier-oracle.mjs', '66ceef427f7b99446e78081b910e2f77a117c0b8f3679350bd2cff4c9237e84c'],
  [directory + 'raw-carrier-oracle.test.mjs', '513c46b21dc95be698025bf976453e3f38165e6c3d9a08c0988fe3f126628cb4'],
  [directory + 'raw-invocation-oracle.mjs', 'f970cf1b8d0a0e54ffac5aae55db6c759a3be38bea363a411963c661261f1533'],
  [directory + 'raw-invocation-oracle.test.mjs', 'f378165b09d9a5f4875a4c41e34b10e7b286fc09f076ad9423f999faa771f0d0'],
  ['architecture/contracts/v1/composition.schema.json', '2b4ad547782fa36748fa937f8fe9896da3c022c3e78e68c8edc06c47ffe36562'],
  ['architecture/contracts/v1/diagnostic-catalog.json', 'd59875576b4619dd01713bf108db14144030e30d8f0245e35f80c73563a4ca96'],
  ['architecture/qualification/v1/diagnostic-contract.json', '3f7d8a7a4a5a9d7b54f72d5e0915df3e437ab056107ab50294fa65a8e69b6c94'],
  [resourcePath, '9cc605e8a5b6b9553c4c12c1355eaf033daae8b7ecf000f7a159d88262c0674c'],
  ['architecture/qualification/v1/resource-boundary-vectors.json', 'e33d0890b4b6a398b2f79c262ab5ec79dde02ac7ef7600e321dd32b42dc8a24d'],
  ['architecture/qualification/v1/normalization-vectors.json', '64f97efa285f05924305f3b32d6b55f9fc5924950db55c2ed3938bbd11c81b99'],
  ['architecture/qualification/v1/decoder-vectors.json', '94d981c9193bd14cd61f5fbe3d7539dd7631f350cf7c3e36b57f731c674f3b1c'],
  ['architecture/qualification/v1/qualification-case-manifest.json', '25896f00963d6e206aa754b094ef4fa7946ef7acfd108eded6de6b9480ec423b'],
  ['architecture/qualification/implementation-clarifications/cases.json', 'dde24d56296754825a3afa084261518177e296516d04cb59e06f996417cd2fe7'],
  ['docs/decisions/0013-close-trusted-object-and-raw-carrier-semantics.md', '0ad41cbfb49f6fe5e04cf0b7cab1deecfc047c95c457446b97969333be108ff3'],
  ['docs/decisions/0014-close-duplicate-binding-record-semantics.md', 'eb071dcbd4d766ff65f8fb08635e3b4a7613c7f4cba38b00ec1047b2e81d9e6a'],
];

// category, independently fixed count, source, existing independent runner,
// generator export. This private literal has no registration/extension surface.
const specs = [
  ['cardinality', 18, 'duplicate-record-cases', 'duplicate-record-cases', 'duplicateRecordBaseCases'],
  ['rowFailures', 35, 'duplicate-record-cases', 'duplicate-record-cases', 'duplicateRecordRowFailureCases'],
  ['overlap', 5, 'duplicate-record-cases', 'duplicate-record-cases', 'duplicateRecordOverlapCases'],
  ['permutations', 727, 'duplicate-record-cases', 'duplicate-record-cases', 'duplicateRecordPermutationCases'],
  ['ordering', 3, 'duplicate-record-ordering', 'duplicate-record-cases', 'duplicateRecordOrderingCases'],
  ['orderingShuffle', 3, 'duplicate-record-ordering', 'duplicate-record-cases', 'duplicateRecordShuffledOrderingCases'],
  ['collector', 9, 'duplicate-record-ordering', 'duplicate-record-cases', 'duplicateRecordCollectorCases'],
  ['extendedOverlaps', 12, 'duplicate-record-extended-overlaps', 'duplicate-record-extended-overlaps', 'materializeDuplicateRecordExtendedOverlap'],
  ['resources', 6, 'duplicate-record-resources', 'duplicate-record-resources', 'duplicateRecordResourceCases'],
  ['rawDocuments', 123, 'raw-document-cases', 'raw-document-cases', 'rawDocumentCases'],
];

export function readCombinedSources() {
  assert.equal(arguments.length, 0, 'fixed source paths only');
  return Object.fromEntries(pins.map(([path]) => [path, readFileSync(new URL(path, root))]));
}

// A finite in-memory fingerprint seam for negative tests; never loads code or
// selects filesystem paths from the submitted bundle. No serializer touches it.
export function checkCombinedSourceBytes(bundle) {
  assert.equal(arguments.length, 1);
  assert.ok(bundle !== null && typeof bundle === 'object' && !types.isProxy(bundle), 'source-bundle-shape');
  assert.equal(Object.getPrototypeOf(bundle), Object.prototype, 'source-bundle-shape');
  const descriptors = Object.getOwnPropertyDescriptors(bundle);
  assert.equal(Reflect.ownKeys(descriptors).length, pins.length, 'source-bundle-shape');
  return pins.map(([path, expected]) => {
    const descriptor = Object.getOwnPropertyDescriptor(descriptors, path)?.value;
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value'), 'source-bundle-shape');
    assert.ok(types.isUint8Array(descriptor.value)
      && Object.getPrototypeOf(descriptor.value) === Buffer.prototype, 'source-bundle-shape');
    assert.equal(hash(descriptor.value), expected, `source-fingerprint: ${path}`);
    return fingerprint(path, descriptor.value);
  });
}

function authenticatedSources() {
  const bytes = readCombinedSources();
  const artifacts = checkCombinedSourceBytes(bytes);
  const subject = fingerprint(subjectPath, readFileSync(new URL(subjectPath, root)));
  const runner = fingerprint(runnerPath, readFileSync(new URL(runnerPath, root)));
  return { bytes, identity: { artifacts, subject, runner } };
}

function* sourceRows(category) {
  switch (category) {
    case 'cardinality': yield* duplicateRecordBaseCases(); break;
    case 'rowFailures': yield* duplicateRecordRowFailureCases(); break;
    case 'overlap': yield* duplicateRecordOverlapCases(); break;
    case 'permutations': yield* duplicateRecordPermutationCases(); break;
    case 'ordering': yield* duplicateRecordOrderingCases(); break;
    case 'orderingShuffle': yield* duplicateRecordShuffledOrderingCases(); break;
    case 'collector': yield* duplicateRecordCollectorCases(); break;
    case 'extendedOverlaps':
      assert.equal(extendedOverlapRecipes.length, 13);
      assert.equal(extendedOverlapRecipes[12].caseId, relationId);
      for (const recipe of extendedOverlapRecipes.slice(0, 12)) {
        yield materializeDuplicateRecordExtendedOverlap(recipe.caseId);
      }
      break;
    case 'resources': yield* duplicateRecordResourceCases(); break;
    case 'rawDocuments': yield* rawDocumentCases(); break;
    default: throw new Error('closed category');
  }
}

function assemble(authenticated) {
  const { bytes, identity } = authenticated;
  // Only byte-authenticated repository JSON is parsed. Raw document source
  // strings are never parsed, numerically projected or reconstructed here.
  const base = JSON.parse(bytes[directory + 'duplicate-record-recipes.json'].toString('utf8'));
  const resource = JSON.parse(bytes[resourcePath].toString('utf8'));
  const artifact = path => {
    const found = identity.artifacts.find(value => value.path === path);
    assert.ok(found, 'closed artifact reference');
    return found;
  };
  assert.equal(base.status, 'proposed-fixture-only');
  const categories = [];
  const streams = [];
  const seen = new Set();
  const aggregate = createHash('sha256');
  for (const [category, count, source, runner, generator] of specs) {
    const raw = category === 'rawDocuments';
    const caseIds = [];
    const caseRecipes = [];
    const lines = [];
    const digest = createHash('sha256');
    // One complete world at a time, including the six resource worlds. Keep
    // encoded evidence, not resource object graphs or a second semantic model.
    for (const value of sourceRows(category)) {
      assert.ok(caseIds.length < count, 'extra source case');
      assert.equal(typeof value.caseId, 'string');
      assert.equal(seen.has(value.caseId), false, 'duplicate source case');
      assert.equal(value.proposedOnly, true);
      assert.ok(Object.hasOwn(value, 'expected'), 'complete result required');
      assert.ok(Object.hasOwn(value, raw ? 'inputRecipe' : 'input'));
      seen.add(value.caseId);
      caseIds.push(value.caseId);
      const recipe = { caseId: value.caseId };
      for (const key of ['parameters', 'sourceCaseId']) {
        if (Object.hasOwn(value, key)) recipe[key] = structuredClone(value[key]);
      }
      caseRecipes.push(recipe);
      // Both serializers receive only the fixed, owned source-fixture rows.
      const line = (raw ? JSON.stringify(value) : canonicalize(value)) + '\n';
      lines.push(line);
      digest.update(line, 'utf8');
      aggregate.update(line, 'utf8');
    }
    assert.equal(caseIds.length, count, 'missing source case');
    const sha256 = digest.digest('hex');
    if (Object.hasOwn(base.streams, category)) {
      assert.deepEqual({ count, sha256 }, base.streams[category], 'existing closed stream pin');
    }
    categories.push({ category, count, sha256, encoding: raw ? rawEncoding : jcsEncoding,
      source: artifact(directory + source + '.mjs'), runner: artifact(directory + runner + '.test.mjs'),
      generator, representation: raw ? 'complete source row with serializable inputRecipe' : 'complete source row with inline input',
      recipeReference: categories.length < 7 ? 'baseRecipeManifest' : `recipeSources.${category}`,
      caseIds, caseRecipes });
    streams.push({ category, text: lines.join('') });
  }
  assert.equal(seen.size, 941, 'independently fixed combined count');
  const manifest = {
    kind: 'get-modular.private-combined-case-inventory', version: 1,
    status: 'proposed-only', scope, coreExecution: 'none',
    source: { commit: combinedInventorySource, role: 'declared authoring basis; not an observed execution SHA' },
    byteIdentity: identity,
    fingerprintScope: 'exact file bytes only; independent existing runners own semantic checks; no test-success or custody assertion',
    categoryOrder: specs.map(([category]) => category), totalCount: 941,
    aggregateEncoding: 'concatenate the ten complete stream texts in categoryOrder; use each category encoding without added separators',
    aggregateSha256: aggregate.digest('hex'), categories,
    manifestEncoding: 'RFC8785 UTF-8 followed by one LF; verifier requires this exact spelling',
    baseRecipeManifest: base,
    resourceSource: { artifact: artifact(resourcePath), profile: resource },
    recipeSources: {
      extendedOverlaps: { historicalBasis: extendedOverlapSource,
        sourceRole: 'historical recipe basis, not current execution SHA',
        policy: structuredClone(extendedOverlapPolicy), recipes: structuredClone(extendedOverlapRecipes),
        enumeration: 'first twelve recipes in original order; thirteenth is a separate relation',
        materializer: 'materializeDuplicateRecordExtendedOverlap' },
      resources: { historicalBasis: duplicateRecordResourceSource,
        sourceRole: 'historical recipe basis, not current execution SHA',
        policy: structuredClone(duplicateRecordResourcePolicy), recipes: structuredClone(duplicateRecordResourceRecipes),
        streamContract: structuredClone(duplicateRecordResourceStream), enumeration: 'original six recipe rows in order' },
      rawDocuments: { historicalBasis: rawDocumentSource,
        sourceRole: 'historical recipe basis, not current execution SHA',
        numberCoverage: structuredClone(rawNumberCoverage), retainedCoverage: structuredClone(retainedRawCoverage),
        enumeration: 'rawDocumentCases() order; complete inputRecipe, schemaValidCompanion and expected retained',
        materializer: { path: directory + 'raw-document-cases.mjs', export: 'materializeRawDocumentInput', argument: 'original caseId' },
        representation: 'utf8 source text and hex source text remain exact strings; carrier kind recipes retain detached/shared/not-uint8array construction; never serialize materialized carriers' },
    },
    remaining: [
      { inventory: 'trusted-object-descriptor-and-ownership', includedIn941: false,
        reference: artifact('docs/decisions/0013-close-trusted-object-and-raw-carrier-semantics.md'),
        representation: 'separate live-object inventory required; descriptors, realms, cycles and aliases are not plain JSON fixtures' },
      { inventory: 'raw-invocation-observations', includedIn941: false,
        source: artifact(directory + 'raw-invocation-oracle.mjs'), runner: artifact(directory + 'raw-invocation-oracle.test.mjs'),
        invocationCases: 62, pathCases: 5, mutants: 25,
        representation: 'separate live invocation and ownership observations; no complete compiler-result substitution' },
      { inventory: 'raw-carrier-observations', includedIn941: false,
        source: artifact(directory + 'raw-carrier-oracle.mjs'), runner: artifact(directory + 'raw-carrier-oracle.test.mjs'),
        representation: 'separate carrier feasibility observations; no complete compiler-result substitution' },
      { inventory: 'ordered-many-reversal-relation', includedIn941: false,
        source: artifact(directory + 'duplicate-record-extended-overlaps.mjs'),
        fixture: materializeDuplicateRecordExtendedOverlap(relationId),
        representation: 'two inputs and an expected relation; no invented complete success plans or digests' },
      { inventory: 'successor-authority-and-evidence', includedIn941: false,
        items: ['existing independent runner execution', 'remaining semantic mutation inventory',
          'primary command-chain wiring', 'primary retained capture and ledger',
          'combined acceptance and owner scope expansion', 'Core execution and runtime qualification'] },
    ],
  };
  return { manifest, manifestText: canonicalize(manifest) + '\n', streams };
}

// This reference is private and never returned by alias. Repeated verification
// reauthenticates source files but does not repeatedly expand resource fixtures.
let reference;
function closedReference() {
  const authenticated = authenticatedSources();
  if (reference === undefined) reference = assemble(authenticated);
  else assert.deepEqual(authenticated.identity, reference.manifest.byteIdentity, 'source bytes changed during inventory session');
  return reference;
}

export function buildCombinedInventory() {
  assert.equal(arguments.length, 0, 'closed builder takes no parameters');
  return structuredClone(closedReference());
}

// Retention protocol: save manifestText and each stream.text exactly. Submit
// manifestText, then accept(category, text) once per category in fixed order,
// then finish(). No caller object, parsed raw document or self-reported result
// enters a serializer. Exact string comparison precedes count/digest checks.
export function createCombinedInventoryVerifier(manifestText) {
  assert.equal(arguments.length, 1);
  assert.equal(typeof manifestText, 'string', 'manifest must be primitive text');
  const expected = closedReference();
  assert.equal(manifestText === expected.manifestText, true, 'closed manifest mismatch');
  let position = 0;
  let stopped = false;
  return Object.freeze({
    accept(category, text) {
      try {
        assert.equal(arguments.length, 2);
        assert.equal(stopped, false, 'verifier is closed');
        assert.equal(typeof category, 'string', 'category must be primitive text');
        assert.equal(typeof text, 'string', 'stream must be primitive text');
        assert.ok(position < specs.length, 'extra category');
        const stream = expected.streams[position];
        const metadata = expected.manifest.categories[position];
        assert.equal(category, stream.category, 'category order mismatch');
        assert.equal(text === stream.text, true, 'complete stream mismatch');
        assert.equal(text.split('\n').length - 1, metadata.count, 'stream count mismatch');
        assert.equal(hash(text), metadata.sha256, 'stream digest mismatch');
        position += 1;
      } catch (error) { stopped = true; throw error; }
    },
    finish() {
      try {
        assert.equal(arguments.length, 0);
        assert.equal(stopped, false, 'verifier is closed');
        assert.equal(position, 10, 'missing category');
        closedReference();
        stopped = true;
        return { status: 'proposed-only', scope, totalCount: 941,
          counts: Object.fromEntries(expected.manifest.categories.map(row => [row.category, row.count])),
          streamHashes: Object.fromEntries(expected.manifest.categories.map(row => [row.category, row.sha256])),
          aggregateSha256: expected.manifest.aggregateSha256 };
      } catch (error) { stopped = true; throw error; }
    },
  });
}

// Optional live expansion uses exactly the existing closed materializer. Its
// return value is deliberately outside the serializable inventory representation.
export function materializeCombinedRawInput(caseId) {
  assert.equal(arguments.length, 1);
  assert.equal(typeof caseId, 'string', 'one closed raw case ID');
  const inventory = closedReference();
  assert.ok(inventory.manifest.categories[9].caseIds.includes(caseId), 'unknown combined raw case ID');
  return materializeRawDocumentInput(caseId);
}
