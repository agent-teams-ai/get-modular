import { defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import type { IdentityPort, JournalPort, RunnerPort, SessionPort } from "../contracts/session.js";

export const Identity = defineContract<IdentityPort>()({ id: "fixture/session/identity", revision: 1 });
export const Journal = defineContract<JournalPort>()({ id: "fixture/session/journal", revision: 2 });
export const Runner = defineContract<RunnerPort>()({ id: "fixture/session/runner", revision: 1 });
export const Session = defineContract<SessionPort>()({ id: "fixture/session/session", revision: 1 });

export interface SessionCapabilities extends CapabilitiesOf<
  typeof Identity | typeof Journal | typeof Runner | typeof Session
> {}
