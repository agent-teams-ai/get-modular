# Task (d): a module that reads a value once and does not follow it

Write `createGreeterModule` in `d-greeter.ts`, starting from `d-greeter.skeleton.ts`.
Use only the API in `api.d.ts` and its README. The fixed types are in `d-greeter.types.ts`.

The module:

1. Reads `locale` once when it is created and builds the greeter with it.
2. Does not follow later changes: a new locale takes effect only when the Host
   creates the module again.
3. Provides the capability `"acme/greeter"`.

Rules: no `any`, no type assertions (`as`; the const assertion `as const` is allowed), no `@ts-` directives. Do not edit the types file.
Check: `./check.sh <variant> <your output dir>`.
