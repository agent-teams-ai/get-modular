# Growth consumer fixture

This test-owned profile implements the inherited feature maps, file inventory,
arithmetic and independent provider pins in the
[G scenarios](../../../../docs/qualification/module-fixture-scenarios.md#g--a-real-file-tree-with-bounded-useful-computation).
The [P5 plan](../../../../docs/qualification/module-fixture-plan.md) and
[measurement handoff](../../../../docs/qualification/module-fixture-handoff.md#source-freshness-and-measurement-evidence)
remain the authority. Source conformance is **incomplete**; this driver does not
select a scanner or report process RSS.

## Correctness and optional measurement

`runGrowthCorrectness()` in `run.mjs` is the small Assembly integration API.
It generates N=8, uses the pinned current compiler in NodeNext mode, and executes
one full runtime/oracle/smoke. The exact small census is 59 production TypeScript
files, 9 declarations, 16 entries plus groups, 13 edges and 9 path nodes.
The smoke independently counts 17 attempts, 80 factory calls and 115 dependency
reads. A compatible wrong provider violates the handwritten pin and changes the
useful result. Successful temporary trees are removed; failures retain evidence.

From the repository root, with its pinned Node and ready package outputs:

```sh
node tests/qualification/consumer-fixtures/growth/measure.mjs --size 100
```

The command copies ready public packages, without build, install or pack.
It retains one disposable subject and its report/logs. N=8 selects G-01 only.
N=100, 500 and 1000 select G-02 plus these G-03 stages, once each:

1. Cold real emit from empty output and subject-specific build information.
2. Baseline independent pins, exact values for both seeds and one complete ordinary smoke.
3. Unchanged incremental emit, checking identical source and output identities.
4. Fixed leaf-body edit, emit and lightweight two-seed result/pin verification.
5. Restore baseline source and rewarm; this compiler invocation is labeled setup.
6. Fixed six-file shared-contract edit, emit and lightweight result/pin verification.

`patches.mjs` freezes the edits. The leaf adds one to the last feature's own term;
the independently expected root increases by one modulo 1,000,003. The shared
patch renames f003's public `read` to `readValue`, advances its descriptor to
revision 2, updates its provider and adapts f004/f006/f007 module mappings.
Application ports/use cases remain unchanged and results for both seeds stay equal to
baseline. No casts bridge the change. Each patch retains exact before/after
source and hashes in the report. Full smoke is not repeated for edit stages.

Current TypeScript/NodeNext alone measures growth, with `--singleThreaded`,
`--extendedDiagnostics`, `--incremental` and a subject-specific
`--tsBuildInfoFile`. Every compiler stage retains raw diagnostics and source,
output and build-info identities. Compiler memory diagnostics are not RSS.

The declared bounds are 180 seconds per compiler stage, 120 seconds per runtime
stage and 600 seconds for the entire selected size. The external parent owns both
stage and aggregate deadlines. A worker waits for its stage timer to be armed
before spawning a compiler or runtime, and acknowledges completion after that
child has been reaped. The worker does not kill a compiler wrapper on timeout:
the parent terminates the process group on POSIX or forcibly terminates the
still-owned worker tree on Windows. This preserves the ancestry needed to terminate
a native compiler behind its JavaScript wrapper. Stage logs use files directly,
so a buffered-output limit cannot terminate only the wrapper either. Interrupted
stages retain their active report and the parent's deadline/termination receipt.
The aggregate includes generation, copies, hashes, edits and child work. Scanner
time is not selected. Growth is sequential: review N=100's
report before selecting N=500, and N=500 before N=1000. The first ceiling,
watchdog or budget failure stops progression with nonzero status and retained
evidence. Do not raise caps, repeat a timeout, reduce smoke or flatten maps.

The retained N=100 pass and N=500 cold timeout recorded before this supervision
correction belong to their original driver identities: `run.mjs` SHA-256
`c405eea1a32436ed6c334daf7de7a396818001d2406051f5f7cec1fe9f5aa9eb` and
`worker.mjs` SHA-256
`0e697dc94d9c888feab852a5052aee6d445534ec1b83e841761e41c0dcbb247e`.
They are historical observations, not measurements of the corrected supervisor.

## Retained compiler investigation

`compiler-reproducer/` preserves the exact package-free witness, control,
configuration, raw stage logs and dated observations from the bounded compiler
investigation on 2026-10-17. These `.txt` sources are data: materialize them as
`witness.ts`, `tsconfig.json` and `package.json` in a separate directory before a
compiler-owner experiment. They are outside this profile's generated source
inventory and do not enter ordinary repository type checks.

The witness has 62 empty interfaces forming 30 overlapping diamonds. The control
has the same interface count with one base per derived interface. On pinned
TypeScript 7.0.2 / Node 26.11.1 / Linux x64, the control passed in 0.419051 seconds;
the witness reached its declared 10-second cap in 10.008194 seconds without
diagnostics. Commands and exact hashes are in `observations.json`. A reduced
probe uses the pinned compiler's `bin/tsc` with `-p tsconfig.json
--extendedDiagnostics --singleThreaded --pretty false`; enclose it in a declared
external supervisor, never run the failing witness unbounded.

Overlapping ancestry is sufficient to reproduce degradation without Get Modular.
The single-base control is a causal probe, not a replacement for accepted maps.
Retained richer chain-plus-capability-map probes also timed out, so the evidence
does not attribute all consumer cost to one compiler traversal.

At the recorded observation, upstream
[TypeScript PR #64737](https://github.com/microsoft/TypeScript/pull/64737), related to
[issue #63555](https://github.com/microsoft/TypeScript/issues/63555), was open and
unmerged at `3200b90a617bcf9ad26543b347cabad8ff0dad14`. Its candidate adds visited
tracking to interface-base traversal. Building that exact source first rejected
missing archive VCS metadata, then reached the unchanged 120-second build cap
with the archive VCS flag (120.004139 seconds). The experiment stayed within its
original 300-second aggregate deadline and produced no candidate binary.
Candidate witness, cycle/default and consumer checks were not executed. No
supported fix, compiler adoption or dependency change was verified.

Earlier accepted inherited-map N=8 and N=100 research passed; N=500 cold emit
reached 180.046857485 seconds at its 180-second cap, and N=1000 was not created
or run. Shallow-map timings do not qualify this subject. A compiler/package owner
must establish a provenance-bound remedy on the unchanged maps and regression
inputs before claiming that blocker resolved. The retained investigation is a
completed bounded result with an unresolved delivery blocker.

## Compiler-owner follow-up, 2026-10-18

The observations above retain their original date, inputs and limits. A separate
600-second **build-only** budget subsequently produced the exact PR #64737
candidate in 139.330176 seconds, using Go 1.27.2 and `-buildvcs=false -p 4`.
The source archive SHA-256 is
`034bb7bb88f1354b416f9c617a82b88af7f2344f279e9a697a73bf4276638858`;
the Go archive SHA-256 is
`ecbadb99091a3f46e31f5f934b068b1864eafa7995211b39eaddf76996045fe5`.
The resulting compiler reports `7.1.0-dev`. It is an unreleased source candidate;
the repository's supported TypeScript 7.0.2 pin and frozen lockfile are unchanged.

On this candidate, the exact empty-interface witness passed in 0.415223 seconds.
Upstream's `TestLocal/sharedInterfaceBaseTypes` regression passed, including its
interface/intersection, cyclic-base and generic-default cases. Existing Assembly
public type contracts also passed; a conflicting inherited feature map still
produced the expected TS2320 rejection.

The unchanged N=100 and N=500 consumers completed all eight G-02/G-03 stages.
N=500 took 45.208569 seconds overall: cold emit 18.547635 seconds and shared-contract
emit 16.757879 seconds. The full smoke counted 1,001 attempts, 251,000 factory
calls and 499,003 dependency reads. Its 3,503 source files have SHA-256
`2a84ede0f14d1535e30c12bcc52c3e3927039dfb57d682c4778e639554e1c11d`.
Source, generator, oracle, patches, configuration and all four copied package
outputs match the retained supported-compiler N=500 timeout inputs. This local
experiment used an explicitly identified candidate CLI shim; it does not attest
to a registry package. The optional route now invokes the native candidate
directly and verifies its binary and manifest hashes.

N=1000 remains **unqualified**. Its local cold stage exited with SIGKILL before
the 180-second deadline on an 8-GiB host. A separate memory-policy diagnostic
confirmed a cgroup OOM kill with Go's memory limit set to 5 GiB; this setting is a
[soft limit](https://go.dev/doc/gc-guide#Memory_limit), and that diagnostic is not
a completed G-02 run. A package-free N=500 mapped-base
control still took 11.866039 seconds, compared with 0.401670 seconds for an inline
property control. Thus Get Modular helper computation is unnecessary to reproduce
the remaining cost. The candidate's
[non-interface-base handling](https://github.com/microsoft/TypeScript/blob/3200b90a617bcf9ad26543b347cabad8ff0dad14/tsc/internal/checker/checker.go#L17752-L17771)
and [inherited member instantiation](https://github.com/microsoft/TypeScript/blob/3200b90a617bcf9ad26543b347cabad8ff0dad14/tsc/internal/checker/checker.go#L19522-L19569)
suggest repeated materialization; this is an inference from source and controls,
not a heap-profile result. Inlining properties would change the prescribed
feature-map form and was used only as a causal control.

Two disposable public Linux experiments preserved the original N=1000 profile
and its 180/120/600-second compiler/runtime/aggregate bounds:

| Run | Observed boundary | N=1000 result |
| --- | --- | --- |
| [39122676446](https://github.com/agent-teams-ai/get-modular/actions/runs/39122676446), commit `0299cf430716a37fd87a2842c73af57e52edd638` | Runner shutdown, shell exit 143; no candidate or stage report retained. | Unknown. |
| [39123727842](https://github.com/agent-teams-ai/get-modular/actions/runs/39123727842), commit `0c7729d83f01833fa352ff134130f8a09e742ffd` | One explicit infrastructure retry. Stdout records 16,766,410,752 bytes RAM, four CPUs, verified candidate build success in 130.741210 seconds, then cold-stage start. Runner shutdown followed 83.941434 seconds later, before stage end. | Unknown. |

Both runs skipped the subsequent integrity and artifact steps despite their
`always()` conditions; each retained zero artifacts. The second run's cgroup
memory counters were unavailable. These observations establish infrastructure
interruption, not a compiler timeout, OOM diagnosis, or successful N=1000 result.
Its verified native binary SHA-256 was
`c2861b2b2f656ce6e6be72d527d0fec3783e95ee70aa3165bc6f6f688963cbc8`.
Raw run/job/artifact metadata and complete job logs were read back for both runs.
No third attempt was selected.

After preparing the normal public package outputs, the opt-in compiler-owner
reproduction entry point is:

```sh
node tests/qualification/consumer-fixtures/growth/upstream-compiler.mjs --directory /absolute/new-directory
```

It requires the pinned Node 26.11.1 / pnpm 11.20.0, Linux x64,
and an observed effective memory budget greater than 8 GiB. It downloads and
hash-verifies the exact source and Go archives, externally supervises the separate
600-second build, and selects only the original N=1000 measurement. Its private
candidate manifest never replaces the default compiler route. The optional
workflow runs solely on pushes to `test/fixture-growth-upstream-diagnostic`, with
read-only repository permissions; it is not a new mandatory performance matrix.

The compiler/package owner still needs a complete provenance-bound N=1000 report
on unchanged maps, independent assertions and original caps, plus an explicitly
reviewed maintainable compiler remedy. Candidate N=500 success, source-conformance
coverage, and supported-pin adoption are separate claims. Source conformance
remains **incomplete**, and the supported-toolchain delivery blocker remains open.
