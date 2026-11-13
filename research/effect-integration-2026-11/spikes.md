# Native integration qualification evidence

Status: bounded research evidence, 2026-11-09. These experiments qualify concrete
design choices in the [proposal](README.md); they do not admit or publish a package.

## Subjects and toolchain

| Subject | Exact observation |
| --- | --- |
| GM source used by the native graph prototype | `5fb83478dd7b95216be92c4d3077eddf2774eef8` |
| Public GM packages | Core and Assembly 0.7.1, locally built through the prescribed repository route |
| Executed Effect | Published `effect@4.1.2` |
| Compiler | `typescript@7.0.2`, strict, exact optional properties, unchecked indexed access, `skipLibCheck: false` |
| Node / type declarations | Node 24.22.1; `@types/node@24.19.1` |
| Repository install/build | Frozen Bun 1.4.3 profile; `dev.ts install` and `dev.ts run assembly:build` exited 0 |

Effect source `ba272c5196e353794cd35bb75954548a845c6007` was read separately.
Executing the published package is not asserted to execute every byte of that
moving-source observation. OpenCode's inspected revision selects Effect 4.1.0;
its source is not the execution environment of these spikes.

## Native GM graph prototype

The prototype compiles a complete explicit GM profile through public Core,
associates the verified local injections with captured entries and lowers them
to real native Layers. It uses public Assembly authoring/types; it never invokes
`PreparedAssembly.run()`. The mapper has three narrow private assertions for
heterogeneous inventory; consumer wiring has no casts, `any` or disabled checking.

The runtime cases exercise:

- lazy construction, exact local `primary` and `archive` providers of one
  capability, diamond sharing, optional absence/presence and ordered many,
  including a one-element array;
- separate acquisition/finalization in independent native builds;
- captured declaration/profile isolation from later ordinary mutation;
- invalid bindings, duplicate inventory and wrong roots rejected before factories;
- required native `Config`, expected `BootFailure`, and cleanup on failed or
  interrupted construction;
- actual overlap of independent provider acquisition, using Deferred barriers
  rather than timing-based sleeps;
- a mapped FileHandle provider retained while its dependent's asynchronous
  finalizer waits on a Deferred and reads the file. The observed order is
  acquisition, dependent-finalizer start, completed read, provider release.

The last case uses the actual mapper's flat merge of selected nodes and native
provide edges. It qualifies this dependent/provider ordering, not arbitrary
Layer trees, foreign operations or a general drain protocol.

The compile-only fixture has twelve active `@ts-expect-error` assertions. It
checks lost R/E, missing slots, optional narrowing, readonly many, the one-element
many shape, Promise factories, wrong capability values/revisions, widened
declarations and a partially unknown capability inventory.

The prototype deliberately omits production groups/profile completion, borrowed
inputs in its mapper, descriptor/bounds hardening and full public API inference.
It lowers once per prepared graph; the proposed production policy of fresh
implementation Layers on every `.layer()` call remains to be implemented.
Its internal key prefix separates graphs in this adapter copy, not hostile
contexts or arbitrary multiple copies. Native parallel acquisition has no global
startup cap. Those limits remain implementation/adoption requirements.

### Input identity counterexample

A separate native paired test supplies different input Contexts to two branches
inside one Layer memoization domain. It does not claim borrowed-input support in
the GM prototype.

| Arrangement | Captured values | Acquisitions / releases |
| --- | --- | ---: |
| Reuse one implementation Layer object | `left-input`, `left-input` in the observed run | 1 / 1 |
| Create an implementation Layer per input instantiation | `left-input`, `right-input` | 2 / 2 |

The negative oracle requires equal captured values and one acquisition, not which
concurrent branch wins. This is expected native memoization, not an Effect bug.
The public design now carries input parameter N and requires its values. Every
`.layer()` call creates fresh implementation Layer identities, also when N is empty
and calls receive different ambient factory R services. Identity remains stable
across edges of that instantiated graph; deliberate sharing reuses the returned
Layer. The paired experiment qualifies the native identity hazard, not the as-yet
unimplemented production API or arbitrary environment substitution.

## Five paired lifetime experiments

The first three experiments acquire real disposable FileHandles. These are local
resource tests, not external service E2E or claims about production OpenCode.

| Experiment | Counterexample observed | Working arrangement observed |
| --- | --- | --- |
| Parent fiber versus lexical Scope | `forkChild` finalizer reads after the nested Scope released its file: `EBADF` | Register `forkScoped` after acquisition in the tested sequential Scope: finalizer reads before release |
| Foreign runner versus runtime owner | Work started with foreign `Effect.runFork` outlives its resource runtime: finalizer reads a closed file | Work started through its owning runtime is interrupted/joined before release in the tested arrangement |
| Lazy stream | Returning a resourceful Stream from a completed acquisition Scope leaves it reading a closed file | `Stream.unwrap(scopedAcquisition)` retains acquisition through consumption and finalization |
| Repeated disposal result | Concurrent raw `dispose()` callers observe original cleanup failure and a later fulfilled result | A concrete facade retains its first close Promise; both callers see the original failure, finalizer runs once |
| Native caller context | An internal runtime/Promise bridge observes the default Reference | Native chaining retains `request-42` from the caller |

The first case is a misuse counterexample, not a defect in `forkChild`. The working
recipes do not prove ordering for all Layer trees, parallel scopes or escaped
operations. Preserving the first disposal failure does not retry physical cleanup.
No interruption test proves termination of foreign I/O that ignores cancellation.

## Execution receipts

| Command in the restored experiment directory | Observed result |
| --- | --- |
| Native: `node node_modules/typescript/bin/tsc -p tsconfig.json --pretty false` | Exit 0, strict TS 7; twelve active negative fixtures |
| Native: `node --test native-composition.test.ts input-memoization.test.ts` | Exit 0; 9 tests passed, none failed/skipped |
| Lifetime: `node node_modules/typescript/bin/tsc --project tsconfig.json --pretty false` | Exit 0, strict TS 7 |
| Lifetime: `node lifetime-spikes.ts` | Exit 0; five paired counterexample/working cases asserted |

The integrating agent independently replayed these compiler and runtime commands.
The [archive manifest](raw/manifest.json.txt) records source hashes and versions;
the [native command evidence](raw/native/evidence.json.txt),
[independent native output](raw/native/root-runtime.stdout.txt) and
[lifetime receipt](raw/lifetime/runtime-receipt.json.txt) retain the actual results.
The mapper is 196 lines; it is a bounded prototype, not an estimate of a complete
public package. These are executable results, not a substitute source scan.

An earlier lifetime attempt checked Effect source under stricter consumer flags
and failed upstream source diagnostics. The successful qualification uses the
published package declarations with `skipLibCheck: false`; no compiler floor or
checking flag was weakened to claim success.

## Retained experiment format and reproduction

The archive under `raw/` retains the exact executed `.ts` sources as `.ts.txt`,
the original package/config files as `.json.txt`, version/hash receipts and output.
They are immutable research snapshots, following the existing repository evidence
convention. They are not new maintained code bypassing its normal gate.

To reproduce, restore the original filenames in an isolated scratch directory.
Install the exact Effect, compiler and Node type versions above. Build GM at the
recorded revision through its frozen installation and `assembly:build` route;
resolve the two public GM package names to those built packages. Run the commands
recorded in the archive. Package imports must remain public; do not replace them
with deep source imports. This setup is a local public-entry check, not a packed
consumer or registry-install qualification.

Before product admission, the [delivery steps](README.md#delivery-steps-and-concrete-stopping-points)
still require normal package/type gates, both public resolution modes, dependency
and bundle optionality, a chosen real consumer and its resource/cancellation cases.
