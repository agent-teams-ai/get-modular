import type { Diagnostic } from "../authoring/internal.js";

export type DocumentLocator =
  | { readonly kind: "declaration"; readonly ordinal: number }
  | { readonly kind: "profile" };

// Only invocation roots, schema-known field names and admitted array indices
// enter this private helper. The prefix participates in the 32-segment cap.
export function documentPath(locator: DocumentLocator, local: readonly (string | number)[] = []): Diagnostic["path"] {
  const prefix = locator.kind === "declaration" ? ["declarations", locator.ordinal] : ["profile"];
  const segments = [...prefix, ...local];
  let length = 0;
  while (length < segments.length && length < 32) {
    const value = segments[length]!;
    if (typeof value === "number" && value > 65535) break;
    length += 1;
  }
  return Object.freeze(segments.slice(0, length).map(value => Object.freeze(typeof value === "string"
    ? { kind: "field" as const, value } : { kind: "index" as const, value })));
}
