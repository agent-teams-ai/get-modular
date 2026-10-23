# Growth consumer fixture

This test-owned profile implements the complete feature maps, file inventory,
arithmetic and independent provider pins in the
[G scenarios](../../../../docs/qualification/module-fixture-scenarios.md#g--a-real-file-tree-with-bounded-useful-computation).
The [P5 plan](../../../../docs/qualification/module-fixture-plan.md) and
[measurement handoff](../../../../docs/qualification/module-fixture-handoff.md#source-freshness-and-measurement-evidence)
remain the authority. [ADR-0041](../../../../docs/decisions/0041-preserve-complete-feature-maps-with-descriptor-unions.md)
selects the current complete descriptor-union recipe: each predecessor union
gets its own `CapabilitiesOf` base. The union and bases retain the same full
contract surface, including unused keys; they are generated from one predecessor
list and checked for parity and early conflicts. No compiler patch is selected.
The [2026-10-21 source receipt](source-evidence/2026-10-21/observations.json)
qualifies the earlier inherited-map source bytes only. Historical compiler
blockers and `scanner: not-collected` fields below retain their original scope;
they are not results for the new recipe. Current qualification requires fresh
source and supported-compiler reports. Process RSS remains separately collected
or explicitly `not-collected`.

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
evidence. Do not raise caps, repeat a timeout, reduce smoke or narrow the complete
map surface. The ADR-0041 representation change requires its own source identities
and qualification; it does not transfer historical timings.

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
node tests/qualification/consumer-fixtures/growth/upstream-compiler.ts --directory /absolute/new-directory
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

## Private compiler-owner result, 2026-10-20

A separate disposable experiment completed G-01 and the prescribed G-02/G-03
series through N=1000 with a private compiler patch. The
[evidence index](compiler-reproducer/2026-10-20-private-this-members/observations.json)
retains the exact patch, reduced controls, profiles, selected semantic checks,
private consumer adapter and complete measurement reports with raw logs. The
earlier observations above retain their original dates, inputs and limits.

The compiler derives from the same upstream commit
`3200b90a617bcf9ad26543b347cabad8ff0dad14` and verified source/Go archives used
in the 2026-10-18 follow-up. Its private patch SHA-256 is
`3a98de8a169b239da38cbe285de2f88e498406b8bdc24eec4685d6b4809a308e`;
the resulting native binary SHA-256 is
`061c589fd01523d69ca6bb74d74e6331b6092a14ee286bd60f11d7a51eeb9e66`.
The binary reports `7.1.0-dev`; the private manifest verifies its actual bytes
and the reviewed patch bytes. The build had a separate 600-second cap. This
compiler is a remedy candidate, with no supported-package or adoption claim.

### Materialization finding and semantic scope

The package-free N=200 mapped and inline controls preserve identical predecessor
edges and the root. On the exact upstream candidate, the mapped control's sampled
allocated space was 344.21 MB, including 248.31 MB in `addInheritedMembers`;
the inline control recorded 84.54 MB and 18.16 MB respectively. Source inspection
identified conservative synthetic `this` arguments for interfaces with mapped
bases, followed by inherited member materialization for different descendant
arguments. This is a separate cost from the overlapping-base traversal addressed
by the upstream candidate.

The private patch records a bottom-up proof only after member/base resolution
for originating interfaces without actual local/outer type parameters or `this`
references. It uses already proved interface bases and finalized concrete mapped
bases, including the existing alias-argument variable check. A proved target
reuses its own synthetic `this` argument when a descendant argument cannot affect
its members. Classes, generic interfaces, actual polymorphic `this` and
mapped bases whose members are still being resolved retain the existing route; no eager base resolution or
general instantiation cache is added.

With that patch, the mapped control recorded 82.86 MB of sampled allocated space,
including 26.72 MB in `addInheritedMembers`; its profiled wall time changed from
1.492871 to 0.462404 seconds. These are one-sample causal observations, not a
latency guarantee. Seven existing upstream cases passed their diagnostic and
emit baselines; six also checked type and symbol baselines, while the shared-base
case retains its upstream `noTypesAndSymbols` directive. They cover fluent `this`,
mapped aliases, distinct generic
instantiations, inherited-member conflicts, shared ancestry, cycles and generic
defaults. A focused baseline/patched counterexample also preserved captured outer
`this`, fluent alias inheritance and a concrete mapped foreign `this`. These
selected checks do not establish all upstream compiler behavior.

### Unchanged consumer results

The disposable consumer copy used Get Modular base
`c5c314ab98c57d2c73448f0c3c9860424a993d8a`. Its only runtime adapter change
selected a manifest explicitly marked `private-compiler-owner-patch`. The
generator, independent oracles, fixed edits, runtime inputs and external
supervisor were unchanged. Ready public package outputs were copied and hashed;
generated source, configuration, compiler, outputs and isolated build information
have their own identities in each report.

G-01 first passed N=8, including its literal values, compatible wrong-provider
rejection and complete smoke. Each larger size followed inspection of the
preceding result. All eight G-02/G-03 stages passed at each size, including the
unchanged incremental build, leaf edit/verification, baseline rewarm and fixed
six-file shared-contract edit/verification. The table shows baseline roots and
times in seconds; total time is measured by the existing parent supervisor and
includes generation, copying, hashing and runtime work.

| N | TS source files | Cold emit | Shared-contract emit | Total | Seed 17 root | Seed 23 root |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | 703 | 1.446243 | 0.892854 | 5.868069 | 452417 | 948032 |
| 500 | 3503 | 5.191031 | 3.548268 | 27.466654 | 750269 | 886955 |
| 1000 | 7003 | 11.190537 | 8.044707 | 46.281343 | 869439 | 632838 |

N=1000's baseline runtime stage took 8.522641 seconds. Its complete ordinary
smoke witnessed 2,001 attempts, 1,002,000 factory calls and 1,998,003 dependency
reads. Its baseline source SHA-256 is
`08733408d3e304d5551df7a009cd3ea8fd2ceea879c106018a98a0f37123aea5`.
Independent pins and both seeds passed after the prescribed edits. The original
180-second compiler, 120-second runtime and 600-second per-size aggregate bounds
were unchanged; no stage or aggregate deadline expired.

A separate Linux `wait4` observation recorded 994,103,296 bytes for N=1000:
the highest RSS of a waited process in the child lineage, including waited
descendants. It is not simultaneous aggregate process-tree memory. The cgroup
OOM and OOM-kill counters did not increase. These external observations are
separate from the driver's uncollected RSS field and compiler memory diagnostics.

### Remaining owner work

The private-candidate consumer experiment is complete. The supported TypeScript
7.0.2 growth delivery blocker remains open: this binary is neither a maintained
compiler release nor an adopted GM toolchain. The compiler/package owner now has
an exact patch, a reduced causal witness, selected semantic regressions and a
complete unchanged-map N=1000 report for maintainable-fix review. A maintained
artifact then follows its owning release process and a separate GM dependency
adoption/qualification delivery. The existing exact-upstream command and
supported compiler route are unchanged; the private adapter is retained only as
evidence.

This growth run selected no source scanner, so its source conformance remains
**incomplete**. P4's selected flat source observations are a separate result.

## Separate growth source qualification

The [2026-10-21 installed-package receipt](source-evidence/2026-10-21/observations.json)
records the then-current selected-flat source **PASS** for its inherited-map
bytes. Normal registry installation
uses exact Foundation 2.1.1 and FMS 0.2.3 archives; npm signature verification,
archive SHA-512 and provenance subjects bind both to release commit
`0e0de78d4c2089be8effc37da4cfd70eab22358c`. The CMS review against current
upstream `7131d0d` found no new delta. Immutable FMS and CMS authority bytes,
SDK pending/hold state and production adoption remain unchanged.

| Size | Source files | Resolved imports | External imports | Supervised source stage |
| --- | --- | --- | --- | --- |
| 8 | 59 | 109 | 51 | 4.889 s |
| 100 | 703 | 1,397 | 603 | 1.503 s |
| 500 | 3,503 | 6,997 | 3,003 | 7.862 s |
| 1000 | 7,003 | 13,997 | 6,003 | 21.549 s |

All cold source identities match the retained subjects. N8 includes eight
controls and restoration. The entire supervised series completed in 36.656 s;
the worker was reaped before its PASS receipt. Negative controls separately
prove deadline failure, process-group kill/reap and temporary consumer cleanup.
Four ordinary `.json.gz` reports retain 16,551,623 original bytes in 571,197
compressed bytes, with both identities in the compact receipt. Inspect a report
with `gzip -dc`; no custom archive tool is required. This result qualifies only
the selected flat source scope. Historical compiler/runtime observations and
the supported TS7.0.2 blocker retain their separate status.

`source.ts` supplies the source-only follow-up for the existing flat growth
recipe. It reuses P4's independent directory inventory and `checkFlatSource`
adapter: the installed public Foundation graph supplies actual files, resolved
imports and runtime export facts; the public FMS kernel checks the declared
feature surfaces; public Get Modular conformance checks the CMS layout records.
The installed Foundation source-dependency CLI separately enforces the role,
package and builtin policy over all of `src`. Five aggregate role boundaries
do not replace FMS's per-feature privacy, use-edge and cycle checks.

The earlier TEST source qualification separately recorded the reviewed CMS at Get Modular
commit `7131d0d7a6bb5dd4c3e8906ccac065c0be0e0333`,
`docs/architecture/common-assembly.md#consumer-module-standard`, Git blob
`dad8b6280cf999d9079d3106094e5626b63d83f4`, full-document SHA-256
`a6dac5d303adf80be3151c6703c919b715fd880a941a4ad68e927c87a7ee5882`.
The existing `compositionContracts` reference
`bd949a9a670862fea851a7791fce772fdef3b4fc` identifies organization FMS v1.1,
not an earlier CMS document; it remains unchanged alongside the adopted FMS v1
and selected kernel identities.

The historical P4 CMS observation at `a3a079b` / `2f1b330` was blob
`250f312d3cae733935d0ac48ddde8502665417df`, full-document SHA-256
`e5cb510c5ea83e54a6833cc40b6ad31fc5cf8c70d9838e4e0c6923edc6f70919`.
Review of the delta found the optional Observation communication, scope-bound
watch/load and disposer guidance, its testing-import restriction and linked
checks. The flat feature maps, role and descriptor surfaces, inputs, groups and
selected source predicates are unchanged. The source-helper change does not alter accepted
ADRs or production adoption. The current tooling package binding is recorded
below; nested and dynamic/Observation consumers remain unselected. Growth's application and public-contract policy
allows no package or builtin dependency.

The ordinary Assembly entry adds one source-only N8 check and eight controls
for the new growth mapping: public/private sibling surfaces, application imports
of descriptors, input ownership, module-level composition permission,
an actual type-use cycle, a use-case runtime export and application-to-Assembly
dependency refusal. Both the owner's rejecting verdict and the overall rejection
must accompany each required diagnostic. Existing P4 parser, computed-load,
re-export, root, overflow and filesystem-policy cases retain their unchanged
owner/adapter witnesses; this is not another syntax matrix.

Historical large-tree qualification uses physical copies of retained subjects.
It first verifies the actual final shared-contract-edit identity and every
recorded `after` file, then reverses exactly the six recorded edits in the copy
and requires the original cold source SHA, census and bytes. The source graph,
independent disk census and complete expected `7N+3` file list must agree.
Observed predecessor type-map imports and declaration value imports separately
match the independent recipe; expected edges never substitute for observed
source facts. The original consumer trees and historical reports stay immutable.

The declared scanner budgets are 60 seconds per positive source chain,
30 seconds per Foundation policy subprocess and 600 seconds for an external
aggregate supervisor enclosing copy, restoration, hashing and scanner work.
One retained baseline per selected size is inspected in order, without repeating
the compiler or runtime experiments. The new source observations qualify only
their exact copied source identities; they do not relabel historical
`scanner: not-collected` fields or resolve the supported TS7.0.2 compiler blocker.

The prior growth pin was `077434e34d75506a610bc9271f8b5b9d5718c876` /
`ae6792543bd19acc948e177e8d55632c9d51134e` /
`c2fe582a14ff6e79620b232ca7ffc914afb0474ec21fd43f208251dd7252f4a3`.
The reviewed current delta adds ADR-0039's Observation load cleanup guidance;
the selected flat source predicates are unchanged. This TEST pin migration
changes no accepted ADR or production adoption profile.

Completed positive observations reject after the 60-second source budget,
including baseline, the permitted public-surface control and restoration.
That elapsed-time check does not interrupt synchronous scanner work. Large-tree
qualification still requires the external per-source and aggregate supervisors
above; the ordinary N8 regression retains its existing 600-second test timeout.

The dated `source-evidence/2026-10-20/` tree retains all 79 original files
(8,069,203 bytes). Its unchanged `observations.json` indexes the exact hashes
and byte counts of its 78 payloads. GitHub marks these generated observations
as generated so the maintained helper is visible first; all raw diffs remain
inspectable. Only this immutable dated evidence is excluded from CSpell because
encoded paths and temporary directory suffixes are measured data, not prose.
The helper, current documentation and future evidence keep their normal checks.
The current compact JSON remains checked, with its recorded server username
recognized as a proper name in a dated spelling override.

For a new installed-package source-only series on Linux, after the existing
package builds:

```sh
node tests/qualification/consumer-fixtures/growth/measure-source.ts --directory /absolute/new-result-directory
```

The typed runner reconstructs only source bytes because the original physical
subjects are unavailable. Each generated source tree must match its retained
cold SHA-256, census and byte count before checking. It invokes neither the
compiler nor the runtime experiment. Its external parent supervises the owned
process group, kills it on a 60-second source stage or 600-second aggregate
deadline and reaps the worker before writing the result. N8 includes all eight
controls and restoration within its source stage; the aggregate covers all four
sizes together. This is a tighter series envelope than the original per-positive
source and per-size aggregate limits. Failed results are retained;
an existing output directory is refused. Raw reports stay with their compact
hash-bound index and supervisor receipt. This optional measurement is included
in the existing strict fixture typecheck, not added to every repository check.
