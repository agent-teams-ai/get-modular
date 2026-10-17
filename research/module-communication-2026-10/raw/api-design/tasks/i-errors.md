# Task (i): failures in handlers and `reportError`

Write `createNotificationsModule` in `i-errors.ts`, starting from `i-errors.skeleton.ts`.
Use only the API in `api.d.ts` and its README. The fixed types are in `i-errors.types.ts`.

The module:

1. Creates the notifier from the current `quietHours` (the value at creation is valid) and returns it as `instance`.
2. Follows `quietHours` for as long as the module's scope is open. A valid new value is applied. An invalid value
   (`parseQuietHours` throws) leaves the last valid quiet hours in place, and the failure reaches the Host's error
   port once, reported by the settings store with this module's subscription name and the revision. It must not be
   swallowed, and it must not stop later valid changes.
3. Owns a store of `NotificationStatus` (`muted` starts as `false`) and is its only writer. It provides it as
   `"acme/notifications/status"` so other modules can read and follow it, and `"acme/notifications"`:
   `mute(muted)` sets it. Failures of other modules' handlers on that store must reach `deps.errors.report`.

Rules: no `any`, no type assertions (`as`; the const assertion `as const` is allowed), no `@ts-` directives. Do not edit the types file.
Check: `./check.sh <variant> <your output dir>`.
