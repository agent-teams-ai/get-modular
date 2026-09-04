import { cloneData, type CandidateAdapter, type Declaration, type World } from "./types.js";

// candidate:authoring:start
export const descriptorExample: Declaration = {
  moduleId: "example/clock", implementationId: "example/clock/system",
  owner: { authority: "example", feature: "clock" }, provides: [{ id: "example/time", version: 1 }], slots: [],
} as const satisfies Declaration;
// candidate:authoring:end

// candidate:glue:start
export const descriptorAdapter: CandidateAdapter = {
  id: "descriptor-object",
  encode: (world) => ({ syntax: "inert-descriptor-object", declaration: cloneData(world), profile: cloneData(world.profile) }),
  decode: (encoded) => cloneData(encoded.declaration) as World,
};
// candidate:glue:end
