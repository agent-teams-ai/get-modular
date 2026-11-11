import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { changedPaths, classifyChangedPaths } from "../architecture/tooling/ci-impact.mjs";

const cases = [
  ["empty => full", [], "full"],
  ["ordinary maintained guide", ["docs/guides/consumer-quickstart.md"], "docs"],
  ["multiple guides", ["docs/guides/module-authoring.md", "docs/guides/consumer-quickstart.md"], "docs"],
  ["unknown docs tree => full", ["docs/architecture/guarantees.md"], "full"],
  ["decision docs => full", ["docs/decisions/README.md"], "full"],
  ["research with executable evidence => full", ["research/effect/raw/code.txt"], "full"],
  ["plan excluded until protocol-qualified", ["docs/plans/proposed.md"], "full"],
  ["root README => full", ["README.md"], "full"],
  ["agent instructions => full", ["AGENTS.md"], "full"],
  ["copilot instructions => full", [".github/copilot-instructions.md"], "full"],
  ["workflow change => full", [".github/workflows/ci.yml"], "full"],
  ["policy => full", ["architecture/tooling/ci-impact.mjs"], "full"],
  ["native source => full", ["packages/core/src/index.ts"], "full"],
  ["code and prose => full", ["docs/guides/module-authoring.md", "packages/core/src/index.ts"], "full"],
  ["dependency manifest => full", ["package.json"], "full"],
  ["package lock => full", ["pnpm-lock.yaml"], "full"],
  ["unit tests => full", ["tests/governance.test.mjs"], "full"],
  ["invalid traversal => full", ["docs/guides/../README.md"], "full"],
  ["absolute file => full", ["/docs/guides/test.md"], "full"],
  ["windows path => full", ["docs\\guides\\test.md"], "full"],
  ["invalid utf8 => full", ["docs/guides/bad\uFFFD.md"], "full"],
  ["type confusion => full", [undefined], "full"],
  ["nested guide => full", ["docs/guides/example/sub.md"], "full"],
];
for (const [name, paths, expected] of cases)
  test(name, () => assert.equal(classifyChangedPaths(paths), expected));

test("real Git diff includes both old and new paths", () => {
  const cwd = mkdtempSync(join(tmpdir(), "get-modular-impact-"));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], {encoding:"utf8"}).trim();
  const commit = (message) => {
    git("add", "-A");
    git("-c", "user.name=CI", "-c", "user.email=ci@example.invalid", "commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "-q");
    mkdirSync(join(cwd, "docs/guides"), {recursive:true});
    writeFileSync(join(cwd, "docs/guides/first.md"), "a\n");
    const base = commit("docs");
    mkdirSync(join(cwd, "packages/core/src"), {recursive:true});
    rmSync(join(cwd, "docs/guides/first.md"));
    writeFileSync(join(cwd, "packages/core/src/api.ts"), "export {};\n");
    const head = commit("code");
    const paths = changedPaths(base, head, cwd);
    assert.deepEqual(paths?.sort(), ["docs/guides/first.md", "packages/core/src/api.ts"].sort());
    assert.equal(classifyChangedPaths(paths), "full");
    assert.equal(changedPaths("invalid", head, cwd), null);
    assert.equal(changedPaths(base, base, cwd), null);
  } finally {
    rmSync(cwd, {recursive:true, force:true});
  }
});

test("symlinked and executable maintained guides require full CI", (t) => {
  if (process.platform === "win32") return t.skip("POSIX Git modes");
  const cwd = mkdtempSync(join(tmpdir(), "get-modular-modes-"));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], {encoding:"utf8"}).trim();
  const commit = (message) => {
    git("add", "-A");
    git("-c", "user.name=CI", "-c", "user.email=ci@example.invalid", "commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "-q");
    mkdirSync(join(cwd, "docs/guides"), {recursive:true});
    const path = join(cwd, "docs/guides/guide.md");
    writeFileSync(path, "safe\n");
    const base = commit("regular");
    chmodSync(path, 0o755);
    const exec = commit("executable");
    assert.equal(changedPaths(base, exec, cwd), null);
    chmodSync(path, 0o644);
    rmSync(path);
    symlinkSync("../missing.md", path);
    const link = commit("symlink");
    assert.equal(changedPaths(base, link, cwd), null);
  } finally {
    rmSync(cwd, {recursive:true,force:true});
  }
});
