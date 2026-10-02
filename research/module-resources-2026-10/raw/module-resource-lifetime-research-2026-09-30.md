# Module resource lifetimes: comparative research (2026-09-30)

Status: research recommendation, **not an accepted ADR or an adoption gate**. No
runtime behavior or package release is authorized by this note.

## Decision recommended after adversarial review

Do **not** add a mandatory `ResourceRule` sidecar, Core v2 resource fields, or
`dispose()` to every module. Require a specific owner and lifetime for **each
actual cleanup obligation**. Record the reasoning at a genuine consumer/Host
boundary; register the live obligation with its owner when acquisition begins
or succeeds, according to the acquisition contract. A declaration can help
pre-import policy only when the Host has a concrete decision to make from it.

Composition nodes, runtime instances, active calls and owned resources form
different graphs. One module may expose several capabilities and acquire many
operation resources. A shared Host resource may be borrowed by many modules.
Resource allocation alone never creates another composition node. The current
[Consumer Module Standard](../get-modular/docs/architecture/common-assembly.md#new-composition-boundaries)
already keeps private helpers within a feature and assigns resource cleanup to
the Host or factory owner at acquisition.

## What mature systems actually do

| System | Transferable mechanism | Limit |
| --- | --- | --- |
| [OSGi Declarative Services](https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.component.html) | Component configurations have instance scopes and managed bind/unbind; dynamic replacement can bind a successor before unbinding the predecessor. | Component and bundle identity do not enumerate arbitrary native resources or prove outstanding work drained. |
| [VS Code extensions](https://code.visualstudio.com/api/get-started/extension-anatomy) | The manifest describes activation/contributions; runtime registrations enter `ExtensionContext.subscriptions`; `deactivate` is optional. | A command registration and its running invocation have different lifetimes. |
| [IntelliJ Disposer](https://plugins.jetbrains.com/docs/intellij/disposers.html) | A child disposable is registered under the shortest correct parent; plugin services can be disposed on unload. | Choosing a project/application parent for plugin-owned work can retain it past unload. [Dynamic unload](https://plugins.jetbrains.com/docs/intellij/dynamic-plugins.html) can fail and require restart. |
| [.NET DI](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines) | The container disposes what it creates within the appropriate scope; a received disposable dependency is not the receiver's cleanup authority. | Externally supplied instances remain with their external owner; nested scopes are not automatically a lifetime tree. |
| [Spring](https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html) | Singleton, request and prototype instances have different lifetime contracts; stop and destruction can be distinct phases. | Prototype destruction is the client's responsibility after handoff. |
| [Angular DestroyRef](https://angular.dev/api/core/DestroyRef) | Cleanup callback registration belongs to the actual component or injector scope. | A callback and a `destroyed` flag do not provide a general awaited drain protocol. |
| [NestJS lifecycle](https://github.com/nestjs/docs.nestjs.com/blob/master/content/fundamentals/lifecycle-events.md) | Application hooks have ordered async shutdown. | They do not cover request-scoped classes or automatically stop background intervals. |
| [OpenClaw at `92108db8`](https://github.com/openclaw/openclaw/blob/92108db80c1fab3685ec0d0c3ed76fc1dcb9be0d/docs/plugins/sdk-runtime.md#L123-L185) | Instance cleanup callbacks, call admission, retained consumer custody and physical cleanup are separate. | Native timers, sockets, processes and evaluated ESM state are not intercepted or proven released. |

JetBrains' [experimental modular-plugin format](https://plugins.jetbrains.com/docs/intellij/modular-plugins.html)
splits a plugin when separate processes, dependencies or class loaders require
it; its documentation discourages a broad split for ordinary plugins. This is
another reason not to count resources or classes as modules.

## Native disposal is useful, but is not recovery proof

The current [ECMAScript AsyncDisposableStack algorithm](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-asyncdisposablestack.prototype.disposeasync)
sets its stack state to disposed before invoking resource cleanup; subsequent
calls return without driving the old actions again. This is appropriate stack
semantics, but `stack.disposed` is not evidence that every physical resource
was released or that a failed action is retryable. Our Host must preserve the
original pending action/failure and a reachable owner separately. A standard
stack can be an adapter for simple lexical cleanup; it cannot by itself replace
cleanup single-flight, truthful debt, safe retry policy or a retained stream
lifetime. This conclusion comes from the specified algorithm, not a Node
runtime qualification or a claim that the JavaScript standard is defective.


Native executable mapping also has a narrower contract than physical byte
immutability: an open read-only fd and mode `0555` do not freeze file content.
A bounded native review reproduced metadata clock-tick collisions in 59/64
synthetic mutations. The existing test now changes mtime explicitly and verifies
changed bytes before asserting mapping rejection. Production mapping still
assumes an immutable executable closure and the accepted read-only rootfs
contract; this fixture correction does not qualify attacker-writable storage or
race-free execution integrity. Resource declarations cannot enforce that storage
assumption on their own.

## Scenarios the contract must distinguish

| Scenario | Actual owner or necessary rule |
| --- | --- |
| Pure selectable capability | It can be a graph node with no cleanup method. |
| Shared database pool | Host/caller owns the pool; consumers borrow it. A checked-out client has its own release obligation. |
| Partial factory failure or late acquisition after `await` | The construction-attempt owner survives before a returned module exists; late results retain custody and cannot publish into a closed scope. |
| Two capability views of one adapter | One owner and one cleanup obligation, despite multiple graph edges. |
| Child process or stream per operation | Operation/stream custody outlives the call that produced it; module shutdown alone is too coarse. |
| Background job outliving a request | Transfer to a longer-lived owner or stop/join it before ending its dependencies. |
| Published artifact | Release staging, preserve the durable result under its own retention policy. |
| Dynamic provider rebind or hot replacement | Define old-reference authority, active-use retention, successor publication and resource exclusivity separately. |
| Timeout or failed cleanup | Keep the raw action and owner reachable; timeout does not establish physical release or safe retry. |
| Native/global effects | Managed hooks cannot prove absence of escaped process-wide effects; stronger claims need mediation or isolation. |

The shortest stable rule is: identify the owner before fallible acquisition,
separate use from release authority, register partial acquisitions before the
next suspension, transfer custody explicitly, and report cleanup completion
only from evidence. These are per-obligation rules, not a universal module
interface. A review notation can list `owner / owned obligation and lifetime /
borrowed dependency / release evidence / failure holder` in the **existing**
consumer profile where it reveals a real boundary. A structural checker cannot
certify that no undeclared native resource exists.

## Immediate source-level risk in Agent Runtime

At the inspected AR baseline `c9b8efe485e2736bbaba4e9c47914fe3ac849b8a`,
[`journal.close()`](https://github.com/agent-teams-ai/agent-runtime/blob/c9b8efe485e2736bbaba4e9c47914fe3ac849b8a/packages/apps/embedded-runtime/src/features/ordinary-session-runtime/adapters/ordinary-observation-journal.ts#L32)
sets `closed = true` before `closeSync(fd)`. If close throws, the
[`cleanup` loop](https://github.com/agent-teams-ai/agent-runtime/blob/c9b8efe485e2736bbaba4e9c47914fe3ac849b8a/packages/apps/embedded-runtime/src/features/ordinary-session-runtime/composition/ordinary-agent-runtime-host.ts#L49-L56)
retains the action, but its next call sees `closed` and returns successfully;
the loop then removes the obligation without new closure evidence. The physical
close outcome is uncertain, so blindly repeating `closeSync(fd)` is not a safe
fix either. The accepted [ADR-0028 inventory](../get-modular/docs/decisions/0028-authorize-the-optional-ownership-contract-checkpoint.md)
already records the retry-proof gap.

Construction also clears `ownedHost` before awaiting disposal in
[`default-agent-runtime-host.ts`](https://github.com/agent-teams-ai/agent-runtime/blob/c9b8efe485e2736bbaba4e9c47914fe3ac849b8a/packages/apps/embedded-runtime/src/composition/default-agent-runtime-host.ts#L79-L84).
If disposal fails and no Host is returned, the inspected path has no demonstrated
reachable recovery holder or action driver. This is a proof gap, not evidence of
a production leak. Fixing it is more valuable than adding a manifest.

### Authorized implementation checkpoint

Implementation branch `fix/host-creation-cleanup-recovery`, head
`a0b461a9b887ad31e56293c2b2c2da1555a46f59`, delivered in
[AR PR #185](https://github.com/agent-teams-ai/agent-runtime/pull/185), merged on
2026-09-30 as [`b0bcb265`](https://github.com/agent-teams-ai/agent-runtime/commit/b0bcb265d1466da3272078f9dfdb7c6784624283), contains the bounded fix:

- Observed successful journal closure is idempotent. An uncertain close retains
  its failure and cannot be reported as recovered or retry a potentially reused
  descriptor.
- A failed construction exposes a cleanup-only recovery holder through the
  nominal public Host creation error. Nested cleanup settles before dependent
  outer owners release; successful actions are not repeated. Recovery is
  single-flight, and unresolved debt remains truthful after another attempt.
- The current CMS pin was reviewed and migrated to `9c722ceff4ede307d06d7a4b63fdebe615f54c53`.
  Historical authority and accepted bytes remain intact. The eight existing
  ordinary composition nodes, SDK adoption status and G1 `hold` are unchanged.

Measured against the inspected baseline: **123 added / 14 removed production source
lines** (the final eleven additions are disposal-contract comments),
**351 added / 1 removed runtime test lines**. Most other changes retain
standard migration evidence and platform receipts. Independent hosted
`gpt-6.1-sol` reviews found a public initialization error projection gap, which
was fixed and reviewed again. Subsequent gate findings corrected a stale SDK
pin check, journal test placement and its manifest expectations without widening production scope.
The final head adds
C0/current-profile consistency, a bounded recovery-test deadline and exact CMS
byte reconstruction. Independent review of that correction found no actionable
defects; 224 C0 tests and 60 adoption tests pass. Refreshed Linux/macOS receipts
for source `4dcef5f2` validate. The trusted Host/factory disposal contract now
requires repeatable observations, owner-proven physical retry and continued
rejection for terminal uncertainty. Its new recovery regression and separate
review pass. A subsequent Cubic finding corrected the synthetic Host aliases:
`dispose` and `Symbol.asyncDispose` share one wrapper. The new alias rejection
fails before that correction and passes afterward. The complete
[GitHub CI](https://github.com/agent-teams-ai/agent-runtime/actions/runs/36768676988)
passed at final head `a0b461a9`, including `check`, PostgreSQL durability and macOS
runtime tests. The required
[docs protocol check](https://github.com/agent-teams-ai/agent-runtime/actions/runs/36768677783)
also passed, and all review threads were resolved before merge. The squash
commit author email is `iliyazelenkog@gmail.com`, linked to `777genius`;
its technical committer is `GitHub <noreply@github.com>` (`web-flow`), as authorized.
Qualification remains limited to this cleanup correction; dynamic Host adoption,
proof of native resource absence and public lifecycle-kernel release remain outside it.


## Concrete target design (proposal, not implementation authority)

Every meaningful module declares capability dependencies using existing slots.
At its existing owner boundary, document which dependencies it borrows, which
obligations it creates and their lifetime. An explicit “no owned resources” is
useful review information. Do not invent an exhaustive list of future concrete
subscriptions or impose a dummy disposer on pure capabilities.

| Layer | Contract | Execution responsibility |
| --- | --- | --- |
| Module definition | Required/optional/many capabilities, concrete effect policy when admission needs it | Existing Core/Assembly checks and product admission |
| Construction attempt | Custody exists before fallible acquisition; partial failure has a surviving owner | Factory and Host |
| Instance/resource scope | Register each live owned subscription/handle; borrowed handles carry no release right | Actual instance or resource owner |
| Call/stream/job scope | Work and resources remain retained until observed settlement/release or explicit custody handoff | Product operation owner; optional candidate kernel only for adopted dynamic generations |
| Recovery holder | Keep unsettled action and evidence reachable after construction/cleanup fails | Caller/Host error recovery surface; no half-created operational Host |

A resource adapter handles partial acquisition; simply calling a factory and
registering its returned value cannot cover allocations lost before rejection.
After every await, a dynamic Host rechecks effect authority; late acquired
resources go to existing custody and cleanup, never into the retired module.
A subscription returned to a consumer needs an explicit lifetime/handoff rule.
Moving a handle alone cannot transfer ownership safely.

The module author should normally use narrow ports such as managed event
subscriptions, timers and stream factories. Those ports register obligations
with the right scope. The Host performs shutdown once. An instance-owned
`dispose` is meaningful when that instance owns obligations; a capability that
borrows a shared pool never shuts the pool down. Module scope, operation scope
and retained stream scope are distinct, without making more composition nodes.

Close new admission, stop producers when needed to unblock drain, settle active
work, then release dependencies under the resource's own ordering. This is not
a universal phase ordering: cancellation, streams and subprocesses need their
own dependency-aware shutdown protocols. Observer deadlines report pending;
they cannot delete obligations or authorize replay of an uncertain close.

The existing candidate `lifecycle-kernel` supplies generation/call/custody
bookkeeping, not physical cleanup or a static-module resource manager. A narrow
future shared ownership contract can reuse adapter-independent states and
conformance fixtures; filesystem close rules, process supervision, resource
policy and recovery drivers stay in consumers. Qualify the contract with real,
materially different ownership scopes before claiming a general runtime SPI.

Our proposed advantage is measurable: partial-construction recovery, rejection
of effects from old generations, stream custody, exactly one cleanup owner and
honest unresolved cleanup. A manifest or “disposed” flag alone proves none of
these. In-process arbitrary third-party code can bypass managed ports; stronger
claims need mediated effects or an isolation boundary.

## Bounded work and remaining architecture decisions

1. Owner authorized on 2026-09-30: correct journal close failure reporting and verify the uncertain-close path.
2. Owner authorized in the same request: identify the existing application owner that can retain and retry/read back
   cleanup debt when Host construction fails; add a holder only if none exists.
3. Add a concise owner/lifetime inventory to the AR consumer profile and examples
   to the current Consumer Module Standard, with rejecting checks that claim only
   structural coverage. Review AR's exact pinned standard delta before adoption.
4. Keep dynamic replacement and machine-readable pre-import resource policy for
   a real dynamic Host decision. Keep ADR-0028/0029 and G1 `hold` unchanged.

Original planning estimate: 300–610 changed lines for journal truthfulness,
owner inventory and focused evidence. A real failed-construction recovery
holder may add 200–500 production lines plus 250–500 test lines, depending on
the existing application owner. These are planning estimates with about ×2
uncertainty. The bounded implementation is measured above; these estimates
should not be used as its final size or as verified qualification.

This research used three independent hosted Astra xhigh critics and primary
documentation. Source analysis was read-only; no provider, agent, runtime or
smoke flows ran on user projects. The framework comparisons establish design
constraints, not a proof that a proposed implementation passes them.

## Follow-up: module-owned resource ergonomics (2026-10-01, proposal)

The default concrete owner can be the **module instance**. Its resource scope is
an internal lifetime mechanism, not another module, composition node or global
manager. The shared module definition can create multiple instances; each gets
its own obligations. A shorter operation scope or an explicitly retained stream
scope is necessary only when that resource actually has a different lifetime.

Pair setup with cleanup where the resource is created. React's
[effect setup/cleanup](https://react.dev/reference/react/useEffect) demonstrates
the authoring benefit; Effect v3's
[acquireRelease](https://effect.website/docs/v3/resource-management/scope#acquirerelease)
connects acquisition/release to an explicit scope. These are reference patterns,
not dependencies selected for Get Modular or equivalent recovery guarantees.

Illustrative proposed API, **not an existing package export**:

```ts
const subscription = await module.resources.setup({
  setup: () => events.subscribe(onEvent),
  cleanup: subscription => subscription.unsubscribe(),
});
```

`module.resources` belongs to this instance and is supplied at its composition boundary.
The factory/Host prepares and retains it before fallible construction. The
module selects acquisitions and supplies resource-specific release behavior;
the Host drives scope shutdown and retains failed construction/cleanup custody.
A manually maintained module `dispose` need not repeat these registrations.
Domain code remains independent of Get Modular; adapters use a narrow port.

The simple pair requires a qualified acquisition adapter: success returns an
owned handle, and failed acquisition proves complete unwind or retains a
reachable attempt owner. An arbitrary rejected Promise cannot prove absence of
partial allocations. Advanced adapters register independent partial resources
before the next suspension. Closing admission does not discard in-flight
acquisition; late success is retained for cleanup and never published as usable.
Concurrent cleanup joins existing work; completed actions are not replayed.
Uncertain physical release remains reachable and cannot be blindly retried or
reported as successful. A default stack ordering is suitable only for resources
whose dependencies match that order; operation-specific shutdown stays local.

Borrowed dependencies stay in typed dependency injection and are not registered
for release by the borrower. An acquisition that obtains its own pooled client
may own that client's return obligation without owning the pool. Resources
shared through several capability views still have one cleanup authority.

Adoption of the helper can be optional. Once a scoped adapter owns a resource,
its release rule and failure custody are part of its required contract. Pure or
borrow-only instances need no dummy `dispose` or an exhaustive resource list.
Static declarations describe intent; enforcement covers managed acquisition
paths and cannot detect arbitrary escaped native effects.

Shared-first option: Get Modular architecture owns the narrow types, semantics
and conformance fixtures. Any callback-taking runtime facade remains outside
Core/Assembly and outside the existing synchronous lifecycle kernel. ADR-0028's
ownership declaration explicitly excludes callbacks and execution; admitting a
facade therefore needs a successor decision rather than extending that frozen
contract silently. No package identity, source admission, runtime implementation,
consumer adoption or public release is authorized by this proposal.

The follow-up hosted critic used the authorized `account-s`, `gpt-6.1-sol high`
and default service tier in an isolated TEST checkout of AR `b0bcb265`. The
provider rejected that model before any turn or source change. This follow-up
therefore has no new independent worker review; the recommendation remains
source/documentation-backed design analysis by the primary agent. Prior reviews
of PR #185 and the historical comparative research are separate evidence.

### Subsequent four-worker critique and synthesis

On 2026-10-01, four new independent hosted critics completed the hierarchy,
ergonomics, async-failure and industry lanes. All requested `gpt-6.1-sol`, `max`
and fast (`priority`); all returned `done` with no source changes. This supplies
the previously missing follow-up critique without changing the failed attempt
record above. Requested settings are retained; effective backend tier was not
independently attested.

The [synthesized contract and staged plan](shared-module-resource-contract-2026-10-01.md)
uses the owner-selected `setup/cleanup` vocabulary and puts the optional helper
inside each module instance. Children borrow parent resources without cleanup
authority. Normal parent cleanup waits for dependent work and child cleanup;
unexpected loss is a dependency health event with resource-specific policy.
Partial setup and cleanup uncertainty must retain a reachable owner. The new
plan records admission prerequisites, meaningful rejecting tests and explicit
proof limits. It remains a proposal; no shared runtime, package admission,
production adoption or public release was implemented by these critiques.
