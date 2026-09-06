// PROPOSED-ONLY examples for recommended duplicate-record policy A.
// The owner has not selected this M2 policy. No Core implementation is invoked.
// compileCompositionV1 below is an evidence entry-point label, not execution.
// This closed extension does not modify the existing candidate manifest.
export const extendedOverlapSource = '730665ff7fe7e6c993dad8f98a437f849f49d4f5';

function freezeTree(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

export const extendedOverlapPolicy = freezeTree({
  status: 'proposed-fixture-only',
  recommendation: 'A; owner selection not recorded',
  boundary: 'object',
  execution: 'fixture-consistency-only; no Core subject',
  envelope: 'inside object occurrence/string/depth admission',
  duplicateRecord: {
    code: 'binding.duplicate-record',
    prerequisiteGroup: 'binding.record-census',
    prerequisites: ['document.schema-valid', 'binding.record-coordinate-census-complete'],
    suppressionScope: 'binding',
  },
});

// This is the entire ordered domain: thirteen cases, fourteen object invocations.
// Parameters cannot be supplied by callers; materialization accepts only a case ID.
// All names expand to example/<name> and example/<name>/default. Every declaration
// provides example/link with exact familyVersion 1 and token example/link.
// Owner is example/[overlap]; profileId is example/extended-overlap.
export const extendedOverlapRecipes = freezeTree([
  { caseId: 'od006.extended-overlap.v1/many-row-dedup', parameters: {
    kind: 'many-reasons', min: 1, max: 2,
    providerRows: [[], ['p', 'p', 'p'], ['p', 'p', 'p']],
  } },
  { caseId: 'od006.extended-overlap.v1/malformed-consumer-coordinate', parameters: {
    kind: 'malformed-coordinate', field: 'consumerImplementationId', value: 7, rows: [3, 4],
  } },
  { caseId: 'od006.extended-overlap.v1/malformed-slot-coordinate', parameters: {
    kind: 'malformed-coordinate', field: 'slotId', value: 7, rows: [3, 4],
  } },
  { caseId: 'od006.extended-overlap.v1/schema-invalid-profile', parameters: {
    kind: 'schema-invalid-profile', field: 'unlisted', value: true,
  } },
  { caseId: 'od006.extended-overlap.v1/same-consumer-second-slot', parameters: {
    kind: 'second-slot', recordCount: 2,
  } },
  { caseId: 'od006.extended-overlap.v1/pair-none-2048', parameters: {
    kind: 'pair-depth', chainLength: 2048, attachment: 'none',
  } },
  { caseId: 'od006.extended-overlap.v1/pair-none-2049', parameters: {
    kind: 'pair-depth', chainLength: 2049, attachment: 'none',
  } },
  { caseId: 'od006.extended-overlap.v1/pair-cycle-consumes-chain-2048', parameters: {
    kind: 'pair-depth', chainLength: 2048, attachment: 'cycle-consumes-chain',
  } },
  { caseId: 'od006.extended-overlap.v1/pair-cycle-consumes-chain-2049', parameters: {
    kind: 'pair-depth', chainLength: 2049, attachment: 'cycle-consumes-chain',
  } },
  { caseId: 'od006.extended-overlap.v1/pair-chain-consumes-cycle-2048', parameters: {
    kind: 'pair-depth', chainLength: 2048, attachment: 'chain-consumes-cycle',
  } },
  { caseId: 'od006.extended-overlap.v1/pair-chain-consumes-cycle-2049', parameters: {
    kind: 'pair-depth', chainLength: 2049, attachment: 'chain-consumes-cycle',
  } },
  { caseId: 'od006.extended-overlap.v1/self-bridge-1024-1025', parameters: {
    kind: 'self-bridge', chainLength: 2049, splitAfter: 1024,
  } },
  { caseId: 'od006.extended-overlap.v1/ordered-many-reversal', parameters: {
    kind: 'ordered-many-reversal', min: 1, max: 2,
    forward: ['p', 'q'], reverse: ['q', 'p'],
  } },
]);

const moduleId = name => `example/${name}`;
const implementationId = name => `example/${name}/default`;
const chainName = index => `n${String(index).padStart(4, '0')}`;
const compatibility = () => ({ family: 'exact', familyVersion: 1, token: 'example/link' });
const required = () => ({ kind: 'required' });
const many = () => ({ kind: 'many', min: 1, max: 2, order: 'profile' });

function slot(slotId, cardinality = required()) {
  return { slotId, capabilityId: 'example/link', compatibility: compatibility(), cardinality };
}

function declaration(name, slots = []) {
  return {
    kind: 'get-modular.module-declaration', schemaVersion: 1,
    moduleId: moduleId(name), implementationId: implementationId(name),
    owner: { authority: 'example', path: ['overlap'] },
    provides: [{ capabilityId: 'example/link', compatibility: compatibility() }],
    slots,
  };
}

function binding(consumer, slotId, providers) {
  return { consumerImplementationId: implementationId(consumer), slotId,
    providerImplementationIds: providers.map(implementationId) };
}

function world(declarations, roots, bindings) {
  return { declarations, profile: {
    kind: 'get-modular.composition-profile', schemaVersion: 1,
    profileId: 'example/extended-overlap', roots: roots.map(moduleId),
    selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
    bindings,
  } };
}

function manyWorld(rows = [[], ['p', 'p', 'p'], ['p', 'p', 'p']]) {
  return world([declaration('c', [slot('dependency', many())]), declaration('p')], ['c'],
    rows.map(providers => binding('c', 'dependency', providers)));
}

function secondSlotWorld() {
  return world([
    declaration('c', [slot('dependency'), slot('second')]),
    declaration('p', [slot('back')]), declaration('q', [slot('back')]),
  ], ['c'], [
    binding('c', 'dependency', ['p']), binding('c', 'dependency', ['p']),
    binding('c', 'second', ['q']), binding('p', 'back', ['c']), binding('q', 'back', ['c']),
  ]);
}

// Closed construction from ADR-0018's explicit graph recipe, not a graph oracle.
// The baseline supplied materializer is private, so no unavailable export is used.
// a/b form the pair; n(i) consumes n(i-1). Each ordinary edge gets d0,d1,...
// at its consumer. Added c has duplicate dependency rows [last-chain] and [c].
// Those rows individually pass local checks but contribute no positive edge.
// The bridge variant uses a self-loop and replaces n1025->n1024 with
// n1025->a->n1024. Removing a leaves chains of exactly 1024 and 1025 nodes.
function graphWorld(parameters) {
  const bridge = parameters.kind === 'self-bridge';
  const names = bridge ? ['a', 'c'] : ['a', 'b', 'c'];
  for (let index = 1; index <= parameters.chainLength; index += 1) names.push(chainName(index));
  const edges = bridge ? [['a', 'a']] : [['a', 'b'], ['b', 'a']];
  for (let index = 2; index <= parameters.chainLength; index += 1) {
    const provider = bridge && index === parameters.splitAfter + 1 ? 'a' : chainName(index - 1);
    edges.push([chainName(index), provider]);
  }
  const last = chainName(parameters.chainLength);
  if (parameters.attachment === 'cycle-consumes-chain') edges.push(['a', last]);
  if (parameters.attachment === 'chain-consumes-cycle') edges.push(['n0001', 'a']);
  if (bridge) edges.push(['a', chainName(parameters.splitAfter)]);
  const outgoing = new Map(names.map(name => [name, []]));
  for (const [consumer, provider] of edges) outgoing.get(consumer).push(provider);
  const declarations = names.map(name => declaration(name, name === 'c'
    ? [slot('dependency')] : outgoing.get(name).map((_, index) => slot(`d${index}`))));
  const bindings = [binding('c', 'dependency', [last]), binding('c', 'dependency', ['c'])];
  for (const consumer of names) outgoing.get(consumer).forEach((provider, index) => {
    bindings.push(binding(consumer, `d${index}`, [provider]));
  });
  return world(declarations, bridge ? ['c', last] : ['c', 'a', last], bindings);
}

function duplicateRecord() {
  return { code: 'binding.duplicate-record', phase: 'binding', path: [],
    coordinate: { implementationId: implementationId('c'), slotId: 'dependency' },
    details: { reason: 'duplicate' } };
}

function cardinality(actualCardinality) {
  return { code: 'binding.cardinality', phase: 'binding', path: [],
    coordinate: { implementationId: implementationId('c'), slotId: 'dependency' },
    details: { expectedCardinality: 'many', actualCardinality } };
}

function cycle(names) {
  return { code: 'graph.cycle', phase: 'graph', path: [], coordinate: {},
    details: { component: names.map(implementationId) } };
}

function invalidCoordinate(index, field) {
  return { code: 'schema.invalid-value', phase: 'schema', coordinate: {},
    path: [{ kind: 'field', value: 'profile' }, { kind: 'field', value: 'bindings' },
      { kind: 'index', value: index }, { kind: 'field', value: field }],
    details: { reason: 'invalid-type' } };
}

export function materializeDuplicateRecordExtendedOverlap(caseId) {
  const recipe = extendedOverlapRecipes.find(item => item.caseId === caseId);
  if (!recipe) throw new Error(`Unknown closed extended-overlap case: ${String(caseId)}`);
  const parameters = structuredClone(recipe.parameters);
  const common = { caseId, entryPoint: 'compileCompositionV1', proposedOnly: true, parameters };
  let input;
  let diagnostics;
  switch (parameters.kind) {
    case 'many-reasons':
      input = manyWorld(parameters.providerRows);
      diagnostics = [duplicateRecord(), {
        code: 'binding.duplicate', phase: 'binding', path: [],
        coordinate: { implementationId: implementationId('c'), slotId: 'dependency',
          providerImplementationId: implementationId('p') }, details: { reason: 'duplicate' },
      }, cardinality(0), cardinality(3)];
      break;
    case 'malformed-coordinate':
      input = manyWorld();
      for (const index of parameters.rows) {
        if (index !== input.profile.bindings.length) throw new Error('Closed malformed row position changed');
        const row = binding('c', 'dependency', []);
        row[parameters.field] = parameters.value;
        input.profile.bindings.push(row);
      }
      diagnostics = parameters.rows.map(index => invalidCoordinate(index, parameters.field));
      break;
    case 'schema-invalid-profile':
      input = manyWorld();
      input.profile[parameters.field] = parameters.value;
      diagnostics = [{ code: 'schema.unknown-field', phase: 'schema',
        path: [{ kind: 'field', value: 'profile' }], coordinate: {}, details: { reason: 'unknown-field' } }];
      break;
    case 'second-slot':
      input = secondSlotWorld();
      diagnostics = [duplicateRecord(), cycle(['c', 'q'])];
      break;
    case 'pair-depth':
    case 'self-bridge':
      input = graphWorld(parameters);
      diagnostics = [duplicateRecord()];
      // A consequence of this closed chain recipe, not a measured compiler result.
      if (parameters.kind === 'pair-depth' && parameters.chainLength === 2049) diagnostics.push({
        code: 'input.limit-exceeded', phase: 'graph', path: [], coordinate: {},
        details: { limitName: 'graphDepth', limit: 2048, actual: 2049 },
      });
      diagnostics.push(cycle(parameters.kind === 'self-bridge' ? ['a'] : ['a', 'b']));
      break;
    case 'ordered-many-reversal': {
      const control = providers => world([
        declaration('c', [slot('dependency', many())]), declaration('p'), declaration('q'),
      ], ['c'], [binding('c', 'dependency', providers)]);
      return { ...common,
        inputs: { forward: control(parameters.forward), reverse: control(parameters.reverse) },
        expectedRelation: {
          kind: 'ordered-many-plan-and-digest-inequality',
          scope: 'future-Core-results; fixture consistency only here',
          bothResults: 'success',
          coordinate: { implementationId: implementationId('c'), slotId: 'dependency' },
          forwardPlanProviders: [implementationId('p'), implementationId('q')],
          reversePlanProviders: [implementationId('q'), implementationId('p')],
          plansEqual: false, digestsEqual: false, equivalence: 'different',
        },
      };
    }
    default: throw new Error('Closed extended-overlap recipe kind changed');
  }
  return { ...common, input, expected: { ok: false, diagnostics } };
}

// Each call allocates fresh, caller-owned input trees, parameters and expectations.
export function* duplicateRecordExtendedOverlapCases() {
  for (const { caseId } of extendedOverlapRecipes) yield materializeDuplicateRecordExtendedOverlap(caseId);
}
