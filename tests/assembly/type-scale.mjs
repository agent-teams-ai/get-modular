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

// ADR-0032 fragments: each team binds its handles under its own descriptor map; the Host prepares every
// handle under one interface map derived from all descriptors.
export function fragmentSource(count = 500, teams = 20) {
  if (!Number.isInteger(count / teams)) throw new Error("fragmentSource: count must be a multiple of teams");
  const perTeam = count / teams;
  const slotsOf = (index) => (index === 0 ? [] : index === 1 ? [0] : [index - 1, Math.floor(index / 2)]);
  const all = Array.from({ length: count }, (_, index) => index);
  const lines = [
    'import { required } from "@get-modular/core";',
    'import { assemblyFor, declareModule, defineContract } from "@get-modular/assembly";',
    'import type { CapabilitiesOf, SuccessfulComposition } from "@get-modular/assembly";',
    ...all.map((index) => `const C${index} = defineContract<{ readonly v${index}: (x: number) => number }>()({ id: "fragment/c${index}", revision: ${1 + (index % 3)} });`),
  ];
  for (let team = 0; team < teams; team += 1) {
    const modules = Array.from({ length: perTeam }, (_, offset) => team * perTeam + offset);
    const used = [...new Set(modules.flatMap((index) => [index, ...slotsOf(index)]))].sort((a, b) => a - b);
    lines.push(`interface Team${team} extends CapabilitiesOf<${used.map((index) => `typeof C${index}`).join(" | ")}> {}`);
    lines.push(`const team${team} = assemblyFor<Team${team}>();`);
    for (const index of modules) {
      const slots = slotsOf(index).map((slot) => `C${slot}.slot("s${slot}", required())`).join(", ");
      const body = slotsOf(index).map((slot) => `deps.s${slot}.v${slot}(1)`).join(" + ") || "0";
      lines.push(`const h${index} = team${team}.bindFactory(declareModule({ moduleId: "fragment/m${index}", implementationId: "fragment/m${index}", owner: { authority: "fragment", path: ["t${team}"] }, provides: [C${index}.provide()], slots: [${slots}] }), async (deps) => ({ instance: { n: ${body} }, capabilities: { "fragment/c${index}": { v${index}: (x: number) => x } } }));`);
    }
  }
  lines.push(
    `interface HostCapabilities extends CapabilitiesOf<${all.map((index) => `typeof C${index}`).join(" | ")}> {}`,
    "const host = assemblyFor<HostCapabilities>();",
    "declare const composition: SuccessfulComposition;",
    "export async function consumeFragments(): Promise<number> {",
    `  const ready = await host.prepare({ composition, factories: [${all.map((index) => `h${index}`).join(", ")}], roots: { last: h${count - 1} } });`,
    '  if (ready.status !== "prepared") return 0;',
    "  const outcome = await ready.prepared.run({ scope: undefined });",
    '  return outcome.status === "succeeded" ? outcome.roots.last.n : 0;',
    "}",
  );
  return lines.join("\n") + "\n";
}
