import type { CompositionProfile } from "../authoring/internal.js";
import type { DiagnosticCollector } from "../diagnostics/internal.js";
import type { DeclarationCensus, DeclaredImplementation } from "./declaration-census.js";

type Selection = CompositionProfile["selections"][number];

function defined<T>(value: T | undefined): T {
  if (value === undefined) {throw new Error("Missing internal profile value");}
  return value;
}

function ordered(values: readonly string[]): string[] {
  const result = [...values];
  result.sort();
  return result;
}
export type ProfileCensus = {
  readonly selection: (moduleId: string) => Selection | null | undefined;
  readonly isSelected: (implementationId: string) => boolean;
  readonly selectedImplementationIds: readonly string[];
  readonly resolvedNodes: readonly DeclaredImplementation[] | null;
  readonly resolvedRoots: readonly string[] | null;
  readonly selectionsUnique: boolean;
  readonly hasErrors: boolean;
};

function groupSelections(profile: CompositionProfile): {
  readonly groups: Map<string, Selection[]>;
  readonly selected: Set<string>;
} {
  const groups = new Map<string, Selection[]>();
  const selected = new Set<string>();
  for (const row of profile.selections) {
    selected.add(row.implementationId);
    const group = groups.get(row.moduleId);
    if (group) {group.push(row);}
    else {groups.set(row.moduleId, [row]);}
  }
  return { groups, selected };
}

function validateSelectionGroups(groups: Map<string, Selection[]>, declarations: DeclarationCensus,
  add: DiagnosticCollector["addUnique"]): { readonly selectionsUnique: boolean; readonly selectionsResolved: boolean } {
  let selectionsUnique = true;
  let selectionsResolved = true;
  for (const [moduleId, rows] of groups) {
    if (rows.length > 1) {
      selectionsUnique = false;
      selectionsResolved = false;
      add(Object.freeze({ code: "profile.duplicate-selection", phase: "profile", path: Object.freeze([]),
        coordinate: Object.freeze({ moduleId }), details: Object.freeze({ reason: "duplicate" }) }));
    }
    if (declarations.moduleCensusComplete && !declarations.hasModule(moduleId)) {
      add(Object.freeze({ code: "profile.unknown-module", phase: "profile", path: Object.freeze([]),
        coordinate: Object.freeze({ moduleId }), details: Object.freeze({ reason: "unknown" }) }));
    }
    for (const implementationId of new Set(rows.map(row => row.implementationId))) {
      const known = declarations.implementation(implementationId);
      if (!known || known.declaration.moduleId !== moduleId) {selectionsResolved = false;}
      if (!declarations.identityCensusComplete) {continue;}
      if (known === undefined) {
        add(Object.freeze({ code: "profile.unknown-implementation", phase: "profile", path: Object.freeze([]),
          coordinate: Object.freeze({ moduleId, implementationId }), details: Object.freeze({ reason: "unknown" }) }));
      } else if (known !== null && known.declaration.moduleId !== moduleId) {
        add(Object.freeze({ code: "profile.implementation-mismatch", phase: "profile", path: Object.freeze([]),
          coordinate: Object.freeze({ moduleId, implementationId }), details: Object.freeze({ reason: "mismatch" }) }));
      }
    }
  }
  return { selectionsUnique, selectionsResolved };
}

function resolveRoots(profile: CompositionProfile, groups: Map<string, Selection[]>, declarations: DeclarationCensus,
  selectionsResolved: boolean, add: DiagnosticCollector["addUnique"]): readonly string[] | null {
  const roots = new Map<string, number>();
  for (const moduleId of profile.roots) {roots.set(moduleId, (roots.get(moduleId) ?? 0) + 1);}
  let resolved = selectionsResolved;
  const result: string[] = [];
  for (const [moduleId, count] of roots) {
    if (count > 1) {
      resolved = false;
      add(Object.freeze({ code: "profile.duplicate-root", phase: "profile", path: Object.freeze([]),
        coordinate: Object.freeze({ moduleId }), details: Object.freeze({ reason: "duplicate" }) }));
    }
    const rows = groups.get(moduleId);
    if (declarations.moduleCensusComplete && !declarations.hasModule(moduleId)) {
      add(Object.freeze({ code: "profile.unknown-root", phase: "profile", path: Object.freeze([]),
        coordinate: Object.freeze({ moduleId }), details: Object.freeze({ reason: "unknown" }) }));
    } else if (declarations.moduleCensusComplete && !rows) {
      add(Object.freeze({ code: "profile.missing-selection", phase: "profile", path: Object.freeze([]),
        coordinate: Object.freeze({ moduleId }), details: Object.freeze({ reason: "missing" }) }));
    }
    const known = rows?.length === 1 ? declarations.implementation(defined(rows[0]).implementationId) : undefined;
    if (known && known.declaration.moduleId === moduleId) {result.push(known.declaration.implementationId);}
    else {resolved = false;}
  }
  return resolved ? Object.freeze(ordered(result)) : null;
}

function resolveNodes(selectedImplementationIds: readonly string[], declarations: DeclarationCensus): readonly DeclaredImplementation[] | null {
  const result: DeclaredImplementation[] = [];
  for (const id of selectedImplementationIds) {
    const known = declarations.implementation(id);
    if (!known) {return null;}
    result.push(known);
  }
  return Object.freeze(result);
}

/** Whole-schema-admitted owned profile; census completeness is a precondition. */
export function createProfileCensus(profile: CompositionProfile, declarations: DeclarationCensus,
  collector: Pick<DiagnosticCollector, "addUnique">): ProfileCensus {
  const { groups, selected } = groupSelections(profile);
  let hasErrors = false;
  const add: DiagnosticCollector["addUnique"] = diagnostic => { hasErrors = true; collector.addUnique(diagnostic); };
  const { selectionsUnique, selectionsResolved } = validateSelectionGroups(groups, declarations, add);
  const selectedImplementationIds = ordered([...selected]);
  const resolvedNodes = resolveNodes(selectedImplementationIds, declarations);
  // Closure requires every selection to resolve, including non-root rows.
  const resolvedRoots = resolveRoots(profile, groups, declarations, selectionsResolved, add);
  return Object.freeze({ selection: (id: string) => {
    const rows = groups.get(id);
    return rows ? rows.length === 1 ? defined(rows[0]) : null : undefined;
  }, isSelected: (id: string) => selected.has(id), selectedImplementationIds: Object.freeze(selectedImplementationIds),
  resolvedNodes, resolvedRoots: resolvedNodes === null ? null : resolvedRoots, selectionsUnique, hasErrors });
}
