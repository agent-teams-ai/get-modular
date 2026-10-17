# Task (e): an asynchronous factory

Write `createAuditModule` in `e-async-factory.ts`, starting from `e-async-factory.skeleton.ts`.
Use only the API in `api.d.ts` and its README. The fixed types are in `e-async-factory.types.ts`.

The module:

1. Opens the audit log with `openAuditLog(retentionDays, { signal })`, using the current `retentionDays`.
   Opening takes a while, and the factory waits for it.
2. Keeps the log's retention equal to `retentionDays` for as long as the module's scope is open. A change
   made while the log is still opening must not be lost.
3. The log holds a connection: it is closed when the module's scope closes, including when the scope starts
   closing while the log is still opening. In that case the factory fails instead of returning a module.
4. Provides the capability `"acme/audit"`: `record(entry)` appends to the log, and returns the log as `instance`.

Rules: no `any`, no type assertions (`as`; the const assertion `as const` is allowed), no `@ts-` directives. Do not edit the types file.
Check: `./check.sh <variant> <your output dir>`.
