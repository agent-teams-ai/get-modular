// The only publication class admitted so far: a private, unpublished candidate.
// Its rules apply to every row until a decision admits another class.
const PRIVATE_CANDIDATE = "private-candidate";

// Optional leaf packages admitted beside Core and Assembly. Each row is bound to
// its accepted decision; the governance, workspace, manifest, build and profile
// checks read this table instead of naming a package. A leaf has no runtime
// dependency, and neither Core, Assembly nor another leaf imports it.
export const LEAF_PACKAGES = Object.freeze([
  Object.freeze({
    id: "lifecycle-kernel",
    name: "@get-modular/lifecycle-kernel",
    root: "packages/lifecycle-kernel",
    publication: PRIVATE_CANDIDATE,
    version: /^0\.1\.0$/u,
    decision: Object.freeze({
      id: "ADR-0029",
      path: "docs/decisions/0029-admit-an-optional-lifecycle-kernel-candidate.md",
      fileDigest: "sha256:9247eb2c2eb70cbbc215426446101314b1085d1d03fee02b6dc0467a737eac00",
      immutableDigest: "sha256:4162e78542ac053ee03e3b330880495ddd9ffd261c0a578fe100035bdf910d64",
    }),
    extension: Object.freeze({
      id: "lifecycle-generation-and-lease",
      authority: "docs/decisions/0029-admit-an-optional-lifecycle-kernel-candidate.md",
    }),
    requiredTests: Object.freeze([
      "packages/lifecycle-kernel/tests/kernel.test.mjs",
      "packages/lifecycle-kernel/tests/packed-root.test.mjs",
    ]),
    commands: Object.freeze({
      "lifecycle:build": "node architecture/tooling/build-leaf-package.mjs lifecycle-kernel",
      "lifecycle:typecheck":
        "node node_modules/typescript/bin/tsc -p packages/lifecycle-kernel/tsconfig.json --noEmit"
        + " && node node_modules/typescript/bin/tsc -p packages/lifecycle-kernel/tsconfig.types.json --noEmit"
        + " && node node_modules/typescript/bin/tsc -p packages/lifecycle-kernel/tsconfig.types.bundler.json --noEmit",
      "lifecycle:test": "node --test packages/lifecycle-kernel/tests/kernel.test.mjs",
      "lifecycle:pack": "node --test packages/lifecycle-kernel/tests/packed-root.test.mjs",
      "lifecycle:check":
        "pnpm lifecycle:build && pnpm lifecycle:typecheck && pnpm lifecycle:test && pnpm lifecycle:pack",
    }),
    gate: "lifecycle:check",
  }),
]);

// A row names its own identity, root, decision and version pattern. It cannot
// claim Core or Assembly, a differently named root, another row's decision or
// an unanchored or stateful version pattern.
function identityProblem(leaf, rows, index) {
  if (!/^[a-z][a-z0-9-]*$/u.test(leaf.id) || ["core", "assembly"].includes(leaf.id)
    || rows.findIndex(other => other.id === leaf.id) !== index) return "id";
  if (leaf.root !== `packages/${leaf.id}` || leaf.name !== `@get-modular/${leaf.id}`) return "root";
  if (leaf.publication !== PRIVATE_CANDIDATE) return "publication";
  const { version } = leaf;
  if (!(version instanceof RegExp) || version.global || version.sticky || version.multiline
    || !version.source.startsWith("^") || !version.source.endsWith("$")) return "version";
  const { decision } = leaf;
  if (typeof decision?.id !== "string" || typeof decision.path !== "string"
    || rows.findIndex(other => other.decision?.id === decision.id
      || other.decision?.path === decision.path) !== index) return "decision";
  if (leaf.extension?.authority !== decision.path) return "extension";
  return undefined;
}

// Every command belongs to the row's namespace, its gate runs exactly the other
// commands in order, and each required test lives in the row and is run by one
// of them. A row therefore cannot reuse a shared command or gate nothing.
function commandProblem(leaf) {
  const match = /^([a-z][a-z0-9-]*:)check$/u.exec(leaf.gate);
  const names = Object.keys(leaf.commands ?? {});
  const steps = names.filter(name => name !== leaf.gate);
  if (!match || steps.length === 0
    || !names.every(name => name.startsWith(match[1]) && typeof leaf.commands[name] === "string")
    || leaf.commands[leaf.gate] !== steps.map(name => `pnpm ${name}`).join(" && ")) return "commands";
  if (!Array.isArray(leaf.requiredTests) || leaf.requiredTests.length === 0
    || !leaf.requiredTests.every(path => typeof path === "string"
      && path.startsWith(`${leaf.root}/tests/`) && !path.split("/").includes("..")
      && steps.some(name => leaf.commands[name].split(" ").includes(path)))) return "requiredTests";
  return undefined;
}

export function assertLeafPackageTable(rows) {
  for (const [index, leaf] of rows.entries()) {
    const problem = identityProblem(leaf, rows, index) ?? commandProblem(leaf);
    if (problem !== undefined) throw new Error(`LEAF_PACKAGE_TABLE_INVALID: ${leaf.id}: ${problem}`);
  }
}

assertLeafPackageTable(LEAF_PACKAGES);

export const leafManifestPath = leaf => `${leaf.root}/package.json`;

export function leafPackageById(id) {
  const leaf = LEAF_PACKAGES.find(candidate => candidate.id === id);
  if (leaf === undefined) throw new Error(`LEAF_PACKAGE_UNKNOWN: ${id}`);
  return leaf;
}
