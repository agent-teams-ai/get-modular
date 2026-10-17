# Task (h): per-call work inside a long-lived module

Write `createQuotesModule` in `h-requests.ts`, starting from `h-requests.skeleton.ts`.
Use only the API in `api.d.ts` and its README. The fixed types are in `h-requests.types.ts`.

The module lives as long as the application and is called thousands of times per minute.
It provides the capability `"acme/quotes"`:

1. `convert(eur)` returns `eur * eurUsd`, with the rate that is current at the moment of the call,
   including right after a change.
2. `openTicker(screen)` shows the current rate on the screen at once, then every change of `eurUsd`, until
   `ticker.close()`. Many tickers may be open at the same time, and thousands are opened and closed per day.
   After a ticker is closed, nothing about it may remain registered anywhere, and its screen gets no further
   `show`. A screen that throws must not stop the other screens.
3. `ticker.close()` resolves once the ticker is released. If the ticker holds a scope, note that the scope's
   `control.close()` never rejects: it returns a report, and `ticker.close()` must reject when `report.complete`
   is `false`.

Rules: no `any`, no type assertions (`as`; the const assertion `as const` is allowed), no `@ts-` directives. Do not edit the types file.
Check: `./check.sh <variant> <your output dir>`.
