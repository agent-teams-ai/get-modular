# Integration design review record

Status: integrated critique and closure complete, 2026-11-09. Review judgments are not
execution evidence; see [spikes](spikes.md) for observed behavior and limits.

## Authoring and first cross-review

Three independent workstreams investigated native API/Layer lowering, lifetime
counterexamples, and OpenCode practices. The integration owner read the concrete
source and combined the proposal; no production package was admitted.

| Finding | Disposition |
| --- | --- |
| A vague shared-preparation seam could become a generic runtime or duplicate Assembly policy | Specify opaque `EntryFamily<F>` capture/prepare and inert `Wiring<F>` within the existing Assembly owner; exclude execution hooks |
| Initial `layer(rootsTag)` sketch could not supply declared borrowed inputs | Add N, required `RunInputs<N>` when nonempty, pre-acquisition capture and a named `InvalidInputs` error preserving E |
| One cached implementation Layer can alias two captured input sets | Paired native probe reproduced the alias; require separate identities per input instantiation and stable identities within it |
| Resource Scope and parent fiber are not the same lifetime | Retain failing and working real-resource probes, foreign-runner and lazy-stream cases; narrow the guarantee |
| Native independent acquisition did not establish a global concurrency cap | State the limit; no new scheduler or assumed reuse of Promise startup policy |
| OpenCode risks could be overstated as established production bugs | Separate three observed source weaknesses, scenario risks and positive practices; pin their source separately from the tested Effect version |

The lifetime author also reviewed the usage guide's ownership/context sections.
No new P1/P2 was found there; the resource-description wording was corrected to
say FileHandles are used by the first three paired lifetime experiments.

## Integrated independent review

Two fresh critics reviewed the combined proposal, guide, ADR and executable
evidence from API/preparation and resource/lifecycle perspectives. Both completed
a second closure pass over the corrections and receipts. Neither found remaining
P1/P2 within this bounded research scope. This is independent agent review, not
external PR approval, a production audit or admission of the proposed package.

| Integrated finding | Correction and closure |
| --- | --- |
| P2: a cached implementation graph also aliases different ambient R values, even without borrowed inputs | Every production `.layer()` call creates fresh implementation Layers; deliberate sharing reuses its returned Layer. Prototype's once-per-prepare limitation is explicit. Both critics confirmed closure. |
| P2: the canonical guide omitted input-identity and borrowed-ownership rules | Add the exact identity rule and retain external ownership; no automatic release or new lease protocol. Lifetime critic confirmed closure. |
| P2: input timing and typed-error behavior were ambiguous | Capture safe input records/references at `.layer()` call time; invalid shape is a failing Layer with `InvalidInputs` before GM factories, not a synchronous throw. Do not clone/freeze resources. Lifetime critic confirmed closure. |
| P2 evidence gap: real-resource recipes were separate from the actual mapper | Add one mapped FileHandle provider with a dependent asynchronous finalizer gated by Deferred. Root replay confirms reading before release; runtime total is now 9 passed. Both critics reviewed source and receipt. |
| P3: pre-acquisition wording could include caller-owned external Layers | Limit the guarantee to GM-selected factories/resources; external provisioning keeps its own policy. API critic confirmed closure. |

The integrating agent independently replayed strict TS 7 and the native runtime
suite, and the five paired lifetime experiments. Critics reviewed those receipts;
they do not claim additional independent execution themselves.

### Reviewed substantive identities

| Subject | SHA-256 |
| --- | --- |
| Proposal README | `268623d5cd240895966ec854a8860ad75efe2f145e7ccf18d3b543fb48d7b1e8` |
| Canonical practices | `d2badd48b481eb2b80ca6c1dc6a657845b588ad21928aacc4159b4996b54980a` |
| Spike report | `01b9bc7b03f7bf625dbd5c6e189f44856005dcff075f92d1dfc4490c26d30a59` |
| Frozen archive manifest | `4085a84d64207d3a18ae0162f4175f04c78f673882ecc10da3b91ddcbfd72cd0` |
| Mapper runtime test source | `f41c6dcb02f66a39d87e442d45af30680ef407f74aecb5268929fa1d5da9114a` |

Final status/verification bookkeeping does not change these reviewed substantive
files. The repository spell checker also identified technical/API vocabulary in
the previous research and the new guide. A bounded dictionary for these two
research directories admits the actual terms; no files or checks are excluded.
After closure, the archived native description's trailing blank line was
normalized, and its description hash/manifest updated. No executable source,
fixture or configuration changed; no additional runtime result is claimed.

The six earlier numbered plans remain byte-identical to the prior research
checkpoint. The integration is an explicitly newly selected direction, not a
silent extension of any one of those plans or of plugin lifecycle ownership.
