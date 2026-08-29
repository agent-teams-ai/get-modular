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

export function validateTraceability({ requirementIds, sources, traceability }) {
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

  const derivedReverse = new Map(sourceIds.map(id => [id, []]));
  for (const requirementId of expectedRequirements) {
    const mapping = mappedRequirements[requirementId];
    uniqueStrings(mapping?.authorities, `${requirementId}.authorities`);
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
    if (!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/u.test(source.observedAt ?? "")) {
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

async function main() {
  const authority = JSON.parse(await read("architecture/authority/accepted-requirements.json"));
  if (authority.schemaVersion !== 1 || authority.algorithm !== "sha256-bytes") {
    fail("unsupported accepted-requirements authority schema");
  }
  const authorityIds = new Set();
  for (const entry of authority.requirements ?? []) {
    if (typeof entry.id !== "string" || authorityIds.has(entry.id)) fail("accepted requirement IDs must be unique");
    authorityIds.add(entry.id);
    if (!SAFE_RELATIVE_PATH.test(entry.path ?? "")) fail(`${entry.id} has an unsafe authority path`);
    if (!SHA256.test(entry.immutableDigest ?? "")) fail(`${entry.id} has an invalid authority digest`);
    const bytes = await read(entry.path);
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (digest !== entry.immutableDigest) fail(`${entry.id} differs from accepted authority`);
  }

  const acceptedRequirementIds = new Set();
  for (const filename of await readdir(resolve(root, "docs/requirements"))) {
    if (!filename.endsWith(".md")) continue;
    const markdown = await read(`docs/requirements/${filename}`);
    const match = markdown.match(/^---\n([\s\S]*?)\n---/u);
    if (!match) fail(`${filename} has no metadata`);
    const metadata = parse(match[1]);
    if (metadata.type === "requirements" && metadata.status === "accepted") {
      acceptedRequirementIds.add(metadata.id);
    }
  }
  if (JSON.stringify([...acceptedRequirementIds].sort()) !== JSON.stringify([...authorityIds].sort())) {
    fail("accepted requirement documents do not match the immutable authority ledger");
  }

  const requirementsMarkdown = await read("docs/requirements/module-system-v1.md");
  const sourceMap = parse(await read("docs/provenance/source-map.yaml"));
  const traceability = parse(await read("docs/traceability/module-system-v1.yaml"));
  validateTraceability({
    requirementIds: requirementIdsFromMarkdown(requirementsMarkdown),
    sources: validateSourceMap(sourceMap),
    traceability,
  });
  process.stdout.write("Get Modular governance check passed.\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
