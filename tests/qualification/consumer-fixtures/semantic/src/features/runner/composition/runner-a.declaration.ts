import { declareModule } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Journal, Runner } from "../../session/composition/session.contracts.js";

export const runnerADeclaration = declareModule({
  moduleId: "fixture/runner/runner-a",
  implementationId: "fixture/runner/runner-a/default",
  owner: { authority: "fixture", path: ["runner"] },
  provides: [Runner.provide()],
  slots: [Journal.slot("journal", required())],
});
