# Effect comparison: correct the scope of the earlier rating

Status: source-backed assessment, 2026-11-06; not a performance benchmark or a
claim that either complete implementation has been audited. Get Modular source
is `5fb83478dd7b95216be92c4d3077eddf2774eef8`; Effect source is
`9428e17499ee3a144f2ac73c67213fb1336d2bdf` (package manifest version 4.1.2).

## Conclusion

The earlier architecture-only scores must not be read as overall parity with
Effect. They were qualitative judgments on a small, partly correlated set of
architecture criteria, not calibrated measurements of complete technical power.
Clean Architecture, SOLID, DDD, DRY and modularity overlap; averaging them can
hide a large difference in execution semantics and feature scope.

Effect has a substantially broader implemented asynchronous execution model.
Get Modular has a focused composition contract with useful explicit guarantees.
High quality in that narrower responsibility is credible. Overall superiority,
equivalent operational reliability, and superior performance are not established.
Stars, contributor counts and commit volume are not inputs to this assessment.

## Compare the actual responsibilities

| Concern | Source observation | Assessment |
| --- | --- | --- |
| Composition before application factories | Get Modular accepts inert declarations, explicit bindings, bounded cardinalities and exact compatibility, and emits a canonical immutable plan/digest | A concrete specialization; preserve and qualify it |
| Service construction | Effect Layer represents input/output services and errors, composes layers and shares acquisition through MemoMap | Effect already solves substantial construction and sharing behavior |
| Resource handling | Effect integrates Scope, acquireRelease and scoped fibers with execution; Get Modular separates Resources from construction and retains cleanup debt | Effect offers stronger integrated ergonomics; the two resource protocols are not interchangeable |
| Concurrency and interruption | Effect provides fibers, joining, interruption and scoped execution; Get Modular's current construction runner is sequential | Effect is clearly ahead as an asynchronous runtime |
| Error composition | Effect types expected errors and exposes Cause/Exit and error composition; Assembly has construction outcomes with opaque factory causes | Effect has a richer execution error model |
| Scheduling, streams and state | Effect includes Schedule, Stream, Queue, PubSub, Ref and related primitives | Broad implemented functionality, not popularity evidence; copying it is outside this plan |
| Ordinary module contracts | Get Modular factories receive closed declared ports; Effect may be kept behind an adapter or expressed in a service API | Get Modular can fit ordinary TypeScript ports without imposing an effect representation; this does not prove that Effect violates architectural boundaries |
| DDD and source privacy | Application owners and adopted source rules determine context boundaries in Get Modular; Layer alone is not a DDD boundary policy | Neither library makes arbitrary application code architecturally correct automatically |

Get Modular sources: [system boundary](../../docs/architecture/system-boundary.md),
[requirements](../../docs/requirements/module-system-v1.md),
[Assembly types](../../packages/assembly/src/features/construction/types.ts),
[runner](../../packages/assembly/src/features/construction/run.ts), and
[Resources](../../packages/resources/README.md).

Effect sources at the observed revision:
[Effect](https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/Effect.ts),
[Layer](https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/Layer.ts),
[Scope](https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/Scope.ts),
[Fiber](https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/Fiber.ts),
[Cause](https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/Cause.ts),
[Schedule](https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/Schedule.ts),
[Stream](https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/Stream.ts),
[manifest](https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/package.json).

## A realistic advantage for Get Modular

Aim to make declared composition inspectable and invalid configurations reject
before factory effects, while keeping application ports and operational ownership
explicit. The proposed resource preflight and authoring checks reinforce that
goal. Exact revision adapters can enable gradual module migrations while keeping
each chosen edge strict. Their implementation and real consumer results remain
future evidence, not an increase in today's score.

The current Layer API is not the same artifact contract as Get Modular's inert
portable input and canonical plan/digest. That is a difference in purpose, not
proof that Effect could never implement an equivalent adapter or that its typed
construction model is weak.

Effect can be used inside a module behind the module's ordinary port if a consumer
needs its execution semantics. Such an integration must retain one owner for each
resource and avoid two independent dependency graphs controlling the same edge.
No universal Effect integration package is proposed here.

## Evidence needed before stronger claims

- Compare the same consumer task, graph, failures and supported runtime matrix.
- Separate compile-time rejection, pre-factory rejection, runtime cancellation,
  cleanup failure reporting and physical external-resource release.
- Measure change effort, changed files, diagnosis quality, startup time and memory
  where relevant; do not substitute feature counts or repository size.
- Retain negative cases and independent expected outcomes. A green happy path or
  a successful source probe is not packed-package or TypeScript qualification.

This planning delivery improves the specificity of the claims. It does not run
a new complete Effect-versus-Get-Modular benchmark or certify equal reliability.
