import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertLeafPackageTable, expectedLeafImporter, expectedPeerDependencies, LEAF_PACKAGES,
  leafFiles, leafImportPeers, leafPackageById, PRIVATE_CANDIDATE, PUBLIC_FILES,
  type LeafPackage,
} from "../architecture/checks/leaf-packages.ts";
import { leafManifestViolations } from "../architecture/checks/production-artifacts.mjs";

const effect = leafPackageById("effect");

function replaced(change: Partial<LeafPackage>): readonly LeafPackage[] {
  return LEAF_PACKAGES.map(leaf => leaf.id === effect.id ? { ...leaf, ...change } : leaf);
}

async function manifest(path: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return Object.fromEntries(Object.entries(value));
}

test("native Effect admission binds only its explicit catalog peer and paired GM roots", () => {
  assert.deepEqual(leafImportPeers(effect), ["@get-modular/assembly", "@get-modular/core", "effect"]);
  assert.deepEqual(expectedPeerDependencies(effect), {
    "@get-modular/assembly": "workspace:^", "@get-modular/core": "workspace:^", effect: "catalog:",
  });
  assert.deepEqual(expectedLeafImporter(effect), { dependencies: {
    "@get-modular/assembly": { specifier: "workspace:^", version: "link:../assembly" },
    "@get-modular/core": { specifier: "workspace:^", version: "link:../core" },
    effect: { specifier: "catalog:", version: "4.1.4" },
  } });
  assert.doesNotThrow(() => assertLeafPackageTable(LEAF_PACKAGES));
});

test("registry peer admission rejects ranges, tags, prereleases and workspace identities", () => {
  for (const externalPeers of [
    {}, { effect: "^4.1.4" }, { effect: "latest" }, { effect: "workspace:*" },
    { effect: "4.1.4-beta.1" }, { effect: "4.01.4" }, { "effect/Layer": "4.1.4" },
    { "@get-modular/core": "0.7.1" },
  ]) {
    assert.throws(() => assertLeafPackageTable(replaced({ externalPeers })),
      /LEAF_PACKAGE_TABLE_INVALID: effect: externalPeers$/u);
  }
  const privateLeaf = leafPackageById("lifecycle-kernel");
  assert.equal(privateLeaf.publication, PRIVATE_CANDIDATE);
  assert.throws(() => assertLeafPackageTable(LEAF_PACKAGES.map(leaf => leaf.id === privateLeaf.id
    ? { ...leaf, externalPeers: { effect: "4.1.4" } } : leaf)),
  /LEAF_PACKAGE_TABLE_INVALID: lifecycle-kernel: externalPeers$/u);
});

test("shipping practices admits one exact documentation path without broadening other leaves", () => {
  assert.deepEqual(leafFiles(effect), [...PUBLIC_FILES, "docs/practices.md"]);
  for (const documentation of [[], Array<string>(1), ["../secret.md"], ["docs/../secret.md"], ["docs/*.md"],
    ["docs//practices.md"], ["docs/practices.md", "docs/practices.md"]]) {
    assert.throws(() => assertLeafPackageTable(replaced({ documentation })),
      /LEAF_PACKAGE_TABLE_INVALID: effect: documentation$/u);
  }
  for (const leaf of LEAF_PACKAGES.filter(row => row.id !== effect.id)) {
    assert.deepEqual(leafFiles(leaf), PUBLIC_FILES);
    assert.ok(!leafImportPeers(leaf).includes("effect"), leaf.id);
  }
});

test("the native package cannot make its registry peer optional or replace its curated archive", async () => {
  const original = await manifest("../packages/effect/package.json");
  assert.deepEqual(leafManifestViolations(original), []);
  const cases: readonly [Record<string, unknown>, RegExp][] = [
    [{ dependencies: { effect: "catalog:" } }, /dependencies must be absent or empty/u],
    [{ peerDependencies: { ...expectedPeerDependencies(effect), effect: "^4.1.4" } }, /exactly its row peers/u],
    [{ peerDependencies: { "@get-modular/core": "workspace:^", effect: "catalog:" } }, /exactly its row peers/u],
    [{ peerDependenciesMeta: { effect: { optional: true } } }, /must not declare optional peers/u],
    [{ files: [...PUBLIC_FILES] }, /requires the exact files list/u],
    [{ files: [...PUBLIC_FILES, "docs/**"] }, /requires the exact files list/u],
  ];
  for (const [change, message] of cases) {
    assert.ok(leafManifestViolations({ ...original, ...change }).some((violation: string) => message.test(violation)),
      JSON.stringify(change));
  }
  const resources = await manifest("../packages/resources/package.json");
  assert.ok(leafManifestViolations({ ...resources, peerDependencies: { effect: "catalog:" } })
    .some((violation: string) => /exactly its row peers/u.test(violation)));
  assert.ok(leafManifestViolations({ ...resources, files: [...PUBLIC_FILES, "docs/practices.md"] })
    .some((violation: string) => /requires the exact files list/u.test(violation)));
});
