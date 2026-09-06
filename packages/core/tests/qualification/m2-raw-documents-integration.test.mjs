import assert from 'node:assert/strict';
import test from 'node:test';
import { rawDocumentCases, materializeRawDocumentInput } from '../../../../tests/qualification/m2-candidate/raw-document-cases.mjs';
import { createOwnedJcs } from '../../dist-test/features/canonicalization/owned-jcs/factory.js';
import { createOwnedRawScanner } from '../../dist-test/features/raw-scanner/owned-iterative/factory.js';
import { createInputAdmission } from '../../dist-test/features/input-admission/factory.js';
import { createCompositionSemantics } from '../../dist-test/features/composition-semantics/factory.js';
import { createPlanOutput } from '../../dist-test/features/plan-output/factory.js';
import { createCompilerFacade } from '../../dist-test/features/compiler-facade/factory.js';

// Execute real admission, semantics, canonicalization, output and facade against
// frozen complete expectations. The temporary test adapter selects raw admission
// through the facade's existing slot; public raw-entry qualification is separate.
const canonicalizer = createOwnedJcs({});
const admission = createInputAdmission({ scanner: createOwnedRawScanner({}) });
const compiler = createCompilerFacade({
  admission: { admitObjectInput: admission.admitRawInput },
  semantics: createCompositionSemantics({ canonicalizer }),
  output: createPlanOutput({ canonicalizer }),
});
for (const row of rawDocumentCases()) {
  test(`actual private raw compiler pipeline: ${row.caseId}`, async () => {
    assert.deepEqual(await compiler.compileComposition(materializeRawDocumentInput(row.caseId)), row.expected);
  });
}
