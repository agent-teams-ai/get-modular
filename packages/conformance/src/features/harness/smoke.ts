import { group, implement } from "@get-modular/assembly";
import type {
  Assembly, AssemblyPreparationResult, FactoryContext, InputEntries, RootEntries, RunInputs,
} from "@get-modular/assembly";
import type { ModuleDeclaration } from "@get-modular/core";
import { createScope } from "@get-modular/resources";
import type { CloseReport } from "@get-modular/resources";
import { ConformanceError, invalid } from "../errors/errors.js";
import type {
  LooseAssembly, LooseFactory, LooseOutcome, LoosePrepared, LoosePreparation, LoosePrepareInput, SmokeInjection, SmokeStep,
} from "./types.js";

const MODES: readonly SmokeInjection[] = ["fail", "abort"];

/** What one run is told to do; the wrapper finds it through the identity of the run's own signal. */
type Plan = {
  readonly controller: AbortController;
  readonly inject: "none" | SmokeInjection;
  readonly at: string | undefined;
  readonly injected: Error;
  readonly called: string[];
};

const isModes = (value: unknown): value is readonly SmokeInjection[] =>
  Array.isArray(value) && value.every(entry => entry === "fail" || entry === "abort");
const isIds = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(entry => typeof entry === "string");

const describeDebts = (report: CloseReport): string =>
  `the attempt closed with ${String(report.debts.length)} debt${report.debts.length === 1 ? "" : "s"}: ${
    report.debts.map(debt => `${debt.path.join("/")} (${debt.state})`).join(", ")}`;

const label = (step: SmokeStep): string =>
  step.inject === "none" ? "run without injection" : `${step.inject} at ${step.at ?? ""}`;

/** The first way a step broke an expectation, or undefined when it kept them all. */
function check(plan: Plan, outcome: LooseOutcome, order: readonly string[]): string | undefined {
  if (plan.inject === "none") {
    if (outcome.status !== "succeeded") {
      return `expected succeeded, got ${outcome.status}${outcome.status === "failed" ? ` (${outcome.code})` : ""}`;
    }
    // Entries are global in Assembly: a factory implemented outside the given api would run but never see an injection.
    const unwrapped = outcome.created.map(entry => entry.implementationId).filter(id => !plan.called.includes(id));
    return unwrapped.length === 0 ? undefined
      : `compose bound ${unwrapped.join(", ")} outside the api it was given, so no injection reaches them`;
  }
  if (plan.inject === "fail") {
    if (outcome.status !== "failed") {
      return `expected failed, got ${outcome.status}`;
    }
    if (outcome.code !== "assembly.run.factory-rejected" || outcome.implementationId !== plan.at
      || outcome.cause !== plan.injected) {
      return `expected the injected failure of ${plan.at ?? ""}, got ${outcome.code} at ${outcome.implementationId ?? "no module"}`;
    }
    const expected = order.slice(0, order.indexOf(plan.at ?? "")).join(", ");
    const created = outcome.created.map(entry => entry.implementationId).join(", ");
    return created === expected ? undefined : `expected created [${expected}], got [${created}]`;
  }
  if (outcome.status === "cancelled" || (outcome.status === "failed" && outcome.cancellation !== undefined)) {
    return undefined;
  }
  return `expected cancelled, got ${outcome.status}`;
}

/**
 * Runs the production composition root once and then rebuilds it under injected failures and aborts, to
 * show that every attempt releases what its modules registered. It proves nothing about the bindings.
 */
export async function smoke<C, R extends RootEntries<C>, N extends InputEntries<C> = {}>(
  input: {
    readonly api: Assembly<C>;
    /** The production composition root, written as a function of Assembly. Called once. */
    readonly compose: (api: Assembly<C>) => Promise<AssemblyPreparationResult<R, N>>;
    readonly inject?: readonly SmokeInjection[] | undefined;
    readonly at?: readonly string[] | undefined;
  } & ({} extends N ? { readonly inputs?: RunInputs<N> | undefined } : { readonly inputs: RunInputs<N> }),
): Promise<readonly SmokeStep[]> {
  if (typeof (input as unknown) !== "object" || (input as unknown) === null) {
    throw invalid("smoke() requires an input record");
  }
  const { api, compose, inputs } = input as {
    readonly api: Assembly<C>;
    readonly compose: (api: Assembly<C>) => Promise<LoosePreparation>;
    readonly inputs: unknown;
  };
  const requested: unknown = input.inject ?? MODES;
  const requestedAt: unknown = input.at;
  if (typeof (compose as unknown) !== "function" || typeof (api as unknown) !== "object" || (api as unknown) === null
    || !isModes(requested) || (requestedAt !== undefined && !isIds(requestedAt))) {
    throw invalid('smoke() requires an api, a compose function, inject entries "fail" or "abort" and string ids in at');
  }
  const modes = requested;

  // Every run gets its own signal; the wrapper reads the plan registered under that signal.
  const plans = new WeakMap<AbortSignal, Plan>();
  const real = api as LooseAssembly;
  const wrap = (declaration: ModuleDeclaration, factory: LooseFactory): LooseFactory =>
    // Never `async`: the carrier of the factory reaches Assembly unchanged, so a synchronous throw or a
    // Promise subclass fails here exactly as it does in production.
    (dependencies, context: FactoryContext) => {
      const plan = plans.get(context.signal);
      if (plan === undefined) {
        return factory(dependencies, context);
      }
      plan.called.push(declaration.implementationId);
      const carrier = factory(dependencies, context);
      if (plan.at !== declaration.implementationId) {
        return carrier;
      }
      if (plan.inject === "abort") {
        plan.controller.abort(plan.injected);
        return carrier;
      }
      if (plan.inject === "fail") {
        return Promise.prototype.then.call(carrier, () => {
          throw plan.injected;
        });
      }
      return carrier;
    };
  // Entries and groups are public inert data: rebuild the same tree with every factory wrapped, using the
  // public `implement` and `group` only. The real `prepare` runs first, so a forged entry fails as in production.
  const makeEntry: (declaration: ModuleDeclaration, factory: LooseFactory) => unknown = implement() as never;
  const makeGroup: (name: string, members: readonly unknown[]) => unknown = group as never;
  const copies = new Map<unknown, unknown>();
  const produced = new WeakSet<object>();
  const rebuild = (member: unknown): unknown => {
    const node = member as { readonly name: string; readonly members: readonly unknown[] } | { readonly declaration: ModuleDeclaration; readonly factory: LooseFactory };
    if ("members" in node) {return makeGroup(node.name, node.members.map(rebuild));}
    const copy = copies.get(member) ?? makeEntry(node.declaration, wrap(node.declaration, node.factory));
    copies.set(member, copy);
    return copy;
  };
  const wrapped = {
    prepare: async (prepareInput: LoosePrepareInput) => {
      const first = await real.prepare(prepareInput);
      if (first.status === "prepared") {
        const modules = prepareInput.modules.map(rebuild);
        const roots = Object.fromEntries(Object.entries(prepareInput.roots).map(([alias, root]) => [alias, copies.get(root) ?? root]));
        const second = await real.prepare({ ...prepareInput, modules, roots });
        produced.add(second);
        return second;
      }
      produced.add(first);
      return first;
    },
  } satisfies LooseAssembly;

  const preparation = await compose(wrapped as Assembly<C>);
  if (!produced.has(preparation)) {
    throw new ConformanceError("conformance.smoke.failed",
      "compose resolved with a preparation its api did not produce, so no injection reaches its factories");
  }
  if (preparation.status !== "prepared") {
    throw new ConformanceError("conformance.smoke.failed",
      `the composition root was not prepared: ${preparation.error.code}`, { cause: preparation.error.cause, details: { preparation } });
  }
  const prepared: LoosePrepared = preparation.prepared;

  const steps: SmokeStep[] = [];
  const attempt = async (inject: "none" | SmokeInjection, at: string | undefined, order: readonly string[]): Promise<Plan> => {
    const controller = new AbortController();
    const plan: Plan = {
      controller, inject, at, called: [],
      injected: new Error(inject === "none" ? "smoke: no injection" : `smoke: injected ${inject} at ${at ?? ""}`),
    };
    plans.set(controller.signal, plan);
    const scope = createScope({ name: "smoke" });
    const outcome = await prepared.run({
      signal: controller.signal, scope: scope.resources, ...inputs === undefined ? {} : { inputs },
    });
    const report = await scope.control.close();
    const problems = [check(plan, outcome, order), report.complete ? undefined : describeDebts(report)];
    const problem = problems.filter(entry => entry !== undefined).join("; ");
    steps.push({
      inject, ...at === undefined ? {} : { at }, outcome: outcome.status, report,
      ...problem === "" ? {} : { problem },
    });
    return plan;
  };

  const first = await attempt("none", undefined, []);
  const order = first.called;
  const failed = (): never => {
    const broken = steps.filter(step => step.problem !== undefined);
    throw new ConformanceError("conformance.smoke.failed",
      `${String(broken.length)} of ${String(steps.length)} steps failed: ${
        broken.map(step => `${label(step)}: ${step.problem ?? ""}`).join("; ")}`,
      { details: { steps } });
  };
  // Without a first run that succeeded there is no trustworthy order to inject into. A debt alone does not stop.
  if (steps[0]?.outcome !== "succeeded") {
    return failed();
  }
  const targets = isIds(requestedAt) ? requestedAt : order;
  const unknown = targets.find(id => !order.includes(id));
  if (unknown !== undefined) {
    throw invalid(`smoke() at names ${unknown}, which the run did not construct; it constructed ${order.join(", ")}`);
  }
  for (const id of targets) {
    for (const mode of modes) {
      await attempt(mode, id, order);
    }
  }
  if (steps.some(step => step.problem !== undefined)) {
    return failed();
  }
  return steps;
}
