import { cloneData, type CandidateAdapter, type Declaration, type World } from "./types.js";

export type ActivationFactory<TDependencies, TResult> = (dependencies: TDependencies) => TResult;

// candidate:authoring:start
export const splitDeclaration: Declaration = {
  moduleId: "example/clock", implementationId: "example/clock/system",
  owner: { authority: "example", feature: "clock" }, provides: [{ id: "example/time", version: 1 }], slots: [],
} as const satisfies Declaration;
export const splitActivationRef: "example/clock/system" = "example/clock/system";
// candidate:authoring:end

// candidate:glue:start
export const splitAdapter: CandidateAdapter = {
  id: "split-declaration-factory",
  encode: (world) => ({ syntax: "inert-declaration-plus-external-factory", declaration: cloneData(world), profile: cloneData(world.profile) }),
  decode: (encoded) => cloneData(encoded.declaration) as World,
};
// candidate:glue:end
