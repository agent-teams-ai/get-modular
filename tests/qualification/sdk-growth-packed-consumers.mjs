import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { parse } from "yaml";

import { resolveNpmCli, resolvePnpmCli } from "./support/npm-cli.mjs";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
const profile = parse(await readFile(join(root, "architecture/sdk-growth/profile.yaml"), "utf8"));
const npmCli = await resolveNpmCli();
const pnpmCli = await resolvePnpmCli();
const expectedCoordinates = Object.freeze([
  Object.freeze({ packageName: "@get-modular/assembly", exportPath: "." }),
  Object.freeze({ packageName: "@get-modular/core", exportPath: "." }),
]);

assert.deepEqual(profile.packages.map(surface => surface.exports.map(exported => ({
  packageName: surface.packageName,
  exportPath: exported.exportPath,
}))).flat(), expectedCoordinates, "packed qualification must cover the exact Core and Assembly exports");

async function run(command, args, options = {}) {
  return execute(command, args, { cwd: root, timeout: 120_000, maxBuffer: 8_000_000, ...options });
}

function pnpmCommand(args, options) {
  return run(process.execPath, [pnpmCli, ...args], options);
}

const temporary = await mkdtemp(join(tmpdir(), "gm-g1-packed-"));
const npmEnvironment = { ...process.env, npm_config_cache: join(temporary, "npm-cache"), npm_config_update_notifier: "false" };
try {
  await run(process.execPath, ["architecture/tooling/build-core.mjs"]);
  await run(process.execPath, ["architecture/tooling/build-assembly.mjs"]);
  const archives = [], archiveByPackage = new Map(), archivePackages = [];
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
    archivePackages.push(surface.packageName);
  }
  assert.equal(archives.length, 2, "packed qualification must produce two archives");
  assert.deepEqual(archivePackages, expectedCoordinates.map(row => row.packageName));

  let importCount = 0;
  const consumerPackages = [], importedCoordinates = [];
  for (const [index, surface] of profile.packages.entries()) {
    const consumer = join(temporary, `consumer-${index}`);
    await run(process.execPath, ["-e", "require('fs').mkdirSync(process.argv[1],{recursive:true})", consumer]);
    await writeFile(join(consumer, "package.json"), JSON.stringify({ name: `gm-g1-disposable-consumer-${index}`, private: true, type: "module" }));
    const installs = surface.packageName === "@get-modular/assembly"
      ? [archiveByPackage.get("@get-modular/core"), archiveByPackage.get("@get-modular/assembly")]
      : [archiveByPackage.get(surface.packageName)];
    await run(process.execPath, [npmCli, "install", "--offline", "--ignore-scripts", "--package-lock=false", "--no-audit", "--no-fund", ...installs], {
      cwd: consumer,
      env: npmEnvironment,
    });
    const imports = surface.exports.map(exported => exported.exportPath === "."
      ? surface.packageName : `${surface.packageName}/${exported.exportPath.slice(2)}`);
    const importer = `const imports=${JSON.stringify(imports)};for(const name of imports){const value=await import(name);if(Object.keys(value).length===0)throw new Error(name+' has no exports')}process.stdout.write(JSON.stringify({imports:imports.length}));`;
    const result = await run(process.execPath, ["--input-type=module", "--eval", importer], { cwd: consumer });
    importCount += JSON.parse(result.stdout).imports;
    consumerPackages.push(surface.packageName);
    importedCoordinates.push(...surface.exports.map(exported => ({
      packageName: surface.packageName,
      exportPath: exported.exportPath,
    })));
  }
  assert.deepEqual(consumerPackages, expectedCoordinates.map(row => row.packageName));
  assert.deepEqual(importedCoordinates, expectedCoordinates);
  assert.equal(importCount, 2, "packed qualification must import two coordinates");
  process.stdout.write(`${JSON.stringify({ status: "passed", archives: archives.length, imports: importCount, consumers: consumerPackages.length })}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
