---
id: ARCH-SELF-COMPOSITION-GUIDE
type: architecture
status: active
owner: architecture
summary: Implementation guide for ADR-0008 self-composition, naming the own feature graph, source skeleton, build topology, emitter, witness, and checkpoint A.
related:
  - ADR-0008
  - ADR-0010
  - ADR-0011
  - ADR-0015
  - ADR-0016
  - ARCH-FEATURE-MODULE-STANDARD
  - ARCH-MVP-IMPLEMENTATION-ROADMAP
  - ARCH-CURRENT-CONTRACT
  - GM-REQ-V1
---

# Self-composition implementation guide

## Purpose and status

This document is the implementation guide for accepted ADR-0008. It names the
own feature graph of the Core, the TypeScript skeleton of one feature, the
composition roots and build topology, the finite emitter, the construction
witness, and checkpoint A precisely enough that the first private
`packages/core` can be written without inventing structure.

This document owns the implementation mapping for ADR-0008; it adds no
normative requirement beyond ADR-0008, the accepted contract, and the Feature
Module Standard profile. Every rule below is either derived from ADR-0008, the
Feature Module Standard profile, the accepted contract, or is explicitly
marked as proposed by ADR-0016. A rule marked "as proposed by ADR-0016" is a
candidate rule until ADR-0016 is accepted: implement it, do not claim it, and
keep it replaceable. Identifiers, file names, and directory names in this guide
are implementation details in the sense of ADR-0008 and may change through an
ordinary pull request as long as the invariants they carry survive.

## Own feature inventory

ADR-0008 names five cohesive responsibilities and leaves their identities to the
first implementation. This guide fixes them so that declarations, the own
profile, the composition root, and the emitter allowlist agree from the first
commit.

All identities follow the accepted grammar in
`architecture/contracts/v1/composition.schema.json`: a portable identity has at
least two lowercase segments separated by `/`, a local token is one lowercase
segment, and an owner has one `authority` token and a logical `path`.

- The owner authority for every own declaration is `get-modular`.
- The owner path is the logical feature route, one segment per feature, for
  example `["input-admission"]`. It is not a filesystem path.
- Compatibility uses the accepted `exact` family, version `1`, with a token of
  the form `<capabilityId>/v1`.

### Modules and implementations

| Feature | `moduleId` | `implementationId` | Provides (`capabilityId`) | Slots |
| --- | --- | --- | --- | --- |
| Compiler facade | `get-modular/compiler-facade` | `get-modular/compiler-facade/default` | none | `admission`, `semantics`, `output` |
| Input admission | `get-modular/input-admission` | `get-modular/input-admission/default` | `get-modular/admitted-input` | none in M1; `scanner` in M2 |
| Composition semantics | `get-modular/composition-semantics` | `get-modular/composition-semantics/default` | `get-modular/semantic-analysis` | none |
| Plan output | `get-modular/plan-output` | `get-modular/plan-output/default` | `get-modular/plan-emission` | `canonicalizer` |
| Canonicalization | `get-modular/canonicalization` | `get-modular/canonicalization/owned-jcs` | `get-modular/canonical-bytes` | none |

Additional implementations of `get-modular/canonicalization`:

- `get-modular/canonicalization/canonicalize-adapter` wraps the external
  `canonicalize` package behind the same port. It exists only after ADR-0010 is
  accepted and its adapter qualification passes; until then the owned JCS
  implementation is the only production provider.
- `get-modular/canonicalization/witness-variant` is qualification-only. It
  produces deterministically different canonical bytes, a fixed prefix before
  the same encoding, so a plan digest changes observably when it is bound while
  domain separation stays with plan-output. It lives outside `src`, under
  `packages/core/tests/features/canonicalization/witness-variant/`, is built
  only by the qualification variant of a stage0 or stage1 build, and never
  enters the distributed archive.

In M2 the input-admission feature gains the slot `scanner` for the capability
`get-modular/raw-scanner` with the owned iterative scanner as the default
provider and the `jsonc-parser` scanner adapter as a second provider after
ADR-0010 is accepted. That slot is not part of the M1 own graph.

Diagnostics, the comparator, the bounded collector, graph helpers, and resource
metering are feature-owned libraries, not modules. The diagnostic rules have one
owner, the library feature `packages/core/src/features/diagnostics/`: it has no
module declaration and no factory and exposes one curated `internal.ts` of pure
functions and plain types. ADR-0008 forbids enlarging the own graph with helpers
merely to claim more self-use; a feature that emits diagnostics imports that
library statically through its owner's `internal.ts` and through nothing else.

### Own graph

The M1 own graph has five selected implementations and four edges. Every slot
is `required`. `optional`, `many`, cycles, unreachable selections, and missing
bindings never occur in the own graph; the independent vectors cover those
semantics, as ADR-0008 requires.

```mermaid
flowchart LR
    Facade["compiler-facade/default"] -->|admission| Admission["input-admission/default"]
    Facade -->|semantics| Semantics["composition-semantics/default"]
    Facade -->|output| Output["plan-output/default"]
    Output -->|canonicalizer| Canon["canonicalization/owned-jcs"]
```

The accepted plan lists `dependencyOrder` over implementation identities as
the lexicographically smallest valid dependency-before-consumer order: ADR-0006
fixes Kahn's algorithm choosing the smallest ready `implementationId` at every
step. For this graph it is `get-modular/canonicalization/owned-jcs`,
`get-modular/composition-semantics/default`,
`get-modular/input-admission/default`, `get-modular/plan-output/default`,
`get-modular/compiler-facade/default`. The composition root and the emitter
construct in exactly that order.

### Own profile

The own profile is inert data. It selects the default implementation of every
own module and binds the four edges:

```json
{
  "kind": "get-modular.composition-profile",
  "schemaVersion": 1,
  "profileId": "get-modular/own-profile",
  "roots": ["get-modular/compiler-facade"],
  "selections": [
    {
      "moduleId": "get-modular/compiler-facade",
      "implementationId": "get-modular/compiler-facade/default"
    },
    {
      "moduleId": "get-modular/input-admission",
      "implementationId": "get-modular/input-admission/default"
    },
    {
      "moduleId": "get-modular/composition-semantics",
      "implementationId": "get-modular/composition-semantics/default"
    },
    {
      "moduleId": "get-modular/plan-output",
      "implementationId": "get-modular/plan-output/default"
    },
    {
      "moduleId": "get-modular/canonicalization",
      "implementationId": "get-modular/canonicalization/owned-jcs"
    }
  ],
  "bindings": [
    {
      "consumerImplementationId": "get-modular/compiler-facade/default",
      "slotId": "admission",
      "providerImplementationIds": ["get-modular/input-admission/default"]
    },
    {
      "consumerImplementationId": "get-modular/compiler-facade/default",
      "slotId": "semantics",
      "providerImplementationIds": ["get-modular/composition-semantics/default"]
    },
    {
      "consumerImplementationId": "get-modular/compiler-facade/default",
      "slotId": "output",
      "providerImplementationIds": ["get-modular/plan-output/default"]
    },
    {
      "consumerImplementationId": "get-modular/plan-output/default",
      "slotId": "canonicalizer",
      "providerImplementationIds": ["get-modular/canonicalization/owned-jcs"]
    }
  ]
}
```

In the TypeScript source of `self-composition/own-profile.ts`, every
`moduleId` and `implementationId` above is taken from the constants exported by
each feature's `declaration.ts`; the JSON here is the data those constants
produce, and the profile file repeats no identity string.

The qualification variant of this profile differs in exactly one binding: the
`canonicalizer` slot is bound to `get-modular/canonicalization/witness-variant`.
That variant is the controlled binding replacement required by ADR-0008.

### Example declaration

The facade declaration shows the complete accepted shape. Every other own
declaration follows the same form with its own `provides` and `slots`.

```json
{
  "kind": "get-modular.module-declaration",
  "schemaVersion": 1,
  "moduleId": "get-modular/compiler-facade",
  "implementationId": "get-modular/compiler-facade/default",
  "owner": { "authority": "get-modular", "path": ["compiler-facade"] },
  "provides": [],
  "slots": [
    {
      "slotId": "admission",
      "capabilityId": "get-modular/admitted-input",
      "compatibility": {
        "family": "exact",
        "familyVersion": 1,
        "token": "get-modular/admitted-input/v1"
      },
      "cardinality": { "kind": "required" }
    },
    {
      "slotId": "semantics",
      "capabilityId": "get-modular/semantic-analysis",
      "compatibility": {
        "family": "exact",
        "familyVersion": 1,
        "token": "get-modular/semantic-analysis/v1"
      },
      "cardinality": { "kind": "required" }
    },
    {
      "slotId": "output",
      "capabilityId": "get-modular/plan-emission",
      "compatibility": {
        "family": "exact",
        "familyVersion": 1,
        "token": "get-modular/plan-emission/v1"
      },
      "cardinality": { "kind": "required" }
    }
  ]
}
```

The plan-output declaration provides `get-modular/plan-emission` and declares
the single slot `canonicalizer` for `get-modular/canonical-bytes`. The
canonicalization declarations provide `get-modular/canonical-bytes` and declare
no slots. The input-admission and composition-semantics declarations provide
their capability and declare no slots in M1.

## Feature skeleton in TypeScript

Every own feature lives under `packages/core/src/features/<feature>/` exactly
as the Feature Module Standard profile maps feature-owned slices. A feature
starts with its owner-local ports, its inert declaration, and its pure factory
in the same delivery, never as an ambient singleton wrapped later.

```text
packages/core/src/features/<feature>/
  ports.ts          types only: the provided port and the consumed port types
  declaration.ts    inert declaration constant and typed identity handles
  factory.ts        create<Feature>(deps): pure construction, no module state
  <implementation>.ts and further owned files

packages/core/src/features/<feature>/          feature with several implementations
  ports.ts                                      shared port types
  <implementation>/declaration.ts               one inert declaration per implementation
  <implementation>/factory.ts                   one pure factory per implementation

packages/core/src/features/<library>/          library feature, no module declaration
  internal.ts                                   curated pure functions and plain types
```

A feature with one implementation keeps `declaration.ts` and `factory.ts` at
its root. A feature with more than one implementation keeps one shared
`ports.ts` and one directory per implementation: canonicalization has
`features/canonicalization/owned-jcs/` from M1 and
`features/canonicalization/canonicalize-adapter/` after ADR-0010 is accepted.
The qualification-only witness variant uses the same two files outside `src`,
under `packages/core/tests/features/canonicalization/witness-variant/`.

Rules:

- `ports.ts` contains only `interface` and `type` declarations. A consumer
  feature imports a neighbor's port types from that file and, for a library
  feature such as diagnostics, the owner's curated `internal.ts`; it imports
  nothing else from a neighbor.
- `internal.ts` exists only in library features. It exports pure functions and
  plain types, never a factory, a declaration, or an implementation. The
  Foundation source-dependency policy records these two cross-feature edges,
  `ports.ts` and `internal.ts`, and rejects every other one.
- `declaration.ts` exports the inert declaration as a frozen constant and the
  typed identity handles used by the composition root and the allowlist. It
  performs no I/O and has no side effects on import.
- `factory.ts` exports one pure `create<Feature>(deps)` function. It receives
  closed typed dependencies, returns the provided port, keeps no module-level
  state, and performs no discovery.
- The facade imports only port types of its neighbors. It never imports a
  concrete implementation, a barrel, a registry, or a resolver.
- No feature exports a barrel over its whole directory. The module's curated
  public surface is `packages/core/src/index.ts` alone once it exists in M3;
  until then the direct subject entry `self-composition/stage0-entry.ts`
  re-exports the same accepted entry points for qualification.
- No generic `resolve()`, container, service locator, or string-keyed factory
  map exists anywhere in production source.

Illustrative signatures for the plan-output feature:

```ts
// features/plan-output/ports.ts
export interface CanonicalBytesPort {
  readonly canonicalize: (value: JsonValue) => Uint8Array;
}
// domain separation and digest spelling stay in plan-output, as ADR-0010 keeps
// them owned by the Core rather than by a replaceable adapter
export interface PlanEmissionPort {
  readonly emit: (normalized: NormalizedPlan) => Promise<PlanAndDigest>;
}
```

```ts
// features/plan-output/declaration.ts
export const planOutputDeclaration = Object.freeze({
  kind: "get-modular.module-declaration",
  schemaVersion: 1,
  moduleId: "get-modular/plan-output",
  implementationId: "get-modular/plan-output/default",
  // owner, provides, and slots exactly as in the inventory above
} as const);
export const planOutputImplementation = planOutputDeclaration.implementationId;
```

```ts
// features/plan-output/factory.ts
export interface PlanOutputDeps {
  readonly canonicalizer: CanonicalBytesPort;
}
export function createPlanOutput(deps: PlanOutputDeps): PlanEmissionPort {
  // pure construction; no I/O, no registry, no module state
}
```

### Closed dependency record

As proposed by ADR-0016, the closed dependency record that a factory receives
is a typed object literal whose keys are exactly the declared slot identifiers
of that feature. The slot identifiers in the inventory above are chosen from
the identifier-safe subset of the accepted `localToken` grammar, lowercase
letters and digits starting with a letter, and never equal an own property
name of `Object.prototype` or the name `then`; TypeScript checks that
every `create<Feature>` call site supplies exactly those keys, and the witness
checker rejects an own declaration whose slot identifier leaves that subset.

The accepted rule of ADR-0008 that identities never become property lookup
keys is preserved because no identity from a caller profile is ever used as a
key: the keys come from the feature's own declaration, and the composition root
or the emitter writes them as literals. Inside the compiler, every lookup keyed
by a module, implementation, capability, or slot identity uses a `Map`; the
form `record[id]` on an ordinary object is forbidden in production source.

Until ADR-0016 is accepted, implement this candidate rule and do not claim it.
If ADR-0011 is accepted instead with its null-prototype record refinement, the
change is confined to the composition root and the emitter output shape;
features and factories do not change.

## Composition roots and build topology

### One composition root

Production source contains at most one composition root, and it is generated.
In M1 no production composition root exists: `packages/core/src/composition/`
and `packages/core/src/index.ts` are absent, so no temporary production
composition is introduced, exactly as ADR-0008 requires when it says "Add the
minimal direct stage0 root in the same delivery; do not introduce a temporary
production composition." Every `create<Feature>` call in M1 happens in the
handwritten stage0 root `packages/core/self-composition/stage0.ts`, in
`dependencyOrder`, and nowhere else. That file is the "checked internal graph"
checkpoint that ADR-0008 allows as an explicit implementation checkpoint and
forbids as a release: a test compiles the own declarations and the own profile
through the direct subject's accepted entry points and proves that the plan's
`dependencyOrder` equals the order of construction in the file.

In M3 the production root appears as generated code:
`packages/core/src/composition/generated/stage1.ts`, listed in `.gitignore`,
emitted from P0 and imported by the public barrel `packages/core/src/index.ts`,
which is created in the same delivery. The stage0 root does not move and does
not survive as a second production root: it stays in `self-composition/` as
qualification machinery, and `src` holds exactly one composition root, the
generated one.

### Direct subject entry

ADR-0008 requires two temporary, hash-identified qualification subjects "with
the same public compiler boundary: one directly assembled and one generated",
and it forbids a stage0 public export in the distributed package. The direct
subject therefore has its own entry file,
`packages/core/self-composition/stage0-entry.ts`. It imports `stage0.ts` and
re-exports exactly the accepted compiler entry points and authoring helpers
that `src/index.ts` exports from M3, with the same names and types, and nothing
else. It is built only by `tsconfig.stage0.json`, is never packed into the
distributed archive, and is the module against which the M1 harness, the
checkpoint A test, and the direct half of every dual-subject gate run. Both
subjects expose the same accepted entry points, so the same independent
vectors and packed public-API checks run against both, as ADR-0008 requires.

### Build-only directory

Bootstrap, own profile, allowlist, and emitter tooling live beside the core's
build configuration and outside `src`, exactly as ADR-0008 requires and without
creating a third package:

```text
packages/core/
  self-composition/
    stage0.ts            handwritten literal assembly of the feature factories, M1 onward
    stage0-entry.ts      direct subject entry: re-exports the accepted entry points
    own-profile.ts       imports every feature's declaration constant and defines the own profile as data
    allowlist.ts         build-time map from declaration constants to typed import handles, M3
    emit.ts              the finite emitter and its input manifest, M3
  src/
    features/...
    composition/
      generated/stage1.ts   emitted in M3, never committed
    index.ts               public barrel, created in M3, imports the generated root
  tests/
    features/canonicalization/witness-variant/   qualification-only provider
    ...
  tsconfig.json                production build, M3: src only, includes the generated
                               root, excludes self-composition and tests
  tsconfig.stage0.json         stage0 build: src/features and self-composition; no
                               src/index.ts, no generated sources
  tsconfig.qualification.json  a stage0 or stage1 build plus tests/features: the only
                               build that sees the witness variant
```

The direct subject and the generated subject differ only in which file
constructs the facade and which entry file re-exports it; both expose the same
accepted entry points.

`tsconfig.stage0.json` includes `src/features/**` and `self-composition/**` and
excludes `src/index.ts` and `src/composition/generated/**`, so stage0
type-checks and builds from a clean checkout without the emitted file, as
ADR-0008 demands. The production `tsconfig.json` excludes `self-composition/`
and `tests/`. The qualification build adds `tests/features/**` on top of either
subject so that the witness variant can be bound; the import path that a
generated variant subject uses for it points outside `src` and never passes the
production `tsconfig.json`. The tarball allowlist includes the emitted `dist`
output and excludes `self-composition/`, generated sources, and tests, so the
witness variant cannot enter the archive.

Consumer evidence is not duplicated across subjects. The four TypeScript
consumer modes required by ADR-0007 and the 1000-declaration typecheck fixture
run against the retained generated stage1 subject, which ADR-0007 names in the
singular as the first packed implementation. The direct subject makes no claim
about declaration output; it passes the export, deep-import,
declaration-leakage and inert-import audits and the same independent vectors
as the generated subject.

The build-only directory is production-like source under a private package and
is admitted by the governance gate; the Foundation source-dependency policy
gives it its own boundary that may import features and their declarations but
that no feature may import. The same policy records the two allowed
cross-feature edges, a neighbor's `ports.ts` and a library owner's
`internal.ts`.

### Feature Module Standard classification

The organization standard allows exactly one dependency mechanism per
relationship. Self-composition uses the first two and never the third:

- Every edge of the own graph is the standard's second mechanism: a
  consumer-owned port whose provider is selected by module composition, here
  the own profile. Generated wiring is the form in which composition applies
  that selection, not a separate mechanism, and the emitter that writes it is a
  generator with a reviewable plan and a deterministic apply, which the
  standard recommends for generators. The plan is the accepted composition
  plan; the apply writes one file.
- The first mechanism, a static import and a typed factory or constructor,
  applies to the fixed library imports inside a feature: diagnostics, the
  comparator, the bounded collector, graph helpers and resource metering.
- Mechanism three, an explicit validated graph with an immutable activation
  plan for runtime provider selection, is not used inside the Core. The own
  plan exists at build time only and selects nothing at runtime.

This is a local extension of the standard, recorded in the Feature Module
Standard profile, not a deviation.

## Emitter specification

The emitter is finite and private. Its inputs are:

- the accepted composition plan produced by stage0 from the own declarations
  and the own profile, called P0; and
- the allowlist, a build-time `Map` whose keys are the `implementationId`
  constants exported by each feature's `declaration.ts` and whose values are
  typed handles naming the import path, the factory export, and the declaration
  export of that implementation. It is not the runtime string-keyed factory map
  that ADR-0008 forbids, it never enters `src`, it never repeats identity
  strings, and it never derives a path from an identity.

Its output is one ECMAScript module with these properties:

- UTF-8 with LF line endings, no timestamps, no absolute paths, no
  locale-dependent or target-dependent text;
- one static import per selected implementation, in `dependencyOrder`;
- one `const` per selected implementation, in `dependencyOrder`, whose
  initializer is a single factory call receiving an object literal with one
  key per bound slot and the provider constant as the value;
- exactly one `export const root` naming the constructed facade;
- no identity string anywhere in the file; the single leading comment records
  only the plan digest.

Only `required` cardinality is supported. The emitter fails the build with a
stable private error code, without writing output, when it encounters an
unknown implementation identity, a selection without an allowlist entry, a
binding whose provider is not selected, a slot with any other cardinality, more
than one provider, or an allowlist entry that is not reached by the plan.
Emission is never a fallback resolver: it does not choose defaults, inspect a
filesystem, or import dynamically.

Illustrative output for the M1 own profile:

```ts
// generated by the self-composition emitter from plan digest gm-plan:v1:sha-256:...
import { createOwnedJcs } from "../../features/canonicalization/owned-jcs/factory.js";
import { createCompositionSemantics } from "../../features/composition-semantics/factory.js";
import { createInputAdmission } from "../../features/input-admission/factory.js";
import { createPlanOutput } from "../../features/plan-output/factory.js";
import { createCompilerFacade } from "../../features/compiler-facade/factory.js";

const ownedJcs = createOwnedJcs({});
const compositionSemantics = createCompositionSemantics({});
const inputAdmission = createInputAdmission({});
const planOutput = createPlanOutput({ canonicalizer: ownedJcs });
const compilerFacade = createCompilerFacade({
  admission: inputAdmission,
  semantics: compositionSemantics,
  output: planOutput,
});

export const root = compilerFacade;
```

The emitted file is regenerated in a disposable directory during the build and
compared byte for byte against the file used by the build, as ADR-0008
requires. It is never hand-edited and never committed.

## Construction witness and checkpoint A

As proposed by ADR-0016, the construction witness has two parts and neither
instruments production code:

1. A static check reads the emitted file and P0 and proves that the set of
   imports equals the set of selected implementations, that every `const` is
   initialized by exactly one factory call, that the object literal keys of
   each call equal the bound slot identifiers of that consumer in P0, that
   every value is the constant of the bound provider, and that the order of
   constants equals `dependencyOrder`.
2. A behavioral test compiles a fixed input through the public boundary of the
   stage0 subject and of the generated stage1 subject, once with the own
   profile and once with the qualification variant that binds
   `get-modular/canonicalization/witness-variant`, whose canonical bytes carry
   a fixed prefix. The plan digest MUST change between the two bindings in
   both subjects and MUST be equal across subjects for the same binding.

Until ADR-0016 is accepted, implement this candidate witness and do not claim
it. The accepted text of ADR-0008 describes a witness that records the identity
of constructed objects; ADR-0016 proposes the static and behavioral form above
as its replacement because it needs no inert hook inside packed bytes.

Checkpoint A of ADR-0008 is reached when the first useful dependency edge
exists. That edge is `plan-output.canonicalizer`, the only edge in the M1 graph
with a second, qualification-only provider. Checkpoint A is passed when:

- the own declarations and the own profile compile with `ok: true` through the
  accepted entry points re-exported by `self-composition/stage0-entry.ts`;
- the plan's `dependencyOrder` equals the construction order in
  `self-composition/stage0.ts`; and
- rebinding `canonicalizer` to the witness variant changes the digest of a
  fixed input compiled through the public boundary.

The stronger two-edge and three-change checkpoint of ADR-0011 applies only
after ADR-0011 or its narrower successor is accepted, as the roadmap records.

## What M1 lays down so that M3 adds the emitter without refactoring

The first private package lands these seven properties. Each is required by
ADR-0008 or the Feature Module Standard, and together they make the emitter a
one-file change later:

1. Every feature has `ports.ts`, `declaration.ts`, and `factory.ts` with the
   identities from the inventory above, and no barrel over the feature.
2. The facade receives its neighbors through its `deps` record and imports
   only port types.
3. Exactly one composition file exists: `self-composition/stage0.ts` in M1 and
   the generated `src/composition/generated/stage1.ts` from M3. Every
   `create<Feature>` call outside tests happens there in `dependencyOrder`, and
   `src` never contains a handwritten composition root.
4. The canonicalization implementations, and in M2 the scanner implementations,
   sit behind consumer-owned ports in per-implementation directories with their
   own declarations and factories, so binding replacement is a data change and
   the witness variant stays under `tests/`.
5. The closed dependency record is a typed object literal keyed by declared
   slot identifiers, and every identity-keyed lookup inside the compiler uses a
   `Map`.
6. The own profile exists as data in `self-composition/own-profile.ts` from
   M1; it aggregates the feature-owned declaration constants and repeats no
   identity string, even though only the handwritten stage0 root consumes it.
7. A checked-internal-graph test compiles the own profile through the accepted
   entry points of `self-composition/stage0-entry.ts`, asserts `ok: true`, and
   asserts that `dependencyOrder` equals the construction order of
   `self-composition/stage0.ts`.

## Out of scope

This guide does not decide the hermetic build sandbox, content-addressed
custody, release capsule, quarantine, or the `SourceManifest` and
`BuildContext` record formats; those remain proposed in ADR-0011 and are
scheduled by the roadmap's release checkpoint. It does not decide the six
runtime cases, which ADR-0007 reserves for the first conformance claim. It does
not accept ADR-0016; until that decision is accepted, the dependency-record and
witness rules above are candidate rules, and every claim about them remains
`CONDITIONAL`.
