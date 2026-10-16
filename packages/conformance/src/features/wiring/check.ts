import type { SuccessfulComposition } from "@get-modular/assembly";
import { ConformanceError, invalid } from "../errors/errors.js";
import { readDeclarations, type DeclarationFacts } from "../records/declarations.js";
import { ownData } from "../records/own.js";
import type {
  WiringDifference, WiringOptions, WiringOracle, WiringRow,
} from "./types.js";

type ProviderMap = Map<string, readonly string[]>;
type RowMap = Map<string, WiringRow>;
type PlanSelection = { readonly module: string; readonly implementation: string };
type PlanBinding = WiringRow & { readonly capability: string };
type PlanData = {
  readonly selections: readonly PlanSelection[];
  readonly roots: readonly string[];
  readonly bindings: readonly PlanBinding[];
};

function ownRecord(record: unknown, path: string): Record<string, unknown> {
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw invalid(`checkWiring() requires ${path} to be an object`);
  }
  return record as Record<string, unknown>;
}

function ownArray(record: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(record)) {
    throw invalid(`checkWiring() requires ${path} to be an array`);
  }
  return record;
}

function ownText(record: unknown, path: string): string {
  if (typeof record !== "string" || record.length === 0) {
    throw invalid(`checkWiring() requires ${path} to be a non-empty string`);
  }
  return record;
}

function idList(value: unknown, path: string, allowText = false): readonly string[] {
  if (allowText && typeof value === "string") {
    return Object.freeze([ownText(value, path)]);
  }
  const values = ownArray(value, path);
  const ids: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    ids.push(ownText(ownData(values, String(index)), `${path}[${String(index)}]`));
  }
  if (new Set(ids).size !== ids.length) {
    throw invalid(`checkWiring() requires ${path} to contain distinct ids`);
  }
  return Object.freeze(ids);
}

const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
  sameIds(sorted(left), sorted(right));
const sorted = (ids: Iterable<string>): readonly string[] => Object.freeze([...new Set(ids)].toSorted());
const key = (consumer: string, slot: string): string => `${consumer}\u0000${slot}`;

function readPlan(composition: SuccessfulComposition): PlanData {
  const compositionRecord = ownRecord(composition, "composition");
  const plan = ownRecord(ownData(compositionRecord, "plan"), "composition.plan");
  const selections = ownArray(ownData(plan, "selections"), "composition.plan.selections").map((entry, index) => {
    const path = `composition.plan.selections[${String(index)}]`;
    return Object.freeze({
      module: ownText(ownData(entry, "moduleId"), `${path}.moduleId`),
      implementation: ownText(ownData(entry, "implementationId"), `${path}.implementationId`),
    });
  });
  const roots = ownArray(ownData(plan, "roots"), "composition.plan.roots")
    .map((entry, index) => ownText(entry, `composition.plan.roots[${String(index)}]`));
  const bindings = ownArray(ownData(plan, "bindings"), "composition.plan.bindings").map((entry, index) => {
    const path = `composition.plan.bindings[${String(index)}]`;
    return Object.freeze({
      consumer: ownText(ownData(entry, "consumerImplementationId"), `${path}.consumerImplementationId`),
      slot: ownText(ownData(entry, "slotId"), `${path}.slotId`),
      capability: ownText(ownData(entry, "capabilityId"), `${path}.capabilityId`),
      providers: idList(ownData(entry, "providerImplementationIds"), `${path}.providerImplementationIds`),
    });
  });
  return { selections, roots, bindings };
}

function mergeOracles(oracles: readonly WiringOracle[]): {
  readonly providers: ProviderMap;
  readonly roots: readonly string[];
  readonly rows: RowMap;
  readonly differences: WiringDifference[];
} {
  const providers: ProviderMap = new Map();
  const roots = new Set<string>();
  const rows: RowMap = new Map();
  const differences: WiringDifference[] = [];
  for (let index = 0; index < oracles.length; index += 1) {
    const path = `oracles[${String(index)}]`;
    const oracle: unknown = ownData(oracles, String(index));
    const providerRecord = ownRecord(ownData(oracle, "providers"), `${path}.providers`);
    for (const capability of Object.keys(providerRecord)) {
      const value = idList(ownData(providerRecord, capability), `${path}.providers.${capability}`, true);
      const earlier = providers.get(capability);
      if (earlier !== undefined && !sameSet(earlier, value)) {
        differences.push({
          rule: "oracle-provider-conflict", subject: capability, expected: earlier, actual: value,
          message: `oracle parts pin ${capability} to different providers`,
        });
      } else if (earlier === undefined) {
        providers.set(capability, value);
      }
    }
    const oracleRoots = ownData(oracle, "roots");
    if (oracleRoots !== undefined) {
      for (const root of idList(oracleRoots, `${path}.roots`)) {
        roots.add(root);
      }
    }
    const oracleRows = ownData(oracle, "rows");
    if (oracleRows !== undefined) {
      const values = ownArray(oracleRows, `${path}.rows`);
      for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
        const rowPath = `${path}.rows[${String(rowIndex)}]`;
        const row: unknown = ownData(values, String(rowIndex));
        const consumer = ownText(ownData(row, "consumer"), `${rowPath}.consumer`);
        const slot = ownText(ownData(row, "slot"), `${rowPath}.slot`);
        const providersForRow = idList(ownData(row, "providers"), `${rowPath}.providers`);
        const value: WiringRow = Object.freeze({ consumer, slot, providers: providersForRow });
        const rowKey = key(consumer, slot);
        const earlier = rows.get(rowKey);
        if (earlier !== undefined && !sameIds(earlier.providers, value.providers)) {
          differences.push({
            rule: "oracle-row-conflict", subject: `${consumer}.${slot}`, expected: earlier.providers,
            actual: value.providers, message: `oracle parts list different providers for ${consumer}.${slot}`,
          });
        } else if (earlier === undefined) {
          rows.set(rowKey, value);
        }
      }
    }
  }
  return { providers, roots: sorted(roots), rows, differences };
}

type DeclarationIndex = ReadonlyMap<string, DeclarationFacts>;

function checkRowDeclaration(
  binding: PlanBinding,
  row: WiringRow,
  declarations: DeclarationIndex,
  differences: WiringDifference[],
): void {
  const subject = `${binding.consumer}.${binding.slot}`;
  const slot = declarations.get(binding.consumer)?.slots.get(binding.slot);
  if (declarations.has(binding.consumer) && slot === undefined) {
    differences.push({
      rule: "row-slot", subject, expected: [], actual: row.providers,
      message: `plan row ${subject} names a slot its consumer's declaration does not have`,
    });
  } else if (slot !== undefined && slot.capabilityId !== binding.capability) {
    differences.push({
      rule: "row-capability", subject, expected: [slot.capabilityId], actual: [binding.capability],
      message: `plan row ${subject} uses capability ${binding.capability}, its declared slot uses ${slot.capabilityId}`,
    });
  }
}

function checkRows(
  bindings: readonly PlanBinding[],
  merged: ReturnType<typeof mergeOracles>,
  declarations: DeclarationIndex,
  differences: WiringDifference[],
): void {
  const actualRows: RowMap = new Map();
  for (const binding of bindings) {
    const row: WiringRow = Object.freeze({
      consumer: binding.consumer, slot: binding.slot, providers: binding.providers,
    });
    const rowKey = key(binding.consumer, binding.slot);
    actualRows.set(rowKey, row);
    const pinned = merged.providers.get(binding.capability);
    if (pinned === undefined && binding.providers.length > 0) {
      differences.push({
        rule: "capability-provider", subject: binding.capability, expected: [], actual: binding.providers,
        message: `plan row ${binding.consumer}.${binding.slot} uses an unpinned capability`,
      });
    }
    const slot = declarations.get(binding.consumer)?.slots.get(binding.slot);
    checkRowDeclaration(binding, row, declarations, differences);
    const listed = merged.rows.get(rowKey);
    if (listed !== undefined) {
      if (!sameIds(listed.providers, row.providers)) {
        const rule = sameSet(listed.providers, row.providers) ? "row-order" : "row";
        differences.push({
          rule, subject: `${binding.consumer}.${binding.slot}`, expected: listed.providers, actual: row.providers,
          message: `plan row ${binding.consumer}.${binding.slot} differs from its listed oracle row`,
        });
      }
      continue;
    }
    const accepted = slot?.cardinality === "required"
      && pinned !== undefined && pinned.length === 1 && sameIds(row.providers, pinned);
    if (!accepted) {
      differences.push({
        rule: "unlisted-row", subject: `${binding.consumer}.${binding.slot}`, expected: pinned ?? [],
        actual: row.providers,
        message: unlistedMessage(slot?.cardinality, pinned, binding),
      });
    }
  }
  for (const [rowKey, listed] of merged.rows) {
    if (!actualRows.has(rowKey)) {
      differences.push({
        rule: "row", subject: `${listed.consumer}.${listed.slot}`, expected: listed.providers, actual: [],
        message: `listed oracle row ${listed.consumer}.${listed.slot} is absent from the plan`,
      });
    }
  }
}

function checkDeclarations(
  declarations: DeclarationIndex,
  selected: ReadonlySet<string>,
  providers: ProviderMap,
  differences: WiringDifference[],
): void {
  const declaredIds = sorted(declarations.keys());
  const selectedIds = sorted(selected);
  if (!sameIds(declaredIds, selectedIds)) {
    differences.push({
      rule: "declaration-selection", subject: "declarations", expected: selectedIds, actual: declaredIds,
      message: "declarations must cover the plan selections exactly",
    });
  }
  for (const [capability, pinned] of providers) {
    for (const id of pinned) {
      const entry = declarations.get(id);
      if (entry !== undefined && selected.has(id) && !entry.provides.includes(capability)) {
        differences.push({
          rule: "pinned-provider", subject: capability, expected: [id], actual: entry.provides,
          message: `${id} is pinned as a provider of ${capability}, but its declaration does not provide it`,
        });
      }
    }
  }
  for (const entry of declarations.values()) {
    if (!selected.has(entry.implementationId)) {
      continue;
    }
    for (const capability of new Set(entry.provides)) {
      const pinned = providers.get(capability);
      if (pinned === undefined || !pinned.includes(entry.implementationId)) {
        differences.push({
          rule: "provided-capability", subject: capability, expected: pinned ?? [], actual: [entry.implementationId],
          message: `${entry.implementationId} provides ${capability}, which the oracle does not pin to it`,
        });
      }
    }
  }
}

function unlistedMessage(
  cardinality: "required" | "optional" | "many" | undefined,
  pinned: readonly string[] | undefined,
  binding: PlanBinding,
): string {
  const subject = `${binding.consumer}.${binding.slot}`;
  if (cardinality === undefined) {
    return `unlisted plan row ${subject} has no declared slot to prove it is required`;
  }
  if (cardinality !== "required") {
    return `unlisted plan row ${subject} is ${cardinality}; only a required row may be left out`;
  }
  return pinned !== undefined && pinned.length > 1
    ? `every row of multi-provider capability ${binding.capability} must be listed`
    : `unlisted plan row ${subject} does not bind its single pinned provider`;
}

/**
 * Compares a completed composition with the independent provider oracle. It collects every difference before it
 * throws `conformance.wiring.mismatch`; the accepted weakening for an unlisted single-provider `required` row is
 * deliberate and is documented by its accepting test. The declarations the test already passes to
 * `compileComposition` and `checkNamespaces` prove what the plan cannot show: which capabilities a module provides and
 * the cardinality of each slot.
 */
export function checkWiring(
  composition: SuccessfulComposition,
  oracles: readonly WiringOracle[],
  options: WiringOptions,
): void {
  if (!Array.isArray(oracles)) {
    throw invalid("checkWiring() requires oracles to be an array");
  }
  const declared = readDeclarations(ownData(options, "declarations"), "options.declarations", "checkWiring");
  const declarations: Map<string, DeclarationFacts> = new Map();
  for (const entry of declared) {
    if (declarations.has(entry.implementationId)) {
      throw invalid(`checkWiring() requires options.declarations to contain distinct implementation ids (${entry.implementationId})`);
    }
    declarations.set(entry.implementationId, entry);
  }
  const { selections, roots, bindings } = readPlan(composition);
  const merged = mergeOracles(oracles);
  const differences: WiringDifference[] = [...merged.differences];
  const selected = new Set(selections.map(entry => entry.implementation));
  const expectedSelections = sorted([...merged.providers.values()].flat().concat(merged.roots));
  const actualSelections = sorted(selected);
  if (!sameIds(expectedSelections, actualSelections)) {
    differences.push({
      rule: "selection", subject: "selections", expected: expectedSelections, actual: actualSelections,
      message: "plan selections must equal pinned providers plus roots",
    });
  }
  const implementationByModule = new Map(selections.map(entry => [entry.module, entry.implementation]));
  const actualRoots = sorted(roots.map(root => implementationByModule.get(root) ?? root));
  if (!sameIds(merged.roots, actualRoots)) {
    differences.push({
      rule: "root", subject: "roots", expected: merged.roots, actual: actualRoots,
      message: "plan roots must equal oracle roots",
    });
  }
  for (const [capability, providers] of merged.providers) {
    const missing = providers.filter(id => !selected.has(id));
    if (missing.length > 0) {
      differences.push({
        rule: "capability-provider", subject: capability, expected: providers,
        actual: providers.filter(id => selected.has(id)),
        message: `pinned providers of ${capability} are missing from plan selections`,
      });
    }
  }
  checkDeclarations(declarations, selected, merged.providers, differences);
  checkRows(bindings, merged, declarations, differences);
  if (differences.length > 0) {
    throw new ConformanceError("conformance.wiring.mismatch",
      `${String(differences.length)} wiring difference${differences.length === 1 ? "" : "s"}: ${
        differences.map(entry => `${entry.rule} ${entry.subject}`).join("; ")}`,
      { details: { differences } });
  }
}
