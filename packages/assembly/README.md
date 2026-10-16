# @get-modular/assembly

Optional pre-1.0 construction support above the public `@get-modular/core` root.
Node.js `>=24.18.0 <25` or `>=26.10.0 <27`; Node.js 25 is unsupported and
Node.js 26.11 is the production/default toolchain. ESM; TypeScript
consumer floor 5.8.3.

See the repository's [consumer quickstart](https://github.com/agent-teams-ai/get-modular/blob/main/docs/guides/consumer-quickstart.md)
for an executable Host with diagnostics, cancellation, and cleanup.

A contract owner publishes one descriptor per capability with
`defineContract<Value>()({ id, revision })`, where `revision` is an integer from 1
to 2147483647. Module authors write declarations with `declareModule`, for example
`declareModule({ moduleId, implementationId, owner, provides: [Orders.provide()], slots: [Db.slot("db", required())] })`.
`declareModule` supplies `kind` and `schemaVersion`, and each entry carries the exact
compatibility token `<id>/r<revision>`, so Core rejects a slot built from another
revision. `CapabilitiesOf<typeof Db | typeof Orders>` derives the capability map `C`.
Name a map over many descriptors as an interface,
`interface HostCapabilities extends CapabilitiesOf<typeof Db | typeof Orders> {}`;
a type alias over hundreds of contracts multiplies type-check time. In 0.3.0,
hand-written `CapabilityContract<Value, ExactToken>` maps and literal Core
declarations remain valid.

`implement<C>()` creates a module entry from a literal declaration and factory,
and `input<C>()` creates the `{ declaration }` entry for a slot-free input. The
factory receives its typed dependencies and `{ signal, scope }`, and returns an
ordinary current-realm Promise fulfilling with `{ instance, capabilities }`.
Assembly never reads, awaits, freezes or disposes `scope`. A module package names
the callback type as `ModuleFactory<C, typeof declaration, Instance>`, with its
own map as `C`. The optional third argument is a `ContextAdapter`, such as
`scoped` from `@get-modular/resources`; it runs once with the implementation ID
and the factory, and its returned function is stored in the entry.

An entry is a frozen null-prototype `{ declaration, factory }` pair and is
invariant only in the capabilities its declaration uses. Teams create entries
under their own maps, and a Host prepares them together when every capability an
entry uses has the identical contract in the preparing map. `group(name, members)`
creates a frozen static group and records the union of its members' used keys.
`entriesOf(modules)` returns a frozen depth-first flattened array. Groups carry
navigation labels only; nesting and order never change the profile, plan or
digest.

Module, implementation, profile and capability identities, and exact compatibility
tokens, use Core's portable grammar, for example `synthetic/store` and
`synthetic/v1`. Owner path segments and slot IDs remain local, for example `store`.
Returned capability records use the full capability IDs as keys; dependency
records use the consumer's local slot IDs.

A production root lists its modules once and lets Assembly complete the profile
(ADR-0035): `prepare({ profileId, bindings, modules, roots: { app: appEntry }, inputs })`.
In this form `modules` must be a tuple. An annotated array loses the per-entry map
check and is rejected. Selections are all module and input entries, and roots are
module entries reached through `modules`. A `required` slot without a row in
`bindings` binds to the single other module entry that provides its capability id,
at any revision; Core still rejects a revision mismatch with
`assembly.prepare.core-rejected`. Every other slot without a row (`optional`,
`many`, or `required` with zero or several candidates) fails with
`assembly.prepare.unresolved-binding` before any factory runs. `error.cause`
lists every such slot as `UnresolvedBinding` entries with `groupPath` and its
candidates. `groupPath` is `[]` at top level and otherwise contains the group
names from `modules` down to the consumer. An `optional` slot always needs a row,
`[]` or one provider. Completion does not depend on the order of `modules`,
`roots` or `inputs`, and it runs once in `prepare`. A `"prepared"` result also
carries the compiled `composition`.

A Host that compiles a profile itself, such as from bytes or a desired profile,
compiles with public Core and calls
`prepare({ composition, modules, roots: { app: appEntry }, inputs })`; give
exactly one of `composition` and `profileId`. This form accepts a plain
`readonly AnyModuleEntry<C>[]`, because a Host may build its list at run time and
Core checks the resulting plan. Module entries appear only in `modules` and input
entries only in `inputs`, each under one alias; together they cover every selected
module, and an input is never a root. Duplicate implementation IDs fail with
`assembly.prepare.duplicate-module` before any factory runs. Its `cause` has one
`DuplicateModule` per ID, sorted by ID, with every module occurrence in `paths`
and every input alias in `inputs`; there is no deduplication. A `"prepared"`
result exposes `prepared.run({ signal, scope, inputs })`. Every option may be
omitted or `undefined`, except that an assembly prepared with inputs needs one
capability record per input alias on every run. An omitted signal gets a fresh
signal for that attempt. Invalid inputs fail with phase `"inputs"` and code
`assembly.run.invalid-inputs` before any factory runs; inputs are borrowed and
never appear in `created`. One prepared assembly serves many concurrent runs.
Preparation failures have `status: "failed"`, a stable `error.code`, an opaque
cause, and separate Core `diagnostics`.

Run outcomes have status `"succeeded"`, `"failed"` or `"cancelled"`. Successful
`roots.app` has the instance type inferred from `appEntry`. Every outcome has
an ordered `created` journal. A failed outcome also has `phase`, `code`, `cause`,
`implementationId`, `cancellation` and `returned`. When `returned` is present,
it contains the exact untransferred fulfillment and its implementation ID.

The Host owns authorization, resource ownership and cleanup. Assembly performs
no rollback or disposal. Shared capability references can describe the same
resource several times; Host cleanup must account for that sharing. Cancellation
waits for an in-flight factory to settle. Construction does not establish readiness.

The package freezes its metadata, records, arrays and journals. Instance objects,
capability values, causes, signals and run scopes remain opaque. Input records are borrowed and never frozen; only their own data properties are read.
Direct thenable objects, Promise subclasses and Promises with own string properties
or symbol accessors are unsupported factory carriers. Own symbol data properties
used by Node async context tracking are permitted and ignored.

Build Core first, then run this package's `build`, `typecheck` and `test` commands.
The runtime test command also invokes the minimum and build TypeScript compilers
in NodeNext and Bundler modes. Test configurations disable `isolatedDeclarations`
and `erasableSyntaxOnly`; production compiler settings remain independently enforced.

Packed tests install local Core and assembly archives into a disposable consumer,
exercise the synthetic Host, and check typed wiring, deliberate negative fixtures
and 1000 literal declarations. The scale fixture is only typechecked. A separate
test type-checks 500 entries created by 20 team maps and prepared under one Host map
against the workspace build.

Each Assembly release is published with exactly the Core release of the same
version. Every release still requires registry reconciliation and downloaded-byte
consumer checks; source tests alone do not establish publication or conformance.

Release validation can reuse the same consumer checks without packing or deleting
supplied archives. Set `GET_MODULAR_ASSEMBLY_ARCHIVE` and
`GET_MODULAR_PUBLISHED_CORE_ARCHIVE` to retained absolute archive paths, plus
`GET_MODULAR_ASSEMBLY_SHA256`, `GET_MODULAR_ASSEMBLY_INTEGRITY`,
`GET_MODULAR_PUBLISHED_CORE_SHA256` and `GET_MODULAR_PUBLISHED_CORE_INTEGRITY`
from the release record. Run
`node --test tests/assembly/packed-root.test.mjs` from the repository.
The harness checks physical archive contents, installed byte equality, runtime
and type consumers, and emits identities and observations for retention. The
release operator separately authenticates the Core archive's registry origin;
input hashes alone do not prove where an archive came from.
