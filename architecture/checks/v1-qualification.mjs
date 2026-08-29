import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import Ajv2020 from "ajv/dist/2020.js";
import canonicalize from "canonicalize";
import { canonicalize as canonicalizeOracle } from "json-canonicalize";
import { createScanner, SyntaxKind, visit } from "jsonc-parser";

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const QUALIFICATION_PATH = /^architecture\/qualification\/v1\/[a-z0-9.-]+\.json$/u;
const PATH_POLICIES = new Set(["empty", "structural", "limit-specific"]);

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
  return policy === "limit-specific"
    ? contract.limitPathPolicies[diagnostic.details.limitName]
    : policy;
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
  if (diagnostic.code === "graph.cycle"
    && !same(diagnostic.details.component, [...diagnostic.details.component].sort(compareAscii))) {
    fail(`${label} cycle component is not normalized`);
  }
}

function comparePath(left, right) {
  const kindRank = new Map([["field", 0], ["index", 1]]);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];
    const kindDifference = kindRank.get(leftSegment.kind) - kindRank.get(rightSegment.kind);
    if (kindDifference !== 0) return kindDifference;
    const valueDifference = leftSegment.kind === "field"
      ? compareAscii(leftSegment.value, rightSegment.value)
      : leftSegment.value - rightSegment.value;
    if (valueDifference !== 0) return valueDifference;
  }
  return left.length - right.length;
}

function diagnosticComparator(contract, catalog) {
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
    const pathDifference = comparePath(left.path, right.path);
    if (pathDifference !== 0) return pathDifference;
    return Buffer.compare(
      Buffer.from(canonicalize(left.details), "utf8"),
      Buffer.from(canonicalize(right.details), "utf8"),
    );
  };
}

export function validateDiagnosticQualification({
  contract,
  snapshots,
  catalog,
  profile,
  coordinateFields,
  validateDiagnostic,
}) {
  exactStringSet(contract.coordinateFieldOrder, coordinateFields,
    "diagnostic coordinate order");
  exactStringSet(Object.keys(contract.pathPolicyByCode), catalog.ordering.codes,
    "diagnostic path policies");
  exactStringSet(Object.keys(contract.limitPhases), Object.keys(profile.limits),
    "diagnostic limit phases");
  exactStringSet(Object.keys(contract.limitPathPolicies), Object.keys(profile.limits),
    "diagnostic limit path policies");
  for (const policy of Object.values(contract.pathPolicyByCode)) {
    if (!PATH_POLICIES.has(policy)) fail(`unknown diagnostic path policy ${policy}`);
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

  const compare = diagnosticComparator(contract, catalog);
  for (const orderingCase of snapshots.orderingCases ?? []) {
    const inline = new Map(Object.entries(orderingCase.diagnostics ?? {}));
    const entries = orderingCase.input.map(name => {
      const diagnostic = inline.get(name) ?? snapshotByName.get(name);
      if (diagnostic === undefined) fail(`${orderingCase.name} references unknown snapshot ${name}`);
      validateWith(validateDiagnostic, diagnostic, `${orderingCase.name}.${name}`);
      validateDiagnosticAgainstContract(
        diagnostic,
        contract,
        variantByCode,
        `${orderingCase.name}.${name}`,
      );
      return { name, diagnostic };
    });
    const ordered = entries.toSorted((left, right) => compare(left.diagnostic, right.diagnostic));
    if (!same(ordered.map(entry => entry.name), orderingCase.expected)) {
      fail(`${orderingCase.name} has an invalid expected diagnostic order`);
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

export function validateResourceBoundaryQualification({ vectors, profile, contract }) {
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
  const invalidRange = semanticByName.get("many-min-cannot-exceed-max").cardinality;
  if (invalidRange.min <= invalidRange.max) fail("invalid many range vector is not invalid");
  const providers = semanticByName.get(
    "provider-ids-are-unique-within-one-binding",
  ).providerImplementationIds;
  if (new Set(providers).size === providers.length) {
    fail("duplicate provider vector contains no duplicate");
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
  return { outcome: "accepted" };
}

export function validateDecoderQualification(vectors, { maxDepth = 32 } = {}) {
  if (vectors.bomPolicy !== "reject") fail("V1 decoder must reject a UTF-8 BOM");
  const names = new Set();
  for (const vector of vectors.cases ?? []) {
    if (typeof vector.name !== "string" || names.has(vector.name)) {
      fail("decoder vector names must be unique strings");
    }
    names.add(vector.name);
    let bytes;
    if (vector.sourceEncoding === "utf8-text") {
      bytes = new TextEncoder().encode(vector.source);
    } else if (vector.sourceEncoding === "hex-bytes"
      && /^(?:[a-f0-9]{2})*$/u.test(vector.source)) {
      bytes = Uint8Array.from(Buffer.from(vector.source, "hex"));
    } else {
      fail(`${vector.name} has an invalid source encoding`);
    }
    const result = strictDecode(bytes, vectors.bomPolicy, maxDepth);
    if (result.outcome !== vector.decoderOutcome
      || result.diagnosticCode !== vector.diagnosticCode) {
      fail(`${vector.name} has an invalid strict-decoder expectation`);
    }
  }
  if (names.size < 12) fail("decoder qualification lacks adversarial coverage");
}

export function validateCanonicalizationQualification(vectors) {
  if (!Array.isArray(vectors.cases) || vectors.cases.length < 5) {
    fail("canonicalization qualification requires edge vectors");
  }
  const names = new Set();
  for (const vector of vectors.cases) {
    if (typeof vector.name !== "string" || names.has(vector.name)) {
      fail("canonicalization vector names must be unique strings");
    }
    names.add(vector.name);
    assertCanonical(vector.value, vector.canonicalUtf8, vector.name);
  }
}
