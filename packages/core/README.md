# Get Modular Core

Get Modular compiles module declarations and an explicit composition profile
into a deterministic plan and content digest. It does not execute factories
or manage application lifecycle.

This development checkpoint uses direct assembly and is not self-composed.
It does not claim runtime conformance or release eligibility.

Declaration consumers require TypeScript 5.8.3 or later. The packed regression
tests both this minimum and the pinned build compiler in `NodeNext` ESM and
CommonJS contexts, `Node16` ESM, and `Bundler`, with `skipLibCheck: false` and
1,000 literal declarations in each supported mode. `Node16` CommonJS, `Node10`
and `Classic` are unsupported and have explicit negative checks.

```ts
import { compileComposition, defineModule } from "@get-modular/core";

const app = defineModule({
  kind: "get-modular.module-declaration",
  schemaVersion: 1,
  moduleId: "example/app",
  implementationId: "example/app/default",
  owner: { authority: "example", path: ["app"] },
  provides: [],
  slots: [],
});
const result = await compileComposition({
  declarations: [app],
  profile: {
    kind: "get-modular.composition-profile",
    schemaVersion: 1,
    profileId: "example/default",
    roots: [app.moduleId],
    selections: [{ moduleId: app.moduleId, implementationId: app.implementationId }],
    bindings: [],
  },
});
if (result.ok) console.log(result.plan, result.digest);
else console.log(result.diagnostics);
```

The object entry accepts cooperative Host-owned invocation records and dense
ordinary declaration lists. It snapshots admitted data synchronously; later
caller mutation cannot change the returned plan or digest. Results are deeply
frozen. Helpers construct inert data; the compiler performs validation.
Internal canonicalization or hashing failures reject the Promise.

Within the admitted resource envelope, equivalent inputs produce the same
eligible diagnostics and successful plan/digest. Outside the JSON value,
string-byte or depth envelope, compilation rejects with a truthful saturated
resource diagnostic; a different enumeration can encounter a different limit
first. Complete diagnostic coverage and the same chosen limit are not promised
there. Batch value/string rejection retains no admitted documents; depth
rejection is local to its document.

The public root exports `compileComposition`, `compileCompositionJson`,
`defineModule`, `required`, `optional` and `many`, with the accepted wire types.
Private feature imports and runtime loading are not public APIs.

The raw entry accepts one record with `readonly declarations: readonly Uint8Array[]`
and `readonly profile: Uint8Array`. Each view contains one UTF-8 JSON document;
strings and other typed-array carriers are rejected. It snapshots accepted byte
views synchronously, before the returned Promise can suspend. JSON numeric
lexemes are validated before rounding: exact safe integers such as `1.0` and
`1e0` are accepted; fractional values, unsafe integers and negative zero are
rejected where an integer is required.

```ts
import { compileCompositionJson } from "@get-modular/core";

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const rawResult = await compileCompositionJson({
  declarations: [encode(app)],
  profile: encode({
    kind: "get-modular.composition-profile",
    schemaVersion: 1,
    profileId: "example/default",
    roots: [app.moduleId],
    selections: [{ moduleId: app.moduleId, implementationId: app.implementationId }],
    bindings: [],
  }),
});
```

The raw wrapper requires own data properties and a dense declaration list.
Missing elements or accessor properties reject the wrapper without calling
getters. A list longer than 4096 declarations can fail before reading document
bytes; that failure does not claim byte validation. Arbitrary executable Proxy
behavior remains outside the cooperative Host boundary.

Repeated binding records for one consumer/slot are rejected with
`binding.duplicate-record`; they are not merged or resolved by first/last wins.
Invalid groups contribute no dependency edges, while independent eligible
failures remain visible. Consumers migrating from M1 must handle the additive
`input.invalid-byte-carrier` and `binding.duplicate-record` diagnostic cases.
The M2 source checkpoint still does not claim completed retained qualification,
generated self-composition or runtime conformance.
