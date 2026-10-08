# Topic D - TypeScript void callbacks (root check, 2026-10-01)

Retrieved by root with `gh api` on 2026-10-01. Not part of the hosted critics'
input packet (added after their launch); used only in the root synthesis.

1. TypeScript Handbook, "More on Functions", section "Return type `void`"
   (microsoft/TypeScript-Website branch v2 @ `6556b08756b766fd41d0f887174cb0b042e5f72c`,
   `packages/documentation/copy/en/handbook-v2/More on Functions.md`):
   - "Contextual typing with a return type of `void` does **not** force functions to **not** return something."
   - "a contextual function type with a `void` return type (`type voidFunc = () => void`), when implemented, can return _any_ other value, but it will be ignored."

2. typescript-eslint rule `no-misused-promises`, option `checksVoidReturn`
   (typescript-eslint/typescript-eslint main @ `358a8168d6c0a8df61ac45f3bd93ccce71bde05a`,
   `packages/eslint-plugin/docs/rules/no-misused-promises.mdx`):
   - "passing a `() => Promise<void>` to a `() => void` parameter or JSX attribute can lead to a floating unhandled Promise"

Inference: a hook typed `(view) => void` silently accepts an `async` callback.
Its completion is not awaited and its rejection is unobserved unless the Host
explicitly detects a returned thenable. The callback contract (synchronous,
returned Promise is a reported violation, or explicitly awaited) must be fixed in
the first version of every hook port; widening it later changes timing for
existing callers (compare .NET 11 `ChangeToken.OnChange` silent overload
rebinding in topic A, item 1.4).

## Root compiler check (2026-10-01, local, no repository change)

TypeScript 5.1 release notes (TypeScript-Website @ `6556b087`, "Easier Implicit
Returns for `undefined`-Returning Functions") allow an `undefined`-returning
function type without a `return` statement. Root compiled this fixture with
`--strict` on TypeScript **5.8.3** (Get Modular minimum) and **7.0.2** (pinned):

```ts
type OnChange = (next: { readonly revision: number }) => undefined;
const ok: OnChange = (next) => { console.log(next.revision); };          // accepted
const bad: OnChange = async (next) => { console.log(next.revision); };   // TS2322
type VoidCb = (next: { readonly revision: number }) => void;
const silentlyAccepted: VoidCb = async (next) => { console.log(next.revision); }; // accepted
```

Both compilers report only `TS2322: Type '(next: ...) => Promise<void>' is not
assignable to type 'OnChange'. Type 'Promise<void>' is not assignable to type
'undefined'.` A `=> undefined` callback type therefore rejects async callbacks at
compile time, while `=> void` silently accepts them. This is a type-level guard
only; JavaScript callers and casts can still pass a Promise-returning function.
