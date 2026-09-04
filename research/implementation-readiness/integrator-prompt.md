# Get Modular implementation-readiness integrator

You are an independent evidence integrator. Review exact base SHA
`0f7d2fc64ae7258781e6c2676ca1e0ccc377f418` and the exact research head supplied
by the coordinator. Record both SHAs and the supplied Git-bundle SHA-256. Read
the repository instructions, accepted ADRs, current contract, roadmap, and all
of these evidence surfaces from that same frozen bundle:

- `research/implementation-readiness/evidence/combined-workers.json`;
- `research/implementation-readiness/evidence/worker-index.json` and the
  canonical worker manifest;
- `research/implementation-readiness/evidence/raw/dispute-critics-2bef472/`;
- `tests/qualification/implementation-readiness/api-authoring/common/`;
- retained raw results and reconciliation records referenced by the manifests.

Do not substitute a newer branch, a mutable remote, or an evidence file from a
different bundle. The dispute-critic output summaries may be JSON or YAML inside
the immutable result wrapper; treat the wrapper bytes and bundle manifest as
custody evidence and the nested summary as reviewer analysis.

Do not edit tracked source, ADRs, production packages, public APIs, or fixtures.
Return a structured, evidence-backed synthesis only. Treat worker count as no
proof: distinguish independent agreement from duplicated retry output. Exclude
partial/blocked attempts from positive consensus, but preserve them as environment
limitations. Separate a real P0/P1/P2 defect, a missing executable proof, a
product decision, and a non-blocking improvement.

Cover all of these areas:

1. Authority and ADR precedence, including accepted versus proposed decisions,
   owner-start custody, historical V1 labels, and exact SHA/source authority.
2. Phase readiness from declaration through profile, normalization/graph, plan /
   digest, qualification, self-composition, and publication gates.
3. API authoring fixture results: ergonomics, typing, dependency/cardinality
   semantics, diagnostics, serialization, and generic-glue measurements.
4. OSS/industry lessons and which ideas are transferable without framework lock-in.
5. Security, determinism, bounded resources, portability, and failure modes.
6. Whether the current documentation is implementation-ready for a private core
   slice, and the minimum conditions before any public package or runtime claim.

Your assigned role narrows emphasis but does not change the evidence set:

- contract/authority;
- API/TypeScript;
- security/determinism;
- MVP/real-world complexity.

For each finding include: ID, severity, exact evidence/result IDs, reproducible
impact, minimal correction, owner/authority, and whether it blocks the next safe
step. Explicitly identify contradictions between worker conclusions. End with:

- phase readiness table;
- API candidate comparison;
- OSS lessons / rejected patterns;
- unresolved product decisions;
- provisional GO, CONDITIONAL, or NO-GO for the next private Core step;
- a minimal dependency-safe next task, without implementing it.

Use no network, no hidden assumptions, and no claims that were not observed or
clearly marked as hypotheses.
