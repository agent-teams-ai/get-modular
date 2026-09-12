import { compileComposition, defineModule, many, optional, required } from "@get-modular/core";
import { assemblyFor } from "@get-modular/assembly";
import type { CapabilityContract } from "@get-modular/assembly";

type Counter = { readonly value: number };
type Filter = { readonly counter: Counter; readonly apply: (input: string) => string };
type Logger = { readonly label: string };
type C = {
  "mixed/counter": CapabilityContract<Counter, "mixed/v1">;
  "mixed/filter": CapabilityContract<Filter, "mixed/v1">;
  "mixed/logger": CapabilityContract<Logger, "mixed/v1">;
  "mixed/text": CapabilityContract<string, "mixed/v1">;
};
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function exactType<T extends true>() {}
const header = { kind: "get-modular.module-declaration", schemaVersion: 1,
  owner: { authority: "synthetic", path: ["mixed"] } } as const;
const compatibility = { family: "exact", familyVersion: 1, token: "mixed/v1" } as const;
const counter = { capabilityId: "mixed/counter", compatibility } as const;
const filter = { capabilityId: "mixed/filter", compatibility } as const;
const logger = { capabilityId: "mixed/logger", compatibility } as const;
const text = { capabilityId: "mixed/text", compatibility } as const;
const previous = { slotId: "previous", ...counter, cardinality: required() } as const;

// Twenty-four literal nodes: a required chain, shared diamond and two optional branches.
const n00 = defineModule({ ...header, moduleId: "mixed/n00", implementationId: "mixed/n00",
  provides: [counter], slots: [] });
const n01 = defineModule({ ...header, moduleId: "mixed/n01", implementationId: "mixed/n01",
  provides: [counter], slots: [previous] });
const n02 = defineModule({ ...header, moduleId: "mixed/n02", implementationId: "mixed/n02",
  provides: [counter], slots: [previous] });
const n03 = defineModule({ ...header, moduleId: "mixed/n03", implementationId: "mixed/n03",
  provides: [counter], slots: [previous] });
const n04 = defineModule({ ...header, moduleId: "mixed/n04", implementationId: "mixed/n04",
  provides: [counter], slots: [previous] });
const n05 = defineModule({ ...header, moduleId: "mixed/n05", implementationId: "mixed/n05",
  provides: [counter], slots: [previous] });
const n06 = defineModule({ ...header, moduleId: "mixed/n06", implementationId: "mixed/n06",
  provides: [counter], slots: [previous] });
const n07 = defineModule({ ...header, moduleId: "mixed/n07", implementationId: "mixed/n07",
  provides: [counter], slots: [previous] });
const n08 = defineModule({ ...header, moduleId: "mixed/n08", implementationId: "mixed/n08",
  provides: [counter], slots: [previous] });
const n09 = defineModule({ ...header, moduleId: "mixed/n09", implementationId: "mixed/n09",
  provides: [counter], slots: [previous] });
const n10 = defineModule({ ...header, moduleId: "mixed/n10", implementationId: "mixed/n10",
  provides: [counter], slots: [previous] });
const n11 = defineModule({ ...header, moduleId: "mixed/n11", implementationId: "mixed/n11",
  provides: [counter], slots: [previous] });
const n12 = defineModule({ ...header, moduleId: "mixed/n12", implementationId: "mixed/n12",
  provides: [counter], slots: [previous] });
const n13 = defineModule({ ...header, moduleId: "mixed/n13", implementationId: "mixed/n13",
  provides: [counter], slots: [previous] });
const n14 = defineModule({ ...header, moduleId: "mixed/n14", implementationId: "mixed/n14",
  provides: [counter], slots: [previous] });
const n15 = defineModule({ ...header, moduleId: "mixed/n15", implementationId: "mixed/n15",
  provides: [counter], slots: [previous] });
const n16 = defineModule({ ...header, moduleId: "mixed/n16", implementationId: "mixed/n16",
  provides: [counter], slots: [previous] });
const n17 = defineModule({ ...header, moduleId: "mixed/n17", implementationId: "mixed/n17",
  provides: [counter], slots: [previous] });
const left = defineModule({ ...header, moduleId: "mixed/left", implementationId: "mixed/left",
  provides: [filter], slots: [previous] });
const right = defineModule({ ...header, moduleId: "mixed/right", implementationId: "mixed/right",
  provides: [filter], slots: [previous] });
const log = defineModule({ ...header, moduleId: "mixed/log", implementationId: "mixed/log",
  provides: [logger], slots: [] });
const present = defineModule({ ...header, moduleId: "mixed/present", implementationId: "mixed/present",
  provides: [text], slots: [{ slotId: "logger", ...logger, cardinality: optional() }] });
const absent = defineModule({ ...header, moduleId: "mixed/absent", implementationId: "mixed/absent",
  provides: [text], slots: [{ slotId: "logger", ...logger, cardinality: optional() }] });
const root = defineModule({ ...header, moduleId: "mixed/root", implementationId: "mixed/root",
  provides: [], slots: [
    previous,
    { slotId: "filters", ...filter, cardinality: many({ min: 2, max: 2 }) },
    { slotId: "present", ...text, cardinality: required() },
    { slotId: "absent", ...text, cardinality: required() },
  ] });
export const declarations = [
  n00, n01, n02, n03, n04, n05, n06, n07, n08,
  n09, n10, n11, n12, n13, n14, n15, n16, n17,
  left, right, log, present, absent, root,
];
export const profile = {
  kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "mixed/profile",
  roots: ["mixed/root", "mixed/n17"],
  selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
  bindings: [
    { consumerImplementationId: "mixed/n01", slotId: "previous", providerImplementationIds: ["mixed/n00"] },
    { consumerImplementationId: "mixed/n02", slotId: "previous", providerImplementationIds: ["mixed/n01"] },
    { consumerImplementationId: "mixed/n03", slotId: "previous", providerImplementationIds: ["mixed/n02"] },
    { consumerImplementationId: "mixed/n04", slotId: "previous", providerImplementationIds: ["mixed/n03"] },
    { consumerImplementationId: "mixed/n05", slotId: "previous", providerImplementationIds: ["mixed/n04"] },
    { consumerImplementationId: "mixed/n06", slotId: "previous", providerImplementationIds: ["mixed/n05"] },
    { consumerImplementationId: "mixed/n07", slotId: "previous", providerImplementationIds: ["mixed/n06"] },
    { consumerImplementationId: "mixed/n08", slotId: "previous", providerImplementationIds: ["mixed/n07"] },
    { consumerImplementationId: "mixed/n09", slotId: "previous", providerImplementationIds: ["mixed/n08"] },
    { consumerImplementationId: "mixed/n10", slotId: "previous", providerImplementationIds: ["mixed/n09"] },
    { consumerImplementationId: "mixed/n11", slotId: "previous", providerImplementationIds: ["mixed/n10"] },
    { consumerImplementationId: "mixed/n12", slotId: "previous", providerImplementationIds: ["mixed/n11"] },
    { consumerImplementationId: "mixed/n13", slotId: "previous", providerImplementationIds: ["mixed/n12"] },
    { consumerImplementationId: "mixed/n14", slotId: "previous", providerImplementationIds: ["mixed/n13"] },
    { consumerImplementationId: "mixed/n15", slotId: "previous", providerImplementationIds: ["mixed/n14"] },
    { consumerImplementationId: "mixed/n16", slotId: "previous", providerImplementationIds: ["mixed/n15"] },
    { consumerImplementationId: "mixed/n17", slotId: "previous", providerImplementationIds: ["mixed/n16"] },
    { consumerImplementationId: "mixed/left", slotId: "previous", providerImplementationIds: ["mixed/n17"] },
    { consumerImplementationId: "mixed/right", slotId: "previous", providerImplementationIds: ["mixed/n17"] },
    { consumerImplementationId: "mixed/present", slotId: "logger", providerImplementationIds: ["mixed/log"] },
    { consumerImplementationId: "mixed/absent", slotId: "logger", providerImplementationIds: [] },
    { consumerImplementationId: "mixed/root", slotId: "previous", providerImplementationIds: ["mixed/n17"] },
    { consumerImplementationId: "mixed/root", slotId: "filters", providerImplementationIds: ["mixed/right", "mixed/left"] },
    { consumerImplementationId: "mixed/root", slotId: "present", providerImplementationIds: ["mixed/present"] },
    { consumerImplementationId: "mixed/root", slotId: "absent", providerImplementationIds: ["mixed/absent"] },
  ],
} as const;

export async function runMixedGraph() {
  const api = assemblyFor<C>();
  const product = (value: number) => ({ instance: { value }, capabilities: { "mixed/counter": { value } } });
  const f00 = api.bindFactory(n00, async () => product(1));
  const f01 = api.bindFactory(n01, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f02 = api.bindFactory(n02, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f03 = api.bindFactory(n03, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f04 = api.bindFactory(n04, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f05 = api.bindFactory(n05, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f06 = api.bindFactory(n06, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f07 = api.bindFactory(n07, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f08 = api.bindFactory(n08, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f09 = api.bindFactory(n09, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f10 = api.bindFactory(n10, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f11 = api.bindFactory(n11, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f12 = api.bindFactory(n12, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f13 = api.bindFactory(n13, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f14 = api.bindFactory(n14, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f15 = api.bindFactory(n15, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f16 = api.bindFactory(n16, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const f17 = api.bindFactory(n17, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    return product(deps.previous.value + 1);
  });
  const fLeft = api.bindFactory(left, async (deps) => ({ instance: {}, capabilities: {
    "mixed/filter": { counter: deps.previous, apply: (input: string) => input + "L" },
  } }));
  const fRight = api.bindFactory(right, async (deps) => ({ instance: {}, capabilities: {
    "mixed/filter": { counter: deps.previous, apply: (input: string) => input + "R" },
  } }));
  const fLog = api.bindFactory(log, async () => ({ instance: {}, capabilities: { "mixed/logger": { label: "enabled" } } }));
  const fPresent = api.bindFactory(present, async (deps) => {
    exactType<Equal<typeof deps.logger, Logger | undefined>>();
    return { instance: { deps }, capabilities: { "mixed/text": deps.logger?.label ?? "absent" } };
  });
  const fAbsent = api.bindFactory(absent, async (deps) => {
    exactType<Equal<typeof deps.logger, Logger | undefined>>();
    return { instance: { deps }, capabilities: { "mixed/text": deps.logger?.label ?? "absent" } };
  });
  const fRoot = api.bindFactory(root, async (deps) => {
    exactType<Equal<typeof deps.previous, Counter>>();
    exactType<Equal<typeof deps.filters, readonly Filter[]>>();
    exactType<Equal<typeof deps.present, string>>();
    exactType<Equal<typeof deps.absent, string>>();
    return { instance: { deps, output: deps.filters.reduce((input, item) => item.apply(input),
      `${deps.previous.value}:${deps.present}:${deps.absent}:`) }, capabilities: {} };
  });
  const composition = await compileComposition({ declarations, profile });
  if (!("plan" in composition)) throw new Error(JSON.stringify(composition));
  const ready = await api.prepare({ composition,
    factories: [f00, f01, f02, f03, f04, f05, f06, f07, f08,
      f09, f10, f11, f12, f13, f14, f15, f16, f17, fLeft, fRight, fLog, fPresent, fAbsent, fRoot],
    roots: { app: fRoot, last: f17 },
  });
  if (ready.status !== "prepared") throw new Error(JSON.stringify(ready));
  const outcome = await ready.prepared.run();
  if (outcome.status !== "succeeded") throw new Error(JSON.stringify(outcome));
  exactType<Equal<typeof outcome.roots.app.output, string>>();
  exactType<Equal<typeof outcome.roots.last, { value: number }>>();
  exactType<Equal<keyof typeof outcome.roots, "app" | "last">>();
  return outcome;
}

// Compile-only rejecting sites; each differs from a valid declaration/callback above.
function rejectingTypes() {
  const api = assemblyFor<C>();
  api.bindFactory(present, async (deps) => {
    // @ts-expect-error mixed-optional-required: optional is not guaranteed present.
    const requiredLogger: Logger = deps.logger;
    return { instance: requiredLogger, capabilities: { "mixed/text": "ok" } };
  });
  api.bindFactory(root, async (deps) => {
    // @ts-expect-error mixed-many-scalar: ordered many is not a scalar filter.
    const scalar: Filter = deps.filters;
    // @ts-expect-error mixed-dependency-value: counter is not a string.
    const value: string = deps.previous;
    return { instance: { scalar, value }, capabilities: {} };
  });
  const wrongToken = defineModule({ ...n00, provides: [{ ...counter,
    compatibility: { ...compatibility, token: "mixed/v2" } }] });
  // @ts-expect-error mixed-token: otherwise identical declaration uses an unsupported token.
  api.bindFactory(wrongToken, async () => ({ instance: {}, capabilities: { "mixed/counter": { value: 1 } } }));
}
