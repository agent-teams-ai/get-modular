# GM + Effect: architecture and scale audit

Observed 2026-11-12. Baseline:
[`0ff54371967e4b56a9978f784f568a48731a324d`][gm-base].
This is a dated engineering audit, not a new accepted contract, support envelope
or product-adoption record. [ADR-0043][gm-adr] and the
[Consumer Module Standard][gm-standard] retain authority.
Delivery and exact-source CI are tracked in [PR #238][pr].

## Verdict

The existing boundaries are justified for **native module construction**.
No production defect was reproduced in the reviewed mapper/preparation paths.
There is no demonstrated reason to replace the implementation or add another
GM runtime for this contract. The additional work is stronger public-behavior
tests, explicit capacity/lifetime guidance and retained source research.

This is narrower than certifying an application with thousands of active agents.
The package composes a selected graph; it does not govern application admission,
database/network capacity, durable work, arbitrary escaped values or foreign I/O
settlement. Passing a graph test and using Effect do not establish those promises.

The optional integration is useful when an application needs GM's portable
declarations, exact local bindings or shared authoring across Promise/native
executors. An Effect-only application that does not need those properties can use
native Layers directly. OpenCode LayerNode has real replacement/shared-domain
conveniences; copying them into GM is not automatically an improvement.

## Source and reasoning boundary

| Subject | Exact reviewed source or execution selection |
| --- | --- |
| GM production source | `0ff54371967e4b56a9978f784f568a48731a324d`; this audit changes no production implementation |
| Effect execution | Installed published peer `4.1.4`; [release source][effect-release] |
| TypeScript | Installed pinned `7.0.2`, strict checks with `skipLibCheck: false` |
| Local runtime | Node `24.22.1`, Linux `6.18.57`, x64; repository manager Bun `1.4.3` |
| OpenCode | `becb9c7c9f3907257d12e95993a47ccc6e3b9625`, source selects Effect `4.1.0` |
| LiveStore | `54e5a23a29e2c48a8abeff2253fb314767c4243a`, source selects `4.0.3` |
| T3 Code | `fc2b5de20cb572d2333e03284466e3c804d25c84`, lock selects `4.1.2` |
| Alchemy | `21c601276a5c34eeb25bd7dc81dcca03be9e72eb`, override selects `4.1.4` |

External projects were selected for different architectural responsibilities,
not popularity: agent sessions, local-first data/workers, streamed application
work, and remote-resource reconciliation. Their relevant sources and tests were
read; their test suites and production deployments were not executed here.
Different Effect versions do not extend the adapter's exact qualified peer.

Detailed observations, counterevidence and immutable links are in
[OpenCode research](opencode-audit-2026-11-12.md) and
[the other three projects](effect-projects-2026-11-12.md).
The [OpenCode source manifest](raw/audit-2026-11-12/opencode-source-manifest.json.txt)
records the inspected files. The prior frozen spikes keep their own identities;
this audit neither rewrites them nor adds source reads to their execution count.

## Architecture against concrete obligations

| Principle | Evidence in this implementation | Limit that still belongs to the consumer |
| --- | --- | --- |
| Clean Architecture | [Effect root/types][gm-effect] depend on public GM roots and Effect; neutral Core/Assembly do not depend back on Effect. Compiler selection stays in Assembly's composition root. | A consumer's domain must actually keep SDKs, storage and framework policy behind its own meaningful ports. A directory layout cannot establish this. |
| Single Responsibility | Assembly owns capture/validation/wiring; the adapter lowers it; Effect owns native execution; the application owns work. | Acquisition must not silently become startup, authorization, admission or business orchestration. |
| Open/Closed and Dependency Inversion | [Entry families][gm-family] introduce the native carrier over the same neutral preparer; there is no provider switch added to Core. | New external alternatives need a real consumed contract, not a speculative universal registry. |
| Interface Segregation | [Lowering][gm-lower] passes only declared slot records, materialized by the shared helper. Private native services and request context can stay native. | Factories are trusted code and can still read captured/global values or undeclared Context services. The compiler is not a sandbox. |
| Behavioral substitution (LSP) | Native and Promise entries reject mixed carriers and preserve different failure/cleanup contracts. Typed fake inventories select dependencies before preparation. | Type-compatible ports still need behavioral tests for ordering, cancellation, idempotency and the meaning of success. A changed construction E/R can be honest in a new typed variant. |
| DRY | [Neutral preparation][gm-prepare] and [value materialization][gm-values] own metadata, plan verification, inputs/products and slot policy for both executors. | Wiring and native Layers are two necessary representations. Their translation still needs independent tests; sharing a helper is not enough. |
| DDD | Composition has one technical semantic owner; product contracts and domain invariants stay with their bounded contexts. | A GM entry, DDD context, private Effect service and Scope need not be one-to-one. No ceremonial aggregates or extra layers are needed here. |

The adapter has internal entry-authentication storage and graph-key identities.
The accurate claim is **no global provider-selection service locator**, not
"no global state". The package is deliberately Effect-dependent; neutral subject
ports must audit their options, callbacks and errors as well as their return type.
Renaming Effect to a generic Task does not make that contract runtime-neutral.

The reviewed implementation has no second preparer, custom resource executor,
automatic retry/debt protocol, cache, event bus or work scheduler.
Similar small private record helpers are not evidence of duplicated policy and
do not justify a shared infrastructure package.

## Ownership: what the probes established

The existing suite already covers exact local providers, diamond sharing,
metadata/input snapshots, carrier rejection, typed acquisition failure, native
interruption, private resource Layers, operation/stream lifetime, observed worker
failure and startup-before-worker sequencing.

This delivery adds two maintained tests, also executed by the installed-archive
suite through public package roots:

1. **Two graphs of exactly 1,000 selected nodes:** a chain, and 999 independent
   leaves plus their root. Factories remain inert through preparation and Layer
   creation. Execution acquires and releases each node once, calculates an
   independently expected root value from actual injections, retains dependencies
   during dependent cleanup and leaves no active resources. The chain releases
   in reverse dependency order. No speed threshold is asserted.
2. **A real shared FileHandle with two failing finalizers:** both dependents read
   the live file during cleanup; the file closes once after both. One dependent
   and the provider then fail with distinct defects. The final Cause retains both
   original objects by identity, and does not reclassify them as expected errors
   or interruption. Independent sibling cleanup still runs.

The failure test proves native Cause preservation and actual file closure in
that fixture. It does not make arbitrary physical cleanup retryable or introduce
GM Resources cleanup-debt semantics.

### Important counterexamples to broader claims

- A valid construction DAG cannot rule out callback, reference-count or
  finalizer wait cycles. OpenCode borrows parent-owned services into cached
  children to avoid retaining an owner through its own entries.
- Fresh mapper Layers do not clone state returned by a factory. A pre-created
  object inside `Effect.succeed` is still shared; per-instance mutable state
  must be allocated during that instance's acquisition.
- Private Layers captured by a factory keep their own native identity. The
  mapper cannot infer whether their configuration should be shared.
- A service, Effect or Stream can escape the Scope that owns its resources.
  JavaScript references are not revoked after closure, and `R = never` is
  not a lifetime proof.
- A signal forwarded to foreign I/O proves signal delivery, not rollback or
  physical termination. A late result needs the actual adapter's cleanup contract.

## Scale: three different kinds of evidence

### 1. Runtime graph construction

The dated scratch probe used built public package roots and synthetic native
resources. It checks exact counts and the root result; its chain cases also
check dependency liveness.
It is separate from the new maintained 1,000-node tests.

| Shape | Providers / selected nodes | Compile plus verified prepare, ms | Layer creation, build, use and release, ms |
| --- | ---: | ---: | ---: |
| Chain | 100 / 100 | 29.45 | 9.40 |
| Chain | 500 / 500 | 74.00 | 20.51 |
| Chain | 1,000 / 1,000 | 96.93 | 25.43 |
| Chain | 2,048 / 2,048 | 242.35 | 83.08 |
| Wide | 100 / 101 | 9.73 | 5.97 |
| Wide | 500 / 501 | 33.50 | 9.61 |
| Wide | 1,000 / 1,001 | 49.87 | 16.40 |

Every tested provider acquired and released once; the chain checks observed no
early dependency release, and no shape overflowed the stack. A chain has N-1
dependency edges; a wide graph has
one root with N provider edges. The 2,048-node chain reaches the current graph
depth limit; it does not qualify every resource-envelope dimension.

Each row is one observation in a single process, not a warmed distribution,
comparative benchmark or latency promise. Preparation includes an explicit
`compileComposition` followed by the verified-composition preparation route.
Build timing includes `.layer()`. Reported RSS in the raw results is a
cumulative-process observation after earlier cases, not isolated peak memory or
retained memory after collection. Dense graphs, every admitted maximum,
long-duration churn, browsers and Electron were not measured by this probe.

[Source and results](raw/audit-2026-11-12/README.md) retain the exact runner and
commands. The regular CI test deliberately asserts correctness only.

### 2. Native authoring and TypeScript cost

A separate generator creates 20 typed feature groups at 100, 500 and 1,000
entries. Each has distinct capability contracts and declared dependency edges.
Every native factory retains a typed `BootFailure` and `Config` requirement.
The capability contracts differ between nodes, but all factories share one
`Config` and one `BootFailure`; this does not measure a union of 1,000 distinct
construction error or environment types.
The fixture checks the resulting Layer type and contains rejecting controls:
assigning it to a Layer with `R = never` or without `BootFailure` must fail.
The generated inventories also execute real preparation, so type-size evidence
cannot silently include a graph that Core rejects.

| Entries | Types | Instantiations | Check time NodeNext / Bundler | Compiler-reported memory NodeNext / Bundler |
| --- | ---: | ---: | ---: | ---: |
| 100 | 141,002 | 285,355 | 1.245 / 0.669 s | 239812K / 239773K |
| 500 | 203,431 | 729,185 | 1.577 / 1.501 s | 341549K / 341846K |
| 1,000 | 281,437 | 1,283,621 | 3.241 / 2.739 s | 462595K / 462411K |

All six strict checks passed with TypeScript 7.0.2, no Node ambient types,
`skipLibCheck: false` and `--singleThreaded` diagnostic counters.
The measurement runner itself also passed a strict TypeScript check.
These are workspace-built public declaration checks, not a claim that the
1,000-entry generated fixture ran from npm or that an editor has the same cost.
Existing portable fixtures separately run from matched installed archives.

The size increase did not produce a type-instantiation failure in this shape.
It still has a meaningful compiler memory cost. This is a dated observation,
not a newly admitted performance budget, universal linear-time proof, or a
replacement for the existing Assembly type-scale budget.

### 3. Actual application capacity remains unqualified

The [Core resource limits][gm-limits] bound admitted declarations, edges, depth
and diagnostics. They are not an operational promise for that many live agents.

The native adapter uses [Effect 4.1.4 mergeAll][effect-merge], whose construction
concurrency is the number of merged children. The wide probe observed 100, 500
and 1,000 acquisitions concurrently. Wrapping one graph in an outer
`Effect.all(..., { concurrency: 2 })` did not reduce its internal fan-out.
The limit on graph executions and the limit on a graph's expensive acquisitions
are different controls.

An application needs capacity at the actual resource/work owner: pools,
acquisition-only permits, staged roots, bounded admission and complete retention
accounting as appropriate. Do not hold a scarce permit across an entire
provider lifetime when a dependent needs the same permit to be constructed;
that can create a wait cycle. No generic limiter is added to the mapper.

To qualify a named application, measure its active sessions/operations,
queued publishers, retained payload bytes, outstanding unacknowledged delivery
and work that remains alive after timeout. Test slow consumers, actual provider
cancellation and shutdown while work is active. Those are targeted application
acceptance cases, not another library-runtime implementation plan.

## Critical selection from external projects

| Project | Useful mechanism or test | Adaptation for GM | What not to copy into this adapter |
| --- | --- | --- | --- |
| OpenCode | Native Layer compilation, exact replacement tests, explicit shared/local memo domains, failed cached-build cleanup, response-body retention | Typed inventories before preparation; stable identities where intentional; borrowing and failure tests at actual lifetime boundaries | Object-identity replacement chains, product Location cache, lifetime DSL, or root order as a universal startup guarantee |
| LiveStore | Distinct owned/borrowed runtime, store retention, durable-page producer flow control, separate soft wait and drain | Explicit owner and configuration identity; distinguish finished waiting from finished cleanup | A global module-ID cache or an assumption that native Scope supplies durable engine shutdown |
| T3 Code | Services reused by transports; one shared queue Layer; item/byte budget kept through RPC ACK | Count retained stages and real active work; keep runners at outer boundaries | Its native-R convention for selecting neighboring GM providers, transport policy, or worker-count-as-total-operation-limit |
| Alchemy | Unused variants avoid acquisition; private processes outlive apply; native memo/scope alignment; failed deletion retention | Negative acquisition tests and correct resource lifetime; preserve all cleanup causes | Dynamic ambient provider registry, open error contract, blanket conversion of factory E to defects, or durable deletion/retry policy |

These are selected lessons, not proof that those projects endorse GM or share
its entire architecture. Counterevidence is retained in the linked studies:
an internal unbounded queue can have a real upstream budget; concurrent shutdown
can prevent deadlock; a documented cache can intentionally reuse the first
configuration while its entry lives. Source patterns alone are not incident
reports or comparative reliability scores.

## Delivery decisions and remaining work

**Delivered in this scope:** source audit, pinned studies, adversarial
counterexamples, two public behavior regressions, a reproducible type-size
experiment, and focused changes to the single packaged guide.
No production source/API/dependency or accepted ADR is changed.

**Future work requires a concrete consumer:** sustained concurrent load,
tenant isolation, external-I/O cancellation/late-result cleanup, cache identity,
admission and shutdown/drain policy. Publication remains the coordinated
Core/Assembly/Effect release decision recorded in the package README.
Neither is silently promoted by this audit.

Three review rounds separate source research, adversarial criticism and final
diff/evidence review. Final review caught a duplicate slot in the initial
type-size generator: duplicate provider indexes are now removed, all generated
graphs actually prepare, and all six measurements were repeated. It also added
an explicit error-channel rejection control and clarified that source-manifest
hashes describe inspection copies rather than upstream raw blobs. These are independent agent reviews, not GitHub approval
votes or upstream test runs. [The plan](audit-plan-2026-11-12.md) was committed
before the added tests. PR #238 records actual check conclusions and source
identities; queued, cancelled or skipped jobs are never counted as passes.

[gm-base]: https://github.com/agent-teams-ai/get-modular/commit/0ff54371967e4b56a9978f784f568a48731a324d
[gm-adr]: https://github.com/agent-teams-ai/get-modular/blob/0ff54371967e4b56a9978f784f568a48731a324d/docs/decisions/0043-plan-optional-native-effect-composition.md
[gm-standard]: https://github.com/agent-teams-ai/get-modular/blob/0ff54371967e4b56a9978f784f568a48731a324d/docs/architecture/common-assembly.md#consumer-module-standard
[gm-effect]: https://github.com/agent-teams-ai/get-modular/tree/0ff54371967e4b56a9978f784f568a48731a324d/packages/effect/src
[gm-family]: https://github.com/agent-teams-ai/get-modular/blob/0ff54371967e4b56a9978f784f568a48731a324d/packages/assembly/src/features/construction/wiring.ts
[gm-prepare]: https://github.com/agent-teams-ai/get-modular/blob/0ff54371967e4b56a9978f784f568a48731a324d/packages/assembly/src/features/construction/prepare.ts
[gm-values]: https://github.com/agent-teams-ai/get-modular/blob/0ff54371967e4b56a9978f784f568a48731a324d/packages/assembly/src/features/construction/wiring-values.ts
[gm-lower]: https://github.com/agent-teams-ai/get-modular/blob/0ff54371967e4b56a9978f784f568a48731a324d/packages/effect/src/features/construction/lower.ts
[gm-limits]: https://github.com/agent-teams-ai/get-modular/blob/0ff54371967e4b56a9978f784f568a48731a324d/architecture/qualification/v1/resource-profile-v2.json
[effect-release]: https://github.com/Effect-TS/effect/tree/289a53f7b1fc40049219c6e69022db2fb859c356
[effect-merge]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/effect/src/Layer.ts#L1209-L1223
[pr]: https://github.com/agent-teams-ai/get-modular/pull/238
