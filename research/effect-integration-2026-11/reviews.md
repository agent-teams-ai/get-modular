# Integration design review record

Status: 2026-11-09 and 2026-11-11 reviews closed. Review judgments are not
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

### Original reviewed substantive identities

These identities record the first closure, before the follow-up below; they are
not hashes of the subsequently revised proposal and practices.

| Subject | SHA-256 |
| --- | --- |
| Proposal README | `268623d5cd240895966ec854a8860ad75efe2f145e7ccf18d3b543fb48d7b1e8` |
| Canonical practices | `d2badd48b481eb2b80ca6c1dc6a657845b588ad21928aacc4159b4996b54980a` |
| Spike report | `01b9bc7b03f7bf625dbd5c6e189f44856005dcff075f92d1dfc4490c26d30a59` |
| Frozen archive manifest | `4085a84d64207d3a18ae0162f4175f04c78f673882ecc10da3b91ddcbfd72cd0` |
| Mapper runtime test source | `f41c6dcb02f66a39d87e442d45af30680ef407f74aecb5268929fa1d5da9114a` |

Initial status/verification bookkeeping did not change those substantive files.
The repository spell checker also identified technical/API vocabulary in
the previous research and the new guide. A bounded dictionary for these two
research directories admits the actual terms; no files or checks are excluded.
After closure, the archived native description's trailing blank line was
normalized, and its description hash/manifest updated. No executable source,
fixture or configuration changed; no additional runtime result is claimed.

The six earlier numbered plans remain byte-identical to the prior research
checkpoint. The integration is an explicitly newly selected direction, not a
silent extension of any one of those plans or of plugin lifecycle ownership.

## Follow-up: preserve neutral DX and challenge the OpenCode comparison

The follow-up starts from draft commit `8c715eac9eca9e36550e5a40e473802f9ea48098`.
Three fresh critics reviewed ordinary GM authoring, native Effect architecture,
and current OpenCode design independently. The integrating agent inspected the
relevant sources before applying the corrections. Findings below are gaps in
the proposed contract, not new observed runtime defects or production incidents.

| Finding | Integrated correction |
| --- | --- |
| P2: broadening `AnyEntry` for neutral groups could admit Effect entries to Promise-only `isolate` | Preserve existing Promise calls/defaults/inference and Promise-facing types. Carry concrete entry unions through shared groups; reject cross-carrier use in types and runtime. Reuse current type fixtures in implementation. |
| P2: ordinary native provision could be mistaken for replacing a closed GM provider | Add one replacement table: GM inventory before prepare, ambient R through native provision, root fake without the live graph, private service at its owner. A changed dependency tree needs a valid new inventory; no implicit pruning. |
| P2: fresh mapper Layers could be read as recursively isolating private native Layers or external services | Limit freshness to mapper-owned nodes. Captured private Layers, borrowed values and external native services keep their native identity/sharing policy. |
| `EntryFamily` / `Wiring` could prematurely become a general backend framework | Retain the required shared-preparation responsibilities; defer the smallest export shape to the first working native slice. No backend registry or execution hooks. |
| The no-Assembly-change alternative was dismissed without sufficient reason | Recognize explicit-profile-only integration as a valid smaller production scope. Recommend shared preparation for existing group/completion DX, without implementing both alternatives. |
| Breaking changes were permitted without showing an ordinary-user benefit | State that no mandatory source migration is demonstrated. Prefer additive/internal changes; require symbols, benefit, before/after sites and migration for any unavoidable break. Separate manual ownership migration. |
| OpenCode comparison under-described its useful extra policies | Record checked replacement/pruning, shared/local graphs, limited typed tag checks, ordered roots and decoration. Do not claim equivalent functionality in the proposed GM mapper. |
| Module, domain and lifetime boundaries could be conflated | Apply the existing CMS composition-boundary rule; no entry per Layer/entity and no new Host runtime. |

The first review found no P1. The changes add no runtime mechanism, package,
production source, spike or maintained test suite. Existing frozen experiments
remain unchanged: source inspection and their existing replacement/provision
cases suffice for these documentary corrections. Future production qualification
adds only the missing cross-carrier rejection and live-provider-not-acquired
assertion to the relevant existing fixtures/consumer scenario.

In round two, all three critics checked the corrected proposal, canonical guide,
proposed ADR and review record together, including findings outside their original
specialty. All confirmed closure without remaining P1/P2 in this research scope.
The neutral-DX critic also spotted an ambiguous migration cross-reference; it now
links to the real-consumer qualification section. The integration owner checked
the final wording: construction dependency order is a partial order, not literal
sequential execution of Core's full order or ordering of returned operations.
No further review cycle or execution experiment was required for these changes.

## 2026-11-11: adapt useful LayerNode behavior without a second engine

The owner asked to reconsider which LayerNode conveniences belong in GM/Effect,
and to make the practices visible from the proposed package. This round starts
from `5131d8789d88816ad458f1bd381727365b962a88`; it does not treat the earlier
scope exclusions as a permanent prohibition.

Three independent critics examined graph substitution/startup, shared/local
ownership, and current OpenCode practice/documentation. The integration owner
read the relevant current sources and challenged the proposed projection helper's
public typing. The graph critic revised that recommendation after the challenge.

| Finding | Decision |
| --- | --- |
| Runtime pruning alone can leave the removed provider's Config R or required inputs N in the public type | Use exact typed live/fake variants first. A reusable neutral projection remains eligible only with a useful and honest public E/R/N contract. Do not hide the cost of type-level graph computation in a small traversal estimate. |
| Current Assembly selects the supplied inventory exactly | Any future projection is pre-preparation data selection in the common neutral owner; the Effect mapper must not rewrite a verified Core plan. |
| Shared memoization identity, configuration identity and lifetime ownership are different contracts | Add a bounded application/two-session recipe with narrow borrowed inputs, native Scopes and in-scope stream consumption. Keep cross-composition ownership with Host. |
| Cache reference counts do not make owner shutdown join arbitrary active work | Document ingress/work settlement before local/shared release. Current RcMap owner closure visits its entries; foreign work requires its own contract. |
| LayerMap is useful but currently marked unstable | Keep it an optional version-qualified consumer choice, not a required GM public type or cache subsystem. |
| Root build order is weaker than arbitrary factory order | Sequence named application startup actions at Host; a root dependency may acquire before that root's listed turn. No new ordering DSL. |
| A research-only guide is harder to find from the intended package | Move the one guide to `packages/effect/docs/practices.md`, add a documentation-only README, update agent routes and leave a short historical pointer. No manifest, runtime source or exports are added. |
| Repository-relative supporting links would break outside the checkout | Use repository URLs for external material and a relative package README-to-guide link. Include the guide in eventual packed qualification. |

Current source observations: GM main `c81fb21766e27cf3535132ec2fc2cfd396497a96`
changes CI/tooling/evidence, not the relevant composition code. OpenCode
`c4bf172532b64a02142d2da9a72d57621c48423d` retains the inspected LayerNode,
SDK instance/Host/fetch/Promise and Location service blobs. AISDK changed elsewhere
but the reviewed abort-signal gap remains. Its catalog/override/lock still selects
Effect 4.1.0; this is not an installed-tree audit. The new Effect LayerMap/RcMap
observations use source `9d6b21fd80f99c7578832e9ee90562e5c5c92123` and are not
new runtime results on the old 4.1.2 spike environment.

No new runtime mechanism or execution spike was introduced. The two future
consumer cases reuse planned qualification: fake selection avoids both private
live acquisition and unused requirements; shared application/two-local ownership
survives failure, stream termination and asynchronous finalization. Existing
frozen source/configuration/result snapshots and the six earlier plans are unchanged.

All three critics cross-reviewed the integrated package guide/README, plan, ADR,
review record and agent routes. Each confirmed closure without remaining P1/P2
within this documentation/design scope. The ownership review confirmed the bounded
fail-fast recipe and the removal of an unobserved background fiber from its main
example. The graph review confirmed that precise E/R/N remains a future public
API qualification requirement. The documentation review confirmed one canon,
honest availability and explicit archived versus current source evidence.
No further runtime experiment or review cycle was needed for these corrections.

## 2026-11-11: distinguish worker outcomes from lifetime ownership

The owner requested a further independent review of the complete published
proposal and guidance at `0ca268e7a6548793522d03cde187eb06234dcdad`. Three critics
examined actual Core/Assembly preparation and typing, native lifetime/failure
semantics, and current OpenCode evidence plus package/agent navigation. The
integration owner challenged the concrete startup recipe. Earlier review closure
and green repository CI were not treated as proof of these usage semantics.

| Finding | Correction |
| --- | --- |
| P2: the scoped-fork example discarded its Fiber handle while rule 4 required an explicit failure policy | Retain the worker handle and race its joined outcome with foreground work. State that first completion, including worker success or interruption, ends the example's lifetime. Separate scoped ownership from failure handling and from aggregation of cleanup causes. Reporting-only remains an explicit alternative for nonessential work. |
| P2: acquire-all, then setup, then ingress can start eager workers before their prerequisites are ready | Limit that recipe to acquisition that does not start setup-dependent work. Otherwise acquire prerequisites, run the application setup use case, then construct workers with borrowed prerequisites under the same outer owner. Setup failure does not start workers or publish readiness. |

The correction adds conditional assertions to the already planned real-consumer
fixture when its actual workers require them. It adds no runtime, supervisor,
scheduler, startup language or public API. Existing Promise/Core contracts,
accepted ADRs, package availability, frozen experiments and the six earlier plans
remain unchanged. No additional execution experiment was required to establish
the source-defined fork/race behavior; the new recipe is not reported as executed.

Current OpenCode `63b42f6f02e4b74fae343eddbe567db2c53fcf21` differs from the prior
checkpoint only in two provider implementations and their tests. The inspected
LayerNode, SDK, lifetime and AISDK sources remain unchanged. Current Effect
`2b23262d50e5d6bec7708cab9ae738bdf7a04bdd` adds OpenRouter workload identity;
the inspected native lifetime/memoization code is unchanged. The canonical guide
retains exact source links and distinguishes these observations from execution.

All three critics cross-reviewed the integrated corrections and confirmed closure
without remaining P1/P2 in this documentation/design scope. The integration owner
also clarified that the earlier FileHandle result covers resource/fork ordering,
not execution of the newly documented outcome race. No further runtime experiment
or broader review cycle was needed for these source-backed corrections.
