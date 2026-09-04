import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => JSON.stringify(value, null, 2);
const implementation = (name) => `edits/${name}/default`;
const declaration = (name, optional = false) => ({
  moduleId: `edits/${name}`, implementationId: implementation(name),
  owner: { authority: "edits", path: [name] },
  provides: name === "consumer" ? [] : [{ id: "edits/service", version: 1 }],
  slots: name === "consumer" ? [{ id: "service", capability: { id: "edits/service", version: 1 }, cardinality: { kind: optional ? "optional" : "required" } }] : [],
});

function baseline(optional) {
  return {
    declarations: ["a", "b", "consumer", ...Array.from({ length: 7 }, (_, i) => `idle${i}`)].map((name) => declaration(name, optional)),
    profile: {
      roots: ["edits/consumer"],
      selections: ["a", "consumer"].map((name) => ({ moduleId: `edits/${name}`, implementationId: implementation(name) })),
      bindings: [{ consumerImplementationId: implementation("consumer"), slotId: "service", providerImplementationIds: [implementation("a")] }],
    },
    desiredProfile: { disabledModuleIds: [] },
  };
}

function edited(world, action) {
  const next = structuredClone(world);
  if (action === "add-module") {
    next.declarations.push(declaration("added"));
    next.profile.roots.push("edits/added");
    next.profile.selections.push({ moduleId: "edits/added", implementationId: implementation("added") });
  }
  if (action === "rebind" || action === "remove-with-replacement") {
    next.profile.selections[0] = { moduleId: "edits/b", implementationId: implementation("b") };
    next.profile.bindings[0].providerImplementationIds = [implementation("b")];
  }
  if (action.startsWith("remove-")) next.declarations = next.declarations.filter(({ moduleId }) => moduleId !== "edits/a");
  if (action.startsWith("disable-")) next.desiredProfile.disabledModuleIds = ["edits/a"];
  return next;
}

// Identical feature-local layout for all candidates. Syntax alone does not
// prescribe a different package/file topology or a production Host policy.
export function authoringFiles(candidate, world) {
  const files = {};
  const names = [];
  for (const value of world.declarations) {
    const name = value.owner.path[0];
    names.push(name);
    const isBuilder = candidate === "define-module";
    const expression = isBuilder ? `defineModule(${json(value)}) satisfies Declaration` : `${json(value)} as const satisfies Declaration`;
    files[`modules/${name}/declaration.ts`] = [
      'import type { Declaration } from "../../../support/types.js";',
      ...(isBuilder ? ['import { defineModule } from "../../../support/candidate-define.js";'] : []),
      `export const declaration = ${expression};`,
    ].join("\n") + "\n";
    files[`modules/${name}/factory.ts`] = candidate === "split-declaration-factory"
      ? 'import { associateFactory } from "../../../support/candidate-split-factory.js";\nimport { declaration } from "./declaration.js";\n'
        + `export const factory = associateFactory(declaration, declaration.implementationId, (): string => ${JSON.stringify(name)});\n`
      : `export const factory = (): string => ${JSON.stringify(name)};\n`;
  }
  files["catalog.ts"] = names.map((name) => `import { declaration as ${name} } from "./modules/${name}/declaration.js";`).join("\n")
    + `\nexport const declarations = [${names.join(", ")}] as const;\n`;
  files["profile.ts"] = 'import type { Profile } from "../support/types.js";\n'
    + `export const profile = ${json(world.profile)} as const satisfies Profile;\n`;
  files["desired-state.ts"] = 'import type { DesiredProfile } from "../support/types.js";\n'
    + `export const desiredProfile = ${json(world.desiredProfile)} as const satisfies DesiredProfile;\n`;
  return files;
}

export function fileChanges(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap((path) => {
    if (before[path] === after[path]) return [];
    return [{ path, kind: before[path] === undefined ? "added" : after[path] === undefined ? "deleted" : "modified",
      beforeSha256: before[path] === undefined ? null : hash(before[path]), afterSha256: after[path] === undefined ? null : hash(after[path]) }];
  });
}

export async function measureAuthoringEdits({ here, tscPath, candidateIds, observe }) {
  const root = mkdtempSync(join(tmpdir(), "gm-authoring-edits-"));
  const cases = [];
  const write = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
  const states = new Map();
  const actions = ["add-module", "rebind", "remove-with-replacement", "remove-unrepaired", "disable-required", "disable-optional"];
  try {
    const gitVersion = spawnSync("git", ["--version"], { encoding: "utf8" });
    assert.equal(gitVersion.status, 0, gitVersion.stderr);
    write(join(root, "package.json"), '{"type":"module"}\n');
    for (const name of ["types.ts", "candidate-define.ts", "candidate-split.ts", "candidate-split-factory.ts"]) {
      write(join(root, "support", name), readFileSync(join(here, name)));
    }
    for (const candidate of candidateIds) {
      for (const action of actions) {
        const before = baseline(action === "disable-optional");
        const after = edited(before, action);
        const pair = [];
        for (const [side, world] of [["before", before], ["after", after]]) {
          const id = `${candidate}-${action}-${side}`;
          const files = authoringFiles(candidate, world);
          for (const [path, source] of Object.entries(files)) write(join(root, id, path), source);
          // Fixed test entrypoint is not an authoring edit or a product export.
          write(join(root, id, "entry.ts"), 'import { declarations } from "./catalog.js";\nimport { profile } from "./profile.js";\nimport { desiredProfile } from "./desired-state.js";\nexport const world = { declarations, profile, desiredProfile };\n');
          states.set(id, { world, files });
          pair.push(id);
        }
        cases.push({ candidate, action, pair });
      }
    }
    write(join(root, "tsconfig.json"), json({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, types: [], skipLibCheck: true, declaration: true, outDir: "dist" }, include: ["**/*.ts"], exclude: ["dist"] }));
    const compiled = spawnSync(process.execPath, [tscPath, "-p", join(root, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
    const observations = new Map();
    for (const [id, { world }] of states) {
      const emitted = await import(pathToFileURL(join(root, "dist", id, "entry.js")).href);
      assert.deepEqual(emitted.world, world, `${id}: emitted authoring source changed the intended input`);
      observations.set(id, observe(emitted.world));
    }
    const expectedCodes = { "add-module": [], rebind: [], "remove-with-replacement": [], "remove-unrepaired": ["profile.unknown-module"], "disable-required": ["binding.missing"], "disable-optional": [] };
    return cases.map(({ candidate, action, pair: [beforeId, afterId] }) => {
      const before = states.get(beforeId); const after = states.get(afterId);
      const beforeOutcome = observations.get(beforeId); const afterOutcome = observations.get(afterId);
      assert.equal(beforeOutcome.ok, true, `${beforeId}: baseline is invalid`);
      assert.deepEqual(afterOutcome.diagnostics.map(({ code }) => code), expectedCodes[action], `${afterId}: unexpected outcome`);
      assert.equal(afterOutcome.ok, expectedCodes[action].length === 0);
      const diff = spawnSync("git", ["-c", "core.autocrlf=false", "-c", "diff.algorithm=myers", "diff", "--no-index", "--no-ext-diff", "--no-textconv", "--no-renames", "--numstat", "--", beforeId, afterId], { cwd: root, encoding: "utf8" });
      assert.equal(diff.status, 1, diff.stderr);
      const counts = diff.stdout.trim().split("\n").map((line) => line.split("\t").slice(0, 2).map(Number));
      assert(counts.every((row) => row.every(Number.isFinite)), "unexpected binary or malformed diff");
      const changes = fileChanges(before.files, after.files);
      assert.equal(counts.length, changes.length, "diff includes files outside measured authoring sources");
      const bindingChanges = after.world.profile.bindings.flatMap((binding, index) => json(binding) === json(before.world.profile.bindings[index]) ? [] : [{ path: "profile.ts", consumerImplementationId: binding.consumerImplementationId, slotId: binding.slotId }]);
      return { candidate, action, baselineModules: before.world.declarations.length, changes,
        changedAuthoringFiles: changes.length, addedFiles: changes.filter(({ kind }) => kind === "added").length,
        bindingEditLocations: bindingChanges, addedLines: counts.reduce((sum, [added]) => sum + added, 0), deletedLines: counts.reduce((sum, [, deleted]) => sum + deleted, 0),
        beforeInputSha256: hash(json(before.world)), afterInputSha256: hash(json(after.world)),
        beforeSourceSha256: hash(json(before.files)), afterSourceSha256: hash(json(after.files)),
        beforeOutcome, afterOutcome, typecheck: "pass", emittedSourceParity: "pass", lineCounter: gitVersion.stdout.trim(),
      };
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
