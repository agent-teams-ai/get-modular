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

const directory = "architecture/contracts/ownership/";
const checkpoint = JSON.parse(readFileSync(`${directory}checkpoint.json`, "utf8"));
const schema = JSON.parse(readFileSync(`${directory}checkpoint.schema.json`, "utf8"));
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const declaration = readFileSync(checkpoint.contract.path, "utf8");

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
  assert.deepEqual(index.decisions.slice(0, -1), previousIndex.decisions);
  assert.deepEqual(index.decisions.at(-1), {
    id: "ADR-0028", path,
    immutableDigest: "sha256:69e001cd3334aa37d1c94cf3df945ceef86bde4475eedcf8d2b3460ba7fa8d86",
  });
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

test("observations bind exact base bytes, callable contract and current CMS", () => {
  assert.equal(checkpoint.evidence.base, "ac49bb3374946330ec820591f8195a22d2c90900");
  assert.equal(digest(declaration), checkpoint.contract.digest);
  assert.equal(digest(readFileSync(checkpoint.contract.decisionPath)), checkpoint.contract.decisionDigest);
  for (const [path, expected] of [
    ["pnpm-lock.yaml", checkpoint.evidence.lockDigest],
    [checkpoint.evidence.cms.path, checkpoint.evidence.cms.digest],
  ]) {
    const bytes = execFileSync("git", ["show", `${checkpoint.evidence.base}:${path}`]);
    assert.equal(digest(bytes), expected);
    assert.equal(digest(readFileSync(path)), expected);
  }
  for (const [name, version] of Object.entries(checkpoint.evidence.packages)) {
    assert.equal(JSON.parse(readFileSync(`packages/${name}/package.json`, "utf8")).version, version);
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
  assert.deepEqual(policy.packageRoots, ["packages/assembly", "packages/core"]);
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
