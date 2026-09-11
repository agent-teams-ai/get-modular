// Independent graph-recipe materializer for qualification fixtures. The
// architecture check keeps its own copy for ledger-bound contract validation.
export function materialize(recipe) {
  const names = [];
  if (recipe.cycle === "pair") names.push("a", "b");
  if (recipe.cycle === "self") names.push("a");
  for (let index = 1; index <= recipe.chainLength; index += 1) {
    names.push(`n${String(index).padStart(4, "0")}`);
  }
  const edges = [];
  if (recipe.cycle === "pair") edges.push(["a", "b"], ["b", "a"]);
  if (recipe.cycle === "self") edges.push(["a", "a"]);
  for (let index = 2; index <= recipe.chainLength; index += 1) {
    edges.push([`n${String(index).padStart(4, "0")}`, `n${String(index - 1).padStart(4, "0")}`]);
  }
  const last = `n${String(recipe.chainLength).padStart(4, "0")}`;
  if (recipe.attachment === "cycle-consumes-chain") edges.push(["a", last]);
  if (recipe.attachment === "chain-consumes-cycle") edges.push(["n0001", "a"]);
  const outgoing = new Map(names.map(name => [name, []]));
  for (const edge of edges) outgoing.get(edge[0]).push(edge[1]);
  const compatibility = { family: "exact", familyVersion: 1, token: "example/link" };
  const declarations = names.map(name => ({
    kind: "get-modular.module-declaration", schemaVersion: 1,
    moduleId: `example/${name}`, implementationId: `example/${name}/default`,
    owner: { authority: "example", path: ["depth"] },
    provides: [{ capabilityId: "example/link", compatibility }],
    slots: outgoing.get(name).map((_provider, index) => ({
      slotId: `d${index}`, capabilityId: "example/link", compatibility,
      cardinality: { kind: "required" },
    })),
  }));
  const bindings = [];
  for (const consumer of names) outgoing.get(consumer).forEach((provider, index) => bindings.push({
    consumerImplementationId: `example/${consumer}/default`, slotId: `d${index}`,
    providerImplementationIds: [`example/${provider}/default`],
  }));
  const roots = [];
  if (recipe.cycle !== "none") roots.push("example/a");
  if (recipe.chainLength > 0) roots.push(`example/${last}`);
  const profile = {
    kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "example/depth",
    roots,
    selections: names.map(name => ({
      moduleId: `example/${name}`, implementationId: `example/${name}/default`,
    })),
    bindings,
  };
  return { names, edges, declarations, profile };
}
