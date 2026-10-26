import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readPackageArchive } from "../../../tests/qualification/support/package-archive.mjs";
import { assertMetadataAuthority, metadataAuthority, metadataDecision, metadataDecisionDigest } from "../release-candidate/metadata-authority.ts";
import { git } from "../release-candidate/io.ts";
import { archiveHashes, assertArchive, record, text, type ReleasePackage } from "./policy.ts";
import { registryArchive } from "./registry.ts";

export interface SourceCoordinate { readonly name: string; readonly version: string }
export interface OriginalArchive extends ReleasePackage { readonly url: string }
export const metadataCohort: readonly SourceCoordinate[] = Object.freeze([
  ["assembly", "0.7.1"], ["conformance", "0.5.1"], ["core", "0.7.1"], ["observation", "0.2.0"], ["resources", "0.2.1"],
].map(([id, version]) => Object.freeze({ name: `@get-modular/${id}`, version: version! })));
export const currentOriginalArchives: readonly OriginalArchive[] = Object.freeze([
  Object.freeze({ name: "@get-modular/resources", version: "0.2.1", file: "get-modular-resources-0.2.1.tgz",
    url: "https://registry.npmjs.org/@get-modular/resources/-/resources-0.2.1.tgz",
    sha256: "664178aa87b1b218930045f431a7685df852e356d13070f3a7198fcc4ea6dd8f",
    integrity: "sha512-qRmHsWuPajee+35BM5DhY6o1tCeDrzkei3SPBEIWF4PVkHO/pq+zODprvJ0cr+vCFtY0uJqgfnSor+ldRkwwGA==" }),
  Object.freeze({ name: "@get-modular/observation", version: "0.2.0", file: "get-modular-observation-0.2.0.tgz",
    url: "https://registry.npmjs.org/@get-modular/observation/-/observation-0.2.0.tgz",
    sha256: "7e4eac75dc5e94aa92aaccbc28f8ce9a21bff8df2112c2ccad7d1c3523d3b008",
    integrity: "sha512-IGClV9HNx42I6hy5R6CSmJ5707iDJ0CYzbCapbNBYQduMDItZvFs0dg5dSPz6n3FKXK2qgPywJNyo0eeK7UOLg==" }),
]);
function ordered(packages: readonly SourceCoordinate[]): readonly (readonly [string, string])[] {
  return packages.map(item => [item.name, item.version] as const).toSorted(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
}
/** Fixed published coordinates trigger this closed successor, never a generic fallback. */
export function currentArchivesFor(packages: readonly SourceCoordinate[]): readonly OriginalArchive[] {
  if (!packages.some(item => currentOriginalArchives.some(pin => item.name === pin.name && item.version === pin.version))) {return [];}
  assert.deepEqual(ordered(packages), ordered(metadataCohort), "release.current-archive-cohort");
  return currentOriginalArchives;
}
export function assertCurrentArchiveSource(root: string, source: string, packages: readonly SourceCoordinate[]): void {
  assert.deepEqual(currentArchivesFor(packages), currentOriginalArchives, "release.current-archive-cohort");
  assert.match(source, /^[a-f0-9]{40}$/u, "release.current-archive-source");
  assert.equal(git(root, "rev-parse", "HEAD").trim(), source, "release.current-archive-source");
  assert.equal(git(root, "status", "--porcelain", "--untracked-files=no").trim(), "", "release.current-archive-source-drift");
  for (const item of metadataCohort) {
    const manifest = record(JSON.parse(readFileSync(join(root, "packages", item.name.slice("@get-modular/".length), "package.json"), "utf8")));
    assert.deepEqual({ name: manifest["name"], version: manifest["version"] }, item, "release.current-archive-source-cohort");
  }
  assertMetadataAuthority(readFileSync(join(root, metadataDecision), "utf8"),
    readFileSync(join(root, "architecture/decisions/accepted-decisions.json"), "utf8"));
}
export interface ArchiveMember { readonly path: string; readonly size: number; readonly mode: number; readonly sha256: string }
/** Reuses the existing inert bounded reader, including physical header/type/path rejection. */
export function assertArchivePayload(name: string, version: string, freshBytes: Uint8Array, originalBytes: Uint8Array): readonly ArchiveMember[] {
  const fresh = readPackageArchive(freshBytes, archiveHashes(freshBytes));
  const original = readPackageArchive(originalBytes, archiveHashes(originalBytes));
  assert(fresh && original, "release.current-archive-reader");
  for (const archive of [fresh, original]) {
    const bytes: unknown = archive.files.get("package.json"); assert(Buffer.isBuffer(bytes), "release.current-archive-manifest");
    const manifest = record(JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)));
    assert.deepEqual([manifest["name"], manifest["version"]], [name, version], "release.current-archive-manifest");
  }
  assert.deepEqual(fresh.inventory, original.inventory, "release.current-archive-payload");
  assert.deepEqual(fresh.files, original.files, "release.current-archive-payload");
  return original.inventory.map((value: unknown) => {
    const row = record(value); const size = row["size"]; const mode = row["mode"];
    assert(typeof size === "number" && Number.isSafeInteger(size) && size >= 0, "release.current-archive-size");
    assert(typeof mode === "number" && Number.isSafeInteger(mode) && mode >= 0, "release.current-archive-mode");
    return { path: text(row["path"]), size, mode, sha256: text(row["sha256"]) };
  });
}
/** Original authenticated bytes are always selected, even if fresh containers happen to match. */
export function qualifyCurrentArchive(root: string, source: string, packages: readonly SourceCoordinate[], name: string,
  freshBytes: Uint8Array, originalBytes: Uint8Array) {
  assertCurrentArchiveSource(root, source, packages);
  const pin = currentOriginalArchives.find(item => item.name === name); assert(pin, "release.current-archive-coordinate");
  assertArchive(pin, originalBytes);
  const inventory = assertArchivePayload(pin.name, pin.version, freshBytes, originalBytes);
  return { bytes: Buffer.from(originalBytes), proof: { schemaVersion: 1, source, cohort: metadataCohort,
    authority: { id: metadataAuthority.entry.id, path: metadataDecision, bytesDigest: metadataDecisionDigest, entry: metadataAuthority.entry },
    package: pin.name, version: pin.version, fresh: archiveHashes(freshBytes), original: pin, inventory,
    containerBytesEqual: Buffer.from(freshBytes).equals(Buffer.from(originalBytes)),
    selected: "original-registry-bytes", reason: "ADR-0042 unchanged package payload qualified by current build and complete packed inventory" } };
}

/** Called only after normal current build/pack; evidence never enters the publisher artifact. */
export async function prepareCurrentArchive(root: string, source: string, packages: readonly SourceCoordinate[], name: string,
  packedFile: string, evidenceDirectory: string) {
  assertCurrentArchiveSource(root, source, packages);
  const pin = currentOriginalArchives.find(item => item.name === name); assert(pin, "release.current-archive-coordinate");
  const fresh = await readFile(packedFile);
  await writeFile(join(evidenceDirectory, `fresh-${pin.file}`), fresh, { flag: "wx" });
  try {
    const original = await registryArchive(pin.url);
    await writeFile(join(evidenceDirectory, `registry-${pin.file}`), original, { flag: "wx" });
    const selected = qualifyCurrentArchive(root, source, packages, name, fresh, original);
    await writeFile(join(evidenceDirectory, `${pin.name.slice("@get-modular/".length)}-selection.json`),
      JSON.stringify(selected.proof, null, 2) + "\n", { flag: "wx" });
    await writeFile(packedFile, selected.bytes);
    assertArchive(pin, await readFile(packedFile));
    return selected.proof;
  } catch (error) {
    await writeFile(join(evidenceDirectory, `${pin.name.slice("@get-modular/".length)}-failure.json`),
      JSON.stringify({ source, cohort: packages, package: pin.name, fresh: archiveHashes(fresh), original: pin, error: String(error) }, null, 2) + "\n",
      { flag: "wx" });
    throw error;
  }
}
