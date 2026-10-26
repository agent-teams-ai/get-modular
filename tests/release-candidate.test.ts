import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { hostname, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import { checkReleaseCandidate } from "@agent-teams/release-checks";
import { releaseCandidateConformanceCases } from "@agent-teams/release-checks/conformance";
import { checkGeneratedCandidate, difference, prepareRelease, verifyRelease, versionPreparedRelease } from "../architecture/tooling/release-candidate/host.ts";
import { assertNodeQualification, array, custody, engineAt, git, historicalFile, historicalSnapshot, decodeHistoricalBatch, hash, record, snapshot, text } from "../architecture/tooling/release-candidate/io.ts";
import { assertRetainedBuildInputs, retainedBuildPaths, retainedSource, type RetainedToolingSuccessor } from "../architecture/tooling/npm-release/policy.ts";

import { assertPromotionBranch, assertPromotionReceipt, baselinePaths, plannedBaselines, produceBaselines } from "../architecture/tooling/release-candidate/baselines.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nodeModules = join(repositoryRoot, "node_modules");
const require = createRequire(import.meta.url);
function write(root: string, path: string, contents: string | object): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), typeof contents === "string" ? contents : `${JSON.stringify(contents, null, 2)}\n`);
}
function read(root: string, path: string): string { return readFileSync(join(root, path), "utf8"); }
function commit(root: string, message: string): string {
  git(root, "add", "--all");
  const identity = ["-c", "user.name=iliya", "-c", "user.email=iliyazelenkog@gmail.com"];
  for (const role of ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"]) {
    assert.match(git(root, ...identity, "var", role), /^iliya <iliyazelenkog@gmail\.com> \d+ [+-]\d{4}\n$/u,
      `Fixture ${role} must retain the canonical owner identity`);
  }
  git(root, ...identity, "commit", "--quiet", "-m", message);
  return git(root, "rev-parse", "HEAD").trim();
}
function changeset(root: string, id: string, requests: Record<string, string>, summary = "Exercise the accepted release fixture."): void {
  write(root, `.changeset/${id}.md`, `---\n${Object.keys(requests).length === 0 ? "" : stringify(requests)}---\n\n${summary}\n`);
}
interface FixtureOptions {
  readonly ignored?: readonly string[];
  readonly privateVersioning?: boolean;
  readonly numericRange?: boolean;
  readonly copiedEngine?: boolean;
}
function resolvedEnginePackage(from: string, name: string, installations: readonly string[]): string {
  const resolver = createRequire(from);
  let entry: string;
  try { entry = realpathSync(resolver.resolve(`${name}/package.json`)); }
  catch { entry = realpathSync(resolver.resolve(name)); }
  const owner = installations.toSorted((left, right) => right.length - left.length).find(path => {
    const child = relative(dirname(path), entry);
    return !isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`);
  });
  assert(owner, `Fixture engine dependency has no captured owner: ${name}`);
  return owner;
}
function copyEngine(root: string): string {
  const original = engineAt(repositoryRoot);
  const cliManifest = realpathSync(require.resolve("@changesets/cli/package.json"));
  const copiedEngine = join(root, "node_modules", "@changesets", "cli");
  const copies = new Map(original.installations.map((path, index) => [path,
    path === cliManifest ? copiedEngine : join(root, "node_modules", ".captured-engine", String(index))]));
  // Copy files independently of the manager's symlink/junction layout. Every
  // dependency edge is rebuilt from actual source resolution, never a name guess.
  for (const [path, target] of copies) {
    cpSync(dirname(path), target, { recursive: true, filter: source => basename(source) !== "node_modules" });
  }
  for (const [path, target] of copies) {
    const metadata = record(JSON.parse(readFileSync(path, "utf8")));
    const optional = record(metadata["optionalDependencies"] ?? {});
    const peers = record(metadata["peerDependenciesMeta"] ?? {});
    const names = Object.keys({ ...record(metadata["dependencies"] ?? {}),
      ...record(metadata["peerDependencies"] ?? {}), ...optional });
    for (const name of names) {
      let source: string;
      try { source = resolvedEnginePackage(path, name, original.installations); }
      catch (error) {
        if (name in optional || record(peers[name] ?? {})["optional"] === true) {continue;}
        throw error;
      }
      const provider = copies.get(source); assert(provider, "Fixture engine closure must be complete");
      const alias = join(target, "node_modules", name);
      mkdirSync(dirname(alias), { recursive: true });
      symlinkSync(provider, alias, process.platform === "win32" ? "junction" : "dir");
    }
  }
  assert.equal(engineAt(root).digest, original.digest, "Fixture engine copy must preserve the entire installed closure");
  return copiedEngine;
}
function createFixture(options: FixtureOptions = {}): { root: string; dispose(): void; copiedEngine?: string } {
  const root = mkdtempSync(join(tmpdir(), "get-modular-release-fixture-"));
  write(root, "package.json", { name: "@get-modular/repository", private: true, version: "0.0.0", type: "module",
    packageManager: "pnpm@11.20.0", devDependencies: { "@changesets/cli": "catalog:" } });
  write(root, "pnpm-workspace.yaml", stringify({ packages: ["packages/*"], catalog: { "@changesets/cli": "3.0.2" } }));
  write(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  write(root, ".npmrc", "ignore-scripts=true\n");
  write(root, ".gitignore", "node_modules/\n*.tgz\ndist/\n");
  write(root, "source.ts", "export const accepted = true;\n");
  write(root, ".changeset/config.json", { changelog: "@changesets/cli/changelog", commit: false, fixed: [], linked: [], access: "public",
    baseBranch: "main", updateInternalDependencies: "patch", ignore: options.ignored ?? [],
    ...(options.privateVersioning === undefined ? {} : { privatePackages: { version: options.privateVersioning, tag: false } }) });
  const packages: Record<string, unknown>[] = [
    { name: "@get-modular/core", version: "0.6.0" },
    { name: "@get-modular/assembly", version: "0.6.0", dependencies: { "@get-modular/core": options.numericRange === true ? "workspace:^0.6.0" : "workspace:^" } },
    { name: "@get-modular/resources", version: "0.2.0" },
    { name: "@get-modular/conformance", version: "0.4.0", peerDependencies: { "@get-modular/core": "workspace:^", "@get-modular/assembly": "workspace:^", "@get-modular/resources": "workspace:^" } },
    { name: "@get-modular/observation", version: "0.1.0", peerDependencies: { "@get-modular/resources": "workspace:^" } },
    { name: "@get-modular/lifecycle-kernel", version: "0.1.0", private: true },
    { name: "@fixture/without-version", private: true, dependencies: { "@get-modular/core": "workspace:*" } },
  ];
  for (const manifest of packages) {
    const id = text(manifest.name).split("/").at(-1); assert(id !== undefined && id !== "");
    write(root, `packages/${id}/package.json`, { ...manifest, type: "module", exports: { ".": "./index.js" } });
    write(root, `packages/${id}/index.js`, "export const fixture = true;\n");
    if (manifest.version !== undefined) {write(root, `packages/${id}/CHANGELOG.md`, `# Changelog\n\n## ${text(manifest.version)}\n\nPreviously accepted history.\n`);}
  }
  let copiedEngine: string | undefined;
  if (options.copiedEngine === true) {
    copiedEngine = copyEngine(root);
  } else {
    mkdirSync(join(root, "node_modules"));
    for (const entry of readdirSync(nodeModules)) {
      if (!statSync(join(nodeModules, entry)).isDirectory()) {continue;}
      symlinkSync(join(nodeModules, entry), join(root, "node_modules", entry), process.platform === "win32" ? "junction" : "dir");
    }
  }
  git(root, "init", "--quiet", "-b", "main");
  return { root, dispose: () => { rmSync(root, { recursive: true, force: true }); }, ...(copiedEngine === undefined ? {} : { copiedEngine }) };
}

await test("the installed public checker executes its one shared conformance corpus", () => {
  assert(releaseCandidateConformanceCases.length > 0);
  for (const fixture of releaseCandidateConformanceCases) {
    const report = checkReleaseCandidate(fixture.input);
    assert.equal(report.outcome, fixture.expected.outcome, fixture.id);
    assert.deepEqual([...new Set(report.diagnostics.map(item => item.code))].toSorted(), fixture.expected.diagnosticCodes, fixture.id);
    assert.deepEqual(report.packageChanges, fixture.expected.packageChanges, fixture.id);
  }
});

await test("actual Changesets 3 plans direct and dependent releases and preserves symbolic ranges", () => {
  const subject = createFixture();
  try {
    changeset(subject.root, "release", { "@get-modular/core": "minor", "@get-modular/resources": "minor" });
    commit(subject.root, "fixture: accepted symbolic release");
    const prepared = prepareRelease(subject.root);
    assert(Object.isFrozen(prepared.expected.plan.releases));
    assert.equal(prepared.expected.packages.length, 8, "private root and all private members remain classified");
    assert.equal(prepared.expected.packages.find(item => item.name === "@fixture/without-version")?.versioning, "unversioned");
    const result = versionPreparedRelease(prepared);
    assert.deepEqual(result.report.packageChanges.map(item => [item.packageName, item.newVersion]), [
      ["@get-modular/assembly", "0.6.1"], ["@get-modular/conformance", "0.4.1"], ["@get-modular/core", "0.7.0"],
      ["@get-modular/observation", "0.1.1"], ["@get-modular/resources", "0.3.0"],
    ]);
    assert.equal(record(record(JSON.parse(read(subject.root, "packages/assembly/package.json"))).dependencies)["@get-modular/core"], "workspace:^");
    assert.deepEqual(result.observed.consumptions.map(item => item.intentId), ["release"]);
  } finally { subject.dispose(); }
});

await test("actual Resources patch uses only its genuine intent and leaves unrelated versions unchanged", () => {
  const subject = createFixture();
  try {
    changeset(subject.root, "resource-fix", { "@get-modular/resources": "patch" }, "Reject close reentry while preserving exactly one close owner.");
    commit(subject.root, "fixture: resource close correction");
    const result = versionPreparedRelease(prepareRelease(subject.root));
    assert.deepEqual(result.report.packageChanges, [{ packageName: "@get-modular/resources", manifestPath: "packages/resources/package.json", oldVersion: "0.2.0", newVersion: "0.2.1" }]);
    assert(result.observed.diff.every(item => item.path === ".changeset/resource-fix.md" || item.path.startsWith("packages/resources/")));
  } finally { subject.dispose(); }
});

await test("no release does not invoke version or consume empty, ignored or private intents", () => {
  const subject = createFixture({ ignored: ["@get-modular/observation"], privateVersioning: false });
  try {
    changeset(subject.root, "empty", {});
    assert.match(read(subject.root, ".changeset/empty.md"), /^---\n---\n/u, "Use the engine's ordinary empty frontmatter");
    changeset(subject.root, "ignored", { "@get-modular/observation": "minor" });
    changeset(subject.root, "private", { "@get-modular/lifecycle-kernel": "minor" });
    commit(subject.root, "fixture: retained intents without release");
    const prepared = prepareRelease(subject.root);
    assert.equal(prepared.hasRelease, false);
    assert.deepEqual(prepared.expected.intents.find(item => item.id === "empty")?.requests, []);
    const checked = versionPreparedRelease(prepared);
    assert.deepEqual(checked.observed.diff, []);
    assert.deepEqual(checked.observed.consumptions, []);
    for (const id of ["empty", "ignored", "private"]) {assert(existsSync(join(subject.root, `.changeset/${id}.md`)));}
  } finally { subject.dispose(); }
});

for (const hasRelease of [true, false]) {
  await test(`actual reader retains documentation custody with ${hasRelease ? "a release" : "no release"}`, () => {
    const subject = createFixture();
    try {
      const documents = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".hidden.md", "upper.MD"]
        .flatMap(name => [`.changeset/${name}`, `.changeset/pre/${name}`]);
      // Separate directories also exercise case variants on case-insensitive filesystems.
      documents.push(".changeset/readme.md", ".changeset/pre/ReAdMe.md");
      const contents = "# Local release documentation\n\nPreserve these instructions.\n";
      for (const path of documents) {write(subject.root, path, contents);}
      if (hasRelease) {changeset(subject.root, "release", { "@get-modular/resources": "patch" });}
      // The subject intentionally owns these files even if a user's global
      // excludesfile ignores agent documentation such as CLAUDE.md.
      git(subject.root, "add", "--force", "--", ...documents);
      commit(subject.root, "fixture: accepted reader documentation");
      const prepared = prepareRelease(subject.root);
      assert.equal(prepared.hasRelease, hasRelease);
      assert.deepEqual(prepared.expected.intents.map(item => item.id), hasRelease ? ["release"] : []);
      for (const path of documents) {
        assert.equal(prepared.before[path]?.contents, contents);
        assert(!prepared.expected.permittedChanges.some(item => item.path === path));
      }
      write(subject.root, ".changeset/AGENTS.md", `${contents}Hidden source edit.\n`);
      assert.throws(() => versionPreparedRelease(prepared), /inputs-drifted-before-version/u);
      write(subject.root, ".changeset/AGENTS.md", contents);
      const checked = versionPreparedRelease(prepared);
      assert.deepEqual(checked.observed.consumptions.map(item => item.intentId), hasRelease ? ["release"] : []);
      assert(checked.observed.diff.every(item => !documents.includes(item.path)));
      for (const path of documents) {
        write(subject.root, path, `${contents}Hidden candidate edit.\n`);
        assert.equal(difference(prepared.before, snapshot(subject.root)).find(item => item.path === path)?.classification, "repository-file");
        assert.throws(() => checkGeneratedCandidate(prepared), /diff.unexpected/u);
        write(subject.root, path, contents);
      }
      rmSync(join(subject.root, ".changeset/AGENTS.md"));
      assert.throws(() => checkGeneratedCandidate(prepared), /diff.unexpected/u);
    } finally { subject.dispose(); }
  });
}

await test("a mixed actual release consumes empty housekeeping and retains ineligible intents", () => {
  const subject = createFixture({ ignored: ["@get-modular/observation"], privateVersioning: false });
  try {
    changeset(subject.root, "release", { "@get-modular/core": "patch" });
    changeset(subject.root, "empty", {});
    assert.match(read(subject.root, ".changeset/empty.md"), /^---\n---\n/u, "Housekeeping uses the same authentic empty form beside a release");
    changeset(subject.root, "ignored", { "@get-modular/observation": "minor" });
    changeset(subject.root, "private", { "@get-modular/lifecycle-kernel": "minor" });
    commit(subject.root, "fixture: mixed participation");
    const result = versionPreparedRelease(prepareRelease(subject.root));
    assert.deepEqual(result.observed.consumptions.map(item => item.intentId), ["empty", "release"]);
    assert(existsSync(join(subject.root, ".changeset/private.md")));
    assert(existsSync(join(subject.root, ".changeset/ignored.md")));
  } finally { subject.dispose(); }
});

await test("actual dependency rewrites outside the version-only contract reject before a commit", () => {
  const subject = createFixture({ numericRange: true });
  try {
    changeset(subject.root, "release", { "@get-modular/core": "minor" });
    const source = commit(subject.root, "fixture: unsupported numeric workspace rewrite");
    assert.throws(() => versionPreparedRelease(prepareRelease(subject.root)), /manifest.content-changed/u);
    assert.equal(git(subject.root, "rev-parse", "HEAD").trim(), source);
  } finally { subject.dispose(); }
});

await test("actual source and engine drift between planning and versioning fail before mutation", () => {
  const subject = createFixture({ copiedEngine: true });
  try {
    changeset(subject.root, "release", { "@get-modular/resources": "patch" });
    commit(subject.root, "fixture: bound execution");
    const prepared = prepareRelease(subject.root);
    const accepted = read(subject.root, ".changeset/config.json");
    write(subject.root, ".changeset/config.json", accepted.replace('"patch"', '"minor"'));
    assert.throws(() => versionPreparedRelease(prepared), /inputs-drifted-before-version/u);
    write(subject.root, ".changeset/config.json", accepted);
    assert(subject.copiedEngine !== undefined && subject.copiedEngine !== "");
    const entry = join(subject.copiedEngine, "dist/index.mjs");
    writeFileSync(entry, `${readFileSync(entry, "utf8")}\n// fixture substitution\n`);
    assert.throws(() => versionPreparedRelease(prepared), /execution-custody-drift/u);
    assert(existsSync(join(subject.root, ".changeset/release.md")));
  } finally { subject.dispose(); }
});

for (const mode of ["request", "summary"] as const) {
  await test(`source intent rejects a forged collected ${mode} despite stable captured engine custody`, () => {
    const subject = createFixture({ copiedEngine: true });
    try {
      changeset(subject.root, "release", { "@get-modular/resources": "patch" });
      commit(subject.root, "fixture: independent source intent facts");
      assert(subject.copiedEngine !== undefined);
      // Node deliberately refuses type stripping inside node_modules. Compile
      // the maintained, strict-checked helper before binding the corrupted engine.
      execFileSync(process.execPath, [join(repositoryRoot, "node_modules/typescript/bin/tsc"),
        "-p", join(repositoryRoot, "tests/tsconfig.forged-changesets-status.json"), "--outDir", subject.copiedEngine]);
      writeFileSync(join(subject.copiedEngine, "forged-status-mode"), mode);
      const manifest = record(JSON.parse(readFileSync(join(subject.copiedEngine, "package.json"), "utf8")));
      writeFileSync(join(subject.copiedEngine, "package.json"), JSON.stringify({ ...manifest, bin: { ...record(manifest["bin"]), changeset: "./forged-changesets-status.js" } }));
      assert.throws(() => prepareRelease(subject.root), mode === "request" ? /candidate.intent-plan-request-drift/u : /candidate.intent-plan-summary-drift/u);
      assert(existsSync(join(subject.root, ".changeset/release.md")), "Rejection must precede versioning and intent removal");
      assert.equal(record(JSON.parse(read(subject.root, "packages/resources/package.json")))["version"], "0.2.0");
    } finally { subject.dispose(); }
  });
}

await test("initial accepted-source binding rejects index-hidden edits before planning", () => {
  const subject = createFixture();
  try {
    changeset(subject.root, "release", { "@get-modular/resources": "patch" });
    commit(subject.root, "fixture: exact processed source");
    git(subject.root, "update-index", "--assume-unchanged", "source.ts");
    write(subject.root, "source.ts", "export const accepted = false;\n");
    assert.equal(git(subject.root, "status", "--porcelain"), "", "Git status must actually hide this counterexample");
    assert.throws(() => prepareRelease(subject.root), /candidate.unaccepted-source/u);
    assert(existsSync(join(subject.root, ".changeset/release.md")));
    assert.equal(record(JSON.parse(read(subject.root, "packages/resources/package.json")))["version"], "0.2.0");
  } finally { subject.dispose(); }
});

await test("initial accepted-source binding preserves LF checkout and binary bytes under Windows autocrlf policy", () => {
  const subject = createFixture();
  try {
    write(subject.root, ".gitattributes", "* text=auto eol=lf\n*.dat binary\n");
    writeFileSync(join(subject.root, "fixture.dat"), Buffer.from([0, 13, 10, 255]));
    changeset(subject.root, "empty", {});
    commit(subject.root, "fixture: admitted LF and binary source");
    git(subject.root, "config", "core.autocrlf", "true");
    rmSync(join(subject.root, "source.ts"));
    git(subject.root, "-c", "core.autocrlf=true", "checkout", "--", "source.ts");
    assert.equal(read(subject.root, "source.ts"), "export const accepted = true;\n");
    assert.deepEqual(readFileSync(join(subject.root, "fixture.dat")), Buffer.from([0, 13, 10, 255]));
    const prepared = prepareRelease(subject.root);
    assert.equal(prepared.hasRelease, false);
    assert.deepEqual(versionPreparedRelease(prepared).observed.diff, []);
  } finally { subject.dispose(); }
});

await test("a foreign physical root cannot replace the bound repository", () => {
  const subject = createFixture(); const foreign = createFixture();
  const retained = `${subject.root}-owned`;
  try {
    changeset(subject.root, "release", { "@get-modular/resources": "patch" });
    commit(subject.root, "fixture: intended source"); commit(foreign.root, "fixture: foreign source");
    const prepared = prepareRelease(subject.root);
    renameSync(subject.root, retained);
    symlinkSync(foreign.root, subject.root, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => checkGeneratedCandidate(prepared), /execution-custody-drift/u);
  } finally {
    if (existsSync(retained)) { rmSync(subject.root, { recursive: true, force: true }); renameSync(retained, subject.root); }
    subject.dispose(); foreign.dispose();
  }
});

await test("independent observation rejects hidden manifest edits, arbitrary output and changelog history edits", () => {
  const subject = createFixture();
  try {
    changeset(subject.root, "release", { "@get-modular/resources": "patch" });
    commit(subject.root, "fixture: observe all generated files");
    const prepared = prepareRelease(subject.root); versionPreparedRelease(prepared);
    const resourceManifest = "packages/resources/package.json"; const valid = read(subject.root, resourceManifest);
    for (const edit of [{ scripts: { postinstall: "unexpected" } }, { exports: { ".": "./other.js" } }, { dependencies: { foreign: "1.0.0" } }, { version: "0.2.9" }]) {
      write(subject.root, resourceManifest, { ...record(JSON.parse(valid)), ...edit });
      assert.throws(() => checkGeneratedCandidate(prepared), /manifest.content-changed|plan.version-mismatch/u);
    }
    write(subject.root, resourceManifest, valid);
    for (const path of ["unlisted-output.txt", "unexpected.tgz", "dist/foreign.js", "__proto__", "packages/unlisted/package.json", "architecture/public-api/core.json"]) {
      write(subject.root, path, path.endsWith("package.json") ? { name: "@fixture/unlisted", private: true } : "not an admitted output\n");
      assert.throws(() => checkGeneratedCandidate(prepared), /candidate.rejected/u);
      rmSync(join(subject.root, path));
    }
    const changelog = "packages/resources/CHANGELOG.md";
    write(subject.root, changelog, read(subject.root, changelog).replace("Previously accepted history.", "Rewritten history."));
    assert.throws(() => checkGeneratedCandidate(prepared), /changelog-history-drift/u);
  } finally { subject.dispose(); }
});

await test("a current-base replay works without local main and rejects later generated-content tampering", () => {
  const subject = createFixture();
  try {
    changeset(subject.root, "release", { "@get-modular/resources": "patch" });
    const base = commit(subject.root, "fixture: accepted owner source");
    versionPreparedRelease(prepareRelease(subject.root));
    const head = commit(subject.root, "chore(release): version packages");
    git(subject.root, "branch", "-m", "fixture-release");
    assert.equal(verifyRelease(subject.root, base, head).report.outcome, "passed");
    assert.equal(git(subject.root, "branch", "--list", "main"), "", "replay must not create a caller-owned main ref");
    const path = "packages/resources/CHANGELOG.md";
    write(subject.root, path, read(subject.root, path).replace("## 0.2.1\n", "## 0.2.1\n\nUnreviewed additional claims.\n"));
    const tampered = commit(subject.root, "fixture: later branch tampering");
    assert.throws(() => verifyRelease(subject.root, base, tampered), /generated-output-drift/u);
    git(subject.root, "checkout", "--detach", base);
    write(subject.root, "new-current-main.txt", "current base advanced\n");
    const current = commit(subject.root, "fixture: current main advancement");
    assert.throws(() => verifyRelease(subject.root, current, head), /stale-release-base/u);
  } finally { subject.dispose(); }
});

function blob(source: string): string {
  const bytes = Buffer.from(source);
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}
function retainedSuccessorFixture() {
  const previousWorkspace = execFileSync("git", ["show", `${retainedSource}:pnpm-workspace.yaml`], { cwd: repositoryRoot, encoding: "utf8" });
  const previousLock = execFileSync("git", ["show", `${retainedSource}:pnpm-lock.yaml`], { cwd: repositoryRoot, encoding: "utf8" });
  const previousPolicy = record(JSON.parse(execFileSync("git", ["show", `${retainedSource}:package.json`], { cwd: repositoryRoot, encoding: "utf8" })));
  const name = "@agent-teams/release-checks"; const version = "0.1.0"; const coordinate = `${name}@${version}`;
  // Test-only integrity for a synthetic retained-input graph; this is never a registry receipt.
  const integrity = `sha512-${createHash("sha512").update("independent retained tooling test fixture").digest("base64")}`;
  const engines = { node: "^24.18.0 || ^26.0.0", pnpm: ">=11.17.0 <12" };
  const workspace = record(parse(previousWorkspace)); record(workspace.catalog)[name] = version;
  const lock = record(parse(previousLock));
  record(record(lock.catalogs).default)[name] = { specifier: version, version };
  record(record(record(lock.importers)["."]).devDependencies)[name] = { specifier: "catalog:", version };
  record(lock.packages)[coordinate] = { resolution: { integrity }, engines };
  record(lock.snapshots)[coordinate] = {};
  const currentPolicy = structuredClone(previousPolicy); record(currentPolicy.devDependencies)[name] = "catalog:";
  const previous: Record<string, string> = Object.fromEntries(retainedBuildPaths.map(path => [path, execFileSync("git", ["rev-parse", `${retainedSource}:${path}`], { cwd: repositoryRoot, encoding: "utf8" }).trim()]));
  const successor: RetainedToolingSuccessor = { admission: { schemaVersion: 1, package: name, version, integrity, engines },
    qualifiedWorkspace: previousWorkspace, qualifiedLock: previousLock, currentWorkspace: stringify(workspace), currentLock: stringify(lock) };
  const acceptedLeaf = execFileSync("git", ["rev-parse", "ddf1e0b0053f546f12ca70190b237b4f7e78d09d:architecture/checks/leaf-packages.mjs"],
    { cwd: repositoryRoot, encoding: "utf8" }).trim();
  assert.equal(acceptedLeaf, "5c450cb84c9a077d7203313eb18e2eee8d24faf7");
  const current = { ...previous, "architecture/checks/leaf-packages.mjs": acceptedLeaf,
    "pnpm-workspace.yaml": blob(successor.currentWorkspace), "pnpm-lock.yaml": blob(successor.currentLock) };
  return { name, coordinate, currentPolicy, previousPolicy, current, previous, successor };
}
await test("the retained-input successor admits exactly one pinned zero-edge development leaf", () => {
  const fixture = retainedSuccessorFixture();
  assertRetainedBuildInputs(fixture.current, fixture.previous, fixture.currentPolicy, fixture.previousPolicy, fixture.successor);
  assert.throws(() => { assertRetainedBuildInputs(fixture.current, fixture.previous, fixture.currentPolicy, fixture.previousPolicy,
    { ...fixture.successor, admission: { ...record(fixture.successor.admission), integrity: null } }); }, /qualification-pending/u);
  assert.throws(() => { assertRetainedBuildInputs(fixture.current, fixture.previous, fixture.currentPolicy, fixture.previousPolicy); }, /retained-build-input-drift/u);
});

await test("retained inputs reject compiler, build, graph, peer, runtime, optional and integrity drift", () => {
  const fixture = retainedSuccessorFixture();
  const rejectLock = (mutate: (lock: Record<string, unknown>) => void): void => {
    const lock = record(parse(fixture.successor.currentLock)); mutate(lock); const currentLock = stringify(lock);
    assert.throws(() => { assertRetainedBuildInputs({ ...fixture.current, "pnpm-lock.yaml": blob(currentLock) }, fixture.previous,
      fixture.currentPolicy, fixture.previousPolicy, { ...fixture.successor, currentLock }); }, /release.retained-/u);
  };
  for (const edge of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    rejectLock(lock => { record(record(lock.packages)[fixture.coordinate])[edge] = { typescript: "7.0.2" }; });
    rejectLock(lock => { record(record(lock.snapshots)[fixture.coordinate])[edge] = { typescript: "7.0.2" }; });
  }
  rejectLock(lock => { record(record(record(lock.packages)[fixture.coordinate]).resolution).integrity = "sha512-substituted"; });
  rejectLock(lock => { record(record(lock.importers)["packages/core"]).dependencies = { [fixture.name]: { specifier: "0.1.0", version: "0.1.0" } }; });
  rejectLock(lock => { record(lock.snapshots)["unrelated@1.0.0"] = {}; });
  rejectLock(lock => { record(record(record(lock.catalogs).default).typescript).version = "7.0.3"; });
  const compiler = structuredClone(fixture.currentPolicy); record(compiler.devDependencies).typescript = "7.0.3";
  assert.throws(() => { assertRetainedBuildInputs(fixture.current, fixture.previous, compiler, fixture.previousPolicy, fixture.successor); }, /retained-build-policy-drift/u);
  const build = structuredClone(fixture.currentPolicy); record(build.scripts)["core:build"] = "node foreign-build.ts";
  assert.throws(() => { assertRetainedBuildInputs(fixture.current, fixture.previous, build, fixture.previousPolicy, fixture.successor); }, /retained-build-policy-drift/u);
  assert.throws(() => { assertRetainedBuildInputs({ ...fixture.current, "tsconfig.base.json": "changed" }, fixture.previous, fixture.currentPolicy, fixture.previousPolicy, fixture.successor); }, /retained-build-input-drift/u);
  assert.throws(() => { assertRetainedBuildInputs({ ...fixture.current, "pnpm-lock.yaml": "changed" }, fixture.previous, fixture.currentPolicy, fixture.previousPolicy, fixture.successor); }, /retained-tooling-current-bytes/u);
  const workspace = record(parse(fixture.successor.currentWorkspace)); record(workspace.catalog).typescript = "7.0.3";
  const currentWorkspace = stringify(workspace);
  assert.throws(() => { assertRetainedBuildInputs({ ...fixture.current, "pnpm-workspace.yaml": blob(currentWorkspace) }, fixture.previous,
    fixture.currentPolicy, fixture.previousPolicy, { ...fixture.successor, currentWorkspace }); }, /retained-workspace-drift/u);
});

await test("the version-only action and CI lane preserve publisher separation and the owner PR route", () => {
  const workflow = record(parse(read(repositoryRoot, ".github/workflows/release-version.yml")));
  const job = record(record(workflow.jobs).version);
  assert.deepEqual(job.permissions, { contents: "write", "pull-requests": "write" });
  const steps = job.steps; assert(Array.isArray(steps));
  const action = steps.map(record).find(step => String(step.uses).startsWith("changesets/action@")); assert(action);
  assert.equal(action.uses, "changesets/action@a45c4d594aa4e2c509dc14a9f2b3b67ba3780d0d");
  assert.equal(record(action.with).version, "node architecture/tooling/release-candidate/run.ts version");
  assert(steps.map(record).some(step => step.run === "node architecture/tooling/runtime/dev.ts install-node-qualification"));
  assert(!steps.map(record).some(step => String(step.run).startsWith("pnpm install")));
  assert.equal(record(action.with).publish, undefined);
  assert.equal(record(action.with).createGithubReleases, false);
  assert.equal(action.if, "steps.plan.outputs.has-release == 'true'");
  assert(!read(repositoryRoot, ".github/workflows/npm-release.yml").includes("changesets/action"));
  const manifest = record(JSON.parse(read(repositoryRoot, "package.json")));
  assert.equal(record(manifest.scripts)["release:version"], "node architecture/tooling/release-candidate/run.ts version");
  assert(String(record(manifest.scripts)["runtime:policy:test"]).includes("tests/release-candidate.test.ts"));
  assert(String(record(manifest.scripts)["runtime:policy:test"]).includes("release-candidate/run.ts check-pr"));
});

await test("version generation requires the unchanged-source Node qualification installation", () => {
  const subject = createFixture();
  try {
    assert.throws(() => assertNodeQualification(subject.root), /qualification-source-manager/u);
    const path = "package.json";
    write(subject.root, path, { ...record(JSON.parse(read(subject.root, path))), packageManager: "bun@1.4.3" });
    // The ordinary fixture links an installed tree. Use an independent marker
    // directory to inspect route rejection without changing that shared tree.
    rmSync(join(subject.root, "node_modules"), { recursive: true, force: true });
    mkdirSync(join(subject.root, "node_modules/.pnpm"), { recursive: true });
    assertNodeQualification(subject.root);
    mkdirSync(join(subject.root, "node_modules/.bun"));
    assert.throws(() => assertNodeQualification(subject.root), /node-qualification-install-required/u);
    rmSync(join(subject.root, "node_modules/.bun"), { recursive: true });
    write(subject.root, ".get-modular-node-profile.json", {});
    assert.throws(() => assertNodeQualification(subject.root), /node-qualification-install-required/u);
  } finally { subject.dispose(); }
});

await test("custody rejects nested roots and same-spelling physical replacement", () => {
  const subject = createFixture();
  const retained = `${subject.root}-physical-owner`;
  try {
    changeset(subject.root, "empty", {});
    commit(subject.root, "fixture: physical source custody");
    const prepared = prepareRelease(subject.root);
    mkdirSync(join(subject.root, "nested"));
    assert.throws(() => custody(join(subject.root, "nested")), /candidate.foreign-root/u);
    rmSync(join(subject.root, "nested"), { recursive: true });
    renameSync(subject.root, retained);
    cpSync(retained, subject.root, { recursive: true });
    assert.equal(git(subject.root, "rev-parse", "HEAD").trim(), prepared.execution.source);
    assert.throws(() => checkGeneratedCandidate(prepared), /candidate.execution-custody-drift/u);
  } finally {
    if (existsSync(retained)) {
      rmSync(subject.root, { recursive: true, force: true });
      renameSync(retained, subject.root);
    }
    subject.dispose();
  }
});

await test("real admitted metadata cohort promotes public baselines and independently replays exact bytes", () => {
  const revisions = [git(repositoryRoot, "rev-parse", "HEAD").trim(),
    ...git(repositoryRoot, "rev-list", "HEAD", "--", ".changeset/core-coordinated-metadata.md").trim().split("\n")];
  const source = revisions.find(revision => revision !== "" && git(repositoryRoot, "ls-tree", revision,
    "--", ".changeset/core-coordinated-metadata.md").trim() !== "");
  assert(source, "The real metadata admission preparation must remain in authenticated history");
  const temporary = mkdtempSync(join(tmpdir(), "get-modular-real-metadata-release-TEST-"));
  const root = join(temporary, "source");
  try {
    git(repositoryRoot, "clone", "--quiet", "--shared", "--no-hardlinks", repositoryRoot, root);
    git(root, "checkout", "--detach", source);
    git(root, "update-ref", "refs/heads/main", source);
    mkdirSync(join(root, "node_modules"));
    for (const entry of readdirSync(nodeModules)) {
      if (!statSync(join(nodeModules, entry)).isDirectory()) {continue;}
      symlinkSync(join(nodeModules, entry), join(root, "node_modules", entry), process.platform === "win32" ? "junction" : "dir");
    }
    const prepared = prepareRelease(root);
    assert.deepEqual(plannedBaselines(prepared.before, prepared.expected.plan), baselinePaths);
    assert.deepEqual(plannedBaselines(prepared.before, { releases: [], consumptions: [] }), []);
    assert.throws(() => assertPromotionBranch(root), /candidate.promotion-branch/u);
    assert.throws(() => produceBaselines({ ...prepared, hasRelease: false }, prepared.before, baselinePaths), /public-producer-required/u);
    const registryPath = "architecture/decisions/accepted-decisions.json";
    const registryFile = prepared.before[registryPath]; assert(registryFile);
    const registry = record(JSON.parse(registryFile.contents)); const decisions = array(registry["decisions"]);
    assert.throws(() => plannedBaselines({ ...prepared.before, [registryPath]: { ...registryFile,
      contents: JSON.stringify({ ...registry, decisions: decisions.filter(value => record(value)["id"] !== "ADR-0042") }) } },
    prepared.expected.plan), /metadata-release-registry/u);
    const producer = prepared.execution.producer; assert(producer);
    assert.throws(() => versionPreparedRelease({ ...prepared, execution: { ...prepared.execution,
      producer: { ...producer, digest: "sha256:substituted" } } }), /execution-custody-drift/u);
    const invalid = { ...prepared.expected.plan, releases: prepared.expected.plan.releases.map(release =>
      release.packageName === "@get-modular/conformance" ? { ...release, newVersion: "0.5.2" } : release) };
    assert.throws(() => plannedBaselines(prepared.before, invalid), /metadata-release-cohort/u);
    const generated = versionPreparedRelease(prepared);
    assert.equal(generated.report.outcome, "passed");
    for (const path of baselinePaths) {
      const actual = read(root, path); const baseline = record(JSON.parse(actual));
      assert.equal(baseline["packageVersion"], "0.7.1");
      write(root, path, { ...baseline, packageVersion: "0.7.2" });
      assert.throws(() => checkGeneratedCandidate(prepared), /baseline-release-version/u);
      write(root, path, actual);
    }
    write(root, "dist/unlisted-output.txt", "not a producer output");
    assert.throws(() => checkGeneratedCandidate(prepared), /candidate.rejected/u);
    rmSync(join(root, "dist"), { recursive: true });
    const head = commit(root, "test(release): retain actual generated metadata candidate");
    assert.equal(verifyRelease(root, source, head).report.outcome, "passed");
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

await test("private producer receipts reject foreign processes, barriers and noncanonical evidence", () => {
  const token = "12345678-1234-4234-8234-123456789abc";
  const path = ".agent-teams-local/foundation-operation-lock.completed-evidence/released.87654321-4321-4321-8321-cba987654321/evidence";
  const row = { host: hostname(), kind: "active", pid: process.pid, schemaVersion: 1, token };
  const contents = JSON.stringify(row) + "\n";
  assert.equal(assertPromotionReceipt(path, contents, process.pid), token);
  for (const invalid of [{ ...row, kind: "transaction-barrier" }, { ...row, host: "foreign-host" },
    { ...row, pid: process.pid + 1 }, { ...row, schemaVersion: 2 }, { ...row, token: "invalid" },
    { ...row, extra: "unowned" }]) {
    assert.throws(() => assertPromotionReceipt(path, JSON.stringify(invalid) + "\n", process.pid), /candidate.producer-receipt/u);
  }
  for (const invalid of [contents.trimEnd(), `\ufeff${contents}`, contents.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')]) {
    assert.throws(() => assertPromotionReceipt(path, invalid, process.pid));
  }
  for (const invalid of [path.replace("released.", "active."), `${path}/extra`, path.replace(".agent-teams-local", "foreign")]) {
    assert.throws(() => assertPromotionReceipt(invalid, contents, process.pid), /candidate.producer-receipt-path/u);
  }
});

await test("batched historical custody preserves every exact blob including binary framing", () => {
  const subject = createFixture();
  try {
    const bytes = Buffer.from([0, 10, 13, 255, 10, 0, 254]);
    writeFileSync(join(subject.root, "binary.dat"), bytes);
    const source = commit(subject.root, "test(release): retain exact binary source framing");
    const captured = historicalSnapshot(subject.root, source);
    for (const path of Object.keys(captured)) {assert.deepEqual(captured[path], historicalFile(subject.root, source, path));}
    assert.equal(captured["binary.dat"]?.leaf.digest, hash(bytes));
    assert.deepEqual(captured, snapshot(subject.root));
  } finally { subject.dispose(); }
});

await test("historical batch decoder rejects malformed or missing object responses", () => {
  const body = Buffer.from([0, 255, 10, 13]);
  const oid = createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
  const entry = { mode: "100755", oid, path: "name\nwith\tseparators" };
  const valid = Buffer.concat([Buffer.from(`${oid} blob ${body.length}\n`), body, Buffer.from("\n")]);
  const result = decodeHistoricalBatch([entry], valid);
  assert.equal(result[entry.path]?.leaf.digest, hash(body));
  assert.equal(result[entry.path]?.leaf.mode, "100755");
  assert.equal(decodeHistoricalBatch([{ ...entry, mode: "120000" }], valid)[entry.path]?.leaf.type, "symlink");
  for (const invalid of [Buffer.alloc(0), Buffer.from(`${oid} blob 4`),
    Buffer.from(`${"2".repeat(40)} blob 0\n\n`), Buffer.from(`${oid} missing\n`),
    Buffer.from(`${oid} blob 9007199254740992\n\n`), valid.subarray(0, -1),
    Buffer.concat([valid, Buffer.from("unlisted")]),
    Buffer.concat([Buffer.from(`${oid} blob 4\n`), Buffer.from([0, 254, 10, 13]), Buffer.from("\n")])]) {
    assert.throws(() => decodeHistoricalBatch([entry], invalid), /candidate.historical-batch/u);
  }
  assert.throws(() => decodeHistoricalBatch([{ ...entry, mode: "160000" }], valid), /unsupported-file-type/u);
});
