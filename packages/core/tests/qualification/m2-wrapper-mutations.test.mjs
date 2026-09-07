import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { rawDocumentCases } from '../../../../tests/qualification/m2-candidate/raw-document-cases.mjs';

// ADR-0021 M2.4: mutate only disposable copies of the actual compiled wrapper.
// Complete expectations stay in this parent; children receive input recipes only.
const build = fileURLToPath(new URL('../../dist-stage0/', import.meta.url));
const wrapperPath = 'src/features/input-admission/invocation-wrapper.js';
const entryPath = 'self-composition/stage0-entry.js';
const baseline = rawDocumentCases().next().value;
assert.equal(baseline.caseId, 'od005.raw-document.v1/baseline');
assert.equal(baseline.expected.ok, true);
assert.ok(baseline.inputRecipe.declarations.length > 0);
const success = structuredClone(baseline.expected);
const zeroHooks = { profile: 0, index: 0, iterator: 0, ignored: 0 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const profileFailure = {
  ok: false,
  diagnostics: [{
    code: 'input.invalid-byte-carrier', phase: 'decode', coordinate: {},
    path: [{ kind: 'field', value: 'profile' }],
    details: { reason: 'not-document-list' },
  }],
};
const listFailure = {
  ok: false,
  diagnostics: [{
    code: 'input.invalid-byte-carrier', phase: 'decode', coordinate: {},
    path: [{ kind: 'field', value: 'declarations' }],
    details: { reason: 'not-document-list' },
  }],
};
const undefinedFailure = {
  ok: false,
  diagnostics: [{
    code: 'input.invalid-byte-carrier', phase: 'decode', coordinate: {},
    path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 0 }],
    details: { reason: 'not-uint8array' },
  }],
};
const countFailure = {
  ok: false,
  diagnostics: [{
    code: 'input.limit-exceeded', phase: 'declaration', coordinate: {}, path: [],
    details: { limitName: 'declarations', limit: 4096, actual: 4097 },
  }],
};

// Match the complete emitted guard, allowing only formatting whitespace.
const profileGuard = /if \(profileField === undefined\)[ \t\r\n]+return invalidWrapper\(\["profile"\]\);/g;
const countGuard = /if \(count > admissionLimits\.declarations\)[ \t\r\n]+return freeze\(\{ kind: "declarations-limit" \}\);/g;
const admittedReturn = /return freeze\(\{[ \t\r\n]+kind: "admitted",/g;
function uniqueMatch(source, pattern) {
  const matches = [...source.matchAll(pattern)];
  assert.equal(matches.length, 1, `unique compiled mutation anchor: ${pattern}`);
  return matches[0][0];
}
function replaceExactlyOnce(source, before, after) {
  assert.notEqual(before, after);
  assert.equal(source.split(before).length, 2, `unique compiled mutation anchor: ${before}`);
  return source.replace(before, () => after);
}
const mutants = [
  {
    name: 'count-before-profile-admission',
    normal: profileFailure, changed: countFailure, hooks: zeroHooks,
    mutate(source) {
      const profile = uniqueMatch(source, profileGuard);
      const count = uniqueMatch(source, countGuard);
      assert.ok(source.indexOf(profile) < source.indexOf(count));
      const removed = replaceExactlyOnce(source, profile, '');
      return replaceExactlyOnce(removed, count, `${count}\n    ${profile}`);
    },
  },
  {
    name: 'count-index-first',
    normal: countFailure, changed: listFailure, hooks: zeroHooks,
    mutate(source) {
      const count = uniqueMatch(source, countGuard);
      const admitted = uniqueMatch(source, admittedReturn);
      const index = 'const item = ownData(list, key);';
      assert.equal(source.split(index).length, 2);
      assert.ok(source.indexOf(count) < source.indexOf(index));
      assert.ok(source.indexOf(index) < source.indexOf(admitted));
      const removed = replaceExactlyOnce(source, count, '');
      return replaceExactlyOnce(removed, admitted, `${count}\n    ${admitted}`);
    },
  },
  {
    name: 'index-getter-read',
    normal: listFailure, changed: success, hooks: { ...zeroHooks, index: 1 },
    mutate: source => replaceExactlyOnce(source,
      'const item = ownData(list, key);', 'const item = { value: list[key] };'),
  },
  {
    name: 'own-undefined-index-as-missing',
    normal: undefinedFailure, changed: listFailure, hooks: zeroHooks,
    mutate: source => replaceExactlyOnce(source,
      'if (item === undefined)', 'if (item === undefined || item.value === undefined)'),
  },
];

// Serialized child has no fixture imports, oracle, expected values or fake Core.
async function childMain() {
  const request = JSON.parse(readFileSync(0, 'utf8'));
  const bytes = readFileSync(new URL('./src/features/input-admission/invocation-wrapper.js', import.meta.url));
  const wrapperSha256 = createHash('sha256').update(bytes).digest('hex');
  const subject = await import('./self-composition/stage0-entry.js');
  assert.equal(typeof subject.compileCompositionJson, 'function', 'actual raw export is required');
  const hooks = { profile: 0, index: 0, iterator: 0, ignored: 0 };
  const encode = recipe => {
    assert.equal(recipe.kind, 'utf8');
    assert.equal(typeof recipe.source, 'string');
    return new TextEncoder().encode(recipe.source);
  };
  const declarations = request.recipe.declarations.map(encode);
  const profile = encode(request.recipe.profile);
  const input = { declarations, profile };
  const first = declarations[0];
  switch (request.witness) {
    case 'count-before-profile-admission':
      input.declarations = Array.from({ length: 4097 }, () => first);
      Object.defineProperty(input, 'profile', {
        get() { hooks.profile += 1; return profile; },
      });
      break;
    case 'count-index-first':
      input.declarations = new Array(4097);
      Object.defineProperty(input.declarations, '4096', {
        get() { hooks.index += 1; return first; },
      });
      assert.equal(Object.hasOwn(input.declarations, '0'), false);
      break;
    case 'index-getter-read':
      Object.defineProperty(declarations, '0', {
        get() { hooks.index += 1; return first; },
      });
      break;
    case 'own-undefined-index-as-missing':
      declarations.unshift(undefined);
      assert.equal(Object.hasOwn(declarations, '0'), true);
      break;
    default:
      throw new Error('unknown wrapper witness');
  }
  Object.defineProperty(input, 'ignored', {
    get() { hooks.ignored += 1; return undefined; },
  });
  Object.defineProperty(input.declarations, Symbol.iterator, {
    get() { hooks.iterator += 1; return Array.prototype[Symbol.iterator]; },
  });
  const result = await subject.compileCompositionJson(input);
  process.stdout.write(JSON.stringify({ witness: request.witness, wrapperSha256, result, hooks }));
}
const childSource = [
  "import assert from 'node:assert/strict';",
  "import { createHash } from 'node:crypto';",
  "import { readFileSync } from 'node:fs';",
  `await (${childMain.toString()})();`,
].join('\n');

function observe(sandbox, witness, expectedHash) {
  const child = spawnSync(process.execPath, [join(sandbox, 'wrapper-witness.mjs')], {
    cwd: sandbox,
    input: JSON.stringify({ witness, recipe: baseline.inputRecipe }),
    encoding: 'utf8',
    timeout: 15_000,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
  });
  // Infrastructure failures cannot satisfy the semantic detection assertion.
  assert.ifError(child.error);
  assert.equal(child.signal, null, 'child must finish without a signal');
  assert.equal(child.status, 0, `child must execute Core successfully: ${child.stderr}`);
  assert.equal(child.stderr, '', 'child must not emit unexpected diagnostics');
  const report = JSON.parse(child.stdout);
  assert.deepEqual(Object.keys(report).sort(), ['hooks', 'result', 'witness', 'wrapperSha256']);
  assert.equal(report.witness, witness);
  assert.equal(report.wrapperSha256, expectedHash, 'executed wrapper bytes match parent binding');
  assert.deepEqual(Object.keys(report.hooks).sort(), Object.keys(zeroHooks).sort());
  for (const count of Object.values(report.hooks)) assert.ok(Number.isSafeInteger(count) && count >= 0);
  assert.equal(typeof report.result?.ok, 'boolean', 'child must return a compiler result');
  return report;
}

for (const mutant of mutants) {
  test(`adr21.m2.4.${mutant.name}`, { timeout: 60_000 }, async t => {
    const sandbox = await mkdtemp(join(tmpdir(), 'gm-m2-wrapper-mutation-'));
    try {
      await cp(build, sandbox, { recursive: true, dereference: true });
      await writeFile(join(sandbox, 'package.json'), '{"type":"module"}\n');
      await writeFile(join(sandbox, 'wrapper-witness.mjs'), childSource);
      const target = join(sandbox, wrapperPath);
      const originalBytes = await readFile(target);
      assert.deepEqual(originalBytes, await readFile(join(build, wrapperPath)));
      const entryBytes = await readFile(join(build, entryPath));
      assert.deepEqual(await readFile(join(sandbox, entryPath)), entryBytes);
      const originalHash = hash(originalBytes);
      const wholeName = `${mutant.name}: complete independent result`;
      const checkWhole = report => assert.deepEqual(report.result, mutant.normal, wholeName);
      const normal = observe(sandbox, mutant.name, originalHash);
      checkWhole(normal);
      assert.deepEqual(normal.hooks, zeroHooks, `${mutant.name}: normal forbidden hooks`);
      const mutated = mutant.mutate(originalBytes.toString('utf8'));
      const mutatedHash = hash(mutated);
      assert.notEqual(mutatedHash, originalHash);
      await writeFile(target, mutated);
      assert.equal(hash(await readFile(target)), mutatedHash);
      assert.deepEqual(await readFile(join(sandbox, entryPath)), entryBytes);
      const changed = observe(sandbox, mutant.name, mutatedHash);
      assert.deepEqual(changed.result, mutant.changed, `${mutant.name}: precise mutant result`);
      assert.deepEqual(changed.hooks, mutant.hooks, `${mutant.name}: precise mutant hooks`);
      assert.throws(() => checkWhole(changed), error => error instanceof assert.AssertionError
        && error.code === 'ERR_ASSERTION' && error.operator === 'deepStrictEqual'
        && error.message.includes(wholeName), `must fail the named semantic assertion: ${wholeName}`);
      assert.deepEqual(await readFile(join(build, wrapperPath)), originalBytes);
      t.diagnostic(JSON.stringify({ mutant: mutant.name, wrapperPath, originalHash, mutatedHash }));
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });
}
