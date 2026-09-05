import assert from 'node:assert/strict';
import resourceProfile from '../../../architecture/qualification/v1/resource-profile-v2.json' with { type: 'json' };
import boundaries from '../../../architecture/qualification/v1/resource-boundary-vectors.json' with { type: 'json' };
import { expectedDigest } from './scale-output.mjs';

// Independent public fixtures. No Core imports, subject-derived expectations,
// general resource scanner, raw input, or repeated binding records.
const limits = resourceProfile.limits;
const rows = new Map(boundaries.profileV2.cases.map(row => [row.limitName, row]));
const names = ['declarations', 'jsonValueOccurrences', 'aggregateStringBytes',
  'jsonDepth', 'identifierBytes', 'totalCapabilities', 'totalSlots',
  'ownerPathSegments', 'capabilitiesPerDeclaration', 'slotsPerDeclaration'];
assert.deepEqual(names.map(name => limits[name]),
  [4096, 2097152, 8388608, 32, 128, 65536, 65536, 8, 64, 128]);
for (const name of names) {
  assert.equal(rows.get(name).at, limits[name]);
  assert.equal(rows.get(name).over, limits[name] + 1);
}

const path = tokens => tokens.map(value => ({
  kind: typeof value === 'number' ? 'index' : 'field', value,
}));
const failure = (...diagnostics) => ({ ok: false, diagnostics });
const reason = (code, phase, coordinate, value, tokens = []) => ({
  code, phase, coordinate, path: path(tokens), details: { reason: value },
});
const schema = (code, tokens, value) => reason(code, 'schema', {}, value, tokens);
const invalidIdentity = tokens => schema('identity.invalid', tokens, 'invalid-format');
const unknownField = tokens => schema('schema.unknown-field', tokens, 'unknown-field');
const limit = (name, tokens = []) => ({
  code: 'input.limit-exceeded', phase: rows.get(name).phase,
  coordinate: {}, path: path(tokens),
  details: { limitName: name, limit: limits[name], actual: limits[name] + 1 },
});

function declaration(moduleId = 'x/m', implementationId = 'x/i') {
  return { kind: 'get-modular.module-declaration', schemaVersion: 1,
    moduleId, implementationId, owner: { authority: 'x', path: ['m'] },
    provides: [], slots: [] };
}
const provided = (capabilityId = 'x/c') => ({ capabilityId,
  compatibility: { family: 'exact', familyVersion: 1, token: 'x/c' } });
const slot = (slotId, kind = 'required') => ({ ...provided(), slotId,
  cardinality: { kind } });
function probe() {
  return { ...declaration('x/probe', 'x/probe/i'),
    provides: [provided()], slots: [slot('s')] };
}
function world() {
  return { declarations: [declaration()], profile: {
    kind: 'get-modular.composition-profile', schemaVersion: 1,
    profileId: 'x/p', roots: ['x/m'],
    selections: [{ moduleId: 'x/m', implementationId: 'x/i' }], bindings: [],
  } };
}
function leafSuccess(profileId = 'x/p') {
  // Fixed one-node expected shape; no input census or graph algorithm.
  const plan = { kind: 'get-modular.composition-plan', schemaVersion: 1,
    profileId, roots: ['x/m'],
    selections: [{ moduleId: 'x/m', implementationId: 'x/i' }],
    bindings: [], dependencyOrder: ['x/i'] };
  return { ok: true, plan, digest: expectedDigest(plan) };
}
async function complete(compileComposition, input, expected, absentLimit) {
  const result = await compileComposition(input);
  assert.deepEqual(result, expected);
  if (!result.ok) {
    assert.equal(Object.hasOwn(result, 'plan'), false);
    assert.equal(Object.hasOwn(result, 'digest'), false);
    if (absentLimit) assert.equal(result.diagnostics.some(diagnostic =>
      diagnostic.code === 'input.limit-exceeded'
      && diagnostic.details.limitName === absentLimit), false, absentLimit);
  }
}
const chain = count => {
  let value = null;
  for (let index = 0; index < count; index += 1) value = [value];
  return value;
};

function occurrenceInput(total) {
  const input = world();
  // The fixed declaration and profile each contain 11 value occurrences.
  // Wrapper and declaration-list containers are outside the document population.
  // One extra outer array, q occurrences of [1024 nulls], then r nulls:
  // J = 22 + 1 + q * 1025 + r. Shared arrays count on every occurrence.
  const q = Math.floor((total - 23) / 1025);
  const r = (total - 23) % 1025;
  const shared = new Array(1024).fill(null);
  input.profile.extra = [...new Array(q).fill(shared), ...new Array(r).fill(null)];
  assert.equal(23 + q * 1025 + r, total);
  return input;
}
function stringInput(extra) {
  const input = world();
  // Fixed ASCII key/value sums: declaration 110, profile 116 bytes.
  // 'extra' adds 5; the shared object's two occurrences each add a 2-byte key.
  // Each emoji is four UTF-8 bytes, counted twice. Array indices add no bytes.
  const overhead = 110 + 116 + 5 + 2 * 2;
  const repetitions = Math.floor((limits.aggregateStringBytes - overhead) / 8);
  const padding = limits.aggregateStringBytes - overhead - 8 * repetitions + extra;
  const shared = { 'é': '😀'.repeat(repetitions) };
  input.profile.extra = [shared, shared, 'a'.repeat(padding)];
  assert.equal(overhead + 8 * repetitions + padding,
    limits.aggregateStringBytes + extra);
  return input;
}
function aggregateInput(name, field, width, extra) {
  const input = world();
  const total = limits[name] + extra;
  assert.equal(limits[name] % width, 0);
  for (let group = 0; group < Math.ceil(total / width); group += 1) {
    const document = declaration(`x/d${group}`, `x/d${group}/i`);
    document[field] = Array.from({ length: Math.min(width, total - group * width) },
      (_, index) => field === 'provides'
        ? provided(`x/c${String(index).padStart(2, '0')}`)
        : slot(`s${String(index).padStart(3, '0')}`));
    // Shallow totals include this unsupported document. Its independent version
    // error remains eligible; it supplies no semantic declaration.
    if (extra && group === limits[name] / width) document.schemaVersion = 2;
    input.declarations.push(document);
  }
  return input;
}

const declarationTargets = [
  ['module', ['moduleId']],
  ['implementation', ['implementationId']],
  ['owner-authority', ['owner', 'authority'], true],
  ['owner-path-token', ['owner', 'path', 0], true],
  ['provided-capability', ['provides', 0, 'capabilityId']],
  ['provided-token', ['provides', 0, 'compatibility', 'token']],
  ['declared-slot', ['slots', 0, 'slotId'], true],
  ['slot-capability', ['slots', 0, 'capabilityId']],
  ['slot-token', ['slots', 0, 'compatibility', 'token']],
].map(([name, tokens, local = false]) => ({ name, local,
  tokens: ['declarations', 1, ...tokens] }));
const profileTargets = [
  ['profile-id', ['profileId']],
  ['root', ['roots', 0]],
  ['selection-module', ['selections', 0, 'moduleId']],
  ['selection-implementation', ['selections', 0, 'implementationId']],
  ['consumer', ['bindings', 0, 'consumerImplementationId']],
  ['binding-slot', ['bindings', 0, 'slotId'], true],
  ['provider', ['bindings', 0, 'providerImplementationIds', 0]],
].map(([name, tokens, local = false]) => ({ name, local,
  tokens: ['profile', ...tokens] }));
const identifierTargets = [...declarationTargets, ...profileTargets];
function identifierInput(target, value) {
  const input = world();
  if (target.tokens[0] === 'declarations') input.declarations.push(probe());
  if (target.tokens[1] === 'bindings') {
    input.declarations[0].slots = [slot('s', 'optional')];
    input.profile.bindings = [{ consumerImplementationId: 'x/i', slotId: 's',
      providerImplementationIds: target.name === 'provider' ? ['x/z'] : [] }];
  }
  const parent = target.tokens.slice(0, -1).reduce((value, key) => value[key], input);
  parent[target.tokens.at(-1)] = value;
  return input;
}
const missingBinding = () => reason('binding.missing', 'binding',
  { implementationId: 'x/i', slotId: 's' }, 'missing');
function admittedIdentifierResult(target, value) {
  if (target.tokens[0] === 'declarations') return leafSuccess();
  switch (target.name) {
    case 'profile-id': return leafSuccess(value);
    case 'root': return failure(reason('profile.unknown-root', 'profile',
      { moduleId: value }, 'unknown'));
    case 'selection-module': return failure(
      reason('profile.unknown-module', 'profile', { moduleId: value }, 'unknown'),
      reason('profile.implementation-mismatch', 'profile',
        { moduleId: value, implementationId: 'x/i' }, 'mismatch'),
      reason('profile.missing-selection', 'profile', { moduleId: 'x/m' }, 'missing'));
    case 'selection-implementation': return failure(reason(
      'profile.unknown-implementation', 'profile',
      { moduleId: 'x/m', implementationId: value }, 'unknown'));
    case 'consumer': return failure(missingBinding(), reason(
      'binding.unknown-consumer', 'binding', { implementationId: value }, 'unknown'));
    case 'binding-slot': return failure(missingBinding(), reason(
      'binding.unknown-slot', 'binding', { implementationId: 'x/i', slotId: value }, 'unknown'));
    case 'provider': return failure(reason('binding.unknown-provider', 'binding',
      { implementationId: 'x/i', slotId: 's', providerImplementationId: value }, 'unknown'));
    default: throw new Error(`Missing independent expectation: ${target.name}`);
  }
}

// Inputs are constructed lazily, one invocation per variant, sequentially
// within each run. Huge inputs and compiler results are never cached.
export const objectResourceAdmissionCases = [
  ...[
    ['ownerPathSegments', ['owner', 'path'], () => 'part'],
    ['capabilitiesPerDeclaration', ['provides'], i => provided(`x/c${i}`)],
    ['slotsPerDeclaration', ['slots'], i => slot(`s${i}`)],
  ].map(([name, tokens, item]) => ({
    id: `object-resource-${name}-boundary`, async run(compileComposition) {
      for (const extra of [0, 1]) {
        const input = world();
        const document = declaration('x/unselected', 'x/unselected/i');
        const parent = tokens.slice(0, -1).reduce((value, key) => value[key], document);
        parent[tokens.at(-1)] = Array.from({ length: limits[name] + extra }, (_, i) => item(i));
        input.declarations.push(document);
        const location = ['declarations', 1, ...tokens];
        await complete(compileComposition, input, extra ? failure(
          schema('schema.invalid-value', location, 'invalid-format'), limit(name, location),
        ) : leafSuccess(), extra ? undefined : name);
      }
    },
  })),
  { id: 'object-resource-declarations-boundary', async run(compileComposition) {
    for (const extra of [0, 1]) {
      const input = world();
      input.declarations = Array.from({ length: limits.declarations + extra },
        (_, index) => index === 0 ? declaration()
          : declaration(`x/d${index}`, `x/d${index}/i`));
      if (extra) input.profile.schemaVersion = 2;
      await complete(compileComposition, input,
        extra ? failure(limit('declarations')) : leafSuccess(), extra ? undefined : 'declarations');
    }
    // Dense ordinary data demonstrates count-preflight precedence and saturation.
    await complete(compileComposition, {
      declarations: new Array(limits.declarations * 2).fill(null), profile: { schemaVersion: 2 },
    }, failure(limit('declarations')));
  } },
  { id: 'object-resource-json-values-boundary', async run(compileComposition) {
    for (const extra of [0, 1]) await complete(compileComposition,
      occurrenceInput(limits.jsonValueOccurrences + extra),
      extra ? failure(limit('jsonValueOccurrences')) : failure(unknownField(['profile'])),
      extra ? undefined : 'jsonValueOccurrences');
  } },
  { id: 'object-resource-decoded-strings-boundary', async run(compileComposition) {
    for (const extra of [0, 1]) await complete(compileComposition, stringInput(extra),
      extra ? failure(limit('aggregateStringBytes')) : failure(unknownField(['profile'])),
      extra ? undefined : 'aggregateStringBytes');
  } },
  { id: 'object-resource-json-depth-boundary', async run(compileComposition) {
    for (const depth of [limits.jsonDepth, limits.jsonDepth + 1, 96]) {
      const input = world();
      input.declarations.unshift(chain(depth));
      input.profile.roots = ['x/m', 'x/m', 'x/absent'];
      input.profile.selections.push({ moduleId: 'x/absent', implementationId: 'x/absent/i' });
      // The failed declaration withholds absence claims, while the independent
      // positive duplicate-root error survives both schema and depth failure.
      const first = depth === limits.jsonDepth
        ? schema('schema.invalid-value', ['declarations', 0], 'invalid-type')
        : limit('jsonDepth', ['declarations', 0]);
      await complete(compileComposition, input, failure(first,
        reason('profile.duplicate-root', 'profile', { moduleId: 'x/m' }, 'duplicate')),
      depth === limits.jsonDepth ? 'jsonDepth' : undefined);
    }
    for (const extra of [0, 1]) {
      const input = world();
      input.profile.extra = chain(limits.jsonDepth - 1 + extra);
      // The profile root counts; the terminal scalar does not add a container.
      await complete(compileComposition, input, extra
        ? failure(limit('jsonDepth', ['profile'])) : failure(unknownField(['profile'])),
      extra ? undefined : 'jsonDepth');
    }
  } },
  ...[
    ['totalCapabilities', 'provides', limits.capabilitiesPerDeclaration],
    ['totalSlots', 'slots', limits.slotsPerDeclaration],
  ].map(([name, field, width]) => ({
    id: `object-resource-${name}-boundary`, async run(compileComposition) {
      for (const extra of [0, 1]) {
        // Distinct IDs within each document prevent duplicate storms. Every
        // large candidate is unselected; the complete expected plan stays tiny.
        const expected = extra ? failure(schema('schema.unsupported-version',
          ['declarations', 1 + limits[name] / width, 'schemaVersion'], 'unsupported-version'),
        limit(name)) : leafSuccess();
        await complete(compileComposition, aggregateInput(name, field, width, extra),
          expected, extra ? undefined : name);
      }
    },
  })),
  ...identifierTargets.map(target => ({
    id: `object-resource-identifier-${target.name}`, async run(compileComposition) {
      const lengths = target.local ? [64, 65, 128, 129, 1000] : [128, 129, 1000];
      for (const length of lengths) {
        const value = target.local ? 'a'.repeat(length) : `a/${'b'.repeat(length - 2)}`;
        const expected = length > limits.identifierBytes
          ? failure(limit('identifierBytes', target.tokens), invalidIdentity(target.tokens))
          : target.local && length > 64 ? failure(invalidIdentity(target.tokens))
            : admittedIdentifierResult(target, value);
        await complete(compileComposition, identifierInput(target, value), expected,
          length <= limits.identifierBytes ? 'identifierBytes' : undefined);
      }
      // Complete grammar validation precedes byte accounting, even when only
      // the last character invalidates an otherwise oversized identity.
      const malformed = `${target.local ? 'a'.repeat(129) : `a/${'b'.repeat(127)}`}!`;
      await complete(compileComposition, identifierInput(target, malformed),
        failure(invalidIdentity(target.tokens)), 'identifierBytes');
    },
  })),
  { id: 'object-resource-identifier-exclusions-and-precedence', async run(compileComposition) {
    const long = `a/${'b'.repeat(127)}`;
    for (const variant of ['unknown-key-and-value', 'kind', 'family']) {
      const input = world();
      const document = probe();
      input.declarations.push(document);
      let expected;
      if (variant === 'unknown-key-and-value') {
        document[long] = long;
        expected = unknownField(['declarations', 1]);
      } else if (variant === 'kind') {
        document.kind = long;
        expected = schema('schema.invalid-value', ['declarations', 1, 'kind'], 'invalid-format');
      } else {
        document.provides[0].compatibility.family = long;
        expected = schema('schema.invalid-value',
          ['declarations', 1, 'provides', 0, 'compatibility', 'family'], 'invalid-format');
      }
      await complete(compileComposition, input, failure(expected), 'identifierBytes');
    }
    for (const [value, code, why] of [
      ['é'.repeat(129), 'identity.invalid', 'invalid-format'],
      [`${long}/`, 'identity.invalid', 'invalid-format'],
      [String.fromCharCode(0xd800) + long, 'schema.invalid-value', 'invalid-format'],
      [42, 'schema.invalid-value', 'invalid-type'],
    ]) await complete(compileComposition, identifierInput(declarationTargets[0], value),
      failure(schema(code, declarationTargets[0].tokens, why)), 'identifierBytes');
    const input = world();
    const document = probe();
    document.schemaVersion = 2;
    document.moduleId = long;
    document[long] = long;
    input.declarations.push(document);
    input.profile.roots.push('x/m');
    await complete(compileComposition, input, failure(
      schema('schema.unsupported-version', ['declarations', 1, 'schemaVersion'], 'unsupported-version'),
      reason('profile.duplicate-root', 'profile', { moduleId: 'x/m' }, 'duplicate')),
    'identifierBytes');
  } },
];
