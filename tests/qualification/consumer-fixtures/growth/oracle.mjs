// Independently owned expectations from scenario G; no subject/generator imports.
export const smallSeed17 = Object.freeze([528, 562, 1175, 4717, 22478, 116017, 715089, 24612]);
export const smallSeed23Root = 603377;

export function expectedSourcePaths(size) {
  const paths = ["src/composition/growth.root.ts", "src/features/f000/composition/input.declaration.ts",
    "src/features/f000/composition/f000.inputs.ts"];
  for (let index = 0; index < size; index += 1) {
    const feature = `f${String(index).padStart(3, "0")}`;
    for (const file of ["contracts/value.ts", "application/ports/value.ts", "application/use-cases/read-value.ts",
      `composition/${feature}.contracts.ts`, "composition/value.declaration.ts", "composition/value.module.ts", `composition/${feature}.group.ts`]) {
      paths.push(`src/features/${feature}/${file}`);
    }
  }
  return paths.toSorted();
}

export function expectedValues(size, seed) {
  const values = [];
  for (let position = 0; position < size; position += 1) {
    let value = position === 0 ? 31 * seed + 1 : 17 * (position + 1);
    for (let earlier = 0; earlier < position; earlier += 1) {
      if (earlier === position - 1 || earlier === Math.floor(position / 2)) { value += (earlier + 1) * values[earlier]; }
    }
    values.push(value % 1000003);
  }
  return values;
}

export function providerOracleParts(size) {
  const featureParts = Array.from({ length: size }, (_, index) => {
    const feature = `f${String(index).padStart(3, "0")}`;
    return { providers: { [`fixture/growth/${feature}/value`]: `fixture/growth/${feature}/default` } };
  });
  featureParts[0].providers["fixture/growth/seed"] = "fixture/growth/seed-input/default";
  return [...featureParts, {
    providers: {}, roots: [`fixture/growth/f${String(size - 1).padStart(3, "0")}/default`],
  }];
}

export function expectedInventory(size) {
  let dependencyReads = 0;
  const callsByFeature = [];
  for (let position = 1; position <= size; position += 1) {
    const calls = 1 + 2 * (size - position + 1);
    callsByFeature.push(calls);
    dependencyReads += calls * (position < 4 ? 1 : 2);
  }
  return {
    declarations: size + 1, entriesAndGroups: 2 * size, bindings: 2 * size - 3,
    pathNodes: size + 1, sourceFiles: 7 * size + 3,
    smokeAttempts: 1 + 2 * size, smokeFactoryCalls: size * (size + 2),
    dependencyReads, callsByFeature,
  };
}
