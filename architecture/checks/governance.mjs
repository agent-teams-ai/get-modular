import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40}$/u;
const REQUIREMENT = /^GM-REQ-[0-9]{3}$/u;
const SAFE_RELATIVE_PATH = /^(?![\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[^\\]+$/u;
const SOURCE_STATUSES = new Set([
  "accepted-authority-at-observation",
  "draft-evidence",
  "proposed-upstream-authority",
  "qualified-no-go-evidence",
]);

function fail(message) {
  throw new Error(`GOVERNANCE_CHECK_FAILED: ${message}`);
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
  if (ledger?.schemaVersion !== 1 || ledger.algorithm !== "sha256-bytes") {
    fail("unsupported accepted-authorities schema");
  }
  const authorities = new Map();
  for (const entry of ledger.authorities ?? []) {
    if (typeof entry?.id !== "string" || authorities.has(entry.id)) {
      fail("accepted authority IDs must be unique strings");
    }
    if (!["architecture", "requirements"].includes(entry.type)) {
      fail(`${entry.id} has an unsupported accepted authority type`);
    }
    if (!SAFE_RELATIVE_PATH.test(entry.path ?? "")) fail(`${entry.id} has an unsafe authority path`);
    if (!SHA256.test(entry.immutableDigest ?? "")) fail(`${entry.id} has an invalid authority digest`);
    const digest = `sha256:${createHash("sha256").update(await readBytes(entry.path)).digest("hex")}`;
    if (digest !== entry.immutableDigest) fail(`${entry.id} differs from accepted authority`);
    authorities.set(entry.id, entry.type);
  }
  if (authorities.size === 0) fail("accepted authority ledger must not be empty");
  return authorities;
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

export function validateBlockedImplementation({ blockerIds, productionPackages, qualifiedDocuments }) {
  if (blockerIds.size === 0) return;
  if (productionPackages.length > 0) {
    fail(`production packages are blocked by open decisions: ${[...blockerIds].sort().join(", ")}`);
  }
  if (qualifiedDocuments.length > 0) {
    fail(`qualification claims are blocked by open decisions: ${[...blockerIds].sort().join(", ")}`);
  }
}

export function validateTraceability({ requirementIds, sources, authorityIds, blockerIds, traceability }) {
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

  const declaredBlockers = Array.isArray(traceability.implementationBlockers)
    ? traceability.implementationBlockers
    : [];
  if (declaredBlockers.some(value => typeof value !== "string")
    || new Set(declaredBlockers).size !== declaredBlockers.length
    || !sameStrings(declaredBlockers, blockerIds)) {
    fail("implementation blockers do not match the open-decision catalog");
  }

  const derivedReverse = new Map(sourceIds.map(id => [id, []]));
  for (const requirementId of expectedRequirements) {
    const mapping = mappedRequirements[requirementId];
    for (const authorityId of uniqueStrings(mapping?.authorities, `${requirementId}.authorities`)) {
      if (!authorityIds.has(authorityId)) {
        fail(`${requirementId} references unknown or non-accepted authority ${authorityId}`);
      }
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

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function governanceDocumentCatalog() {
  const documents = new Map();
  for (const directory of [
    "docs/architecture",
    "docs/decisions",
    "docs/open-decisions",
    "docs/qualification",
    "docs/requirements",
  ]) {
    for (const filename of await readdir(resolve(root, directory))) {
      if (!filename.endsWith(".md")) continue;
      const markdown = await read(`${directory}/${filename}`);
      const match = markdown.match(/^---\n([\s\S]*?)\n---/u);
      if (!match) fail(`${directory}/${filename} has no metadata`);
      const metadata = parse(match[1]);
      if (typeof metadata?.id !== "string" || documents.has(metadata.id)) {
        fail(`governance document IDs must be unique strings: ${directory}/${filename}`);
      }
      documents.set(metadata.id, metadata);
    }
  }
  return documents;
}

async function productionPackagePaths() {
  const paths = [];
  let entries;
  try {
    entries = await readdir(resolve(root, "packages"), { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return paths;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await read(`packages/${entry.name}/package.json`);
      paths.push(`packages/${entry.name}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return paths;
}

async function main() {
  const ledgerAuthorities = await validateAuthorityLedger({
    ledger: JSON.parse(await read("architecture/authority/accepted-authorities.json")),
    readBytes: read,
  });
  const documents = await governanceDocumentCatalog();
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
    blockerIds,
    traceability,
  });
  validateBlockedImplementation({
    blockerIds,
    productionPackages: await productionPackagePaths(),
    qualifiedDocuments: [...documents.values()]
      .filter(metadata => metadata.type === "qualification" && metadata.status === "qualified")
      .map(metadata => metadata.id),
  });
  process.stdout.write("Get Modular governance check passed.\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
