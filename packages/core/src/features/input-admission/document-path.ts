import type { Diagnostic } from "../authoring/internal.js";

export type DocumentLocator =
  | { readonly kind: "declaration"; readonly ordinal: number }
  | { readonly kind: "profile" };

// Only invocation roots, schema-known field names and admitted array indices
// enter this private helper. The prefix participates in the 32-segment cap.
export function documentPath(locator: DocumentLocator, local: readonly (string | number)[] = []): Diagnostic["path"] {
  const prefix = locator.kind === "declaration" ? ["declarations", locator.ordinal] : ["profile"];
  return Object.freeze([...prefix, ...local].slice(0, 32).map(value => Object.freeze(typeof value === "string"
    ? { kind: "field" as const, value } : { kind: "index" as const, value })));
}
