import { declareModule } from "@get-modular/assembly";
import { Identity } from "./session.contracts.js";

export const identityDeclaration = declareModule({
  moduleId: "fixture/session/identity",
  implementationId: "fixture/session/identity/input",
  owner: { authority: "fixture", path: ["session"] },
  provides: [Identity.provide()],
  slots: [],
});
