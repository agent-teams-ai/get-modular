import { implement } from "@get-modular/assembly";
import { scoped, type ModuleContext } from "@get-modular/resources";
import { acquireTestResource, type TestResource } from "../../../src/features/runner/adapters/outbound/test-resource.js";
import type { EffectsPort } from "../../../src/features/runner/application/ports/effects.js";
import { runJob } from "../../../src/features/runner/application/use-cases/run-job.js";
import { runnerADeclaration } from "../../../src/features/runner/composition/runner-a.declaration.js";
import type { RunnerCapabilities } from "../../../src/features/runner/composition/runner.contracts.js";
import type { JournalPort } from "../../../src/features/session/contracts/session.js";
import { barrier, waitForAbort, type Barrier } from "../../support/barriers.js";

interface Controls {
  readonly acquired: Barrier;
  readonly entered: Barrier;
  readonly effectHeld: Barrier;
  readonly releaseEntered: Barrier;
  readonly enteredIds: string[];
  readonly events: string[];
  readonly holdReturn?: Barrier;
  readonly holdEffect?: Barrier;
  readonly holdRelease?: Barrier;
  readonly failSetup?: boolean;
  readonly waitForCancellation?: boolean;
  cleanupFailures: number;
  cleanupAttempts: number;
  effectAllowed: boolean;
  resource: TestResource | undefined;
}

export function lifetimeControls(options: {
  readonly holdReturn?: Barrier;
  readonly holdEffect?: Barrier;
  readonly holdRelease?: Barrier;
  readonly failSetup?: boolean;
  readonly waitForCancellation?: boolean;
  readonly cleanupFailures?: number;
} = {}): Controls {
  return { ...options, acquired: barrier(), entered: barrier(), effectHeld: barrier(), releaseEntered: barrier(),
    enteredIds: [], events: [], cleanupFailures: options.cleanupFailures ?? 0,
    cleanupAttempts: 0, effectAllowed: true, resource: undefined };
}

async function acquire(journal: JournalPort, controls: Controls, signal: AbortSignal): Promise<TestResource> {
  const resource = await acquireTestResource(journal, "A", signal);
  controls.resource = resource;
  try {
    if (controls.failSetup) {
      throw Object.assign(new Error("Named failure after acquiring the native resource."), { code: "fixture.setup.failed" });
    }
    return resource;
  } catch (cause) {
    // setup has not returned a value, so the adapter still owns this partial acquisition.
    await resource.release();
    controls.events.push("partial-release-complete");
    throw cause;
  }
}

function effects(resource: TestResource, controls: Controls): EffectsPort {
  return { record: async effect => {
    if (controls.waitForCancellation) await waitForAbort(effect.signal);
    if (controls.holdEffect) {
      controls.effectHeld.release();
      await controls.holdEffect.reached;
    }
    if (!controls.effectAllowed) {
      throw Object.assign(new Error("Ordinary effect permission was revoked."), { code: "fixture.effect.forbidden" });
    }
    await resource.record(effect);
  } };
}

export function lifetimeRunner(subject: Controls | ((journal: JournalPort) => Controls)) {
  return implement<RunnerCapabilities>()(runnerADeclaration, async (dependencies, context: ModuleContext) => {
    const controls = typeof subject === "function" ? subject(dependencies.journal) : subject;
    const resource = await context.resources.setup({
      name: "runner-a",
      setup: ({ signal }) => acquire(dependencies.journal, controls, signal),
      cleanup: async value => {
        controls.cleanupAttempts += 1;
        controls.events.push(`cleanup:${controls.cleanupAttempts}`);
        await dependencies.journal.append({ kind: "cleanup-attempt", scope: "runner", id: "A", value: String(controls.cleanupAttempts) });
        if (controls.cleanupFailures > 0) {
          controls.cleanupFailures -= 1;
          throw Object.assign(new Error("Named cleanup failure before physical release."), { code: "fixture.cleanup.failed" });
        }
        controls.releaseEntered.release();
        if (controls.holdRelease) await controls.holdRelease.reached;
        await value.release();
        controls.events.push("release-complete");
      },
    });
    controls.acquired.release();
    if (controls.holdReturn) await controls.holdReturn.reached;
    const port: RunnerCapabilities["fixture/session/runner"]["value"] = { run: request => {
      controls.enteredIds.push(request.id);
      controls.entered.release();
      return runJob({ effects: effects(resource, controls), tag: "A" }, request);
    } };
    return { instance: { probe: resource.probe }, capabilities: { "fixture/session/runner": port } };
  }, scoped);
}
