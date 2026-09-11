// Pure source generators: importing this support module performs no I/O,
// imports no candidate package, and constructs no application instances.
export function staticConsumerSource() {
  return String.raw`import { compileComposition, defineModule, required, optional, many,
  type CompileCompositionResult, type CompositionProfile, type ModuleDeclaration } from '@get-modular/core';

// Capability contracts and executable associations belong to this closed app.
export type Plan = Extract<CompileCompositionResult, { ok: true }>['plan'];
type InvalidComposition = Extract<CompileCompositionResult, { ok: false }>;
export type Formatter = { readonly format: (text: string) => string };
export type Transform = { readonly apply: (text: string) => string };
export type Telemetry = { readonly record: (text: string) => void; readonly snapshot: () => readonly string[] };
export type Report = { readonly render: (title: string) => string };
export type ReportDeps = {
  readonly formatter: Formatter;
  readonly telemetry: Telemetry | undefined;
  readonly transforms: readonly Transform[];
};
type EmptyDeps = Readonly<Record<string, never>>;
export const ids = {
  report: 'example/report/default', plain: 'example/formatter/plain', json: 'example/formatter/json',
  prefix: 'example/prefix/default', uppercase: 'example/uppercase/default', telemetry: 'example/telemetry/default',
} as const;
type Instances = {
  'example/report/default': Report;
  'example/formatter/plain': Formatter; 'example/formatter/json': Formatter;
  'example/prefix/default': Transform; 'example/uppercase/default': Transform;
  'example/telemetry/default': Telemetry;
};
type ImplementationId = keyof Instances;
export type FactoryTable = {
  readonly [I in ImplementationId]: (deps: I extends typeof ids.report ? ReportDeps : EmptyDeps) => Instances[I];
};
export type Observations = {
  calls: { implementationId: ImplementationId; deps: object }[];
  instances: { implementationId: ImplementationId; instance: object }[];
};
export function observeConstruction(): Observations {
  return { calls: [], instances: [] };
}

const exact = (value: string) => ({ family: 'exact', familyVersion: 1, ["token"]: value } as const);
const capabilities = {
  report: { capabilityId: 'example/report', compatibility: exact('example/report-text') },
  formatter: { capabilityId: 'example/formatter', compatibility: exact('example/format-text') },
  telemetry: { capabilityId: 'example/telemetry', compatibility: exact('example/event-text') },
  transform: { capabilityId: 'example/transform', compatibility: exact('example/transform-text') },
};
const root = defineModule({ kind: 'get-modular.module-declaration', schemaVersion: 1,
  moduleId: 'example/report', implementationId: ids.report,
  owner: { authority: 'example', path: ['report'] }, provides: [capabilities.report],
  slots: [
    { slotId: 'formatter', ...capabilities.formatter, cardinality: required() },
    { slotId: 'telemetry', ...capabilities.telemetry, cardinality: optional() },
    { slotId: 'transforms', ...capabilities.transform, cardinality: many({ min: 1, max: 2 }) },
  ],
});
function leaf(moduleId: string, implementationId: ImplementationId,
  provided: ModuleDeclaration['provides'][number]): ModuleDeclaration {
  return defineModule({ kind: 'get-modular.module-declaration', schemaVersion: 1,
    moduleId, implementationId, owner: { authority: 'example', path: ['report'] },
    provides: [provided], slots: [] });
}
export const declarations: readonly ModuleDeclaration[] = Object.freeze([
  root, leaf('example/formatter', ids.json, capabilities.formatter),
  leaf('example/prefix', ids.prefix, capabilities.transform),
  leaf('example/formatter', ids.plain, capabilities.formatter),
  leaf('example/uppercase', ids.uppercase, capabilities.transform),
  leaf('example/telemetry', ids.telemetry, capabilities.telemetry),
]);

// Literal consumer-owned executables. Constructors are synchronous and perform
// no I/O. Telemetry records only into memory owned by its returned instance.
export const factories: FactoryTable = Object.freeze({
  'example/report/default': (deps: ReportDeps): Report => ({
    render(title) {
      const text = deps.transforms.reduce((value, transform) => transform.apply(value), title);
      const rendered = deps.formatter.format(text);
      deps.telemetry?.record(rendered);
      return rendered;
    },
  }),
  'example/formatter/plain': (_deps: EmptyDeps): Formatter => ({ format: text => 'Report: ' + text }),
  'example/formatter/json': (_deps: EmptyDeps): Formatter => ({ format: text => JSON.stringify({ report: text }) }),
  'example/prefix/default': (_deps: EmptyDeps): Transform => ({ apply: text => 'draft: ' + text }),
  'example/uppercase/default': (_deps: EmptyDeps): Transform => ({ apply: text => text.toUpperCase() }),
  'example/telemetry/default': (_deps: EmptyDeps): Telemetry => {
    const messages: string[] = [];
    return { record(message) { messages.push(message); }, snapshot() { return [...messages]; } };
  },
});

export function reportProfile(options: {
  formatter?: 'plain' | 'json'; telemetry?: boolean; reverse?: boolean;
} = {}): CompositionProfile {
  const formatter = options.formatter === 'json' ? ids.json : ids.plain;
  return { kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'example/report-profile',
    roots: ['example/report'],
    selections: [
      { moduleId: 'example/report', implementationId: ids.report },
      { moduleId: 'example/uppercase', implementationId: ids.uppercase },
      { moduleId: 'example/formatter', implementationId: formatter },
      { moduleId: 'example/prefix', implementationId: ids.prefix },
      ...(options.telemetry ? [{ moduleId: 'example/telemetry', implementationId: ids.telemetry }] : []),
    ],
    bindings: [
      { consumerImplementationId: ids.report, slotId: 'transforms',
        providerImplementationIds: options.reverse ? [ids.uppercase, ids.prefix] : [ids.prefix, ids.uppercase] },
      { consumerImplementationId: ids.report, slotId: 'formatter', providerImplementationIds: [formatter] },
      { consumerImplementationId: ids.report, slotId: 'telemetry',
        providerImplementationIds: options.telemetry ? [ids.telemetry] : [] },
    ],
  };
}

export type Outcome =
  | { ok: true; plan: Plan; report: Report }
  | { ok: false; stage: 'composition'; diagnostics: InvalidComposition['diagnostics'] }
  | { ok: false; stage: 'compile'; code: 'consumer.compile-rejected' }
  | { ok: false; stage: 'preflight'; code: 'consumer.factory-missing'; implementationId: ImplementationId }
  | { ok: false; stage: 'preflight'; code: 'consumer.unsupported-plan' }
  | { ok: false; stage: 'construction'; code: 'consumer.factory-threw'; implementationId: ImplementationId }
  | { ok: false; stage: 'construction'; code: 'consumer.wiring-failed' };

function knownId(value: string): value is ImplementationId { return Object.hasOwn(factories, value); }
function need<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Static report wiring is incomplete.');
  return value;
}
function providers(plan: Plan, slot: keyof ReportDeps): readonly string[] {
  return need(plan.bindings.find(row => row.consumerImplementationId === ids.report && row.slotId === slot))
    .providerImplementationIds;
}
function matches(row: Plan['bindings'][number], capability: ModuleDeclaration['provides'][number]): boolean {
  return row.capabilityId === capability.capabilityId
    && row.compatibility.family === capability.compatibility.family
    && row.compatibility.familyVersion === capability.compatibility.familyVersion
    && row.compatibility["token"] === capability.compatibility["token"];
}

// Core has already verified composition semantics. This checks availability and
// the finite capability associations this app knows how to construct; it is not
// a generic materializer for arbitrary declarations or heterogeneous values.
function preflight(plan: Plan, table: Partial<FactoryTable>): Extract<Outcome, { stage: 'preflight' }> | undefined {
  const unsupported = () => ({ ok: false, stage: 'preflight', code: 'consumer.unsupported-plan' } as const);
  for (const selection of plan.selections) {
    const id = selection.implementationId;
    const declaration = declarations.find(row => row.implementationId === id);
    if (!knownId(id) || declaration?.moduleId !== selection.moduleId) return unsupported();
    if (typeof table[id] !== 'function') {
      return { ok: false, stage: 'preflight', code: 'consumer.factory-missing', implementationId: id };
    }
  }
  const formatter = plan.bindings.find(row => row.slotId === 'formatter');
  const telemetry = plan.bindings.find(row => row.slotId === 'telemetry');
  const transforms = plan.bindings.find(row => row.slotId === 'transforms');
  if (plan.roots.length !== 1 || plan.roots[0] !== 'example/report' || plan.bindings.length !== 3
    || plan.bindings.some(row => row.consumerImplementationId !== ids.report)
    || !formatter || !telemetry || !transforms) return unsupported();
  if (!matches(formatter, capabilities.formatter) || !matches(telemetry, capabilities.telemetry)
    || !matches(transforms, capabilities.transform)) return unsupported();
  if (formatter.providerImplementationIds.length !== 1
    || !formatter.providerImplementationIds.every(id => id === ids.plain || id === ids.json)
    || telemetry.providerImplementationIds.length > 1
    || !telemetry.providerImplementationIds.every(id => id === ids.telemetry)
    || transforms.providerImplementationIds.length < 1 || transforms.providerImplementationIds.length > 2
    || !transforms.providerImplementationIds.every(id => id === ids.prefix || id === ids.uppercase)) return unsupported();
  return undefined;
}

class FactoryThrew extends Error {
  readonly implementationId: ImplementationId;
  constructor(implementationId: ImplementationId) {
    super('Consumer factory threw.');
    this.implementationId = implementationId;
  }
}

export async function runExample(
  input: { declarations: readonly ModuleDeclaration[]; profile: CompositionProfile } = { declarations, profile: reportProfile() },
  available: Partial<FactoryTable> = factories,
  observations: Observations = observeConstruction(),
): Promise<Outcome> {
  let compiled: CompileCompositionResult;
  try { compiled = await compileComposition(input); }
  catch {
    // Unexpected platform/output rejections are not M1 composition diagnostics.
    // Discard the unknown thrown value without inspecting or printing it.
    return { ok: false, stage: 'compile', code: 'consumer.compile-rejected' };
  }
  if (!compiled.ok) return { ok: false, stage: 'composition', diagnostics: compiled.diagnostics };
  const plan = compiled.plan;
  const table = Object.freeze({ ...available });
  const unavailable = preflight(plan, table);
  if (unavailable) return unavailable;

  const instances: Partial<Instances> = {};
  const empty: EmptyDeps = Object.freeze({});
  // This observer preserves a concrete factory signature, not an erased lookup.
  function invoke<D extends object, C extends object>(id: ImplementationId, factory: (deps: D) => C, deps: D): C {
    observations.calls.push({ implementationId: id, deps });
    let instance: C;
    try { instance = factory(deps); }
    catch { throw new FactoryThrew(id); }
    observations.instances.push({ implementationId: id, instance });
    return instance;
  }
  function formatter(id: string): Formatter {
    switch (id) {
      case ids.plain: return need(instances[ids.plain]);
      case ids.json: return need(instances[ids.json]);
      default: throw new Error('Unsupported formatter identity.');
    }
  }
  function transform(id: string): Transform {
    switch (id) {
      case ids.prefix: return need(instances[ids.prefix]);
      case ids.uppercase: return need(instances[ids.uppercase]);
      default: throw new Error('Unsupported transform identity.');
    }
  }
  function telemetry(id: string): Telemetry {
    if (id !== ids.telemetry) throw new Error('Unsupported telemetry identity.');
    return need(instances[ids.telemetry]);
  }
  function reportDeps(): ReportDeps {
    const optionalId = providers(plan, 'telemetry')[0];
    return Object.freeze({
      formatter: formatter(need(providers(plan, 'formatter')[0])),
      telemetry: optionalId === undefined ? undefined : telemetry(optionalId),
      transforms: Object.freeze(providers(plan, 'transforms').map(id => transform(id))),
    });
  }
  try {
    // No sorting, discovery, retries, or recursive construction: follow the plan.
    for (const id of plan.dependencyOrder) {
      switch (id) {
        case ids.plain: instances[ids.plain] = invoke(ids.plain, need(table[ids.plain]), empty); break;
        case ids.json: instances[ids.json] = invoke(ids.json, need(table[ids.json]), empty); break;
        case ids.prefix: instances[ids.prefix] = invoke(ids.prefix, need(table[ids.prefix]), empty); break;
        case ids.uppercase: instances[ids.uppercase] = invoke(ids.uppercase, need(table[ids.uppercase]), empty); break;
        case ids.telemetry: instances[ids.telemetry] = invoke(ids.telemetry, need(table[ids.telemetry]), empty); break;
        case ids.report: instances[ids.report] = invoke(ids.report, need(table[ids.report]), reportDeps()); break;
        default: throw new Error('Unsupported implementation identity.');
      }
    }
    return { ok: true, plan, report: need(instances[ids.report]) };
  } catch (error) {
    if (error instanceof FactoryThrew) {
      return { ok: false, stage: 'construction', code: 'consumer.factory-threw', implementationId: error.implementationId };
    }
    return { ok: false, stage: 'construction', code: 'consumer.wiring-failed' };
  }
}

// Checked by the installed-package compiler; deliberately never executed.
function wiringTypeControls(deps: ReportDeps): void {
  // @ts-expect-error a transform factory cannot occupy a formatter identity
  const wrongFactory: FactoryTable[typeof ids.plain] = factories[ids.prefix];
  // @ts-expect-error the required formatter cannot be omitted
  const incomplete: ReportDeps = { telemetry: undefined, transforms: [] };
  // @ts-expect-error the report has no resolver slot
  const extra: ReportDeps = { ...deps, resolve: () => deps.formatter };
  // @ts-expect-error a zero-slot factory cannot receive a formatter
  factories[ids.plain]({ formatter: deps.formatter });
  void [wrongFactory, incomplete, extra];
}
`;
}

export function staticConsumerTests() {
  return String.raw`import assert from 'node:assert/strict';
import { realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { compileComposition } from '@get-modular/core';
import { ids, declarations, factories, reportProfile, observeConstruction, runExample } from './report.mjs';

const exact = value => ({ family: 'exact', familyVersion: 1, ["token"]: value });
const inputFor = (options = {}) => ({ declarations, profile: reportProfile(options) });
function expectedPlan(options = {}) {
  const formatter = options.formatter === 'json' ? ids.json : ids.plain;
  const binding = (slotId, capabilityId, compatibility, providerImplementationIds) => ({
    consumerImplementationId: ids.report, slotId, capabilityId, compatibility, providerImplementationIds,
  });
  return { kind: 'get-modular.composition-plan', schemaVersion: 1, profileId: 'example/report-profile',
    roots: ['example/report'], selections: [
      { moduleId: 'example/formatter', implementationId: formatter },
      { moduleId: 'example/prefix', implementationId: ids.prefix },
      { moduleId: 'example/report', implementationId: ids.report },
      ...(options.telemetry ? [{ moduleId: 'example/telemetry', implementationId: ids.telemetry }] : []),
      { moduleId: 'example/uppercase', implementationId: ids.uppercase },
    ], bindings: [
      binding('formatter', 'example/formatter', exact('example/format-text'), [formatter]),
      binding('telemetry', 'example/telemetry', exact('example/event-text'), options.telemetry ? [ids.telemetry] : []),
      binding('transforms', 'example/transform', exact('example/transform-text'),
        options.reverse ? [ids.uppercase, ids.prefix] : [ids.prefix, ids.uppercase]),
    ], dependencyOrder: [formatter, ids.prefix, ...(options.telemetry ? [ids.telemetry] : []), ids.uppercase, ids.report],
  };
}
function made(observations, id) {
  const rows = observations.instances.filter(row => row.implementationId === id);
  assert.equal(rows.length, 1, 'exactly one instance for ' + id);
  return rows[0].instance;
}
async function success(options = {}, available = factories) {
  const observations = observeConstruction();
  const result = await runExample(inputFor(options), available, observations);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result).sort(), ['ok', 'plan', 'report']);
  const expected = expectedPlan(options);
  assert.deepEqual(result.plan, expected);
  assert.deepEqual(observations.calls.map(row => row.implementationId), expected.dependencyOrder);
  assert.deepEqual(observations.instances.map(row => row.implementationId), expected.dependencyOrder);
  assert.equal(new Set(observations.instances.map(row => row.instance)).size, expected.dependencyOrder.length);
  for (const call of observations.calls) {
    assert.deepEqual(Reflect.ownKeys(call.deps).sort(),
      call.implementationId === ids.report ? ['formatter', 'telemetry', 'transforms'] : []);
    assert.equal(Object.getPrototypeOf(call.deps), Object.prototype);
    assert.equal(Object.isFrozen(call.deps), true);
  }
  const deps = observations.calls.find(row => row.implementationId === ids.report).deps;
  assert.strictEqual(deps.formatter, made(observations, expected.bindings[0].providerImplementationIds[0]));
  assert.strictEqual(deps.telemetry, options.telemetry ? made(observations, ids.telemetry) : undefined);
  assert.equal(Object.isFrozen(deps.transforms), true);
  assert.equal(deps.transforms.length, 2);
  expected.bindings[2].providerImplementationIds.forEach((id, index) => {
    assert.strictEqual(deps.transforms[index], made(observations, id));
  });
  for (const binding of result.plan.bindings) {
    for (const provider of binding.providerImplementationIds) {
      assert.ok(expected.dependencyOrder.indexOf(provider)
        < expected.dependencyOrder.indexOf(binding.consumerImplementationId));
    }
  }
  assert.strictEqual(result.report, made(observations, ids.report));
  const rendered = result.report.render('Quarterly report');
  const text = options.reverse ? 'draft: QUARTERLY REPORT' : 'DRAFT: QUARTERLY REPORT';
  assert.equal(rendered, options.formatter === 'json' ? JSON.stringify({ report: text }) : 'Report: ' + text);
  if (options.telemetry) assert.deepEqual(made(observations, ids.telemetry).snapshot(), [rendered]);
  return { result, observations, rendered };
}
async function compositionFailure(input, code, phase) {
  const observations = observeConstruction();
  const result = await runExample(input, factories, observations);
  // Check the complete consumer outcome projection, exact diagnostic sequence,
  // and empty construction observations. Core owns the detailed diagnostic paths.
  assert.deepEqual({ ok: result.ok, stage: result.stage, fields: Object.keys(result).sort(),
    diagnostics: result.diagnostics?.map(row => ({ code: row.code, phase: row.phase })), observations }, {
    ok: false, stage: 'composition', fields: ['diagnostics', 'ok', 'stage'],
    diagnostics: [{ code, phase }], observations: { calls: [], instances: [] },
  });
  return result.diagnostics[0];
}

test('the executing consumer resolves the physical installed public root', async () => {
  assert.equal(dirname(fileURLToPath(import.meta.url)), process.cwd());
  const installed = join(process.cwd(), 'node_modules/@get-modular/core');
  assert.equal(await realpath(installed), installed);
  const resolved = fileURLToPath(import.meta.resolve('@get-modular/core'));
  assert.equal(await realpath(resolved), join(installed, 'dist/index.js'));
  assert.equal(await realpath(createRequire(import.meta.url).resolve('@get-modular/core')), await realpath(resolved));
});

test('the profile selects plain versus JSON factories and changes the report', async () => {
  const plain = await success();
  const json = await success({ formatter: 'json' });
  assert.equal(plain.rendered, 'Report: DRAFT: QUARTERLY REPORT');
  assert.equal(json.rendered, '{"report":"DRAFT: QUARTERLY REPORT"}');
  assert.equal(plain.observations.calls.some(row => row.implementationId === ids.json), false);
  assert.equal(json.observations.calls.some(row => row.implementationId === ids.plain), false);
  assert.notStrictEqual(made(plain.observations, ids.prefix), made(json.observations, ids.prefix));
});

test('reversing ordered-many bindings changes rendering, not construction order', async () => {
  const forward = await success();
  const reverse = await success({ reverse: true });
  assert.equal(reverse.rendered, 'Report: draft: QUARTERLY REPORT');
  assert.notEqual(forward.rendered, reverse.rendered);
  assert.deepEqual(forward.result.plan.dependencyOrder, reverse.result.plan.dependencyOrder);
});

test('explicit optional emptiness injects undefined; presence records the rendered report', async () => {
  const absent = await success();
  const present = await success({ telemetry: true });
  assert.equal(absent.rendered, present.rendered);
  assert.deepEqual(absent.result.plan.bindings[1].providerImplementationIds, []);
  assert.deepEqual(present.result.plan.bindings[1].providerImplementationIds, [ids.telemetry]);
});

test('unselected executables are neither required nor called', async () => {
  let unusedCalls = 0;
  const available = { ...factories, [ids.json]: () => {
    unusedCalls += 1;
    throw new Error('Unselected factory was called.');
  } };
  delete available[ids.telemetry];
  await success({}, available);
  assert.equal(unusedCalls, 0);
});

test('incompatible binding fails compilation before every factory', async () => {
  const input = inputFor();
  input.declarations = declarations.map(row => row.implementationId === ids.plain
    ? { ...row, provides: [{ capabilityId: 'example/formatter', compatibility: exact('example/format-other') }] } : row);
  const diagnostic = await compositionFailure(input, 'binding.compatibility-mismatch', 'binding');
  assert.deepEqual({ consumer: diagnostic.coordinate.implementationId, slot: diagnostic.coordinate.slotId,
    provider: diagnostic.coordinate.providerImplementationId, expected: diagnostic.details.expectedCompatibility,
    actual: diagnostic.details.actualCompatibility }, {
    consumer: ids.report, slot: 'formatter', provider: ids.plain,
    expected: exact('example/format-text'), actual: exact('example/format-other'),
  });
});

test('a missing required binding record fails before every factory', async () => {
  const input = inputFor();
  input.profile = { ...input.profile, bindings: input.profile.bindings.filter(row => row.slotId !== 'formatter') };
  const diagnostic = await compositionFailure(input, 'binding.missing', 'binding');
  assert.deepEqual({ consumer: diagnostic.coordinate.implementationId, slot: diagnostic.coordinate.slotId },
    { consumer: ids.report, slot: 'formatter' });
});

test('an omitted optional record is different from explicit emptiness', async () => {
  const input = inputFor();
  input.profile = { ...input.profile, bindings: input.profile.bindings.filter(row => row.slotId !== 'telemetry') };
  const diagnostic = await compositionFailure(input, 'binding.missing', 'binding');
  assert.deepEqual({ consumer: diagnostic.coordinate.implementationId, slot: diagnostic.coordinate.slotId },
    { consumer: ids.report, slot: 'telemetry' });
});

test('a positive report-formatter cycle fails before every factory', async () => {
  const input = inputFor();
  input.declarations = declarations.map(row => row.implementationId === ids.plain ? { ...row, slots: [
    { slotId: 'report', capabilityId: 'example/report', compatibility: exact('example/report-text'),
      cardinality: { kind: 'required' } },
  ] } : row);
  input.profile = { ...input.profile, bindings: [...input.profile.bindings,
    { consumerImplementationId: ids.plain, slotId: 'report', providerImplementationIds: [ids.report] }] };
  const diagnostic = await compositionFailure(input, 'graph.cycle', 'graph');
  assert.deepEqual(diagnostic.details.component, [ids.plain, ids.report]);
});

test('a selected but unreachable implementation is not constructed', async () => {
  const input = inputFor();
  input.profile = { ...input.profile, selections: [...input.profile.selections,
    { moduleId: 'example/telemetry', implementationId: ids.telemetry }] };
  const diagnostic = await compositionFailure(input, 'profile.unreachable-selection', 'graph');
  assert.equal(diagnostic.coordinate.implementationId, ids.telemetry);
});

test('the missing last executable fails preflight before constructing the first provider', async () => {
  const available = { ...factories };
  delete available[ids.report];
  const observations = observeConstruction();
  assert.deepEqual(await runExample(inputFor(), available, observations), {
    ok: false, stage: 'preflight', code: 'consumer.factory-missing', implementationId: ids.report,
  });
  assert.deepEqual(observations, { calls: [], instances: [] });
});

test('a constructor throw returns only a safe error and stops without retries', async () => {
  const observations = observeConstruction();
  let attempts = 0;
  const privateFailure = { message: 'private constructor detail', code: 'private-code' };
  const available = { ...factories, [ids.prefix]: () => { attempts += 1; throw privateFailure; } };
  assert.deepEqual(await runExample(inputFor(), available, observations), {
    ok: false, stage: 'construction', code: 'consumer.factory-threw', implementationId: ids.prefix,
  });
  assert.equal(attempts, 1);
  assert.deepEqual(observations.calls.map(row => row.implementationId), [ids.plain, ids.prefix]);
  assert.deepEqual(observations.calls.map(row => Reflect.ownKeys(row.deps)), [[], []]);
  assert.deepEqual(observations.instances.map(row => row.implementationId), [ids.plain]);
  // The earlier instance exists; this example makes no cleanup or lifecycle claim.
});

test('a semantically valid plan cannot substitute a transform for the app formatter contract', async () => {
  const input = inputFor();
  input.declarations = declarations.map(row => row.implementationId === ids.report ? { ...row,
    slots: row.slots.map(slot => slot.slotId === 'formatter' ? { ...slot,
      capabilityId: 'example/transform', compatibility: exact('example/transform-text') } : slot),
  } : row);
  input.profile = { ...input.profile,
    selections: input.profile.selections.filter(row => row.moduleId !== 'example/formatter'),
    bindings: input.profile.bindings.map(row => row.slotId === 'formatter'
      ? { ...row, providerImplementationIds: [ids.prefix] } : row),
  };
  const verified = await compileComposition(input);
  assert.equal(verified.ok, true);
  const expected = expectedPlan();
  assert.deepEqual(verified.plan, { ...expected,
    selections: expected.selections.filter(row => row.moduleId !== 'example/formatter'),
    bindings: expected.bindings.map(row => row.slotId === 'formatter' ? { ...row,
      capabilityId: 'example/transform', compatibility: exact('example/transform-text'),
      providerImplementationIds: [ids.prefix] } : row),
    dependencyOrder: [ids.prefix, ids.uppercase, ids.report],
  });
  const observations = observeConstruction();
  assert.deepEqual(await runExample(input, factories, observations), {
    ok: false, stage: 'preflight', code: 'consumer.unsupported-plan',
  });
  assert.deepEqual(observations, { calls: [], instances: [] });
});
`;
}
