import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { rawDocumentCases } from '../qualification-support/m2-candidate/raw-document-cases.mjs';

// Actual built Core mutations for ADR-0021 M2.4, separate from oracle controls
// and canonicalizer replacements. These disposable reports are not custody proof.
const build = fileURLToPath(new URL('../../dist-stage0/', import.meta.url));
const carrierPath = 'src/features/input-admission/byte-carrier.js';
const entryPath = 'self-composition/stage0-entry.js';
const baseline = rawDocumentCases().next().value;
assert.equal(baseline.caseId, 'od005.raw-document.v1/baseline');
assert.equal(baseline.expected.ok, true);
const success = structuredClone(baseline.expected);
const profileFailure = (code, reason) => ({
  ok: false,
  diagnostics: [{
    code, phase: 'decode', coordinate: {},
    path: [{ kind: 'field', value: 'profile' }],
    details: { reason },
  }],
});
const sharedFailure = profileFailure('input.invalid-byte-carrier', 'shared-storage');
const offsetFailure = profileFailure('decode.invalid-json', 'invalid-json');
const zeroHooks = { slice: 0, iteratorGet: 0, iteratorCall: 0, species: 0 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const copyAnchor = 'return new CapturedUint8Array(value);';
const mutants = [
  {
    name: 'adr13.whole-backing-buffer-copy', witness: 'offset',
    edits: [[copyAnchor,
      'return new CapturedUint8Array(new CapturedUint8Array(capturedApply(bufferOf, value, [])));']],
  },
  {
    name: 'adr13.accept-shared-storage', witness: 'shared',
    edits: [['capturedApply(sharedProbe, buffer, []);', 'void buffer;']],
  },
  {
    name: 'adr13.own-slice-hook', witness: 'slice',
    edits: [[copyAnchor, 'return value.slice();']],
  },
  {
    name: 'adr13.iterator-hook', witness: 'iterator',
    edits: [[copyAnchor, 'return new CapturedUint8Array([...value]);']],
  },
  {
    name: 'adr13.species-hook', witness: 'species',
    edits: [
      ['const CapturedUint8Array = Uint8Array;',
        'const CapturedUint8Array = Uint8Array;\nconst capturedSlice = CapturedUint8Array.prototype.slice;'],
      [copyAnchor, 'return capturedApply(capturedSlice, value, []);'],
    ],
  },
];

function replaceExactlyOnce(source, before, after) {
  assert.notEqual(before, after);
  assert.equal(source.split(before).length, 2, `unique compiled mutation anchor: ${before}`);
  return source.replace(before, () => after);
}

// Serialized into an isolated child: it imports only Node helpers and the copied
// actual stage0 entry. No compiler implementation or expected result is supplied.
async function childMain() {
  const request = JSON.parse(readFileSync(0, 'utf8'));
  const carrierBytes = readFileSync(new URL('./src/features/input-admission/byte-carrier.js', import.meta.url));
  const carrierSha256 = createHash('sha256').update(carrierBytes).digest('hex');
  const subject = await import(pathToFileURL(join(process.cwd(), entryPath)).href);
  assert.equal(typeof subject.compileCompositionJson, 'function', 'actual raw export is required');
  const hooks = { slice: 0, iteratorGet: 0, iteratorCall: 0, species: 0 };
  const encode = recipe => {
    assert.equal(recipe.kind, 'utf8');
    assert.equal(typeof recipe.source, 'string');
    return new TextEncoder().encode(recipe.source);
  };
  const input = {
    declarations: request.recipe.declarations.map(encode),
    profile: encode(request.recipe.profile),
  };
  const bytes = input.profile;
  switch (request.witness) {
    case 'offset': {
      const backing = new Uint8Array(bytes.length + 2);
      backing[0] = 0xff;
      backing[backing.length - 1] = 0xff;
      backing.set(bytes, 1);
      input.profile = new Uint8Array(backing.buffer, 1, bytes.length);
      break;
    }
    case 'shared': {
      assert.equal(typeof SharedArrayBuffer, 'function', 'shared storage is required');
      input.profile = new Uint8Array(new SharedArrayBuffer(bytes.length));
      input.profile.set(bytes);
      break;
    }
    case 'slice':
      Object.defineProperty(bytes, 'slice', {
        value() {
          hooks.slice += 1;
          return new Uint8Array(bytes);
        },
      });
      break;
    case 'iterator':
      Object.defineProperty(bytes, Symbol.iterator, {
        get() {
          hooks.iteratorGet += 1;
          return function* () {
            hooks.iteratorCall += 1;
            for (let index = 0; index < bytes.length; index += 1) yield bytes[index];
          };
        },
      });
      break;
    case 'species':
      Object.defineProperty(bytes, 'constructor', {
        value: {
          get [Symbol.species]() {
            hooks.species += 1;
            return Uint8Array;
          },
        },
      });
      break;
    default:
      throw new Error('unknown carrier witness');
  }
  const result = await subject.compileCompositionJson(input);
  process.stdout.write(JSON.stringify({ witness: request.witness, carrierSha256, result, hooks }));
}

const childSource = [
  "import assert from 'node:assert/strict';",
  "import { createHash } from 'node:crypto';",
  "import { readFileSync } from 'node:fs';",
  "import { join } from 'node:path';",
  "import { pathToFileURL } from 'node:url';",
  `const entryPath = ${JSON.stringify(entryPath)};`,
  `await (${childMain.toString()})();`,
].join('\n');

function observe(sandbox, witness, expectedHash) {
  const child = spawnSync(process.execPath, [join(sandbox, 'carrier-witness.mjs')], {
    cwd: sandbox,
    input: JSON.stringify({ witness, recipe: baseline.inputRecipe }),
    encoding: 'utf8',
    timeout: 15_000,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
  });
  // Infrastructure errors, missing features, import errors and compiler throws
  // fail here, outside every assertion that recognizes a detected mutation.
  assert.ifError(child.error);
  assert.equal(child.signal, null, 'child must finish without a signal');
  assert.equal(child.status, 0, `child must execute Core successfully: ${child.stderr}`);
  assert.equal(child.stderr, '', 'child must not emit unexpected diagnostics');
  const report = JSON.parse(child.stdout);
  assert.deepEqual(Object.keys(report).sort(), ['carrierSha256', 'hooks', 'result', 'witness']);
  assert.equal(report.witness, witness);
  assert.equal(report.carrierSha256, expectedHash, 'executed carrier bytes match parent binding');
  assert.deepEqual(Object.keys(report.hooks).sort(), Object.keys(zeroHooks).sort());
  for (const count of Object.values(report.hooks)) assert.ok(Number.isSafeInteger(count) && count >= 0);
  assert.equal(typeof report.result?.ok, 'boolean', 'child must return a compiler result');
  return report;
}

function assertDetected(check, name, operator) {
  assert.throws(check, error => error instanceof assert.AssertionError
    && error.code === 'ERR_ASSERTION' && error.operator === operator
    && error.message.includes(name), `must fail the named semantic assertion: ${name}`);
}

for (const mutant of mutants) {
  test(mutant.name, async t => {
    const sandbox = await mkdtemp(join(tmpdir(), 'gm-m2-carrier-mutation-'));
    try {
      await cp(build, sandbox, { recursive: true, dereference: true });
      await writeFile(join(sandbox, 'package.json'), '{"type":"module"}\n');
      await writeFile(join(sandbox, 'carrier-witness.mjs'), childSource);
      const target = join(sandbox, carrierPath);
      const originalBytes = await readFile(target);
      assert.deepEqual(originalBytes, await readFile(join(build, carrierPath)));
      assert.deepEqual(await readFile(join(sandbox, entryPath)), await readFile(join(build, entryPath)));
      const originalHash = hash(originalBytes);
      const expected = structuredClone(mutant.witness === 'shared' ? sharedFailure : success);
      const wholeName = `${mutant.name}: complete independent result`;
      const hookName = `${mutant.name}: forbidden hook count`;
      const checkWhole = report => assert.deepEqual(report.result, expected, wholeName);
      const checkHooks = report => assert.deepEqual(report.hooks, zeroHooks, hookName);
      const normal = observe(sandbox, mutant.witness, originalHash);
      checkWhole(normal);
      checkHooks(normal);
      let mutated = originalBytes.toString('utf8');
      for (const [before, after] of mutant.edits) mutated = replaceExactlyOnce(mutated, before, after);
      const mutatedHash = hash(mutated);
      assert.notEqual(mutatedHash, originalHash);
      await writeFile(target, mutated);
      assert.equal(hash(await readFile(target)), mutatedHash);
      const changed = observe(sandbox, mutant.witness, mutatedHash);
      if (mutant.witness === 'offset' || mutant.witness === 'shared') {
        checkHooks(changed);
        assert.deepEqual(changed.result, mutant.witness === 'offset' ? offsetFailure : success);
        assertDetected(() => checkWhole(changed), wholeName, 'deepStrictEqual');
      } else {
        checkWhole(changed);
        const triggered = { ...zeroHooks };
        if (mutant.witness === 'iterator') {
          triggered.iteratorGet = 1;
          triggered.iteratorCall = 1;
        } else triggered[mutant.witness] = 1;
        assert.deepEqual(changed.hooks, triggered, 'only the corresponding witness hook runs');
        assertDetected(() => checkHooks(changed), hookName, 'deepStrictEqual');
      }
      t.diagnostic(JSON.stringify({ mutant: mutant.name, carrierPath, originalHash, mutatedHash }));
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });
}
