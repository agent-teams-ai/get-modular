import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { parse, stringify } from "yaml";
import { readCurrentM2Authority } from "../architecture/checks/m2-lock-witness.mjs";
import { promisify } from "node:util";
import {
  ASSEMBLY_DECISION_PATH, ASSEMBLY_MANIFEST_PATH, M2_HISTORICAL_LOCK_DIGEST,
  createHistoricalM2EvidenceReader, validateAssemblyAdmission,
} from "../architecture/checks/assembly-admission.mjs";
import { validatePrivateCoreStart } from "../architecture/checks/private-core-start.mjs";
import { M2_EVIDENCE_LEDGER } from "../architecture/checks/m2-evidence.mjs";
import {
  assertGitIndexSnapshotCurrent, captureGitIndexSnapshot, readIndexSnapshotFile,
} from "../architecture/checks/tracked-file-custody.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root));
const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const ledgerBytes = read(M2_EVIDENCE_LEDGER);
const expectedLedgerDigest = "sha256:3781993b5714d8f8928ca2a2082353f93bc42b0e69a3373bd9cfaa41963f7f61";
const ledger = JSON.parse(ledgerBytes.toString("utf8"));
const currentLock = read("pnpm-lock.yaml");
const importer =
  "  packages/assembly:\n"
  + "    dependencies:\n"
  + "      '@get-modular/core':\n"
  + "        specifier: workspace:*\n"
  + "        version: link:../core\n\n";
const artifacts = [
  "packages/core/package.json", "packages/core/src/index.ts",
  ASSEMBLY_MANIFEST_PATH, "packages/assembly/src/index.ts",
];
const inputs = {
  productionArtifacts: artifacts, readBytes: read,
  readPackageManifest: async path => JSON.parse(read(path).toString("utf8")),
};
const witnessAuthority = await readCurrentM2Authority(read);
const evidenceInput = { ledgerBytes, expectedLedgerDigest, readBytes: witnessAuthority.readBytes };
const admit = extra => validateAssemblyAdmission({ ...inputs, ...extra });
const changeLock = (before, after) => {
  const text = currentLock.toString("utf8");
  assert(text.includes(before));
  const changed = text.replace(before, after);
  assert.notEqual(changed, text);
  return Buffer.from(changed);
};

test("Assembly admission subtracts only independently admitted paths from Core", async () => {
  const original = [...artifacts];
  const admitted = await admit();
  assert.deepEqual(admitted, artifacts.slice(2));
  assert(Object.isFrozen(admitted));
  assert.deepEqual(artifacts, original);
  const record = {
    repository: "agent-teams-ai/get-modular", baseCommit: "a".repeat(40),
    authorityDigest: "sha256:" + "1".repeat(64),
    approvedBy: "product-owner", approvedOn: "2026-09-04", status: "authorized",
    package: "@get-modular/core",
    scope: ["semantics", "object-entry", "publication-not-claimed"],
    excluded: ["raw-carriers", "raw-entry-export", "runtime-lifecycle",
      "conformance-claims", "proposed-contract-claims", "generated-self-composition-claims"],
  };
  const markdown = '<!-- get-modular:private-core-start -->\n```json\n'
    + JSON.stringify(record) + '\n```\n<!-- /get-modular:private-core-start -->';
  const core = productionArtifacts => validatePrivateCoreStart({
    markdown, productionArtifacts, authorityDigest: record.authorityDigest,
    isStartingBase: async () => true, readPackageManifest: inputs.readPackageManifest,
  });
  await core(artifacts.filter(path => !admitted.includes(path)));
  await assert.rejects(core(artifacts), /outside the authorized package root/u);
  for (const path of ["packages/rogue/src/index.ts", "packages/conformance/package.json",
    "packages/assembly-other/index.ts"]) {
    const all = [...artifacts, path];
    const allowed = await admit({ productionArtifacts: all });
    await assert.rejects(core(all.filter(candidate => !allowed.includes(candidate))),
      /outside the authorized package root/u);
  }
});

test("Assembly admission rejects malformed manifests, dependencies and package roots", async () => {
  const manifest = JSON.parse(read(ASSEMBLY_MANIFEST_PATH).toString("utf8"));
  for (const mutation of [
    { name: "@rogue/package" }, { private: false }, { version: "0.2.0" },
    ...[undefined, null, [], {}, true].map(dependencies => ({ dependencies })),
    { dependencies: { "@get-modular/core": "^0.1.0" } },
    { dependencies: { ...manifest.dependencies, extra: "1.0.0" } },
    ...["devDependencies", "optionalDependencies", "peerDependencies"]
      .flatMap(field => [null, [], { extra: "1.0.0" }].map(value => ({ [field]: value }))),
    { scripts: null }, { scripts: { install: "node install.mjs" } },
  ]) {
    await assert.rejects(admit({
      readPackageManifest: async () => ({ ...manifest, ...mutation }),
    }), /Assembly admission/u);
  }
  for (const productionArtifacts of [
    artifacts.filter(path => path !== ASSEMBLY_MANIFEST_PATH),
    [...artifacts, "packages/assembly/nested/package.json"],
    [...artifacts, "packages/assembly/../rogue/index.ts"],
    artifacts.filter(path => path !== "packages/core/package.json"),
  ]) await assert.rejects(admit({ productionArtifacts }), /Assembly admission/u);
});

test("Assembly requires the exact accepted ADR-0023 and its registry entry", async () => {
  const original = read(ASSEMBLY_DECISION_PATH).toString("utf8");
  for (const bytes of [
    undefined, Buffer.from(original.replace("status: accepted", "status: proposed")),
    Buffer.from(original + "\n"),
  ]) await assert.rejects(admit({
    readBytes: path => path === ASSEMBLY_DECISION_PATH ? bytes : read(path),
  }));
  const path = "architecture/decisions/accepted-decisions.json";
  const registry = JSON.parse(read(path).toString("utf8"));
  for (const decisions of [
    registry.decisions.filter(entry => entry.id !== "ADR-0023"),
    registry.decisions.map(entry => entry.id === "ADR-0023" ? { ...entry, immutableDigest: "sha256:" + "0".repeat(64) } : entry),
  ]) await assert.rejects(admit({
    readBytes: candidate => candidate === path
      ? Buffer.from(JSON.stringify({ ...registry, decisions })) : read(candidate),
  }), /registered ADR-0023/u);
});

test("current admission rejects malformed, missing, extra and redirected importers", async () => {
  const current = parse(currentLock.toString("utf8"));
  const encode = value => Buffer.from(stringify(value));
  const locks = [Buffer.from("importers: [\n"),
    changeLock(importer, importer + importer)];
  for (const replacement of [undefined, null, [], {}, true]) {
    locks.push(encode({ ...current, importers: replacement }));
  }
  for (const name of [".", "packages/core", "packages/assembly"]) {
    const changed = structuredClone(current);
    delete changed.importers[name];
    locks.push(encode(changed));
    for (const value of [null, [], true]) {
      locks.push(encode({ ...current, importers: { ...current.importers, [name]: value } }));
    }
  }
  locks.push(encode({ ...current, importers: { ...current.importers, "packages/extra": {} } }));
  locks.push(encode({ ...current, lockfileVersion: "8.0" }));
  locks.push(changeLock("  packages/core: {}",
    "  packages/core:\n    dependencies:\n      rogue: {specifier: 1.0.0, version: 1.0.0}"));
  for (const assembly of [
    {}, { dependencies: {} }, { dependencies: null }, { dependencies: [] },
    { optionalDependencies: current.importers["packages/assembly"].dependencies },
    { ...current.importers["packages/assembly"], devDependencies: {} },
    { ...current.importers["packages/assembly"], dependenciesMeta: {} },
    { dependencies: { ...current.importers["packages/assembly"].dependencies, rogue: {} } },
    { dependencies: { "@get-modular/core": { specifier: "^0.1.0", version: "link:../core" } } },
    { dependencies: { "@get-modular/core": { specifier: "workspace:*", version: "link:../other" } } },
    { dependencies: { "@get-modular/core": { specifier: "workspace:*", version: "link:../core", injected: true } } },
  ]) locks.push(encode({ ...current, importers: { ...current.importers, "packages/assembly": assembly } }));
  for (const bytes of locks) await assert.rejects(admit({
    readBytes: path => path === "pnpm-lock.yaml" ? bytes : read(path),
  }));
});

test("current workspace and Core manifest cannot bypass Assembly admission", async () => {
  for (const packages of [undefined, null, [], ["packages/assembly"], ["packages/*", "other/*"],
    ["packages/*", "!packages/core"]]) {
    const workspace = { ...parse(read("pnpm-workspace.yaml").toString()), packages };
    await assert.rejects(admit({ readBytes: path => path === "pnpm-workspace.yaml"
      ? Buffer.from(stringify(workspace)) : read(path) }), /workspace package scope/u);
  }
  const corePath = "packages/core/package.json";
  const core = JSON.parse(read(corePath));
  for (const mutation of [{ name: "@rogue/core" }, { type: "commonjs" },
    { dependencies: { rogue: "1.0.0" } }, { scripts: { install: "node bypass.mjs" } },
    { exports: { "./bypass": "./dist/index.js" } }]) {
    await assert.rejects(admit({ readPackageManifest: async path => path === corePath
      ? { ...core, ...mutation } : inputs.readPackageManifest(path) }), /Assembly admission/u);
  }
});

test("root tooling lock upgrades admit independently and compose with historical custody", async () => {
  // A structurally consistent catalog/tool resolution update is admission input,
  // not a claim that this hypothetical version has been installed or qualified.
  const workspace = parse(read("pnpm-workspace.yaml").toString());
  const previous = workspace.catalog.yaml;
  const next = previous + "-m2-admission-fixture";
  const changedLock = Buffer.from(currentLock.toString().replaceAll(previous, next));
  workspace.catalog.yaml = next;
  const changedWorkspace = Buffer.from(stringify(workspace));
  assert.notDeepEqual(changedLock, currentLock);
  const readBytes = path => path === "pnpm-lock.yaml" ? changedLock
    : path === "pnpm-workspace.yaml" ? changedWorkspace : read(path);
  assert.deepEqual(await admit({ readBytes }), artifacts.slice(2));
  const authority = await readCurrentM2Authority(readBytes);
  const historicalRead = await createHistoricalM2EvidenceReader({ ...evidenceInput,
    readBytes: authority.readBytes });
  for (const entry of ledger.artifacts) {
    assert.equal(sha(await historicalRead(entry.path)), entry.immutableDigest, entry.path);
  }
  assert.equal(authority.toolingEvidence.inputs.find(row => row.path === "pnpm-lock.yaml").digest,
    sha(changedLock));
  await assert.rejects(createHistoricalM2EvidenceReader({ ...evidenceInput, readBytes }),
    /differs beyond the sole importer addition/u);
  await admit({ readBytes: path => path === "pnpm-lock.yaml"
    ? Buffer.concat([currentLock, Buffer.from("\n# tooling formatting\n")]) : read(path) });
});

test("legacy Assembly reader still authenticates its closed historical delta", async () => {
  const historical = await witnessAuthority.readBytes("pnpm-lock.yaml");
  const legacy = Buffer.from(historical.toString().replace("  packages/core: {}", importer + "  packages/core: {}"));
  assert.equal(sha(legacy), "sha256:3ae75433a52d071775c9688fb41a2f24331c9ac05b01dadf0278be7788192562");
  const legacyRead = await createHistoricalM2EvidenceReader({ ...evidenceInput,
    readBytes: path => path === "pnpm-lock.yaml" ? legacy : read(path) });
  assert.deepEqual(await legacyRead("pnpm-lock.yaml"), historical);
  for (const bytes of [Buffer.concat([legacy, Buffer.from("\n")]),
    Buffer.from(legacy.toString().replace("version: link:../core", "version: link:../other"))]) {
    await assert.rejects(createHistoricalM2EvidenceReader({ ...evidenceInput,
      readBytes: path => path === "pnpm-lock.yaml" ? bytes : read(path) }));
  }
});

test("only the historical evidence reader supplies historical lock bytes; history stays unchanged", async () => {
  const before = new Map(ledger.artifacts.map(entry => [entry.path, read(entry.path)]));
  const historicalRead = await createHistoricalM2EvidenceReader(evidenceInput);
  assert.equal(sha(await historicalRead("pnpm-lock.yaml")), M2_HISTORICAL_LOCK_DIGEST);
  assert.deepEqual(read("pnpm-lock.yaml"), currentLock);
  for (const entry of ledger.artifacts) {
    assert.equal(sha(await historicalRead(entry.path)), entry.immutableDigest, entry.path);
    assert.deepEqual(read(entry.path), before.get(entry.path), entry.path);
  }
  const originalRead = await createHistoricalM2EvidenceReader({
    ...evidenceInput, readBytes: historicalRead,
  });
  assert.deepEqual(await originalRead("pnpm-lock.yaml"), await historicalRead("pnpm-lock.yaml"));
});

test("Assembly admission retains captured-index custody for every admission input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gm-assembly-admission-"));
  const exec = promisify(execFile);
  const git = (...args) => exec("git", args, { cwd: directory });
  const paths = [ASSEMBLY_MANIFEST_PATH, ASSEMBLY_DECISION_PATH,
    "architecture/decisions/accepted-decisions.json", "pnpm-lock.yaml",
    "pnpm-workspace.yaml", "packages/core/package.json"];
  try {
    for (const path of paths) {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await writeFile(join(directory, path), read(path));
    }
    await git("init", "--quiet", "--initial-branch=main");
    await git("add", ".");
    const snapshot = await captureGitIndexSnapshot(directory);
    const readBytes = path => readIndexSnapshotFile(snapshot, path, "Assembly admission fixture");
    const check = () => admit({ readBytes,
      readPackageManifest: async path => JSON.parse((await readBytes(path)).toString("utf8")),
    });
    await check();
    await assertGitIndexSnapshotCurrent(snapshot);
    for (const path of paths) {
      await writeFile(join(directory, path), Buffer.concat([read(path), Buffer.from("\n")]));
      await assert.rejects(check(), /TRACKED_FILE_CUSTODY_FAILED/u);
      await writeFile(join(directory, path), read(path));
    }
    await writeFile(join(directory, "pnpm-lock.yaml"),
      Buffer.concat([currentLock, Buffer.from("\n")]));
    await git("add", "pnpm-lock.yaml");
    await assert.rejects(assertGitIndexSnapshotCurrent(snapshot), /Git index changed/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
