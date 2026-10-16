---
id: GUIDE-MODULE-AUTHORING
type: architecture
status: active
owner: architecture
summary: How to add and grow features and Get Modular modules in the Consumer Module Standard layout, with compiled examples.
related:
  - ARCH-COMMON-ASSEMBLY
  - ADR-0036
  - ADR-0037
---

# Module authoring guide

## 0. How to use this guide; rules at a glance

This guide is for agents and people who write or review features and Get Modular
modules. The [Consumer Module Standard](../architecture/common-assembly.md#consumer-module-standard)
(the CMS) holds the normative rules; this guide holds the how-to and repeats a rule
only as a one-line summary with a link. Pin both at the same commit. Where they
differ, the CMS wins and the guide has a bug.

Every complete example below is compiled by `tests/assembly/consumer-standard-examples.test.mjs`
on both supported compilers and both module resolutions, so the code is what you
should copy. The example project has the features `infra`, `orders` and `billing`;
`orders` has the sub-feature `discounts`. `orders` `checkout` uses `Discounts`
(downward), `discounts` uses `OrderLines` from `orders` (upward), and `billing`
uses `Discounts` through the republication in `orders.contracts.ts`. Identities use
`acme/...`.

| I want to | Section |
| --- | --- |
| understand the model and where files go | 1 |
| start a feature or decide on a sub-feature | 2 |
| add a module | 3 |
| write a declaration, inputs or two implementations | 4 |
| use another feature | 5 |
| build a port | 6, 10 |
| write a use case or domain rule | 7 |
| split a growing feature | 8 |
| release resources | 9 |
| write a fake or a contract suite | 11 |
| bind an optional, `many` or ambiguous slot | 12 |
| list modules in groups and the root | 13 |
| pass per-run data or a Host singleton | 14 |
| read an error | 15 |
| change a contract or upgrade Get Modular | 16 |
| test a module, a feature or a root | 17 |
| check what I must not do | 19 |

The rules of the consumer `AGENTS.md` block, each with its CMS rule and the section
that shows it:

1. Feature layout, sub-features private to the parent: [layout](../architecture/common-assembly.md#feature-layout-and-implementation-form), sections 1 and 8.
2. Use cases take port types; only `composition/` and tests import Get Modular: [layout](../architecture/common-assembly.md#feature-layout-and-implementation-form), section 7.
3. A module is a declaration file and a module file: [packages](../architecture/common-assembly.md#module-packages-and-contracts), sections 3 and 4.
4. Ports are factory functions; `smoke` and `isolate` fail on prototype methods: [testing rule 7](../architecture/common-assembly.md#testing-modules), sections 6 and 10.
5. Port types are function-typed properties; change a contract in place: [contracts](../architecture/common-assembly.md#module-packages-and-contracts), section 16.
6. One group line per module, the root lists feature groups, use only visible features: [groups](../architecture/common-assembly.md#feature-groups), sections 5 and 13.
7. One oracle line per provided capability, rows for non-completed slots: [testing rule 6](../architecture/common-assembly.md#testing-modules), sections 12 and 17.
8. The feature card and the split recipes: sections 2 and 8.
9. The forbidden list and codemod upgrades: sections 16 and 19.

## 1. The model: features as LEGO bricks

The goal in five lines: features are independent bricks; they connect only through
contracts; each is tested alone with the fakes of its contract owners; a brick can
be replaced by another that passes the contract suite; and the root only assembles
feature groups.

The artifacts and who owns them:

| Artifact | What it is | Owner |
| --- | --- | --- |
| port type | function-typed properties describing one capability | the contract owner |
| descriptor and feature map | `defineContract` value and the interface that lists a feature's capabilities | the contract owner, in `composition/<feature>.contracts.ts` |
| declaration | `declareModule` value: provides and slots | the module, in `<module>.declaration.ts` |
| module entry | `implement` value made with a factory | the module, in `<module>.module.ts` |
| feature group | `group` value listing the feature's entries and sub-feature groups | the feature, in `<feature>.group.ts` |
| input | a slot-free declaration whose value each run supplies | the feature that needs it |
| root | a function of `Assembly` that lists feature groups | the Host composition |
| oracle part | hand-written pins and rows | the feature's tests |
| fake and suite | a typed fake and `contractSuite` | the contract owner, in `testing.ts` |

The tree of the example project (feature roles from the Feature Module Standard; a
sub-feature has the same layout under `features/`, to any depth):

```text
src/
  composition/root.ts
  features/
    infra/        contracts/ adapters/outbound/ composition/
    billing/      contracts/ application/{ports,use-cases}/ composition/
    orders/
      contracts/ application/{ports,use-cases}/ composition/
      features/
        discounts/   contracts/ domain/ application/{ports,use-cases}/ composition/
tests/
  features/<path mirrors src/features>/   (wiring parts, testing.ts, tests)
  module/root.test.ts
```

What each file may import, who may see whom, and what checks it:

| File | May import | Checked by |
| --- | --- | --- |
| `contracts/`, `domain/`, `application/`, `adapters/` | no `@get-modular/*`; `application/` and `domain/` not even `contracts/` | oxlint, `checkModuleLayout` |
| `composition/<m>.declaration.ts` | `declareModule`, cardinality helpers, descriptor files | oxlint, `checkModuleLayout` |
| `composition/<m>.module.ts` | `implement`, its declaration, its use cases, ports, its own map | oxlint size limit, review |
| `composition/<f>.contracts.ts` | `defineContract` and port types | review |
| tests | their own code, `testing.ts` of features they may see, Get Modular | review |

A feature may see its own sub-features (downward), its ancestors (upward) and the
siblings of itself and of its ancestors (lateral). A sub-feature is private to its
parent: outsiders use the parent's republication. Downward and lateral edges must
stay acyclic. The shared checks are wired by the consumer, never copied from a
script: the Feature Module Standard package or the consumer's own checker for
feature edges, the Engineering Foundation baseline and size budgets, and
`checkModuleLayout` from `@get-modular/conformance` for the Get Modular rules
(orphan modules, group trees, descriptor paths, use-case exports). The oxlint rules
are the snippet in the CMS; the preset is not shipped.

The root of the example (all of it in `composition/`):

<!-- module-authoring-example: project -->

```ts
// src/composition/root.ts
import type { Assembly } from "@get-modular/assembly";
import { billingGroup } from "../features/billing/composition/billing.group.js";
import { invoicingModule } from "../features/billing/composition/invoicing.module.js";
import type { BillingCapabilities } from "../features/billing/composition/billing.contracts.js";
import { infraGroup } from "../features/infra/composition/infra.group.js";
import type { InfraCapabilities } from "../features/infra/composition/infra.contracts.js";
import { checkoutModule } from "../features/orders/composition/checkout.module.js";
import type { OrdersCapabilities } from "../features/orders/composition/orders.contracts.js";
import { ordersGroup } from "../features/orders/composition/orders.group.js";

// The root map extends the maps of the top-level features, one member per line.
export interface AcmeCapabilities extends
  BillingCapabilities,
  InfraCapabilities,
  OrdersCapabilities {}

// Top-level feature groups, sorted, and the root's own entries: nothing else, nothing conditional.
export const acmeModules = [
  billingGroup,
  infraGroup,
  ordersGroup,
] as const;

export function composeAcme(api: Assembly<AcmeCapabilities>) {
  return api.prepare({
    profileId: "acme/production",
    modules: acmeModules,
    roots: { invoices: invoicingModule, orders: checkoutModule },
  });
}
```


## 2. Designing a feature

A feature is a cohesive capability, never one per class or endpoint. A module is a
composition seam: a separately replaceable capability, own resources or own
lifecycle; the CMS says a parser, mapper or class is not a graph node merely because
it is new. A use case is one operation. Publish the contracts others need and keep
the rest as ports of your own `application/ports/`.

Identities follow the [CMS rules](../architecture/common-assembly.md#identity-and-namespaces):
`<product>/<context>/<name>`, and `<product>/<feature>/<sub-feature>/<name>` for a
module created in a sub-feature.

Top-level feature or sub-feature? A package is a unit of reuse and distribution; a
feature at any depth is a unit of meaning and ownership. Nest a tightly bound part
that moves with its parent; keep independent parts as siblings.

Write the feature card in the feature's `README.md` when you create it and update it
with each module:

```markdown
# orders

Parent: none
Purpose: take an order from basket to a priced receipt.
Provides: acme/orders/orders, acme/orders/order-lines
Uses: acme/infra/clock (infra), acme/orders/discounts/discounts (own sub-feature)
Modules: checkout, order-lines
Sub-features: discounts
Split signals: none yet (2 modules, 1 use case)
```

```markdown
# discounts

Parent: orders
Purpose: price an order after discounts for its size.
Provides: acme/orders/discounts/discounts
Uses: acme/orders/order-lines (parent, upward)
Modules: pricing
Sub-features: none
Split signals: none yet (1 module, 1 use case)
```

The first module is the one that provides the feature's main capability; add it by
the steps of the next section.

## 3. Add a new module

1. Pick the identities: `moduleId`, `implementationId`, the owner path.
2. Write the port type in `contracts/` when the module provides a new capability,
   and the descriptor in `composition/<feature>.contracts.ts`.
3. Write the use case in `application/use-cases/<verb-noun>.ts`, with pure rules in
   `domain/`, typed with ports from `application/ports/`.
4. Write `<module>.declaration.ts`.
5. Write `<module>.module.ts`: map ports to use cases, `implement` the entry.
6. Write the `isolate` test.
7. Add one line to `<feature>.group.ts`.
8. Add one pin to the oracle part, and one row when a slot is not completed.
9. Run typecheck, lint, the layout checks, then `smoke`, `checkWiring` and `checkNamespaces`.

The example is `orders` `checkout`. Its use case and the ports it needs:

<!-- module-authoring-example: project -->

```ts
// src/features/orders/application/ports/clock.ts
export type ClockForCheckout = { readonly now: () => number };
```

```ts
// src/features/orders/application/ports/discounts.ts
export type DiscountsForCheckout = { readonly priceFor: (orderId: string, cents: number) => number };
```

```ts
// src/features/orders/application/use-cases/checkout-order.ts
import type { ClockForCheckout } from "../ports/clock.js";
import type { DiscountsForCheckout } from "../ports/discounts.js";

export type CheckoutOrderDeps = { readonly discounts: DiscountsForCheckout; readonly clock: ClockForCheckout };
export type CheckoutOrderInput = { readonly orderId: string; readonly cents: number };

export function checkoutOrder(deps: CheckoutOrderDeps, input: CheckoutOrderInput) {
  return { total: deps.discounts.priceFor(input.orderId, input.cents), at: deps.clock.now() };
}
```

```ts
// src/features/orders/contracts/orders.ts
export type Receipt = { readonly total: number; readonly at: number };
export type OrdersPort = { readonly checkout: (orderId: string, cents: number) => Receipt };
```


The declaration and the module (about 20 lines; the module file may hold only wiring):

<!-- module-authoring-example: project -->

```ts
// src/features/orders/composition/checkout.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Clock } from "../../infra/composition/infra.contracts.js";
import { Discounts, Orders } from "./orders.contracts.js";

export const checkoutDeclaration = declareModule({
  moduleId: "acme/orders/checkout", implementationId: "acme/orders/checkout/default",
  owner: { authority: "acme", path: ["orders"] },
  provides: [Orders.provide()],
  slots: [Clock.slot("clock", required()), Discounts.slot("discounts", required())],
});
```

```ts
// src/features/orders/composition/checkout.module.ts
import { implement } from "@get-modular/assembly";
import { checkoutOrder } from "../application/use-cases/checkout-order.js";
import type { OrdersPort } from "../contracts/orders.js";
import { checkoutDeclaration } from "./checkout.declaration.js";
import type { OrdersCapabilities } from "./orders.contracts.js";

export const checkoutModule = implement<OrdersCapabilities>()(checkoutDeclaration, async (deps) => {
  const port: OrdersPort = {
    checkout: (orderId, cents) => checkoutOrder(deps, { orderId, cents }),
  };
  return { instance: port, capabilities: { "acme/orders/orders": port } };
});
```


Its `isolate` test builds the module exactly as production does and passes typed
fakes:

<!-- module-authoring-example: project -->

```ts
// tests/features/orders/checkout.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isolate } from "@get-modular/conformance";
import { checkoutModule } from "../../../src/features/orders/composition/checkout.module.js";
import { createClockFake } from "../infra/testing.js";

test("checkout prices through discounts and stamps the time", async () => {
  // Fakes are typed values: the contract owner's fake and a plain object for a port.
  await using orders = await isolate(checkoutModule, {
    dependencies: { clock: createClockFake(42), discounts: { priceFor: (_orderId, cents) => cents - 1 } },
  });
  assert.deepEqual(orders.capabilities["acme/orders/orders"].checkout("o1", 100), { total: 99, at: 42 });
});
```


The group and the oracle part each gain a line:

```diff
 export const ordersGroup = group("orders", [
+  checkoutModule,
   discountsGroup,
   orderLinesModule,
 ]);
```

```diff
   providers: {
     "acme/orders/order-lines": "acme/orders/order-lines/memory",
+    "acme/orders/orders": "acme/orders/checkout/default",
   },
```

Checklist: identities; port; use case; declaration; module; `isolate` test; group
line; oracle pin; `checkNamespaces`; `smoke`.

## 4. Declarations

A declaration file imports only `declareModule`, the cardinality helpers and
contract descriptors, and holds only the declaration. It stays inert (no side
effects), so a selected declaration can be admitted without loading its
implementation ([ADR-0029](../decisions/0029-admit-an-optional-lifecycle-kernel-candidate.md))
and a later plugin manifest can be generated from these files.

One provide and several provides are both fine; each provided capability gets one
pin in the oracle. Two implementations of one contract have distinct
`implementationId`s; a `bindings` row in the root chooses between them for each
consumer (section 12), or two roots install one each. Both implementations pass the
contract owner's suite (section 11). The example declares a postgres store and a
memory store:

<!-- module-authoring-example: bind -->

```ts
// src/features/reports/composition/store-postgres.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { Store } from "./reports.contracts.js";

// Two implementations of one contract: one implementationId each, the same capability.
export const storePostgresDeclaration = declareModule({
  moduleId: "acme/reports/store-postgres", implementationId: "acme/reports/store-postgres/default",
  owner: { authority: "acme", path: ["reports"] },
  provides: [Store.provide()], slots: [],
});
```

```ts
// src/features/reports/composition/store-memory.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { Store } from "./reports.contracts.js";

// Two implementations of one contract: one implementationId each, the same capability.
export const storeMemoryDeclaration = declareModule({
  moduleId: "acme/reports/store-memory", implementationId: "acme/reports/store-memory/default",
  owner: { authority: "acme", path: ["reports"] },
  provides: [Store.provide()], slots: [],
});
```


An input is a declaration without slots, in its own file; its entry lives in
`<feature>.inputs.ts` (section 14):

<!-- module-authoring-example: inputs -->

```ts
// src/features/sessions/composition/session-id.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { SessionId } from "./sessions.contracts.js";

// An input declares no slots and provides one capability; each run supplies its value.
export const sessionIdDeclaration = declareModule({
  moduleId: "acme/sessions/session-id", implementationId: "acme/sessions/session-id/input",
  owner: { authority: "acme", path: ["sessions"] },
  provides: [SessionId.provide()], slots: [],
});
```

```ts
// src/features/sessions/composition/sessions.inputs.ts
import { input } from "@get-modular/assembly";
import { sessionIdDeclaration } from "./session-id.declaration.js";
import type { SessionsCapabilities } from "./sessions.contracts.js";

// Input entries are listed in the root's `inputs`, never in a group.
export const sessionIdInput = input<SessionsCapabilities>()(sessionIdDeclaration);
```


Variants from one spec may share a file when they differ only by values.

## 5. Cross-feature slots

Only through contracts. The declaration imports the other feature's
`<feature>.contracts.ts`; the feature map extends that descriptor's map; the use
case types `deps` with its own port in `application/ports/`, which the other
feature's port satisfies structurally, so application code never imports another
feature. Never import another feature's modules, groups, use cases or adapters.
The root lists both groups. Maps that disagree on a contract fail with TS2320. No
feature cycles (the Feature Module Standard), and Core rejects cyclic modules.
A declaration imports only composition contracts; domain and application code never
do. Where a consumer's checker forbids importing another feature's `composition/`
(Agent Runtime until its checker adds the declared composition entrypoint), the
descriptor is Host-level.

Infra owns the clock; `orders` uses it. The descriptor and the feature map are
public to features that may see infra:

<!-- module-authoring-example: project -->

```ts
// src/features/infra/contracts/clock.ts
export type ClockPort = { readonly now: () => number };
```

```ts
// src/features/infra/composition/infra.contracts.ts
import { defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import type { ClockPort } from "../contracts/clock.js";

export const Clock = defineContract<ClockPort>()({ id: "acme/infra/clock", revision: 1 });
export interface InfraCapabilities extends CapabilitiesOf<typeof Clock> {}
```


Visible features and the paths of their descriptors from `orders` `discounts`:
`../../../composition/orders.contracts.js` for the parent (upward),
`../../../../infra/composition/infra.contracts.js` for an ancestor's sibling,
and from `orders`, `../features/discounts/composition/discounts.contracts.js` for
its own sub-feature (downward). A sibling of the feature itself is reached as
`../../<sibling>/composition/<sibling>.contracts.js`.

`orders` and `discounts` use each other, downward and upward. The parent's file
holds the descriptors, republishes `Discounts`, and its map extends the sub-feature's
map with `import type`. The sub-feature references the parent's `OrderLines` with a
type-only import in its contracts file, so no load-time import cycle crosses the
features; its declaration imports the value.

<!-- module-authoring-example: project -->

```ts
// src/features/orders/composition/orders.contracts.ts
import { defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import type { InfraCapabilities } from "../../infra/composition/infra.contracts.js";
import type { DiscountsCapabilities } from "../features/discounts/composition/discounts.contracts.js";
import type { OrderLinesPort } from "../contracts/order-lines.js";
import type { OrdersPort } from "../contracts/orders.js";

// The parent republishes what code outside the feature may use from its private sub-feature.
export { Discounts } from "../features/discounts/composition/discounts.contracts.js";
export const OrderLines = defineContract<OrderLinesPort>()({ id: "acme/orders/order-lines", revision: 1 });
export const Orders = defineContract<OrdersPort>()({ id: "acme/orders/orders", revision: 1 });
export interface OrdersCapabilities extends
  DiscountsCapabilities,
  InfraCapabilities,
  CapabilitiesOf<typeof OrderLines | typeof Orders> {}
```

```ts
// src/features/orders/features/discounts/composition/discounts.contracts.ts
import { defineContract, type CapabilitiesOf } from "@get-modular/assembly";
// Upward use of the parent's contract: a type-only reference, so no load-time cycle with the parent.
import type { OrderLines } from "../../../composition/orders.contracts.js";
import type { DiscountsPort } from "../contracts/discounts.js";

export const Discounts = defineContract<DiscountsPort>()({ id: "acme/orders/discounts/discounts", revision: 1 });
export interface DiscountsCapabilities extends CapabilitiesOf<typeof Discounts | typeof OrderLines> {}
```

```ts
// src/features/orders/features/discounts/composition/pricing.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { OrderLines } from "../../../composition/orders.contracts.js";
import { Discounts } from "./discounts.contracts.js";

export const pricingDeclaration = declareModule({
  moduleId: "acme/orders/discounts/pricing", implementationId: "acme/orders/discounts/pricing/default",
  owner: { authority: "acme", path: ["orders", "discounts"] },
  provides: [Discounts.provide()], slots: [OrderLines.slot("lines", required())],
});
```

```ts
// src/features/orders/contracts/order-lines.ts
export type OrderLinesPort = { readonly count: (orderId: string) => number };
```

```ts
// src/features/orders/composition/order-lines.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { OrderLines } from "./orders.contracts.js";

export const orderLinesDeclaration = declareModule({
  moduleId: "acme/orders/order-lines", implementationId: "acme/orders/order-lines/memory",
  owner: { authority: "acme", path: ["orders"] },
  provides: [OrderLines.provide()], slots: [],
});
```

```ts
// src/features/orders/composition/order-lines.module.ts
import { implement } from "@get-modular/assembly";
import type { OrderLinesPort } from "../contracts/order-lines.js";
import { orderLinesDeclaration } from "./order-lines.declaration.js";
import type { OrdersCapabilities } from "./orders.contracts.js";

export const orderLinesModule = implement<OrdersCapabilities>()(orderLinesDeclaration, async () => {
  const lines = new Map<string, number>();
  const port: OrderLinesPort = { count: (orderId) => lines.get(orderId) ?? 0 };
  return { instance: port, capabilities: { "acme/orders/order-lines": port } };
});
```


A sub-feature is private. Code outside its parent uses the parent's republication
(`export { Discounts } from '../features/discounts/composition/discounts.contracts.js'`),
one level at a time. Downward and lateral edges must stay acyclic, type-only
references included; an upward use never counts. No load-time import cycle may cross
features. `billing` uses `Discounts` through that republication:

<!-- module-authoring-example: project -->

```ts
// src/features/billing/contracts/invoices.ts
export type InvoicesPort = { readonly issue: (orderId: string, cents: number) => string };
```

```ts
// src/features/billing/composition/billing.contracts.ts
import { defineContract, type CapabilitiesOf } from "@get-modular/assembly";
// Billing sees Discounts only through the republication of its parent feature.
import type { Discounts } from "../../orders/composition/orders.contracts.js";
import type { InvoicesPort } from "../contracts/invoices.js";

export const Invoices = defineContract<InvoicesPort>()({ id: "acme/billing/invoices", revision: 1 });
export interface BillingCapabilities extends CapabilitiesOf<typeof Invoices | typeof Discounts> {}
```

```ts
// src/features/billing/composition/invoicing.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Discounts } from "../../orders/composition/orders.contracts.js";
import { Invoices } from "./billing.contracts.js";

export const invoicingDeclaration = declareModule({
  moduleId: "acme/billing/invoicing", implementationId: "acme/billing/invoicing/default",
  owner: { authority: "acme", path: ["billing"] },
  provides: [Invoices.provide()], slots: [Discounts.slot("discounts", required())],
});
```


## 6. Ports as factory functions

The official form of a port is an object of arrow functions built by a factory
function: there is no `this`, members survive destructuring, closures hold state,
the own-property check passes, and function-typed properties are checked
contravariantly. `<module>.module.ts` builds the port from use cases
(`{ apply: (input) => applyDiscount(deps, input) }`); a member may stay inline only
as a one-expression forward without a branch.

<!-- module-authoring-example: project -->

```ts
// src/features/infra/adapters/outbound/system-clock.ts
import type { ClockPort } from "../../contracts/clock.js";

export function createSystemClock(): ClockPort {
  return { now: () => Date.now() };
}
```

```ts
// src/features/infra/composition/clock.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { Clock } from "./infra.contracts.js";

export const clockDeclaration = declareModule({
  moduleId: "acme/infra/clock", implementationId: "acme/infra/clock/system",
  owner: { authority: "acme", path: ["infra"] },
  provides: [Clock.provide()], slots: [],
});
```

```ts
// src/features/infra/composition/clock.module.ts
import { implement } from "@get-modular/assembly";
import { createSystemClock } from "../adapters/outbound/system-clock.js";
import { clockDeclaration } from "./clock.declaration.js";
import type { InfraCapabilities } from "./infra.contracts.js";

export const clockModule = implement<InfraCapabilities>()(clockDeclaration, async () => {
  const clock = createSystemClock();
  return { instance: clock, capabilities: { "acme/infra/clock": clock } };
});
```


The contrast is a class with prototype methods:

```text
class SystemClock {
  now() { return Date.now(); }          // prototype method: `const { now } = clock` loses `this`,
}                                       // and smoke / isolate fail with conformance.ports.prototype-member
```

<!-- VERIFY(P1b part 2): the check described in the CMS testing rule 7 and in section 10; confirm against the merged code before this PR merges -->

The check walks the prototype chain of each capability a module returns and fails
on a function or accessor that lives on a prototype. It does not see an
object-literal method that uses `this`, a method extracted unbound as a capability,
nested objects, run inputs (your fakes) or a `Map`; those remain review rules.

## 7. Use cases and pure logic

A use case has the signature `(deps, input) => result`. `deps` is a narrow record of
port types and the module's own resources, never the whole dependency record or a
Get Modular type. It imports only its own `application/ports/` types, other files of
its own `application/` and its own `domain/`, and never `contracts/`, not even its
own feature's (Feature Module Standard v1: "Domain and application code MUST NOT
import public transport contracts"); the module file maps contract port types to the
use case's ports. One exported function per file, named `<verb-noun>`. Domain rules
are deterministic, with time, ids and randomness passed in; nothing in
`application/` or `domain/` imports Get Modular.

<!-- module-authoring-example: project -->

```ts
// src/features/orders/features/discounts/domain/discount-rules.ts
// Pure and deterministic: no clock, no randomness, no Get Modular.
export function discountPercent(lineCount: number): number {
  return lineCount >= 10 ? 10 : lineCount >= 5 ? 5 : 0;
}
```

```ts
// src/features/orders/features/discounts/application/ports/order-lines.ts
export type LinesForDiscounts = { readonly count: (orderId: string) => number };
```

```ts
// src/features/orders/features/discounts/application/use-cases/apply-discount.ts
import { discountPercent } from "../../domain/discount-rules.js";
import type { LinesForDiscounts } from "../ports/order-lines.js";

export type ApplyDiscountDeps = { readonly lines: LinesForDiscounts };
export type ApplyDiscountInput = { readonly orderId: string; readonly cents: number };

export function applyDiscount(deps: ApplyDiscountDeps, input: ApplyDiscountInput): number {
  const percent = discountPercent(deps.lines.count(input.orderId));
  return input.cents - Math.floor((input.cents * percent) / 100);
}
```

```ts
// src/features/orders/features/discounts/contracts/discounts.ts
export type DiscountsPort = { readonly priceFor: (orderId: string, cents: number) => number };
```

```ts
// src/features/orders/features/discounts/composition/pricing.module.ts
import { implement } from "@get-modular/assembly";
import { applyDiscount } from "../application/use-cases/apply-discount.js";
import type { DiscountsPort } from "../contracts/discounts.js";
import type { DiscountsCapabilities } from "./discounts.contracts.js";
import { pricingDeclaration } from "./pricing.declaration.js";

export const pricingModule = implement<DiscountsCapabilities>()(pricingDeclaration, async (deps) => {
  const port: DiscountsPort = {
    priceFor: (orderId, cents) => applyDiscount(deps, { orderId, cents }),
  };
  return { instance: port, capabilities: { "acme/orders/discounts/discounts": port } };
});
```


Unit tests use plain object fakes and no Get Modular:

<!-- module-authoring-example: project -->

```ts
// tests/features/orders/features/discounts/apply-discount.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDiscount } from "../../../../../src/features/orders/features/discounts/application/use-cases/apply-discount.js";

// A use case is a plain function: a plain fake, no Get Modular.
test("ten lines earn ten percent", () => {
  assert.equal(applyDiscount({ lines: { count: () => 10 } }, { orderId: "o1", cents: 1000 }), 900);
});
```


`billing` follows the same shape for its invoice use case:

<!-- module-authoring-example: project -->

```ts
// src/features/billing/application/ports/discounts.ts
export type DiscountsForInvoices = { readonly priceFor: (orderId: string, cents: number) => number };
```

```ts
// src/features/billing/application/use-cases/issue-invoice.ts
import type { DiscountsForInvoices } from "../ports/discounts.js";

export type IssueInvoiceDeps = { readonly discounts: DiscountsForInvoices };

export function issueInvoice(deps: IssueInvoiceDeps, input: { readonly orderId: string; readonly cents: number }): string {
  return `${input.orderId}:${String(deps.discounts.priceFor(input.orderId, input.cents))}`;
}
```

```ts
// src/features/billing/composition/invoicing.module.ts
import { implement } from "@get-modular/assembly";
import { issueInvoice } from "../application/use-cases/issue-invoice.js";
import type { InvoicesPort } from "../contracts/invoices.js";
import type { BillingCapabilities } from "./billing.contracts.js";
import { invoicingDeclaration } from "./invoicing.declaration.js";

export const invoicingModule = implement<BillingCapabilities>()(invoicingDeclaration, async (deps) => {
  const port: InvoicesPort = { issue: (orderId, cents) => issueInvoice(deps, { orderId, cents }) };
  return { instance: port, capabilities: { "acme/billing/invoices": port } };
});
```


## 8. When and how to split

Inside a module first: more use-case files. A port of more than about 7 members, or
members that change for different reasons, is split into modules only at a real
composition seam (a separately replaceable capability, own resources or own
lifecycle).

Then the feature. The split signals are about 12 modules in `composition/`, about 20
use cases, two aggregates with independent invariants or lifecycles, parts that
change for different reasons, and depth over 3; the numbers are consumer policy, and
the layout checks print a growth report.

Choose the recipe by the part, not by size. Tightly bound (it uses the feature's
contracts or shares its aggregate or lifecycle, and nobody outside the feature uses
it directly): recipe A. Independent (other features use it directly, or it changes
for its own reasons and needs nothing internal): recipe B. Past depth 3 prefer B.

Recipe A, extract a sub-feature:

1. Write the seam into the feature card.
2. Create `features/<feature>/features/<part>/` with its README card (`Parent: <feature>`).
3. Move the part's port types to `<part>/contracts/` and its descriptors to
   `<part>/composition/<part>.contracts.ts`, keeping every capability id and revision
   (ids name the semantic owner, not the directory).
4. Move the declaration, module, use-case, domain and adapter files, ids unchanged,
   and the tests to the mirrored test path.
5. Create `<part>.group.ts` and replace the moved lines in `<feature>.group.ts` with
   one `<part>` line; the root is unchanged.
6. The parent's map extends the part's map through `import type`.
7. Move the oracle pins to `<part>.wiring.ts` and add the part to the root test.
8. Code outside the feature that used a moved contract imports the feature's
   republication, which the feature adds to `<feature>.contracts.ts`.
9. Declare the sub-feature, its edges and any republication in the consumer's profile
   of the Feature Module Standard (Agent Runtime: profile, edges, decision; TEST: the
   configuration of the layout checks).

Recipe B, split into sibling features:

1. Write the seam into the feature card.
2. Create a sibling `<new>/` next to the feature (under `features/` at the top level,
   or in the parent's `features/` for a sub-feature) with its README card.
3. Move the contracts whose owner changes: port types to `<new>/contracts/` and
   descriptors to `<new>/composition/<new>.contracts.ts`, ids and revisions unchanged.
4. Move the declaration, module, use-case, domain, adapter and test files, ids unchanged.
5. Create `<new>.group.ts` and remove those lines from the old group.
6. Add one line to the root's `modules` (or to the parent's group for a sub-feature
   sibling) and one `extends` to the root map.
7. Move the oracle pins to `<new>.wiring.ts` and add the part to the root test.
8. Where the old feature still uses a moved capability, its declaration imports the
   new descriptor file (section 5), never the moved modules.
9. Register the new feature and its edge in the consumer's profile.

In both recipes the features outside change nothing but import paths, because they
depend on contracts; the plan's selections and rows stay the same, so `checkWiring`
passes with the same pins.

`orders` extracting `discounts` (A), before and after:

```text
before                                   after
orders/                                  orders/
  composition/                             composition/
    checkout.*  pricing.*                    checkout.*  orders.group.ts (lists discountsGroup)
    orders.group.ts                        features/discounts/
                                             composition/ pricing.*  discounts.group.ts
```

`orders` split into `orders` and `payment-intents` (B), before and after:

```text
before                                   after
features/orders/                         features/orders/
  composition/                             composition/
    checkout.* intents.*                     checkout.*  orders.group.ts
                                         features/payment-intents/
                                           composition/ intents.*  payment-intents.group.ts
```

## 9. Resources

A module owns something to release when it acquires it: a connection, a timer, a
subscription. It receives `resources` by passing `scoped` as the adapter of
`implement`; Assembly names the module scope by its implementation id. Acquire with
`resources.setup` (asynchronous acquisition and its cleanup) or hand a value you
already hold to `resources.use`; name every entry; never close a borrowed
dependency; give a child scope only ports whose setup completed; register the
disposer of a subscription in your own scope; running work is not a resource (drain
it before closing, or make each operation a `child()`). The thirteen rules are the
[CMS module author rules](../architecture/common-assembly.md#module-resource-scopes).

If `resources` is missing from the context, TypeScript reports TS2339 "Property
'resources' does not exist on type 'FactoryContext'": the adapter is missing.

A module that opens a client with `resources.setup` and registers a subscription
disposer:

<!-- module-authoring-example: resources -->

```ts
// src/features/infra/contracts/events.ts
export type EventsPort = { readonly subscribe: (listener: (orderId: string) => void) => () => void };
```

```ts
// src/features/infra/composition/infra.contracts.ts
import { defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import type { EventsPort } from "../contracts/events.js";

export const Events = defineContract<EventsPort>()({ id: "acme/infra/events", revision: 1 });
export interface InfraCapabilities extends CapabilitiesOf<typeof Events> {}
```

```ts
// src/features/orders/contracts/order-store.ts
export type OrderStorePort = { readonly find: (orderId: string) => Promise<string | undefined> };
```

```ts
// src/features/orders/composition/order-store.contracts.ts
import { defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import type { InfraCapabilities } from "../../infra/composition/infra.contracts.js";
import type { OrderStorePort } from "../contracts/order-store.js";

export const OrderStore = defineContract<OrderStorePort>()({ id: "acme/orders/order-store", revision: 1 });
export interface OrderStoreCapabilities extends
  InfraCapabilities,
  CapabilitiesOf<typeof OrderStore> {}
```

```ts
// src/features/orders/composition/order-store.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Events } from "../../infra/composition/infra.contracts.js";
import { OrderStore } from "./order-store.contracts.js";

export const orderStoreDeclaration = declareModule({
  moduleId: "acme/orders/order-store", implementationId: "acme/orders/order-store/postgres",
  owner: { authority: "acme", path: ["orders"] },
  provides: [OrderStore.provide()], slots: [Events.slot("events", required())],
});
```

```ts
// src/features/orders/composition/order-store.module.ts
import { implement } from "@get-modular/assembly";
import { scoped } from "@get-modular/resources";
import { PgOrders } from "../adapters/outbound/pg-orders.js";
import type { OrderStorePort } from "../contracts/order-store.js";
import type { OrderStoreCapabilities } from "./order-store.contracts.js";
import { orderStoreDeclaration } from "./order-store.declaration.js";

// `scoped` gives the factory `resources`; Assembly names the scope by the implementation id.
export const orderStoreModule = implement<OrderStoreCapabilities>()(orderStoreDeclaration,
  async (deps, { resources }) => {
    // The client is created inside `setup`, so a cancelled run stops it and cleanup closes it.
    const pg = await resources.setup({
      name: "pg",
      setup: ({ signal }) => PgOrders.create("postgres://orders", signal),
      cleanup: (client) => client.close(),
    });
    // The subscription lives in this module's scope: its disposer runs before the client closes.
    const stale = new Set<string>();
    resources.use({ [Symbol.dispose]: deps.events.subscribe((orderId) => { stale.add(orderId); }) }, "events");
    // Never pass the instance as the port: build it from the port members so `close` stays with the owner.
    const port: OrderStorePort = { find: (orderId) => stale.has(orderId) ? Promise.resolve(undefined) : pg.find(orderId) };
    return { instance: pg, capabilities: { "acme/orders/order-store": port } };
  }, scoped);
```


## 10. A stateful adapter as a class

A class is allowed for state with identity, an SDK or client wrapper, or a test fake
that tests inspect. It lives in `adapters/outbound/`, with arrow-function fields,
`#private` state, a private constructor and `static async create` for async setup.
Never pass the instance as the port: build a port object with only the port members,
so `close` stays with the owner. Wrap a legacy class adapter or a third-party client
the same way: construct it inside `resources.setup` and expose arrow functions.

<!-- module-authoring-example: resources -->

```ts
// src/features/orders/adapters/outbound/pg-orders.ts
// A stateful client wrapper is the one place a class is allowed: arrow-function fields, #private state,
// a private constructor and `static async create` for the async setup.
export class PgOrders {
  readonly #rows = new Map<string, string>();
  #closed = false;

  private constructor(readonly url: string) {}

  static async create(url: string, signal: AbortSignal): Promise<PgOrders> {
    signal.throwIfAborted();
    return new PgOrders(url); // a real client connects here
  }

  readonly find = async (orderId: string): Promise<string | undefined> => {
    return this.#closed ? undefined : this.#rows.get(orderId);
  };

  readonly close = async (): Promise<void> => {
    this.#closed = true;
  };
}
```


The module of section 9 creates `PgOrders` inside `resources.setup` and builds the
port from its fields. The check of section 6 would fail the module if it returned
the `PgOrders` instance with prototype methods as the capability.

## 11. Fakes and contract suites

The contract owner keeps one fake, one suite and, when others need it, a fake
module, in the feature test root's `testing.ts`; production never imports it. Fakes
are factory functions, or classes with arrow fields when tests inspect state, typed
by the port with no `any` or cast. `runContractSuite` runs the suite against the fake
and every implementation once two exist. Replacing an implementation means passing
the suite and changing one group line and one pin. Inside a `node:test` test, pass
`(name, body) => t.test(name, body)` as the registrar.

<!-- module-authoring-example: project -->

```ts
// tests/features/infra/testing.ts
import { contractSuite } from "@get-modular/conformance";
import assert from "node:assert/strict";
import type { ClockPort } from "../../../src/features/infra/contracts/clock.js";
import { Clock } from "../../../src/features/infra/composition/infra.contracts.js";

// The contract owner keeps one fake and one suite; production code never imports this file.
export function createClockFake(start: number): ClockPort & { advance: (ms: number) => void } {
  let now = start;
  return { now: () => now, advance: (ms) => { now += ms; } };
}

export const clockSuite = contractSuite(Clock, {
  "never goes backwards": async (clock) => {
    const first = clock.now();
    assert.ok(clock.now() >= first);
  },
});
```

```ts
// tests/features/infra/clock.test.ts
import { test } from "node:test";
import { runContractSuite } from "@get-modular/conformance";
import { createSystemClock } from "../../../src/features/infra/adapters/outbound/system-clock.js";
import { clockDeclaration } from "../../../src/features/infra/composition/clock.declaration.js";
import { clockSuite, createClockFake } from "./testing.js";

// Every implementation, the fake included, passes the owner's suite.
runContractSuite(clockSuite, { name: "system", declaration: clockDeclaration, create: async () => createSystemClock() }, test);
runContractSuite(clockSuite, { name: "fake", declaration: clockDeclaration, create: async () => createClockFake(1) }, test);
```


## 12. Optional, many and several providers: explicit bindings

Completion fills only `required` slots that have exactly one candidate. An
`optional` slot needs a row (`[]` or one provider); a `many` slot an ordered row;
two providers of one capability need a row for every consumer. The rows live in the
root's `prepare({ bindings })` and the same rows in the oracle part's `rows`.
Group-level bindings do not exist.

The root has two stores, no audit and two ordered filters:

<!-- module-authoring-example: bind -->

```ts
// src/features/reports/contracts/reports.ts
export type ReportsPort = { readonly render: (text: string) => Promise<string> };
export type StorePort = { readonly save: (text: string) => Promise<void> };
export type AuditPort = { readonly record: (line: string) => void };
export type FilterPort = { readonly apply: (text: string) => string };
```

```ts
// src/features/reports/composition/reports.contracts.ts
import { defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import type { AuditPort, FilterPort, ReportsPort, StorePort } from "../contracts/reports.js";

export const Reports = defineContract<ReportsPort>()({ id: "acme/reports/reports", revision: 1 });
export const Store = defineContract<StorePort>()({ id: "acme/reports/store", revision: 1 });
export const Audit = defineContract<AuditPort>()({ id: "acme/reports/audit", revision: 1 });
export const Filter = defineContract<FilterPort>()({ id: "acme/reports/filter", revision: 1 });
export interface ReportsCapabilities extends
  CapabilitiesOf<typeof Audit | typeof Filter | typeof Reports | typeof Store> {}
```

```ts
// src/features/reports/composition/render.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { many, optional, required } from "@get-modular/core";
import { Audit, Filter, Reports, Store } from "./reports.contracts.js";

// `required` is filled by completion when one module provides it; `optional` and `many` always need a row.
export const renderDeclaration = declareModule({
  moduleId: "acme/reports/render", implementationId: "acme/reports/render/default",
  owner: { authority: "acme", path: ["reports"] },
  provides: [Reports.provide()],
  slots: [Store.slot("store", required()), Audit.slot("audit", optional()), Filter.slot("filters", many({ min: 0, max: 8 }))],
});
```

```ts
// src/features/reports/composition/render.module.ts
import { implement } from "@get-modular/assembly";
import type { ReportsPort } from "../contracts/reports.js";
import { renderDeclaration } from "./render.declaration.js";
import type { ReportsCapabilities } from "./reports.contracts.js";

export const renderModule = implement<ReportsCapabilities>()(renderDeclaration, async (deps) => {
  const port: ReportsPort = {
    render: async (text) => {
      const out = deps.filters.reduce((value, filter) => filter.apply(value), text);
      deps.audit?.record(out);
      await deps.store.save(out);
      return out;
    },
  };
  return { instance: port, capabilities: { "acme/reports/reports": port } };
});
```

```ts
// src/features/reports/composition/store-postgres.module.ts
import { implement } from "@get-modular/assembly";
import type { StorePort } from "../contracts/reports.js";
import type { ReportsCapabilities } from "./reports.contracts.js";
import { storePostgresDeclaration } from "./store-postgres.declaration.js";

export const storePostgresModule = implement<ReportsCapabilities>()(storePostgresDeclaration, async () => {
  const port: StorePort = { save: async () => undefined };
  return { instance: port, capabilities: { "acme/reports/store": port } };
});
```

```ts
// src/features/reports/composition/store-memory.module.ts
import { implement } from "@get-modular/assembly";
import type { StorePort } from "../contracts/reports.js";
import type { ReportsCapabilities } from "./reports.contracts.js";
import { storeMemoryDeclaration } from "./store-memory.declaration.js";

export const storeMemoryModule = implement<ReportsCapabilities>()(storeMemoryDeclaration, async () => {
  const port: StorePort = { save: async () => undefined };
  return { instance: port, capabilities: { "acme/reports/store": port } };
});
```

```ts
// src/features/reports/composition/filter-trim.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { Filter } from "./reports.contracts.js";

export const filterTrimDeclaration = declareModule({
  moduleId: "acme/reports/filter-trim", implementationId: "acme/reports/filter-trim/default",
  owner: { authority: "acme", path: ["reports"] },
  provides: [Filter.provide()], slots: [],
});
```

```ts
// src/features/reports/composition/filter-trim.module.ts
import { implement } from "@get-modular/assembly";
import type { FilterPort } from "../contracts/reports.js";
import { filterTrimDeclaration } from "./filter-trim.declaration.js";
import type { ReportsCapabilities } from "./reports.contracts.js";

export const filterTrimModule = implement<ReportsCapabilities>()(filterTrimDeclaration, async () => {
  const port: FilterPort = { apply: (text) => text.trim() };
  return { instance: port, capabilities: { "acme/reports/filter": port } };
});
```

```ts
// src/features/reports/composition/filter-upper.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { Filter } from "./reports.contracts.js";

export const filterUpperDeclaration = declareModule({
  moduleId: "acme/reports/filter-upper", implementationId: "acme/reports/filter-upper/default",
  owner: { authority: "acme", path: ["reports"] },
  provides: [Filter.provide()], slots: [],
});
```

```ts
// src/features/reports/composition/filter-upper.module.ts
import { implement } from "@get-modular/assembly";
import type { FilterPort } from "../contracts/reports.js";
import { filterUpperDeclaration } from "./filter-upper.declaration.js";
import type { ReportsCapabilities } from "./reports.contracts.js";

export const filterUpperModule = implement<ReportsCapabilities>()(filterUpperDeclaration, async () => {
  const port: FilterPort = { apply: (text) => text.toUpperCase() };
  return { instance: port, capabilities: { "acme/reports/filter": port } };
});
```

```ts
// src/features/reports/composition/reports.group.ts
import { group } from "@get-modular/assembly";
import { filterTrimModule } from "./filter-trim.module.js";
import { filterUpperModule } from "./filter-upper.module.js";
import { renderModule } from "./render.module.js";
import { storeMemoryModule } from "./store-memory.module.js";
import { storePostgresModule } from "./store-postgres.module.js";

export const reportsGroup = group("reports", [
  filterTrimModule,
  filterUpperModule,
  renderModule,
  storeMemoryModule,
  storePostgresModule,
]);
```

```ts
// src/composition/root.ts
import type { Assembly } from "@get-modular/assembly";
import { renderDeclaration } from "../features/reports/composition/render.declaration.js";
import { renderModule } from "../features/reports/composition/render.module.js";
import type { ReportsCapabilities } from "../features/reports/composition/reports.contracts.js";
import { reportsGroup } from "../features/reports/composition/reports.group.js";

export const reportsModules = [reportsGroup] as const;

// Two stores are installed, so the `store` slot has two candidates and needs a row. `audit` is absent in
// this composition: its row is the empty list. `filters` is ordered. Rows live in the root, never in a group.
export function composeReports(api: Assembly<ReportsCapabilities>) {
  return api.prepare({
    profileId: "acme/reports",
    modules: reportsModules,
    bindings: [
      { consumerImplementationId: renderDeclaration.implementationId, slotId: "audit", providerImplementationIds: [] },
      { consumerImplementationId: renderDeclaration.implementationId, slotId: "filters",
        providerImplementationIds: ["acme/reports/filter-trim/default", "acme/reports/filter-upper/default"] },
      { consumerImplementationId: renderDeclaration.implementationId, slotId: "store",
        providerImplementationIds: ["acme/reports/store-postgres/default"] },
    ],
    roots: { reports: renderModule },
  });
}
```


The matching oracle rows, written from the decision, not copied from the plan:

<!-- module-authoring-example: bind -->

```ts
// tests/features/reports/reports.wiring.ts
import type { WiringOracle } from "@get-modular/conformance";

// Written from the decision. The same three rows as the root, because completion produces none of them;
// the pinned providers list both stores, and the rows choose between them.
export const reportsWiring: WiringOracle = {
  providers: {
    "acme/reports/filter": ["acme/reports/filter-trim/default", "acme/reports/filter-upper/default"],
    "acme/reports/reports": "acme/reports/render/default",
    "acme/reports/store": ["acme/reports/store-memory/default", "acme/reports/store-postgres/default"],
  },
  roots: ["acme/reports/render/default"],
  rows: [
    { consumer: "acme/reports/render/default", slot: "audit", providers: [] },
    { consumer: "acme/reports/render/default", slot: "filters",
      providers: ["acme/reports/filter-trim/default", "acme/reports/filter-upper/default"] },
    { consumer: "acme/reports/render/default", slot: "store", providers: ["acme/reports/store-postgres/default"] },
  ],
};
```

```ts
// tests/module/reports.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { assemblyFor, entriesOf } from "@get-modular/assembly";
import { checkWiring } from "@get-modular/conformance";
import { composeReports, reportsModules } from "../../src/composition/root.js";
import type { ReportsCapabilities } from "../../src/features/reports/composition/reports.contracts.js";
import { reportsWiring } from "../features/reports/reports.wiring.js";

test("the rows match the oracle", async () => {
  const preparation = await composeReports(assemblyFor<ReportsCapabilities>());
  assert.equal(preparation.status, "prepared");
  if (preparation.status !== "prepared") { return; }
  const declarations = entriesOf(reportsModules).map((entry) => entry.declaration);
  checkWiring(preparation.composition, [reportsWiring], { declarations });
});
```


## 13. Groups and the root

One line per module in `<feature>.group.ts`, sorted, one member per line, never in
the root and never behind a condition. A parent's group also lists the groups of its
direct sub-features, so the group tree mirrors the feature tree and `groupPath`
reads like the feature path. A new top-level feature adds one line to the root
`modules`, one `extends` to the root map and one oracle part; a new sub-feature adds
one line to its parent's group. When a merge conflicts in a group, keep both lines.
The layout checks catch a module missing from its group and a sub-feature group
outside its parent's group.

<!-- module-authoring-example: project -->

```ts
// src/features/orders/features/discounts/composition/discounts.group.ts
import { group } from "@get-modular/assembly";
import { pricingModule } from "./pricing.module.js";

export const discountsGroup = group("discounts", [
  pricingModule,
]);
```

```ts
// src/features/orders/composition/orders.group.ts
import { group } from "@get-modular/assembly";
import { discountsGroup } from "../features/discounts/composition/discounts.group.js";
import { checkoutModule } from "./checkout.module.js";
import { orderLinesModule } from "./order-lines.module.js";

// The group tree mirrors the feature tree: the parent lists its own modules and its sub-features' groups.
export const ordersGroup = group("orders", [
  checkoutModule,
  discountsGroup,
  orderLinesModule,
]);
```

```ts
// src/features/infra/composition/infra.group.ts
import { group } from "@get-modular/assembly";
import { clockModule } from "./clock.module.js";

export const infraGroup = group("infra", [
  clockModule,
]);
```

```ts
// src/features/billing/composition/billing.group.ts
import { group } from "@get-modular/assembly";
import { invoicingModule } from "./invoicing.module.js";

export const billingGroup = group("billing", [
  invoicingModule,
]);
```


The root diff for a new feature:

```diff
 export const acmeModules = [
   billingGroup,
   infraGroup,
   ordersGroup,
+  shippingGroup,
 ] as const;
```

## 14. Host values, inputs and variants

Per-run data and parent ports are inputs: `input<C>()(declaration)` and
`run({ inputs })`. Host-level singletons and adapters are captured by entries created
in a composition-adapter function whose list never depends on them. A variant is a
separate root with its own `profileId`, `smoke` and oracle; there is no `if` in a
module list.

<!-- module-authoring-example: inputs -->

```ts
// src/features/sessions/contracts/sessions.ts
export type SessionInfo = { readonly id: string };
export type TransportPort = { readonly send: (sessionId: string, text: string) => Promise<void> };
export type ChatPort = { readonly say: (text: string) => Promise<void> };
```

```ts
// src/features/sessions/composition/sessions.contracts.ts
import { defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import type { ChatPort, SessionInfo, TransportPort } from "../contracts/sessions.js";

export const SessionId = defineContract<SessionInfo>()({ id: "acme/sessions/session-id", revision: 1 });
export const Transport = defineContract<TransportPort>()({ id: "acme/sessions/transport", revision: 1 });
export const Chat = defineContract<ChatPort>()({ id: "acme/sessions/chat", revision: 1 });
export interface SessionsCapabilities extends
  CapabilitiesOf<typeof Chat | typeof SessionId | typeof Transport> {}
```

```ts
// src/features/sessions/composition/transport.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { Transport } from "./sessions.contracts.js";

export const transportDeclaration = declareModule({
  moduleId: "acme/sessions/transport", implementationId: "acme/sessions/transport/host",
  owner: { authority: "acme", path: ["sessions"] },
  provides: [Transport.provide()], slots: [],
});
```

```ts
// src/features/sessions/composition/transport.module.ts
import { implement } from "@get-modular/assembly";
import type { TransportPort } from "../contracts/sessions.js";
import type { SessionsCapabilities } from "./sessions.contracts.js";
import { transportDeclaration } from "./transport.declaration.js";

// A Host-level singleton is captured by a function of the composition adapter that creates the entry.
export function createTransportModule(transport: TransportPort) {
  return implement<SessionsCapabilities>()(transportDeclaration, async () => ({
    instance: transport, capabilities: { "acme/sessions/transport": transport },
  }));
}
```

```ts
// src/features/sessions/composition/chat.declaration.ts
import { declareModule } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Chat, SessionId, Transport } from "./sessions.contracts.js";

export const chatDeclaration = declareModule({
  moduleId: "acme/sessions/chat", implementationId: "acme/sessions/chat/default",
  owner: { authority: "acme", path: ["sessions"] },
  provides: [Chat.provide()],
  slots: [SessionId.slot("session", required()), Transport.slot("transport", required())],
});
```

```ts
// src/features/sessions/composition/chat.module.ts
import { implement } from "@get-modular/assembly";
import type { ChatPort } from "../contracts/sessions.js";
import { chatDeclaration } from "./chat.declaration.js";
import type { SessionsCapabilities } from "./sessions.contracts.js";

export const chatModule = implement<SessionsCapabilities>()(chatDeclaration, async (deps) => {
  const port: ChatPort = { say: (text) => deps.transport.send(deps.session.id, text) };
  return { instance: port, capabilities: { "acme/sessions/chat": port } };
});
```

```ts
// src/features/sessions/composition/sessions.group.ts
import { group } from "@get-modular/assembly";
import type { TransportPort } from "../contracts/sessions.js";
import { chatModule } from "./chat.module.js";
import { createTransportModule } from "./transport.module.js";

// The list never depends on the adapters; only an entry captures one.
export function createSessionsGroup(adapters: { readonly transport: TransportPort }) {
  return group("sessions", [
    chatModule,
    createTransportModule(adapters.transport),
  ]);
}
```

```ts
// src/composition/root.ts
import type { Assembly } from "@get-modular/assembly";
import { chatModule } from "../features/sessions/composition/chat.module.js";
import type { SessionsCapabilities } from "../features/sessions/composition/sessions.contracts.js";
import { createSessionsGroup } from "../features/sessions/composition/sessions.group.js";
import { sessionIdInput } from "../features/sessions/composition/sessions.inputs.js";
import type { TransportPort } from "../features/sessions/contracts/sessions.js";

// The template root is a function of Assembly, so `smoke` can pass its own api. A variant would be
// a second root with its own profileId, never an `if` in the list.
export function createSessionsRoot(adapters: { readonly transport: TransportPort }) {
  return (api: Assembly<SessionsCapabilities>) => api.prepare({
    profileId: "acme/sessions",
    modules: [createSessionsGroup(adapters)] as const,
    roots: { chat: chatModule },
    inputs: { session: sessionIdInput },
  });
}
```

```ts
// src/composition/open-session.ts
import { assemblyFor } from "@get-modular/assembly";
import type { Resources } from "@get-modular/resources";
import { createSessionsRoot } from "./root.js";
import type { SessionsCapabilities } from "../features/sessions/composition/sessions.contracts.js";
import type { TransportPort } from "../features/sessions/contracts/sessions.js";

// Prepared once; each session is one run with its own scope and its own input.
export async function createSessions(transport: TransportPort) {
  const preparation = await createSessionsRoot({ transport })(assemblyFor<SessionsCapabilities>());
  if (preparation.status === "failed") { throw new Error(preparation.error.code); }
  const { prepared } = preparation;
  // `sessions` is host.child({ name: "sessions", order: "concurrent" }).
  return async function openSession(sessions: Resources, id: string, signal: AbortSignal) {
    const instance = sessions.child({ name: "session:" + id }); // reserved before the first await
    const outcome = await prepared.run({
      signal, scope: instance.resources, inputs: { session: { "acme/sessions/session-id": { id } } },
    });
    if (outcome.status !== "succeeded") {
      await instance.control.close();
      throw new Error(outcome.status);
    }
    return { chat: outcome.roots.chat, lifetime: instance.control };
  };
}
```


## 15. Reading errors

Identify errors by `code`, never by class or message.

| Error | Meaning and fix |
| --- | --- |
| `assembly.prepare.unresolved-binding` | `error.cause` lists each slot with `consumerImplementationId`, `slotId`, `capabilityId`, `cardinality`, `groupPath` and `candidates`. Zero candidates: add the providing feature's group to the root or write the provider. Several: keep one or add rows. `optional` or `many`: add the row. |
| `assembly.prepare.duplicate-module` | An entry reached twice or two entries with one implementation id; `cause` lists every path. |
| `assembly.bind.*` | Thrown at import by `implement`, `input` or `group` (`invalid-declaration`, `limit`, `invalid-factory`, `invalid-group`). |
| `assembly.prepare.roots` | A root is not reached through `modules`. |
| `assembly.prepare.core-rejected` | Core rejected the plan, for example a revision mismatch between provider and consumer. |
| `conformance.ports.prototype-member` | A returned capability has a method on a prototype (section 6). |
| `conformance.wiring.mismatch` | The plan differs from the oracle; `details.differences` lists each rule. |
| `conformance.layout.violation` | A layout rule broke; `details.violations` lists the files. |
| TS2339 on `resources` | `scoped` is missing (section 9). |
| TS2320 | Two feature maps disagree on one contract (section 5). |
| "capabilities missing from the preparing map" | The root map lacks a capability an entry uses: add the feature's map to `extends`. |
| an annotated list rejected | `modules` must be a tuple; drop the annotation or use `as const`. |

A printed `unresolved-binding` cause and its fix:

```text
consumerImplementationId: acme/reports/render/default
slotId: store   capabilityId: acme/reports/store   cardinality: required
groupPath: ["reports"]   candidates: [store-memory/default, store-postgres/default]
fix: add a bindings row for store, and the same row to the oracle part
```

`describeWiring(composition)` prints the plan for debugging only: roots and
selections, then one `consumer.slot <- providers [capability rN]` row per line. Never
copy it into the oracle.

## 16. Change a contract in place; upgrades with codemods

Raise `revision` on every change of a value type and update the provider, the
consumers, the fake and the suite in one change; Core rejects a mismatch. Never start
a `/v2` id. Packages that carry the contract release a minor while 0.x.

```diff
-export const Clock = defineContract<ClockPort>()({ id: "acme/infra/clock", revision: 1 });
+export const Clock = defineContract<ClockPort>()({ id: "acme/infra/clock", revision: 2 });
```

To upgrade Get Modular, run the codemod on a clean Git tree, then the "By hand" list
of the changeset, then typecheck and the smoke and oracle tests:

```text
pnpm --dir <get-modular checkout> codemod 0.4-0.5 . --dry     # lists the edits
pnpm --dir <get-modular checkout> codemod 0.4-0.5 . --write   # applies them
```

The `0.4-0.5` codemod rewrites the call shapes (`bindFactory` to `implement`,
`factories` to `modules`, `isolate(api, ...)` to `isolate(entry, ...)`) and prints
what it cannot change under "fix by hand". It does not move files into the layout of
this guide; that move is by hand.

## 17. Tests

Use-case and domain unit tests use plain fakes and no Get Modular. `isolate` tests
one module with `await using`. One suite per contract. Per root: `smoke`,
`checkWiring` over the feature parts, and `checkNamespaces`. `smoke` proves
construction and cleanup, not wiring; the oracle states the wiring decisions. A
feature's tests import only its own code, the public surfaces and `testing.ts` of
features it may see, and Get Modular. A sub-feature's tests live at the mirrored path
(`tests/features/orders/features/discounts/`). No sleeps; close every scope.

Oracle parts, one per feature, at the feature's mirrored path:

<!-- module-authoring-example: project -->

```ts
// tests/features/orders/orders.wiring.ts
import type { WiringOracle } from "@get-modular/conformance";

export const ordersWiring: WiringOracle = {
  providers: {
    "acme/orders/order-lines": "acme/orders/order-lines/memory",
    "acme/orders/orders": "acme/orders/checkout/default",
  },
  roots: ["acme/orders/checkout/default"],
};
```

```ts
// tests/features/orders/features/discounts/discounts.wiring.ts
import type { WiringOracle } from "@get-modular/conformance";

// A sub-feature keeps its own part at the mirrored path.
export const discountsWiring: WiringOracle = {
  providers: { "acme/orders/discounts/discounts": "acme/orders/discounts/pricing/default" },
};
```

```ts
// tests/features/billing/billing.wiring.ts
import type { WiringOracle } from "@get-modular/conformance";

export const billingWiring: WiringOracle = {
  providers: { "acme/billing/invoices": "acme/billing/invoicing/default" },
  roots: ["acme/billing/invoicing/default"],
};
```

```ts
// tests/features/infra/infra.wiring.ts
import type { WiringOracle } from "@get-modular/conformance";

export const infraWiring: WiringOracle = {
  providers: { "acme/infra/clock": "acme/infra/clock/system" },
};
```


The root test with all root checks:

<!-- module-authoring-example: project -->

```ts
// tests/module/root.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { assemblyFor, entriesOf } from "@get-modular/assembly";
import { checkNamespaces, checkWiring, smoke } from "@get-modular/conformance";
import { acmeModules, composeAcme, type AcmeCapabilities } from "../../src/composition/root.js";
import { billingWiring } from "../features/billing/billing.wiring.js";
import { infraWiring } from "../features/infra/infra.wiring.js";
import { discountsWiring } from "../features/orders/features/discounts/discounts.wiring.js";
import { ordersWiring } from "../features/orders/orders.wiring.js";

const declarations = entriesOf(acmeModules).map((entry) => entry.declaration);

test("the root builds and cleans up after a failure at every module", async () => {
  await smoke({ api: assemblyFor<AcmeCapabilities>(), compose: composeAcme });
});

test("the root wires what the oracle parts state", async () => {
  const preparation = await composeAcme(assemblyFor<AcmeCapabilities>());
  assert.equal(preparation.status, "prepared");
  if (preparation.status !== "prepared") { return; }
  checkWiring(preparation.composition, [billingWiring, discountsWiring, infraWiring, ordersWiring], { declarations });
});

test("identities lie in the product namespace", () => {
  checkNamespaces({ namespace: "acme", declarations });
});
```


## 18. Identities, namespaces and plugins

The rules are in the CMS: [identity and namespaces](../architecture/common-assembly.md#identity-and-namespaces)
(`<product>/<context>/<name>`, `<product>/<feature>/<sub-feature>/<name>` for a
module created in a sub-feature; ids never change when files or features move; id
segments are a namespace at creation time, not a path, and `checkNamespaces` never
compares ids with paths). Plugin readiness follows
[ADR-0029](../decisions/0029-admit-an-optional-lifecycle-kernel-candidate.md) and
section 4: inert declaration files let a later plugin manifest be generated without
importing implementations. The manifest itself is a follow-up.

## 19. Anti-patterns

| Pattern | Why | Instead |
| --- | --- | --- |
| reaching into another feature's sub-feature, or listing a sub-feature's group in the root | breaks "private by default"; the parent can no longer restructure its subtree | use the parent's republication |
| a sub-feature per class, per endpoint or only to isolate a folder | ceremonial depth | one feature per cohesive capability |
| decorators | class-only, registration by import side effect, the class type does not change so the map loses typing (GM-REQ-012) | an `implement` entry |
| runtime discovery, glob or dynamic imports of modules in production code | nondeterministic, bypasses admission and review (GM-REQ-011) | a static group |
| prototype methods or `this` in ports | `this` is lost on destructuring; the check fails on prototype methods and cannot see object-literal `this` | arrow functions in a factory |
| method signatures or inferred types (`ReturnType<...>`) in port types | bivariant parameter checks accept breaking changes; lint cannot see an inferred type | function-typed properties |
| logic in `*.module.ts`, or anything but the declaration in `*.declaration.ts` | untestable without Get Modular; declarations must stay inert | a use case |
| conditional module lists or variants by flag | wiring depends on run time; `smoke` and the oracle cover one shape | a separate root with its own `profileId` |
| annotated module lists | lose the map check; rejected in the `profileId` form | a tuple or `as const` |
| importing another feature's modules, groups, use cases or adapters | hidden coupling, `duplicate-module`; the feature stops being a brick | its contracts and a slot |
| registries, `get(key)` inputs, service bags, per-instance data captured in closures | a service locator; instances leak into each other (ADR-0031) | declared inputs |
| copying `describeWiring` or a plan into the oracle | the oracle then proves nothing | write it from the decision |
| `any`, double casts or `as never` in wiring or fakes | false type claims | fix the declaration or the fake |

The first four as short snippets:

```text
// outside orders:  import { pricingModule } from "../orders/features/discounts/composition/pricing.module.js"   // NO
// outside orders:  import { Discounts } from "../orders/composition/orders.contracts.js"                         // yes

@Injectable() class PricingModule {}                         // NO: decorators

const modules = await Promise.all(files.map(f => import(f))) // NO: runtime discovery
```

## 20. Checklists

New feature (top-level or sub-feature first):

- the feature card in its README, with its parent for a sub-feature;
- the directory layout, only directories that hold real files;
- port types, descriptors and the feature map (extending the maps it uses);
- the first module (section 3), its group and its oracle part;
- a root line and one `extends` in the root map (a sub-feature: its parent's group);
- profile and layout-check configuration of the consumer;
- `smoke`, `checkWiring`, `checkNamespaces`, `checkModuleLayout`.

New module:

- identities, port, use case, declaration, module;
- `isolate` test, one group line, one oracle pin (and rows);
- size limits, imports, own-property ports;
- the feature card updated.

Review a feature or module change:

- visibility: only visible features, through contracts; republication for sub-features;
- cycles: downward and lateral edges acyclic, no load-time import cycle;
- group tree mirrors the feature tree; the root lists top-level groups only;
- the oracle was written from the decision, not copied;
- no decorators, discovery, registries, closures over per-instance data, `any` or casts.
