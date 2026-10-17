# Task (g): a parent that owns a derived store, and a child that follows it

Write both factories in `g-hierarchy.ts`, starting from `g-hierarchy.skeleton.ts`.
Use only the API in `api.d.ts` and its README. The fixed types are in `g-hierarchy.types.ts`.

The parent, `createPricingOwnerModule`:

1. Owns a store of `PricingContext` and is its only writer: `currency` from the settings,
   `vatRate = vatRateFor(region)`, and `discountPercent`, which starts at 0.
2. Keeps `currency` and `vatRate` in step with the settings. An accepted discount stays when the settings change.
3. Provides `"acme/pricing/context"` (children read and follow it, never write it) and
   `"acme/pricing/discounts"`: for a code that `discountFor` knows, `requestDiscount(code)` sets `discountPercent`
   and returns `"accepted"`; for an unknown code it returns `"rejected"` and changes nothing.
4. Reports subscriber failures of its own store through `deps.errors.report`.

The child, `createCheckoutModule`:

1. Creates a display with `createTotalDisplay()` and returns it as `instance`.
2. Provides `"acme/checkout"`: `setNet(net)` sets the net amount, and `applyCode(code)` asks the parent through
   `deps.discounts` and returns its answer.
3. Shows `grossTotal(net, vatRate, discountPercent)` on the display at once when the net amount changes, and again
   whenever `vatRate` or `discountPercent` changes, for as long as its scope is open. The net amount starts at 0;
   showing that first total (0) when the module is created is optional and not checked.

Rules: no `any`, no type assertions (`as`; the const assertion `as const` is allowed), no `@ts-` directives. Do not edit the types file.
Check: `./check.sh <variant> <your output dir>`.
