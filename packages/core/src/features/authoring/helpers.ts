import type { ModuleDeclaration } from "./wire-types.js";

/** Preserves the input reference and literal inference; does not validate it. */
export function defineModule<const T extends ModuleDeclaration>(declaration: T): T {
  return declaration;
}

export function required(): { kind: "required" } {
  return { kind: "required" };
}

export function optional(): { kind: "optional" } {
  return { kind: "optional" };
}

export function many(bounds: { readonly min: number; readonly max: number }): {
  kind: "many";
  min: number;
  max: number;
  order: "profile";
} {
  return { kind: "many", min: bounds.min, max: bounds.max, order: "profile" };
}
