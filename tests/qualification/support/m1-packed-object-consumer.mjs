import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Trusted private Node consumer code. Importing this module only exposes inert
// case definitions and functions; it never imports or evaluates the candidate.
// The prepared consumer bootstrap supplies two consumer-local ESM operations.
// Candidate execution, require/import identity and fixture.run(actualCompiler)
// all occur in that fresh Node child. No compiler input crosses a JSON/RPC seam.
// This subprocess boundary is not a sandbox for arbitrary malicious JavaScript.
const core = '@get-modular/core';
export const runtimeNames = Object.freeze(['compileComposition', 'defineModule', 'many', 'optional', 'required']);
const closedPathError = 'ERR_PACKAGE_PATH_NOT_EXPORTED';
const typesError = 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING';

export function m1CaseIds(rows) {
  assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 256, 'case inventory must be nonempty and bounded');
  const ids = rows.map(row => row.id);
  for (const id of ids) {
    assert.equal(typeof id, 'string');
    assert.ok(id.length > 0 && id.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(id), 'case IDs have a closed spelling');
  }
  assert.equal(new Set(ids).size, ids.length, 'case inventory cannot contain duplicate IDs');
  return ids;
}

export function m1ErrorDetails(error) {
  const text = (value, length) => typeof value === 'string' ? value.slice(0, length) : null;
  return Object.freeze({ name: text(error?.name, 128),
    code: typeof error?.code === 'number' ? error.code : text(error?.code, 256),
    message: text(error?.message, 8192), stack: text(error?.stack, 8192),
    context: error?.context && typeof error.context.reason === 'string'
      ? Object.freeze({ reason: error.context.reason.slice(0, 1024) }) : null });
}

// These definitions are both the preparation inventory and the child's
// dispatch table. Expected behavior is implemented once, in these run bodies.
const nodeCases = [
  { id: 'node-root', title: 'Node import and require resolve one implementation and no private exports', flags: [],
    expected: { runtimeNames, target: 'dist/index.js', strictNamespaceIdentity: true },
    async run({ fromConsumer, resolved, loader }) {
      const required = fromConsumer(core);
      const namespace = await import(pathToFileURL(resolved).href);
      assert.equal(required, namespace);
      assert.deepEqual(Object.keys(namespace).sort(), runtimeNames);
      const imported = await loader.load(core);
      const observed = { names: Object.keys(imported).sort(), url: loader.resolve(core) };
      assert.deepEqual(observed, { names: runtimeNames, url: pathToFileURL(resolved).href });
      assert.equal(imported, namespace);
    } },
  ...['package.json', 'dist/index.js', 'unknown'].flatMap(path => [
    { id: `closed-subpath/require/${path}`, title: `require rejects the closed subpath ${path}`, flags: [],
      expected: { code: closedPathError },
      async run({ fromConsumer }) {
        assert.throws(() => fromConsumer(`${core}/${path}`), { code: closedPathError });
      } },
    { id: `closed-subpath/import/${path}`, title: `import rejects the closed subpath ${path}`, flags: [],
      expected: { code: closedPathError },
      async run({ loader }) {
        let result;
        try { await loader.load(`${core}/${path}`); result = { ok: true }; }
        catch (error) { result = { error: error.code }; }
        assert.deepEqual(result, { error: closedPathError });
      } },
  ]),
  { id: 'node-without-require-esm',
    title: 'Node without require(esm) rejects require but supports dynamic import of the same root',
    flags: ['--no-require-module'],
    expected: { requireEsm: false, code: 'ERR_REQUIRE_ESM', target: 'dist/index.js', runtimeNames },
    async run({ fromConsumer, resolved, loader }) {
      let code = null;
      try { fromConsumer(core); } catch (error) { code = error.code; }
      const namespace = await loader.load(core);
      const observed = { requireEsm: process.features.require_module, code,
        path: fromConsumer.resolve(core), names: Object.keys(namespace).sort() };
      assert.deepEqual(observed, { requireEsm: false, code: 'ERR_REQUIRE_ESM', path: resolved, names: runtimeNames });
    } },
  ...['browser', 'development', 'production', 'unknown-condition'].map(condition => ({
    id: `node-condition/${condition}`, title: `runtime condition ${condition} keeps the same JavaScript target`,
    flags: [`--conditions=${condition}`], expected: { target: 'dist/index.js' },
    async run({ loader, resolved }) {
      await loader.load(core);
      const result = { url: loader.resolve(core) };
      assert.equal(result.url, pathToFileURL(resolved).href);
    },
  })),
  { id: 'node-condition/types-import', title: 'the types condition selects declarations and has its exact ESM loading failure',
    flags: ['--conditions=types'], expected: { code: typesError, target: 'dist/index.d.ts' },
    async run({ loader, resolved }) {
      const url = loader.resolve(core);
      let result;
      try { await loader.load(core); result = { ok: true, url }; }
      catch (error) { result = { error: error.code, url }; }
      assert.deepEqual(result, { error: typesError, url: pathToFileURL(resolved.replace(/\.js$/u, '.d.ts')).href });
    } },
  { id: 'node-condition/types-require', title: 'require under the types condition still selects the sibling JavaScript default',
    flags: ['--conditions=types'], expected: { target: 'dist/index.js', runtimeNames },
    async run({ fromConsumer, resolved }) {
      const commonjs = { names: Object.keys(fromConsumer(core)).sort(), path: fromConsumer.resolve(core) };
      assert.deepEqual(commonjs, { names: runtimeNames, path: resolved });
    } },
  { id: 'javascript-authoring', title: 'JavaScript authoring preserves identity, fresh helpers and compiler handoff', flags: [],
    expected: { identity: true, freshMutableHelpers: true, copiedBounds: true, nonValidating: true, compilerHandoff: true },
    async run({ loader }) {
      const { defineModule, required, optional, many, compileComposition } = await loader.load(core);
      const input = { kind: 'get-modular.module-declaration', schemaVersion: 1, moduleId: 'example/app',
        implementationId: 'example/app/default', owner: { authority: 'example', path: ['app'] }, provides: [], slots: [] };
      assert.strictEqual(defineModule(input), input);
      const invalid = { ...input, schemaVersion: 999 };
      assert.strictEqual(defineModule(invalid), invalid);
      for (const [make, kind] of [[required, 'required'], [optional, 'optional']]) {
        const a = make(), b = make();
        assert.notStrictEqual(a, b);
        assert.deepEqual(a, { kind });
        assert.equal(Object.isFrozen(a), false);
        a.kind = 'changed';
        assert.deepEqual(b, { kind });
      }
      const bounds = { min: 0, max: 2 }, cardinality = many(bounds);
      bounds.max = 8;
      assert.deepEqual(cardinality, { kind: 'many', min: 0, max: 2, order: 'profile' });
      assert.notStrictEqual(many(bounds), many(bounds));
      assert.equal(Object.isFrozen(cardinality), false);
      assert.ok(Number.isNaN(many({ min: NaN, max: -1 }).min));
      const result = await compileComposition({ declarations: [defineModule(input)], profile: {
        kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'example/main', roots: [input.moduleId],
        selections: [{ moduleId: input.moduleId, implementationId: input.implementationId }], bindings: [] } });
      assert.equal(result.ok, true);
    } },
];
m1CaseIds(nodeCases);
for (const row of nodeCases) {
  Object.freeze(row.flags);
  Object.freeze(row.expected);
  Object.freeze(row);
}
Object.freeze(nodeCases);

function descriptor(row) {
  return Object.freeze({ id: row.id, title: row.title, flags: row.flags, expected: row.expected });
}
export function m1NodeCaseDefinitions(objectFixtures) {
  m1CaseIds(objectFixtures);
  for (const fixture of objectFixtures) assert.equal(typeof fixture.run, 'function', 'each trusted object fixture must be executable');
  const objects = objectFixtures.map(fixture => Object.freeze({ id: fixture.id, title: `installed package ${fixture.id}`,
    flags: Object.freeze([]), expected: Object.freeze({ fixture: fixture.id, completion: 'all existing fixture assertions returned' }),
    construction: Object.freeze({ module: fileURLToPath(new URL('./object-subject-cases.mjs', import.meta.url)),
      export: 'objectSubjectCases', id: fixture.id }) }));
  const rows = [...nodeCases.slice(0, -1).map(descriptor), ...objects, descriptor(nodeCases.at(-1))];
  m1CaseIds(rows);
  return Object.freeze(rows);
}

// Called only by a generated consumer bootstrap. fd 3 is the bounded structured
// completion channel; stdout/stderr are diagnostics and cannot indicate success.
// There is exactly one assigned case per child, with no discover/run-all mode.
export async function executeM1NodeCase(assignment, loader) {
  const binding = Object.freeze({ caseId: assignment.caseId, contextId: assignment.contextId,
    archiveIdentity: Object.freeze({ ...assignment.archiveIdentity }), inputSha256: assignment.inputSha256 });
  const record = (phase, details = {}) => {
    const bytes = Buffer.from(`${JSON.stringify({ ...binding, phase, ...details })}\n`);
    assert.ok(bytes.length <= 32_768, 'child observation is bounded');
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(3, bytes, offset, bytes.length - offset);
  };
  record('started');
  try {
    assert.deepEqual(Object.keys(assignment).sort(), ['archiveIdentity', 'caseId', 'consumer', 'contextId', 'inputSha256']);
    assert.match(assignment.inputSha256, /^[a-f0-9]{64}$/u);
    assert.match(assignment.archiveIdentity.sha256, /^[a-f0-9]{64}$/u);
    assert.match(assignment.archiveIdentity.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/u);
    assert.equal(typeof assignment.contextId, 'string');
    assert.ok(assignment.contextId.length > 0 && assignment.contextId.length <= 256);
    assert.ok(isAbsolute(assignment.consumer));
    assert.equal(await realpath(assignment.consumer), assignment.consumer);
    assert.equal(process.cwd(), assignment.consumer);
    assert.equal(typeof loader.load, 'function');
    assert.equal(typeof loader.resolve, 'function');
    const nodeCase = nodeCases.find(row => row.id === assignment.caseId);
    let fixture;
    if (!nodeCase) {
      // This is a fixed trusted import, never a candidate-selected module path.
      // Lazy loading also keeps the types-condition probes independent of the
      // trusted fixture dependency graph's own conditional package exports.
      const { objectSubjectCases } = await import('./object-subject-cases.mjs');
      m1CaseIds(objectSubjectCases);
      fixture = objectSubjectCases.find(row => row.id === assignment.caseId);
      assert.ok(fixture, 'the child must execute an existing assigned fixture');
      assert.equal(typeof fixture.run, 'function');
    }
    assert.deepEqual(process.execArgv, nodeCase?.flags ?? [], 'the assigned case uses exactly its prepared Node flags');
    const fromConsumer = createRequire(join(assignment.consumer, 'consumer.cjs'));
    const installed = await realpath(join(assignment.consumer, 'node_modules/@get-modular/core'));
    const resolved = fromConsumer.resolve(core);
    assert.equal(await realpath(resolved), join(installed, 'dist/index.js'));
    if (nodeCase) {
      await nodeCase.run({ fromConsumer, resolved, loader });
    } else {
      const required = fromConsumer(core);
      const namespace = await import(pathToFileURL(resolved).href);
      assert.equal(required, namespace);
      // The fixture calls the ACTUAL compiler before immediately mutating its
      // own objects. There is no serialization, asynchronous proxy or wrapper
      // around compileComposition that could conceal snapshot timing failures.
      await fixture.run(required.compileComposition);
    }
    record('passed');
  } catch (error) {
    const details = m1ErrorDetails(error);
    record('failed', { error: details });
    const diagnostic = `${details.stack ?? details.message ?? 'M1 child case failed'}\n`;
    writeSync(2, diagnostic);
    process.exitCode = 1;
  }
}
