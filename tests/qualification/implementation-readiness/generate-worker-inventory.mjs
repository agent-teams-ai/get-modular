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
const generatorPath = fileURLToPath(import.meta.url);
const inventorySubjectSha = "e0388dc6a3dd72f114e83b41768f4ceefe7cc87c";
const inventorySourceBundle = {
  exactCommit: inventorySubjectSha,
  sha256: "5a129322ced656fb37a1857fd9d9bb1df1a34f78a336c8e13c379c28b7ed581b",
  path: { value: null, reason: "coordinator-supplied-bundle-path-not-retained" }
};
const initialBaseSha = "0f7d2fc64ae7258781e6c2676ca1e0ccc377f418";
const launchContractSubjectSha = "f6a81e029098de30d46d8cf3737fadb4a16ed098";
const disputeSubjectSha = "2bef472612dea7c6a89199a47dd8ca7ed552e630";
const disputeDir = join(rawDir, "dispute-critics-2bef472");
const disputeBundlePath = join(disputeDir, "bundle-manifest.json");
const disputeBundleSha256 = "abd9ea322b17ef5a0a2cc7bd1ed01cb8d0971257b2a7df07b2e688ded3b0830e";
const disputeProtocolPath = join(readinessDir, "dispute-critic-protocol.md");
const disputeProtocolSha256 = "1f8f6f46e552a934f59a901fd28153634df5445d764684de8c89be9e9891b4b5";
const disputeTopics = [
  "descriptor-vs-define-module", "cardinality-helpers", "dependency-record",
  "declaration-activation", "stage0-stage1", "identity-locality",
  "pure-di-composition", "private-boundary"
];
const disputeRoles = [
  "correctness-determinism", "clean-architecture-solid-ddd",
  "security-failure-modes", "real-world-dx-maintenance"
];
const disputeTaskIds = disputeTopics.flatMap((_, topicIndex) =>
  disputeRoles.map((__, roleIndex) =>
    `gm-dispute-t${topicIndex + 1}-r${roleIndex + 1}-2bef-20260904`));
const remediationDir = join(rawDir, "remediation-workers");
const remediationFiles = new Map([
  ["manifest-compact.latest-result.json", "dc65b4beff939c60f3d1475c5b834503c45cb44e283bb850cdf3bb96118d1427"],
  ["manifest-oversized-partial.latest-result.json", "6b03ed8a0af9b2579cb0352ed4e96005aa73a545e28d77d00a62b54e96b450e0"]
]);
const compactManifestTaskId = "gm-manifest-compact-f6-20260904";
const oversizedManifestTaskId = "gm-goal-worker-manifest-remediation-l-new-20260904";
const launchContract = {
  locator: `git:${launchContractSubjectSha}:research/implementation-readiness/worker-manifest.json`,
  sha256: "24f3daf720d4b26aded018557b93eeda086e487b4826e6c3cfabb3b095569747",
  note: "Immutable pre-remediation manifest at the supplied commit; used only for launch defaults that it explicitly records."
};
const unknown = (reason) => ({ value: null, reason });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const outputSummary = (result) =>
  result.evidence?.find((item) => item.startsWith("output_summary:"))?.slice(15) ?? "";

function summaryFieldValues(summary, field) {
  const pattern = new RegExp(`(?:^|[,{\\s])["']?${field}["']?\\s*:\\s*["']?([a-z0-9_-]+)`, "gim");
  return [...summary.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

function walk(path) {
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)])
    .sort();
}

function sourceId(path) {
  return relative(evidenceDir, path).replaceAll("\\", "/");
}

function disputeAssignment(taskId) {
  const match = taskId.match(/^gm-dispute-t([1-8])-r([1-4])-2bef-20260904$/);
  if (!match) return null;
  const topicIndex = Number(match[1]);
  const roleIndex = Number(match[2]);
  return {
    cell: `T${topicIndex}-R${roleIndex}`,
    topic: disputeTopics[topicIndex - 1],
    role: disputeRoles[roleIndex - 1]
  };
}

function trackAndRole(taskId) {
  let match;
  const assignment = disputeAssignment(taskId);
  if (assignment) return ["dispute-critics-2bef472", assignment.cell];
  if (taskId === compactManifestTaskId || taskId === oversizedManifestTaskId)
    return ["inventory-remediation", "MANIFEST"];
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
  ["gm-goal-api-lab-exact-corpus-l-old-20260904", "gm-goal-api-lab-remediation-20260904"],
  [oversizedManifestTaskId, compactManifestTaskId]
]);

function profileFor(track, taskId) {
  if (taskId === "gm-goal-api-lab-exact-corpus-l-old-20260904") return "correction-not-retained";
  return {
    "track-a-readiness": "research-xhigh",
    "track-b-api-authoring": "fixtures-medium",
    "oss-reference": "research-xhigh",
    integrators: "integrator-xhigh",
    "dispute-critics": "critic-xhigh",
    "dispute-critics-2bef472": "dispute-critic-xhigh",
    "final-review": "final-review-xhigh",
    "inventory-remediation": "inventory-remediation-not-retained",
    "api-lab-remediation": "remediation-not-retained",
    "completion-audit": "audit-not-retained"
  }[track];
}

function subjectKind(track) {
  return ["track-b-api-authoring", "api-lab-remediation", "inventory-remediation"].includes(track) ? "base" : "reviewed";
}

function evidenceStatus(taskId, result, track) {
  if (track === "dispute-critics-2bef472") return "review-only";
  if (taskId === "gm-api-b1-lane-l-20260903") return "partial";
  if (taskId === "gm-api-b3-lane-l-20260903" ||
      taskId === "gm-goal-api-lab-exact-corpus-l-old-20260904") return "blocked";
  if (result.status === "partial") return "partial";
  if (track === "oss-reference" && !taskId.startsWith("gm-oss-o6-")) return "source-unavailable";
  if (["track-b-api-authoring", "api-lab-remediation", "inventory-remediation"].includes(track)) return "positive";
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

function createProfiles(disputeBundle) {
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
    "dispute-critic-xhigh": {
      model: disputeBundle.model,
      reasoningEffort: disputeBundle.reasoningEffort,
      serviceTier: disputeBundle.serviceTier,
      ownership: "read-only dispute criticism",
      network: { requested: false, enforced: disputeBundle.networkAccess },
      provenance: "retained dispute critic protocol, bundle manifest, and result wrappers"
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
    },
    "inventory-remediation-not-retained": {
      model: unknown("not-retained-by-result-wrapper"),
      reasoningEffort: unknown("not-retained-by-result-wrapper"),
      serviceTier: unknown("not-retained-by-result-wrapper"),
      ownership: unknown("not-retained-by-result-wrapper"),
      network: {
        requested: unknown("not-retained-by-result-wrapper"),
        enforced: unknown("not-retained-by-result-wrapper")
      },
      provenance: "raw remediation result wrappers"
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
  const disputeBundle = readJson(disputeBundlePath);
  const historicalRawPaths = walk(rawDir).filter((path) => path.endsWith(".result.json"));
  const disputeWrapperPaths = disputeTaskIds.map((taskId) =>
    join(disputeDir, `${taskId}.latest-result.json`));
  const remediationPaths = [...remediationFiles.keys()].map((file) => join(remediationDir, file));
  const rawPaths = [...historicalRawPaths, ...disputeWrapperPaths, ...remediationPaths];
  const raw = rawPaths.map((path) => ({ path, bytes: readFileSync(path), result: readJson(path) }));
  const digestGroups = Map.groupBy(raw, (item) => sha256(item.bytes));
  const disputeBundleSource = sourceId(disputeBundlePath);
  const disputeProtocolSourceId = "protocol/dispute-critic-protocol.md";
  const sources = [combinedPath, reconciliationPath, hostPath].map((path) => ({
    id: sourceId(path), path: relative(repositoryRoot, path).replaceAll("\\", "/"),
    kind: "supporting", classification: "supporting", sha256: sha256(readFileSync(path))
  }));
  sources.push({
    id: disputeBundleSource,
    path: relative(repositoryRoot, disputeBundlePath).replaceAll("\\", "/"),
    kind: "bundle-manifest", classification: "supporting",
    sha256: sha256(readFileSync(disputeBundlePath))
  }, {
    id: disputeProtocolSourceId,
    path: relative(repositoryRoot, disputeProtocolPath).replaceAll("\\", "/"),
    kind: "critic-protocol", classification: "supporting",
    sha256: sha256(readFileSync(disputeProtocolPath))
  });
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
    const assignment = disputeAssignment(result.taskId);
    const rawSource = sourceId(path);
    const sourceRefs = [rawSource];
    if (combinedIds.has(result.taskId)) sourceRefs.push("combined-workers.json");
    if (["gm-api-b1-lane-l-20260903", "gm-api-b3-lane-l-20260903"].includes(result.taskId))
      sourceRefs.push("reconciliation.json");
    if (assignment) sourceRefs.push(disputeBundleSource, disputeProtocolSourceId);
    const isAttempt = attempts.has(result.taskId);
    const provenance = {
      default: rawSource,
      fields: {
        role: assignment
          ? `${disputeProtocolSourceId} closed assignment derived from taskId ${assignment.cell}`
          : "derived from retained taskId and campaign roster",
        ...(assignment ? {
          topic: `${disputeProtocolSourceId} closed assignment derived from taskId ${assignment.cell}`
        } : {}),
        classification: isAttempt ? "planned-role reconciliation in completion audit" : "planned campaign roster",
        execution: `worker-manifest.json#/executionProfiles/${profileFor(track, result.taskId)}`,
        ...(sourceRefs.includes("reconciliation.json") ? { "result.evidence": "reconciliation.json#/records" } : {}),
        ...(typeof worktreePath(result.taskId, result) === "string" ? { worktreePath: `${rawSource} output_summary` } : {})
      }
    };
    const remediation = result.taskId === compactManifestTaskId
      ? { outcome: "canonical-successful-successor", succeeds: oversizedManifestTaskId }
      : result.taskId === oversizedManifestTaskId
        ? { outcome: "partial-attempt", succeededBy: compactManifestTaskId }
        : null;
    return {
      workerId: result.taskId, runId: result.runId, logicalRole, track,
      ...(assignment ? { dispute: { topic: assignment.topic, role: assignment.role } } : {}),
      ...(remediation ? { remediation } : {}),
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
  const newTaskIds = new Set([...disputeTaskIds, compactManifestTaskId, oversizedManifestTaskId]);
  const historicalDigests = new Set(historicalRawPaths.map((path) => sha256(readFileSync(path))));
  const plannedRoleKeys = new Set(records.map((record) => `${record.track}/${record.logicalRole}`));
  const counts = {
    rawFiles: raw.length, byteUniqueRawResults: digestGroups.size,
    duplicateRawAliases: raw.length - digestGroups.size, records: records.length,
    historicalRawFiles: historicalRawPaths.length,
    historicalRecords: records.filter((record) => !newTaskIds.has(record.workerId)).length,
    historicalDuplicateRawAliases: historicalRawPaths.length - historicalDigests.size,
    disputeCriticRecords: records.filter((record) => record.track === "dispute-critics-2bef472").length,
    inventoryRemediationRecords: records.filter((record) => record.track === "inventory-remediation").length,
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
  const profiles = createProfiles(disputeBundle);
  const manifest = {
    schemaVersion: 2,
    inventoryId: "get-modular/implementation-readiness-worker-inventory/v2",
    repository: "agent-teams-ai/get-modular",
    inventorySubjectSha,
    inventorySourceBundle,
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
    disputeCriticEvidence: {
      subjectSha: disputeSubjectSha,
      sourceBundleSha256: disputeBundle.sourceBundleSha256,
      sourceBundlePath: unknown("not-retained-in-repository-evidence"),
      bundleManifest: disputeBundleSource,
      protocol: disputeProtocolSourceId,
      assignment: "Closed t1..t8 topic and r1..r4 role indices are derived from each taskId; nested output summaries are not used for assignment."
    },
    externalReviewBoundary: {
      rule: "Final exact-head review records belong in external PR/CI custody; committing them inside the commit they review would change that commit and make the evidence self-referential.",
      retainedHistoricalWave: reconciliation.historicalReviewerWave,
      externalWaves: [reconciliation.currentExternalReviewerWave, reconciliation.remediationReviewerWave],
      currentInventorySubject: inventorySubjectSha,
      currentInventoryReview: unknown("external-review-not-retained-in-reviewed-commit")
    },
    enumerationBoundary: "Records are limited to byte-unique input result wrappers retained at the supplied exact commit. The inventory-building worker, future integrators, and final exact-head reviewers are not claimed to be contained in the commit they produce or review; externally held review waves are counted only in aggregate.",
    sourceIndex: "research/implementation-readiness/evidence/worker-index.json#/sources",
    counts
  };
  return {
    manifest, sources, records, counts, combined, reconciliation, raw,
    historicalRawPaths, disputeWrapperPaths, remediationPaths, disputeBundle,
    disputeBundleSource, disputeProtocolSourceId
  };
}

function validate(built) {
  const {
    manifest, sources, records, counts, combined, reconciliation, raw,
    historicalRawPaths, disputeWrapperPaths, remediationPaths, disputeBundle,
    disputeBundleSource, disputeProtocolSourceId
  } = built;
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  const shaPattern = /^[0-9a-f]{40}$/;
  const digestPattern = /^[0-9a-f]{64}$/;
  const isUnknown = (value, reason) =>
    value?.value === null && value.reason === reason && Object.keys(value).length === 2;
  const required = ["workerId", "runId", "logicalRole", "track", "classification", "attemptOf", "execution", "subject", "worktreePath", "sources", "result", "commands", "changedFiles", "confidence", "unresolvedQuestions", "provenance"];
  require(manifest.inventorySubjectSha === inventorySubjectSha, "wrong inventory subject SHA");
  require(manifest.inventorySourceBundle.exactCommit === inventorySubjectSha, "inventory source bundle commit mismatch");
  require(manifest.inventorySourceBundle.sha256 === inventorySourceBundle.sha256, "inventory source bundle digest mismatch");
  require(digestPattern.test(manifest.inventorySourceBundle.sha256), "invalid inventory source bundle digest");
  require(isUnknown(manifest.inventorySourceBundle.path, "coordinator-supplied-bundle-path-not-retained"), "inventory source bundle path must remain explicitly unknown");
  require(manifest.launchContract.locator === `git:${launchContractSubjectSha}:research/implementation-readiness/worker-manifest.json`, "launch contract locator drifted");
  require(manifest.launchContract.sha256 === launchContract.sha256, "launch contract digest drifted");
  require(shaPattern.test(manifest.initialCampaignBaseSha), "invalid initial campaign base SHA");
  require(relative(repositoryRoot, generatorPath).replaceAll("\\", "/").startsWith("tests/qualification/"), "inventory generator left the qualification boundary");
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
    require(typeof source.path === "string" && source.path.length > 0, `${source.id}: source path missing from provenance`);
    require(digestPattern.test(source.sha256), `${source.id}: source digest missing from provenance`);
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
  const rawItemByTask = new Map(raw.map((item) => [item.result.taskId, item]));
  require(combined.results.length === 51, "combined worker count changed");
  for (const result of combined.results)
    require(JSON.stringify(result) === JSON.stringify(rawByTask.get(result.taskId)), `${result.taskId}: combined/raw mismatch`);
  require(records.find((record) => record.workerId === "gm-api-b1-lane-l-20260903")?.result.evidence === "partial", "B1 reconciliation lost");
  require(records.find((record) => record.workerId === "gm-api-b3-lane-l-20260903")?.result.evidence === "blocked", "B3 reconciliation lost");
  require(reconciliation.records.length === 2, "reconciliation record count changed");
  require(historicalRawPaths.length === 76, "historical raw file count changed");
  require(counts.historicalRawFiles === 76 && counts.historicalRecords === 63 && counts.historicalDuplicateRawAliases === 13, "historical record or alias retention drifted");
  require(counts.records === 97 && counts.rawFiles === 110 && counts.byteUniqueRawResults === 97 && counts.duplicateRawAliases === 13, "total retained raw count reconciliation failed");
  require(counts.disputeCriticRecords === 32 && counts.inventoryRemediationRecords === 2, "new inventory record count drifted");
  require(sources.filter((source) => source.classification === "canonical").length === counts.byteUniqueRawResults, "canonical source count reconciliation failed");
  require(sources.filter((source) => source.classification === "duplicate").length === counts.duplicateRawAliases, "duplicate source count reconciliation failed");
  require(sources.length === 115, "source provenance count drifted");
  require(counts.plannedRoles === 88 && counts.canonicalRecords === 88 && counts.attemptRecords === 9, "planned role/attempt reconciliation failed");
  require(counts.initialCampaignRecords === 51 && counts.initialCampaignPlannedRoles === 44, "initial campaign reconciliation failed");
  require(counts.retainedHistoricalFinalReviews === 6, "historical final-review retention count is not six");
  require(counts.retainedCompletionAudits === 4, "completion-audit retention count is not four");
  require(JSON.stringify(counts.wrapperStatuses) === JSON.stringify({ done: 94, partial: 3 }), "wrapper status count drifted");
  require(JSON.stringify(counts.evidenceStatuses) === JSON.stringify({ blocked: 2, partial: 4, positive: 11, "review-only": 75, "source-unavailable": 5 }), "evidence status count drifted");
  require(manifest.decisions.proposed.join(",") === "ADR-0009,ADR-0010,ADR-0011,ADR-0012,ADR-0013,ADR-0014,ADR-0016", "proposed decision set is wrong");

  require(sha256(readFileSync(disputeProtocolPath)) === disputeProtocolSha256, "dispute critic protocol bytes changed");
  require(sha256(readFileSync(disputeBundlePath)) === disputeBundleSha256, "dispute bundle manifest bytes changed");
  require(disputeBundle.exactSubjectSha === disputeSubjectSha, "dispute bundle subject SHA is wrong");
  require(disputeBundle.networkAccess === "disabled", "dispute bundle network mode is unexpected");
  require(disputeBundle.expectedTopicCount === 8 && disputeBundle.expectedRoleCountPerTopic === 4, "dispute bundle topic-role dimensions changed");
  require(disputeBundle.resultCount === 32 && disputeBundle.uniqueTopicRoleCount === 32, "dispute bundle result counts changed");
  require(disputeBundle.files?.length === 32, "dispute bundle file count changed");
  require(disputeBundle.topicRoleClosure?.length === 32, "dispute bundle closure count changed");
  require(manifest.disputeCriticEvidence.subjectSha === disputeSubjectSha, "manifest dispute subject SHA is wrong");
  require(manifest.disputeCriticEvidence.sourceBundleSha256 === disputeBundle.sourceBundleSha256, "manifest dispute source bundle digest is wrong");
  require(digestPattern.test(manifest.disputeCriticEvidence.sourceBundleSha256), "invalid dispute source bundle digest");
  require(manifest.disputeCriticEvidence.bundleManifest === disputeBundleSource, "manifest dispute bundle source is wrong");
  require(manifest.disputeCriticEvidence.protocol === disputeProtocolSourceId, "manifest dispute protocol source is wrong");

  const expectedDisputeFiles = disputeTaskIds.map((taskId) => `${taskId}.latest-result.json`).sort();
  const actualDisputeFiles = walk(disputeDir).map((path) => relative(disputeDir, path).replaceAll("\\", "/")).sort();
  require(JSON.stringify(actualDisputeFiles) === JSON.stringify(["bundle-manifest.json", ...expectedDisputeFiles].sort()), "dispute evidence directory membership changed");
  require(disputeWrapperPaths.length === 32, "dispute wrapper path count changed");
  const bundleByJob = new Map((disputeBundle.files ?? []).map((entry) => [entry.jobId, entry]));
  require(bundleByJob.size === 32, "dispute bundle contains duplicate job IDs");
  const expectedCells = new Set();
  const observedCells = new Set();
  for (const taskId of disputeTaskIds) {
    const assignment = disputeAssignment(taskId);
    const cell = `${assignment.topic}/${assignment.role}`;
    expectedCells.add(cell);
    const record = records.find((candidate) => candidate.workerId === taskId);
    const item = rawItemByTask.get(taskId);
    const bundleEntry = bundleByJob.get(taskId);
    require(record !== undefined, `${taskId}: missing critic record`);
    require(item !== undefined, `${taskId}: missing critic wrapper`);
    require(bundleEntry !== undefined, `${taskId}: missing bundle entry`);
    if (!record || !item || !bundleEntry) continue;
    const expectedFile = `${taskId}.latest-result.json`;
    require(bundleEntry.file === expectedFile, `${taskId}: bundle filename is wrong`);
    require(bundleEntry.topic === assignment.topic && bundleEntry.role === assignment.role, `${taskId}: bundle topic-role assignment is wrong`);
    require(record.logicalRole === assignment.cell, `${taskId}: logical cell is wrong`);
    require(record.dispute?.topic === assignment.topic && record.dispute?.role === assignment.role, `${taskId}: derived topic-role assignment is wrong`);
    observedCells.add(`${record.dispute?.topic}/${record.dispute?.role}`);
    require(record.subject.kind === "reviewed" && record.subject.sha === disputeSubjectSha, `${taskId}: critic subject is wrong`);
    require(record.classification === "canonical" && record.attemptOf === null, `${taskId}: critic record classification is wrong`);
    require(record.result.wrapper === "done", `${taskId}: critic wrapper status is not done`);
    require(record.result.evidence === "review-only", `${taskId}: critic conclusion is not review-only`);
    require(item.result.status === "done" && bundleEntry.wrapperStatus === "done", `${taskId}: retained wrapper status is not done`);
    require(Array.isArray(item.result.changedFiles) && item.result.changedFiles.length === 0 && bundleEntry.changedFileCount === 0, `${taskId}: critic wrapper is not read-only`);
    require(item.result.details?.baseCommit === disputeSubjectSha, `${taskId}: wrapper subject SHA is wrong`);
    require(bundleEntry.sha256 === sha256(item.bytes), `${taskId}: critic wrapper bytes changed`);
    require(record.sources.includes(sourceId(item.path)) && record.sources.includes(disputeBundleSource) && record.sources.includes(disputeProtocolSourceId), `${taskId}: critic source provenance is incomplete`);
    const summary = outputSummary(item.result);
    require(JSON.stringify(summaryFieldValues(summary, "exactSha")) === JSON.stringify([disputeSubjectSha]), `${taskId}: nested exact SHA is missing or wrong`);
    require(JSON.stringify(summaryFieldValues(summary, "networkRequested")) === JSON.stringify(["false"]), `${taskId}: requested network mode is unexpected`);
    require(JSON.stringify(summaryFieldValues(summary, "networkEnforced")) === JSON.stringify(["disabled"]), `${taskId}: enforced network mode is unexpected`);
  }
  require(expectedCells.size === 32 && observedCells.size === 32, "missing or duplicate derived dispute topic-role cell");
  require([...expectedCells].every((cell) => observedCells.has(cell)), "derived dispute topic-role closure is incomplete");
  const closureCells = new Set();
  for (const entry of disputeBundle.topicRoleClosure ?? []) {
    const assignment = disputeAssignment(entry.jobId);
    require(assignment !== null, `${entry.jobId}: bundle closure task ID is invalid`);
    if (!assignment) continue;
    require(entry.topic === assignment.topic && entry.role === assignment.role, `${entry.jobId}: bundle closure assignment is wrong`);
    closureCells.add(`${entry.topic}/${entry.role}`);
  }
  require(closureCells.size === 32 && [...expectedCells].every((cell) => closureCells.has(cell)), "bundle topic-role closure is missing or duplicated");
  const aggregate = createHash("sha256");
  for (const entry of [...(disputeBundle.files ?? [])].sort((a, b) => a.file.localeCompare(b.file)))
    aggregate.update(entry.file).update("\0").update(entry.sha256).update("\n");
  require(aggregate.digest("hex") === disputeBundle.aggregateSha256, "dispute wrapper aggregate digest mismatch");

  require(remediationPaths.length === 2, "remediation wrapper path count changed");
  for (const [file, expectedDigest] of remediationFiles) {
    const path = join(remediationDir, file);
    require(sha256(readFileSync(path)) === expectedDigest, `${file}: remediation wrapper bytes changed`);
  }
  const compact = records.find((record) => record.workerId === compactManifestTaskId);
  const oversized = records.find((record) => record.workerId === oversizedManifestTaskId);
  require(compact?.classification === "canonical" && compact.attemptOf === null, "compact manifest result is not canonical");
  require(compact?.result.wrapper === "done" && compact.result.evidence === "positive", "compact manifest result is not a successful successor");
  require(compact?.remediation?.outcome === "canonical-successful-successor" && compact.remediation.succeeds === oversizedManifestTaskId, "compact manifest successor relationship is wrong");
  require(oversized?.classification === "attempt" && oversized.attemptOf === compactManifestTaskId, "oversized manifest result is not an attempt of the compact result");
  require(oversized?.result.wrapper === "partial" && oversized.result.evidence === "partial", "oversized manifest result is not partial");
  require(oversized?.remediation?.outcome === "partial-attempt" && oversized.remediation.succeededBy === compactManifestTaskId, "oversized manifest successor relationship is wrong");
  const inventoryProfile = manifest.executionProfiles["inventory-remediation-not-retained"];
  for (const field of ["model", "reasoningEffort", "serviceTier", "ownership"])
    require(isUnknown(inventoryProfile[field], "not-retained-by-result-wrapper"), `inventory remediation ${field} must remain explicitly unknown`);
  require(isUnknown(inventoryProfile.network.requested, "not-retained-by-result-wrapper") && isUnknown(inventoryProfile.network.enforced, "not-retained-by-result-wrapper"), "inventory remediation network profile must remain explicitly unknown");
  if (errors.length) throw new Error(errors.join("\n"));
}

const built = build();
validate(built);
const manifestText = `${JSON.stringify(built.manifest, null, 2)}\n`;
const indexText = compactArrayDocument(
  {
    schemaVersion: 2,
    inventorySubjectSha,
    inventorySourceBundle,
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
