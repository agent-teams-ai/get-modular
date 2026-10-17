# Task (e-sessions): sessions that follow a value only while they are open

Write `createSessionsModule` in `e-sessions.ts`, starting from `e-sessions.skeleton.ts`.
Use only the API in `api.d.ts` and its README. The fixed types are in `e-sessions.types.ts`.

The module lives as long as the application; sessions come and go, thousands per day.

1. Provides the capability `"acme/sessions"`: `open(user, screen)` shows the current `banner` on the
   screen and returns a session.
2. While a session is open, every change of `banner` is shown on its screen. Many sessions may be
   open at the same time.
3. `session.end()` stops that session from following `banner`. After many sessions have ended, nothing
   about them may remain registered anywhere.
4. If ending a session could not release everything, `end()` rejects.

Rules: no `any`, no type assertions (`as`; the const assertion `as const` is allowed), no `@ts-` directives. Do not edit the types file.
Check: `./check.sh <variant> <your output dir>`.
