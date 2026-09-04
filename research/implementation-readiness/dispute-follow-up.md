# Dispute follow-up audit

This is a coordinator audit of retained recommendations, not another worker
review or acceptance decision. The original four-per-topic results were read
from `evidence/raw/dispute-critics-2bef472/` at exact subject
`2bef472612dea7c6a89199a47dd8ca7ed552e630`. Historical results remain unchanged.

The goal requires a fifth framework/minimalism critic when four reviewers differ
by more than one score point or propose different semantics. Most results use
qualitative confidence; some use source-confidence values in `[0, 1]`. They do
not contain a comparable ten-point option score. This audit does not invent
such a score, convert confidence into preference, or infer a numeric consensus.
The table compares their actual `recommendedDecision` and minimal corrections.

| Topic | Common direction in retained recommendations | Additional action |
| --- | --- | --- |
| T1 descriptor/defineModule | One inert data model; helper is identity-only, not validation | Keep generic exactness as a public-typing decision, not a vote-selected API |
| T2 cardinality helpers | Preserve accepted names and shapes | **Fifth critic required:** security R3 proposes an own-property or trusted-literal restriction; other roles retain ordinary property reads |
| T3 dependency record | Typed object conditionally preferred; Map remains an internal index | Keep object/tuple/Map maintenance claims conditional; no replacement selected by these reviews |
| T4 declaration/factory | Inert declaration and separate product-owned construction | Re-review real association probes and new edit measurements; do not adopt serialized activationRef |
| T5 self-composition | ADR-0008 remains authority; no stage1 qualification claim yet | Current authority corrections need affected-area review, not a new self-hosting design |
| T6 identity/locality | Feature-local identity and derived inventory | Re-review corrected alternative-implementation case; 1000-module navigation still unmeasured |
| T7 Pure DI/composition | Reusable inert compiler plus product-owned Pure DI | Narrow S28 smoke/parity claim; product construction and failure evidence remain future gates |
| T8 private boundary | Owner-start enforcement before private source; proposed public decisions remain gated | No worker recommendation is owner-start authorization |

T2's concrete conflict is in
`gm-dispute-t2-r3-2bef-20260904.latest-result.json`, second P2 finding:
it proposes a successor restriction. R1/R2/R4 retain accepted non-validating
helper semantics. The current report already recognizes inherited reads as
accepted ADR-0007 behavior, so this is not permission to change the helper.

The fifth critic must read current accepted ADR-0007, the inherited-property and
Proxy probes, and all four original T2 results. Ask whether any reproducible
defect remains within the accepted contract, or whether R3's restriction is an
optional product change outside this task. Require evidence, a bounded verdict,
and no implementation or acceptance. Use hosted `gpt-5.6-sol`, `xhigh`, default
tier, network-disabled, read-only, with an exact verified bundle. It is pending
account capacity; no fifth result or approval is claimed here.

No different selected semantics were found in the other seven recommendation
sets. Their conditional evidence requirements differ by reviewer role; that is
not itself a different semantic choice. Missing comparable scores remain a
reporting limitation, not proof that all reviewers agreed within one point.
