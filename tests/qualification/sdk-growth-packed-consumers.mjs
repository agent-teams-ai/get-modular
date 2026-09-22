import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { parse } from "yaml";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
const profile = parse(await readFile(join(root, "architecture/sdk-growth/profile.yaml"), "utf8"));

async function run(command, args, options = {}) {
  return execute(command, args, { cwd: root, timeout: 120_000, maxBuffer: 8_000_000, ...options });
}

function pnpmCommand(args, options) {
  const npmExecPath = process.env.npm_execpath;
  if (typeof npmExecPath === "string" && npmExecPath.endsWith(".cjs")) {
    return run(process.execPath, [npmExecPath, ...args], options);
  }
  return run("pnpm", args, options);
}

const temporary = await mkdtemp(join(tmpdir(), "gm-g1-packed-"));
try {
  await run(process.execPath, ["architecture/tooling/build-core.mjs"]);
  await run(process.execPath, ["architecture/tooling/build-assembly.mjs"]);
  const archives = [], archiveByPackage = new Map();
  for (const surface of profile.packages) {
    const before = new Set(await readdir(temporary));
    await pnpmCommand(["--filter", surface.packageName, "pack", "--pack-destination", temporary]);
    const created = (await readdir(temporary)).filter(name => name.endsWith(".tgz") && !before.has(name));
    assert.equal(created.length, 1, `${surface.packageName} must produce one archive`);
    const archive = join(temporary, created[0]);
    const members = (await run("tar", ["-tzf", archive])).stdout.trim().split("\n");
    assert.ok(members.includes("package/package.json"), `${surface.packageName} archive manifest`);
    assert.ok(!members.some(path => path.startsWith("package/src/")), `${surface.packageName} archive leaks source`);
    for (const exported of surface.exports) {
      assert.ok(members.includes(`package/${exported.declarationPath.split("/").slice(2).join("/")}`),
        `${surface.packageName}:${exported.exportPath} declaration missing`);
      assert.ok(members.includes(`package/${exported.runtimePath.split("/").slice(2).join("/")}`),
        `${surface.packageName}:${exported.exportPath} runtime missing`);
    }
    archives.push(archive);
    archiveByPackage.set(surface.packageName, archive);
  }

  let importCount = 0;
  for (const [index, surface] of profile.packages.entries()) {
    const consumer = join(temporary, `consumer-${index}`);
    await run(process.execPath, ["-e", "require('fs').mkdirSync(process.argv[1],{recursive:true})", consumer]);
    await writeFile(join(consumer, "package.json"), JSON.stringify({ name: `gm-g1-disposable-consumer-${index}`, private: true, type: "module" }));
    const installs = surface.packageName === "@get-modular/assembly"
      ? [archiveByPackage.get("@get-modular/core"), archiveByPackage.get("@get-modular/assembly")]
      : [archiveByPackage.get(surface.packageName)];
    await run("npm", ["install", "--ignore-scripts", "--package-lock=false", "--no-audit", "--no-fund", ...installs], { cwd: consumer });
    const imports = surface.exports.map(exported => exported.exportPath === "."
      ? surface.packageName : `${surface.packageName}/${exported.exportPath.slice(2)}`);
    const importer = `const imports=${JSON.stringify(imports)};for(const name of imports){const value=await import(name);if(Object.keys(value).length===0)throw new Error(name+' has no exports')}process.stdout.write(JSON.stringify({imports:imports.length}));`;
    const result = await run(process.execPath, ["--input-type=module", "--eval", importer], { cwd: consumer });
    importCount += JSON.parse(result.stdout).imports;
  }
  process.stdout.write(`${JSON.stringify({ status: "passed", archives: archives.length, imports: importCount, consumers: profile.packages.length })}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
