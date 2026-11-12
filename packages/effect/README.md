# Get Modular + Effect

Native Effect construction for a verified Get Modular composition. GM selects
modules and their exact local bindings; Effect builds and finalizes their native
resources. The application owns the work using those resources.

**Availability: implementation candidate, not an npm release.** This package is
qualified against **Effect 4.1.4**. Its source version `0.0.0` is a candidate marker;
use matched local archives until the coordinated Core/Assembly 0.8.0 and Effect
0.1.0 release is admitted. Released Assembly 0.7.1 lacks the preparation exports
this candidate needs. Installing this candidate beside that released archive is
unsupported. Ordinary Core/Assembly users need no Effect installation or migration.

Read [Effect integration practices](docs/practices.md) before using this package.
That is the single guide to ownership, errors, cancellation, streams, module
boundaries, testing and lessons from OpenCode. The repository's agent instructions
and `.github` route to the same document; it is included in the package archive.

## Public API

Import declarations, contracts and binding helpers from the existing public
Core/Assembly roots. Import native `implement`, `group`, `entriesOf`, `effectFor`
and optional `input` from `@get-modular/effect`. Native entries are deliberately
distinct from Promise entries; `assemblyFor` and Promise Conformance execution
reject them.

```ts
import { declareModule, defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { effectFor, implement } from "@get-modular/effect";
import { Context, Effect } from "effect";

interface Store { readonly get: Effect.Effect<string> }
const StorePort = defineContract<Store>()({ id: "example/store", revision: 1 });
interface Ports extends CapabilitiesOf<typeof StorePort> {}
const owner = { authority: "example", path: ["app"] };

const store = implement<Ports>()(declareModule({
  moduleId: "example/store", implementationId: "example/store/memory", owner,
  provides: [StorePort.provide()], slots: [],
}), () => Effect.sync(() => {
  const value: Store = { get: Effect.succeed("hello") };
  return { instance: value, capabilities: { [StorePort.id]: value } };
}));

const app = implement<Ports>()(declareModule({
  moduleId: "example/app", implementationId: "example/app/default", owner,
  provides: [], slots: [StorePort.slot("store", required())],
}), ({ store }) => Effect.succeed({ instance: store, capabilities: {} }));

class Roots extends Context.Service<Roots, { readonly app: Store }>()("example/Roots") {}
const result = await effectFor<Ports>().prepare({
  profileId: "example/default", modules: [store, app], roots: { app },
});
if (result.status !== "prepared") throw new Error("Invalid composition");

const program = Effect.flatMap(Roots, roots => roots.app.get);
const text = await Effect.runPromise(
  Effect.provide(program, result.prepared.layer(Roots)),
);
```

Execute the resource-using operation inside `Effect.provide`, as above. Returning
a service or lazy Stream and then consuming it after that scope closes does not
retain its resources. Resource-owning factories use native `Effect.acquireRelease`
or build [private resource Layers in the factory Scope](docs/practices.md#keep-private-resource-layers-in-the-factory-scope);
the integration adds no second disposer.

`prepare()` captures and verifies inert metadata. It returns the existing
discriminated preparation failures and never calls factories. It accepts a
`profileId` with normal optional/many/alternative `bindings`, or a matching
successful `composition`. Existing tuple, grouping and Core envelope limits apply.

`prepared.layer(Roots, { inputs })` returns a real native Layer. Construction
errors `E` and ambient requirements `R` come from the selected typed inventory;
the Layer supplies construction `Scope` internally. Operation errors and request
requirements inside returned services stay on those operations. Invalid input
records fail through typed `InvalidInputs` before factory acquisition. Expected
factory failures, defects and interruption retain native Effect semantics; there
is no Promise created-journal or automatic cleanup-debt retry contract.

Each `.layer()` call captures its own input records and creates fresh mapper
Layer identities. Reuse the returned Layer when sharing within a native build is
intentional. Within that graph, a diamond shares one selected provider while two
slots can select different implementations of the same capability. Independent
providers may acquire concurrently; root listing order is not a startup protocol.

## Inputs, variants and application ownership

`input<C>()(declaration)` describes a borrowed capability boundary. A preparation
with declared inputs requires all corresponding values at `.layer()` invocation.
Only record shape is captured; borrowed objects keep their identity and owner.
Their owner must outlive the graph and all work using them.

Use a typed live/fake inventory before preparation to replace a GM provider and
omit its old private dependencies. Use ordinary native provision for explicit
ambient requirements. A merged fake Layer cannot rewrite an already closed GM
binding. Shared application resources with local sessions and explicit startup
ordering are application recipes in the guide, not a cache or lifecycle runtime.

## Compatibility and migration

- Native consumers opt in; ordinary `assemblyFor().prepare().run()` signatures,
  context adapters and inference stay intact.
- Converting a module means choosing a native factory and migrating its resource
  and error contract explicitly. Do not wrap Promise Assembly `run()` and assume
  it recovers typed native construction.
- Private native services and request/tracing context can remain Effect-native.
  Inter-module business dependencies use declared GM slots. Pure domain code and
  replaceable neutral ports need no Effect types.
- The runtime source has no Node builtin imports. Declaration qualification uses
  TypeScript 7.0.2 or newer, NodeNext and Bundler resolution, and `ES2024`,
  `ESNext.Disposable`, `ESNext.Promise`, `DOM` libraries with no Node ambient types.
  Platform adapters remain application-owned.

The [accepted decision](https://github.com/agent-teams-ai/get-modular/blob/main/docs/decisions/0043-plan-optional-native-effect-composition.md)
owns package admission. The
[implementation plan and evidence](https://github.com/agent-teams-ai/get-modular/blob/main/research/effect-integration-2026-11/README.md)
separate package qualification from a future named product's adoption. The public
archive test executes the resource, failure, interruption and stream scenarios
through installed package roots; that test Host is not a production application.
