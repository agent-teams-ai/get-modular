import { assemblyFor, declareModule, defineContract, entriesOf, group, implement, input } from "@get-modular/assembly";
import type { AnyEntry, AnyModuleEntry, CapabilitiesOf, DependenciesOf, EntriesOf, ModuleGroup, SuccessfulComposition } from "@get-modular/assembly";
import { isolate } from "@get-modular/conformance";
import {
  Audit, Clock, ClockV2, Orders, clockDeclaration, clockEntry,
  ordersDeclaration, ordersEntry, ordersGroup, timeGroup,
} from "./types-s0-shared.js";
import type { HostMap, OrdersMap } from "./types-s0-shared.js";

const owner = { authority: "types", path: ["negative"] };
const host = assemblyFor<HostMap>();

// The missing adapter makes the module factory's own context fail where it reads resources.
export const missingAdapter = implement<OrdersMap>()(ordersDeclaration, async (dependencies, context) => ({
  instance: {
    // @ts-expect-error The unadapted FactoryContext has no resources.
    total: dependencies.clock.now() + context.resources,
  },
  capabilities: { "types/orders": { count: () => 2 } },
}));

interface ClockOne extends CapabilitiesOf<typeof Clock> {}
interface ClockTwo extends CapabilitiesOf<typeof ClockV2> {}
// @ts-expect-error Two feature maps cannot disagree about one contract revision.
interface BothClocks extends ClockOne, ClockTwo {}

const Other = defineContract<{ readonly value: string }>()({ id: "types/other", revision: 1 });
interface OtherMap extends CapabilitiesOf<typeof Other> {}
const otherEntry = implement<OtherMap>()(declareModule({
  moduleId: "types/other", implementationId: "types/other/default", owner,
  provides: [Other.provide()], slots: [],
}), async () => ({ instance: {}, capabilities: { "types/other": { value: "x" } } }));

// @ts-expect-error The profileId form rejects a list that shares no key with the Host map.
void host.prepare({ profileId: "types/other", modules: [clockEntry, otherEntry], roots: { clock: clockEntry } });

interface ClockV2Map extends CapabilitiesOf<typeof ClockV2> {}
const clockV2Entry = implement<ClockV2Map>()(declareModule({
  moduleId: "types/clock", implementationId: "types/clock/v2", owner,
  provides: [ClockV2.provide()], slots: [],
}), async () => ({ instance: {}, capabilities: { "types/clock": { now: () => 2 } } }));
// @ts-expect-error The profileId form rejects a contract revision that differs from the Host map.
void host.prepare({ profileId: "types/clock-v2", modules: [clockV2Entry], roots: { clock: clockEntry } });

const annotatedProfile: readonly (AnyModuleEntry<HostMap> | ModuleGroup<AnyModuleEntry<HostMap>>)[] = [clockEntry, ordersGroup];
// @ts-expect-error The profileId form accepts tuples so an annotated array cannot lose the map check.
void host.prepare({ profileId: "types/annotated", modules: annotatedProfile, roots: { clock: clockEntry } });

const clockInput = input<HostMap>()({ ...clockDeclaration, implementationId: "types/clock/input" });
// @ts-expect-error An input entry is never a module list member.
void host.prepare({ profileId: "types/input", modules: [clockEntry, clockInput], roots: { clock: clockEntry } });

const annotatedMembers: readonly AnyEntry[] = [clockEntry, ordersEntry];
// @ts-expect-error Group members must be a tuple.
void group("annotated", annotatedMembers);
// @ts-expect-error A group member is an entry or group.
void group("junk", [{ declaration: 1 }]);

// @ts-expect-error isolate dependencies follow the entry.
void isolate(ordersEntry, { dependencies: { clock: 5, audit: undefined } });

interface OrdersOnly extends CapabilitiesOf<typeof Orders> {}
// @ts-expect-error The declaration uses a contract missing from its feature map.
void implement<OrdersOnly>()(clockDeclaration, async () => ({ instance: {}, capabilities: { "types/clock": { now: () => 1 } } }));
const wrongAdapter = (factory: () => void) => factory;
// @ts-expect-error Only a ContextAdapter adapts a factory context.
void implement<OrdersMap>()(ordersDeclaration, async (dependencies) => ({ instance: { total: dependencies.clock.now() }, capabilities: { "types/orders": { count: () => 2 } } }), wrongAdapter);

declare const composition: SuccessfulComposition;
const annotatedComposition: readonly AnyModuleEntry<HostMap>[] = [clockEntry];
void host.prepare({ composition, modules: annotatedComposition, roots: { clock: clockEntry } });

// @ts-expect-error A nested entry's contract revision still has to fit the Host map.
void host.prepare({ profileId: "types/nested-v2", modules: [group("outer", [group("inner", [clockV2Entry])])], roots: { clock: clockEntry } });
// @ts-expect-error A nested entry still has to share a key with the Host map.
void host.prepare({ profileId: "types/nested-other", modules: [clockEntry, group("other", [otherEntry])], roots: { clock: clockEntry } });

const nested = group("root-feature", [timeGroup, ordersGroup]);
type GroupEntries<E> = E extends ModuleGroup<infer Entries> ? Entries : never;
type ModuleIds = GroupEntries<typeof nested>["declaration"]["moduleId"];
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
export const idsAreLiteral: Equal<ModuleIds, "types/clock" | "types/orders"> = true;
export const flattened = entriesOf([nested]);
export async function isolated() {
  const dependencies: DependenciesOf<typeof ordersEntry> = {
    clock: { now: () => 5 },
    audit: undefined,
  };
  await using result = await isolate(ordersEntry, { dependencies });
  const total: number = result.instance.total;
  return total;
}
export const nestedEntryIds: EntriesOf<typeof nested>["declaration"]["moduleId"] = "types/orders";
void Audit; void Clock;
