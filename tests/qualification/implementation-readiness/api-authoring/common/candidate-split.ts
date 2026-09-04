import { cloneData, encodedWorld, type CandidateAdapter, type Declaration, type World } from "./types.js";

export type ActivationFactory<TDependencies, TResult> = (dependencies: TDependencies) => TResult;
type AuthoredModule = Readonly<{ declaration: Declaration; activationRef: string }>;

// candidate:authoring:start
export const splitDeclaration: Declaration = {
  moduleId: "example/clock", implementationId: "example/clock/system",
  owner: { authority: "example", path: ["clock"] }, provides: [{ id: "example/time", version: 1 }], slots: [],
} as const satisfies Declaration;
export const splitActivationRef: "example/clock/system" = "example/clock/system";
// candidate:authoring:end

// candidate:glue:start
export const splitAdapter: CandidateAdapter = {
  id: "split-declaration-factory",
  encode: (world: World) => ({
    syntax: "inert-declaration-plus-activation-ref",
    declarations: cloneData(world.declarations).map((declaration) => ({ declaration, activationRef: declaration.implementationId })),
    profile: cloneData(world.profile),
    ...(world.desiredProfile ? { desiredProfile: cloneData(world.desiredProfile) } : {}),
    ...(world.fallbackBindings ? { fallbackBindings: cloneData(world.fallbackBindings) } : {}),
  }),
  decode: (encoded) => encodedWorld(encoded, (encoded.declarations as readonly AuthoredModule[]).map(({ declaration }) => declaration)),
};
// candidate:glue:end
