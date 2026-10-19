// T15 T39 T117
// F9 and F13 (adversarial review): forms that compiled and failed at run time, and forms that must compile.
import type { Resources } from "@get-modular/resources";
import { createStore, type ListenerError, type ReadonlyStore, type Snapshot } from "../dist/index.js";
declare const resources: Resources;
declare const reportError: (report: ListenerError) => undefined;
const o = { name: "s", resources, reportError };

// @ts-expect-error index signature: the key set is fixed at createStore
createStore<Record<string, "open" | "closed">>({}, o);
// @ts-expect-error a template-pattern index signature is open too
createStore<{ readonly [id: `session-${number}`]: "open" | "closed" }>({}, o);
// @ts-expect-error a literal key plus an index signature
createStore<{ readonly count: number; readonly [id: string]: number }>({ count: 0 }, o);
// @ts-expect-error an empty record has no fixed keys
createStore<{}>({}, o);

// Review #182: a fixed field must not hide an open template-pattern key set.
type MixedNumberKeys = { readonly count: number; readonly [id: `session-${number}`]: string };
// @ts-expect-error count is fixed, but session-* is still open
createStore<MixedNumberKeys>({ count: 0 }, o);
type MixedStringKeys = { readonly count: number; readonly [id: `session-${string}`]: string };
// @ts-expect-error a fixed field does not close a string template
createStore<MixedStringKeys>({ count: 0 }, o);
type MixedBigIntKeys = { readonly count: number; readonly [id: `session-${bigint}`]: string };
// @ts-expect-error a fixed field does not close a bigint template
createStore<MixedBigIntKeys>({ count: 0 }, o);
// @ts-expect-error a literal string key does not close a numeric index signature
createStore<{ readonly count: number; readonly [id: number]: string }>({ count: 0 }, o);
// @ts-expect-error a mapped union of fixed and open keys is open too
createStore<Record<"count" | `session-${number}`, number>>({ count: 0 }, o);

// Finite literal unions and templates still declare every key.
const finiteSessions = createStore<Record<"count" | `session-${1 | 2}`, number>>({
  count: 2, "session-1": 1, "session-2": 2,
}, o);
finiteSessions.set({ "session-1": finiteSessions.read(["session-2"]).values["session-2"] });
const finiteFlags = createStore<Record<`flag-${boolean}`, boolean>>({ "flag-true": true, "flag-false": false }, o);
finiteFlags.read(["flag-true", "flag-false"]);

interface Named { readonly a: string; readonly b: number }
createStore<Named>({ a: "x", b: 1 }, o);   // interfaces with literal keys are fine
const lists = createStore<{ readonly ids: number[] }>({ ids: [1] }, o);
// @ts-expect-error values are deeply frozen
lists.read(["ids"]).values.ids.push(2);
lists.set({ ids: [...lists.read(["ids"]).values.ids, 2] });   // a new array: compiles
lists.set({ ids: lists.read(["ids"]).values.ids });            // a frozen array back into set: compiles

type Prefs = { readonly theme: string; readonly density: "compact" | "comfortable" };
const prefs = createStore<Prefs>({ theme: "light", density: "compact" }, o);
declare const changedTheme: string | undefined;
// Conditional patch recipe: set only when there is a value.
if (changedTheme !== undefined) { prefs.set({ theme: changedTheme }); }
// @ts-expect-error a conditional spread does not compile (the patch keys must be known)
prefs.set({ ...(changedTheme === undefined ? {} : { theme: changedTheme }) });

declare function show(theme: string): void;
const facet: ReadonlyStore<Prefs> = prefs.readonly();
const first = facet.read(["theme"]);
// A named handler annotated `: undefined` compiles; `: void` does not.
const onTheme = (next: Snapshot<Prefs, "theme">): undefined => { show(next.values.theme); return undefined; };
facet.watch(first, { resources, name: "m/theme", onChange: onTheme });
const onThemeVoid = (next: Snapshot<Prefs, "theme">): void => { show(next.values.theme); };
// @ts-expect-error a handler typed `: void`
facet.watch(first, { resources, name: "m/theme2", onChange: onThemeVoid });
// Reusing a key list: as const, or an annotated tuple.
const keys = ["theme", "density"] as const;
void facet.read(keys);
const typedKeys: readonly ["theme", "density"] = ["theme", "density"];
void facet.read(typedKeys);

// N1 (second review): Frozen keeps primitives (branded IDs) and tuple element types.
type UserId = string & { readonly __brand: "UserId" };
declare function loadUser(id: UserId): void;
type Session = { readonly user: UserId; readonly pair: readonly [string, number]; readonly model: Model };
type Model = { readonly id: string; readonly tags: readonly string[] };
declare const initialSession: Session;
const sessions = createStore<Session>(initialSession, o);
const sessionSnap = sessions.read(["user", "pair", "model"]);
loadUser(sessionSnap.values.user);                          // a branded id read back is still a UserId
const pairFirst: string = sessionSnap.values.pair[0];       // a tuple element keeps its type
const pairSecond: number = sessionSnap.values.pair[1];
sessions.set({ model: sessionSnap.values.model });          // a frozen value read back can be written again
declare function render(model: Model): void;
render(sessionSnap.values.model);                           // a readonly domain type accepts store values
type MutableModel = { readonly id: string; readonly tags: string[] };
declare function renderMutable(model: MutableModel): void;
// @ts-expect-error a domain type with a mutable array does not accept frozen store values (declare it readonly)
renderMutable(sessionSnap.values.model);
void [pairFirst, pairSecond];

// T117: both read members promise only keys proved present in every tuple alternative.
type State = { readonly status: "ready" | "loading"; readonly count: number; readonly other: boolean };
declare const stateOwner: import("../dist/index.js").Store<State>;
const stateFacet = stateOwner.readonly();
declare const choose: boolean;
declare const dynamicKey: "status" | "count";
declare const alternatives: readonly ["status"] | readonly ["count"];
declare const broadKeys: import("../dist/index.js").Keys<State>;
declare const extra: readonly ("status" | "count")[];
for (const reader of [stateOwner, stateFacet]) {
  const fixed = reader.read(["status", "count"]);
  const requiredStatus: State["status"] = fixed.values.status;
  const requiredCount: number = fixed.values.count;
  const duplicate = reader.read(["status", "status"]);
  const duplicateStatus: State["status"] = duplicate.values.status;
  const dynamic = reader.read([dynamicKey]);
  // @ts-expect-error T117 dynamic selection may omit status
  const absentStatus: State["status"] = dynamic.values.status;
  // @ts-expect-error T117 dynamic selection may omit count
  const absentCount: number = dynamic.values.count;
  // @ts-expect-error T117 unselected keys stay inaccessible
  void dynamic.values.other;
  const alternative = reader.read(alternatives);
  // @ts-expect-error T117 a tuple alternative may omit status
  const alternateStatus: State["status"] = alternative.values.status;
  // @ts-expect-error T117 a tuple alternative may omit count
  const alternateCount: number = alternative.values.count;
  const broad = reader.read(broadKeys);
  // @ts-expect-error T117 broad key lists prove no individual key
  const broadStatus: State["status"] = broad.values.status;
  const explicit = reader.read<import("../dist/index.js").Keys<State>>(["status"]);
  // @ts-expect-error T117 explicit broad type argument cannot assert count presence
  const explicitCount: number = explicit.values.count;
  const prefix = reader.read(["status", ...extra]);
  const prefixStatus: State["status"] = prefix.values.status;
  // @ts-expect-error T117 unbounded rest may omit count
  const prefixCount: number = prefix.values.count;
  const suffix = reader.read(["status", ...extra, "count"]);
  const suffixStatus: State["status"] = suffix.values.status;
  const suffixCount: number | undefined = suffix.values.count;
  void [requiredStatus, requiredCount, duplicateStatus, absentStatus, absentCount, alternateStatus,
    alternateCount, broadStatus, explicitCount, prefixStatus, prefixCount, suffixStatus, suffixCount];
}

// T117: a legitimate predicate refines today's value, never the declared future domain.
const stateSnapshot = stateFacet.read(["status"]);
function isReady<S extends { readonly values: { readonly status: State["status"] } }>(snapshot: S): snapshot is S & { readonly values: { readonly status: "ready" } } {
  return snapshot.values.status === "ready";
}
if (isReady(stateSnapshot)) {
  const today: "ready" = stateSnapshot.values.status;
  stateFacet.watch(stateSnapshot, {
    resources, name: "state/watch", onChange: (next) => {
      const future: State["status"] = next.values.status;
      // @ts-expect-error T117 future callback may receive loading
      const impossible: "ready" = next.values.status;
      void [future, impossible];
    },
  });
  stateFacet.load(stateSnapshot, {
    resources, name: "state/load",
    loader: async (next) => {
      // @ts-expect-error T117 loader receives declared future domain
      const impossible: "ready" = next.values.status;
      void impossible;
      return { length: next.values.status.length };
    },
    onLoading: (next) => {
      // @ts-expect-error T117 onLoading receives declared future domain
      const impossible: "ready" = next.values.status;
      void impossible;
    },
    onResult: (result, next) => {
      const inferred: number = result.length;
      // @ts-expect-error T117 result inference is independent of snapshot refinement
      const wrongResult: string = result.length;
      // @ts-expect-error T117 onResult snapshot receives declared future domain
      const impossible: "ready" = next.values.status;
      void [inferred, wrongResult, impossible];
    },
    onError: (cause, next) => {
      const raw: unknown = cause;
      // @ts-expect-error T117 onError receives declared future domain
      const impossible: "ready" = next.values.status;
      void [raw, impossible];
    },
  });
  void today;
}
// T117: broad constraints remain optional and branch-specific keys survive distribution.
declare const broadSnapshot: import("../dist/index.js").SnapshotOf<State>;
stateFacet.watch(broadSnapshot, { resources, name: "state/broad", onChange: (next) => {
  const status: State["status"] | undefined = next.values.status;
  // @ts-expect-error T117 possible keys are not guaranteed present
  const count: number = next.values.count;
  void [status, count];
} });
const unionSnapshot = choose ? stateFacet.read(["status"]) : stateFacet.read(["count"]);
stateFacet.watch(unionSnapshot, { resources, name: "state/union", onChange: (next) => {
  if ("status" in next.values) {
    const status: State["status"] = next.values.status;
    void status;
  } else {
    const count: number = next.values.count;
    void count;
  }
} });
// T117: one owned union aggregate forbids impossible transitions and permits complete valid ones.
type AtomicState = { readonly state: { readonly status: "loading" } | { readonly status: "ready"; readonly result: number } };
declare const atomic: import("../dist/index.js").Store<AtomicState>;
atomic.set({ state: { status: "ready", result: 1 } });
// @ts-expect-error T117 ready state requires its result
atomic.set({ state: { status: "ready" } });
