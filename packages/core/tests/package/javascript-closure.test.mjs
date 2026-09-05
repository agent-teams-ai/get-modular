import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { auditM1JavaScriptClosure } from '../../../../tests/qualification/support/m1-javascript-closure.mjs';

const ENTRY = 'dist/index.js';
const ROOT = 'dist/composition/stage0.js';
const HELPERS = 'dist/features/authoring/helpers.js';
const AUTHORING = 'dist/features/authoring/internal.js';
const ADMISSION = 'dist/features/input-admission/object-admission.js';
const CANONICAL = 'dist/features/canonicalization/owned-jcs/factory.js';
const OUTPUT = 'dist/features/plan-output/factory.js';
const ORDER = 'dist/features/diagnostics/order.js';
const ORPHAN = 'dist/features/composition-semantics/graph-components.js';
const publicNames = ['compileComposition', 'defineModule', 'many', 'optional', 'required'];

// A real-style direct graph, with the actual helper/facade/construction forms.
// Algorithm bodies are intentionally small static-reader fixtures: this suite
// does not execute them or claim that they implement composition semantics.
// The separately owned packed test supplies all actual archive members.
const sources = new Map([
  [ENTRY, `import { root } from './composition/stage0.js';
export const compileComposition = root.compileComposition;
export { defineModule, required, optional, many } from './features/authoring/internal.js';`],
  [ROOT, `import { createOwnedJcs } from '../features/canonicalization/owned-jcs/factory.js';
import { createCompositionSemantics } from '../features/composition-semantics/factory.js';
import { createInputAdmission } from '../features/input-admission/factory.js';
import { createPlanOutput } from '../features/plan-output/factory.js';
import { createCompilerFacade } from '../features/compiler-facade/factory.js';
const canonicalizer = createOwnedJcs({});
const semantics = createCompositionSemantics({ canonicalizer });
const admission = createInputAdmission({});
const output = createPlanOutput({ canonicalizer });
const compiler = createCompilerFacade({ admission, semantics, output });
export const root = compiler;`],
  [AUTHORING, `export { defineModule, required, optional, many } from './helpers.js';`],
  [HELPERS, `/** Preserves the input reference; does not validate it. */
export function defineModule(declaration) { return declaration; }
export function required() { return { kind: 'required' }; }
export function optional() { return { kind: 'optional' }; }
export function many(bounds) { return { kind: 'many', min: bounds.min, max: bounds.max, order: 'profile' }; }`],
  [CANONICAL, `function canonicalize(value) { return new TextEncoder().encode(JSON.stringify(value)); }
export function createOwnedJcs(_deps) { return Object.freeze({ canonicalize }); }`],
  ['dist/features/compiler-facade/factory.js', `export function createCompilerFacade({ admission, semantics, output }) {
  return Object.freeze({ async compileComposition(input) {
    const collector = semantics.newCollector();
    const admitted = admission.admitObjectInput(input, collector);
    const analyzed = semantics.analyze(admitted, collector);
    if (!analyzed.ok) return analyzed;
    const emitted = await output.emit(analyzed.plan);
    return Object.freeze({ ok: true, plan: emitted.plan, digest: emitted.digest });
  } });
}`],
  ['dist/features/composition-semantics/factory.js', `import { createDiagnosticCollector } from '../diagnostics/internal.js';
import { analyzeCompositionSemantics } from './semantic-analysis.js';
export function createCompositionSemantics({ canonicalizer }) {
  return Object.freeze({
    newCollector() { return createDiagnosticCollector(details => canonicalizer.canonicalize(details)); },
    analyze: analyzeCompositionSemantics,
  });
}`],
  ['dist/features/input-admission/factory.js', `import { admitObjectInput } from './object-admission.js';
export function createInputAdmission(_deps) { return Object.freeze({ admitObjectInput }); }`],
  [ADMISSION, `export function admitObjectInput(input, collector) {
  return Object.freeze({ declarations: Object.freeze([...input.declarations]), profile: input.profile,
    allDeclarationsAdmitted: true, profileResources: null, hasErrors: false });
}`],
  ['dist/features/composition-semantics/semantic-analysis.js', `import { ReadyQueue } from './ready-queue.js';
export function analyzeCompositionSemantics(input, collector) {
  const ready = new ReadyQueue(); ready.push(0); ready.take();
  const diagnostics = collector.finish();
  return Object.freeze({ ok: false, diagnostics });
}`],
  ['dist/features/composition-semantics/ready-queue.js', `export class ReadyQueue {
  #items = []; comparisons = 0; peakSize = 0;
  get size() { return this.#items.length; }
  #less(left, right) { this.comparisons += 1; return left < right; }
  push(value) {
    this.#items.push(value);
    this.peakSize = Math.max(this.peakSize, this.#items.length);
    this.#items.sort((left, right) => this.#less(left, right) ? -1 : 1);
  }
  take() { if (this.#items.length === 0) throw new Error('Empty queue'); return this.#items.pop(); }
}`],
  ['dist/features/diagnostics/internal.js', `export { compareDiagnostics } from './order.js';
export { createDiagnosticCollector } from './collector.js';`],
  ['dist/features/diagnostics/collector.js', `import { compareDiagnostics } from './order.js';
export function createDiagnosticCollector(canonicalize) {
  const heap = [];
  const addUnique = candidate => { heap.push(candidate); };
  const finish = () => Object.freeze(heap.sort((left, right) => compareDiagnostics(left, right, canonicalize)));
  return Object.freeze({ addUnique, finish });
}`],
  [ORDER, `export function compareDiagnostics(left, right, canonicalize) {
  const a = canonicalize(left.details), b = canonicalize(right.details);
  return a.length - b.length;
}`],
  [OUTPUT, `function snapshotPlan(normalized) { return Object.freeze({ ...normalized }); }
export function createPlanOutput({ canonicalizer }) {
  return Object.freeze({ async emit(normalized) {
    const plan = snapshotPlan(normalized);
    const envelope = Object.freeze({ canonicalization: 'RFC8785', hashAlgorithm: 'SHA-256',
      kind: 'get-modular.plan-content', plan, protocolVersion: 1 });
    const bytes = new Uint8Array(canonicalizer.canonicalize(envelope));
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    return Object.freeze({ plan, digest: 'gm-plan:v1:sha-256:' + hex });
  } });
}`],
]);
function baseline() { return new Map([...sources].map(([path, source]) => [path, Buffer.from(source + '\n')])); }
function edit(files, path, before, after) {
  const source = files.get(path).toString('utf8');
  assert.ok(source.includes(before), 'mutation must match its intended content');
  files.set(path, Buffer.from(source.replace(before, after)));
}
function body(files, code) { edit(files, ADMISSION, '{\n  return', `{\n  ${code}\n  return`); }
function reject(files, reason) {
  assert.throws(() => auditM1JavaScriptClosure(files), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.code, 'm1.javascript-closure.invalid');
    assert.equal(error.message, 'Invalid M1 JavaScript closure.');
    assert.equal(error.reason, reason);
    assert.deepEqual(Object.keys(error).sort(), ['code', 'reason']);
    assert.equal(error.cause, undefined);
    return true;
  });
}
function mutant(change, reason) {
  const files = baseline();
  assert.deepEqual(auditM1JavaScriptClosure(files).exports, publicNames, 'the complete companion passes before mutation');
  change(files);
  reject(files, reason);
}

// Only this trusted driver and auditor are loaded. Candidate bytes remain data.
// The timeout is a harness escape hatch for regressions in the old resolver.
async function isolatedAudit(files) {
  const auditor = new URL('../../../../tests/qualification/support/m1-javascript-closure.mjs', import.meta.url).href;
  const worker = new Worker(new URL('data:text/javascript,' + encodeURIComponent(`
import { Buffer } from 'node:buffer';
import { parentPort, workerData } from 'node:worker_threads';
import { auditM1JavaScriptClosure } from ${JSON.stringify(auditor)};
try {
  const files = new Map(workerData.map(([path, bytes]) => [path, Buffer.from(bytes)]));
  parentPort.postMessage({ result: auditM1JavaScriptClosure(files) });
} catch (error) {
  parentPort.postMessage({ error: { isError: error instanceof Error, code: error.code,
    message: error.message, reason: error.reason, keys: Object.keys(error).sort(), cause: error.cause } });
}
`)), { workerData: [...files], execArgv: [] });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Static-reader worker did not complete within its harness bound.')), 60_000);
      worker.once('message', value => { clearTimeout(timer); resolve(value); });
      worker.once('error', error => { clearTimeout(timer); reject(error); });
      worker.once('exit', code => { clearTimeout(timer); reject(new Error(`Static-reader worker exited without a result: ${code}`)); });
    });
  } finally { await worker.terminate(); }
}
async function isolatedMutant(change, reason) {
  const files = baseline();
  assert.deepEqual(auditM1JavaScriptClosure(files).exports, publicNames, 'the complete companion passes before mutation');
  change(files);
  assert.deepEqual(await isolatedAudit(files), { error: {
    isError: true, code: 'm1.javascript-closure.invalid', message: 'Invalid M1 JavaScript closure.',
    reason, keys: ['code', 'reason'], cause: undefined,
  } });
}

test('audits the complete direct fixture graph without mutating archive data', () => {
  const files = baseline(), copy = new Map([...files].map(([path, bytes]) => [path, Buffer.from(bytes)]));
  assert.deepEqual(auditM1JavaScriptClosure(files), { modules: [...sources.keys()].sort(), exports: publicNames });
  assert.deepEqual(files, copy);
  assert.deepEqual(auditM1JavaScriptClosure(new Map([...files].reverse())), auditM1JavaScriptClosure(files));
});

test('metadata and declaration purpose do not invent required fixture fields or type semantics', () => {
  const files = baseline();
  for (const path of ['package.json', 'README.md', 'LICENSE', 'dist/index.d.ts',
    'dist/features/authoring/internal.d.ts', 'dist/features/authoring/helpers.d.ts',
    'dist/features/authoring/wire-types.d.ts', 'dist/features/authoring/diagnostic-types.d.ts']) files.set(path, Buffer.from(''));
  assert.deepEqual(auditM1JavaScriptClosure(files).modules, [...sources.keys()].sort());
});

test('named imports, reexports, const aliases, parentheses and explicit slots preserve origins', () => {
  const files = baseline();
  files.set(ENTRY, Buffer.from(`import { root as assembly } from './composition/stage0.js';
const compiler = assembly;
const invoke = (compiler['compileComposition']);
export { invoke as compileComposition };
import { defineModule as define, required as one, optional as maybe, many as ordered } from './features/authoring/internal.js';
export { define as defineModule, one as required, maybe as optional, ordered as many };`));
  files.set(AUTHORING, Buffer.from(`import { defineModule as define, required as one, optional as maybe, many as ordered } from './helpers.js';
const forwarded = define;
export { forwarded as defineModule, one as required, maybe as optional, ordered as many };`));
  edit(files, ROOT, 'import { createOwnedJcs }', 'import { createOwnedJcs as makeBytes }');
  edit(files, ROOT, 'createOwnedJcs({})', '(makeBytes)({})');
  edit(files, ROOT, 'createCompositionSemantics({ canonicalizer })', 'createCompositionSemantics({ canonicalizer: canonicalizer })');
  assert.deepEqual(auditM1JavaScriptClosure(files).exports, publicNames);
});

test('prose, strings, Unicode, regex and template content are not import or directive syntax', () => {
  const files = baseline();
  body(files, `// Host, raw decoding, require and sourceMappingURL are discussed here.
const prose = 'Host raw conformance fixture require eval sourceMappingURL café 😀';
const literal = '//# sourceMappingURL=private.ts';
const template = \`import('node:fs'); // @ts-nocheck\`;
const pattern = /sourceMappingURL|require/;`);
  assert.deepEqual(auditM1JavaScriptClosure(files).exports, publicNames);
});

test('the reader never invokes a candidate function', () => {
  const files = baseline();
  body(files, `throw new Error('This candidate function must never execute during the audit');`);
  assert.deepEqual(auditM1JavaScriptClosure(files).exports, publicNames);
});

test('entry, imported modules, imported symbols and orphan contents are checked', () => {
  mutant(files => files.delete(ENTRY), 'entry-missing');
  mutant(files => files.delete(CANONICAL), 'module-missing');
  mutant(files => files.delete(ORDER), 'module-missing');
  mutant(files => edit(files, 'dist/features/diagnostics/collector.js', 'import { compareDiagnostics }', 'import { absent as compareDiagnostics }'), 'export-missing');
  mutant(files => files.set(ORPHAN, Buffer.from('export function graphComponents(outgoing, incoming) { return { members: [], edgeVisits: 0, peakFrames: 0 }; }')), 'orphan');
  mutant(files => files.set(ORPHAN, Buffer.from('export function graphComponents( {')), 'parse');
});

for (const specifier of ['node:fs', 'canonicalize', '@get-modular/conformance', '/outside.js',
  '../../outside.js', './composition/../composition/stage0.js', './composition//stage0.js',
  './composition/stage0.js?other', './composition/stage0.js#other', './composition/stage0.ts',
  './composition/%73tage0.js', String.raw`./composition\stage0.js`, String.raw`\u002e/composition/stage0.js`]) {
  test(`rejects noncanonical or external specifier ${specifier}`, () => {
    mutant(files => edit(files, ENTRY, './composition/stage0.js', specifier), 'specifier');
  });
}

test('fatal UTF-8 precedes parsing, including corrupt bytes inside comments', () => {
  for (const bytes of [[0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x82]]) {
    mutant(files => files.set(ORDER, Buffer.concat([files.get(ORDER), Buffer.from('\n// '), Buffer.from(bytes)])), 'utf8');
  }
  mutant(files => files.set(ORDER, Buffer.concat([Buffer.from([239, 187, 191]), files.get(ORDER)])), 'utf8');
  mutant(files => edit(files, ADMISSION, 'return Object.freeze', 'return ) Object.freeze'), 'parse');
});

for (const directive of ['//# sourceMappingURL=private.js.map', '//@ sourceURL=private.ts',
  '/*# sourceMappingURL=data:application/json;base64,e30= */', '/// <reference path="outside.d.ts" />',
  '/// <reference types="node" />', '/// <reference lib="dom" />', '// @ts-nocheck',
  '/** @import { Host } from "host" */', '/** @typedef {import("host").Host} Host */',
  '/* global host */', '/* eslint-env node */']) {
  test(`rejects actual directive ${directive}`, () => {
    mutant(files => files.set(ORDER, Buffer.concat([Buffer.from(directive + '\n'), files.get(ORDER)])), 'directive');
  });
}

test('directives inside function trivia and at EOF cannot hide from the AST reader', () => {
  mutant(files => body(files, '/*# sourceURL=hidden.ts */'), 'directive');
  mutant(files => files.set(ORDER, Buffer.concat([files.get(ORDER), Buffer.from('//# sourceMappingURL=hidden.map')])), 'directive');
});

for (const path of ['dist/features/input-admission/raw.js', 'dist/features/host/factory.js',
  'dist/features/authoring/innocent.js', 'dist/index.js.map', 'dist/index.mjs', 'dist/index.cjs',
  'dist/features/authoring/extra.d.ts', 'src/index.ts', 'package/dist/index.js', 'fixture.json']) {
  test(`rejects unowned archive purpose ${path}`, () => {
    mutant(files => files.set(path, Buffer.from('export const value = 1;')), 'file-purpose');
  });
}

test('reachable and renamed implementation content still needs an owned purpose', () => {
  mutant(files => body(files, `const lifecycle = () => input;`), 'purpose');
  mutant(files => body(files, `function activate() { return input; }`), 'purpose');
  mutant(files => body(files, `const state = { readiness: true };`), 'purpose');
  mutant(files => body(files, `const state = { start() { return input; } };`), 'purpose');
  mutant(files => body(files, `const cases = { expected: input, actual: input };`), 'purpose');
  mutant(files => body(files, `input.activate();`), 'purpose');
  mutant(files => body(files, `new TextDecoder().decode(input);`), 'construction');
  mutant(files => body(files, `JSON.parse(input);`), 'purpose');
  mutant(files => {
    files.set(ORPHAN, Buffer.from('export function graphComponents(outgoing, incoming) { return { readiness: true }; }'));
    edit(files, 'dist/features/composition-semantics/semantic-analysis.js', 'export function', "import { graphComponents } from './graph-components.js';\nexport function");
  }, 'purpose');
});

for (const code of [
  `const lifecycle = (() => input); lifecycle();`,
  `const lifecycle = (((() => input))); lifecycle();`,
  `const lifecycle = ((() => { return input; })); lifecycle();`,
  `const lifecycle = (((value) => value)); lifecycle(input);`,
  `let lifecycle = (() => input); lifecycle();`,
]) {
  test(`parentheses preserve the named-arrow role restriction: ${code}`, () => {
    mutant(files => body(files, code), 'purpose');
  });
}

test('admitted named arrows and anonymous callbacks retain their roles through parentheses', () => {
  for (const code of [
    `const add = value => value; add(input);`,
    `const validate = (() => input); validate();`,
    `const scan = (((value) => value)); scan(input);`,
    `const empty = ((() => { return input; })); empty();`,
    `input.declarations.map(((value) => value));`,
  ]) {
    const files = baseline();
    body(files, code);
    assert.deepEqual(auditM1JavaScriptClosure(files).exports, publicNames, code);
  }
});

for (const code of [
  `const { activate: invoke } = input; invoke();`,
  `const { activate } = input; activate();`,
  `const { 'activate': invoke } = input; invoke();`,
  `const { ['activate']: invoke } = input; invoke();`,
  `const { [(\`activate\`)]: invoke } = input; invoke();`,
  `const { ['acti' + 'vate']: invoke } = input; invoke();`,
  `const key = 'acti' + 'vate'; const { [key]: invoke } = input; invoke();`,
  `const { profile: { activate: invoke } } = input; invoke();`,
  `const validate = ({ activate: invoke }) => invoke(); validate(input);`,
  `function scan({ activate: invoke }) { invoke(); } scan(input);`,
]) {
  test(`binding selectors retain the member-purpose restriction: ${code}`, () => {
    mutant(files => body(files, code), 'purpose');
  });
}

for (const code of [
  `const { [input.moduleId]: selected } = input;`,
  `const key = input.moduleId; const { [key]: selected } = input;`,
  `let key = 'profile'; const { [key]: selected } = input;`,
  `const { [0]: selected } = input;`,
  `const { ['pro' + input.moduleId]: selected } = input;`,
]) {
  test(`unsupported computed binding selectors fail closed: ${code}`, () => {
    mutant(files => body(files, code), 'purpose');
  });
}

test('admitted binding selectors preserve aliases, nesting, defaults, rest and parameter forms', () => {
  for (const code of [
    `const { profile } = input; profile.moduleId;`,
    `const { profile: selected } = input; selected.moduleId;`,
    `const { 'profile': selected } = input; selected.moduleId;`,
    `const { ['profile']: selected } = input; selected.moduleId;`,
    `const { [(\`profile\`)]: selected } = input; selected.moduleId;`,
    `const key = 'pro' + 'file'; const { [key]: selected } = input; selected.moduleId;`,
    `const { profile: { moduleId: selected } } = input;`,
    `const { profile: selected = input.profile, ...rest } = input; rest.declarations;`,
    `const [first] = input.declarations; first.moduleId;`,
    `const validate = ({ profile: selected }) => selected; validate(input);`,
    `function scan({ ['profile']: selected }) { return selected; } scan(input);`,
  ]) {
    const files = baseline();
    body(files, code);
    assert.deepEqual(auditM1JavaScriptClosure(files).exports, publicNames, code);
  }
});

test('admitted static members and genuinely dynamic element values remain distinct', () => {
  const files = baseline();
  body(files, `input.profile; input['profile']; input[\`profile\`];
const known = 'pro' + 'file'; input[known];
const dynamic = input.moduleId; input[dynamic]; input[dynamic + ''];
input[input.moduleId]; input.declarations[0];`);
  assert.deepEqual(auditM1JavaScriptClosure(files).exports, publicNames);
});

for (const [code, reason] of [
  [`import('node:fs');`, 'specifier'], [`require('node:fs');`, 'specifier'],
  [`const load = require; load('node:fs');`, 'global'], [`eval('input');`, 'global'],
  [`(0, eval)('input');`, 'global'], [`const load = Function; load('return 1')();`, 'global'],
  [`process.env;`, 'purpose'], [`fetch('https://example.invalid');`, 'global'],
  [`Date.now();`, 'purpose'], [`Math.random();`, 'purpose'],
  [`globalThis.crypto.getRandomValues(input);`, 'purpose'], [`globalThis['eval']('input');`, 'computed-call'],
  [`input.constructor;`, 'purpose'], [`input['constructor'];`, 'purpose'],
  [`const key = 'con' + 'structor'; const load = input[key];`, 'purpose'],
  [`input['compileComposition'](input);`, 'computed-call'],
]) {
  test(`rejects code loading or ambient operation: ${code}`, () => mutant(files => body(files, code), reason));
}

test('extra, default, star and namespace exports are closed', () => {
  mutant(files => files.set(ENTRY, Buffer.concat([files.get(ENTRY), Buffer.from('\nexport const extra = 1;')])), 'exports');
  mutant(files => files.set(ENTRY, Buffer.concat([files.get(ENTRY), Buffer.from('\nexport default compileComposition;')])), 'exports');
  mutant(files => edit(files, AUTHORING, 'export { defineModule, required, optional, many }', 'export *'), 'exports');
  mutant(files => edit(files, AUTHORING, 'export { defineModule, required, optional, many }', 'export * as helpers'), 'exports');
  mutant(files => edit(files, ENTRY, 'import { root }', 'import * as root'), 'module-syntax');
  mutant(files => files.set(ENTRY, Buffer.concat([files.get(ENTRY), Buffer.from("\nexport { root } from './composition/stage0.js';")])), 'exports');
});

test('private factories cannot acquire accepted helper names through aliases', () => {
  mutant(files => files.set(AUTHORING, Buffer.from(`export { required, optional, many } from './helpers.js';
export { createOwnedJcs as defineModule } from '../canonicalization/owned-jcs/factory.js';`)), 'export-origin');
  mutant(files => files.set(AUTHORING, Buffer.from(`import { createOwnedJcs as make } from '../canonicalization/owned-jcs/factory.js';
const renamed = make;
export { renamed as defineModule };
export { required, optional, many } from './helpers.js';`)), 'export-origin');
  mutant(files => edit(files, HELPERS, 'return declaration;', 'return Object.freeze({ canonicalize: declaration });'), 'helper-contract');
  mutant(files => edit(files, ENTRY, 'root.compileComposition', 'root'), 'public-origin');
  mutant(files => edit(files, ROOT, 'export const root = compiler;', 'export const root = createOwnedJcs;'), 'construction');
});

test('helper construction is checked against its accepted inert contract', () => {
  mutant(files => edit(files, HELPERS, 'return declaration;', 'return { ...declaration };'), 'helper-contract');
  mutant(files => edit(files, HELPERS, 'return declaration;', 'declaration.kind; return declaration;'), 'helper-contract');
  mutant(files => edit(files, HELPERS, "return { kind: 'required' };", "return Object.freeze({ kind: 'required' });"), 'helper-contract');
  mutant(files => edit(files, HELPERS, 'min: bounds.min', 'min: 0'), 'helper-contract');
  mutant(files => edit(files, HELPERS, 'min: bounds.min, max: bounds.max', 'max: bounds.max, min: bounds.min'), 'helper-contract');
});

test('the five private factories remain legitimate but assembly stays literal and closed', () => {
  mutant(files => edit(files, ROOT, 'createPlanOutput({ canonicalizer })', 'createPlanOutput({ canonicalizer: admission })'), 'construction');
  mutant(files => edit(files, ROOT, 'createPlanOutput({ canonicalizer })', 'createPlanOutput({})'), 'construction');
  mutant(files => edit(files, ROOT, 'const admission = createInputAdmission({});\nconst output = createPlanOutput({ canonicalizer });',
    'const output = createPlanOutput({ canonicalizer });\nconst admission = createInputAdmission({});'), 'construction');
  mutant(files => edit(files, CANONICAL, 'return Object.freeze({ canonicalize });', 'return Object.freeze({ canonicalize, emit: canonicalize });'), 'construction');
  mutant(files => edit(files, CANONICAL, 'return Object.freeze({ canonicalize });', 'const value = canonicalize; return Object.freeze({ canonicalize });'), 'construction');
  mutant(files => edit(files, ROOT, 'const compiler =', 'const extra = createOwnedJcs({});\nconst compiler ='), 'construction');
});

test('top-level effects, asynchronous initialization and ambient declarations fail', () => {
  mutant(files => files.set(ORDER, Buffer.concat([files.get(ORDER), Buffer.from('\nObject.freeze({});')])), 'top-level');
  mutant(files => files.set(ORDER, Buffer.concat([files.get(ORDER), Buffer.from('\nawait 0;')])), 'top-level');
  mutant(files => files.set(ORDER, Buffer.concat([files.get(ORDER), Buffer.from('\nlet state = 0;')])), 'top-level');
  mutant(files => files.set(ORDER, Buffer.concat([files.get(ORDER), Buffer.from('\ndeclare global { var host: unknown; }')])), 'parse');
  mutant(files => body(files, 'const Object = input;'), 'binding');
});

test('alias cycles and malformed input fail with bounded private reasons', () => {
  mutant(files => files.set(AUTHORING, Buffer.from(`const a = b; const b = a;
export { a as defineModule };
export { required, optional, many } from './helpers.js';`)), 'alias-cycle');
  reject(null, 'input');
  reject({ files: baseline() }, 'input');
  mutant(files => files.set(ORDER, 'not a Buffer'), 'input');
});

for (const code of [
  `const key = key + key; input[key];`,
  `const key = ((key + key)); input[(key)];`,
  `const left = right + right; const right = left + left; input[left];`,
  `const first = second; const second = first; input[first];`,
  `const key = input.moduleId + key; input[key];`,
  `const key = key + key; const { [key]: selected } = input;`,
]) {
  test(`cyclic static resolution rejects in an isolated worker: ${code}`, async () => {
    await isolatedMutant(files => body(files, code), 'alias-cycle');
  });
}

test('acyclic shared expressions memoize both constant strings and unknown dynamic leaves', async () => {
  for (const seed of ["''", 'input.moduleId']) {
    const files = baseline(), lines = [`const shared0 = ${seed};`];
    for (let index = 1; index <= 28; index++) lines.push(`const shared${index} = shared${index - 1} + shared${index - 1};`);
    lines.push(`const key = 'profile' + shared28; input[key]; input[key];`);
    body(files, lines.join('\n'));
    assert.deepEqual(await isolatedAudit(files), { result: { modules: [...sources.keys()].sort(), exports: publicNames } });
  }
});

test('static expansion work is bounded even for a shallow tree of empty strings', async () => {
  let expression = "''";
  for (let depth = 0; depth < 15; depth++) expression = `(${expression} + ${expression})`;
  await isolatedMutant(files => body(files, `input['profile' + ${expression}];`), 'limit');
});

test('over-depth static aliases reject instead of becoming unknown dynamic values', async () => {
  const lines = [`const key0 = 'profile';`];
  for (let index = 1; index <= 65; index++) lines.push(`const key${index} = key${index - 1};`);
  lines.push('input[key65];');
  await isolatedMutant(files => body(files, lines.join('\n')), 'limit');
});

test('oversized static concatenation rejects instead of becoming an unknown selector', async () => {
  const lines = [`const key0 = 'x';`];
  for (let index = 1; index <= 21; index++) lines.push(`const key${index} = key${index - 1} + key${index - 1};`);
  lines.push('input[key21];');
  await isolatedMutant(files => body(files, lines.join('\n')), 'limit');
});

test('cumulative static text work is bounded below the individual string ceiling', async () => {
  const lines = [`const key0 = ${JSON.stringify('schema.' + 'x'.repeat(512 * 1024))};`];
  for (let index = 1; index <= 15; index++) lines.push(`const key${index} = key${index - 1} + '';`);
  const files = baseline();
  body(files, [...lines, 'input[key15];'].join('\n'));
  assert.deepEqual(await isolatedAudit(files), { result: { modules: [...sources.keys()].sort(), exports: publicNames } });
  await isolatedMutant(candidate => body(candidate, [...lines, "const key16 = key15 + ''; input[key16];"].join('\n')), 'limit');
});

test('private byte budget has an inclusive boundary and is not a Core resource claim', () => {
  const files = baseline(), original = files.get(ORDER);
  const padding = 1024 * 1024 - original.length - 4;
  files.set(ORDER, Buffer.concat([original, Buffer.from('/*' + ' '.repeat(padding) + '*/')]));
  assert.equal(files.get(ORDER).length, 1024 * 1024);
  assert.deepEqual(auditM1JavaScriptClosure(files).exports, publicNames);
  files.set(ORDER, Buffer.concat([files.get(ORDER), Buffer.from(' ')]));
  reject(files, 'limit');
});
