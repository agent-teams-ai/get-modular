import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  productionArtifactPaths,
  requirementIdsFromMarkdown,
  validateAcceptedAuthorityCatalog,
  validateAuthorityLedger,
  validateBlockedImplementation,
  validateDecisionResolutions,
  validateQualificationClaims,
  validateSourceMap,
  validateTraceability,
} from "../architecture/checks/governance.mjs";

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
  const sourceAdmission = {
    id: "QUAL-SOURCE",
    type: "qualification",
    status: "source-admitted",
    subject: "packages/core",
    evidence: ["evidence/source-admission.json"],
  };
  const structural = {
    id: "QUAL-STRUCTURAL",
    type: "qualification",
    status: "structural-conformant",
    subject: "packages/core",
    evidence: ["evidence/structural.json"],
    promotion_decision: "ADR-0010",
    related: ["QUAL-SOURCE"],
  };
  const runtime = {
    id: "QUAL-RUNTIME",
    type: "qualification",
    status: "runtime-conformant",
    subject: "packages/core",
    evidence: ["evidence/runtime.json"],
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
  const evidence = new Set([
    "evidence/source-admission.json",
    "evidence/structural.json",
    "evidence/runtime.json",
  ]);
  assert.deepEqual(await validateQualificationClaims({
    documents,
    productionArtifacts: ["packages/core/src/index.ts"],
    evidenceExists: async path => evidence.has(path),
  }), ["QUAL-SOURCE", "QUAL-STRUCTURAL", "QUAL-RUNTIME"]);

  for (const claim of [structural, runtime]) {
    await assert.rejects(validateQualificationClaims({
      documents: [claim],
      productionArtifacts: [],
      evidenceExists: async path => evidence.has(path),
    }), /without its production subject/u);

    await assert.rejects(validateQualificationClaims({
      documents: documents.map(document => document.id === claim.id
        ? { ...document, evidence: [] }
        : document),
      productionArtifacts: ["packages/core/src/index.ts"],
      evidenceExists: async path => evidence.has(path),
    }), /evidence must be a non-empty string array/u);

    await assert.rejects(validateQualificationClaims({
      documents: documents.map(document => document.id === claim.id
        ? { ...document, promotion_decision: "ADR-9999" }
        : document),
      productionArtifacts: ["packages/core/src/index.ts"],
      evidenceExists: async path => evidence.has(path),
    }), /requires an accepted promotion decision/u);
  }
});

test("qualification states cannot collapse source, structural, and runtime claims", async () => {
  const evidenceExists = async () => true;
  await assert.rejects(validateQualificationClaims({
    documents: [{ id: "QUAL-VAGUE", type: "qualification", status: "qualified" }],
    productionArtifacts: ["packages/core/src/index.ts"],
    evidenceExists,
  }), /unsupported qualification status/u);

  await assert.rejects(validateQualificationClaims({
    documents: [
      {
        id: "QUAL-SOURCE",
        type: "qualification",
        status: "source-admitted",
        subject: "packages/core",
        evidence: ["evidence/source.json"],
      },
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
        id: "ADR-0011",
        type: "adr",
        status: "accepted",
        related: ["QUAL-RUNTIME"],
      },
    ],
    productionArtifacts: ["packages/core/src/index.ts"],
    evidenceExists,
  }), /requires a related structural-conformant claim/u);
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
