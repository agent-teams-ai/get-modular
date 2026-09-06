import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { rawInvocationCaseIds, materializeRawInvocationCase } from '../../../../tests/qualification/support/m2-raw-invocation-fixtures.mjs';
import { rawInvocationExpectedIds, rawInvocationExpectedResult } from '../../../../tests/qualification/support/m2-raw-invocation-expectations.mjs';
import { createOwnedJcs } from '../../dist-test/features/canonicalization/owned-jcs/factory.js';
import { createOwnedRawScanner } from '../../dist-test/features/raw-scanner/owned-iterative/factory.js';
import { createInputAdmission } from '../../dist-test/features/input-admission/factory.js';
import { createCompositionSemantics } from '../../dist-test/features/composition-semantics/factory.js';
import { createPlanOutput } from '../../dist-test/features/plan-output/factory.js';
import { createCompilerFacade } from '../../dist-test/features/compiler-facade/factory.js';

// Actual private pipeline, not public entrypoint or packed qualification.
// Complete failure results alone cannot prove byte ownership: the original
// recipes and their post-call mutations can both contain invalid JSON.
// Independently compare the scanner's retained bytes after those mutations.
test('all 62 original raw invocations: complete results and owned byte snapshots', async t => {
  assert.deepEqual(rawInvocationCaseIds(), rawInvocationExpectedIds());
  assert.equal(rawInvocationCaseIds().length, 62);
  for (const id of rawInvocationCaseIds()) {
    await t.test(id, async () => {
      const fixture = materializeRawInvocationCase(id);
      const expected = rawInvocationExpectedResult(id);
      const captured = [];
      const actualScanner = createOwnedRawScanner({});
      const admission = createInputAdmission({ scanner: {
        open(bytes) { captured.push(bytes); return actualScanner.open(bytes); },
      } });
      const canonicalizer = createOwnedJcs({});
      const facade = createCompilerFacade({
        admission: { admitObjectInput: admission.admitRawInput },
        semantics: createCompositionSemantics({ canonicalizer }),
        output: createPlanOutput({ canonicalizer }),
      });
      const pending = facade.compileComposition(fixture.input);
      assert.ok(pending instanceof Promise);
      fixture.after(); // No suspension between invocation and caller mutation.
      assert.equal(fixture.reads(), 0);
      assert.deepEqual(await pending, expected);
      assert.equal(fixture.reads(), 0);
      const documents = fixture.expected.documents;
      const byteExpectations = [...documents.declarations, documents.profile]
        .filter(document => document?.bytes != null).map(document => document.bytes);
      assert.equal(captured.length, fixture.expected.work.ownedCopies);
      assert.equal(new Set(captured.map(bytes => bytes.buffer)).size, captured.length);
      assert.deepEqual(captured.map(bytes => {
        assert.equal(fixture.references.has(bytes), false);
        assert.equal(fixture.references.has(bytes.buffer), false);
        assert.equal(bytes.buffer.resizable, false);
        return { length: bytes.length,
          sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex') };
      }), byteExpectations);
    });
  }
});
