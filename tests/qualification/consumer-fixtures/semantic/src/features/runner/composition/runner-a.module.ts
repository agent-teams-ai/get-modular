import { implement } from "@get-modular/assembly";
import { scoped, type ModuleContext } from "@get-modular/resources";
import { acquireTestResource } from "../adapters/outbound/test-resource.js";
import { runJob } from "../application/use-cases/run-job.js";
import { runnerADeclaration } from "./runner-a.declaration.js";
import type { RunnerCapabilities } from "./runner.contracts.js";

export const runnerAModule = implement<RunnerCapabilities>()(runnerADeclaration, async (dependencies, context: ModuleContext) => {
  const resource = await context.resources.setup({
    name: "runner-a",
    setup: ({ signal }) => acquireTestResource(dependencies.journal, "A", signal),
    cleanup: value => value.release(),
  });
  const port: RunnerCapabilities["fixture/session/runner"]["value"] = {
    run: request => runJob({ effects: resource, tag: "A" }, request),
  };
  return { instance: { probe: resource.probe }, capabilities: { "fixture/session/runner": port } };
}, scoped);
