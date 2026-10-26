import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPackageArchive } from "./support/package-archive.mjs";
import { assertPromotionBranch } from "../../architecture/tooling/release-candidate/baselines.ts";
import { git, record } from "../../architecture/tooling/release-candidate/io.ts";

function hashes(bytes: Uint8Array): { sha256: string; integrity: string } {
  return { sha256: createHash("sha256").update(bytes).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` };
}
/** Bounded real-candidate experiment; no publication, install or source version edit. */
export async function qualifyMetadataPacks(root: string, output: string): Promise<void> {
  root = realpathSync(root);
  assert(root.includes("TEST-"), "Pack proof requires an owned TEST checkout");
  assertPromotionBranch(root);
  assert.equal(git(root, "status", "--porcelain").trim(), "", "Pack proof requires committed candidate bytes");
  for (const [name, version] of [["core", "0.7.1"], ["assembly", "0.7.1"], ["conformance", "0.5.1"],
    ["resources", "0.2.1"], ["observation", "0.2.0"]]) {
    assert.equal(record(JSON.parse(readFileSync(join(root, `packages/${name}/package.json`), "utf8")))["version"], version);
  }
  mkdirSync(output);
  const run = (...args: string[]): string => execFileSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 180_000 });
  run("architecture/tooling/build-core.mjs"); run("architecture/tooling/build-assembly.mjs");
  for (const name of ["resources", "conformance", "observation"]) {run("architecture/tooling/build-leaf-package.mjs", name);}
  const require = createRequire(join(root, "package.json"));
  const managerPath = require.resolve("pnpm"); const manager = record(JSON.parse(readFileSync(managerPath, "utf8")));
  assert.equal(manager["version"], "11.20.0");
  const cli = join(dirname(managerPath), "bin/pnpm.cjs");
  const results: unknown[] = [];
  for (const [name, version, retainedIntegrity] of [
    ["conformance", "0.5.1", ""],
    ["resources", "0.2.1", "sha512-qRmHsWuPajee+35BM5DhY6o1tCeDrzkei3SPBEIWF4PVkHO/pq+zODprvJ0cr+vCFtY0uJqgfnSor+ldRkwwGA=="],
    ["observation", "0.2.0", "sha512-IGClV9HNx42I6hy5R6CSmJ5707iDJ0CYzbCapbNBYQduMDItZvFs0dg5dSPz6n3FKXK2qgPywJNyo0eeK7UOLg=="],
  ]) {
    assert(name && version && retainedIntegrity !== undefined);
    run(cli, "--pm-on-fail=ignore", "--dir", join(root, "packages", name), "pack", "--pack-destination", output);
    const file = `get-modular-${name}-${version}.tgz`; const bytes = readFileSync(join(output, file));
    const identity = hashes(bytes); const archive = readPackageArchive(bytes, identity); assert(archive);
    const manifest = record(JSON.parse(archive.files.get("package.json").toString("utf8")));
    assert.equal(manifest["version"], version);
    if (name === "conformance") {
      assert.deepEqual(manifest["peerDependencies"], { "@get-modular/assembly": "^0.7.1",
        "@get-modular/core": "^0.7.1", "@get-modular/resources": "^0.2.1" });
    } else {
      const response = await fetch(`https://registry.npmjs.org/@get-modular/${name}/-/${name}-${version}.tgz`);
      assert.equal(response.status, 200); const registryBytes = new Uint8Array(await response.arrayBuffer());
      const registryIdentity = hashes(registryBytes); assert.equal(registryIdentity.integrity, retainedIntegrity);
      const published = readPackageArchive(registryBytes, registryIdentity); assert(published);
      assert.deepEqual(archive.files, published.files, `${name}: actual packed payload differs from authenticated registry archive`);
      writeFileSync(join(output, `${name}-registry.tgz`), registryBytes);
    }
    results.push({ package: manifest["name"], version, file, ...identity, peers: manifest["peerDependencies"] ?? {},
      registryPayloadEqual: name === "conformance" ? null : true });
  }
  writeFileSync(join(output, "metadata-pack-proof.json"), JSON.stringify({ source: git(root, "rev-parse", "HEAD").trim(),
    node: process.versions.node, pnpm: manager["version"], packages: results }, null, 2) + "\n");
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, output] = process.argv.slice(2); assert(root && output, "Usage: metadata-patch-pack.ts TEST_ROOT NEW_OUTPUT");
  await qualifyMetadataPacks(root, resolve(output));
}
