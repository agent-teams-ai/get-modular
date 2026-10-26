import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runGrowthCorrectness } from "../qualification/consumer-fixtures/growth/run.mjs";
import { readUpstreamCandidate, upstreamSelection } from "../qualification/consumer-fixtures/growth/upstream-compiler.ts";
import { growthSourceAuthority, runGrowthSourceCorrectness } from "../qualification/consumer-fixtures/growth/source.ts";

test("growth CMS witness matches authenticated current guidance without expanding adoption", async () => {
  const { loadSdkGrowthModel, validateCmsGuidance } = await import("../../architecture/checks/sdk-growth.mjs");
  const model = await loadSdkGrowthModel();
  validateCmsGuidance(model);
  const witness = growthSourceAuthority.reviewedCms;
  assert.deepEqual(witness, {
    repository: model.cmsReview.repository, path: model.cmsReview.path, anchor: model.cmsReview.anchor,
    ...model.cmsReview.acceptedCurrent,
    scope: `selected flat growth source predicates; production adoption ${model.cmsReview.growthScopeReview.productionAdoption}`,
  });
  assert.equal(Object.isFrozen(growthSourceAuthority), true);
  assert.equal(Object.isFrozen(witness), true);
  assert.equal(model.cmsReview.growthScopeReview.observation, "not-selected");
  assert.equal(model.cmsReview.scopeReview.activation, "hold");
});

test("growth source qualifies its flat mapping through installed public owners", { timeout: 600000 }, async t => {
  t.diagnostic(JSON.stringify(await runGrowthSourceCorrectness()));
});

// Let the existing 600-second supervisor retain its failure report before this outer guard.
test("G-01: the real eight-feature tree passes independent oracles and complete smoke", { timeout: 660000 }, async t => {
  const report = await runGrowthCorrectness();
  assert.equal(report.size, 8);
  assert.deepEqual(report.scenarios, ["G-01"]);
  assert.equal(report.identities.compiler.name, "typescript", "ordinary G-01 keeps the installed supported compiler");
  t.diagnostic(JSON.stringify(report));
});

test("an explicit upstream candidate rejects binary drift before compiling the consumer", async t => {
  const directory = await mkdtemp(join(tmpdir(), "gm-growth-candidate-identity-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cli = join(directory, "compiler-fixture");
  await writeFile(cli, "identity fixture; never executed\n");
  const manifest = join(directory, "candidate.json");
  await writeFile(manifest, JSON.stringify({ kind: "unreleased-upstream-native-candidate", source: upstreamSelection,
    go: { version: "go1.27.2", archiveSha256: "ecbadb99091a3f46e31f5f934b068b1864eafa7995211b39eaddf76996045fe5" },
    version: "7.1.0-dev", cli, binarySha256: createHash("sha256").update(await readFile(cli)).digest("hex") }));
  assert.equal((await readUpstreamCandidate(manifest)).cli, cli);
  await writeFile(cli, "changed compiler bytes\n");
  await assert.rejects(readUpstreamCandidate(manifest), /fixture.growth.candidate-binary-drift/u);
});
