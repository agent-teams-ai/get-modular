# Communication research and fixture reconciliation, 2026-11-24

This record maps the remaining intentions of PRs
[#210](https://github.com/agent-teams-ai/get-modular/pull/210),
[#213](https://github.com/agent-teams-ai/get-modular/pull/213) and
[#222](https://github.com/agent-teams-ai/get-modular/pull/222) onto the current
contract. It is a maintained reconciliation record, not an accepted ADR, release
certificate or refresh of historical measurements. The predecessor source is
PR #251 at `cc3b759e75076ee473461a5ad10de802f0d0b7e6`.

## Foundation work starts with representative fixtures

The owner clarified the delivery order on November 24: qualify the foundation
using useful, realistic fixtures and independent test Hosts before applications
adopt it. Several intended applications depend on other unfinished components;
their availability is not a prerequisite for library qualification. A fixture
needs meaningful behavior, independent expected results, negative cases and
observable cleanup. A second instance of one Host does not establish a second
integration, and Node's EventTarget does not establish browser execution.

The [consumer starting route](../../docs/guides/consumer-quickstart.md#qualify-the-foundation-before-an-application)
and [fixture index](../../tests/qualification/consumer-fixtures/README.md)
provide the entrypoints. The maintained
[Consumer Module Standard](../../docs/architecture/common-assembly.md#consumer-module-standard)
remains the contract for composition and scoped adoption. The
[Live Module Updates foundation plan](https://github.com/agent-teams-ai/live-module-updates/blob/main/docs/architecture/application-foundation.md)
owns the wider cross-repository sequence. Existing product pins, stable-release
criteria and the four SDK-growth HOLD blockers are not changed by this ordering.

## Complete predecessor disposition

| Predecessor intent | Current disposition |
| --- | --- |
| #210: README, AGENTS, docs index and quickstart navigation | Reconciled with fixture-first entrypoints and the owning plugin/update documents |
| #210: install recipes, peers, physical copies and package READMEs | Quickstart, Resources and Conformance show a reviewed exact cohort, frozen installs and explicit discovery; `npm ls` is an inspection aid, not a complete physical-identity gate |
| #210: blanket `@latest` installation | Replaced by discover-then-pin: inspect available metadata, select a compatible exact cohort and qualify it; no moving dependency or automatic consumer-pin migration |
| #213: safe subscription acquisition and extracted-example tests | The current guide and eight-example runner from #251 retain `resources.setup`, synchronous cancellation checks, provider rollback and five lifecycle cases; the old implementation is not copied again |
| #213: old CMS, checker, growth source and ownership assertions | Superseded by #251's current November 24 custody record and retained history; the October pin is historical only |
| #213: optional source selection and independent cleanup | Reimplemented through current public Core, Assembly and Resources roots, portable behavior and two independent test Host drivers; explicit binding performs real delivery |
| #213: stream and occurrence guidance | Module authoring and Resources distinguish latest state, live occurrences, bounded work admission and durable obligations; existing communication and Effect ownership remains authoritative |
| #213: two research documents, six original reports and two raw regression records | All ten original blobs retained without byte changes; hashes and source commits are in the archive manifest |
| #222: two industry/adversarial documents and navigation | Both original blobs retained without byte changes; research index and AGENTS route here, without adopting a new event runtime |

The #213 test's old path is retained, while its implementation now uses separate
callback-request and EventTarget-session Host adapters. Its TypeScript project
inclusion and fixture navigation are updated together. The old growth README
explanation is reconciled with today's retained source chain; historical tests
and counters are not relabeled as results of this successor.

The predecessor branches and their original failed or incomplete checks remain
historical evidence. A normal merge and verification of the successor's actual
source is required before closing the old PRs as superseded. This record alone
does not prove that delivery occurred.

## Exact research custody

The [archive manifest](reconciliation-2026-11-24.json) records path, source commit,
Git blob, SHA-256, byte count and line count for all twelve retained files:

- Ten files from #213 at `24cf56ad4363168aaff3ab0bbfb648b2514c5f03`, including
  [the delivery review](delivery-review-2026-10-25.md),
  [decision coverage](decision-coverage-2026-11-01.md) and
  [original reviewer and regression inputs](raw/delivery-review-2026-10-25/).
- Two files from #222 at `85d3716bcc620c1f5fc053bd519b4f03d4625404`:
  [industry evidence](industry-evidence-and-negative-patterns-2026-11-01.md) and
  [adversarial recheck](adversarial-recheck-2026-11-01.md).

Their original bytes total 204,104 bytes and 1,620 lines. The six original
reports and the ten analytical perspectives are distinct kinds of evidence;
the latter are explicitly not ten independent agents. Dates, old API/version
references, observations, limitations and disagreements remain unchanged.
Current corrections belong in this record or current owning guidance.
Archived compiler/toolchain instructions are historical reproduction inputs;
they do not authorize running an older compiler for maintained work.

## What the optional-adapter fixture establishes

The [executable scenario](../../tests/assembly/optional-event-adapters.test.ts)
uses the pure [portable inbox](../../tests/qualification/consumer-fixtures/event-adapters/portable-inbox.ts)
through an outer GM module. The behavior and narrow ports import no framework,
platform, GM package or Host. The callback-request Host owns a bounded operation
and disposes its scope before returning copied results. The EventTarget-session
Host has its own composition and hands explicit lifetime control to its caller.
They share the feature contract, not a generic Host implementation.

| Boundary | Observable acceptance |
| --- | --- |
| Occurrences | Two equal notifications remain two observations; invalid native payloads are ignored at the adapter boundary |
| Selection | Each standalone Host constructs only its chosen source; ambiguous providers reject before construction |
| Explicit binding | Both intentionally exposed provider roots construct, while only the bound source delivers to the inbox |
| Independent lifetimes | Closing either Host leaves the other active; reopening creates fresh state on a still-usable borrowed source |
| Cleanup custody | Each subscription releases once, repeated close is harmless and a borrowed listener survives Host cleanup |
| Rejection control | Omitting subscription cleanup must make the lifetime assertions fail, even though the cancellation guard can suppress later effects |

The file belongs to the existing Assembly test command and strict TypeScript
project. Results must be reported for the actual successor source; a test's
existence is not a passing result. No production source, runtime dependency,
package version, public API baseline, accepted ADR or enforcement scope changes.

This fixture covers live synchronous occurrences in two Node integrations.
It does not prove actual RxJS installation, tree shaking, noninstallation of an
unused provider, replay, durable delivery, capacity or universal error handling.
Each real integration must declare its own source semantics. The current
[complete communication session](../../docs/guides/module-authoring.md#start-with-a-complete-session)
and [Effect practices](../../packages/effect/docs/practices.md) retain ownership
of their respective execution and completion contracts.

## Browser, Desktop, isolation and UI boundaries

These are confirmed architecture targets now. Their platform implementations
and admission evidence remain separately selected and qualified:

| Target | Boundary required before implementation | Evidence still owned by the selected profile |
| --- | --- | --- |
| Browser | Portable behavior, browser IO/storage and optional rendering adapters | Actual browser loading, interaction, cancellation and resource cleanup |
| Desktop | Renderer/main/native-resource separation and narrow IPC authority | Selected shell, OS custody, packaging and observed native stop |
| Untrusted extensions | Trusted admission and an enforceable isolation boundary with narrow effect capabilities | Denied ambient IO/IPC/authority, resource limits, revocation and observed stop |
| Headless UI | Feature capabilities remain independent of rendering and the chosen library | Focus, accessibility, portals and lifecycle behavior in each selected UI adapter |

A process or Worker identifies placement, not containment. Cooperative resource
cleanup cannot qualify hostile-code isolation. Reusing a headless UI library
does not make all its adapters framework-neutral or justify building a new UI
engine here. Extension Foundation and Live Module Updates own the
[plugin plan](https://github.com/agent-teams-ai/extension-foundation/blob/main/docs/architecture/plugin-delivery-plan.md)
and [headless/UI design](https://github.com/agent-teams-ai/live-module-updates/blob/main/docs/architecture/headless-plugins-and-ui.md).
This reconciliation keeps those boundaries explicit without choosing an unreviewed
platform implementation or adding a universal event, plugin or lifecycle manager.
