import { declareModule } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Journal, Runner } from "../../../src/features/session/composition/session.contracts.js";

export const runnerBDeclaration = declareModule({
  moduleId: "fixture/runner/runner-b",
  implementationId: "fixture/runner/runner-b/default",
  owner: { authority: "fixture", path: ["runner"] },
  provides: [Runner.provide()],
  slots: [Journal.slot("journal", required())],
});
