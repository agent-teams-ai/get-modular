// Authoring describes wire data; only compiler admission validates identities,
// numeric bounds, exact keys, and relationships between records.
export type Compatibility = {
  readonly family: "exact";
  readonly familyVersion: 1;
  readonly token: string;
};

export type RequiredCardinality = { kind: "required" };
export type OptionalCardinality = { kind: "optional" };
export type ManyCardinality = {
  kind: "many";
  min: number;
  max: number;
  order: "profile";
};
export type Cardinality =
  | Readonly<RequiredCardinality>
  | Readonly<OptionalCardinality>
  | Readonly<ManyCardinality>;

export type ProvidedCapability = {
  readonly capabilityId: string;
  readonly compatibility: Compatibility;
};

export type DependencySlot = ProvidedCapability & {
  readonly slotId: string;
  readonly cardinality: Cardinality;
};

export type ModuleDeclaration = {
  readonly kind: "get-modular.module-declaration";
  readonly schemaVersion: 1;
  readonly moduleId: string;
  readonly implementationId: string;
  readonly owner: { readonly authority: string; readonly path: readonly string[] };
  readonly provides: readonly ProvidedCapability[];
  readonly slots: readonly DependencySlot[];
};

export type Selection = {
  readonly moduleId: string;
  readonly implementationId: string;
};

export type Binding = {
  readonly consumerImplementationId: string;
  readonly slotId: string;
  readonly providerImplementationIds: readonly string[];
};

export type CompositionProfile = {
  readonly kind: "get-modular.composition-profile";
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly roots: readonly string[];
  readonly selections: readonly Selection[];
  readonly bindings: readonly Binding[];
};

export type PlanBinding = Binding & ProvidedCapability;

export type CompositionPlan = {
  readonly kind: "get-modular.composition-plan";
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly roots: readonly string[];
  readonly selections: readonly Selection[];
  readonly bindings: readonly PlanBinding[];
  readonly dependencyOrder: readonly string[];
};

/** Digest spelling; the compiler alone computes and validates its content. */
export type PlanDigest = `gm-plan:v1:sha-256:${string}`;
