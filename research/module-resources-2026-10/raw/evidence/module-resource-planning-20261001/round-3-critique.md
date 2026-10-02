**Round 3 of 4 critique — corrections required**

Input plan SHA-256: `310c519fc5692d078483861f46997f8904297b633a1459dc2e872fcb088fc8ce`.

Requested profile: **gpt-6.1-sol / XHIGH / FAST**, superseding MAX/default; this records the owner’s request, not backend attestation. Review used supplied source snapshots through the indirect relay. Native web research was disabled.

The admission boundary and custody invariants are sound. The main correction is to simplify the nested fixture while preserving actual parent retention, physical release evidence and dependency-loss behavior. All acceptance checks below are future requirements; none were executed.

**R3-1 — Medium — Nested two-child shutdown protocol; Nested/acknowledgement evidence**

The private acknowledgement append adds another uncertain write, record identity, duplicate suppression and commit-then-reject readback protocol. These mechanisms are unnecessary to demonstrate that child cleanup needs a parent-owned resource.

**Precise correction:** Replace acknowledgement appends with one zero-argument, exact-child-bound read on the actual parent-owned TEST resource. A concrete fixture can retain the existing append sink as a real open file containing fixed child cleanup-context records established during parent setup. Bind each private read to its child’s fixed record and original handle. The result supplies a cleanup parameter, such as the owned pathname or subscription event name, which child cleanup validates against its retained construction cell and then uses. Returning cached metadata or an arbitrary success marker would not demonstrate the dependency.

Publish the read-action holder before invocation and retain its raw Promise in the original child attempt. Repeated or reentrant calls join that action. Child cleanup awaits and consumes the result. Pending, failed or uncertain reads preserve custody; they never reopen ordinary append admission. No write retry, acknowledgement recovery, replacement or general hook mechanism is needed.

Preserve the existing parent shutdown gate. **Settled child actions are insufficient: unresolved child cleanup debt must continue to retain the parent prerequisite.** Observed release remains necessary even after the private read succeeds.

**Acceptance:** A held real read prevents parent closure while safe sibling cleanup progresses. Completing that read permits the child’s actual cleanup. Rejected reads and unresolved deletion preserve the original parent handle. All shutdown entrypoints obey the same barrier, and eventual observed satisfaction starts parent cleanup once. Signalled dependency loss fences private access and subsequent mediated effects without reviving ordinary work.

**R3-2 — Medium — Supported adapter protocols; Nested/file recovery; Nested/prerequisites evidence**

The subscription correction is adequate: exact listener membership independently detects omitted removal despite a closed handler-admission flag. Keep membership inspection, emitted arrival and admitted-handler settlement together.

The file and parent evidence is less explicit. Cleanup counters and an owner report cannot independently establish pathname absence or continued usability of the original parent resource.

**Precise correction:** Specify direct filesystem inspection of the exact retained child pathname, independent of the adapter’s readback result. Presence and inspection errors remain unresolved; only confirmed absence supports release within the stated disposable-directory protocol. Add a rejecting case where cleanup or readback incorrectly reports release while the real file remains.

For the parent fixture, independently observe the **original open handle** while prerequisites remain unresolved and its closed-handle behavior after completion. Reopening the pathname would observe a different resource and would not prove retention of the original prerequisite. Parent readiness must remain closed throughout shutdown even while narrowly bound cleanup reads remain usable.

**Acceptance:** Premature parent closure fails despite an unchanged cleanup counter. Omitted child deletion and false absence reports fail despite a `released` result. After genuine child release, the parent closes once and the original handle can no longer perform its read. These checks establish the selected TEST protocols, not arbitrary native-effect absence or production readiness.

**R3-3 — Medium — Recommended admission decision; Instance authoring contract; Ledger, observation and recovery**

The plan names `createResourceOwner` and describes two facets but leaves its returned shape and callable callback types unselected. That leaves avoidable public-interface design to implementation.

**Precise correction:** Select the factory shape explicitly, for example:

```ts
createResourceOwner(): {
  resources: ResourceAuthor;
  control: ResourceControl;
}
```

Specify `setup: () => T | Promise<T>` and `cleanup: (outcome: SetupOutcome<T>) => CleanupResult | Promise<CleanupResult>`. Declare `seal`, `cleanup` and `recover` as returning `void`; retain the stated synchronous `observe(): CleanupReport`. Specify rejected-Promise behavior for closed/busy setup, including stable refusal codes.

Composition retains `control` and passes only `resources` through the existing factory closure as the optional `module.resources` facet. Allocate one owner per instance. This requires no Assembly injection change or module-definition singleton.

**Acceptance:** Public-root type fixtures compile the selected authoring example, reject access to Host controls through the author facet, and permit pure/borrow-only modules without callbacks. Two instances have independent owners. The new successor authorizes this exact surface before package source; neither accepted ADR is rewritten.

**R3-4 — Low — Instance authoring contract; Callback limits and exclusions; Recommended admission decision estimates**

Sequential construction setup is a deliberate first-slice restriction. The plan states it, but the exclusions should distinguish unsupported later runtime acquisition from detached setup misconduct.

The options table also includes waiting for ordinary K1 with an unbounded remainder, although this review has no genuine unresolved choice requiring scored alternatives.

**Precise correction:** Explicitly state: “This slice supports serial, awaited setup during construction only. Later runtime acquisition and registration are excluded and receive no coverage claim.” Preserve factory-settlement sealing and busy refusal.

Remove the scored alternatives table unless a real owner decision remains unresolved. Retain bounded estimates for the selected slice, separately accounting for candidate source, TEST adapter/Host/runner changes, rejecting tests/type fixtures and documentation. Recalculate after removing acknowledgement machinery; exclude unrelated K1 work.

**Acceptance:** Scope remains optional module-local setup/cleanup with instance ownership and child borrowing. Estimates cover the selected delivery without an open-ended tail. No runtime-acquisition extension or hook engine appears.

**R3-5 — Medium — Acceptance, rollback and retained evidence**

The retained-evidence links use transient worker-input locations and an older evidence directory. The supplied input set also does not contain the linked `current-critique.md`. These references cannot establish a portable review chain as written.

**Precise correction:** Root should export the complete supplied snapshots and identity manifests beneath `evidence/module-resource-planning-20261001/`, preserve their hashes, and replace references with links resolving from the final plan’s directory. Retain the original evidence separately. Link the round-two critique only after its actual artifact is retained; do not invent a replacement or imply an unavailable file was inspected.

**Acceptance:** Every retained-source link resolves in the exported documentation tree. The input-plan hash, prior fix, authority identities, TEST identities and supplement identities remain traceable without worker paths. This worker makes no filesystem changes.

**Source and whole-plan cross-check**

[ADR-0028](evidence/module-resource-planning-20261001/gm__adr-0028.md) excludes callback execution and conditionally reserves ownership admission. [ADR-0029](evidence/module-resource-planning-20261001/gm__adr-0029.md) admits a narrower synchronous kernel. The proposed new accepted successor is therefore necessary. Accepted ADR bytes and C0 remain immutable; **G1 stays hold and K1 pending**.

The selected package identity, root and candidate version are precise. Zero runtime dependencies, forbidden type/runtime edges, public-root consumption, Foundation v3 roots and non-overlapping boundaries preserve the intended separation. One obligation ledger per instance and Host-owned dependency policy should remain; no extra composition nodes or import parser are justified.

The [GM manifest](evidence/module-resource-planning-20261001/agent-teams-ai_get-modular__package.json) backs the listed existing commands. The [TEST manifest](evidence/module-resource-planning-20261001/test-consumer__package.json) backs `typecheck`, `test` and `evidence`. The [retained runner](evidence/module-resource-planning-20261001/source-supplement/test__evidence-run.mjs), SHA-256 `c4fcbd046f3be75fad522109bb9c365a073b64f422f60305dba3839a714dfbca`, confirms separate archive-pair installations, strict TAP validation, explicit lifecycle routing and rejection of uncommitted replay inputs.

The proposed separate resource inventory and explicit resource-file routing address actual runner inclusion without disturbing lifecycle index slicing. Ensure the new inventory, fixtures and routes enter the hashed replay snapshot and both installed pairs. `ownership:resource:check` remains proposed. Frozen-lock installation and installed typechecking are required; archive-only fallback cannot qualify them.

The [current standard](evidence/module-resource-planning-20261001/agent-teams-ai_get-modular__docs__architecture__common-assembly.md) and retained TEST statement agree on full-document hash `33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`. No stale-pin defect is demonstrated. Review and migrate the pin when authorized guidance changes. The supplied AR correction supersedes historical scaffold gaps; those are not current defects.

The [Spring snapshot](evidence/module-resource-planning-20261001/source-supplement/spring-projects_spring-framework__spring-context__src__main__java__org__springframework__context__support__DefaultLifecycleProcessor.java) explicitly initializes the shutdown-phase timeout to `10000`; relayed documentation identifies version 7.0.9. The ten-second statement is supported and proves no physical release. Industry sources do not establish this helper’s async guarantees.

Arbitrary callbacks still cannot prove partial unwind, timeouts cannot settle cleanup, and private cleanup access cannot restore ordinary authority. Preserve reachable failed-attempt recovery, original causes, observed release, narrow rollback and the exclusions covering production integration, loaders/replacement, stream transfer, release, broad migration and G1/K1 closure.

Review took approximately 4½ minutes. No files, Git operations, code, builds, tests, installs or runtime/provider/agent flows were performed. Successor acceptance and implementation verification remain pending.
