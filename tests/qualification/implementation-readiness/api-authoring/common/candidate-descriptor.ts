import { cloneData, encodedWorld, type CandidateAdapter, type Declaration, type World } from "./types.js";

// candidate:authoring:start
export const descriptorExample: Declaration = {
  moduleId: "example/clock", implementationId: "example/clock/system",
  owner: { authority: "example", path: ["clock"] }, provides: [{ id: "example/time", version: 1 }], slots: [],
} as const satisfies Declaration;
// candidate:authoring:end

// candidate:glue:start
export const descriptorAdapter: CandidateAdapter = {
  id: "descriptor-object",
  encode: (world: World) => cloneData({
    syntax: "inert-descriptor-object" as const,
    declarations: world.declarations,
    profile: world.profile,
    ...(world.desiredProfile ? { desiredProfile: world.desiredProfile } : {}),
    ...(world.fallbackBindings ? { fallbackBindings: world.fallbackBindings } : {}),
  }),
  decode: (encoded) => encodedWorld(encoded, encoded.declarations as readonly Declaration[]),
};
// candidate:glue:end
