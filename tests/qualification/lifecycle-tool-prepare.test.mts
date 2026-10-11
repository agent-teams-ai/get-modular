import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { gzipSync } from "node:zlib";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync, readFileSync, realpathSync, existsSync, readlinkSync, cpSync, chmodSync, lstatSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { join, dirname, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { preparedToolEntries, verifyPreparedPackagePayload, signedRelease, packageArchiveRoot, extractPreparationArchive, preparationPath } from "./lifecycle-tool-prepare.mts";
import { verifyToolEntryEnvelope, verifyToolClosureEntries, verifyPublicToolRoots, verifyPackagePayload, verifyPhysicalSupportPayload, projectPackagePayload, packagePayloadInventory, parseQualificationEvidenceJSON, verifySupportOrigins, supportVersions, restoredDependencyGraph, frozenInventory, nodeSignerPolicy, inputIdentity, verifyToolOrigins, freshPublishedManifest, verifyFreshArchivePayload, archiveEntryPath } from "./lifecycle-tool-prepare.mts";
import type { PreparedToolEntry, PackagePayloadProjection } from "./lifecycle-qualification-contracts.mts";

// Synthetic status/receipt fixtures test parsing and policy, never GPG or origin custody.
const commit = "ae5a0f40b5787a369b6cde39c36fb2760a4cd309";
const primaries = [
  "5BE8A3F6C8A5C01D106C0AD820B1A390B168D356", "DD792F5973C6DE52C432CBDAC77ABFA00DDBF2B7",
  "CC68F5A3106FF448322E48ED27F5E38D5B0A215F", "890C08DB8579162FEE0DF9DB8BEAB4DFCF555EF4",
  "C82FA3AE1CBEDC6BE46B9360C43CEC45C17AB93C", "108F52B48DB57BB0CC439B2997B01419BD92F80A",
  "655F3B5C1FB3FA8D1A0CA6BDE4A7D232B936D2FD", "A363A499291CBBC940DD62E41F10027AF002F8B0",
];
const removed = [
  "4ED778F539E3634C779C87C6D7062848A1AB005C", "141F07595B7B3FFE74309A937405533BE57C7D57",
  "74F12602B6F1C4E913FAA37AD3A89613643B6201", "8FCCA13FEF1D0C2E91008E09770F7A9A5AE15600",
  "C4F0DFFF4E8C1A8236409D08E73BC641CC11F4C8",
];
const primary = primaries[3]!, unknown = "F".repeat(40), subkey = "E".repeat(40);
const valid = (signing = primary, owner?: string) =>
  `[GNUPG:] VALIDSIG ${signing} 2026-09-22 1790035200 0 4 0 22 8 01${owner === undefined ? "" : " " + owner}\n`;

test("exact reviewed policy tuple and eight active primaries", () => {
  assert.deepEqual(nodeSignerPolicy, { commit, sha256: "86dfc824b89a2ae1d900bd4fa942b2c4d537747df4e3c47ed6eb3ef6995c80c8", signers: primaries });
});
test("accepts active primaries and verifier-reported primary binding", () => {
  for (const signer of primaries) assert.equal(signedRelease(valid(signer), 0), signer);
  assert.equal(signedRelease(valid(subkey, primary), 0), primary);
  assert.equal(signedRelease(valid(primary, primary).replaceAll("\n", "\r\n"), 0), primary);
  assert.equal(signedRelease(valid() + "[GNUPG:] TRUST_UNDEFINED 0 pgp\n", 0), primary);
});
test("rejects unknown, removed and unbound signing keys", () => {
  for (const signer of [unknown, subkey, ...removed]) assert.throws(() => signedRelease(valid(signer), 0), /signer outside pinned public policy/u);
  assert.throws(() => signedRelease(valid(primary, unknown), 0), /signer outside pinned public policy/u);
});
test("rejects null/nonzero exit, missing and multiple signatures", () => {
  for (const exit of [null, 1, 2]) assert.throws(() => signedRelease(valid(), exit), /signature verifier failed/u);
  for (const status of ["", "[GNUPG:] GOODSIG 1234 Name\n", valid() + valid(primaries[0]!)])
    assert.throws(() => signedRelease(status, 0), /missing or multiple release signatures/u);
});
test("rejects each failed, unknown, revoked or expired signature beside VALIDSIG", () => {
  for (const keyword of ["BADSIG", "ERRSIG", "NO_PUBKEY", "REVKEYSIG", "EXPKEYSIG", "EXPSIG"])
    for (const status of [`[GNUPG:] ${keyword} 1234\n`, valid() + `[GNUPG:] ${keyword} 1234\n`])
      assert.throws(() => signedRelease(status, 0), /rejected release signature/u, keyword);
});
test("rejects malformed documented VALIDSIG fields without primary fallback", () => {
  const malformed = [
    `[GNUPG:] VALIDSIG ${primary} garbage\n`,
    valid().replace("2026-09-22", "not-a-date"), valid().replace("1790035200", "NaN"),
    valid().replace(" 0 4 0 ", " never 4 0 "), valid().replace(" 4 0 22 ", " four 0 22 "),
    valid().replace(" 4 0 22 ", " 4 reserved 22 "), valid().replace(" 22 8 ", " algo 8 "),
    valid().replace(" 22 8 ", " 22 hash "), valid().replace(" 01\n", " class\n"),
    valid(subkey, primary).replace(primary, "invalid-primary"), valid().trimEnd() + " unexpected-tail\n",
    valid().trimEnd() + ` extra ${primary}\n`, valid().replace(primary, primary.toLowerCase()),
  ];
  for (const status of malformed) assert.throws(() => signedRelease(status, 0), /malformed release signature/u, status);
  assert.throws(() => signedRelease(valid() + `[GNUPG:] VALIDSIG ${unknown}\n`, 0), /missing or multiple release signatures/u);
});
test("rejects stale origin policy and removed signer with matching receipt bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "lifecycle-policy-parser-"));
  try {
    const fixtures = (policy = commit, signer = primary): Parameters<typeof verifyToolOrigins>[0] =>
      Object.entries({ "node20-minimum": "20.0.0", node20: "20.20.0", node24: "24.21.0", node26: "26.10.0",
        "typescript-minimum": "5.8.3", "typescript-6.0.3": "6.0.3", typescript: "7.0.2", pnpm: "11.20.0" }).map(([id, version]) => {
        const node = id.startsWith("node"), method = node ? "signed-shasums" as const : "package-sri" as const;
        const row = { id, version, platform: "linux", arch: "x64", status: "verified" as const,
          archiveSha256: "a".repeat(64), payloadSha256: "b".repeat(64),
          source: node ? `https://nodejs.org/dist/v${version}/SHASUMS256.txt.asc` : `https://registry.npmjs.org/${id.startsWith("typescript") ? "typescript" : "pnpm"}/${version}` };
        const authorization = node ? { policyCommit: policy, signer } : { sri: "sha512-" + "A".repeat(86) + "==" };
        const proof = { ...row, method, ...authorization };
        const path = join(root, id + ".json"); writeFileSync(path, JSON.stringify(proof));
        return { ...row, verification: { method, receipt: inputIdentity(path), ...authorization } };
      });
    assert.throws(() => verifyToolOrigins(fixtures("e7618fb5a5fc25d76b6474e2a6607f04fd6f10e0"), "linux", "x64"), /unpinned signer policy/u);
    verifyToolOrigins(fixtures(), "linux", "x64");
    for (const signer of removed) assert.throws(() => verifyToolOrigins(fixtures(commit, signer), "linux", "x64"), /signer outside pinned public policy/u);
  } finally { rmSync(root, { recursive: true }); }
});

// Filesystem resolver fixtures, independent of pnpm store naming and graph code.
// Removing the declaring-package resolver breaks the no-root-transitive baseline;
// bypassing identity, containment, duplicate equality or the cap breaks rejection.
const native = `@typescript/typescript-${process.platform}-${process.arch}`;
const identities: Record<string, string> = { typescript: "7.0.2", "typescript-minimum": "5.8.3", tar: "7.5.22",
  "@types/node": "24.19.1", "@agent-teams/engineering-foundation": "1.7.2", [native]: "7.0.2",
  "@isaacs/fs-minipass": "4.0.1", chownr: "3.0.0", minipass: "7.1.3", minizlib: "3.1.0", yallist: "5.0.0", "undici-types": "7.24.6" };
const edges: Record<string, string[]> = { tar: ["@isaacs/fs-minipass", "chownr", "minipass", "minizlib", "yallist"],
  "@isaacs/fs-minipass": ["minipass"], minizlib: ["minipass"], "@types/node": ["undici-types"] };
function resolverFixture(body: (workspace: string, roots: Record<string, string>, pkg: (name: string, label: string, dependencies?: string[]) => string,
  link: (name: string, target: string, from?: string) => void) => void): void {
  const workspace = mkdtempSync(join(tmpdir(), "lifecycle-resolver-"));
  const roots: Record<string, string> = {};
  const pkg = (name: string, label: string, dependencies = edges[name] ?? []): string => {
    const root = join(workspace, "node_modules/store", label, "package"); mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: name === "typescript-minimum" ? "typescript" : name,
      version: identities[name], dependencies: Object.fromEntries(dependencies.map(id => [id, "*"])) }));
    writeFileSync(join(root, "payload.txt"), "independent fixture payload"); return root;
  };
  const link = (name: string, target: string, from?: string): void => {
    const path = join(from ? dirname(from) : workspace, "node_modules", name);
    mkdirSync(dirname(path), { recursive: true }); rmSync(path, { force: true });
    symlinkSync(process.platform === "win32" ? target : relative(dirname(path), target), path, process.platform === "win32" ? "junction" : "dir");
  };
  try {
    writeFileSync(join(workspace, "package.json"), "{}");
    for (const name of Object.keys(identities)) roots[name] = pkg(name, name.replaceAll("/", "-"));
    for (const name of ["typescript", "typescript-minimum", "tar", "@types/node", "@agent-teams/engineering-foundation"]) link(name, roots[name]!);
    link(native, roots[native]!, roots.typescript!);
    for (const [name, dependencies] of Object.entries(edges)) for (const id of dependencies) link(id, roots[id]!, roots[name]!);
    body(workspace, roots, pkg, link);
  } finally { rmSync(workspace, { recursive: true }); }
}
test("declaring resolvers discover every identity and seal equivalent duplicate roots deterministically", () => resolverFixture((workspace, roots, pkg, link) => {
  assert.throws(() => createRequire(join(workspace, "package.json")).resolve("@isaacs/fs-minipass/package.json"), { code: "MODULE_NOT_FOUND" });
  const duplicate = pkg("minipass", "duplicate"); link("minipass", duplicate, roots.minizlib!);
  const graph = restoredDependencyGraph(workspace, process.platform, process.arch);
  assert.deepEqual(Object.keys(graph.roots).sort(), Object.keys(identities).sort());
  assert.equal(graph.inventories.size, 13);
  assert.ok(graph.entries.some(row => row.path === join(duplicate, "payload.txt")));
  for (const [id, root] of Object.entries(graph.roots)) assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, identities[id]);
  assert.deepEqual(graph, restoredDependencyGraph(workspace, process.platform, process.arch));
  assert.equal(graph.sha256, createHash("sha256").update(JSON.stringify(graph.restored)).digest("hex"));
}));
test("rejects wrong direct and transitive names or versions", () => {
  for (const id of ["typescript-minimum", "@isaacs/fs-minipass"]) for (const field of ["name", "version"]) resolverFixture((workspace, roots) => {
    const path = join(roots[id]!, "package.json"), metadata = JSON.parse(readFileSync(path, "utf8")); metadata[field] = "wrong";
    writeFileSync(path, JSON.stringify(metadata));
    assert.throws(() => restoredDependencyGraph(workspace, process.platform, process.arch), field === "name" ? /restored package name/u : /restored package version/u);
  });
});
test("rejects a missing declaring-resolver payload", () => resolverFixture((workspace, roots) => {
  rmSync(join(dirname(roots.tar!), "node_modules/@isaacs/fs-minipass"));
  assert.throws(() => restoredDependencyGraph(workspace, process.platform, process.arch), { code: "MODULE_NOT_FOUND" });
}));
test("rejects missing support identity and unsupported declared edge", () => resolverFixture((workspace, roots) => {
  const path = join(roots.tar!, "package.json"), metadata = JSON.parse(readFileSync(path, "utf8"));
  delete metadata.dependencies.yallist; writeFileSync(path, JSON.stringify(metadata));
  assert.throws(() => restoredDependencyGraph(workspace, process.platform, process.arch), /missing restored package/u);
  metadata.dependencies.unreviewed = "*"; writeFileSync(path, JSON.stringify(metadata));
  assert.throws(() => restoredDependencyGraph(workspace, process.platform, process.arch), /unsupported restored dependency: unreviewed/u);
}));
test("rejects external realpaths and unequal duplicate payloads", () => {
  resolverFixture((workspace, roots, _pkg, link) => {
    const outside = join(workspace, "external"); mkdirSync(outside); writeFileSync(join(outside, "package.json"), JSON.stringify({ name: "minipass", version: "7.1.3" }));
    link("minipass", outside, roots.minizlib!);
    assert.throws(() => restoredDependencyGraph(workspace, process.platform, process.arch), /restored resolver escape/u);
  });
  resolverFixture((workspace, roots, pkg, link) => {
    const duplicate = pkg("minipass", "different"); writeFileSync(join(duplicate, "payload.txt"), "different bytes"); link("minipass", duplicate, roots.minizlib!);
    assert.throws(() => restoredDependencyGraph(workspace, process.platform, process.arch), /multiple restored payload mismatch/u);
  });
});
test("finite cycles terminate and the 65th equivalent resolver root is rejected", () => {
  // Each graph has a fresh resolver namespace: Node caches resolved symlink paths.
  for (const count of [0, 52, 53]) resolverFixture((workspace, roots, pkg, link) => {
    for (const [name, dependency] of [["chownr", "yallist"], ["yallist", "chownr"]]) {
      const metadata = JSON.parse(readFileSync(join(roots[name!]!, "package.json"), "utf8")); metadata.dependencies = { [dependency!]: "*" };
      writeFileSync(join(roots[name!]!, "package.json"), JSON.stringify(metadata)); link(dependency!, roots[dependency!]!, roots[name!]!);
    }
    let previous = roots.yallist!;
    for (let index = 0; index < count; index++) {
      const name = index % 2 === 0 ? "chownr" : "yallist", dependency = name === "chownr" ? "yallist" : "chownr";
      const root = pkg(name, "chain-" + index, [dependency]); link(name, root, previous); previous = root;
    }
    if (count > 0) link(count % 2 === 0 ? "chownr" : "yallist", roots[count % 2 === 0 ? "chownr" : "yallist"]!, previous);
    if (count === 53) assert.throws(() => restoredDependencyGraph(workspace, process.platform, process.arch), /finite restored resolver closure/u);
    else assert.equal(restoredDependencyGraph(workspace, process.platform, process.arch).inventories.size, 12 + count);
  });
});
// Opt-in canonical proof reads the supplied ordinary frozen graph without copying,
// installing or relinking it. Its receipt remains distinct from synthetic fixtures.
test("canonical frozen pnpm graph has no transitive root alias and resolves unchanged bytes", { skip: !process.env.LIFECYCLE_FROZEN_RESOLVER_WORKSPACE }, () => {
  const workspace = resolve(process.env.LIFECYCLE_FROZEN_RESOLVER_WORKSPACE!);
  assert.throws(() => createRequire(join(workspace, "package.json")).resolve("@isaacs/fs-minipass/package.json"), { code: "MODULE_NOT_FOUND" });
  const graph = restoredDependencyGraph(workspace, process.platform, process.arch);
  assert.deepEqual(Object.keys(graph.roots).sort(), Object.keys(identities).sort());
  assert.equal(graph.inventories.size, 12);
  // Independent finite oracle for this supplied graph, not another traversal.
  const anchor = createRequire(join(workspace, "package.json"));
  const locate = (resolver: NodeJS.Require, id: string): string => dirname(realpathSync(resolver.resolve(id + "/package.json")));
  const expectedRoots: Record<string, string> = {};
  for (const id of ["typescript", "typescript-minimum", "tar", "@types/node", "@agent-teams/engineering-foundation"]) expectedRoots[id] = locate(anchor, id);
  const tar = createRequire(join(expectedRoots.tar!, "package.json"));
  for (const id of ["@isaacs/fs-minipass", "chownr", "minipass", "minizlib", "yallist"]) expectedRoots[id] = locate(tar, id);
  expectedRoots["undici-types"] = locate(createRequire(join(expectedRoots["@types/node"]!, "package.json")), "undici-types");
  expectedRoots[native] = locate(createRequire(join(expectedRoots.typescript!, "package.json")), native);
  assert.deepEqual(graph.roots, expectedRoots);
  for (const id of ["@isaacs/fs-minipass", "minizlib"]) assert.equal(locate(createRequire(join(expectedRoots[id]!, "package.json")), "minipass"), expectedRoots.minipass);
  const expectedEntries = Object.values(expectedRoots).flatMap(root => frozenInventory(root, true)).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert.deepEqual(graph.entries, expectedEntries);
  const expectedRestored = expectedEntries.map(row => ({ ...row, path: relative(workspace, row.path).split(process.platform === "win32" ? "\\" : "/").join("/"),
    realpath: relative(workspace, row.realpath).split(process.platform === "win32" ? "\\" : "/").join("/") }));
  assert.deepEqual(graph.restored, expectedRestored);
  assert.equal(graph.sha256, createHash("sha256").update(JSON.stringify(expectedRestored)).digest("hex"));
  console.log(JSON.stringify({ classification: "ordinary frozen canonical graph", roots: graph.inventories.size, files: graph.entries.length, restoredClosureSha256: graph.sha256 }));
  for (const [id, root] of Object.entries(graph.roots)) {
    const metadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    assert.equal(metadata.name, id === "typescript-minimum" ? "typescript" : id); assert.equal(metadata.version, identities[id]);
  }
  assert.deepEqual(graph, restoredDependencyGraph(workspace, process.platform, process.arch));
});

// The retained npm archive catches the package-root regression; malformed tar
// headers catch guards before extraction. A thrown event callback cannot reach finally.
const tar = createRequire(import.meta.url)("tar") as Parameters<typeof extractPreparationArchive>[0] & {
  x(options: { file: string; cwd: string; strip: number; strict: boolean; preserveOwner?: boolean }): Promise<void>;
  t(options: { file: string; strict: boolean; onReadEntry: (entry: Entry) => void }): Promise<void>;
  Header: new (data: { path: string; type: string; size: number; linkpath?: string }) => { encode(bytes: Buffer): boolean };
};
// This sandbox cannot chown the archive's uid 1001. Only fixture extraction
// omits ownership restoration; production options and byte/link checks stay exact.
const fixtureTar = { t: tar.t, x: (options: Parameters<typeof tar.x>[0]) => tar.x({ ...options, preserveOwner: false }) };
const archiveInputs = process.env.LIFECYCLE_ARCHIVE_INPUTS;
test("retained @types/node archive uses the exact pinned root and matches every payload byte", { skip: !archiveInputs }, async () => {
  const path = join(archiveInputs!, "@types-node.tgz"), bytes = readFileSync(path);
  const metadataBytes = readFileSync(join(archiveInputs!, "@types-node-metadata.json"));
  const hash = (input: Buffer) => createHash("sha256").update(input).digest("hex");
  assert.equal(bytes.length, 474801);
  assert.equal(hash(bytes), "4605482935b2a8c26c53c7637fbc20665e49f9b0b6dc0db50449500e86727a82");
  assert.equal(hash(metadataBytes), "8f9116d88252170cc673621038f51e9214e56bfb1c62a1e2fd1d79f461e3fd36");
  const metadata = JSON.parse(metadataBytes.toString());
  assert.equal(metadata.name, "@types/node"); assert.equal(metadata.version, "24.19.1");
  assert.equal("sha512-" + createHash("sha512").update(bytes).digest("base64"), metadata.dist.integrity);
  const members: { path: string; type: string }[] = [];
  await tar.t({ file: path, strict: true, onReadEntry: entry => { members.push({ path: entry.path, type: entry.type }); } });
  assert.equal(members.length, 88); assert.equal(members.filter(row => row.type === "File").length, 75);
  assert.equal(members.filter(row => row.type === "Directory").length, 13);
  assert.ok(members.every(row => row.path === "node v24.19/" || row.path.startsWith("node v24.19/")));
  const root = mkdtempSync(join(tmpdir(), "lifecycle-retained-archive-"));
  try {
    await extractPreparationArchive(fixtureTar, path, packageArchiveRoot(metadata.name, metadata.version), join(root, "payload"));
    assert.equal(frozenInventory(join(root, "payload"), true).length, 75);
    assert.equal(JSON.parse(readFileSync(join(root, "payload/package.json"), "utf8")).version, "24.19.1");
  } finally { rmSync(root, { recursive: true }); }
});
test("other pinned package versions retain package root and shared path guards", () => {
  for (const [id, version] of [["@types/node", "24.19.2"], ["typescript", "6.0.3"], ["pnpm", "11.20.0"]]) {
    assert.equal(packageArchiveRoot(id!, version!), "package");
    assert.throws(() => preparationPath("node v24.19/index.d.ts", packageArchiveRoot(id!, version!)), /archive root/u);
  }
  for (const path of ["/node v24.19/x", "node v24.19/../x", "node v24.19/./x", "node v24.19/a\\b", "node v24.19/a\0b", "node v24.19/CON", "node v24.19/x."])
    assert.throws(() => preparationPath(path, "node v24.19"));
});
test("tar guards reject before writes and awaited refusals retain durable FAIL", async () => {
  const cases: [string[], string, string?][] = [
    [["unexpected/x"], "File"], [["node v24.19/x", "package/x"], "File"],
    [["node v24.19/../x"], "File"], [["node v24.19/x", "node v24.19/x"], "File"],
    [["node v24.19/x"], "Link", "node v24.19/y"], [["node v24.19/x"], "SymbolicLink", "../../outside"],
  ];
  const expected = [/archive root/u, /archive root/u, /traversal/u, /duplicate archive path/u, /unsupported preparation archive kind/u, /traversal/u];
  const root = mkdtempSync(join(tmpdir(), "lifecycle-archive-refusal-"));
  try {
    for (const [index, [paths, type, linkpath]] of cases.entries()) {
      const chunks = paths.map(path => {
        const header = Buffer.alloc(512);
        assert.equal(new tar.Header({ path, type, size: 0, ...(linkpath === undefined ? {} : { linkpath }) }).encode(header), false);
        return header;
      });
      const archive = join(root, index + ".tar"), output = join(root, index + "-payload"), evidence = join(root, index + "-evidence");
      writeFileSync(archive, Buffer.concat([...chunks, Buffer.alloc(1024)])); mkdirSync(evidence);
      let terminal = "FAIL", failure = "";
      await assert.rejects(async () => {
        try { await extractPreparationArchive(tar, archive, "node v24.19", output); terminal = "PASS"; }
        catch (error) { failure = String(error); throw error; }
        finally { writeFileSync(join(evidence, "preparation-result.json"), JSON.stringify({ terminal, failure })); }
      }, expected[index]!);
      assert.equal(existsSync(output), false);
      const result = JSON.parse(readFileSync(join(evidence, "preparation-result.json"), "utf8"));
      assert.equal(result.terminal, "FAIL"); assert.match(result.failure, expected[index]!);
      console.log(JSON.stringify({ archiveRefusal: index, result }));
    }
  } finally { rmSync(root, { recursive: true }); }
});

// A data/end-only reader hangs or loses errors on these schedules. Real tar
// entries cover Minipass destruction without close; EventEmitter covers explicit
// close/abort and ordering at the seam, not their occurrence in a good archive.
type Reader = Parameters<typeof extractPreparationArchive>[0];
type Entry = Parameters<Parameters<Reader["t"]>[0]["onReadEntry"]>[0];
class ScheduledEntry extends EventEmitter implements Entry {
  path = "node v24.19/file";
  type = "File";
  linkpath = "";
  destroyed = false;
  emittedEnd = false;
  destroy(error = new Error("stream destroyed")): this { this.destroyed = true; this.emit("error", error); return this; }
  override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (event === "end") this.emittedEnd = true;
    return super.emit(event, ...args);
  }
  promise(): Promise<void> {
    return new Promise((yes, no) => { this.on("end", yes); this.on("error", no); });
  }
}
// Controlled listing events isolate entry lifetime and ordering. The real-parser
// tests below separately exercise parser abort and file descriptor closure.
function scheduledListing(options: Parameters<Reader["t"]>[0], schedule: (onEntry: (entry: Entry) => void) => Promise<void>): ReturnType<Reader["t"]> {
  class Listing extends Writable {
    override _write(_data: Buffer, _encoding: BufferEncoding, done: (error?: Error | null) => void): void { done(); }
    override _final(done: (error?: Error | null) => void): void {
      void schedule(options.onReadEntry).then(() => { this.emit("end"); done(); }, error => { this.emit("error", error); done(); });
    }
    abort(error: Error): void { this.emit("error", error); }
  }
  return new Listing();
}
async function refusedSchedule(label: string, schedule: (onEntry: (entry: Entry) => void) => Promise<void>, expected: RegExp) {
  const root = mkdtempSync(join(tmpdir(), "lifecycle-entry-" + label + "-"));
  const output = join(root, "payload"), resultPath = join(root, "preparation-result.json");
  let writes = 0, terminal = "FAIL", failure = "";
  const archive = join(root, "controlled.tar"); writeFileSync(archive, "");
  const reader: Reader = { t: options => scheduledListing(options, schedule), x: async () => { writes++; } };
  await assert.rejects(async () => {
    try { await extractPreparationArchive(reader, archive, "node v24.19", output); terminal = "PASS"; }
    catch (error) { failure = String(error); throw error; }
    finally { writeFileSync(resultPath, JSON.stringify({ terminal, failure })); }
  }, expected);
  assert.equal(writes, 0); assert.equal(existsSync(output), false);
  const result = JSON.parse(readFileSync(resultPath, "utf8"));
  assert.equal(result.terminal, "FAIL"); assert.match(result.failure, expected);
  console.log(JSON.stringify({ controlledLifetime: label, root, result }));
}
for (const event of ["error", "close", "aborted"] as const) {
  test("entry lifetime rejects " + event + " after listing with durable FAIL", { timeout: 2000 }, async () => {
    await refusedSchedule(event, async onEntry => {
      const entry = new ScheduledEntry(); onEntry(entry);
      setImmediate(() => {
        entry.emit("data", Buffer.from("partial"));
        if (event === "error") entry.emit(event, new Error("entry-error-first"));
        else entry.emit(event);
        // Later completion must not qualify a partial hash or replace failure.
        entry.emit("end"); entry.emit("error", new Error("later-entry-error"));
      });
    }, event === "error" ? /entry-error-first/u : /incomplete preparation archive entry/u);
  });
}
test("pending earlier file settles on validation refusal and preserves first root over listing rejection", { timeout: 2000 }, async () => {
  for (const rejectListing of [false, true]) await refusedSchedule("pending-root-" + rejectListing, async onEntry => {
    onEntry(new ScheduledEntry());
    const invalid = new ScheduledEntry(); invalid.path = "unexpected/x"; onEntry(invalid);
    if (rejectListing) throw new Error("listing-error-later");
  }, /preparation archive root/u);
});
test("pending hashes settle on listing rejection", { timeout: 2000 }, async () => {
  await refusedSchedule("listing", async onEntry => { onEntry(new ScheduledEntry()); throw new Error("listing-error-first"); }, /listing-error-first/u);
});
test("entry error remains first before validation and listing refusals", { timeout: 2000 }, async () => {
  await refusedSchedule("error-order", async onEntry => {
    const entry = new ScheduledEntry(); onEntry(entry); entry.emit("error", new Error("entry-error-first"));
    const invalid = new ScheduledEntry(); invalid.path = "unexpected/x"; onEntry(invalid);
    throw new Error("listing-error-later");
  }, /entry-error-first/u);
});
test("data callback failures reject through awaited flow", { timeout: 2000 }, async () => {
  await refusedSchedule("data-error", async onEntry => {
    const entry = new ScheduledEntry(); onEntry(entry);
    // EventEmitter accepts arbitrary data. The declared byte stream contract is
    // intentionally broken here to exercise hash.update's actual rejecting path.
    entry.emit("data", {}); entry.emit("end");
  }, /data.*argument|instance of Buffer/iu);
});
const readEntryTar = tar as typeof tar & {
  ReadEntry: new (header: InstanceType<typeof tar.Header>) => Entry & {
    write(bytes: Buffer): unknown; end(): unknown; destroy(error?: Error): unknown;
    emit(event: string, ...args: unknown[]): boolean;
  };
};
test("actual tar Minipass destroy without close rejects incomplete hashes", { timeout: 2000 }, async () => {
  for (const alreadyDestroyed of [false, true]) await refusedSchedule("minipass-destroy-" + alreadyDestroyed, async onEntry => {
    const entry = new readEntryTar.ReadEntry(new tar.Header({ path: "node v24.19/file", type: "File", size: 512 }));
    let closed = false, ended = false;
    entry.on("close", () => { closed = true; }); entry.on("end", () => { ended = true; });
    if (alreadyDestroyed) entry.destroy();
    onEntry(entry);
    if (!alreadyDestroyed) { entry.write(Buffer.from("partial")); entry.destroy(); }
    assert.equal(entry.destroyed, true); assert.equal(closed, false); assert.equal(ended, false);
  }, alreadyDestroyed ? /incomplete preparation archive entry/u : /stream destroyed/u);
});
test("actual tar entry normal end hashes all bytes once despite later close", async () => {
  const root = mkdtempSync(join(tmpdir(), "lifecycle-entry-success-")), output = join(root, "payload");
  const bytes = Buffer.from("normal complete bytes");
  const reader: Reader = {
    t: options => scheduledListing(options, async onEntry => {
      const entry = new readEntryTar.ReadEntry(new tar.Header({ path: "node v24.19/file", type: "File", size: bytes.length }));
      onEntry(entry); entry.write(bytes); entry.end(); entry.emit("close");
    }),
    x: async () => { writeFileSync(join(output, "file"), bytes); },
  };
  const archive = join(root, "controlled.tar"); writeFileSync(archive, "");
  await extractPreparationArchive(reader, archive, "node v24.19", output);
  assert.deepEqual(readFileSync(join(output, "file")), bytes);
});
test("genuine malformed tar retains root refusal before TAR_BAD_ARCHIVE", { timeout: 2000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "lifecycle-malformed-order-"));
  const first = Buffer.alloc(512), second = Buffer.alloc(512);
  new tar.Header({ path: "unexpected/x", type: "File", size: 0 }).encode(first);
  new tar.Header({ path: "node v24.19/file", type: "File", size: 4096 }).encode(second);
  const archive = join(root, "malformed.tar"), output = join(root, "payload");
  writeFileSync(archive, Buffer.concat([first, second, Buffer.from("truncated")]));
  await assert.rejects(tar.t({ file: archive, strict: true, onReadEntry: () => {} }), /TAR_BAD_ARCHIVE/u);
  let failure = "";
  try { await assert.rejects(extractPreparationArchive(tar, archive, "node v24.19", output), error => {
    failure = String(error); return /preparation archive root/u.test(failure);
  }); } finally { writeFileSync(join(root, "preparation-result.json"), JSON.stringify({ terminal: "FAIL", failure })); }
  assert.equal(existsSync(output), false); assert.match(failure, /preparation archive root/u);
  console.log(JSON.stringify({ genuineMalformedTar: root, failure }));
});
test("extraction failure and payload mismatch retain unqualified partial destinations", async () => {
  const root = mkdtempSync(join(tmpdir(), "lifecycle-partial-extraction-"));
  const header = Buffer.alloc(512), bytes = Buffer.from("expected");
  new tar.Header({ path: "node v24.19/file", type: "File", size: bytes.length }).encode(header);
  const archive = join(root, "valid.tar");
  writeFileSync(archive, Buffer.concat([header, bytes, Buffer.alloc(512 - bytes.length), Buffer.alloc(1024)]));
  for (const failExtraction of [true, false]) {
    const output = join(root, "payload-" + failExtraction);
    const reader: Reader = { t: fixtureTar.t, x: async options => {
      if (failExtraction) { writeFileSync(join(options.cwd, "partial"), "failed partial bytes"); throw new Error("extraction-failure"); }
      await fixtureTar.x(options); writeFileSync(join(options.cwd, "file"), "changed bytes");
    } };
    await assert.rejects(extractPreparationArchive(reader, archive, "node v24.19", output), failExtraction ? /extraction-failure/u : /archive\/extracted payload mismatch/u);
    assert.equal(existsSync(output), true);
    assert.equal(readFileSync(join(output, failExtraction ? "partial" : "file"), "utf8"), failExtraction ? "failed partial bytes" : "changed bytes");
  }
});

test("actual Minipass destruction is first before synchronous root and listing refusals", { timeout: 2000 }, async () => {
  await refusedSchedule("destroy-order", async onEntry => {
    const entry = new readEntryTar.ReadEntry(new tar.Header({ path: "node v24.19/file", type: "File", size: 512 }));
    onEntry(entry); entry.destroy();
    const invalid = new ScheduledEntry(); invalid.path = "unexpected/x"; onEntry(invalid);
    throw new Error("listing-error-later");
  }, /stream destroyed/u);
});

test("listing refusal observes late pending entry errors without replacing its first failure", { timeout: 2000 }, async () => {
  await refusedSchedule("listing-late-error", async onEntry => {
    const entry = new ScheduledEntry(); onEntry(entry);
    setImmediate(() => entry.emit("error", new Error("late-pending-entry-error")));
    throw new Error("listing-error-first");
  }, /listing-error-first/u);
  // Force late delivery before the test completes. Missing error observation is
  // an uncaught exception on the old reader, even though listing already failed.
  await new Promise<void>(yes => setImmediate(yes));
});

function allKindArchive(path: string, compressed = false): void {
  const bytes = Buffer.from("all-kind file bytes");
  const rows = [
    { path: "node v24.19/", type: "Directory", size: 0 },
    { path: "node v24.19/file", type: "File", size: bytes.length },
    { path: "node v24.19/link", type: "SymbolicLink", size: 0, linkpath: "file" },
  ];
  const chunks: Buffer[] = [];
  for (const row of rows) {
    const header = Buffer.alloc(512); new tar.Header(row).encode(header); chunks.push(header);
    if (row.size) chunks.push(bytes, Buffer.alloc(512 - bytes.length));
  }
  const archive = Buffer.concat([...chunks, Buffer.alloc(1024)]);
  writeFileSync(path, compressed ? gzipSync(archive) : archive);
}
for (const kind of ["File", "Directory", "SymbolicLink"]) {
  test("genuine owned parser unwinds destroyed " + kind + " and closes its reader", { timeout: 2000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "lifecycle-owned-parser-" + kind + "-"));
    const archive = join(root, "valid.tgz"), output = join(root, "payload"); allKindArchive(archive, true);
    let writes = 0, aborts = 0, parserErrors = 0, readerClosed = false;
    let reader: import("node:fs").ReadStream | undefined;
    let listing: ReturnType<Reader["t"]> | undefined, destroyedEntry: Entry | undefined;
    let entryFailure = "", entryEnded = false, entryClosed = false;
    const readerTar: Reader = {
      t: options => {
        const parser = tar.t({ ...options, onReadEntry: entry => {
          options.onReadEntry(entry);
          if (entry.type === kind) {
            destroyedEntry = entry;
            void entry.promise().catch(error => { entryFailure = String(error); });
            entry.on("end", () => { entryEnded = true; }); entry.on("close", () => { entryClosed = true; });
            entry.destroy();
          }
        } });
        listing = parser;
        parser.on("pipe", (source: import("node:fs").ReadStream) => { reader = source; source.on("close", () => { readerClosed = true; }); });
        parser.on("abort", () => { aborts++; }); parser.on("error", () => { parserErrors++; });
        return parser;
      },
      x: async () => { writes++; },
    };
    await assert.rejects(extractPreparationArchive(readerTar, archive, "node v24.19", output), /stream destroyed/u);
    assert.equal(writes, 0); assert.equal(existsSync(output), false);
    assert.equal(readerClosed, true); assert.equal(reader?.closed, true); assert.equal(reader?.destroyed, true); assert.equal(reader ? Reflect.get(reader, "fd") : undefined, null);
    assert.equal(aborts, 1); assert.ok(parserErrors >= 1); assert.match(entryFailure, /stream destroyed/u);
    assert.equal(entryEnded, false); assert.equal(entryClosed, false);
    // Public late errors remain observed after the refusal has closed resources.
    listing?.emit("error", new Error("late-owned-listing-error"));
    destroyedEntry?.destroy(new Error("late-owned-entry-error"));
    await new Promise<void>(yes => setImmediate(yes));
    writeFileSync(join(root, "owned-resource-result.json"), JSON.stringify({ kind, writes, aborts, parserErrors, readerClosed, fd: reader ? Reflect.get(reader, "fd") : undefined, entryFailure, entryEnded, entryClosed }));
  });
}
for (const compressed of [false, true]) {
  test("genuine all-kind completion retains bytes and link with closed reader " + compressed, async () => {
    const root = mkdtempSync(join(tmpdir(), "lifecycle-all-kind-")), archive = join(root, compressed ? "valid.tgz" : "valid.tar"), output = join(root, "payload");
    allKindArchive(archive, compressed);
    let readerClosed = false, parserClosed = false, aborts = 0;
    const readerTar: Reader = {
      t: options => { const parser = tar.t(options);
        parser.on("pipe", (source: import("node:fs").ReadStream) => source.on("close", () => { readerClosed = true; }));
        parser.on("close", () => { parserClosed = true; }); parser.on("abort", () => { aborts++; }); return parser; },
      x: fixtureTar.x,
    };
    await extractPreparationArchive(readerTar, archive, "node v24.19", output);
    assert.equal(readFileSync(join(output, "file"), "utf8"), "all-kind file bytes");
    assert.equal(readlinkSync(join(output, "link")), "file");
    assert.equal(readerClosed, true); assert.equal(parserClosed, true); assert.equal(aborts, 0);
  });
}
for (const kind of ["Directory", "SymbolicLink"]) {
  test("fulfilled controlled listing refuses destroyed " + kind + " before writes", { timeout: 2000 }, async () => {
    await refusedSchedule("fulfilled-" + kind, async onEntry => {
      const file = new readEntryTar.ReadEntry(new tar.Header({ path: "node v24.19/file", type: "File", size: 0 }));
      onEntry(file); file.end();
      const entry = new readEntryTar.ReadEntry(new tar.Header({ path: "node v24.19/" + (kind === "Directory" ? "dir/" : "link"), type: kind, size: 0, linkpath: "file" }));
      onEntry(entry); entry.destroy();
    }, /stream destroyed/u);
  });
}
for (const later of ["error", "data", "close", "aborted", "end"] as const) {
  test("earlier silent destruction precedes later synchronous " + later + " callback", { timeout: 2000 }, async () => {
    await refusedSchedule("first-destroy-" + later, async onEntry => {
      const first = new readEntryTar.ReadEntry(new tar.Header({ path: "node v24.19/first", type: "File", size: 512 }));
      const second = new readEntryTar.ReadEntry(new tar.Header({ path: "node v24.19/second", type: "File", size: 512 }));
      onEntry(first); onEntry(second); first.destroy();
      if (later === "error") second.destroy(new Error("later-second-entry-error"));
      else if (later === "data") second.emit("data", {});
      else if (later === "end") second.end();
      else second.emit(later);
    }, /stream destroyed/u);
  });
}
test("entry listener registration refusal settles owned lifetime and observes late errors", { timeout: 2000 }, async () => {
  await refusedSchedule("registration", async onEntry => {
    class RegistrationEntry extends ScheduledEntry {
      override on(event: string | symbol, callback: Parameters<EventEmitter["on"]>[1]): this {
        if (event === "data") throw new Error("listener-registration-first");
        return super.on(event, callback);
      }
    }
    const entry = new RegistrationEntry(); onEntry(entry);
    setImmediate(() => entry.emit("error", new Error("late-registration-error")));
    throw new Error("late-listing-error");
  }, /listener-registration-first/u);
  await new Promise<void>(yes => setImmediate(yes));
});

 test("owned reader opening failure aborts parser and closes before refusal returns", async () => {
  const root = mkdtempSync(join(tmpdir(), "lifecycle-owned-open-error-")), output = join(root, "payload");
  let closed = false, aborts = 0, writes = 0;
  const readerTar: Reader = { t: options => {const parser = tar.t(options);
    parser.on("pipe", (source: import("node:fs").ReadStream) => source.on("close", () => {closed = true;}));
    parser.on("abort", () => {aborts++;}); return parser;}, x: async () => {writes++;} };
  await assert.rejects(extractPreparationArchive(readerTar, join(root, "missing.tar"), "node v24.19", output), /ENOENT/u);
  assert.equal(closed, true); assert.equal(aborts, 1); assert.equal(writes, 0); assert.equal(existsSync(output), false);
});

test("silent destruction retains its original cause before a later error on the same entry", { timeout: 2000 }, async () => {
  await refusedSchedule("same-entry-order", async onEntry => {
    const entry = new readEntryTar.ReadEntry(new tar.Header({path:"node v24.19/file",type:"File",size:512}));
    onEntry(entry); entry.destroy(); entry.destroy(new Error("later-same-entry-error"));
  }, /stream destroyed/u);
});
test("destroy settlement chronology is independent of registration order", { timeout: 2000 }, async () => {
  await refusedSchedule("reverse-registration-order", async onEntry => {
    const first = new readEntryTar.ReadEntry(new tar.Header({path:"node v24.19/first",type:"File",size:512}));
    const second = new readEntryTar.ReadEntry(new tar.Header({path:"node v24.19/second",type:"File",size:512}));
    onEntry(first); onEntry(second);
    second.destroy(new Error("earliest-second-entry-error")); first.destroy();
  }, /earliest-second-entry-error/u);
});

// One-shot injected registration failures challenge exception safety on actual
// supplied ReadEntry/parser objects; valid ordinary tar registrations do not throw.
for (const registration of ["error", "close", "end", "data"] as const) {
  test("actual parser first " + registration + " registration refusal settles every owned entry", async () => {
    const root = mkdtempSync(join(tmpdir(), "lifecycle-first-registration-" + registration + "-"));
    const archive = join(root, "valid.tgz"), output = join(root, "payload"); allKindArchive(archive, true);
    const original = new Error("injected-first-" + registration + "-registration");
    const encountered: { entry: Entry; settled: boolean }[] = [];
    let injected = false, writes = 0, aborts = 0, parserErrors = 0, readerClosed = false;
    let reader: import("node:fs").ReadStream | undefined;
    let parser: ReturnType<Reader["t"]> | undefined;
    const readerTar: Reader = {
      t: options => {
        const listing = tar.t({ ...options, onReadEntry: entry => {
          const row = { entry, settled: false }; encountered.push(row);
          void entry.promise().then(() => { row.settled = true; }, () => { row.settled = true; });
          if (entry.type === "File" && !injected) {
            const on = entry.on;
            entry.on = function(event, callback) {
              if (event === registration && !injected) { injected = true; throw original; }
              return (on as (registeredEvent: typeof event, registeredCallback: typeof callback) => unknown).call(this, event, callback);
            };
          }
          options.onReadEntry(entry);
        } });
        parser = listing;
        listing.on("pipe", (source: import("node:fs").ReadStream) => {
          reader = source; source.on("close", () => { readerClosed = true; });
        });
        listing.on("abort", () => { aborts++; }); listing.on("error", () => { parserErrors++; });
        return listing;
      },
      x: async () => { writes++; },
    };
    await assert.rejects(extractPreparationArchive(readerTar, archive, "node v24.19", output), error => error === original);
    assert.equal(injected, true); assert.equal(writes, 0); assert.equal(existsSync(output), false);
    assert.equal(aborts, 1); assert.ok(parserErrors >= 1);
    assert.equal(readerClosed, true); assert.equal(reader?.closed, true); assert.equal(reader?.destroyed, true);
    assert.equal(reader ? Reflect.get(reader, "fd") : undefined, null);
    assert.ok(encountered.length > 0);
    for (const { entry, settled } of encountered) {
      assert.ok(entry.destroyed || entry.emittedEnd); assert.equal(settled, true);
      entry.destroy(new Error("late-injected-entry-error"));
    }
    parser?.emit("error", new Error("late-injected-parser-error"));
    await new Promise<void>(yes => setImmediate(yes));
    writeFileSync(join(root, "registration-result.json"), JSON.stringify({ registration, injected, writes, aborts, parserErrors, readerClosed,
      entries: encountered.map(({ entry, settled }) => ({ type: entry.type, destroyed: entry.destroyed, ended: entry.emittedEnd, settled })) }));
  });
}

// A regression here becomes RED if either real callsite still compares the full
// installed package to the archive, or if installer membership trusts a mutable
// hash/name instead of the authenticated owner, resolver and renderer derivation.
const correctionInputs = resolve(process.env.LIFECYCLE_PAYLOAD_CORRECTION_INPUTS ?? ".codex/.job-inputs");
const correctionAvailable = existsSync(join(correctionInputs, "archive-inputs/@agent-teams-engineering-foundation.tgz"));
test("retained SRI Foundation archive qualifies both real payload callsites and rejects physical/evidence mutants", { skip: !correctionAvailable }, async () => {
  const workspace = join(correctionInputs, "frozen-resolver-graph");
  const graph = restoredDependencyGraph(workspace, "linux", "x64");
  const root = graph.roots["@agent-teams/engineering-foundation"]!;
  const renderer = join(correctionInputs, "public-tools/pnpm-generator-11.20.0/dist/pnpm.mjs");
  const archive = join(correctionInputs, "archive-inputs/@agent-teams-engineering-foundation.tgz");
  const metadata = JSON.parse(readFileSync(join(correctionInputs, "archive-inputs/@agent-teams-engineering-foundation-metadata.json"), "utf8"));
  const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
  assert.equal("sha512-" + createHash("sha512").update(readFileSync(archive)).digest("base64"), metadata.dist.integrity);
  assert.equal(hash(readFileSync(archive)), "b53747119d15cb3db8fc1fa97a526b4b8de3c35a85a9a85619e40571527753f5");
  assert.equal(graph.sha256, "37c8d759823161932f46e62c4a27702358081815bbc6eb76d7e33a1984c48087");
  const scratch = mkdtempSync(join(tmpdir(), "lifecycle-payload-correspondence-"));
  const extracted = join(scratch, "published");
  const tar = createRequire(join(workspace, "package.json"))("tar") as Parameters<typeof extractPreparationArchive>[0];
  await extractPreparationArchive(tar, archive, "package", extracted);
  const published = packagePayloadInventory(extracted);
  assert.equal(published.length, 2563); assert.equal(packagePayloadInventory(root).length, 2565);
  const proof = { id: "@agent-teams/engineering-foundation", archiveSha256: hash(readFileSync(archive)),
    payloadSha256: "01f20478086e2f6a3e4683f8633f63117c2d403a5de1f08092f4969907ce6269", sri: metadata.dist.integrity as string };
  const acquisition = verifyPreparedPackagePayload(workspace, root, extracted, proof, renderer);
  assert.ok(acquisition.projection);
  const projection = acquisition.projection;
  assert.deepEqual(projection.published, published);
  assert.equal(projection.installedPayloadSha256, "63f0b14e0a1ddeea17364c5c3d304e65588b4c2d5af2130195e2e5416748e00a");
  assert.deepEqual(projection.witnesses.map(row => [row.shimPath, row.shimSha256, row.shimMode]), [
    ["node_modules/.bin/api-extractor", "354460aefe6a0d8b14727602ca4d5dbcf8fb3febc4a2ba4e87137bf23b6a5c28", 493],
    ["node_modules/.bin/yaml", "6bbae3780fca6ab31c846926cfb55ac8c522369676d9f64d66c66de0f7158c29", 493],
  ]);
  const origin = { ...proof, version: "1.7.2", platform: "linux", arch: "x64", status: "verified" as const,
    method: "package-sri" as const, source: "https://registry.npmjs.org/@agent-teams%2fengineering-foundation/1.7.2", payloadProjection: projection };
  // Schema-only companions exercise generator/origin correspondence. They are
  // not aggregate acquisition receipts; the retained Foundation/pnpm archives
  // above and the prior provenance gate supply the real artifact evidence.
  const supportRows = Object.entries(supportVersions("linux", "x64")).map(([id, version]) => id === origin.id ? origin : {
    id, version, platform: "linux", arch: "x64", status: "verified" as const, method: "package-sri" as const,
    archiveSha256: "a".repeat(64), payloadSha256: "b".repeat(64), sri: "sha512-" + Buffer.alloc(64).toString("base64"),
    source: `https://registry.npmjs.org/${id.replace("/", "%2f")}/${version}`,
  });
  const pnpmMetadata = JSON.parse(readFileSync(join(correctionInputs, "archive-inputs/pnpm-metadata.json"), "utf8"));
  const generatorOrigin = { id: "pnpm", version: "11.20.0", platform: "linux", arch: "x64", status: "verified" as const,
    source: "https://registry.npmjs.org/pnpm/11.20.0", archiveSha256: hash(readFileSync(join(correctionInputs, "archive-inputs/pnpm.tgz"))),
    payloadSha256: "a".repeat(64), verification: { method: "package-sri" as const, sri: pnpmMetadata.dist.integrity as string, receipt: inputIdentity(renderer) } };
  verifySupportOrigins(supportRows, "linux", "x64", [generatorOrigin]);
  for (const generators of [[], [generatorOrigin, generatorOrigin], [{ ...generatorOrigin, archiveSha256: "a".repeat(64) }],
    [{ ...generatorOrigin, verification: { ...generatorOrigin.verification, sri: "forged" } }]]) {
    assert.throws(() => verifySupportOrigins(supportRows, "linux", "x64", generators), /installer origin/u);
  }
  assert.throws(() => verifySupportOrigins(supportRows.map(row => row.id === origin.id ? { ...origin, sri: "forged" } : row), "linux", "x64", [generatorOrigin]), /archive\/SRI binding/u);
  const admitted = new Set([...graph.entries, ...acquisition.inputs].map(row => row.path));
  assert.deepEqual(verifyPhysicalSupportPayload(workspace, root, origin, renderer, admitted), acquisition.inputs);
  assert.deepEqual(projectPackagePayload(packagePayloadInventory(root), projection), published);
  const receipt = { oldComparator: "RED in separate retained invocation", helper: "GREEN", normalPhysicalCallsite: "GREEN",
    publishedRows: published.length, installedRows: 2565, graphSha256: graph.sha256, witnessSha256: projection.witnessesSha256 };
  writeFileSync(join(scratch, "nearest-result.json"), JSON.stringify(receipt)); console.log(JSON.stringify(receipt));

  const rejectsEvidence = (name: string, mutate: (candidate: PackagePayloadProjection) => void) => {
    const candidate = structuredClone(projection); mutate(candidate);
    assert.throws(() => projectPackagePayload(packagePayloadInventory(root), candidate), (error: unknown) => error instanceof Error, name);
    assert.throws(() => verifyPhysicalSupportPayload(workspace, root, { ...origin, payloadProjection: candidate }, renderer, admitted), (error: unknown) => error instanceof Error, name);
    writeFileSync(join(scratch, `evidence-${name}.json`), JSON.stringify(candidate));
  };
  for (const [name, mutate] of [
    ["missing-witness", (p: PackagePayloadProjection) => { p.witnesses.pop(); }],
    ["duplicate-witness", (p: PackagePayloadProjection) => { p.witnesses.push(p.witnesses[0]!); }],
    ["forged-witness", (p: PackagePayloadProjection) => { p.witnesses[0]!.shimPath = "node_modules/.bin/unowned"; }],
    ["forged-mode", (p: PackagePayloadProjection) => { p.witnesses[0]!.shimMode = 0o644; }],
    ["forged-owner", (p: PackagePayloadProjection) => { p.witnesses[0]!.declaringManifestSha256 = "a".repeat(64); }],
    ["unknown-witness-field", (p: PackagePayloadProjection) => { Reflect.set(p.witnesses[0]!, "exclude", true); }],
    ["witness-digest", (p: PackagePayloadProjection) => { p.witnessesSha256 = "a".repeat(64); }],
    ["changed-payload", (p: PackagePayloadProjection) => { p.published[0]!.sha256 = "a".repeat(64); }],
    ["missing-payload", (p: PackagePayloadProjection) => { p.published.pop(); }],
    ["duplicate-payload", (p: PackagePayloadProjection) => { p.published.push(p.published[0]!); }],
    ["escaping-payload", (p: PackagePayloadProjection) => { p.published[0]!.path = "../escape"; }],
    ["stale-context", (p: PackagePayloadProjection) => { Reflect.set(p.provenance, "cwd", workspace); }],
    ["stale-generator", (p: PackagePayloadProjection) => { Reflect.set(p.provenance, "rendererSha256", "a".repeat(64)); }],
    ["unknown-field", (p: PackagePayloadProjection) => { Reflect.set(p, "exclusions", []); }],
    ["missing-field", (p: PackagePayloadProjection) => { Reflect.deleteProperty(p, "witnessesSha256"); }],
    ["unknown-version", (p: PackagePayloadProjection) => { Reflect.set(p, "schemaVersion", 2); }],
  ] as const) rejectsEvidence(name, mutate);
  assert.throws(() => verifyPhysicalSupportPayload(workspace, root, { ...origin, payloadProjection: undefined } as unknown as typeof origin, renderer, admitted), /missing authenticated installer projection/u);
  for (const field of ["sri", "archiveSha256", "payloadSha256"] as const) {
    assert.throws(() => verifyPhysicalSupportPayload(workspace, root, { ...origin, [field]: "forged" }, renderer, admitted), /archive\/SRI binding/u);
    assert.throws(() => verifyPreparedPackagePayload(workspace, root, extracted, { ...proof, [field]: "forged" }, renderer), /archive\/SRI binding/u);
  }
  const fixture = (name: string) => {
    const copy = join(scratch, name); mkdirSync(copy);
    for (const file of [".npmrc", "pnpm-workspace.yaml", "pnpm-lock.yaml", "package.json"]) cpSync(join(workspace, file), join(copy, file));
    const installedRoot = join(copy, relative(workspace, root));
    cpSync(root, installedRoot, { recursive: true, verbatimSymlinks: true });
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> };
    for (const name of Object.keys(manifest.dependencies)) {
      const edge = join(dirname(dirname(root)), name), target = realpathSync(edge), copiedTarget = join(copy, relative(workspace, target));
      mkdirSync(copiedTarget, { recursive: true }); cpSync(join(target, "package.json"), join(copiedTarget, "package.json"));
      const copiedEdge = join(copy, relative(workspace, edge)); mkdirSync(dirname(copiedEdge), { recursive: true }); symlinkSync(readlinkSync(edge), copiedEdge);
    }
    for (const witness of projection.witnesses) {
      const target = join(copy, witness.targetRoot, witness.binDeclaration); mkdirSync(dirname(target), { recursive: true });
      cpSync(join(workspace, witness.targetRoot, witness.binDeclaration), target);
    }
    return { copy, installedRoot };
  };
  const mutations: [string, (copy: string, installedRoot: string) => void][] = [
    ["unknown-root", (_copy, r) => writeFileSync(join(r, "unowned.txt"), "extra")],
    ["unknown-node-modules", (_copy, r) => writeFileSync(join(r, "node_modules/unowned.txt"), "extra")],
    ["shim-bytes", (_copy, r) => writeFileSync(join(r, "node_modules/.bin/yaml"), "#!/bin/sh\nexit 0\n")],
    ["shim-mode", (_copy, r) => chmodSync(join(r, "node_modules/.bin/yaml"), 0o644)],
    ...[0o4755, 0o2755, 0o1755].map(mode => ["shim-special-mode-" + mode.toString(8), (_copy: string, r: string) => {
      const shim = join(r, "node_modules/.bin/yaml"); chmodSync(shim, mode);
      assert.equal(lstatSync(shim).mode & 0o7777, mode, "special-mode mutation actually applied");
    }] as [string, (copy: string, installedRoot: string) => void]),
    ["missing-shim", (_copy, r) => rmSync(join(r, "node_modules/.bin/yaml"))],
    ["shim-symlink", (_copy, r) => { const p = join(r, "node_modules/.bin/yaml"); rmSync(p); symlinkSync("../../package.json", p); }],
    ["bin-alias", (c) => { const p = join(c, projection.witnesses[1]!.targetRoot, "bin.mjs"); rmSync(p); symlinkSync("./package.json", p); }],
    ["missing-bin", (c) => rmSync(join(c, projection.witnesses[1]!.targetRoot, "bin.mjs"))],
    ["bin-body", (c) => writeFileSync(join(c, projection.witnesses[1]!.targetRoot, "bin.mjs"), "#!/usr/bin/env node\nmutated")],
    ["manifest-bin", (c) => { const p = join(c, projection.witnesses[1]!.targetRoot, "package.json"); const m = JSON.parse(readFileSync(p, "utf8")); m.bin = "./other.mjs"; writeFileSync(p, JSON.stringify(m)); }],
    ["manifest-runtime", (c) => { const p = join(c, projection.witnesses[0]!.targetRoot, "package.json"); const m = JSON.parse(readFileSync(p, "utf8")); m.engines = { ...(m.engines ?? {}), runtime: { name: "node", onFail: "download" } }; writeFileSync(p, JSON.stringify(m)); }],
    ["declaring-manifest", (_c, r) => { const p = join(r, "package.json"); const m = JSON.parse(readFileSync(p, "utf8")); m.dependencies.yaml = "2.9.1"; writeFileSync(p, JSON.stringify(m)); }],
    ["dependency-edge", (c) => { const p = join(c, projection.witnesses[1]!.edge); rmSync(p); symlinkSync("./yaml", p); }],
    ["escaping-edge", (c) => { const p = join(c, projection.witnesses[1]!.edge); rmSync(p); symlinkSync(realpathSync(join(workspace, projection.witnesses[1]!.edge)), p); }],
    ["ambiguous-bin", (_c, r) => { const p = join(dirname(dirname(r)), "ajv/package.json"); const m = JSON.parse(readFileSync(p, "utf8")); m.bin = { yaml: "./fake" }; writeFileSync(p, JSON.stringify(m)); }],
    ["stale-source-config", (c) => writeFileSync(join(c, ".npmrc"), "extend-node-path=false\n")],
  ];
  for (const [name, mutate] of mutations) {
    const { copy, installedRoot } = fixture(name);
    const initial = verifyPreparedPackagePayload(copy, installedRoot, extracted, proof, renderer);
    const copiedAdmitted = new Set([...frozenInventory(installedRoot, true), ...initial.inputs].map(row => row.path));
    mutate(copy, installedRoot);
    const rejection = name.startsWith("shim-special-mode-") ? /generated shim mode/u : (error: unknown) => error instanceof Error;
    assert.throws(() => verifyPreparedPackagePayload(copy, installedRoot, extracted, proof, renderer), rejection, name);
    assert.throws(() => verifyPhysicalSupportPayload(copy, installedRoot, origin, renderer, copiedAdmitted), rejection, name);
  }
  const changedExtraction = join(scratch, "changed-published"); cpSync(extracted, changedExtraction, { recursive: true });
  writeFileSync(join(changedExtraction, published[0]!.path), "payload-mutant");
  assert.throws(() => verifyPreparedPackagePayload(workspace, root, changedExtraction, proof, renderer), /unauthenticated published payload/u);
  rmSync(join(changedExtraction, published[0]!.path));
  assert.throws(() => verifyPreparedPackagePayload(workspace, root, changedExtraction, proof, renderer), /unauthenticated published payload/u);
  assert.deepEqual(restoredDependencyGraph(workspace, "linux", "x64"), graph, "original complete restored graph unchanged");
});

// The original main assertion rejects the genuine prepared manifest before a
// single row can reach physical admission. Run that exact boundary in isolation:
// executing main (including a preparation or deliberately failing main) is not
// needed to demonstrate this count regression.
const currentAcquisition = join(correctionInputs, "current-acquisition");
const currentManifestPath = join(currentAcquisition, "prepared-manifest.json");
const currentManifestAvailable = existsSync(currentManifestPath);
const currentManifestHash = "07c462d080a21b8b3df93892417d7420859fbd75a1562da7abfae36fd6f96ab3";
const closureHash = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
function currentPreparedManifest(): { entries: PreparedToolEntry[]; origins: Parameters<typeof verifyToolOrigins>[0];
  support: Parameters<typeof verifySupportOrigins>[0] } {
  const bytes = readFileSync(currentManifestPath); assert.equal(closureHash(bytes), currentManifestHash);
  return parseQualificationEvidenceJSON(bytes.toString()) as ReturnType<typeof currentPreparedManifest>;
}
test("current authenticated 23053-row manifest passes finite entry admission and rejects schema/configuration mutants",
  { skip: !currentManifestAvailable }, () => {
    const manifest = currentPreparedManifest();
    assert.equal(manifest.entries.length, 23053);
    assert.equal(manifest.entries.filter(row => row.kind === "file").length, 23042);
    assert.equal(manifest.entries.filter(row => row.kind === "symlink").length, 11);
    verifyToolEntryEnvelope(manifest.entries);
    const oldDriver = process.env.LIFECYCLE_OLD_TOOL_CLOSURE_DRIVER;
    if (oldDriver) {
      const source = readFileSync(oldDriver, "utf8");
      assert.equal(closureHash(source), "9b53526b5cbbc659bde6b0a84736098c1f44ea7279e476e0ff9b02cb652f251b");
      const assertion = source.split("\n").find(line => line.includes('toolManifest.entries.length <= 10000'))?.trim();
      assert.ok(assertion, "accepted old main admission assertion missing");
      assert.throws(() => new Function("toolManifest", "assert", assertion)(manifest, assert), /empty or unbounded tool closure/u);
      console.log(JSON.stringify({ case: "exact-old-admission-RED", assertionSHA256: closureHash(assertion),
        manifestSHA256: currentManifestHash, rows: 23053 }));
    }
    assert.throws(() => verifyToolEntryEnvelope([...manifest.entries, manifest.entries[0]!]), /duplicate tool identity/u);
    assert.throws(() => verifyToolEntryEnvelope([...manifest.entries, { path: "public-tools/foreign/bin", kind: "file", sha256: "a".repeat(64) }]), /unsupported tool identity/u);
    assert.throws(() => verifyToolEntryEnvelope([...manifest.entries, { path: "workspace/unowned", kind: "file", sha256: "a".repeat(64) }]), /unsupported tool identity/u);
    assert.throws(() => verifyToolEntryEnvelope([...manifest.entries, { path: "public-tools/node24/../foreign", kind: "file", sha256: "a".repeat(64) }]), /unsupported tool identity/u);
    const configs = manifest.entries.filter(row => row.path.startsWith("workspace/") && !row.path.startsWith("workspace/node_modules/"));
    assert.deepEqual(configs.map(row => row.path).sort(), ["workspace/.npmrc", "workspace/package.json", "workspace/pnpm-lock.yaml", "workspace/pnpm-workspace.yaml"]);
    for (const config of configs) {
      assert.throws(() => verifyToolEntryEnvelope(manifest.entries.filter(row => row !== config)), /missing installer configuration/u);
      assert.throws(() => verifyToolEntryEnvelope(manifest.entries.map(row => row === config ? { ...row, sha256: "a".repeat(64) } : row)), /installer configuration identity/u);
      assert.throws(() => verifyToolEntryEnvelope(manifest.entries.map(row => row === config ? { ...row, kind: "symlink" } : row)), /installer configuration kind/u);
      assert.throws(() => verifyToolEntryEnvelope(manifest.entries.map(row => row === config ? { ...row, kind: "symlink", linkTarget: "other" } : row)), /installer configuration kind/u);
      const other = configs.find(row => row !== config)!;
      assert.throws(() => verifyToolEntryEnvelope(manifest.entries.map(row => row === config ? { ...row, sha256: other.sha256 } : row)), /installer configuration identity/u);
    }
    const link = manifest.entries.find(row => row.kind === "symlink")!, missingTarget = { ...link };
    delete missingTarget.linkTarget;
    assert.throws(() => verifyToolEntryEnvelope(manifest.entries.map(row => row === link ? missingTarget : row)), /tool link target field mismatch/u);
    assert.throws(() => verifyToolEntryEnvelope(manifest.entries.map(row => row === link ? { ...row, linkTarget: "" } : row)), /tool link target format/u);
    const file = manifest.entries.find(row => row.kind === "file" && row.path.startsWith("public-tools/"))!;
    assert.throws(() => verifyToolEntryEnvelope(manifest.entries.map(row => row === file ? { ...row, linkTarget: "other" } : row)), /tool link target field mismatch/u);
    const overflow = [...manifest.entries, ...Array.from({ length: 10001 - 4801 }, (_, index) => ({
      path: `public-tools/node24/excess-${index}`, sha256: "a".repeat(64), kind: "file" }))];
    assert.throws(() => verifyToolEntryEnvelope(overflow), /finite tool root inventory/u);
    assert.throws(() => verifyToolEntryEnvelope(new Array(70005).fill(null) as PreparedToolEntry[]), /empty or unbounded tool closure/u);
    assert.throws(() => verifyToolEntryEnvelope(manifest.entries.map((row, index) => index === 0 ? { ...row, unknown: true } : row)), /unknown manifest field/u);
  });

// Exercise every supplied physical body in scratch. Four official Node
// distributions are separate protected host inputs and are not manufactured.
// The full regression below requires them explicitly and never rewrites the
// authenticated manifest to compensate for missing files.
function physicalClosureFixture(full: boolean): { workspace: string; tools: string; expected: InputIdentityForClosure[] } {
  const scratch = mkdtempSync(join(tmpdir(), "lifecycle-current-closure-"));
  const workspace = join(scratch, "workspace"), tools = join(scratch, "public-tools");
  mkdirSync(workspace); mkdirSync(tools);
  const retained = join(correctionInputs, "frozen-resolver-graph");
  cpSync(join(retained, "node_modules"), join(workspace, "node_modules"), { recursive: true, dereference: false, verbatimSymlinks: true });
  for (const file of [".npmrc", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) cpSync(join(retained, file), join(workspace, file));
  cpSync(join(correctionInputs, "public-tools/pnpm-generator-11.20.0"), join(tools, "pnpm"), { recursive: true });
  cpSync(join(correctionInputs, "public-tools/typescript-6.0.3"), join(tools, "typescript-6.0.3"), { recursive: true });
  if (full) {
    const supplied = process.env.LIFECYCLE_CURRENT_PHYSICAL_TOOL_ROOT;
    assert.ok(supplied, "missing authenticated physical Node distributions");
    for (const name of ["node20-minimum", "node20", "node24", "node26"]) {
      assert.ok(existsSync(join(supplied, name)), `missing authenticated physical root: ${name}`);
      cpSync(join(supplied, name), join(tools, name), { recursive: true, dereference: false, verbatimSymlinks: true });
    }
    verifyPublicToolRoots(tools);
  }
  const manifest = currentPreparedManifest(), graph = restoredDependencyGraph(workspace, process.platform, process.arch);
  assert.equal(graph.sha256, "37c8d759823161932f46e62c4a27702358081815bbc6eb76d7e33a1984c48087");
  const expected = [...graph.entries, ...[".npmrc", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"].map(name => inputIdentity(join(workspace, name)))];
  for (const origin of manifest.support) expected.push(...verifyPackagePayload(workspace, graph.roots[origin.id]!, origin,
    join(tools, "pnpm/dist/pnpm.mjs"), origin.payloadProjection).inputs);
  for (const name of full ? ["node20-minimum", "node20", "node24", "node26", "pnpm", "typescript-6.0.3"] : ["pnpm", "typescript-6.0.3"]) {
    const root = join(tools, name), rows = frozenInventory(root, true);
    const payload = rows.map(row => ({ path: relative(root, row.path).split("\\").join("/"), sha256: row.sha256,
      ...(row.linkTarget === undefined ? {} : { linkTarget: row.linkTarget }) }));
    assert.equal(closureHash(JSON.stringify(payload)), manifest.origins.find(row => row.id === name)!.payloadSha256,
      `authenticated physical origin: ${name}`);
    expected.push(...rows);
  }
  return { workspace, tools, expected };
}
type InputIdentityForClosure = ReturnType<typeof inputIdentity>;
test("current supplied physical closure rejects excess foreign duplicate missing swapped and tampered configurations",
  { skip: !currentManifestAvailable }, () => {
    const { workspace, tools, expected } = physicalClosureFixture(false);
    // This explicit subset scope is not evidence for the absent Node bodies.
    const entries = currentPreparedManifest().entries.filter(row => !/^public-tools\/node/u.test(row.path));
    assert.equal(entries.length, 4715); verifyToolClosureEntries(entries, workspace, tools, expected);
    assert.throws(() => verifyToolClosureEntries([...entries, entries[0]!], workspace, tools, expected), /duplicate tool identity/u);
    const foreign = join(workspace, "node_modules/foreign"); writeFileSync(foreign, "foreign");
    const extra = { path: "workspace/node_modules/foreign", sha256: closureHash("foreign"), kind: "file" };
    assert.throws(() => verifyToolClosureEntries([...entries, extra], workspace, tools, expected), /excess physical tool closure/u);
    assert.throws(() => verifyToolClosureEntries(entries.map((row, index) => index === 0 ? extra : row), workspace, tools, expected), /foreign physical tool identity/u);
    for (const file of [".npmrc", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
      const path = join(workspace, file), bytes = readFileSync(path);
      assert.throws(() => verifyToolClosureEntries(entries.filter(row => row.path !== "workspace/" + file), workspace, tools, expected), /missing installer configuration/u);
      writeFileSync(path, "tampered");
      assert.throws(() => verifyToolClosureEntries(entries, workspace, tools, expected), /physical tool drift/u);
      writeFileSync(path, readFileSync(join(workspace, file === ".npmrc" ? "package.json" : ".npmrc")));
      assert.throws(() => verifyToolClosureEntries(entries, workspace, tools, expected), /physical tool drift/u);
      rmSync(path);
      assert.throws(() => verifyToolClosureEntries(entries, workspace, tools, expected));
      writeFileSync(path, bytes);
    }
    const target = join(workspace, "node_modules/aliased-config"); cpSync(join(workspace, ".npmrc"), target);
    rmSync(join(workspace, ".npmrc")); symlinkSync("node_modules/aliased-config", join(workspace, ".npmrc"));
    assert.throws(() => verifyToolClosureEntries(entries, workspace, tools, expected), /physical tool drift|installer configuration kind/u);
  });
test("complete current authenticated manifest matches all physical inputs without dropping rows",
  { skip: !currentManifestAvailable || !process.env.LIFECYCLE_CURRENT_PHYSICAL_TOOL_ROOT }, () => {
    const { workspace, tools, expected } = physicalClosureFixture(true);
    const entries = currentPreparedManifest().entries;
    assert.equal(new Set(expected.map(row => row.path)).size, 23053);
    verifyToolClosureEntries(entries, workspace, tools, expected);
    const extra = { path: "public-tools/node24/excess", kind: "file", sha256: closureHash("excess") };
    writeFileSync(join(tools, "node24/excess"), "excess");
    assert.throws(() => verifyToolClosureEntries([...entries, extra], workspace, tools, expected), /excess physical tool closure/u);
    assert.throws(() => verifyToolClosureEntries(entries.map((row, index) => index === 0 ? extra : row), workspace, tools, expected), /foreign physical tool identity/u);
    mkdirSync(join(tools, "foreign")); assert.throws(() => verifyPublicToolRoots(tools), /extra tool root/u);
  });

// Synthetic origin receipts exercise main's schema/admission boundary only.
// The real retained configuration bytes are serialized by the helper. A known
// unsealed tool stops execution immediately after admission, before any gate.
test("helper manifest configuration entries reach actual main and reject finite boundary mutations", { skip: !correctionAvailable }, () => {
  const retained = join(correctionInputs, "frozen-resolver-graph");
  const files = [".npmrc", "pnpm-workspace.yaml", "pnpm-lock.yaml", "package.json"];
  const scratch = mkdtempSync(join(tmpdir(), "lifecycle-manifest-main-"));
  const workspace = join(scratch, "workspace"), tools = join(scratch, "public-tools");
  mkdirSync(workspace); mkdirSync(join(tools, "node20-minimum"), { recursive: true });
  writeFileSync(join(tools, "node20-minimum/unsealed-boundary-marker"), "stop after manifest entry admission");
  symlinkSync(join(retained, "node_modules"), join(workspace, "node_modules"), "dir");
  for (const file of files) cpSync(join(retained, file), join(workspace, file));
  const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
  const entries = preparedToolEntries(files.map(file => inputIdentity(join(workspace, file))), workspace, tools);
  assert.deepEqual(entries.map(row => row.path).sort(), files.map(file => "workspace/" + file).sort());
  const origins = Object.entries({ "node20-minimum": "20.0.0", node20: "20.20.0", node24: "24.21.0", node26: "26.10.0",
    "typescript-minimum": "5.8.3", "typescript-6.0.3": "6.0.3", typescript: "7.0.2", pnpm: "11.20.0" }).map(([id, version]) => {
    const node = id.startsWith("node"), method = node ? "signed-shasums" as const : "package-sri" as const;
    const row = { id, version, platform: process.platform, arch: process.arch, status: "verified" as const,
      archiveSha256: "a".repeat(64), payloadSha256: "b".repeat(64),
      source: node ? `https://nodejs.org/dist/v${version}/SHASUMS256.txt.asc` : `https://registry.npmjs.org/${id.startsWith("typescript") ? "typescript" : "pnpm"}/${version}` };
    const authorization = node ? { policyCommit: commit, signer: primary } : { sri: "sha512-" + Buffer.alloc(64).toString("base64") };
    const receipt = join(scratch, id + ".json"); writeFileSync(receipt, JSON.stringify({ ...row, method, ...authorization }));
    return { ...row, verification: { method, receipt: inputIdentity(receipt), ...authorization } };
  });
  const support = Object.entries(supportVersions(process.platform, process.arch)).map(([id, version]) => ({
    id, version, platform: process.platform, arch: process.arch, status: "verified", method: "package-sri",
    archiveSha256: "a".repeat(64), payloadSha256: "b".repeat(64), sri: "sha512-" + Buffer.alloc(64).toString("base64"),
    source: `https://registry.npmjs.org/${id.replace("/", "%2f")}/${version}`,
  }));
  const driver = resolve("packages/lifecycle-kernel/tests/run-node20-qualification.mts");
  function run(label: string, rows: typeof entries, expected: RegExp): void {
    const output = join(scratch, label); mkdirSync(output);
    const manifest = join(output, "tool-manifest.json");
    writeFileSync(manifest, JSON.stringify({ platform: process.platform, arch: process.arch, origins, support, entries: rows }));
    const args = [driver, "packages/lifecycle-kernel/tests/node20-qualification.test.mts", "packages/lifecycle-kernel/tests/qualification-admission.test.mts"];
    const child = spawnSync(process.execPath, args, { cwd: workspace, encoding: "utf8", env: {
      ...process.env, TMPDIR: output, LIFECYCLE_PUBLIC_TOOL_ROOT: tools, LIFECYCLE_QUALIFICATION_OUTPUT: output,
      LIFECYCLE_PARENT_INVOCATION: "root", LIFECYCLE_TOOL_MANIFEST: manifest,
      LIFECYCLE_EXPECTED_TOOL_MANIFEST_SHA256: hash(readFileSync(manifest)), LIFECYCLE_EXPECTED_DRIVER_SHA256: hash(readFileSync(driver)),
    } });
    assert.equal(child.error, undefined); assert.equal(child.signal, null); assert.equal(child.status, 1);
    const printed = JSON.parse(child.stdout.trim().split("\n").at(-1)!);
    const bytes = readFileSync(printed.receipts), receipt = JSON.parse(bytes.toString());
    assert.equal(printed.status, "FAIL"); assert.equal(printed.sha256, hash(bytes)); assert.equal(receipt.terminal, "FAIL");
    assert.equal(receipt.bindings.driver, hash(readFileSync(driver))); assert.match(receipt.terminalError, expected);
    assert.deepEqual(readFileSync(receipt.terminalReceiptPath), bytes);
    const evidence = { case: label, scope: "synthetic origins; real helper configuration serialization to main admission/finally",
      argv: [process.execPath, ...args], exitCode: child.status, stdoutSHA256: hash(child.stdout), stderrSHA256: hash(child.stderr),
      driverSHA256: receipt.bindings.driver, terminalSHA256: printed.sha256 };
    writeFileSync(join(output, "case-receipt.json"), JSON.stringify(evidence)); console.log(JSON.stringify(evidence));
  }
  run("four-configurations-admitted", entries, /unsealed tool content:.*unsealed-boundary-marker/u);
  run("unknown-workspace-file", [...entries, { path: "workspace/unowned.txt", kind: "file", sha256: "a".repeat(64) }], /unsupported tool identity/u);
  run("duplicate-configuration", [...entries, entries[0]!], /duplicate tool identity/u);
  run("escaping-configuration", [...entries, { ...entries[0]!, path: "workspace/../.npmrc" }], /unsupported tool identity/u);
  for (const file of files) {
    const path = "workspace/" + file;
    run("forged-config-digest-" + file.replaceAll(".", "_"), entries.map(row => row.path === path ? { ...row, sha256: "a".repeat(64) } : row), /installer configuration identity/u);
    run("forged-config-kind-" + file.replaceAll(".", "_"), entries.map(row => row.path === path ? { ...row, kind: "symlink" } : row), /installer configuration kind/u);
    writeFileSync(join(workspace, file), "altered configuration");
    run("changed-config-" + file.replaceAll(".", "_"), entries, /corrupt tool/u);
    cpSync(join(retained, file), join(workspace, file));
  }
  const config = join(workspace, ".npmrc"), saved = join(workspace, "aliased-npmrc");
  cpSync(config, saved); rmSync(config); symlinkSync("aliased-npmrc", config);
  run("configuration-symlink", entries, /installer configuration kind/u);
});

test("projection evidence JSON rejects duplicate escaped keys and closed schema mutations", () => {
  assert.deepEqual(parseQualificationEvidenceJSON('{"items":[{"name":"x:y"}],"quoted":"\\\""}'), { items: [{ name: "x:y" }], quoted: '"' });
  for (const text of ['{"schemaVersion":1,"schemaVersion":1}', '{"provenance":{"cwd":"a","c\\u0077d":"a"}}', '{"rows":[{"path":"x","path":"x"}]}']) {
    assert.throws(() => parseQualificationEvidenceJSON(text), /duplicate qualification evidence field/u);
  }
});

// Independent expected inputs are the retained authority packet, never values
// projected out of the candidate's own public source or manifest.
test("production public manifest and type source stay identical to independent retained authority", () => {
  const retainedManifest = spawnSync("git", ["show", "4f57504468055e94e223c647044d5ceccdf48a05:packages/lifecycle-kernel/package.json"], { encoding: "utf8" });
  assert.equal(retainedManifest.error, undefined); assert.equal(retainedManifest.signal, null); assert.equal(retainedManifest.status, 0);
  assert.equal(readFileSync("packages/lifecycle-kernel/package.json", "utf8"), retainedManifest.stdout);
  for (const path of ["src/index.ts", "src/features/lifecycle/types.ts"]) {
    assert.deepEqual(readFileSync(join("packages/lifecycle-kernel", path)),
      readFileSync(join(correctionInputs, "authority/get-modular/packages/lifecycle-kernel", path)));
  }
});

const compiledCorrectionDriver = process.env.LIFECYCLE_CORRECTION_COMPILED_DRIVER;
test("actual root/build/compiled driver stale identity refuses with corresponding finally receipts", { skip: !compiledCorrectionDriver }, () => {
  const sourceDriver = resolve("packages/lifecycle-kernel/tests/run-node20-qualification.mts");
  const sources = ["packages/lifecycle-kernel/tests/node20-qualification.test.mts", "packages/lifecycle-kernel/tests/qualification-admission.test.mts"];
  for (const [mode, driver, flags] of [
    ["root", sourceDriver, []], ["build", sourceDriver, ["--build-child"]],
    ["compiled", resolve(compiledCorrectionDriver!), ["--compiled", "--build-child"]],
  ] as const) {
    for (const stale of ["driver", "preparation", "both"] as const) {
    const preparation = mode === "compiled" ? resolve(dirname(driver), "../../../tests/qualification/lifecycle-tool-prepare.mjs")
      : resolve("tests/qualification/lifecycle-tool-prepare.mts");
    const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
    const expected = stale === "preparation" ? /preparation source drift before qualification/u : /driver source drift before qualification/u;
    const scratch = mkdtempSync(join(tmpdir(), `lifecycle-driver-${mode}-${stale}-`));
    const tools = join(scratch, "tools"); mkdirSync(tools);
    const invocationId = "11111111-1111-4111-8111-111111111111";
    const args = [driver, ...sources, ...flags];
    const child = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: "utf8", env: {
      ...process.env, TMPDIR: scratch, LIFECYCLE_PUBLIC_TOOL_ROOT: tools, LIFECYCLE_QUALIFICATION_OUTPUT: scratch,
      LIFECYCLE_PARENT_INVOCATION: mode === "root" ? "root" : "test-parent", LIFECYCLE_INVOCATION_ID: invocationId,
      LIFECYCLE_EXPECTED_DRIVER_SHA256: stale === "preparation" ? hash(readFileSync(driver)) : "a723c200fe9eadf65f0a599ebfbcd9ee01eacf2f1e73095427e750a0b1381922",
      LIFECYCLE_EXPECTED_PREPARATION_SHA256: stale === "driver" ? hash(readFileSync(preparation)) : "a".repeat(64),
    } });
    assert.equal(child.error, undefined); assert.equal(child.signal, null); assert.equal(child.status, 1);
    assert.match(child.stderr, expected);
    const printed = child.stdout.trim().split("\n").map(line => JSON.parse(line) as { receipts: string; sha256: string; status: string }).at(-1)!;
    assert.equal(printed.status, "FAIL");
    const receiptBytes = readFileSync(printed.receipts), receipt = JSON.parse(receiptBytes.toString());
    assert.equal(printed.sha256, hash(receiptBytes)); assert.equal(receipt.terminal, "FAIL");
    assert.equal(receipt.bindings.driver, hash(readFileSync(driver))); assert.equal(receipt.mode, mode);
    assert.match(receipt.terminalError, expected);
    assert.equal(receipt.bindings.preparation, hash(readFileSync(preparation)));
    assert.deepEqual(receipt.completed, []); assert.deepEqual(receipt.receipts, []);
    assert.deepEqual(readFileSync(receipt.terminalReceiptPath), receiptBytes);
    const refusalPath = readdirSync(scratch).find(name => name.startsWith("refusal-")); assert.ok(refusalPath);
    const refusal = JSON.parse(readFileSync(join(scratch, refusalPath), "utf8"));
    assert.equal(refusal.source.sha256, hash(readFileSync(driver))); assert.equal(refusal.terminal, "FAIL");
    assert.deepEqual(refusal.preparation, inputIdentity(preparation));
    assert.match(refusal.error, expected);
    const evidence = { case: `stale-${mode}-${stale}-finally`, argv: [process.execPath, ...args], exitCode: child.status,
      stdoutSHA256: hash(child.stdout), stderrSHA256: hash(child.stderr), driverSHA256: receipt.bindings.driver, preparationSHA256: receipt.bindings.preparation, terminalSHA256: printed.sha256 };
    writeFileSync(join(scratch, "case-receipt.json"), JSON.stringify(evidence)); console.log(JSON.stringify(evidence));
    }
  }
});

// Fixed retained main-a2 archive, never a new pack/acquisition invocation.
test("fresh archive manifest: actual old RED, exact pnpm published bytes GREEN and rejecting mutations", {
  skip: !existsSync(join(correctionInputs, "archive-inputs/actual-lifecycle-kernel.tgz")),
}, async () => {
  const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
  const renderer = join(correctionInputs, "public-tools/pnpm-generator-11.20.0/dist/pnpm.mjs");
  const tar = createRequire(resolve("package.json"))("tar") as {
    t(options: { file: string; strict: boolean; onReadEntry(entry: { path: string; type: string; on(event: "data", callback: (chunk: Buffer) => void): void; on(event: "error", callback: (error: Error) => void): void; on(event: "end", callback: () => void): void }): void }): Promise<void>;
  };
  async function bodies(file: string, selected?: string): Promise<Map<string, Buffer>> {
    const rows = new Map<string, Buffer>(), waits: Promise<void>[] = [];
    await tar.t({ file, strict: true, onReadEntry(entry) {
      if (selected && entry.path !== `package/${selected}`) return;
      const path = archiveEntryPath(entry.path, entry.type); if (path === undefined) return;
      assert.ok(!rows.has(path), "duplicate retained archive entry"); rows.set(path, Buffer.alloc(0));
      waits.push(new Promise((yes, no) => {
        const chunks: Buffer[] = [];
        entry.on("data", (chunk: Buffer) => chunks.push(chunk)); entry.on("error", no);
        entry.on("end", () => { rows.set(path, Buffer.concat(chunks)); yes(); });
      }));
    } });
    await Promise.all(waits); return rows;
  }
  const pnpmArchive = join(correctionInputs, "archive-inputs/pnpm.tgz");
  const metadata = JSON.parse(readFileSync(join(correctionInputs, "archive-inputs/pnpm-metadata.json"), "utf8"));
  assert.equal(hash(readFileSync(pnpmArchive)), "34e198cb1e43237517ecedfd31f9ae26a6c0a3e5366ce58a2d05f4b21fb5f19a");
  assert.equal("sha512-" + createHash("sha512").update(readFileSync(pnpmArchive)).digest("base64"), metadata.dist.integrity);
  assert.deepEqual((await bodies(pnpmArchive, "dist/pnpm.mjs")).get("dist/pnpm.mjs"), readFileSync(renderer));
  assert.equal(hash(readFileSync(renderer)), "d8cac00e9c4f7f02f80dd173cfe9bf70c3a90830f4979842ea5b4753641186f7");
  const archivePath = join(correctionInputs, "archive-inputs/actual-lifecycle-kernel.tgz");
  assert.equal(hash(readFileSync(archivePath)), "a324cbc6c0657666c6e219754d862a65dccd6b0793305d487fd171e5df49c631");
  const published = await bodies(archivePath), actual = published.get("package.json")!;
  const source = readFileSync("packages/lifecycle-kernel/package.json");
  assert.equal(hash(source), "c4a9d1fdd370b907a1cbd81cd57c0bb25e87958576328ce85a73ba4bfc25a33b");
  assert.equal(hash(actual), "950069657889a1a39ad88e69786fe3723f90b62ed87399e4d13ca379bd2297d2");
  assert.equal(source.length, 1002); assert.equal(actual.length, 1021);
  assert.equal(source.at(-1), 10); assert.notEqual(actual.at(-1), 10);
  assert.throws(() => assert.equal(hash(source), hash(actual), "fresh production/archive mismatch: package.json"), /fresh production\/archive mismatch/u);
  assert.notDeepEqual(Buffer.from(JSON.stringify(JSON.parse(source.toString()), null, 2)), actual);
  const expected = freshPublishedManifest(source, renderer);
  assert.deepEqual(expected, actual);
  // Independently compile original production inputs into the owned scratch;
  // archive payloads never supply the expected non-manifest production bodies.
  const scratchRoot = resolve(".qualification-execution-scratch"); mkdirSync(scratchRoot, { recursive: true });
  const leaf = mkdtempSync(join(scratchRoot, "fresh-archive-"));
  for (const path of ["package.json", "README.md", "LICENSE", "CHANGELOG.md"]) cpSync(join("packages/lifecycle-kernel", path), join(leaf, path));
  const compiler = join(correctionInputs, "public-tools/typescript-6.0.3/lib/tsc.js");
  const args = [compiler, "-p", "packages/lifecycle-kernel/tsconfig.json", "--skipLibCheck", "false", "--target", "ES2022", "--outDir", join(leaf, "dist")];
  const compiled = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(compiled.error, undefined); assert.equal(compiled.signal, null); assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  const payload = [...published].map(([path, bytes]) => ({ path, sha256: hash(bytes) })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  verifyFreshArchivePayload(leaf, payload, renderer);
  for (const [path, bytes] of published) if (path !== "package.json") assert.deepEqual(readFileSync(join(leaf, path)), bytes, path);
  const cases: string[] = [];
  function rejectManifest(label: string, bytes: Buffer): void {
    assert.throws(() => verifyFreshArchivePayload(leaf, payload.map(row => row.path === "package.json" ? { ...row, sha256: hash(bytes) } : row), renderer), /fresh production\/archive mismatch/u);
    cases.push(label);
  }
  const parsed = JSON.parse(actual.toString());
  rejectManifest("export-target", Buffer.from(JSON.stringify({ ...parsed, exports: { ".": "./dist/internal.js" } }, null, 2)));
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"])
    rejectManifest(field, Buffer.from(JSON.stringify({ ...parsed, [field]: { injected: "1.0.0" } }, null, 2)));
  rejectManifest("metadata", Buffer.from(JSON.stringify({ ...parsed, description: "changed" }, null, 2)));
  rejectManifest("repository-metadata", Buffer.from(JSON.stringify({ ...parsed, repository: { ...parsed.repository, directory: "wrong" } }, null, 2)));
  rejectManifest("top-order", Buffer.from(JSON.stringify({ scripts: parsed.scripts, ...parsed }, null, 2)));
  rejectManifest("export-condition-order", Buffer.from(JSON.stringify({ ...parsed, exports: { ".": { default: "./dist/index.js", import: parsed.exports["."].import } } }, null, 2)));
  rejectManifest("nested-types-order", Buffer.from(JSON.stringify({ ...parsed, exports: { ".": { ...parsed.exports["."], import: { default: "./dist/index.js", types: "./dist/index.d.ts" } } } }, null, 2)));
  rejectManifest("metadata-order", Buffer.from(JSON.stringify({ ...parsed, repository: { directory: parsed.repository.directory, type: "git", url: parsed.repository.url } }, null, 2)));
  rejectManifest("script-order", Buffer.from(JSON.stringify({ ...parsed, scripts: Object.fromEntries(Object.entries(parsed.scripts).reverse()) }, null, 2)));
  rejectManifest("unknown-manifest-field", Buffer.from(JSON.stringify({ ...parsed, unknown: true }, null, 2)));
  rejectManifest("final-LF", Buffer.concat([actual, Buffer.from("\n")]));
  for (const row of payload.filter(row => row.path !== "package.json")) {
    assert.throws(() => verifyFreshArchivePayload(leaf, payload.map(item => item.path === row.path ? { ...item, sha256: hash(Buffer.concat([published.get(item.path)!, Buffer.from("mutation")])) } : item), renderer), /fresh production\/archive mismatch/u);
    cases.push(`payload:${row.path}`);
  }
  for (const rows of [payload.slice(1), [...payload, payload[0]!], [...payload, { path: "unknown.txt", sha256: hash("unknown") }]])
    assert.throws(() => verifyFreshArchivePayload(leaf, rows, renderer), /fresh production\/archive mismatch/u);
  for (const extra of [{ dependencies: { injected: "workspace:*" } }, { publishConfig: { directory: "other" } }, { bin: "index.js" }, { packageManager: "pnpm@11.20.0" }, { pnpm: {} }, { peerDependenciesMeta: {} }, { unknown: true }])
    assert.throws(() => freshPublishedManifest(Buffer.from(JSON.stringify({ ...JSON.parse(source.toString()), ...extra })), renderer), /unknown manifest field/u);
  assert.throws(() => freshPublishedManifest(Buffer.from('{"name":"x","name":"x"}'), renderer), /duplicate qualification evidence field/u);
  assert.throws(() => freshPublishedManifest(Buffer.from(JSON.stringify({ ...JSON.parse(source.toString()), repository: "https://example.com" })), renderer), /manifest record required/u);
  assert.throws(() => freshPublishedManifest(source, join(leaf, "package.json")), /pinned pack renderer binding/u);
  const evidence = { scope: "fixed retained archive and original production; no main/acquisition/repack", old: "RED", new: "GREEN",
    sourceSHA256: hash(source), actualManifestSHA256: hash(actual), expectedManifestSHA256: hash(expected), archiveSHA256: hash(readFileSync(archivePath)),
    rendererSHA256: hash(readFileSync(renderer)), productionCompilerCommand: [process.execPath, ...args], productionCompilerExit: compiled.status,
    payloadEntries: payload.length, rejected: cases, inventoriesRejected: ["missing", "duplicate", "unknown"], fullE2E: false };
  writeFileSync(join(leaf, "red-green.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence));
});

// This boundary test uses the real strict-emitted driver and helper. The two
// external qualification test sources are absent here; inert entry placeholders
// exercise seal membership only and never stand in for qualification execution.
test("strict emitted runtime closure admits normal members and rejects missing extra changed members", { skip: !compiledCorrectionDriver }, async () => {
  const scratch = mkdtempSync(join(tmpdir(), "lifecycle-emitted-seal-"));
  const root = join(scratch, "compiled");
  const driverPath = "packages/lifecycle-kernel/tests/run-node20-qualification.mjs";
  const helperPath = "tests/qualification/lifecycle-tool-prepare.mjs";
  const contractsPath = "tests/qualification/lifecycle-qualification-contracts.mjs";
  const externalTests = ["node20-qualification.test.mjs", "qualification-admission.test.mjs"].map(name => `packages/lifecycle-kernel/tests/${name}`);
  const emittedRoot = resolve(dirname(compiledCorrectionDriver!), "../../..");
  cpSync(emittedRoot, root, { recursive: true });
  for (const path of externalTests) writeFileSync(join(root, path), "export {};\n");
  // Erased contracts are not imported at runtime. Prove loading without them.
  rmSync(join(root, contractsPath), { force: true });
  const driver = await import(pathToFileURL(join(root, driverPath)).href) as {
    verifyCompilationSeal(seal: import("./lifecycle-qualification-contracts.mts").CompilationSeal,
      expected: Omit<import("./lifecycle-qualification-contracts.mts").CompilationSeal, "emission" | "production">,
      emission: readonly string[], production: readonly string[]): void;
  };
  const config = join(scratch, "nearest-config.json"), production = join(scratch, "production.mjs");
  writeFileSync(config, "{}\n"); writeFileSync(production, "export {};\n");
  const expected = { runId: "nearest-seal", parentInvocation: "nearest-parent", compiledRoot: realpathSync(root),
    source: "a".repeat(64), toolManifest: "b".repeat(64), config: inputIdentity(config), compiler: inputIdentity(realpathSync("node_modules/typescript/bin/tsc")) };
  const seal = { ...expected, emission: frozenInventory(root), production: [inputIdentity(production)] };
  const verify = (candidate = seal, identity = expected) => driver.verifyCompilationSeal(candidate, identity,
    frozenInventory(root).map(row => row.path), [production]);
  verify();
  assert.deepEqual(seal.emission.map(row => relative(root, row.path).split("\\").join("/")).sort(), [driverPath, helperPath, ...externalTests].sort());
  for (const path of [driverPath, helperPath, ...externalTests]) {
    const full = join(root, path), bytes = readFileSync(full);
    rmSync(full); assert.throws(() => verify()); writeFileSync(full, bytes);
    writeFileSync(full, Buffer.concat([bytes, Buffer.from("\n// changed runtime member\n")]));
    assert.throws(() => verify(), /immutable input drift/u); writeFileSync(full, bytes);
    // A newly sealed incomplete set must also fail, not just a stale digest.
    assert.throws(() => verify({ ...seal, emission: seal.emission.filter(row => row.path !== full) }));
  }
  const extra = join(root, "extra.mjs"); writeFileSync(extra, "export {};\n");
  assert.throws(() => verify());
  assert.throws(() => verify({ ...seal, emission: frozenInventory(root) })); rmSync(extra);
  for (const key of ["source", "toolManifest", "parentInvocation", "compiledRoot"] as const)
    assert.throws(() => verify(seal, { ...expected, [key]: "swapped" }), /parent compilation seal mismatch/u);
  // A compiler may leave its erased type-only companion. It is optional,
  // sealed as a byproduct, and cannot carry executable code or imports.
  writeFileSync(join(root, contractsPath), "export {};\n");
  const companionSeal = { ...seal, emission: frozenInventory(root) }; verify(companionSeal);
  writeFileSync(join(root, contractsPath), "import './injected.mjs';\n");
  assert.throws(() => verify({ ...seal, emission: frozenInventory(root) }));
  rmSync(join(root, contractsPath)); verify();
  console.log(JSON.stringify({ scope: "nearest real emitted driver/helper seal; external tests are inert membership placeholders",
    runtimeMembers: seal.emission.map(row => relative(root, row.path)), contractsRequired: false, normalClosure: "PASS",
    rejected: ["missing", "resealed-missing", "extra", "resealed-extra", "changed", "source", "tools", "parent", "root", "executable-contracts"] }));
});
