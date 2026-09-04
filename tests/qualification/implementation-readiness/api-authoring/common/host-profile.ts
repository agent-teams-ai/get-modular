import type { CompositionInput, Diagnostic, World } from "./types.js";

// A chosen test-Host policy, not Get Modular's desired-state protocol.
export function prepareHostProfile(world: World): Readonly<{ input: CompositionInput; refusals: readonly Diagnostic[] }> {
  const disabled = new Set(world.desiredProfile?.disabledModuleIds ?? []);
  const disabledImplementations = new Set(world.declarations.filter(({ moduleId }) => disabled.has(moduleId)).map(({ implementationId }) => implementationId));
  return {
    input: {
      declarations: world.declarations,
      profile: {
        roots: world.profile.roots.filter((root) => !disabled.has(root)),
        selections: world.profile.selections.filter(({ moduleId }) => !disabled.has(moduleId)),
        bindings: world.profile.bindings.filter(({ consumerImplementationId }) => !disabledImplementations.has(consumerImplementationId)).map((binding) => ({
          ...binding,
          providerImplementationIds: binding.providerImplementationIds.filter((id) => !disabledImplementations.has(id)),
        })),
      },
    },
    refusals: world.profile.roots.filter((root) => disabled.has(root)).sort().map((root) => ({ code: "host.profile.root-disabled", path: "/desired-profile", detail: root })),
  };
}
