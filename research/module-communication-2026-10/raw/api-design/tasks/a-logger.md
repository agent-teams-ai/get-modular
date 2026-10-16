# Task (a): a logger that changes its level at run time

Write `createLoggerModule` in `a-logger.ts`, starting from `a-logger.skeleton.ts`.
Use only the API in `api.d.ts` and its README. The fixed types are in `a-logger.types.ts`.

The module:

1. Creates a console sink with the current `logLevel` from `deps.settings`.
2. Provides the capability `"acme/logger"`: `log(level, message)` writes through the sink.
3. Whenever `logLevel` changes, sets the new threshold on the sink, for as long as the
   module's scope (`resources`) is open. A change made right after the module read the
   level must not be lost.
4. Returns the sink as `instance`.

Rules: no `any`, no type assertions (`as`; the const assertion `as const` is allowed), no `@ts-` directives. Do not edit the types file.
Check: `./check.sh <variant> <your output dir>`.
