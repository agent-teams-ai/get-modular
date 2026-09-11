import assert from "node:assert/strict";
import test from "node:test";
import { releaseOwnedFileViolations } from "../architecture/checks/release-owned-files.mjs";

const repo = "agent-teams-ai/get-modular";
const baseline = "architecture/public-api/core.json";

test("allows first-adoption create of public-api baselines off the release branch", () => {
  for (const status of ["A", "C"]) {
    assert.deepEqual(
      releaseOwnedFileViolations([{ status, path: baseline }], "feat/adopt-public-api", repo, repo),
      [],
    );
  }
});

test("rejects modify, move, and delete of public-api baselines off the release branch", () => {
  for (const status of ["M", "D", "T"]) {
    assert.deepEqual(
      releaseOwnedFileViolations([{ status, path: baseline }], "feat/hide-break", repo, repo),
      [baseline],
    );
  }
  assert.deepEqual(
    releaseOwnedFileViolations(
      [{ status: "R", previousPath: baseline, path: "tmp/core.json" }],
      "feat/move-baseline",
      repo,
      repo,
    ),
    [baseline],
  );
  assert.deepEqual(
    releaseOwnedFileViolations(
      [{ status: "R", previousPath: "tmp/core.json", path: baseline }],
      "feat/move-onto-baseline",
      repo,
      repo,
    ),
    [baseline],
  );
});

test("allows trusted changeset-release mutations only when head repository equals base", () => {
  assert.deepEqual(
    releaseOwnedFileViolations([{ status: "M", path: baseline }], "changeset-release/main", repo, repo),
    [],
  );
  assert.deepEqual(
    releaseOwnedFileViolations(
      [{ status: "D", path: "architecture/public-api/assembly.json" }],
      "changeset-release/main",
      repo,
      repo,
    ),
    [],
  );
  assert.deepEqual(
    releaseOwnedFileViolations(
      [{ status: "M", path: baseline }],
      "changeset-release/main",
      "attacker/get-modular",
      repo,
    ),
    [baseline],
  );
});
