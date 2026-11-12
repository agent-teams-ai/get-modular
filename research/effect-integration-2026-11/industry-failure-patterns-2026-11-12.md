# Effect failure patterns and Hazel — 2026-11-12

This source study extends the [previous ecosystem review](effect-projects-2026-11-12.md)
for the [production-hardening plan](production-hardening-plan-2026-11-12.md).
It records upstream fixes, their test designs and implications for GM. The single
[packaged practices guide](../../packages/effect/docs/practices.md) owns usage
rules; this document does not create another standard or a production admission.

## Sources and evidence boundary

| Source | Inspected revision | Version / selection | Reason for selection |
| --- | --- | --- | --- |
| Effect | `289a53f7b1fc40049219c6e69022db2fb859c356` | [Package version 4.1.4][effect-version] | Actual resource and cancellation regressions, including fixes that required a second review |
| Hazel | `21202479f5f733a6cc91ef2f5e783b661bed2b7e` | [Workspace catalog 4.1.1][hazel-version] | Substantial full-stack application with request-bound execution and external-data adapters |
| GM comparison | `6169d018935444bde08d43c30bb9a6a9fa9efbd3` | Matched implementation candidate, Effect 4.1.4 | Current native construction boundary before this hardening delivery |

The files and rejecting tests below were **read, not executed**. PR descriptions
identify the reported failure and chronology; implementation and test sources
were independently inspected at immutable revisions. Their CI claims are not
our execution evidence. The Hazel catalog does not identify every deployment's
installed version. No claim about Hazel's traffic, customer count or production
capacity follows from repository size or the presence of tests.

All four selected Effect fix families are present in the 4.1.4 source inspected
here. Local installed 4.1.4 source was also checked for the scoped semaphore lease,
replacement-scope closure and upgrade cleanup mechanisms. These are historical
upstream defects and useful regression designs, **not open GM defects** or a
reason to change the qualified peer without further evidence.

## 1. Acquiring a resource and registering its release must be one handoff

### SQLite: interruption after taking a permit

[Effect PR #9962][sqlite-pr], merged 2026-10-27 as
`f3e9dd41f74b34ca36eb0d0ce01a6fb8d683e0c1`, describes a queued SQLite transaction
that took the only connection permit and was interrupted before registering its
release. Later statements then waited indefinitely. A normal completion test or
an interruption while still waiting would miss that transition.

The fix adds scoped permit acquisition. The [4.1.4 semaphore implementation][semaphore]
waits interruptibly when the caller permits it, then takes the permit and installs
its finalizer without an interruption gap. [SQLite acquisition][sqlite-lease]
uses that operation instead of separate manual take and release registration.
The original merge was on `v4/next-minor`; direct source inspection, rather than
assuming that merge is an ancestor of the release, establishes the mechanism's
presence in 4.1.4.

The [SQLite regression][sqlite-test] reduces the scheduler operation budget and
sweeps interruption over 31 yield offsets. Its independent oracle is that a
subsequent statement can still obtain the connection. [Semaphore tests][semaphore-test]
separately check holding permits until scope closure and cancellation while
waiting. These check distinct transitions; one passing case cannot replace both.

**Transfer to GM:** test interruption at the construction handoff and prove that
another build can proceed afterward. Prefer the existing resource primitives;
do not add a GM semaphore or duplicate their internals. An acquisition-only limit
and a permit retained for an entire resource lifetime still express different
capacity policies. The SQLite fix does not justify retaining one shared startup
permit until every dependent provider has been released.

### HTTP upgrade: a correct schema-error fix still had an interruption gap

[PR #9998][upgrade-schema-pr], merged 2026-10-27 as
`7ca71bbfbac5b5f2333d310e6e108f4e90382abe`, corrected an upgraded connection that
was abandoned when HTTP 101 response headers failed schema decoding. The fix
took ownership of the upgrade before decoding and closed it when decoding failed.
It belongs in the decoder that rejects the acquired connection, through the
public upgrade contract, rather than only one transport implementation.

[PR #10002][upgrade-interrupt-pr], merged later that day as
`1e732194015849141011e685edef968410568617`, found the remaining gap: interruption
could occur after taking the upgrade but before installing the cleanup handler.
The [4.1.4 decoder][upgrade-decoder] masks that small ownership transition and
restores interruptibility for header decoding. The [regressions][upgrade-tests]
use a real local upgraded socket, reject the headers or interrupt exactly when
the upgrade succeeds, and wait for the server to observe closure.

**Transfer to GM:** the existing [construction fixture][gm-construction] already
checks a malformed product after a resource-owning dependency has acquired: the
result remains a defect, the dependency releases, and the rejected accessor is
never evaluated. That coverage should be retained, not duplicated as a new gap.
Successful cleanup on validation failure alone does not prove the interruption handoff.
Keep the ownership transition small; masking an entire request or all startup
work would make cancellation wait for unrelated work. A late foreign Promise
needs its own cancellation or safe handoff contract: an interruptible wrapper
cannot automatically recover a resource value that arrives after it has stopped.

## 2. Own cleanup even when a worker has not started

[PR #9722][switch-pr], merged 2026-10-21 as
`8727e5d2bec8e2d729b7aeafb725a4ab21d533d2`, fixes replaced inner streams whose
setup scope existed before their worker fiber first ran. Cleanup installed only
inside the worker could not execute when that worker was interrupted before
starting. A long-lived outer stream retained those scopes until it ended.

The [4.1.4 channel implementation][switch-source] retains the worker's scope
beside its fiber and closes that scope when replacing the worker. Native repeated
scope close handles the case where the worker already performed its own cleanup.
The [source test][switch-tests] emits three inner streams in one outer chunk,
waits on a latch for the last stream to start, and checks that the first two have
already finalized before the outer stream is stopped. It observes ownership
completion, rather than relying on a sleep to infer a scheduling order.

**Counterevidence:** this operator deliberately ignores finalizer failures from
replaced workers, and a separate source test asserts that policy. It would be
incorrect to infer that every native combinator aggregates every cleanup defect.
That choice does not imply GM should discard errors from ordinary graph closure.

**Transfer to GM:** failure tests should include startup work that has only partly
progressed, and distinguish resource registration from a worker having begun.
Do not rebuild stream supervision in the mapper. Consumer stream tests should
qualify their chosen operators, termination path and error-observation policy.

## 3. Execution ownership differs from immutable request identity

[PR #10363][http-scope-pr], merged 2026-11-04 as
`111615ad379c741c0c01438b826661a64837cd97`, replaces an HTTP scope controller map
keyed by request object. Middleware could create a new request that lost its
scope entry; concurrent executions of the same immutable request could overwrite
each other's controller. Neither immutable values nor a WeakMap establish the
correct ownership identity.

The [4.1.4 client][http-scope-source] carries the active request scope through
execution context. Each actual transport exchange creates a controller and
registers its abort before dispatch. The [regressions][http-scope-tests] use
Deferred barriers to force two executions between middleware and dispatch, then
close one scope and assert that only its signal is aborted. Separate cases cover
redirects and interruption before response headers.

**Transfer to GM:** keep the mapper's per-`.layer()` identities and explicit
memoization domain; do not cache a resource just because its declaration or
configuration object is reused. Test concurrent isolation, as well as sequential
rebuilds. Native caller context carries execution ownership; copying a whole
construction Context can reintroduce a stale owner.

**Limit:** the HTTP change is not a universal request timeout or physical-I/O
settlement guarantee. Its documented body lifetime remains attached to the owning
scope after a response is returned. It also deliberately attaches helper-client
requests made during middleware execution to that scope unless a separate inner
owner is supplied. Those are HTTP-adapter contracts, not new GM responsibilities.

## 4. Hazel: share service definitions, preserve request execution context

Hazel's [per-request RPC implementation][hazel-rpc] and
[fix commit][hazel-rpc-fix] describe a workerd failure caused by an isolate-wide
RPC server whose fibers were created during one request and later awakened by
another. The fix builds the RPC server in each request's scope while sharing
handler and middleware services. It excludes build-time Scope, scheduler and
tracing services from the selected service context.

The [regression source][hazel-rpc-test] gives route construction and successive
requests different schedulers and records cross-request scheduling violations.
It also checks that in-process dispatch follows the caller's execution context.
This is meaningful targeted evidence, but the test uses a Node-side scheduler
model and short real timer waits; it does not itself execute Cloudflare workerd.

**Adopt the ownership distinction:** a shared service does not imply that its
request-bound scheduler, Scope, span or native I/O context may be shared. Keep
native operations on the caller's chain. For a serverless consumer, qualify the
actual host's request restrictions instead of copying a long-lived server recipe.

**Do not copy the helper as a GM abstraction:** Hazel selects dynamic RPC keys
through `mapUnsafe`/`makeUnsafe` and uses type assertions for that application
bridge. Its generic return type is not an independent proof that every arbitrary
Context requirement survives filtering. GM already has explicit slots and typed
ambient requirements; a generic Context-pruning API would add an unjustified
mechanism and weaken the visible contract.

## 5. Hazel: retries need operation semantics and error classification

The [provider HTTP adapter][hazel-http] centralizes external read behavior for
several providers. Authentication failures, rate limits, transient transport/server
failures, other client refusals and unreadable responses have different meanings.
Its POST route is explicitly a read expressed as RPC; retry safety comes from
that operation contract, not the HTTP method or the fact that Effect can retry.

For pulls it allows two inline retries for short rate-limit delays; longer delays
return to the application's alarm owner. Webhook-path reads use zero inline
retries and a shorter per-attempt timeout. Successful JSON is decoded against
the adapter's schema, and an unreadable response is not retried indefinitely.
Schema diagnostics select paths and issue kinds instead of payload values.
The [Clerk pull tests][hazel-http-tests] use TestClock and call counts to check
short waits, long-delay handoff, retry exhaustion and terminal decode errors.

**Adapt:** keep retries at the semantic operation owner, with bounded attempts
and classified failures. A module-graph retry may repeat all its factories, so
construction should acquire local resources rather than perform irreversible
business commands. Retry tests need observable attempt counts and interruption,
not only an eventual success value. Schema validation does not replace cleanup
when a resource was already acquired before validation failed.

**Do not generalize the policy:** this adapter parses numeric `Retry-After`, not
every legal header form; its timeout is per attempt, not a total operation
deadline. Selected schema paths are not a proof that arbitrary diagnostic keys
cannot contain sensitive identifiers. The repository-specific choices and error
text policy need review before reuse elsewhere. GM should not acquire a provider
HTTP framework, retry engine or universal error classifier from this example.

## Implications for deterministic GM checks

These are evidence-derived test targets, not a claim that upstream failures were
reproduced in GM. The [hardening plan](production-hardening-plan-2026-11-12.md)
and final delivery report own which local checks actually ran.

| Failure transition | Useful independent observation | Responsible boundary |
| --- | --- | --- |
| One parallel factory fails after a sibling acquired a resource | No published root; sibling cleanup joins; dependency stays usable until finalizers finish | GM public construction tests |
| Interruption lands while masked foreign acquisition is pending | Interruption waits for the safe handoff; late resource is released exactly once; no successful root | GM public construction tests with an explicit acquisition contract |
| Factory returns an invalid product after dependency acquisition | Existing fixture preserves the defect, releases its owned dependency and never evaluates the rejected accessor | Existing GM construction coverage |
| A failed/interrupted graph is built again in a fresh native scope | Fresh acquisition succeeds without stale failure, resource or state reuse | GM Layer/MemoMap boundary |
| One immutable request is executed by independent owners | Closing one owner leaves the other's operation alive | Application transport, plus GM graph-input isolation coverage |
| Inner stream is replaced before its worker starts | Cleanup happens before the long-lived outer stream exits | Chosen stream/operator owner |
| A transient external read is retried | Bounded attempt count; cancellation stops new attempts; terminal errors stay terminal | Consumer adapter with TestClock or barriers |

Prefer barriers for causal ordering and virtual time for an actual timer policy.
A finite test timeout can detect a hang, but elapsed milliseconds do not prove
the resource protocol. Avoid duplicating the whole Effect test suite: preserve
the integration's own handoffs, public types, exact peer and installed-package
boundary. These source studies support narrow tests and guide improvements, not
a new scheduler, lifetime DSL, automatic supervisor or production certification.

[effect-version]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/effect/package.json
[hazel-version]: https://github.com/MapleTechLabs/hazel/blob/21202479f5f733a6cc91ef2f5e783b661bed2b7e/package.json#L11-L23
[sqlite-pr]: https://github.com/Effect-TS/effect/pull/9962
[semaphore]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/effect/src/Semaphore.ts#L303-L310
[sqlite-lease]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/effect/src/sql/SqlClient.ts#L497-L505
[sqlite-test]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/sql/sqlite-node/test/Client.test.ts#L436-L455
[semaphore-test]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/effect/test/Semaphore.test.ts#L532-L558
[upgrade-schema-pr]: https://github.com/Effect-TS/effect/pull/9998
[upgrade-interrupt-pr]: https://github.com/Effect-TS/effect/pull/10002
[upgrade-decoder]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/effect/src/http-api/HttpApiClient.ts#L1111-L1126
[upgrade-tests]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/platform/node/test/HttpApi.test.ts#L1278-L1309
[switch-pr]: https://github.com/Effect-TS/effect/pull/9722
[switch-source]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/effect/src/Channel.ts#L6538-L6578
[switch-tests]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/effect/test/Stream.test.ts#L2047-L2076
[http-scope-pr]: https://github.com/Effect-TS/effect/pull/10363
[http-scope-source]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/effect/src/http/HttpClient.ts#L695-L746
[http-scope-tests]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/effect/test/http/HttpClient.test.ts#L2564-L2637
[hazel-rpc]: https://github.com/MapleTechLabs/hazel/blob/21202479f5f733a6cc91ef2f5e783b661bed2b7e/apps/backend/src/rpc/per-request.ts#L1-L79
[hazel-rpc-fix]: https://github.com/MapleTechLabs/hazel/commit/2271119316f982c76c95348239a36f715858cfba
[hazel-rpc-test]: https://github.com/MapleTechLabs/hazel/blob/21202479f5f733a6cc91ef2f5e783b661bed2b7e/apps/backend/src/rpc/per-request.test.ts
[hazel-http]: https://github.com/MapleTechLabs/hazel/blob/21202479f5f733a6cc91ef2f5e783b661bed2b7e/apps/backend/src/worker/objects/customers/provider-http.ts
[hazel-http-tests]: https://github.com/MapleTechLabs/hazel/blob/21202479f5f733a6cc91ef2f5e783b661bed2b7e/apps/backend/src/worker/objects/customers/clerk/pull.test.ts#L282-L445
[gm-construction]: https://github.com/agent-teams-ai/get-modular/blob/6169d018935444bde08d43c30bb9a6a9fa9efbd3/packages/effect/tests/construction.test.ts#L100-L152
