// The only publication class admitted so far: a private, unpublished candidate.
export const PRIVATE_CANDIDATE = "private-candidate";

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

// Fail closed on a malformed row: a differently named root or identity cannot
// hide behind it, it cannot claim Core or Assembly, and its version pattern is
// stateless.
for (const [index, leaf] of LEAF_PACKAGES.entries()) {
  if (!/^[a-z][a-z0-9-]*$/u.test(leaf.id) || ["core", "assembly"].includes(leaf.id)
    || leaf.root !== `packages/${leaf.id}` || leaf.name !== `@get-modular/${leaf.id}`
    || !(leaf.version instanceof RegExp) || leaf.version.global || leaf.version.sticky
    || LEAF_PACKAGES.findIndex(other => other.id === leaf.id) !== index
    || !Object.hasOwn(leaf.commands, leaf.gate)) {
    throw new Error(`LEAF_PACKAGE_TABLE_INVALID: ${leaf.id}`);
  }
}

export const leafManifestPath = leaf => `${leaf.root}/package.json`;

export function leafPackageById(id) {
  const leaf = LEAF_PACKAGES.find(candidate => candidate.id === id);
  if (leaf === undefined) throw new Error(`LEAF_PACKAGE_UNKNOWN: ${id}`);
  return leaf;
}
