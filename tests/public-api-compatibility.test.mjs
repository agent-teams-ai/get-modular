import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { parse, stringify } from "yaml";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const foundationManifestPath = require.resolve("@agent-teams/engineering-foundation/package.json");
const foundationManifest = JSON.parse(await readFile(foundationManifestPath, "utf8"));
const foundationBin = foundationManifest.bin?.["agent-teams-foundation"];
assert.equal(typeof foundationBin, "string", "Foundation must expose its public CLI bin");
const cli = join(dirname(foundationManifestPath), foundationBin);
const policyPath = "architecture/foundation/public-api-compatibility.yaml";
const GOVERNED_PACKAGES = Object.freeze(["@get-modular/assembly", "@get-modular/core"]);
const COPY_PATHS = Object.freeze([
  "package.json",
  "pnpm-workspace.yaml",
  policyPath,
  "architecture/foundation/governance-architecture-decisions.yaml",
  "architecture/decisions/accepted-decisions.json",
  "packages/core/package.json",
  "packages/core/tsconfig.json",
  "packages/assembly/package.json",
  "packages/assembly/tsconfig.json",
  ".changeset/config.json",
]);

function packagePolicy(configuration, packageName) {
  return configuration.packages.find((item) => item.packageName === packageName);
}

test("live public-api policy keeps both published packages and their root export", async () => {
  const configuration = parse(await readFile(policyPath, "utf8"));
  assert.deepEqual(
    configuration.packages.map((item) => item.packageName).toSorted(),
    [...GOVERNED_PACKAGES],
  );
  for (const packageName of GOVERNED_PACKAGES) {
    const owned = packagePolicy(configuration, packageName);
    assert.deepEqual(
      owned.entrypoints.map((item) => item.exportPath),
      ["."],
    );
    assert.equal(
      owned.releasedBaselinePath,
      packageName === "@get-modular/core"
        ? "architecture/public-api/core.json"
        : "architecture/public-api/assembly.json",
    );
  }
});

async function withPublicApiConsumer(change) {
  const directory = await mkdtemp(join(tmpdir(), "gm-public-api-"));
  try {
    for (const path of COPY_PATHS) {
      const target = join(directory, path);
      await mkdir(dirname(target), { recursive: true });
      await cp(path, target);
    }
    await writeFile(join(directory, "foundation.config.yaml"), `schemaVersion: 1
project:
  id: get-modular
capabilities:
  package.public-api-compatibility:
    configPath: ${policyPath}
`);
    await change(directory);
    let result;
    try {
      result = await execute(
        process.execPath,
        [cli, "check", "package.public-api-compatibility", "--consumer", directory, "--format", "json"],
        { timeout: 30_000, maxBuffer: 2_000_000 },
      );
    } catch (error) {
      assert.ok(error.code === 1 || error.code === 2, error.stderr ?? String(error));
      result = error;
    }
    return {
      status: result.status ?? result.code,
      report: JSON.parse(result.stdout),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("shrinking yaml entrypoints while package.json still exports . fails closed", async () => {
  const { status, report } = await withPublicApiConsumer(async (directory) => {
    const path = join(directory, policyPath);
    const configuration = parse(await readFile(path, "utf8"));
    const core = packagePolicy(configuration, "@get-modular/core");
    core.entrypoints = [{
      exportPath: "./internal",
      declarationEntryPoint: "packages/core/dist/features/authoring/internal.d.ts",
    }];
    await writeFile(path, stringify(configuration));
  });
  assert.notEqual(status, 0, JSON.stringify(report));
  assert.match(
    JSON.stringify(report),
    /PUBLIC_API_PACKAGE_EXPORTS_INVALID|not declared|undeclared|export/iu,
  );
});

test("adding an undeclared package export path fails closed", async () => {
  const { status, report } = await withPublicApiConsumer(async (directory) => {
    const manifestPath = join(directory, "packages/core/package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.exports["./helpers"] = {
      import: { types: "./dist/features/authoring/helpers.d.ts", default: "./dist/features/authoring/helpers.js" },
      default: "./dist/features/authoring/helpers.js",
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  });
  assert.notEqual(status, 0, JSON.stringify(report));
  assert.match(
    JSON.stringify(report),
    /PUBLIC_API_PACKAGE_EXPORTS_INVALID|not declared|undeclared|export/iu,
  );
});

test("live yaml cannot drop a published package or its . export while manifests still export .", async () => {
  const configuration = parse(await readFile(policyPath, "utf8"));
  for (const packageName of GOVERNED_PACKAGES) {
    const manifestName = packageName === "@get-modular/core"
      ? "packages/core/package.json"
      : "packages/assembly/package.json";
    const manifest = JSON.parse(await readFile(manifestName, "utf8"));
    assert.ok(Object.hasOwn(manifest.exports, "."), `${packageName} still exports .`);
    const owned = packagePolicy(configuration, packageName);
    assert.notEqual(owned, undefined, `${packageName} must remain in public-api yaml`);
    assert.deepEqual(owned.entrypoints.map((item) => item.exportPath), ["."]);
    assert.deepEqual(owned.nonTypeExports, []);
  }
});
