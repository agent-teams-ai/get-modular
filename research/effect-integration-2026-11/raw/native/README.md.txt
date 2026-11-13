# Native Get Modular → Effect Layer qualification spike

Observed 2026-11-09. **Research evidence, not a production integration package.**

## Subject and inputs

- Get Modular source: `5fb83478dd7b95216be92c4d3077eddf2774eef8`.
- Core and Assembly public root APIs, built by the repository's prescribed frozen installation and `assembly:build` route in this session.
- Published `effect@4.1.2`, `typescript@7.0.2`, `@types/node@24.19.1`.
- Node `24.22.1`.
- Effect/TypeScript dependencies are read-only links into the isolated toolkit at `/workspace/scratch/44ef6f5b5546/effect-integration-tools/node_modules`.
- GM package links point to `/workspace/scratch/44ef6f5b5546/get-modular-plans/packages/{core,assembly}`.

This is actual execution of the built public GM APIs with the published Effect package, including one bounded local FileHandle resource test. It is not a packed-package installation test, a production-consumer adoption, a network/product E2E test, or an admitted public package.

## Files and ownership

| File | Role |
| --- | --- |
| `native-composition.ts` | 196-line qualification mapper and minimal typed native entries |
| `fixture.ts` | Ordinary consumer declarations, factories and independent explicit binding rows |
| `native-composition.test.ts` | Eight runtime tests of the real mapper |
| `native-composition.types.ts` | Positive type contracts and twelve intentional negative fixtures |
| `input-memoization.test.ts` | One paired native memoization experiment independent of the mapper |
| `tsconfig.json` | Strict TS 7 checking, exact optional properties, unchecked indexed access and skipLibCheck=false |
| `evidence.json`, `*.stdout.txt` | Source hashes, versions, executed command statuses and output |

Only the mapper's three private assertions erase heterogeneous records: entry type witnesses; the dependency record proven by captured declarations plus Core bindings; and typed E/R/roots reconstructed from that same authenticated inventory. Consumer code has no wiring casts, `any`, `@ts-nocheck` or double-unknown casts. Literal `as const` tuple preservation is intentional.

## Executed commands

From this directory:

```sh
node node_modules/typescript/bin/tsc -p tsconfig.json --pretty false
node --test native-composition.test.ts input-memoization.test.ts
```

The exact last-run status and source hashes are in `evidence.json`. The ordinary test command covers both runtime files. Node type stripping alone is not counted as typechecking.

## What the eight mapper tests prove

1. **Lazy construction and exact injection:** zero factory calls before native Layer execution; two providers of one capability in distinct local slots; a diamond provider acquired once; absent optional as an own undefined field; ordered many and one-element many remain arrays.
2. **Independent builds:** executing the same described graph in independent runtime scopes acquires and releases separate instances.
3. **Snapshot linkage:** mutation of the original owner-path array and profile rows cannot change captured entries or the pending preparation.
4. **Present optional:** the declared optional slot can select and call its provider.
5. **Native parallel acquisition:** Deferred barriers prove both independent providers start before either barrier is released; no timing-based sleep oracle.
6. **Preflight failure:** invalid bindings, duplicate inventory and wrong roots reject before any module acquisition.
7. **Native failure/cancellation:** a tagged expected construction error stays typed as BootFailure; interruption of pending construction and construction failure each release the acquired resource once.
8. **Native graph dependent-finalizer ordering:** a real FileHandle is acquired by a mapped provider. The dependent's native finalizer waits on a Deferred, asynchronously reads that file, and completes before the provider closes it. The test runs through the actual mapper's flat merge of nodes and native provide graph; it asserts the complete event order and that the provider remains open while the dependent finalizer is blocked.

Items 1/2 share a runtime test, while failure and cancellation are separate tests: the total is eight mapper test cases, plus the separate paired memoization case. The FileHandle case proves this concrete mapped dependency/finalizer topology, not arbitrary drain safety or physical cancellation of foreign IO. A failed test's emergency temporary-file cleanup is explicitly outside the provider-release assertion.

The positive type fixture preserves `Layer<Roots, never, Config>` and `Layer<TypedRoots, BootFailure, Config>`; construction Scope is satisfied by Layer while the required Config service remains. All twelve expected rejections are checked by the compiler, including wrong slot, optional narrowing, readonly many, one-element-many shape, Promise factory, wrong capability value/revision, widened declaration, one-known-plus-one-unknown capability inventory, missing R and erased E.

## Paired memoization finding

The additional experiment supplies different Input services to two branches under **one native Layer memoization domain**.

- BAD: both branches reuse the same implementation Layer object. Observed roots both capture `left-input`, with one acquisition and one release.
- GOOD: each input instantiation creates its own implementation Layer object. Observed roots capture `left-input` and `right-input`, with two acquisitions and two releases.

Both executions are expected results of the experiment; BAD is an intentionally unsafe recipe, not a claim that Effect is defective. The oracle checks the mismatch against the independent intended inputs.

**P2-API-inputs:** a production prepared API cannot declare borrowed inputs and then expose only `.layer(rootKey)`. It needs an input parameter, required when input declarations are nonempty, plus complete validation before acquisition.

**P2-input-memoization:** adding an input parameter is insufficient if the compiled object reuses one implementation Layer graph across distinct input values. A created Layer must capture one input set; distinct input instantiations require separate implementation Layer identities/memo domains. The production identity rule is broader: **each call to prepared.layer(tag, options?) creates fresh implementation Layer objects, even without borrowed inputs**, because separate calls may also receive different ambient Config/R values in a common memoization domain. Reusing the returned Layer deliberately shares its instances. The mapper in this spike has **no borrowed inputs** and currently lowers its graph once per prepare; it does not implement or qualify that production call-level isolation rule. Its independent-build test covers separate runtime/memoization domains only. The paired native experiment qualifies the design issue rather than pretending the production input/isolation implementation already exists.

## What this prototype deliberately omits

- Group authoring, profile completion, borrowed inputs and the full production preflight envelope.
- Existing Assembly's hardened accessor/Proxy/limit behavior. The prototype assumes ordinary trusted declaration/profile data and uses structuredClone for capture. It does not duplicate the existing ~500-line preflight policy.
- Production product-shape validation, full compatibility/release admission, public API baselines or Conformance adaptation.
- A Promise/Effect carrier union, runtime selection hooks, a scheduler, retry policy, a lifecycle manager or an event system.
- A numeric startup concurrency cap. Native Layer merge/provide chooses its own acquisition fanout here; the overlap test does not establish bounded concurrency.
- Host admission/drain for escaped native operations, physical interruption of arbitrary Promise IO, or cleanup-debt equivalence to GM Resources.

Internal service keys use a transient per-preparation sequence plus implementation identity, never capability identity alone. This isolates prepared graphs within this adapter copy and keeps local-slot selection exact. These keys do not enter the Core plan/digest. Root/native Context keys are trusted Host values and must be stable and suitably unique; identical Effect key strings are not distinct services merely because they are represented by distinct objects. The mapper does not sandbox executable Context.Key objects or promise global uniqueness across independently loaded adapter copies.

## Consequence for the implementation plan

Native Layer lowering is technically viable with the desired small consumer shape and native E/R. A `prepared.run()` Promise wrapper is unnecessary for this path.

Production should reuse one neutral declaration/preparation owner in existing Assembly rather than shipping this prototype's reduced capture or duplicating profile completion. The proposed EntryFamily/Wiring seam is data transport only. Promise execution keeps its current journal/settlement contract; Effect execution keeps its native scoped construction contract.

No broad scale benchmark was added. The small proofs determine the architecture; existing large typed fixtures should be reused when the actual production entry/group API is implemented.
