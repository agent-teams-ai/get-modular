import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  ACCEPTED_AUTHORITY_LEDGER_ANCHOR,
  ACCEPTED_AUTHORITY_LEDGER_DIGEST,
  ACCEPTED_AUTHORITY_LEDGER_PATH,
  productionArtifactPaths,
  qualificationClaimAnchor,
  readTrackedEvidence,
  requirementIdsFromMarkdown,
  validateAcceptedAuthorityCatalog,
  validateAuthorityLedger,
  validateAuthorityLedgerCustody,
  validateBlockedImplementation,
  validateDecisionResolutions,
  validateQualificationClaims,
  validateQualificationProfileConsistency,
  validateSourceMap,
  validateTraceability,
} from "../architecture/checks/governance.mjs";
import { productionArtifactsOutsidePackages } from
  "../architecture/checks/production-artifacts.mjs";

const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const evidenceIdentity = (path, bytes) => ({ path, digest: digest(bytes) });
const execFileAsync = promisify(execFile);

const sourceMap = {
  schemaVersion: 1,
  sources: [{
    id: "source-a",
    repository: "https://example.test/source",
    revision: "a".repeat(40),
    status: "accepted-authority-at-observation",
    observedAt: "2026-08-29",
    paths: ["docs/evidence.md"],
  }],
};

test("metadata schema matches runtime Windows-safe path rules", async () => {
  const schema = JSON.parse(await readFile("docs/metadata.schema.json", "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  const validDocument = {
    id: "QUAL-EXAMPLE",
    type: "qualification",
    status: "source-admitted",
    owner: "architecture",
    summary: "source admission example",
    subject: "packages/core",
    evidence: [{ path: "evidence/source.json", digest: digest("source") }],
  };
  assert.equal(validate(validDocument), true);

  for (const [field, value] of [
    ["subject", "packages/CON"],
    ["subject", "packages/CON.\u2028x"],
    ["subject", "packages/CON.\u2029x"],
    ["evidence", [{ path: "evidence/", digest: digest("source") }]],
    ["evidence", [{ path: "evidence/CON.\u2028x", digest: digest("source") }]],
    ["evidence", [{ path: "evidence/CON.\u2029x", digest: digest("source") }]],
  ]) {
    const invalidDocument = { ...validDocument, [field]: value };
    assert.equal(validate(invalidDocument), false, `${field} must reject non-portable paths`);
    validate.errors = null;
  }
});

test("qualification claims cannot be silently demoted", async () => {
  const claim = {
    id: "QUAL-STRUCTURAL",
    type: "qualification",
    status: "structural-conformant",
    subject: "packages/core",
    evidence: [evidenceIdentity("evidence/structural.json", "structural\n")],
    promotion_decision: "ADR-0010",
    related: ["QUAL-SOURCE"],
  };
  const source = {
    id: "QUAL-SOURCE",
    type: "qualification",
    status: "source-admitted",
    subject: "packages/core",
    evidence: [evidenceIdentity("evidence/source.json", "source\n")],
  };
  const promotion = {
    id: "ADR-0010",
    type: "adr",
    status: "accepted",
    related: [claim.id],
  };
  const claimSource = {
    path: "docs/qualification/structural.md",
    bytes: "structural qualification bytes\n",
  };
  const documentSources = new Map([
    [source.id, { path: "docs/qualification/source.md", bytes: "source qualification bytes\n" }],
    [claim.id, claimSource],
    [promotion.id, {
      path: "docs/decisions/0010-structural.md",
      bytes: qualificationClaimAnchor({
        id: claim.id,
        path: claimSource.path,
        digest: digest(claimSource.bytes),
      }),
    }],
  ]);
  const evidenceFile = async path => ({
    kind: "regular",
    tracked: true,
    bytes: path.endsWith("source.json") ? "source\n" : "structural\n",
  });
  const validate = documents => validateQualificationClaims({
    documents,
    productionArtifacts: ["packages/core/src/index.ts"],
    documentSources,
    evidenceFile,
  });

  await assert.rejects(validate([
    { ...claim, status: "reviewed" },
    source,
    promotion,
  ]), /cannot retain a conformance claim or promotion anchor/u);
  await assert.rejects(validate([
    {
      id: claim.id,
      type: "qualification",
      status: "reviewed",
      owner: "architecture",
      summary: "demoted claim",
    },
    source,
    promotion,
  ]), /cannot retain a conformance claim or promotion anchor/u);
  await assert.rejects(validate([
    { ...claim, status: "superseded" },
    source,
    promotion,
  ]), /superseded claim must name a successor/u);
});

test("traceability is closed and bidirectional", () => {
  const sources = validateSourceMap(sourceMap);
  validateTraceability({
    requirementIds: requirementIdsFromMarkdown("### GM-REQ-001: One\n"),
    sources,
    authorityIds: new Set(["ADR-0001"]),
    decisionIds: new Set(["OD-001"]),
    blockerIds: new Set(["OD-001"]),
    traceability: {
      schemaVersion: 1,
      decisionCatalog: ["OD-001"],
      implementationBlockers: ["OD-001"],
      requirements: {
        "GM-REQ-001": {
          authorities: ["ADR-0001"],
          blockers: ["OD-001"],
          provenance: ["source-a"],
        },
      },
      sources: { "source-a": ["GM-REQ-001"] },
    },
  });
});

test("missing reverse traceability fails closed", () => {
  assert.throws(() => validateTraceability({
    requirementIds: new Set(["GM-REQ-001"]),
    sources: new Set(["source-a"]),
    authorityIds: new Set(["ADR-0001"]),
    decisionIds: new Set(),
    blockerIds: new Set(),
    traceability: {
      schemaVersion: 1,
      decisionCatalog: [],
      implementationBlockers: [],
      requirements: {
        "GM-REQ-001": { authorities: ["ADR-0001"], provenance: ["source-a"] },
      },
      sources: { "source-a": ["GM-REQ-002"] },
    },
  }), /reverse traceability mismatch/u);
});

test("unknown authorities and non-open blockers fail closed", () => {
  const base = {
    schemaVersion: 1,
    decisionCatalog: ["OD-001"],
    implementationBlockers: ["OD-001"],
    requirements: {
      "GM-REQ-001": { authorities: ["ADR-9999"], provenance: ["source-a"] },
    },
    sources: { "source-a": ["GM-REQ-001"] },
  };
  assert.throws(() => validateTraceability({
    requirementIds: new Set(["GM-REQ-001"]),
    sources: new Set(["source-a"]),
    authorityIds: new Set(["ADR-0001"]),
    decisionIds: new Set(["OD-001"]),
    blockerIds: new Set(["OD-001"]),
    traceability: base,
  }), /unknown or non-accepted authority ADR-9999/u);

  assert.throws(() => validateTraceability({
    requirementIds: new Set(["GM-REQ-001"]),
    sources: new Set(["source-a"]),
    authorityIds: new Set(["ADR-0001"]),
    decisionIds: new Set(["OD-001"]),
    blockerIds: new Set(["OD-001"]),
    traceability: {
      ...base,
      requirements: {
        "GM-REQ-001": {
          authorities: ["ADR-0001"],
          blockers: ["OD-002"],
          provenance: ["source-a"],
        },
      },
    },
  }), /unknown or non-open blocker OD-002/u);

  assert.throws(() => validateTraceability({
    requirementIds: new Set(["GM-REQ-001"]),
    sources: new Set(["source-a"]),
    authorityIds: new Set(["ADR-0001"]),
    decisionIds: new Set(["OD-001"]),
    blockerIds: new Set(["OD-001"]),
    traceability: {
      ...base,
      implementationBlockers: [],
      requirements: {
        "GM-REQ-001": { authorities: ["ADR-0001"], provenance: ["source-a"] },
      },
    },
  }), /implementation blockers do not match/u);
});

test("authority mutation and unauthorized promotion fail closed", async () => {
  const bytes = "accepted architecture\n";
  const ledger = {
    schemaVersion: 1,
    algorithm: "sha256-bytes",
    authorities: [{
      id: "ARCH-ONE",
      type: "architecture",
      path: "docs/architecture/one.md",
      immutableDigest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    }],
  };
  const authorities = await validateAuthorityLedger({ ledger, readBytes: async () => bytes });
  validateAcceptedAuthorityCatalog({
    documents: [{ id: "ARCH-ONE", type: "architecture", status: "accepted" }],
    ledgerAuthorities: authorities,
  });
  await assert.rejects(
    validateAuthorityLedger({ ledger, readBytes: async () => "mutated\n" }),
    /differs from accepted authority/u,
  );
  assert.throws(() => validateAcceptedAuthorityCatalog({
    documents: [
      { id: "ARCH-ONE", type: "architecture", status: "accepted" },
      { id: "ARCH-TWO", type: "architecture", status: "accepted" },
    ],
    ledgerAuthorities: authorities,
  }), /do not match the immutable authority ledger/u);
});

test("accepted authority custody closes ledger shape, paths, bytes, and ADR anchor", async () => {
  const ledgerBytes = await readFile(ACCEPTED_AUTHORITY_LEDGER_PATH);
  assert.equal(digest(ledgerBytes), ACCEPTED_AUTHORITY_LEDGER_DIGEST);
  assert.doesNotThrow(() => validateAuthorityLedgerCustody({
    ledgerBytes,
    decisionMarkdown: `${ACCEPTED_AUTHORITY_LEDGER_ANCHOR}\n`,
  }));
  assert.throws(() => validateAuthorityLedgerCustody({
    ledgerBytes: Buffer.concat([ledgerBytes, Buffer.from("\n")]),
    decisionMarkdown: `${ACCEPTED_AUTHORITY_LEDGER_ANCHOR}\n`,
  }), /must remain sha256:/u);
  assert.throws(() => validateAuthorityLedgerCustody({
    ledgerBytes,
    decisionMarkdown: ACCEPTED_AUTHORITY_LEDGER_ANCHOR.replace("anchored", "recorded"),
  }), /missing the exact accepted authority ledger anchor/u);

  const bytes = "accepted architecture\n";
  const entry = {
    id: "ARCH-ONE",
    type: "architecture",
    path: "docs/architecture/one.md",
    immutableDigest: digest(bytes),
  };
  const ledger = { schemaVersion: 1, algorithm: "sha256-bytes", authorities: [entry] };
  const readBytes = async () => bytes;
  for (const mutant of [
    { ...ledger, secondLedger: [] },
    { ...ledger, authorities: [{ ...entry, ledgerDigest: digest("other") }] },
  ]) {
    await assert.rejects(validateAuthorityLedger({ ledger: mutant, readBytes }),
      /must contain exactly/u);
  }
  for (const path of [
    "architecture/authority/accepted-authorities.json",
    "docs/requirements/one.md",
    "docs/architecture/nested/one.md",
  ]) {
    await assert.rejects(validateAuthorityLedger({
      ledger: { ...ledger, authorities: [{ ...entry, path }] },
      readBytes,
    }), /invalid architecture authority path/u);
  }
});

test("open decisions block production artifacts and qualification claims", () => {
  const blockerIds = new Set(["OD-001"]);
  assert.throws(() => validateBlockedImplementation({
    blockerIds,
    productionArtifacts: ["packages/group/core/package.json", "src/index.ts"],
    claimDocuments: [],
  }), /production artifacts are blocked/u);
  assert.throws(() => validateBlockedImplementation({
    blockerIds,
    productionArtifacts: [],
    claimDocuments: ["QUAL-V1"],
  }), /qualification claims are blocked/u);
});

test("qualification claims require ordered admission, evidence, and promotion", async () => {
  const evidenceBytes = new Map([
    ["evidence/source-admission.json", "source admission evidence\n"],
    ["evidence/structural.json", "positive and negative structural evidence\n"],
    ["evidence/runtime.json", "packed runtime evidence\n"],
  ]);
  const sourceAdmission = {
    id: "QUAL-SOURCE",
    type: "qualification",
    status: "source-admitted",
    subject: "packages/core",
    evidence: [evidenceIdentity(
      "evidence/source-admission.json",
      evidenceBytes.get("evidence/source-admission.json"),
    )],
  };
  const structural = {
    id: "QUAL-STRUCTURAL",
    type: "qualification",
    status: "structural-conformant",
    subject: "packages/core",
    evidence: [evidenceIdentity(
      "evidence/structural.json",
      evidenceBytes.get("evidence/structural.json"),
    )],
    promotion_decision: "ADR-0010",
    related: ["QUAL-SOURCE"],
  };
  const runtime = {
    id: "QUAL-RUNTIME",
    type: "qualification",
    status: "runtime-conformant",
    subject: "packages/core",
    evidence: [evidenceIdentity(
      "evidence/runtime.json",
      evidenceBytes.get("evidence/runtime.json"),
    )],
    promotion_decision: "ADR-0011",
    related: ["QUAL-STRUCTURAL"],
  };
  const documents = [
    sourceAdmission,
    structural,
    runtime,
    {
      id: "ADR-0010",
      type: "adr",
      status: "accepted",
      related: ["QUAL-STRUCTURAL"],
    },
    {
      id: "ADR-0011",
      type: "adr",
      status: "accepted",
      related: ["QUAL-RUNTIME"],
    },
  ];
  const claimSources = new Map([
    ["QUAL-SOURCE", {
      path: "docs/qualification/source.md",
      bytes: "source admission claim bytes\n",
    }],
    ["QUAL-STRUCTURAL", {
      path: "docs/qualification/structural.md",
      bytes: "structural claim bytes\n",
    }],
    ["QUAL-RUNTIME", {
      path: "docs/qualification/runtime.md",
      bytes: "runtime claim bytes\n",
    }],
  ]);
  const documentSources = new Map(claimSources);
  for (const [claim, decisionId, decisionPath] of [
    [structural, "ADR-0010", "docs/decisions/0010-structural.md"],
    [runtime, "ADR-0011", "docs/decisions/0011-runtime.md"],
  ]) {
    const claimSource = claimSources.get(claim.id);
    documentSources.set(decisionId, {
      path: decisionPath,
      bytes: `${qualificationClaimAnchor({
        id: claim.id,
        path: claimSource.path,
        digest: digest(claimSource.bytes),
      })}\n`,
    });
  }
  const evidenceFile = async path => evidenceBytes.has(path)
    ? { kind: "regular", tracked: true, bytes: evidenceBytes.get(path) }
    : { kind: "missing" };
  assert.deepEqual(await validateQualificationClaims({
    documents,
    productionArtifacts: ["packages/core/src/index.ts"],
    documentSources,
    evidenceFile,
  }), ["QUAL-SOURCE", "QUAL-STRUCTURAL", "QUAL-RUNTIME"]);

  for (const claim of [structural, runtime]) {
    await assert.rejects(validateQualificationClaims({
      documents,
      productionArtifacts: [],
      documentSources,
      evidenceFile,
    }), /without its production subject/u);

    await assert.rejects(validateQualificationClaims({
      documents: documents.map(document => document.id === claim.id
        ? { ...document, evidence: [] }
        : document),
      productionArtifacts: ["packages/core/src/index.ts"],
      documentSources,
      evidenceFile,
    }), /evidence must be a non-empty evidence identity array/u);

    await assert.rejects(validateQualificationClaims({
      documents: documents.map(document => document.id === claim.id
        ? { ...document, promotion_decision: "ADR-9999" }
        : document),
      productionArtifacts: ["packages/core/src/index.ts"],
      documentSources,
      evidenceFile,
    }), /requires an accepted promotion decision/u);
  }
});

test("qualification custody rejects path-only, mutable, circular, and non-file evidence", async () => {
  const evidenceBytes = "structural evidence bytes\n";
  const source = {
    id: "QUAL-SOURCE",
    type: "qualification",
    status: "source-admitted",
    subject: "packages/core",
    evidence: [evidenceIdentity("evidence/source.json", "source evidence\n")],
  };
  const claim = {
    id: "QUAL-STRUCTURAL",
    type: "qualification",
    status: "structural-conformant",
    subject: "packages/core",
    evidence: [evidenceIdentity("evidence/structural.json", evidenceBytes)],
    promotion_decision: "ADR-0010",
    related: ["QUAL-SOURCE"],
  };
  const promotion = {
    id: "ADR-0010",
    type: "adr",
    status: "accepted",
    related: ["QUAL-STRUCTURAL"],
  };
  const claimSource = {
    path: "docs/qualification/structural.md",
    bytes: "exact structural qualification claim bytes\n",
  };
  const exactAnchor = qualificationClaimAnchor({
    id: claim.id,
    path: claimSource.path,
    digest: digest(claimSource.bytes),
  });
  const documentSources = new Map([
    [source.id, { path: "docs/qualification/source.md", bytes: "source claim bytes\n" }],
    [claim.id, claimSource],
    [promotion.id, { path: "docs/decisions/0010-promote.md", bytes: `${exactAnchor}\n` }],
  ]);
  const documents = [source, claim, promotion];
  const evidenceFile = async path => ({
    kind: "regular",
    tracked: true,
    bytes: path === "evidence/source.json" ? "source evidence\n" : evidenceBytes,
  });
  const validate = (overrides = {}) => validateQualificationClaims({
    documents,
    productionArtifacts: ["packages/core/src/index.ts"],
    documentSources,
    evidenceFile,
    ...overrides,
  });

  await assert.rejects(validate({
    documents: documents.map(document => document.id === claim.id
      ? { ...document, evidence: ["evidence/structural.json"] }
      : document),
  }), /evidence identity must contain exactly/u);
  for (const path of [
    "../outside.json",
    "/outside.json",
    "C:/outside.json",
    "C:outside.json",
    "evidence/../outside.json",
  ]) {
    await assert.rejects(validate({
      documents: documents.map(document => document.id === claim.id
        ? { ...document, evidence: [{ ...document.evidence[0], path }] }
        : document),
    }), /unsafe evidence path/u);
  }
  await assert.rejects(validate({ evidenceFile: async () => ({ kind: "symlink" }) }),
    /must be a regular in-repository file/u);
  await assert.rejects(validate({
    evidenceFile: async () => ({ kind: "regular", tracked: false, bytes: evidenceBytes }),
  }), /tracked Git identity/u);
  await assert.rejects(validate({ evidenceFile: async () => ({ kind: "missing" }) }),
    /references missing evidence/u);
  await assert.rejects(validate({
    evidenceFile: async path => ({
      kind: "regular",
      tracked: true,
      bytes: path === "evidence/source.json" ? "source evidence\n" : "changed bytes\n",
    }),
  }), /evidence differs from sha256:/u);
  await assert.rejects(validate({
    documentSources: new Map(documentSources).set(claim.id, {
      ...claimSource,
      bytes: "changed structural qualification claim bytes\n",
    }),
  }), /missing its exact qualification bytes anchor/u);
  await assert.rejects(validate({
    documentSources: new Map(documentSources).set(promotion.id, {
      path: "docs/decisions/0010-promote.md",
      bytes: exactAnchor.replace("anchored", "recorded"),
    }),
  }), /missing its exact qualification bytes anchor/u);
  await assert.rejects(validate({
    documents: documents.map(document => document.id === promotion.id
      ? { ...document, related: [] }
      : document),
  }), /must reference the qualification claim/u);
  await assert.rejects(validate({
    documents: documents.filter(document => document.id !== source.id),
  }), /requires a related source-admitted claim/u);
  await assert.rejects(validate({
    documents: documents.map(document => document.id === claim.id
      ? {
        ...document,
        evidence: [evidenceIdentity(claimSource.path, claimSource.bytes)],
      }
      : document),
  }), /cannot create self or circular custody/u);
  await assert.rejects(validate({
    documents: documents.map(document => document.id === claim.id
      ? {
        ...document,
        evidence: [evidenceIdentity("docs/decisions/0010-promote.md", `${exactAnchor}\n`)],
      }
      : document),
  }), /cannot create self or circular custody/u);
});

test("qualification states cannot collapse source, structural, and runtime claims", async () => {
  await assert.rejects(validateQualificationClaims({
    documents: [{ id: "QUAL-VAGUE", type: "qualification", status: "qualified" }],
    productionArtifacts: ["packages/core/src/index.ts"],
  }), /unsupported qualification status/u);

  const runtimeBytes = "runtime qualification claim bytes\n";
  await assert.rejects(validateQualificationClaims({
    documents: [
      {
        id: "QUAL-RUNTIME",
        type: "qualification",
        status: "runtime-conformant",
        subject: "packages/core",
        evidence: ["evidence/runtime.json"],
        promotion_decision: "ADR-0011",
        related: ["QUAL-SOURCE"],
      },
      {
        id: "QUAL-SOURCE",
        type: "qualification",
        status: "source-admitted",
        subject: "packages/core",
        evidence: ["evidence/source.json"],
      },
      {
        id: "ADR-0011",
        type: "adr",
        status: "accepted",
        related: ["QUAL-RUNTIME"],
      },
    ],
    productionArtifacts: ["packages/core/src/index.ts"],
    documentSources: new Map([
      ["QUAL-RUNTIME", {
        path: "docs/qualification/runtime.md",
        bytes: runtimeBytes,
      }],
      ["ADR-0011", {
        path: "docs/decisions/0011-runtime.md",
        bytes: qualificationClaimAnchor({
          id: "QUAL-RUNTIME",
          path: "docs/qualification/runtime.md",
          digest: digest(runtimeBytes),
        }),
      }],
    ]),
  }), /requires a related structural-conformant claim/u);
});

test("qualification claims and the authoritative profile cannot disagree", () => {
  const profile = {
    adoption: {
      conformance: {
        structural: { status: "not-claimed" },
        runtime: { status: "not-claimed" },
      },
    },
  };
  assert.doesNotThrow(() => validateQualificationProfileConsistency({
    profile,
    documents: [],
  }));
  assert.doesNotThrow(() => validateQualificationProfileConsistency({
    profile,
    documents: [{ type: "architecture", status: "structural-conformant" }],
  }));
  assert.throws(() => validateQualificationProfileConsistency({
    profile: {
      adoption: {
        conformance: {
          structural: { status: "structural-conformant" },
          runtime: { status: "not-claimed" },
        },
      },
    },
    documents: [{ type: "architecture", status: "structural-conformant" }],
  }), /structural conformance disagrees/u);
  assert.throws(() => validateQualificationProfileConsistency({
    profile: {
      adoption: {
        conformance: {
          structural: { status: "structural-conformant" },
          runtime: { status: "not-claimed" },
        },
      },
    },
    documents: [],
  }), /structural conformance disagrees/u);
  assert.doesNotThrow(() => validateQualificationProfileConsistency({
    profile: {
      adoption: {
        conformance: {
          structural: { status: "structural-conformant" },
          runtime: { status: "runtime-conformant" },
        },
      },
    },
    documents: [
      { type: "qualification", status: "structural-conformant" },
      { type: "qualification", status: "runtime-conformant" },
    ],
  }));
});

test("tracked evidence custody rejects untracked files and every symlink component", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-evidence-custody-"));
  try {
    await execFileAsync("git", ["init", "--quiet"], { cwd: fixture });
    await mkdir(join(fixture, "evidence"), { recursive: true });
    await writeFile(join(fixture, "evidence", "tracked.json"), "tracked\n");
    await writeFile(join(fixture, "evidence", "untracked.json"), "untracked\n");
    await execFileAsync("git", ["add", "--", "evidence/tracked.json"], { cwd: fixture });
    await symlink("evidence", join(fixture, "linked"), "dir");

    assert.deepEqual(await readTrackedEvidence("evidence/tracked.json", fixture), {
      kind: "regular",
      tracked: true,
      bytes: Buffer.from("tracked\n"),
    });
    assert.deepEqual(await readTrackedEvidence("evidence/untracked.json", fixture), {
      kind: "untracked",
    });
    assert.deepEqual(await readTrackedEvidence("linked/tracked.json", fixture), {
      kind: "symlink",
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("production artifact discovery fails closed across repository layouts", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-governance-"));
  try {
    await writeFile(join(fixture, "package.json"), JSON.stringify({ private: true, files: ["compiler.js"] }));
    await writeFile(join(fixture, "compiler.ts"), "export const compiler = true;\n");
    await mkdir(join(fixture, "scripts"));
    await writeFile(join(fixture, "scripts/compiler.ts"), "export const compiler = true;\n");
    await mkdir(join(fixture, "examples/core"), { recursive: true });
    await writeFile(join(fixture, "examples/core/package.json"), JSON.stringify({ private: true }));

    assert.deepEqual(await productionArtifactPaths(fixture), [
      "compiler.ts",
      "examples/core/package.json",
      "package.json#files",
      "scripts/compiler.ts",
    ]);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("production artifact discovery inventories symlinks without following them", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-governance-symlink-"));
  try {
    await writeFile(join(fixture, "package.json"), "{\"private\":true}\n");
    await mkdir(join(fixture, "packages", "core"), { recursive: true });
    await writeFile(join(fixture, "packages", "README.md"), "Not production.\n");
    await mkdir(join(fixture, "docs", "target"), { recursive: true });
    await writeFile(join(fixture, "docs", "target", "index.ts"), "not repository production\n");
    await symlink("../../docs/target", join(fixture, "packages", "core", "linked"), "dir");
    await symlink("target", join(fixture, "docs", "outside-linked"), "dir");
    await symlink("docs/target", join(fixture, "node_modules"), "dir");

    const artifacts = await productionArtifactPaths(fixture);
    assert.deepEqual(artifacts, ["docs/outside-linked", "packages/core/linked"]);
    assert.deepEqual(productionArtifactsOutsidePackages(artifacts), ["docs/outside-linked"]);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("resolved decisions require an accepted reciprocal ADR", () => {
  assert.doesNotThrow(() => validateDecisionResolutions([
    { id: "OD-001", type: "open-decision", status: "resolved", resolved_by: "ADR-0002" },
    { id: "ADR-0002", type: "adr", status: "accepted", related: ["OD-001"] },
  ]));
  assert.throws(() => validateDecisionResolutions([
    { id: "OD-001", type: "open-decision", status: "resolved", resolved_by: "ADR-9999" },
  ]), /must resolve through an accepted ADR/u);
  assert.throws(() => validateDecisionResolutions([
    { id: "OD-001", type: "open-decision", status: "resolved", resolved_by: "ADR-0002" },
    { id: "ADR-0002", type: "adr", status: "accepted", related: [] },
  ]), /must reference the resolved decision/u);
});

test("mutable revisions and unsafe paths fail closed", () => {
  assert.throws(() => validateSourceMap({
    schemaVersion: 1,
    sources: [{
      id: "source-a",
      repository: "https://example.test/source",
      revision: "main",
      status: "accepted-authority-at-observation",
      observedAt: "2026-08-29",
      paths: ["../secret"],
    }],
  }), /non-exact revision/u);

  assert.throws(() => validateSourceMap({
    ...sourceMap,
    sources: [{ ...sourceMap.sources[0], observedAt: "2026-02-30" }],
  }), /invalid observation date/u);
  assert.throws(() => validateSourceMap({
    ...sourceMap,
    sources: [{ ...sourceMap.sources[0], observedAt: "2025-02-29" }],
  }), /invalid observation date/u);
  assert.doesNotThrow(() => validateSourceMap({
    ...sourceMap,
    sources: [{ ...sourceMap.sources[0], observedAt: "2024-02-29" }],
  }));
});
