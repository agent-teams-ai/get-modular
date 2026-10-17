import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, cp, rm } from "node:fs/promises";
import { existsSync, createReadStream, readFileSync, realpathSync, lstatSync, readdirSync, writeFileSync, readlinkSync, statSync } from "node:fs";
import { basename, dirname, join, resolve, relative, posix, isAbsolute, delimiter } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { PreparedToolEntry, PackagePayloadProjection, SupportOrigin, PackagePayloadRow, InputIdentity, RestoredDependencyGraph, ToolOrigin, InstallerWitness } from "./lifecycle-qualification-contracts.mts";

// Root-owned qualification validation shared by preparation and the package-local runner.
export function preparationInputIdentity(): InputIdentity { return inputIdentity(fileURLToPath(import.meta.url)); }

export function inputIdentity(path: string): InputIdentity {
  return { path: resolve(path), realpath: realpathSync(path), sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    ...(lstatSync(path).isSymbolicLink() ? { linkTarget: readlinkSync(path) } : {}) };
}
export function verifyIdentities(rows: readonly InputIdentity[]): void {
  assert.ok(rows.length > 0, "empty input seal");
  assert.equal(new Set(rows.map(row => row.path)).size, rows.length, "duplicate input seal");
  for (const row of rows) assert.deepEqual(inputIdentity(row.path), row, `immutable input drift: ${row.path}`);
}
export function finitePath(root: string, path: string): string {
  assert.ok(path.length > 0 && path.length <= 1024 && !/[\\:\x00-\x1f<>"|?*]/u.test(path), "nonportable manifest path");
  assert.ok(!path.startsWith("/") && path.split("/").every(part => part !== "" && part !== "." && part !== ".."), "escaping manifest path");
  assert.ok(path.split("/").every(part => !/[. ]$/u.test(part) && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(part)), "nonportable manifest path");
  const boundary = realpathSync(root);
  const target = realpathSync(join(root, ...path.split("/")));
  const displacement = relative(boundary, target);
  assert.ok(displacement !== "" && !isAbsolute(displacement) && displacement !== ".." && !displacement.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`), "resolver escape");
  return join(root, ...path.split("/"));
}
export function archiveEntryPath(path: string, type: string): string | undefined {
  assert.ok(type === "Directory" || type === "File", "unsupported archive kind");
  const canonical = type === "Directory" && path.endsWith("/") ? path.slice(0, -1) : path;
  assert.ok(canonical.length <= 1024 && /^[a-zA-Z0-9._/-]+$/u.test(canonical)
    && canonical.split("/").every(part => part && part !== "." && part !== ".."), "noncanonical archive path");
  assert.ok(canonical === "package" ? type === "Directory" : canonical.startsWith("package/"), "archive root escape");
  return type === "Directory" ? undefined : canonical.slice(8);
}
export function frozenInventory(root: string, allowLinks = false): InputIdentity[] {
  const rows: InputIdentity[] = [];
  function visit(prefix: string): void {
    for (const name of readdirSync(join(root, prefix)).sort()) {
      const path = prefix ? `${prefix}/${name}` : name;
      const target = finitePath(root, path);
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) {
        assert.ok(allowLinks && statSync(target).isFile(), "sealed inventory symlink");
        rows.push(inputIdentity(target)); continue;
      }
      if (stat.isDirectory()) visit(path);
      else { assert.ok(stat.isFile(), "unsupported inventory kind"); rows.push(inputIdentity(target)); }
    }
  }
  visit("");
  assert.ok(rows.length > 0 && rows.length <= 10000, "finite inventory limit");
  return rows;
}
export function verifyInventory(root: string, expected: readonly InputIdentity[], allowLinks = false): void {
  assert.deepEqual(frozenInventory(root, allowLinks), expected, "immutable inventory drift");
}
export const nodeSignerPolicy = { commit: "ae5a0f40b5787a369b6cde39c36fb2760a4cd309", sha256: "86dfc824b89a2ae1d900bd4fa942b2c4d537747df4e3c47ed6eb3ef6995c80c8",
  signers: ["5BE8A3F6C8A5C01D106C0AD820B1A390B168D356", "DD792F5973C6DE52C432CBDAC77ABFA00DDBF2B7", "CC68F5A3106FF448322E48ED27F5E38D5B0A215F",
    "890C08DB8579162FEE0DF9DB8BEAB4DFCF555EF4", "C82FA3AE1CBEDC6BE46B9360C43CEC45C17AB93C", "108F52B48DB57BB0CC439B2997B01419BD92F80A",
    "655F3B5C1FB3FA8D1A0CA6BDE4A7D232B936D2FD", "A363A499291CBBC940DD62E41F10027AF002F8B0"] };
export function parseQualificationEvidenceJSON(text: string): unknown {
  const value: unknown = JSON.parse(text);
  const scopes: (Set<string> | null)[] = [];
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === "{") scopes.push(new Set());
    else if (character === "[") scopes.push(null);
    else if (character === "}" || character === "]") scopes.pop();
    else if (character === '"') {
      const start = index++;
      for (; index < text.length; index++) {
        if (text[index] === "\\") index++;
        else if (text[index] === '"') break;
      }
      let next = index + 1;
      while (/\s/u.test(text[next] ?? "")) next++;
      if (text[next] === ":") {
        const keys = scopes.at(-1); assert.ok(keys, "evidence object key scope");
        const key = JSON.parse(text.slice(start, index + 1)) as string;
        assert.ok(!keys.has(key), "duplicate qualification evidence field"); keys.add(key);
      }
    }
  }
  return value;
}
export function closedFields(value: unknown, required: readonly string[], optional: readonly string[] = []): void {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), "manifest record required");
  const keys = Object.keys(value);
  assert.ok(required.every(key => keys.includes(key)) && keys.every(key => required.includes(key) || optional.includes(key)), "missing or unknown manifest field");
}
export function supportVersions(platform: string, arch: string): Record<string, string> {
  return { tar: "7.5.22", "@isaacs/fs-minipass": "4.0.1", chownr: "3.0.0", minipass: "7.1.3", minizlib: "3.1.0", yallist: "5.0.0",
    "@types/node": "24.19.1", "undici-types": "7.24.6", "@agent-teams/engineering-foundation": "1.7.2", [`@typescript/typescript-${platform}-${arch}`]: "7.0.2" };
}
// Registry metadata URL for an admitted package id. Admitted ids are lowercase
// [a-z0-9._-] with an optional "@scope/" prefix; only every "/" is encoded, in the
// historical lowercase spelling, so ordinary and scoped public URLs stay byte-identical.
export function registryMetadataUrl(name: string, version: string): string {
  return `https://registry.npmjs.org/${name.replaceAll("/", "%2f")}/${version}`;
}
// Qualification-only discovery: root resolvers select anchors; declaring packages
// select their dependency edges. No acquisition or operator trust policy lives here.
export function restoredDependencyGraph(workspace: string, platform: string, arch: string): RestoredDependencyGraph {
  const boundary = realpathSync(join(workspace, "node_modules"));
  const support = supportVersions(platform, arch);
  const versions = new Map(Object.entries({ ...support, typescript: "7.0.2", "typescript-minimum": "5.8.3" }));
  const roots: Record<string, string> = {};
  const inventories = new Map<string, InputIdentity[]>();
  const payloads = new Map<string, { path: string; sha256: string; linkTarget?: string }[]>();
  const visited = new Set<string>();
  const slash = (path: string): string => path.split(process.platform === "win32" ? "\\" : "/").join("/");
  const order = (a: { path: string }, b: { path: string }): number => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  function discover(name: string, from: string): string {
    const version = versions.get(name);
    assert.ok(version, `unsupported restored dependency: ${name}`);
    const metadata = realpathSync(createRequire(join(from, "package.json")).resolve(`${name}/package.json`));
    const root = dirname(metadata), displacement = relative(boundary, root);
    assert.ok(displacement && !isAbsolute(displacement) && displacement !== ".."
      && !displacement.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`), "restored resolver escape");
    const body = JSON.parse(readFileSync(metadata, "utf8")) as { name?: unknown; version?: unknown };
    assert.equal(body.name, name === "typescript-minimum" ? "typescript" : name, "restored package name");
    assert.equal(body.version, version, "restored package version");
    if (!inventories.has(root)) {
      assert.ok(inventories.size < 64, "finite restored resolver closure");
      const rows = frozenInventory(root, true);
      inventories.set(root, rows);
      payloads.set(root, rows.map(row => ({ path: slash(relative(root, row.path)), sha256: row.sha256,
        ...(row.linkTarget === undefined ? {} : { linkTarget: row.linkTarget }) })));
    }
    if (Object.hasOwn(roots, name)) assert.deepEqual(payloads.get(root), payloads.get(roots[name]!), "multiple restored payload mismatch");
    else roots[name] = root;
    return root;
  }
  for (const name of ["typescript", "typescript-minimum", "tar", "@types/node", "@agent-teams/engineering-foundation"]) discover(name, workspace);
  discover(`@typescript/typescript-${platform}-${arch}`, roots.typescript!);
  function visit(root: string): void {
    if (visited.has(root)) return;
    visited.add(root);
    const body = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies?: unknown };
    const dependencies = body.dependencies ?? {};
    assert.ok(typeof dependencies === "object" && !Array.isArray(dependencies), "restored dependency record");
    for (const name of Object.keys(dependencies).sort()) {
      assert.ok(Object.hasOwn(support, name), `unsupported restored dependency: ${name}`);
      visit(discover(name, root));
    }
  }
  visit(roots.tar!); visit(roots["@types/node"]!);
  assert.deepEqual(Object.keys(roots).sort(), [...versions.keys()].sort(), "missing restored package");
  const entries = [...new Map([...inventories.values()].flat().map(row => [row.path, row])).values()].sort(order);
  const restored = entries.map(row => ({ ...row, path: slash(relative(workspace, row.path)), realpath: slash(relative(workspace, row.realpath)) }));
  return { roots, inventories, entries, restored, sha256: createHash("sha256").update(JSON.stringify(restored)).digest("hex") };
}
const payloadHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bodyHash = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
export const expectedExports = { ".": { import: { types: "./dist/index.d.ts", default: "./dist/index.js" }, default: "./dist/index.js" } };
export function manifestOracle(manifest: Record<string, unknown>): void {
  assert.equal(manifest.name, "@get-modular/lifecycle-kernel");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.deepEqual(manifest.exports, expectedExports);
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"]) {
    assert.deepEqual(manifest[field] ?? {}, {}, `runtime closure must have zero ${field}`);
  }
  assert.equal(manifest.publishConfig, undefined);
}
// pnpm 11.20.0 createExportableManifest (default obfuscation) omits
// scripts/packageManager/pnpm, then appends scripts without publishing hooks.
// packPkg serializes that object with two spaces and no final LF. This bounded
// candidate has no dependency protocols, publishConfig, bin, peer metadata or
// string repository requiring further transforms. Refuse such inputs rather
// than approximate pnpm's general publication semantics. Nested key order stays
// exactly as authored, including ordered export conditions.
export function freshPublishedManifest(source: Uint8Array, renderer: string): Buffer {
  assert.equal(inputIdentity(renderer).sha256, acceptedInstallerProvenance.rendererSha256, "pinned pack renderer binding");
  const manifest = parseQualificationEvidenceJSON(Buffer.from(source).toString("utf8")) as Record<string, unknown>;
  closedFields(manifest, ["name", "version", "private", "description", "license", "type", "sideEffects", "engines", "exports", "files", "scripts", "repository"]);
  manifestOracle(manifest);
  closedFields(manifest.repository, ["type", "url", "directory"]);
  closedFields(manifest.scripts, ["build", "typecheck", "test", "check"]);
  assert.ok(Object.values(manifest.scripts as Record<string, unknown>).every(value => typeof value === "string"), "unsupported pack scripts");
  const { scripts, ...published } = manifest;
  return Buffer.from(JSON.stringify({ ...published, scripts }, null, 2));
}
export function verifyFreshArchivePayload(leaf: string, payload: readonly { path: string; sha256: string }[], renderer: string): void {
  const published = freshPublishedManifest(readFileSync(join(leaf, "package.json")), renderer);
  const files = ["CHANGELOG.md", "LICENSE", "README.md", "package.json", ...frozenInventory(join(leaf, "dist")).map(row =>
    `dist/${relative(join(leaf, "dist"), row.path).split(process.platform === "win32" ? "\\" : "/").join("/")}`)].sort();
  assert.deepEqual(payload, files.map(path => ({ path, sha256: path === "package.json" ? bodyHash(published) : inputIdentity(join(leaf, path)).sha256 })),
    "fresh production/archive mismatch");
}
// Original cwd is independently bound by Root's retained operator/PRECALL
// reconciliation. Neither the current copied workspace nor shim text supplies it.
export const acceptedInstallerProvenance = {
  cwd: "/srv/workers/TEST-lifecycle-authenticated-tool-root-20261010-a1/workspace",
  sourceHead: "0783795228343cc49171caa5caa77bae5f88636c", sourceTree: "980e1d854609d235bdaa36e179a2af570d32ba26",
  operatorSha256: "a45c7cc1cdcd4771f1019721d6ce70fe4e0278044c94a164dafb59bff35e668e",
  precallSha256: "745831c046d3fa1375ea11f5db41fcdd5001779f9cf456b59eff7f7f0aa63686",
  installReceiptSha256: "6af0998099deabc84dc6daec8d1b79fd9b08d364fada0b248e1a36ea58727920",
  pnpmVersion: "11.20.0", rendererSha256: "d8cac00e9c4f7f02f80dd173cfe9bf70c3a90830f4979842ea5b4753641186f7",
  pnpmArchiveSha256: "34e198cb1e43237517ecedfd31f9ae26a6c0a3e5366ce58a2d05f4b21fb5f19a",
  pnpmSRI: "sha512-mm8zCpW2ZEbqCI+vFSFAWooB8H/ecSTMmVjf7VLUu0NnN+ZbCPhfN7Rvy6N1CSVYrFEmK4FoRLIvY0Bu0Wa/7g==",
  ordinaryGraphSha256: "e20c016d8739545cad05eaa78384247868ab0b4bf95729bbd1fed4cfc0e040dd",
  restoredGraphSha256: "37c8d759823161932f46e62c4a27702358081815bbc6eb76d7e33a1984c48087",
  platform: "linux", arch: "x64", nodeLinker: "isolated", hoistPattern: ["*"], extendNodePath: true,
  preferSymlinkedExecutables: false, preserveSymlinks: false, nodeExecPath: null, prependToPath: null, progArgs: null,
} as const;
const foundationRoot = "node_modules/.pnpm/@agent-teams+engineering-foundation@1.7.2_@types+node@24.19.1/node_modules/@agent-teams/engineering-foundation";
const foundationManifest = "b685018a5b4cf71f715fcd943e7c7fd921ccfe991750669e675ba5364674bf7c";
const foundationPayload = "01f20478086e2f6a3e4683f8633f63117c2d403a5de1f08092f4969907ce6269";
const foundationArchive = "b53747119d15cb3db8fc1fa97a526b4b8de3c35a85a9a85619e40571527753f5";
const foundationSRI = "sha512-2wmq4g8rWgXQ2qBVY2Tb7HVP9LFsuBAUMcDhgCqixLA0RA9H3OrwXy7b7jK2gS6SggK9XCplNb03mVLR2EyzRg==";
export const installerSourceFiles: Record<string, string> = {
  ".npmrc": "9479ed13cb0dcc39fd8620d84ef5f0c41d1861f6338cde40f70569b0829926ad",
  "pnpm-workspace.yaml": "57765e353bef21dbd7520bd79e11233f20ec89afa65fbe2ad25a9a318b03dab0",
  "pnpm-lock.yaml": "4faa2e99387ea5d5bb5733f655dfca9fadb271bdcf8acad605ef6cf4c005cf51",
  "package.json": "890c74eeeb4762485c128435cd25b5b3d6892df74f0a40ad53f50b1308632e7c",
};
// These are the producer's six public physical inventories, each already bounded
// by frozenInventory. Their union is not itself one package inventory.
export const publicToolRoots = ["node20-minimum", "node20", "node24", "node26", "pnpm", "typescript-6.0.3"] as const;
export function verifyToolEntryEnvelope(entries: readonly PreparedToolEntry[]): void {
  // Saturate before traversing an oversized array or reading any entry body.
  // Workspace graph/payload evidence also retains its existing 10000-row bound.
  assert.ok(Array.isArray(entries) && entries.length > 0
    && entries.length <= (publicToolRoots.length + 1) * 10000 + Object.keys(installerSourceFiles).length,
    "empty or unbounded tool closure");
  const counts = new Map<string, number>(), seen = new Set<string>(), configurations = new Set<string>();
  for (const row of entries) {
    closedFields(row, ["path", "sha256", "kind"], ["linkTarget"]);
    assert.ok(typeof row.path === "string" && row.path.length <= 1024
      && !/[\\:\x00-\x1f<>"|?*]/u.test(row.path)
      && row.path.split("/").every((part: string) => part && part !== "." && part !== ".."
        && !/[. ]$/u.test(part) && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(part)),
      "unsupported tool identity");
    assert.ok(!seen.has(row.path), `duplicate tool identity: ${row.path}`); seen.add(row.path);
    const parts = row.path.split("/"), configuration = parts[0] === "workspace" && parts.length === 2
      && Object.hasOwn(installerSourceFiles, parts[1]!);
    const root = parts[0] === "public-tools" && parts.length >= 3 && publicToolRoots.some(name => name === parts[1])
      ? `public-tools/${parts[1]}` : parts[0] === "workspace" && parts[1] === "node_modules" && parts.length >= 3
        ? "workspace/node_modules" : undefined;
    assert.ok(configuration || root, `unsupported tool identity: ${row.path}`);
    assert.ok(row.kind === "file" || row.kind === "symlink", "unsupported tool manifest kind");
    assert.match(row.sha256, /^[a-f0-9]{64}$/u);
    if (configuration) assert.equal(row.kind, "file", "installer configuration kind");
    assert.equal(Object.hasOwn(row, "linkTarget"), row.kind === "symlink", "tool link target field mismatch");
    if (row.kind === "symlink") assert.ok(typeof row.linkTarget === "string" && row.linkTarget.length > 0 && row.linkTarget.length <= 1024,
      "tool link target format");
    if (configuration) {
      assert.equal(row.sha256, installerSourceFiles[parts[1]!], "installer configuration identity");
      configurations.add(parts[1]!);
    } else {
      const count = (counts.get(root!) ?? 0) + 1;
      assert.ok(count <= 10000, `finite tool root inventory: ${root}`); counts.set(root!, count);
    }
  }
  assert.deepEqual([...configurations].sort(), Object.keys(installerSourceFiles).sort(), "missing installer configuration");
}
export function verifyPublicToolRoots(tools: string): void {
  assert.deepEqual(readdirSync(tools).sort(), [...publicToolRoots].sort(), "unsealed or extra tool root");
  for (const root of publicToolRoots) {
    const path = join(tools, root);
    assert.ok(lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink(), "tool root alias or kind");
    assert.equal(realpathSync(path), resolve(path), "tool root alias");
  }
}
// expected comes from physical origin inventories, the declaring resolver graph
// and the authenticated installer correspondence below, never manifest filtering.
export function verifyToolClosureEntries(entries: readonly PreparedToolEntry[], workspace: string, tools: string,
  expected: readonly InputIdentity[]): void {
  verifyToolEntryEnvelope(entries);
  const identities = new Map<string, InputIdentity>();
  for (const row of expected) {
    const previous = identities.get(row.path);
    if (previous) assert.deepEqual(row, previous, "conflicting physical tool identity");
    identities.set(row.path, row);
  }
  assert.equal(entries.length, identities.size, "incomplete or excess physical tool closure");
  const admitted = new Set<string>();
  for (const row of entries) {
    const path = row.path.startsWith("public-tools/") ? finitePath(tools, row.path.slice(13))
      : row.path.startsWith("workspace/node_modules/") ? finitePath(join(workspace, "node_modules"), row.path.slice(23))
        : finitePath(workspace, row.path.slice(10));
    const expectedIdentity = identities.get(path);
    assert.ok(expectedIdentity, `foreign physical tool identity: ${row.path}`);
    assert.ok(!admitted.has(path), `duplicate tool identity: ${path}`); admitted.add(path);
    assert.deepEqual(inputIdentity(path), expectedIdentity, `physical tool drift: ${row.path}`);
    assert.equal(row.sha256, expectedIdentity.sha256, `corrupt tool: ${row.path}`);
    assert.equal(row.kind, expectedIdentity.linkTarget === undefined ? "file" : "symlink", "tool entry kind mismatch");
    assert.equal(row.linkTarget, expectedIdentity.linkTarget, "tool link target mismatch");
    if (!row.path.startsWith("public-tools/") && !row.path.startsWith("workspace/node_modules/")) {
      assert.ok(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), "installer configuration kind");
      assert.equal(realpathSync(path), resolve(path), "installer configuration alias");
    }
  }
  assert.equal(admitted.size, identities.size, "missing physical tool identity");
}
const installerTargets = [
  { dependency: "@microsoft/api-extractor", version: "7.58.12", binName: "api-extractor", binDeclaration: "./bin/api-extractor",
    targetRoot: "node_modules/.pnpm/@microsoft+api-extractor@7.58.12_@types+node@24.19.1/node_modules/@microsoft/api-extractor",
    manifestSha256: "98e880cb2394bff5b743b554502fadf3a29a7651fef058a29b7a4b68518db04d", binSha256: "0d6d162e31aa5b5ab45228fd38c100e722c4d7895d3552682941a98425e9c03b" },
  { dependency: "yaml", version: "2.9.0", binName: "yaml", binDeclaration: "./bin.mjs",
    targetRoot: "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml",
    manifestSha256: "20b8b197cbd10dad245d45e463dfe58e4c8c25a47e24bc4256ad9ab58bf35683", binSha256: "faebbf70669988b5be13130907adf7b788145960448eab08e92e66189e72f448" },
];
function renderInstallerShim(source:string,shim:string,nodePaths:readonly string[]):string {
 const target=posix.relative(posix.dirname(shim),source),nodePath=nodePaths.join(':');
 const lines=[
    '#!/bin/sh',
    'basedir=$(dirname "$(echo "$0" | sed -e \'s,\\\\,/,g\')")',
    'basedir_win="$basedir"',
    'exe=""',
    'msys=""',
    '',
    'case `uname -a` in',
    '  *CYGWIN*|*MINGW*|*MSYS*)',
    '    if command -v cygpath > /dev/null 2>&1; then',
    '      basedir_win=`cygpath -w "$basedir"`',
    '    fi',
    '    exe=".exe"',
    '    msys="true"',
    '  ;;',
    '  *WSL2*)',
    '    if command -v wslpath > /dev/null 2>&1; then',
    '      basedir_win="$(wslpath -w "$basedir" 2> /dev/null)"',
    '      if [ $? -ne 0 ] || [ -z "$basedir_win" ]; then',
    '        basedir_win="$basedir"',
    '      else',
    '        exe=".exe"',
    '      fi',
    '    fi',
    '  ;;',
    'esac',
    '',
    'if [ -z "$NODE_PATH" ]; then',
    `  export NODE_PATH="${nodePath}"`,
    'else',
    `  export NODE_PATH="${nodePath}:$NODE_PATH"`,
    'fi',
    'if [ -n "$exe" ] && [ -x "$basedir/node.exe" ]; then',
    `  exec "$basedir/node.exe"  "$basedir_win/${target}" "$@"`,
    'elif [ -x "$basedir/node" ]; then',
    `  exec "$basedir/node"  "$basedir/${target}" "$@"`,
    'elif command -v node >/dev/null 2>&1; then',
    `  exec node  "$basedir/${target}" "$@"`,
    'elif [ -n "$exe" ] && command -v node.exe >/dev/null 2>&1; then',
    `  exec node.exe  "$basedir_win/${target}" "$@"`,
    'else',
    `  exec node  "$basedir/${target}" "$@"`,
    'fi',
    `# cmd-shim-target=${source}`,
    ''
  ];
 return lines.join('\n');
}

function expectedInstallerWitnesses(): InstallerWitness[] {
  return installerTargets.map(target => {
    const edge = posix.join(posix.dirname(posix.dirname(foundationRoot)), target.dependency);
    const originalTarget = posix.join(acceptedInstallerProvenance.cwd, target.targetRoot, target.binDeclaration);
    const shimPath = `node_modules/.bin/${target.binName}`;
    const modules = target.dependency.startsWith("@") ? posix.dirname(posix.dirname(target.targetRoot)) : posix.dirname(target.targetRoot);
    const nodePaths = [posix.join(acceptedInstallerProvenance.cwd, target.targetRoot, "node_modules"),
      posix.join(acceptedInstallerProvenance.cwd, modules), posix.join(acceptedInstallerProvenance.cwd, "node_modules/.pnpm/node_modules")];
    const bytes = renderInstallerShim(originalTarget, posix.join(acceptedInstallerProvenance.cwd, foundationRoot, shimPath), nodePaths);
    return { declaringCoordinate: "@agent-teams/engineering-foundation@1.7.2", declaringManifestSha256: foundationManifest,
      ...target, edge, edgeTarget: posix.relative(posix.dirname(edge), target.targetRoot), originalTarget, nodePaths,
      shimPath, shimSha256: bodyHash(bytes), shimMode: 0o755 };
  });
}
function validatePayloadRows(rows: readonly PackagePayloadRow[]): void {
  assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 10000, "finite package payload");
  assert.equal(new Set(rows.map(row => row.path)).size, rows.length, "duplicate package payload");
  for (const row of rows) {
    closedFields(row, ["path", "sha256"], ["linkTarget"]);
    archiveEntryPath(`package/${row.path}`, "File");
    assert.match(row.sha256, /^[a-f0-9]{64}$/u, "payload body identity");
    if (row.linkTarget !== undefined) assert.ok(typeof row.linkTarget === "string" && row.linkTarget.length > 0, "payload link identity");
  }
}
function validateProjection(projection: PackagePayloadProjection): void {
  closedFields(projection, ["schemaVersion", "provenance", "published", "installedPayloadSha256", "witnesses", "witnessesSha256"]);
  assert.equal(projection.schemaVersion, 1, "unsupported package projection schema");
  closedFields(projection.provenance, Object.keys(acceptedInstallerProvenance));
  assert.deepEqual(projection.provenance, acceptedInstallerProvenance, "unbound installer provenance");
  validatePayloadRows(projection.published);
  assert.equal(payloadHash(projection.published), foundationPayload, "unauthenticated published payload");
  assert.match(projection.installedPayloadSha256, /^[a-f0-9]{64}$/u);
  const expected = expectedInstallerWitnesses();
  assert.ok(Array.isArray(projection.witnesses));
  for (const witness of projection.witnesses) closedFields(witness, Object.keys(expected[0]!));
  assert.deepEqual(projection.witnesses, expected, "missing, duplicate, forged or ambiguous installer witness");
  assert.equal(payloadHash(projection.witnesses), projection.witnessesSha256, "noncanonical installer witness bytes");
  assert.equal(projection.witnessesSha256, payloadHash(expected), "installer witness digest");
}
// The sole pure projection rule: a closed finite witness, not a caller-supplied
// exclusion list. Complete installed inventory remains sealed by its caller.
export function projectPackagePayload(installed: readonly PackagePayloadRow[], projection: PackagePayloadProjection): PackagePayloadRow[] {
  validateProjection(projection); validatePayloadRows(installed);
  assert.equal(payloadHash(installed), projection.installedPayloadSha256, "complete installed package drift");
  const witnesses = new Map(projection.witnesses.map(row => [row.shimPath, row]));
  for (const witness of witnesses.values()) {
    const row = installed.find(row => row.path === witness.shimPath);
    assert.ok(row && row.linkTarget === undefined && row.sha256 === witness.shimSha256, "missing or changed generated shim");
  }
  const published = installed.filter(row => !witnesses.has(row.path));
  assert.deepEqual(published, projection.published, "archive/restored package mismatch");
  return published;
}
export function packagePayloadInventory(root: string): PackagePayloadRow[] {
  return frozenInventory(root, true).map(row => ({ path: relative(root, row.path).split(process.platform === "win32" ? "\\" : "/").join("/"),
    sha256: row.sha256, ...(row.linkTarget === undefined ? {} : { linkTarget: row.linkTarget }) }));
}
// Thin physical adapter shared by acquisition and normal main. Exact pinned
// manifests and resolver edges establish ownership before the pure projection.
export function verifyPackagePayload(workspace: string, root: string, origin: Pick<SupportOrigin, "id" | "archiveSha256" | "payloadSha256" | "sri">,
  renderer: string, projection?: PackagePayloadProjection, published?: PackagePayloadRow[]): { projection?: PackagePayloadProjection; inputs: InputIdentity[] } {
  const installed = packagePayloadInventory(root);
  if (origin.id !== "@agent-teams/engineering-foundation") {
    assert.equal(projection, undefined, "unexpected installer projection");
    if (published) assert.deepEqual(installed, published, "archive/restored package mismatch");
    assert.equal(payloadHash(installed), origin.payloadSha256, "support/extracted payload mismatch");
    return { inputs: [] };
  }
  assert.equal(process.platform, "linux", "unsupported installer renderer platform"); assert.equal(process.arch, "x64", "unsupported installer renderer architecture");
  assert.deepEqual([origin.archiveSha256, origin.payloadSha256, origin.sri], [foundationArchive, foundationPayload, foundationSRI], "package archive/SRI binding");
  assert.equal(relative(realpathSync(workspace), realpathSync(root)), foundationRoot, "declaring package resolver binding");
  const inputs: InputIdentity[] = [];
  for (const [path, expected] of Object.entries(installerSourceFiles)) {
    const row = inputIdentity(join(workspace, path)); assert.equal(row.sha256, expected, "installer source/config binding"); inputs.push(row);
  }
  const rendererInput = inputIdentity(renderer); assert.equal(rendererInput.sha256, acceptedInstallerProvenance.rendererSha256, "pinned installer renderer binding"); inputs.push(rendererInput);
  const declaringInput = inputIdentity(join(root, "package.json")); assert.equal(declaringInput.sha256, foundationManifest, "declaring package manifest binding");
  const declaring = JSON.parse(readFileSync(declaringInput.path, "utf8")) as { dependencies: Record<string, string> };
  const owners: Record<string, string[]> = {};
  for (const [name, version] of Object.entries(declaring.dependencies)) {
    const edge = join(dirname(dirname(root)), name);
    assert.ok(lstatSync(edge).isSymbolicLink(), "dependency resolver edge kind");
    const target = realpathSync(edge); finitePath(join(workspace, "node_modules"), relative(join(workspace, "node_modules"), join(target, "package.json")));
    const manifest = inputIdentity(join(target, "package.json")); inputs.push(manifest);
    const metadata = JSON.parse(readFileSync(manifest.path, "utf8")) as { name: string; version: string; bin?: string | Record<string, string> };
    assert.deepEqual([metadata.name, metadata.version], [name, version], "dependency name/version binding");
    const bins = typeof metadata.bin === "string" ? { [name.split("/").at(-1)!]: metadata.bin } : metadata.bin ?? {};
    for (const bin of Object.keys(bins)) (owners[bin] ??= []).push(name);
  }
  assert.deepEqual(owners, { "api-extractor": ["@microsoft/api-extractor"], yaml: ["yaml"] }, "ambiguous or changed declared bin ownership");
  for (const witness of expectedInstallerWitnesses()) {
    const edge = join(workspace, witness.edge), target = join(workspace, witness.targetRoot);
    assert.equal(readlinkSync(edge), witness.edgeTarget, "dependency symlink binding"); assert.equal(realpathSync(edge), target, "dependency resolver target binding");
    const manifest = inputIdentity(join(target, "package.json")); assert.equal(manifest.sha256, witness.manifestSha256, "authenticated target manifest binding");
    const metadata = JSON.parse(readFileSync(manifest.path, "utf8")) as { bin: string | Record<string, string>; engines?: { runtime?: unknown } };
    assert.equal(typeof metadata.bin === "string" ? metadata.bin : metadata.bin[witness.binName], witness.binDeclaration, "declared bin target binding");
    assert.equal(metadata.engines?.runtime, undefined, "unsupported downloaded bin runtime");
    const bin = finitePath(target, witness.binDeclaration.replace(/^\.\//u, ""));
    assert.equal(realpathSync(bin), bin, "bin target alias"); assert.ok(lstatSync(bin).isFile(), "bin target kind");
    const binInput = inputIdentity(bin); assert.equal(binInput.sha256, witness.binSha256, "authenticated bin body binding"); inputs.push(binInput);
    assert.equal(readFileSync(bin, "utf8").trim().split(/\r*\n/u)[0], "#!/usr/bin/env node", "unsupported bin runtime arguments");
    const shim = finitePath(root, witness.shimPath), stat = lstatSync(shim);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), "generated shim kind"); assert.equal(stat.mode & 0o7777, witness.shimMode, "generated shim mode");
    assert.equal(readFileSync(shim, "utf8"), renderInstallerShim(witness.originalTarget,
      posix.join(acceptedInstallerProvenance.cwd, foundationRoot, witness.shimPath), witness.nodePaths), "generated shim bytes");
  }
  const candidate = projection ?? (published ? { schemaVersion: 1 as const, provenance: acceptedInstallerProvenance, published,
    installedPayloadSha256: payloadHash(installed), witnesses: expectedInstallerWitnesses(), witnessesSha256: payloadHash(expectedInstallerWitnesses()) } : undefined);
  assert.ok(candidate, "missing authenticated installer projection");
  if (published) assert.deepEqual(candidate.published, published, "published projection binding");
  projectPackagePayload(installed, candidate);
  return { projection: candidate, inputs: [...new Map(inputs.map(row => [row.path, row])).values()] };
}

// This is the actual normal-main physical support callsite, kept callable for
// retained-archive conformance without launching unrelated qualification gates.
export function verifyPhysicalSupportPayload(workspace: string, root: string, origin: SupportOrigin, renderer: string,
  admitted: ReadonlySet<string>): InputIdentity[] {
  for (const row of frozenInventory(root, true)) assert.ok(admitted.has(row.path), `unsealed support payload: ${row.path}`);
  const correspondence = verifyPackagePayload(workspace, root, origin, renderer, origin.payloadProjection);
  for (const row of correspondence.inputs) assert.ok(admitted.has(row.path), `unsealed installer evidence: ${row.path}`);
  return correspondence.inputs;
}
export function verifySupportOrigins(rows: readonly SupportOrigin[], platform: string, arch: string, origins?: readonly ToolOrigin[]): void {
  const versions = supportVersions(platform, arch);
  assert.ok(Array.isArray(rows));
  assert.deepEqual(rows.map(row => row.id).sort(), Object.keys(versions).sort(), "missing, duplicate or unknown support origin");
  for (const row of rows) {
    closedFields(row, ["id", "version", "platform", "arch", "status", "archiveSha256", "payloadSha256", "source", "method", "sri"], ["payloadProjection"]);
    if (row.payloadProjection !== undefined) {
      assert.equal(row.id, "@agent-teams/engineering-foundation", "unsupported projected support origin"); validateProjection(row.payloadProjection);
      assert.deepEqual([row.archiveSha256, row.payloadSha256, row.sri], [foundationArchive, foundationPayload, foundationSRI], "projected origin archive/SRI binding");
      const generators = origins?.filter(origin => origin.id === "pnpm");
      assert.equal(generators?.length, 1, "missing or duplicate installer origin");
      const generator = generators![0]!;
      assert.deepEqual([generator.version, generator.archiveSha256, generator.verification.sri],
        [acceptedInstallerProvenance.pnpmVersion, acceptedInstallerProvenance.pnpmArchiveSha256, acceptedInstallerProvenance.pnpmSRI], "installer origin/projection binding");
    }
    assert.equal(row.version, versions[row.id]); assert.equal(row.platform, platform); assert.equal(row.arch, arch);
    assert.equal(row.status, "verified"); assert.equal(row.method, "package-sri");
    assert.equal(row.source, registryMetadataUrl(row.id, row.version), "unofficial support origin");
    assert.match(row.sri, /^sha512-[A-Za-z0-9+/]{86}==$/u);
    for (const value of [row.archiveSha256, row.payloadSha256]) assert.match(value, /^[a-f0-9]{64}$/u);
  }
}
export function verifyToolOrigins(origins: readonly ToolOrigin[], platform: string, arch: string): void {
  assert.ok(["linux", "darwin", "win32"].includes(platform) && ["x64", "arm64"].includes(arch), "unsupported finite platform");
  const versions = { "node20-minimum": "20.0.0", node20: "20.20.0", node24: "24.21.0", node26: "26.10.0",
    "typescript-minimum": "5.8.3", "typescript-6.0.3": "6.0.3", typescript: "7.0.2", pnpm: "11.20.0" };
  assert.ok(Array.isArray(origins), "missing finite origins");
  assert.deepEqual(origins.map(row => row.id).sort(), Object.keys(versions).sort(), "missing, duplicate or unknown origin");
  for (const row of origins) {
    closedFields(row, ["id", "version", "platform", "arch", "status", "payloadSha256", "archiveSha256", "source", "verification"]);
    closedFields(row.verification, ["method", "receipt"], ["policyCommit", "signer", "sri"]);
    assert.equal(row.version, versions[row.id as keyof typeof versions], "origin version");
    assert.equal(row.platform, platform, "origin platform"); assert.equal(row.arch, arch, "origin architecture");
    assert.equal(row.status, "verified", "unverified origin");
    for (const value of [row.archiveSha256, row.payloadSha256]) assert.match(value, /^[a-f0-9]{64}$/u, "missing origin payload identity");
    if (row.id.startsWith("node")) {
      assert.equal(row.source, `https://nodejs.org/dist/v${row.version}/SHASUMS256.txt.asc`, "unofficial node origin");
      assert.equal(row.verification.method, "signed-shasums", "unsigned node origin");
      assert.equal(row.verification.policyCommit, nodeSignerPolicy.commit, "unpinned signer policy");
      assert.ok(nodeSignerPolicy.signers.includes(row.verification.signer ?? ""), "signer outside pinned public policy");
    } else {
      assert.equal(row.source, `https://registry.npmjs.org/${row.id.startsWith("typescript") ? "typescript" : "pnpm"}/${row.version}`, "unofficial package origin");
      assert.equal(row.verification.method, "package-sri", "missing package SRI verification");
      assert.match(row.verification.sri ?? "", /^sha512-[A-Za-z0-9+/]{86}==$/u, "invalid package SRI");
    }
    verifyIdentities([row.verification.receipt]);
    const proof = JSON.parse(readFileSync(row.verification.receipt.path, "utf8"));
    assert.deepEqual({ id: proof.id, version: proof.version, platform: proof.platform, arch: proof.arch, status: proof.status,
      archiveSha256: proof.archiveSha256, payloadSha256: proof.payloadSha256, source: proof.source, method: proof.method,
      policyCommit: proof.policyCommit, signer: proof.signer, sri: proof.sri },
      { id: row.id, version: row.version, platform: row.platform, arch: row.arch, status: row.status, archiveSha256: row.archiveSha256,
        payloadSha256: row.payloadSha256, source: row.source, method: row.verification.method, policyCommit: row.verification.policyCommit,
        signer: row.verification.signer, sri: row.verification.sri }, "origin verification receipt mismatch");
  }
}
export function childEnvironment(): Record<string, string> {
  return Object.fromEntries(["CI", "PATH", "Path", "SystemRoot", "HOME", "USERPROFILE", "TEMP", "TMP", "TMPDIR"]
    .flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]!]]));
}



// Explicit finite acquisition only. Ordinary lifecycle:check never imports or invokes this entry.
const { commit: policyCommit, sha256: policySHA, signers } = nodeSignerPolicy;
const sha = (bytes: Uint8Array | string, algorithm = "sha256", encoding: "hex" | "base64" = "hex") => createHash(algorithm).update(bytes).digest(encoding);
const slash = (path: string) => path.split(process.platform === "win32" ? "\\" : "/").join("/");
function payload(root: string) {
  return frozenInventory(root, true).map(row => ({ path: slash(relative(root, row.path)), sha256: row.sha256,
    ...(row.linkTarget === undefined ? {} : { linkTarget: row.linkTarget }) }));
}
// The producer and its manifest-to-main regression use the same serialization.
export function preparedToolEntries(rows: readonly ReturnType<typeof inputIdentity>[], workspace: string, tools: string) {
  return [...new Map(rows.map(row => [row.path, row])).values()].map(row => ({ path: row.path.startsWith(tools + "/") || row.path.startsWith(tools + "\\") ? "public-tools/" + slash(relative(tools, row.path)) : "workspace/" + slash(relative(workspace, row.path)),
    kind: row.linkTarget === undefined ? "file" : "symlink", sha256: row.sha256, ...(row.linkTarget === undefined ? {} : { linkTarget: row.linkTarget }) })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export function preparationPath(path: string, root: string): string {
  assert.ok(path.length > 0 && path.length <= 1024 && !/[\\:\x00-\x1f<>"|?*]/u.test(path), "nonportable preparation path");
  const canonical = path.endsWith("/") ? path.slice(0, -1) : path;
  assert.ok(canonical.split("/").every(part => part && part !== "." && part !== ".."), "preparation traversal");
  assert.ok(canonical.split("/").every(part => !/[. ]$/u.test(part) && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(part)), "nonportable preparation path");
  assert.ok(canonical === root || canonical.startsWith(root + "/"), "preparation archive root");
  return canonical;
}
export function signedRelease(status: string, exitCode: number | null): string {
  assert.equal(exitCode, 0, "signature verifier failed");
  assert.ok(!/BADSIG|ERRSIG|REVKEYSIG|EXPKEYSIG|EXPSIG|NO_PUBKEY/u.test(status), "rejected release signature");
  const signatures = status.split(/\r?\n/u).filter(line => /^\[GNUPG:\] VALIDSIG(?:\s|$)/u.test(line));
  assert.equal(signatures.length, 1, "missing or multiple release signatures");
  // GPG's documented fields, with an optional effective primary fingerprint.
  // Do not interpret a malformed tail as an absent primary or another signature.
  const match = /^\[GNUPG:\] VALIDSIG ([A-F0-9]{40}) \d{4}-\d{2}-\d{2} \d+ \d+ \d+ \d+ \d+ \d+ [A-F0-9]{2}(?: ([A-F0-9]{40}))?$/u.exec(signatures[0]!);
  assert.ok(match, "malformed release signature");
  const signer = match[2] ?? match[1]!;
  assert.ok(signers.includes(signer), "signer outside pinned public policy");
  return signer;
}
export function zipInventory(bytes: Buffer, root: string): string[] {
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0, "missing zip directory");
  assert.equal(end + 22 + bytes.readUInt16LE(end + 20), bytes.length, "zip trailing bytes");
  assert.equal(bytes.readUInt16LE(end + 8), bytes.readUInt16LE(end + 10), "partial zip directory");
  assert.equal(bytes.readUInt16LE(end + 4), 0); assert.equal(bytes.readUInt16LE(end + 6), 0);
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12);
  let cursor = bytes.readUInt32LE(end + 16);
  assert.ok(count > 0 && count <= 10000 && cursor + size === end, "finite zip directory");
  const rows: string[] = [], names: string[] = [];
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50, "zip directory entry");
    assert.equal(bytes.readUInt16LE(cursor + 8) & 1, 0, "encrypted zip");
    assert.ok([0, 8].includes(bytes.readUInt16LE(cursor + 10)), "zip compression");
    assert.notEqual((bytes.readUInt32LE(cursor + 38) >>> 16) & 0xf000, 0xa000, "zip symlink");
    const length = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const name = bytes.subarray(cursor + 46, cursor + 46 + length).toString("utf8");
    assert.ok(!name.includes("\uFFFD")); const canonical = preparationPath(name, root); names.push(canonical);
    if (!name.endsWith("/")) rows.push(canonical);
    cursor += 46 + length + extra + comment;
  }
  assert.equal(cursor, end); assert.equal(new Set(names).size, names.length, "duplicate zip path");
  return rows.sort();
}
export function packageArchiveRoot(name: string, version: string): string {
  return name === "@types/node" && version === "24.19.1" ? "node v24.19" : "package";
}
type PreparationEntry = {
  path: string; type: string; linkpath: string | undefined;
  readonly destroyed: boolean;
  readonly emittedEnd: boolean;
  destroy(error?: Error): unknown;
  on(event: "data", callback: (data: Buffer) => void): unknown;
  on(event: "error", callback: (error: unknown) => void): unknown;
  on(event: "end" | "close" | "aborted", callback: () => void): unknown;
  // Minipass destroy() need not emit close. Its public promise observes the
  // private destruction event as well as end/error; do not guess its symbol.
  promise(): Promise<void>;
};
// The file-taking tar.t hides its parser and descriptor. The streaming overload
// gives this invocation ownership of both, so entry refusal can abort listing.
type PreparationParser = NodeJS.WritableStream & { abort(error: Error): void };
type PreparationTar = { t(options: { strict: boolean; brotli?: boolean; zstd?: boolean; onReadEntry: (entry: PreparationEntry) => void }): PreparationParser;
    x(options: { file: string; cwd: string; strip: number; strict: boolean }): Promise<void> };
export async function extractPreparationArchive(tar: PreparationTar, path: string, root: string, output: string) {
  const names = new Set<string>(), waits: Promise<void>[] = [], lifetimes: Promise<void>[] = [];
  const refusals: unknown[] = [];
  const pending = new Map<PreparationEntry, () => void>();
  const entries = new Set<PreparationEntry>(), observedLifetimes = new Set<PreparationEntry>();
  let cancel: (() => void) | undefined;
  let earlierDestroyed: Set<PreparationEntry> | undefined;
  const refuse = (error: unknown, source?: PreparationEntry, fromLifetime = false) => {
    if (refusals.length) return;
    // Silent destroy settles Minipass's inner promise synchronously, but its
    // async public promise reports later. Snapshot earlier destroyed states
    // before any callback can clear them. Do not choose by registration order:
    // an explicit error on a later-registered entry can precede another destroy.
    if (fromLifetime) {
      if (earlierDestroyed && source && !earlierDestroyed.has(source)) return;
    } else {
      if (!earlierDestroyed) {
        const earlier = [...pending.keys()].filter(entry => entry !== source && entry.destroyed && observedLifetimes.has(entry));
        if (earlier.length) earlierDestroyed = new Set(earlier);
        else if (source?.destroyed && observedLifetimes.has(source)) earlierDestroyed = new Set([source]);
      }
      // The already-issued lifetime observations retain each original cause,
      // including silent destruction followed by another error on that entry.
      if (earlierDestroyed) return;
    }
    refusals.push(error);
    for (const settle of pending.values()) settle();
    cancel?.();
  };
  const archived: { path: string; sha256?: string; linkTarget?: string }[] = [];
  const onReadEntry = (entry: PreparationEntry) => {
    // No event callback may escape the awaited operation and main's finally.
    try {
      entries.add(entry);
      for (const previous of pending.keys()) if (previous.destroyed) { refuse(new Error("stream destroyed")); break; }
      entry.on("error", error => refuse(error, entry));
      let settled = false;
      let yes!: () => void;
      waits.push(new Promise<void>(resolve => { yes = resolve; }));
      const settle = () => { if (!settled) { settled = true; pending.delete(entry); yes(); } };
      pending.set(entry, settle);
      // Observe actual lifetime settlement for every kind, before adding data
      // listeners can resume Minipass. Cancellation destroys these owned entries.
      if (entry.destroyed) { refuse(new Error("incomplete preparation archive entry")); settle(); return; }
      const lifetime = entry.promise(); observedLifetimes.add(entry);
      lifetimes.push(lifetime.then(() => {}, error => { refuse(error, entry, true); }));
      if (refusals.length) { settle(); entry.destroy(); return; }
      const name = preparationPath(entry.path, root); assert.ok(!names.has(name), "duplicate archive path"); names.add(name);
      assert.ok(["File", "Directory", "SymbolicLink"].includes(entry.type), "unsupported preparation archive kind");
      let linkTarget: string | undefined;
      if (entry.type === "SymbolicLink") {
        linkTarget = entry.linkpath;
        assert.ok(typeof linkTarget === "string" && !posix.isAbsolute(linkTarget) && !/[\\:\x00-\x1f]/u.test(linkTarget), "nonportable archive link");
        preparationPath(posix.normalize(posix.join(posix.dirname(name), linkTarget)), root);
      }
      const hash = entry.type === "File" ? createHash("sha256") : undefined;
      const incomplete = () => { if (!settled) refuse(new Error("incomplete preparation archive entry")); };
      entry.on("close", incomplete); entry.on("aborted", incomplete);
      entry.on("end", () => {
        if (settled) return;
        try {
          for (const previous of pending.keys()) if (previous.destroyed) return refuse(new Error("stream destroyed"));
          if (refusals.length) return;
          if (hash) archived.push({ path: name.slice(root.length + 1), sha256: hash.digest("hex") });
          else if (linkTarget !== undefined) archived.push({ path: name.slice(root.length + 1), linkTarget });
          settle();
        } catch (error) { refuse(error); }
      });
      if (hash) entry.on("data", data => {
        if (!settled) { try {
          for (const previous of pending.keys()) if (previous.destroyed) return refuse(new Error("stream destroyed"));
          if (!refusals.length) hash.update(data);
        } catch (error) { refuse(error); } }
      });
    } catch (error) {
      // A first registration can throw before lifetime observation exists.
      // Re-establish the public observers before cancellation destroys this
      // already-owned entry; cleanup errors must retain the original refusal.
      if (!observedLifetimes.has(entry)) {
        try {
          entry.on("error", late => refuse(late, entry));
          const lifetime = entry.promise(); observedLifetimes.add(entry);
          lifetimes.push(lifetime.then(() => {}, late => { refuse(late, entry, true); }));
        } catch { /* The original registration exception remains the cause. */ }
      }
      refuse(error);
    }
  };
  const parser = tar.t({ strict: true, onReadEntry,
    ...(path.endsWith(".tar.br") || path.endsWith(".tbr") ? { brotli: true } : {}),
    ...(path.endsWith(".tar.zst") || path.endsWith(".tzst") ? { zstd: true } : {}) });
  const reader = createReadStream(path);
  // These promises settle on actual terminal events and never reject unattended.
  // Parser.abort closes its decompressor synchronously and emits TAR_ABORT error;
  // it does not emit close. The descriptor's close is awaited separately.
  const listing = new Promise<void>(yes => {
    parser.on("error", error => { refuse(error); yes(); });
    parser.on("end", yes);
  });
  const closed = new Promise<void>(yes => reader.on("close", yes));
  let cancelled = false;
  cancel = () => {
    if (cancelled) return; cancelled = true;
    reader.unpipe(parser); reader.destroy();
    // Hash/inventory waits were released above. Destroy incomplete owned
    // lifetimes so their public promises actually settle; leave completed ones.
    for (const entry of entries) if (!entry.destroyed && !entry.emittedEnd) entry.destroy();
    parser.abort(refusals[0] instanceof Error ? refusals[0] : new Error(String(refusals[0])));
  };
  reader.on("error", error => refuse(error));
  try { if (refusals.length) cancel(); else reader.pipe(parser); await listing; await Promise.all(waits); }
  catch (error) { refuse(error); }
  finally {
    if (refusals.length) cancel();
    await closed;
    await Promise.all(lifetimes);
  }
  if (refusals.length) throw refusals[0];
  assert.ok(names.size > 0 && names.size <= 10000, "finite archive inventory");
  await mkdir(output); await tar.x({ file: path, cwd: output, strip: 1, strict: true });
  const extracted = payload(output).map(row => row.linkTarget === undefined ? row : { path: row.path, linkTarget: row.linkTarget });
  const order = (a: { path: string }, b: { path: string }) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  assert.deepEqual(extracted.sort(order), archived.sort(order), "archive/extracted payload mismatch");
}

export function verifyPreparedPackagePayload(workspace: string, installedRoot: string, extractedRoot: string,
  proof: { id: string; archiveSha256: string; payloadSha256: string; sri: string }, renderer: string) {
  return verifyPackagePayload(workspace, installedRoot, proof, renderer, undefined, payload(extractedRoot));
}

async function main(): Promise<void> {
  assert.ok(process.argv.includes("--acquire"), "explicit --acquire is required; no implicit network preparation");
  assert.ok(["v24.21.0", "v26.10.0"].includes(process.version), "unsupported preparation root");
  assert.ok(["linux", "darwin", "win32"].includes(process.platform) && ["x64", "arm64"].includes(process.arch), "unsupported finite platform");
  const workspace = process.cwd();
  const destination = process.env.LIFECYCLE_PUBLIC_TOOL_ROOT, manifest = process.env.LIFECYCLE_PREPARED_MANIFEST;
  const keyring = process.env.LIFECYCLE_PUBLIC_SIGNER_KEYRING, gpg = process.env.LIFECYCLE_GPG;
  assert.ok(destination && manifest && keyring && gpg, "explicit tool root, manifest, public keyring and gpg executable are required");
  const tools = resolve(destination);
  for (const path of [tools, resolve(manifest)]) {
    const displacement = relative(workspace, path);
    assert.ok(displacement === ".." || displacement.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(displacement), "preparation outputs must be outside the source repository");
  }
  assert.ok(!existsSync(tools) && !existsSync(manifest) && !existsSync(tools + ".preparation-evidence"), "preparation destinations must be fresh");
  assert.ok(isAbsolute(gpg) && isAbsolute(keyring), "absolute operator verifier inputs required");
  const require = createRequire(join(workspace, "package.json"));
  const packages = supportVersions(process.platform, process.arch);
  const graph = restoredDependencyGraph(workspace, process.platform, process.arch);
  const { roots } = graph;
  const frozen = new Map(graph.entries.map(row => [row.path, row]));
  const inventories = new Map(graph.inventories);
  function seal(root: string) {
    const rows = frozenInventory(root, true); inventories.set(root, rows);
    for (const row of rows) frozen.set(row.path, row);
  }
  assert.equal(inputIdentity(gpg).sha256, process.env.LIFECYCLE_GPG_SHA256, "missing operator-accepted verifier hash");
  assert.equal(graph.sha256, process.env.LIFECYCLE_RESTORED_CLOSURE_SHA256, "missing or changed operator-accepted restored closure");
  for (const path of [gpg, keyring, process.execPath, fileURLToPath(import.meta.url), join(workspace, "packages/lifecycle-kernel/tests/run-node20-qualification.mts")]) frozen.set(resolve(path), inputIdentity(path));
  const correspondenceChecks: (() => void)[] = [];
  const recheck = () => {
    verifyIdentities([...frozen.values()]); for (const [root, rows] of inventories) verifyInventory(root, rows, true);
    for (const check of correspondenceChecks) check();
  };
  await mkdir(tools, { recursive: false });
  const evidence = tools + ".preparation-evidence"; await mkdir(evidence, { recursive: false });
  const downloads = join(evidence, "downloads"); await mkdir(downloads);
  const scratch = await mkdtemp(join(evidence, "scratch-"));
  const environment = { ...childEnvironment(), pnpm_config_verify_deps_before_run: "error", npm_config_offline: "true", pnpm_config_offline: "true" };
  const runId = globalThis.crypto.randomUUID();
  const sourceRuntime = inputIdentity(process.execPath);
  const git = (process.env.PATH ?? process.env.Path ?? "").split(delimiter).map(path => join(path, process.platform === "win32" ? "git.exe" : "git")).find(path => existsSync(path));
  assert.ok(git, "source inventory requires the actual git executable"); frozen.set(resolve(git), inputIdentity(git));
  recheck();
  const tracked = spawnSync(git, ["ls-files", "-z"], { cwd: workspace, env: environment, encoding: "utf8" });
  recheck(); assert.equal(tracked.error, undefined); assert.equal(tracked.signal, null); assert.equal(tracked.status, 0);
  const source = [...new Set([...tracked.stdout.split("\0").filter(Boolean), "tests/qualification/lifecycle-tool-prepare.mts"])].sort().map(path => inputIdentity(join(workspace, path)));
  assert.ok(source.length > 0 && source.length <= 10000, "finite source inventory");
  for (const row of source) frozen.set(row.path, row);
  const sourceChunks: { path: string; sha256: string }[] = [];
  for (let offset = 0; offset < source.length; offset += 750) {
    const bytes = JSON.stringify(source.slice(offset, offset + 750)), path = join(evidence, `source-${offset}.json`);
    assert.ok(Buffer.byteLength(bytes) < 1024 * 1024, "source reference size limit");
    await writeFile(path, bytes); frozen.set(path, inputIdentity(path)); sourceChunks.push({ path, sha256: sha(bytes) });
  }
  const sourceHash = sha(JSON.stringify(source.map(row => ({ ...row, path: slash(relative(workspace, row.path)), realpath: slash(relative(workspace, row.realpath)) }))));
  const commandBindings = (executable: string, args: readonly string[], env = environment) => ({ runId, invocationId: globalThis.crypto.randomUUID(),
    executable: inputIdentity(executable), argumentsSha256: sha(JSON.stringify(args)), environmentSha256: sha(JSON.stringify(env)),
    sourceHash, sourceChunks, rootRuntime: sourceRuntime, restoredClosureSha256: graph.sha256,
    keyring: frozen.get(resolve(keyring)), verifier: frozen.get(resolve(gpg)) });
  const receipts: unknown[] = [{ command: [git, "ls-files", "-z"], exitCode: tracked.status, stdoutSha256: sha(tracked.stdout), stderr: tracked.stderr,
    bindings: commandBindings(git, ["ls-files", "-z"]), sourceInventoryDiscovery: true }], origins: Parameters<typeof verifyToolOrigins>[0][number][] = [], support: Parameters<typeof verifySupportOrigins>[0][number][] = [];
  let terminal = "FAIL";
  async function get(url: string, label: string): Promise<Buffer> {
    recheck();
    try {
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60000) });
      const bytes = Buffer.from(await response.arrayBuffer()), path = join(downloads, label);
      assert.ok(bytes.length <= 256 * 1024 * 1024, "finite public response"); await writeFile(path, bytes);
      const identity = inputIdentity(path); assert.equal(identity.sha256, sha(bytes)); frozen.set(identity.path, identity);
      receipts.push({ url, status: response.status, authentication: "anonymous", runId, sourceHash, sourceChunks, restoredClosureSha256: graph.sha256, bodySha256: sha(bytes), path, bytes: bytes.length });
      assert.equal(response.status, 200, `public retrieval failed: ${url}`); assert.ok(bytes.length > 0, "empty public response");
      recheck(); return bytes;
    } catch (error) { receipts.push({ url, error: String(error), status: "FAIL" }); throw error; }
  }
  const tar = require("tar") as PreparationTar;
  async function provePackage(id: string, version: string, output?: string) {
    const name = id.startsWith("typescript") ? "typescript" : id;
    const source = registryMetadataUrl(name, version);
    const metadata = JSON.parse((await get(source, id.replaceAll("/", "-") + "-metadata.json")).toString());
    assert.equal(metadata.name, name); assert.equal(metadata.version, version);
    assert.match(metadata.dist.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/u);
    const url = new URL(metadata.dist.tarball); assert.equal(url.origin, "https://registry.npmjs.org"); assert.equal(url.username + url.password, "");
    const label = id.replaceAll("/", "-") + ".tgz", bytes = await get(url.href, label);
    assert.equal("sha512-" + sha(bytes, "sha512", "base64"), metadata.dist.integrity, "package SRI mismatch");
    const extracted = output ?? join(scratch, id.replaceAll("/", "-")); await extractPreparationArchive(tar, join(downloads, label), packageArchiveRoot(name, version), extracted);
    const proof = { id, archiveSha256: sha(bytes), payloadSha256: sha(JSON.stringify(payload(extracted))), sri: metadata.dist.integrity as string };
    const correspondence = output ? undefined : verifyPreparedPackagePayload(workspace, roots[id]!, extracted, proof, join(tools, "pnpm/dist/pnpm.mjs"));
    if (output) seal(extracted);
    else for (const row of correspondence!.inputs) frozen.set(row.path, row);
    if (correspondence?.projection) {
      const projection = correspondence.projection;
      correspondenceChecks.push(() => { verifyPackagePayload(workspace, roots[id]!, proof, join(tools, "pnpm/dist/pnpm.mjs"), projection); });
    }
    return { ...(correspondence?.projection === undefined ? {} : { payloadProjection: correspondence.projection }), id, version, platform: process.platform, arch: process.arch, status: "verified" as const, archiveSha256: sha(bytes), payloadSha256: sha(JSON.stringify(payload(extracted))),
      source, method: "package-sri" as const, sri: metadata.dist.integrity as string };
  }
  async function origin(proof: Awaited<ReturnType<typeof provePackage>> | { id: string; version: string; platform: string; arch: string; status: "verified";
    archiveSha256: string; payloadSha256: string; source: string; method: "signed-shasums"; policyCommit: string; signer: string }) {
    const path = join(evidence, proof.id + ".json"); await writeFile(path, JSON.stringify(proof)); frozen.set(path, inputIdentity(path));
    const { method, id, version, platform, arch, status, archiveSha256, payloadSha256, source } = proof;
    origins.push({ id, version, platform, arch, status, archiveSha256, payloadSha256, source, verification: { method, receipt: inputIdentity(path), ...("sri" in proof ? { sri: proof.sri } : { policyCommit, signer: proof.signer }) } });
  }
  try {
    const policy = await get(`https://raw.githubusercontent.com/nodejs/node/${policyCommit}/README.md`, "signer-policy.md");
    assert.equal(sha(policy), policySHA, "pinned signer policy body");
    for (const signer of signers) assert.ok(policy.toString().includes('`' + signer + '`'), "missing pinned signer");
    const home = join(scratch, "gnupg"); await mkdir(home, { mode: 0o700 });
    for (const [id, version] of Object.entries({ "node20-minimum": "20.0.0", node20: "20.20.0", node24: "24.21.0", node26: "26.10.0" })) {
      const source = `https://nodejs.org/dist/v${version}/SHASUMS256.txt.asc`;
      await get(source, id + ".asc");
      const sum = join(evidence, id + ".sums"), args = ["--no-options", "--batch", "--no-auto-key-retrieve", "--homedir", home, "--no-default-keyring", "--keyring", keyring,
        "--status-fd", "2", "--decrypt", join(downloads, id + ".asc")];
      recheck(); const bindings = commandBindings(gpg, args);
      const verified: SpawnSyncReturns<string> = spawnSync(gpg, args, { env: environment, encoding: "utf8" });
      receipts.push({ command: [gpg, ...args], exitCode: verified.status, signal: verified.signal, error: String(verified.error ?? ""), stdout: verified.stdout, stderr: verified.stderr, bindings });
      recheck(); assert.equal(verified.error, undefined); assert.equal(verified.signal, null); const signer = signedRelease(verified.stderr, verified.status);
      await writeFile(sum, verified.stdout);
      assert.equal(inputIdentity(sum).sha256, sha(verified.stdout), "signed plaintext custody mismatch");
      frozen.set(sum, inputIdentity(sum));
      const root = `node-v${version}-${process.platform === "win32" ? "win" : process.platform}-${process.arch}`;
      const label = root + (process.platform === "win32" ? ".zip" : ".tar.gz");
      const lines = (await readFile(sum, "utf8")).split("\n").filter(line => line.endsWith("  " + label)); assert.equal(lines.length, 1, "missing exact signed distribution");
      const bytes = await get(`https://nodejs.org/dist/v${version}/${label}`, label); assert.equal(sha(bytes), lines[0]!.slice(0, 64), "signed distribution mismatch");
      const output = join(tools, id);
      if (process.platform === "win32") {
        const expectedFiles = zipInventory(bytes, root); const powershell = join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe");
        frozen.set(powershell, inputIdentity(powershell)); const target = join(scratch, id); await mkdir(target);
        const args = ["-NoProfile", "-NonInteractive", "-Command", 'Expand-Archive -LiteralPath $env.LIFECYCLE_ZIP -DestinationPath $env.LIFECYCLE_EXTRACT -ErrorAction Stop'];
        const env = { ...environment, LIFECYCLE_ZIP: join(downloads, label), LIFECYCLE_EXTRACT: target }, bindings = commandBindings(powershell, args, env);
        recheck(); const result = spawnSync(powershell, args, { env, encoding: "utf8" });
        receipts.push({ command: [powershell, ...args], exitCode: result.status, signal: result.signal, error: String(result.error ?? ""), stdout: result.stdout, stderr: result.stderr, bindings });
        recheck(); assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr);
        await cp(join(target, root), output, { recursive: true });
        assert.deepEqual(payload(output).map(row => root + "/" + row.path).sort(), expectedFiles, "zip/extracted inventory mismatch");
      } else { await extractPreparationArchive(tar, join(downloads, label), root, output); await cp(join(output, "bin/node"), join(output, "node")); }
      const binary = join(output, process.platform === "win32" ? "node.exe" : "node");
      seal(output); recheck(); const versionBindings = commandBindings(binary, ["--version"]);
      const result = spawnSync(binary, ["--version"], { env: environment, encoding: "utf8" });
      receipts.push({ command: [binary, "--version"], exitCode: result.status, signal: result.signal, error: String(result.error ?? ""), stdout: result.stdout, stderr: result.stderr, bindings: versionBindings });
      recheck(); assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0); assert.equal(result.stdout.trim(), "v" + version);
      await origin({ id, version, platform: process.platform, arch: process.arch, status: "verified", archiveSha256: sha(bytes), payloadSha256: sha(JSON.stringify(payload(output))), source, method: "signed-shasums", policyCommit, signer });
    }
    await origin(await provePackage("typescript-6.0.3", "6.0.3", join(tools, "typescript-6.0.3")));
    await origin(await provePackage("pnpm", "11.20.0", join(tools, "pnpm")));
    await origin(await provePackage("typescript-minimum", "5.8.3")); await origin(await provePackage("typescript", "7.0.2"));
    for (const [id, version] of Object.entries(packages)) support.push(await provePackage(id, version));
    const node24 = join(tools, "node24", process.platform === "win32" ? "node.exe" : "node");
    for (const [compiler, expected] of [[join(tools, "typescript-6.0.3/lib/tsc.js"), "Version 6.0.3"],
      [join(roots["typescript-minimum"]!, "bin/tsc"), "Version 5.8.3"], [join(roots.typescript!, "bin/tsc"), "Version 7.0.2"],
      [join(tools, "pnpm/bin/pnpm.mjs"), "11.20.0"]] as const) {
      recheck(); const bindings = { ...commandBindings(node24, [compiler, "--version"]), compiler: inputIdentity(compiler), environment,
        source: [frozen.get(fileURLToPath(import.meta.url)), frozen.get(join(workspace, "packages/lifecycle-kernel/tests/run-node20-qualification.mts"))] };
      const result = spawnSync(node24, [compiler, "--version"], { env: environment, encoding: "utf8" });
      receipts.push({ command: [node24, compiler, "--version"], exitCode: result.status, stdout: result.stdout, stderr: result.stderr, bindings });
      recheck(); assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0); assert.equal(result.stdout.trim(), expected);
    }
    verifyToolOrigins(origins, process.platform, process.arch);
    verifySupportOrigins(support, process.platform, process.arch, origins);
    const rows = [...graph.entries, ...support.flatMap(row => row.payloadProjection === undefined ? [] :
      verifyPackagePayload(workspace, roots[row.id]!, row, join(tools, "pnpm/dist/pnpm.mjs"), row.payloadProjection).inputs), ...["node20-minimum", "node20", "node24", "node26", "typescript-6.0.3", "pnpm"].flatMap(name => frozenInventory(join(tools, name), true))];
    const entries = preparedToolEntries(rows, workspace, tools);
    recheck(); await rm(scratch, { recursive: true }); await writeFile(manifest, JSON.stringify({ platform: process.platform, arch: process.arch, origins, support, entries })); terminal = "PASS";
    console.log(JSON.stringify({ manifest: resolve(manifest), sha256: inputIdentity(manifest).sha256, restoredClosureSha256: graph.sha256 }));
  } finally {
    let drift: string | undefined; try { recheck(); } catch (error) { terminal = "FAIL"; drift = String(error); }
    await writeFile(join(evidence, "preparation-result.json"), JSON.stringify({ terminal, drift, policyCommit, runId, sourceHash, sourceChunks, receipts, support,
      source: frozen.get(fileURLToPath(import.meta.url)), driver: frozen.get(join(workspace, "packages/lifecycle-kernel/tests/run-node20-qualification.mts")), verifier: frozen.get(resolve(gpg)), keyring: frozen.get(resolve(keyring)) }, null, 2));
    if (drift) throw new Error(drift);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) {
    const path = join(tmpdir(), `lifecycle-tool-preparation-refusal-${globalThis.crypto.randomUUID()}.json`);
    await writeFile(path, JSON.stringify({ terminal: "FAIL", error: String(error), command: process.argv,
      runtime: inputIdentity(process.execPath), source: inputIdentity(fileURLToPath(import.meta.url)),
      retainedPreparationEvidence: process.env.LIFECYCLE_PUBLIC_TOOL_ROOT ? resolve(process.env.LIFECYCLE_PUBLIC_TOOL_ROOT) + ".preparation-evidence" : null }));
    throw error;
  }
}
