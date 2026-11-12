# Dated audit experiments

These are retained inputs and outputs for the
[2026-11-12 audit](../../architecture-audit-2026-11-12.md).
They are evidence snapshots, not maintained tooling or new performance gates.
[manifest.json.txt](manifest.json.txt) binds their bytes. The runtime receipt preserves original filenames. Retained runtime files have
explicit prefixes as well as a `.txt` suffix; use the restore mapping below.
The OpenCode manifest identifies local inspection copies with an added terminal
LF, not the original upstream blob bytes.

Production source is baseline `0ff54371967e4b56a9978f784f568a48731a324d`.
The plan-only checkout head was `d20f3a1cb01f230fff23d7993e4b1e2b3304b7d8`.
Node 24.22.1, Effect 4.1.4, TypeScript 7.0.2, Linux x64 were used.
The installed Effect Layer source's Git blob is
`fa5391b761c9407b8e30e64c9327df6b71820ec9`; its merge concurrency is visible at
lines 1625–1638. The upstream release source has the equivalent merge behavior
at a different line range; identical whole-file bytes are not asserted.

## Inputs and results

| Probe | Source | Output and meaning |
| --- | --- | --- |
| Chain/wide graph | [runtime-scale.ts.txt](runtime-scale.ts.txt) | [runtime-scale.jsonl.txt](runtime-scale.jsonl.txt): exact counts, dependency lifetime and one timing observation per size |
| Real file cleanup defects | [finalizer-defects.ts.txt](finalizer-defects.ts.txt) | [finalizer-defects.jsonl.txt](finalizer-defects.jsonl.txt): both defect identities preserved; single close after both dependents |
| Native type scale | [type-scale.ts.txt](type-scale.ts.txt) | [type-scale-evidence.json.txt](type-scale-evidence.json.txt): six strict generated-consumer checks, diagnostics and source digests |
| Counterexamples to broad claims | [boundary-probe.ts.txt](boundary-probe.ts.txt) | [boundary-probe.jsonl.txt](boundary-probe.jsonl.txt): outer concurrency one still permits two independent acquisitions; fresh mapper calls can return the same pre-created factory object |
| Added maintained tests | Normal package test files | [maintained-tests.tap.txt](maintained-tests.tap.txt): 18 successful native cases, zero failed/cancelled/skipped at the recorded local stage |

The baseline native suite had 16 cases; the added large-graph and cleanup-defect
cases make 18. This retained local log is not remote CI or final archive evidence.
The normal archive test repeats those 18 cases through extracted package roots.

## Reproduction

Use a checkout of the baseline or reviewed successor, with its selected frozen
installation and built Core, Assembly, Resources, Conformance and Effect packages.
Do not install an unrelated Effect or compiler version for this measurement.

Restore `runtime-scale.ts.txt` as `scale.ts`, `finalizer-defects.ts.txt` as
`finalizer-defects.ts`, and `runtime-tsconfig.json.txt` as `tsconfig.json` in a
disposable directory outside Git.
Give it `{"type":"module"}` in `package.json`, link its `node_modules` to the
checkout's installed dependencies, using the restored
[runtime project](runtime-tsconfig.json.txt).
Run the owning TypeScript 7.0.2 compiler with `-p` pointing to that project,
then execute `node scale.ts` and `node finalizer-defects.ts`.
The [receipt](runtime-receipt.json.txt) records commands and package entry hashes.

Restore `type-scale.ts.txt` as `type-scale.ts` in a disposable ESM directory.
The runner accepts two absolute arguments: the built repository and a **new**
output directory. It creates 100/500/1000-entry consumer fixtures and symlinks,
executes preparation to reject invalid generated graphs, runs both NodeNext
and Bundler checks, writes each compiler log and
`evidence.json`, and binds generated source by SHA-256. The runner's `sourceBase` is a fixed
historical comparison label, not a Git revision attestation. Confirm the actual
checkout and production diff separately when reproducing on a successor.
Example command shape:

```sh
node /absolute/probe/type-scale.ts /absolute/get-modular /absolute/new-results
```

The runner was strictly checked with TypeScript 7.0.2, NodeNext, ES2024 and the
checkout's Node type roots. The generated consumers use `types: []`,
`skipLibCheck: false` and strict checks; counters use `--singleThreaded`.
The retained `type-*-NodeNext.log.txt` and `type-*-Bundler.log.txt` contain
the complete diagnostic summaries.

The boundary probe uses relative imports into `./get-modular`; restore it
beside a directory or symlink with that name pointing to the same built checkout.
It was strictly checked and executed with the same compiler/runtime/peer.
Its two assertions concern native behavior, not factory isolation enforcement.

## Interpretation limits

Runtime preparation timing combines explicit Core compilation and verified
preparation. Build timing includes Layer creation, use and release. Wide probe
counts are providers plus a separate root; maintained growth fixtures instead
have exactly 1,000 total selected nodes. Runtime resources are synthetic except
for the explicit FileHandle probe. RSS is cumulative across one process, not
isolated peak/retained memory. Type-scale observations are built public
declaration checks, not an IDE benchmark or installed 1,000-node consumer.
No timing is a portable SLO, no upstream suite was executed, and no application
with thousands of concurrent sessions was qualified.
