import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { LEAF_PACKAGES, PUBLIC } from "../../checks/leaf-packages.ts";
import { json, packageIds, record, text } from "./policy.ts";

interface SourcePackage { readonly id: string; readonly name: string; readonly version: string; readonly tree: string }
export interface SourcePackages {
  readonly packages: readonly SourcePackage[];
  readonly pendingAdmission: boolean;
}

/** Inventory follows exact-source CI, which authenticates the complete leaf admission. */
export async function sourcePackages(root: string): Promise<SourcePackages> {
  const packages: SourcePackage[] = [];
  for (const id of packageIds) {
    const manifest = record(json(await readFile(join(root, "packages", id, "package.json"), "utf8")));
    assert.notEqual(manifest.private, true, "release.private-package");
    if (id === "effect") {
      const leaf = LEAF_PACKAGES.find(row => row.id === id);
      assert(leaf?.root === "packages/effect" && leaf.name === "@get-modular/effect" && leaf.publication === PUBLIC
        && manifest.private === undefined, "release.unclassified-public-package");
    }
    assert.equal(manifest.name, `@get-modular/${id}`, "release.package-name");
    const tree = execFileSync("git", ["rev-parse", `HEAD:packages/${id}`], { cwd: root, encoding: "utf8",
      timeout: 600000, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: "" } }).trim();
    packages.push({ id, name: text(manifest.name), version: text(manifest.version), tree });
  }
  const effect = packages.find(item => item.id === "effect");
  const core = packages.find(item => item.id === "core");
  const assembly = packages.find(item => item.id === "assembly");
  assert(effect && core && assembly, "release.public-package-set");
  const pendingAdmission = effect.version === "0.0.0";
  if (!pendingAdmission) {
    assert.match(effect.version, /^(?:0\.(?:[1-9]\d*)\.\d+|[1-9]\d*\.\d+\.\d+)$/u, "release.effect-version");
    assert.equal(core.version, assembly.version, "release.effect-paired-version");
    assert.match(assembly.version, /^(?:0\.(?:[89]|[1-9]\d+)\.\d+|[1-9]\d*\.\d+\.\d+)$/u, "release.effect-assembly-version");
  }
  const allPackageDirs = await readdir(join(root, "packages"));
  for (const id of allPackageDirs.filter(candidateId => !packageIds.some(publicId => publicId === candidateId))) {
    const candidate = record(json(await readFile(join(root, "packages", id, "package.json"), "utf8")));
    assert.equal(candidate.private, true, "release.unclassified-public-package");
  }
  // Never let a pending candidate hide an invalid package elsewhere in the inventory.
  return { packages, pendingAdmission };
}
