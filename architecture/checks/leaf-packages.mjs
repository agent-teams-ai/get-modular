// Publication classes. A private candidate is never published. A public leaf is
// published from 0.x under its decision with the npm shape of Core and Assembly.
export const PRIVATE_CANDIDATE = "private-candidate";
export const PUBLIC = "public";
export const PUBLIC_PUBLISH_CONFIG = Object.freeze({ access: "public", registry: "https://registry.npmjs.org/" });
export const PUBLIC_FILES = Object.freeze(["dist", "LICENSE", "README.md", "CHANGELOG.md"]);
export const publicRepository = leaf => ({
  type: "git", url: "git+https://github.com/agent-teams-ai/get-modular.git", directory: leaf.root,
});

// Optional leaf packages admitted beside Core and Assembly. Each row is bound to
// its accepted decision; the governance, workspace, manifest, build and profile
// checks read this table instead of naming a package. A leaf has no runtime
// dependency except the Get Modular peers its row declares. Core and Assembly
// import no leaf; a leaf imports another leaf only as a declared peer.
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
  Object.freeze({
    id: "resources",
    name: "@get-modular/resources",
    root: "packages/resources",
    publication: PUBLIC,
    // ADR-0030: public 0.x; 0.0.0 only until the first Changesets release; 1.0.0 needs a decision.
    version: /^0\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u,
    decision: Object.freeze({
      id: "ADR-0030",
      path: "docs/decisions/0030-admit-the-module-resource-scope-package.md",
      fileDigest: "sha256:8b2dd245de55ebea734c6a74460f37a210dfe0ee0af7ce7069f9cb41592f729e",
      immutableDigest: "sha256:9ab491290ea3614714f6f3d17bb44ba31c578e37e68e8f68e87575567291c5c9",
    }),
    extension: Object.freeze({
      id: "module-resource-scopes",
      authority: "docs/decisions/0030-admit-the-module-resource-scope-package.md",
    }),
    requiredTests: Object.freeze([
      "packages/resources/tests/scope.test.mjs",
      "packages/resources/tests/packed-root.test.mjs",
    ]),
    commands: Object.freeze({
      "resources:build": "node architecture/tooling/build-leaf-package.mjs resources",
      "resources:typecheck":
        "node node_modules/typescript/bin/tsc -p packages/resources/tsconfig.json --noEmit"
        + " && node node_modules/typescript/bin/tsc -p packages/resources/tsconfig.types.json --noEmit"
        + " && node node_modules/typescript/bin/tsc -p packages/resources/tsconfig.types.bundler.json --noEmit"
        + " && node node_modules/typescript-minimum/bin/tsc -p packages/resources/tsconfig.types.json --noEmit"
        + " && node node_modules/typescript-minimum/bin/tsc -p packages/resources/tsconfig.types.bundler.json --noEmit",
      "resources:test": "node --test packages/resources/tests/scope.test.mjs tests/resources/assembly-scope.test.mjs",
      "resources:pack": "node --test packages/resources/tests/packed-root.test.mjs",
      "resources:check":
        "pnpm resources:build && pnpm resources:typecheck && pnpm resources:test && pnpm resources:pack",
    }),
    gate: "resources:check",
  }),
  Object.freeze({
    id: "conformance",
    name: "@get-modular/conformance",
    root: "packages/conformance",
    publication: PUBLIC,
    // ADR-0033: public 0.x; 0.0.0 only until the first Changesets release; 1.0.0 needs a decision.
    version: /^0\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u,
    peers: Object.freeze(["@get-modular/assembly", "@get-modular/core", "@get-modular/resources"]),
    decision: Object.freeze({
      id: "ADR-0033",
      path: "docs/decisions/0033-admit-the-module-conformance-kit.md",
      fileDigest: "sha256:4f2c8cdcca014731f4eed8ce2ee026f7d0863e289468923d7164e866125cf7a0",
      immutableDigest: "sha256:41e6d18087f5fe147b5a843b37fa5be925fa2f87cb1dc83c949a80520e7dbeb5",
    }),
    extension: Object.freeze({
      id: "module-conformance-kit",
      authority: "docs/decisions/0033-admit-the-module-conformance-kit.md",
    }),
    requiredTests: Object.freeze([
      "packages/conformance/tests/conformance.test.mjs",
      "packages/conformance/tests/packed-root.test.mjs",
    ]),
    commands: Object.freeze({
      "conformance:build": "node architecture/tooling/build-leaf-package.mjs conformance",
      "conformance:typecheck":
        "node node_modules/typescript/bin/tsc -p packages/conformance/tsconfig.json --noEmit"
        + " && node node_modules/typescript/bin/tsc -p packages/conformance/tsconfig.types.json --noEmit"
        + " && node node_modules/typescript/bin/tsc -p packages/conformance/tsconfig.types.bundler.json --noEmit"
        + " && node node_modules/typescript-minimum/bin/tsc -p packages/conformance/tsconfig.types.json --noEmit"
        + " && node node_modules/typescript-minimum/bin/tsc -p packages/conformance/tsconfig.types.bundler.json --noEmit",
      "conformance:test": "node --test packages/conformance/tests/conformance.test.mjs",
      "conformance:pack": "node --test packages/conformance/tests/packed-root.test.mjs",
      "conformance:check":
        "pnpm conformance:build && pnpm conformance:typecheck && pnpm conformance:test && pnpm conformance:pack",
    }),
    gate: "conformance:check",
  }),
]);

// Get Modular packages that any public row may declare as a peer.
const BASE_PEERS = Object.freeze(["@get-modular/core", "@get-modular/assembly"]);

// A row without `peers` has none. Only a public row declares them, and each one
// is Core, Assembly or an earlier public row, so row order is also gate order.
export const leafPeers = leaf => leaf.peers ?? [];

// Peers are declared with the workspace caret range, which `pnpm pack` turns
// into the caret range of the one 0.x minor in the workspace.
export const PEER_SPECIFIER = "workspace:^";

export const expectedPeerDependencies = leaf =>
  leafPeers(leaf).length === 0
    ? undefined
    : Object.fromEntries(leafPeers(leaf).toSorted().map(name => [name, PEER_SPECIFIER]));

// The lock importer of a row: empty without peers, otherwise one workspace link
// per declared peer and nothing else.
export const expectedLeafImporter = leaf =>
  leafPeers(leaf).length === 0
    ? {}
    : {
      dependencies: Object.fromEntries(leafPeers(leaf).toSorted().map(name => [name, {
        specifier: PEER_SPECIFIER, version: `link:../${name.slice("@get-modular/".length)}`,
      }])),
    };

function peerProblem(leaf, rows, index) {
  if (leaf.peers === undefined) return undefined;
  if (!Array.isArray(leaf.peers) || leaf.peers.length === 0 || leaf.publication !== PUBLIC
    || new Set(leaf.peers).size !== leaf.peers.length) return "peers";
  const earlier = rows.slice(0, index).filter(row => row.publication === PUBLIC).map(row => row.name);
  return leaf.peers.every(name => typeof name === "string"
    && [...BASE_PEERS, ...earlier].includes(name)) ? undefined : "peers";
}

// A row names its own identity, root, decision and version pattern. It cannot
// claim Core or Assembly, a differently named root, another row's decision, an
// unanchored or stateful version pattern or a peer it may not depend on.
function identityProblem(leaf, rows, index) {
  if (!/^[a-z][a-z0-9-]*$/u.test(leaf.id) || ["core", "assembly"].includes(leaf.id)
    || rows.findIndex(other => other.id === leaf.id) !== index) return "id";
  if (leaf.root !== `packages/${leaf.id}` || leaf.name !== `@get-modular/${leaf.id}`) return "root";
  if (![PRIVATE_CANDIDATE, PUBLIC].includes(leaf.publication)) return "publication";
  const { version } = leaf;
  if (!(version instanceof RegExp) || version.global || version.sticky || version.multiline
    || !version.source.startsWith("^") || !version.source.endsWith("$")) return "version";
  const { decision } = leaf;
  if (typeof decision?.id !== "string" || typeof decision.path !== "string"
    || rows.findIndex(other => other.decision?.id === decision.id
      || other.decision?.path === decision.path) !== index) return "decision";
  if (leaf.extension?.authority !== decision.path) return "extension";
  return peerProblem(leaf, rows, index);
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
