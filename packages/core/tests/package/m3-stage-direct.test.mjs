import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { stageDirectSubject } from "../../../../tests/qualification/m3-stage-direct.mjs";

const JS = "dist-stage0/self-composition/stage0-entry.js";
const DTS = "dist-stage0/self-composition/stage0-entry.d.ts";
const selected = "dist-stage0/src/features/selected/factory.js";
const typeFile = "dist-stage0/src/features/authoring/types.d.ts";
const transitiveType = "dist-stage0/src/features/authoring/detail.d.ts";
const root = "dist-stage0/src/composition/stage0.js";
const sentinel = "dist-stage0/src/features/unselected/factory.js";

function fixture(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), "gm-m3-stage-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const checkout = join(base, "source");
  const packageRoot = join(checkout, "packages/core");
  mkdirSync(packageRoot, { recursive: true });
  const put = (path, text) => {
    const file = join(packageRoot, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  put("package.json", JSON.stringify({
    name: "@get-modular/core", version: "0.1.0", license: "Apache-2.0",
    scripts: { prepare: "must never be copied or run" }, main: "wrong.js",
    dependencies: { forbidden: "*" },
  }));
  put("LICENSE", "Fixture license\n");
  put("README.md", "Fixture documentation\n");
  writeFileSync(join(checkout, ".gitignore"), "packages/core/dist-stage0/\n");
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
  Object.assign(env, {
    GIT_NO_REPLACE_OBJECTS: "1", GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
  });
  const git = args => execFileSync("git", args, {
    cwd: checkout, env, encoding: "utf8", timeout: 15_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git(["init", "--quiet"]);
  git(["add", "--", "."]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null",
    "commit", "--quiet", "-m", "bounded fixture"]);
  const expectedSha = git(["rev-parse", "HEAD"]);
  put(JS, 'export { root as compileComposition } from "../src/composition/stage0.js";\n');
  put(DTS, 'export type { Result } from "../src/features/authoring/types.js";\n');
  put(root, 'export { selected as root } from "../features/selected/factory.js";\n');
  put(selected, 'throw new Error("candidate code must never execute");\nexport const selected = 1;\n');
  put(typeFile, 'export type Result = import("./detail.js").Detail;\n');
  put(transitiveType, "export interface Detail { readonly ok: true }\n");
  put(sentinel, 'throw new Error("UNSELECTED_SENTINEL");\n');
  const options = {
    sourceCheckout: checkout, expectedSha, stagingDir: join(base, "direct"),
    javascriptEntry: join(packageRoot, JS), declarationEntry: join(packageRoot, DTS),
  };
  return { base, checkout, packageRoot, put, options, git };
}

function inventoryAt(directory, prefix = "") {
  return readdirSync(join(directory, prefix), { withFileTypes: true }).flatMap(entry => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? inventoryAt(directory, path) : [path];
  }).sort();
}

test("stages only reached bytes, preserving declaration-only dependencies", t => {
  const f = fixture(t);
  const result = stageDirectSubject(f.options);
  const expected = ["LICENSE", "README.md", "package.json",
    JS, DTS, root, selected, typeFile, transitiveType].sort();
  assert.deepEqual(inventoryAt(result.stagingDir), expected);
  assert.deepEqual(result.inventory.map(row => row.path), expected);
  for (const row of result.inventory) {
    const bytes = readFileSync(join(result.stagingDir, row.path));
    assert.equal(row.size, bytes.length);
    assert.equal(row.sha256, createHash("sha256").update(bytes).digest("hex"));
    if (row.path !== "package.json") {
      assert.deepEqual(bytes, readFileSync(join(f.packageRoot, row.path)));
    }
  }
  assert.equal(result.source.commit, f.options.expectedSha);
  assert.equal(result.source.checkout, f.checkout);
  assert.match(result.source.tree, /^[a-f0-9]{40}$/u);
  assert.equal(existsSync(join(result.stagingDir, sentinel)), false);
  const manifest = JSON.parse(readFileSync(join(result.stagingDir, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest), ["name", "version", "license", "type", "exports", "files"]);
  assert.deepEqual(manifest.exports, {
    ".": { import: { types: `./${DTS}`, default: `./${JS}` }, default: `./${JS}` },
  });
  assert.deepEqual(manifest.files, expected.filter(path => path !== "package.json"));
  assert.throws(() => stageDirectSubject(f.options), /staging-exists/u);
});

test("Windows drive-letter casing preserves checkout identity", {
  skip: process.platform !== "win32" && "Windows drive-letter spelling",
}, t => {
  const f = fixture(t);
  assert.match(f.checkout, /^[A-Za-z]:\\/u);
  for (const [index, drive] of [
    f.checkout[0].toLowerCase(), f.checkout[0].toUpperCase(),
  ].entries()) {
    const checkout = `${drive}${f.checkout.slice(1)}`;
    assert.equal(realpathSync(checkout), checkout);
    const packageRoot = join(checkout, "packages/core");
    const result = stageDirectSubject({
      ...f.options, sourceCheckout: checkout,
      stagingDir: join(f.base, `direct-${index}`),
      javascriptEntry: join(packageRoot, JS), declarationEntry: join(packageRoot, DTS),
    });
    assert.equal(result.source.checkout, checkout);
    assert.equal(result.source.commit, f.options.expectedSha);
  }
});

test("rejects a source checkout that is a repository subdirectory", t => {
  const f = fixture(t);
  assert.throws(() => stageDirectSubject({
    ...f.options, sourceCheckout: f.packageRoot,
  }), /checkout-root/u);
  assert.equal(existsSync(f.options.stagingDir), false);
});

test("rejects Git reporting another checkout as the worktree", t => {
  const f = fixture(t), other = fixture(t);
  f.git(["config", "core.worktree", other.checkout]);
  assert.throws(() => stageDirectSubject(f.options), /checkout-root/u);
  assert.equal(existsSync(f.options.stagingDir), false);
});

for (const [name, path, text] of [
  ["missing", JS, 'import "./missing.js";'],
  ["escaping", JS, 'import "../../../outside.js";'],
  ["alias", JS, 'import "../src/../src/composition/stage0.js";'],
  ["external", JS, 'import "node:fs";'],
  ["nonliteral loader", JS, 'const path = "./other.js"; import(path);'],
  ["require alias", JS, "const load = require; load('./other.js');"],
  ["missing declaration", typeFile, 'export type Result = import("./missing.js").Missing;'],
  ["external declaration", typeFile, 'export type Result = import("outside").Result;'],
  ["tooling reference", JS, 'export * from "./own-profile.js";'],
]) {
  test(`rejects ${name} without creating staging`, t => {
    const f = fixture(t);
    f.put(path, text);
    assert.throws(() => stageDirectSubject(f.options));
    assert.equal(existsSync(f.options.stagingDir), false);
  });
}

test("rejects symlinked closure files and incorrect source identity", t => {
  const f = fixture(t);
  assert.throws(() => stageDirectSubject({ ...f.options, expectedSha: "0".repeat(40) }), /source-sha/u);
  rmSync(join(f.packageRoot, selected));
  symlinkSync(join(f.packageRoot, sentinel), join(f.packageRoot, selected));
  assert.throws(() => stageDirectSubject(f.options), /symlink/u);
  assert.equal(existsSync(f.options.stagingDir), false);
});

test("rejects dirty source and staging inside the checkout", t => {
  const f = fixture(t);
  assert.throws(() => stageDirectSubject({
    ...f.options, stagingDir: join(f.checkout, "direct"),
  }), /staging-location/u);
  f.put("README.md", "Changed source metadata\n");
  assert.throws(() => stageDirectSubject(f.options), /dirty-source/u);
});


test("Windows mixed-case Git routing cannot substitute source identity", {
  skip: process.platform !== "win32" && "Windows environment names are case-insensitive",
}, t => {
  const first = fixture(t), other = fixture(t);
  other.git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null",
    "commit", "--quiet", "--allow-empty", "-m", "distinct fixture identity"]);
  const substituted = other.git(["rev-parse", "HEAD"]);
  assert.notEqual(substituted, first.options.expectedSha);
  assert.equal(other.git(["rev-parse", "HEAD^{tree}"]), first.git(["rev-parse", "HEAD^{tree}"]));
  const affected = key => ["GIT_DIR", "GIT_WORK_TREE"].includes(key.toUpperCase());
  const previous = Object.entries(process.env).filter(([key]) => affected(key));
  for (const key of Object.keys(process.env).filter(affected)) delete process.env[key];
  try {
    process.env.Git_Dir = join(other.checkout, ".git");
    process.env.Git_Work_Tree = first.checkout;
    assert.throws(() => stageDirectSubject({ ...first.options, expectedSha: substituted }), /source-sha/u);
    assert.equal(stageDirectSubject(first.options).source.commit, first.options.expectedSha);
  } finally {
    for (const key of Object.keys(process.env).filter(affected)) delete process.env[key];
    for (const [key, value] of previous) process.env[key] = value;
  }
});

// Release metadata is copied only from tracked, clean source when allowlisted.
test("stages the allowlisted release changelog byte-for-byte", t => {
  const f = fixture(t);
  const path = join(f.packageRoot, "package.json");
  const metadata = JSON.parse(readFileSync(path, "utf8"));
  metadata.files = ["CHANGELOG.md"];
  writeFileSync(path, JSON.stringify(metadata));
  f.put("CHANGELOG.md", "# Changelog\n\nRelease candidate.\n");
  f.git(["add", "packages/core/package.json", "packages/core/CHANGELOG.md"]);
  f.git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null",
    "commit", "--quiet", "-m", "release metadata fixture"]);
  const result = stageDirectSubject({ ...f.options, expectedSha: f.git(["rev-parse", "HEAD"]) });
  assert.deepEqual(readFileSync(join(result.stagingDir, "CHANGELOG.md")),
    readFileSync(join(f.packageRoot, "CHANGELOG.md")));
  const manifest = JSON.parse(readFileSync(join(result.stagingDir, "package.json"), "utf8"));
  assert.ok(manifest.files.includes("CHANGELOG.md"));
});
