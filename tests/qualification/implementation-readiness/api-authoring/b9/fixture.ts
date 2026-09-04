export type RequiredCardinality = { kind: "required" };
export type OptionalCardinality = { kind: "optional" };
export type ManyCardinality = { kind: "many"; min: number; max: number; order: "profile" };

export function required(): RequiredCardinality {
  return { kind: "required" };
}

export function optional(): OptionalCardinality {
  return { kind: "optional" };
}

export function many(input: { min: number; max: number }): ManyCardinality {
  return { kind: "many", min: input.min, max: input.max, order: "profile" };
}

export function defineModule<T>(value: T): T {
  return value;
}

export const exactShapeModule = defineModule({
  moduleId: "get-modular/example-module",
  slots: {
    storage: required(),
    cache: optional(),
    transforms: many({ min: 1, max: 8 }),
  },
});
