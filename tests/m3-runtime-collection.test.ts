import assert from "node:assert/strict";
import test from "node:test";
import { collectRows, parseArguments, ROWS } from "./qualification/m3-runtime-matrix.mjs";

// Transport completeness is separate from driver execution and release authority.
const requiredRows = [
  "node-24-linux", "node-24-macos", "node-24-windows",
  "chromium-window", "chromium-dedicated-worker", "electron-desktop-smoke",
] as const;
const expected = {
  sourceCommit: "a".repeat(40), runnerCommit: "a".repeat(40),
  archiveArtifactId: "123",
  archiveIdentity: {
    sha256: "b".repeat(64),
    integrity: `sha512-${Buffer.alloc(64, 1).toString("base64")}`,
  },
};
function fixtures() {
  const platforms = ["linux", "darwin", "win32", "linux", "linux", "linux"];
  return requiredRows.map((id, index) => ({
    group: `m3-rows-${id.startsWith("node-") ? id : "native"}`,
    file: `${id}.json`,
    record: {
      ...structuredClone(expected), runtimeCaseId: id as string,
      platform: platforms[index]!, claim: "not-claimed",
      scope: "partial-same-generated-archive-diagnostics", outcome: "verified",
      diagnostic: {
        path: id.startsWith("node-") ? `${id}-capture/summary.json`
          : id.startsWith("chromium-") ? "chromium/result.json" : "electron/result.json",
        sha256: "c".repeat(64),
      },
    },
  }));
}
type Rows = ReturnType<typeof fixtures>;
function rejects(mutate: (rows: Rows) => void, reason: RegExp) {
  const rows = fixtures();
  mutate(rows);
  assert.throws(() => collectRows(rows, expected), reason);
}

test("M3 collects all six same-archive rows without promoting their claim", () => {
  assert.deepEqual(ROWS, requiredRows);
  const result = collectRows(fixtures().reverse(), expected);
  assert.equal(result.outcome, "six-diagnostic-rows-verified");
  assert.equal(result.claim, "not-claimed");
  assert.equal(result.scope, "partial-same-generated-archive-diagnostics");
  assert.deepEqual(result.rows.map((row: { runtimeCaseId: string }) => row.runtimeCaseId), requiredRows);
  assert.match(result.limitation, /no custody, conformance or publication claim/u);
});

test("M3 rejects a missing, additional, duplicated or substituted runtime row", () => {
  for (let index = 0; index < requiredRows.length; index += 1) {
    rejects(rows => { rows.splice(index, 1); }, /exactly six rows/u);
  }
  rejects(rows => { rows.push(structuredClone(rows[0]!)); }, /exactly six rows/u);
  rejects(rows => { rows[1] = structuredClone(rows[0]!); }, /duplicate row/u);
  rejects(rows => { rows[0]!.record.runtimeCaseId = "node-26-linux"; }, /substituted row/u);
});

test("M3 rejects a changed source, runner, artifact or archive identity in any row", () => {
  const mutations = [
    ["sourceCommit", "d".repeat(40), /wrong source/u],
    ["runnerCommit", "d".repeat(40), /wrong runner/u],
    ["archiveArtifactId", "456", /wrong archive artifact/u],
  ] as const;
  for (let index = 0; index < requiredRows.length; index += 1) {
    for (const [field, value, reason] of mutations) {
      rejects(rows => { rows[index]!.record[field] = value; }, reason);
    }
    rejects(rows => { rows[index]!.record.archiveIdentity.sha256 = "d".repeat(64); }, /wrong archive bytes/u);
    rejects(rows => { rows[index]!.record.archiveIdentity.integrity = `sha512-${Buffer.alloc(64, 2).toString("base64")}`; }, /wrong archive bytes/u);
  }
});

test("M3 rejects misplaced records and substituted driver evidence locators", () => {
  rejects(rows => { rows[0]!.group = "m3-rows-native"; }, /substituted artifact group/u);
  rejects(rows => { rows[0]!.file = "chromium-window.json"; }, /substituted row filename/u);
  rejects(rows => { rows[0]!.record.platform = "darwin"; }, /wrong actual OS/u);
  for (const path of ["../summary.json", "/summary.json", "chromium/result.json"]) {
    rejects(rows => { rows[0]!.record.diagnostic.path = path; }, /wrong driver result/u);
  }
  rejects(rows => { rows[0]!.record.diagnostic.sha256 = "not-a-digest"; }, /match/u);
  rejects(rows => { Object.assign(rows[0]!.record.diagnostic, { alternate: "result.json" }); }, /deep-equal/u);
});

test("M3 refuses incomplete diagnostics, added fields and qualification claims", () => {
  for (const outcome of ["failed", "pending", "skipped"]) {
    rejects(rows => { rows[0]!.record.outcome = outcome; }, /failed or incomplete/u);
  }
  rejects(rows => { rows[0]!.record.claim = "release-eligible"; }, /not-claimed/u);
  rejects(rows => { rows[0]!.record.scope = "qualified"; }, /partial-same-generated-archive/u);
  rejects(rows => { Object.assign(rows[0]!.record, { releaseEligible: true }); }, /deep-equal/u);
});

test("M3 requires exact dispatch identity and closed driver commands", () => {
  for (const patch of [
    { sourceCommit: "main" }, { runnerCommit: "d".repeat(40) },
    { archiveArtifactId: "0" }, { archiveArtifactId: "123suffix" },
    { archiveIdentity: { ...expected.archiveIdentity, sha256: "invalid" } },
    { archiveIdentity: { ...expected.archiveIdentity, integrity: "sha512-invalid" } },
  ]) assert.throws(() => collectRows(fixtures(), { ...expected, ...patch }));
  for (const command of ["init", "pack", "native", "collect"]) {
    assert.deepEqual(parseArguments([command]), { command, row: undefined });
    assert.throws(() => parseArguments([command, "extra"]), /closed arguments/u);
  }
  for (const row of requiredRows.slice(0, 3)) assert.deepEqual(parseArguments(["node", row]), { command: "node", row });
  for (const args of [[], ["publish"], ["node"], ["node", "node-26-linux"], ["node", "chromium-window"]]) {
    assert.throws(() => parseArguments(args));
  }
});
