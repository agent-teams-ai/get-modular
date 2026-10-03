import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import test from "node:test";
import Ajv from "ajv";
import ts from "typescript-minimum";
import { parse } from "yaml";
import { packageIdentityViolations, packageManifestInventory } from "../architecture/checks/production-artifacts.mjs";
import { expectedLeafImporter, LEAF_PACKAGES, leafManifestPath } from "../architecture/checks/leaf-packages.mjs";

const directory = "architecture/contracts/ownership/";
const checkpoint = JSON.parse(readFileSync(`${directory}checkpoint.json`, "utf8"));
const schema = JSON.parse(readFileSync(`${directory}checkpoint.schema.json`, "utf8"));
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const declaration = readFileSync(checkpoint.contract.path, "utf8");
// Separately decided leaf packages beside Core and Assembly whose root exists.
const presentLeafRoots = () => LEAF_PACKAGES
  .filter(leaf => existsSync(leafManifestPath(leaf))).map(leaf => leaf.root);

test("the complete gate runs the ownership checkpoint suite with failure propagation", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(scripts.precheck, "pnpm ownership:checkpoint:test",
    "pnpm check must run the checkpoint suite through its precheck lifecycle");
  assert.equal(scripts["ownership:checkpoint:test"],
    "node --test tests/ownership-checkpoint.test.mjs",
    "the checkpoint script must execute the focused suite, not a no-op");
});

test("the scoped decision is accepted and earlier accepted decisions retain exact bytes", () => {
  const path = "docs/decisions/0028-authorize-the-optional-ownership-contract-checkpoint.md";
  const markdown = readFileSync(path, "utf8");
  const metadata = parse(markdown.match(/^---\n([\s\S]*?)\n---/u)[1]);
  assert.equal(metadata.id, checkpoint.decision);
  assert.equal(metadata.status, "accepted");
  assert.equal(metadata.owner, checkpoint.owner);
  assert.equal(metadata.approved_by, "product-owner");
  const indexPath = "architecture/decisions/accepted-decisions.json";
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const previousIndex = JSON.parse(execFileSync("git", ["show",
    `${checkpoint.evidence.base}:${indexPath}`], { encoding: "utf8" }));
  assert.deepEqual(index.decisions.slice(0, previousIndex.decisions.length),
    previousIndex.decisions);
  // ADR-0030 supersedes ADR-0028 in its own text. ADR-0028 keeps its accepted
  // bytes and status because the frozen checkpoint authenticates the whole file.
  assert.deepEqual(index.decisions.slice(previousIndex.decisions.length), [
    {
      id: "ADR-0028", path,
      immutableDigest: "sha256:69e001cd3334aa37d1c94cf3df945ceef86bde4475eedcf8d2b3460ba7fa8d86",
    },
    {
      id: "ADR-0029",
      path: "docs/decisions/0029-admit-an-optional-lifecycle-kernel-candidate.md",
      immutableDigest: "sha256:4162e78542ac053ee03e3b330880495ddd9ffd261c0a578fe100035bdf910d64",
    },
    {
      id: "ADR-0030",
      path: "docs/decisions/0030-admit-the-module-resource-scope-package.md",
      immutableDigest: "sha256:9ab491290ea3614714f6f3d17bb44ba31c578e37e68e8f68e87575567291c5c9",
    },
    {
      id: "ADR-0031",
      path: "docs/decisions/0031-pass-a-per-run-scope-and-declared-inputs-to-assembly-runs.md",
      immutableDigest: "sha256:6576e43b28adc8643a3443a84412096fe465f26ab6768215c9ac8947f5743a74",
    },
    {
      id: "ADR-0032",
      path: "docs/decisions/0032-give-assembly-an-authoring-builder-and-capability-scoped-handles.md",
      immutableDigest: "sha256:8d929a7f40c1864f3fc898e68700c51ea171bcf48ec9fa32a967d4d4d2e1066a",
    },
    {
      id: "ADR-0033",
      path: "docs/decisions/0033-admit-the-module-conformance-kit.md",
      immutableDigest: "sha256:41e6d18087f5fe147b5a843b37fa5be925fa2f87cb1dc83c949a80520e7dbeb5",
    },
  ]);
  const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", checkpoint.evidence.base,
    "docs/decisions"], { encoding: "utf8" }).trim().split("\n");
  for (const previous of paths.filter(path => /\/\d{4}-/u.test(path))) {
    const bytes = execFileSync("git", ["show", `${checkpoint.evidence.base}:${previous}`]);
    assert.deepEqual(readFileSync(previous), bytes, previous);
  }
});

// Exercise the installed EF parser and immutable metadata/body fingerprint through
// its real governance boundary. The independent reviewed value above prevents a
// coordinated change to the document and registry from silently blessing itself.
test("installed Foundation authenticates the accepted decision fingerprint", () => {
  const report = JSON.parse(execFileSync(process.execPath, [
    resolve("node_modules/@agent-teams/engineering-foundation/dist/cli.js"),
    "check", "governance.architecture-decisions", "--consumer", process.cwd(),
    "--format", "json",
  ], { encoding: "utf8" }));
  assert.equal(report.outcome, "passed");
  assert.deepEqual(report.capabilities.map(item => [item.capabilityId, item.outcome]),
    [["governance.architecture-decisions", "passed"]]);
});

test("C0 schema admits the observed checkpoint and rejects premature activation", () => {
  assert.equal(validate(checkpoint), true, JSON.stringify(validate.errors));
  const mutations = [
    c => { c.phase = "K1"; },
    c => { c.package.materialized = true; },
    c => { c.package.root = "packages/core/ownership"; },
    c => { c.package.name = "@get-modular/core"; },
    c => { c.package.runtimeDependencies = ["@get-modular/core"]; },
    c => { c.package.callbacks = true; },
    c => { c.contract.path = "packages/ownership/src/index.ts"; },
    c => { c.contract.digest = "sha256:bad"; },
    c => { delete c.contractRevision; },
    c => { c.evidence.plan.digest = "sha256:" + "0".repeat(64); },
    c => { c.consumers.push("unapproved"); },
    c => { c.evidence.ar.scopeEligibility = "eligible"; },
    ...Object.keys(checkpoint.activation).map(key => c => { c.activation[key] = "active"; }),
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(checkpoint);
    mutate(candidate);
    assert.equal(validate(candidate), false, JSON.stringify(candidate));
  }
});

test("observations bind historical lock bytes, production importers and reviewed CMS successor", () => {
  assert.equal(checkpoint.evidence.base, "ac49bb3374946330ec820591f8195a22d2c90900");
  assert.equal(digest(declaration), checkpoint.contract.digest);
  assert.equal(digest(readFileSync(checkpoint.contract.decisionPath)), checkpoint.contract.decisionDigest);
  // ADR-0028 records the lock at its observed base, not a perpetual tooling pin.
  // Authenticate those bytes while retaining the same production workspace graph.
  const historicalLockBytes = execFileSync("git", ["show",
    `${checkpoint.evidence.base}:pnpm-lock.yaml`]);
  assert.equal(digest(historicalLockBytes), checkpoint.evidence.lockDigest);
  const historicalImporters = parse(historicalLockBytes.toString("utf8")).importers;
  const currentImporters = parse(readFileSync("pnpm-lock.yaml", "utf8")).importers;
  const leafRoots = presentLeafRoots();
  assert.deepEqual(Object.keys(currentImporters).sort(), [
    ...Object.keys(historicalImporters), ...leafRoots,
  ].sort());
  for (const leaf of LEAF_PACKAGES.filter(leaf => leafRoots.includes(leaf.root))) {
    assert.deepEqual(currentImporters[leaf.root], expectedLeafImporter(leaf),
      `the separately decided leaf package ${leaf.root} adds only the peer links of its row`);
  }
  for (const [path, importer] of Object.entries(historicalImporters)) {
    for (const field of ["dependencies", "optionalDependencies"]) {
      assert.deepEqual(currentImporters[path][field], importer[field], `${path}:${field}`);
    }
  }
  const cmsPath = checkpoint.evidence.cms.path;
  const historicalCms = execFileSync("git", ["show", `${checkpoint.evidence.base}:${cmsPath}`]);
  assert.equal(digest(historicalCms), checkpoint.evidence.cms.digest,
    "C0 retains the CMS bytes observed at its base");
  const currentCms = readFileSync(cmsPath);
  assert.equal(digest(currentCms),
    "sha256:af60d657bf7e3ab4c10d1e8329a3a7e168b30ce5364d3b989cba067692a1f1fe",
    "the current CMS successor must match its separately reviewed bytes");
  // Package versions are observations at the evidence base; later releases move the working tree.
  for (const [name, version] of Object.entries(checkpoint.evidence.packages)) {
    const observed = execFileSync("git", ["show", `${checkpoint.evidence.base}:packages/${name}/package.json`],
      { encoding: "utf8" });
    assert.equal(JSON.parse(observed).version, version);
  }
});

test("C0 preserves rejecting runtime package admission until K1", async () => {
  assert.equal(existsSync("packages/ownership"), false);
  const inventory = await packageManifestInventory(["packages/ownership/package.json"], {
    readPackageManifest: async () => ({ name: "@get-modular/ownership", private: true }),
  });
  assert.deepEqual(packageIdentityViolations(inventory), ["packages/ownership/package.json"]);
  const policy = parse(readFileSync("architecture/foundation/source-dependencies.yaml", "utf8"));
  assert.equal(policy.schemaVersion, 3);
  assert.equal(policy.rootPackage, true);
  assert.deepEqual(policy.packageRoots, [
    "packages/assembly", "packages/core", ...presentLeafRoots(),
  ].sort());
  for (const boundary of policy.boundaries.filter(b => b.dependencyMode !== "development")) {
    assert.equal(boundary.allow.packages.includes("@get-modular/ownership"), false);
  }
});

test("pseudo-contract has one closed synchronous surface without resource callbacks", () => {
  const source = ts.createSourceFile("contract.d.ts", declaration, ts.ScriptTarget.Latest, true);
  const interfaces = source.statements.filter(ts.isInterfaceDeclaration);
  const scope = interfaces.find(node => node.name.text === "OwnershipScope");
  assert.deepEqual(scope.members.map(member => member.name.text), [
    "reserve", "fulfill", "reject", "transfer", "seal", "beginCleanup", "settleCleanup", "snapshot",
  ]);
  assert.equal(scope.members.find(member => member.name.text === "transfer").parameters.length, 1);
  function inspect(node) {
    assert.equal(ts.isImportDeclaration(node) || ts.isImportTypeNode(node), false);
    assert.equal(ts.isFunctionTypeNode(node), false, "no callback types");
    if (ts.isTypeReferenceNode(node)) assert.notEqual(node.typeName.getText(source), "Promise");
    ts.forEachChild(node, inspect);
  }
  inspect(source);
});

test("declarations reject forged identities, callbacks, unsafe settlement and live snapshots", () => {
  const temp = mkdtempSync(join(tmpdir(), "gm-ownership-contract-"));
  try {
    writeFileSync(join(temp, "contract.d.ts"), declaration);
    writeFileSync(join(temp, "consumer.ts"), `
import { createOwnershipScope, type OwnershipTicket, type CleanupClaim } from "./contract.js";
const scope = createOwnershipScope();
const reserved = scope.reserve();
if (reserved.ok) {
  scope.fulfill(reserved.value);
  const cleanup = scope.beginCleanup(reserved.value);
  if (cleanup.ok) {
    scope.settleCleanup(cleanup.value, "unresolved");
    scope.settleCleanup(cleanup.value, "retry-safe");
    // @ts-expect-error An observer deadline is not raw settlement.
    scope.settleCleanup(cleanup.value, "timeout");
  }
  // @ts-expect-error Transfer never invokes a receiver callback.
  scope.transfer(reserved.value, () => {});
  // @ts-expect-error An acquisition ticket is not a cleanup claim.
  scope.settleCleanup(reserved.value, "released");
}
// @ts-expect-error Tickets cannot be structurally manufactured.
const ticket: OwnershipTicket = {};
// @ts-expect-error Claims are not numeric attempt IDs.
const claim: CleanupClaim = 1;
const snapshot = scope.snapshot();
// @ts-expect-error Counts are immutable.
snapshot.counts.owned = 0;
// @ts-expect-error Snapshots carry no resource capabilities.
snapshot.dispose();
scope.seal();
`);
    writeFileSync(join(temp, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        noEmit: true, strict: true, skipLibCheck: false,
        module: "NodeNext", target: "ES2022", types: [],
      },
      files: ["consumer.ts"],
    }));
    for (const compiler of ["typescript", "typescript-minimum"]) {
      execFileSync(process.execPath, [resolve(`node_modules/${compiler}/bin/tsc`),
        "--project", join(temp, "tsconfig.json")], { cwd: temp, stdio: "pipe" });
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

// Operator input is supplied for C0 reconciliation, not shipped in source clones.
// An explicitly supplied path must exist; ordinary clones report absent input as skipped.
const planPath = process.env.GM_C0_PLAN_PATH
  ?? ".codex-inputs/sdk-and-owned-lifetime-implementation-plan.md";
test("canonical plan bytes match the reviewed identity independently of the checkpoint", {
  skip: !process.env.GM_C0_PLAN_PATH && !existsSync(planPath)
    ? "C0 operator plan input unavailable in this source clone" : false,
}, () => {
  const bytes = readFileSync(planPath);
  assert.equal(digest(bytes), "sha256:e025978dcf3cfac12b7795fa3aafc96f06838620e124df4cc091ebee45352864");
});

for (const [label, mutate] of [
  ["stale GM revision", c => { c.evidence.base = "669a750d8db451e04f075cdeb36576c6606fba6e"; }],
  ["zero GM revision", c => { c.evidence.base = "0".repeat(40); }],
  ["stale AR revision", c => { c.evidence.ar.revision = "527d5fe93bfb02bde287beae2b9f7bfb44ba1988"; }],
  ["zero AR revision", c => { c.evidence.ar.revision = "0".repeat(40); }],
  ["altered source digest", c => { c.evidence.ar.candidateSites[0].digest = "sha256:" + "1".repeat(64); }],
  ["altered CMS digest", c => { c.evidence.cms.digest = "sha256:" + "1".repeat(64); }],
  ["altered retained CMS digest", c => { c.evidence.ar.activeStandard.sha256 = "1".repeat(64); }],
  ["altered profile digest", c => { c.evidence.ar.profile.digest = "sha256:" + "1".repeat(64); }],
  ["duplicate path with different digest", c => { c.evidence.ar.candidateSites[1].path = c.evidence.ar.candidateSites[0].path; }],
]) {
  test(`frozen C0 evidence rejects ${label}`, () => {
    const candidate = structuredClone(checkpoint);
    mutate(candidate);
    assert.equal(validate(candidate), false);
  });
}
