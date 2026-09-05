import assert from 'node:assert/strict';
import resource from '../../../architecture/qualification/v1/resource-profile-v2.json' with { type: 'json' };
import contract from '../../../architecture/qualification/v1/diagnostic-contract.json' with { type: 'json' };
import boundaries from '../../../architecture/qualification/v1/resource-boundary-vectors.json' with { type: 'json' };
import { expectedDigest } from './scale-output.mjs';

// Independent M1 object recipes. Only the injected public compiler is a subject.
// Every invocation below remains inside the JSON occurrence/string/depth
// envelope, including semantic overflows, so complete result equality applies.
// Build inputs inside run(), sequentially; retain no large invocation globally.
assert.deepEqual(resource, {
  kind: 'get-modular.resource-profile', profileId: 'get-modular/resource-profile/v1-standard', profileVersion: 2,
  limits: {
    declarationRawDocumentBytes: 1048576, profileRawDocumentBytes: 8388608, aggregateRawBytes: 16777216,
    jsonValueOccurrences: 2097152, jsonDepth: 32, aggregateStringBytes: 8388608,
    identifierBytes: 128, ownerPathSegments: 8, declarations: 4096,
    capabilitiesPerDeclaration: 64, slotsPerDeclaration: 128, totalCapabilities: 65536, totalSlots: 65536,
    roots: 1024, selections: 4096, bindings: 65536, graphEdges: 262144,
    providersPerManySlot: 1024, graphDepth: 2048, diagnostics: 256, diagnosticPathSegments: 32,
  },
});
const rules = [
  ['roots', 'profile', 'structural', 'profile.root-count', ['document.decoded'], 'profile'],
  ['selections', 'profile', 'structural', 'profile.selection-count', ['document.decoded'], 'profile'],
  ['bindings', 'profile', 'structural', 'profile.binding-count', ['document.decoded'], 'profile'],
  ['graphEdges', 'graph', 'empty', 'graph.edge-count', ['profile.selection-census-complete'], 'graph'],
  ['providersPerManySlot', 'binding', 'structural', 'binding.provider-count',
    ['binding.consumer-census-complete', 'binding.slot-census-complete'], 'binding'],
  ['graphDepth', 'graph', 'empty', 'graph.depth',
    ['graph.selected-node-census-complete', 'graph.positive-edge-subgraph-complete'], 'graph'],
  ['diagnostics', 'output', 'empty', 'output.diagnostic-count', ['output.diagnostic-stream-complete'], 'output'],
];
for (const [limitName, phase, policy, prerequisiteGroup, prerequisites, suppressionScope] of rules) {
  assert.equal(contract.limitPhases[limitName], phase);
  assert.equal(contract.limitPathPolicies[limitName], policy);
  assert.deepEqual(contract.prerequisiteCatalog.limits.filter(row => row.limitName === limitName),
    [{ limitName, prerequisiteGroup, prerequisites, suppressionScope }]);
}
for (const alias of ['selectedNodes', 'manyProviders', 'rawDocumentBytes']) {
  assert.equal(Object.hasOwn(resource.limits, alias), false);
  assert.equal(contract.prerequisiteCatalog.limits.some(row => row.limitName === alias), false);
}
const collectorRecipe = boundaries.diagnosticCollector;
assert.deepEqual([collectorRecipe.limit, collectorRecipe.maximumOmitted], [256, 262144]);

const sequence = (length, make) => Array.from({ length }, (_, i) => make(i));
const numbered = (prefix, i, width = 4) => `${prefix}${String(i).padStart(width, '0')}`;
const moduleId = name => `x/${name}`;
const implementationId = name => `x/${name}/i`;
const selection = name => ({ moduleId: moduleId(name), implementationId: implementationId(name) });
const capability = () => ({ capabilityId: 'x/c', compatibility: { family: 'exact', familyVersion: 1, token: 'x/c' } });
const many = (min = 0, max = 1024) => ({ kind: 'many', min, max, order: 'profile' });
const slot = (slotId, cardinality = many()) => ({ slotId, ...capability(), cardinality });
const declaration = (name, slots = []) => ({ kind: 'get-modular.module-declaration', schemaVersion: 1,
  ...selection(name), owner: { authority: 'x', path: ['resource'] }, provides: [capability()], slots });
const binding = (consumer, slotId, providers) => ({ consumerImplementationId: implementationId(consumer),
  slotId, providerImplementationIds: providers.map(implementationId) });
const profile = (names, roots, bindings) => ({ kind: 'get-modular.composition-profile', schemaVersion: 1,
  profileId: 'x/resource', roots: roots.map(moduleId), selections: names.map(selection), bindings });
// Expected plans receive independently enumerated, already ordered recipe data;
// this assembler performs no selection, validation, sorting or graph traversal.
const planBinding = (consumer, slotId, providers) => ({ ...binding(consumer, slotId, providers), ...capability() });
const plan = (names, roots, bindings, order) => ({ kind: 'get-modular.composition-plan', schemaVersion: 1,
  profileId: 'x/resource', roots: roots.map(moduleId), selections: names.map(selection), bindings,
  dependencyOrder: order.map(implementationId) });
const path = tokens => tokens.map(value => ({ kind: typeof value === 'number' ? 'index' : 'field', value }));
const diagnostic = (code, phase, coordinate, details, tokens = []) => ({ code, phase, path: path(tokens), coordinate, details });
const reason = (code, phase, coordinate, value, tokens = []) => diagnostic(code, phase, coordinate, { reason: value }, tokens);
const schema = (tokens, value = 'invalid-format') => reason('schema.invalid-value', 'schema', {}, value, tokens);
const limit = (name, phase, tokens = []) => diagnostic('input.limit-exceeded', phase, {},
  { limitName: name, limit: resource.limits[name], actual: resource.limits[name] + 1 }, tokens);
const providerCoordinate = (consumer, slotId, provider) => ({ implementationId: implementationId(consumer),
  slotId, providerImplementationId: implementationId(provider) });
const truncated = omitted => diagnostic('diagnostics.truncated', 'output', {}, { omitted });
async function complete(compileComposition, input, expected) {
  const actual = await compileComposition(input);
  assert.deepEqual(actual, expected);
  assert.ok(Object.isFrozen(actual));
  assert.ok(Object.isFrozen(actual.ok ? actual.plan : actual.diagnostics));
}
async function success(compileComposition, input, expectedPlan) {
  const expected = { ok: true, plan: expectedPlan, digest: expectedDigest(expectedPlan) };
  await complete(compileComposition, input, expected);
}
const failure = (compileComposition, input, diagnostics) => complete(compileComposition, input, { ok: false, diagnostics });

const node = i => numbered('n', i);
function forestInput(variant) {
  const names = sequence(4096, node), declarations = [], roots = [], bindings = [];
  for (let i = 0; i < 4096; i += 1) {
    const root = i % 4 === 3;
    declarations.push(declaration(node(i), root ? [slot('dep', many(3, 3))] : []));
    if (root) {
      roots.push(node(i));
      bindings.push(binding(node(i), 'dep', [node(i - 1), node(i - 3), node(i - 2)]));
    }
  }
  const input = { declarations: declarations.reverse(), profile: profile(names.reverse(), roots.reverse(), bindings.reverse()) };
  if (variant === 'roots-over') input.profile.roots.push(moduleId(node(0)));
  if (variant === 'selections-over') input.profile.selections.push(selection(node(0)));
  assert.equal(input.declarations.length, 4096);
  assert.equal(input.profile.roots.length, variant === 'roots-over' ? 1025 : 1024);
  assert.equal(input.profile.selections.length, variant === 'selections-over' ? 4097 : 4096);
  return input;
}
function forestPlan() {
  // 1024 independent four-node stars; each root follows its three leaves.
  // This is also the maximum reachable selected-node population, at depth 2.
  return plan(sequence(4096, node), sequence(1024, g => node(4 * g + 3)),
    sequence(1024, g => planBinding(node(4 * g + 3), 'dep', [node(4 * g + 2), node(4 * g), node(4 * g + 1)])),
    sequence(4096, node));
}

const provider = i => numbered('p', i);
const slotName = i => numbered('s', i, 3);
function denseInput(over) {
  const providers = sequence(1024, provider), declarations = providers.map(name => declaration(name));
  const bindings = [];
  for (const consumer of ['c0', 'c1']) {
    declarations.push(declaration(consumer, sequence(128, i => slot(slotName(i)))));
    for (let i = 0; i < 128; i += 1) bindings.push(binding(consumer, slotName(i), [...providers].reverse()));
  }
  declarations.push(declaration('c2', [slot('tail', { kind: 'optional' })]));
  bindings.push(binding('c2', 'tail', over ? ['missing'] : []));
  // Einput = 2 * 128 * 1024; Eadj = 2 * 1024. The extra unknown
  // occurrence crosses Einput without increasing Evalid or adjacency.
  assert.equal(bindings.reduce((n, row) => n + row.providerImplementationIds.length, 0), 262144 + Number(over));
  return { declarations: declarations.reverse(),
    profile: profile([...providers, 'c2', 'c1', 'c0'], ['c2', 'c1', 'c0'], bindings.reverse()) };
}
function densePlan() {
  const bindings = [];
  for (const consumer of ['c0', 'c1']) for (let i = 0; i < 128; i += 1) {
    bindings.push(planBinding(consumer, slotName(i), sequence(1024, j => provider(1023 - j))));
  }
  bindings.push(planBinding('c2', 'tail', []));
  // c2 is initially ready and sorts before every leaf. c0 and c1 become
  // ready only after the final leaf, despite their smaller identities.
  return plan(['c0', 'c1', 'c2', ...sequence(1024, provider)], ['c0', 'c1', 'c2'], bindings,
    ['c2', ...sequence(1024, provider), 'c0', 'c1']);
}
function bindingCountInput(count) {
  // Complete profile totals include known unselected consumers. Unique rows
  // remain inert; no repeated-record policy or fabricated selected slots.
  return { declarations: [declaration('idle'), declaration('app')], profile: profile(['app'], ['app'],
    sequence(count, i => binding('idle', numbered('s', i, 5), []))) };
}

function duplicateManyInput() {
  return { declarations: [declaration('app', [slot('dep')]), declaration('a', [slot('dep', { kind: 'required' })]),
    declaration('b', [slot('dep', { kind: 'required' })]), declaration('spare')],
  profile: profile(['spare', 'b', 'app', 'a'], ['app', 'a'], [binding('app', 'dep', new Array(1024).fill('app')),
    binding('a', 'dep', ['b']), binding('b', 'dep', ['a'])]) };
}
const oversizedPath = ordinal => ['profile', 'bindings', ordinal, 'providerImplementationIds'];
const manyLimit = ordinal => limit('providersPerManySlot', 'binding', oversizedPath(ordinal));
const manyVariants = ['known', 'offset', 'partial-selection', 'partial-selection-large', 'unknown-consumer',
  'unselected-consumer', 'unknown-slot', 'ambiguous-consumer', 'ambiguous-slot', 'required', 'optional',
  'invalid-consumer', 'unrelated-invalid'];
function oversizedManyCase(variant) {
  const app = declaration('app', [slot('dep')]);
  const count = variant === 'partial-selection-large' ? 262145 : 1025;
  const input = { declarations: [app, declaration('other')],
    profile: profile(['app'], ['app'], [binding('app', 'dep', new Array(count).fill('app'))]) };
  const ordinal = variant === 'offset' ? 1 : 0;
  const schemaFailures = [], identityFailures = [], declarationFailures = [];
  if (variant === 'offset') {
    input.profile.bindings.unshift(null);
    schemaFailures.push(schema(['profile', 'bindings', 0], 'invalid-type'));
  }
  schemaFailures.push(schema(oversizedPath(ordinal)));
  if (variant.startsWith('partial-selection')) {
    input.profile.selections.push({ moduleId: 'x/bad', implementationId: 'BAD' });
    identityFailures.push(reason('identity.invalid', 'schema', {}, 'invalid-format', ['profile', 'selections', 1, 'implementationId']));
  }
  if (variant === 'unknown-consumer') {
    input.profile.selections = [selection('missing')]; input.profile.roots = [moduleId('missing')];
    input.profile.bindings[0].consumerImplementationId = implementationId('missing');
  }
  if (variant === 'unselected-consumer') {
    input.profile.selections = [selection('other')]; input.profile.roots = [moduleId('other')];
  }
  if (variant === 'unknown-slot') input.profile.bindings[0].slotId = 'unknown';
  if (variant === 'ambiguous-consumer') {
    input.declarations.push(declaration('app', [slot('dep', { kind: 'required' })]));
    declarationFailures.push(reason('declaration.duplicate-implementation', 'declaration',
      { implementationId: implementationId('app') }, 'duplicate'));
  }
  if (variant === 'ambiguous-slot') {
    app.slots.push(slot('dep', { kind: 'required' }));
    declarationFailures.push(reason('declaration.duplicate-slot', 'declaration',
      { implementationId: implementationId('app'), slotId: 'dep' }, 'duplicate', ['slots', 1]));
  }
  if (variant === 'required' || variant === 'optional') app.slots[0].cardinality = { kind: variant };
  const unknownFields = [];
  if (variant === 'invalid-consumer' || variant === 'unrelated-invalid') {
    const index = variant === 'invalid-consumer' ? 0 : 1;
    input.declarations[index].extra = true;
    unknownFields.push(reason('schema.unknown-field', 'schema', {}, 'unknown-field', ['declarations', index]));
  }
  const eligibleMany = ['known', 'offset', 'partial-selection', 'partial-selection-large', 'unrelated-invalid'].includes(variant);
  // These are literal dispositions of the named recipes, not a resolver.
  // An invalid profile contributes resource-only counts, never binding errors
  // or a self-cycle. Incomplete selections suppress even the 262145-edge limit.
  return { input, diagnostics: [...unknownFields, ...schemaFailures, ...identityFailures, ...declarationFailures,
    ...(eligibleMany ? [manyLimit(ordinal)] : [])] };
}

function rootStormInput(count, permutation) {
  const roots = sequence(count, offset => {
    const i = permutation === 'reverse' ? count - 1 - offset
      : permutation === 'stride-73' ? (19 + 73 * offset) % count : offset;
    return `example/candidate-${String(i).padStart(6, '0')}`;
  });
  const input = { declarations: [declaration('app')], profile: profile(['app'], ['app'], []) };
  input.profile.roots.push(...roots);
  return input;
}
function rootStormExpected(count) {
  const ids = collectorRecipe.expectedRetainedIdSets[count === 256 ? 'first-256' : 'first-255'];
  assert.equal(ids.length, count === 256 ? 256 : 255);
  return [...ids.map(id => reason('profile.unknown-root', 'profile', { moduleId: `example/${id}` }, 'unknown')),
    ...(count === 256 ? [] : [truncated(count - 255)])];
}

function omissionInput(atMaximum) {
  const providers = sequence(1024, provider);
  const declarations = providers.map(name => ({ ...declaration(name), provides: [] }));
  declarations.push(declaration('c0', sequence(128, i => slot(slotName(i)))));
  declarations.push(declaration('c1', [slot('tail')]));
  const bindings = sequence(128, i => binding('c0', slotName(i), [...providers].reverse()));
  bindings.push(binding('c1', 'tail', [...sequence(127, provider), atMaximum ? 'missing' : provider(127)]));
  // Each known provider is unselected AND lacks x/c: two independent errors.
  // At: 131199 * 2 + 1 unknown = 262399. Over: 131200 * 2 = 262400.
  // Einput is only 131200; no earlier graph/resource limit masks this stream.
  assert.equal(bindings.reduce((n, row) => n + row.providerImplementationIds.length, 0), 131200);
  return { declarations, profile: profile(['c1', 'c0'], ['c1', 'c0'], bindings.reverse()) };
}
function omissionExpected(atMaximum) {
  return [
    ...(atMaximum ? [reason('binding.unknown-provider', 'binding', providerCoordinate('c1', 'tail', 'missing'), 'unknown')] : []),
    ...sequence(atMaximum ? 254 : 255, i => reason('binding.provider-not-selected', 'binding',
      providerCoordinate('c0', 's000', provider(i)), 'mismatch')),
    truncated(262144),
  ];
}

export const objectResourceSemanticCases = [
  { id: 'object-resource-roots-selections-selected-nodes-at', async run(compileComposition) {
    await success(compileComposition, forestInput('at'), forestPlan());
  } },
  ...['roots', 'selections'].map(name => ({ id: `object-resource-${name}-plus-one`, async run(compileComposition) {
    await failure(compileComposition, forestInput(`${name}-over`), [schema(['profile', name]), limit(name, 'profile', ['profile', name])]);
  } })),
  { id: 'object-resource-bindings-at-inert-unselected-rows', async run(compileComposition) {
    await success(compileComposition, bindingCountInput(65536), plan(['app'], ['app'], [], ['app']));
  } },
  { id: 'object-resource-bindings-plus-one', async run(compileComposition) {
    await failure(compileComposition, bindingCountInput(65537),
      [schema(['profile', 'bindings']), limit('bindings', 'profile', ['profile', 'bindings'])]);
  } },
  { id: 'object-resource-edges-at-many-at-ordered-plan', async run(compileComposition) {
    await success(compileComposition, denseInput(false), densePlan());
  } },
  { id: 'object-resource-edges-plus-one-invalid-occurrence', async run(compileComposition) {
    await failure(compileComposition, denseInput(true), [
      reason('binding.unknown-provider', 'binding', providerCoordinate('c2', 'tail', 'missing'), 'unknown'),
      limit('graphEdges', 'graph'),
    ]);
  } },
  { id: 'object-resource-many-at-duplicates-independent-cycle', async run(compileComposition) {
    await failure(compileComposition, duplicateManyInput(), [
      reason('binding.duplicate', 'binding', providerCoordinate('app', 'dep', 'app'), 'duplicate'),
      diagnostic('graph.cycle', 'graph', {}, { component: [implementationId('a'), implementationId('b')] }),
    ]);
  } },
  ...manyVariants.map(variant => ({ id: `object-resource-many-over-${variant}`, async run(compileComposition) {
    const { input, diagnostics } = oversizedManyCase(variant);
    await failure(compileComposition, input, diagnostics);
  } })),
  ...[256, 257, 258].map(count => ({ id: `object-resource-diagnostics-${count}`, async run(compileComposition) {
    // Reverse 258 forces the smallest candidate to arrive after K + 1.
    for (const permutation of count === 258 ? ['reverse'] : ['ascending', 'reverse', 'stride-73']) {
      await failure(compileComposition, rootStormInput(count, permutation), rootStormExpected(count));
    }
  } })),
  ...[true, false].map(atMaximum => ({ id: `object-resource-omitted-${atMaximum ? 'maximum' : 'saturated'}`, async run(compileComposition) {
    // Two large invocations are necessary to distinguish the exact omission
    // ceiling from its plus-one saturation. No private collector is injected.
    await failure(compileComposition, omissionInput(atMaximum), omissionExpected(atMaximum));
  } })),
];

// Reachability limits of this lane:
// * selectedNodes is not a named limit. Unique resolved nodes cannot exceed
//   4096 admitted declarations/selections. The 4097-selection companion tests
//   the supplied-row limit; it does not pretend to contain 4097 resolved nodes.
// * 65536 valid selected bindings require 65536 declared slots. Even minimum
//   field/key/identity strings cost >= (90 + 59) * 65536 = 9764864 bytes,
//   exceeding aggregateStringBytes before declaration overhead. Therefore the
//   binding-count boundary uses legitimate known unselected rows. Their input
//   string cost is about 4.6 MB and their JSON population is below 300000.
// * The eight accepted mixed depth recipes and full P500 already belong to
//   objectSubjectCases; this lane does not repeat them or claim raw/M2 behavior.
