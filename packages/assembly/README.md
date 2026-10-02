# @get-modular/assembly

Optional pre-1.0 construction support above the public `@get-modular/core` root.
Node.js `>=24.18.0 <25` or `>=26.10.0 <27`; Node.js 25 is unsupported and
Node.js 24.18 remains the production/default toolchain. ESM; TypeScript
consumer floor 5.8.3.

See the repository's [consumer quickstart](https://github.com/agent-teams-ai/get-modular/blob/main/docs/guides/consumer-quickstart.md)
for an executable Host with diagnostics, cancellation, and cleanup.

`assemblyFor<C>()` returns `bindFactory`, `bindInput` and `prepare`. Describe each
Host-owned capability in `C` using `CapabilityContract<Value, ExactToken>`. Pass a
literal Core declaration to `bindFactory`; its slots determine the callback's
dependency record. The callback receives that record and `{ signal, scope }`, where
`scope` is the opaque value passed to `run()`, and returns an ordinary current-realm
Promise fulfilling with `{ instance, capabilities }`. Assembly never reads, awaits,
freezes or disposes `scope`. `bindInput` binds a declaration without slots whose
capability record every run supplies instead of a factory.

Module, implementation, profile and capability identities, and exact compatibility
tokens, use Core's portable grammar, for example `synthetic/store` and
`synthetic/v1`. Owner path segments and slot IDs remain local, for example `store`.
Returned capability records use the full capability IDs as keys; dependency
records use the consumer's local slot IDs.

Compile with public Core, then call
`prepare({ composition, factories, roots: { app: appHandle }, inputs })`.
Factory handles appear only in `factories` and input handles only in `inputs`,
each under one alias; together they cover every selected module, and an input is
never a root. A `"prepared"` result exposes `prepared.run({ signal, scope, inputs })`.
Every option may be omitted or `undefined`, except that an assembly prepared with
inputs needs one capability record per input alias on every run. An omitted signal
gets a fresh signal for that attempt. Invalid inputs fail with phase `"inputs"` and
code `assembly.run.invalid-inputs` before any factory runs; inputs are borrowed and
never appear in `created`. One prepared assembly serves many concurrent runs.
Preparation failures have `status: "failed"`, a stable `error.code`, an opaque
cause, and separate Core `diagnostics`.

Run outcomes have status `"succeeded"`, `"failed"` or `"cancelled"`. Successful
`roots.app` has the instance type inferred from `appHandle`. Every outcome has
an ordered `created` journal. A failed outcome also has `phase`, `code`, `cause`,
`implementationId`, `cancellation` and `returned`. When `returned` is present,
it contains the exact untransferred fulfillment and its implementation ID.

The Host owns authorization, resource ownership and cleanup. Assembly performs
no rollback or disposal. Shared capability references can describe the same
resource several times; Host cleanup must account for that sharing. Cancellation
waits for an in-flight factory to settle. Construction does not establish readiness.

The package freezes its metadata, records, arrays and journals. Instance objects,
capability values, causes, signals, run scopes and input records remain opaque.
Direct thenable objects, Promise subclasses and Promises with own string properties
or symbol accessors are unsupported factory carriers. Own symbol data properties
used by Node async context tracking are permitted and ignored.

Build Core first, then run this package's `build`, `typecheck` and `test` commands.
The runtime test command also invokes the minimum and build TypeScript compilers
in NodeNext and Bundler modes. Test configurations disable `isolatedDeclarations`
and `erasableSyntaxOnly`; production compiler settings remain independently enforced.

Packed tests install local Core and assembly archives into a disposable consumer,
exercise the synthetic Host, and check typed wiring, deliberate negative fixtures
and 1000 literal declarations. The scale fixture is only typechecked.

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
