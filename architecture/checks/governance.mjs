import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

import {
  productionArtifactPaths,
  productionArtifactSymlinkPaths,
  productionArtifactsOutsidePackages,
} from "./production-artifacts.mjs";
import {
  inspectTrackedWorkingTreeRegularFile,
  readAcceptedAuthorityFile,
} from "./tracked-file-custody.mjs";

export { productionArtifactPaths, productionArtifactSymlinkPaths } from
  "./production-artifacts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const ARCHITECTURE_AUTHORITY_PATH = /^docs\/architecture\/[^/]+\.md$/u;
const REQUIREMENTS_AUTHORITY_PATH = /^docs\/requirements\/[^/]+\.md$/u;
const QUALIFICATION_DOCUMENT_PATH = /^docs\/qualification\/[^/]+\.md$/u;
const DECISION_DOCUMENT_PATH = /^docs\/decisions\/[^/]+\.md$/u;
const NON_PORTABLE_PATH_CHARACTERS = /[<>:"|?*\u0000-\u001f]/u;
const REVISION = /^[a-f0-9]{40}$/u;
const REQUIREMENT = /^GM-REQ-[0-9]{3}$/u;
const SAFE_RELATIVE_PATH = /^(?![\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[^\\]+$/u;
const SOURCE_STATUSES = new Set([
  "accepted-authority-at-observation",
  "draft-evidence",
  "proposed-upstream-authority",
  "qualified-no-go-evidence",
]);
const QUALIFICATION_STATUSES = new Set([
  "reviewed",
  "source-admitted",
  "structural-conformant",
  "runtime-conformant",
  "superseded",
]);
const QUALIFICATION_CLAIM_STATUSES = new Set([
  "source-admitted",
  "structural-conformant",
  "runtime-conformant",
]);
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.[^/]*)?$/iu;

export const REQUIRED_TRACEABILITY_AUTHORITY_COVERAGE = new Map([
  ["ADR-0007", new Set([
    "GM-REQ-002",
    "GM-REQ-003",
    "GM-REQ-006",
    "GM-REQ-007",
    "GM-REQ-009",
    "GM-REQ-010",
    "GM-REQ-015",
    "GM-REQ-016",
  ])],
]);

export const ACCEPTED_AUTHORITY_LEDGER_PATH =
  "architecture/authority/accepted-authorities.json";
export const ACCEPTED_AUTHORITY_LEDGER_DIGEST =
  "sha256:9ba074210704a20f6a3ef7486f3cf2ec7435fb0fc5552cca210b6d3d5d73f077";
export const ACCEPTED_AUTHORITY_LEDGER_ANCHOR =
  `The accepted authority ledger \`${ACCEPTED_AUTHORITY_LEDGER_PATH}\` is anchored as `
  + `\`${ACCEPTED_AUTHORITY_LEDGER_DIGEST}\`.`;

function fail(message) {
  throw new Error(`GOVERNANCE_CHECK_FAILED: ${message}`);
}

function exactKeys(value, expectedKeys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expectedKeys].sort())) {
    fail(`${label} must contain exactly: ${expectedKeys.join(", ")}`);
  }
}

function digestBytes(bytes, label) {
  if (typeof bytes !== "string" && !ArrayBuffer.isView(bytes)) {
    fail(`${label} bytes are missing`);
  }
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function safeRepositoryPath(value) {
  return typeof value === "string"
    && SAFE_RELATIVE_PATH.test(value)
    && !/^[A-Za-z]:[\\/]/u.test(value)
    && !NON_PORTABLE_PATH_CHARACTERS.test(value)
    && value.split("/").every(segment => segment !== ""
      && segment !== "."
      && segment !== ".."
      && !/[. ]$/u.test(segment)
      && !WINDOWS_DEVICE_NAME.test(segment));
}

function uniqueStrings(values, label) {
  if (!Array.isArray(values) || values.length === 0 || values.some(value => typeof value !== "string")) {
    fail(`${label} must be a non-empty string array`);
  }
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
  return values;
}

function sameStrings(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validCalendarDate(value) {
  const match = /^(20[0-9]{2})-([0-9]{2})-([0-9]{2})$/u.exec(value ?? "");
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export async function validateAuthorityLedger({ ledger, readBytes }) {
  exactKeys(ledger, ["schemaVersion", "algorithm", "authorities"],
    "accepted authority ledger");
  if (ledger?.schemaVersion !== 1 || ledger.algorithm !== "sha256-bytes") {
    fail("unsupported accepted-authorities schema");
  }
  const authorities = new Map();
  for (const entry of ledger.authorities ?? []) {
    exactKeys(entry, ["id", "type", "path", "immutableDigest"],
      `accepted authority ${entry?.id ?? "<unknown>"}`);
    if (typeof entry?.id !== "string" || authorities.has(entry.id)) {
      fail("accepted authority IDs must be unique strings");
    }
    if (!["architecture", "requirements"].includes(entry.type)) {
      fail(`${entry.id} has an unsupported accepted authority type`);
    }
    const authorityPath = entry.type === "architecture"
      ? ARCHITECTURE_AUTHORITY_PATH
      : REQUIREMENTS_AUTHORITY_PATH;
    if (!authorityPath.test(entry.path ?? "")) {
      fail(`${entry.id} has an invalid ${entry.type} authority path`);
    }
    if (!SHA256.test(entry.immutableDigest ?? "")) fail(`${entry.id} has an invalid authority digest`);
    const digest = digestBytes(await readBytes(entry.path), `${entry.id} authority`);
    if (digest !== entry.immutableDigest) fail(`${entry.id} differs from accepted authority`);
    authorities.set(entry.id, entry.type);
  }
  if (authorities.size === 0) fail("accepted authority ledger must not be empty");
  return authorities;
}

export function validateAuthorityLedgerCustody({ ledgerBytes, decisionMarkdown }) {
  const digest = digestBytes(ledgerBytes, "accepted authority ledger");
  if (digest !== ACCEPTED_AUTHORITY_LEDGER_DIGEST) {
    fail(`accepted authority ledger must remain ${ACCEPTED_AUTHORITY_LEDGER_DIGEST}`);
  }
  if (typeof decisionMarkdown !== "string"
    || !decisionMarkdown.includes(ACCEPTED_AUTHORITY_LEDGER_ANCHOR)) {
    fail("ADR-0007 is missing the exact accepted authority ledger anchor");
  }
}

export function validateAcceptedAuthorityCatalog({ documents, ledgerAuthorities }) {
  const accepted = new Map(documents
    .filter(metadata => ["architecture", "requirements"].includes(metadata.type)
      && metadata.status === "accepted")
    .map(metadata => [metadata.id, metadata.type]));
  const expected = [...ledgerAuthorities.entries()].sort(([left], [right]) => compareStrings(left, right));
  const actual = [...accepted.entries()].sort(([left], [right]) => compareStrings(left, right));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail("accepted architecture and requirement documents do not match the immutable authority ledger");
  }
}

export function validateBlockedImplementation({ blockerIds, productionArtifacts, claimDocuments }) {
  if (blockerIds.size === 0) return;
  if (productionArtifacts.length > 0) {
    fail(`production artifacts are blocked by open decisions: ${[...blockerIds].sort().join(", ")}`);
  }
  if (claimDocuments.length > 0) {
    fail(`qualification claims are blocked by open decisions: ${[...blockerIds].sort().join(", ")}`);
  }
}

function documentSource(documentSources, id, pathPattern, label) {
  const source = documentSources?.get?.(id);
  if (!source || !safeRepositoryPath(source.path) || !pathPattern.test(source.path)) {
    fail(`${label} must be a governed in-repository Markdown document`);
  }
  digestBytes(source.bytes, label);
  return source;
}

function qualificationClaimAnchorPresent({ qualification, documentSources }) {
  const source = documentSources?.get?.(qualification.id);
  if (!source || !QUALIFICATION_DOCUMENT_PATH.test(source.path ?? "")) return false;
  const claimDigest = digestBytes(source.bytes, `${qualification.id} qualification record`);
  const anchor = qualificationClaimAnchor({
    id: qualification.id,
    path: source.path,
    digest: claimDigest,
  });
  return [...(documentSources?.values?.() ?? [])].some(candidate => {
    if (!DECISION_DOCUMENT_PATH.test(candidate?.path ?? "")) return false;
    const markdown = typeof candidate.bytes === "string"
      ? candidate.bytes
      : Buffer.from(candidate.bytes ?? []).toString("utf8");
    return markdown.includes(anchor);
  });
}

export function qualificationClaimAnchor({ id, path, digest }) {
  return `The exact qualification document bytes for \`${id}\` at \`${path}\` `
    + `are anchored as \`${digest}\`.`;
}

export async function validateQualificationClaims({
  documents,
  productionArtifacts,
  documentSources,
  evidenceFile,
}) {
  const byId = new Map(documents.map(document => [document.id, document]));
  const qualifications = documents.filter(document => document.type === "qualification");
  for (const qualification of qualifications) {
    if (!QUALIFICATION_STATUSES.has(qualification.status)) {
      fail(`${qualification.id} has an unsupported qualification status`);
    }

    const hasClaimFields = ["subject", "evidence", "promotion_decision"]
      .some(field => qualification[field] !== undefined);
    const hasPromotionAnchor = qualificationClaimAnchorPresent({
      qualification,
      documentSources,
    });
    if (qualification.status === "reviewed" && (hasClaimFields || hasPromotionAnchor)) {
      fail(`${qualification.id} reviewed record cannot retain a conformance claim or promotion anchor`);
    }
    if (qualification.status === "superseded" && (hasClaimFields || hasPromotionAnchor)) {
      const successors = qualification.superseded_by;
      if (!Array.isArray(successors) || successors.length === 0) {
        fail(`${qualification.id} superseded claim must name a successor`);
      }
      for (const successorId of successors) {
        const successor = byId.get(successorId);
        if (successor?.type !== "qualification"
          || !QUALIFICATION_CLAIM_STATUSES.has(successor.status)
          || (qualification.subject !== undefined
            && successor.subject !== qualification.subject)) {
          fail(`${qualification.id} has an invalid qualification successor ${successorId}`);
        }
      }
    }
  }

  const claims = qualifications.filter(document => (
    QUALIFICATION_CLAIM_STATUSES.has(document.status)
  ));
  for (const claim of claims) {
    if (!safeRepositoryPath(claim.subject)
      || !claim.subject.startsWith("packages/")
      || claim.subject.endsWith("/")) {
      fail(`${claim.id} must identify a production subject below packages`);
    }
    if (!productionArtifacts.some(path => path.startsWith(`${claim.subject}/`))) {
      fail(`${claim.id} cannot claim ${claim.status} without its production subject`);
    }

    const claimSource = documentSource(
      documentSources,
      claim.id,
      QUALIFICATION_DOCUMENT_PATH,
      `${claim.id} qualification claim`,
    );

    let promotionSource;

    if (claim.status === "source-admitted") {
      if (claim.promotion_decision !== undefined) {
        fail(`${claim.id} source admission must not masquerade as a conformance promotion`);
      }
    } else {
      const promotion = byId.get(claim.promotion_decision);
      if (promotion?.type !== "adr" || promotion.status !== "accepted") {
        fail(`${claim.id} requires an accepted promotion decision`);
      }
      if (!Array.isArray(promotion.related) || !promotion.related.includes(claim.id)) {
        fail(`${claim.id} promotion decision must reference the qualification claim`);
      }
      promotionSource = documentSource(
        documentSources,
        promotion.id,
        DECISION_DOCUMENT_PATH,
        `${claim.id} promotion decision`,
      );

      const prerequisiteStatus = claim.status === "structural-conformant"
        ? "source-admitted"
        : "structural-conformant";
      const related = Array.isArray(claim.related) ? claim.related : [];
      const prerequisite = related
        .map(id => byId.get(id))
        .find(document => document?.type === "qualification"
          && document.status === prerequisiteStatus
          && document.subject === claim.subject);
      if (!prerequisite) {
        fail(`${claim.id} requires a related ${prerequisiteStatus} claim for the same subject`);
      }
    }

    if (!Array.isArray(claim.evidence) || claim.evidence.length === 0) {
      fail(`${claim.id}.evidence must be a non-empty evidence identity array`);
    }
    const evidencePaths = new Set();
    for (const entry of claim.evidence) {
      exactKeys(entry, ["path", "digest"], `${claim.id} evidence identity`);
      if (!safeRepositoryPath(entry.path)) fail(`${claim.id} has an unsafe evidence path`);
      if (evidencePaths.has(entry.path)) fail(`${claim.id}.evidence contains duplicate paths`);
      evidencePaths.add(entry.path);
      if (!SHA256.test(entry.digest ?? "")) fail(`${claim.id} has an invalid evidence digest`);
      if (entry.path === claimSource.path || entry.path === promotionSource?.path) {
        fail(`${claim.id} evidence cannot create self or circular custody`);
      }
      const file = await evidenceFile?.(entry.path);
      if (file?.kind === "missing" || file === undefined || file === null) {
        fail(`${claim.id} references missing evidence ${entry.path}`);
      }
      if (file.kind !== "regular" || file.tracked !== true) {
        fail(`${claim.id} evidence must be a regular in-repository file with tracked Git identity: ${entry.path}`);
      }
      const actualDigest = digestBytes(file.bytes, `${claim.id} evidence ${entry.path}`);
      if (actualDigest !== entry.digest) {
        fail(`${claim.id} evidence differs from ${entry.digest}: ${entry.path}`);
      }
    }

    if (promotionSource) {
      const claimDigest = digestBytes(claimSource.bytes, `${claim.id} qualification claim`);
      const anchor = qualificationClaimAnchor({
        id: claim.id,
        path: claimSource.path,
        digest: claimDigest,
      });
      const promotionMarkdown = typeof promotionSource.bytes === "string"
        ? promotionSource.bytes
        : Buffer.from(promotionSource.bytes).toString("utf8");
      if (!promotionMarkdown.includes(anchor)) {
        fail(`${claim.id} promotion decision is missing its exact qualification bytes anchor`);
      }
    }
  }
  return claims.map(claim => claim.id);
}

export function validateQualificationProfileConsistency({ profile, documents }) {
  const claims = new Map(
    documents
      .filter(document => document.type === "qualification"
        && QUALIFICATION_CLAIM_STATUSES.has(document.status))
      .map(document => [document.status, document]),
  );
  const expected = {
    structural: claims.has("structural-conformant")
      ? "structural-conformant" : "not-claimed",
    runtime: claims.has("runtime-conformant")
      ? "runtime-conformant" : "not-claimed",
  };
  for (const claim of ["structural", "runtime"]) {
    const actual = profile?.adoption?.conformance?.[claim]?.status;
    if (actual !== expected[claim]) {
      fail(`profile ${claim} conformance disagrees with qualification claims`);
    }
  }
}

export function validateTraceability({
  requirementIds,
  sources,
  authorityIds,
  decisionIds,
  blockerIds,
  traceability,
  requiredAuthorityCoverage = new Map(),
}) {
  if (traceability?.schemaVersion !== 1) fail("unsupported traceability schema");
  const mappedRequirements = traceability.requirements ?? {};
  const mappedSources = traceability.sources ?? {};
  const expectedRequirements = [...requirementIds].sort();
  const actualRequirements = Object.keys(mappedRequirements).sort();
  if (JSON.stringify(actualRequirements) !== JSON.stringify(expectedRequirements)) {
    fail("traceability requirements do not match the normative requirement catalog");
  }

  const sourceIds = [...sources].sort();
  if (JSON.stringify(Object.keys(mappedSources).sort()) !== JSON.stringify(sourceIds)) {
    fail("traceability sources do not match the provenance source map");
  }

  const declaredDecisions = Array.isArray(traceability.decisionCatalog)
    ? traceability.decisionCatalog
    : [];
  if (declaredDecisions.some(value => typeof value !== "string")
    || new Set(declaredDecisions).size !== declaredDecisions.length
    || !sameStrings(declaredDecisions, decisionIds)) {
    fail("decision catalog does not match the open-decision documents");
  }

  const declaredBlockers = Array.isArray(traceability.implementationBlockers)
    ? traceability.implementationBlockers
    : [];
  if (declaredBlockers.some(value => typeof value !== "string")
    || new Set(declaredBlockers).size !== declaredBlockers.length
    || !sameStrings(declaredBlockers, blockerIds)) {
    fail("implementation blockers do not match the open-decision catalog");
  }

  const derivedReverse = new Map(sourceIds.map(id => [id, []]));
  const derivedAuthorityCoverage = new Map();
  for (const requirementId of expectedRequirements) {
    const mapping = mappedRequirements[requirementId];
    for (const authorityId of uniqueStrings(mapping?.authorities, `${requirementId}.authorities`)) {
      if (!authorityIds.has(authorityId)) {
        fail(`${requirementId} references unknown or non-accepted authority ${authorityId}`);
      }
      const coverage = derivedAuthorityCoverage.get(authorityId) ?? new Set();
      coverage.add(requirementId);
      derivedAuthorityCoverage.set(authorityId, coverage);
    }
    const requirementBlockers = mapping?.blockers === undefined
      ? []
      : uniqueStrings(mapping.blockers, `${requirementId}.blockers`);
    for (const blockerId of requirementBlockers) {
      if (!blockerIds.has(blockerId)) {
        fail(`${requirementId} references unknown or non-open blocker ${blockerId}`);
      }
    }
    for (const sourceId of uniqueStrings(mapping?.provenance, `${requirementId}.provenance`)) {
      if (!derivedReverse.has(sourceId)) fail(`${requirementId} references unknown source ${sourceId}`);
      derivedReverse.get(sourceId).push(requirementId);
    }
  }

  for (const [authorityId, requiredRequirements] of requiredAuthorityCoverage) {
    const actual = derivedAuthorityCoverage.get(authorityId) ?? new Set();
    for (const requirementId of requiredRequirements) {
      if (!actual.has(requirementId)) {
        fail(`${authorityId} traceability must cover ${requirementId}`);
      }
    }
  }

  for (const sourceId of sourceIds) {
    const declared = uniqueStrings(mappedSources[sourceId], `sources.${sourceId}`).sort();
    const derived = derivedReverse.get(sourceId).sort();
    if (JSON.stringify(declared) !== JSON.stringify(derived)) {
      fail(`reverse traceability mismatch for ${sourceId}`);
    }
  }
}

export function validateSourceMap(sourceMap) {
  if (sourceMap?.schemaVersion !== 1 || !Array.isArray(sourceMap.sources)) {
    fail("unsupported source-map schema");
  }
  const ids = new Set();
  for (const source of sourceMap.sources) {
    if (typeof source?.id !== "string" || ids.has(source.id)) fail("source IDs must be unique strings");
    ids.add(source.id);
    if (typeof source.repository !== "string" || !source.repository.startsWith("https://")) {
      fail(`${source.id} has an invalid repository URL`);
    }
    if (!REVISION.test(source.revision ?? "")) fail(`${source.id} has a non-exact revision`);
    if (!SOURCE_STATUSES.has(source.status)) fail(`${source.id} has an unknown evidence status`);
    if (!validCalendarDate(source.observedAt)) {
      fail(`${source.id} has an invalid observation date`);
    }
    if (source.status !== "accepted-authority-at-observation"
      && (typeof source.pullRequest !== "string" || !source.pullRequest.startsWith(`${source.repository}/pull/`))) {
      fail(`${source.id} must identify its pull request`);
    }
    for (const path of uniqueStrings(source.paths, `${source.id}.paths`)) {
      if (!SAFE_RELATIVE_PATH.test(path) || path.includes(`${sep}..${sep}`)) {
        fail(`${source.id} has an unsafe evidence path`);
      }
    }
  }
  return ids;
}

export function requirementIdsFromMarkdown(markdown) {
  const ids = [...markdown.matchAll(/^### (GM-REQ-[0-9]{3}):/gmu)].map(match => match[1]);
  if (ids.length === 0 || ids.some(id => !REQUIREMENT.test(id)) || new Set(ids).size !== ids.length) {
    fail("normative requirement IDs are missing or duplicated");
  }
  return new Set(ids);
}

export function validateDecisionResolutions(documents) {
  const byId = new Map(documents.map(metadata => [metadata.id, metadata]));
  for (const decision of documents.filter(metadata => metadata.type === "open-decision")) {
    if (decision.status === "open") continue;
    if (decision.status !== "resolved") fail(`${decision.id} has an invalid open-decision status`);
    const resolver = byId.get(decision.resolved_by);
    if (resolver?.type !== "adr" || resolver.status !== "accepted") {
      fail(`${decision.id} must resolve through an accepted ADR`);
    }
    if (!Array.isArray(resolver.related) || !resolver.related.includes(decision.id)) {
      fail(`${decision.id} resolver ${resolver.id} must reference the resolved decision`);
    }
  }
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function readBytes(relativePath) {
  return readFile(resolve(root, relativePath));
}

async function governanceDocumentCatalog() {
  const documents = new Map();
  const documentSources = new Map();
  for (const directory of [
    "docs/architecture",
    "docs/decisions",
    "docs/open-decisions",
    "docs/qualification",
    "docs/requirements",
  ]) {
    for (const filename of await readdir(resolve(root, directory))) {
      if (!filename.endsWith(".md")) continue;
      const path = `${directory}/${filename}`;
      const bytes = await readBytes(path);
      const markdown = bytes.toString("utf8");
      const match = markdown.match(/^---\n([\s\S]*?)\n---/u);
      if (!match) fail(`${directory}/${filename} has no metadata`);
      const metadata = parse(match[1]);
      if (typeof metadata?.id !== "string" || documents.has(metadata.id)) {
        fail(`governance document IDs must be unique strings: ${directory}/${filename}`);
      }
      documents.set(metadata.id, metadata);
      documentSources.set(metadata.id, { path, bytes });
    }
  }
  return { documents, documentSources };
}

export async function inspectTrackedNavigationFile(relativePath, repositoryRoot = root) {
  return inspectTrackedWorkingTreeRegularFile(relativePath, repositoryRoot);
}

async function main() {
  const ledgerBytes = await readAcceptedAuthorityFile(
    ACCEPTED_AUTHORITY_LEDGER_PATH,
    root,
    "accepted authority ledger",
  );
  validateAuthorityLedgerCustody({
    ledgerBytes,
    decisionMarkdown: (await readAcceptedAuthorityFile(
      "docs/decisions/0007-require-executable-v1-conformance-amendments.md",
      root,
      "ADR-0007",
    )).toString("utf8"),
  });
  const ledgerAuthorities = await validateAuthorityLedger({
    ledger: JSON.parse(ledgerBytes.toString("utf8")),
    readBytes: path => readAcceptedAuthorityFile(path, root, "accepted authority artifact"),
  });
  const { documents, documentSources } = await governanceDocumentCatalog();
  validateDecisionResolutions([...documents.values()]);
  validateAcceptedAuthorityCatalog({
    documents: [...documents.values()],
    ledgerAuthorities,
  });

  const requirementsMarkdown = await read("docs/requirements/module-system-v1.md");
  const sourceMap = parse(await read("docs/provenance/source-map.yaml"));
  const traceability = parse(await read("docs/traceability/module-system-v1.yaml"));
  const blockerIds = new Set([...documents.values()]
    .filter(metadata => metadata.type === "open-decision" && metadata.status === "open")
    .map(metadata => metadata.id));
  validateTraceability({
    requirementIds: requirementIdsFromMarkdown(requirementsMarkdown),
    sources: validateSourceMap(sourceMap),
    authorityIds: new Set([
      ...ledgerAuthorities.keys(),
      ...[...documents.values()]
        .filter(metadata => metadata.type === "adr" && metadata.status === "accepted")
        .map(metadata => metadata.id),
    ]),
    decisionIds: new Set([...documents.values()]
      .filter(metadata => metadata.type === "open-decision")
      .map(metadata => metadata.id)),
    blockerIds,
    traceability,
    requiredAuthorityCoverage: REQUIRED_TRACEABILITY_AUTHORITY_COVERAGE,
  });
  const productionArtifacts = await productionArtifactPaths(root);
  const productionArtifactSymlinks = await productionArtifactSymlinkPaths(root);
  const misplacedArtifacts = productionArtifactsOutsidePackages(productionArtifacts);
  if (misplacedArtifacts.length > 0) {
    fail(`production artifacts must be below packages: ${misplacedArtifacts.join(", ")}`);
  }
  if (productionArtifactSymlinks.length > 0) {
    fail(`production artifacts must not be symlinks: ${productionArtifactSymlinks.join(", ")}`);
  }
  const profile = JSON.parse(await read("architecture/feature-module-standard-profile.json"));
  const claimDocuments = await validateQualificationClaims({
    documents: [...documents.values()],
    productionArtifacts,
    documentSources,
    evidenceFile: async path => {
      return inspectTrackedNavigationFile(path);
    },
  });
  validateQualificationProfileConsistency({
    profile,
    documents: [...documents.values()],
  });
  validateBlockedImplementation({
    blockerIds,
    productionArtifacts,
    claimDocuments,
  });
  process.stdout.write("Get Modular governance check passed.\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
