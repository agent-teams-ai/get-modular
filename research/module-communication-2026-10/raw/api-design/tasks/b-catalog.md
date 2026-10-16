# Task (b): a model catalog that loads by region, with cancellation

Write `createCatalogModule` in `b-catalog.ts`, starting from `b-catalog.skeleton.ts`.
Use only the API in `api.d.ts` and its README. The fixed types are in `b-catalog.types.ts`.

The module:

1. Loads the models for the current `region` with `fetchModels` when it starts, and again
   whenever `region` changes, for as long as the module's scope is open.
2. Cancels a fetch that a newer region made outdated. While a newer region is loading, `current()`
   returns `loading`: it never returns models or a failure of an older region after a newer one was chosen.
3. Provides the capability `"acme/catalog"`: `current()` returns `loading` until the first
   result, then `ready` with the region and models, or `failed` with the region and cause.
4. Returns without waiting for the first fetch.

Rules: no `any`, no type assertions (`as`; the const assertion `as const` is allowed), no `@ts-` directives. Do not edit the types file.
Check: `./check.sh <variant> <your output dir>`.
