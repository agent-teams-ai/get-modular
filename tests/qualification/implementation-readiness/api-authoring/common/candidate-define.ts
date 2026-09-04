import { cloneData, encodedWorld, type CandidateAdapter, type Cardinality, type Declaration, type World } from "./types.js";

export function defineModule<const T extends Declaration>(value: T): T { return value; }
export function required(): { kind: "required" } { return { kind: "required" }; }
export function optional(): { kind: "optional" } { return { kind: "optional" }; }
export function many(options: { min: number; max: number }): { kind: "many"; min: number; max: number; order: "profile" } {
  return { kind: "many", min: options.min, max: options.max, order: "profile" };
}

const authorCardinality = (value: Cardinality): Cardinality => value.kind === "required"
  ? required()
  : value.kind === "optional"
    ? optional()
    : many({ min: value.min, max: value.max });
const authorDeclaration = (value: Declaration): Declaration => {
  const declaration = cloneData(value);
  return defineModule({ ...declaration, slots: declaration.slots.map((slot) => ({ ...slot, cardinality: authorCardinality(slot.cardinality) })) });
};

// candidate:authoring:start
export const definedExample: Declaration = defineModule({
  moduleId: "example/clock", implementationId: "example/clock/system",
  owner: { authority: "example", path: ["clock"] }, provides: [{ id: "example/time", version: 1 }], slots: [],
});
// candidate:authoring:end

// candidate:glue:start
export const defineModuleAdapter: CandidateAdapter = {
  id: "define-module",
  encode: (world: World) => ({
    syntax: "typed-defineModule",
    declarations: world.declarations.map(authorDeclaration),
    profile: cloneData(world.profile),
    ...(world.desiredProfile ? { desiredProfile: cloneData(world.desiredProfile) } : {}),
    ...(world.fallbackBindings ? { fallbackBindings: cloneData(world.fallbackBindings) } : {}),
  }),
  decode: (encoded) => encodedWorld(encoded, encoded.declarations as readonly Declaration[]),
};
// candidate:glue:end
