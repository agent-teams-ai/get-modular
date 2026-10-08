# Module change observation (lifecycle hooks): research archive

Research behind [OD-007](../../docs/open-decisions/OD-007-module-change-observation-package.md),
moved from the workspace `plans/` folder on 2026-10-02 so the original
vision, its evidence and its history live in the owning repository. This
directory is evidence, not governed authority: the open decision and a future
admitting ADR are the authority.

## Layout

Everything under `raw/` is preserved as received except for the
[redacted details](#redacted-details) listed below, link and status fixes in
the two evidence README files, and the new `raw/evidence/requests/README.md`. A directory-local `.markdownlint-cli2.jsonc` (new, not evidence)
turns Markdown lint rules off there so the original bytes stay intact, and
`.cspell.json` skips it as it skips other raw research evidence. Every file of
the TypeScript sketches (`raw/evidence/code-sketch/hooks-sketch*/`) carries an
extra `.txt` suffix, so the repository does not treat research code as
production source; the file contents are byte-identical to what the critics
reviewed.

| Path | What it is |
| --- | --- |
| [design.md](design.md) | Revision 4 of the research and recommended design, edited for this repository: links adjusted to this layout, rule 10 updated with the error-code agreement of 2026-10-02, workspace `AGENTS.md` citations marked as outside this repository, reviewer naming as described below, lint and spelling fixes (a note and directive for the deliberate rule numbering, "fan-out", one reworded sentence about timers), the stale-response countermeasure scoped to derived results, and a pointer to the known sketch v4 defects |
| [errata.md](errata.md) | Corrections to the preserved reports and sketch fixtures found after the move |
| [sketch-v4-known-defects.md](sketch-v4-known-defects.md) | Defects in the frozen sketch v4 confirmed after the move and its drift against the resources package on main, as input for the implementation delivery |
| [raw/revisions/](raw/revisions/) | Revisions 1-3 (originals SHA-256 `3709c3a7…`, `eee3f342…`, `9754799b…`; revision 1 is byte-identical, revisions 2 and 3 carry the redacted details below); their internal links refer to the former workspace layout |
| [raw/original-reports/](raw/original-reports/) | The five original hook research reports (Flutter/Riverpod, reactive UI, DI frameworks, plugin systems, scale), raw results, identities and their task scope; hashes in `research-document-hashes.json` |
| [raw/evidence/](raw/evidence/README.md) | Hosted critiques of revision 1, root-verified online sources, the review of revision 2, runtime capability check |
| [raw/evidence/research-r4/](raw/evidence/research-r4/README.md) | Research round 4: configuration and flags, reactive primitives, public API consistency |
| [raw/evidence/code-sketch/](raw/evidence/code-sketch/README.md) | Executable TypeScript sketches v1-v4 and the independent critiques that shaped them |

## Status and decisions

- Owner decisions (2026-10-01/02): Get Modular package, library-first, public
  `0.x`; one hub per event family with opaque data-only participants; modules stay
  factories, not classes; first proof on a TEST consumer (Agent Runtime has no
  fitting consumer today, see `raw/evidence/code-sketch/critic-reports/agent-runtime-consumer-scan.md`).
- The error-code scheme `<pkg>.<area>.<reason>` is agreed with the resources
  stream. The resources package landed on main for the 0.3.0 train
  (ADR-0030, not yet released on 2026-10-08); the design's resource port
  predates it, see
  [sketch-v4-known-defects.md](sketch-v4-known-defects.md#drift-against-the-resources-package-on-main).
- Nothing here is implemented in `packages/`; no build, test or release gate
  depends on these files.

## Reproducing the sketches

The sketches under `raw/evidence/code-sketch/hooks-sketch*/` are not part of the
workspace build. To run one, copy it outside the repository and restore the file
names there:

```sh
find . -type f -name '*.txt' -exec sh -c 'mv "$1" "${1%.txt}"' _ {} \;
```

Then provide
`node_modules/@get-modular/core` (this repository's `packages/core` at
`9c722ce`, the revision the sketches were built against, with its `dist`), compile `packages/assembly/src` into
`node_modules/@get-modular/assembly/dist` with its `package.json`, install
`typescript` (5.8.3 or 7.0.2 were used) and `@types/node`, then run `tsc -p tsconfig.json` and `node src/main.ts` on Node
24.18+ (v4: 30 checks).

## Provenance limits

Hosted `gpt-6.1-sol` critics had no web access (runtime capability check);
online sources were retrieved by the root session's own subagents and
relayed. Requested model profiles are manifest requests, not attested backend
tiers. Scores and LOC are design judgments; TEST evidence does not qualify
production.

## Redacted details

This public copy differs from the private originals only by:

- operator details: hosted worker accounts, host names, machine identifiers and
  worker-state paths in the identity, flow, profile and request files; the job
  launch requests keep only their job settings and prompt
  (`raw/evidence/requests/`);
- private runtime details: `raw/evidence/runtime-capability-check.md` keeps its
  findings but not the verbatim source excerpts, file hashes and install paths
  of the private hosted runtime;
- reviewer tooling names: the product and model names of the root session's
  reviewers and research subagents read as "independent" or "root-session"
  reviewers. The hosted critics' requested profile (`gpt-6.1-sol`, `xhigh`) is
  unchanged;
- one absolute local scratch path, shortened to `scratchpad/`.

Edited copies: revisions 2 and 3; in `raw/evidence/`, the README files (also for
links and status), `flow.json`, `runtime-capability-check.md`,
`root-review-of-revision-2.md`, `root-verified-online/README.md`, the four critic
`*.identity.json` files, `requests/`, the research round 4 files and the
code-sketch critic reports; in `raw/original-reports/`, the five
`*.identity.json` files and `research-requested-profiles.json`. Every other file
is byte-identical to its original (the sketch files under their `.txt` names).

Recorded hashes (`critic-input-hashes.json`, `root-verified-online/SHA256SUMS`,
`flow.json` and the revision hashes) describe what the critics actually
received, so they do not match the edited copies above. Many recorded critic
inputs (authority snapshots, relayed sources, macOS metadata files) are not part
of this archive at all. The original reports themselves (`hooks-*.md` and their
`*.result.json`) are unchanged and still match `research-document-hashes.json`.
Being hash-pinned, they still contain hosted worker workspace links under
`/srv/workers/` (in `hooks-reactive.md` and its result). The five research job
ids (`…-std-20261001-ro-u`), including in the edited identity files, keep their
last letter, which names a worker account slot, because they are the
cross-reference between files; the critic job ids carry no slot. Neither
carries credentials.
