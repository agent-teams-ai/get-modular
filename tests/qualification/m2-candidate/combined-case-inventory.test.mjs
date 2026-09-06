// Independent aggregation checks. Existing source runners own semantics.
// No Core subject is imported, and no filesystem artifact is written.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalize as secondCanonicalize } from 'json-canonicalize';
import { buildCombinedInventory, createCombinedInventoryVerifier, combinedInventorySource,
  readCombinedSources, checkCombinedSourceBytes, materializeCombinedRawInput } from './combined-case-inventory.mjs';
import { duplicateRecordBaseCases, duplicateRecordRowFailureCases,
  duplicateRecordOverlapCases, duplicateRecordPermutationCases } from './duplicate-record-cases.mjs';
import { duplicateRecordOrderingCases, duplicateRecordShuffledOrderingCases,
  duplicateRecordCollectorCases } from './duplicate-record-ordering.mjs';
import { duplicateRecordExtendedOverlapCases, extendedOverlapRecipes,
  extendedOverlapPolicy } from './duplicate-record-extended-overlaps.mjs';
import { duplicateRecordResourceCases, duplicateRecordResourceRecipes,
  duplicateRecordResourcePolicy } from './duplicate-record-resources.mjs';
import { rawDocumentCases, rawNumberCoverage, retainedRawCoverage } from './raw-document-cases.mjs';

const directory = 'tests/qualification/m2-candidate/';
const root = new URL('../../../', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestText = value => secondCanonicalize(value) + '\n';
const counts = { cardinality: 18, rowFailures: 35, overlap: 5, permutations: 727,
  ordering: 3, orderingShuffle: 3, collector: 9, extendedOverlaps: 12, resources: 6, rawDocuments: 123 };
const linesOf = text => { assert.ok(text.endsWith('\n')); return text.slice(0, -1).split('\n'); };
const streamText = lines => lines.join('\n') + '\n';

function* independentExtendedRows() {
  let ordinal = 0;
  for (const row of duplicateRecordExtendedOverlapCases()) {
    if (ordinal < 12) { assert.ok(Object.hasOwn(row, 'expected')); yield row; }
    else {
      assert.equal(ordinal, 12);
      assert.equal(row.caseId, 'od006.extended-overlap.v1/ordered-many-reversal');
      assert.equal(Object.hasOwn(row, 'expected'), false);
    }
    ordinal += 1;
  }
  assert.equal(ordinal, 13);
}

// Separate literal category dispatch and count inventory. No manifest field
// chooses a generator, expected row, parameter, source file or outcome.
const independentStreams = [
  ['cardinality', duplicateRecordBaseCases], ['rowFailures', duplicateRecordRowFailureCases],
  ['overlap', duplicateRecordOverlapCases], ['permutations', duplicateRecordPermutationCases],
  ['ordering', duplicateRecordOrderingCases], ['orderingShuffle', duplicateRecordShuffledOrderingCases],
  ['collector', duplicateRecordCollectorCases], ['extendedOverlaps', independentExtendedRows],
  ['resources', duplicateRecordResourceCases], ['rawDocuments', rawDocumentCases],
];

function submit(inventory, streams = inventory.streams) {
  const verifier = createCombinedInventoryVerifier(inventory.manifestText);
  for (const { category, text } of streams) verifier.accept(category, text);
  return verifier.finish();
}

function replaceStream(inventory, category, text) {
  return inventory.streams.map(row => row.category === category ? { category, text } : row);
}

// Only owned test-fixture JSON is parsed and serialized here. A raw recipe's
// embedded source string is never passed to JSON.parse or Number.
function changeRow(inventory, category, ordinal, mutate) {
  const lines = linesOf(inventory.streams.find(row => row.category === category).text);
  const value = JSON.parse(lines[ordinal]);
  mutate(value);
  lines[ordinal] = category === 'rawDocuments' ? JSON.stringify(value) : secondCanonicalize(value);
  return streamText(lines);
}

test('closed combined result recipes and submission rejection', () => {
  // All checks precede the sole success observation. A thrown assertion prevents
  // emission; this runner does not infer success of the referenced other tests.
  const completed = [];
  const check = (id, run) => { run(); completed.push(id); };
  const bytes = readCombinedSources();
  const admitted = checkCombinedSourceBytes(bytes);
  const inventory = buildCombinedInventory();
  const basePath = directory + 'duplicate-record-recipes.json';
  assert.equal(sha(bytes[basePath]), 'ce31bf0953e30b1aeec43fa7a5e507ed8b3553d1567d1c5dde8238761ec18063');
  const base = JSON.parse(bytes[basePath].toString('utf8'));

  check('fixed-941-category-domain-and-complete-recipe-manifests', () => {
    assert.equal(combinedInventorySource, '9b5cbd564e5700585ab934aaf86d878a01d7939f');
    assert.equal(inventory.manifest.source.commit, combinedInventorySource);
    assert.equal(inventory.manifest.status, 'proposed-only');
    assert.equal(inventory.manifest.scope, 'fixture-consistency-only');
    assert.equal(inventory.manifest.coreExecution, 'none');
    assert.equal(inventory.manifest.totalCount, 941);
    assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), 941);
    assert.deepEqual(inventory.manifest.categoryOrder, Object.keys(counts));
    assert.deepEqual(inventory.streams.map(row => row.category), Object.keys(counts));
    assert.deepEqual(inventory.manifest.categories.map(row => [row.category, row.count]), Object.entries(counts));
    assert.deepEqual(inventory.manifest.baseRecipeManifest, base);
    assert.deepEqual(inventory.manifest.byteIdentity.artifacts, admitted);
    assert.equal(inventory.manifestText, manifestText(inventory.manifest));
    const recipes = inventory.manifest.recipeSources;
    assert.deepEqual(recipes.extendedOverlaps.recipes, extendedOverlapRecipes);
    assert.deepEqual(recipes.extendedOverlaps.policy, extendedOverlapPolicy);
    assert.equal(recipes.extendedOverlaps.historicalBasis, '730665ff7fe7e6c993dad8f98a437f849f49d4f5');
    assert.deepEqual(recipes.resources.recipes, duplicateRecordResourceRecipes);
    assert.deepEqual(recipes.resources.policy, duplicateRecordResourcePolicy);
    assert.equal(recipes.resources.historicalBasis, '51ca2bf68ac311b8bd0af101eaa9e8df1a4ac564');
    assert.deepEqual(recipes.rawDocuments.numberCoverage, rawNumberCoverage);
    assert.deepEqual(recipes.rawDocuments.retainedCoverage, retainedRawCoverage);
    assert.deepEqual(recipes.rawDocuments.materializer, { path: directory + 'raw-document-cases.mjs',
      export: 'materializeRawDocumentInput', argument: 'original caseId' });
  });

  check('independent-repeat-complete-rows-original-order-and-existing-stream-pins', () => {
    const seen = new Set();
    const aggregate = createHash('sha256');
    for (const [index, [category, generate]] of independentStreams.entries()) {
      const submitted = linesOf(inventory.streams[index].text);
      const metadata = inventory.manifest.categories[index];
      const digest = createHash('sha256');
      let ordinal = 0;
      // The independent pass also consumes resource fixtures sequentially.
      for (const row of generate()) {
        assert.equal(seen.has(row.caseId), false);
        seen.add(row.caseId);
        const encoded = category === 'rawDocuments' ? JSON.stringify(row) : secondCanonicalize(row);
        assert.equal(submitted[ordinal] === encoded, true, `${category}: complete source row ${ordinal}`);
        assert.equal(metadata.caseIds[ordinal], row.caseId);
        const recipe = { caseId: row.caseId };
        for (const key of ['parameters', 'sourceCaseId']) if (Object.hasOwn(row, key)) recipe[key] = row[key];
        assert.deepEqual(metadata.caseRecipes[ordinal], recipe);
        digest.update(encoded + '\n', 'utf8');
        aggregate.update(encoded + '\n', 'utf8');
        ordinal += 1;
      }
      assert.equal(ordinal, counts[category]);
      assert.equal(submitted.length, counts[category]);
      assert.equal(metadata.caseIds.length, ordinal);
      assert.equal(metadata.caseRecipes.length, ordinal);
      const identity = { count: ordinal, sha256: digest.digest('hex') };
      assert.equal(metadata.sha256, identity.sha256);
      if (Object.hasOwn(base.streams, category)) assert.deepEqual(identity, base.streams[category]);
      if (category === 'rawDocuments') assert.equal(identity.sha256, 'b901496ffb1ad302a127abe2f8eceeae03eb7c9566871edc94d2720a6f6be410');
    }
    assert.equal(seen.size, 941);
    assert.equal(inventory.manifest.aggregateSha256, aggregate.digest('hex'));
    const again = buildCombinedInventory();
    assert.deepEqual(again, inventory);
    assert.notEqual(again.manifest, inventory.manifest);
    again.manifest.status = 'changed';
    again.streams[0].text += 'changed';
    assert.equal(inventory.manifest.status, 'proposed-only');
    assert.notEqual(again.streams[0].text, inventory.streams[0].text);
  });

  check('raw-lexemes-and-original-materializer-without-numeric-roundtrip', () => {
    const rows = linesOf(inventory.streams[9].text).map(line => JSON.parse(line));
    for (const [ordinal, lexeme] of [['12', '1.0000000000000001'], ['14', '1e-400'], ['20', '-0']]) {
      const caseId = `od005.raw-document.v1/number/${ordinal}/declaration-version`;
      const row = rows.find(value => value.caseId === caseId);
      assert.ok(row.inputRecipe.declarations[0].source.includes(`"schemaVersion":${lexeme}`));
      const input = materializeCombinedRawInput(caseId);
      assert.equal(Buffer.from(input.declarations[0]).toString('utf8'), row.inputRecipe.declarations[0].source);
    }
    assert.throws(() => materializeCombinedRawInput('unlisted'), /unknown combined raw case ID/);
    assert.throws(() => materializeCombinedRawInput({}), /one closed raw case ID/);
  });

  check('separate-live-and-relational-inventories-remain-explicit', () => {
    const remaining = inventory.manifest.remaining;
    for (const name of ['trusted-object-descriptor-and-ownership', 'raw-invocation-observations',
      'raw-carrier-observations', 'ordered-many-reversal-relation', 'successor-authority-and-evidence']) {
      assert.equal(remaining.find(row => row.inventory === name).includedIn941, false);
    }
    const relation = remaining.find(row => row.inventory === 'ordered-many-reversal-relation').fixture;
    assert.equal(Object.hasOwn(relation, 'expected'), false);
    assert.ok(relation.inputs.forward && relation.inputs.reverse && relation.expectedRelation);
    assert.equal(inventory.manifest.categories.some(row => row.caseIds.includes(relation.caseId)), false);
    const invocation = remaining.find(row => row.inventory === 'raw-invocation-observations');
    assert.deepEqual([invocation.invocationCases, invocation.pathCases, invocation.mutants], [62, 5, 25]);
  });

  check('positive-submission-and-terminal-state', () => {
    const result = submit(inventory);
    assert.deepEqual(result.counts, counts);
    assert.equal(result.totalCount, 941);
    const verifier = createCombinedInventoryVerifier(inventory.manifestText);
    for (const row of inventory.streams) verifier.accept(row.category, row.text);
    verifier.finish();
    assert.throws(() => verifier.finish(), /verifier is closed/);
    assert.throws(() => verifier.accept('cardinality', inventory.streams[0].text), /verifier is closed/);
  });

  check('missing-duplicate-extra-and-reordered-categories', () => {
    const streams = inventory.streams;
    for (const mutant of [streams.slice(1), streams.slice(0, -1), [...streams].reverse(),
      [streams[0], ...streams], [...streams, streams[0]],
      [...streams.slice(0, 3), { category: 'unlisted', text: streams[3].text }, ...streams.slice(4)]]) {
      assert.throws(() => submit(inventory, mutant), /category/);
    }
  });

  check('missing-duplicate-extra-and-reordered-complete-cases', () => {
    const lines = linesOf(inventory.streams[0].text);
    const extra = JSON.parse(lines[0]); extra.caseId = 'unlisted-case';
    for (const changed of [lines.slice(1), [...lines, lines[0]], [lines[0], ...lines.slice(0, -1)],
      [...lines].reverse(), [...lines, secondCanonicalize(extra)]]) {
      assert.throws(() => submit(inventory, replaceStream(inventory, 'cardinality', streamText(changed))), /complete stream mismatch/);
    }
  });

  check('changed-input-result-parameters-resource-and-raw-byte-recipes', () => {
    const mutations = [
      ['cardinality', 0, row => { row.input.profile.roots = []; }],
      ['cardinality', 0, row => { row.expected.diagnostics[0].code = 'binding.duplicate'; }],
      ['cardinality', 0, row => { row.expected = { ok: true, plan: {}, digest: 'fabricated' }; }],
      ['permutations', 0, row => { row.sourceCaseId = 'substituted'; }],
      ['orderingShuffle', 0, row => { row.parameters.axis = 'substituted'; }],
      ['extendedOverlaps', 6, row => { row.expected.diagnostics.pop(); }],
      ['resources', 4, row => { row.input.profile.bindings[0].providerImplementationIds.pop(); }],
      ['resources', 4, row => { row.parameters.resourcePointer = '/limits/totalSlots'; }],
      ['rawDocuments', 0, row => { row.inputRecipe.profile.source += ' '; }],
      ['rawDocuments', 0, row => { row.schemaValidCompanion.profile.roots = []; }],
    ];
    for (const [category, ordinal, mutate] of mutations) {
      const changed = changeRow(inventory, category, ordinal, mutate);
      assert.throws(() => submit(inventory, replaceStream(inventory, category, changed)), /complete stream mismatch/);
    }
    const raw = inventory.streams[9].text;
    const rounded = raw.replace('1.0000000000000001', '1');
    assert.notEqual(rounded, raw);
    assert.throws(() => submit(inventory, replaceStream(inventory, 'rawDocuments', rounded)), /complete stream mismatch/);
    const carrier = raw.replace('"kind":"detached"', '"kind":"shared"');
    assert.notEqual(carrier, raw);
    assert.throws(() => submit(inventory, replaceStream(inventory, 'rawDocuments', carrier)), /complete stream mismatch/);
  });

  check('forged-manifest-identities-counts-and-attacker-rehashed-payload', () => {
    const mutations = [
      value => { value.totalCount = 940; }, value => { value.categories.pop(); },
      value => { value.categories.push(structuredClone(value.categories[0])); },
      value => { value.categories[1] = structuredClone(value.categories[0]); },
      value => { value.categories.reverse(); }, value => { value.categoryOrder.reverse(); },
      value => { value.categories[0].caseIds.reverse(); },
      value => { value.categories[0].count = 19; },
      value => { value.categories[0].sha256 = '0'.repeat(64); },
      value => { value.categories[0].source.sha256 = 'sha256:' + '0'.repeat(64); },
      value => { value.byteIdentity.runner.sha256 = 'sha256:' + '0'.repeat(64); },
      value => { value.baseRecipeManifest.domains.recordCounts = [2]; },
      value => { value.recipeSources.resources.historicalBasis = combinedInventorySource; },
      value => { value.remaining = []; }, value => { value.status = 'accepted'; },
    ];
    for (const mutate of mutations) {
      const forged = structuredClone(inventory.manifest); mutate(forged);
      assert.throws(() => createCombinedInventoryVerifier(manifestText(forged)), /closed manifest mismatch/);
    }
    const changed = changeRow(inventory, 'cardinality', 0, row => { row.expected.diagnostics = []; });
    const forged = structuredClone(inventory.manifest);
    forged.categories[0].sha256 = sha(changed);
    forged.aggregateSha256 = sha(replaceStream(inventory, 'cardinality', changed).map(row => row.text).join(''));
    assert.throws(() => createCombinedInventoryVerifier(manifestText(forged)), /closed manifest mismatch/);
  });

  check('admitted-file-bytes-including-every-source-and-runner-fail-on-drift', () => {
    for (const path of Object.keys(bytes)) {
      const changed = { ...bytes, [path]: Buffer.concat([bytes[path], Buffer.from('\n')]) };
      assert.throws(() => checkCombinedSourceBytes(changed), /source-fingerprint/);
    }
    const missing = { ...bytes }; delete missing[basePath];
    assert.throws(() => checkCombinedSourceBytes(missing), /source-bundle-shape/);
    assert.throws(() => checkCombinedSourceBytes({ ...bytes, extra: Buffer.from('x') }), /source-bundle-shape/);
    assert.throws(() => checkCombinedSourceBytes({ ...bytes, [basePath]: 'not bytes' }), /source-bundle-shape/);
  });

  check('never-serialize-arbitrary-live-submissions-and-poison-failed-verifiers', () => {
    let calls = 0;
    const live = { get toJSON() { calls += 1; throw new Error('caller serializer'); } };
    assert.throws(() => createCombinedInventoryVerifier(live), /primitive text/);
    const verifier = createCombinedInventoryVerifier(inventory.manifestText);
    assert.throws(() => verifier.accept('cardinality', live), /primitive text/);
    assert.throws(() => verifier.accept('cardinality', inventory.streams[0].text), /verifier is closed/);
    assert.throws(() => verifier.finish(), /verifier is closed/);
    const bundle = { ...bytes };
    Object.defineProperty(bundle, basePath, { get() { calls += 1; return bytes[basePath]; } });
    assert.throws(() => checkCombinedSourceBytes(bundle), /source-bundle-shape/);
    const proxy = new Proxy({}, { ownKeys() { calls += 1; throw new Error('caller trap'); } });
    assert.throws(() => checkCombinedSourceBytes(proxy), /source-bundle-shape/);
    const nestedProxy = new Proxy(bytes[basePath], {
      getPrototypeOf() { calls += 1; throw new Error('nested caller trap'); },
    });
    const prototypeProxy = new Proxy(Buffer.prototype, {
      getPrototypeOf() { calls += 1; throw new Error('prototype caller trap'); },
    });
    const alteredBuffer = Object.setPrototypeOf(Buffer.from(bytes[basePath]), prototypeProxy);
    const alteredObject = Object.create(prototypeProxy);
    const revoked = Proxy.revocable(bytes[basePath], {}); revoked.revoke();
    for (const value of [nestedProxy, alteredBuffer, alteredObject, revoked.proxy]) {
      assert.throws(() => checkCombinedSourceBytes({ ...bytes, [basePath]: value }),
        { code: 'ERR_ASSERTION' });
    }

    assert.equal(calls, 0);
    assert.throws(() => buildCombinedInventory({}), /closed builder/);
    assert.throws(() => readCombinedSources('unlisted'), /fixed source paths/);
  });

  check('source-and-runner-observation-bytes-still-match', () => {
    assert.deepEqual(checkCombinedSourceBytes(readCombinedSources()), admitted);
    for (const artifact of [inventory.manifest.byteIdentity.subject, inventory.manifest.byteIdentity.runner]) {
      assert.equal('sha256:' + sha(readFileSync(new URL(artifact.path, root))), artifact.sha256);
    }
  });
  const result = submit(inventory);
  // A primitive string containing owned metadata only. The primary owns external
  // capture, command wiring, exact checkout observation and retained evidence.
  process.stdout.write(JSON.stringify({
    kind: 'get-modular.private-combined-inventory-test-observation',
    status: 'proposed-only', scope: 'fixture-consistency-only',
    declaredSource: combinedInventorySource, sourceRole: 'authoring reference, not observed checkout SHA',
    subject: inventory.manifest.byteIdentity.subject, runner: inventory.manifest.byteIdentity.runner,
    observedProcess: { node: process.version, execPath: process.execPath,
      argv: [...process.argv], execArgv: [...process.execArgv] },
    reproductionCommand: 'node --test tests/qualification/m2-candidate/combined-case-inventory.test.mjs',
    totalCount: 941, counts, streamHashes: result.streamHashes, aggregateSha256: result.aggregateSha256,
    completedChecks: completed,
    independentSemanticChecks: 'owned by referenced existing runners; their execution is separate',
  }) + '\n');
});
