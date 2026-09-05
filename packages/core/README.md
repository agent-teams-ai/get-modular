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

Arbitrary executable Proxy behavior, malformed invocation wrappers, raw input
carriers and duplicate binding-record semantics are outside this M1 scope.
The public root exports `compileComposition`, `defineModule`, `required`,
`optional` and `many`, with the accepted wire types. Private feature imports,
`compileCompositionJson` and runtime loading are not public APIs.
