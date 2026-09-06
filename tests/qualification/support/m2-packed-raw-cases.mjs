import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { rawDocumentCases, materializeRawDocumentInput } from '../m2-candidate/raw-document-cases.mjs';
import { rawInvocationCaseIds, materializeRawInvocationCase } from './m2-raw-invocation-fixtures.mjs';
import { rawInvocationExpectedIds, rawInvocationExpectedResult } from './m2-raw-invocation-expectations.mjs';

// Direct fixture identities only. Transitive retained custody belongs to the
// integrating controller, including the carrier oracle and pinned vector files.
export const m2RawSourcePaths = Object.freeze([
  fileURLToPath(import.meta.url),
  fileURLToPath(new URL('../m2-candidate/raw-document-cases.mjs', import.meta.url)),
  fileURLToPath(new URL('./m2-raw-invocation-fixtures.mjs', import.meta.url)),
  fileURLToPath(new URL('./m2-raw-invocation-expectations.mjs', import.meta.url)),
]);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function definition(category, id, expected) {
  const document = category === 'document';
  return freeze({
    id: `raw/${category}/${id}`,
    title: `installed raw compiler ${category} ${id}`,
    flags: [],
    expected: { fixture: id, result: expected, forbiddenGetterReads: 0 },
    construction: {
      module: m2RawSourcePaths[document ? 1 : 2],
      export: document ? 'materializeRawDocumentInput' : 'materializeRawInvocationCase',
      id,
      entrypoint: 'compileCompositionJson',
    },
  });
}

// Streaming descriptors retain independent whole results, not document recipes
// or carrier inputs. In particular, enumerating invocation IDs never calls a
// carrier factory or allocates the large boundary payloads.
const documents = [];
for (const fixture of rawDocumentCases()) {
  documents.push(definition('document', fixture.caseId, fixture.expected));
}
assert.equal(documents.length, 123);
const invocationIds = rawInvocationCaseIds();
assert.equal(invocationIds.length, 62);
assert.deepEqual(invocationIds, rawInvocationExpectedIds());
const invocations = invocationIds.map(id => definition('invocation', id, rawInvocationExpectedResult(id)));
export const m2RawCaseDefinitions = Object.freeze([...documents, ...invocations]);
const byId = new Map(m2RawCaseDefinitions.map(row => [row.id, row]));
assert.equal(byId.size, 185);
for (const id of byId.keys()) {
  assert.ok(id.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(id));
}

export async function executeM2RawCase(caseId, compileCompositionJson) {
  const row = byId.get(caseId);
  assert.ok(row, 'unknown assigned raw fixture');
  assert.equal(typeof compileCompositionJson, 'function', 'the installed raw export must be callable');
  const id = row.construction.id;
  if (row.construction.export === 'materializeRawDocumentInput') {
    const input = materializeRawDocumentInput(id);
    const pending = compileCompositionJson(input);
    assert.ok(pending instanceof Promise, 'the raw entry returns a Promise');
    assert.deepEqual(await pending, row.expected.result, caseId);
    return;
  }
  const fixture = materializeRawInvocationCase(id);
  assert.equal(fixture.reads(), 0, 'construction must not invoke forbidden getters');
  // No wrapper, serialization or intervening await may hide snapshot timing.
  // fixture.expected describes private admission, so it is never a compiler
  // expectation. The separate original result corpus is the only oracle here.
  const pending = compileCompositionJson(fixture.input);
  fixture.after();
  assert.ok(pending instanceof Promise, 'the raw entry returns a Promise');
  assert.equal(fixture.reads(), 0, 'synchronous admission must not invoke forbidden getters');
  try {
    assert.deepEqual(await pending, row.expected.result, caseId);
  } finally {
    assert.equal(fixture.reads(), 0, 'raw execution must not invoke forbidden getters');
  }
}
