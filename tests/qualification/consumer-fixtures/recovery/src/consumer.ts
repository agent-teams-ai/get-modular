import { assemblyFor, group, implement } from "@get-modular/assembly";
import { scoped, type ModuleContext } from "@get-modular/resources";
import type { SemanticCapabilities } from "../../semantic/src/composition/semantic.root.js";
import { acquireTestResource } from "../../semantic/src/features/runner/adapters/outbound/test-resource.js";
import { runnerADeclaration } from "../../semantic/src/features/runner/composition/runner-a.declaration.js";
import { sessionGroup } from "../../semantic/src/features/session/composition/session.group.js";
import { identityInput, journalInput } from "../../semantic/src/features/session/composition/session.inputs.js";
import { sessionModule } from "../../semantic/src/features/session/composition/session.module.js";
import type { RunnerPort } from "../../semantic/src/features/session/contracts/session.js";
import { failure } from "./schema.js";

export async function prepareRecoveryConsumer(execute: RunnerPort["run"]) {
  const runner = implement<SemanticCapabilities>()(runnerADeclaration, async (dependencies, context: ModuleContext) => {
    const resource = await context.resources.setup({
      name: "recovery-runner",
      setup: ({ signal }) => acquireTestResource(dependencies.journal, "IPC", signal),
      cleanup: value => value.release(),
    });
    const port: RunnerPort = {
      run: async request => {
        const value = await execute(request);
        await resource.record({ ...request, value });
        return value;
      },
    };
    return { instance: { probe: resource.probe }, capabilities: { "fixture/session/runner": port } };
  }, scoped);
  const prepared = await assemblyFor<SemanticCapabilities>().prepare({
    profileId: "fixture/semantic/recovery",
    modules: [group("runner", [runner]), sessionGroup],
    roots: { session: sessionModule },
    inputs: { identity: identityInput, journal: journalInput },
  });
  if (prepared.status !== "prepared") throw failure("fixture.preparation.failed");
  return prepared.prepared;
}
