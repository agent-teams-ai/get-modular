import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import {
  createDiagnosticComparator,
  createSchemaValidators,
} from "./v1-qualification.mjs";

const LEDGER = "architecture/authority/implementation-clarifications-ledger.json";
const ADR = "docs/decisions/0018-close-implementation-readiness-rules.md";
const DIRECTORY = "architecture/qualification/implementation-clarifications";
const CONTRACT = `${DIRECTORY}/contract.json`;
const CASES = `${DIRECTORY}/cases.json`;
const SCHEMA = "architecture/contracts/v1/composition.schema.json";
const CATALOG = "architecture/contracts/v1/diagnostic-catalog.json";
const DIAGNOSTICS = "architecture/qualification/v1/diagnostic-contract.json";
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const NUMBER = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?)([0-9]+))?$/u;

const EXPECTED_CONTRACT = {
  graphDepth: {
    sourceGraph: "selected-nodes-and-wholly-valid-binding-edges",
    prerequisites: ["graph.selected-node-census-complete", "graph.positive-edge-subgraph-complete"],
    measurement: "induced-dag-after-removing-cyclic-scc-nodes-and-incident-edges",
    emptyResidual: "no-depth-limit-candidate",
    limit: 2048,
    actualMaximum: 2049,
    cycleDiagnostics: "preserved",
    unreachableNodes: "included",
    factAdditions: [],
  },
  rawNumbers: {
    meaning: "exact-mathematical-safe-integer-before-number-conversion",
    minimum: "-9007199254740991",
    maximum: "9007199254740991",
    negativeZero: "reject-all-spellings",
    integerSpellings: ["integer", "decimal", "exponent"],
    nonIntegerReason: "invalid-type",
    outOfRangeOrNegativeZeroReason: "invalid-format",
    diagnosticCode: "schema.invalid-value",
    phase: "schema",
    objectMeaning: "supplied-number-value",
    exposure: "M2-after-OD-005-and-OD-006",
    unboundedBigInt: "forbidden",
    exponentExpansion: "forbidden",
  },
  diagnosticTypes: {
    publicCodeType: "Diagnostic['code']",
    members: "effective-emittable-codes-in-catalog-order",
    reserved: "excluded",
    additionalRootExports: [],
    internalFailure: "reject-promise",
  },
  carrierTrust: {
    objectGraph: "trusted-cooperative-host-data",
    rawWrapperAndList: "trusted-cooperative-host-data",
    rawPayload: "untrusted-bytes-after-carrier-admission",
    ownedSnapshot: "synchronous-before-async-no-retained-aliases",
    bounded: "compiler-owned-work-and-retained-model",
    excludedGuarantees: [
      "intrinsic-reflection-temporary-allocation", "caller-owned-heap", "arbitrary-proxy-traps",
      "fixed-wall-time", "process-wide-heap-ceiling",
    ],
    rawByteLimits: "before-copy-and-decode",
    "OD-005": "open",
  },
  publication: {
    preM3: "complete-M1-and-packed-Node-TypeScript",
    postM3: "packed-Node-TypeScript-and-complete-M3",
    M3: [
      "P0-P1", "W0-W1", "static-witness", "behavioral-witness",
      "independent-vectors-both-subjects", "clean-and-poisoned-bootstrap",
      "no-concrete-fallback", "no-caller-time-bootstrap", "generated-only-closure",
    ],
    runtimeMatrix: "runtime-conformant-and-release-eligible",
    custody: "separate-accepted-authority",
    archive: "pack-once-same-bytes-and-registry-read-back",
    claim: "not-claimed",
  },
};

function fail(message) {
  throw new Error(`IMPLEMENTATION_CLARIFICATIONS_CHECK_FAILED: ${message}`);
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort())) {
    fail(`${label} has an invalid closed shape`);
  }
}

const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const json = async (readBytes, path) => JSON.parse((await readBytes(path)).toString("utf8"));

async function validateCustody(readBytes, listedPaths) {
  if (!Array.isArray(listedPaths) || new Set(listedPaths).size !== listedPaths.length) {
    fail("fixture directory listing must contain unique paths");
  }
  if (!isDeepStrictEqual([...listedPaths].sort(), [CASES, CONTRACT])) {
    fail("fixture directory must contain exactly the declared JSON artifacts");
  }
  const ledgerBytes = await readBytes(LEDGER);
  const ledger = JSON.parse(ledgerBytes.toString("utf8"));
  exactKeys(ledger, ["algorithm", "artifacts", "schemaVersion"], "clarification ledger");
  if (ledger.schemaVersion !== 1 || ledger.algorithm !== "sha256-bytes"
    || !Array.isArray(ledger.artifacts) || ledger.artifacts.length !== 2) {
    fail("unsupported clarification ledger");
  }
  const ids = new Set();
  const paths = [];
  for (const artifact of ledger.artifacts) {
    exactKeys(artifact, ["id", "immutableDigest", "path"], "clarification artifact");
    if (typeof artifact.id !== "string" || artifact.id.length === 0 || ids.has(artifact.id)) {
      fail("clarification artifact IDs must be unique non-empty strings");
    }
    ids.add(artifact.id);
    if (![CONTRACT, CASES].includes(artifact.path) || paths.includes(artifact.path)) {
      fail("clarification artifact paths must be the closed unique fixture paths");
    }
    if (!SHA256.test(artifact.immutableDigest ?? "")) fail(`${artifact.id} has an invalid digest`);
    if (digest(await readBytes(artifact.path)) !== artifact.immutableDigest) {
      fail(`${artifact.id} differs from the clarification ledger`);
    }
    paths.push(artifact.path);
  }
  if (!isDeepStrictEqual(paths.sort(), [CASES, CONTRACT])) {
    fail("clarification ledger does not bind both fixture artifacts");
  }
  const anchor = `The implementation clarification ledger \`${LEDGER}\` is anchored as \`${digest(ledgerBytes)}\`.`;
  if (!(await readBytes(ADR)).toString("utf8").includes(anchor)) {
    fail("ADR-0018 is missing the exact clarification ledger anchor");
  }
}

function validateContract(contract) {
  exactKeys(contract, [
    "authority", "carrierTrust", "diagnosticTypes", "graphDepth", "kind", "publication",
    "rawNumbers", "scope", "unchanged",
  ], "clarification contract");
  if (contract.kind !== "get-modular.implementation-clarifications"
    || contract.authority !== "ADR-0018"
    || contract.scope !== "additive-fixed-rules-no-runtime-profile") {
    fail("clarification contract identity changed");
  }
  for (const [name, expected] of Object.entries(EXPECTED_CONTRACT)) {
    if (!isDeepStrictEqual(contract[name], expected)) fail(`${name} closed choice changed`);
  }
  if (!isDeepStrictEqual(contract.unchanged, [
    "base-schema", "catalog-and-code-rank", "seventeen-facts", "resource-profile",
    "OD-005", "OD-006", "M1-owner-start-scope",
  ])) fail("unchanged authority set changed");
}

function validateAcceptedLinks(contract, catalog, diagnosticContract) {
  const depth = diagnosticContract?.prerequisiteCatalog?.limits
    ?.find(limit => limit.limitName === "graphDepth");
  const cycle = diagnosticContract?.prerequisiteCatalog?.diagnostics
    ?.find(diagnostic => diagnostic.code === "graph.cycle");
  if (!isDeepStrictEqual(depth?.prerequisites, contract.graphDepth.prerequisites)
    || !isDeepStrictEqual(cycle?.prerequisites, contract.graphDepth.prerequisites)) {
    fail("graph depth and cycle prerequisites differ from immutable qualification evidence");
  }
  const disposition = diagnosticContract?.codeDisposition;
  const catalogCodes = catalog?.ordering?.codes;
  if (!Array.isArray(catalogCodes)
    || disposition?.policy !== "closed-ordered-partition-of-immutable-base-catalog"
    || !isDeepStrictEqual(disposition.reservedNonEmittable, ["output.canonicalization-failed"])
    || !isDeepStrictEqual(
      disposition.emittable,
      catalogCodes.filter(code => !disposition.reservedNonEmittable.includes(code)),
    )) {
    fail("diagnostic disposition is not the immutable catalog partition");
  }
}

function saturatedExponent(sign, digits) {
  const significant = digits.replace(/^0+/u, "") || "0";
  if (significant.length > 3) return sign === "-" ? -1000 : 1000;
  const value = Number(significant);
  return sign === "-" ? -value : value;
}

export function projectRawNumber(lexeme) {
  const match = NUMBER.exec(lexeme);
  if (match === null) fail(`raw-number fixture is not valid JSON number syntax: ${lexeme}`);
  const [, sign, integer, fraction = "", exponentSign = "+", exponentDigits = "0"] = match;
  const mantissa = `${integer}${fraction}`;
  if (mantissa.length > 64) fail("raw-number oracle mantissa exceeds its 64-digit evidence bound");
  const nonzero = mantissa.replace(/^0+/u, "");
  if (nonzero.length === 0) {
    return sign === "-"
      ? { admitted: false, code: "schema.invalid-value", reason: "invalid-format" }
      : { admitted: true, value: 0 };
  }
  const decimalShift = saturatedExponent(exponentSign, exponentDigits) - fraction.length;
  const trailingZeros = /0+$/u.exec(nonzero)?.[0].length ?? 0;
  if (decimalShift < 0 && trailingZeros < -decimalShift) {
    return { admitted: false, code: "schema.invalid-value", reason: "invalid-type" };
  }
  const normalizedDigits = decimalShift < 0 ? nonzero.slice(0, decimalShift) : nonzero;
  const appendedZeros = decimalShift > 0 ? decimalShift : 0;
  const integerLength = normalizedDigits.length + appendedZeros;
  const maximum = 9007199254740991n;
  if (integerLength > 16) {
    return { admitted: false, code: "schema.invalid-value", reason: "invalid-format" };
  }
  const magnitude = BigInt(normalizedDigits) * (10n ** BigInt(appendedZeros));
  if (magnitude > maximum) {
    return { admitted: false, code: "schema.invalid-value", reason: "invalid-format" };
  }
  const value = Number(sign === "-" ? -magnitude : magnitude);
  return { admitted: true, value };
}

function materialize(recipe) {
  const names = [];
  if (recipe.cycle === "pair") names.push("a", "b");
  if (recipe.cycle === "self") names.push("a");
  for (let index = 1; index <= recipe.chainLength; index += 1) {
    names.push(`n${String(index).padStart(4, "0")}`);
  }
  const edges = [];
  if (recipe.cycle === "pair") edges.push(["a", "b"], ["b", "a"]);
  if (recipe.cycle === "self") edges.push(["a", "a"]);
  for (let index = 2; index <= recipe.chainLength; index += 1) {
    edges.push([`n${String(index).padStart(4, "0")}`, `n${String(index - 1).padStart(4, "0")}`]);
  }
  const last = `n${String(recipe.chainLength).padStart(4, "0")}`;
  if (recipe.attachment === "cycle-consumes-chain") edges.push(["a", last]);
  if (recipe.attachment === "chain-consumes-cycle") edges.push(["n0001", "a"]);
  const outgoing = new Map(names.map(name => [name, []]));
  for (const edge of edges) outgoing.get(edge[0]).push(edge[1]);
  const compatibility = { family: "exact", familyVersion: 1, token: "example/link" };
  const declarations = names.map(name => ({
    kind: "get-modular.module-declaration", schemaVersion: 1,
    moduleId: `example/${name}`, implementationId: `example/${name}/default`,
    owner: { authority: "example", path: ["depth"] },
    provides: [{ capabilityId: "example/link", compatibility }],
    slots: outgoing.get(name).map((provider, index) => ({
      slotId: `d${index}`, capabilityId: "example/link", compatibility,
      cardinality: { kind: "required" },
    })),
  }));
  const bindings = [];
  for (const consumer of names) outgoing.get(consumer).forEach((provider, index) => bindings.push({
    consumerImplementationId: `example/${consumer}/default`, slotId: `d${index}`,
    providerImplementationIds: [`example/${provider}/default`],
  }));
  const roots = [];
  if (recipe.cycle !== "none") roots.push("example/a");
  if (recipe.chainLength > 0) roots.push(`example/${last}`);
  const profile = {
    kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "example/depth",
    roots,
    selections: names.map(name => ({
      moduleId: `example/${name}`, implementationId: `example/${name}/default`,
    })),
    bindings,
  };
  return { names, edges, declarations, profile };
}

function validateRecipe(recipe, label) {
  exactKeys(recipe, ["attachment", "chainLength", "cycle"], `${label} recipe`);
  if (!Number.isSafeInteger(recipe.chainLength) || recipe.chainLength < 0
    || recipe.chainLength > 2049 || !["none", "pair", "self"].includes(recipe.cycle)
    || !["none", "cycle-consumes-chain", "chain-consumes-cycle"].includes(recipe.attachment)) {
    fail(`${label} has an invalid bounded graph recipe`);
  }
  if (recipe.attachment !== "none" && (recipe.cycle === "none" || recipe.chainLength === 0)) {
    fail(`${label} attachment endpoints do not exist`);
  }
}

function deriveGraph(declarations, profile, label) {
  const names = declarations.map(declaration => declaration.moduleId.slice("example/".length));
  const selected = new Set(profile.selections.map(selection => selection.implementationId));
  const slots = new Set();
  const edges = profile.bindings.map(binding => {
    if (binding.providerImplementationIds.length !== 1) fail(`${label} binding must have one provider`);
    const key = `${binding.consumerImplementationId}\0${binding.slotId}`;
    if (slots.has(key)) fail(`${label} repeats a consumer slot`);
    slots.add(key);
    const provider = binding.providerImplementationIds[0];
    if (!selected.has(binding.consumerImplementationId) || !selected.has(provider)) {
      fail(`${label} binding endpoint is not selected`);
    }
    return [binding.consumerImplementationId, provider]
      .map(id => id.slice("example/".length, -"/default".length));
  });
  return { names, edges };
}

function cyclicNodesAndComponents(names, edges) {
  const forward = new Map(names.map(name => [name, []]));
  const reverse = new Map(names.map(name => [name, []]));
  for (const [from, to] of edges) { forward.get(from).push(to); reverse.get(to).push(from); }
  const visited = new Set();
  const finish = [];
  for (const root of names) {
    if (visited.has(root)) continue;
    visited.add(root);
    const stack = [[root, 0]];
    while (stack.length > 0) {
      const frame = stack.at(-1);
      const neighbors = forward.get(frame[0]);
      if (frame[1] < neighbors.length) {
        const next = neighbors[frame[1]++];
        if (!visited.has(next)) { visited.add(next); stack.push([next, 0]); }
      } else { finish.push(frame[0]); stack.pop(); }
    }
  }
  visited.clear();
  const components = [];
  for (const root of finish.reverse()) {
    if (visited.has(root)) continue;
    const component = [];
    const stack = [root];
    visited.add(root);
    while (stack.length > 0) {
      const node = stack.pop(); component.push(node);
      for (const next of reverse.get(node)) if (!visited.has(next)) { visited.add(next); stack.push(next); }
    }
    if (component.length > 1 || forward.get(component[0]).includes(component[0])) {
      components.push(component.sort());
    }
  }
  return components;
}

function graphOracle(materialized) {
  const components = cyclicNodesAndComponents(materialized.names, materialized.edges);
  const cyclic = new Set(components.flat());
  const residual = materialized.names.filter(name => !cyclic.has(name));
  const incoming = new Map(residual.map(name => [name, 0]));
  const next = new Map(residual.map(name => [name, []]));
  for (const [consumer, provider] of materialized.edges) {
    if (cyclic.has(consumer) || cyclic.has(provider)) continue;
    next.get(provider).push(consumer);
    incoming.set(consumer, incoming.get(consumer) + 1);
  }
  const depth = new Map(residual.map(name => [name, 1]));
  const queue = residual.filter(name => incoming.get(name) === 0);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const node = queue[cursor];
    for (const consumer of next.get(node)) {
      depth.set(consumer, Math.max(depth.get(consumer), depth.get(node) + 1));
      incoming.set(consumer, incoming.get(consumer) - 1);
      if (incoming.get(consumer) === 0) queue.push(consumer);
    }
  }
  const diagnostics = [];
  const maximum = residual.length === 0 ? 0 : Math.max(...depth.values());
  if (maximum > 2048) diagnostics.push({
    code: "input.limit-exceeded", phase: "graph", path: [], coordinate: {},
    details: { limitName: "graphDepth", limit: 2048, actual: 2049 },
  });
  for (const component of components) diagnostics.push({
    code: "graph.cycle", phase: "graph", path: [], coordinate: {},
    details: { component: component.map(name => `example/${name}/default`) },
  });
  return { ok: false, diagnostics };
}

function permute(values, permutation) {
  if (permutation === "identity") return [...values];
  if (permutation === "reverse-declarations-selections-bindings-roots") return [...values].reverse();
  if (permutation === "rotate-declarations-selections-bindings-roots-by-one") {
    return values.length < 2 ? [...values] : [...values.slice(1), values[0]];
  }
  fail(`unknown graph permutation ${permutation}`);
}

function validateGraphCases(cases, validators, compare) {
  const expectedRecipes = new Map(Object.entries({
    "independent-over": { chainLength: 2049, cycle: "pair", attachment: "none" },
    "independent-at": { chainLength: 2048, cycle: "pair", attachment: "none" },
    "attached-over": { chainLength: 2049, cycle: "pair", attachment: "cycle-consumes-chain" },
    "tail-over": { chainLength: 2049, cycle: "pair", attachment: "chain-consumes-cycle" },
    "chain-over": { chainLength: 2049, cycle: "none", attachment: "none" },
    "cycle-only": { chainLength: 0, cycle: "pair", attachment: "none" },
    "self-cycle-only": { chainLength: 0, cycle: "self", attachment: "none" },
    "attached-at": { chainLength: 2048, cycle: "pair", attachment: "cycle-consumes-chain" },
  }));
  if (!isDeepStrictEqual(cases.graphCases.map(fixture => fixture.id), [...expectedRecipes.keys()])) {
    fail("graph cases must contain the fixed ordered evidence set");
  }
  for (const fixture of cases.graphCases) {
    exactKeys(fixture, ["entryPoint", "expected", "id", "recipe", "scope"], `graph case ${fixture.id}`);
    validateRecipe(fixture.recipe, fixture.id);
    if (!isDeepStrictEqual(fixture.recipe, expectedRecipes.get(fixture.id))) {
      fail(`${fixture.id} recipe changed`);
    }
    if (fixture.entryPoint !== "compileComposition" || fixture.scope !== "complete-result"
      || fixture.expected?.ok !== false) fail(`${fixture.id} is not a complete failed object result`);
    const base = materialize(fixture.recipe);
    for (const declaration of base.declarations) {
      if (!validators.validateModuleDeclaration(declaration)) fail(`${fixture.id} materializes an invalid declaration`);
    }
    if (!validators.validateCompositionProfile(base.profile)) fail(`${fixture.id} materializes an invalid profile`);
    deriveGraph(base.declarations, base.profile, fixture.id);
    const reachable = new Set(base.profile.roots.map(root => root.slice("example/".length)));
    for (const node of reachable) for (const provider of base.edges
      .filter(([consumer]) => consumer === node).map(([, provider]) => provider)) reachable.add(provider);
    if (!isDeepStrictEqual([...reachable].sort(), [...base.names].sort())) {
      fail(`${fixture.id} does not make every selected node reachable`);
    }
    const independent = graphOracle(base);
    independent.diagnostics.sort(compare);
    if (!isDeepStrictEqual(independent, fixture.expected)) fail(`${fixture.id} expected graph result is wrong`);
    for (const diagnostic of fixture.expected.diagnostics) {
      if (!validators.validateDiagnostic(diagnostic)) fail(`${fixture.id} has a schema-invalid diagnostic`);
    }
    if (!isDeepStrictEqual([...fixture.expected.diagnostics].sort(compare), fixture.expected.diagnostics)) {
      fail(`${fixture.id} diagnostics are not in contract order`);
    }
    for (const permutation of cases.graphRecipe.permutations) {
      const variant = structuredClone(base);
      variant.declarations = permute(variant.declarations, permutation);
      variant.profile.selections = permute(variant.profile.selections, permutation);
      variant.profile.bindings = permute(variant.profile.bindings, permutation);
      variant.profile.roots = permute(variant.profile.roots, permutation);
      const graph = deriveGraph(variant.declarations, variant.profile, fixture.id);
      if (!isDeepStrictEqual(graphOracle(graph), graphOracle(base))) {
        fail(`${fixture.id} changes under ${permutation}`);
      }
    }
  }
}

function validateCases(cases, validators, compare) {
  exactKeys(cases, [
    "authority", "evidence", "futureSubjectEvidence", "graphCases", "graphRecipe", "kind",
    "rawNumberCases", "rawNumberScope",
  ], "clarification cases");
  if (cases.kind !== "get-modular.implementation-clarification-cases"
    || cases.authority !== "ADR-0018"
    || cases.evidence !== "independent-fixture-consistency-no-production-subject"
    || cases.rawNumberScope !== "numeric-admission-projection-before-field-schema-validation") {
    fail("clarification case scope or identity changed");
  }
  if (!isDeepStrictEqual(cases.graphRecipe, {
    nodeNames: "a,b for cycles; n0001 through nNNNN for chain",
    moduleId: "example/<name>", implementationId: "example/<name>/default",
    profileId: "example/depth", capability: "example/link",
    compatibility: { family: "exact", familyVersion: 1, token: "example/link" },
    edges: "each n(i+1) consumes n(i); pair a consumes b and b consumes a; self a consumes a",
    attachmentEdges: "cycle-consumes-chain: a consumes last n; chain-consumes-cycle: n0001 consumes a",
    slots: "one unique required slot d0,d1,... per edge at each consumer; exactly one provider per binding",
    roots: "a when present, plus last n when present", owner: { authority: "example", path: ["depth"] },
    allNodesSelected: true, maximumChainLength: 2049,
    permutations: ["identity", "reverse-declarations-selections-bindings-roots", "rotate-declarations-selections-bindings-roots-by-one"],
  })) fail("graph recipe changed");
  const caseIds = cases.graphCases.map(entry => entry.id);
  if (new Set(caseIds).size !== caseIds.length || cases.graphCases.length === 0) fail("graph case IDs must be unique");
  validateGraphCases(cases, validators, compare);
  const lexemes = new Set();
  for (const fixture of cases.rawNumberCases) {
    exactKeys(fixture, ["expected", "lexeme"], `raw number ${fixture.lexeme}`);
    if (lexemes.has(fixture.lexeme)) fail("raw number lexemes must be unique");
    lexemes.add(fixture.lexeme);
    if (!isDeepStrictEqual(projectRawNumber(fixture.lexeme), fixture.expected)) {
      fail(`raw number ${fixture.lexeme} has the wrong projection`);
    }
  }
  for (const required of [
    "0", "-0", "-0.000e-999999999999999999999999", "1e-400", "-1e-400",
    "1.0000000000000001", "9007199254740991.0", "9.007199254740991e15",
  ]) {
    if (!lexemes.has(required)) fail(`raw number fixtures are missing ${required}`);
  }
}

export async function checkImplementationClarifications({ readBytes, listedPaths }) {
  await validateCustody(readBytes, listedPaths);
  const [contract, cases, schema, catalog, diagnosticContract] = await Promise.all([
    json(readBytes, CONTRACT), json(readBytes, CASES), json(readBytes, SCHEMA),
    json(readBytes, CATALOG), json(readBytes, DIAGNOSTICS),
  ]);
  validateContract(contract);
  validateAcceptedLinks(contract, catalog, diagnosticContract);
  const validators = createSchemaValidators(schema);
  validateCases(cases, validators, createDiagnosticComparator({
    contract: diagnosticContract,
    catalog,
  }));
}
