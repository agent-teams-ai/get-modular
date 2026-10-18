# P7 authoring qualification

<!-- cspell:words EBADF -->

The selected H-01, H-02 and H-03 exercises passed on 2026-10-17 under the
[P7 plan](../../../../docs/qualification/module-fixture-plan.md#p7--validate-authoring-and-deliver-the-bounded-result)
and [H scenario oracles](../../../../docs/qualification/module-fixture-scenarios.md#h--one-fresh-author-and-bounded-diagnosis).
Source qualification remains **incomplete**. This record retains one fresh
author's three-file patch and a separate fresh reader's two bounded diagnoses.

| Exercise | Historical source base | Selected result |
| --- | --- | --- |
| H-01: author test-only B | P1 `2f1b33069d1942911e16824d658e3582b62da6a7` | One compile and one selected runtime invocation passed |
| H-02: diagnose provider selection | P2 `eec71521a8594a34ac8f614edd66e2d9af316ac0` | The public mismatch identified expected A and actual B |
| H-03: diagnose retained startup | Same P2 base | Pending stop was diagnosed before controller release; actual cancellation and cleanup then passed |

These are the exercise inputs, not claims about later P1 corrections or later
source-tool adoption. Package output identities are retained separately from
Git commits in [qualification.json](qualification.json).

## H-01: one fresh author

The author received the recipe, installed public declarations, unchanged
contracts, runner A, the owner suite and its independent A wiring expectation.
The packet withheld B's declaration and module. The author reported reading
only that packet and public declarations, with no history or withheld B lookup.

[author.patch](author.patch) contains exactly three additions, with paths relative
to the disposable packet:

- `semantic/tests/features/runner/runner-b.declaration.ts`;
- `semantic/tests/features/runner/runner-b.module.ts`;
- `semantic/tests/module/h01.test.ts`.

Apply this evidence patch only to the packet with B's two files withheld. It is
stored as fixture data; it registers no additional provider or test entry in
the repository. All 215 frozen packet inputs still match their recorded hashes.
Contracts, the A root/group, owner tests and supplied expectations were unchanged.

The same owner suite passed its success, failure and pre-effect cancellation
cases for fake, A and B. The connected B subject returned and recorded exactly
`left:B:hello` and `left:B:world`. A's unchanged provider pin first rejected B
with `conformance.wiring.mismatch`; the separately authored literal B pin then
passed. The session remained the sole root. Its actual connected B instance was
read through the public construction result for the native handle probe.

B's release append succeeded while its borrowed journal was usable. The complete
close report preceded journal closure, and both native probes subsequently
rejected with `EBADF`. This includes an actual file handle and journal.

Node `26.11.1` and TypeScript `7.0.2` compiled the runtime project once. One
runtime invocation selected `one owner contract suite|H-01`: 2 tests passed,
with 0 failures, cancellations, skips or todo tests. The unchanged owner suite
is one of those two tests. No additional compiler matrix, packed run or full
smoke was selected for the authoring exercise. The author reported no missing
recipe instruction, unexplained guess or reproducible blocker.

## H-02: the public mismatch

The separate reader received only the actual error, recipe and file map. Its
packet excluded authoring tests, injector/control code and the author's report.
The public error named `conformance.wiring.mismatch`: the expected selection
included `fixture/runner/runner-a/default`, while the actual selection included
`fixture/runner/runner-b/default`. Identity, journal and session selections agreed.

The reader correctly treated the four differences as one provider substitution.
They establish a selection mismatch, not a Runner contract incompatibility.
With the supplied correct A oracle, the smallest repair belongs to the
composition owner: restore A's selection and session binding while preserving
the oracle and the three agreeing selections. The file map alone cannot identify
the source edit that caused the substitution. No repair or runtime replay was
part of this diagnosis.

## H-03: pending startup and observed cleanup

At `2026-10-17T23:27:44.971Z`, the reader saw attempt `p7-held-startup` with
startup pending, cancellation requested, phase `stopping`, closed ingress,
zero publications and zero active work. No settled cleanup report was supplied.
The deadline was `2026-10-17T23:32:44.971Z`.

The reader correctly attributed the pending state to the retained attempt.
The observations did not identify a pending factory, faulty line, deadlock or
leak. It requested actual startup settlement, the stop/join result and complete
resource cleanup before calling the attempt finished. No private attribution
was supplied to make that diagnosis more specific.

After the diagnosis, the controller released the held attempt. The result was
recorded at `2026-10-17T23:29:00.774Z`, before the deadline:

- startup settled as `cancelled`, readiness was `false`, and phase was `closed`;
- ingress stayed closed, with 0 publications, 0 active work and 0 effects;
- the report was `{ complete: true, settled: true, debts: [] }`;
- the journal recorded one A acquisition, one cleanup attempt and one release;
- the real resource and borrowed journal probes both rejected with `EBADF`.

The successful cleanup receipt preceded completion of the controller's stdin
transport. EOF/process exit is a separate transport observation. The final
retained controller adds `process.stdin.pause()` after release input; this
transport-lifetime correction followed the observed exercise and was not
replayed. This record does not claim a verified exit for the corrected script.

## Frozen identities and limits

| Original evidence | SHA-256 |
| --- | --- |
| Frozen author input manifest, 215 files | `094e6397f1e0881d788e3c3a01aed5ee51cf97a0644603b251a0b79e7b42d733` |
| Author report | `a8d3eef7e0360c9a777418a0723fe9efbadaf15b8184048ca47f2e9a15c638a4` |
| Selected runtime TAP | `0f24df0deebf4aa48f0ca630214ffff727736371ac7edbcefb838a8142fc964b` |
| Public diagnosis observations | `e7632d428a6143261ad6de810556e901fcce5e9897a4ebcadfac4427c07af986` |
| Fresh reader's diagnoses | `3e663363b986c0014ce65078b78982acd0e03bf8efeb03fc38dc71000c6fd309` |
| H-03 controller result | `548d1064e86aa3c3613de91d675e6f95315d25abc84fe9459619ff6540699e14` |

The JSON receipt also retains the three authored file hashes, frozen fixture and
recipe hashes, all four package output identities, lockfile identity and the
H-02/H-03 observations. Hashes identify historical inputs; package outputs and
dependency directories are not copied into this record.

The exercise used the then-adopted Foundation `1.7.4` and FMS v1 coverage
statement. Separate public-kernel research with selected flat FMS v1.1 predicates
did not change that adoption. Passing H-01 through H-03 establishes these bounded
authoring and diagnosis observations; it supplies no complete source-standard,
packed-package, growth or workload result. No new public API, generator,
production root or recurring gate follows from this record.
