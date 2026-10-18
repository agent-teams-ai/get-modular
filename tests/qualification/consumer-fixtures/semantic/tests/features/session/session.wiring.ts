import type { WiringOracle } from "@get-modular/conformance";

export const sessionWiring: WiringOracle = {
  providers: {
    "fixture/session/identity": "fixture/session/identity/input",
    "fixture/session/journal": "fixture/session/journal/input",
    "fixture/session/runner": "fixture/runner/runner-a/default",
    "fixture/session/session": "fixture/session/session/default",
  },
};
