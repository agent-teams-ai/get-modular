import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import Ajv2020 from "ajv/dist/2020.js";
import canonicalize from "canonicalize";
import { canonicalize as canonicalizeOracle } from "json-canonicalize";
import { createScanner, getLocation, SyntaxKind, visit } from "jsonc-parser";

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const DECODER_CASE_TUPLES_SHA256 =
  "sha256:0f83006107baea631c295fcb45f809a6678958822c91f883d6867aa977f6f541";
const CANONICAL_CASE_TUPLES_SHA256 =
  "sha256:ae527070f5b3b2b1429ae734a6b4d62d684faf0c517f2b47c304a92564569be3";
const QUALIFICATION_PATH = /^architecture\/qualification\/v1\/[a-z0-9.-]+\.json$/u;
const QUALIFICATION_ARTIFACT_ID = /^GM-V1-[A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
const EFFECTIVE_RESOURCE_PROFILE_AUTHORITY = Object.freeze({
  kind: "get-modular.resource-profile",
  profileId: "get-modular/resource-profile/v1-standard",
  profileVersion: 2,
  limits: {
    declarationRawDocumentBytes: 1048576,
    profileRawDocumentBytes: 8388608,
    aggregateRawBytes: 16777216,
    jsonValueOccurrences: 2097152,
    jsonDepth: 32,
    aggregateStringBytes: 8388608,
    identifierBytes: 128,
    ownerPathSegments: 8,
    declarations: 4096,
    capabilitiesPerDeclaration: 64,
    slotsPerDeclaration: 128,
    totalCapabilities: 65536,
    totalSlots: 65536,
    roots: 1024,
    selections: 4096,
    bindings: 65536,
    graphEdges: 262144,
    providersPerManySlot: 1024,
    graphDepth: 2048,
    diagnostics: 256,
    diagnosticPathSegments: 32,
  },
});
const PATH_POLICIES = new Set(["empty", "structural", "limit-specific"]);
const PHASE_ORDER_AUTHORITY = [
  "decode", "schema", "declaration", "profile", "binding", "graph", "output",
];
const CODE_ORDER_AUTHORITY = [
  "decode.invalid-json", "decode.duplicate-key", "input.limit-exceeded",
  "schema.unsupported-version", "schema.unknown-field", "schema.invalid-value",
  "schema.non-plain-value", "identity.invalid", "declaration.duplicate-implementation",
  "declaration.duplicate-capability", "declaration.duplicate-slot", "profile.duplicate-root",
  "profile.unknown-root", "profile.duplicate-selection", "profile.unknown-module",
  "profile.unknown-implementation", "profile.implementation-mismatch",
  "profile.missing-selection", "profile.unreachable-selection", "binding.duplicate",
  "binding.missing", "binding.unknown-consumer", "binding.unknown-slot",
  "binding.unknown-provider", "binding.provider-not-selected", "binding.cardinality",
  "binding.capability-missing", "binding.compatibility-mismatch", "graph.cycle",
  "output.canonicalization-failed", "diagnostics.truncated",
];
const RESERVED_NON_EMITTABLE_CODE_ORDER_AUTHORITY = ["output.canonicalization-failed"];
const RESERVED_NON_EMITTABLE_CODE_SET = new Set(
  RESERVED_NON_EMITTABLE_CODE_ORDER_AUTHORITY,
);
const EMITTABLE_CODE_ORDER_AUTHORITY = CODE_ORDER_AUTHORITY.filter(
  code => !RESERVED_NON_EMITTABLE_CODE_SET.has(code),
);
const DECODER_CATEGORY_AUTHORITY = new Map([
  ["plain-object", "json.valid-baseline"],
  ["leading-and-trailing-json-whitespace", "json.valid-whitespace"],
  ["utf8-bom", "encoding.utf8-bom"],
  ["invalid-utf8-unexpected-continuation", "encoding.utf8-unexpected-continuation"],
  ["overlong-utf8", "encoding.utf8-overlong-two-byte"],
  ["invalid-utf8-continuation", "encoding.utf8-invalid-second-byte"],
  ["invalid-continuation-before-delimiter-two-byte",
    "encoding.utf8-invalid-continuation-before-delimiter-two-byte"],
  ["invalid-continuation-before-delimiter-three-byte",
    "encoding.utf8-invalid-continuation-before-delimiter-three-byte"],
  ["invalid-continuation-before-delimiter-four-byte",
    "encoding.utf8-invalid-continuation-before-delimiter-four-byte"],
  ["eof-truncated-utf8-two-byte", "encoding.utf8-eof-truncated-two-byte"],
  ["eof-truncated-utf8-three-byte", "encoding.utf8-eof-truncated-three-byte"],
  ["eof-truncated-utf8-four-byte", "encoding.utf8-eof-truncated-four-byte"],
  ["overlong-utf8-three-byte", "encoding.utf8-overlong-three-byte"],
  ["utf8-encoded-surrogate", "encoding.utf8-surrogate"],
  ["overlong-utf8-four-byte", "encoding.utf8-overlong-four-byte"],
  ["utf8-above-unicode-maximum", "encoding.utf8-above-unicode-maximum"],
  ["utf8-forbidden-high-lead", "encoding.utf8-forbidden-high-lead"],
  ["invalid-utf8-third-byte", "encoding.utf8-invalid-third-byte"],
  ["invalid-utf8-fourth-byte", "encoding.utf8-invalid-fourth-byte"],
  ["valid-utf8-multibyte-control", "encoding.utf8-valid-multibyte-control"],
  ["duplicate-object-key", "json.duplicate-key-successor"],
  ["nested-duplicate-object-key", "json.duplicate-key-nested"],
  ["escape-equivalent-duplicate-key", "json.duplicate-key-escape-equivalent"],
  ["same-key-in-different-objects", "json.valid-key-scope"],
  ["line-comment", "json.line-comment"],
  ["block-comment", "json.block-comment"],
  ["trailing-comma", "json.trailing-comma"],
  ["empty-document", "json.empty-document"],
  ["multiple-root-values", "json.multiple-root-values"],
  ["incomplete-document", "json.incomplete-document"],
  ["leading-zero-number", "json.leading-zero-number"],
  ["trailing-decimal-point", "json.trailing-decimal-point"],
  ["raw-control-character", "json.raw-control-character"],
  ["prototype-property-is-data-before-schema-validation", "semantic.unknown-field-successor"],
  ["valid-surrogate-pair-escape", "json.valid-surrogate-pair-escape"],
  ["json-depth-at-limit", "resource.json-depth-at-limit"],
  ["json-depth-over-limit", "resource.json-depth-over-limit"],
  ["lone-surrogate-escape", "semantic.terminal-high-surrogate-successor"],
  ["negative-zero", "semantic.negative-zero-successor"],
]);
const CANONICAL_CATEGORY_AUTHORITY = new Map([
  ["object-key-order", "jcs.object-key-order"],
  ["string-escaping", "jcs.string-escaping"],
  ["unicode-property-order", "jcs.unicode-property-order"],
  ["rfc-number-serialization", "jcs.number-serialization"],
  ["safe-integer-boundaries", "jcs.safe-integer-boundaries"],
]);
const ACCEPTED_SUCCESSOR_AUTHORITY = new Map([
  ["duplicate-object-key", ["duplicate-key", "duplicate-object-key",
    "json.duplicate-key-successor", "duplicate-key:$:kind", "duplicate-key:$:moduleId",
    "sha256:ebeaba02aa16885f89b5cb1f990fb7e88a281af2e981b0ff3e72a6f64ee8f20d"]],
  ["lone-surrogate", ["lone-surrogate", "lone-surrogate-escape",
    "semantic.terminal-high-surrogate-successor", "lone-surrogate:$.profileId@8",
    "lone-surrogate:$.owner.path[0]@6",
    "sha256:2d7ac36708c3325f758ab4affe00194b91a81fd12479531a6a9a967d98a02773"]],
  ["negative-zero", ["negative-zero", "negative-zero", "semantic.negative-zero-successor",
    "negative-zero:$.schemaVersion", "negative-zero:$.slots[0].cardinality.min",
    "sha256:73aa27365aee200ab9e8a5d0c580fc35a8c9f716db19e8d967fa5cbf8854b690"]],
  ["unknown-field", ["unknown-field", "prototype-property-is-data-before-schema-validation",
    "semantic.unknown-field-successor", "unknown-field:$:unknown",
    "unknown-field:$:__proto__",
    "sha256:dc904f7ad9e87c9014f739bdd35e125562fd51e87ef9e15202d788cdd1b85bc7"]],
]);
const PATH_POLICY_AUTHORITY = Object.freeze({
  "decode.invalid-json": "empty",
  "decode.duplicate-key": "structural",
  "input.limit-exceeded": "limit-specific",
  "schema.unsupported-version": "structural",
  "schema.unknown-field": "structural",
  "schema.invalid-value": "structural",
  "schema.non-plain-value": "structural",
  "identity.invalid": "structural",
  "declaration.duplicate-implementation": "empty",
  "declaration.duplicate-capability": "structural",
  "declaration.duplicate-slot": "structural",
  "profile.duplicate-root": "empty",
  "profile.unknown-root": "empty",
  "profile.duplicate-selection": "empty",
  "profile.unknown-module": "empty",
  "profile.unknown-implementation": "empty",
  "profile.implementation-mismatch": "empty",
  "profile.missing-selection": "empty",
  "profile.unreachable-selection": "empty",
  "binding.duplicate": "empty",
  "binding.missing": "empty",
  "binding.unknown-consumer": "empty",
  "binding.unknown-slot": "empty",
  "binding.unknown-provider": "empty",
  "binding.provider-not-selected": "empty",
  "binding.cardinality": "empty",
  "binding.capability-missing": "empty",
  "binding.compatibility-mismatch": "empty",
  "graph.cycle": "empty",
  "diagnostics.truncated": "empty",
});
const LIMIT_PATH_POLICY_AUTHORITY = Object.freeze({
  declarationRawDocumentBytes: "structural",
  profileRawDocumentBytes: "structural",
  aggregateRawBytes: "empty",
  jsonValueOccurrences: "empty",
  jsonDepth: "structural",
  aggregateStringBytes: "empty",
  identifierBytes: "structural",
  ownerPathSegments: "structural",
  declarations: "empty",
  capabilitiesPerDeclaration: "structural",
  slotsPerDeclaration: "structural",
  totalCapabilities: "empty",
  totalSlots: "empty",
  roots: "structural",
  selections: "structural",
  bindings: "structural",
  graphEdges: "empty",
  providersPerManySlot: "structural",
  graphDepth: "empty",
  diagnostics: "empty",
  diagnosticPathSegments: "empty",
});
const PREREQUISITE_FACT_AUTHORITY = Object.freeze([
  { factId: "batch.raw-bytes-admitted", scope: "batch" },
  { factId: "document.raw-bytes-admitted", scope: "document" },
  { factId: "document.decoded", scope: "document" },
  { factId: "document.schema-valid", scope: "document" },
  { factId: "declaration.identity-census-complete", scope: "batch" },
  { factId: "declaration.module-census-complete", scope: "batch" },
  { factId: "profile.root-census-complete", scope: "profile" },
  { factId: "profile.selection-census-complete", scope: "profile" },
  { factId: "profile.selection-uniqueness", scope: "profile" },
  { factId: "binding.consumer-census-complete", scope: "binding" },
  { factId: "binding.slot-census-complete", scope: "binding" },
  { factId: "binding.provider-census-complete", scope: "binding" },
  { factId: "binding.reached-frontier-complete", scope: "graph" },
  { factId: "graph.selected-node-census-complete", scope: "graph" },
  { factId: "graph.positive-edge-subgraph-complete", scope: "graph" },
  { factId: "output.plan-eligible", scope: "output" },
  { factId: "output.diagnostic-stream-complete", scope: "output" },
]);
const DIAGNOSTIC_PREREQUISITE_AUTHORITY = Object.freeze({
  "decode.invalid-json": ["decode.document", "document", ["document.raw-bytes-admitted"]],
  "decode.duplicate-key": ["decode.document-keys", "document", ["document.raw-bytes-admitted"]],
  "input.limit-exceeded": ["resource.selected-limit", "limit", []],
  "schema.unsupported-version": ["schema.document", "document", ["document.decoded"]],
  "schema.unknown-field": ["schema.document", "document", ["document.decoded"]],
  "schema.invalid-value": ["schema.document", "document", ["document.decoded"]],
  "schema.non-plain-value": ["schema.document", "document", ["document.decoded"]],
  "identity.invalid": ["schema.identity", "document", ["document.decoded"]],
  "declaration.duplicate-implementation": ["declaration.identity-census", "declaration", ["document.schema-valid"]],
  "declaration.duplicate-capability": ["declaration.capabilities", "declaration", ["document.schema-valid"]],
  "declaration.duplicate-slot": ["declaration.slots", "declaration", ["document.schema-valid"]],
  "profile.duplicate-root": ["profile.roots", "profile", ["document.schema-valid"]],
  "profile.unknown-root": ["profile.roots", "profile", ["document.schema-valid", "declaration.module-census-complete"]],
  "profile.duplicate-selection": ["profile.selections", "profile", ["document.schema-valid"]],
  "profile.unknown-module": ["profile.selections", "profile", ["document.schema-valid", "declaration.module-census-complete"]],
  "profile.unknown-implementation": ["profile.selections", "profile", ["document.schema-valid", "declaration.identity-census-complete"]],
  "profile.implementation-mismatch": ["profile.selections", "profile", ["document.schema-valid", "declaration.identity-census-complete"]],
  "profile.missing-selection": ["profile.selection-census", "profile", ["document.schema-valid", "declaration.module-census-complete", "profile.selection-census-complete"]],
  "profile.unreachable-selection": ["graph.reachability-frontier", "graph", ["profile.root-census-complete", "profile.selection-census-complete", "binding.reached-frontier-complete", "graph.selected-node-census-complete"]],
  "binding.duplicate": ["binding.slot-frontier", "binding", ["document.schema-valid", "binding.consumer-census-complete", "binding.slot-census-complete"]],
  "binding.missing": ["binding.slot-frontier", "binding", ["document.schema-valid", "binding.consumer-census-complete", "binding.slot-census-complete"]],
  "binding.unknown-consumer": ["binding.consumer", "binding", ["document.schema-valid", "declaration.identity-census-complete"]],
  "binding.unknown-slot": ["binding.slot", "binding", ["document.schema-valid", "declaration.identity-census-complete", "binding.consumer-census-complete"]],
  "binding.unknown-provider": ["binding.provider", "binding", ["document.schema-valid", "declaration.identity-census-complete", "binding.consumer-census-complete", "binding.slot-census-complete"]],
  "binding.provider-not-selected": ["binding.provider-selection", "binding", ["document.schema-valid", "binding.provider-census-complete", "profile.selection-census-complete"]],
  "binding.cardinality": ["binding.cardinality", "binding", ["document.schema-valid", "binding.consumer-census-complete", "binding.slot-census-complete"]],
  "binding.capability-missing": ["binding.capability", "binding", ["document.schema-valid", "binding.consumer-census-complete", "binding.slot-census-complete", "binding.provider-census-complete"]],
  "binding.compatibility-mismatch": ["binding.compatibility", "binding", ["document.schema-valid", "binding.consumer-census-complete", "binding.slot-census-complete", "binding.provider-census-complete"]],
  "graph.cycle": ["graph.strongly-connected-components", "graph", ["graph.selected-node-census-complete", "graph.positive-edge-subgraph-complete"]],
  "diagnostics.truncated": ["output.diagnostic-collector", "output", ["output.diagnostic-stream-complete"]],
});
const LIMIT_PREREQUISITE_AUTHORITY = Object.freeze({
  declarationRawDocumentBytes: ["decode.declaration-document-bytes", "document", []],
  profileRawDocumentBytes: ["decode.profile-document-bytes", "document", []],
  aggregateRawBytes: ["decode.aggregate-raw-bytes", "batch", []],
  jsonValueOccurrences: ["schema.value-occurrences", "batch", ["batch.raw-bytes-admitted"]],
  jsonDepth: ["decode.document-depth", "document", ["document.raw-bytes-admitted"]],
  aggregateStringBytes: ["decode.aggregate-string-bytes", "batch", ["batch.raw-bytes-admitted"]],
  identifierBytes: ["schema.identifier-bytes", "document", ["document.decoded"]],
  ownerPathSegments: ["declaration.owner-path", "declaration", ["document.decoded"]],
  declarations: ["declaration.batch-count", "batch", ["batch.raw-bytes-admitted"]],
  capabilitiesPerDeclaration: ["declaration.capability-count", "declaration", ["document.decoded"]],
  slotsPerDeclaration: ["declaration.slot-count", "declaration", ["document.decoded"]],
  totalCapabilities: ["declaration.total-capabilities", "batch", ["batch.raw-bytes-admitted"]],
  totalSlots: ["declaration.total-slots", "batch", ["batch.raw-bytes-admitted"]],
  roots: ["profile.root-count", "profile", ["document.decoded"]],
  selections: ["profile.selection-count", "profile", ["document.decoded"]],
  bindings: ["profile.binding-count", "profile", ["document.decoded"]],
  graphEdges: ["graph.edge-count", "graph", ["profile.selection-census-complete"]],
  providersPerManySlot: ["binding.provider-count", "binding", ["binding.consumer-census-complete", "binding.slot-census-complete"]],
  graphDepth: ["graph.depth", "graph", ["graph.selected-node-census-complete", "graph.positive-edge-subgraph-complete"]],
  diagnostics: ["output.diagnostic-count", "output", ["output.diagnostic-stream-complete"]],
  diagnosticPathSegments: ["output.diagnostic-path", "output", ["output.diagnostic-stream-complete"]],
});
const PREREQUISITE_CASE_AUTHORITY = Object.freeze([
  {
    caseId: "diag.object.duplicate-selection-with-mismatch.v1",
    invalidFacts: ["profile.selection-uniqueness"],
    unavailableFacts: [],
    candidateCodes: ["profile.duplicate-selection", "profile.implementation-mismatch"],
    eligibleCodes: ["profile.duplicate-selection", "profile.implementation-mismatch"],
    suppressedCodes: [],
  },
  {
    caseId: "diag.object.negative-census-suppression.v1",
    invalidFacts: ["declaration.identity-census-complete"],
    unavailableFacts: [],
    candidateCodes: ["declaration.duplicate-implementation", "profile.unknown-implementation"],
    eligibleCodes: ["declaration.duplicate-implementation"],
    suppressedCodes: ["profile.unknown-implementation"],
  },
  {
    caseId: "diag.object.independent-scc-with-invalid-edge.v1",
    invalidFacts: ["binding.reached-frontier-complete"],
    unavailableFacts: [],
    candidateCodes: ["binding.unknown-provider", "graph.cycle"],
    eligibleCodes: ["binding.unknown-provider", "graph.cycle"],
    suppressedCodes: [],
  },
]);
const CANDIDATE_GENERATION_AUTHORITY = Object.freeze({
  policy: "closed-normalize-before-deduplicate",
  candidateKey: ["code", "phase", "path", "coordinate", "details"],
  duplicateHandling: "drop-duplicate-normalized-candidate",
  occurrenceHandling: "all-input-occurrences-are-counted-before-normalization",
  ordering: "normative-comparator-after-candidate-deduplication",
});
const STATIC_CASE_IDS_AUTHORITY = Object.freeze([
  "diag.raw.multi-document-independent.v1",
  "diag.raw.hostile-profile-key.v1",
  "diag.object.pre-identity-index.v1",
  "diag.object.semantic-coordinate.v1",
  "diag.object.independent-declaration-and-graph.v1",
  "diag.object.invalid-binding-suppresses-unreachable.v1",
  "diag.object.valid-prerequisites-unreachable.v1",
  "diag.object.duplicate-selection-with-mismatch.v1",
  "diag.object.negative-census-suppression.v1",
  "diag.object.independent-scc-with-invalid-edge.v1",
  "diag.raw.prefix-inclusive-clipping.v1",
]);
const FUTURE_PACKED_SUBJECT_EVIDENCE_MINIMUM_AUTHORITY = Object.freeze({
  purpose: "minimum-bindings-only-not-report-schema-api-runner-or-attestation",
  subject: "one-exact-packed-archive",
  bindingRequirements: {
    packedArchiveSha256:
      "exact-sha256-of-packed-archive-bytes-not-package-name-or-version",
    acceptedContractLedgerIdentity:
      "exact-sha256-identity-of-accepted-contract-ledger-bytes",
    acceptedQualificationLedgerIdentity:
      "exact-sha256-identity-of-accepted-qualification-ledger-bytes",
    compilerEntrypoint: "one-exact-closed-entrypoint",
    runtimeExactVersion: "exact-runtime-version-no-range-or-channel",
    operatingSystemExactVersion: "exact-operating-system-version",
    operatingSystemExactBuild: "exact-operating-system-build",
    architecture: "exact-runtime-architecture",
    browserExactBuild: "required-only-when-browser-is-applicable",
    electronExactRelease: "required-only-for-electron",
    electronEmbeddedNodeExactVersion: "required-only-for-electron",
    electronEmbeddedChromiumExactBuild: "required-only-for-electron",
    executionRealm: "exact-closed-realm-for-matrix-case",
    matrixCaseId: "one-exact-closed-matrix-case-id",
  },
  compilerEntrypoints: ["compileCompositionV1", "compileCompositionJsonV1"],
  matrixCases: [
    {
      caseId: "node-24-linux",
      runtimeFamily: "node-24",
      operatingSystemFamily: "linux",
      executionRealm: "node-main",
      applicableExtraBindings: [],
    },
    {
      caseId: "node-24-macos",
      runtimeFamily: "node-24",
      operatingSystemFamily: "macos",
      executionRealm: "node-main",
      applicableExtraBindings: [],
    },
    {
      caseId: "node-24-windows",
      runtimeFamily: "node-24",
      operatingSystemFamily: "windows",
      executionRealm: "node-main",
      applicableExtraBindings: [],
    },
    {
      caseId: "chromium-window",
      runtimeFamily: "chromium",
      operatingSystemFamily: "repository-pinned-browser-host",
      executionRealm: "window",
      applicableExtraBindings: ["browserExactBuild"],
    },
    {
      caseId: "chromium-dedicated-worker",
      runtimeFamily: "chromium",
      operatingSystemFamily: "repository-pinned-browser-host",
      executionRealm: "dedicated-worker",
      applicableExtraBindings: ["browserExactBuild"],
    },
    {
      caseId: "electron-desktop-smoke",
      runtimeFamily: "electron",
      operatingSystemFamily: "repository-pinned-desktop-host",
      executionRealm: "electron-main-and-renderer-smoke",
      applicableExtraBindings: [
        "electronExactRelease",
        "electronEmbeddedNodeExactVersion",
        "electronEmbeddedChromiumExactBuild",
      ],
    },
  ],
});
const MALFORMED_UTF8_AUTHORITY = new Map([
  ["invalid-utf8-unexpected-continuation", "80"],
  ["overlong-utf8", "c0af"],
  ["invalid-utf8-continuation", "c328"],
  ["invalid-continuation-before-delimiter-two-byte", "c2"],
  ["invalid-continuation-before-delimiter-three-byte", "e282"],
  ["invalid-continuation-before-delimiter-four-byte", "f09f98"],
  ["overlong-utf8-three-byte", "e08080"],
  ["utf8-encoded-surrogate", "eda080"],
  ["overlong-utf8-four-byte", "f0808080"],
  ["utf8-above-unicode-maximum", "f4908080"],
  ["utf8-forbidden-high-lead", "f5808080"],
  ["invalid-utf8-third-byte", "e28228"],
  ["invalid-utf8-fourth-byte", "f09f9828"],
]);
const RESOURCE_FIXTURE_AUTHORITY = Object.freeze({
  rawDocumentBytes: ["raw-bytes", "single-document"],
  aggregateRawBytes: ["raw-bytes", "document-batch"],
  jsonDepth: ["json-depth", "nested-arrays"],
  aggregateStringBytes: ["utf8-string-bytes", "decoded-object-key-and-string-values"],
  identifierBytes: ["utf8-string-bytes", "portable-id"],
  ownerPathSegments: ["item-count", "owner-path"],
  declarations: ["item-count", "declarations"],
  capabilitiesPerDeclaration: ["item-count", "provides"],
  slotsPerDeclaration: ["item-count", "slots"],
  totalCapabilities: ["item-count", "aggregate-provides"],
  totalSlots: ["item-count", "aggregate-slots"],
  roots: ["item-count", "roots"],
  selections: ["item-count", "selections"],
  bindings: ["item-count", "bindings"],
  graphEdges: ["graph-edges", "provider-edges"],
  providersPerManySlot: ["item-count", "providers"],
  graphDepth: ["graph-depth", "dependency-chain"],
  diagnostics: ["item-count", "diagnostics"],
  diagnosticPathSegments: ["item-count", "diagnostic-path"],
});
const COMPARATOR_EVIDENCE_AXES = [
  "phase",
  "code",
  "coordinate.moduleId.value",
  "coordinate.implementationId.value",
  "coordinate.slotId.value",
  "coordinate.providerImplementationId.value",
  "path.kind",
  "path.field-value",
  "path.index-value",
  "path.length",
  "path.later-kind",
  "path.later-field-value",
  "path.later-index-value",
  "details.rfc8785",
];
const DETAIL_CANONICALIZATION_BYTES_AUTHORITY = new Map([
  ["nested-compatibility-details",
    "7b2261637475616c436f6d7061746962696c697479223a7b2266616d696c79223a226578616374222c2266616d696c7956657273696f6e223a312c22746f6b656e223a226578616d706c652f612f7631227d2c226578706563746564436f6d7061746962696c697479223a7b2266616d696c79223a226578616374222c2266616d696c7956657273696f6e223a312c22746f6b656e223a226578616d706c652f7a2f7631227d7d"],
  ["unicode-detail-bytes",
    "7b2261223a7b225c72223a226c696e655c6e222c22c3b6223a22e282ac227d2c227a223a22f09f9880227d"],
]);

function fail(message) {
  throw new Error(`V1_QUALIFICATION_CHECK_FAILED: ${message}`);
}

function same(left, right) {
  return isDeepStrictEqual(left, right);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactStringSet(actual, expected, label) {
  if (!Array.isArray(actual)
    || actual.some(value => typeof value !== "string")
    || new Set(actual).size !== actual.length
    || !same([...actual].sort(compareAscii), [...expected].sort(compareAscii))) {
    fail(`${label} must contain the exact expected string set`);
  }
}

function exactStringSequence(actual, expected, label) {
  if (!Array.isArray(actual)
    || actual.some(value => typeof value !== "string")
    || new Set(actual).size !== actual.length
    || !same(actual, expected)) {
    fail(`${label} must contain the exact expected string sequence`);
  }
}

function objectKeys(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return Object.keys(value);
}

export async function validateQualificationLedger({ ledger, readBytes, listedPaths }) {
  if (ledger === null || typeof ledger !== "object" || Array.isArray(ledger)
    || JSON.stringify(Object.keys(ledger).sort())
      !== JSON.stringify(["algorithm", "artifacts", "schemaVersion"])) {
    fail("qualification ledger has an invalid closed shape");
  }
  if (ledger?.schemaVersion !== 1 || ledger.algorithm !== "sha256-bytes") {
    fail("unsupported V1 qualification ledger");
  }
  const ids = new Set();
  const pathSet = new Set();
  const paths = [];
  for (const artifact of ledger.artifacts ?? []) {
    if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact)
      || JSON.stringify(Object.keys(artifact).sort())
        !== JSON.stringify(["id", "immutableDigest", "path"])) {
      fail("qualification artifact has an invalid closed shape");
    }
    if (typeof artifact?.id !== "string"
      || !QUALIFICATION_ARTIFACT_ID.test(artifact.id)
      || ids.has(artifact.id)) {
      fail("qualification artifact IDs must be unique strings");
    }
    ids.add(artifact.id);
    if (!QUALIFICATION_PATH.test(artifact.path ?? "")) {
      fail(`${artifact.id} has an invalid qualification path`);
    }
    if (pathSet.has(artifact.path)) {
      fail("qualification artifact paths must be unique");
    }
    pathSet.add(artifact.path);
    if (!SHA256.test(artifact.immutableDigest ?? "")) {
      fail(`${artifact.id} has an invalid digest`);
    }
    const digest = `sha256:${createHash("sha256")
      .update(await readBytes(artifact.path)).digest("hex")}`;
    if (digest !== artifact.immutableDigest) {
      fail(`${artifact.id} differs from the qualification ledger`);
    }
    paths.push(artifact.path);
  }
  if (!Array.isArray(listedPaths) || new Set(listedPaths).size !== listedPaths.length) {
    fail("qualification ledger directory listing must contain unique paths");
  }
  if (paths.length === 0 || !same([...paths].sort(), [...listedPaths].sort())) {
    fail("qualification ledger does not match its artifact directory");
  }
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function decoderSourceBytes(vector) {
  if (vector.sourceEncoding === "utf8-text" && typeof vector.source === "string") {
    return Buffer.from(vector.source, "utf8");
  }
  if (vector.sourceEncoding === "hex-bytes"
    && typeof vector.source === "string"
    && /^(?:[a-f0-9]{2})*$/u.test(vector.source)) {
    return Buffer.from(vector.source, "hex");
  }
  fail(`${vector.name ?? "decoder vector"} has an invalid source encoding`);
}

function jsonValueIdentityNode(value, ancestors) {
  if (value === null) return ["null"];
  if (typeof value === "boolean") return ["boolean", value];
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("JSON value identity received a non-finite number");
    return ["number", Object.is(value, -0) ? "-0" : String(value)];
  }
  if (typeof value === "string") return ["string", value];
  if (typeof value !== "object") fail("JSON value identity received a non-JSON value");
  if (ancestors.has(value)) fail("JSON value identity received a cyclic value");

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value).filter(key => key !== "length");
      if (ownKeys.length !== value.length) {
        fail("JSON value identity received a sparse or extended array");
      }
      const children = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined
          || descriptor.enumerable !== true
          || !Object.hasOwn(descriptor, "value")) {
          fail("JSON value identity received a non-data array element");
        }
        children.push(jsonValueIdentityNode(descriptor.value, ancestors));
      }
      return ["array", children];
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail("JSON value identity received a non-plain object");
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== "string")) {
      fail("JSON value identity received a symbol-keyed object");
    }
    const entries = keys.toSorted(compareAscii).map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor.enumerable !== true || !Object.hasOwn(descriptor, "value")) {
        fail("JSON value identity received a non-data object property");
      }
      return [key, jsonValueIdentityNode(descriptor.value, ancestors)];
    });
    return ["object", entries];
  } finally {
    ancestors.delete(value);
  }
}

// Private qualification hash preimage only; this is neither JCS nor a public serialization.
export function jsonValueIdentity(value) {
  const taggedTree = jsonValueIdentityNode(value, new Set());
  return sha256Bytes(Buffer.from(JSON.stringify(taggedTree), "utf8"));
}

function manifestValueJsonUtf8Sha256(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(value), "utf8"));
}

function repairIdentity(vector) {
  if (vector.repair === undefined) return null;
  return sha256Bytes(Buffer.from(JSON.stringify({
    faultIdentity: vector.repair.faultIdentity,
    span: vector.repair.span,
    replacement: vector.repair.replacement,
    repairedSourceBytesSha256: sha256Bytes(Buffer.from(vector.repairedSource, "utf8")),
  }), "utf8"));
}

function decoderCaseAuthorityRecord(vector) {
  const bytes = decoderSourceBytes(vector);
  let decodedValueJsonSha256 = null;
  if (vector.decoderOutcome === "accepted") {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      decodedValueJsonSha256 = jsonValueIdentity(JSON.parse(text));
    } catch {
      fail(`${vector.name} cannot produce its fixed accepted input identity`);
    }
  }
  return {
    name: vector.name,
    category: vector.category,
    sourceEncoding: vector.sourceEncoding,
    sourceBytesSha256: sha256Bytes(bytes),
    decoderOutcome: vector.decoderOutcome,
    diagnosticCode: vector.diagnosticCode ?? null,
    semanticDiagnosticCode: vector.semanticDiagnosticCode ?? null,
    decodedValueJsonSha256,
    repair: vector.repair === undefined ? null : {
      faultIdentity: vector.repair.faultIdentity,
      span: vector.repair.span,
      replacement: vector.repair.replacement,
      repairedSourceBytesSha256: sha256Bytes(Buffer.from(vector.repairedSource, "utf8")),
      repairedValueJsonSha256: jsonValueIdentity(JSON.parse(vector.repairedSource)),
    },
  };
}

function canonicalCaseAuthorityRecord(vector) {
  return {
    name: vector.name,
    category: vector.category,
    valueJsonUtf8Sha256: manifestValueJsonUtf8Sha256(vector.value),
    canonicalUtf8BytesSha256: sha256Bytes(Buffer.from(vector.canonicalUtf8, "utf8")),
  };
}

function validateCaseTupleAuthority(vectors, recordForCase, expectedDigest, label) {
  const digest = sha256Bytes(Buffer.from(JSON.stringify(
    (vectors.cases ?? []).map(recordForCase),
  ), "utf8"));
  if (digest !== expectedDigest) {
    fail(`${label} source, input, or output tuple contradicts the independent fixed authority`);
  }
}

function validateClosedManifestSection({
  section,
  vectors,
  digestField,
  bytesForVector,
  categoryAuthority,
  label,
}) {
  if (section?.categoryPolicy !== "closed"
    || !same(objectKeys(section, `${label} manifest section`).sort(compareAscii), [
      "cases",
      "categories",
      "categoryPolicy",
    ])) {
    fail(`${label} categories are not closed`);
  }
  const vectorCases = vectors.cases ?? [];
  const manifestCases = section.cases ?? [];
  exactStringSequence(
    manifestCases.map(entry => entry.name),
    vectorCases.map(vector => vector.name),
    `${label} manifest case order`,
  );
  const vectorCategories = vectorCases.map(vector => vector.category);
  exactStringSequence(
    section.categories,
    [...vectorCategories].sort(compareAscii),
    `${label} manifest categories`,
  );
  if (new Set(vectorCategories).size !== vectorCategories.length) {
    fail(`${label} must bind exactly one case to each closed category`);
  }
  for (let index = 0; index < vectorCases.length; index += 1) {
    const vector = vectorCases[index];
    const entry = manifestCases[index];
    if (categoryAuthority.get(vector.name) !== vector.category
      || categoryAuthority.size !== vectorCases.length) {
      fail(`${label} case ${vector.name} contradicts the independent category authority`);
    }
    if (entry.category !== vector.category || !section.categories.includes(vector.category)) {
      fail(`${label} case ${vector.name} has an unbound category`);
    }
    if (!SHA256.test(entry[digestField] ?? "")
      || entry[digestField] !== sha256Bytes(bytesForVector(vector))) {
      fail(`${label} case ${vector.name} differs from its exact byte binding`);
    }
  }
}

export function validateFuturePackedSubjectEvidenceMinimum(minimum) {
  if (!same(minimum, FUTURE_PACKED_SUBJECT_EVIDENCE_MINIMUM_AUTHORITY)) {
    fail("future packed-subject evidence minimum is not the closed minimum-binding authority");
  }
}

export function validateQualificationCaseManifest({
  manifest,
  decoderVectors,
  canonicalizationVectors,
  acceptedCanonicalVectors,
  diagnosticContract,
  diagnosticCatalog,
  resourceProfile,
  schema,
  validateDocument,
  validateDiagnostic,
  validateModuleDeclaration,
  validateCompositionProfile,
}) {
  if (manifest?.kind !== "get-modular.qualification-case-manifest"
    || manifest.manifestVersion !== 1
    || !same(objectKeys(manifest, "qualification case manifest").sort(compareAscii), [
      "acceptedCanonicalNegativeSuccessors",
      "canonicalization",
      "decoder",
      "kind",
      "manifestVersion",
      "staticConformanceProtocol",
    ])) {
    fail("unsupported qualification case manifest");
  }
  validateFuturePackedSubjectEvidenceMinimum(
    manifest.staticConformanceProtocol?.futurePackedSubjectEvidenceMinimum,
  );
  validateCaseTupleAuthority(
    decoderVectors,
    decoderCaseAuthorityRecord,
    DECODER_CASE_TUPLES_SHA256,
    "decoder case",
  );
  validateCaseTupleAuthority(
    canonicalizationVectors,
    canonicalCaseAuthorityRecord,
    CANONICAL_CASE_TUPLES_SHA256,
    "canonicalization case",
  );
  validateClosedManifestSection({
    section: manifest.decoder,
    vectors: decoderVectors,
    digestField: "sourceBytesSha256",
    bytesForVector: decoderSourceBytes,
    categoryAuthority: DECODER_CATEGORY_AUTHORITY,
    label: "decoder",
  });
  validateClosedManifestSection({
    section: manifest.canonicalization,
    vectors: canonicalizationVectors,
    digestField: "canonicalUtf8BytesSha256",
    bytesForVector: vector => Buffer.from(vector.canonicalUtf8, "utf8"),
    categoryAuthority: CANONICAL_CATEGORY_AUTHORITY,
    label: "canonicalization",
  });

  const decoderByName = new Map(decoderVectors.cases.map(vector => [vector.name, vector]));
  for (const [index, entry] of manifest.decoder.cases.entries()) {
    const vector = decoderVectors.cases[index];
    const hasRepair = vector.repair !== undefined || vector.repairedSource !== undefined;
    if ((vector.repair === undefined) !== (vector.repairedSource === undefined)) {
      fail(`${vector.name} must bind both repair metadata and repaired source bytes`);
    }
    const allowedKeys = hasRepair
      ? ["category", "name", "repairedSourceBytesSha256", "sourceBytesSha256"]
      : ["category", "name", "sourceBytesSha256"];
    if (!same(objectKeys(entry, `manifest decoder case ${vector.name}`).sort(compareAscii),
      allowedKeys.sort(compareAscii))) {
      fail(`${vector.name} has an invalid decoder byte-binding shape`);
    }
    if (hasRepair) {
      if (!SHA256.test(entry.repairedSourceBytesSha256 ?? "")
        || entry.repairedSourceBytesSha256
          !== sha256Bytes(Buffer.from(vector.repairedSource, "utf8"))) {
        fail(`${vector.name} differs from its exact repaired-byte binding`);
      }
    }
  }
  for (const entry of manifest.canonicalization.cases) {
    if (!same(objectKeys(entry, `manifest canonicalization case ${entry.name}`)
      .sort(compareAscii), [
      "canonicalUtf8BytesSha256", "category", "name", "valueJsonUtf8Sha256",
    ])) {
      fail(`${entry.name} has an invalid canonical-byte binding shape`);
    }
    const vector = canonicalizationVectors.cases.find(candidate => candidate.name === entry.name);
    if (entry.valueJsonUtf8Sha256 !== manifestValueJsonUtf8Sha256(vector.value)) {
      fail(`${entry.name} differs from its exact input-value binding`);
    }
  }

  const acceptedNegatives = acceptedCanonicalVectors.negative ?? [];
  const mappings = manifest.acceptedCanonicalNegativeSuccessors ?? [];
  exactStringSequence(
    mappings.map(mapping => mapping.acceptedName),
    acceptedNegatives.map(vector => vector.name),
    "accepted canonical negative successor names",
  );
  const mappedCases = new Set();
  for (let index = 0; index < acceptedNegatives.length; index += 1) {
    const accepted = acceptedNegatives[index];
    const mapping = mappings[index];
    if (!same(objectKeys(mapping, `${accepted.name} successor mapping`).sort(compareAscii), [
      "acceptedFaultIdentity",
      "acceptedName",
      "decoderCase",
      "diagnosticCode",
      "faultFamily",
      "repairIdentity",
      "successorCategory",
      "successorFaultIdentity",
    ]) || mapping.diagnosticCode !== accepted.diagnosticCode) {
      fail(`${accepted.name} has an invalid successor mapping`);
    }
    const authority = ACCEPTED_SUCCESSOR_AUTHORITY.get(accepted.name);
    if (authority === undefined
      || acceptedNegativeFaultIdentity(accepted) !== mapping.acceptedFaultIdentity
      || !same([
        mapping.faultFamily,
        mapping.decoderCase,
        mapping.successorCategory,
        mapping.acceptedFaultIdentity,
        mapping.successorFaultIdentity,
        mapping.repairIdentity,
      ], authority)) {
      fail(`${accepted.name} contradicts the accepted fault successor authority`);
    }
    const successor = decoderByName.get(mapping.decoderCase);
    const successorCode = successor?.diagnosticCode ?? successor?.semanticDiagnosticCode;
    if (successor === undefined || mappedCases.has(successor.name)
      || successorCode !== accepted.diagnosticCode
      || successor.category !== mapping.successorCategory
      || successor.repair === undefined
      || successor.repair.faultIdentity !== mapping.successorFaultIdentity
      || repairIdentity(successor) !== mapping.repairIdentity
      || !mapping.acceptedFaultIdentity.startsWith(`${mapping.faultFamily}:`)
      || !mapping.successorFaultIdentity.startsWith(`${mapping.faultFamily}:`)
      || !successor.category.endsWith("successor")) {
      fail(`${accepted.name} is not mapped to one complete repaired successor case`);
    }
    mappedCases.add(successor.name);
  }
  validateStaticConformanceProtocol({
    protocol: manifest.staticConformanceProtocol,
    contract: diagnosticContract,
    catalog: diagnosticCatalog,
    resourceProfile,
    schema,
    validateDocument,
    validateDiagnostic,
    validateModuleDeclaration,
    validateCompositionProfile,
  });
}

function staticInvocationPrefixLength(descriptor, diagnostic, contract) {
  if (descriptor.entryPoint !== "compileCompositionJsonV1") return 0;
  const [first, second] = diagnostic.path;
  if (same(first, { kind: "field", value: "declarations" })
    && second?.kind === "index") {
    const documentCount = descriptor.input?.declarationsUtf8?.length
      ?? contract.boundedEmissionProtocol.maximumIndex + 1;
    if (second.value >= documentCount) {
      fail(`${descriptor.caseId} uses an out-of-range raw declaration locator`);
    }
    return 2;
  }
  if (same(first, { kind: "field", value: "profile" })) return 1;
  return 0;
}

function decodeStaticJson(text, maxBytes, maxDepth) {
  if (typeof text !== "string") return undefined;
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length > maxBytes) return undefined;
  const decoded = strictDecode(
    bytes,
    "reject",
    maxDepth,
  );
  return decoded.outcome === "accepted" ? JSON.parse(decoded.text) : undefined;
}

function* iterateStaticRawInputDocuments(descriptor) {
  if (descriptor.entryPoint !== "compileCompositionJsonV1" || descriptor.input === undefined) {
    return;
  }
  for (const [index, text] of (descriptor.input?.declarationsUtf8 ?? []).entries()) {
    yield {
      prefix: [
        { kind: "field", value: "declarations" },
        { kind: "index", value: index },
      ],
      documentType: "module-declaration",
      text,
    };
  }
  yield {
    prefix: [{ kind: "field", value: "profile" }],
    documentType: "composition-profile",
    text: descriptor.input?.profileUtf8,
  };
}

function staticRawInputDocuments(descriptor) {
  return [...iterateStaticRawInputDocuments(descriptor)];
}

function staticObjectInputDocuments(descriptor) {
  if (descriptor.entryPoint !== "compileCompositionV1" || descriptor.input === undefined) {
    return [];
  }
  return [
    ...(descriptor.input.declarations ?? []).map((value, index) => ({
      prefix: [
        { kind: "field", value: "declarations" },
        { kind: "index", value: index },
      ],
      documentType: "module-declaration",
      value,
    })),
    {
      prefix: [{ kind: "field", value: "profile" }],
      documentType: "composition-profile",
      value: descriptor.input.profile,
    },
  ];
}

function materializeStaticGenerator(descriptor) {
  if (descriptor.generatorId !== "get-modular/generator/diagnostic-prefix-clip/v1") {
    fail(`${descriptor.caseId} uses an unsupported static generator`);
  }
  const companionDeclaration = {
    kind: "get-modular.module-declaration",
    schemaVersion: 1,
    moduleId: "example/generated-root",
    implementationId: "example/generated-root/default",
    owner: { authority: "example", path: ["generated-root"] },
    provides: [],
    slots: [],
  };
  const companionProfile = {
    kind: "get-modular.composition-profile",
    schemaVersion: 1,
    profileId: "example/generated-profile",
    roots: [companionDeclaration.moduleId],
    selections: [{
      moduleId: companionDeclaration.moduleId,
      implementationId: companionDeclaration.implementationId,
    }],
    bindings: [],
  };
  return {
    ...descriptor,
    input: {
      declarationsUtf8: [
        `${"[".repeat(33)}null${"]".repeat(33)}`,
        JSON.stringify(companionDeclaration),
      ],
      profileUtf8: JSON.stringify(companionProfile),
    },
    schemaValidCompanion: {
      declarations: [companionDeclaration],
      profile: companionProfile,
    },
  };
}

function expandSchemaCandidates(candidates, schema) {
  const expanded = [];
  const pending = [...candidates];
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (candidate?.$ref?.startsWith("#/$defs/")) {
      pending.push(schema.$defs[candidate.$ref.slice("#/$defs/".length)]);
    } else if (Array.isArray(candidate?.oneOf)) {
      pending.push(...candidate.oneOf);
    } else if (candidate !== undefined) {
      expanded.push(candidate);
    }
  }
  return expanded;
}

function safeStaticDocumentPath(pathValue, documentType, schema, maximumIndex) {
  let candidates = expandSchemaCandidates([
    schema.$defs[documentType === "module-declaration"
      ? "moduleDeclaration"
      : "compositionProfile"],
  ], schema);
  const safe = [];
  for (const segment of pathValue) {
    const next = expandSchemaCandidates(candidates.flatMap(candidate => (
      typeof segment === "number"
        ? candidate.type === "array" ? [candidate.items] : []
        : candidate.type === "object"
          && candidate.properties !== undefined
          && Object.hasOwn(candidate.properties, segment)
          ? [candidate.properties[segment]]
          : []
    )), schema);
    if (typeof segment === "number") {
      if (!Number.isSafeInteger(segment) || segment < 0 || segment > maximumIndex) break;
      safe.push(segment);
      if (next.length > 0) candidates = next;
      continue;
    }
    if (next.length === 0) break;
    safe.push(segment);
    candidates = next;
  }
  return safe;
}

function addSaturated(actual, increment, limit) {
  return actual > limit ? actual : Math.min(limit + 1, actual + increment);
}

function meterStaticJsonResources(values, limits) {
  const result = {
    aggregateStringBytes: 0,
    jsonValueOccurrences: 0,
  };
  const stack = [...values];
  while (stack.length > 0) {
    const value = stack.pop();
    result.jsonValueOccurrences = addSaturated(
      result.jsonValueOccurrences,
      1,
      limits.jsonValueOccurrences,
    );
    if (typeof value === "string") {
      result.aggregateStringBytes = addSaturated(
        result.aggregateStringBytes,
        Buffer.byteLength(value, "utf8"),
        limits.aggregateStringBytes,
      );
    } else if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push(value[index]);
      }
    } else if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        result.aggregateStringBytes = addSaturated(
          result.aggregateStringBytes,
          Buffer.byteLength(key, "utf8"),
          limits.aggregateStringBytes,
        );
        stack.push(child);
      }
    }
  }
  return result;
}

function createStaticDiagnosticCollector(compare, limit, maximumOmitted = 262144) {
  const retained = [];
  let count = 0;
  const maximumCount = (limit - 1) + maximumOmitted;
  const add = diagnostic => {
    count = Math.min(maximumCount, count + 1);
    let low = 0;
    let high = retained.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (compare(retained[middle], diagnostic) <= 0) low = middle + 1;
      else high = middle;
    }
    retained.splice(low, 0, diagnostic);
    if (retained.length > limit) retained.pop();
  };
  const result = () => {
    if (count <= limit) return retained;
    const ordinary = retained.slice(0, limit - 1);
    return [...ordinary, {
      code: "diagnostics.truncated",
      phase: "output",
      path: [],
      coordinate: {},
      details: { omitted: Math.min(maximumOmitted, count - ordinary.length) },
    }];
  };
  return { add, count: () => count, result };
}

function pathStartsWith(path, prefix) {
  return path.length >= prefix.length
    && prefix.every((segment, index) => same(path[index], segment));
}

function staticLimitDiagnostic({
  prefix,
  limitName,
  limit,
  actual,
  localPath = [],
  phase = "decode",
}, maximum) {
  return {
    code: "input.limit-exceeded",
    phase,
    path: [
      ...prefix,
      ...localPath.map(segment => (typeof segment === "number"
        ? { kind: "index", value: segment }
        : { kind: "field", value: segment })),
    ].slice(0, maximum),
    coordinate: {},
    details: { limitName, limit, actual },
  };
}

function validateStaticRawDecodeSuppression(
  descriptor,
  diagnostics,
  compare,
  resourceProfile,
  contract,
  schema,
  validateModuleDeclaration,
  validateCompositionProfile,
) {
  const { limits } = resourceProfile;
  const maximumPathSegments = contract.boundedEmissionProtocol.maximumPathSegments;
  const collector = createStaticDiagnosticCollector(compare, limits.diagnostics);
  const rawDocumentCount = descriptor.entryPoint === "compileCompositionJsonV1"
    ? (descriptor.input?.declarationsUtf8?.length ?? 0) + 1
    : 0;
  const decodedDocuments = descriptor.entryPoint === "compileCompositionV1"
    ? staticObjectInputDocuments(descriptor)
    : [];
  let aggregateBytes = 0;
  for (const document of iterateStaticRawInputDocuments(descriptor)) {
    aggregateBytes = addSaturated(
      aggregateBytes,
      Buffer.byteLength(document.text, "utf8"),
      limits.aggregateRawBytes,
    );
  }
  if (aggregateBytes > limits.aggregateRawBytes) {
    const expected = [staticLimitDiagnostic({
      prefix: [],
      limitName: "aggregateRawBytes",
      limit: limits.aggregateRawBytes,
      actual: limits.aggregateRawBytes + 1,
    }, maximumPathSegments)];
    if (!same(diagnostics, expected)) {
      fail(`${descriptor.caseId} contradicts the aggregate raw-byte preflight`);
    }
    return;
  }
  for (const document of iterateStaticRawInputDocuments(descriptor)) {
    const bytes = Buffer.from(document.text, "utf8");
    const limitName = document.documentType === "module-declaration"
      ? "declarationRawDocumentBytes"
      : "profileRawDocumentBytes";
    const limit = limits[limitName];
    if (bytes.length > limit) {
      collector.add(staticLimitDiagnostic({
        prefix: document.prefix,
        limitName,
        limit,
        actual: limit + 1,
      }, maximumPathSegments));
      continue;
    }
    const decoded = strictDecode(
      bytes,
      "reject",
      limits.jsonDepth,
    );
    if (decoded.outcome === "accepted") {
      decodedDocuments.push({ ...document, value: JSON.parse(decoded.text) });
      continue;
    }
    const localPaths = decoded.diagnosticCode === "decode.duplicate-key"
      ? [...new Map(decoded.diagnosticPaths.map(pathValue => (
        [canonicalize(pathValue), pathValue]
      ))).values()]
      : [decoded.diagnosticPath ?? []];
    const safeLocalPaths = localPaths.map(pathValue => (
      safeStaticDocumentPath(
        pathValue,
        document.documentType,
        schema,
        contract.boundedEmissionProtocol.maximumIndex,
      )
    ));
    const uniqueSafeLocalPaths = [...new Map(safeLocalPaths.map(pathValue => (
      [canonicalize(pathValue), pathValue]
    ))).values()];
    const expected = decoded.diagnosticCode === "input.limit-exceeded"
      ? [staticLimitDiagnostic({
        prefix: document.prefix,
        limitName: "jsonDepth",
        limit: limits.jsonDepth,
        actual: decoded.actual,
        localPath: uniqueSafeLocalPaths[0],
      }, maximumPathSegments)]
      : uniqueSafeLocalPaths.map(pathValue => ({
        code: decoded.diagnosticCode,
        phase: "decode",
        path: [
          ...document.prefix,
          ...pathValue.map(segment => (typeof segment === "number"
            ? { kind: "index", value: segment }
            : { kind: "field", value: segment })),
        ],
        coordinate: {},
        details: {
          reason: decoded.diagnosticCode === "decode.duplicate-key"
            ? "duplicate-key"
            : "invalid-json",
        },
      })).toSorted(compare);
    for (const diagnostic of expected) collector.add(diagnostic);
  }

  const expectedDocumentCount = rawDocumentCount || decodedDocuments.length;
  if (collector.count() === 0 && decodedDocuments.length === expectedDocumentCount) {
    const metered = meterStaticJsonResources(
      decodedDocuments.map(document => document.value),
      limits,
    );
    for (const limitName of ["aggregateStringBytes", "jsonValueOccurrences"]) {
      if (metered[limitName] > limits[limitName]) {
        collector.add(staticLimitDiagnostic({
          prefix: [],
          limitName,
          limit: limits[limitName],
          actual: limits[limitName] + 1,
          phase: limitName === "jsonValueOccurrences" ? "schema" : "decode",
        }, maximumPathSegments));
      }
    }
  }

  const truncation = diagnostics.find(diagnostic => diagnostic.code === "diagnostics.truncated");
  if (truncation !== undefined) {
    for (const document of decodedDocuments) {
      const validator = document.documentType === "module-declaration"
        ? validateModuleDeclaration
        : validateCompositionProfile;
      for (const diagnostic of staticSchemaDiagnostics(document, validator)) {
        collector.add(diagnostic);
      }
    }
    for (const diagnostic of staticIndependentSemanticDiagnostics({
      descriptor,
      documents: decodedDocuments,
      validateModuleDeclaration,
      validateCompositionProfile,
      maximumPathSegments,
    })) {
      collector.add(diagnostic);
    }
    if (collector.count() <= limits.diagnostics) {
      fail(`${descriptor.caseId} claims truncation without enough executable candidates`);
    }
    const expected = collector.result();
    if (!same(diagnostics, expected)) {
      fail(`${descriptor.caseId} contradicts the executable bounded collector`);
    }
    return;
  }

  const rawCodes = new Set([
    "decode.invalid-json",
    "decode.duplicate-key",
    "input.limit-exceeded",
  ]);
  const actual = diagnostics.filter(diagnostic => rawCodes.has(diagnostic.code));
  if (!same(actual, collector.result())) {
    fail(`${descriptor.caseId} contains a false or incomplete raw resource diagnostic`);
  }
}

function staticInputDocuments(descriptor, resourceProfile) {
  if (descriptor.input === undefined) return [];
  let documents;
  if (descriptor.entryPoint === "compileCompositionJsonV1") {
    const rawDocuments = staticRawInputDocuments(descriptor);
    const aggregateBytes = rawDocuments.reduce((total, document) => (
      total + Buffer.byteLength(document.text, "utf8")
    ), 0);
    const aggregateAdmitted = aggregateBytes <= resourceProfile.limits.aggregateRawBytes;
    documents = rawDocuments.map(document => {
      const limitName = document.documentType === "module-declaration"
        ? "declarationRawDocumentBytes"
        : "profileRawDocumentBytes";
      return {
        prefix: document.prefix,
        documentType: document.documentType,
        value: aggregateAdmitted
          ? decodeStaticJson(
            document.text,
            resourceProfile.limits[limitName],
            resourceProfile.limits.jsonDepth,
          )
          : undefined,
      };
    });
  } else {
    documents = staticObjectInputDocuments(descriptor);
  }
  if (documents.every(document => document.value !== undefined)) {
    const metered = meterStaticJsonResources(
      documents.map(document => document.value),
      resourceProfile.limits,
    );
    if (metered.aggregateStringBytes > resourceProfile.limits.aggregateStringBytes
      || metered.jsonValueOccurrences > resourceProfile.limits.jsonValueOccurrences) {
      return documents.map(document => ({ ...document, value: undefined }));
    }
  }
  return documents;
}

const STATIC_SCHEMA_CODES = new Set([
  "schema.unsupported-version",
  "schema.unknown-field",
  "schema.invalid-value",
  "schema.non-plain-value",
]);

function schemaDiagnostic(code, pathValue, reason) {
  return {
    code,
    phase: "schema",
    path: pathValue,
    coordinate: {},
    details: { reason },
  };
}

function staticSchemaDiagnostics(document, validator) {
  const { prefix, value } = document;
  if (value === undefined) return [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [schemaDiagnostic("schema.invalid-value", prefix, "invalid-type")];
  }
  if (Object.hasOwn(value, "schemaVersion") && value.schemaVersion !== 1) {
    return [schemaDiagnostic(
      "schema.unsupported-version",
      [...prefix, { kind: "field", value: "schemaVersion" }],
      "unsupported-version",
    )];
  }
  if (validator(value)) return [];
  const errors = validator.errors ?? [];
  const additionalPropertyParents = errors
    .filter(error => error.keyword === "additionalProperties")
    .map(error => [
      ...prefix,
      ...structuralPathFromJsonPointer(value, error.instancePath),
    ]);
  if (additionalPropertyParents.length > 0) {
    const uniqueParents = new Map(additionalPropertyParents.map(pathValue => (
      [canonicalize(pathValue), pathValue]
    )));
    return [...uniqueParents.values()].map(pathValue => (
      schemaDiagnostic("schema.unknown-field", pathValue, "unknown-field")
    ));
  }
  const candidates = errors
    .filter(error => error.keyword !== "oneOf")
    .map(error => schemaDiagnostic(
      "schema.invalid-value",
      [
        ...prefix,
        ...structuralPathFromJsonPointer(value, error.instancePath),
      ],
      error.keyword === "type" ? "invalid-type" : "invalid-format",
    ));
  return [...new Map(candidates.map(candidate => (
    [canonicalize(candidate), candidate]
  ))).values()];
}

function staticIndependentSemanticDiagnostics({
  descriptor,
  documents,
  validateModuleDeclaration,
  validateCompositionProfile,
  maximumPathSegments,
}) {
  const diagnostics = [];
  const validDeclarations = [];
  let declarationCensusComplete = true;
  for (const document of documents) {
    if (document.documentType !== "module-declaration") continue;
    if (!validateModuleDeclaration(document.value)) {
      declarationCensusComplete = false;
      continue;
    }
    validDeclarations.push(document);
    const prefix = descriptor.entryPoint === "compileCompositionJsonV1"
      ? document.prefix
      : [];
    for (const [field, code, coordinateField] of [
      ["provides", "declaration.duplicate-capability", undefined],
      ["slots", "declaration.duplicate-slot", "slotId"],
    ]) {
      const seen = new Set();
      for (const [index, member] of document.value[field].entries()) {
        const identity = field === "provides" ? member.capabilityId : member.slotId;
        if (seen.has(identity)) {
          diagnostics.push({
            code,
            phase: "declaration",
            path: [
              ...prefix,
              { kind: "field", value: field },
              { kind: "index", value: index },
            ].slice(0, maximumPathSegments),
            coordinate: {
              implementationId: document.value.implementationId,
              ...(coordinateField === undefined ? {} : { [coordinateField]: identity }),
            },
            details: { reason: "duplicate" },
          });
        }
        seen.add(identity);
      }
    }
  }
  if (declarationCensusComplete) {
    const groups = new Map();
    for (const document of validDeclarations) {
      const id = document.value.implementationId;
      groups.set(id, (groups.get(id) ?? 0) + 1);
    }
    for (const [implementationId, count] of groups) {
      if (count > 1) {
        diagnostics.push({
          code: "declaration.duplicate-implementation",
          phase: "declaration",
          path: [],
          coordinate: { implementationId },
          details: { reason: "duplicate" },
        });
      }
    }
  }
  const profileDocument = documents.find(document => (
    document.documentType === "composition-profile"
  ));
  if (profileDocument !== undefined && validateCompositionProfile(profileDocument.value)) {
    const prefix = descriptor.entryPoint === "compileCompositionJsonV1"
      ? profileDocument.prefix
      : [];
    for (const [values, code] of [
      [profileDocument.value.roots, "profile.duplicate-root"],
      [profileDocument.value.selections.map(selection => selection.moduleId),
        "profile.duplicate-selection"],
    ]) {
      const emitted = new Set();
      const seen = new Set();
      for (const moduleId of values) {
        if (seen.has(moduleId) && !emitted.has(moduleId)) {
          diagnostics.push({
            code,
            phase: "profile",
            path: prefix,
            coordinate: { moduleId },
            details: { reason: "duplicate" },
          });
          emitted.add(moduleId);
        }
        seen.add(moduleId);
      }
    }
  }
  return diagnostics;
}

function staticIdentityInvalidPaths(document, validator) {
  const { prefix, value } = document;
  if (value === undefined || value === null || typeof value !== "object"
    || Array.isArray(value) || validator(value)) {
    return [];
  }
  return (validator.errors ?? [])
    .filter(error => (
      /^#\/\$defs\/(?:portableId|localToken)\/(?:minLength|maxLength|pattern)$/u
        .test(error.schemaPath)
    ))
    .map(error => [
      ...prefix,
      ...structuralPathFromJsonPointer(value, error.instancePath),
    ]);
}

function validateStaticSchemaExpectations({
  descriptor,
  diagnostics,
  validateModuleDeclaration,
  validateCompositionProfile,
  compare,
  resourceProfile,
}) {
  if (diagnostics.some(diagnostic => diagnostic.code === "diagnostics.truncated")) return;
  for (const document of staticInputDocuments(descriptor, resourceProfile)) {
    const validator = document.documentType === "module-declaration"
      ? validateModuleDeclaration
      : validateCompositionProfile;
    const expected = staticSchemaDiagnostics(document, validator).toSorted(compare);
    const actual = diagnostics.filter(diagnostic => (
      STATIC_SCHEMA_CODES.has(diagnostic.code)
      && pathStartsWith(diagnostic.path, document.prefix)
    ));
    if (!same(actual, expected)) {
      fail(`${descriptor.caseId} has false or incomplete base-schema expectations`);
    }
  }
}

function validateStaticSchemaSuppression({
  descriptor,
  diagnostics,
  diagnosticPrerequisites,
  validateModuleDeclaration,
  validateCompositionProfile,
  resourceProfile,
}) {
  if (diagnostics.some(diagnostic => diagnostic.code === "diagnostics.truncated")) return;
  const documents = staticInputDocuments(descriptor, resourceProfile);
  const declarationDocuments = documents.filter(document => (
    document.documentType === "module-declaration"
  ));
  const validDeclarations = declarationDocuments.filter(document => (
    document.value !== undefined
    && staticSchemaDiagnostics(document, validateModuleDeclaration).length === 0
  ));
  const invalidDeclarations = declarationDocuments.length - validDeclarations.length;
  const profileDocument = documents.find(document => (
    document.documentType === "composition-profile"
  ));
  const profileInvalid = profileDocument?.value === undefined
    || staticSchemaDiagnostics(profileDocument, validateCompositionProfile).length > 0;
  const implementationIds = validDeclarations.map(document => (
    document.value.implementationId
  ));
  const identityInvalidPaths = new Set(documents.flatMap(document => {
    const validator = document.documentType === "module-declaration"
      ? validateModuleDeclaration
      : validateCompositionProfile;
    return staticIdentityInvalidPaths(document, validator).map(pathValue => (
      canonicalize(pathValue)
    ));
  }));
  const context = {
    descriptor,
    declarations: validDeclarations,
    profile: profileInvalid ? undefined : profileDocument.value,
    identityInvalidPaths,
    identityCensusComplete: invalidDeclarations === 0 && !hasDuplicate(implementationIds),
    moduleCensusComplete: invalidDeclarations === 0,
  };
  if (context.profile !== undefined && hasDuplicate(context.profile.bindings.map(binding => (
    `${binding.consumerImplementationId}\u0000${binding.slotId}`
  )))) {
    fail(`${descriptor.caseId} uses a repeated binding coordinate before its semantics are accepted`);
  }

  for (const diagnostic of diagnostics) {
    const prerequisite = diagnosticPrerequisites.get(diagnostic.code);
    if (prerequisite?.prerequisites.includes("declaration.identity-census-complete")
      && !context.identityCensusComplete) {
      fail(`${descriptor.caseId} emits ${diagnostic.code} without a complete declaration identity census`);
    }
    if (prerequisite?.prerequisites.includes("declaration.module-census-complete")
      && !context.moduleCensusComplete) {
      fail(`${descriptor.caseId} emits ${diagnostic.code} without a complete declaration module census`);
    }
    if (isStaticSemanticDiagnosticCode(diagnostic.code)
      && !staticSemanticDiagnosticHasWitness(diagnostic, context)) {
      fail(`${descriptor.caseId} emits ${diagnostic.code} without a truthful semantic witness`);
    }
  }
}

function isStaticSemanticDiagnosticCode(code) {
  return code === "identity.invalid"
    || code.startsWith("declaration.")
    || code.startsWith("profile.")
    || code.startsWith("binding.")
    || code.startsWith("graph.");
}

function hasDuplicate(values) {
  return new Set(values).size !== values.length;
}

function countValue(values, expected) {
  return values.filter(value => value === expected).length;
}

function declarationValues(context) {
  return context.declarations.map(document => document.value);
}

function declarationsWithImplementation(context, implementationId) {
  return context.declarations.filter(document => (
    document.value.implementationId === implementationId
  ));
}

function uniqueDeclaration(context, implementationId) {
  const matches = declarationsWithImplementation(context, implementationId);
  return matches.length === 1 ? matches[0].value : undefined;
}

function localDeclarationDiagnosticPath(context, diagnostic, document) {
  if (context.descriptor.entryPoint !== "compileCompositionJsonV1") {
    return diagnostic.path;
  }
  return pathStartsWith(diagnostic.path, document.prefix)
    ? diagnostic.path.slice(document.prefix.length)
    : undefined;
}

function duplicateDeclarationMemberWitness(context, diagnostic, field, coordinateValue) {
  return declarationsWithImplementation(
    context,
    diagnostic.coordinate.implementationId,
  ).some(document => {
    const pathValue = localDeclarationDiagnosticPath(context, diagnostic, document);
    if (pathValue?.length !== 2
      || !same(pathValue[0], { kind: "field", value: field })
      || pathValue[1].kind !== "index") {
      return false;
    }
    const index = pathValue[1].value;
    const member = document.value[field][index];
    if (member === undefined) return false;
    const identity = field === "provides" ? member.capabilityId : member.slotId;
    if (coordinateValue !== undefined && identity !== coordinateValue) return false;
    return document.value[field].slice(0, index).some(candidate => (
      (field === "provides" ? candidate.capabilityId : candidate.slotId) === identity
    ));
  });
}

function profileBindingRows(profile, diagnostic, { requireProvider = false } = {}) {
  if (profile === undefined) return [];
  return profile.bindings.filter(binding => (
    binding.consumerImplementationId === diagnostic.coordinate.implementationId
    && (diagnostic.coordinate.slotId === undefined
      || binding.slotId === diagnostic.coordinate.slotId)
    && (!requireProvider
      || binding.providerImplementationIds.includes(
        diagnostic.coordinate.providerImplementationId,
      ))
  ));
}

function selectedImplementationIds(profile) {
  return new Set(profile?.selections.map(selection => selection.implementationId) ?? []);
}

function slotForDiagnostic(context, diagnostic) {
  const consumer = uniqueDeclaration(context, diagnostic.coordinate.implementationId);
  if (consumer === undefined) return undefined;
  const matches = consumer.slots.filter(slot => slot.slotId === diagnostic.coordinate.slotId);
  return matches.length === 1 ? matches[0] : undefined;
}

function cardinalityMatchesSlot(cardinality, count) {
  if (cardinality.kind === "required") return count === 1;
  if (cardinality.kind === "optional") return count <= 1;
  return count >= cardinality.min && count <= cardinality.max;
}

function cardinalityMatchesDiagnostic(cardinality, count, details) {
  return !cardinalityMatchesSlot(cardinality, count)
    && details.expectedCardinality === cardinality.kind
    && details.actualCardinality === count;
}

function selectedDeclarationGraph(context) {
  const { profile } = context;
  if (profile === undefined) return undefined;
  const byModule = new Map();
  const byImplementation = new Map();
  for (const selection of profile.selections) {
    if (byModule.has(selection.moduleId)
      || byImplementation.has(selection.implementationId)) {
      return undefined;
    }
    const declaration = uniqueDeclaration(context, selection.implementationId);
    if (declaration === undefined || declaration.moduleId !== selection.moduleId) {
      return undefined;
    }
    byModule.set(selection.moduleId, declaration);
    byImplementation.set(selection.implementationId, declaration);
  }
  return { byModule, byImplementation };
}

function positivelyResolvedSelectedGraph(context) {
  const { profile } = context;
  if (profile === undefined) return undefined;
  const moduleIds = profile.selections.map(selection => selection.moduleId);
  const implementationIds = profile.selections.map(selection => selection.implementationId);
  const byModule = new Map();
  const byImplementation = new Map();
  for (const selection of profile.selections) {
    if (countValue(moduleIds, selection.moduleId) !== 1
      || countValue(implementationIds, selection.implementationId) !== 1) {
      continue;
    }
    const declaration = uniqueDeclaration(context, selection.implementationId);
    if (declaration === undefined || declaration.moduleId !== selection.moduleId) continue;
    byModule.set(selection.moduleId, declaration);
    byImplementation.set(selection.implementationId, declaration);
  }
  return { byModule, byImplementation };
}

function bindingPositiveProviders(binding, consumer, selected) {
  const slots = consumer.slots.filter(slot => slot.slotId === binding.slotId);
  if (slots.length !== 1 || hasDuplicate(binding.providerImplementationIds)) return [];
  const [slot] = slots;
  if (!cardinalityMatchesSlot(slot.cardinality, binding.providerImplementationIds.length)) {
    return [];
  }
  const providers = [];
  for (const providerId of binding.providerImplementationIds) {
    const provider = selected.byImplementation.get(providerId);
    if (provider === undefined) return [];
    const capabilities = provider.provides.filter(capability => (
      capability.capabilityId === slot.capabilityId
    ));
    if (capabilities.length !== 1
      || !same(capabilities[0].compatibility, slot.compatibility)) {
      return [];
    }
    providers.push(providerId);
  }
  return providers;
}

function reachableSelectedImplementations(context) {
  const { profile } = context;
  const selected = selectedDeclarationGraph(context);
  if (profile === undefined || selected === undefined || hasDuplicate(profile.roots)) {
    return undefined;
  }
  const roots = profile.roots.map(moduleId => selected.byModule.get(moduleId));
  if (roots.some(root => root === undefined)) return undefined;
  const reachable = new Set(roots.map(root => root.implementationId));
  const pending = [...reachable];
  while (pending.length > 0) {
    const consumerId = pending.pop();
    const consumer = selected.byImplementation.get(consumerId);
    if (hasDuplicate(consumer.slots.map(slot => slot.slotId))) return undefined;
    const rows = profile.bindings.filter(binding => (
      binding.consumerImplementationId === consumerId
    ));
    if (rows.some(binding => !consumer.slots.some(slot => slot.slotId === binding.slotId))) {
      return undefined;
    }
    for (const slot of consumer.slots) {
      const slotRows = rows.filter(binding => binding.slotId === slot.slotId);
      if (slotRows.length !== 1) return undefined;
      const [binding] = slotRows;
      if (hasDuplicate(binding.providerImplementationIds)
        || !cardinalityMatchesSlot(slot.cardinality, binding.providerImplementationIds.length)) {
        return undefined;
      }
      const providers = bindingPositiveProviders(binding, consumer, selected);
      if (providers.length !== binding.providerImplementationIds.length) return undefined;
      for (const providerId of providers) {
        if (!reachable.has(providerId)) {
          reachable.add(providerId);
          pending.push(providerId);
        }
      }
    }
  }
  return reachable;
}

function cyclicSelectedComponents(context) {
  const { profile } = context;
  const selected = positivelyResolvedSelectedGraph(context);
  if (profile === undefined || selected === undefined) return undefined;
  const edgePairs = new Map();
  for (const binding of profile.bindings) {
    const consumer = selected.byImplementation.get(binding.consumerImplementationId);
    if (consumer === undefined) continue;
    for (const providerId of bindingPositiveProviders(binding, consumer, selected)) {
      const key = `${providerId}\u0000${binding.consumerImplementationId}`;
      edgePairs.set(key, {
        id: key,
        from: providerId,
        to: binding.consumerImplementationId,
      });
    }
  }
  const nodes = [...selected.byImplementation.keys()].sort(compareAscii);
  const edges = [...edgePairs.values()].sort((left, right) => compareAscii(left.id, right.id));
  return deriveCyclicSccs(nodes, edges, nodes, edges.map(edge => edge.id));
}

function staticSemanticDiagnosticHasWitness(diagnostic, context) {
  const declarations = declarationValues(context);
  const { profile } = context;
  switch (diagnostic.code) {
    case "identity.invalid":
      return context.identityInvalidPaths.has(canonicalize(diagnostic.path));
    case "declaration.duplicate-implementation":
      return countValue(
        declarations.map(declaration => declaration.implementationId),
        diagnostic.coordinate.implementationId,
      ) > 1;
    case "declaration.duplicate-capability":
      return duplicateDeclarationMemberWitness(context, diagnostic, "provides");
    case "declaration.duplicate-slot":
      return duplicateDeclarationMemberWitness(
        context, diagnostic, "slots", diagnostic.coordinate.slotId,
      );
    case "profile.duplicate-root":
      return profile !== undefined
        && countValue(profile.roots, diagnostic.coordinate.moduleId) > 1;
    case "profile.unknown-root":
      return profile !== undefined
        && profile.roots.includes(diagnostic.coordinate.moduleId)
        && !declarations.some(declaration => (
          declaration.moduleId === diagnostic.coordinate.moduleId
        ));
    case "profile.duplicate-selection":
      return profile !== undefined
        && countValue(
          profile.selections.map(selection => selection.moduleId),
          diagnostic.coordinate.moduleId,
        ) > 1;
    case "profile.unknown-module":
      return profile !== undefined
        && profile.selections.some(selection => (
          selection.moduleId === diagnostic.coordinate.moduleId
        ))
        && !declarations.some(declaration => (
          declaration.moduleId === diagnostic.coordinate.moduleId
        ));
    case "profile.unknown-implementation":
      return profile !== undefined
        && profile.selections.some(selection => (
          selection.moduleId === diagnostic.coordinate.moduleId
          && selection.implementationId === diagnostic.coordinate.implementationId
        ))
        && uniqueDeclaration(context, diagnostic.coordinate.implementationId) === undefined;
    case "profile.implementation-mismatch": {
      if (profile === undefined) return false;
      const declaration = uniqueDeclaration(context, diagnostic.coordinate.implementationId);
      return declaration !== undefined
        && declaration.moduleId !== diagnostic.coordinate.moduleId
        && profile.selections.some(selection => (
          selection.moduleId === diagnostic.coordinate.moduleId
          && selection.implementationId === diagnostic.coordinate.implementationId
        ));
    }
    case "profile.missing-selection":
      return profile !== undefined
        && profile.roots.includes(diagnostic.coordinate.moduleId)
        && !profile.selections.some(selection => (
          selection.moduleId === diagnostic.coordinate.moduleId
        ));
    case "profile.unreachable-selection": {
      if (profile === undefined) return false;
      const reachable = reachableSelectedImplementations(context);
      return reachable !== undefined
        && profile.selections.some(selection => (
          selection.moduleId === diagnostic.coordinate.moduleId
          && selection.implementationId === diagnostic.coordinate.implementationId
        ))
        && !reachable.has(diagnostic.coordinate.implementationId);
    }
    case "binding.duplicate":
      return slotForDiagnostic(context, diagnostic) !== undefined
        && profileBindingRows(profile, diagnostic, { requireProvider: true }).some(binding => (
          countValue(
            binding.providerImplementationIds,
            diagnostic.coordinate.providerImplementationId,
          ) > 1
        ));
    case "binding.missing":
      return profile !== undefined
        && slotForDiagnostic(context, diagnostic) !== undefined
        && selectedImplementationIds(profile).has(diagnostic.coordinate.implementationId)
        && profileBindingRows(profile, diagnostic).length === 0;
    case "binding.unknown-consumer":
      return profileBindingRows(profile, diagnostic).length > 0
        && uniqueDeclaration(context, diagnostic.coordinate.implementationId) === undefined;
    case "binding.unknown-slot":
      return profileBindingRows(profile, diagnostic).length > 0
        && uniqueDeclaration(context, diagnostic.coordinate.implementationId) !== undefined
        && uniqueDeclaration(context, diagnostic.coordinate.implementationId).slots
          .filter(slot => slot.slotId === diagnostic.coordinate.slotId).length === 0;
    case "binding.unknown-provider":
      return profileBindingRows(profile, diagnostic, { requireProvider: true }).length > 0
        && slotForDiagnostic(context, diagnostic) !== undefined
        && uniqueDeclaration(context, diagnostic.coordinate.providerImplementationId) === undefined;
    case "binding.provider-not-selected":
      return profileBindingRows(profile, diagnostic, { requireProvider: true }).length > 0
        && uniqueDeclaration(context, diagnostic.coordinate.providerImplementationId) !== undefined
        && !selectedImplementationIds(profile).has(
          diagnostic.coordinate.providerImplementationId,
        );
    case "binding.cardinality": {
      const slot = slotForDiagnostic(context, diagnostic);
      return slot !== undefined && profileBindingRows(profile, diagnostic).some(binding => (
        cardinalityMatchesDiagnostic(
          slot.cardinality,
          binding.providerImplementationIds.length,
          diagnostic.details,
        )
      ));
    }
    case "binding.capability-missing": {
      const slot = slotForDiagnostic(context, diagnostic);
      const provider = uniqueDeclaration(context, diagnostic.coordinate.providerImplementationId);
      return slot !== undefined && provider !== undefined
        && profileBindingRows(profile, diagnostic, { requireProvider: true }).length > 0
        && !provider.provides.some(capability => (
          capability.capabilityId === slot.capabilityId
        ));
    }
    case "binding.compatibility-mismatch": {
      const slot = slotForDiagnostic(context, diagnostic);
      const provider = uniqueDeclaration(context, diagnostic.coordinate.providerImplementationId);
      return slot !== undefined && provider !== undefined
        && profileBindingRows(profile, diagnostic, { requireProvider: true }).length > 0
        && same(diagnostic.details.expectedCompatibility, slot.compatibility)
        && provider.provides.some(capability => (
          capability.capabilityId === slot.capabilityId
          && same(capability.compatibility, diagnostic.details.actualCompatibility)
          && !same(capability.compatibility, slot.compatibility)
        ));
    }
    case "graph.cycle": {
      const components = cyclicSelectedComponents(context);
      return components !== undefined
        && components.some(component => same(component, diagnostic.details.component));
    }
    default:
      return false;
  }
}

function structuralPathFromJsonPointer(value, pointer) {
  if (pointer === "") return [];
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    fail("schema validator returned an invalid instance path");
  }
  const path = [];
  let current = value;
  for (const encodedToken of pointer.slice(1).split("/")) {
    const token = encodedToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isSafeInteger(index) || index < 0) {
        fail("schema validator returned an invalid array instance path");
      }
      path.push({ kind: "index", value: index });
      current = current[index];
    } else {
      path.push({ kind: "field", value: token });
      current = current?.[token];
    }
  }
  return path;
}

function staticUnknownFieldParentPaths(descriptor, validateDocument, resourceProfile) {
  const paths = [];
  for (const document of staticInputDocuments(descriptor, resourceProfile)) {
    if (document.value === undefined || validateDocument(document.value)) continue;
    const errors = validateDocument.errors ?? [];
    for (const error of errors) {
      if (error.keyword !== "additionalProperties") continue;
      paths.push([
        ...document.prefix,
        ...structuralPathFromJsonPointer(document.value, error.instancePath),
      ]);
    }
  }
  return paths;
}

function validateSchemaValidCompanion(companion, validateDocument, label) {
  if (!same(objectKeys(companion, label).sort(compareAscii), ["declarations", "profile"])
    || !Array.isArray(companion.declarations)
    || companion.declarations.length === 0) {
    fail(`${label} must be one complete non-empty companion world`);
  }
  for (const [index, declaration] of companion.declarations.entries()) {
    validateWith(validateDocument, declaration, `${label}.declarations[${index}]`);
  }
  validateWith(validateDocument, companion.profile, `${label}.profile`);
}

export function validateResolvedResultCodeDisposition({ result, contract, label = "resolved result" }) {
  if (result === null || typeof result !== "object" || !Array.isArray(result.diagnostics)) {
    fail(`${label} has no diagnostic array for code-disposition qualification`);
  }
  const emittable = new Set(contract?.codeDisposition?.emittable ?? []);
  const reserved = new Set(contract?.codeDisposition?.reservedNonEmittable ?? []);
  for (const diagnostic of result.diagnostics) {
    if (reserved.has(diagnostic?.code)) {
      fail(`${label} contains reserved-non-emittable code ${diagnostic.code}`);
    }
    if (!emittable.has(diagnostic?.code)) {
      fail(`${label} contains a code outside the closed emittable partition`);
    }
  }
}

export function validateStaticConformanceProtocol({
  protocol,
  contract,
  catalog,
  resourceProfile,
  schema,
  validateDocument,
  validateDiagnostic,
  validateModuleDeclaration,
  validateCompositionProfile,
}) {
  if (schema?.$defs === undefined
    || typeof validateDocument !== "function"
    || typeof validateDiagnostic !== "function"
    || typeof validateModuleDeclaration !== "function"
    || typeof validateCompositionProfile !== "function") {
    fail("static conformance requires accepted base-schema validators");
  }
  if (!same(resourceProfile, EFFECTIVE_RESOURCE_PROFILE_AUTHORITY)) {
    fail("static conformance requires the one effective resource profile");
  }
  if (!same(objectKeys(protocol, "static conformance protocol").sort(compareAscii), [
    "authority", "cases", "descriptorPolicy", "futurePackedSubjectEvidenceMinimum",
    "generators",
  ]) || protocol.authority !== "static-expectations-never-executed-evidence") {
    fail("static conformance protocol has an invalid closed shape");
  }
  validateFuturePackedSubjectEvidenceMinimum(protocol.futurePackedSubjectEvidenceMinimum);
  if (!same(protocol.descriptorPolicy, {
    caseId: "stable-unique",
    entryPoints: ["compileCompositionV1", "compileCompositionJsonV1"],
    input: "exactly-one-complete-inline-input-or-closed-generator-id",
    schemaValidCompanion: "required-for-every-inline-input",
    rawInlineEncoding: "UTF-8 bytes of declarationsUtf8 and profileUtf8 without transformation",
    expected: "one-exact-complete-result",
    forbiddenExpectationForms: ["partial", "code-only", "pattern", "alternate", "subject-derived"],
    forbiddenInstanceFields: ["status", "actual", "timestamp", "callerLabel", "runtime", "reportId"],
  })) {
    fail("static descriptor policy is not the closed companion-world policy");
  }
  if (!same(protocol.generators, [{
    generatorId: "get-modular/generator/diagnostic-prefix-clip/v1",
    parameterless: true,
    algorithm: "one raw declaration document containing 33 nested single-element arrays around null, one schema-valid companion declaration, and a schema-valid one-root V1 profile selecting the companion",
    bounds: {
      declarationDocuments: 2,
      attemptedLocalSegments: 33,
      emittedPathSegments: 32,
    },
  }])) {
    fail("static generators are not the one closed bounded construction");
  }
  const cases = protocol.cases ?? [];
  exactStringSequence(cases.map(descriptor => descriptor.caseId), STATIC_CASE_IDS_AUTHORITY,
    "static conformance cases");
  const generatorIds = new Set(protocol.generators.map(generator => generator.generatorId));
  const variantByCode = new Map(contract.variants.map(variant => [variant.code, variant]));
  const compare = createDiagnosticComparator({ contract, catalog });
  const diagnosticPrerequisites = new Map(
    contract.prerequisiteCatalog.diagnostics.map(entry => [entry.code, entry]),
  );
  const limitPrerequisites = new Map(
    contract.prerequisiteCatalog.limits.map(entry => [entry.limitName, entry]),
  );
  const exactPrerequisiteCases = new Map(
    contract.prerequisiteCatalog.exactCases.map(entry => [entry.caseId, entry]),
  );

  for (const descriptor of cases) {
    const hasInput = Object.hasOwn(descriptor, "input");
    const hasGenerator = Object.hasOwn(descriptor, "generatorId");
    if (hasInput === hasGenerator
      || !/^diag\.[a-z0-9.-]+\.v1$/u.test(descriptor.caseId ?? "")
      || !protocol.descriptorPolicy.entryPoints.includes(descriptor.entryPoint)) {
      fail(`${descriptor.caseId ?? "static case"} has an invalid identity or input source`);
    }
    const expectedKeys = hasInput
      ? ["caseId", "entryPoint", "expected", "input", "schemaValidCompanion"]
      : ["caseId", "entryPoint", "expected", "generatorId"];
    if (!same(objectKeys(descriptor, descriptor.caseId).sort(compareAscii),
      expectedKeys.sort(compareAscii))) {
      fail(`${descriptor.caseId} has an invalid exact descriptor shape`);
    }
    if (hasGenerator && !generatorIds.has(descriptor.generatorId)) {
      fail(`${descriptor.caseId} uses an unknown generator`);
    }
    const executableDescriptor = hasGenerator
      ? materializeStaticGenerator(descriptor)
      : descriptor;
    if (hasInput) {
      const inputKeys = descriptor.entryPoint === "compileCompositionV1"
        ? ["declarations", "profile"]
        : ["declarationsUtf8", "profileUtf8"];
      if (!same(objectKeys(descriptor.input, `${descriptor.caseId}.input`)
        .sort(compareAscii), inputKeys.sort(compareAscii))) {
        fail(`${descriptor.caseId} has an invalid exact inline input`);
      }
      validateSchemaValidCompanion(
        descriptor.schemaValidCompanion,
        validateDocument,
        `${descriptor.caseId}.schemaValidCompanion`,
      );
      if (descriptor.entryPoint === "compileCompositionV1"
        && !Array.isArray(descriptor.input.declarations)) {
        fail(`${descriptor.caseId} object input declarations are not an exact array`);
      } else if (descriptor.entryPoint === "compileCompositionJsonV1"
        && (!Array.isArray(descriptor.input.declarationsUtf8)
        || descriptor.input.declarationsUtf8.some(value => typeof value !== "string")
        || typeof descriptor.input.profileUtf8 !== "string")) {
        fail(`${descriptor.caseId} raw input is not exact UTF-8 text data`);
      }
    } else {
      validateSchemaValidCompanion(
        executableDescriptor.schemaValidCompanion,
        validateDocument,
        `${descriptor.caseId}.generatedSchemaValidCompanion`,
      );
    }
    if (!same(objectKeys(descriptor.expected, `${descriptor.caseId}.expected`)
      .sort(compareAscii), ["diagnostics", "ok"])
      || descriptor.expected.ok !== false
      || !Array.isArray(descriptor.expected.diagnostics)
      || descriptor.expected.diagnostics.length === 0) {
      fail(`${descriptor.caseId} must contain one exact complete failure result`);
    }
    const diagnostics = descriptor.expected.diagnostics;
    const unknownFieldParentPaths = diagnostics.some(diagnostic => (
      diagnostic.code === "schema.unknown-field"
    ))
      ? staticUnknownFieldParentPaths(executableDescriptor, validateDocument, resourceProfile)
      : [];
    const normalizedCandidateKeys = new Set();
    validateResolvedResultCodeDisposition({
      result: descriptor.expected,
      contract,
      label: `${descriptor.caseId}.expected`,
    });
    for (const [index, diagnostic] of diagnostics.entries()) {
      const label = `${descriptor.caseId}.expected.diagnostics[${index}]`;
      validateWith(validateDiagnostic, diagnostic, label);
      const prefixLength = staticInvocationPrefixLength(
        executableDescriptor,
        diagnostic,
        contract,
      );
      const prerequisite = diagnostic.code === "input.limit-exceeded"
        ? limitPrerequisites.get(diagnostic.details.limitName)
        : diagnosticPrerequisites.get(diagnostic.code);
      if (descriptor.entryPoint === "compileCompositionJsonV1"
        && prerequisite?.suppressionScope === "document"
        && prefixLength === 0) {
        fail(`${label} omits its raw invocation locator`);
      }
      validateDiagnosticAgainstContract(
        diagnostic,
        contract,
        variantByCode,
        label,
        { invocationPrefixLength: prefixLength },
      );
      if (diagnostic.code === "schema.unknown-field"
        && !unknownFieldParentPaths.some(path => same(path, diagnostic.path))) {
        fail(`${label} must stop before an unknown field`);
      }
      const normalizedCandidate = canonicalize({
        code: diagnostic.code,
        phase: diagnostic.phase,
        path: diagnostic.path,
        coordinate: diagnostic.coordinate,
        details: diagnostic.details,
      });
      if (normalizedCandidateKeys.has(normalizedCandidate)) {
        fail(`${label} duplicates a normalized diagnostic candidate`);
      }
      normalizedCandidateKeys.add(normalizedCandidate);
    }
    if (!same(diagnostics, diagnostics.toSorted(compare))) {
      fail(`${descriptor.caseId} diagnostics are not in exact normative order`);
    }
    validateStaticRawDecodeSuppression(
      executableDescriptor,
      diagnostics,
      compare,
      resourceProfile,
      contract,
      schema,
      validateModuleDeclaration,
      validateCompositionProfile,
    );
    validateStaticSchemaExpectations({
      descriptor: executableDescriptor,
      diagnostics,
      validateModuleDeclaration,
      validateCompositionProfile,
      compare,
      resourceProfile,
    });
    validateStaticSchemaSuppression({
      descriptor: executableDescriptor,
      diagnostics,
      diagnosticPrerequisites,
      validateModuleDeclaration,
      validateCompositionProfile,
      resourceProfile,
    });
    const prerequisiteCase = exactPrerequisiteCases.get(descriptor.caseId);
    if (prerequisiteCase !== undefined
      && !same(diagnostics.map(diagnostic => diagnostic.code), prerequisiteCase.eligibleCodes)) {
      fail(`${descriptor.caseId} does not bind its exact prerequisite outcome`);
    }
  }
  for (const caseId of exactPrerequisiteCases.keys()) {
    if (!STATIC_CASE_IDS_AUTHORITY.includes(caseId)) {
      fail(`${caseId} has no exact static companion case`);
    }
  }
}

function assertCanonical(value, expected, label) {
  const primary = canonicalize(value);
  const differential = canonicalizeOracle(value);
  if (primary !== differential) fail(`${label} JCS oracles disagree`);
  if (primary !== expected) fail(`${label} is not the accepted RFC 8785 value`);
}

export function createSchemaValidators(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validateDocument = ajv.compile(schema);
  const validateDiagnostic = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $ref: `${schema.$id}#/$defs/diagnostic`,
  });
  const validateModuleDeclaration = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $ref: `${schema.$id}#/$defs/moduleDeclaration`,
  });
  const validateCompositionProfile = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $ref: `${schema.$id}#/$defs/compositionProfile`,
  });
  return {
    schema,
    validateDocument,
    validateDiagnostic,
    validateModuleDeclaration,
    validateCompositionProfile,
  };
}

function validateWith(validator, value, label) {
  if (!validator(value)) {
    fail(`${label} violates the base schema: ${JSON.stringify(validator.errors)}`);
  }
}

function pathPolicyFor(diagnostic, contract) {
  const policy = contract.pathPolicyByCode[diagnostic.code];
  const resolved = policy === "limit-specific"
    ? contract.limitPathPolicies[diagnostic.details.limitName]
    : policy;
  if (resolved !== "empty" && resolved !== "structural") {
    fail(`${diagnostic.code} has no executable exact path policy`);
  }
  return resolved;
}

function validateDiagnosticAgainstContract(
  diagnostic,
  contract,
  variantByCode,
  label,
  { invocationPrefixLength = 0 } = {},
) {
  const variant = variantByCode.get(diagnostic.code);
  if (variant === undefined) fail(`${label} uses an unknown diagnostic code`);
  if (!variant.phases.includes(diagnostic.phase)) {
    fail(`${label} uses an invalid phase for ${diagnostic.code}`);
  }
  const coordinateKeys = objectKeys(diagnostic.coordinate, `${label}.coordinate`);
  for (const required of variant.coordinate.required) {
    if (!coordinateKeys.includes(required)) fail(`${label} is missing coordinate.${required}`);
  }
  if (coordinateKeys.some(key => !variant.coordinate.allowed.includes(key))) {
    fail(`${label} contains a forbidden coordinate field`);
  }
  const detailKeys = objectKeys(diagnostic.details, `${label}.details`);
  if (!same(detailKeys.sort(compareAscii), [...variant.details.required].sort(compareAscii))) {
    fail(`${label} does not use the exact detail shape for ${diagnostic.code}`);
  }
  if (variant.details.reasonValues !== undefined
    && !variant.details.reasonValues.includes(diagnostic.details.reason)) {
    fail(`${label} has an invalid reason for ${diagnostic.code}`);
  }
  const localPath = diagnostic.path.slice(invocationPrefixLength);
  const pathPolicy = pathPolicyFor(diagnostic, contract);
  if (pathPolicy === "empty" && localPath.length !== 0) {
    fail(`${label} must use an empty path`);
  }
  const prefixCanSatisfyStructural = invocationPrefixLength > 0
    && contract.boundedEmissionProtocol
      .pathPolicyComposition.structuralMayBeSatisfiedByInvocationPrefix === true;
  if (pathPolicy === "structural" && localPath.length === 0
    && !prefixCanSatisfyStructural) {
    fail(`${label} must use a structural path`);
  }
  if (diagnostic.code === "input.limit-exceeded") {
    const limitName = diagnostic.details.limitName;
    if (contract.limitPhases[limitName] !== diagnostic.phase) {
      fail(`${label} uses the wrong phase for ${limitName}`);
    }
  }
  if (diagnostic.code === "graph.cycle") {
    const component = diagnostic.details.component;
    if (new Set(component).size !== component.length
      || !same(component, [...component].sort(compareAscii))) {
      fail(`${label} cycle component members must be unique and sorted`);
    }
  }
}

function comparePathWithAxis(left, right) {
  const kindRank = new Map([["field", 0], ["index", 1]]);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];
    const kindDifference = kindRank.get(leftSegment.kind) - kindRank.get(rightSegment.kind);
    if (kindDifference !== 0) {
      return {
        axis: index === 0 ? "path.kind" : "path.later-kind",
        segmentIndex: index,
        order: kindDifference,
      };
    }
    const valueDifference = leftSegment.kind === "field"
      ? compareAscii(leftSegment.value, rightSegment.value)
      : leftSegment.value - rightSegment.value;
    if (valueDifference !== 0) {
      return {
        axis: index > 0
          ? leftSegment.kind === "field"
            ? "path.later-field-value"
            : "path.later-index-value"
          : leftSegment.kind === "field" ? "path.field-value" : "path.index-value",
        segmentIndex: index,
        order: valueDifference,
      };
    }
  }
  return {
    axis: "path.length",
    segmentIndex: length,
    order: left.length - right.length,
  };
}

function canonicalDetailBytes(details, label) {
  const primary = canonicalize(details);
  const differential = canonicalizeOracle(details);
  if (primary !== differential) fail(`${label} RFC 8785 detail oracles disagree`);
  return Buffer.from(primary, "utf8");
}

function diagnosticComparisonEvidence(left, right, contract, catalog) {
  const phaseRank = new Map(catalog.ordering.phases.map((phase, index) => [phase, index]));
  const codeRank = new Map(catalog.ordering.codes.map((code, index) => [code, index]));
  const components = [{
    axis: "phase",
    order: phaseRank.get(left.phase) - phaseRank.get(right.phase),
  }, {
    axis: "code",
    order: codeRank.get(left.code) - codeRank.get(right.code),
  }];
  for (const field of contract.coordinateFieldOrder) {
    const leftPresent = Object.hasOwn(left.coordinate, field);
    const rightPresent = Object.hasOwn(right.coordinate, field);
    components.push({
      axis: `coordinate.${field}.presence`,
      order: leftPresent === rightPresent ? 0 : leftPresent ? 1 : -1,
    });
    components.push({
      axis: `coordinate.${field}.value`,
      order: leftPresent && rightPresent
        ? compareAscii(left.coordinate[field], right.coordinate[field])
        : 0,
    });
  }
  components.push(comparePathWithAxis(left.path, right.path));
  components.push({
    axis: "details.rfc8785",
    order: compareDiagnosticDetails(left, right),
  });
  const decisive = components.find(component => component.order !== 0);
  return {
    axis: decisive?.axis ?? null,
    components,
    order: decisive?.order ?? 0,
  };
}

export function createDiagnosticComparator({ contract, catalog }) {
  const phaseRank = new Map(catalog.ordering.phases.map((phase, index) => [phase, index]));
  const codeRank = new Map(catalog.ordering.codes.map((code, index) => [code, index]));
  return (left, right) => {
    const phaseDifference = phaseRank.get(left.phase) - phaseRank.get(right.phase);
    if (phaseDifference !== 0) return phaseDifference;
    const codeDifference = codeRank.get(left.code) - codeRank.get(right.code);
    if (codeDifference !== 0) return codeDifference;
    for (const field of contract.coordinateFieldOrder) {
      const leftPresent = Object.hasOwn(left.coordinate, field);
      const rightPresent = Object.hasOwn(right.coordinate, field);
      if (leftPresent !== rightPresent) return leftPresent ? 1 : -1;
      if (leftPresent) {
        const difference = compareAscii(left.coordinate[field], right.coordinate[field]);
        if (difference !== 0) return difference;
      }
    }
    const path = comparePathWithAxis(left.path, right.path).order;
    if (path !== 0) return path;
    return compareDiagnosticDetails(left, right);
  };
}

function materializeOrderingOperand(operand, snapshotByName, label) {
  const base = snapshotByName.get(operand.snapshot);
  if (base === undefined) fail(`${label} references unknown snapshot ${operand.snapshot}`);
  const allowedKeys = new Set(["name", "snapshot", "override"]);
  if (objectKeys(operand, label).some(key => !allowedKeys.has(key))
    || typeof operand.name !== "string") {
    fail(`${label} has an invalid operand shape`);
  }
  const diagnostic = structuredClone(base);
  if (operand.override !== undefined) {
    const overrideKeys = objectKeys(operand.override, `${label}.override`);
    const diagnosticKeys = new Set(["code", "phase", "path", "coordinate", "details"]);
    if (overrideKeys.some(key => !diagnosticKeys.has(key))) {
      fail(`${label} overrides an unknown diagnostic field`);
    }
    Object.assign(diagnostic, structuredClone(operand.override));
  }
  return { name: operand.name, diagnostic };
}

function compareStringArrays(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = compareAscii(left[index], right[index]);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function compareDiagnosticDetails(left, right) {
  if (left.code === "graph.cycle" && right.code === "graph.cycle") {
    return compareStringArrays(left.details.component, right.details.component);
  }
  return Buffer.compare(
    canonicalDetailBytes(left.details, "left diagnostic"),
    canonicalDetailBytes(right.details, "right diagnostic"),
  );
}

function deriveCyclicSccs(nodes, edges, nodeOrder, edgeOrder) {
  exactStringSet(nodeOrder, nodes, "SCC traversal node permutation");
  exactStringSet(edgeOrder, edges.map(edge => edge.id), "SCC traversal edge permutation");
  const edgeById = new Map(edges.map(edge => [edge.id, edge]));
  const forward = new Map(nodes.map(node => [node, new Set()]));
  const reverse = new Map(nodes.map(node => [node, new Set()]));
  for (const edgeId of edgeOrder) {
    const edge = edgeById.get(edgeId);
    forward.get(edge.from).add(edge.to);
    reverse.get(edge.to).add(edge.from);
  }
  const finish = [];
  const visited = new Set();
  for (const root of nodeOrder) {
    if (visited.has(root)) continue;
    visited.add(root);
    const stack = [{ node: root, next: 0 }];
    while (stack.length > 0) {
      const frame = stack.at(-1);
      const neighbors = [...forward.get(frame.node)];
      if (frame.next < neighbors.length) {
        const neighbor = neighbors[frame.next];
        frame.next += 1;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push({ node: neighbor, next: 0 });
        }
      } else {
        finish.push(frame.node);
        stack.pop();
      }
    }
  }
  const assigned = new Set();
  const components = [];
  for (let index = finish.length - 1; index >= 0; index -= 1) {
    const root = finish[index];
    if (assigned.has(root)) continue;
    const component = [];
    const stack = [root];
    assigned.add(root);
    while (stack.length > 0) {
      const node = stack.pop();
      component.push(node);
      for (const neighbor of reverse.get(node)) {
        if (!assigned.has(neighbor)) {
          assigned.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    component.sort(compareAscii);
    const cyclic = component.length > 1
      || edges.some(edge => edge.from === component[0] && edge.to === component[0]);
    if (cyclic) components.push(component);
  }
  return components.sort(compareStringArrays);
}

export function validateDiagnosticQualification({
  contract,
  snapshots,
  catalog,
  profile,
  coordinateFields,
  validateDiagnostic,
}) {
  if (contract?.kind !== "get-modular.diagnostic-contract" || contract.contractVersion !== 1) {
    fail("unsupported diagnostic refinement contract");
  }
  if (!same(objectKeys(contract, "diagnostic refinement contract").sort(compareAscii), [
    "boundedEmissionProtocol",
    "codeDisposition",
    "comparator",
    "contractVersion",
    "coordinateFieldOrder",
    "failureEvaluationProtocol",
    "kind",
    "limitPathPolicies",
    "limitPhases",
    "pathPolicyByCode",
    "prerequisiteCatalog",
    "variants",
  ])) {
    fail("diagnostic refinement contract has an invalid closed shape");
  }
  if (!same(objectKeys(contract.codeDisposition, "diagnostic code disposition")
    .sort(compareAscii), ["emittable", "policy", "reservedNonEmittable"])
    || contract.codeDisposition.policy
      !== "closed-ordered-partition-of-immutable-base-catalog") {
    fail("diagnostic code disposition is not the closed immutable-catalog partition");
  }
  exactStringSequence(
    contract.codeDisposition.emittable,
    EMITTABLE_CODE_ORDER_AUTHORITY,
    "emittable diagnostic code disposition",
  );
  exactStringSequence(
    contract.codeDisposition.reservedNonEmittable,
    RESERVED_NON_EMITTABLE_CODE_ORDER_AUTHORITY,
    "reserved-non-emittable diagnostic code disposition",
  );
  exactStringSet(
    [...contract.codeDisposition.emittable, ...contract.codeDisposition.reservedNonEmittable],
    CODE_ORDER_AUTHORITY,
    "diagnostic code-disposition partition",
  );
  if (!same(contract.failureEvaluationProtocol, {
    phases: "classification-and-sort-only",
    prerequisites: "fact-local",
    independentFactsContinue: true,
    failedPrerequisite: "suppress-dependent-derivatives-only",
    unreachableSelection: {
      phase: "graph",
      requires: ["valid-root", "valid-selections", "valid-reachability-bindings"],
    },
    failureResult: {
      required: ["ok", "diagnostics"],
      forbidden: ["plan", "digest"],
      reservedCode: "successor-qualification-failure",
    },
    internalFailure: {
      kinds: ["canonicalizer", "hash", "platform"],
      outcome: "reject-promise",
      diagnosticEmission: "forbidden",
      publicFaultInjection: "forbidden",
      serializedRejectionShape: "forbidden",
    },
  })) {
    fail("diagnostic failure evaluation does not reject closed internal failures");
  }
  exactStringSequence(contract.coordinateFieldOrder, coordinateFields,
    "diagnostic coordinate order");
  if (!same(contract.comparator, {
    missingCoordinate: "before-present",
    identifierOrder: "ascii-code-unit",
    pathKindOrder: ["field", "index"],
    pathPrefixOrder: "shorter-first",
    fieldOrder: "ascii-code-unit",
    indexOrder: "numeric-ascending",
    detailsOrder: "rfc8785-utf8",
    sccArrayOrder: "lexicographic-members-shorter-prefix-first",
    requiredDecisivePathPositions: [1, 2, profile.limits.diagnosticPathSegments],
    evidenceAxes: COMPARATOR_EVIDENCE_AXES,
  })) {
    fail("diagnostic comparator policy is not the closed normative policy");
  }
  exactStringSequence(catalog.ordering.phases, PHASE_ORDER_AUTHORITY,
    "diagnostic phase-rank authority");
  exactStringSequence(catalog.ordering.codes, CODE_ORDER_AUTHORITY,
    "diagnostic code-rank authority");
  exactStringSet(Object.keys(contract.pathPolicyByCode), EMITTABLE_CODE_ORDER_AUTHORITY,
    "diagnostic path policies");
  if (!same(contract.pathPolicyByCode, PATH_POLICY_AUTHORITY)) {
    fail("diagnostic code path policies contradict the independent authority");
  }
  exactStringSet(Object.keys(contract.limitPhases), Object.keys(LIMIT_PATH_POLICY_AUTHORITY),
    "diagnostic limit phases");
  exactStringSet(Object.keys(contract.limitPathPolicies), Object.keys(LIMIT_PATH_POLICY_AUTHORITY),
    "diagnostic limit path policies");
  if (!same(contract.limitPathPolicies, LIMIT_PATH_POLICY_AUTHORITY)) {
    fail("diagnostic limit path policies contradict the independent authority");
  }
  if (!same(objectKeys(contract.prerequisiteCatalog, "diagnostic prerequisite catalog")
    .sort(compareAscii), ["candidateGeneration", "diagnostics", "exactCases", "factModel", "limits", "policy"])) {
    fail("diagnostic prerequisite catalog has an invalid shape");
  }
  if (contract.prerequisiteCatalog.policy !== "closed-bounded-facts-no-predicates") {
    fail("diagnostic prerequisite catalog must be closed data");
  }
  if (!same(contract.prerequisiteCatalog.candidateGeneration,
    CANDIDATE_GENERATION_AUTHORITY)) {
    fail("diagnostic candidate generation does not use the closed normalized-key policy");
  }
  const factModel = contract.prerequisiteCatalog.factModel;
  if (!same(factModel, {
    states: ["valid", "invalid", "unavailable"],
    eligibility: {
      allPrerequisitesValid: "candidate-eligible",
      anyPrerequisiteInvalidOrUnavailable: "candidate-suppressed",
      independentCandidates: "continue",
      ordering: "normative-comparator-after-eligibility",
    },
    maximumPrerequisitesPerCandidate: 4,
    facts: PREREQUISITE_FACT_AUTHORITY,
  })) {
    fail("diagnostic prerequisite fact model contradicts the closed bounded authority");
  }
  const factIds = PREREQUISITE_FACT_AUTHORITY.map(fact => fact.factId);
  const factIdSet = new Set(factIds);
  const diagnosticPrerequisites = contract.prerequisiteCatalog?.diagnostics ?? [];
  exactStringSequence(
    diagnosticPrerequisites.map(entry => entry.code),
    EMITTABLE_CODE_ORDER_AUTHORITY,
    "diagnostic prerequisite catalog");
  for (const entry of diagnosticPrerequisites) {
    if (!same(objectKeys(entry, `diagnostic prerequisite ${entry.code}`).sort(compareAscii), [
      "code", "prerequisiteGroup", "prerequisites", "suppressionScope",
    ])) fail(`${entry.code} has an invalid prerequisite record shape`);
    if (!same([entry.prerequisiteGroup, entry.suppressionScope, entry.prerequisites],
      DIAGNOSTIC_PREREQUISITE_AUTHORITY[entry.code])) {
      fail(`${entry.code} contradicts the independent prerequisite authority`);
    }
    if (entry.prerequisites.length > factModel.maximumPrerequisitesPerCandidate
      || entry.prerequisites.some(factId => !factIdSet.has(factId))) {
      fail(`${entry.code} uses an unknown or unbounded prerequisite`);
    }
  }
  const limitPrerequisites = contract.prerequisiteCatalog?.limits ?? [];
  const limitNames = Object.keys(LIMIT_PREREQUISITE_AUTHORITY);
  exactStringSequence(limitPrerequisites.map(entry => entry.limitName), limitNames,
    "resource-limit prerequisite catalog");
  for (const entry of limitPrerequisites) {
    if (!same(objectKeys(entry, `limit prerequisite ${entry.limitName}`).sort(compareAscii), [
      "limitName", "prerequisiteGroup", "prerequisites", "suppressionScope",
    ])) fail(`${entry.limitName} has an invalid prerequisite record shape`);
    if (!same([entry.prerequisiteGroup, entry.suppressionScope, entry.prerequisites],
      LIMIT_PREREQUISITE_AUTHORITY[entry.limitName])) {
      fail(`${entry.limitName} contradicts the independent prerequisite authority`);
    }
    if (entry.prerequisites.length > factModel.maximumPrerequisitesPerCandidate
      || entry.prerequisites.some(factId => !factIdSet.has(factId))) {
      fail(`${entry.limitName} uses an unknown or unbounded prerequisite`);
    }
  }
  const prerequisiteCases = contract.prerequisiteCatalog.exactCases ?? [];
  exactStringSequence(
    prerequisiteCases.map(entry => entry.caseId),
    PREREQUISITE_CASE_AUTHORITY.map(entry => entry.caseId),
    "prerequisite exact cases",
  );
  const prerequisiteByCode = new Map(
    diagnosticPrerequisites.map(entry => [entry.code, entry.prerequisites]),
  );
  for (let index = 0; index < prerequisiteCases.length; index += 1) {
    const entry = prerequisiteCases[index];
    const authority = PREREQUISITE_CASE_AUTHORITY[index];
    if (!same(objectKeys(entry, `prerequisite exact case ${entry.caseId}`).sort(compareAscii), [
      "candidateCodes", "caseId", "eligibleCodes", "factStates", "suppressedCodes",
    ])) {
      fail(`${entry.caseId} has an invalid exact prerequisite case shape`);
    }
    const stateKeys = objectKeys(entry.factStates, `${entry.caseId}.factStates`);
    exactStringSet(stateKeys, factIds, `${entry.caseId} fact-state partition`);
    if (stateKeys.some(factId => !factModel.states.includes(entry.factStates[factId]))) {
      fail(`${entry.caseId} uses an unknown fact state`);
    }
    const expectedFactStates = Object.fromEntries(factIds.map(factId => [
      factId,
      authority.invalidFacts.includes(factId)
        ? "invalid"
        : authority.unavailableFacts.includes(factId) ? "unavailable" : "valid",
    ]));
    if (!same(entry.factStates, expectedFactStates)
      || !same(entry.candidateCodes, authority.candidateCodes)
      || !same(entry.eligibleCodes, authority.eligibleCodes)
      || !same(entry.suppressedCodes, authority.suppressedCodes)) {
      fail(`${entry.caseId} contradicts the independent exact prerequisite authority`);
    }
    const eligibleCodes = [];
    const suppressedCodes = [];
    for (const code of entry.candidateCodes) {
      const prerequisites = prerequisiteByCode.get(code);
      if (prerequisites === undefined) fail(`${entry.caseId} names an unknown candidate code`);
      const target = prerequisites.every(factId => entry.factStates[factId] === "valid")
        ? eligibleCodes
        : suppressedCodes;
      target.push(code);
    }
    if (!same(eligibleCodes, entry.eligibleCodes)
      || !same(suppressedCodes, entry.suppressedCodes)) {
      fail(`${entry.caseId} does not execute its exact eligibility outcome`);
    }
  }
  for (const policy of Object.values(contract.pathPolicyByCode)) {
    if (!PATH_POLICIES.has(policy)) fail(`unknown diagnostic path policy ${policy}`);
  }
  if (Object.entries(contract.pathPolicyByCode)
    .some(([code, policy]) => (policy === "limit-specific") !== (code === "input.limit-exceeded"))) {
    fail("limit-specific path policy is legal only for input.limit-exceeded");
  }
  for (const policy of Object.values(contract.limitPathPolicies)) {
    if (!PATH_POLICIES.has(policy) || policy === "limit-specific") {
      fail(`unknown limit path policy ${policy}`);
    }
  }

  const variants = contract.variants ?? [];
  exactStringSet(variants.map(variant => variant.code), EMITTABLE_CODE_ORDER_AUTHORITY,
    "diagnostic variants");
  const variantByCode = new Map(variants.map(variant => [variant.code, variant]));
  const knownCoordinateFields = new Set(contract.coordinateFieldOrder);
  for (const variant of variants) {
    exactStringSet(variant.details.required, catalog.detailPolicy[variant.code],
      `${variant.code} detail keys`);
    exactStringSet(variant.coordinate.allowed,
      [...variant.coordinate.allowed], `${variant.code} allowed coordinates`);
    exactStringSet(variant.coordinate.required,
      [...variant.coordinate.required], `${variant.code} required coordinates`);
    if (variant.coordinate.allowed.some(field => !knownCoordinateFields.has(field))
      || variant.coordinate.required.some(field => !variant.coordinate.allowed.includes(field))) {
      fail(`${variant.code} has an invalid coordinate contract`);
    }
    if (!same(variant.coordinate.required, variant.coordinate.allowed)) {
      fail(`${variant.code} must use one canonical coordinate shape`);
    }
    if (variant.phases.length === 0
      || variant.phases.some(phase => !catalog.ordering.phases.includes(phase))) {
      fail(`${variant.code} has an invalid phase contract`);
    }
  }

  const snapshotByName = new Map();
  const snapshotCodes = [];
  for (const snapshot of snapshots.snapshots ?? []) {
    if (typeof snapshot.name !== "string" || snapshotByName.has(snapshot.name)) {
      fail("diagnostic snapshot names must be unique strings");
    }
    validateWith(validateDiagnostic, snapshot.diagnostic, snapshot.name);
    validateDiagnosticAgainstContract(snapshot.diagnostic, contract, variantByCode, snapshot.name);
    snapshotByName.set(snapshot.name, snapshot.diagnostic);
    snapshotCodes.push(snapshot.diagnostic.code);
  }
  exactStringSet(snapshotCodes, EMITTABLE_CODE_ORDER_AUTHORITY, "diagnostic snapshots");

  const orderingCases = snapshots.orderingCases ?? [];
  exactStringSet(orderingCases.map(orderingCase => orderingCase.axis),
    COMPARATOR_EVIDENCE_AXES, "diagnostic comparator evidence axes");
  const orderingNames = new Set();
  const decisivePathPositions = new Set();
  const compare = createDiagnosticComparator({ contract, catalog });
  for (const orderingCase of orderingCases) {
    if (typeof orderingCase.name !== "string" || orderingNames.has(orderingCase.name)) {
      fail("diagnostic ordering case names must be unique strings");
    }
    orderingNames.add(orderingCase.name);
    if (!COMPARATOR_EVIDENCE_AXES.includes(orderingCase.axis)
      || !Array.isArray(orderingCase.operands)
      || orderingCase.operands.length !== 2) {
      fail(`${orderingCase.name} must isolate one closed comparator axis`);
    }
    const entries = orderingCase.operands.map((operand, index) => {
      const entry = materializeOrderingOperand(
        operand,
        snapshotByName,
        `${orderingCase.name}.operands[${index}]`,
      );
      validateWith(validateDiagnostic, entry.diagnostic, `${orderingCase.name}.${entry.name}`);
      validateDiagnosticAgainstContract(
        entry.diagnostic,
        contract,
        variantByCode,
        `${orderingCase.name}.${entry.name}`,
      );
      return entry;
    });
    exactStringSet(entries.map(entry => entry.name), orderingCase.expected,
      `${orderingCase.name} expected operands`);
    const [left, right] = entries;
    const evidence = diagnosticComparisonEvidence(
      left.diagnostic,
      right.diagnostic,
      contract,
      catalog,
    );
    if (evidence.axis !== orderingCase.axis || evidence.order >= 0
      || compare(right.diagnostic, left.diagnostic) <= 0
      || compare(left.diagnostic, left.diagnostic) !== 0
      || compare(right.diagnostic, right.diagnostic) !== 0) {
      fail(`${orderingCase.name} does not isolate ${orderingCase.axis} in both directions`);
    }
    if (orderingCase.axis.startsWith("path.")) {
      decisivePathPositions.add(
        comparePathWithAxis(left.diagnostic.path, right.diagnostic.path).segmentIndex + 1,
      );
    }
    const decisiveIndex = evidence.components.findIndex(component => component.order !== 0);
    const later = evidence.components.slice(decisiveIndex + 1);
    if (orderingCase.opposedLaterAxis === undefined) {
      if (later.some(component => component.order !== 0)) {
        fail(`${orderingCase.name} is not an isolated comparator-axis witness`);
      }
    } else {
      const opposed = later.find(component => component.axis === orderingCase.opposedLaterAxis);
      if (opposed === undefined || Math.sign(opposed.order) !== -Math.sign(evidence.order)) {
        fail(`${orderingCase.name} does not prove dominance over ${orderingCase.opposedLaterAxis}`);
      }
    }
    for (const permutation of [entries, [...entries].reverse()]) {
      const ordered = permutation.toSorted(
        (leftEntry, rightEntry) => compare(leftEntry.diagnostic, rightEntry.diagnostic),
      );
      if (!same(ordered.map(entry => entry.name), orderingCase.expected)) {
        fail(`${orderingCase.name} has an invalid expected diagnostic order`);
      }
    }
  }
  if (!same([...decisivePathPositions].sort((left, right) => left - right), [
    1, 2, profile.limits.diagnosticPathSegments,
  ])) {
    fail("comparator evidence must decide at exact path positions 1, 2, and maximum depth");
  }

  const detailCases = snapshots.detailCanonicalizationCases ?? [];
  exactStringSet(
    detailCases.map(detailCase => detailCase.name),
    [...DETAIL_CANONICALIZATION_BYTES_AUTHORITY.keys()],
    "diagnostic detail canonicalization cases",
  );
  for (const detailCase of detailCases) {
    if (!same(objectKeys(detailCase, `${detailCase.name} detail case`).sort(compareAscii), [
      "canonicalUtf8Hex", "details", "name",
    ])) {
      fail(`${detailCase.name} has an invalid exact detail-byte shape`);
    }
    const actual = canonicalDetailBytes(detailCase.details, detailCase.name).toString("hex");
    const authoritative = DETAIL_CANONICALIZATION_BYTES_AUTHORITY.get(detailCase.name);
    if (detailCase.canonicalUtf8Hex !== authoritative || actual !== authoritative) {
      fail(`${detailCase.name} differs from its independent exact RFC 8785 detail bytes`);
    }
  }

  const adjacency = snapshots.rankAdjacency;
  if (!same(objectKeys(adjacency, "diagnostic rank adjacency").sort(compareAscii), [
    "codes", "phases",
  ])) {
    fail("diagnostic rank adjacency has an invalid shape");
  }
  const adjacentPairs = values => values.slice(0, -1).map((value, index) => [
    value, values[index + 1],
  ]);
  if (!same(adjacency.phases, adjacentPairs(PHASE_ORDER_AUTHORITY))
    || !same(adjacency.codes, adjacentPairs(EMITTABLE_CODE_ORDER_AUTHORITY))) {
    fail("diagnostic rank adjacency does not cover every adjacent rank");
  }
  const diagnosticByCode = new Map(
    [...snapshotByName.values()].map(diagnostic => [diagnostic.code, diagnostic]),
  );
  const diagnosticByPhase = new Map(PHASE_ORDER_AUTHORITY.map(phase => [
    phase,
    EMITTABLE_CODE_ORDER_AUTHORITY
      .map(code => diagnosticByCode.get(code))
      .find(diagnostic => diagnostic.phase === phase),
  ]));
  const executeAdjacentComparison = (left, right, label) => {
    validateWith(validateDiagnostic, left, `${label}.left`);
    validateDiagnosticAgainstContract(left, contract, variantByCode, `${label}.left`);
    validateWith(validateDiagnostic, right, `${label}.right`);
    validateDiagnosticAgainstContract(right, contract, variantByCode, `${label}.right`);
    if (compare(left, right) >= 0) fail(`${label} is not executable`);
  };
  for (const [leftPhase, rightPhase] of adjacency.phases) {
    executeAdjacentComparison(
      diagnosticByPhase.get(leftPhase),
      diagnosticByPhase.get(rightPhase),
      `phase adjacency ${leftPhase}/${rightPhase}`,
    );
  }
  for (const [leftCode, rightCode] of adjacency.codes) {
    const left = diagnosticByCode.get(leftCode);
    const right = diagnosticByCode.get(rightCode);
    if (left.phase !== right.phase) continue;
    executeAdjacentComparison(
      left,
      right,
      `code adjacency ${leftCode}/${rightCode}`,
    );
  }

  const sccCases = snapshots.sccGraphCases ?? [];
  if (sccCases.length !== 1 || sccCases[0].name !== "directed-disjoint-components") {
    fail("SCC evidence must contain the one closed executable graph case");
  }
  for (const sccCase of sccCases) {
    exactStringSet(sccCase.nodes, sccCase.nodes, `${sccCase.name} graph nodes`);
    const nodeSet = new Set(sccCase.nodes);
    exactStringSet(sccCase.edges.map(edge => edge.id), sccCase.edges.map(edge => edge.id),
      `${sccCase.name} graph edge IDs`);
    if (sccCase.edges.some(edge => !nodeSet.has(edge.from) || !nodeSet.has(edge.to))) {
      fail(`${sccCase.name} has an invalid directed edge endpoint`);
    }
    const parallelEdges = sccCase.edges.filter(edge => (
      edge.from === "example/z/default" && edge.to === "example/b/default"
    ));
    if (!same(parallelEdges.map(edge => edge.id).sort(compareAscii), [
      "z-to-b", "z-to-b-parallel",
    ])) {
      fail(`${sccCase.name} must contain the closed legal parallel-edge witness`);
    }
    if ((sccCase.permutations?.length ?? 0) < 3) {
      fail(`${sccCase.name} lacks traversal and input permutations`);
    }
    if (!same([...sccCase.expected].sort(compareStringArrays), sccCase.expected)
      || !sccCase.expected.some(component => component.length === 1)
      || !sccCase.expected.some(component => component.length > 1)) {
      fail(`${sccCase.name} has invalid SCC member or outer ordering`);
    }
    const members = sccCase.expected.flat();
    if (new Set(members).size !== members.length) {
      fail(`${sccCase.name} expected SCC membership is not unique and disjoint`);
    }
    for (const [index, permutation] of sccCase.permutations.entries()) {
      const derived = deriveCyclicSccs(
        sccCase.nodes,
        sccCase.edges,
        permutation.nodeOrder,
        permutation.edgeOrder,
      );
      if (!same(derived, sccCase.expected)) {
        fail(`${sccCase.name} permutation ${index} derives different SCC membership or ordering`);
      }
    }
    for (const [index, component] of sccCase.expected.entries()) {
      const diagnostic = {
        code: "graph.cycle", phase: "graph", path: [], coordinate: {}, details: { component },
      };
      validateWith(validateDiagnostic, diagnostic, `${sccCase.name}.expected[${index}]`);
      validateDiagnosticAgainstContract(
        diagnostic, contract, variantByCode, `${sccCase.name}.expected[${index}]`,
      );
    }
  }
}

function minimumDependencyOrder(plan) {
  const ids = plan.selections.map(selection => selection.implementationId);
  const indegree = new Map(ids.map(id => [id, 0]));
  const dependents = new Map(ids.map(id => [id, new Set()]));
  for (const binding of plan.bindings) {
    for (const provider of binding.providerImplementationIds) {
      const consumers = dependents.get(provider);
      if (!consumers.has(binding.consumerImplementationId)) {
        consumers.add(binding.consumerImplementationId);
        indegree.set(binding.consumerImplementationId,
          indegree.get(binding.consumerImplementationId) + 1);
      }
    }
  }
  const ready = ids.filter(id => indegree.get(id) === 0).sort(compareAscii);
  const result = [];
  while (ready.length > 0) {
    const provider = ready.shift();
    result.push(provider);
    for (const consumer of [...dependents.get(provider)].sort(compareAscii)) {
      indegree.set(consumer, indegree.get(consumer) - 1);
      if (indegree.get(consumer) === 0) {
        ready.push(consumer);
        ready.sort(compareAscii);
      }
    }
  }
  return result.length === ids.length ? result : null;
}

function validateNormalizationProfileSemantics(profile, declarations, label) {
  const implementationIds = declarations.map(declaration => declaration.implementationId);
  if (new Set(implementationIds).size !== implementationIds.length) {
    fail(`${label} declarations contain duplicate implementation IDs`);
  }
  for (const declaration of declarations) {
    const slotIds = declaration.slots.map(slot => slot.slotId);
    if (new Set(slotIds).size !== slotIds.length) {
      fail(`${label} declarations contain duplicate slot IDs`);
    }
    const capabilityIds = declaration.provides.map(capability => capability.capabilityId);
    if (new Set(capabilityIds).size !== capabilityIds.length) {
      fail(`${label} declarations contain duplicate capability IDs`);
    }
  }
  const declarationsByImplementation = new Map(
    declarations.map(declaration => [declaration.implementationId, declaration]),
  );
  const selectedByImplementation = new Map();
  const selectedByModule = new Map();
  for (const selection of profile.selections) {
    const declaration = declarationsByImplementation.get(selection.implementationId);
    if (declaration === undefined) {
      fail(`${label} selects an unknown implementation`);
    }
    if (declaration.moduleId !== selection.moduleId) {
      fail(`${label} selection does not match its implementation declaration`);
    }
    if (selectedByImplementation.has(selection.implementationId)
      || selectedByModule.has(selection.moduleId)) {
      fail(`${label} selects an implementation or module more than once`);
    }
    selectedByImplementation.set(selection.implementationId, declaration);
    selectedByModule.set(selection.moduleId, selection.implementationId);
  }
  if (new Set(profile.roots).size !== profile.roots.length) {
    fail(`${label} contains duplicate roots`);
  }
  for (const root of profile.roots) {
    if (!selectedByModule.has(root)) fail(`${label} root is not selected`);
  }

  const bindingsByCoordinate = new Map();
  for (const binding of profile.bindings) {
    const declaredConsumer = declarationsByImplementation.get(
      binding.consumerImplementationId,
    );
    if (declaredConsumer === undefined) fail(`${label} binding has an unknown consumer`);
    const consumer = selectedByImplementation.get(binding.consumerImplementationId);
    if (consumer === undefined) continue;
    const slot = consumer.slots.find(candidate => candidate.slotId === binding.slotId);
    if (slot === undefined) fail(`${label} binding references an unknown slot`);
    const coordinate = `${binding.consumerImplementationId}\u0000${binding.slotId}`;
    if (bindingsByCoordinate.has(coordinate)) {
      fail(`${label} contains duplicate binding coordinates`);
    }
    bindingsByCoordinate.set(coordinate, { binding, slot });
    if (new Set(binding.providerImplementationIds).size
      !== binding.providerImplementationIds.length) {
      fail(`${label} binding contains duplicate provider implementation IDs`);
    }
    const providerCount = binding.providerImplementationIds.length;
    if ((slot.cardinality.kind === "required" && providerCount !== 1)
      || (slot.cardinality.kind === "optional" && providerCount > 1)
      || (slot.cardinality.kind === "many"
        && (providerCount < slot.cardinality.min || providerCount > slot.cardinality.max))) {
      fail(`${label} binding violates slot cardinality`);
    }
    for (const providerImplementationId of binding.providerImplementationIds) {
      const provider = selectedByImplementation.get(providerImplementationId);
      if (provider === undefined) fail(`${label} binding has an unselected provider`);
      const capability = provider.provides.find(candidate => (
        candidate.capabilityId === slot.capabilityId
          && same(candidate.compatibility, slot.compatibility)
      ));
      if (capability === undefined) {
        fail(`${label} binding provider does not satisfy its slot`);
      }
    }
  }
  for (const [implementationId, declaration] of selectedByImplementation) {
    for (const slot of declaration.slots) {
      const coordinate = `${implementationId}\u0000${slot.slotId}`;
      if (!bindingsByCoordinate.has(coordinate)) {
        fail(`${label} is missing a binding for a selected slot`);
      }
    }
  }
  const reachable = new Set(profile.roots.map(root => selectedByModule.get(root)));
  const pending = [...reachable];
  while (pending.length > 0) {
    const consumerImplementationId = pending.pop();
    for (const { binding } of bindingsByCoordinate.values()) {
      if (binding.consumerImplementationId !== consumerImplementationId) continue;
      for (const providerImplementationId of binding.providerImplementationIds) {
        if (!reachable.has(providerImplementationId)) {
          reachable.add(providerImplementationId);
          pending.push(providerImplementationId);
        }
      }
    }
  }
  if (reachable.size !== selectedByImplementation.size) {
    fail(`${label} selects an unreachable implementation`);
  }
  return declarationsByImplementation;
}

function normalizedProfileBindings(profile, declarations) {
  const declarationsByImplementation = validateNormalizationProfileSemantics(
    profile, declarations, "normalization vector",
  );
  const selectedImplementationIds = new Set(
    profile.selections.map(selection => selection.implementationId),
  );
  const selectedBindings = profile.bindings.filter(binding => (
    selectedImplementationIds.has(binding.consumerImplementationId)
  ));
  const coordinates = new Set();
  return selectedBindings.map(binding => {
    const declaration = declarationsByImplementation.get(binding.consumerImplementationId);
    const slot = declaration?.slots.find(candidate => candidate.slotId === binding.slotId);
    if (slot === undefined) fail("normalization vector references an unknown slot");
    const coordinate = `${binding.consumerImplementationId}\u0000${binding.slotId}`;
    if (coordinates.has(coordinate)) {
      fail("normalization vector contains duplicate binding coordinates");
    }
    coordinates.add(coordinate);
    if (new Set(binding.providerImplementationIds).size !== binding.providerImplementationIds.length) {
      fail("normalization vector contains duplicate provider implementation IDs");
    }
    const providerCount = binding.providerImplementationIds.length;
    if ((slot.cardinality.kind === "required" && providerCount !== 1)
      || (slot.cardinality.kind === "optional" && providerCount > 1)
      || (slot.cardinality.kind === "many"
        && (providerCount < slot.cardinality.min || providerCount > slot.cardinality.max))) {
      fail("normalization vector binding violates slot cardinality");
    }
    return {
      consumerImplementationId: binding.consumerImplementationId,
      slotId: binding.slotId,
      capabilityId: slot.capabilityId,
      compatibility: slot.compatibility,
      providerImplementationIds: binding.providerImplementationIds,
    };
  }).sort((left, right) => (
    compareAscii(left.consumerImplementationId, right.consumerImplementationId)
      || compareAscii(left.slotId, right.slotId)
  ));
}

function validatePlanBindings(bindings, label) {
  const coordinates = new Set();
  for (const binding of bindings) {
    const coordinate = `${binding.consumerImplementationId}\u0000${binding.slotId}`;
    if (coordinates.has(coordinate)) fail(`${label} contains duplicate binding coordinates`);
    coordinates.add(coordinate);
    if (new Set(binding.providerImplementationIds).size !== binding.providerImplementationIds.length) {
      fail(`${label} contains duplicate provider implementation IDs`);
    }
  }
}

export function validateNormalizationQualification({ vectors, validateDocument }) {
  if (!Array.isArray(vectors.cases) || vectors.cases.length === 0) {
    fail("normalization vectors require at least one case");
  }
  for (const vector of vectors.cases) {
    for (const declaration of vector.declarations) {
      validateWith(validateDocument, declaration, `${vector.name} declaration`);
    }
    validateWith(validateDocument, vector.expectedPlan, `${vector.name} expected plan`);
    const implementationIds = vector.declarations
      .map(declaration => declaration.implementationId)
      .sort(compareAscii);
    if (!Array.isArray(vector.declarationOrders) || vector.declarationOrders.length === 0) {
      fail(`${vector.name} requires at least one declaration permutation`);
    }
    if (!Array.isArray(vector.equivalentProfiles) || vector.equivalentProfiles.length === 0) {
      fail(`${vector.name} requires at least one equivalent profile`);
    }
    const declarationOrderKeys = vector.declarationOrders.map(order => JSON.stringify(order));
    if (implementationIds.length > 1 && new Set(declarationOrderKeys).size < 2) {
      fail(`${vector.name} requires distinct declaration permutations`);
    }
    const profilePermutationKeys = vector.equivalentProfiles.map(profile => JSON.stringify({
      roots: profile.roots,
      selections: profile.selections,
      bindings: profile.bindings,
    }));
    const hasProfilePermutationSurface = vector.expectedPlan.roots.length > 1
      || vector.expectedPlan.selections.length > 1
      || vector.expectedPlan.bindings.length > 1;
    if (hasProfilePermutationSurface && new Set(profilePermutationKeys).size < 2) {
      fail(`${vector.name} requires distinct equivalent profiles`);
    }
    for (const order of vector.declarationOrders) {
      exactStringSet(order, implementationIds, `${vector.name} declaration permutation`);
    }
    for (const profile of vector.equivalentProfiles) {
      validateWith(validateDocument, profile, `${vector.name} profile`);
      if (profile.profileId !== vector.expectedPlan.profileId) {
        fail(`${vector.name} profile ID differs from the expected plan`);
      }
      if (!same([...profile.roots].sort(compareAscii), vector.expectedPlan.roots)
        || !same([...profile.selections].sort((left, right) => (
          compareAscii(left.moduleId, right.moduleId)
            || compareAscii(left.implementationId, right.implementationId)
        )), vector.expectedPlan.selections)
        || !same(normalizedProfileBindings(profile, vector.declarations),
          vector.expectedPlan.bindings)) {
        fail(`${vector.name} profile does not normalize to the expected plan`);
      }
    }
    validatePlanBindings(vector.expectedPlan.bindings, `${vector.name} expected plan`);
    if (!same(minimumDependencyOrder(vector.expectedPlan), vector.expectedPlan.dependencyOrder)) {
      fail(`${vector.name} does not use the minimum deterministic dependency order`);
    }
    const envelope = {
      canonicalization: "RFC8785",
      hashAlgorithm: "SHA-256",
      kind: "get-modular.plan-content",
      plan: vector.expectedPlan,
      protocolVersion: 1,
    };
    assertCanonical(envelope, vector.canonicalUtf8, vector.name);
    const digest = createHash("sha256").update(vector.canonicalUtf8, "utf8").digest("hex");
    if (vector.digest !== `gm-plan:v1:sha-256:${digest}`) {
      fail(`${vector.name} has an invalid domain-separated digest`);
    }
  }
}

function diagnosticCollectorCandidate(template, index) {
  const suffix = String(index).padStart(template.decimalWidth, "0");
  return {
    id: `${template.idPrefix}${suffix}`,
    diagnostic: {
      code: template.code,
      phase: template.phase,
      path: structuredClone(template.path),
      coordinate: {
        [template.coordinateField]: `${template.coordinateValuePrefix}${suffix}`,
      },
      details: structuredClone(template.details),
    },
  };
}

export function validateResourceBoundaryQualification({
  vectors,
  profile,
  contract,
  catalog,
  validateDiagnostic,
  maximumOmitted = 262144,
}) {
  // This entry point preserves historical v1 fixture evidence, not active v2 admission.
  if (profile?.profileVersion !== 1) {
    fail("historical resource boundary qualification requires profile version 1");
  }
  if (vectors?.kind !== "get-modular.resource-boundary-vectors"
    || vectors.vectorVersion !== 1) {
    fail("unsupported resource boundary vectors");
  }
  const cases = vectors.cases ?? [];
  exactStringSet(cases.map(vector => vector.limitName), Object.keys(profile.limits),
    "resource boundary vectors");
  for (const vector of cases) {
    const limit = profile.limits[vector.limitName];
    if (vector.at !== limit || vector.over !== limit + 1) {
      fail(`${vector.limitName} must cover the exact boundary and boundary plus one`);
    }
    const historicalPhase = vector.limitName === "rawDocumentBytes"
      ? "decode"
      : contract.limitPhases[vector.limitName];
    if (vector.phase !== historicalPhase) {
      fail(`${vector.limitName} uses the wrong diagnostic phase`);
    }
    const expectedOutcome = vector.limitName === "diagnostics"
      ? "diagnostics.truncated"
      : "input.limit-exceeded";
    if (vector.overOutcome !== expectedOutcome) {
      fail(`${vector.limitName} uses the wrong over-limit outcome`);
    }
    if (typeof vector.unit !== "string" || vector.unit.length === 0) {
      fail(`${vector.limitName} has no measurement unit`);
    }
    const fixtureAuthority = RESOURCE_FIXTURE_AUTHORITY[vector.limitName];
    if (!same([vector.fixtureFamily, vector.fixtureShape], fixtureAuthority)) {
      fail(`${vector.limitName} has no authoritative executable fixture construction`);
    }
  }
  const semanticByName = new Map(
    (vectors.semanticCases ?? []).map(vector => [vector.name, vector]),
  );
  exactStringSet([...semanticByName.keys()], [
    "many-range-is-inclusive",
    "many-min-cannot-exceed-max",
    "provider-ids-are-unique-within-one-binding",
    "diagnostic-cap-is-not-truncated",
    "diagnostic-cap-plus-one-reserves-final-record",
  ], "resource semantic cases");
  const range = semanticByName.get("many-range-is-inclusive");
  if (!same(range.acceptedProviderCounts, [2, 3, 4])
    || !same(range.rejectedProviderCounts, [0, 1, 5])) {
    fail("many cardinality boundaries are incomplete");
  }
  const qualifiesMany = (cardinality, providerCount) => (
    cardinality?.kind === "many"
      && Number.isSafeInteger(cardinality.min)
      && Number.isSafeInteger(cardinality.max)
      && cardinality.min >= 0
      && cardinality.min <= cardinality.max
      && providerCount >= cardinality.min
      && providerCount <= cardinality.max
  );
  for (const count of range.acceptedProviderCounts) {
    if (!qualifiesMany(range.cardinality, count)) {
      fail("many inclusive-range oracle rejects an accepted provider count");
    }
  }
  for (const count of range.rejectedProviderCounts) {
    if (qualifiesMany(range.cardinality, count)) {
      fail("many inclusive-range oracle accepts a rejected provider count");
    }
  }
  const invalidRange = semanticByName.get("many-min-cannot-exceed-max").cardinality;
  if (invalidRange.min <= invalidRange.max || qualifiesMany(invalidRange, invalidRange.min)) {
    fail("independent many semantic oracle did not reject min greater than max");
  }
  const providers = semanticByName.get(
    "provider-ids-are-unique-within-one-binding",
  ).providerImplementationIds;
  if (new Set(providers).size === providers.length) {
    fail("duplicate provider vector contains no duplicate");
  }
  if (!same(semanticByName.get("diagnostic-cap-is-not-truncated"), {
    name: "diagnostic-cap-is-not-truncated",
    failureCount: 256,
    retained: 256,
    omitted: 0,
  }) || !same(semanticByName.get("diagnostic-cap-plus-one-reserves-final-record"), {
    name: "diagnostic-cap-plus-one-reserves-final-record",
    failureCount: 257,
    retained: 255,
    omitted: 2,
    diagnosticCode: "diagnostics.truncated",
  })) {
    fail("diagnostic 256/257 semantic boundaries are not exact");
  }

  const collector = vectors.diagnosticCollector;
  if (collector?.limitName !== "diagnostics"
    || collector.limit !== profile.limits.diagnostics
    || collector.maximumOmitted !== maximumOmitted
    || !Number.isSafeInteger(maximumOmitted)
    || maximumOmitted < 1) {
    fail("bounded diagnostic collector uses the wrong normative limits");
  }
  const template = collector.candidateTemplate;
  if (!same(objectKeys(template, "diagnostic collector candidate template").sort(compareAscii), [
    "code",
    "coordinateField",
    "coordinateValuePrefix",
    "decimalWidth",
    "details",
    "idPrefix",
    "path",
    "phase",
  ]) || !Number.isSafeInteger(template.decimalWidth) || template.decimalWidth < 1) {
    fail("bounded diagnostic collector has an invalid structured candidate template");
  }
  if (!contract.codeDisposition.emittable.includes(template.code)) {
    fail("bounded diagnostic collector uses a reserved or unknown candidate code");
  }
  const variantByCode = new Map(contract.variants.map(variant => [variant.code, variant]));
  const firstCandidate = diagnosticCollectorCandidate(template, 0);
  const lastCandidate = diagnosticCollectorCandidate(template, 262399);
  for (const candidate of [firstCandidate, lastCandidate]) {
    validateWith(validateDiagnostic, candidate.diagnostic, candidate.id);
    validateDiagnosticAgainstContract(
      candidate.diagnostic,
      contract,
      variantByCode,
      candidate.id,
    );
  }
  const compare = createDiagnosticComparator({ contract, catalog });
  if (compare(firstCandidate.diagnostic, lastCandidate.diagnostic) >= 0) {
    fail("structured diagnostic IDs do not follow the normative comparator");
  }

  const expectedPermutations = [
    { name: "ascending", kind: "ascending" },
    { name: "reverse", kind: "reverse" },
    { name: "stride-73", kind: "stride", start: 19, stride: 73 },
  ];
  if (!same(collector.permutations, expectedPermutations)) {
    fail("diagnostic collector permutations are not the closed evidence set");
  }
  const expectedIdSets = {
    "first-256": Array.from({ length: 256 }, (_, index) => (
      diagnosticCollectorCandidate(template, index).id
    )),
    "first-255": Array.from({ length: 255 }, (_, index) => (
      diagnosticCollectorCandidate(template, index).id
    )),
  };
  if (!same(collector.expectedRetainedIdSets, expectedIdSets)) {
    fail("diagnostic collector does not bind the exact retained IDs");
  }
  const expectedCollectorCases = [
    ["diagnostic-cap-is-not-truncated", 256, ["ascending", "reverse", "stride-73"]],
    ["diagnostic-cap-plus-one-reserves-final-record", 257,
      ["ascending", "reverse", "stride-73"]],
    ["diagnostic-late-replacement-after-k-plus-one", 258, ["reverse"]],
    ["diagnostic-omitted-at-schema-maximum", 262399, ["ascending"]],
    ["diagnostic-omitted-saturates-above-schema-maximum", 262400, ["ascending"]],
  ];
  if ((collector.cases?.length ?? 0) !== expectedCollectorCases.length) {
    fail("diagnostic collector does not contain the closed boundary cases");
  }
  const saturationThreshold = (collector.limit - 1) + collector.maximumOmitted;
  for (let index = 0; index < expectedCollectorCases.length; index += 1) {
    const vector = collector.cases[index];
    const [name, failureCount, permutationNames] = expectedCollectorCases[index];
    const truncated = failureCount > collector.limit;
    const retainedCount = truncated ? collector.limit - 1 : failureCount;
    const omitted = truncated
      ? Math.min(collector.maximumOmitted, failureCount - retainedCount)
      : 0;
    const expected = {
      name,
      failureCount,
      permutationNames,
      expectedRetainedIdSet: retainedCount === 256 ? "first-256" : "first-255",
      expectedTruncation: truncated ? { omitted } : null,
      expectedSaturatedFailureCount: Math.min(failureCount, saturationThreshold),
      expectedFailureCountSaturated: failureCount > saturationThreshold,
      expectedPeakRetained: Math.min(failureCount, collector.limit),
    };
    if (!same(vector, expected)) {
      fail(`${name} has an invalid exact bounded-collector expectation`);
    }
  }
}

function strictDecode(bytes, bomPolicy, maxDepth) {
  if (bomPolicy === "reject" && bytes.length >= 3
    && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { outcome: "rejected", diagnosticCode: "decode.invalid-json" };
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { outcome: "rejected", diagnosticCode: "decode.invalid-json" };
  }
  const scanner = createScanner(text, false);
  let depth = 0;
  for (let token = scanner.scan(); token !== SyntaxKind.EOF; token = scanner.scan()) {
    if (scanner.getTokenError() !== 0) {
      return { outcome: "rejected", diagnosticCode: "decode.invalid-json" };
    }
    if (token === SyntaxKind.OpenBraceToken || token === SyntaxKind.OpenBracketToken) {
      depth += 1;
      if (depth > maxDepth) {
        return {
          outcome: "rejected",
          diagnosticCode: "input.limit-exceeded",
          diagnosticPath: getLocation(text, scanner.getTokenOffset()).path,
          actual: maxDepth + 1,
        };
      }
    } else if (token === SyntaxKind.CloseBraceToken || token === SyntaxKind.CloseBracketToken) {
      depth -= 1;
    }
  }
  const parseErrors = [];
  visit(text, {
    onError: error => parseErrors.push(error),
  }, {
    disallowComments: true,
    allowTrailingComma: false,
    allowEmptyContent: false,
  });
  if (parseErrors.length > 0) {
    return { outcome: "rejected", diagnosticCode: "decode.invalid-json" };
  }
  const diagnosticPaths = duplicateKeyPaths(text);
  if (diagnosticPaths.length > 0) {
    return {
      outcome: "rejected",
      diagnosticCode: "decode.duplicate-key",
      diagnosticPaths,
    };
  }
  return { outcome: "accepted", text };
}

function loneSurrogateIndexes(value) {
  const indexes = [];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) {
        indexes.push(index);
        continue;
      }
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) indexes.push(index);
      else index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      indexes.push(index);
    }
  }
  return indexes;
}

function stringHasLoneSurrogate(value) {
  return loneSurrogateIndexes(value).length > 0;
}

function pathString(segments) {
  return segments.reduce((path, segment) => (
    typeof segment === "number" ? `${path}[${segment}]` : `${path}.${segment}`
  ), "$");
}

function duplicateKeyPaths(text) {
  const scopes = [];
  const paths = [];
  visit(text, {
    onObjectBegin: () => scopes.push(new Set()),
    onObjectProperty: (property, offset) => {
      const scope = scopes.at(-1);
      if (scope.has(property)) {
        const location = getLocation(text, offset);
        paths.push([...location.path.slice(0, -1), property]);
      }
      scope.add(property);
    },
    onObjectEnd: () => scopes.pop(),
  }, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  return paths;
}

function duplicateKeyFaultIdentities(text) {
  return duplicateKeyPaths(text).map(pathValue => (
    `duplicate-key:${pathString(pathValue.slice(0, -1))}:${pathValue.at(-1)}`
  ));
}

function valueFaultIdentities(value) {
  const faults = [];
  const pending = [{ value, path: [] }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current.value === "number" && Object.is(current.value, -0)) {
      faults.push(`negative-zero:${pathString(current.path)}`);
      continue;
    }
    if (typeof current.value === "string") {
      for (const index of loneSurrogateIndexes(current.value)) {
        faults.push(`lone-surrogate:${pathString(current.path)}@${index}`);
      }
      continue;
    }
    if (current.value === null || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({ value: current.value[index], path: [...current.path, index] });
      }
      continue;
    }
    const keys = Object.keys(current.value);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      for (const surrogateIndex of loneSurrogateIndexes(key)) {
        faults.push(
          `lone-surrogate-key:${pathString(current.path)}:${key}@${surrogateIndex}`,
        );
      }
      pending.push({ value: current.value[key], path: [...current.path, key] });
    }
  }
  return faults.sort(compareAscii);
}

function schemaFaultIdentities(errors) {
  return (errors ?? []).map(error => (
    `schema:${error.keyword}:${error.instancePath || "$"}:${canonicalize(error.params)}`
  )).sort(compareAscii);
}

function exactDocumentFaultIdentities(text, validateDocument) {
  const duplicateFaults = duplicateKeyFaultIdentities(text);
  const value = JSON.parse(text);
  const faults = [...duplicateFaults, ...valueFaultIdentities(value)];
  const normalized = structuredClone(value);
  const pending = [normalized];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== "object") continue;
    for (const key of Object.keys(current)) {
      const item = current[key];
      if (typeof item === "number" && Object.is(item, -0)) current[key] = 0;
      else if (typeof item === "string" && stringHasLoneSurrogate(item)) {
        current[key] = item.replace(/[\ud800-\udfff]/gu, "");
      } else if (item !== null && typeof item === "object") pending.push(item);
    }
  }
  const allowedRootKeys = normalized.kind === "get-modular.module-declaration"
    ? new Set([
      "kind", "schemaVersion", "moduleId", "implementationId", "owner", "provides", "slots",
    ])
    : undefined;
  if (allowedRootKeys !== undefined) {
    for (const key of Object.keys(normalized)) {
      if (!allowedRootKeys.has(key)) {
        faults.push(`unknown-field:$:${key}`);
        delete normalized[key];
      }
    }
  }
  if (!validateDocument(normalized)) faults.push(...schemaFaultIdentities(validateDocument.errors));
  return faults.sort(compareAscii);
}

function acceptedNegativeFaultIdentity(vector) {
  const duplicateFaults = duplicateKeyFaultIdentities(vector.rawJson);
  if (duplicateFaults.length === 1) return duplicateFaults[0];
  const value = JSON.parse(vector.rawJson);
  const valueFaults = valueFaultIdentities(value);
  if (valueFaults.length === 1) return valueFaults[0];
  if (vector.name === "unknown-field") {
    const unknownKeys = Object.keys(value).filter(key => !["kind", "schemaVersion"].includes(key));
    if (unknownKeys.length === 1) return `unknown-field:$:${unknownKeys[0]}`;
  }
  fail(`${vector.name} does not isolate one accepted canonical fault identity`);
}

function semanticDiagnosticForText(text, validateDocument) {
  const value = JSON.parse(text);
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "number" && Object.is(current, -0)) {
      return "schema.invalid-value";
    }
    if (typeof current === "string") {
      if (stringHasLoneSurrogate(current)) return "schema.invalid-value";
      continue;
    }
    if (current === null || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (const item of current) pending.push(item);
      continue;
    }
    for (const key of Object.keys(current)) {
      if (stringHasLoneSurrogate(key)) return "schema.invalid-value";
      pending.push(current[key]);
    }
  }
  if (validateDocument(value)) return undefined;
  return validateDocument.errors?.some(error => error.keyword === "additionalProperties")
    ? "schema.unknown-field"
    : "schema.invalid-value";
}

function repairedDecoderSource(vector, validateDocument) {
  if (vector.sourceEncoding !== "utf8-text"
    || typeof vector.repair?.span !== "string"
    || vector.repair.span.length === 0
    || typeof vector.repair.replacement !== "string"
    || typeof vector.repair.faultIdentity !== "string"
    || typeof vector.repairedSource !== "string") {
    fail(`${vector.name} has invalid exact repair metadata`);
  }
  if (!same(objectKeys(vector.repair, `${vector.name} repair`).sort(compareAscii), [
    "faultIdentity", "replacement", "span",
  ])) {
    fail(`${vector.name} repair metadata must bind one exact fault identity`);
  }
  const first = vector.source.indexOf(vector.repair.span);
  if (first < 0 || vector.source.indexOf(vector.repair.span, first + 1) >= 0) {
    fail(`${vector.name} repair span must occur exactly once`);
  }
  const repaired = `${vector.source.slice(0, first)}${vector.repair.replacement}`
    + vector.source.slice(first + vector.repair.span.length);
  if (repaired !== vector.repairedSource || repaired === vector.source) {
    fail(`${vector.name} repair does not produce the exact repaired bytes`);
  }
  const beforeFaults = exactDocumentFaultIdentities(vector.source, validateDocument);
  if (!same(beforeFaults, [vector.repair.faultIdentity])) {
    fail(`${vector.name} must contain exactly its one bound semantic fault before repair: ${JSON.stringify(beforeFaults)}`);
  }
  if (exactDocumentFaultIdentities(repaired, validateDocument).length !== 0) {
    fail(`${vector.name} must contain zero semantic faults after repair`);
  }
  return repaired;
}

export function validateDecoderQualification(
  vectors,
  { maxDepth = 32, validateDocument } = {},
) {
  if (vectors?.kind !== "get-modular.decoder-vectors" || vectors.vectorVersion !== 1) {
    fail("unsupported decoder qualification vectors");
  }
  if (vectors.bomPolicy !== "reject") fail("V1 decoder must reject a UTF-8 BOM");
  const names = new Set();
  for (const vector of vectors.cases ?? []) {
    if (typeof vector.name !== "string" || names.has(vector.name)) {
      fail("decoder vector names must be unique strings");
    }
    names.add(vector.name);
    if (DECODER_CATEGORY_AUTHORITY.get(vector.name) !== vector.category) {
      fail(`${vector.name} contradicts the independent decoder category authority`);
    }
    const bytes = decoderSourceBytes(vector);
    const result = strictDecode(bytes, vectors.bomPolicy, maxDepth);
    if (result.outcome !== vector.decoderOutcome
      || result.diagnosticCode !== vector.diagnosticCode) {
      fail(`${vector.name} has an invalid strict-decoder expectation`);
    }
    if (vector.name === "utf8-bom"
      && (vector.sourceEncoding !== "hex-bytes"
        || vector.source !== "efbbbf7b7d"
        || result.outcome !== "rejected"
        || result.diagnosticCode !== "decode.invalid-json")) {
      fail("UTF-8 BOM evidence must use the exact hex bytes and fatal rejection outcome");
    }
    if (vector.category?.startsWith("encoding.utf8-")
      && vector.category !== "encoding.utf8-bom") {
      if (vector.category === "encoding.utf8-valid-multibyte-control") {
        if (vector.source !== "22c2a2e282acf09f988022" || result.outcome !== "accepted") {
          fail("valid UTF-8 control must cover exact two-, three-, and four-byte scalars");
        }
      } else if (vector.category.includes("eof-truncated")) {
        const eofBytes = {
          "eof-truncated-utf8-two-byte": "22c2",
          "eof-truncated-utf8-three-byte": "22e282",
          "eof-truncated-utf8-four-byte": "22f09f98",
        }[vector.name];
        if (vector.sourceEncoding !== "hex-bytes"
          || vector.source !== eofBytes || bytes.at(-1) === 0x22
          || result.outcome !== "rejected") {
          fail(`${vector.name} is not a true EOF-truncated UTF-8 witness`);
        }
      } else if (result.outcome !== "rejected"
        || result.diagnosticCode !== "decode.invalid-json") {
        fail(`${vector.name} does not reject its malformed UTF-8 class`);
      } else {
        const malformedHex = MALFORMED_UTF8_AUTHORITY.get(vector.name);
        if (malformedHex === undefined || vector.source !== `22${malformedHex}22`) {
          fail(`${vector.name} does not isolate its authoritative malformed UTF-8 sequence`);
        }
        const scalarRepair = Buffer.concat([
          bytes.subarray(0, 1), Buffer.from("c2a2", "hex"), bytes.subarray(bytes.length - 1),
        ]);
        if (strictDecode(scalarRepair, vectors.bomPolicy, maxDepth).outcome !== "accepted") {
          fail(`${vector.name} is not otherwise-valid JSON after one valid-scalar repair`);
        }
      }
    }
    if (vector.semanticDiagnosticCode !== undefined) {
      if (result.outcome !== "accepted" || typeof validateDocument !== "function") {
        fail(`${vector.name} cannot execute semantic decoder qualification`);
      }
      const actualSemanticCode = semanticDiagnosticForText(result.text, validateDocument);
      if (actualSemanticCode !== vector.semanticDiagnosticCode) {
        fail(`${vector.name} has an invalid semantic diagnostic expectation`);
      }
    }
    if (vector.repair !== undefined || vector.repairedSource !== undefined) {
      const repairedSource = repairedDecoderSource(vector, validateDocument);
      const repaired = strictDecode(
        Buffer.from(repairedSource, "utf8"),
        vectors.bomPolicy,
        maxDepth,
      );
      if (repaired.outcome !== "accepted" || typeof validateDocument !== "function"
        || semanticDiagnosticForText(repaired.text, validateDocument) !== undefined) {
        fail(`${vector.name} exact repair is not a complete valid V1 document`);
      }
    } else if (vector.semanticDiagnosticCode !== undefined) {
      fail(`${vector.name} semantic evidence has no exact valid repair`);
    }
  }
  if (names.size !== DECODER_CATEGORY_AUTHORITY.size) {
    fail("decoder qualification does not cover the closed category authority");
  }
  validateCaseTupleAuthority(
    vectors,
    decoderCaseAuthorityRecord,
    DECODER_CASE_TUPLES_SHA256,
    "decoder case",
  );
}

export function validateCanonicalizationQualification(vectors) {
  if (!Array.isArray(vectors.cases) || vectors.cases.length < 5) {
    fail("canonicalization qualification requires edge vectors");
  }
  validateCaseTupleAuthority(
    vectors,
    canonicalCaseAuthorityRecord,
    CANONICAL_CASE_TUPLES_SHA256,
    "canonicalization case",
  );
  const names = new Set();
  for (const vector of vectors.cases) {
    if (typeof vector.name !== "string" || names.has(vector.name)) {
      fail("canonicalization vector names must be unique strings");
    }
    names.add(vector.name);
    if (CANONICAL_CATEGORY_AUTHORITY.get(vector.name) !== vector.category) {
      fail(`${vector.name} contradicts the independent canonical category authority`);
    }
    assertCanonical(vector.value, vector.canonicalUtf8, vector.name);
    if (vector.name === "object-key-order"
      && JSON.stringify(vector.value) === vector.canonicalUtf8) {
      fail("object-key-order input is already in canonical property order");
    }
  }
  if (names.size !== CANONICAL_CATEGORY_AUTHORITY.size) {
    fail("canonicalization qualification does not cover the closed category authority");
  }
}
