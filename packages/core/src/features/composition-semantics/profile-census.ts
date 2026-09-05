import type { CompositionProfile } from "../authoring/internal.js";
import type { DiagnosticCollector } from "../diagnostics/internal.js";
import type { DeclarationCensus, DeclaredImplementation } from "./declaration-census.js";

type Selection = CompositionProfile["selections"][number];
export type ProfileCensus = {
  readonly selection: (moduleId: string) => Selection | null | undefined;
  readonly isSelected: (implementationId: string) => boolean;
  readonly selectedImplementationIds: readonly string[];
  readonly resolvedNodes: readonly DeclaredImplementation[] | null;
  readonly resolvedRoots: readonly string[] | null;
  readonly selectionsUnique: boolean;
  readonly hasErrors: boolean;
};

/** Whole-schema-admitted owned profile; census completeness is a precondition. */
export function createProfileCensus(profile: CompositionProfile, declarations: DeclarationCensus,
  collector: Pick<DiagnosticCollector, "addUnique">): ProfileCensus {
  const groups = new Map<string, Selection[]>();
  const selected = new Set<string>();
  for (const row of profile.selections) {
    selected.add(row.implementationId);
    const group = groups.get(row.moduleId);
    if (group) group.push(row);
    else groups.set(row.moduleId, [row]);
  }
  let selectionsUnique = true;
  let selectionsResolved = true;
  let hasErrors = false;
  const add: DiagnosticCollector["addUnique"] = diagnostic => { hasErrors = true; collector.addUnique(diagnostic); };
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
    // Repeated equal rows have one normalized semantic coordinate. Distinct
    // rows of an ambiguous module are all checked; none is the chosen winner.
    for (const implementationId of new Set(rows.map(row => row.implementationId))) {
      const known = declarations.implementation(implementationId);
      if (!known || known.declaration.moduleId !== moduleId) selectionsResolved = false;
      if (!declarations.identityCensusComplete) continue;
      if (known === undefined) {
        add(Object.freeze({ code: "profile.unknown-implementation", phase: "profile", path: Object.freeze([]),
          coordinate: Object.freeze({ moduleId, implementationId }), details: Object.freeze({ reason: "unknown" }) }));
      } else if (known !== null && known.declaration.moduleId !== moduleId) {
        add(Object.freeze({ code: "profile.implementation-mismatch", phase: "profile", path: Object.freeze([]),
          coordinate: Object.freeze({ moduleId, implementationId }), details: Object.freeze({ reason: "mismatch" }) }));
      }
    }
  }
  const roots = new Map<string, number>();
  for (const moduleId of profile.roots) roots.set(moduleId, (roots.get(moduleId) ?? 0) + 1);
  // Closure requires every selection to resolve, including non-root rows.
  let rootsResolved = selectionsResolved;
  const resolvedRoots: string[] = [];
  for (const [moduleId, count] of roots) {
    if (count > 1) {
      rootsResolved = false;
      add(Object.freeze({ code: "profile.duplicate-root", phase: "profile", path: Object.freeze([]),
        coordinate: Object.freeze({ moduleId }), details: Object.freeze({ reason: "duplicate" }) }));
    }
    const rows = groups.get(moduleId);
    if (declarations.moduleCensusComplete) {
      if (!declarations.hasModule(moduleId)) {
        add(Object.freeze({ code: "profile.unknown-root", phase: "profile", path: Object.freeze([]),
          coordinate: Object.freeze({ moduleId }), details: Object.freeze({ reason: "unknown" }) }));
      } else if (!rows) {
        add(Object.freeze({ code: "profile.missing-selection", phase: "profile", path: Object.freeze([]),
          coordinate: Object.freeze({ moduleId }), details: Object.freeze({ reason: "missing" }) }));
      }
    }
    const known = rows?.length === 1 ? declarations.implementation(rows[0]!.implementationId) : undefined;
    if (known && known.declaration.moduleId === moduleId) resolvedRoots.push(known.declaration.implementationId);
    else rootsResolved = false;
  }
  const selectedImplementationIds = [...selected].sort();
  const resolvedNodes: DeclaredImplementation[] = [];
  let nodesResolved = true;
  for (const id of selectedImplementationIds) {
    const known = declarations.implementation(id);
    if (known) resolvedNodes.push(known);
    else nodesResolved = false;
  }
  return Object.freeze({ selection: (id: string) => {
    const rows = groups.get(id);
    return rows ? rows.length === 1 ? rows[0]! : null : undefined;
  }, isSelected: (id: string) => selected.has(id), selectedImplementationIds: Object.freeze(selectedImplementationIds),
  resolvedNodes: nodesResolved ? Object.freeze(resolvedNodes) : null,
  resolvedRoots: rootsResolved && nodesResolved ? Object.freeze(resolvedRoots.sort()) : null, selectionsUnique, hasErrors });
}
