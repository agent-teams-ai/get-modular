import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { objectSubjectCases } from "../../../../tests/qualification/support/object-subject-cases.mjs";
import { authoringScale } from "../../../../tests/qualification/support/type-scale.mjs";

const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
const runtimeNames = ["compileComposition", "defineModule", "many", "optional", "required"];

async function npmCli() {
  const binary = await realpath(process.execPath);
  const candidates = [join(dirname(binary), "node_modules/npm/bin/npm-cli.js"),
    join(dirname(dirname(binary)), "lib/node_modules/npm/bin/npm-cli.js")];
  if (process.env.npm_execpath?.endsWith("npm-cli.js")) candidates.unshift(process.env.npm_execpath);
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    try {
      const target = await realpath(join(directory, "npm"));
      if (target.endsWith("npm-cli.js")) candidates.push(target);
    } catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error; }
  }
  for (const path of candidates) { try { await access(path); return path; } catch {} }
  throw new Error("The pinned Node toolchain must provide npm-cli.js; no shell or download fallback is used.");
}

// Pack once per regression suite. This disposable tarball is not retained
// release evidence, and no successful assertion grants publication eligibility.
test("packed M1 exposes one root across Node and TypeScript consumers", async t => {
  const temporary = await mkdtemp(join(tmpdir(), "gm-packed-consumer-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const consumer = join(temporary, "consumer");
  await mkdir(consumer);
  const env = { ...process.env, npm_config_cache: join(temporary, "npm-cache"),
    npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false" };
  const run = (args, cwd = consumer) => {
    const result = spawnSync(process.execPath, args, { cwd, env, encoding: "utf8", timeout: 60_000, maxBuffer: 4_000_000 });
    assert.ifError(result.error);
    return result;
  };
  const success = result => { assert.equal(result.status, 0, result.stdout + result.stderr); return result.stdout; };
  const npm = await npmCli();
  const inventory = JSON.parse(success(run([npm, "pack", "--ignore-scripts", "--json", "--pack-destination", temporary], join(repo, "packages/core"))));
  assert.equal(inventory.length, 1);
  const packed = inventory[0];
  const archive = join(temporary, packed.filename);
  const bytes = await readFile(archive);
  assert.equal(packed.integrity, `sha512-${createHash("sha512").update(bytes).digest("base64")}`);
  const archiveHash = createHash("sha256").update(bytes).digest("hex");
  await writeFile(join(consumer, "package.json"), '{"name":"get-modular-consumer-sandbox","private":true,"type":"module"}\n');
  success(run([npm, "install", "--ignore-scripts", "--offline", "--no-audit", "--no-fund", archive]));
  const fromConsumer = createRequire(join(consumer, "consumer.cjs"));
  const required = fromConsumer("@get-modular/core");
  const resolved = fromConsumer.resolve("@get-modular/core");
  const namespace = await import(pathToFileURL(resolved).href);

  await t.test("Node import and require resolve one implementation and no private exports", () => {
    assert.equal(required, namespace);
    assert.deepEqual(Object.keys(namespace).sort(), runtimeNames);
    const observed = JSON.parse(success(run(["--input-type=module", "--eval",
      "const m=await import('@get-modular/core'); console.log(JSON.stringify({names:Object.keys(m).sort(),url:import.meta.resolve('@get-modular/core')}));"])));
    assert.deepEqual(observed, { names: runtimeNames, url: pathToFileURL(resolved).href });
    for (const path of ["@get-modular/core/package.json", "@get-modular/core/dist/index.js", "@get-modular/core/unknown"]) {
      assert.throws(() => fromConsumer(path), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
      const result = JSON.parse(success(run(["--input-type=module", "--eval",
        `try { await import(${JSON.stringify(path)}); console.log(JSON.stringify({ok:true})); } catch(error) { console.log(JSON.stringify({error:error.code})); }`])));
      assert.deepEqual(result, { error: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
    }
  });

  await t.test("runtime conditions keep one target; the types condition has its specified failure", () => {
    for (const condition of ["browser", "development", "production", "unknown-condition"]) {
      const result = JSON.parse(success(run([`--conditions=${condition}`, "--input-type=module", "--eval",
        "await import('@get-modular/core'); console.log(JSON.stringify({url:import.meta.resolve('@get-modular/core')}));"])));
      assert.equal(result.url, pathToFileURL(resolved).href);
    }
    const result = JSON.parse(success(run(["--conditions=types", "--input-type=module", "--eval",
      "const url=import.meta.resolve('@get-modular/core'); try { await import('@get-modular/core'); console.log(JSON.stringify({ok:true,url})); } catch(error) { console.log(JSON.stringify({error:error.code,url})); }"])));
    assert.deepEqual(result, { error: "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING", url: pathToFileURL(resolved.replace(/\.js$/u, ".d.ts")).href });
    const commonjs = JSON.parse(success(run(["--conditions=types", "--input-type=commonjs", "--eval",
      "console.log(JSON.stringify({names:Object.keys(require('@get-modular/core')).sort(),path:require.resolve('@get-modular/core')}));"])));
    assert.deepEqual(commonjs, { names: runtimeNames, path: resolved });
  });

  for (const fixture of objectSubjectCases) await t.test(`installed package ${fixture.id}`, async () => {
    await fixture.run(required.compileComposition);
  });

  const declarations = `
import { compileComposition, defineModule, required, optional, many,
  type ModuleDeclaration, type CompositionProfile, type CompositionPlan,
  type CompileCompositionResult, type Diagnostic, type DiagnosticCode, type PlanDigest } from "@get-modular/core";
const declaration = defineModule({ kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: "example/app", implementationId: "example/app/default",
  owner: { authority: "example", path: ["app"] }, provides: [], slots: [] });
const literal: "example/app" = declaration.moduleId;
const wire: ModuleDeclaration = declaration;
const profile = { kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "example/main",
  roots: [declaration.moduleId], selections: [{ moduleId: declaration.moduleId, implementationId: declaration.implementationId }], bindings: [] } satisfies CompositionProfile;
const pending: Promise<CompileCompositionResult> = compileComposition({ declarations: [declaration, null], profile });
const r = required(); r.kind = "required";
const o = optional(); o.kind = "optional";
const m = many({ min: 0, max: 2 }); m.max = 3;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const equal: Equal<DiagnosticCode, Diagnostic["code"]> = true;
declare const result: CompileCompositionResult;
if (result.ok) { const plan: CompositionPlan = result.plan; const digest: PlanDigest = result.digest; }
else { const diagnostics: readonly Diagnostic[] = result.diagnostics; }
// @ts-expect-error reserved failure is not an emittable code
const reserved: DiagnosticCode = "output.canonicalization-failed";
declare const declarePlan: CompositionPlan;
// @ts-expect-error public plans are immutable
declarePlan.roots.push("example/extra");
// @ts-expect-error nested bindings are immutable
declarePlan.bindings[0].providerImplementationIds.push("example/provider/default");
// @ts-expect-error helper takes no options
required({});
// @ts-expect-error many requires both bounds
many({ min: 0 });
// @ts-expect-error fresh wire values have no arbitrary fields
const excess = { ...declaration, extra: true } satisfies ModuleDeclaration;
// @ts-expect-error raw input is excluded from M1
import { compileCompositionJson } from "@get-modular/core";
// @ts-expect-error private factory is excluded
import { createCompilerFacade } from "@get-modular/core";
// @ts-expect-error no public historical catalog
import type { DiagnosticCatalogCode } from "@get-modular/core";
${authoringScale}
`;
  for (const [mode, extension, module] of [["NodeNext", "mts", "NodeNext"], ["Node16", "mts", "Node16"],
    ["NodeNext", "cts", "NodeNext"], ["Bundler", "mts", "ESNext"], ["Node16", "cts", "Node16"],
    ["Node10", "mts", "ESNext"], ["Classic", "mts", "ESNext"]]) {
    const negative = mode === "Node16" && extension === "cts" || ["Node10", "Classic"].includes(mode);
    await t.test(`TypeScript ${mode}/${extension} ${negative ? "rejects unsupported resolution" : "preserves the packed contract and 1000 literal declarations"}`, async () => {
      const file = `case.${extension}`;
      await writeFile(join(consumer, file), declarations);
      await writeFile(join(consumer, "tsconfig.json"), JSON.stringify({
        compilerOptions: { target: "ES2022", module, moduleResolution: mode, strict: true,
          exactOptionalPropertyTypes: true, skipLibCheck: false, types: [], noEmit: true }, files: [file],
      }));
      const result = run([tsc, "-p", "tsconfig.json", "--pretty", "false"]);
      if (mode === "Node16" && extension === "cts") {
        assert.notEqual(result.status, 0);
        assert.deepEqual([...new Set(result.stdout.match(/TS\d+/gu))], ["TS1479"], result.stdout + result.stderr);
      } else if (["Node10", "Classic"].includes(mode)) {
        assert.notEqual(result.status, 0);
        assert.deepEqual([...new Set(result.stdout.match(/TS\d+/gu))], ["TS5108"], result.stdout + result.stderr);
      } else success(result);
    });
  }
  assert.equal(createHash("sha256").update(await readFile(archive)).digest("hex"), archiveHash);
});
