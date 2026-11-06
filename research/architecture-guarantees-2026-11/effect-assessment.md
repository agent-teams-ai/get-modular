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

The depth is visible in concrete mechanisms: Layer's MemoMap installs completion
handling before publishing a shared acquisition, so interruption of its first
requester does not leave the shared result uncompleted. Layer merging integrates
concurrent construction with scopes. Resource acquisition exposes interruptibility
as an explicit contract. These interacting execution guarantees account for work
that an architecture-only composition score does not measure.

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

## Can the two libraries usefully coexist?

Yes, with a concrete division of responsibilities. Get Modular is narrower in
purpose, but Effect already provides typed service composition through Layer and
Context. The additional value of Get Modular is its independent composition
artifact and explicit module/provider policy, not the mere existence of dependency
injection. This is a justified integration opportunity, not evidence of greater
reliability, speed or automatic Clean Architecture/DDD conformance.

The smallest first arrangement is a consumer-owned adapter in one existing,
cohesive module that actually needs Effect's execution semantics. For example,
Get Modular selects a search module's document-store and model-provider ports;
the module supplies those already-created values to its private Effect services
and uses Effect for its concurrent operations. Not every module needs Effect.

| Boundary | Responsibility |
| --- | --- |
| Application composition | Get Modular selects implementations, declared cross-module ports and bindings, and validates its composition artifact |
| Module execution | Effect handles local workflows, typed errors, interruption and private service construction |
| GM-owned shared provider | Supply the existing value through `Context.make` or `Layer.succeed`; the Effect module borrows it and does not register a second disposer |
| Private Effect resources | Layer/Scope owns their release; the enclosing owner controls the ManagedRuntime lifetime |
| Startup and shutdown policy | The existing consumer Host defines readiness, ingress/drain, failure handling and the lifetime of borrowed providers |

`Layer.succeed` wraps an existing value in a Context without acquiring or releasing
it. Mapping that value to an Effect service key is not a second provider-selection
policy. Reconstructing its database pool from configuration in a second Layer
would be. See [Layer.succeed][effect-succeed] and [Context][effect-context].

Use one ManagedRuntime for the intended lifetime of a persistent private Layer
graph, where that graph is needed. Closed effects without persistent services may
use an ordinary runner. Do not mandate a runtime per module, method or request.
ManagedRuntime creates a private MemoMap by default. Layer memoization uses Layer
object identity, not arbitrary injected GM values; do not add a global shared map
to conceal duplicate construction or cross independent consumer lifetimes.
See [ManagedRuntime construction][effect-build] and [Layer memoization][effect-memo].

### Public ports and cancellation

Prefer an ordinary Promise port for a first integration that keeps Effect an
implementation choice. `runPromise` is the existing bridge; `runPromiseExit`
retains Exit/Cause for deliberate conversion. `Promise<A>` does not carry Effect's
typed error parameter `E`. Translate expected failures into the consumer's
existing result/error contract and preserve defects and interruption deliberately;
do not introduce a universal Result framework or erase failures into success.

An Effect-returning port is also possible when its contract deliberately depends
on Effect and a compatible version. `Effect<A, E, never>` closes environmental
requirements, but **does not establish resource lifetime**. An Effect capturing a
built Context can run on the caller's fiber outside the private ManagedRuntime's
tracked execution. Such a port needs an explicit execution/lifetime owner; a cast
or general conversion helper cannot supply that guarantee. See [runner and
provide APIs][effect-api] and [ManagedRuntime execution][effect-build].

Each operation's signal must reach its work: the consumer's cancellation contract
feeds `runtime.runPromise(effect, { signal })`, and a Promise-backed SDK is called
through the normal signal-accepting `Effect.tryPromise((signal) => ...)` form.
An SDK that ignores the signal may continue external work after a fiber stops.
The factory's construction signal is not a universal signal for future requests.
Use the actual module lifetime and per-operation cancellation policy, not nested
unmanaged runners. See [Effect Promise cancellation][effect-promise] and
[Resources signals][gm-signals].

### Two lifecycle obligations at the adapter boundary

**Register runtime custody before warmup.** ManagedRuntime builds its Layer
lazily. Cancelling a requester awaiting the shared build need not stop the build;
runtime disposal owns that work. GM can register a setup value's cleanup only
after the setup callback returns that value. Therefore create and return the cold
runtime through `resources.setup`, await that registration, and only then warm
mandatory services before publishing a ready port. If warmup fails, the existing
Host attempt cleanup must close the already-registered runtime. Waiting for
warmup inside setup before returning the runtime would require its own correct
rollback path. A failed build is cached; repeating calls is not a build retry
strategy. Sources: [ManagedRuntime build][effect-build] and
[Resources setup][gm-setup].

**Preserve a failed first disposal result.** In the inspected Effect revision,
the first `dispose()` may reject on a finalizer failure while a subsequent
`dispose()` fulfills without rerunning the finalizer. GM Resources retries failed
cleanup callbacks, and a fulfilling callback clears its debt. A naive
`cleanup: runtime => runtime.dispose()` can therefore clear the adapter's debt
without a new release attempt. This is a protocol mismatch at the adapter, not
proof of either library promising physical release. Sources:
[ManagedRuntime disposal][effect-dispose], [Scope close][effect-scope-close], and
[GM retry/accounting][gm-cleanup].

The bounded correction is to retain the first disposal Promise per owned runtime
and return it on every cleanup call. It preserves the failure and cause; it does
**not** retry the finalizer or recover the resource. A resource that actually
needs GM's retry/escalation protocol should remain directly GM/Host-owned and be
borrowed by Effect. This calls for a consumer adapter rule, not a Resources-core
feature or a general lifecycle framework.

Structural sketch only; the actual installed public imports and types remain to
be qualified. `closedLayer` is the consumer's Layer with its declared dependencies
provided; `resources` belongs to its scoped module factory:

```ts
let firstDisposal: Promise<void> | undefined;
const runtime = await resources.setup({
  name: "effect-runtime",
  setup: () => ManagedRuntime.make(closedLayer),
  cleanup: value => firstDisposal ??= value.dispose(),
});

// Required before publishing a ready port; omit only for deliberate lazy readiness.
await runtime.runPromise(Effect.void, { signal: resources.signal });
```

Host policy must keep borrowed providers available while dependent work or cleanup
needs them. Reverse registration order alone does not ensure this after a cleanup
failure: GM continues attempting other releases. Reuse the existing owner/debt
policy from [plan 06](06-borrowed-lifetimes.md). ManagedRuntime disposal interrupts
and awaits its tracked work before closing private Layer resources; successful
graceful drain remains the Host's policy. Neither runtime disposal nor GM's wait
abandonment forcibly stops an uncooperative external SDK or finalizer.

### When the extra layer is not justified

- An Effect-first application already has sufficient typed composition and no
  need for the independent GM composition artifact or adopted module policy:
  Effect alone can be simpler. An existing Effect Host can own a bounded GM
  operation if required; do not wrap every root in another runtime.
- GM plus ordinary asynchronous ports already meets the real requirements:
  adding Effect solely to claim stronger architecture adds a programming model.
- Both libraries reconstruct the same complete service graph or dispose the same
  leaf resources: fix the ownership split before adopting the pair.

No seventh workstream, mandatory Core/Assembly dependency, runtime rewrite,
automatic Layer generator, universal bridge package, second implementation of
Effect primitives or module-per-Queue/Ref is proposed. An unrestricted Context
exported as a service locator would also weaken the declared port boundary.

For [plan 05](05-parallel-startup.md), measure the actual consumer arrangement.
Effect's [Layer.mergeAll][effect-merge] already builds independent local Layers
concurrently. If this removes the real bottleneck inside a cohesive subsystem,
defer inter-module parallelism. It does not automatically overlap separate GM
factories. Do not merge unrelated modules or move required initialization to the
first request to make a startup metric look better.

### Qualification before a consumer adopts the pair

Use one actual port and existing consumer checks. Verify selected-provider
identity and one release owner; startup failure/cancellation without lost custody
or early port publication; result/error/abort mapping; managed-work cleanup and
borrowed-provider lifetime; and retention of a failed disposal cause across a
second close. Qualify the actual packed public imports and Assembly factory shape
on the repository's strict compiler floor. These are bounded adoption obligations,
not a new integration platform or tests to add to this planning PR.

Three one-off source probes below ran on Node 24.22.1 without installing packages
or changing repository source. They observed the first disposal rejection/second
fulfillment, a shared lazy build surviving requester cancellation until disposal,
and the GM debt difference between naive and memoized disposal. `runPromise` also
returned an ordinary native Promise. These observations do not qualify the full
factory path, public package imports, strict types, physical resource release or
production integration.

[effect-api]: https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/Effect.ts
[effect-context]: https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/Context.ts
[effect-succeed]: https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/Layer.ts#L827-L886
[effect-memo]: https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/Layer.ts#L418-L468
[effect-build]: https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/ManagedRuntime.ts#L274-L383
[effect-dispose]: https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/ManagedRuntime.ts#L395-L424
[effect-scope-close]: https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/internal/effect.ts#L4026-L4085
[effect-promise]: https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/internal/effect.ts#L1140-L1250
[effect-merge]: https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/Layer.ts#L1209-L1281
[gm-setup]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/packages/resources/src/features/scope/scope.ts#L94-L131
[gm-signals]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/packages/resources/src/features/scope/types.ts#L30-L43
[gm-cleanup]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/packages/resources/src/features/scope/scope.ts#L315-L402

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

## Retained source probes

These are immutable one-off experiment commands and outputs, not maintained
JavaScript tooling or a new test harness. Node used native TypeScript stripping;
no strict typecheck, packed-package or application E2E qualification is claimed.
The paths identify the observed checkouts at the source revisions above.


All commands exited with code 0. The first two run from `/workspace/scratch/44ef6f5b5546/research-layers/effect`. The third runs from `/workspace/scratch/44ef6f5b5546`. No files or dependencies are created by these commands.

### Probe 1: native Promise, original disposal error and second disposal

```bash
node --input-type=module <<'JS'
import * as Effect from './packages/effect/src/Effect.ts';
import * as Layer from './packages/effect/src/Layer.ts';
import * as ManagedRuntime from './packages/effect/src/ManagedRuntime.ts';
let calls = 0;
const failure = new Error('probe-finalizer-failed');
const runtime = ManagedRuntime.make(Layer.effectDiscard(Effect.addFinalizer(() => Effect.sync(() => {
  calls += 1;
  throw failure;
}))));
const warming = runtime.runPromise(Effect.void);
const ordinaryPromise = Object.getPrototypeOf(warming) === Promise.prototype;
await warming;
let first = 'fulfilled';
let originalCause = false;
try { await runtime.dispose(); } catch (cause) { first = 'rejected'; originalCause = cause === failure; }
let second = 'fulfilled';
try { await runtime.dispose(); } catch { second = 'rejected'; }
console.log(JSON.stringify({ordinaryPromise,first,second,originalCause,finalizerCalls:calls}));
JS
```

Observed output:

```json
{"ordinaryPromise":true,"first":"rejected","second":"fulfilled","originalCause":true,"finalizerCalls":1}
```

### Probe 2: cancelled requester leaves shared build until runtime disposal

```bash
node --input-type=module <<'JS'
import * as Effect from './packages/effect/src/Effect.ts';
import * as Exit from './packages/effect/src/Exit.ts';
import * as Layer from './packages/effect/src/Layer.ts';
import * as ManagedRuntime from './packages/effect/src/ManagedRuntime.ts';
let starts = 0;
let buildExits = 0;
let finalizers = 0;
let reportStarted;
const started = new Promise(resolve => { reportStarted = resolve; });
const layer = Layer.effectDiscard(Effect.gen(function* () {
  yield* Effect.addFinalizer(() => Effect.sync(() => { finalizers += 1; }));
  yield* Effect.sync(() => { starts += 1; reportStarted(); });
  yield* Effect.never.pipe(Effect.ensuring(Effect.sync(() => { buildExits += 1; })));
}));
const runtime = ManagedRuntime.make(layer);
const caller = new AbortController();
const request = runtime.runPromiseExit(Effect.void, { signal: caller.signal });
await started;
caller.abort('probe-caller-cancel');
const exit = await request;
const beforeDispose = {buildExits, finalizers};
await runtime.dispose();
console.log(JSON.stringify({starts, callerInterrupted: Exit.hasInterrupts(exit), beforeDispose, afterDispose:{buildExits,finalizers}}));
JS
```

Observed output:

```json
{"starts":1,"callerInterrupted":true,"beforeDispose":{"buildExits":0,"finalizers":0},"afterDispose":{"buildExits":1,"finalizers":1}}
```

### Probe 3: GM cleanup debt with naive versus memoized runtime disposal

This uses Node's built-in `registerHooks` only to map GM's own relative `.js` source imports to the corresponding `.ts` source files. The hook is restricted to imports originating under the Resources source directory. There is no behavior substitute, transpiler installation or repository edit.

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
const gmSource = pathToFileURL(`${process.cwd()}/get-modular-plans/packages/resources/src/`).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.startsWith(gmSource) && specifier.startsWith('.') && specifier.endsWith('.js')) {
    return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
  }
  return nextResolve(specifier, context);
}});
const { createScope } = await import(`${gmSource}index.ts`);
const Effect = await import('./research-layers/effect/packages/effect/src/Effect.ts');
const Layer = await import('./research-layers/effect/packages/effect/src/Layer.ts');
const ManagedRuntime = await import('./research-layers/effect/packages/effect/src/ManagedRuntime.ts');
async function probe(memoized) {
  let finalizerCalls = 0;
  let firstDisposal;
  const failure = new Error('probe-finalizer-failed');
  const scope = createScope({ name: memoized ? 'memoized' : 'naive' });
  const runtime = await scope.resources.setup({
    name: 'effect-runtime',
    setup: () => ManagedRuntime.make(Layer.effectDiscard(Effect.addFinalizer(() => Effect.sync(() => {
      finalizerCalls += 1;
      throw failure;
    })))),
    cleanup: runtime => {
      if (!memoized) return runtime.dispose();
      return firstDisposal ??= runtime.dispose();
    }
  });
  await runtime.runPromise(Effect.void);
  const summarize = report => ({ complete: report.complete, settled: report.settled, debts: report.debts.length,
    originalCause: report.debts.some(debt => debt.state === 'failed' && debt.cause === failure) });
  const first = summarize(await scope.control.close());
  const second = summarize(await scope.control.close());
  assert.equal(first.complete, false);
  assert.equal(first.originalCause, true);
  assert.equal(second.complete, !memoized);
  assert.equal(second.originalCause, memoized);
  assert.equal(finalizerCalls, 1);
  return { first, second, finalizerCalls };
}
console.log(JSON.stringify({ node: process.version, naive: await probe(false), memoized: await probe(true) }));
JS
```

Observed output:

```json
{"node":"v24.22.1","naive":{"first":{"complete":false,"settled":true,"debts":1,"originalCause":true},"second":{"complete":true,"settled":true,"debts":0,"originalCause":false},"finalizerCalls":1},"memoized":{"first":{"complete":false,"settled":true,"debts":1,"originalCause":true},"second":{"complete":false,"settled":true,"debts":1,"originalCause":true},"finalizerCalls":1}}
```
