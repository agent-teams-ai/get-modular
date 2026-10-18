import { declareModule } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Identity, Journal, Runner, Session } from "./session.contracts.js";

export const sessionDeclaration = declareModule({
  moduleId: "fixture/session/session",
  implementationId: "fixture/session/session/default",
  owner: { authority: "fixture", path: ["session"] },
  provides: [Session.provide()],
  slots: [
    Identity.slot("identity", required()),
    Journal.slot("journal", required()),
    Runner.slot("runner", required()),
  ],
});
