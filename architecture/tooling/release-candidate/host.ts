import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { checkReleaseCandidate, type CheckReport, type ExpectedInputs, type FileChange, type InputBinding,
  type ManifestSnapshot, type ObservedCandidate, type PermittedChange, type PlannedRelease, type ReleaseIntent,
  type WorkspacePackage } from "@agent-teams/release-checks";
import { array, assertCustody, clean, custody, execute, git, historicalFile, historicalSnapshot, identity, record, semantic,
  snapshot, text, treeDigest, type ExecutionCustody, type SourceFile, type SourceTree } from "./io.ts";

export const releaseBranch = "changeset-release/main";
export const repository = "agent-teams-ai/get-modular";
const manifestPath = /^(?:package\.json|packages\/[^/]+\/package\.json)$/u;
function isIntentPath(path: string): boolean {
  const name = /^\.changeset\/(?:pre\/)?([^/]+)$/u.exec(path)?.[1];
  // Exact basename predicate from the custody-bound @changesets/read 1.0.1.
  return name !== undefined && !name.startsWith(".") && name.endsWith(".md")
    && !/^README\.md$/iu.test(name) && !["AGENTS.md", "CLAUDE.md", "GEMINI.md"].includes(name);
}
const policyPaths = ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", ".npmrc",
  "architecture/tooling/release-candidate/host.ts", "architecture/tooling/release-candidate/io.ts",
  "architecture/tooling/release-candidate/run.ts"] as const;
export interface PreparedRelease {
  readonly execution: ExecutionCustody;
  readonly before: SourceTree;
  readonly rawPlan: unknown;
  readonly expected: ExpectedInputs;
  readonly hasRelease: boolean;
}
export interface CheckedCandidate { readonly report: CheckReport; readonly observed: ObservedCandidate }
function required(tree: SourceTree, path: string): SourceFile {
  const file = tree[path]; assert(file, `candidate.missing-source:${path}`);
  assert(file.leaf.type === "file" && file.leaf.mode === "100644", `candidate.ordinary-source:${path}`);
  return file;
}
function configuration(tree: SourceTree): Record<string, unknown> {
  assert.equal(tree[".changeset/pre.json"], undefined, "candidate.prerelease-outside-scope");
  const config = record(JSON.parse(required(tree, ".changeset/config.json").contents));
  assert.equal(config["commit"], false, "candidate.engine-commit-forbidden");
  assert.equal(config["changelog"], "@changesets/cli/changelog", "candidate.unqualified-changelog");
  assert.equal(config["baseBranch"], "main", "candidate.base-branch");
  const workspace = record(parse(required(tree, "pnpm-workspace.yaml").contents));
  assert.deepEqual(workspace["packages"], ["packages/*"], "candidate.workspace-topology");
  assert.equal(record(workspace["catalog"])["@changesets/cli"], "3.0.2", "candidate.declared-engine-version");
  assert.equal(record(semantic(required(tree, "package.json"))["devDependencies"])["@changesets/cli"], "catalog:", "candidate.engine-declaration");
  return config;
}
function inventory(tree: SourceTree): readonly WorkspacePackage[] {
  const config = configuration(tree);
  const ignored = array(config["ignore"] ?? []).map(text);
  const versionPrivate = record(config["privatePackages"] ?? {})["version"] !== false;
  const packages = Object.keys(tree).filter(path => manifestPath.test(path)).toSorted().map(path => {
    const file = required(tree, path);
    const value = semantic(file);
    const name = text(value["name"]);
    const privatePackage = value["private"] === true;
    const versioning = ignored.includes(name) ? "ignored" : path === "package.json" || value["version"] === undefined || privatePackage && !versionPrivate ? "unversioned" : "versioned";
    return { name, root: path === "package.json" ? "." : path.slice(0, -"/package.json".length), manifestPath: path,
      classification: privatePackage ? "private" : "public", versioning, before: { file: file.leaf, semantic: value } } as const;
  });
  assert.equal(packages.find(item => item.manifestPath === "package.json")?.classification, "private", "candidate.private-root");
  for (const name of ignored) {assert(packages.some(item => item.name === name), "candidate.ignore-must-be-exact-known-package");}
  return packages;
}
function intentFiles(tree: SourceTree): readonly string[] {
  return Object.keys(tree).filter(isIntentPath).toSorted();
}
function intents(tree: SourceTree, packages: readonly WorkspacePackage[], raw: Record<string, unknown>): readonly ReleaseIntent[] {
  const engineIntents = array(raw["changesets"]).map(record);
  const parsed = intentFiles(tree).map(path => {
    const file = required(tree, path);
    // Keep an independent source projection; the official plan is not evidence
    // that its own request and summary records agree with accepted source bytes.
    const match = /^---\r?\n((?:[\s\S]*?\r?\n)?)---(?:\r?\n|$)([\s\S]*)$/u.exec(file.contents);
    assert(match, `candidate.intent-format:${path}`);
    const requests = Object.entries(record(parse(match[1] ?? "") ?? {})).map(([packageName, type]) => {
      assert(type === "major" || type === "minor" || type === "patch", "candidate.intent-type");
      assert(packages.some(item => item.name === packageName), "candidate.intent-package");
      return { packageName, type } as const;
    });
    const id = path.slice(".changeset/".length, -3);
    const fromEngine = engineIntents.filter(item => item["id"] === id);
    assert.equal(fromEngine.length, 1, `candidate.complete-engine-intents:${id}`);
    assert.deepEqual(array(fromEngine[0]?.["releases"]).map(item => {
      const release = record(item); return { packageName: release["name"], type: release["type"] };
    }), requests, "candidate.intent-plan-request-drift");
    assert.equal(fromEngine[0]?.["summary"], (match[2] ?? "").trim(), "candidate.intent-plan-summary-drift");
    const eligible = requests.filter(request => packages.find(item => item.name === request.packageName)?.versioning === "versioned").length;
    assert(eligible === 0 || eligible === requests.length, "candidate.mixed-intent-eligibility");
    return { id, path, digest: file.leaf.digest, participation: requests.length === 0 || eligible > 0 ? "pending" : "retained", requests } as const;
  });
  assert.deepEqual(engineIntents.map(item => text(item["id"])).toSorted(), parsed.map(item => item.id).toSorted(), "candidate.complete-intent-inventory");
  return parsed;
}
function normalizePlan(raw: Record<string, unknown>, packages: readonly WorkspacePackage[], acceptedIntents: readonly ReleaseIntent[]): ExpectedInputs["plan"] {
  const releases = array(raw["releases"]).map(item => {
    const release = record(item);
    const packageName = text(release["name"]);
    const workspace = packages.find(entry => entry.name === packageName); assert(workspace, "candidate.plan-package");
    const type = release["type"];
    assert(type === "none" || type === "major" || type === "minor" || type === "patch", "candidate.release-type");
    return { packageName, manifestPath: workspace.manifestPath, type,
      oldVersion: release["oldVersion"] === undefined ? null : text(release["oldVersion"]),
      newVersion: release["newVersion"] === undefined ? null : text(release["newVersion"]),
      intentIds: array(release["changesets"]).map(text) } as const;
  });
  const hasRelease = releases.some(item => item.oldVersion !== item.newVersion);
  return { releases, consumptions: hasRelease ? acceptedIntents.filter(item => item.participation === "pending")
    .map(item => ({ intentId: item.id, effect: { kind: "remove" } })) : [] };
}
function classification(path: string): string {
  return manifestPath.test(path) ? "manifest" : isIntentPath(path) ? "intent" : /^packages\/[^/]+\/CHANGELOG\.md$/u.test(path) ? "changelog" : "repository-file";
}
function permission(tree: SourceTree, path: string, remove = false): PermittedChange {
  const before = tree[path]?.leaf;
  if (before !== undefined) {assert(before.type === "file" && before.mode === "100644", "candidate.ordinary-output");}
  return { path, classification: classification(path), kind: remove ? "deleted" : before === undefined ? "added" : "modified",
    before: before === undefined ? null : { type: "file", mode: "100644" }, after: remove ? null : { type: "file", mode: "100644" },
    contentAuthority: path.endsWith("/CHANGELOG.md") ? "get-modular.changelog-history-and-engine-replay" : "release-checks.version-and-intent-relation" };
}
function permissions(tree: SourceTree, plan: ExpectedInputs["plan"], acceptedIntents: readonly ReleaseIntent[]): readonly PermittedChange[] {
  const result: PermittedChange[] = [];
  for (const release of plan.releases.filter(item => item.oldVersion !== item.newVersion)) {
    result.push(permission(tree, release.manifestPath), permission(tree, release.manifestPath.replace(/package\.json$/u, "CHANGELOG.md")));
  }
  for (const consumption of plan.consumptions) {
    const intent = acceptedIntents.find(item => item.id === consumption.intentId); assert(intent);
    result.push(permission(tree, intent.path, true));
  }
  return result;
}
function binding(tree: SourceTree, execution: ExecutionCustody, raw: unknown): InputBinding {
  const packages = inventory(tree).map(({ before: _before, ...item }) => item);
  return { source: { repository, identity: execution.source, digest: treeDigest(tree) },
    engine: { name: "@changesets/cli", version: execution.engine.version, digest: execution.engine.digest },
    configDigest: required(tree, ".changeset/config.json").leaf.digest,
    inventoryDigest: identity(packages), policyDigest: identity(Object.fromEntries(policyPaths.map(path => [path, tree[path]?.leaf ?? null]))),
    intentsDigest: identity(intentFiles(tree).map(path => [path, required(tree, path).leaf])), planDigest: identity(raw) };
}
function freeze(value: unknown): void {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
}
/** Runs the sole official plan collector against clean, physically bound source before any version edit. */
export function prepareRelease(root: string): PreparedRelease {
  clean(root);
  const execution = custody(root);
  const before = snapshot(execution.root);
  assert.equal(treeDigest(before), treeDigest(historicalSnapshot(execution.root, execution.source)), "candidate.unaccepted-source");
  const packages = inventory(before);
  const temporary = mkdtempSync(join(tmpdir(), "get-modular-release-plan-"));
  let rawPlan: unknown;
  try {
    const path = join(temporary, "plan.json");
    execute(execution.root, process.execPath, [execution.engine.entrypoint, "status", `--output=${path}`]);
    rawPlan = JSON.parse(readFileSync(path, "utf8"));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  assertCustody(execution, custody(execution.root));
  assert.equal(treeDigest(snapshot(execution.root)), treeDigest(before), "candidate.planning-mutated-source");
  const acceptedIntents = intents(before, packages, record(rawPlan));
  const plan = normalizePlan(record(rawPlan), packages, acceptedIntents);
  const expected: ExpectedInputs = { binding: binding(before, execution, rawPlan), packages, intents: acceptedIntents,
    plan, permittedChanges: permissions(before, plan, acceptedIntents) };
  const prepared = { execution, before, rawPlan, expected, hasRelease: plan.releases.some(item => item.oldVersion !== item.newVersion) };
  freeze(prepared);
  return prepared;
}
export function difference(before: SourceTree, after: SourceTree): readonly FileChange[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].toSorted().flatMap(path => {
    const old = before[path]?.leaf ?? null; const next = after[path]?.leaf ?? null;
    if (identity(old) === identity(next)) {return [];}
    return [{ path, classification: classification(path), kind: old === null ? "added" : next === null ? "deleted" : "modified", before: old, after: next }];
  });
}
function manifest(file: SourceFile | undefined): ManifestSnapshot | null {
  return file === undefined ? null : { file: file.leaf, semantic: semantic(file) };
}
/** Re-observes current original inputs; only exact permitted outputs are related back to authenticated source blobs. */
function originalInputs(prepared: PreparedRelease, after: SourceTree): SourceTree {
  const inputs = { ...after };
  for (const permit of prepared.expected.permittedChanges) {
    const original = historicalFile(prepared.execution.root, prepared.execution.source, permit.path);
    if (original === undefined) {delete inputs[permit.path];} else {inputs[permit.path] = original;}
  }
  return inputs;
}
function observe(prepared: PreparedRelease, after: SourceTree, execution: ExecutionCustody, candidateIdentity: string): ObservedCandidate {
  const manifests = [...new Set([...Object.keys(prepared.before), ...Object.keys(after)])].filter(path => manifestPath.test(path)).toSorted()
    .map(path => ({ manifestPath: path, before: manifest(prepared.before[path]), after: manifest(after[path]) }));
  const consumptions = intentFiles(prepared.before).filter(path => after[path] === undefined).map(path => ({
    intentId: path.slice(".changeset/".length, -3), digest: required(prepared.before, path).leaf.digest, effect: { kind: "remove" } as const,
  }));
  return { binding: binding(originalInputs(prepared, after), execution, prepared.rawPlan), candidateIdentity, manifests, consumptions,
    diff: difference(prepared.before, after) };
}
function changelogHistory(before: SourceTree, after: SourceTree, release: PlannedRelease): void {
  if (release.oldVersion === release.newVersion) {return;}
  const path = release.manifestPath.replace(/package\.json$/u, "CHANGELOG.md");
  const current = required(after, path).contents.replace(/\r\n/gu, "\n");
  const historical = before[path]?.contents.replace(/\r\n/gu, "\n");
  const heading = historical?.split("\n", 1)[0] ?? `# ${release.packageName}`;
  const prefix = `${heading}\n\n## ${release.newVersion}\n`;
  assert(current.startsWith(prefix), `candidate.changelog-version:${path}`);
  if (historical !== undefined) {
    assert(historical.startsWith(`${heading}\n\n`), `candidate.changelog-history-format:${path}`);
    assert(current.endsWith(historical.slice(heading.length + 2)), `candidate.changelog-history-drift:${path}`);
  }
  assert(current.slice(prefix.length).trim().length > 0, `candidate.empty-changelog:${path}`);
}
function check(prepared: PreparedRelease, after: SourceTree, execution: ExecutionCustody, candidateIdentity: string): CheckedCandidate {
  const observed = observe(prepared, after, execution, candidateIdentity);
  const report = checkReleaseCandidate({ schemaVersion: 1, expected: prepared.expected, observed });
  assert.equal(report.outcome, "passed", `candidate.rejected:${JSON.stringify(report.diagnostics)}`);
  prepared.expected.plan.releases.forEach(release => { changelogHistory(prepared.before, after, release); });
  return { report, observed };
}
export function checkGeneratedCandidate(prepared: PreparedRelease): CheckedCandidate {
  const actual = custody(prepared.execution.root);
  assertCustody(prepared.execution, actual);
  const after = snapshot(actual.root);
  return check(prepared, after, actual, `worktree:${treeDigest(after)}`);
}
export function versionPreparedRelease(prepared: PreparedRelease): CheckedCandidate {
  assertCustody(prepared.execution, custody(prepared.execution.root));
  assert.equal(treeDigest(snapshot(prepared.execution.root)), treeDigest(prepared.before), "candidate.inputs-drifted-before-version");
  if (prepared.hasRelease) {execute(prepared.execution.root, process.execPath, [prepared.execution.engine.entrypoint, "version"]);}
  return checkGeneratedCandidate(prepared);
}
export function generateRelease(root: string): CheckedCandidate { return versionPreparedRelease(prepareRelease(root)); }

/** Independent current-base replay; candidate versions never provide expected versions or release membership. */
export function verifyRelease(root: string, base: string, head: string): CheckedCandidate {
  assert.match(base, /^[a-f0-9]{40}$/u); assert.match(head, /^[a-f0-9]{40}$/u);
  assert.equal(git(root, "merge-base", base, head).trim(), base, "candidate.stale-release-base");
  const temporary = mkdtempSync(join(tmpdir(), "get-modular-release-replay-"));
  const replayRepository = join(temporary, "repository.git");
  const sourceRoot = join(temporary, "source"); const candidateRoot = join(temporary, "candidate");
  const owned: string[] = [];
  try {
    git(root, "clone", "--quiet", "--bare", "--shared", "--no-hardlinks", root, replayRepository);
    // A PR checkout need not have local main. Bind it only in our owned Git store;
    // status --since would filter the accepted intent inventory and is unsuitable.
    git(replayRepository, "update-ref", "refs/heads/main", base);
    for (const [path, revision] of [[sourceRoot, base], [candidateRoot, head]] as const) {
      git(replayRepository, "-c", "core.autocrlf=false", "worktree", "add", "--detach", path, revision); owned.push(path);
      mkdirSync(join(path, "node_modules"));
      for (const entry of readdirSync(resolve(root, "node_modules"))) {
        if (!statSync(resolve(root, "node_modules", entry)).isDirectory()) {continue;}
        symlinkSync(resolve(root, "node_modules", entry), join(path, "node_modules", entry), process.platform === "win32" ? "junction" : "dir");
      }
    }
    const expected = prepareRelease(sourceRoot);
    assert(expected.hasRelease, "candidate.no-release-pr");
    const generated = versionPreparedRelease(expected);
    const candidateExecution = custody(candidateRoot);
    assert.equal(candidateExecution.source, head, "candidate.foreign-candidate-head");
    const actual = snapshot(candidateRoot);
    assertCustody(candidateExecution, custody(candidateRoot));
    assert.equal(candidateExecution.engine.digest, expected.execution.engine.digest, "candidate.substituted-engine");
    const result = check(expected, actual, { ...candidateExecution, source: base }, `commit:${head}:${treeDigest(actual)}`);
    assert.deepEqual(result.observed.diff, generated.observed.diff, "candidate.generated-output-drift");
    return result;
  } finally {
    for (const path of owned.toReversed()) {git(replayRepository, "worktree", "remove", "--force", path);}
    rmSync(temporary, { recursive: true, force: true });
  }
}
