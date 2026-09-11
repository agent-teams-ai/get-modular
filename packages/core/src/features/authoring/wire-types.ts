// Authoring describes wire data; only compiler admission validates identities,
// numeric bounds, exact keys, and relationships between records.
export type ModuleDeclaration = {
  readonly kind: "get-modular.module-declaration";
  readonly schemaVersion: 1;
  readonly moduleId: string;
  readonly implementationId: string;
  readonly owner: { readonly authority: string; readonly path: readonly string[] };
  readonly provides: readonly {
    readonly capabilityId: string;
    readonly compatibility: {
      readonly family: "exact";
      readonly familyVersion: 1;
      readonly token: string;
    };
  }[];
  readonly slots: readonly {
    readonly capabilityId: string;
    readonly compatibility: {
      readonly family: "exact";
      readonly familyVersion: 1;
      readonly token: string;
    };
    readonly slotId: string;
    readonly cardinality:
      | Readonly<{ kind: "required" }>
      | Readonly<{ kind: "optional" }>
      | Readonly<{ kind: "many"; min: number; max: number; order: "profile" }>;
  }[];
};

export type CompositionProfile = {
  readonly kind: "get-modular.composition-profile";
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly roots: readonly string[];
  readonly selections: readonly {
    readonly moduleId: string;
    readonly implementationId: string;
  }[];
  readonly bindings: readonly {
    readonly consumerImplementationId: string;
    readonly slotId: string;
    readonly providerImplementationIds: readonly string[];
  }[];
};

export type CompositionPlan = {
  readonly kind: "get-modular.composition-plan";
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly roots: readonly string[];
  readonly selections: readonly {
    readonly moduleId: string;
    readonly implementationId: string;
  }[];
  readonly bindings: readonly {
    readonly consumerImplementationId: string;
    readonly slotId: string;
    readonly providerImplementationIds: readonly string[];
    readonly capabilityId: string;
    readonly compatibility: {
      readonly family: "exact";
      readonly familyVersion: 1;
      readonly token: string;
    };
  }[];
  readonly dependencyOrder: readonly string[];
};

/** Digest spelling; the compiler alone computes and validates its content. */
export type PlanDigest = `gm-plan:v1:sha-256:${string}`;
