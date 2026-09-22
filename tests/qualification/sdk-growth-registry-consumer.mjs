import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { resolveNpmCli } from "./support/npm-cli.mjs";

const execute = promisify(execFile);
const PACKAGE = "@agent-teams/engineering-foundation";
const VERSION = "1.5.1";
const INTEGRITY = "sha512-29r5QUvMIFdvsPaJ5m0Yx1Uo6bL85J/teP1p1ThNg7jMEz54cVxyrEnsLx/DN5cc/2CAzq2i8iLnPKgZN1cT8A==";
const TARBALL_SHA256 = "bd0c476d2940168ac1b020f42726107cce81580b7b1b014e74aceabbafa9e951";
const TARBALL_URL = "https://registry.npmjs.org/@agent-teams/engineering-foundation/-/engineering-foundation-1.5.1.tgz";
const PUBLISHED_AT = "2026-09-22T08:23:18.839Z";
const npmCli = await resolveNpmCli();

const directory = await mkdtemp(join(tmpdir(), "gm-g1-registry-"));
const npmEnvironment = { ...process.env, npm_config_cache: join(directory, "npm-cache"), npm_config_update_notifier: "false" };
try {
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "gm-g1-registry-consumer", private: true, type: "module" }));
  await execute(process.execPath, [npmCli, "install", "--ignore-scripts", "--package-lock=true", "--no-audit", "--no-fund",
    "--registry=https://registry.npmjs.org/", `${PACKAGE}@${VERSION}`], {
    cwd: directory, timeout: 120_000, maxBuffer: 8_000_000, env: npmEnvironment,
  });
  const manifest = JSON.parse(await readFile(join(directory, "node_modules", PACKAGE, "package.json")));
  assert.equal(manifest.version, VERSION);
  const lock = JSON.parse(await readFile(join(directory, "package-lock.json")));
  const locked = lock.packages[`node_modules/${PACKAGE}`];
  assert.equal(locked.version, VERSION);
  assert.equal(locked.integrity, INTEGRITY);
  assert.equal(locked.resolved, TARBALL_URL);
  const packument = await (await fetch("https://registry.npmjs.org/@agent-teams%2fengineering-foundation")).json();
  assert.equal(packument.time[VERSION], PUBLISHED_AT);
  assert.equal(packument.versions[VERSION].dist.tarball, TARBALL_URL);
  assert.equal(packument.versions[VERSION].dist.integrity, INTEGRITY);
  await execute(process.execPath, [npmCli, "pack", `${PACKAGE}@${VERSION}`, "--ignore-scripts", "--pack-destination", directory,
    "--registry=https://registry.npmjs.org/"], {
    cwd: directory, timeout: 120_000, maxBuffer: 8_000_000, env: npmEnvironment,
  });
  const tarball = (await readdir(directory)).find(name => name.endsWith(".tgz"));
  assert.ok(tarball);
  assert.equal(createHash("sha256").update(await readFile(join(directory, tarball))).digest("hex"), TARBALL_SHA256);
  const result = await execute(process.execPath, ["--input-type=module", "--eval",
    `const sdk=await import(${JSON.stringify(`${PACKAGE}/sdk-growth-authority`)});if(typeof sdk.createSdkGrowthAuthorityVerifier!=="function")throw new Error("missing SDK verifier");process.stdout.write("ok")`],
  { cwd: directory, timeout: 30_000 });
  assert.equal(result.stdout, "ok");
  process.stdout.write(`${JSON.stringify({ status: "passed", package: PACKAGE, version: VERSION,
    integrity: INTEGRITY, tarballUrl: TARBALL_URL, tarballSha256: TARBALL_SHA256,
    publishedAt: PUBLISHED_AT, imports: 1 })}\n`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
