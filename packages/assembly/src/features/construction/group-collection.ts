import { AssemblyBindingError, isInputEntry, sealed, type EntryStore } from "./entry-store.js";
import { SnapshotFault, data, denseArray, limits } from "./snapshot.js";

const MAXIMUM_GROUP_DEPTH = 16;
const MAXIMUM_GROUP_NAME_BYTES = 128;
type Walked = { readonly entry: object; readonly path: readonly string[] };
export type GroupCollection = {
  readonly create: (name: string, members: unknown) => object;
  readonly entriesOf: (modules: unknown) => readonly object[];
  readonly walk: (modules: readonly unknown[], fail: (kind: "handles" | "input") => never) => {
    readonly entries: readonly Walked[];
    readonly nodes: number;
  };
};
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
/** Group identity is local to the same authenticated family as its entries. */
export function createGroupCollection<F>(entries: EntryStore<F>): GroupCollection {
  const heights = new WeakMap<object, number>();
  const heightOf = (value: unknown): number | undefined => value !== null && typeof value === "object"
    ? heights.get(value) : undefined;
  const create = (name: string, members: unknown): object => {
    if (typeof name !== "string" || name.length === 0 || utf8Bytes(name) > MAXIMUM_GROUP_NAME_BYTES) {
      invalidGroup("A group name is a non-empty string of at most 128 UTF-8 bytes");
    }
    let list: readonly unknown[];
    try { list = denseArray(members, limits.handles); }
    catch { invalidGroup("members is a dense array of at most 4096 items"); }
    let height = 1;
    for (const member of list) {
      if (entries.isModuleEntry(member)) {continue;}
      const memberHeight = heightOf(member);
      if (memberHeight === undefined) {
        invalidGroup(isInputEntry(member) ? "A group lists no input entry" : "A group lists only entries and groups");
      }
      height = Math.max(height, memberHeight + 1);
    }
    if (height > MAXIMUM_GROUP_DEPTH) {invalidGroup("Groups nest at most 16 levels");}
    const group = sealed({ name, members: Object.freeze([...list]) });
    heights.set(group, height);
    return group;
  };
  const walk: GroupCollection["walk"] = (modules, fail) => {
    const walked: Walked[] = [];
    let nodes = 0;
    const visit = (list: readonly unknown[], path: readonly string[]): void => {
      for (const member of list) {
        nodes += 1;
        if (nodes > limits.handles) {throw new SnapshotFault("limit");}
        const found = entries.metadataFor(member);
        if (found !== undefined) {
          if (!entries.isModuleEntry(member) || found.input === true) {return fail("input");}
          walked.push({ entry: member, path });
        } else if (heightOf(member) !== undefined) {
          const name = data(member as object, "name");
          const members = denseArray(data(member as object, "members"), limits.handles);
          if (typeof name !== "string") {return fail("handles");}
          visit(members, [...path, name]);
        } else { fail("handles"); }
      }
    };
    visit(modules, []);
    return { entries: walked, nodes };
  };
  return Object.freeze({ create, walk, entriesOf: (modules: unknown): readonly object[] => {
    try {
      const list = denseArray(modules, limits.handles);
      return Object.freeze(walk(list, () => invalidGroup("entriesOf lists only module entries and groups"))
        .entries.map((item) => item.entry));
    } catch (cause) {
      if (cause instanceof AssemblyBindingError) {throw cause;}
      throw new AssemblyBindingError("assembly.bind.invalid-group",
        cause instanceof Error ? cause : new TypeError("entriesOf accepts at most 4096 entries plus group nodes"));
    }
  } });
}
