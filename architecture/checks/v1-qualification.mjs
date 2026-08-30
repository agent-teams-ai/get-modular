import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import Ajv2020 from "ajv/dist/2020.js";
import canonicalize from "canonicalize";
import { canonicalize as canonicalizeOracle } from "json-canonicalize";
import { createScanner, SyntaxKind, visit } from "jsonc-parser";

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const QUALIFICATION_PATH = /^architecture\/qualification\/v1\/[a-z0-9.-]+\.json$/u;
const PATH_POLICIES = new Set(["empty", "structural", "limit-specific"]);
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

function validateClosedManifestSection({
  section,
  vectors,
  digestField,
  bytesForVector,
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
  validateClosedManifestSection({
    section: manifest.decoder,
    vectors: decoderVectors,
    digestField: "sourceBytesSha256",
    bytesForVector: decoderSourceBytes,
    label: "decoder",
  });
  validateClosedManifestSection({
    section: manifest.canonicalization,
    vectors: canonicalizationVectors,
    digestField: "canonicalUtf8BytesSha256",
    bytesForVector: vector => Buffer.from(vector.canonicalUtf8, "utf8"),
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
      .sort(compareAscii), ["canonicalUtf8BytesSha256", "category", "name"])) {
      fail(`${entry.name} has an invalid canonical-byte binding shape`);
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
      "acceptedName",
      "decoderCase",
      "diagnosticCode",
    ]) || mapping.diagnosticCode !== accepted.diagnosticCode) {
      fail(`${accepted.name} has an invalid successor mapping`);
    }
    const successor = decoderByName.get(mapping.decoderCase);
    const successorCode = successor?.diagnosticCode ?? successor?.semanticDiagnosticCode;
    if (successor === undefined || mappedCases.has(successor.name)
      || successorCode !== accepted.diagnosticCode
      || successor.repair === undefined
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
        order: valueDifference,
      };
    }
  }
  return {
    axis: "path.length",
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
    evidenceAxes: COMPARATOR_EVIDENCE_AXES,
  })) {
    fail("diagnostic comparator policy is not the closed normative policy");
  }
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

  const orderingCases = snapshots.orderingCases ?? [];
  exactStringSet(orderingCases.map(orderingCase => orderingCase.axis),
    COMPARATOR_EVIDENCE_AXES, "diagnostic comparator evidence axes");
  const orderingNames = new Set();
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

  const sccCases = snapshots.sccOrderingCases ?? [];
  if (sccCases.length !== 1 || sccCases[0].name !== "multiple-disjoint-components") {
    fail("SCC ordering evidence must contain the one closed multi-component case");
  }
  for (const sccCase of sccCases) {
    const input = sccCase.input ?? [];
    if (input.length < 4 || !input.some(component => component.length === 1)
      || !input.some(component => component.length > 1)) {
      fail(`${sccCase.name} lacks self-cycle and multi-member SCC evidence`);
    }
    const serialized = new Set();
    const allMembers = new Set();
    for (const [index, component] of input.entries()) {
      const diagnostic = {
        code: "graph.cycle",
        phase: "graph",
        path: [],
        coordinate: {},
        details: { component },
      };
      validateWith(validateDiagnostic, diagnostic, `${sccCase.name}.input[${index}]`);
      validateDiagnosticAgainstContract(
        diagnostic,
        contract,
        variantByCode,
        `${sccCase.name}.input[${index}]`,
      );
      const key = JSON.stringify(component);
      if (serialized.has(key)) fail(`${sccCase.name} contains a duplicate SCC`);
      serialized.add(key);
      for (const member of component) {
        if (allMembers.has(member)) {
          fail(`${sccCase.name} SCC components must be disjoint`);
        }
        allMembers.add(member);
      }
    }
    if (!same([...sccCase.expected].sort(compareStringArrays), sccCase.expected)
      || !same([...input].sort(compareStringArrays), sccCase.expected)) {
      fail(`${sccCase.name} has an invalid deterministic SCC-array order`);
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

function stringHasLoneSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
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

function repairedDecoderSource(vector) {
  if (vector.sourceEncoding !== "utf8-text"
    || typeof vector.repair?.span !== "string"
    || vector.repair.span.length === 0
    || typeof vector.repair.replacement !== "string"
    || typeof vector.repairedSource !== "string") {
    fail(`${vector.name} has invalid exact repair metadata`);
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
    const bytes = decoderSourceBytes(vector);
    const result = strictDecode(bytes, vectors.bomPolicy, maxDepth);
    if (result.outcome !== vector.decoderOutcome
      || result.diagnosticCode !== vector.diagnosticCode) {
      fail(`${vector.name} has an invalid strict-decoder expectation`);
    }
    if (vector.category?.startsWith("encoding.utf8-")
      && vector.category !== "encoding.utf8-bom") {
      if (bytes[0] !== 0x22 || bytes.at(-1) !== 0x22) {
        fail(`${vector.name} must exercise UTF-8 inside an otherwise-valid JSON string`);
      }
      if (vector.category === "encoding.utf8-valid-multibyte-control") {
        if (vector.source !== "22c2a2e282acf09f988022" || result.outcome !== "accepted") {
          fail("valid UTF-8 control must cover exact two-, three-, and four-byte scalars");
        }
      } else if (result.outcome !== "rejected"
        || result.diagnosticCode !== "decode.invalid-json") {
        fail(`${vector.name} does not reject its malformed UTF-8 class`);
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
      const repairedSource = repairedDecoderSource(vector);
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
