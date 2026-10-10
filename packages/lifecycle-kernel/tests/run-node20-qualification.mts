import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, lstatSync, readdirSync, writeFileSync, existsSync, readlinkSync, statSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, resolve, relative, isAbsolute, delimiter } from "node:path";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

interface Receipt { command: readonly string[]; cwd: string; status: "PASS" | "FAIL" | "EXPECTED_REJECTION"; exitCode: number | null; stdout: string; stderr: string; stdin?: string; bindings?: Record<string, string> }

export interface InputIdentity { path: string; realpath: string; sha256: string; linkTarget?: string }
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
interface TerminalReceipt {
  runId: string; invocationId: string; parentInvocation: string; terminal: string; mode: string; terminalReceiptPath: string;
  completed: string[]; bindings: Record<string, string>; receipts: Receipt[];
  terminalInputs?: { path: string; sha256: string }; inventorySeals?: { path: string; sha256: string };
  archive?: { path: string; sha256: string; sri: string };
}
export function verifyTerminalAssociation(proof: { runId: string; invocationId: string; parentInvocation: string; status: string; mode: string; receipts: string; sha256: string },
  bytes: Uint8Array, child: TerminalReceipt, runId: string, parent: string, expectedInvocation: string, mode: string): void {
  assert.deepEqual([proof.runId, proof.parentInvocation, proof.invocationId, proof.status, proof.mode], [runId, parent, expectedInvocation, "PASS", mode], "printed child invocation mismatch");
  assert.equal(proof.sha256, createHash("sha256").update(bytes).digest("hex"), "printed terminal digest mismatch");
  assert.deepEqual([child.runId, child.parentInvocation, child.invocationId, child.terminal, child.mode], [runId, parent, expectedInvocation, "PASS", mode], "terminal association mismatch");
  assert.equal(child.terminalReceiptPath, join(dirname(proof.receipts), `${expectedInvocation}.terminal.json`), "swapped terminal path");
  assert.equal(basename(proof.receipts), "receipts.json", "swapped printed receipt path");
}
export function verifyChildReceipt(child: TerminalReceipt, runId: string, parentInvocation: string, mode: "compiled" | "build", expected: ReadonlyMap<string, GateExpectation>): void {
  assert.equal(child.runId, runId, "child run mismatch");
  assert.equal(child.parentInvocation, parentInvocation, "child invocation mismatch");
  assert.match(child.invocationId, /^[a-f0-9-]{36}$/u, "missing child invocation");
  assert.notEqual(child.invocationId, parentInvocation, "reused child invocation");
  assert.equal(child.terminal, "PASS", "nonterminal child"); assert.equal(child.mode, mode, "wrong child mode");
  assert.deepEqual(child.completed, ["admission", "archive", "runtimes:4", "types:6", "mutants:2"], "partial child gates");
  assert.match(child.bindings.compilationSeal ?? "", /^[a-f0-9]{64}$/u, "missing child seal");
  assert.match(child.bindings.archive ?? "", /^[a-f0-9]{64}$/u, "missing child archive");
  assert.ok(child.receipts.length > 0 && child.receipts.every(row => row.status === "PASS" || row.status === "EXPECTED_REJECTION"), "failed or missing child commands");
  const required = mode === "build" ? ["build:production", "build:current", "build:strict", "build:emit", "child:compiled"] :
    ["admission", "pack", "archive:read", "archive:extract", ...["20.0.0", "20.20.0", "24.21.0", "26.10.0"].flatMap(version => [`runtime:${version}`, `exports:${version}`]),
      ...[0, 1, 2].flatMap(compiler => ["NodeNext", "Bundler"].flatMap(resolution => [`types:${compiler}:${resolution}:positive`, `types:${compiler}:${resolution}:negative`])),
      "baseline:revocation", "mutant:revocation", "baseline:custody", "mutant:custody"];
  assert.deepEqual([...expected.keys()].sort(), [...required].sort(), "partial trusted gate plan");
  const gates = child.receipts.filter(row => row.bindings?.gate !== undefined);
  assert.deepEqual(gates.map(row => row.bindings!.gate).sort(), [...required].sort(), "partial, extra or duplicated executed gates");
  assert.equal(new Set(gates.map(row => row.bindings!.commandInvocation)).size, gates.length, "reused command invocation");
  for (const row of gates) {
    const binding = row.bindings!, reject = binding.gate!.endsWith(":negative") || binding.gate!.startsWith("mutant:");
    assert.deepEqual([binding.runId, binding.invocationId, binding.parentInvocation], [runId, child.invocationId, parentInvocation], "swapped command association");
    assert.match(binding.commandInvocation!, /^[a-f0-9-]{36}$/u, "missing command invocation");
    for (const key of ["source", "toolManifest", "rootRuntime", "executable", "inputs", "arguments", "environment"]) assert.match(binding[key] ?? "", /^[a-f0-9]{64}$/u, `missing command identity: ${key}`);
    assert.equal(binding.rootRuntime, child.bindings.rootRuntime, "swapped command runtime");
    assert.equal(binding.source, child.bindings.source, "swapped command source"); assert.equal(binding.toolManifest, child.bindings.toolManifest, "swapped command tools");
    assert.equal(binding.arguments, createHash("sha256").update(JSON.stringify(row.command.slice(1))).digest("hex"), "swapped command arguments");
    assert.equal(basename(binding.inputReferences ?? ""), `input-index-${binding.inputs}.json`, "missing input reference");
    assert.equal(row.status, reject ? "EXPECTED_REJECTION" : "PASS", "wrong gate outcome");
    assert.equal(row.exitCode, expectedGateExit(binding.gate!), "wrong gate exit");
    if (binding.gate!.endsWith(":negative")) verifyTypeDiagnostics(binding.gate!, row.stdout); assert.ok(row.command.length > 1, "no-op gate command");
    if (binding.gate === "build:production") assert.deepEqual(row.command.slice(2), ["-p", "packages/lifecycle-kernel/tsconfig.json", "--skipLibCheck", "false", "--target", "ES2022"], "wrong production compiler gate");
    if (binding.gate === "build:current") assert.deepEqual(row.command.slice(2), ["-p", "packages/lifecycle-kernel/tsconfig.json", "--noEmit", "--skipLibCheck", "false"], "wrong current compiler gate");
    if (binding.gate === "build:strict") assert.deepEqual(row.command.slice(2), ["--noEmit", "-p", "packages/lifecycle-kernel/tsconfig.qualification-all.json"], "wrong strict compiler gate");
    if (binding.gate === "build:emit") assert.ok(row.command.slice(2, 5).join("|") === "-p|packages/lifecycle-kernel/tsconfig.qualification.json|--outDir" && row.command.length === 6, "wrong emission compiler gate");
    if (binding.gate === "child:compiled") assert.ok(row.command[1]!.endsWith("run-node20-qualification.mjs") && ["--compiled", "--build-child", "--seal", "--compiled-root", "--parent-artifacts"].every(flag => row.command.includes(flag)), "wrong compiled child gate");
    if (binding.gate!.startsWith("build:") || binding.gate!.startsWith("types:")) assert.match(binding.compiler ?? "", /^[a-f0-9]{64}$/u, "missing effective compiler identity");
    if (binding.gate!.startsWith("runtime:")) assert.deepEqual(row.command.slice(1), ["--test", "qualification.test.mjs", "legacy.test.mjs"], "wrong runtime tests");
    if (binding.gate!.startsWith("types:")) assert.ok(row.command.includes("-p") && row.command.at(-1)!.endsWith(reject ? "-negative.json" : ".json"), "wrong type config");
    if (binding.gate!.startsWith("mutant:") || binding.gate!.startsWith("baseline:")) assert.ok(row.command[1] === "--test" && row.command[2]!.startsWith("--test-name-pattern=^") && row.command[3] === "qualification.test.mjs", "wrong mutation launcher");
    verifyGateIdentity(row, expected.get(binding.gate!)!);
  }
}
export interface GateExpectation { command: readonly string[]; cwd: string; bindings: Record<string, string>; inputs: readonly InputIdentity[] }
export function expectedGateExit(gate: string): number {
  return /^types:[01]:(NodeNext|Bundler):negative$/u.test(gate) ? 2 : gate.endsWith(":negative") || gate.startsWith("mutant:") ? 1 : 0;
}
export function verifyTypeDiagnostics(gate: string, diagnostics: string): void {
  const current = gate.startsWith("types:2:");
  assert.deepEqual([...diagnostics.matchAll(/^negative\.mts\((\d+),(\d+)\): error TS(\d+):/gmu)].map(match => match.slice(1).map(Number)),
    [[5, 21, current ? 2741 : 2345], [7, 20, current ? 2741 : 2345], [9, 19, 2345], [11, 15, 2741], [14, 13, 2741]], "wrong type diagnostic sites");
  assert.equal((diagnostics.match(/error TS\d+:/gu) ?? []).length, 5, "extra type diagnostics");
}
export function verifyGateIdentity(row: Receipt, expected: GateExpectation): void {
  assert.deepEqual(row.command, expected.command, "swapped gate command");
  assert.equal(row.cwd, expected.cwd, "swapped gate cwd");
  for (const key of ["source", "toolManifest", "rootRuntime", "executable", "compiler", "environment", "config", "test", "archive", "effectiveFiles"])
    assert.equal(row.bindings?.[key], expected.bindings[key], `swapped gate identity: ${key}`);
  const inputs = verifyInputReferences({ path: row.bindings!.inputReferences!, sha256: row.bindings!.inputs! });
  for (const input of expected.inputs) assert.deepEqual(inputs.find(row => row.path === input.path), input, "missing or swapped gate input");
}
export const qualificationTypes = `import { createLifecycleKernel, type Generation, type CallLease, type CustodyLease } from '@get-modular/lifecycle-kernel';
      const k = createLifecycleKernel(); const g: Generation = k.stage(); const c = k.beginCall(g); const d = k.retainCustody(g);
      if (c.ok && d.ok) { const call: CallLease = c.value; const custody: CustodyLease = d.value; k.checkCall(call); k.release(custody);
        // @ts-expect-error custody cannot authorize calls
        k.checkCall(custody);
        // @ts-expect-error call cannot be used as generation
        k.activate(call);
        // @ts-expect-error generation cannot be released
        k.release(g);
        // @ts-expect-error private identities cannot be copied
        const copied: CallLease = { ...call }; void copied;
      }
      // @ts-expect-error opaque generation cannot be forged
      const forged: Generation = {}; void forged;`;
export function qualificationConfig(resolution: string, negative: boolean) {
  return { compilerOptions: { strict: true, noEmit: true, skipLibCheck: false, types: [], target: "ES2022",
    module: resolution === "NodeNext" ? "NodeNext" : "ESNext", moduleResolution: resolution }, files: [negative ? "negative.mts" : "types.mts"] };
}
const deepProbe = `import assert from 'node:assert/strict';
      assert.deepEqual(Object.keys(await import('@get-modular/lifecycle-kernel')), ['createLifecycleKernel']);
      for (const path of ['dist/index.js', 'package.json', 'src/index.ts']) {
        await assert.rejects(import('@get-modular/lifecycle-kernel/' + path), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
      }`;
export const archiveReader = `
      const assert = require('node:assert/strict'), crypto = require('node:crypto'), rows = [], waits = [];
      require('tar').t({ file:process.argv[1], strict:true, onReadEntry(entry) {
        const payloadPath = (${archiveEntryPath.toString()})(entry.path, entry.type);
        if (payloadPath === undefined) return;
        waits.push(new Promise((yes, no) => { const hash = crypto.createHash('sha256');
          entry.on('data', data => hash.update(data)); entry.on('error', no);
          entry.on('end', () => { rows.push({path:payloadPath, sha256:hash.digest('hex')}); yes(); }); }));
      }}).then(() => Promise.all(waits)).then(() => {
        assert.equal(new Set(rows.map(row => row.path)).size, rows.length);
        console.log(JSON.stringify(rows.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)));
      }).catch(error => { console.error(error); process.exitCode = 1; });`;
const archiveExtractor = "require('tar').x({file:process.argv[1], strip:1, cwd:process.argv[2], strict:true}).catch(error => {console.error(error); process.exitCode=1;})";

export function verifyInputReferences(reference: { path: string; sha256: string }): InputIdentity[] {
  assert.equal(inputIdentity(reference.path).sha256, reference.sha256, "input index digest mismatch");
  const chunks = JSON.parse(readFileSync(reference.path, "utf8")) as { path: string; sha256: string }[];
  assert.ok(Array.isArray(chunks) && chunks.length > 0 && chunks.length <= 10000, "partial input index");
  assert.equal(new Set(chunks.map(row => row.path)).size, chunks.length, "duplicate input chunks");
  const rows: InputIdentity[] = [];
  for (const chunk of chunks) {
    assert.equal(inputIdentity(chunk.path).sha256, chunk.sha256, "input chunk digest mismatch");
    const contents = JSON.parse(readFileSync(chunk.path, "utf8")) as InputIdentity[];
    assert.ok(Array.isArray(contents) && contents.length > 0 && contents.length <= 750, "partial input chunk");
    rows.push(...contents);
  }
  verifyIdentities(rows);
  return [...rows, inputIdentity(reference.path), ...chunks.map(row => inputIdentity(row.path))];
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
export interface RestoredDependencyGraph {
  readonly roots: Readonly<Record<string, string>>;
  readonly inventories: ReadonlyMap<string, readonly InputIdentity[]>;
  readonly entries: readonly InputIdentity[];
  readonly restored: readonly InputIdentity[];
  readonly sha256: string;
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
// Finite development evidence for the accepted frozen Linux installation, not a
// general pnpm SPI. The renderer branch below was derived from the SRI-authenticated
// pnpm 11.20.0 bundle (cmd-shim 9.0.6). It never imports that private runtime.
export interface PackagePayloadRow { path: string; sha256: string; linkTarget?: string }
export interface InstallerWitness {
  declaringCoordinate: string; declaringManifestSha256: string; dependency: string; version: string;
  edge: string; edgeTarget: string; targetRoot: string; manifestSha256: string;
  binName: string; binDeclaration: string; binSha256: string;
  shimPath: string; shimSha256: string; shimMode: number; originalTarget: string; nodePaths: string[];
}
export interface PackagePayloadProjection {
  schemaVersion: 1; provenance: typeof acceptedInstallerProvenance;
  published: PackagePayloadRow[]; installedPayloadSha256: string;
  witnesses: InstallerWitness[]; witnessesSha256: string;
}
const payloadHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bodyHash = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
const expectedExports = { ".": { import: { types: "./dist/index.d.ts", default: "./dist/index.js" }, default: "./dist/index.js" } };
function manifestOracle(manifest: Record<string, unknown>): void {
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
const acceptedInstallerProvenance = {
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
const installerSourceFiles: Record<string, string> = {
  ".npmrc": "9479ed13cb0dcc39fd8620d84ef5f0c41d1861f6338cde40f70569b0829926ad",
  "pnpm-workspace.yaml": "57765e353bef21dbd7520bd79e11233f20ec89afa65fbe2ad25a9a318b03dab0",
  "pnpm-lock.yaml": "4faa2e99387ea5d5bb5733f655dfca9fadb271bdcf8acad605ef6cf4c005cf51",
  "package.json": "890c74eeeb4762485c128435cd25b5b3d6892df74f0a40ad53f50b1308632e7c",
};
// These are the producer's six public physical inventories, each already bounded
// by frozenInventory. Their union is not itself one package inventory.
const publicToolRoots = ["node20-minimum", "node20", "node24", "node26", "pnpm", "typescript-6.0.3"] as const;
export interface PreparedToolEntry { path: string; sha256: string; kind: string; linkTarget?: string }
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

interface SupportOrigin { id: string; version: string; platform: string; arch: string; status: "verified";
  archiveSha256: string; payloadSha256: string; source: string; method: "package-sri"; sri: string; payloadProjection?: PackagePayloadProjection }
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
    assert.equal(row.source, `https://registry.npmjs.org/${row.id.replace("/", "%2f")}/${row.version}`, "unofficial support origin");
    assert.match(row.sri, /^sha512-[A-Za-z0-9+/]{86}==$/u);
    for (const value of [row.archiveSha256, row.payloadSha256]) assert.match(value, /^[a-f0-9]{64}$/u);
  }
}
interface ToolOrigin {
  id: string; version: string; platform: string; arch: string; status: "verified";
  payloadSha256: string; archiveSha256: string; source: string;
  verification: { method: "signed-shasums" | "package-sri"; receipt: InputIdentity; policyCommit?: string; signer?: string; sri?: string };
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
interface CompilationSeal {
  runId: string; parentInvocation: string; compiledRoot: string;
  source: string; toolManifest: string; config: InputIdentity; compiler: InputIdentity;
  emission: InputIdentity[]; production: InputIdentity[];
}
export function verifyCompilationSeal(seal: CompilationSeal, expected: {
  runId: string; parentInvocation: string; compiledRoot: string; source: string; toolManifest: string;
  config: InputIdentity; compiler: InputIdentity;
}, actualEmission: readonly string[], actualProduction: readonly string[]): void {
  const { emission, production, ...identities } = seal;
  assert.deepEqual(identities, expected, "parent compilation seal mismatch");
  assert.deepEqual(emission.map(row => row.path).sort(), actualEmission.map(path => resolve(path)).sort(), "partial or swapped emission");
  assert.deepEqual(emission.map(row => basename(row.path)).sort(), ["node20-qualification.test.mjs", "qualification-admission.test.mjs", "run-node20-qualification.mjs"], "required compiled inputs");
  assert.ok(production.length > 0, "missing production emission");
  assert.deepEqual(production.map(row => row.path).sort(), actualProduction.map(path => resolve(path)).sort(), "partial or swapped production emission");
  for (const row of emission) assert.equal(dirname(row.path), expected.compiledRoot, "emission root escape");
  verifyIdentities([seal.config, seal.compiler, ...emission, ...production]);
}

export function mutationOutcome(result: { status: number | null; signal: string | null; error?: unknown; stdout: string; stderr: string },
  title: string, message: string, site: string, expected: unknown, actual: unknown, testInput: InputIdentity): void {
  // Node20's TAP transport can parse printed TAP as test events. Require the exact frozen assertion source as well.
  verifyIdentities([testInput]);
  assert.equal(result.error, undefined, "mutation-spawn");
  assert.equal(result.signal, null, "mutation-signal");
  assert.equal(result.status, 1, "mutation-exit");
  assert.equal(result.stderr, "", "mutation-stderr");
  const failures = [...result.stdout.matchAll(/^not ok \d+ - (.+)\n  ---\n([\s\S]*?)\n  \.\.\.$/gmu)];
  assert.equal(failures.length, 1, "mutation-failure-count");
  assert.equal((result.stdout.match(/^not ok /gmu) ?? []).length, 1, "mutation-collateral");
  assert.equal(failures[0]![1], title, "mutation-title");
  const body = failures[0]![2]!.replace(/^  /gmu, "");
  const scalar = (value: string): unknown => {
    if (value === "true" || value === "false") return value === "true";
    assert.match(value, /^'(?:[^']|'')*'$/u, "mutation-scalar");
    return value.slice(1, -1).replace(/''/gu, "'");
  };
  const field = (name: string): unknown => {
    const match = new RegExp(`^${name}:([^\\n]*)(?:\\n((?:  [^\\n]*(?:\\n|$))*))?`, "mu").exec(body);
    assert.ok(match, `mutation-field:${name}`);
    if (match[1]!.trim() === "|-") return (match[2] ?? "").replace(/^  /gmu, "").trimEnd();
    if (match[1]!.trim()) return scalar(match[1]!.trim());
    const rows = (match[2] ?? "").trimEnd().split("\n").map(row => {
      const pair = /^  ([a-z0-9]+): (.+)$/u.exec(row); assert.ok(pair, "mutation-map");
      return [pair[1]!, scalar(pair[2]!)] as const;
    });
    assert.equal(new Set(rows.map(row => row[0])).size, rows.length, "mutation-duplicate-key");
    return Object.fromEntries(rows);
  };
  const detail = Object.fromEntries(["failureType", "code", "name", "error", "operator", "expected", "actual", "stack"].map(name => [name, field(name)]));
  assert.equal(detail.failureType, "testCodeFailure");
  assert.equal(detail.code, "ERR_ASSERTION");
  assert.equal(detail.name, "AssertionError");
  assert.equal(detail.error, message, "mutation-site-message");
  assert.equal(detail.operator, "deepStrictEqual");
  assert.deepEqual(detail.expected, expected, "mutation-expected");
  assert.deepEqual(detail.actual, actual, "mutation-actual");
  assert.ok(typeof detail.stack === "string" && detail.stack.split("\n")[0]!.endsWith(`(${site})`), "mutation-site");
  assert.match(result.stdout, /\n# fail 1\n# cancelled 0\n/u);
  assert.ok(!/uncaughtException|unhandledRejection|Warning:|ERR_MODULE_NOT_FOUND/u.test(result.stdout), "mutation-terminal");
}

export interface SyntaxNode { kind: string; start: number; end: number; text?: string; children: SyntaxNode[] }
export interface ParsedSource { root: SyntaxNode; malformed: boolean; references: number }
export function childEnvironment(): Record<string, string> {
  return Object.fromEntries(["CI", "PATH", "Path", "SystemRoot", "HOME", "USERPROFILE", "TEMP", "TMP", "TMPDIR"]
    .flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]!]]));
}
export function parseSource(node: string, library: string, path: string, source: string, capture?: (receipt: Receipt) => void): ParsedSource {
  // The pinned compiler child serializes syntax only; qualification decisions remain typed below.
  const serializer = `const ts = require(process.argv[1]); const source = require('node:fs').readFileSync(0, 'utf8');
    const ast = ts.createSourceFile(process.argv[2], source, ts.ScriptTarget.Latest, true);
    const visit = node => ({kind:ts.isImportTypeNode(node) ? 'ImportType' : ts.SyntaxKind[node.kind], start:node.getStart(ast), end:node.end,
      ...(typeof node.text === 'string' ? {text:node.text} : {}), children:node.getChildren(ast).map(visit)});
    const refs = ts.preProcessFile(source, true, true);
    console.log(JSON.stringify({root:visit(ast), malformed:ast.parseDiagnostics.length > 0,
      references:refs.typeReferenceDirectives.length + refs.referencedFiles.length + refs.libReferenceDirectives.length}));`;
  const result = spawnSync(node, ["--eval", serializer, library, path], { input: source, encoding: "utf8", env: childEnvironment(), maxBuffer: 16 * 1024 * 1024 });
  capture?.({ command: [node, "--eval", serializer, library, path], cwd: process.cwd(), stdin: source,
    status: result.status === 0 && !result.error && !result.signal ? "PASS" : "FAIL", exitCode: result.status,
    stdout: result.stdout ?? "", stderr: result.stderr ?? String(result.error ?? "") });
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as ParsedSource;
}
export function packedImportReason(parsed: ParsedSource, path: string, files: readonly string[]): string | undefined {
  if (parsed.malformed) return "malformed-source";
  if (parsed.references) return "reference-directive";
  const declaration = path.endsWith(".d.ts");
  let reason: string | undefined;
  function specifier(text: string): string | undefined {
    if (text.startsWith("node:")) return "builtin";
    if (!text.startsWith("./") && !text.startsWith("../")) return "external-import";
    const target = posix.normalize(posix.join(posix.dirname(path), text));
    if (!target.startsWith("dist/")) return "relative-escape";
    if (!text.endsWith(".js")) return "unsupported-target";
    const resolved = declaration ? target.replace(/\.js$/u, ".d.ts") : target;
    return files.includes(resolved) ? undefined : declaration ? "missing-declaration" : "missing-runtime";
  }
  function visit(node: SyntaxNode): void {
    if (reason) return;
    const literal = node.children.find(child => child.kind === "StringLiteral");
    if (node.kind === "ImportDeclaration" || node.kind === "ExportDeclaration") {
      if (literal?.text !== undefined) reason = specifier(literal.text);
    } else if (node.kind === "CallExpression" && node.children[0]?.kind === "ImportKeyword") reason = "dynamic-import";
    else if (node.kind === "CallExpression" && node.children[0]?.kind === "Identifier" && node.children[0].text === "require") reason = "require";
    else if (node.kind === "ImportEqualsDeclaration") reason = "import-equals";
    else if (node.kind === "ImportType") {
      const argument = node.children.find(child => child.kind === "LiteralType")?.children[0];
      reason = argument?.kind === "StringLiteral" && argument.text !== undefined ? specifier(argument.text) : "nonliteral-import-type";
    }
    for (const child of node.children) visit(child);
  }
  visit(parsed.root);
  return reason;
}
export function relocateRoot(parsed: ParsedSource, source: string, auxiliary: readonly string[] = []): string {
  assert.equal(parsed.malformed, false, "relocation-malformed");
  assert.equal(parsed.references, 0, "relocation-unsupported-import");
  const roots: SyntaxNode[] = [];
  function visit(node: SyntaxNode): void {
    assert.ok(node.kind !== "ImportEqualsDeclaration" && node.kind !== "ImportType", "relocation-unsupported-import");
    if (node.kind === "CallExpression") assert.ok(node.children[0]?.kind !== "ImportKeyword"
      && !(node.children[0]?.kind === "Identifier" && node.children[0].text === "require"), "relocation-unsupported-import");
    if (node.kind === "ImportDeclaration" || node.kind === "ExportDeclaration") {
      const spec = node.children.find(child => child.kind === "StringLiteral");
      assert.ok(node.kind === "ImportDeclaration" && spec?.text !== undefined, "relocation-unsupported-import");
      if (spec.text === "../dist/index.js") roots.push(spec);
      else assert.ok(["node:test", "node:assert/strict", ...auxiliary].includes(spec.text), "relocation-auxiliary");
    }
    for (const child of node.children) visit(child);
  }
  visit(parsed.root);
  assert.equal(roots.length, 1, "relocation-one-root");
  const root = roots[0]!;
  return source.slice(0, root.start) + '"@get-modular/lifecycle-kernel"' + source.slice(root.end);
}

async function digest(bytes: Uint8Array, algorithm = "SHA-256", encoding: "hex" | "base64" = "hex"): Promise<string> {
  return Buffer.from(await globalThis.crypto.subtle.digest(algorithm, Uint8Array.from(bytes))).toString(encoding);
}
async function main(): Promise<void> {
const workspace = process.cwd();
const leaf = join(workspace, "packages/lifecycle-kernel");
const sourceTest = "packages/lifecycle-kernel/tests/node20-qualification.test.mts";
const admissionTest = "packages/lifecycle-kernel/tests/qualification-admission.test.mts";
const toolArgument = process.argv.indexOf("--public-tool-root");
const toolRoot = toolArgument === -1 ? process.env.LIFECYCLE_PUBLIC_TOOL_ROOT : process.argv[toolArgument + 1];
if (!toolRoot) throw new Error("NOT_RUN: supply --public-tool-root PATH or LIFECYCLE_PUBLIC_TOOL_ROOT; no tool fallback");
if (!["v24.21.0", "v26.10.0"].includes(process.version)) throw new Error("NOT_RUN: qualification root requires admitted Node24 or Node26");
assert.ok(process.argv.includes(sourceTest) && process.argv.includes(admissionTest), "exact required test inputs must be supplied");
const tools = resolve(toolRoot);
const nativeNode = process.platform === "win32" ? "node.exe" : "node";
const node24 = join(tools, `node24/${nativeNode}`);
const compiler = join(tools, "typescript-6.0.3/lib/tsc.js");
const pnpm = join(tools, "pnpm/bin/pnpm.mjs");
const minimum = await realpath(join(workspace, "node_modules/typescript-minimum/bin/tsc"));
const current = await realpath(join(workspace, "node_modules/typescript/bin/tsc"));
const output = resolve(process.env.LIFECYCLE_QUALIFICATION_OUTPUT ?? join(tmpdir(), "lifecycle-qualification-evidence"));
await mkdir(output, { recursive: true });
const runRoot = await mkdtemp(join(tmpdir(), "lifecycle-qualification-"));
const artifacts = join(output, basename(runRoot));
await mkdir(artifacts, { recursive: true });
const receipts: Receipt[] = [];
const bindings: Record<string, string> = {};
let completed: string[] = [];
const immutable = new Map<string, InputIdentity>();
const sealedInventories = new Map<string, { rows: InputIdentity[]; allowLinks: boolean }>();
const correspondenceChecks: (() => void)[] = [];
function recheck(): void {
  if (immutable.size) verifyIdentities([...immutable.values()]);
  for (const [root, { rows, allowLinks }] of sealedInventories) verifyInventory(root, rows, allowLinks);
  for (const check of correspondenceChecks) check();
}
function sealInventory(root: string, allowLinks = false): void { sealedInventories.set(root, { rows: frozenInventory(root, allowLinks), allowLinks }); }
const parentInvocation = process.env.LIFECYCLE_PARENT_INVOCATION ?? "root";
const requestedInvocation = parentInvocation === "root" ? globalThis.crypto.randomUUID() : process.env.LIFECYCLE_INVOCATION_ID;
assert.ok(requestedInvocation && /^[a-f0-9-]{36}$/u.test(requestedInvocation), "missing parent-assigned invocation");
const invocationId: string = requestedInvocation;
assert.ok(parentInvocation !== "root" || !["--build-child", "--compiled", "--seal", "--parent-artifacts"].some(flag => process.argv.includes(flag)), "internal child requires parent invocation");
const mode = process.argv.includes("--prepare") ? "validate-tools" : process.argv.includes("--compiled") ? "compiled" : process.argv.includes("--build-child") ? "build" : "root";
const driverInput = inputIdentity(fileURLToPath(import.meta.url)); immutable.set(driverInput.path, driverInput);
bindings.driver = driverInput.sha256;
const rootRuntime = inputIdentity(process.execPath); immutable.set(rootRuntime.path, rootRuntime);
Object.assign(bindings, { rootRuntime: rootRuntime.sha256, rootRuntimePath: rootRuntime.realpath, platform: process.platform, arch: process.arch });
const toolReceipts: { path: string; sha256: string; version: string }[] = [];
const runId = process.env.LIFECYCLE_QUALIFICATION_RUN_ID ?? globalThis.crypto.randomUUID();
let terminal: "RUNNING" | "PASS" | "FAIL" = "RUNNING";
let terminalError: string | undefined;
let childReceipt: { path: string; sha256: string } | undefined;
const sourceManifest: { path: string; sha256: string; gitBlob: string }[] = [];
const environment = childEnvironment();
environment.pnpm_config_verify_deps_before_run = "error"; // Preserve checks; refuse automatic installation.
environment.npm_config_offline = "true";
environment.pnpm_config_offline = "true";
environment.LIFECYCLE_PARENT_INVOCATION = invocationId;
environment.LIFECYCLE_QUALIFICATION_RUN_ID = runId;
environment.LIFECYCLE_QUALIFICATION_OUTPUT = output;
environment.LIFECYCLE_PUBLIC_TOOL_ROOT = tools;
async function retain(root: string, paths: readonly string[], destination: string): Promise<unknown[]> {
  const rows = [];
  for (const path of paths) {
    const bytes = await readFile(join(root, path));
    rows.push({ path, sha256: await digest(bytes) });
    await mkdir(dirname(join(destination, path)), { recursive: true });
    await writeFile(join(destination, path), bytes);
    for (const input of [join(root, path), join(destination, path)]) immutable.set(resolve(input), inputIdentity(input));
  }
  const manifest = join(destination, "manifest.json");
  await writeFile(manifest, JSON.stringify(rows, null, 2) + "\n"); immutable.set(manifest, inputIdentity(manifest));
  return rows;
}
let archive: { path: string; sha256: string; sri: string } | undefined;
let terminalInputs: { path: string; sha256: string } | undefined;
let inventorySeals: { path: string; sha256: string } | undefined;
async function sealTerminalInputs(): Promise<void> {
  const roots = [];
  for (const [root, { rows, allowLinks }] of sealedInventories) {
    const references = [];
    for (let offset = 0; offset < rows.length; offset += 750) {
      const bytes = JSON.stringify(rows.slice(offset, offset + 750)), sha256 = await digest(Buffer.from(bytes));
      const path = join(artifacts, `inventory-${sha256}.json`);
      if (existsSync(path)) assert.equal(inputIdentity(path).sha256, sha256);
      else writeFileSync(path, bytes, { flag: "wx" });
      immutable.set(path, inputIdentity(path)); references.push({ path, sha256 });
    }
    roots.push({ root, allowLinks, references });
  }
  const bytes = JSON.stringify(roots), sha256 = await digest(Buffer.from(bytes));
  const path = join(artifacts, `inventory-seals-${sha256}.json`);
  writeFileSync(path, bytes, { flag: "wx" }); immutable.set(path, inputIdentity(path));
  inventorySeals = { path, sha256 }; terminalInputs = inputReferences(); recheck();
}
async function save(): Promise<void> {
  if (!childReceipt) {
    const path = join(artifacts, "child-receipt.json");
    try { childReceipt = { path, sha256: await digest(await readFile(path)) }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const terminalReceiptPath = join(artifacts, `${invocationId}.terminal.json`);
  const bytes = JSON.stringify({ runId, terminal, terminalError, terminalReceiptPath, mode,
    invocationId, parentInvocation,
    sourceManifest, sourceManifestSha256: await digest(Buffer.from(JSON.stringify(sourceManifest))),
    environment, bindings, completed, tools: toolReceipts, archive, childReceipt, receipts, terminalInputs, inventorySeals }, null, 2) + "\n";
  await writeFile(join(artifacts, "receipts.json"), bytes);
  if (terminal !== "RUNNING") await writeFile(terminalReceiptPath, bytes);
}
function inputReferences(): { path: string; sha256: string } {
  const rows = [...immutable.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const chunks = [];
  for (let offset = 0; offset < rows.length; offset += 750) {
    const bytes = JSON.stringify(rows.slice(offset, offset + 750));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const path = join(artifacts, `inputs-${sha256}.json`);
    assert.ok(Buffer.byteLength(bytes) < 1024 * 1024, "input reference size limit");
    if (existsSync(path)) assert.equal(inputIdentity(path).sha256, sha256, "input reference drift");
    else writeFileSync(path, bytes, { flag: "wx" });
    immutable.set(path, inputIdentity(path)); chunks.push({ path, sha256 });
  }
  const bytes = JSON.stringify(chunks), sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = join(artifacts, `input-index-${sha256}.json`);
  if (existsSync(path)) assert.equal(inputIdentity(path).sha256, sha256, "input index drift");
  else writeFileSync(path, bytes, { flag: "wx" });
  immutable.set(path, inputIdentity(path));
  return { path, sha256 };
}
function execute(command: string, args: string[], cwd = workspace, reject = false, gate?: string): string {
  recheck();
  const executable = command === "git" ? (environment.PATH ?? environment.Path ?? "").split(delimiter)
    .map(root => join(root, process.platform === "win32" ? "git.exe" : "git")).find(path => { try { return lstatSync(path).isFile(); } catch { return false; } }) : command;
  assert.ok(executable, "missing executable identity");
  const executableIdentity = inputIdentity(executable);
  const argumentFiles = args.flatMap(arg => { try { const path = resolve(cwd, arg); return lstatSync(path).isFile() ? [inputIdentity(path)] : []; } catch { return []; } });
  for (const input of [executableIdentity, ...argumentFiles]) immutable.set(input.path, input);
  const configIndex = args.indexOf("-p");
  const test = gate && /^(runtime|baseline):/u.test(gate) ? inputIdentity(join(cwd, "qualification.test.mjs"))
    : gate?.startsWith("types:") ? inputIdentity(join(cwd, gate.endsWith(":negative") ? "negative.mts" : "types.mts")) : undefined;
  if (test) immutable.set(test.path, test);
  const inputs = inputReferences();
  const invocationBindings = { ...bindings, ...(gate === undefined ? {} : { gate }), runId, invocationId, parentInvocation, commandInvocation: globalThis.crypto.randomUUID(),
    executable: executableIdentity.sha256, executablePath: executableIdentity.realpath,
    inputs: inputs.sha256, inputReferences: inputs.path,
    arguments: createHash("sha256").update(JSON.stringify(args)).digest("hex"),
    ...(args[0] && [compiler, minimum, current].includes(args[0]) ? { compiler: inputIdentity(args[0]).sha256 } : {}),
    ...(configIndex !== -1 ? { config: inputIdentity(resolve(cwd, args[configIndex + 1]!)).sha256 } : {}),
    ...(test ? { test: test.sha256 } : {}),
    effectiveFiles: JSON.stringify(argumentFiles),
    environment: createHash("sha256").update(JSON.stringify(environment)).digest("hex") };
  const result = spawnSync(executable, args, { cwd, encoding: "utf8", env: environment, maxBuffer: 16 * 1024 * 1024 });
  receipts.push({ command: [command, ...args], cwd,
    status: reject && result.status !== null && result.status !== 0 && !result.error && !result.signal ? "EXPECTED_REJECTION" : result.status === 0 ? "PASS" : "FAIL",
    exitCode: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? String(result.error ?? ""), bindings: invocationBindings });
  recheck();
  assert.deepEqual(inputIdentity(executable), executableIdentity, "executable drift");
  if (result.error) throw result.error;
  assert.equal(result.signal, null, "child terminated by signal");
  if (reject) assert.equal(result.status, expectedGateExit(gate!), "wrong rejecting gate exit");
  else assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
function invokeChild(args: string[], gate: string) {
  const expectedInvocation = globalThis.crypto.randomUUID();
  environment.LIFECYCLE_INVOCATION_ID = expectedInvocation;
  try {
    const stdout = execute(node24, args, workspace, false, gate);
    receipts.at(-1)!.bindings!.childInvocation = expectedInvocation;
    return { expectedInvocation, proof: JSON.parse(stdout) as Parameters<typeof verifyTerminalAssociation>[0] };
  } finally { delete environment.LIFECYCLE_INVOCATION_ID; }
}
function absorbChildInputs(child: TerminalReceipt): void {
  assert.ok(child.terminalInputs && child.inventorySeals, "missing final child input custody");
  const finalInputs = verifyInputReferences(child.terminalInputs);
  for (const input of finalInputs) {
    const original = immutable.get(input.path);
    if (original) assert.deepEqual(input, original, "swapped terminal input");
    immutable.set(input.path, input);
  }
  assert.equal(inputIdentity(child.inventorySeals.path).sha256, child.inventorySeals.sha256, "swapped child inventory seal");
  const roots = JSON.parse(readFileSync(child.inventorySeals.path, "utf8")) as { root: string; allowLinks: boolean; references: { path: string; sha256: string }[] }[];
  assert.ok(Array.isArray(roots) && roots.length > 0 && roots.length <= 10000, "missing child inventories");
  assert.equal(new Set(roots.map(row => row.root)).size, roots.length, "duplicate child inventories");
  for (const { root, allowLinks, references } of roots) {
    assert.ok(Array.isArray(references) && references.length > 0 && references.length <= 10000, "partial child inventory");
    const rows = references.flatMap(reference => {
      assert.equal(inputIdentity(reference.path).sha256, reference.sha256, "swapped inventory payload");
      return JSON.parse(readFileSync(reference.path, "utf8")) as InputIdentity[];
    });
    verifyInventory(root, rows, allowLinks); sealedInventories.set(root, { rows, allowLinks });
  }
  for (const row of child.receipts) {
    assert.ok(row.bindings?.inputs && row.bindings.inputReferences, "missing child input custody");
    for (const input of verifyInputReferences({ path: row.bindings.inputReferences, sha256: row.bindings.inputs })) {
      const original = immutable.get(input.path);
      if (original) assert.deepEqual(input, original, "swapped child input");
      immutable.set(input.path, input);
    }
  }
}
async function childExpectations(child: TerminalReceipt, childArtifacts: string, compiledRoot?: string): Promise<Map<string, GateExpectation>> {
  finitePath(output, relative(output, join(childArtifacts, "receipts.json")).split(process.platform === "win32" ? "\\" : "/").join("/"));
  assert.match(basename(childArtifacts), /^lifecycle-qualification-[A-Za-z0-9]+$/u, "swapped child scratch root");
  assert.equal(dirname(child.terminalReceiptPath), childArtifacts, "swapped child artifacts");
  const childRoot = join(tmpdir(), basename(childArtifacts)), consumer = join(childRoot, "consumer");
  const leafConfig = "packages/lifecycle-kernel/tsconfig.qualification.json";
  const compilation = compiledRoot ?? join(childRoot, "compiled");
  const sealPath = join(output, basename(dirname(compilation)), "compilation-seal.json");
  const seal = JSON.parse(readFileSync(sealPath, "utf8")) as CompilationSeal;
  verifyCompilationSeal(seal, { runId, parentInvocation: compiledRoot ? child.parentInvocation : child.invocationId,
    compiledRoot: realpathSync(compilation), source: bindings.source!, toolManifest: bindings.toolManifest!,
    config: inputIdentity(join(workspace, leafConfig)), compiler: inputIdentity(compiler) },
    frozenInventory(compilation).map(row => row.path), frozenInventory(join(leaf, "dist")).map(row => row.path));
  assert.equal(child.bindings.compilationSeal, inputIdentity(sealPath).sha256, "swapped child compilation identity");
  const archivePath = join(childArtifacts, "get-modular-lifecycle-kernel-0.1.0.tgz");
  // The build terminal refers to its nested compiled archive, never a fabricated build-local archive.
  let archiveInput: InputIdentity;
  if (child.mode === "build") {
    const launch = child.receipts.find(row => row.bindings?.gate === "child:compiled")!;
    const proof = JSON.parse(launch.stdout) as Parameters<typeof verifyTerminalAssociation>[0];
    const nestedPath = finitePath(output, relative(output, proof.receipts).split(process.platform === "win32" ? "\\" : "/").join("/"));
    const nestedBytes = readFileSync(nestedPath), nested = JSON.parse(nestedBytes.toString()) as TerminalReceipt;
    verifyTerminalAssociation(proof, nestedBytes, nested, runId, child.invocationId, launch.bindings!.childInvocation!, "compiled");
    assert.deepEqual(readFileSync(join(childArtifacts, "child-receipt.json")), nestedBytes, "swapped nested compiled receipt");
    assert.deepEqual(readFileSync(nested.terminalReceiptPath), nestedBytes, "swapped nested terminal receipt");
    // Independently reconstruct nested commands from this same parent-validated compilation.
    const expected = await childExpectations(nested, dirname(nestedPath), compilation);
    verifyChildReceipt(nested, runId, child.invocationId, "compiled", expected);
    archiveInput = inputIdentity(join(dirname(nestedPath), basename(archivePath)));
  } else {
    archiveInput = inputIdentity(archivePath);
    const payload = JSON.parse(execute(node24, ["--eval", archiveReader, archivePath])) as { path: string; sha256: string }[];
    verifyFreshArchivePayload(leaf, payload, join(tools, "pnpm/dist/pnpm.mjs"));
    const legacy = readFileSync(join(leaf, "tests/kernel.test.mjs"), "utf8");
    assert.equal(readFileSync(join(consumer, "legacy.test.mjs"), "utf8"), relocateRoot(syntax("test.mjs", legacy), legacy, ["./semantic-suite.mjs"]), "swapped effective legacy test");
    assert.deepEqual(readFileSync(join(consumer, "semantic-suite.mjs")), readFileSync(join(leaf, "tests/semantic-suite.mjs")), "swapped effective semantic suite");
  }
  assert.equal(child.bindings.archive, archiveInput.sha256, "swapped child archive identity");
  assert.deepEqual(child.archive, { path: archiveInput.path, sha256: archiveInput.sha256, sri: "sha512-" + createHash("sha512").update(readFileSync(archiveInput.path)).digest("base64") }, "swapped child archive input");
  const baseEnvironment = { ...childEnvironment(), pnpm_config_verify_deps_before_run: "error", npm_config_offline: "true", pnpm_config_offline: "true",
    LIFECYCLE_PARENT_INVOCATION: child.invocationId, LIFECYCLE_QUALIFICATION_RUN_ID: runId, LIFECYCLE_QUALIFICATION_OUTPUT: output,
    LIFECYCLE_PUBLIC_TOOL_ROOT: tools, LIFECYCLE_EXPECTED_TOOL_MANIFEST_SHA256: bindings.toolManifest!,
    LIFECYCLE_TOOL_MANIFEST: environment.LIFECYCLE_TOOL_MANIFEST!, LIFECYCLE_EXPECTED_SOURCE_SHA256: bindings.source! };
  const commands = new Map<string, { command: string[]; cwd: string }>();
  const add = (gate: string, args: string[], cwd = workspace, launcher = node24) => commands.set(gate, { command: [launcher, ...args], cwd });
  if (child.mode === "build") {
    add("build:production", [compiler, "-p", "packages/lifecycle-kernel/tsconfig.json", "--skipLibCheck", "false", "--target", "ES2022"]);
    add("build:current", [current, "-p", "packages/lifecycle-kernel/tsconfig.json", "--noEmit", "--skipLibCheck", "false"]);
    add("build:strict", [compiler, "--noEmit", "-p", "packages/lifecycle-kernel/tsconfig.qualification-all.json"]);
    add("build:emit", [compiler, "-p", leafConfig, "--outDir", compilation]);
    add("child:compiled", [join(compilation, "run-node20-qualification.mjs"), sourceTest, admissionTest, "--public-tool-root", tools,
      "--build-child", "--compiled", "--compiled-root", compilation, "--seal", sealPath, "--parent-artifacts", childArtifacts]);
  } else {
    add("admission", ["--test", join(compilation, "qualification-admission.test.mjs")]);
    add("pack", [pnpm, "pack", "--pack-destination", childArtifacts], leaf);
    const sealedDriver = await import(pathToFileURL(join(compilation, "run-node20-qualification.mjs")).href) as { archiveReader: string };
    add("archive:read", ["--eval", sealedDriver.archiveReader, archivePath]);
    add("archive:extract", ["--eval", archiveExtractor, archivePath, join(consumer, "node_modules/@get-modular/lifecycle-kernel")]);
    const linked = relocateRoot(syntax("test.mjs", readFileSync(join(compilation, "node20-qualification.test.mjs"), "utf8")), readFileSync(join(compilation, "node20-qualification.test.mjs"), "utf8"));
    assert.equal(readFileSync(join(consumer, "qualification.test.mjs"), "utf8"), linked, "swapped effective runtime test");
    for (const [root, version] of [["node20-minimum", "20.0.0"], ["node20", "20.20.0"], ["node24", "24.21.0"], ["node26", "26.10.0"]]) {
      add(`runtime:${version}`, ["--test", "qualification.test.mjs", "legacy.test.mjs"], consumer, join(tools, root!, nativeNode));
      add(`exports:${version}`, ["--input-type=module", "--eval", deepProbe], consumer, join(tools, root!, nativeNode));
    }
    for (const [index, path] of [minimum, compiler, current].entries()) for (const resolution of ["NodeNext", "Bundler"]) for (const negative of [false, true]) {
      const filename = `tsconfig-${index}-${resolution}${negative ? "-negative" : ""}.json`;
      assert.equal(readFileSync(join(consumer, filename), "utf8"), JSON.stringify(qualificationConfig(resolution, negative)), "swapped effective type config");
      const test = negative ? "negative.mts" : "types.mts";
      assert.equal(readFileSync(join(consumer, test), "utf8"), negative ? qualificationTypes.replace(/\/\/ @ts-expect-error[^\n]*/gu, "") : qualificationTypes, "swapped effective type test");
      add(`types:${index}:${resolution}:${negative ? "negative" : "positive"}`, [path, "-p", filename], consumer);
    }
    for (const [name, title] of [["revocation", "held calls survive quiesce, but retirement fences the actual post-await effect"], ["custody", "custody precedes acquisition and survives observer abandonment and cleanup debt"]]) {
      add(`baseline:${name}`, ["--test", `--test-name-pattern=^${title}$`, "qualification.test.mjs"], consumer, join(tools, "node20-minimum", nativeNode));
      const mutant = join(childRoot, name!);
      assert.equal(readFileSync(join(mutant, "qualification.test.mjs"), "utf8"), linked, "swapped effective mutant test");
      add(`mutant:${name}`, ["--test", `--test-name-pattern=^${title}$`, "qualification.test.mjs"], mutant, join(tools, "node20-minimum", nativeNode));
    }
  }
  return new Map([...commands].map(([gate, { command, cwd }]) => {
    const files = command.slice(1).flatMap(arg => { try { const path = resolve(cwd, arg); return lstatSync(path).isFile() ? [inputIdentity(path)] : []; } catch { return []; } });
    const executable = inputIdentity(command[0]!), config = command.indexOf("-p");
    const test = /^(runtime|baseline|mutant):/u.test(gate) ? inputIdentity(join(cwd, "qualification.test.mjs"))
      : gate.startsWith("types:") ? inputIdentity(join(cwd, gate.endsWith(":negative") ? "negative.mts" : "types.mts")) : undefined;
    const env = gate === "child:compiled" ? { ...baseEnvironment, LIFECYCLE_COMPILATION_SEAL_SHA256: inputIdentity(sealPath).sha256,
      LIFECYCLE_INVOCATION_ID: child.receipts.find(row => row.bindings?.gate === gate)!.bindings!.childInvocation! } : baseEnvironment;
    return [gate, { command, cwd, bindings: { source: bindings.source!, toolManifest: bindings.toolManifest!, rootRuntime: inputIdentity(node24).sha256,
      executable: executable.sha256, environment: createHash("sha256").update(JSON.stringify(env)).digest("hex"), effectiveFiles: JSON.stringify(files),
      ...([minimum, compiler, current].includes(command[1]!) ? { compiler: inputIdentity(command[1]!).sha256 } : {}),
      ...(config !== -1 ? { config: inputIdentity(resolve(cwd, command[config + 1]!)).sha256 } : {}), ...(test ? { test: test.sha256 } : {}),
      ...(child.mode === "compiled" && !["admission", "pack"].includes(gate) ? { archive: archiveInput.sha256 } : {}) },
      inputs: [...new Map([executable, ...files, ...(test ? [test] : []), ...(child.mode === "compiled" && !["admission", "pack"].includes(gate) ? [archiveInput] : [])].map(row => [row.path, row])).values()] }];
  }));
}
async function identify(path: string, args: string[], expected: string, launcher = path): Promise<void> {
  const bytes = await readFile(path); // Missing executable/compiler refuses before any build.
  const version = execute(launcher, args);
  assert.equal(version, expected);
  toolReceipts.push({ path, sha256: await digest(bytes), version });
}
const syntax = (path: string, source: string) => {
  recheck();
  const inputs = inputReferences(), commandInvocation = globalThis.crypto.randomUUID();
  const parsed = parseSource(node24, join(tools, "typescript-6.0.3/lib/typescript.js"), path, source,
    receipt => receipts.push({ ...receipt, bindings: { ...bindings, runId, invocationId, parentInvocation, commandInvocation,
      inputs: inputs.sha256, inputReferences: inputs.path, arguments: createHash("sha256").update(JSON.stringify(receipt.command.slice(1))).digest("hex"),
      executable: inputIdentity(node24).sha256, compiler: inputIdentity(join(tools, "typescript-6.0.3/lib/typescript.js")).sha256,
      stdin: createHash("sha256").update(source).digest("hex"), environment: createHash("sha256").update(JSON.stringify(childEnvironment())).digest("hex") } }));
  recheck();
  return parsed;
};
function importOracle(path: string, source: string, files: readonly string[]): void {
  assert.equal(packedImportReason(syntax(path, source), path, files), undefined, path);
}
async function inventory(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const rows: string[] = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.ok(!entry.isSymbolicLink(), "packed symlinks are forbidden");
    if (entry.isDirectory()) rows.push(...await inventory(root, path));
    else { assert.ok(entry.isFile()); rows.push(path); }
  }
  return rows.sort();
}
try {
  if (process.env.LIFECYCLE_EXPECTED_DRIVER_SHA256 !== undefined) assert.equal(driverInput.sha256, process.env.LIFECYCLE_EXPECTED_DRIVER_SHA256, "driver source drift before qualification");
  const manifestPath = process.env.LIFECYCLE_TOOL_MANIFEST;
  assert.ok(manifestPath, "NOT_RUN: LIFECYCLE_TOOL_MANIFEST must identify the prepared offline closure");
  const manifestBytes = await readFile(manifestPath);
  bindings.toolManifest = await digest(manifestBytes);
  assert.match(process.env.LIFECYCLE_EXPECTED_TOOL_MANIFEST_SHA256 ?? "", /^[a-f0-9]{64}$/u, "missing operator-accepted tool manifest digest");
  assert.equal(bindings.toolManifest, process.env.LIFECYCLE_EXPECTED_TOOL_MANIFEST_SHA256, "swapped tool manifest");
  const toolManifest = parseQualificationEvidenceJSON(manifestBytes.toString()) as { platform: string; arch: string;
    origins: ToolOrigin[]; support: SupportOrigin[]; entries: PreparedToolEntry[] };
  closedFields(toolManifest, ["platform", "arch", "origins", "support", "entries"]);
  verifySupportOrigins(toolManifest.support, process.platform, process.arch, toolManifest.origins);
  assert.equal(toolManifest.platform, process.platform, "unsupported tool platform");
  assert.equal(toolManifest.arch, process.arch, "unsupported tool architecture");
  verifyToolOrigins(toolManifest.origins, process.platform, process.arch);
  for (const row of toolManifest.origins) immutable.set(row.verification.receipt.path, row.verification.receipt);
  assert.match(process.env.LIFECYCLE_EXPECTED_TOOL_MANIFEST_SHA256 ?? "", /^[a-f0-9]{64}$/u, "missing operator-accepted tool manifest digest");
  assert.equal(bindings.toolManifest, process.env.LIFECYCLE_EXPECTED_TOOL_MANIFEST_SHA256, "swapped tool manifest");
  environment.LIFECYCLE_EXPECTED_TOOL_MANIFEST_SHA256 = bindings.toolManifest!;
  verifyToolEntryEnvelope(toolManifest.entries);
  const physicalClosure: InputIdentity[] = [];
  const admitted = new Set<string>();
  for (const row of toolManifest.entries) {
    closedFields(row, ["path", "sha256", "kind"], ["linkTarget"]);
    const installerSource = row.path.startsWith("workspace/") ? row.path.slice(10) : "";
    const configuration = Object.hasOwn(installerSourceFiles, installerSource);
    const path = row.path.startsWith("public-tools/") ? finitePath(tools, row.path.slice(13))
      : row.path.startsWith("workspace/node_modules/") ? finitePath(join(workspace, "node_modules"), row.path.slice(23))
      : configuration ? finitePath(workspace, installerSource) : undefined;
    assert.ok(path, `unsupported tool identity: ${row.path}`);
    if (configuration) {
      assert.ok(row.kind === "file" && lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), "installer configuration kind");
      assert.equal(realpathSync(path), resolve(path), "installer configuration alias");
      assert.equal(row.sha256, installerSourceFiles[installerSource], "installer configuration identity");
    }
    assert.ok(row.kind === "file" || row.kind === "symlink", "unsupported tool manifest kind");
    assert.equal(lstatSync(path).isSymbolicLink(), row.kind === "symlink", "tool entry kind mismatch");
    assert.equal(row.linkTarget, row.kind === "symlink" ? readlinkSync(path) : undefined, "tool link target mismatch");
    assert.ok(row.sha256 && /^[a-f0-9]{64}$/u.test(row.sha256));
    assert.ok(!admitted.has(path), `duplicate tool identity: ${path}`);
    admitted.add(path);
    assert.equal(await digest(await readFile(path)), row.sha256, `corrupt tool: ${path}`);
    immutable.set(resolve(path), inputIdentity(path));
  }
  for (const root of publicToolRoots) {
    const rows = frozenInventory(join(tools, root), true); physicalClosure.push(...rows);
    for (const row of rows) assert.ok(admitted.has(row.path), `unsealed tool content: ${row.path}`);
    sealInventory(join(tools, root), true);
  }
  verifyPublicToolRoots(tools);
  correspondenceChecks.push(() => verifyPublicToolRoots(tools));
  const restoredGraph = restoredDependencyGraph(workspace, process.platform, process.arch);
  physicalClosure.push(...restoredGraph.entries);
  assert.equal(restoredGraph.roots.typescript, dirname(dirname(current)), "restored current compiler mismatch");
  assert.equal(restoredGraph.roots["typescript-minimum"], dirname(dirname(minimum)), "restored minimum compiler mismatch");
  // Every effective resolver root, including equivalent duplicates, is admitted and sealed.
  for (const [root, rows] of restoredGraph.inventories) {
    for (const row of rows) assert.ok(admitted.has(row.path), `unsealed restored dependency: ${row.path}`);
    // Compiler and traversed dependency inventories retain their strict no-link profile.
    sealInventory(root, root === restoredGraph.roots["@agent-teams/engineering-foundation"]);
  }
  for (const name of ["node.json", "base.json"]) {
    const path = realpathSync(join(restoredGraph.roots["@agent-teams/engineering-foundation"]!, "presets/typescript", name));
    assert.ok(admitted.has(path), `unsealed compiler preset: ${path}`);
  }
  const originRoots: Record<string, string> = { "node20-minimum": join(tools, "node20-minimum"), node20: join(tools, "node20"),
    node24: join(tools, "node24"), node26: join(tools, "node26"), pnpm: join(tools, "pnpm"), "typescript-6.0.3": join(tools, "typescript-6.0.3"),
    "typescript-minimum": dirname(dirname(minimum)), typescript: dirname(dirname(current)) };
  for (const origin of toolManifest.origins) {
    const root = originRoots[origin.id]!;
    const payload = frozenInventory(root, true).map(row => ({ path: relative(root, row.path).split(process.platform === "win32" ? "\\" : "/").join("/"), sha256: row.sha256, ...(row.linkTarget === undefined ? {} : { linkTarget: row.linkTarget }) }));
    assert.equal(createHash("sha256").update(JSON.stringify(payload)).digest("hex"), origin.payloadSha256, "origin/extracted payload mismatch");
  }
  for (const origin of toolManifest.support) {
    const root = restoredGraph.roots[origin.id]!;
    for (const row of verifyPhysicalSupportPayload(workspace, root, origin, join(tools, "pnpm/dist/pnpm.mjs"), admitted)) {
      physicalClosure.push(row); immutable.set(row.path, row);
    }
    if (origin.payloadProjection) correspondenceChecks.push(() => {
      verifyPackagePayload(workspace, root, origin, join(tools, "pnpm/dist/pnpm.mjs"), origin.payloadProjection);
    });
    sealInventory(root, true);
  }
  for (const name of Object.keys(installerSourceFiles)) physicalClosure.push(inputIdentity(join(workspace, name)));
  verifyToolClosureEntries(toolManifest.entries, workspace, tools, physicalClosure);
  bindings.toolPhysicalBudget = String(new Set(physicalClosure.map(row => row.path)).size);
  bindings.toolPhysicalClosure = createHash("sha256").update(JSON.stringify(
    [...new Map(physicalClosure.map(row => [row.path, row])).values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0))).digest("hex");
  correspondenceChecks.push(() => verifyToolClosureEntries(toolManifest.entries, workspace, tools, physicalClosure));
  for (const path of [minimum, current, compiler, pnpm, node24]) assert.ok(admitted.has(path), `unsealed launcher: ${path}`);
  assert.ok(["v24.21.0", "v26.10.0"].includes(process.version), "unqualified root runtime");
  const verifiedRoot = join(tools, process.version === "v24.21.0" ? `node24/${nativeNode}` : `node26/${nativeNode}`);
  assert.equal(rootRuntime.sha256, inputIdentity(verifiedRoot).sha256, "root runtime outside verified official payload");
  await writeFile(join(artifacts, "tool-manifest.json"), manifestBytes);
  immutable.set(resolve(manifestPath), inputIdentity(manifestPath));
  environment.LIFECYCLE_TOOL_MANIFEST = resolve(manifestPath);
  const tracked = [...new Set([...execute("git", ["ls-files", "-z"]).split("\0").filter(Boolean),
    "tests/qualification/lifecycle-tool-prepare.mts", "packages/lifecycle-kernel/tsconfig.qualification-all.json"])].sort();
  for (const path of tracked) {
    const bytes = await readFile(join(workspace, path));
    sourceManifest.push({ path, sha256: await digest(bytes),
      gitBlob: await digest(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), "SHA-1") });
    immutable.set(resolve(workspace, path), inputIdentity(join(workspace, path)));
  }
  bindings.source = await digest(Buffer.from(JSON.stringify(sourceManifest)));
  if (parentInvocation !== "root") {
    assert.ok(process.env.LIFECYCLE_EXPECTED_SOURCE_SHA256, "missing parent source identity");
    assert.equal(bindings.source, process.env.LIFECYCLE_EXPECTED_SOURCE_SHA256, "parent source drift before tests");
  }
  environment.LIFECYCLE_EXPECTED_SOURCE_SHA256 = bindings.source;
  await writeFile(join(artifacts, "source-time.json"), JSON.stringify({ head: execute("git", ["rev-parse", "HEAD"]),
    headTree: execute("git", ["rev-parse", "HEAD^{tree}"]), sourceManifest }, null, 2) + "\n");
  const binaries = [
    [`node20-minimum/${nativeNode}`, "v20.0.0"], [`node20/${nativeNode}`, "v20.20.0"],
    [`node24/${nativeNode}`, "v24.21.0"], [`node26/${nativeNode}`, "v26.10.0"],
  ] as const;
  for (const [path, version] of binaries) await identify(join(tools, path), ["--version"], version);
  await identify(compiler, [compiler, "--version"], "Version 6.0.3", node24);
  await identify(minimum, [minimum, "--version"], "Version 5.8.3", node24);
  await identify(current, [current, "--version"], "Version 7.0.2", node24);
  await identify(pnpm, [pnpm, "--version"], "11.20.0", node24);
  if (process.argv.includes("--prepare")) {
    assert.ok(process.env.LIFECYCLE_PREPARED_MANIFEST, "preparation requires an explicit destination");
    await writeFile(process.env.LIFECYCLE_PREPARED_MANIFEST, manifestBytes);
    terminal = "PASS";
    return; // Explicit preparation validates supplied pinned tooling; it never installs.
  }
  if (!process.argv.includes("--build-child")) {
    const { proof, expectedInvocation } = invokeChild([fileURLToPath(import.meta.url), ...process.argv.slice(2), "--build-child", "--parent-artifacts", artifacts], "child:build");
    const path = join(artifacts, "child-receipt.json");
    const bytes = await readFile(path); const child = JSON.parse(bytes.toString());
    verifyTerminalAssociation(proof, bytes, child, runId, invocationId, expectedInvocation, "build");
    verifyChildReceipt(child, runId, invocationId, "build", await childExpectations(child, dirname(proof.receipts)));
    absorbChildInputs(child);
    assert.deepEqual(await readFile(finitePath(output, relative(output, proof.receipts).split(process.platform === "win32" ? "\\" : "/").join("/"))), bytes, "printed receipt counterpart mismatch");
    assert.deepEqual(await readFile(child.terminalReceiptPath), bytes, "swapped child terminal receipt");
    completed = child.completed;
    archive = child.archive;
    assert.equal(inputIdentity(archive!.path).sha256, child.bindings.archive, "child archive drift");
    immutable.set(archive!.path, inputIdentity(archive!.path));
    Object.assign(bindings, { compilationSeal: child.bindings.compilationSeal, archive: child.bindings.archive });
    assert.equal(child.parentInvocation, invocationId, "swapped child invocation");
    assert.ok(typeof child.invocationId === "string" && child.invocationId !== invocationId, "missing child invocation");
    assert.deepEqual(child.sourceManifest, sourceManifest);
    childReceipt = { path, sha256: await digest(bytes) };
    for (const receiptPath of [path, child.terminalReceiptPath, proof.receipts]) immutable.set(receiptPath, inputIdentity(receiptPath));
  } else {
  assert.equal(process.version, "v24.21.0");
  assert.equal(await realpath(process.execPath), await realpath(node24), "verified build child identity");
  if (!process.argv.includes("--compiled")) {
    execute(node24, [compiler, "-p", "packages/lifecycle-kernel/tsconfig.json", "--skipLibCheck", "false", "--target", "ES2022"], workspace, false, "build:production");
    execute(node24, [current, "-p", "packages/lifecycle-kernel/tsconfig.json", "--noEmit", "--skipLibCheck", "false"], workspace, false, "build:current");
    await retain(leaf, (await inventory(join(leaf, "dist"))).map(path => `dist/${path}`), join(artifacts, "production-emitted"));
    execute(node24, [compiler, "--noEmit", "-p", "packages/lifecycle-kernel/tsconfig.qualification-all.json"], workspace, false, "build:strict");
    execute(node24, [compiler, "-p", "packages/lifecycle-kernel/tsconfig.qualification.json", "--outDir", join(runRoot, "compiled")], workspace, false, "build:emit");
    await retain(join(runRoot, "compiled"), await inventory(join(runRoot, "compiled")), join(artifacts, "emitted"));
    sealInventory(join(runRoot, "compiled"));
    sealInventory(join(leaf, "dist"));
    bindings.emitted = await digest(await readFile(join(artifacts, "emitted/manifest.json")));
    const seal: CompilationSeal = { runId, parentInvocation: invocationId, compiledRoot: await realpath(join(runRoot, "compiled")),
      source: bindings.source!, toolManifest: bindings.toolManifest!,
      config: inputIdentity(join(leaf, "tsconfig.qualification.json")), compiler: inputIdentity(compiler),
      emission: (await inventory(join(runRoot, "compiled"))).map(path => inputIdentity(join(runRoot, "compiled", path))),
      production: (await inventory(join(leaf, "dist"))).map(path => inputIdentity(join(leaf, "dist", path))) };
    const sealPath = join(artifacts, "compilation-seal.json");
    await writeFile(sealPath, JSON.stringify(seal));
    environment.LIFECYCLE_COMPILATION_SEAL_SHA256 = inputIdentity(sealPath).sha256;
    immutable.set(sealPath, inputIdentity(sealPath));
    await save();
    const { proof, expectedInvocation } = invokeChild([join(runRoot, "compiled/run-node20-qualification.mjs"), sourceTest, admissionTest,
      "--public-tool-root", tools, "--build-child", "--compiled", "--compiled-root", join(runRoot, "compiled"), "--seal", sealPath, "--parent-artifacts", artifacts], "child:compiled");
    const childPath = join(artifacts, "child-receipt.json");
    const childBytes = await readFile(childPath);
    const child = JSON.parse(childBytes.toString());
    verifyTerminalAssociation(proof, childBytes, child, runId, invocationId, expectedInvocation, "compiled");
    verifyChildReceipt(child, runId, invocationId, "compiled", await childExpectations(child, dirname(proof.receipts), join(runRoot, "compiled")));
    absorbChildInputs(child);
    assert.deepEqual(await readFile(finitePath(output, relative(output, proof.receipts).split(process.platform === "win32" ? "\\" : "/").join("/"))), childBytes, "printed compiled receipt counterpart mismatch");
    assert.deepEqual(await readFile(child.terminalReceiptPath), childBytes, "swapped compiled terminal receipt");
    completed = child.completed;
    archive = child.archive;
    assert.equal(inputIdentity(archive!.path).sha256, child.bindings.archive, "child archive drift");
    immutable.set(archive!.path, inputIdentity(archive!.path));
    Object.assign(bindings, { compilationSeal: child.bindings.compilationSeal, archive: child.bindings.archive });
    assert.equal(child.parentInvocation, invocationId, "swapped compiled child invocation");
    assert.equal(child.bindings.compilationSeal, environment.LIFECYCLE_COMPILATION_SEAL_SHA256, "missing child seal validation");
    assert.deepEqual(child.sourceManifest, sourceManifest);
    childReceipt = { path: childPath, sha256: await digest(childBytes) };
    for (const receiptPath of [childPath, child.terminalReceiptPath, proof.receipts]) immutable.set(receiptPath, inputIdentity(receiptPath));
  } else {
    const compiledArgument = process.argv.indexOf("--compiled-root");
    const compiled = process.argv[compiledArgument + 1];
    assert.ok(compiledArgument !== -1 && compiled);
    const sealArgument = process.argv.indexOf("--seal");
    const sealPath = process.argv[sealArgument + 1];
    assert.ok(sealArgument !== -1 && sealPath && process.env.LIFECYCLE_COMPILATION_SEAL_SHA256, "missing parent compilation seal");
    const sealIdentity = inputIdentity(sealPath);
    assert.equal(sealIdentity.sha256, process.env.LIFECYCLE_COMPILATION_SEAL_SHA256, "swapped parent compilation seal");
    const seal = JSON.parse(await readFile(sealPath, "utf8")) as CompilationSeal;
    verifyCompilationSeal(seal, { runId, parentInvocation, compiledRoot: await realpath(compiled), source: bindings.source!,
      toolManifest: bindings.toolManifest!, config: inputIdentity(join(leaf, "tsconfig.qualification.json")), compiler: inputIdentity(compiler) },
      (await inventory(compiled)).map(path => join(compiled, path)), (await inventory(join(leaf, "dist"))).map(path => join(leaf, "dist", path)));
    assert.equal(await realpath(fileURLToPath(import.meta.url)), join(seal.compiledRoot, "run-node20-qualification.mjs"), "arbitrary compiled driver");
    for (const row of [sealIdentity, ...seal.emission, ...seal.production]) immutable.set(row.path, row);
    sealInventory(compiled);
    sealInventory(join(leaf, "dist"));
    bindings.compilationSeal = sealIdentity.sha256;
    execute(node24, ["--test", join(compiled, "qualification-admission.test.mjs")], workspace, false, "admission");
    completed.push("admission");
    const packed = execute(node24, [pnpm, "pack", "--pack-destination", artifacts], leaf, false, "pack");
    const filename = packed.split("\n").at(-1);
    assert.ok(typeof filename === "string" && filename.endsWith(".tgz"));
    const archivePath = resolve(artifacts, filename);
    const bytes = await readFile(archivePath);
    archive = { path: archivePath, sha256: await digest(bytes), sri: "sha512-" + await digest(bytes, "SHA-512", "base64") };
    immutable.set(archivePath, inputIdentity(archivePath));
    bindings.archive = archive.sha256;
    // Read payloads independently before extraction; filesystem inventories alone do not prove archive correspondence.
    const payload = JSON.parse(execute(node24, ["--eval", archiveReader, archivePath], workspace, false, "archive:read")) as { path: string; sha256: string }[];
    verifyFreshArchivePayload(leaf, payload, join(tools, "pnpm/dist/pnpm.mjs"));
    await writeFile(join(artifacts, "archive-payload.json"), JSON.stringify(payload));
    const consumer = join(runRoot, "consumer");
    const installed = join(consumer, "node_modules/@get-modular/lifecycle-kernel");
    await mkdir(installed, { recursive: true });
    execute(node24, ["--eval", archiveExtractor, archivePath, installed], workspace, false, "archive:extract");
    const files = await inventory(installed);
    assert.deepEqual(files, ["CHANGELOG.md", "LICENSE", "README.md", "package.json", "dist/index.js", "dist/index.d.ts",
      "dist/composition/root.js", "dist/composition/root.d.ts", "dist/features/lifecycle/kernel.js", "dist/features/lifecycle/kernel.d.ts",
      "dist/features/lifecycle/types.js", "dist/features/lifecycle/types.d.ts"].sort());
    const manifest: Record<string, unknown> = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
    assert.deepEqual(files.map(path => ({ path, sha256: inputIdentity(join(installed, path)).sha256 })), payload, "archive/installed mismatch");
    await retain(installed, files, join(artifacts, "installed"));
    sealInventory(installed);
    bindings.installed = await digest(await readFile(join(artifacts, "installed/manifest.json")));
    completed.push("archive");
    manifestOracle(manifest);
    assert.throws(() => manifestOracle({ ...manifest, dependencies: { "node:fs": "*" } }), /zero dependencies/u);
    assert.throws(() => manifestOracle({ ...manifest, exports: { ...expectedExports, "./internal": "./dist/index.js" } }));
    for (const file of files.filter(path => path.endsWith(".js") || path.endsWith(".d.ts"))) {
      importOracle(file, await readFile(join(installed, file), "utf8"), files);
    }
    await writeFile(join(consumer, "package.json"), '{"type":"module","private":true}\n');
    const emitted = await readFile(join(compiled, "node20-qualification.test.mjs"), "utf8");
    const linked = relocateRoot(syntax("test.mjs", emitted), emitted);
    await writeFile(join(consumer, "qualification.test.mjs"), linked);
    await writeFile(join(artifacts, "qualification.test.mjs.txt"), linked);
    await writeFile(join(artifacts, "emitted-artifact.json"), JSON.stringify({
      compiler: "6.0.3", unlinkedSha256: await digest(Buffer.from(emitted)),
      linkedSha256: await digest(Buffer.from(linked)), relocation: "../dist/index.js -> @get-modular/lifecycle-kernel",
    }, null, 2) + "\n");
    // Mechanically relocate the retained legacy suite to the installed public root.
    await cp(join(leaf, "tests/semantic-suite.mjs"), join(consumer, "semantic-suite.mjs"));
    await writeFile(join(consumer, "legacy.test.mjs"), relocateRoot(syntax("test.mjs", await readFile(join(leaf, "tests/kernel.test.mjs"), "utf8")), await readFile(join(leaf, "tests/kernel.test.mjs"), "utf8"), ["./semantic-suite.mjs"]));

    await retain(consumer, ["package.json", "qualification.test.mjs", "legacy.test.mjs", "semantic-suite.mjs"], join(artifacts, "effective-runtime-tests"));
    for (const [path] of binaries) {
      assert.equal(await digest(await readFile(archivePath)), archive.sha256);
      execute(join(tools, path), ["--test", "qualification.test.mjs", "legacy.test.mjs"], consumer, false, `runtime:${binaries.find(row => row[0] === path)![1].slice(1)}`);
      execute(join(tools, path), ["--input-type=module", "--eval", deepProbe], consumer, false, `exports:${binaries.find(row => row[0] === path)![1].slice(1)}`);
    }
    completed.push("runtimes:4");

    await writeFile(join(consumer, "types.mts"), qualificationTypes);
    await writeFile(join(consumer, "negative.mts"), qualificationTypes.replace(/\/\/ @ts-expect-error[^\n]*/gu, ""));
    await retain(consumer, ["types.mts", "negative.mts"], join(artifacts, "effective-type-tests"));
    for (const compilerPath of [minimum, compiler, current]) {
      for (const resolution of ["NodeNext", "Bundler"]) {
        const config = qualificationConfig(resolution, false);
        const name = `tsconfig-${[minimum, compiler, current].indexOf(compilerPath)}-${resolution}`;
        await writeFile(join(consumer, `${name}.json`), JSON.stringify(config));
        await retain(consumer, [`${name}.json`], join(artifacts, "effective-configs", name));
        execute(node24, [compilerPath, "-p", `${name}.json`], consumer, false, `types:${[minimum, compiler, current].indexOf(compilerPath)}:${resolution}:positive`);
        // Without suppression every negative must produce a real public-type error.
        await writeFile(join(consumer, `${name}-negative.json`), JSON.stringify({ ...config, files: ["negative.mts"] }));
        await retain(consumer, [`${name}-negative.json`], join(artifacts, "effective-configs", name + "-negative"));
        const diagnostics = execute(node24, [compilerPath, "-p", `${name}-negative.json`], consumer, true, `types:${[minimum, compiler, current].indexOf(compilerPath)}:${resolution}:negative`);
        verifyTypeDiagnostics(`types:${[minimum, compiler, current].indexOf(compilerPath)}:${resolution}:negative`, diagnostics);
      }
    }
    completed.push("types:6");
    for (const [name, before, after, title, message, expected, actual] of [
      ["revocation", 'return refused("revoked");', 'return accepted("admitted");', "held calls survive quiesce, but retirement fences the actual post-await effect", "post-await-revocation", "", { 0: "write" }],
      ["custody", "record.custody++;", "record.custody += 0;", "custody precedes acquisition and survives observer abandonment and cleanup debt", "pending-custody", { ok: false, reason: "retained-work" }, { ok: true, value: "retired" }],
    ] as const) {
      const mutant = join(runRoot, name);
      await cp(consumer, mutant, { recursive: true });
      const kernelPath = join(mutant, "node_modules/@get-modular/lifecycle-kernel/dist/features/lifecycle/kernel.js");
      const source = await readFile(kernelPath, "utf8");
      assert.ok(source.includes(before), `mutation target missing: ${name}`);
      await writeFile(kernelPath, source.replace(before, after));
      const mutantInputs = (await inventory(mutant)).map(path => inputIdentity(join(mutant, path)));
      for (const row of mutantInputs) immutable.set(row.path, row);
      sealInventory(mutant);
      const mutantTest = inputIdentity(join(mutant, "qualification.test.mjs"));
      assert.equal(mutantTest.sha256, inputIdentity(join(consumer, "qualification.test.mjs")).sha256, "swapped mutant test");
      const args = ["--test", `--test-name-pattern=^${title}$`, "qualification.test.mjs"];
      execute(join(tools, `node20-minimum/${nativeNode}`), args, consumer, false, `baseline:${name}`); // Same targeted baseline must pass.
      recheck(); verifyInventory(mutant, mutantInputs);
      const inputs = inputReferences(), commandInvocation = globalThis.crypto.randomUUID();
      const result = spawnSync(join(tools, `node20-minimum/${nativeNode}`), args, { cwd: mutant, encoding: "utf8", env: environment });
      recheck(); verifyInventory(mutant, mutantInputs);
      const line = linked.split("\n").findIndex(row => row.includes(`"${message}"`)) + 1;
      const column = linked.split("\n")[line - 1]!.indexOf("assert.deepEqual") + 8;
      receipts.push({ command: [join(tools, `node20-minimum/${nativeNode}`), ...args], cwd: mutant, status: "FAIL", exitCode: result.status, stdout: result.stdout, stderr: result.stderr,
        bindings: { ...bindings, gate: `mutant:${name}`, runId, invocationId, parentInvocation, commandInvocation, test: mutantTest.sha256,
          inputs: inputs.sha256, inputReferences: inputs.path, arguments: createHash("sha256").update(JSON.stringify(args)).digest("hex"),
          executable: inputIdentity(join(tools, `node20-minimum/${nativeNode}`)).sha256,
          effectiveFiles: JSON.stringify([mutantTest]),
          environment: createHash("sha256").update(JSON.stringify(environment)).digest("hex") } });
      mutationOutcome(result, title, message, `${pathToFileURL(join(mutant, "qualification.test.mjs")).href}:${line}:${column}`, expected, actual,
        mutantTest);
      receipts.at(-1)!.status = "EXPECTED_REJECTION";
    }
    completed.push("mutants:2");
    bindings.packedOracle = createHash("sha256").update(JSON.stringify({ files, exports: expectedExports, payload })).digest("hex");
  }
  }
  for (const row of sourceManifest) assert.equal(await digest(await readFile(join(workspace, row.path))), row.sha256, `source changed during qualification: ${row.path}`);
  recheck();
  await sealTerminalInputs();
  terminal = "PASS";
} catch (error) { terminal = "FAIL"; terminalError = String(error); throw error;
} finally {
  await save();
  const parent = process.argv.indexOf("--parent-artifacts");
  if (parent !== -1) await cp(join(artifacts, "receipts.json"), join(process.argv[parent + 1]!, "child-receipt.json"));
  const terminalPath = join(artifacts, "receipts.json");
  console.log(JSON.stringify({ runId, invocationId, parentInvocation, mode, status: terminal, receipts: terminalPath, sha256: inputIdentity(terminalPath).sha256 }));
}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) {
    const output = resolve(process.env.LIFECYCLE_QUALIFICATION_OUTPUT ?? join(tmpdir(), "lifecycle-qualification-evidence"));
    await mkdir(output, { recursive: true });
    await writeFile(join(output, `refusal-${globalThis.crypto.randomUUID()}.json`), JSON.stringify({ terminal: "FAIL",
      runId: process.env.LIFECYCLE_QUALIFICATION_RUN_ID ?? null, error: String(error), command: process.argv,
      runtime: { path: process.execPath, version: process.version, sha256: await digest(await readFile(process.execPath)) },
      source: { path: fileURLToPath(import.meta.url), sha256: await digest(await readFile(fileURLToPath(import.meta.url))) },
    }, null, 2) + "\n");
    throw error;
  }
}
