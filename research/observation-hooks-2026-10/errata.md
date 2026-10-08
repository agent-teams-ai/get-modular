# Errata for the preserved evidence

Files under `raw/` stay as the critics and researchers produced them. A pull
request review on 2026-10-02 found the points below; each was checked against
the files, the sketch code or the primary source before it was recorded here.
Code defects that the implementation must fix are in
[sketch-v4-known-defects.md](sketch-v4-known-defects.md), not here.

## Reports and source notes

- `raw/evidence/code-sketch/critic-reports/scale-dx.md`: the scale and DX
  figures came from a generator (`gen.py`), a driver (`scale-main.ts`) and
  variants in a scratch directory that is not part of this archive. They are
  recorded results that cannot be reproduced from these files; the design cites
  them as measured on v1 variants and not re-measured on v4.
- `raw/evidence/critic-*.md`: hosted critics cite their input packet under
  `.research/input/`. `research-under-review.md` is
  `raw/revisions/revision-1.md` (SHA-256 `3709c3a7…`), `critique-scope.md` is
  `raw/evidence/critique-scope.md`, and the `root-verified-online/` topic files
  are byte-identical in `raw/evidence/root-verified-online/`. The
  `authority/`, `original-relay/` and `test-consumer/` inputs are not in this
  archive, so quotes from them cannot be checked here.
- `raw/original-reports/*.md`: statements that retained inputs matched
  `input-hashes.json` (for example `hooks-plugins.md:7`) record a check made at
  run time. That manifest and the relayed packet are not part of this archive,
  so those checks cannot be recomputed from these files.
- `raw/evidence/code-sketch/critic-reports/agent-runtime-consumer-scan.md`: the
  ADR numbers it cites are Agent Runtime decisions at `b0bcb265`, not Get
  Modular ADRs.
- `raw/evidence/root-verified-online/topic-a-opt-in-evolution.md:20`:
  `Action<out TOptions,string?>` is quoted verbatim from Microsoft's generated
  reference. The `out` comes from the documentation generator; the compilable
  C# signature is `IDisposable? OnChange(Action<TOptions, string?> listener)`.
- `raw/evidence/root-verified-online/topic-a-opt-in-evolution.md:221`
  (labelled synthesis): "They return an unregister handle" holds for Angular
  `DestroyRef.onDestroy`, Riverpod `ref.onDispose` (`RemoveListener`) and .NET
  `OnChange` (`IDisposable`), but not for Vue `onScopeDispose` (returns `void`)
  or Android `Lifecycle.addObserver` (removal is `removeObserver`). Read it as a
  property of the proposed API.
- `raw/evidence/root-verified-online/topic-c-hierarchy-config.md:3`: the
  `../raw/` download directory existed only in the original workspace. This
  archive keeps the URLs, pinned revisions and verbatim quotes in the topic
  files, not the downloads.

## TEST fixtures in the sketches

These affect only the sketch fixtures, not observation behavior, and no
recorded check depends on them:

- `Greeter` (`hooks-sketch-v4/src/features/greeting/greeter.ts.txt:16-17`, and
  earlier sketches) picks the honorific independently of `locale`, so `en` with
  `formal` renders an English greeting with a Russian honorific.
- `controllableRates` (`hooks-sketch-v4/src/host/test-adapters.ts.txt:10-11`,
  and v2-v3) keeps one resolver per held currency, so concurrent `fetchRate`
  calls for the same held currency overwrite each other and `release()` wakes
  only the last; it also reads `table[currency]` without an own-property check,
  so `toString` returns a function instead of the unknown-currency error. A
  reusable adapter must queue every waiter and check own keys.
- `TaxTable.replace` (`hooks-sketch-v4/src/features/tax-table/tax-table.ts.txt:11-12`,
  and v3) keeps the port-returned object by reference. The sketch port returns
  a fresh literal, but a port that later mutated it would change `vat()` without
  a new derivation, so participants should copy or freeze port results they
  keep.
