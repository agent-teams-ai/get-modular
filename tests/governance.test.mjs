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
    traceability: {
      schemaVersion: 1,
      requirements: {
        "GM-REQ-001": { authorities: ["ADR-0001"], provenance: ["source-a"] },
      },
      sources: { "source-a": ["GM-REQ-001"] },
    },
  });
});

test("missing reverse traceability fails closed", () => {
  assert.throws(() => validateTraceability({
    requirementIds: new Set(["GM-REQ-001"]),
    sources: new Set(["source-a"]),
    traceability: {
      schemaVersion: 1,
      requirements: {
        "GM-REQ-001": { authorities: ["ADR-0001"], provenance: ["source-a"] },
      },
      sources: { "source-a": ["GM-REQ-002"] },
    },
  }), /reverse traceability mismatch/u);
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
