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
  "output.canonicalization-failed": "empty",
  "diagnostics.truncated": "empty",
});
const LIMIT_PATH_POLICY_AUTHORITY = Object.freeze({
  rawDocumentBytes: "empty",
  aggregateRawBytes: "empty",
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
  "coordinate.moduleId.presence",
  "coordinate.moduleId.value",
  "coordinate.implementationId.presence",
  "coordinate.implementationId.value",
  "coordinate.slotId.presence",
  "coordinate.slotId.value",
  "coordinate.providerImplementationId.presence",
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
  if (ledger?.schemaVersion !== 1 || ledger.algorithm !== "sha256-bytes") {
    fail("unsupported V1 qualification ledger");
  }
  const ids = new Set();
  const paths = [];
  for (const artifact of ledger.artifacts ?? []) {
    if (typeof artifact?.id !== "string" || ids.has(artifact.id)) {
      fail("qualification artifact IDs must be unique strings");
    }
    ids.add(artifact.id);
    if (!QUALIFICATION_PATH.test(artifact.path ?? "")) {
      fail(`${artifact.id} has an invalid qualification path`);
    }
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

export function validateQualificationCaseManifest({
  manifest,
  decoderVectors,
  canonicalizationVectors,
  acceptedCanonicalVectors,
}) {
  if (manifest?.kind !== "get-modular.qualification-case-manifest"
    || manifest.manifestVersion !== 1
    || !same(objectKeys(manifest, "qualification case manifest").sort(compareAscii), [
      "acceptedCanonicalNegativeSuccessors",
      "canonicalization",
      "decoder",
      "kind",
      "manifestVersion",
    ])) {
    fail("unsupported qualification case manifest");
  }
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
  return { validateDocument, validateDiagnostic };
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

function validateDiagnosticAgainstContract(diagnostic, contract, variantByCode, label) {
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
  const pathPolicy = pathPolicyFor(diagnostic, contract);
  if (pathPolicy === "empty" && diagnostic.path.length !== 0) {
    fail(`${label} must use an empty path`);
  }
  if (pathPolicy === "structural" && diagnostic.path.length === 0) {
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
    order: Buffer.compare(
      canonicalDetailBytes(left.details, "left diagnostic"),
      canonicalDetailBytes(right.details, "right diagnostic"),
    ),
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
    return Buffer.compare(
      canonicalDetailBytes(left.details, "left diagnostic"),
      canonicalDetailBytes(right.details, "right diagnostic"),
    );
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
  exactStringSet(Object.keys(contract.pathPolicyByCode), catalog.ordering.codes,
    "diagnostic path policies");
  if (!same(contract.pathPolicyByCode, PATH_POLICY_AUTHORITY)) {
    fail("diagnostic code path policies contradict the independent authority");
  }
  exactStringSet(Object.keys(contract.limitPhases), Object.keys(profile.limits),
    "diagnostic limit phases");
  exactStringSet(Object.keys(contract.limitPathPolicies), Object.keys(profile.limits),
    "diagnostic limit path policies");
  if (!same(contract.limitPathPolicies, LIMIT_PATH_POLICY_AUTHORITY)) {
    fail("diagnostic limit path policies contradict the independent authority");
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
  exactStringSet(variants.map(variant => variant.code), catalog.ordering.codes,
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
  exactStringSet(snapshotCodes, catalog.ordering.codes, "diagnostic snapshots");

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
    || !same(adjacency.codes, adjacentPairs(CODE_ORDER_AUTHORITY))) {
    fail("diagnostic rank adjacency does not cover every adjacent rank");
  }
  const diagnosticByCode = new Map(
    [...snapshotByName.values()].map(diagnostic => [diagnostic.code, diagnostic]),
  );
  const diagnosticByPhase = new Map(PHASE_ORDER_AUTHORITY.map(phase => [
    phase,
    CODE_ORDER_AUTHORITY
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
    executeAdjacentComparison(
      diagnosticByCode.get(leftCode),
      diagnosticByCode.get(rightCode),
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
  return result;
}

function normalizedProfileBindings(profile, declarations) {
  const declarationsByImplementation = new Map(
    declarations.map(declaration => [declaration.implementationId, declaration]),
  );
  return profile.bindings.map(binding => {
    const declaration = declarationsByImplementation.get(binding.consumerImplementationId);
    const slot = declaration?.slots.find(candidate => candidate.slotId === binding.slotId);
    if (slot === undefined) fail("normalization vector references an unknown slot");
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
    for (const order of vector.declarationOrders) {
      exactStringSet(order, implementationIds, `${vector.name} declaration permutation`);
    }
    for (const profile of vector.equivalentProfiles) {
      validateWith(validateDocument, profile, `${vector.name} profile`);
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
    if (vector.phase !== contract.limitPhases[vector.limitName]) {
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
        return { outcome: "rejected", diagnosticCode: "input.limit-exceeded" };
      }
    } else if (token === SyntaxKind.CloseBraceToken || token === SyntaxKind.CloseBracketToken) {
      depth -= 1;
    }
  }
  const objectKeyStack = [];
  let duplicate = false;
  const parseErrors = [];
  visit(text, {
    onObjectBegin: () => objectKeyStack.push(new Set()),
    onObjectProperty: property => {
      const keys = objectKeyStack.at(-1);
      if (keys.has(property)) duplicate = true;
      keys.add(property);
    },
    onObjectEnd: () => objectKeyStack.pop(),
    onError: error => parseErrors.push(error),
  }, {
    disallowComments: true,
    allowTrailingComma: false,
    allowEmptyContent: false,
  });
  if (parseErrors.length > 0) {
    return { outcome: "rejected", diagnosticCode: "decode.invalid-json" };
  }
  if (duplicate) {
    return { outcome: "rejected", diagnosticCode: "decode.duplicate-key" };
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

function duplicateKeyFaultIdentities(text) {
  const scopes = [];
  const faults = [];
  visit(text, {
    onObjectBegin: () => scopes.push(new Set()),
    onObjectProperty: (property, offset) => {
      const scope = scopes.at(-1);
      if (scope.has(property)) {
        const location = getLocation(text, offset);
        faults.push(`duplicate-key:${pathString(location.path.slice(0, -1))}:${property}`);
      }
      scope.add(property);
    },
    onObjectEnd: () => scopes.pop(),
  }, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  return faults;
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
