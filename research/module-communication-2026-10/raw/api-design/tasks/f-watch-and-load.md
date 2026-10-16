# Task (f): follow and load the same key in one module

Write `createRegionPanelModule` in `f-watch-and-load.ts`, starting from `f-watch-and-load.skeleton.ts`.
Use only the API in `api.d.ts` and its README. The fixed types are in `f-watch-and-load.types.ts`.

The module provides the capability `"acme/region-panel"`: `view()` returns the panel.

1. `label` is `regionLabel(region)` of the current region and follows every change of `region`.
2. `holidays` are loaded with `fetchHolidays` for the current region, and again whenever `region` changes:
   `loading` until a result, then `ready` or `failed`. While a newer region is loading, `holidays` is `loading`;
   it never shows holidays or a failure of an older region after a newer one was chosen.
3. Both follow `region` for as long as the module's scope is open. The factory does not wait for a fetch.

Rules: no `any`, no type assertions (`as`; the const assertion `as const` is allowed), no `@ts-` directives. Do not edit the types file.
Check: `./check.sh <variant> <your output dir>`.
