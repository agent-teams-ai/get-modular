import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, cp, rm } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { join, resolve, relative, posix, isAbsolute, delimiter } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { verifyPackagePayload, restoredDependencyGraph, supportVersions, verifySupportOrigins, nodeSignerPolicy, frozenInventory, inputIdentity, verifyIdentities, verifyInventory, childEnvironment, verifyToolOrigins } from "../../packages/lifecycle-kernel/tests/run-node20-qualification.mts";

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
    const source = `https://registry.npmjs.org/${name.replace("/", "%2f")}/${version}`;
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
