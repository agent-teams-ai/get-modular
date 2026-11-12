# Physical-close negative control

This isolated experiment tests the oracle in the maintained lifecycle fixture.
It does not change production code or introduce another test runner. The
[receipt](negative-control-receipt.json.txt) binds the exact working-tree test
content and records compiler/runtime versions, mutation and expected rejection.
The [output](negative-control.tap.txt) preserves the assertion failure.

## Reproduction

1. Build the matched repository packages using the pinned toolchain. Copy
   `packages/effect/tests/lifecycle.test.ts` and `support.ts` into one disposable
   directory immediately below the repository root. Their package imports resolve
   the same installed dependencies. In both copies change only the public import
   `../dist/index.js` to `../packages/effect/dist/index.js`.
2. In the lifecycle copy replace the one exact substring recorded in the receipt:
   remove the first provider's `await file.close();`, retaining its `released`
   increment and `resource-closed` event. Do not remove cleanup's fallback close.
3. In that directory use a temporary `tsconfig.json` extending
   `../packages/effect/tsconfig.test-tooling.json` with `include: ["*.ts"]` and
   `exclude: []`. Run the repository's TypeScript 7.0.2 compiler against it and
   require exit zero.
4. With ambient `NODE_PATH` cleared, run Node's test runner with TAP output and
   `--test-name-pattern="^partial parallel startup"` against the copied lifecycle
   file. Require exit one, one assertion failure on the expected closed descriptor
   (`-1`), and zero cancelled tests. The fixture's `finally` closes the retained
   handle and removes its disposable resource directory.
5. Delete the temporary test directory. The normal, unmodified lifecycle suite
   and installed-archive suite must still pass in the delivery checks.

The negative result demonstrates that success bookkeeping is insufficient to
pass the physical-close oracle. It is not an exhaustive mutation score, a resource
leak found in the implementation or an application shutdown guarantee.
