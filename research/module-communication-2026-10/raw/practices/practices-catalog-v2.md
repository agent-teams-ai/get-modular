# Module communication: best and worst practices

Draft v2, 2026-10-16. Target location after review: get-modular `docs/guides/module-communication.md`.

The short rules live in the "Module communication vision" (workspace `AGENTS.md`) and, once adopted, in the
[Consumer Module Standard](../architecture/common-assembly.md#consumer-module-standard). This catalog is the evidence
behind those rules. It does not restate the standard; where they differ, the standard wins and the difference is a bug
to report.

"In GM" refers to get-modular `main` at `bcd4c9a` (2026-10-16). Quotes are short and verbatim; links are pinned where
the source allows it. Section I lists what was re-checked against the primary source and what is still unverified.

## How to use this catalog

1. Before you design or review any link between modules, read the vision rules, then the section for the direction you
   touch: A parent to child, B child to parent, C siblings and distant modules, D plugins and extension points,
   E lifecycle, resources and memory, F errors, ordering and observability.
2. Read the Worst table first. A design that matches a worst row is rejected unless it states why the cited failure
   cannot happen in Get Modular.
3. Cite row IDs in plans, reviews and PRs, for example "follows C1 and E1, avoids D-4". A pattern that matches no row
   needs a precedent and a reason why it beats the proven one.
4. Read the "In GM" column literally:
   - `GM` and `CMS`: exists on main and binds you (a primitive, or a Consumer Module Standard rule).
   - `Planned`: the observation model the owner accepted on 2026-10-16 (`createStore`, `read`, `set`, `readonly`,
     `watch` with `load`, `close`). Not on main yet. Never implement the hub, `participantsFor` or Host-only writes.
   - `Proposed`: suggested by this catalog, not accepted. Do not build it without a decision.
   - `Host`: product policy. It never becomes a Get Modular package.
   - `Gap`: nothing exists. Do not invent a local workaround; raise it.
5. Section G shows what mature projects dropped and why. Use it before you reintroduce a dropped pattern.
6. Section H lists real disagreements between projects and the choice Get Modular makes.

## What Get Modular gives today

- Typed contracts (`defineContract`) and slots: `required` (completed automatically when exactly one provider exists),
  `optional` (always an explicit row: `[]` or one provider), `many` (explicit ordered row). Two rows for one slot fail
  (`binding.duplicate-record`), a wrong count fails (`binding.cardinality`), a cycle fails (`graph.cycle`), all before
  any factory runs.
- Module entries, static groups and roots (ADR-0036). Rows live in the root today; group-level rows (F-4) are deferred
  until a feature needs its own `many` or `optional` row.
- Run inputs for per-instance data and parent ports (ADR-0031). The factory context is closed: `{ signal, scope }`, and
  `{ signal, resources }` inside `scoped()`.
- `@get-modular/resources`: named scopes, `setup`/`use`/`child`, reverse-order release, debts, `close({ escalate,
  abandon })`, coded errors.
- `@get-modular/conformance`: `isolate`, `smoke`, `checkWiring` against an independent oracle, `checkNamespaces`.
- `@get-modular/lifecycle-kernel`: an optional candidate for plugin generations.

## Quick decision table

| You need | Use | Never |
| --- | --- | --- |
| A value or an answer now | a port method through a `required` slot | a lookup by string, an event that asks |
| The owner to change something | the owner's command port; it returns a typed result; the confirmed change comes back as state | writing the owner's state, a command disguised as an event |
| To react to changes of a value someone owns | its `readonly()` facet and `watch(resources, ...)` (`Planned`) | polling, effects, a counter key used as a signal |
| To give children a value derived from yours | own a store as its only writer | letting a child watch both the raw and the derived value |
| Configuration at creation | a slot or a run input | a closure captured when the entry is created, an ambient context |
| A change that needs a restart | a new instance run, switch the pointer, close the old one | in-place rebinding with half-applied state |
| Everyone who contributes X, fixed at composition | an extension point: the owner's contract and `many()` with an explicit row | numeric priorities, a list plugins edit |
| Contributions that come and go at run time | the owner's registry command that takes the contributor's `resources` (`Proposed`, D10) | `many()`, a list the owner caches forever |
| A fact that cannot be coalesced, for several independent modules | an event, later (`createEvent`, `emit`, `subscribe`) | a global bus, string topics, a store key used as an event |
| A process that writes to several owners | an orchestrator in a common ancestor or a bridge module | an event chain |
| Two neighbours that need each other | a common ancestor, a bridge module, or split the state owner from the consumer of children | a cycle, callbacks wired back |
| Isolation from a sibling's failure | a separate run: an instance or a plugin generation | a provider failure turned into `undefined` |

## A. Parent to child: configuration, data and changes

### Best practices

| ID | Practice | Evidence | In GM |
| --- | --- | --- | --- |
| A1 | Give a module its configuration and ports at creation as typed arguments; it never reaches into its environment. | Godot: "If at all possible, you should design scenes to have no dependencies" and "rely on a parent context to initialize it" ([Godot][godot-scene]); Medusa: "the module's main service receives the module options as a second parameter" ([Medusa][med-options]); Kibana contracts are "passed as the first argument to the equivalent lifecycle function" ([Kibana][kib-anatomy]) | `GM`: slots and run inputs; closed factory context (CMS, Dynamic instances) |
| A2 | One owner and one writer per value; everyone else reads. | React: "This principle is also known as having a "single source of truth"" ([React][react-state]); LibreOffice UNO: "there can only be one owner per object" ([UNO][uno-guide]); Home Assistant: a `ConfigEntry` "must never be mutated directly by integrations" ([HA][ha-entries]) | `Planned`: `set` and `close` stay with the owner; others get `readonly()` through a contract and a `required` slot |
| A3 | The current value is the default contract; offer a change stream only where the consumer reacts to the change itself. | Kibana RFC 0007: "Core should not expose API's as observables", it "leaks internal implementation details consumers can't do anything useful with"; exception "When an API consumer is interested in the *state changes itself*" ([Kibana][kib-rfc7]) | `Proposed` rule: a contract exposes a store facet only for values whose changes consumers must react to; otherwise a plain port |
| A4 | Notifications are level-based: the subscriber reads the latest snapshot, intermediate values may coalesce, a revision names the state. | Kubernetes: "the system's behavior is *level-based* rather than *edge-based*" ([Kubernetes][k8s-spec]); Blender: "the callback is only triggered once per update cycle" ([Blender][blender-msgbus]); Home Assistant platforms call a listener "to remove stale agents and add new ones" and the owner rereads ([HA][ha-backup]) | `Planned`: deferred, coalesced `watch` with `since` and a revision (OD-007 constraints) |
| A5 | Decide per input: the module reconfigures in place (`watch`) or is rebuilt (new instance). Never both. | Home Assistant: a listener together with reloading "can cause the integration to reload twice and/or create a race condition", deprecated 2026.6, an error from 2026.12 ([HA][ha-blog-reload]); .NET separates `IOptions<T>` from `IOptionsMonitor<T>` ([.NET][net-options]) | `CMS`: replace an instance by running a new one; `Planned`: `watch`; `Proposed` rule: one path per input |
| A6 | Each consumer depends on its own narrow slice; the owner shares the minimum. | Grafana: "Only share the minimum amount of data required with external elements. You can always extend later" ([Grafana][gf-degrade]); GitLab: "Strip shared models to identity objects" ([GitLab][gl-mm]); .NET: "depend only on the configuration settings that they use" ([.NET][net-options]) | `CMS`: consumer-owned ports in `application/ports/`; owner decision: each module depends on its own settings slice |
| A7 | Pass IDs and immutable plain data between modules, never live objects of another module. | Blender: "use indices (or other data always stored by value in Python, like string keys…)" ([Blender][blender-crash]); Medusa links "store only the IDs of the linked records" ([Medusa][med-links]); Magento: "Service contracts SHOULD allow client side generated IDs" ([Magento][mag-tg]) | `Planned`: store values are immutable plain data; `CMS`: session, tenant and instance IDs name scopes or inputs |
| A8 | Freeze what you hand to another module: mutation fails instead of being discouraged. | Grafana: "the `context{}` object always gets frozen before being passed to the links" ([Grafana][gf-ep]); Forge EventBus 7: mutating a `MonitorAware` event in a monitoring listener "will throw an exception" ([Forge][forge-eb7]); Magento 14.1: values "MUST NOT be modified in the event observer" ([Magento][mag-tg]) | `GM`: Assembly freezes dependency records and `many` arrays, not capability values; `Proposed` mechanism (observation): snapshots frozen in every mode |
| A9 | Treat incoming configuration as untrusted input: validate before the single writer commits, roll out in stages, keep a kill switch. | Cloudflare 2025 ([Cloudflare][cf-2025]); Cloudflare 2019 deployed "without a staged rollout" ([Cloudflare][cf-2019]) | `Host`: policy before `set` |

### Worst practices

| ID | Practice | Evidence | In GM |
| --- | --- | --- | --- |
| A-1 | The child mutates data or configuration it received. | Vue: a child "should **not** attempt to mutate a prop" ([Vue][vue-props]); Home Assistant: integrations "must call `async_update_entry`" instead ([HA][ha-entries]) | `Planned`: `readonly()` has no `set` |
| A-2 | The parent pushes values into a child object or keeps references to child views. | Obsidian: "Managing references to custom view can cause memory leaks or unintended consequences" ([Obsidian][obs-guide]); Flutter marks `cartWidget.updateWith(item)` as BAD ([Flutter][flutter-state]) | `Proposed`: the parent owns a store, the child watches it |
| A-3 | Effects as the mechanism that propagates state. | Angular: "Avoid using effects for propagation of state changes" ([Angular][ng-effect]); React: "You Might Not Need an Effect" ([React][react-effect]) | `Planned`: handlers record the desired state; a derived value is an owned store |
| A-4 | Every API exposed as an observable "just in case". | Kibana reversed its 2016 design in RFC 0007 and removed `adminClient$` ([Kibana][kib-rfc7]) | `Proposed` rule A3 |
| A-5 | An ambient or god object passed everywhere and mutable at any time. | Kibana legacy `server` and `request`: "these objects are mutable at any time" ([Kibana][kib-mig79]); Home Assistant removed `hass.helpers` ([HA][ha-blog-helpers]); Godot autoloads: "there's no longer an easy way to find the source of a bug" ([Godot][godot-auto]) | `CMS`: an input "is data or one narrow port, never a registry with `get(key)` or a bundle of parent services" |
| A-6 | State shared through imports or module-level singletons. | Kibana: "**Plugins cannot share state by importing each others modules.**" ([Kibana][kib-mig79]); JupyterLab 4: "Global `sessionContextDialogs` is removed; you should request the token" ([JupyterLab][jl-mig]) | `CMS`: no service locator, no global registry; `Proposed` rule: no module-level mutable state reachable from another module |
| A-7 | Two paths for one meaning: a child watches the raw and the derived value, or one input is both watched and rebuilt. | Home Assistant listener plus reload (A5) ([HA][ha-blog-reload]) | Vision rule 4 |
| A-8 | Instant global rollout of unvalidated configuration. | Cloudflare 2019 and 2025 ([2019][cf-2019], [2025][cf-2025]) | `Host` |

## B. Child to parent: intent, contributions and failures

### Best practices

| ID | Practice | Evidence | In GM |
| --- | --- | --- | --- |
| B1 | Intent goes up through a port the parent supplied; the owner decides and writes; the confirmed change comes back as state. | Godot: a signal "should be used only to "respond" to behavior, not start it", a method call is "Used to start behavior" ([Godot][godot-scene]); Akka: "There is no parent in Typed" ([Pekko][pekko-classic]); Fowler separates requests from confirmed updates ([Fowler][fowler-ec]) | `CMS`: a slot to the owner's contract (an FMS upward use edge); vision rule 3 |
| B2 | The child holds an explicit reference to what it may call; there is no implicit parent or global app. | Godot: "Initialize a Callable property. Safer than a method as ownership of the method is unnecessary" ([Godot][godot-scene]); Obsidian: "Avoid using the global app object" ([Obsidian][obs-guide]); XState: "Prefer sendTo(...)" ([XState][xstate-actions]) | `CMS` rule 4: never pass `Resources` of an ancestor or any `ScopeControl` down |
| B3 | A command validates before it executes and returns a typed result; a domain refusal is a result, not an exception. | Temporal Update: "The sender of the Update can wait for a response on completion or an error on failure", with a validator "responsible for accepting or rejecting the Update" ([Temporal][tmp-msg]); Magento 5.20: plugins and observers "MUST only throw exceptions declared by the method" ([Magento][mag-tg]) | `Proposed` rule: command ports return a typed union such as `"accepted" \| "rejected"` |
| B4 | A setup failure is a typed outcome for the owner; retry and back-off are the runtime's policy, not the module's. | Home Assistant: raise `ConfigEntryNotReady` "and Home Assistant will automatically take care of retrying", and "should not log any non-debug messages about the retry" ([HA][ha-setupfail]) | `GM`: a failed Assembly outcome carries phase, code and implementation ID; retry is `Host` |
| B5 | An integral step has exactly one provider; many reactors are only for side effects. | Medusa: "A hook can have only one handler" ([Medusa][med-hooks]) and "If the action you're performing is integral to the main flow of the core commerce feature, use workflow hooks instead" ([Medusa][med-events]) | `GM`: a `required` or `optional` slot with one provider; owner decision: `many()` only for extension points |
| B6 | Contributing to the parent's extension point at composition is mainstream, not an inversion. | Kibana: "An extension point is a function provided by core, or a plugin's plugin API" ([Kibana][kib-anatomy]); JupyterLab semantic menu items ([JupyterLab][jl-points]); Backstage extension points ([Backstage][backstage-be]) | `GM`: `many()` with an explicit row in the root; group rows (F-4) deferred |
| B7 | No echo: do not report upward a change the owner itself made, and remember that a filter also sees the module's own actions. | Lit: events "should generally **not** be dispatched in response to state changes made by the owner of the component" ([Lit][lit-events]); Mattermost: `MessageWillBePosted` "will be called for posts created by plugins, including the plugin that created the post" ([Mattermost][mm-hooks]) | Vision rule 7 |

### Worst practices

| ID | Practice | Evidence | In GM |
| --- | --- | --- | --- |
| B-1 | True two-way binding: the child writes the parent's state. | Vue 2 `.sync` "can create maintenance issues" ([Vue 2][vue2-sync]); Flux: two-way bindings "led to cascading updates" ([Flux][flux]) | Vision rule 3: two-way binding only as sugar over command plus state |
| B-2 | Implicit access to the parent or the app. | Obsidian: the global `app` "might be removed in the future" ([Obsidian][obs-guide]); Dataview reads `app.plugins.plugins.dataview?.api` ([Dataview][dataview]) | `CMS`: closed factory context |
| B-3 | Extending by overriding a whole method or class, or by `super()` chains. | Medusa v1: "The only way to "extend" services was to override entire methods, which led to nasty upgrade paths" ([Medusa][med-v2]); Magento 1: "each class is only "rewritable" by a single module" ([Storm][storm]); Odoo: "It is very important to **always** call `super()`" ([Odoo][odoo-inherit]) | `CMS`: no aliases, no override by ID; `Proposed`: the owner adds a narrow named point instead |
| B-4 | Writing to the source from its own delivery callback. | Flux: "Cannot dispatch in the middle of a dispatch" ([Flux][flux]); Magento: an observer must not dispatch "an event that it immediately listens to" ([Magento][mag-obs]) | Vision rule 7 |
| B-5 | The parent inspects the child's internal actions. | TCA: delegate actions exist because inspecting child actions "may lead to the parent making assumptions" ([TCA][tca-faq]) | Vision rule 3 |
| B-6 | Restart policies at several levels multiply. | OTP: the effective limit is "the product of the intensity values" ([OTP][otp-sup]) | `CMS`: one Host deadline at the root |

## C. Siblings and distant modules: calls, commands, state and facts

### Best practices

| ID | Practice | Evidence | In GM |
| --- | --- | --- | --- |
| C1 | Default to a declared direct dependency on the neighbour's public contract. Events are only for side effects outside the main flow. | GitLab: "Prefer direct dependencies over monolith callbacks", "whereas callbacks hide the coupling" (proposed design document) ([GitLab][gl-mm]); Django: "Where possible you should opt for directly calling the handling code" ([Django][dj-signals]); Medusa: subscribers "perform actions that aren't integral to the original flow" ([Medusa][med-events]) | `GM`: slots; vision rule 5 |
| C2 | A dependency that is not declared does not exist. Check it in CI and list exceptions by name with a plan. | GitLab: "A dependency that is not declared does not exist; coupling cannot be re-created through the back door" ([GitLab][gl-mm]); hassfest: "Using component {domain} but it's not in 'dependencies' or 'after_dependencies'" ([HA][ha-hassfest]); Kibana `no_group_crossing_imports` ([Kibana][kib-group]) | `GM`: the slot is the edge and Core checks the plan; Foundation checks imports; the consumer profile lists exact exceptions (CMS) |
| C3 | Soft addresses (routes, app IDs, command IDs, storage keys) are constants in their owner's contract; using one is an edge. | Kibana #66682, open since 2020: "It's easy to miss a plugin's dependency upon another plugin's URL" ([Kibana][kib-66682]); groundwork merged in 2026 ([#278396][kib-278396]), enforcement still open ([#278399][kib-278399]) | `Gap`; `Proposed` rule |
| C4 | Link two neighbours through a common ancestor or a bridge module that depends on both. | Godot: "an ancestor mediates their communications and references" ([Godot][godot-scene]); Odoo `sale_crm` works "without either `sale` or `crm` being aware of one another" ([Odoo][odoo-module]); Android: "A mediating module is necessary" ([Android][android-mod]) | `GM`: groups and roots; `Proposed` guide recipe "bridge module" |
| C5 | A write that spans several owners belongs to an orchestrator with compensation, not to an event chain. | Medusa: "If any steps fail, the entire workflow is rolled back" ([Medusa][med-v2]); Ruecker: "I would avoid these complex peer-to-peer event chains" ([Ruecker][ruecker]); Azure: orchestration "Avoids cyclic dependencies" ([Azure][azure-saga]) | Vision rule 5; Get Modular is not a workflow engine |
| C6 | Separate reading, asking without an answer and asking with an answer. Never disguise a command as an event. | Temporal: Queries "are read requests", Signals "are asynchronous write requests", Updates "are synchronous, tracked write requests" ([Temporal][tmp-msg]); Fowler: the "passive-aggressive command" ([Fowler][fowler-eda]) | Vision rule 5 |
| C7 | A contract and its identity live in a small package both sides import, so the provider can be swapped. | JupyterLab: "create and export a token from a third package that both the provider and consumer extensions import" ([JupyterLab][jl-dev]); Magento 6.4.1.1: "separate API modules" ([Magento][mag-tg]) | `CMS`: a contract package holds descriptors and port types, not implementations |
| C8 | Typed keys, never strings. | Home Assistant: with untyped keys "type checkers also basically pretended that the annotation would always be correct" ([HA][ha-blog-typing]); Godot 4 made signals a first-class type, "less error-prone" ([Godot][godot-signals]) | `GM`: contract descriptors; permanent IDs |
| C9 | Communicate as little as possible; frequent chatter means a wrong boundary. | GitLab: "**Avoid chatty domains.**" ([GitLab][gl-mm]); single-spa: "consider merging them" ([single-spa][single-spa]); Nystrom: "If you often need to think about both sides of some communication … don't use the Observer pattern" ([Nystrom][gpp-observer]) | Vision rule 12 |
| C10 | Subscribe to the exact key, never to everything with a filter in each listener. | Home Assistant removed `time_changed`, where "the callback would reject the event and continue receiving callbacks" ([HA][ha-blog-timechanged]), and `async_track_state_change` for "a performance problem" ([HA][ha-blog-track]) | `Planned`: `watch(keys)` |
| C11 | Across an isolation boundary send only messages: one method per message, plain-data arguments, a validated sender. | Electron: "provide one method per IPC message" ([Electron][el-ci]); Chrome: "Assume that messages from a content script might have been crafted by an attacker" ([Chrome][chrome-msg]); VS Code `Proxied<T>` drops functions from DTOs ([VS Code][vsc-proxy]) | `Planned`: plain-data values allow a bridge; out-of-process plugins are `Host` |

### Worst practices

| ID | Practice | Evidence | In GM |
| --- | --- | --- | --- |
| C-1 | A global bus, string topics or wildcard subscriptions. | Guava: "We recommend against using EventBus" ([Guava][guava-bus]); Forge EventBus 7 moved to one bus per event type because listeners were "silently not being called due to registering it on the wrong bus" ([Forge][forge-eb7]); Vue 3: "a maintenance headache" ([Vue][vue3-bus]) | Vision rule 2 |
| C-2 | A service locator or string lookup between modules. | Strapi: `strapi.service('plugin::my-plugin.name')` ([Strapi][strapi-getters]); VS Code `Registry` is a `Map<string, any>` read with an unchecked `as<T>(id)` ([VS Code][vsc-registry]); Nystrom: "it's harder to understand what your dependencies are by reading the code" ([Nystrom][gpp-locator]) | `CMS`: no service locator, string lookup or mutable registry |
| C-3 | Shared state that anyone can write. | Home Assistant: "You can make up any combination of domain and object id, even overwriting existing states" ([HA][ha-states]); Godot autoloads: "one object is now responsible for all objects' data" ([Godot][godot-auto]) | `Planned`: one writer per store |
| C-4 | An event chain as a business process. | Ruecker: "Emerging behavior, hard to change" ([Ruecker][ruecker]); GitLab `PostReceive`, "where a lot happens across multiple domains" ([GitLab][gl-es]) | Vision rule 5 |
| C-5 | Storage hooks that pose as domain events, or notifications that miss a write path. | GitLab: "`ActiveRecord` callbacks are too low-level to represent a domain event" ([GitLab][gl-es]); Django `update()` does not "emit the `pre_save` or `post_save` signals" ([Django][dj-querysets]); Strapi 5 lifecycles fire differently per operation ([Strapi][strapi-hooks]) | `Proposed` rule: a store expresses the owner's domain change and every write path goes through `set` |
| C-6 | Reaching a neighbour through internals, globals, or its events on someone else's bus. | Dataview: `window.DataviewAPI` and `metadataCache.on("dataview:index-ready", ...)` ([Dataview][dataview]) | `CMS`: closed factory context |
| C-7 | Cycles between modules. | Kibana: "Ordering is possible if and only if the plugins graph has no directed cycles" ([Kibana][kib-sys]); Paper: "will not attempt to resolve cyclic loading issues" ([Paper][paper-plugins]) | `GM`: Core `graph.cycle` before any factory |
| C-8 | Facts lost because the listener was not ready. | Fastify: "otherwise, the event is lost" ([Fastify][fastify-hooks]); Nystrom: "if there are no listeners at the point in time that an event is processed, the event gets discarded" ([Nystrom][gpp-queue]); Obsidian registers vault events "inside an `onLayoutReady` callback" ([Obsidian][obs-load]) | `Planned`: `read` plus `since`; vision rule 9 (factories never emit) |
| C-9 | A multiplexed `send(type, payload)` or a raw channel across a boundary. | Mojo: "Do not try to artificially consolidate multiple distinct concepts into a single interface" ([Mojo][mojo]); Electron: exposing `ipcRenderer.on` "gives renderer processes direct access to the entire IPC event system" ([Electron][el-sec]) | Vision rule 2 |
| C-10 | A payload contract nothing checks. | Django removed `providing_args`: "purely documentational. It provides no functionality or checking" ([Django][dj-31327]) | `GM`: typed contracts |
| C-11 | Pub/sub introduced only to hide a dependency violation. | Shopify: the workaround "introduced indirection" that made code "harder to understand" ([Shopify][shopify-packwerk]) | Vision rule 2 |

### Future events (not implemented, shape only)

Events wait for a real consumer. When they come, every source above points to one shape: a typed contract owned by the
publisher, one contract per kind of fact, named in the past tense ("By convention, signal names are usually past-tense
verbs", [Godot][godot-scene]); "Events should describe what occurred … not the intended action for subscribers"
([GitLab][gl-es]); a minimal payload or a context object ([Fabric][fab-contrib]); `subscribe` takes the subscriber's
`resources`; delivery is FIFO per publisher, isolated and deferred; never from a factory; only for side effects with at
least two independent reactors ("Events should not be used if there is only one subscriber", [Fabric][fab-contrib]);
receivers tolerate duplicates. Never fake an event with a store key such as `lastOrderId` or a counter.

## D. Plugins and extension points

### Best practices

| ID | Practice | Evidence | In GM |
| --- | --- | --- | --- |
| D1 | The extended module owns the extension point; its contract sits in a small package. | Kibana: "An extension point is a function provided by core, or a plugin's plugin API" ([Kibana][kib-anatomy]); Backstage `-node` packages exist "to allow for modules to avoid a direct dependency" ([Backstage][backstage-be]) | `GM`: a `many()` slot on the owner's contract descriptor |
| D2 | Contributions are declared and visible without running anything; declared and actual must match, and a mismatch is an error. | Grafana: "**Links that are not listed here won't work.**" ([Grafana][gf-meta]) and runtime validation "Could not register link extension" ([Grafana][gf-val]); Discourse: a transformer name "is unknown and will be ignored" ([Discourse][dsc-transformer]) | `GM`: a module must return exactly its declared capability keys; explicit `many` rows are checked by the wiring oracle (ADR-0037). Plugins: a manifest generated from declarations with `--check` (F-1, deferred) |
| D3 | The owner declares the point's kind and error policy: collect, first wins, transform chain or wrap. | Discourse value and behavior transformers ([Discourse][dsc-tr]); Magento: "Around-plugins SHOULD only be used when behavior of an original method is supposed to be substituted in certain scenarios" ([Magento][mag-tg]); Rollup `first`, `sequential`, `parallel` ([Rollup][rollup]) | `Proposed` rule: kind and error policy in the contract's JSDoc; wrap is the exception |
| D4 | Keep decision points (allow, transform) apart from notifications, and notify only after the decision. | Fabric: "an event that both cancels and notifies of an action will produce false notifications" ([Fabric][fab-contrib]); Mattermost: "If you don't need to modify or reject posts, use MessageHasBeenPosted instead" ([Mattermost][mm-hooks]) | `Proposed` rule (refines vision rule 8, see H2) |
| D5 | One narrow point per kind of contribution; split a point before you order inside it. | Grafana: one API for links and components was an assumption "which seems to be incorrect" ([Grafana][gf-89473]); Fabric: "purpose-driven events should always be preferred" ([Fabric][fab-contrib]) | `Proposed` rule |
| D6 | Order is an explicit list in the composition, never numbers. | Linux CPU hotplug: an array "documents clearly the ordering of the callbacks" ([LWN][lwn-cpuhp]); Drupal 11.2 replaced `hook_module_implements_alter` with `Order` ([Drupal][drupal-112]); Fabric: "Priorities instead try and ultimately fail" ([Fabric][fab-1121]) | `GM`: `many()` keeps the explicit row order; the oracle compares order |
| D7 | A point works with zero contributions; the owner may limit or allow-list contributors. | Grafana: "You provide a fallback UI or placeholder message" and "Restrict plugins" ([Grafana][gf-degrade]) | `GM`: `many({ min: 0 })`; allow-lists are `Host` |
| D8 | Contributions get a frozen, minimal context object that can grow without a break. | Grafana frozen `context` ([Grafana][gf-ep]); Fabric: "use a context object … can be evolved over time without necessitating a breaking change" ([Fabric][fab-contrib]) | `Proposed` rule |
| D9 | A contributor's registrations live exactly as long as the contributor, and disabling may happen at any time. | GNOME Shell: "Any signal connections made by an extension MUST be disconnected in `disable()`" ([GNOME][gnome-review]) and "Extensions should be prepared to handle `disable()` being called at any time" ([GNOME][gnome-sessions]); Obsidian `register*` methods clean up on unload ([Obsidian][obs-life]) | `GM`: static rows belong to one plan; plugin generations use scopes and the lifecycle-kernel candidate |
| D10 | Contributions that come and go use the owner's registry: registering is a command that takes the contributor's `resources`, and the entry disappears when that scope closes. | Theia #10877: contribution providers are "never disposed of … where possible, we should favor registries" ([Theia][th-10877]); JupyterLab `WidgetTracker` exposes live instances ([JupyterLab][jl-points]) | `Gap`; `Proposed` rule now, mechanism undecided |
| D11 | Plugins see only what they declared; there is no direct plugin-to-plugin code. | Paper: plugins "are not able to access each other unless given explicit access by depending on another plugin" ([Paper][paper-plugins]); Backstage: "There can be no direct communication between plugins through code" ([Backstage][backstage-be]) | Vision rule 11; isolation is `Host` |
| D12 | The registration set is frozen once composed; a late registration is a coded error that names the right phase. | Discourse: "Move your code to an initializer or a pre-initializer that runs after "freeze-valid-transformers"" ([Discourse][dsc-transformer]); GitLab: subscriptions "are immediately frozen" ([GitLab][gl-es]) | `GM`: `many` rows resolve once in `prepare`; nothing registers later |
| D13 | Transform contributions are pure and stateless; side effects belong to notifications. | WordPress: filters "should never have side effects such as affecting global variables and output" ([WordPress][wp-filters]); Magento 4.4: "Plugins MUST be stateless" and 4.5: they "SHOULD NOT change the state of an intercepted object" ([Magento][mag-tg]) | `Proposed` rule (with D3) |

### Worst practices

| ID | Practice | Evidence | In GM |
| --- | --- | --- | --- |
| D-1 | Numeric priorities, worse with opposite conventions in one ecosystem. | Paper: "The **higher** the priority, the **later** the event is called", while in Forge `HIGHEST` runs first ([Paper][paper-listeners], [Forge][forge-docs]) | `GM`: none |
| D-2 | Many writers of one outcome, the last one wins, and a cancel can be undone. | Bukkit: "A plugin can actually uncancel an event after another plugin cancelled it" ([Bukkit][bukkit]); Forge EventBus 6 events posted "in a pre-cancelled state that could be uncancelled" ([Forge][forge-eb7]) | `Planned`: one writer; explicit rows |
| D-3 | A "read-only" observer by convention only. | Bukkit MONITOR: "it's even more important that you don't change the outcome of the event on MONITOR or it'll break other plugins" ([Bukkit][bukkit]) | `Planned`: `readonly()` has no write; snapshots frozen (A8) |
| D-4 | "Rebind anything": several parties silently compete for one binding. | Theia 1.76.0: adopters that rebind the widget "now override this binding and lose the commit-message button" ([Theia][th-cl]) | `GM`: `binding.duplicate-record`, `binding.cardinality`, and `assembly.prepare.unresolved-binding` when several providers exist without a row |
| D-5 | Monkey-patching or class override as the extension mechanism. | Discourse: `modifyClass` customizations "could break at any time" ([Discourse][dsc-modify]); `monkey-around` exists because "multiple independently-written bits of code need to patch the same method(s)" ([monkey-around][monkey-around]) | `GM`: none |
| D-6 | A long-lived collector captures a short-lived scope. | Theia: the provider "will keep the child … alive for the lifetime of the application, causing a memory leak" ([Theia][th-cp]), fixed about four years after it was reported ([Theia][th-17021]) | `GM`: impossible inside one run (the `many` consumer is built after and released before its providers); the risk moves to dynamic registries (D10) |
| D-7 | One general API for every kind of contribution. | Grafana #89473 ([Grafana][gf-89473]) | `Proposed` rule D5 |
| D-8 | Veto and stop-propagation between independent contributions. | Linus Torvalds: "Notifiers are a disgrace, and almost all of them are a major design mistake" ([LWN][lwn-linus]); Bukkit uncancel (D-2) | Vision rule 8 |
| D-9 | Several copies of a package with state, so tokens or brands stop matching. | JupyterLab: "dependencies that export tokens need to be deduplicated" ([JupyterLab][jl-dev]) | `CMS`: one copy of each Get Modular package per Host; `resources.scoped.invalid-run-scope` |
| D-10 | A plugin API designed before real use. | GitLab: "a chicken-and-egg problem of premature abstraction" ([GitLab][gl-open]) | Owner direction: plugin-ready now, plugin system later |
| D-11 | A registration that silently never takes effect. | GLib: `notify::non-existant-property` "succeeds without checking" ([GLib][glib-3540]); Forge wrong bus (C-1) | `GM`: an unknown slot, consumer or provider fails `prepare` with a code |

## E. Lifecycle, resources and memory

### Best practices

| ID | Practice | Evidence | In GM |
| --- | --- | --- | --- |
| E1 | Every subscription takes an explicit, required owner scope: never inferred from the callback, never optional. | GNOME Shell, 2026: without the tracked object "the signal is tracked on `globalThis` and not disconnected automatically" ([GNOME][gnome-4382]); Godot C#: "Godot can't tell that the lambda is associated with the instance that created it" ([Godot][godot-cs]); Blender `subscribe_rna(owner)` with `clear_by_owner` ([Blender][blender-msgbus]) | `CMS` rule 5; `Planned`: `watch` requires `resources` |
| E2 | Ask who owns a resource and how long it lives, and give it an owner with the same lifetime. | Obsidian: "Who owns this resource, and how long should it live?" ([Obsidian][obs-life]); UNO: "there always must be someone who calls `dispose()`" ([UNO][uno-guide]) | `GM`: the scope tree of `@get-modular/resources`; `CMS` rules 1 to 4 |
| E3 | Register through owner methods that remove themselves; release runs unsubscribe, then drain, then close. | Obsidian `registerEvent`, `registerInterval` ([Obsidian][obs-life]); Home Assistant `self.async_on_remove(...)` ([HA][ha-entity-event]); VS Code: "A `DisposableStore` is safer to work with than an `IDisposable[]`" ([VS Code][vsc-life]) | `CMS` rule 6 |
| E4 | Keep run-time state in the instance's scope, never in a shared map keyed by ID. | Home Assistant: `hass.data` "made tracking them difficult", `runtime_data` "gets cleaned up automatically" ([HA][ha-blog-runtime]) | `CMS`: dynamic instances; `Proposed` rule: no module-level maps keyed by instance ID |
| E5 | Tear down in reverse dependency order; one failure does not stop the rest; the wait is bounded and reported. | Kibana: "didn't stop in 15sec., move on to the next" ([Kibana][kib-sys]); Node-RED 0.17: "the runtime will timeout the node if it takes longer than 15 seconds" ([Node-RED][nr-node]) | `GM`: resources release in reverse order, continue past failures, report debts; `CMS`: one Host deadline at the root (escalate, then abandon) |
| E6 | Using something after it closed fails loudly. | VS Code: "Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!" ([VS Code][vsc-life]); "ServicesAccessor '{{name}}' must not be used after 'await'" ([VS Code][vsc-accessor]) | `GM`: `resources.scope.closed`; `Proposed` (observation): `read` and `watch` on a closed store throw a coded error, cleanup stays idempotent |
| E7 | A removed subscription is never called again, even in the middle of a delivery; one added during a delivery waits for the next. | Lumino: "A disconnected slot will no longer be invoked, even if the slot is disconnected while the signal is dispatching" and "A newly connected slot will not be invoked until the next time the signal is emitted" ([Lumino][lum-signal]); LibreOffice fixed listeners "that can be emitted after they are removed" ([LibreOffice][lo-47368]) | `Proposed` (observation) |
| E8 | Every test suite proves that nothing leaked. | VS Code lint: "Suites should include a call to `ensureNoDisposablesAreLeakedInTestSuite()`" ([VS Code][vsc-leaklint]) | `GM`: `isolate` and `smoke` fail on scope debts. `Gap`: they cannot see a subscription still alive after close; `Proposed`: a watcher-count check from an observation testing entry point |
| E9 | Construction registers cheaply and does not wait for the outside world; readiness is state; whatever must survive a sibling's failure runs separately. | Kibana RFC 0007: one plugin with a network error "could block all of Kibana from starting up", so "no single plugin should affect the availability of all other plugins" ([Kibana][kib-rfc7]); Obsidian: `onload` "should not include anything computationally expensive or data fetching" ([Obsidian][obs-load]); Adobe: "Poorly written extensions can potentially destabilize the entire application" ([Adobe][mag-oop]) | `GM`: factories acquire only their own resources under `signal`; `CMS`: construction success is not readiness; instances and plugin generations are separate runs. `Proposed` rule |
| E10 | Children follow an explicit policy when their parent closes, and in-flight work is drained or cancelled. | Temporal Parent Close Policy: `Abandon`, `Request Cancel`, `Terminate (default)` ([Temporal][tmp-close]); "You should generally finish running all handlers before the Workflow run completes" ([Temporal][tmp-msg]) | `GM`: child scopes close with their parent; `CMS`: draining is Host policy; lifecycle-kernel candidate for generations |

### Worst practices

| ID | Practice | Evidence | In GM |
| --- | --- | --- | --- |
| E-1 | Manual register and unregister symmetry. | Nystrom: "the hard part isn't doing it, it's remembering to do it" ([Nystrom][gpp-observer]); Blender's own tutorial appends a menu entry in `register()` that `unregister()` never removes ([Blender][blender-tut]); Theia leaked "one listener per streamed token" ([Theia][th-cl]) | `CMS`: scopes, not manual pairs |
| E-2 | Garbage collection or weak references as the way to unsubscribe. | Django: receivers are weak references, so a local function "may be garbage collected" ([Django][dj-signals]) | `GM`: none; explicit scopes only |
| E-3 | An orphan scope created only to satisfy an API. | Obsidian: "A frequent mistake is creating a `Component`, solely to pass it to an API, without ever unloading it" ([Obsidian][obs-life]) | `CMS` rule 4 |
| E-4 | References to another module's objects, contracts or views kept in fields. | Kibana: storing references retrieved from `start` is marked "Anti pattern" ([Kibana][kib-conv710]); Blender: classes "should not hold references to data the user may remove" ([Blender][blender-crash]) | `Proposed` rule (A7) |
| E-5 | Application-lifetime contributions for things that live with a widget or a session. | Theia: a widget's label provider "will never be destroyed even when the widget is closed" ([Theia][th-10877]) | `Proposed` rule D10 |
| E-6 | Waiting forever on close. | Node-RED before 0.17: "This would cause the runtime to hang if a node failed to call it" ([Node-RED][nr-node]) | `GM`: `abandon` ends the wait without claiming release |
| E-7 | Asynchronous start phases that block everything. | Kibana deprecated async `setup` with a 10 second warning: "Asynchronous plugins support will be removed in a later version" ([Kibana][kib-sys]) | `CMS`: Host deadline; E9 |
| E-8 | Global hooks reset implicitly, kept only by a manual "persistent" flag. | Blender: "By default handlers are freed when loading new files" unless `persistent` is used ([Blender][blender-handlers]) | `GM`: lifetimes follow explicit scopes only |

## F. Errors, ordering and observability

### Best practices

| ID | Practice | Evidence | In GM |
| --- | --- | --- | --- |
| F1 | Isolate each listener's or contribution's failure, attribute it by name and continue. | Home Assistant `EventBus` logs "Error running job" per listener and goes on ([HA][ha-core]); GitLab: "we don't want to impact other subscribers if one is faulty" ([GitLab][gl-sub]); VS Code logs "Unable to create workbench contribution" and creates the rest ([VS Code][vsc-contrib]) | `Planned`: the owner's `reportError` gets the subscriber's name; resources continue past failed cleanups |
| F2 | Queue changes made during delivery (FIFO), never re-enter, and stop a runaway cascade loudly. | Home Assistant PR #173519 (2026): "Queue nested firing of events to ensure event listeners receive events in the order they are fired", with `_MAX_QUEUED_EVENT_DISPATCHES = 10_000` ([HA][ha-173519], [HA][ha-core]); Nystrom: with a queue "the game may keep running even though spurious events are sloshing back and forth" ([Nystrom][gpp-queue]) | `Planned`: deferred delivery. `Gap`: a cascade guard; `Proposed` mechanism (observation) |
| F3 | Do not notify when nothing changed. | Home Assistant: "The default behavior is always calling back listeners when the data is updated, even if it does not change", fixed by `always_update=False` ([HA][ha-blog-coord]) | `Proposed` (observation): `set` with values equal by `Object.is` per key commits nothing |
| F4 | FIFO from one source; no promised order across sources or subscribers; never rely on a sibling handler. | Magento: an observer "should not make assumptions about the order in which it will be invoked" ([Magento][mag-obs]); Node-RED: "no assumptions should be made about ordering once a flow branches" ([Node-RED][nr-async]); Kubernetes: "Random ordering between resources" ([Kubernetes][k8s-ctrl]) | Vision rules 7 and 8; `many` order is explicit |
| F5 | Measure each module's construction, warn above a threshold and attribute a hang to a module. | VS Code: "Creation of workbench contribution '...' took ...ms." ([VS Code][vsc-contrib]); Theia `TIMER_WARNING_THRESHOLD = 100` ([Theia][th-app]); Kibana warns after 10 seconds of `setup` ([Kibana][kib-sys]) | `Gap`: Assembly reports nothing until `run()` settles, and "An uncooperative pending factory can keep run pending" (CMS). Decision pending |
| F6 | Catch misuse at compile or registration time with coded errors. | Paper: "you can't even register a handler for an event in the wrong spot, that will be a compiler error" ([Paper][paper-life]); Fabric: "Exceptions should be thrown in the first method that can reasonably detect misuse" ([Fabric][fab-contrib]); GitLab: validation "happens immediately when you initialize the event object" ([GitLab][gl-es]) | Vision rule 15; `CMS`: codes `<pkg>.<area>.<reason>` |
| F7 | Render the module graph from declarations and check it in CI. | GitLab: "we can render a cross-domain dependency graph and use it in CI" ([GitLab][gl-mm]); Spring Modulith `verify()` ([Spring Modulith][modulith-verify]) | `GM`: the Core plan; `checkWiring` against an independent oracle; `describeWiring` for debugging only |
| F8 | Name every store, subscription and contribution; use the revision as the correlation ID. | Azure: "retrofitting observability … substantially more difficult" ([Azure][azure-eda]); OpenTelemetry needs the message creation context to correlate producer and consumer ([OpenTelemetry][otel-msg]) | `Planned`: names required; revision per commit |
| F9 | Escape hatches are declared and named as debt; violation lists only shrink. | Kibana: dynamic contract resolving means "you implicitly agree to: consider it as technical debt" ([Kibana][kib-contracts]); GitLab: "the list only gets shorter" ([GitLab][gl-sd]); hassfest exception "This should become a helper method that integrations can submit data to" ([HA][ha-hassfest]) | `CMS`: exact accepted exceptions with owner and review trigger; Engineering Foundation ratchets. Get Modular has no cycle escape hatch |
| F10 | Asynchronous reactions are latest-only and cancellable; deadlines and cancellation travel with calls. | Angular: "A resource aborts an outstanding loading operation if the `params` computation changes" ([Angular][ng-resource]); Mattermost: "Deadlines and cancellation attached to request.Context() are propagated" ([Mattermost][mm-api]) | `Planned`: `watch({ load })` with `AbortSignal` |

### Worst practices

| ID | Practice | Evidence | In GM |
| --- | --- | --- | --- |
| F-1 | The first failing listener stops delivery to the rest. | Discourse `trigger`: `raise unless continue_on_error` ([Discourse][dsc-event]); Django: `send()` "does *not* catch any exceptions raised by receivers" ([Django][dj-signals]); Magento `InvokerDefault` calls observers without `try` (researcher's reading of the code, [Magento][mag-invoker]) | `Planned`: isolation per listener |
| F-2 | Errors swallowed into a console line. | Lumino: "The default exception handler is `console.error`" ([Lumino][lum-signal]); Theia's contribution provider catches errors with `console.error` ([Theia][th-cp]) | `Planned`: the owner's `reportError`; resources debts |
| F-3 | An optional provider that failed looks absent. | Lumino `resolveOptionalService`: `catch (reason) { console.error(reason); return null; }` ([Lumino][lum-plugins]) | `GM`: an `optional` slot needs an explicit row, and a failing provider fails the whole run |
| F-4 | Synchronous re-entrant dispatch that breaks order. | Home Assistant before PR #173519 ([HA][ha-173519]); Node-RED before 1.0: handling time included "the time it takes each subsequent node to handle the message" ([Node-RED][nr-async]) | `Planned`: deferred delivery |
| F-5 | A global tick, or subscribe-to-everything with a filter in each listener. | Home Assistant `time_changed` and `async_track_state_change` (C10) | `Planned`: `watch(keys)` |
| F-6 | Order decided implicitly by load order, canvas position, equal sort numbers or IDs. | Odoo: "without explicitly listing dependencies, there is no guarantee of order" (community answer, [Odoo forum][odoo-forum]); n8n: "Branches execute based on their position on the canvas" ([n8n][n8n-v1]); Magento: equal `sortOrder` falls back to load order ([Magento][mag-plugins]) | `GM`: `watch` delivery follows construction order, deterministic but not a contract; `many` order is explicit |
| F-7 | Architecture documents that drift from the code. | Home Assistant `docs/architecture/core.md` still describes `time_changed` years after its removal (researcher's observation, [HA][ha-core-md]) | `GM`: compile tests for the code examples of the standard and the guide |
| F-8 | A "best effort" dependency that blocks in practice, and monitoring that depends on what it monitors. | AWS 2020: a latent bug "caused the Cognito webservers to begin to block" ([AWS][aws-kinesis]) | Vision rule 10; `Host` |
| F-9 | Unbounded buffers and retries without back-off. | AWS 2021: clients were not "adequately backing off" ([AWS][aws-2021]) | `Planned`: coalescing bounds pending state by key; retries are `Host` |
| F-10 | A stale asynchronous result overwrites a fresh one. | React: "there is no guarantee about which order the responses will arrive in" and "you need to add a cleanup function to ignore stale responses" ([React][react-effect]) | `Planned`: `watch({ load })` publishes only the current revision |

## G. Lessons from evolution: what projects dropped and why

| Project, when | Dropped | Replaced with | Why, in their words | Lesson for Get Modular |
| --- | --- | --- | --- | --- |
| Kibana, 2016 to 2019 ([RFC 0007][kib-rfc7]) | data exposed as observables everywhere | current values; streams only where the change itself matters | exposing internal state changes "leaks internal implementation details consumers can't do anything useful with" | `read` is the default; `watch` only where consumers react (A3) |
| Kibana, 7.x ([migration guide][kib-mig79]) | stateful singletons shared by import, `uiExports`, mutable `server` | contracts per lifecycle phase at run time | "an unconventional and fragile way of allowing plugins to integrate"; objects "mutable at any time" | no ambient state; everything through slots (A-5, A-6) |
| Kibana, 2019 ([RFC 0007][kib-rfc7]) | asynchronous lifecycle methods Core waits for | synchronous registration plus status; a 10 second warning still in the code in 2026 | "no single plugin should affect the availability of all other plugins" | a factory waits only for its own acquisitions; readiness is state (E9) |
| Kibana, 2023 ([#167113][kib-167113], [contracts][kib-contracts]) | splitting plugins forever to break cycles | `runtimePluginDependencies`, declared and labelled as debt | "consider it as technical debt and open an issue to track the tech debt resolution" | an escape hatch, if ever needed, is declared, visible and owned (F9) |
| Kibana, 2020 to today ([#66682][kib-66682]) | implicit dependencies through URLs and app IDs | still in progress: a dev-only snapshot merged in 2026 ([#278396][kib-278396]), enforcement open ([#278399][kib-278399]) | "It's easy to miss a plugin's dependency upon another plugin's URL" | declare soft addresses from day one; retrofitting took six years and is unfinished (C3) |
| Forge, EventBus 7, 2025 ([migration guide][forge-eb7]) | one global bus, a mutable cancel flag, implicit event inheritance | a bus per event type, cancel as the listener's return value, `MonitorAware`, compile-time validation | listeners "silently not being called due to registering it on the wrong bus"; uncancel removed "to … make things more predictable" | typed channel per kind; observers cannot write (C-1, D-2, D-3) |
| NeoForge, 2023 ([20.2][neo-202], [capabilities][neo-cap]) | listening on the wrong bus, abstract events, the old capability system | rejected at registration; capability caches with a validity check and invalidation listener | "issues that were found in the previous iteration after years of usage" | fail at registration, not by silence (D-11, F6) |
| Fabric, 2019 to 2026 ([#180][fab-180], [#5619][fab-5619]) | (never added) `unregister` | hooks registered once; a scoped-listener proposal still open after seven years | events "are not meant for notifications"; the demand for scoped lifetimes never went away | lifetimes are scope-bound from the first release (E1) |
| Fabric, 2020 to 2021 ([#1121][fab-1121], [CONTRIBUTING][fab-contrib]) | combined cancel and notify events | `Allow`, `Before`, action, `After` | an event that cancels and notifies "will produce false notifications" | decision points apart from notifications (D4) |
| Paper, Lifecycle API ([docs][paper-life]) | reflective Bukkit events with no compile-time checks | a typed system that decides "which events you can register where" | "there is 0 compile time checking since they are registered reflectively" | misuse fails to compile (vision rule 15) |
| GNOME Shell, 2022 and 2026 ([!4382][gnome-4382]) | `connect` and `disconnect` by handler ID | `connectObject(owner)`; from 2026 a missing owner is logged | without the owner "the signal is tracked on `globalThis` and not disconnected automatically" | the owner scope is a required argument (E1) |
| Godot 4.0 and 4.1 ([signals][godot-signals]) | signals named by strings; many autoloads | first-class typed signals; static variables | "less error-prone" | typed identities (C8) |
| Home Assistant, 2022 to 2026 (about twelve changes) | `time_changed` (2022.5), `async_track_state_change` (removed 2025.5), `hass.data` (2024), untyped keys (2024), `hass.helpers` (2024.11), services per entry, listener plus reload (error from 2026.12), re-entrant nested `fire` (2026), `run_immediately` (error 2026) | indexed helpers, `runtime_data`, `HassKey`, explicit imports, services in `async_setup`, one path per effect, a FIFO queue with a guard | "made tracking them difficult" ([HA][ha-blog-runtime]); "reload twice and/or create a race condition" ([HA][ha-blog-reload]); "receive events in the order they are fired" ([HA][ha-173519]) | global, broadcast and re-entrant all move to scoped, indexed, typed and queued (A5, C10, E4, F2) |
| Medusa, v1 to v2, 2024 ([release post][med-v2]) | cross-domain logic in services, foreign keys between modules | isolated modules, links owned by neither side, workflows with compensation, Query | "near-impossible to partially adopt our feature offering—it was all or nothing" | a module owns only its data; cross-module writes belong to an orchestrator (A7, C5) |
| Magento 1 to 2, 2015 ([plugins][mag-plugins], [Storm][storm]); Adobe Commerce, 2026 ([extensibility][mag-oop]) | class rewrites; in-process extensions by default | interceptor plugins; out-of-process where possible | rewrites cause "conflicts between modules that need to be fixed manually"; extensions "can potentially destabilize the entire application" | narrow named points; isolate what you do not trust (B-3, E9) |
| Django, 2020 to 2022 ([#31327][dj-31327], [signals][dj-signals]) | `providing_args`; signals without caveats | nothing; guidance to call directly | "purely documentational. It provides no functionality or checking" | an unchecked contract is not a contract (C-10, C1) |
| GitLab, 2020 to 2026 ([EventStore][gl-es], [design document][gl-mm]) | cross-domain code in `PostReceive`; callbacks into the monolith | EventStore for side effects; a proposed rule for direct declared dependencies | domains "entangled with each other due to temporal coupling"; "callbacks hide the coupling" | events for side effects only, calls for everything else (C1) |
| Theia, 2022 to 2026 ([#10877][th-10877], [#17021][th-17021], [1.76.0][th-cl]) | contribution providers for things with short lives; container capture | registries; root-bound providers; the rebind conflict documented | "we should favor registries"; adopters "lose the commit-message button" | dynamic contributions need registries with scoped entries; one row per slot (D10, D-4) |
| Grafana, 2024 to 2025 ([#83085][gf-83085], [#89473][gf-89473], [#92343][gf-92343]) | preloading every app plugin; one API for links and components | a reactive registry; one registry per kind; Grafana 12 removed the old API | "app init is ~10 times faster"; the shared API was "incorrect" | one point per kind (D5); declared contributions only (D2) |
| VS Code, 2020 to 2024 ([sandbox][vsc-sandbox], [#203947][vsc-203947]) | Node in the renderer; more than 70 eager contributions | a sandbox with message ports; lazy contributions | "we instantiate more than `70` workbench contributions before an editor has a chance to open" | measure construction (F5); keep boundaries message-only (C11) |
| Electron, 12 to 14 ([remote][el-remote]) | `remote`, transparent proxies of main-process objects | explicit IPC with one method per message | "This module has many subtle pitfalls" | no transparent cross-boundary objects (C11) |
| JupyterLab 4, Lumino, 2023 to 2024 ([migration][jl-mig]) | global singletons | tokens; a plugin registry independent of the application | "you should request the token" | typed slots instead of globals (A-6) |
| Discourse, 2023 to 2025 ([widgets][dsc-widgets], [modifyClass][dsc-modify], [post menu][dsc-postmenu]) | widget overrides, `modifyClass` as the main path | named transformers, outlets, an `auto` mode and console warnings that name the plugin | `modifyClass` "could break at any time" | migrate with named warnings and a removal date |
| Node-RED 0.17 and 1.0 ([going async][nr-async], [nodes][nr-node]) | synchronous message passing; waiting forever on close | asynchronous delivery; a 15 second close timeout | synchronous code "does starve the Event Loop"; waiting "would cause the runtime to hang" | deferred delivery; bounded waits (F2, E5) |
| Temporal, 2024 ([message passing][tmp-msg]) | a Signal followed by polling a Query | Update with a validator | the sender "can wait for a response on completion or an error on failure" | a command returns a typed result (B3) |

Common direction across all three surveys: implicit becomes declared, global becomes owned and scoped, broadcast with a
filter becomes indexed, re-entrant becomes queued, overriding becomes narrow named points, storage hooks become domain
operations, and transparent remote objects become explicit messages.

## H. Where the sources disagree, and what Get Modular chooses

| # | Topic | One side | Other side | Get Modular |
| --- | --- | --- | --- | --- |
| H1 | Unsubscribing during a delivery | Redux: unsubscribing "will not have any effect on the `dispatch()` that is currently in progress" ([Redux][redux-store]) | Lumino and LibreOffice: a removed listener is never called again, even mid-delivery ([Lumino][lum-signal], [LibreOffice][lo-47368]) | Lumino. A subscription is removed when its scope closes; calling it afterwards is use-after-close (E6, E7) |
| H2 | Veto | Linux and Bukkit: veto and stop-propagation between contributions are harmful ([LWN][lwn-linus], [Bukkit][bukkit]) | Fabric `Allow` events and Mattermost `MessageWillBePosted` can reject ([Fabric][fab-contrib], [Mattermost][mm-hooks]) | A contribution never stops another. An owner may ask pure `allow` questions and aggregate the answers by its declared policy, then notify (D3, D4) |
| H3 | Ordering contributions | Forge EventBus 7: a `byte` priority instead of named ordering, chosen "to avoid silent failures from typos" ([Forge][forge-eb7]) | Fabric named phases ([Fabric][fab-contrib]); Linux and Drupal explicit lists ([LWN][lwn-cpuhp], [Drupal][drupal-112]) | An explicit row in the composition. Both camps agree to split a point first (D5, D6) |
| H4 | Synchronous or deferred delivery | VS Code `fire` and Lumino signals are synchronous ([VS Code][vsc-event], [Lumino][lum-signal]) | Home Assistant queues nested events; Blender defers to the end of the operators ([HA][ha-173519], [Blender][blender-msgbus]) | Deferred and coalesced. Nystrom's warning that a queue hides cycles is why F2 needs a guard |
| H5 | Events as the main channel | Spring Modulith: "primary means of interaction should be event publication" ([Spring Modulith][modulith-events]) | GitLab 2026, Django, Medusa: direct calls; events only for side effects ([GitLab][gl-mm], [Django][dj-signals], [Medusa][med-events]) | Calls by default; events later and only for side effects (C1) |
| H6 | Default when a listener throws | Discourse, Django `send()`, Magento: abort ([Discourse][dsc-event], [Django][dj-signals]) | Home Assistant, GitLab, Medusa local bus, VS Code: isolate ([HA][ha-core], [GitLab][gl-sub]) | Isolate and attribute (F1) |
| H7 | Versioning an extension contract | Grafana: a major version suffix in the ID and both versions served for a while ([Grafana][gf-ver]) | Get Modular CMS: an ID is permanent, a `revision` changes, no parallel `/v2` line | Keep the revision model; a window of revisions comes with plugins (owner decision) |
| H8 | Failing loudly | Rule 15: fail fast with a coded error | NeoForge bus 7.0.13 threw on an early post, 7.0.17 went back to silence (reason unknown) | Fail fast; do not copy the NeoForge reversal without its reason |
| H9 | Cycles | Kibana keeps a declared escape hatch ([Kibana][kib-contracts]) | JupyterLab, Paper, Get Modular Core: a hard error | A hard error; split the state owner from the consumer of children |
| H10 | Lazy activation | VS Code, Lumino and Grafana activate lazily for start-up time | Backstage and Get Modular prepare the tree once | Static plans; laziness through separate instance runs |

## I. Verification and provenance

Re-checked against the primary source on 2026-10-16:
- Lumino `resolveOptionalService` returns `null` after `console.error` on activation failure ([source][lum-plugins]).
- Home Assistant `_MAX_QUEUED_EVENT_DISPATCHES: Final = 10_000` and the guard comment ([source][ha-core]); PR #173519
  merged 2026-06-15; PR #182763 merged 2026-09-20.
- Theia contribution-provider JSDoc ("causing a memory leak") and the 1.76.0 rebind note; PR #17021 merged 2026-02-26.
- Kibana RFC 0007 headings and the "no single plugin" sentence; PR #167113 merged 2023-10-24.
- Fabric `CONTRIBUTING.md` (one subscriber, false notifications, strong validation); PR #5619 still open.
- Magento technical guidelines 4.4, 14.1 and 14.3.
- GitLab `domain_layer.md` ("callbacks hide the coupling") and the modular monolith page ("does not exist").
- GNOME Shell MR !4382, merged 2026-09-03, with the quoted description.
- Forge EventBus 7 migration guide ("silently not being called", uncancel).
- Grafana PR #83085 (merged 2024-04-24, "10 times faster"), PR #92343; Lumino PRs #703 and #588.
- Discourse topics 341014 (post menu) and 343404 (topic list): both contain the `auto` mode text.

Corrected during the check: the project survey said Kibana PR #276240 merged on 2026-07-14. It was closed without
merging. The merged groundwork is [#278396][kib-278396] (2026-08-03, "No production behavior changes", a dev-only data
snapshot); enforcement [#278399][kib-278399] is open. Rows C3 and G use the corrected facts.

Not official: "call down, signal up" is Godot community folklore; the official text is "respond" versus "start
behavior" ([Godot][godot-scene]).

Still unverified or inferred by the researchers, and marked where used: Magento observer abort (a reading of
`InvokerDefault`), the Odoo forum answer, the Home Assistant architecture document drift, Grafana's reason for a mandatory
`plugin.json`, the NeoForge reversal, the Bukkit "priority wars" as documented incidents (not claimed here), and quotes
taken from rendered pages (Chrome, Figma, the Grafana website, Paper and Blender documentation). Re-open those links
before quoting them in a normative document.

The evidence packets behind this catalog are internal research notes. Before this file moves to the public repository,
keep only public links and remove internal paths.

## J. Links

[android-mod]: https://developer.android.com/topic/modularization/patterns
[aws-2021]: https://aws.amazon.com/message/12721/
[aws-kinesis]: https://aws.amazon.com/message/11201/
[azure-eda]: https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/event-driven
[azure-saga]: https://learn.microsoft.com/azure/architecture/patterns/saga
[backstage-be]: https://backstage.io/docs/backend-system/architecture/index
[blender-crash]: https://docs.blender.org/api/current/info_gotchas_crashes.html
[blender-handlers]: https://docs.blender.org/api/current/bpy.app.handlers.html
[blender-msgbus]: https://docs.blender.org/api/current/bpy.msgbus.html
[blender-tut]: https://docs.blender.org/manual/en/latest/advanced/scripting/addon_tutorial.html
[bukkit]: https://bukkit.fandom.com/wiki/Event_API_Reference
[cf-2019]: https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/
[cf-2025]: https://blog.cloudflare.com/18-november-2025-outage/
[chrome-msg]: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
[dataview]: https://github.com/blacksmithgu/obsidian-dataview/blob/5ad0994ff384cbb797de382e7edff2388141b73a/src/index.ts
[dj-31327]: https://code.djangoproject.com/ticket/31327
[dj-querysets]: https://github.com/django/django/blob/stable/6.1.x/docs/ref/models/querysets.txt
[dj-signals]: https://github.com/django/django/blob/stable/6.1.x/docs/topics/signals.txt
[drupal-112]: https://www.drupal.org/node/3496788
[dsc-event]: https://github.com/discourse/discourse/blob/v2026.9.0/lib/discourse_event.rb
[dsc-modify]: https://meta.discourse.org/t/262064
[dsc-postmenu]: https://meta.discourse.org/t/341014
[dsc-tr]: https://meta.discourse.org/t/349954
[dsc-transformer]: https://github.com/discourse/discourse/blob/4bae0436fe7a1568b2a67ed1b6ae5039f1b4ebc8/frontend/discourse/app/lib/transformer.js
[dsc-widgets]: https://meta.discourse.org/t/375332
[el-ci]: https://github.com/electron/electron/blob/v44.8.0/docs/tutorial/context-isolation.md
[el-remote]: https://github.com/electron/remote
[el-sec]: https://github.com/electron/electron/blob/v44.8.0/docs/tutorial/security.md
[fab-1121]: https://github.com/FabricMC/fabric-api/issues/1121
[fab-180]: https://github.com/FabricMC/fabric-api/issues/180
[fab-5619]: https://github.com/FabricMC/fabric-api/pull/5619
[fab-contrib]: https://github.com/FabricMC/fabric-api/blob/33b369075baa5ad6c969f44787a18bf2c3ea0a5d/CONTRIBUTING.md
[fastify-hooks]: https://fastify.dev/docs/latest/Reference/Hooks/
[flutter-state]: https://docs.flutter.dev/data-and-backend/state-mgmt/simple
[flux]: https://facebookarchive.github.io/flux/docs/in-depth-overview
[forge-docs]: https://github.com/MinecraftForge/Documentation/blob/1.21.x/docs/concepts/events.md
[forge-eb7]: https://gist.github.com/PaintNinja/ad82c224aecee25efac1ea3e2cf19b91
[fowler-ec]: https://martinfowler.com/eaaDev/EventCollaboration.html
[fowler-eda]: https://martinfowler.com/articles/201701-event-driven.html
[gf-83085]: https://github.com/grafana/grafana/pull/83085
[gf-89473]: https://github.com/grafana/grafana/issues/89473
[gf-92343]: https://github.com/grafana/grafana/pull/92343
[gf-degrade]: https://github.com/grafana/plugin-tools/blob/0ab7e32ba1a66bc144176b9c4d47763f9c69ec69/docusaurus/docs/how-to-guides/ui-extensions/degregate-ui.md
[gf-ep]: https://github.com/grafana/plugin-tools/blob/0ab7e32ba1a66bc144176b9c4d47763f9c69ec69/docusaurus/docs/how-to-guides/ui-extensions/create-an-extension-point.md
[gf-meta]: https://github.com/grafana/plugin-tools/blob/0ab7e32ba1a66bc144176b9c4d47763f9c69ec69/docusaurus/docs/reference/metadata.md
[gf-val]: https://github.com/grafana/grafana/blob/d950a0fd98c2bf0fe9c5ded8c50cae86d71eabc2/public/app/features/plugins/extensions/validators.ts
[gf-ver]: https://github.com/grafana/plugin-tools/blob/0ab7e32ba1a66bc144176b9c4d47763f9c69ec69/docusaurus/docs/how-to-guides/ui-extensions/versioning-extensions.md
[gl-es]: https://gitlab.com/gitlab-org/gitlab/-/blob/master/doc/development/eventstore/_index.md
[gl-mm]: https://handbook.gitlab.com/handbook/engineering/architecture/design-documents/modular_monolith/
[gl-open]: https://about.gitlab.com/blog/2022/07/14/open-core-is-worse-than-plugins/
[gl-sd]: https://gitlab.com/gitlab-org/gitlab/-/blob/master/doc/development/software_design.md
[gl-sub]: https://gitlab.com/gitlab-org/gitlab/-/blob/1697a4648d4ffb04bbd961b7936aa584c9b28db8/lib/gitlab/event_store/subscription.rb
[glib-3540]: https://gitlab.gnome.org/GNOME/glib/-/issues/3540
[gnome-4382]: https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/4382
[gnome-review]: https://gjs.guide/extensions/review-guidelines/review-guidelines.html
[gnome-sessions]: https://gjs.guide/extensions/topics/session-modes.html
[godot-auto]: https://docs.godotengine.org/en/stable/tutorials/best_practices/autoloads_versus_regular_nodes.html
[godot-cs]: https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/c_sharp_signals.html
[godot-scene]: https://docs.godotengine.org/en/stable/tutorials/best_practices/scene_organization.html
[godot-signals]: https://docs.godotengine.org/en/stable/getting_started/step_by_step/signals.html
[gpp-locator]: https://gameprogrammingpatterns.com/service-locator.html
[gpp-observer]: https://gameprogrammingpatterns.com/observer.html
[gpp-queue]: https://gameprogrammingpatterns.com/event-queue.html
[guava-bus]: https://github.com/google/guava/blob/master/guava/src/com/google/common/eventbus/EventBus.java
[ha-173519]: https://github.com/home-assistant/core/pull/173519
[ha-backup]: https://github.com/home-assistant/developers.home-assistant/blob/50b518898989b67bb76b69827f227aa6f0acd32a/docs/core/platform/backup.md
[ha-blog-coord]: https://github.com/home-assistant/developers.home-assistant/blob/50b518898989b67bb76b69827f227aa6f0acd32a/blog/2023-07-27-avoiding-unnecessary-callbacks-with-dataupdatecoordinator.md
[ha-blog-helpers]: https://github.com/home-assistant/developers.home-assistant/blob/50b518898989b67bb76b69827f227aa6f0acd32a/blog/2024-03-30-deprecate-hass-helpers.md
[ha-blog-reload]: https://github.com/home-assistant/developers.home-assistant/blob/50b518898989b67bb76b69827f227aa6f0acd32a/blog/2026-05-07-config-entry-listener-together-with-reloading-methods.md
[ha-blog-runtime]: https://github.com/home-assistant/developers.home-assistant/blob/50b518898989b67bb76b69827f227aa6f0acd32a/blog/2024-04-30-store-runtime-data-inside-config-entry.md
[ha-blog-timechanged]: https://github.com/home-assistant/developers.home-assistant/blob/50b518898989b67bb76b69827f227aa6f0acd32a/blog/2022-04-20-saying-goodbye-to-event_time_changed.md
[ha-blog-track]: https://github.com/home-assistant/developers.home-assistant/blob/50b518898989b67bb76b69827f227aa6f0acd32a/blog/2024-04-13-deprecate_async_track_state_change.md
[ha-blog-typing]: https://github.com/home-assistant/developers.home-assistant/blob/50b518898989b67bb76b69827f227aa6f0acd32a/blog/2024-05-01-improved-hass-data-typing.md
[ha-core]: https://github.com/home-assistant/core/blob/2026.10.1/homeassistant/core.py
[ha-core-md]: https://github.com/home-assistant/developers.home-assistant/blob/50b518898989b67bb76b69827f227aa6f0acd32a/docs/architecture/core.md
[ha-entity-event]: https://github.com/home-assistant/developers.home-assistant/blob/50b518898989b67bb76b69827f227aa6f0acd32a/docs/core/integration-quality-scale/rules/entity-event-setup.md
[ha-entries]: https://github.com/home-assistant/developers.home-assistant/blob/50b518898989b67bb76b69827f227aa6f0acd32a/docs/config_entries_index.md
[ha-hassfest]: https://github.com/home-assistant/core/blob/2026.10.1/script/hassfest/dependencies.py
[ha-setupfail]: https://github.com/home-assistant/developers.home-assistant/blob/50b518898989b67bb76b69827f227aa6f0acd32a/docs/integration_setup_failures.md
[ha-states]: https://github.com/home-assistant/developers.home-assistant/blob/50b518898989b67bb76b69827f227aa6f0acd32a/docs/dev_101_states.md
[jl-dev]: https://github.com/jupyterlab/jupyterlab/blob/v4.6.4/docs/source/extension/extension_dev.md
[jl-mig]: https://github.com/jupyterlab/jupyterlab/blob/v4.6.4/docs/source/extension/extension_migration.md
[jl-points]: https://github.com/jupyterlab/jupyterlab/blob/v4.6.4/docs/source/extension/extension_points.md
[k8s-ctrl]: https://github.com/kubernetes/community/blob/master/contributors/devel/sig-api-machinery/controllers.md
[k8s-spec]: https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md#spec-and-status
[kib-167113]: https://github.com/elastic/kibana/pull/167113
[kib-278396]: https://github.com/elastic/kibana/pull/278396
[kib-278399]: https://github.com/elastic/kibana/pull/278399
[kib-66682]: https://github.com/elastic/kibana/issues/66682
[kib-anatomy]: https://github.com/elastic/kibana/blob/8f43ddb6cba31bb7725047e0dd62ab7d8ade2416/docs/extend/key-concepts/platform-architecture/anatomy-of-a-plugin.md
[kib-contracts]: https://github.com/elastic/kibana/blob/8f43ddb6cba31bb7725047e0dd62ab7d8ade2416/src/core/packages/plugins/contracts-server/src/contracts.ts
[kib-conv710]: https://github.com/elastic/kibana/blob/7.10/src/core/CONVENTIONS.md
[kib-group]: https://github.com/elastic/kibana/blob/8f43ddb6cba31bb7725047e0dd62ab7d8ade2416/packages/kbn-eslint-plugin-imports/src/rules/no_group_crossing_imports.ts
[kib-mig79]: https://github.com/elastic/kibana/blob/7.9/src/core/MIGRATION.md
[kib-rfc7]: https://github.com/elastic/kibana/blob/8f43ddb6cba31bb7725047e0dd62ab7d8ade2416/legacy_rfcs/text/0007_lifecycle_unblocked.md
[kib-sys]: https://github.com/elastic/kibana/blob/8f43ddb6cba31bb7725047e0dd62ab7d8ade2416/src/core/packages/plugins/server-internal/src/plugins_system.ts
[lit-events]: https://lit.dev/docs/components/events/
[lo-47368]: https://listarchives.libreoffice.org/global/dev/2012/msg12016.html
[lum-plugins]: https://github.com/jupyterlab/lumino/blob/44aea979d5d2c77665d651383d27179a63596957/packages/coreutils/src/plugins.ts
[lum-signal]: https://github.com/jupyterlab/lumino/blob/44aea979d5d2c77665d651383d27179a63596957/packages/signaling/src/index.ts
[lwn-cpuhp]: https://lwn.net/Articles/535764/
[lwn-linus]: https://lwn.net/Articles/537562/
[mag-invoker]: https://github.com/magento/magento2/blob/2.4.9/lib/internal/Magento/Framework/Event/Invoker/InvokerDefault.php
[mag-obs]: https://github.com/AdobeDocs/commerce-php/blob/80d81d1922af3e1669a2535370a31138708cadff/src/pages/best-practices/extensions/observers.md
[mag-oop]: https://github.com/AdobeDocs/commerce-extensibility/blob/8062580677ba10c581784b521717af6d98a630d4/src/pages/app-development/index.md
[mag-plugins]: https://github.com/AdobeDocs/commerce-php/blob/80d81d1922af3e1669a2535370a31138708cadff/src/pages/development/components/plugins.md
[mag-tg]: https://github.com/AdobeDocs/commerce-php/blob/80d81d1922af3e1669a2535370a31138708cadff/src/pages/coding-standards/technical-guidelines.md
[med-events]: https://docs.medusajs.com/learn/fundamentals/events-and-subscribers
[med-hooks]: https://docs.medusajs.com/learn/fundamentals/workflows/workflow-hooks
[med-links]: https://docs.medusajs.com/learn/fundamentals/module-links
[med-options]: https://docs.medusajs.com/learn/fundamentals/modules/options
[med-v2]: https://medusajs.com/blog/v2-release
[mm-api]: https://github.com/mattermost/mattermost/blob/356bdc7d9b42aece875cc37271877a3e2576f4dc/server/public/plugin/api.go
[mm-hooks]: https://github.com/mattermost/mattermost/blob/356bdc7d9b42aece875cc37271877a3e2576f4dc/server/public/plugin/hooks.go
[modulith-events]: https://docs.spring.io/spring-modulith/reference/events.html
[modulith-verify]: https://docs.spring.io/spring-modulith/reference/verification.html
[mojo]: https://chromium.googlesource.com/chromium/src/+/main/mojo/README.md
[monkey-around]: https://github.com/pjeby/monkey-around
[n8n-v1]: https://github.com/n8n-io/n8n-docs/blob/main/docs/changelog/v10-migration-guide.md
[neo-202]: https://neoforged.net/news/20.2eventbus-changes/
[neo-cap]: https://neoforged.net/news/20.3capability-rework/
[net-options]: https://learn.microsoft.com/en-us/dotnet/core/extensions/options
[ng-effect]: https://angular.dev/guide/signals/effect
[ng-resource]: https://angular.dev/guide/signals/resource
[nr-async]: https://github.com/node-red/node-red.github.io/blob/main/_posts/2019-08-16-going-async.md
[nr-node]: https://github.com/node-red/node-red.github.io/blob/9e056814e9c53f88e5f6709b9c65fb621e832fc4/docs/creating-nodes/node-js.md
[obs-guide]: https://github.com/obsidianmd/obsidian-developer-docs/blob/c56c7e770ba25dd0ea392aacf4588f9425970d36/en/Plugins/Releasing/Plugin%20guidelines.md
[obs-life]: https://github.com/obsidianmd/obsidian-developer-docs/blob/c56c7e770ba25dd0ea392aacf4588f9425970d36/en/Plugins/Guides/Manage%20plugin%20lifecycle.md
[obs-load]: https://github.com/obsidianmd/obsidian-developer-docs/blob/c56c7e770ba25dd0ea392aacf4588f9425970d36/en/Plugins/Guides/Optimize%20plugin%20load%20time.md
[odoo-forum]: https://www.odoo.com/forum/help-1/modules-order-of-dependencies-159563
[odoo-inherit]: https://github.com/odoo/documentation/blob/19.0/content/developer/tutorials/server_framework_101/12_inheritance.rst
[odoo-module]: https://github.com/odoo/documentation/blob/19.0/content/developer/reference/backend/module.rst
[otel-msg]: https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/
[otp-sup]: https://www.erlang.org/doc/system/sup_princ.html
[paper-life]: https://docs.papermc.io/paper/dev/lifecycle/
[paper-listeners]: https://docs.papermc.io/paper/dev/event-listeners/
[paper-plugins]: https://docs.papermc.io/paper/dev/getting-started/paper-plugins/
[pekko-classic]: https://pekko.apache.org/docs/pekko/current/typed/from-classic.html
[react-effect]: https://react.dev/learn/you-might-not-need-an-effect
[react-state]: https://react.dev/learn/sharing-state-between-components
[redux-store]: https://redux.js.org/api/store#subscribelistener
[rollup]: https://rollupjs.org/plugin-development/
[ruecker]: https://www.infoq.com/presentations/event-flow-systems/
[shopify-packwerk]: https://shopify.engineering/a-packwerk-retrospective
[single-spa]: https://single-spa.js.org/docs/recommended-setup
[storm]: https://alanastorm.com/magento_2_object_manager_plugin_system/
[strapi-getters]: https://github.com/strapi/documentation/blob/cd392928082fd048a31f18d25da97d697ad981bc/docusaurus/docs/cms/plugins-development/server-getters-usage.md
[strapi-hooks]: https://github.com/strapi/documentation/blob/cd392928082fd048a31f18d25da97d697ad981bc/docusaurus/docs/cms/migration/v4-to-v5/breaking-changes/lifecycle-hooks-document-service.md
[tca-faq]: https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/FAQ.md
[th-10877]: https://github.com/eclipse-theia/theia/issues/10877
[th-17021]: https://github.com/eclipse-theia/theia/pull/17021
[th-app]: https://github.com/eclipse-theia/theia/blob/v1.76.0/packages/core/src/browser/frontend-application.ts
[th-cl]: https://github.com/eclipse-theia/theia/blob/v1.76.0/CHANGELOG.md
[th-cp]: https://github.com/eclipse-theia/theia/blob/v1.76.0/packages/core/src/common/contribution-provider.ts
[tmp-close]: https://github.com/temporalio/documentation/blob/e3473e398babae8e4bad8146a049eb12fe2b1979/docs/encyclopedia/child-workflows/parent-close-policy.mdx
[tmp-msg]: https://github.com/temporalio/documentation/blob/e3473e398babae8e4bad8146a049eb12fe2b1979/docs/encyclopedia/workflow-message-passing/workflow-message-passing.mdx
[uno-guide]: https://wiki.documentfoundation.org/Documentation/DevGuide/Professional_UNO
[vsc-203947]: https://github.com/microsoft/vscode/issues/203947
[vsc-accessor]: https://github.com/microsoft/vscode/blob/97697835e296c8fe2c29001da426b242cd969a3f/.eslint-plugin-local/code-no-accessor-after-await.ts
[vsc-contrib]: https://github.com/microsoft/vscode/blob/97697835e296c8fe2c29001da426b242cd969a3f/src/vs/workbench/common/contributions.ts
[vsc-event]: https://github.com/microsoft/vscode/blob/main/src/vs/base/common/event.ts
[vsc-leaklint]: https://github.com/microsoft/vscode/blob/97697835e296c8fe2c29001da426b242cd969a3f/.eslint-plugin-local/code-ensure-no-disposables-leak-in-test.ts
[vsc-life]: https://github.com/microsoft/vscode/blob/97697835e296c8fe2c29001da426b242cd969a3f/src/vs/base/common/lifecycle.ts
[vsc-proxy]: https://github.com/microsoft/vscode/blob/97697835e296c8fe2c29001da426b242cd969a3f/src/vs/workbench/services/extensions/common/proxyIdentifier.ts
[vsc-registry]: https://github.com/microsoft/vscode/blob/97697835e296c8fe2c29001da426b242cd969a3f/src/vs/platform/registry/common/platform.ts
[vsc-sandbox]: https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox
[vue-props]: https://vuejs.org/guide/components/props.html#one-way-data-flow
[vue2-sync]: https://v2.vuejs.org/v2/guide/components-custom-events.html#sync-Modifier
[vue3-bus]: https://v3-migration.vuejs.org/breaking-changes/events-api.html
[wp-filters]: https://developer.wordpress.org/plugins/hooks/filters/
[xstate-actions]: https://stately.ai/docs/actions
