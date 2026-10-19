import type { Assembly } from "@get-modular/assembly";
import type { RunnerCapabilities } from "../features/runner/composition/runner.contracts.js";
import { runnerGroup } from "../features/runner/composition/runner.group.js";
import type { SessionCapabilities } from "../features/session/composition/session.contracts.js";
import { sessionGroup } from "../features/session/composition/session.group.js";
import { identityInput, journalInput } from "../features/session/composition/session.inputs.js";
import { sessionModule } from "../features/session/composition/session.module.js";

export interface SemanticCapabilities extends RunnerCapabilities, SessionCapabilities {}

export function composeSemantic(api: Assembly<SemanticCapabilities>) {
  return api.prepare({
    profileId: "fixture/semantic/a",
    modules: [
      runnerGroup,
      sessionGroup,
    ],
    roots: { session: sessionModule },
    inputs: { identity: identityInput, journal: journalInput },
  });
}
