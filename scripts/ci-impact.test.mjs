import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { changedPaths, classifyChangedPaths } from "./ci-impact.mjs";

const cases = [
  ["ordinary plan", ["docs/plans/new-feature.md"], "docs"],
  ["multiple prose plans", ["docs/plans/a.md", "docs/plans/b.md"], "docs"],
  ["empty changes", [], "full"],
  ["AGENTS instructions", ["AGENTS.md"], "full"],
  ["Copilot instructions", [".github/copilot-instructions.md"], "full"],
  ["workflow", [".github/workflows/ci.yml"], "full"],
  ["root docs may be consumed by tests", ["README.md"], "full"],
  ["architecture docs are executable policy", ["docs/decisions/README.md"], "full"],
  ["design docs not in approved set", ["docs/guides/setup.md"], "full"],
  ["research code", ["research/native/raw/test.ts.txt"], "full"],
  ["missing slash docs", ["docs/plans.md"], "full"],
  ["nested plan", ["docs/plans/nested.md/evil.md"], "full"],
  ["source code", ["packages/core/src/index.ts"], "full"],
  ["mixed", ["docs/plans/a.md", "pnpm-lock.yaml"], "full"],
  ["toolchain", [".node-version"], "full"],
  ["explicit traversal", ["docs/plans/../x.md"], "full"],
  ["absolute path", ["/docs/plans/a.md"], "full"],
  ["backslash", ["docs\\plans\\a.md"], "full"],
  ["replacement character", ["docs/plans/\uFFFD.md"], "full"],
  ["null item", [null], "full"],
];
for (const [name, paths, expected] of cases)
  test(name, () => assert.equal(classifyChangedPaths(paths), expected));

test("complete Git diff fails closed on source move and bad SHA", () => {
  const cwd = mkdtempSync(join(tmpdir(), "gm-ci-impact-"));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], {encoding:"utf8"}).trim();
  function commit(msg) {
    git("add", "-A");
    git("-c","user.name=CI","-c","user.email=ci@example.invalid","commit","-q","-m",msg);
    return git("rev-parse","HEAD");
  }
  try {
    git("init","-q");
    mkdirSync(join(cwd,"docs/plans"), {recursive:true});
    writeFileSync(join(cwd,"docs/plans/plan.md"),"hello\n");
    const base = commit("docs");
    mkdirSync(join(cwd,"packages/core/src"), {recursive:true});
    rmSync(join(cwd,"docs/plans/plan.md"));
    writeFileSync(join(cwd,"packages/core/src/main.ts"),"export {};\n");
    const head = commit("move");
    assert.deepEqual(changedPaths(base,head,cwd)?.sort(),["packages/core/src/main.ts","docs/plans/plan.md"].sort());
    assert.equal(classifyChangedPaths(changedPaths(base,head,cwd)),"full");
    assert.equal(changedPaths("bad",head,cwd),null);
    assert.equal(changedPaths(base,base,cwd),null);
    assert.equal(changedPaths(head,base,cwd),null);
  } finally {
    rmSync(cwd,{recursive:true,force:true});
  }
});
