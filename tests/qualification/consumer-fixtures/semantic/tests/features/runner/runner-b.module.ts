import { implement } from "@get-modular/assembly";
import { scoped, type ModuleContext } from "@get-modular/resources";
import { acquireTestResource } from "../../../src/features/runner/adapters/outbound/test-resource.js";
import { runJob } from "../../../src/features/runner/application/use-cases/run-job.js";
import type { RunnerCapabilities } from "../../../src/features/runner/composition/runner.contracts.js";
import { runnerBDeclaration } from "./runner-b.declaration.js";

export const runnerBModule = implement<RunnerCapabilities>()(runnerBDeclaration, async (dependencies, context: ModuleContext) => {
  const resource = await context.resources.setup({
    name: "runner-b",
    setup: ({ signal }) => acquireTestResource(dependencies.journal, "B", signal),
    cleanup: value => value.release(),
  });
  const port: RunnerCapabilities["fixture/session/runner"]["value"] = {
    run: request => runJob({ effects: resource, tag: "B" }, request),
  };
  return { instance: { probe: resource.probe }, capabilities: { "fixture/session/runner": port } };
}, scoped);
