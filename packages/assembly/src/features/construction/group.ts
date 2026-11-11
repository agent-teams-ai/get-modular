import type { AnyEntry, EntriesOf, ModuleGroup, UsedKeysOf } from "./types.js";
import { promiseEntries } from "./entry.js";
import { createGroupCollection, type GroupCollection } from "./group-collection.js";

export const promiseGroups: GroupCollection = createGroupCollection(promiseEntries);
/** Creates a static group; its label never enters the profile, plan or digest. */
export function group<const M extends readonly (AnyEntry | ModuleGroup)[]>(
  name: string,
  members: M & (number extends M["length"] ? never : unknown),
): ModuleGroup<EntriesOf<M[number]>, UsedKeysOf<M[number]>> {
  return promiseGroups.create(name, members) as ModuleGroup<EntriesOf<M[number]>, UsedKeysOf<M[number]>>;
}
/** The entries of a module list, depth first, groups flattened. */
export function entriesOf<const M extends readonly (AnyEntry | ModuleGroup)[]>(modules: M): readonly EntriesOf<M[number]>[] {
  return promiseGroups.entriesOf(modules) as readonly EntriesOf<M[number]>[];
}
