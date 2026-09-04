# Get Modular implementation-readiness handoff

## Disposition

**NO-GO now for landing the first tracked private Core source.**

The normalized composition architecture is directionally sufficient for a
bounded private slice, but one immediate start condition is not closed:

1. The ADR-0015 product-owner start record is absent and not mechanically enforced.

This report patch resolves the earlier M1 callable/packing contradiction and
restores accepted ADR-0008 W0/W1 precedence. Current checker and oracle gaps stay
visible as later qualification blockers. After a governed owner-start record
and admission enforcement, the result becomes **CONDITIONAL** for a source-only
private normalized-value slice. It remains **NO-GO** for Phase 3 qualification,
self-composition, public packaging, runtime conformance, or release claims.

No reproducible P0 was observed. Because there is no Core subject, this is not evidence that a future implementation is P0-free.

## Custody and evidence accounting

| Item | Exact identity | Observation |
| --- | --- | --- |
| Required base | `0f7d2fc64ae7258781e6c2676ca1e0ccc377f418` | Present and verified as a Git object |
| Frozen integrator subject | `72d140da7975d0ca2b5f4180885c6fc4b2c05cd8` | All four integrators reviewed this detached, clean head |
| Report synthesis input | `c40d016c13c5a5ff3fbb5c27d5d668229755bec2` | Parent of this report rewrite; the final reviewed commit is recorded externally in PR #16 |
| Integrator source bundle SHA-256 | `1538e8ed0b8f7eb35439087753e9636a7e1a6d2058eb758f581d37716c25a839` | Coordinator supplied and recorded by all four wrappers |
| Report source bundle SHA-256 | `3a2f90d4ac7e7a7331ec137357a2d49a1be8a6aee4296ab906b3035bd3072b99` | Independently verified before the bounded report run |
| Four-integrator result aggregate | `4b53d31b981ee0a4ea8d6a6329148453d925fdff2fd0aee40225ad22dd2957ba` | Four `done`, read-only wrappers with zero changed files |
| Initial campaign | `combined-workers.json` | Base `0f7d2fc…`; 51 wrappers: 49 `done`, 2 `partial` |
| Final inventory subject | `e0388dc6a3dd72f114e83b41768f4ceefe7cc87c` | Source-bundle digest `5a129322ced656fb37a1857fd9d9bb1df1a34f78a336c8e13c379c28b7ed581b` |
| Final inventory | `worker-index.json` / canonical manifest | 110 raw files, 97 byte-unique results, 13 duplicate aliases, 88 canonical roles, 9 attempts |
| Reconciled evidence states | Manifest v2 | 11 positive, 75 review-only, 5 source-unavailable, 4 partial, 2 blocked. Only 8 positive records are canonical; 3 are attempts |
| Dispute critics | Subject `2bef472612dea7c6a89199a47dd8ca7ed552e630` | 32 unique topic×role wrappers, all `done`; source-bundle digest `216bb3b0…` |
| Dispute manifest integrity | Aggregate `ccd13b6652a45a6e4d80a4ca5b2ff80a95fdc7a624d3f30695d181e61e233838` | All 32 wrapper hashes and the aggregate were independently recomputed |
| Indexed source integrity | 115 indexed sources | All current indexed hashes verified with no mismatch |

The dispute wrapper bytes and bundle manifest are custody evidence. Their nested JSON/YAML summaries are reviewer analysis, not executable proof.

Worker count was not treated as consensus. In particular:

- B1 is canonically `partial`; serialization was not executed.
- B3 is canonically `blocked`; its positive extra run is a retry, not independent agreement.
- B2 and B4 extras are retries of positive canonical lanes.
- A2’s two partial attempts are excluded; its canonical result remains review-only.
- A5/A6 extras are attempts, not additional reviewers.
- The 32 critics are role-distinct reviews, but share a model and frozen subject; they do not prove runtime behavior.
- O1–O5 are source-unavailable under the final manifest and supply no positive OSS evidence.

## Authority and precedence

The normative ladder is:

1. Accepted ADR-0001 through ADR-0008 and ADR-0015,
   `ARCH-SYSTEM-BOUNDARY`, `GM-REQ-V1`, and their digest-pinned artifacts.
2. The immutable organization Feature Module Standard adopted at an exact blob
   and SHA-256 by ADR-0002.
3. The active local Feature Module Standard mapping/profile and mechanically
   governed repository policies. They apply the accepted authority but do not
   replace it.
4. Current contract and roadmap as derived implementation guidance; neither may override an accepted ADR.
5. Proposed ADR-0009 through ADR-0014 and ADR-0016 as candidate decisions only.
6. Static qualification fixtures and disposable API laboratories.
7. Worker analysis, integrator recommendations, and the draft readiness report.

| Authority group | Status | What it controls | What it cannot authorize |
| --- | --- | --- | --- |
| ADR-0001..0008 and ADR-0015 | accepted | Semantic contract, package identities, diagnostics/limits, self-composition direction and private-source admission | Starting implementation without the owner record; open carrier/public semantics |
| `ARCH-SYSTEM-BOUNDARY`, `GM-REQ-V1` and accepted contract ledgers | accepted/digest-pinned | System boundary, closed normative requirements and immutable qualification artifacts | Runtime behavior without a real subject |
| Organization Feature Module Standard at the ADR-0002 pin | accepted through ADR-0002 | Universal feature ownership and dependency-direction rules | Get Modular package identity or product behavior |
| Active local Feature Module Standard document/profile and governance policies | active local mapping/enforcement | Repository path mapping, local extensions, admission and promotion custody | Replacing the pinned organization standard, product behavior or public API |
| ADR-0009..0014 and ADR-0016 | proposed | Candidate names, primitives, release custody, carriers, repeated records and construction witness | Any production/public claim before acceptance |
| OD-004, OD-005 and OD-006 | open | Package carrier, raw/trusted boundary and repeated binding-record choices | A default implementation choice |
| Roadmap and self-composition guide | active derived guidance | Dependency-safe implementation order and file ownership | Overriding accepted ADRs |
| Fixtures, workers and this report | non-authoritative evidence | Reproduction, measurements, recommendations and blockers | Consensus, acceptance or product-owner authorization |

ADR-0007 has only named-topic additive precedence over ADR-0004–0006. ADR-0015 supersedes only ADR-0003’s implementation-deferral sentence; package identities and publication restrictions remain intact.

The accepted public compiler names remain `compileCompositionV1` and `compileCompositionJsonV1`. Other `V1`, `v1`, and `resource-profile-v2` labels identify historical evidence lineage and do not establish multiple supported public API generations.

ADR-0015 permits private source but does not start implementation. The required owner-start record must bind repository, source authority, accepted private package identity, owner, private normalized-semantics scope, and explicit exclusions for publication, carriers, lifecycle, and proposed ADR semantics. The roadmap states that the admission checker must consume it; no such record or checker input exists.

## Findings

### AUTH-01 — P1, real governance defect

**Evidence/result IDs:** `gm-dispute-t8-r1-2bef-20260904`, `gm-dispute-t8-r3-2bef-20260904`, `gm-final-4dee-r1-authority-20260903/F-AUTH-001`, `gm-readiness-a5-seq-20260903`.

**Impact:** The retained reproduction admitted otherwise-valid `packages/core` source without any owner-start input. The exact head still contains no governed authorization record.

**Minimal correction:** Define the closed record format, obtain product-owner authorization, bind it non-self-referentially to the authorized base/package/scope, and reject missing, stale, wrong-package, wrong-SHA, or over-broad records.

**Owner/authority:** Product owner authorizes; architecture/governance owns enforcement under ADR-0015.

**Blocks first private source:** **Yes.**

### AUTH-02 — P1 documentation defect, resolved by this patch

**Evidence/result IDs:** `gm-dispute-t8-r2-2bef-20260904`, `gm-dispute-t8-r4-2bef-20260904`, `gm-final-4dee-r1-authority-20260903/F-AUTH-002`.

**Impact:** The roadmap’s M1 matrix allows `compileCompositionV1`, while its Phase 3/4 gates allow only an unexported private normalized-value seam before carrier decisions. Phase 1 also says to stop “subject packing” while requiring temporary qualification archives. An implementer cannot determine the lawful callable and packing boundary.

**Correction applied:** M1 is now consistently a private normalized-value
qualification seam. The packing prohibition names production/distribution
packing and explicitly allows temporary hash-bound qualification subjects.

**Owner/authority:** Architecture owner; a broader carrier choice requires product-owner acceptance.

**Blocks next step:** **No after this patch.** An object/raw carrier still waits
for its governed decision.

### GOV-01 — P1, current checker regression

**Evidence/result IDs:** `gm-readiness-a2-lane-l-20260903`; contradicted report claim at `report.md:82-88`.

**Impact:** `feature-module-standard-profile.mjs:253-265` unconditionally requires structural and runtime states to remain `not-claimed`. It cannot validate the documented ordered promotion. Commit `711845c` restored this behavior after the report described the checker as transition-aware.

**Minimal correction:** Restore the closed `not-claimed → structural-conformant → runtime-conformant` state validation while leaving evidence grant authority in governance.

**Owner/authority:** Architecture/conformance owner.

**Blocks next step:** No for source admission; **yes for later structural/runtime promotion.**

### GOV-02 — P2, latent package-admission defect

**Evidence/result IDs:** `gm-dispute-t8-r1-2bef-20260904`, `gm-dispute-t8-r2-2bef-20260904`, `gm-final-4dee-r1-authority-20260903/F-GOV-001`.

**Impact:** The retained reproduction accepted `@rogue/pkg` when the open-decision set was empty. Accepted package identities are checked only by `productionArtifactsBlockedByOpenDecisions`; `validateBlockedImplementation` returns early with no blockers.

**Minimal correction:** Make package-root manifest presence, ADR-0003 identity, uniqueness, `private: true`, and pre-publication field restrictions always-on admission invariants.

**Owner/authority:** Architecture/governance under ADR-0003 and ADR-0015.

**Blocks next step:** Not while all current blockers remain active; **must be fixed before closing them.**

### EVIDENCE-01 — P1 report defect, resolved by this rewrite

**Evidence/result IDs:** `gm-goal-audit-completion-20260904`, `gm-goal-audit-report-20260904`, `gm-dispute-t8-r1-2bef-20260904`.

**Impact:** The previous report named `f88ead7…` as its remediation subject and
asserted that profile transitions, `Einput`, aggregate raw-byte accounting,
cyclic depth, and package identity enforcement were repaired. Exact source shows
those changes were reverted by `711845c`, so that historical positive section
cannot be current-head readiness evidence.

**Correction applied:** This report is regenerated from the frozen integrator
subject and canonical inventory, marks reverted fixes open, and records the
exact synthesis input. External exact-head review remains the final gate.

**Owner/authority:** Research/evidence custodian; direct exact-head source and accepted authority take precedence.

**Blocks next step:** **No after the external exact-head review passes.**

### QUAL-01 — P1, real qualification-oracle defects

**Evidence/result IDs:** `gm-readiness-a5-seq-20260903`, `gm-readiness-a6-seq-20260903`.

**Impact:** Exact-head `resource-profile-v2.mjs`:

- increments `Einput` before confirming the consumer is selected;
- identifies many slots using the literal slot name `"many"` instead of declared cardinality;
- reports a numeric `graphDepth` for cyclic graphs.

Exact-head `v1-resource-profile.mjs` omits the profile document from `document-batch` aggregate bytes. Valid inputs can be rejected at the wrong boundary, and invalid plus-one fixtures can appear to pass.

**Minimal correction:** Count selected-consumer occurrences, derive cardinality from declarations, represent cyclic depth as the accepted unavailable value after authority clarification, include profile bytes, and add at/plus-one regressions.

**Owner/authority:** Qualification owner under ADR-0006/0007.

**Blocks next step:** No for initial source scaffolding; **yes for Phase 3 resource qualification.**

### QUAL-02 — P1, cardinality validation and executable-proof gap

**Evidence/result IDs:** `gm-readiness-a4-seq-20260903`, `gm-readiness-a5-seq-20260903`, `gm-dispute-t2-r4-2bef-20260904`.

**Impact:** The accepted schema constrains `many.min` and `many.max` independently but does not enforce `min <= max`; A4 reproduced schema acceptance of `{min:4,max:2}`. The retained normalization corpus has one required-plus-many case and no optional-zero or complete zero/min/interior/max matrix.

**Minimal correction:** Enforce `min <= max` in semantic validation with the accepted diagnostic disposition and add independent optional/zero/many boundary vectors through the real subject.

**Owner/authority:** Core semantics and qualification owners; changing immutable contract artifacts requires additive accepted authority.

**Blocks next step:** **Yes for declaration/profile or normalization phase exit; no for narrowly beginning internal code after AUTH-01.**

### DEC-01 — P1 gate, unresolved product/architecture decisions

**Evidence/result IDs:** `gm-readiness-a5-seq-20260903`, `gm-readiness-a6-seq-20260903`.

**Impact:** Accepted text does not fully determine:

- resource-limit versus schema-invalid diagnostic precedence;
- whether `diagnosticPathSegments` counts pre-clipped or emitted segments;
- the exact unavailable/suppression rule for graph depth on cycles.

Two implementations can make different observable choices and both plausibly cite current text.

**Minimal correction:** Add an accepted clarification or successor with exact precedence and result values, followed by at/plus-one and overlap vectors.

**Owner/authority:** Architecture/product decision owner; qualification implements the result.

**Blocks next step:** No for isolated algorithms; **yes for a complete Phase 3 diagnostic/resource claim.**

### API-01 — P1, missing executable proof

**Evidence/result IDs:** `gm-api-b1-lane-l-20260903` (`partial`), `gm-api-b3-lane-l-20260903` (`blocked`), `gm-goal-api-lab-remediation-20260904` (older `ae1a138…` source), `gm-goal-api-lab-exact-corpus-l-old-20260904` (`blocked` at corrected source), `gm-dispute-t1-r1-2bef-20260904`, `gm-dispute-t2-r3-2bef-20260904`.

**Impact:** The coordinator compiled and executed the exact common laboratory on
Node `24.18.0`: all 30 scenarios ran against all three candidates, producing 90
passing candidate-scenario cells and corpus digest
`fc2628ffc60914e23bef29d72b1cdf5f92f3d0d470e107fad503900a0f468f39`.
The exact result is retained as
`evidence/api-authoring-exact-run.json` with SHA-256
`6c08bc149c4e5155ce7c87aa7cb2c251d2961b2890e868654bb075915d1e12b0`.
It was emitted by TypeScript `7.0.2` and the checked-in runner. That proves equal
execution of the shared oracle, not conformance: API-02 shows that the shared
oracle itself contradicts accepted identity and diagnostic semantics. There is
still no real compiler handoff, packed consumer matrix, or production subject.

**Minimal correction:** Correct the corpus semantics, rerun the same closed
30-by-three matrix, and then run the accepted subset through the real packed
private subject.

**Owner/authority:** API and conformance owners.

**Blocks next step:** No for internal data-model work; **yes for API selection, helper readiness, or public claims.**

### API-02 — P1, common-lab semantic defect

**Evidence/result IDs:** `gm-dispute-t6-r1-2bef-20260904`, `gm-dispute-t6-r3-2bef-20260904`, `gm-dispute-t6-r4-2bef-20260904`, `gm-dispute-t2-r2-2bef-20260904`, `gm-dispute-t2-r4-2bef-20260904`.

**Impact:** The shared oracle:

- rejects a second declaration for the same `moduleId`, although ADR-0004 expressly permits alternative implementations;
- emits lab-local codes such as `module.duplicate`, `implementation.duplicate`, and `profile.module-unknown` rather than the accepted catalog;
- performs product-owned disablement inside its Core-like oracle;
- calls invalid `__proto__` and Unicode strings hostile SlotIds even though the accepted SlotId grammar rejects them.

A 90-cell pass would therefore show agreement with the laboratory, not conformance with the contract.

**Minimal correction:** Make module identity one-to-many over implementation candidates, use accepted diagnostics, move disablement to an explicit host preprocessing probe, and separate accepted SlotId, portable identity, and arbitrary record-key domains.

**Owner/authority:** Qualification owner under ADR-0004/0007.

**Blocks next step:** It blocks using the lab to choose an API; it does not block a private compiler implementation based directly on accepted authority.

### API-03 — P2, unresolved TypeScript/API policy

**Evidence/result IDs:** all `gm-dispute-t1-r1…r4-2bef-20260904`, `gm-dispute-t2-r1/r3/r4-2bef-20260904`, and `gm-dispute-t4-r1…r4-2bef-20260904`.

**Impact:** The generic `defineModule<const T extends Declaration>(x:T):T` preserves unknown `authorNote` fields while the oracle rejects unknown wire fields. The accepted runtime helper requires direct ordinary `many` reads but does not fix min-before-max ordering or own-property-only behavior. The split candidate serializes an `activationRef` string but never proves candidate-specific factory association.

**Minimal correction:** Through the public API decision, choose exact unknown-field typing, readonly/writable declaration shape, and inherited-property policy. Preserve ADR-0007’s current no-read/no-validation helper semantics unless a successor explicitly changes them. Add candidate-specific emitted-declaration and packed-consumer tests.

**Owner/authority:** Product/API owner; ADR-0009 or successor.

**Blocks next step:** No for a private normalized seam; **yes for freezing a public TypeScript surface.**

### DIG-01 — P1, missing executable plan/digest proof

**Evidence/result IDs:** `gm-readiness-a7-extra-l-20260903`.

**Impact:** Unchanged static artifacts reproducibly encode:

- 388 UTF-8 bytes → `gm-plan:v1:sha-256:fd345e7a…`;
- 1,353 UTF-8 bytes → `gm-plan:v1:sha-256:203c6e09…`.

But no subject proves deep freeze, alias isolation, structured clone, cross-process equality, canonicalizer/hash failure behavior, or a distinct digest for reversed valid ordered-many semantics.

**Minimal correction:** Add a named real-subject gate for exact canonical bytes, immutability, alias mutation, cross-process results, equivalent permutations, and the reversed-many semantic-change companion.

**Owner/authority:** Core and conformance owners under ADR-0004/0007.

**Blocks next step:** No for normalization implementation; **yes for Phase 4 or digest qualification.**

### SEC-01 — P1 gate, raw-boundary product decision

**Evidence/result IDs:** `gm-dispute-t8-r3-2bef-20260904`.

**Impact:** A Proxy around the proposed raw invocation wrapper executes `getOwnPropertyDescriptor` traps before carrier classification; the retained reproduction observed one trap and `wrapper-trap`. Such a trap may throw or fail to terminate. ADR-0013 is proposed and does not close whether the wrapper/list are trusted or hostile.

**Minimal correction:** Before accepting ADR-0013, either require a host-created trusted ordinary wrapper and dense array or redesign the invocation contract. Specify ordinary, Proxy, revoked-Proxy, throwing-trap, and nonterminating-trap dispositions.

**Owner/authority:** Product/security owner via ADR-0013/OD-005.

**Blocks next step:** No for private normalized values; **yes for any raw-carrier claim.**

### SELF-01 — P1 self-composition gate, authority clarified here

**Evidence/result IDs:** `gm-readiness-a8-extra-l-20260903`, all `gm-dispute-t5-r1…r4-2bef-20260904`.

**Impact:** Accepted ADR-0008 defines W0/W1 as two outputs of the same pinned emitter and requires constructed-object identity evidence. The guide/report redefine W0/W1 as path-independent tuples, while proposed ADR-0016 replaces object identity with static/behavioral proof. There is no single authoritative construction claim.

**Correction applied:** The guide now preserves `W0 = emit(P0)` and
`W1 = emit(P1)` as accepted authority and treats any path-independent tuple as
internal emitter data only. ADR-0016 still must be accepted, revised or rejected
before its witness is relied on.

**Owner/authority:** Architecture/product owner; accepted ADR-0008 wins today.

**Blocks next step:** No for direct semantic work; **yes for emitter, stage1, and self-composed qualification claims.**

### SELF-02 — P2, deterministic emitter/witness gaps

**Evidence/result IDs:** all `gm-dispute-t3-r1…r4-2bef-20260904`, all `gm-dispute-t5-r1…r4-2bef-20260904`, `gm-dispute-t6-r2-2bef-20260904`.

**Impact:** Proposed construction evidence lacks normative dependency-key order, optional/many mapping, a fail-closed generated-module AST, sole-root equality, and complete allowlist validation for identifiers, exports, in-bound paths, and key-to-declaration/factory identity. The guide’s cross-feature runtime identity imports also lack accepted source-policy authority.

**Minimal correction:** Close these in accepted authority; require ASCII slot order, exact own-key sets, immutable ordered-many arrays, a closed AST that rejects unmatched statements/exports, independent allowlist verification, and an explicit metadata-only identity-import policy.

**Owner/authority:** Architecture and qualification owners.

**Blocks next step:** No for direct normalized semantics; **yes for structural self-composition and generated-stage claims.**

### MVP-01 — P2, non-blocking real-world evidence improvement

**Evidence/result IDs:** `gm-readiness-a10-20260903`, `gm-dispute-t6-r2/r3/r4-2bef-20260904`, all `gm-dispute-t7-r1…r4-2bef-20260904`.

**Impact:** The 10/100/1000 laboratory creates one generated `scale.ts` and measures compilation time. It does not measure feature-local navigation, alternative implementations, inventory joins, binding-controlled factory replacement, failure recovery, or deletion/remediation cost. ADR-0008’s cost budgets lack a reproducible benchmark protocol.

**Minimal correction:** Define these measures in the first product-owned Phase 6 consumer and compare plan-driven materialization with direct Pure DI on the same seam.

**Owner/authority:** First product consumer and architecture owner.

**Blocks next step:** **No.** It blocks maintenance-benefit and production-scale claims only.

### OSS-01 — P2, non-blocking evidence limitation

**Evidence/result IDs:** `gm-oss-o1-extra-v-20260903` through `gm-oss-o5-extra-v-20260903` (`source-unavailable`), `gm-oss-o6-extra-v-20260903` (`review-only`), `gm-targeted-oss-1/2/3/4-20260903`.

**Impact:** Broad “industry consensus” is not supported by five unavailable lanes. O6 provides a useful pinned-source review, but remains reviewer analysis, not implementation compatibility evidence.

**Minimal correction:** Limit claims to the locally recorded, source-specific lessons below or stage digest-pinned offline sources and rerun missing lanes.

**Owner/authority:** Research custodian.

**Blocks next step:** **No.**

## Explicit conclusion contradictions

| Contradiction | Resolution |
| --- | --- |
| Previous report: profile checker is transition-aware. Exact source: it requires `not-claimed` unconditionally. | Exact source wins; this handoff keeps the promotion gap open. |
| Previous report: `Einput`, many detection, cyclic depth, and aggregate profile bytes are resolved. Exact source restores all four defects. | A5/A6 findings remain open here. |
| Previous report: package identity is enforced independently of open blockers. T8 reproduced a zero-blocker rogue-package pass. | T8/direct code wins; Phase 0 requires unconditional enforcement. |
| B1 wrapper says serializable; retained fixture says not executed. | Reconciliation classifies B1 evidence as partial. |
| B3 wrapper is `done`; payload says sandbox-blocked. | Canonical evidence is blocked; its extra retry is not independent. |
| The exact common lab passes 90 cells; critics reproduce accepted-contract errors in its shared oracle. | Execution equality is retained, but the lab cannot qualify semantics until API-02 is fixed and rerun. |
| Common oracle rejects duplicate `moduleId`; accepted ADR-0004 permits alternative implementation declarations. | The common oracle is wrong. |
| Previous guide/report use canonical tuple W0/W1; accepted ADR-0008 defines emitted W0/W1 bytes. | ADR-0008 controls; this patch restores emitted-byte precedence. |
| Report suggests broad OSS validation; O1–O5 are source-unavailable. | Retain only bounded ADR-0008/O6 lessons; no industry consensus claim. |
| Four integrators generally say “conditional private Core”; T8 critics say “no-go now.” | Both are reconciled as: **NO-GO before owner-start/enforcement; CONDITIONAL afterward for source-only normalized semantics.** |

## Phase 0-4 readiness matrix

| Phase | Exact inputs and outputs | Owner, dependencies and invariants | Evidence, stop and exit criteria | State |
| --- | --- | --- | --- | --- |
| 0. Owner start, admission and custody | Inputs: accepted ADRs, exact base, governed start record, private package manifest. Outputs: deterministic admission report and source-custody identity. | Product owner authorizes; governance enforces. No earlier phase. Package identity is accepted, private, unique and non-publishable; no proposed semantics are imported. | Evidence: ADR-0015 plus reproduced missing-record and rogue-package gaps. Stop on absent, stale, wrong-owner, wrong-SHA, wrong-package or over-broad record. Exit only when those cases fail closed and the positive record passes. | **NO-GO now** |
| 1. Topology and private composition boundary | Inputs: Phase 0 admission, Feature Module Standard profile and accepted package identity. Outputs: private feature-owned package topology, curated internal entry and product-neutral composition boundary. | Package/architecture owner. Depends on Phase 0. Source dependencies point inward; no public barrel, container, runtime registry or ceremonial empty layers. | Evidence is documentation/profile-only. Stop if topology requires public naming/carrier decisions or a second authority. Exit when source-policy fixtures prove the allowed dependency graph and deep imports fail closed. | **Blocked by Phase 0** |
| 2. Inert declarations and profiles | Inputs: serializable declarations, complete profiles, slot/cardinality records and explicit bindings. Outputs: closed validated values or accepted bounded diagnostics. | Core semantic owner. Depends on Phase 1. No executable imports, callbacks, factories, lifecycle, hidden fallback or registration-order semantics. | Evidence: equal 30-by-three authoring lab, but API-02 and `min <= max` remain defects. Stop on unresolved observable accessor/typing semantics. Exit after accepted identity/diagnostic corrections and required/optional/many zero-min-interior-max vectors pass. | **NO-GO for exit** |
| 3. Normalization and graph | Inputs: Phase 2 values and accepted limits. Outputs: deterministic normalized graph or bounded diagnostics. | Core semantic owner; qualification owns independent oracle. Depends on Phase 2. Consumer-to-provider reachability, provider-to-consumer execution order, stable SCCs, no fallback, no runtime authority. | Evidence: static graph vectors only; resource meter and diagnostic precedence gaps remain. Stop on unresolved limit/schema precedence, path counting or cyclic depth. Exit requires one real private subject with permutations, cycles, ambiguity, disabled/unreachable and hostile-input cases. | **NO-GO** |
| 4. Immutable plan and digest | Inputs: successful normalized graph. Outputs: deeply immutable plan, RFC 8785 canonical bytes as private evidence, and domain-separated SHA-256 digest. | Core semantic owner. Depends on Phase 3. No executable values, loaders, product objects or lifecycle; semantically equivalent inputs are byte-identical and semantic order changes alter the digest. | Evidence: static golden digests are reproducible, but no subject proves immutability, alias isolation or cross-process parity. Stop if canonicalization leaks into public policy or self-composition is treated as phase authority. Exit requires exact-byte, mutation, clone, cross-process and reversed-many companion gates. | **NO-GO** |

Qualification, public packaging, activation/lifecycle, plugins, WASM, dynamic
replacement and self-composition are later gates or lanes. They are not extra
MVP semantic phases and cannot weaken a Phase 0-4 exit.

## API candidate comparison

The coordinator compiled the exact lab with the pinned TypeScript toolchain and
executed all 90 cells on Node `24.18.0`. Compile time is observational, not a
threshold; tree-shaking and runtime performance were not measured.

| Candidate | Measured authoring/glue | Type/declaration evidence | Strength | Limitation | Provisional use |
| --- | --- | --- | --- | --- | --- |
| Descriptor object | 4/11 LOC, 73.3% marked glue, 1 file, 1 binding locus | 2 explicit annotations; 181-byte, 3-line declaration emit | Explicit canonical inert data | No inference facade; shared oracle is wrong | Canonical internal data form |
| Typed `defineModule` | 4/11 LOC, 73.3%, 1 file, 1 locus | 1 annotation; 543-byte, 19-line declaration emit; best literal inference | Zero-behavior authoring convenience | Generic preserves extra subtype fields; must not imply validation | **Preferred private authoring facade**, pending API decision |
| Declaration plus factory | 5/11 LOC, 68.8%, 2 files, 1 locus | 3 annotations; 338-byte, 5-line declaration emit | Separates inert metadata from construction | Lab drops `activationRef`; factory association and failures are unproved | Keep factories product-owned; do not adopt this lab encoding |

All candidates used one source import, zero executable implementation imports,
zero framework imports, two removal edits and one disable edit. Their generated
10/100/1000 declaration compile observations were respectively
`143.63/144.69/215.97 ms`, `142.75/148.69/246.54 ms`, and
`137.71/166.50/209.35 ms`. These synthetic numbers do not establish product
navigation or runtime-scale benefit.

The preferred internal direction is one inert descriptor model, an optional
identity-only `defineModule` facade, and separate product-owned typed factories
with Pure DI. It is not acceptance of a public API. `defineModule` performs no
validation, registration, resolution, DI, lifecycle or domain-validity proof.

### Synthetic scenario matrix

Every row executed against descriptor, typed-facade and split candidates. The
result column is the shared lab oracle, not accepted-contract authority.

| ID | Scenario | Shared result | Qualification note |
| --- | --- | --- | --- |
| S01 | one provider | `ok` | Equal across three candidates |
| S02 | one consumer | `ok` | Equal across three candidates |
| S03 | required dependency | `ok` | Provider precedes consumer |
| S04 | missing required | `binding.missing` | Expected failure |
| S05 | missing optional | `ok` | No fallback |
| S06 | zero many | `ok` | Does not cover positive minimum |
| S07 | one many | `ok` | Boundary matrix remains incomplete |
| S08 | multiple many | `ok` | Profile order retained by lab |
| S09 | duplicate provider | `binding.provider-duplicate` | Lab-local code must be reconciled |
| S10 | ambiguous binding | `binding.ambiguous` | Expected failure |
| S11 | incompatible capability | `binding.capability` | Expected failure |
| S12 | dependency cycle | `graph.cycle` | Static lab only |
| S13 | disabled root | `host.profile.root-disabled` | Disablement is host-owned, not Core semantics |
| S14 | disabled required provider | `binding.missing` | Host-preprocessed fixture |
| S15 | disabled optional provider | `ok` | Host-preprocessed fixture |
| S16 | unreachable provider | `graph.unreachable` | Expected failure |
| S17 | multiple roots | `ok` | Deterministic inventory |
| S18 | reordered input | `ok` | Permutation-stable result |
| S19 | hostile record keys and Unicode | `ok` | Record-key domain is not SlotId grammar |
| S20 | unknown declaration field | `declaration.unknown-field` | Runtime validation only |
| S21 | repeated module ID with alternate implementation | `module.duplicate` | **Oracle defect:** ADR-0004 permits alternatives |
| S22 | duplicate implementation ID | `implementation.duplicate` | Semantics valid; code is lab-local |
| S23 | invalid owner path | `owner.path-invalid` | Expected failure |
| S24 | profile references unknown module | `profile.module-unknown` | Lab-local code must be reconciled |
| S25 | hidden fallback attempt | `binding.missing` | Fallback rejected |
| S26 | discovery without executable imports | `ok` | Import counters remain zero |
| S27 | selected literal loaders only | `ok` | Host probe, not Core proof |
| S28 | direct Pure DI parity | `ok` | Host probe, not factory-custody proof |
| S29 | declaration serializability | `ok` | Trusted plain-data fixture only |
| S30 | TypeScript declaration emit | `ok` | Exact `.d.ts` bytes measured above |

## Security and hostile-input matrix

| Boundary | Executed or reproduced evidence | Remaining risk / required gate |
| --- | --- | --- |
| Trusted object authoring | Own `__proto__`, `constructor`, `then` and composed/decomposed Unicode record keys executed in all candidates | Wire SlotId grammar differs from arbitrary host record keys; accessor/Proxy reads are not a sandbox |
| Raw bytes | Malformed UTF-8, hostile paths, top-K and clipping have static qualification coverage | ADR-0013 remains proposed; wrapper trust, duplicate keys, depth, size and nonterminating Proxy behavior block raw exposure |
| Graph | Static reachability, SCC, ordering and duplicate-provider vectors pass | No real compiler; resource applicability, cyclic depth and diagnostic precedence remain open |
| Plan/digest | Golden canonical bytes and domain-separated digests independently reproduce | Deep freeze, alias mutation, structured clone, cross-process equality and canonicalizer failure are unproved |
| Construction | Product factory execution is absent from Core fixtures | Factory exceptions, partial construction, cleanup, readiness and recovery belong to a future product-owned host |
| Supply/distribution | No package or publication surface exists | Signature, carrier, registry and release custody are outside this task and remain gated |

## OSS lessons and rejected patterns

| Observed source/rationale | Transferable lesson | Pattern explicitly rejected |
| --- | --- | --- |
| Dagger, ADR-0008 and O6 | Generated typed construction can wire real internal compiler components | Java annotations, `ServiceLoader`, injected registries/caches, framework identity |
| Rust bootstrap, ADR-0008 | Explicit finite seed → rebuilt stage → comparison; retain a recovery path | Treating language self-hosting as equivalent, requiring a prior released Core |
| Bazel bootstrap, ADR-0008/O6 | Finite bootstrap outputs and explicit toolchain inputs | Ambient environment propagation, mutable inputs, stale cache/output authority |
| Gradle build logic, ADR-0008/O6 | Layered cohesive build DAG; generated navigation from the same declarations | Central settings registry as identity owner, plugin IDs as module semantics, include order |
| VS Code/Backstage/Equinox, accepted ADR-0008 rationale | Keep host/resolver/lifecycle authority privileged and outside the composed semantic Core | Mutable runtime registry, unload, routing, service lookup, activation authority in Core |
| TypeScript build, accepted ADR-0008 rationale | Record source/generated-file provenance precisely | Calling toolchain staging “compiler self-hosting” |
| All sources | Isolated roots, explicit inputs, ASCII ordering, offline builds, independent qualification | Registration/filesystem/locale order, dynamic discovery, comparing generated output with itself |

## Unresolved product and authority decisions

| Decision | Status | Blocks |
| --- | --- | --- |
| Whether/when to authorize the private Core start and the closed record format | Required product-owner action under ADR-0015 | First tracked source |
| Public unversioned export map | ADR-0009 proposed | Public API |
| Production primitive/canonicalizer adapters | ADR-0010 proposed | External production adapter claims |
| Release evidence and custody protocol | ADR-0011 proposed | Release eligibility |
| Package carrier/resolution | OD-004; ADR-0012 proposed | Public package/publication |
| Trusted-object/raw-byte wrapper and carrier semantics | OD-005; ADR-0013 proposed | Raw exposure |
| Repeated binding-record semantics and diagnostic generation | OD-006; ADR-0014 proposed | Duplicate-record behavior |
| Dependency-record representation and construction witness | ADR-0016 proposed | Generated stage1/self-composition |
| Resource/schema precedence, path-segment accounting, cyclic depth | Accepted clarification/successor needed | Full diagnostic/resource qualification |
| Public generic unknown-field, mutability, and inherited-property policy | Public API decision needed | TypeScript surface freeze |
| Metadata-only cross-feature identity imports | Architecture/Foundation authority needed | Structural self-composition claim |
| Factory failure, partial construction, retry, readiness, recovery, and retirement | Product-owned Phase 6 decision | Product runtime adoption, not Core semantics |

### Decision packet

| Decision | Strong options | Recommendation | Work that may continue |
| --- | --- | --- | --- |
| First callable M1 boundary | A: private normalized-value seam; B: accepted object wrapper over that seam; C: object and raw carriers together | Prefer A for the first slice because it adds no carrier policy. B remains the accepted eventual object contract. C is blocked by OD-005/006. Product owner must authorize the start record; this report does not. | Phase 0 admission repair and internal normalized data-model fixtures |
| `defineModule` type policy | A: identity-only literal-preserving generic; B: exact closed authoring type; C: validated/branded return | Keep A private for ergonomics evidence while wire validation stays in Core. Do not publish until unknown-field, readonly and inherited-property policy is chosen. | Inert descriptor implementation and compile-only probes |
| `many({min,max})` observable reads | A: specify `min` then `max`; B: specify `max` then `min`; C: require a trusted ordinary own-data object and leave order unobservable | Prefer C if the product accepts the trusted authoring boundary; otherwise choose and test one exact order. No option is silently selected here. | Semantic range validation over already normalized values |
| Self-composition witness | A: accepted ADR-0008 emitted W0/W1 only; B: accept/revise ADR-0016 static plus behavioral witness; C: defer self-composition | Use A as current authority and C for the first Core slice. B requires a separate product decision. | Direct handwritten private composition only, with no self-composed claim |

## Claim and evidence ledger

| Claim | Evidence class and exact artifact | Current disposition |
| --- | --- | --- |
| Authority precedence is closed | Accepted ADR-0001..0008 and ADR-0015, `ARCH-SYSTEM-BOUNDARY`, `GM-REQ-V1`, the ADR-0002-pinned organization standard and governed ledgers | **Established** for this audit |
| Worker evidence custody is closed | Canonical 97-result inventory, dispute aggregate `ccd13b…`, four-integrator aggregate `4b53d3…` | **Established**; worker count is not proof |
| The three API shapes execute an equal corpus | Retained `evidence/api-authoring-exact-run.json`, SHA-256 `6c08bc1…`; exact 30-scenario/90-cell local compile and run; corpus digest `fc2628…` | **Established only as lab equality** |
| The common API oracle conforms to accepted semantics | API-02 reproductions against ADR-0004/0007 | **Refuted** until corrected |
| Graph semantics are deterministic | Static graph vectors and mutation tests | **Partial**; no real compiler subject |
| Canonical bytes and digest vectors reproduce | Two independent static golden digests | **Partial**; no immutable plan subject |
| Private Core source is admitted | ADR-0015, no owner-start record, reproduced admission gaps | **Not established** |
| Self-composition is qualified | ADR-0008 accepted, ADR-0016 proposed, no stage0/stage1 subject | **Not established** |
| Industry patterns justify this exact design | One bounded pinned-source review; five source-unavailable lanes | **Not established**; lessons only |
| Repository gates pass before final remediation | Node `24.18.0`; full `pnpm check`; 15 profile, 18 contract, 4 diagnostics, 4 graph and 36 governance tests | **Established** for pre-remediation head `f03d8e4…`; final head must rerun |

## Final verdict and minimum conditions

**Private Core:** **NO-GO now.** The M1 documentation boundary is consistent in
this patch; the verdict becomes **CONDITIONAL** after the owner-start record is
governed and admission enforcement passes.

**Public package:** **NO-GO.** At minimum, close OD-004/005/006 through accepted successors, accept the public name and carrier maps, retain an exact packed subject, and pass public/deep-import/declaration-resolution gates.

**Runtime-conformant claim:** **NO-GO.** It additionally requires source admission, structural promotion, a real compiler subject, corrected resource/diagnostic evidence, immutable plan/digest proof, and the six accepted runtime cases: Linux, macOS, Windows, Chromium window, Chromium worker, and Electron desktop.

**Self-composed/distributed Core claim:** **NO-GO.** It requires accepted witness authority, exact P0/P1 and W0/W1 evidence, closed emitter/allowlist checking, clean isolated stages, independent mutation evidence, and pack-once custody.

### Exact Core start conditions

Production Core work may start only when all of these are true:

1. A product-owner start record binds the repository, exact base, accepted
   `@get-modular/core` identity, owner, private normalized-only scope and explicit
   exclusions.
2. Admission rejects missing, stale, mismatched and over-broad records and checks
   package identity, uniqueness, `private: true` and absent publication fields
   unconditionally.
3. The roadmap consistently names the first callable as an internal
   normalized-value seam; temporary hash-bound qualification packing is
   distinguished from distribution packing.
4. The first implementation task excludes object/raw carriers, public exports,
   lifecycle, plugins, runtime loading and self-composition claims.
5. Focused admission tests and the complete repository gate pass at the exact
   implementation base.

## Minimal dependency-safe next task

Create one **Phase 0 authority-and-admission repair change**, with no `packages/core`, public API, carrier, or runtime implementation:

1. Obtain and record the product-owner start authorization with a closed repository/package/SHA/scope binding.
2. Make first-package admission consume it and reject missing, stale, mismatched, or over-broad records.
3. Make accepted package identity, `private: true`, and no-publication-field checks unconditional.
4. Bind the start record to the already clarified private normalized M1 scope;
   do not reopen either carrier or distribution packing.
5. Add focused negative tests for those exact rules.

Only after that task passes should a separate, private normalized-value Core slice begin. Resource-oracle and cardinality corrections must land before that slice can claim Phase 3 qualification.

## Intentionally not implemented

- production `packages/core` source or public barrels;
- object/raw carrier adapters and any package publication;
- DI container, service locator, runtime registry or filesystem discovery;
- factory execution, activation, readiness, lifecycle, cleanup or recovery;
- plugin host, WASM host, Module Federation or dynamic replacement;
- stage emitter, generated stage1 or self-composition qualification;
- product integration in Agent Runtime, Orchestrator or Frontend;
- acceptance of ADR-0009 through ADR-0014 or ADR-0016;
- performance, tree-shaking, packed-consumer or runtime-scale claims not measured
  by the retained evidence.

Future lifecycle, plugins, WASM and dynamic enable/disable may attach through a
product-owned host that consumes an immutable successful plan. None may mutate
Core aggregates, become a hidden fallback, or leak host/container types into
the inert declaration and plan contracts.
