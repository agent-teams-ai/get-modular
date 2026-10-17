# Task (c): a module that owns a derived store

Write `createPricingContextModule` in `c-pricing-context.ts`, starting from
`c-pricing-context.skeleton.ts`. Use only the API in `api.d.ts` and its README. The fixed
types are in `c-pricing-context.types.ts`.

The module:

1. Owns a store of `PricingContext`: `currency` from the settings and
   `vatRate = vatRateFor(region)`. It is the only writer of that store.
2. Keeps the store in step with `currency` and `region` for as long as the module's scope
   is open. A change made right after the module read the settings must not be lost.
3. Provides the capability `"acme/pricing/context"` so that child features can read and
   follow it but never write it.
4. Reports subscriber failures of its own store through `deps.errors.report`.

Rules: no `any`, no type assertions (`as`; the const assertion `as const` is allowed), no `@ts-` directives. Do not edit the types file.
Check: `./check.sh <variant> <your output dir>`.
