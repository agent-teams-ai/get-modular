import { assemblyFor, declareModule, defineContract, implement, input, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { createScope, scoped, type CloseReport } from "@get-modular/resources";
import { eventTargetProgress } from "./event-target.ts";
import type { ProgressSource } from "./progress.ts";

export const Progress = defineContract<ProgressSource>()({ id: "neutral/progress", revision: 1 });
interface Ports extends CapabilitiesOf<typeof Progress> {}
const owner = { authority: "neutral", path: ["progress"] };
const source = input<Ports>()(declareModule({ moduleId: "neutral/source", implementationId: "neutral/source",
  owner, provides: [Progress.provide()], slots: [] }));
const receiver = implement<Ports>()(declareModule({ moduleId: "neutral/receiver", implementationId: "neutral/receiver",
  owner, provides: [], slots: [Progress.slot("progress", required())] }), async (deps, { resources }) => {
  let count = 0, completed = 0;
  await resources.setup({
    name: "progress-subscription",
    setup: () => deps.progress.subscribe(event => { count += 1; completed = event.completed; return undefined; }),
    cleanup: unsubscribe => { unsubscribe(); },
  });
  return { instance: { read: () => ({ count, completed }) }, capabilities: {} };
}, scoped);

/** The source is borrowed; every run gets a separate consumer resource scope. */
export async function prepareProgressSession() {
  const result = await assemblyFor<Ports>().prepare({ profileId: "neutral/progress",
    modules: [receiver], roots: { receiver }, inputs: { source } });
  if (result.status !== "prepared") throw new Error("progress preparation failed", { cause: result });
  return result.prepared;
}

/** A complete ordinary Host, returning only inert observations after cleanup. */
export async function runNeutralProgressExample(target = new EventTarget()) {
  const { source: borrowed, publish } = eventTargetProgress(target);
  const prepared = await prepareProgressSession();
  const host = createScope({ name: "progress-example" });
  const reports: CloseReport[] = [];
  // Language-level disposal preserves both a body failure and a cleanup failure.
  await using lifetime = {
    async [Symbol.asyncDispose]() {
      const report = await host.control.close();
      reports.push(report);
      if (!report.complete || !report.settled) throw new Error("progress cleanup incomplete", { cause: report });
    },
  };
  const start = async (name: string) => {
    const session = host.resources.child({ name });
    const outcome = await prepared.run({ scope: session.resources, inputs: { source: { [Progress.id]: borrowed } } });
    if (outcome.status !== "succeeded") throw new Error("progress construction failed", { cause: outcome });
    return { receiver: outcome.roots.receiver, control: session.control };
  };
  const first = await start("first"), sibling = await start("sibling");
  // Construction has settled only after the synchronous subscription is registered.
  publish({ jobId: "ordinary", completed: 1 });
  publish({ jobId: "ordinary", completed: 1 });
  const firstClose = await first.control.close();
  reports.push(firstClose);
  if (!firstClose.complete || !firstClose.settled) throw new Error("progress cleanup incomplete", { cause: firstClose });
  publish({ jobId: "ordinary", completed: 2 });
  const fresh = await start("fresh");
  publish({ jobId: "ordinary", completed: 3 });
  return { first: first.receiver.read(), sibling: sibling.receiver.read(), fresh: fresh.receiver.read(), reports };
}
