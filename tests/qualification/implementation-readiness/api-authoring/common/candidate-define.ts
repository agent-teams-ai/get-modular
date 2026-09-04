import { cloneData, type CandidateAdapter, type Declaration, type World } from "./types.js";

export function defineModule<const T extends Declaration>(value: T & Record<Exclude<keyof T, keyof Declaration>, never>): T { return value; }

// candidate:authoring:start
export const definedExample: Declaration = defineModule({
  moduleId: "example/clock", implementationId: "example/clock/system",
  owner: { authority: "example", feature: "clock" }, provides: [{ id: "example/time", version: 1 }], slots: [],
});
// candidate:authoring:end

// candidate:glue:start
export const defineModuleAdapter: CandidateAdapter = {
  id: "define-module",
  encode: (world) => ({ syntax: "typed-defineModule", declaration: cloneData(world), profile: cloneData(world.profile) }),
  decode: (encoded) => cloneData(encoded.declaration) as World,
};
// candidate:glue:end
