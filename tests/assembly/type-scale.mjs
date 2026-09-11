export function largeLiteralSource() {
  const count = 1000;
  const declarations = Array.from({ length: count }, (_, index) => {
    return `const factory${index} = api.bindFactory(defineModule({
  kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: "type-scale/item-${index}", implementationId: "type-scale/item-${index}",
  owner: { authority: "synthetic", path: ["types"] },
  provides: [{ capabilityId: "synthetic/value", compatibility: { family: "exact", familyVersion: 1, "token": "synthetic/v1" } }],
  slots: [],
}), async () => ({ instance: { index: ${index} }, capabilities: { "synthetic/value": ${index} } }));`;
  });
  return [
    'import { defineModule } from "@get-modular/core";',
    'import { assemblyFor } from "@get-modular/assembly";',
    'import type { AnyFactoryHandle, CapabilityContract, SuccessfulComposition } from "@get-modular/assembly";',
    'type C = { "synthetic/value": CapabilityContract<number, "synthetic/v1"> };',
    'const api = assemblyFor<C>();',
    ...declarations,
    `const factories = [${Array.from({ length: count }, (_, index) => `factory${index}`).join(", ")}] satisfies readonly AnyFactoryHandle<C>[];`,
    'declare const composition: SuccessfulComposition;',
    'async function consume() {',
    `  const result = await api.prepare({ composition, factories, roots: { last: factory${count - 1} } });`,
    '  if (result.status !== "prepared") return;',
    '  const outcome = await result.prepared.run();',
    '  if (outcome.status === "succeeded") { const value: number = outcome.roots.last.index; void value; }',
    '}',
  ].join("\n") + "\n";
}
