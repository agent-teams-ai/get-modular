import type { ManyCardinality, ModuleDeclaration, OptionalCardinality, RequiredCardinality } from "./wire-types.js";

/** Preserves the input reference and literal inference; does not validate it. */
export function defineModule<const T extends ModuleDeclaration>(declaration: T): T {
  return declaration;
}

export function required(): RequiredCardinality {
  return { kind: "required" };
}

export function optional(): OptionalCardinality {
  return { kind: "optional" };
}

export function many(bounds: { readonly min: number; readonly max: number }): ManyCardinality {
  return { kind: "many", min: bounds.min, max: bounds.max, order: "profile" };
}
