import type { SuccessfulComposition } from "@get-modular/assembly";
import { ownData } from "../records/own.js";

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function revision(token: unknown): string {
  const match = typeof token === "string" ? /r([0-9]+)$/u.exec(token) : undefined;
  return match === null || match === undefined ? "?" : match[1] ?? "?";
}

/** Prints a compact debug view of roots, selections and completed rows. It is not an oracle format. */
export function describeWiring(composition: SuccessfulComposition): string {
  const plan = ownData(composition, "plan");
  const selectionRecords = list(ownData(plan, "selections"));
  const implementationByModule = new Map(selectionRecords.map(entry => [
    String(ownData(entry, "moduleId")), String(ownData(entry, "implementationId")),
  ]));
  const roots = list(ownData(plan, "roots")).map(value => implementationByModule.get(String(value)) ?? String(value));
  const selections = selectionRecords.map(entry => {
    const module = String(ownData(entry, "moduleId"));
    const implementation = String(ownData(entry, "implementationId"));
    return `  ${module} <- ${implementation}`;
  });
  const rows = list(ownData(plan, "bindings")).map(entry => {
    const consumer = String(ownData(entry, "consumerImplementationId"));
    const slot = String(ownData(entry, "slotId"));
    const providers = list(ownData(entry, "providerImplementationIds")).map(String).join(", ");
    const capability = String(ownData(entry, "capabilityId"));
    return `  ${consumer}.${slot} <- ${providers} [${capability} r${revision(ownData(ownData(entry, "compatibility"), "token"))}]`;
  });
  return [
    "roots:",
    ...roots.map(root => `  ${root}`),
    "selections:",
    ...selections,
    "rows:",
    ...rows,
  ].join("\n");
}
