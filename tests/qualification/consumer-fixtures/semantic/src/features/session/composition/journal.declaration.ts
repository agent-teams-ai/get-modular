import { declareModule } from "@get-modular/assembly";
import { Journal } from "./session.contracts.js";

export const journalDeclaration = declareModule({
  moduleId: "fixture/session/journal",
  implementationId: "fixture/session/journal/input",
  owner: { authority: "fixture", path: ["session"] },
  provides: [Journal.provide()],
  slots: [],
});
