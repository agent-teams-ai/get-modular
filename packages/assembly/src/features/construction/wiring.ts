import type { ConstructionPorts } from "./ports.js";
import { createEntryStore } from "./entry-store.js";
import { createGroupCollection } from "./group-collection.js";
import { prepareWiring } from "./prepare.js";
import type { EntryFamily, FamilyEntriesOf, FamilyGroup, FamilyItem, WiringPrepareInput, WiringPreparationResult } from "./wiring-types.js";

/** Creates one authenticated entry family for an executor. It performs no execution. */
export function createEntryFamily<F extends (...args: never[]) => unknown>(
  ports: Pick<ConstructionPorts, "compileComposition">,
): EntryFamily<F> {
  const entries = createEntryStore<F>();
  const groups = createGroupCollection(entries);
  const family: EntryFamily<F> = {
    capture: entries.capture,
    group: <const M extends readonly FamilyItem<F>[]>(name: string,
      members: M): FamilyGroup<FamilyEntriesOf<M[number]>> =>
      groups.create(name, members) as FamilyGroup<FamilyEntriesOf<M[number]>>,
    entriesOf: <const M extends readonly FamilyItem<F>[]>(modules: M): readonly FamilyEntriesOf<M[number]>[] =>
      groups.entriesOf(modules) as readonly FamilyEntriesOf<M[number]>[],
    prepare: (input: WiringPrepareInput<F>): Promise<WiringPreparationResult<F>> =>
      prepareWiring(input, ports.compileComposition, entries, groups),
  };
  return Object.freeze(family);
}
