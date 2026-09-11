import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  manifestExclusionViolations,
  validatePrivateCoreStart,
} from "../architecture/checks/private-core-start.mjs";
import { isStartingBaseAncestor } from "../architecture/checks/tracked-file-custody.mjs";
import { CORE_DEVELOPMENT_DEPENDENCIES } from "../architecture/checks/assembly-admission.mjs";
import { ACCEPTED_AUTHORITY_LEDGER_DIGEST } from "../architecture/checks/governance.mjs";

import { readCurrentM2Authority, M2_LOCK_DECISION, M2_LOCK_WITNESS } from "../architecture/checks/m2-lock-witness.mjs";

const exec = promisify(execFile);
const roadmapPath = "docs/architecture/mvp-implementation-roadmap.md";
const roadmap = await readFile(roadmapPath, "utf8");
const block = /<!-- get-modular:private-core-start -->\s*```json\s*\n([\s\S]*?)\n```\s*<!-- \/get-modular:private-core-start -->/u;
// Historical M1 fixture, independent of the currently activated roadmap record.
const recorded = {
  repository: "agent-teams-ai/get-modular",
  baseCommit: "0f7d2fc64ae7258781e6c2676ca1e0ccc377f418",
  authorityDigest: "sha256:9ba074210704a20f6a3ef7486f3cf2ec7435fb0fc5552cca210b6d3d5d73f077",
  approvedBy: "product-owner", approvedOn: "2026-09-04", status: "authorized",
  package: "@get-modular/core",
  scope: ["semantics", "object-entry", "publication-not-claimed"],
  excluded: ["raw-carriers", "raw-entry-export", "runtime-lifecycle",
    "conformance-claims", "proposed-contract-claims", "generated-self-composition-claims"],
};
const markdownJson = json => `<!-- get-modular:private-core-start -->\n\n\`\`\`json\n${json}\n\`\`\`\n<!-- /get-modular:private-core-start -->`;
const markdown = value => markdownJson(JSON.stringify(value));
const artifacts = ["packages/core/package.json", "packages/core/src/features/example/internal.ts"];
// The accepted ADR-0012 carrier shape, which governance:check requires of the
// core identity whenever no publication blocker is open.
const carrier = {
  private: true,
  type: "module",
  exports: {
    ".": {
      import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
      default: "./dist/index.js",
    },
  },
};
const check = (text, extra = {}) => validatePrivateCoreStart({
  markdown: text, productionArtifacts: artifacts,
  authorityDigest: ACCEPTED_AUTHORITY_LEDGER_DIGEST,
  isStartingBase: async base => base === recorded.baseCommit,
  readPackageManifest: async () => ({ name: "@get-modular/core", private: true, type: "module" }),
  ...extra,
});
const actualInputs = {
  isStartingBase: base => isStartingBaseAncestor(base, resolve(".")),
  readPackageManifest: async path => JSON.parse(await readFile(path, "utf8")),
  readM2Authority: () => readCurrentM2Authority(path => readFile(path)),
};

test("private Core start is optional without a package but mandatory for the first artifact", async () => {
  await check("# No start record", { productionArtifacts: [] });
  await assert.rejects(check("# No start record"), /record is required/u);
  await check(markdown(recorded));
  await check(roadmap, actualInputs);
  await check(roadmap, { ...actualInputs, productionArtifacts: [] });
});

test("current M3 record retains the original authority and bounded implementation scope", async () => {
  const current = JSON.parse(block.exec(roadmap)[1]);
  assert.equal(current.baseCommit, "bdeabe942676fd2a12c9ad59ce83658b60d85ffc");
  assert.equal(current.authorityDigest, recorded.authorityDigest);
  assert.equal(current.approvedOn, "2026-09-07");
  assert.equal(current.approvedBy, "product-owner");
  assert.equal(current.status, "authorized");
  assert.deepEqual(current.scope, [...recorded.scope, "raw-carriers",
    "raw-entry-export", "duplicate-binding-records", "generated-self-composition"]);
  assert.deepEqual(current.excluded, ["runtime-lifecycle",
    "conformance-claims", "proposed-contract-claims"]);
  await check(roadmap, actualInputs);
  await assert.rejects(check(roadmap, {
    ...actualInputs, readM2Authority: undefined,
  }), /M2 accepted authority is missing/u);
});

test("private Core start rejects independent authority, scope and identity mutations", async () => {
  const mutations = [
    { repository: "another/repository" }, { approvedBy: "reviewer" },
    { status: "proposed" }, { approvedOn: "tomorrow" },
    { authorityDigest: "sha256:" + "0".repeat(64) },
    { package: "@get-modular/conformance" }, { package: "@rogue/pkg" },
    { scope: [...recorded.scope, "raw-carriers"] }, { scope: [] },
    { excluded: recorded.excluded.slice(1) }, { scope: Array(2).fill(recorded.scope[0]) },
    { baseCommit: "main" }, { baseCommit: "-x" }, { baseCommit: "a".repeat(40) },
    { additional: true },
  ];
  for (const mutation of mutations) {
    await assert.rejects(check(markdown({ ...recorded, ...mutation })),
      /GOVERNANCE_CHECK_FAILED: private Core start/u, JSON.stringify(mutation));
  }
  const missing = { ...recorded }; delete missing.approvedBy;
  await assert.rejects(check(markdown(missing)), /closed format/u);
  await assert.rejects(check(roadmap, { ...actualInputs, productionArtifacts: ["packages/conformance/package.json"] }), /outside the authorized package/u);
  await assert.rejects(check(markdown(recorded), { productionArtifacts: ["packages/assembly/package.json"] }), /outside the authorized package/u);
  await assert.rejects(check(roadmap, { ...actualInputs, productionArtifacts: ["packages/core-other/index.ts"] }), /outside the authorized package/u);
});

test("private Core start rejects missing, duplicate and malformed record delimiters", async () => {
  for (const value of [null, [], {}, true]) await assert.rejects(check(markdown(value)), /closed format/u);
  await assert.rejects(check(roadmap + markdown(recorded)), /exactly once/u);
  await assert.rejects(check(markdown(recorded).replace("```json", "```yaml")), /one JSON block/u);
  await assert.rejects(check(markdown(recorded).replace(/\{[^\n]*\}/u, "{")), /valid JSON/u);
  await assert.rejects(check(markdown(recorded).replace("<!-- /get-modular:private-core-start -->", "")), /exactly once/u);
  await assert.rejects(check("<!-- /get-modular:private-core-start -->\n<!-- get-modular:private-core-start -->"), /out of order/u);
});

test("private Core start binds the actual manifest identity, not only its directory", async () => {
  for (const manifest of [null, {}, { name: "@get-modular/conformance" }]) {
    await assert.rejects(check(roadmap, { ...actualInputs, readPackageManifest: async () => manifest }),
      /manifest identity/u);
  }
});

test("private Core start rejects repeated JSON members in either order", async () => {
  const members = JSON.stringify(recorded).slice(1, -1);
  for (const field of ["package", "approvedBy", "scope", "authorityDigest"]) {
    for (const value of [recorded[field], "unauthorized"]) {
      const extra = `${JSON.stringify(field)}:${JSON.stringify(value)}`;
      for (const json of [
        `{${extra},${members}}`,
        `{${members},${extra}}`,
      ]) {
        assert.doesNotThrow(() => JSON.parse(json));
        await assert.rejects(check(markdownJson(json)), /duplicate members/u);
      }
    }
  }
  const escaped = `{"\\u0070ackage":"@get-modular/core",${members}}`;
  assert.doesNotThrow(() => JSON.parse(escaped));
  await assert.rejects(check(markdownJson(escaped)), /duplicate members/u);
});

test("starting base survives descendant commits without per-commit approval", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gm-start-ancestry-"));
  const git = (...args) => exec("git", args, { cwd: directory });
  try {
    await git("init", "--quiet", "--initial-branch=main");
    await git("config", "user.name", "Fixture");
    await git("config", "user.email", "fixture@example.invalid");
    await git("config", "commit.gpgsign", "false");
    await git("commit", "--quiet", "--allow-empty", "-m", "base");
    const base = (await git("rev-parse", "HEAD")).stdout.trim();
    await git("commit", "--quiet", "--allow-empty", "-m", "implementation step");
    const descendant = (await git("rev-parse", "HEAD")).stdout.trim();
    assert.equal(await isStartingBaseAncestor(base, directory), true);
    await git("checkout", "--quiet", "--detach", base);
    assert.equal(await isStartingBaseAncestor(descendant, directory), false);
    await assert.rejects(isStartingBaseAncestor("main", directory), /invalid starting/u);
    await assert.rejects(isStartingBaseAncestor("f".repeat(40), directory));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("real governance entrypoint consumes the start record before admitting private source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gm-start-gate-"));
  const repositoryRoot = resolve(".");
  const fixture = join(directory, "repository");
  try {
    await exec("git", ["clone", "--quiet", "--no-hardlinks", repositoryRoot, fixture]);
    // The clone carries HEAD, so without this the fixture would exercise the
    // committed checkers rather than the ones under test and a local run before
    // a commit would report a stale result.
    await cp(join(repositoryRoot, "architecture/checks"), join(fixture, "architecture/checks"), {
      recursive: true,
      force: true,
    });
    for (const path of [M2_LOCK_DECISION, M2_LOCK_WITNESS]) {
      await cp(join(repositoryRoot, path), join(fixture, path));
    }
    await exec("git", ["add", M2_LOCK_DECISION, M2_LOCK_WITNESS], { cwd: fixture });
    await writeFile(join(fixture, roadmapPath), roadmap);
    await exec("git", ["add", "architecture/checks"], { cwd: fixture });
    await symlink(join(repositoryRoot, "node_modules"), join(fixture, "node_modules"), "junction");
    await mkdir(join(fixture, "packages/core/src/features/example"), { recursive: true });
    // Assembly admission now requires Core's development catalog pins on the live
    // package graph; the start-gate fixture must keep that shape or governance
    // fails before the start record is even read.
    const coreCarrier = {
      ...carrier,
      name: "@get-modular/core",
      devDependencies: { ...CORE_DEVELOPMENT_DEPENDENCIES },
    };
    await writeFile(join(fixture, "packages/core/package.json"), JSON.stringify(coreCarrier));
    await writeFile(join(fixture, artifacts[1]), "export const fixture = true;\n");
    const git = (...args) => exec("git", args, { cwd: fixture });
    const gate = () => exec(process.execPath, ["architecture/checks/governance.mjs"], { cwd: fixture });
    await git("add", "packages/core", roadmapPath);
    await gate();
    await writeFile(join(fixture, "packages/core/package.json"), JSON.stringify({
      ...coreCarrier,
      name: "@get-modular/conformance",
    }));
    await git("add", "packages/core/package.json");
    await assert.rejects(gate(), error => /(?:private Core start.*manifest identity|Assembly admission Core identity)/u.test(error.stderr));
    await writeFile(join(fixture, "packages/core/package.json"), JSON.stringify(coreCarrier));
    await git("add", "packages/core/package.json");
    for (const replacement of ["", markdown({ ...recorded, approvedBy: "reviewer" })]) {
      await writeFile(join(fixture, roadmapPath), roadmap.replace(block, replacement));
      await git("add", roadmapPath);
      await assert.rejects(gate(), error => /private Core start/u.test(error.stderr));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Core start enforces the excluded list against the manifest", async () => {
  const publicManifest = {
    name: "@get-modular/core",
    type: "module",
    exports: { ".": { import: { default: "./dist/index.js" }, default: "./dist/index.js" } },
  };

  // The reissued record excludes neither publication nor public exports, so the
  // accepted export map of ADR-0012 passes.
  assert.ok(!recorded.excluded.includes("publication"));
  assert.ok(!recorded.excluded.includes("public-exports"));
  assert.deepEqual(manifestExclusionViolations(recorded.excluded, publicManifest), []);
  await check(markdown(recorded), { readPackageManifest: async () => publicManifest });

  // A narrower record makes the field enforceable rather than decorative.
  assert.deepEqual(
    manifestExclusionViolations(["public-exports"], publicManifest),
    [{ exclusion: "public-exports", declared: ["exports"] }],
  );
  assert.deepEqual(
    manifestExclusionViolations(["publication"], { ...publicManifest, files: ["dist"] }),
    [{ exclusion: "publication", declared: ["exports", "files"] }],
  );
  assert.deepEqual(
    manifestExclusionViolations(["publication", "public-exports"], { private: true }),
    [],
  );

  // A record whose excluded list leaves the closed format is rejected outright.
  await assert.rejects(
    check(markdown({ ...recorded, excluded: [...recorded.excluded, "publication"] })),
    /scope is not the bounded/u,
  );
});
