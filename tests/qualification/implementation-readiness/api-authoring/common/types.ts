export type EvidenceClass = "semantic" | "representation" | "host-probe";
export type Cardinality =
  | Readonly<{ kind: "required" }>
  | Readonly<{ kind: "optional" }>
  | Readonly<{ kind: "many"; min: number; max: number }>;
export type Capability = Readonly<{ id: string; version: number }>;
export type Slot = Readonly<{ id: string; capability: Capability; cardinality: Cardinality }>;
export type Declaration = Readonly<{
  moduleId: string;
  implementationId: string;
  owner: Readonly<{ authority: string; feature: string }>;
  provides: readonly Capability[];
  slots: readonly Slot[];
}>;
export type Selection = Readonly<{ moduleId: string; implementationId: string }>;
export type Binding = Readonly<{
  consumerImplementationId: string;
  slotId: string;
  providerImplementationIds: readonly string[];
}>;
export type Profile = Readonly<{
  roots: readonly string[];
  selections: readonly Selection[];
  bindings: readonly Binding[];
}>;
export type World = Readonly<{
  declarations: readonly Declaration[];
  profile: Profile;
  diagnosticLimit?: number;
  extra?: unknown;
  hostile?: Readonly<Record<string, string>>;
}>;
export type Diagnostic = Readonly<{ code: string; path: string; detail: string }>;
export type Outcome = Readonly<{
  ok: boolean;
  diagnostics: readonly Diagnostic[];
  inventory: readonly string[];
  dependencyOrder: readonly string[];
}>;
export type Expected = Readonly<{
  ok: boolean;
  codes: readonly string[];
  inventory?: readonly string[];
  dependencyOrder?: readonly string[];
}>;
export type Scenario = Readonly<{
  id: string;
  title: string;
  evidenceClass: EvidenceClass;
  input: World;
  expected: Expected;
  hostProbe?: "direct-pure-di" | "selected-literal-loader";
}>;
export type EncodedCandidate = Readonly<{
  syntax: string;
  declaration: unknown;
  profile: unknown;
}>;
export type CandidateAdapter = Readonly<{
  id: "descriptor-object" | "define-module" | "split-declaration-factory";
  encode: (world: World) => EncodedCandidate;
  decode: (encoded: EncodedCandidate) => World;
}>;

export function deepFreeze<T>(value: T): T {
  const pending: unknown[] = [value];
  const seen = new Set<unknown>();
  while (pending.length) {
    const item = pending.pop();
    if (item === null || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    for (const key of Object.keys(item)) pending.push((item as Record<string, unknown>)[key]);
    Object.freeze(item);
  }
  return value;
}

export function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
