#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(dirname(dirname(here)));
const readinessDir = join(repositoryRoot, "research", "implementation-readiness");
const evidenceDir = join(readinessDir, "evidence");
const rawDir = join(evidenceDir, "raw");
const manifestPath = join(readinessDir, "worker-manifest.json");
const indexPath = join(evidenceDir, "worker-index.json");
const inventorySubjectSha = "f6a81e029098de30d46d8cf3737fadb4a16ed098";
const initialBaseSha = "0f7d2fc64ae7258781e6c2676ca1e0ccc377f418";
const launchContract = {
  locator: `git:${inventorySubjectSha}:research/implementation-readiness/worker-manifest.json`,
  sha256: "24f3daf720d4b26aded018557b93eeda086e487b4826e6c3cfabb3b095569747",
  note: "Immutable pre-remediation manifest at the supplied commit; used only for launch defaults that it explicitly records."
};
const unknown = (reason) => ({ value: null, reason });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const outputSummary = (result) =>
  result.evidence?.find((item) => item.startsWith("output_summary:"))?.slice(15) ?? "";

function walk(path) {
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)])
    .sort();
}

function sourceId(path) {
  return relative(evidenceDir, path).replaceAll("\\", "/");
}

function trackAndRole(taskId) {
  let match;
  if ((match = taskId.match(/^gm-readiness-(a\d+)/)))
    return ["track-a-readiness", match[1].toUpperCase()];
  if ((match = taskId.match(/^gm-api-(b\d+)/)))
    return ["track-b-api-authoring", match[1].toUpperCase()];
  if ((match = taskId.match(/^gm-oss-(o\d+)/)))
    return ["oss-reference", match[1].toUpperCase()];
  if ((match = taskId.match(/^gm-integrator-(i\d+)/)))
    return ["integrators", match[1].toUpperCase()];
  if ((match = taskId.match(/^gm-targeted-([a-z]+)-(\d+)-/)))
    return ["dispute-critics", `${match[1]}-${match[2]}`];
  if ((match = taskId.match(/^gm-final-4dee-r(\d+)-([a-z-]+)-/)))
    return ["final-review", `R${match[1]}-${match[2]}`];
  if (taskId === "gm-goal-api-lab-remediation-20260904" ||
      taskId === "gm-goal-api-lab-exact-corpus-l-old-20260904")
    return ["api-lab-remediation", "API-LAB"];
  if ((match = taskId.match(/^gm-goal-audit-([a-z]+)-/)))
    return ["completion-audit", match[1].toUpperCase()];
  throw new Error(`unclassified task ID: ${taskId}`);
}

const attempts = new Map([
  ["gm-readiness-a2-seq-20260903", "gm-readiness-a2-lane-l-20260903"],
  ["gm-readiness-a2-wave4-20260903", "gm-readiness-a2-lane-l-20260903"],
  ["gm-readiness-a5-extra-l-20260903", "gm-readiness-a5-seq-20260903"],
  ["gm-readiness-a6-extra-l-20260903", "gm-readiness-a6-seq-20260903"],
  ["gm-api-b2-extra-v-20260903", "gm-api-b2-lane-l-20260903"],
  ["gm-api-b3-extra-v-20260903", "gm-api-b3-lane-l-20260903"],
  ["gm-api-b4-extra-v-20260903", "gm-api-b4-lane-l-20260903"],
  ["gm-goal-api-lab-exact-corpus-l-old-20260904", "gm-goal-api-lab-remediation-20260904"]
]);

function profileFor(track, taskId) {
  if (taskId === "gm-goal-api-lab-exact-corpus-l-old-20260904") return "correction-not-retained";
  return {
    "track-a-readiness": "research-xhigh",
    "track-b-api-authoring": "fixtures-medium",
    "oss-reference": "research-xhigh",
    integrators: "integrator-xhigh",
    "dispute-critics": "critic-xhigh",
    "final-review": "final-review-xhigh",
    "api-lab-remediation": "remediation-not-retained",
    "completion-audit": "audit-not-retained"
  }[track];
}

function subjectKind(track) {
  return ["track-b-api-authoring", "api-lab-remediation"].includes(track) ? "base" : "reviewed";
}

function evidenceStatus(taskId, result, track) {
  if (taskId === "gm-api-b1-lane-l-20260903") return "partial";
  if (taskId === "gm-api-b3-lane-l-20260903" ||
      taskId === "gm-goal-api-lab-exact-corpus-l-old-20260904") return "blocked";
  if (result.status === "partial") return "partial";
  if (track === "oss-reference" && !taskId.startsWith("gm-oss-o6-")) return "source-unavailable";
  if (["track-b-api-authoring", "api-lab-remediation"].includes(track)) return "positive";
  return "review-only";
}

function expectedWorkspace(taskId) {
  let match;
  if ((match = taskId.match(/^gm-api-(b\d+)-lane-l/))) return `l-${match[1]}`;
  if ((match = taskId.match(/^gm-api-(b\d+)-extra-v/))) return `extra-${match[1]}`;
  if ((match = taskId.match(/^gm-readiness-(a\d+)/))) return match[1];
  if ((match = taskId.match(/^gm-targeted-([a-z]+)-(\d+)-/))) return `target-${match[1]}-${match[2]}`;
  if ((match = taskId.match(/^gm-integrator-(i\d+)/))) return match[1];
  if ((match = taskId.match(/^gm-final-4dee-r(\d+)/))) return `r${match[1]}`;
  if ((match = taskId.match(/^gm-goal-audit-([a-z]+)-/))) return match[1];
  if (taskId === "gm-goal-api-lab-remediation-20260904") return "api-lab-write-2";
  return null;
}

function worktreePath(taskId, result) {
  const matches = [...new Set(outputSummary(result).match(
    /\/var\/data\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/workspaces\/[A-Za-z0-9._-]+/g
  ) ?? [])];
  const expected = expectedWorkspace(taskId);
  const exact = matches.find((path) => path.endsWith(`/workspaces/${expected}`));
  return exact ?? unknown("not-retained");
}

function createProfiles() {
  const missing = unknown("not-retained");
  return {
    "research-xhigh": {
      model: "gpt-5.6-sol", reasoningEffort: "xhigh", serviceTier: "default",
      ownership: "read-only research",
      network: { requested: unknown("not-retained"), enforced: "disabled" },
      provenance: launchContract.locator
    },
    "fixtures-medium": {
      model: "gpt-5.6-sol", reasoningEffort: "medium", serviceTier: "default",
      ownership: "disposable qualification fixtures only",
      network: { requested: unknown("not-retained"), enforced: "disabled" },
      provenance: launchContract.locator
    },
    "integrator-xhigh": {
      model: "gpt-5.6-sol", reasoningEffort: "xhigh", serviceTier: "default",
      ownership: "evidence synthesis",
      network: { requested: unknown("not-retained"), enforced: "disabled" },
      provenance: launchContract.locator
    },
    "critic-xhigh": {
      model: "gpt-5.6-sol", reasoningEffort: "xhigh", serviceTier: "default",
      ownership: "read-only targeted criticism",
      network: { requested: false, enforced: "disabled" },
      provenance: "research/implementation-readiness/launch-targeted-critics.sh:49-52"
    },
    "final-review-xhigh": {
      model: "gpt-5.6-sol", reasoningEffort: "xhigh", serviceTier: "default",
      ownership: "exact-head read-only review",
      network: { requested: unknown("not-retained"), enforced: "disabled" },
      provenance: launchContract.locator
    },
    "remediation-not-retained": {
      model: missing, reasoningEffort: missing, serviceTier: missing,
      ownership: "qualification fixture remediation",
      network: { requested: false, enforced: unknown("not-retained") },
      provenance: "raw result plus research/implementation-readiness/api-lab-remediation-prompt.md"
    },
    "correction-not-retained": {
      model: missing, reasoningEffort: missing, serviceTier: missing,
      ownership: "qualification fixture correction",
      network: { requested: unknown("not-retained"), enforced: "sandbox-denied" },
      provenance: "raw result plus research/implementation-readiness/api-lab-scenario-correction-prompt.md"
    },
    "audit-not-retained": {
      model: missing, reasoningEffort: missing, serviceTier: missing,
      ownership: "exact-SHA read-only completion audit",
      network: { requested: unknown("not-retained"), enforced: unknown("not-retained") },
      provenance: "raw completion-audit result summaries"
    }
  };
}

function compactArrayDocument(header, arrayName, rows, footer) {
  const lines = ["{"];
  const entries = Object.entries(header);
  entries.forEach(([key, value]) => lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)},`));
  lines.push(`  ${JSON.stringify(arrayName)}: [`);
  rows.forEach((row, index) => lines.push(`    ${JSON.stringify(row)}${index + 1 === rows.length ? "" : ","}`));
  lines.push("  ],");
  const tail = Object.entries(footer);
  tail.forEach(([key, value], index) =>
    lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${index + 1 === tail.length ? "" : ","}`));
  lines.push("}", "");
  return lines.join("\n");
}

function countBy(values) {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((x) => x === value).length]));
}

function build() {
  const combinedPath = join(evidenceDir, "combined-workers.json");
  const reconciliationPath = join(evidenceDir, "reconciliation.json");
  const hostPath = join(evidenceDir, "host-preflight.json");
  const combined = readJson(combinedPath);
  const reconciliation = readJson(reconciliationPath);
  const host = readJson(hostPath);
  const rawPaths = walk(rawDir).filter((path) => path.endsWith(".result.json"));
  const raw = rawPaths.map((path) => ({ path, bytes: readFileSync(path), result: readJson(path) }));
  const digestGroups = Map.groupBy(raw, (item) => sha256(item.bytes));
  const sources = [combinedPath, reconciliationPath, hostPath].map((path) => ({
    id: sourceId(path), path: relative(repositoryRoot, path).replaceAll("\\", "/"),
    kind: "supporting", classification: "supporting", sha256: sha256(readFileSync(path))
  }));
  const canonicalRaw = [];
  for (const [digest, group] of [...digestGroups].sort(([a], [b]) => a.localeCompare(b))) {
    const canonical = [...group].sort((a, b) => {
      const aNamed = a.path.endsWith(`/${a.result.taskId}.result.json`) ? 0 : 1;
      const bNamed = b.path.endsWith(`/${b.result.taskId}.result.json`) ? 0 : 1;
      return aNamed - bNamed || a.path.localeCompare(b.path);
    })[0];
    canonicalRaw.push(canonical);
    const canonicalId = sourceId(canonical.path);
    for (const item of group.sort((a, b) => a.path.localeCompare(b.path))) {
      sources.push({
        id: sourceId(item.path), path: relative(repositoryRoot, item.path).replaceAll("\\", "/"),
        kind: "raw-result", classification: item === canonical ? "canonical" : "duplicate",
        ...(item === canonical ? {} : { duplicateOf: canonicalId }), sha256: digest
      });
    }
  }
  sources.sort((a, b) => a.id.localeCompare(b.id));
  const combinedIds = new Set(combined.results.map((result) => result.taskId));
  const records = canonicalRaw.map(({ path, result }) => {
    const [track, logicalRole] = trackAndRole(result.taskId);
    const rawSource = sourceId(path);
    const sourceRefs = [rawSource];
    if (combinedIds.has(result.taskId)) sourceRefs.push("combined-workers.json");
    if (["gm-api-b1-lane-l-20260903", "gm-api-b3-lane-l-20260903"].includes(result.taskId))
      sourceRefs.push("reconciliation.json");
    const isAttempt = attempts.has(result.taskId);
    const provenance = {
      default: rawSource,
      fields: {
        role: "derived from retained taskId and campaign roster",
        classification: isAttempt ? "planned-role reconciliation in completion audit" : "planned campaign roster",
        execution: `worker-manifest.json#/executionProfiles/${profileFor(track, result.taskId)}`,
        ...(sourceRefs.includes("reconciliation.json") ? { "result.evidence": "reconciliation.json#/records" } : {}),
        ...(typeof worktreePath(result.taskId, result) === "string" ? { worktreePath: `${rawSource} output_summary` } : {})
      }
    };
    return {
      workerId: result.taskId, runId: result.runId, logicalRole, track,
      classification: isAttempt ? "attempt" : "canonical", attemptOf: attempts.get(result.taskId) ?? null,
      execution: { profile: profileFor(track, result.taskId) },
      subject: { kind: subjectKind(track), sha: result.details?.baseCommit ?? null },
      worktreePath: worktreePath(result.taskId, result), sources: sourceRefs,
      result: { wrapper: result.status, evidence: evidenceStatus(result.taskId, result, track) },
      commands: unknown("unstructured-only"), changedFiles: result.changedFiles,
      confidence: unknown("unstructured-only"), unresolvedQuestions: unknown("unstructured-only"),
      provenance
    };
  }).sort((a, b) => a.workerId.localeCompare(b.workerId));
  const plannedRoleKeys = new Set(records.map((record) => `${record.track}/${record.logicalRole}`));
  const counts = {
    rawFiles: raw.length, byteUniqueRawResults: digestGroups.size,
    duplicateRawAliases: raw.length - digestGroups.size, records: records.length,
    plannedRoles: plannedRoleKeys.size,
    canonicalRecords: records.filter((record) => record.classification === "canonical").length,
    attemptRecords: records.filter((record) => record.classification === "attempt").length,
    initialCampaignRecords: records.filter((record) => combinedIds.has(record.workerId)).length,
    initialCampaignPlannedRoles: new Set(records.filter((record) => combinedIds.has(record.workerId)).map((record) => `${record.track}/${record.logicalRole}`)).size,
    wrapperStatuses: countBy(records.map((record) => record.result.wrapper)),
    evidenceStatuses: countBy(records.map((record) => record.result.evidence)),
    retainedHistoricalFinalReviews: records.filter((record) => record.track === "final-review").length,
    retainedCompletionAudits: records.filter((record) => record.track === "completion-audit").length,
    externalReviewRecordsNotRetained:
      reconciliation.currentExternalReviewerWave.workerCount + reconciliation.remediationReviewerWave.workerCount
  };
  const tracks = [...new Set(records.map((record) => record.track))].sort().map((track) => {
    const rows = records.filter((record) => record.track === track);
    return {
      id: track, plannedRoles: [...new Set(rows.map((record) => record.logicalRole))].sort(),
      recordCount: rows.length, canonicalCount: rows.filter((record) => record.classification === "canonical").length,
      attemptCount: rows.filter((record) => record.classification === "attempt").length
    };
  });
  const profiles = createProfiles();
  const manifest = {
    schemaVersion: 2,
    inventoryId: "get-modular/implementation-readiness-worker-inventory/v2",
    repository: "agent-teams-ai/get-modular",
    inventorySubjectSha,
    initialCampaignBaseSha: initialBaseSha,
    generatedBy: "tests/qualification/implementation-readiness/generate-worker-inventory.mjs",
    launchContract,
    valueConvention: "A {value:null,reason} object is an intentionally unrecoverable historical value.",
    executionProfiles: profiles,
    tracks,
    decisions: {
      accepted: ["ADR-0001", "ADR-0002", "ADR-0003", "ADR-0004", "ADR-0005", "ADR-0006", "ADR-0007", "ADR-0008", "ADR-0015"],
      proposed: ["ADR-0009", "ADR-0010", "ADR-0011", "ADR-0012", "ADR-0013", "ADR-0014", "ADR-0016"]
    },
    hostPreflight: {
      source: "evidence/host-preflight.json", observedAt: host.observedAt, hostAlias: host.hostAlias,
      machineId: host.machineId,
      sourceBundle: { headSha: host.sourceBundle.headSha, sha256: host.sourceBundle.sha256 }
    },
    externalReviewBoundary: {
      rule: "Final exact-head review records belong in external PR/CI custody; committing them inside the commit they review would change that commit and make the evidence self-referential.",
      retainedHistoricalWave: reconciliation.historicalReviewerWave,
      externalWaves: [reconciliation.currentExternalReviewerWave, reconciliation.remediationReviewerWave],
      currentInventorySubject: inventorySubjectSha,
      currentInventoryReview: unknown("external-review-not-retained-in-reviewed-commit")
    },
    enumerationBoundary: "Records are limited to byte-unique raw results retained at the supplied exact commit. Externally held review waves are counted only in aggregate, and later launches are not enumerated.",
    sourceIndex: "research/implementation-readiness/evidence/worker-index.json#/sources",
    counts
  };
  return { manifest, sources, records, counts, combined, reconciliation, raw };
}

function validate(built) {
  const { manifest, sources, records, counts, combined, reconciliation, raw } = built;
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  const shaPattern = /^[0-9a-f]{40}$/;
  const required = ["workerId", "runId", "logicalRole", "track", "classification", "attemptOf", "execution", "subject", "worktreePath", "sources", "result", "commands", "changedFiles", "confidence", "unresolvedQuestions", "provenance"];
  require(shaPattern.test(manifest.inventorySubjectSha), "invalid inventory subject SHA");
  require(shaPattern.test(manifest.initialCampaignBaseSha), "invalid initial campaign base SHA");
  require(new Set(records.map((record) => record.workerId)).size === records.length, "worker IDs are not unique");
  require(new Set(records.map((record) => record.runId)).size === records.length, "run IDs are not unique");
  for (const record of records) {
    for (const field of required) require(Object.hasOwn(record, field), `${record.workerId}: missing ${field}`);
    require(["canonical", "attempt"].includes(record.classification), `${record.workerId}: invalid classification`);
    require(["done", "partial"].includes(record.result.wrapper), `${record.workerId}: invalid wrapper status`);
    require(["positive", "partial", "blocked", "source-unavailable", "review-only"].includes(record.result.evidence), `${record.workerId}: invalid evidence status`);
    require(shaPattern.test(record.subject.sha), `${record.workerId}: invalid subject SHA`);
    require(Object.hasOwn(manifest.executionProfiles, record.execution.profile), `${record.workerId}: missing execution profile`);
    if (record.classification === "attempt")
      require(records.some((candidate) => candidate.workerId === record.attemptOf && candidate.classification === "canonical"), `${record.workerId}: invalid attempt target`);
  }
  for (const [id, profile] of Object.entries(manifest.executionProfiles)) {
    for (const field of ["model", "reasoningEffort", "serviceTier", "ownership", "network", "provenance"])
      require(Object.hasOwn(profile, field), `${id}: incomplete execution profile (${field})`);
    require(Object.hasOwn(profile.network, "requested") && Object.hasOwn(profile.network, "enforced"), `${id}: incomplete network profile`);
  }
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  require(sourceMap.size === sources.length, "source IDs are not unique");
  for (const source of sources) {
    const path = join(repositoryRoot, source.path);
    require(existsSync(path), `${source.id}: source path missing`);
    if (existsSync(path)) require(sha256(readFileSync(path)) === source.sha256, `${source.id}: digest mismatch`);
    if (source.classification === "duplicate") {
      const target = sourceMap.get(source.duplicateOf);
      require(target?.classification === "canonical", `${source.id}: duplicate target is not canonical`);
      require(target?.sha256 === source.sha256, `${source.id}: duplicate target digest differs`);
    }
  }
  for (const record of records)
    for (const id of record.sources) require(sourceMap.has(id), `${record.workerId}: missing source ${id}`);
  const rawByTask = new Map(raw.map((item) => [item.result.taskId, item.result]));
  require(combined.results.length === 51, "combined worker count changed");
  for (const result of combined.results)
    require(JSON.stringify(result) === JSON.stringify(rawByTask.get(result.taskId)), `${result.taskId}: combined/raw mismatch`);
  require(records.find((record) => record.workerId === "gm-api-b1-lane-l-20260903")?.result.evidence === "partial", "B1 reconciliation lost");
  require(records.find((record) => record.workerId === "gm-api-b3-lane-l-20260903")?.result.evidence === "blocked", "B3 reconciliation lost");
  require(reconciliation.records.length === 2, "reconciliation record count changed");
  require(counts.records === 63 && counts.rawFiles === 76 && counts.duplicateRawAliases === 13, "retained raw count reconciliation failed");
  require(sources.filter((source) => source.classification === "canonical").length === counts.byteUniqueRawResults, "canonical source count reconciliation failed");
  require(sources.filter((source) => source.classification === "duplicate").length === counts.duplicateRawAliases, "duplicate source count reconciliation failed");
  require(counts.plannedRoles === 55 && counts.canonicalRecords === 55 && counts.attemptRecords === 8, "planned role/attempt reconciliation failed");
  require(counts.initialCampaignRecords === 51 && counts.initialCampaignPlannedRoles === 44, "initial campaign reconciliation failed");
  require(counts.retainedHistoricalFinalReviews === 6, "historical final-review retention count is not six");
  require(counts.retainedCompletionAudits === 4, "completion-audit retention count is not four");
  require(manifest.decisions.proposed.join(",") === "ADR-0009,ADR-0010,ADR-0011,ADR-0012,ADR-0013,ADR-0014,ADR-0016", "proposed decision set is wrong");
  if (errors.length) throw new Error(errors.join("\n"));
}

const built = build();
validate(built);
const manifestText = `${JSON.stringify(built.manifest, null, 2)}\n`;
const indexText = compactArrayDocument(
  {
    schemaVersion: 2,
    inventorySubjectSha,
    manifest: "research/implementation-readiness/worker-manifest.json",
    valueConvention: "A {value:null,reason} object is an intentionally unrecoverable historical value."
  },
  "sources",
  built.sources,
  { records: built.records, counts: built.counts }
).replace(`  "records": ${JSON.stringify(built.records)}`, [
  "  \"records\": [",
  ...built.records.map((record, index) => `    ${JSON.stringify(record)}${index + 1 === built.records.length ? "" : ","}`),
  "  ]"
].join("\n"));

if (process.argv.includes("--check")) {
  const stale = [];
  if (readFileSync(manifestPath, "utf8") !== manifestText) stale.push(relative(here, manifestPath));
  if (readFileSync(indexPath, "utf8") !== indexText) stale.push(relative(here, indexPath));
  if (stale.length) throw new Error(`generated inventory is stale: ${stale.join(", ")}`);
  const artifactLines = [manifestPath, indexPath, fileURLToPath(import.meta.url)]
    .map((path) => readFileSync(path, "utf8").split("\n").length - 1)
    .reduce((sum, count) => sum + count, 0);
  if (artifactLines > 2500) throw new Error(`inventory artifacts exceed 2500 lines: ${artifactLines}`);
  console.log(JSON.stringify({ status: "ok", artifactLines, ...built.counts }));
} else {
  writeFileSync(manifestPath, manifestText);
  writeFileSync(indexPath, indexText);
  console.log(JSON.stringify({ status: "generated", ...built.counts }));
}
