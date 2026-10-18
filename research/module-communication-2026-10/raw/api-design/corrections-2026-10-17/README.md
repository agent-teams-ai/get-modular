# Corrections after the review of pull request #182

Date: 2026-10-17. Baseline: `b43ef11468ec3fe8b46e9e09f3d667d7aad96ca8`.
These are corrections to the archived research prototype and selected variant B types. They do not implement or
admit the observation package. The original 43-step results, earlier review reports and writer outputs remain
unchanged; this directory records the subsequent verification.

## Findings and corrections

| Finding | Correction | Before and after evidence |
| --- | --- | --- |
| `onResult` and `onError` lost their echo and cascade context before queued microtasks ran | Each callback owns a later delivery task, including its full microtask checkpoint. The loader context ends when its returned promise settles. | [Before](runtime-before.txt): seven failures among eleven R16 cases; synchronous and later-timer controls pass. [After](runtime-after.txt): all nineteen R16/R17 cases pass. |
| A fake global clock installed before import prevented `settled` from reaching its deadline | The testing helper captures the builtin `node:perf_hooks` clock through `process.getBuiltinModule`, where available. | [Before](clock-before.txt): the independent watchdog wins. [After](clock-after.txt): the helper times out while both global clocks remain frozen. |
| A finite property hid an infinite template index signature from `FixedKeys` | Check each key constituent for an open key set; retain the existing rejection of an empty record. | [Before](types-before.txt): five unused `@ts-expect-error` directives on each compiler. [After](types-after.txt): each of the five mixed open records produces `TS2344` on both compilers; finite-key positive cases compile. |
| Without `AsyncLocalStorage`, the internal startup await lost the synchronous loader context | Enter the context around the direct loader call after that await. | [Before](no-node-before.txt): five loader invocations instead of one. [After](no-node-after.txt): the first echo is rejected, with asynchronous detection still disabled. |

The new [runtime regressions](../runtime-b/review-regressions.test.ts.txt) also check currentness immediately before
delivery, canceled publication, and both filtered and global testing waits. Queued callbacks count as pending
delivery until their microtasks finish. They do not count as an active loader: independent review caught and closed
an intermediate regression where escalation could report drain debt after the loader had already settled. Both
result and error cases now exercise that ordering.

The [environment probe](../runtime-b/env-probe.ts.txt) runs each altered environment in a separate process. The
[type fixture](../probes/p9-traps.b.ts.txt) includes mixed numeric, string-template, number-template and bigint-template
keys, plus finite-key controls.

## Final verification

The [complete run](run-all.txt) exited with code 0: **all 45 steps had their expected outcomes**. The two added steps
are the fake-clock environment case and the nineteen-case runtime regression suite. Both mutation sweeps still
reject every deliberate defect: [15 in the stub probes](mutations-runtime.txt) and
[16 with the real resources package](mutations-resources.txt).

The existing stale-result probes in [runtime](../runtime/probes.test.ts.txt) and
[runtime-b](../runtime-b/probes.test.ts.txt) were strengthened. After callback delivery moved to a later task, their
original sequence allowed a newer flush to run before publication; the `compare-last-offered` mutation could then
pass. The added sequence commits after publication is queued and before its callback runs. It requires a store
revision check at actual delivery, and both mutation suites reject that defect again. All original assertions and
mutation entries remain in place.

### Follow-up review of pull request #183

Cubic found two gaps in the test evidence at `8a00836a1055ef4742585e0c59af698972cac498`:

- Probes 2 and 11, and their R1 and cooperative R6 equivalents, asserted that nothing was published immediately
  after `close()`. Closing drains the loader, while its callback has a later delivery task. These probes now await
  `delivered()` before checking publication, retaining every original assertion. With `publish-stale` enabled, both
  pairs previously passed: [stub before](close-oracle-before-runtime.txt),
  [resources before](close-oracle-before-resources.txt). Both pairs now reject the forbidden publication:
  [stub after](close-oracle-after-runtime.txt), [resources after](close-oracle-after-resources.txt). Those after logs
  intentionally contain two failed assertions each; the same probes pass with the correct engine.
- Probe 17 and R7 now assert `pendingWork([store]).flushes === 0` before releasing the loader and `=== 1` after its
  continuation. This proves that the old result is queued before the next commit. The `compare-last-offered`
  mutation still fails on the stale-result assertions, after both queue-state assertions have passed.

This follow-up changes the probes and clarifies documentation and comments; executable engine, clock and type
behavior is unchanged. Patches to the shared `performance.now` method exposed by `node:perf_hooks` require importing
the package first. Capturing that builtin does not bypass a method patch installed before import; the clock
guarantee has not been expanded.

The [toolchain log](toolchain.txt) records Node **26.11.0**, TypeScript **7.0.2** and **5.8.3**, resources source
`ca879f773fbbf8977bba8a348cc5a34660603067`, and Assembly/resources source for the type probe
`bcd4c9ad0fe47e58dccdfa172f1cb58e6a501ac3`. Dependency restoration used pnpm **11.20.0** and the existing locked
toolchain. [Source hashes](source-sha256.txt) bind the changed code, fixtures, README examples and runner to the
bytes used by the completed run. Paths in that file are relative to `raw/api-design/` and retain the archive suffix.

## Reproduce

Follow the [archive restoration and dependency steps](../../../README.md#reproducing-the-api-checks), in a separate
scratch directory. Then run:

```sh
bash tools/run-all.sh
```

The before logs for the four original findings use the final regression fixtures with three source files restored
from the baseline.
To repeat them, prepare another restored scratch copy with the same dependencies, set `repo` to the repository
clone, and run the following there. Each of the last four commands is expected to exit with code 1:

```sh
repo=/absolute/path/to/get-modular
baseline=b43ef11468ec3fe8b46e9e09f3d667d7aad96ca8
archive=research/module-communication-2026-10/raw/api-design
for source_file in runtime/core.ts runtime/testing.ts b-snapshot/api.d.ts; do
  git -C "$repo" show "$baseline:$archive/$source_file.txt" > "$source_file"
done
node --test-name-pattern=R16 runtime-b/review-regressions.test.ts
node runtime-b/env-probe.ts fake-clock-before
node runtime-b/env-probe.ts no-node
node tools/tsc-both.mjs --expect b-snapshot probes/p9-traps.b.ts
```

On the corrected sources, the same commands pass. Run `node runtime-b/review-regressions.test.ts` without the
filter to include all nineteen callback, currentness, cancellation and testing-wait cases.

The follow-up mutation logs use these focused commands. With the probes from `8a00836`, each command exits with
code 0 despite the mutation; with the strengthened probes, each exits with code 1:

```sh
OBSERVATION_STUB_MUTATION=publish-stale VARIANT=b-snapshot node --expose-gc \
  --test-name-pattern='^(2|11)\.' runtime/probes.test.ts
OBSERVATION_STUB_MUTATION=publish-stale node --expose-gc \
  --test-name-pattern='^R1\.|subscriber scope closes, loader honors abort' runtime-b/probes.test.ts
```

## Limits

Machine-specific restored-directory prefixes in the focused logs are replaced with `<restored-archive>/`, and trailing
spaces on blank lines are removed. All nonblank assertion output, line numbers and observed timings are unchanged.
The complete run used Node 26.11.0; it does not establish portable timing bounds or a fresh Bun result. The non-Node probe
simulates missing Node builtins and verifies synchronous detection, rather than testing a browser distribution.
Mocks that replace the builtin clock or scheduler still need to be installed after import. Without the builtin
clock API, a pre-faked global clock remains a limitation of the fallback.

The run repeats reference-solution gates, type probes, runtime probes and mutations. It does not generate or regrade
the historical writer rounds, alter ADR status, or replace production package admission and conformance checks.
