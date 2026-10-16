import type { AnyEntry, EntriesOf, ModuleGroup, UsedKeysOf } from "./types.js";
import { AssemblyBindingError, isInputEntry, isModuleEntry, metadataFor } from "./entry.js";
import { SnapshotFault, data, denseArray, limits } from "./snapshot.js";

const groups: WeakSet<object> = new WeakSet();
const heights: WeakMap<object, number> = new WeakMap();
/** Deepest group level below a group, counting the group itself: `modules` is level 0. */
export const MAXIMUM_GROUP_DEPTH = 16;
const MAXIMUM_GROUP_NAME_BYTES = 128;
function invalidGroup(message: string): never {
  throw new AssemblyBindingError("assembly.bind.invalid-group", new TypeError(message));
}
function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const point of value) {
    const code = point.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}
function sealed<T extends object>(fields: T): Readonly<T> {
  const record: object = { ...fields };
  Object.setPrototypeOf(record, null);
  return Object.freeze(record) as Readonly<T>;
}
export function isGroup(value: unknown): value is object {
  return value !== null && typeof value === "object" && groups.has(value);
}
function groupHeight(value: unknown): number | undefined {
  return value !== null && typeof value === "object" ? heights.get(value) : undefined;
}

/** Creates a static group; `name` is a label that never enters the profile, the plan or the digest. */
export function group<const M extends readonly (AnyEntry | ModuleGroup)[]>(
  name: string,
  members: M & (number extends M["length"] ? never : unknown),
): ModuleGroup<EntriesOf<M[number]>, UsedKeysOf<M[number]>> {
  if (typeof name !== "string" || name.length === 0 || utf8Bytes(name) > MAXIMUM_GROUP_NAME_BYTES) {
    invalidGroup("A group name is a non-empty string of at most 128 UTF-8 bytes");
  }
  let list: readonly unknown[];
  try {
    list = denseArray(members, limits.handles);
  } catch {
    invalidGroup("members is a dense array of at most 4096 items");
  }
  let height = 1;
  for (const member of list) {
    if (isModuleEntry(member)) {continue;}
    const memberHeight = isGroup(member) ? groupHeight(member) : undefined;
    if (memberHeight === undefined) {
      invalidGroup(isInputEntry(member) ? "A group lists no input entry" : "A group lists only entries and groups");
    }
    height = Math.max(height, memberHeight + 1);
  }
  if (height > MAXIMUM_GROUP_DEPTH) {invalidGroup("Groups nest at most 16 levels");}
  const created = sealed({ name, members: Object.freeze([...list]) });
  groups.add(created);
  heights.set(created, height);
  return created as never;
}

type Walked = { readonly entry: object; readonly path: readonly string[] };
/** Depth-first walk; counts group nodes and entries against the 4096 ceiling. */
export function walkModules(modules: readonly unknown[], fail: (kind: "handles" | "input") => never): { readonly entries: readonly Walked[]; readonly nodes: number } {
  const entries: Walked[] = [];
  let nodes = 0;
  const visit = (list: readonly unknown[], path: readonly string[]): void => {
    for (const member of list) {
      nodes += 1;
      if (nodes > limits.handles) {throw new SnapshotFault("limit");}
      const found = metadataFor(member);
      if (found !== undefined) {
        if (!isModuleEntry(member) || found.input === true) {fail("input");}
        entries.push({ entry: member, path });
      } else if (isGroup(member)) {
        const name = data(member, "name");
        const members = denseArray(data(member, "members"), limits.handles);
        if (typeof name !== "string") {fail("handles");}
        visit(members, [...path, name]);
      } else {
        fail("handles");
      }
    }
  };
  visit(modules, []);
  return { entries, nodes };
}

/** The entries of a module list, depth first, groups flattened. */
export function entriesOf<const M extends readonly (AnyEntry | ModuleGroup)[]>(modules: M): readonly EntriesOf<M[number]>[] {
  try {
    const list = denseArray(modules, limits.handles);
    return Object.freeze(walkModules(list, () => invalidGroup("entriesOf lists only module entries and groups")).entries.map((walked) => walked.entry)) as never;
  } catch (cause) {
    if (cause instanceof AssemblyBindingError) {throw cause;}
    throw new AssemblyBindingError("assembly.bind.invalid-group",
      cause instanceof Error ? cause : new TypeError("entriesOf accepts at most 4096 entries plus group nodes"));
  }
}
