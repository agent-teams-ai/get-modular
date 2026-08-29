import assert from "node:assert/strict";
import test from "node:test";
import {
  requirementIdsFromMarkdown,
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
    blockerIds: new Set(["OD-001"]),
    traceability: {
      schemaVersion: 1,
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
    blockerIds: new Set(),
    traceability: {
      schemaVersion: 1,
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
    requirements: {
      "GM-REQ-001": { authorities: ["ADR-9999"], provenance: ["source-a"] },
    },
    sources: { "source-a": ["GM-REQ-001"] },
  };
  assert.throws(() => validateTraceability({
    requirementIds: new Set(["GM-REQ-001"]),
    sources: new Set(["source-a"]),
    authorityIds: new Set(["ADR-0001"]),
    blockerIds: new Set(["OD-001"]),
    traceability: base,
  }), /unknown or non-accepted authority ADR-9999/u);

  assert.throws(() => validateTraceability({
    requirementIds: new Set(["GM-REQ-001"]),
    sources: new Set(["source-a"]),
    authorityIds: new Set(["ADR-0001"]),
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
});
