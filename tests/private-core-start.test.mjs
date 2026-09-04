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
import { ACCEPTED_AUTHORITY_LEDGER_DIGEST } from "../architecture/checks/governance.mjs";

const exec = promisify(execFile);
const roadmapPath = "docs/architecture/mvp-implementation-roadmap.md";
const roadmap = await readFile(roadmapPath, "utf8");
const block = /<!-- get-modular:private-core-start -->\s*```json\s*\n([\s\S]*?)\n```\s*<!-- \/get-modular:private-core-start -->/u;
const recorded = JSON.parse(block.exec(roadmap)[1]);
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

test("private Core start is optional without a package but mandatory for the first artifact", async () => {
  await check("# No start record", { productionArtifacts: [] });
  await assert.rejects(check("# No start record"), /record is required/u);
  await check(roadmap);
  await check(roadmap, { productionArtifacts: [] });
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
  await assert.rejects(check(roadmap, { productionArtifacts: ["packages/conformance/package.json"] }), /outside the authorized package/u);
  await assert.rejects(check(roadmap, { productionArtifacts: ["packages/core-other/index.ts"] }), /outside the authorized package/u);
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
    await assert.rejects(check(roadmap, { readPackageManifest: async () => manifest }),
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
    await exec("git", ["add", "architecture/checks"], { cwd: fixture });
    await symlink(join(repositoryRoot, "node_modules"), join(fixture, "node_modules"), "junction");
    await mkdir(join(fixture, "packages/core/src/features/example"), { recursive: true });
    await writeFile(join(fixture, "packages/core/package.json"), JSON.stringify({ ...carrier, name: "@get-modular/core" }));
    await writeFile(join(fixture, artifacts[1]), "export const fixture = true;\n");
    const git = (...args) => exec("git", args, { cwd: fixture });
    const gate = () => exec(process.execPath, ["architecture/checks/governance.mjs"], { cwd: fixture });
    await git("add", "packages/core");
    await gate();
    await writeFile(join(fixture, "packages/core/package.json"), JSON.stringify({ ...carrier, name: "@get-modular/conformance" }));
    await git("add", "packages/core/package.json");
    await assert.rejects(gate(), error => /private Core start.*manifest identity/u.test(error.stderr));
    await writeFile(join(fixture, "packages/core/package.json"), JSON.stringify({ ...carrier, name: "@get-modular/core" }));
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
