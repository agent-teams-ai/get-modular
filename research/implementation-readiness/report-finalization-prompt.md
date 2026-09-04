# Implementation-readiness report finalization

Work from the exact commit and verified Git bundle supplied by the coordinator.
Record the research head, initial base SHA, bundle SHA-256, and all four
integrator result digests. Do not use mutable remotes or evidence from another
snapshot.

You own only:

- `research/implementation-readiness/report.md`;
- `research/implementation-readiness/pr-body.md`;
- `docs/architecture/mvp-implementation-roadmap.md` when a confirmed finding
  requires a minimal clarification;
- `docs/architecture/self-composition-implementation-guide.md` when a confirmed
  finding requires a minimal ADR-0008/ADR-0016 clarification.

Do not edit accepted ADRs, open-decision status, raw evidence, manifests,
fixtures, package metadata, production source, or public API. Do not add a new
framework, runtime, package, or phase.

Read the complete frozen evidence set, especially:

- the canonical worker manifest and index;
- the 32-cell dispute-critic bundle;
- the common 30-scenario API authoring lab and its result summary;
- all four current integrator wrappers and their digest manifest;
- accepted ADR-0001 through ADR-0008 and ADR-0015;
- proposed ADR-0009 through ADR-0014 and ADR-0016;
- OD-004, OD-005, and OD-006.

Produce one implementation handoff that clearly separates:

```text
accepted authority
    -> proposed decision
        -> disposable evidence
            -> non-authoritative recommendation
                -> future implementation gate
```

The readiness matrix must use exactly these implementation phases:

0. owner-start record, private package admission, and custody;
1. package topology and private composition boundary;
2. inert declarations, profiles, slots, bindings, and authoring inputs;
3. normalization, graph compilation, bounded diagnostics, and deterministic
   ordering;
4. immutable plan, canonical bytes, and domain-separated digest.

Qualification, publication, activation/lifecycle, plugins, and self-composition
are gates or later lanes, not extra numbered MVP phases. For every Phase 0-4
state exact inputs, outputs, owner, invariants, dependencies, executable checks,
stop criteria, exit criteria, and what is expressly out of scope.

Required report content:

- authority and precedence matrix;
- Phase 0-4 readiness matrix;
- equal 30-scenario by three-candidate result and quantitative comparison;
- TypeScript inference and declaration-emit evidence;
- hostile-input and security matrix;
- transferable OSS lessons and rejected patterns, with source limitations;
- contradiction matrix that distinguishes defects, missing proof, product
  decisions, and stylistic preferences;
- claim/evidence ledger;
- unresolved Decision Packet with no silent product choice;
- GO, CONDITIONAL, or NO-GO for the smallest private Core slice;
- exact Core start conditions and the single smallest next implementation task;
- explicit list of work intentionally not implemented.

Apply these constraints:

- prefer an inert descriptor plus a zero-behavior typed authoring facade only if
  the frozen evidence supports it; activation stays a separate product-owned
  boundary;
- do not treat `defineModule` as validation, registration, DI, lifecycle, or a
  proof of domain validity;
- do not convert reviewer count into consensus;
- preserve product-owner questions such as unchecked authoring versus validated
  types and any observable accessor-order semantics;
- describe future lifecycle, plugin, WASM, and dynamic replacement only as
  seams, without designing those systems;
- ADR-0008 is accepted, while ADR-0016 remains proposed: a direct handwritten
  stage0 may be an initial private slice, but emitter/stage1/self-composition
  claims wait for their required authority and evidence;
- remove stale head claims and stale earlier-wave verdicts rather than layering
  another conflicting status paragraph on top;
- use only exact measured metrics; mark unavailable performance or packaging
  claims as unmeasured.

Run focused documentation checks and the full repository gate when dependencies
are available. Return a bounded patch, exact commands, remaining P0-P2, and any
question that still requires the product owner.
