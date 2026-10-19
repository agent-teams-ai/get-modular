import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { x as extractArchive } from "tar";
import { assertCompilerFloor } from "./compiler-floor.ts";
import {
  digest, fail, inputDirectory, inputPinsDigest, jsonBytes, qualifyOrdinaryResult, record,
  type InputPins, type InvocationResult,
} from "./native-public-api-migration-admission.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const require = createRequire(import.meta.url);
function contained(parent: string, path: string): boolean {
  const value = relative(parent, path);
  return value === "" || !isAbsolute(value) && value !== ".." && !value.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`);
}
async function readRegular(parent: string, path: string): Promise<Buffer> {
  if (!contained(parent, path) || await realpath(path) !== path || !(await lstat(path)).isFile()) {fail("input must be a contained regular file");}
  const bytes = await readFile(path);
  if (bytes.byteLength > 32 * 1024 * 1024) {fail("input exceeds the byte budget");}
  return bytes;
}
const readInput = (path: string) => readRegular(root, join(root, path));
/** No shell, package lifecycle, compiler selection, stdout transformation or exit coercion. */
export function invoke(command: string, args: readonly string[], cwd: string, environment = process.env): Promise<InvocationResult> {
  return new Promise((_resolve, reject) => {
    execFile(command, [...args], { cwd, env: environment, encoding: "utf8", timeout: 600_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error === null) { _resolve({ stdout, stderr, exitCode: 0 }); return; }
      const failure = record(error);
      if (typeof failure["code"] === "number" && failure["signal"] === null && failure["killed"] !== true) {
        _resolve({ stdout, stderr, exitCode: failure["code"] }); return;
      }
      reject(error);
    });
  });
}
async function installedFoundation() {
  // Resolve public package metadata and its declared bin without importing SDK code.
  const manifestPath = await realpath(require.resolve("@agent-teams/engineering-foundation/package.json"));
  const packageRoot = dirname(manifestPath);
  const manifestBytes = await readRegular(packageRoot, manifestPath);
  const manifest = record(JSON.parse(manifestBytes.toString("utf8")));
  const bin = record(manifest["bin"])["agent-teams-foundation"];
  const declared = record(JSON.parse((await readInput("package.json")).toString("utf8")))["devDependencies"];
  if (manifest["name"] !== "@agent-teams/engineering-foundation" || typeof manifest["version"] !== "string"
    || record(declared)["@agent-teams/engineering-foundation"] !== manifest["version"] || typeof bin !== "string") {fail("installed Foundation differs from its exact consumer declaration");}
  const path = resolve(packageRoot, bin), binBytes = await readRegular(packageRoot, path);
  return { path, packageRoot, manifestPath, manifestDigest: digest(manifestBytes), binDigest: digest(binBytes), version: manifest["version"] };
}
async function assertInstalledUnchanged(before: Awaited<ReturnType<typeof installedFoundation>>): Promise<void> {
  if (JSON.stringify(await installedFoundation()) !== JSON.stringify(before)) {fail("installed public command changed during qualification");}
}
async function assertOrdinarySchema(value: unknown): Promise<void> {
  const path = await realpath(require.resolve("@agent-teams/engineering-foundation/schemas/foundation-check-report/v1.schema.json"));
  const schema: unknown = JSON.parse((await readFile(path)).toString("utf8"));
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(record(schema));
  if (!validate(value)) {fail("ordinary public report schema rejected the complete output");}
}
/** Materialize only the reviewed declaration/configuration data. The original
 * preset package manifest stays exact; no historical runtime graph is installed. */
export async function acquireHistoricalData(temporary: string): Promise<string> {
  const working = join(await realpath(temporary), "inputs");
  reportDestination(await realpath(root), working, await realpath(tmpdir()));
  await mkdir(working);
  const pinsBytes = await readInput(`${inputDirectory}/pins.json`);
  if (digest(pinsBytes) !== inputPinsDigest) {fail("copied input pins differ");}
  const pins = JSON.parse(pinsBytes.toString("utf8")) as InputPins;
  await writeFile(join(working, "pins.json"), pinsBytes, { flag: "wx" });
  for (const [path, expected] of Object.entries(pins.assets)) {
    const source = join(root, inputDirectory, path), destination = join(working, path);
    if (!contained(working, destination)) {fail("pinned asset is outside staging");}
    const bytes = await readRegular(join(root, inputDirectory), source);
    if (digest(bytes) !== expected) {fail("copied input differs before acquisition");}
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx" });
  }
  for (const name of ["core", "assembly"]) {
    await extractArchive({ file: join(working, `${name}.tgz`), cwd: join(working, "historical/packages", name), strip: 1 });
  }
  const core = join(working, "historical/node_modules/@get-modular/core");
  await mkdir(core, { recursive: true });
  await extractArchive({ file: join(working, "core.tgz"), cwd: core, strip: 1 });
  const realization = record(JSON.parse((await readRegular(working, join(working, "declaration-realization.json"))).toString("utf8")));
  const preset = record(realization["foundationPresetArchive"]);
  const archive = join(working, "foundation-presets-1.7.4.tgz");
  const archiveBytes = await readRegular(working, archive);
  if (`sha512-${createHash("sha512").update(archiveBytes).digest("base64")}` !== preset["integrity"]) {fail("original preset archive integrity differs");}
  const destination = join(working, "historical/node_modules/@agent-teams/engineering-foundation");
  await mkdir(destination, { recursive: true });
  const members = ["package.json", "presets/typescript/node.json", "presets/typescript/base.json"];
  await extractArchive({ file: archive, cwd: destination, strip: 1,
    filter: path => members.some(member => path === `package/${member}`) });
  const memberPins = record(preset["members"]);
  for (const member of members) {
    if (digest(await readRegular(destination, join(destination, member))) !== memberPins[member]) {fail("original preset member differs");}
  }
  return join(working, "request.json");
}
export function reportDestination(repository: string, path: string, temporaryRoot = resolve(tmpdir())): string {
  const destination = resolve(path);
  if (contained(repository, destination) || !contained(temporaryRoot, destination)) {fail("reports must be in temporary storage outside the source checkout");}
  return destination;
}
export async function writeReport(path: string, bytes: Uint8Array | string): Promise<void> {
  let ancestor = dirname(path);
  for (;;) {
    try {
      reportDestination(await realpath(root), join(await realpath(ancestor), relative(ancestor, path)), await realpath(tmpdir()));
      break;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {throw error;}
      ancestor = dirname(ancestor);
    }
  }
  await mkdir(dirname(path), { recursive: true });
  reportDestination(await realpath(root), join(await realpath(dirname(path)), "report"), await realpath(tmpdir()));
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
}
export function parseReportArguments(args: readonly string[]): { ordinary?: string; migration?: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (key === undefined || !["--ordinary-report", "--migration-report"].includes(key) || values.has(key) || value === undefined || value.startsWith("--")) {fail("unsupported or duplicate report option");}
    values.set(key, value);
  }
  return { ...(values.has("--ordinary-report") ? { ordinary: values.get("--ordinary-report")! } : {}), ...(values.has("--migration-report") ? { migration: values.get("--migration-report")! } : {}) };
}
export async function nativeMigrationMain(args: readonly string[]): Promise<void> {
  const options = parseReportArguments(args);
  assertCompilerFloor(root);
  const producer = await installedFoundation();
  const reports = await mkdtemp(join(tmpdir(), "get-modular-native-api-reports-"));
  const ordinaryPath = reportDestination(root, options.ordinary ?? join(reports, "ordinary.json"));
  const migrationPath = reportDestination(root, options.migration ?? join(reports, "migration.json"));
  if (new Set([ordinaryPath, `${ordinaryPath}.stderr`, `${ordinaryPath}.exit-code`, migrationPath]).size !== 4) {fail("report destinations overlap");}
  const ordinary = await invoke(process.execPath, [producer.path, "check", "--consumer", root, "--format", "json"], root);
  await writeReport(ordinaryPath, ordinary.stdout);
  await writeReport(`${ordinaryPath}.stderr`, ordinary.stderr);
  await writeReport(`${ordinaryPath}.exit-code`, `${ordinary.exitCode}\n`);
  process.stdout.write(ordinary.stdout); process.stderr.write(ordinary.stderr);
  const retained = { reportPath: ordinaryPath, stdoutDigest: digest(Buffer.from(ordinary.stdout)), stderrDigest: digest(Buffer.from(ordinary.stderr)), exitCode: ordinary.exitCode };
  let temporary: string | undefined;
  try {
    const report: unknown = JSON.parse(ordinary.stdout);
    await assertOrdinarySchema(report);
    if (record(report)["foundationVersion"] !== producer.version) {fail("ordinary report producer differs from installed Foundation");}
    const admission = await qualifyOrdinaryResult({ result: ordinary, report, read: readInput, observe: async () => {
      temporary = await mkdtemp(join(tmpdir(), "get-modular-native-api-inputs-"));
      const request = await acquireHistoricalData(temporary);
      const observed = await invoke(process.execPath, [producer.path, "public-api-promote-release", "--consumer", root, "--native-transition", request, "--qualification-only", "--json"], root);
      await writeReport(join(reports, "public-operation.stdout"), observed.stdout);
      await writeReport(join(reports, "public-operation.stderr"), observed.stderr);
      await writeReport(join(reports, "public-operation.exit-code"), `${observed.exitCode}\n`);
      await assertInstalledUnchanged(producer);
      return observed;
    } });
    await writeReport(migrationPath, jsonBytes({ kind: "get-modular:public-api-native-migration-qualification:1", outcome: admission.outcome, migrationApplied: false, ordinary: retained, producer, ...("observation" in admission ? { publicOperationReport: join(reports, "public-operation.stdout"), publicOperationDigest: digest(Buffer.from(admission.observation.stdout)) } : {}) }));
    process.stderr.write(`Get Modular ${admission.outcome}; actual ordinary exit ${ordinary.exitCode} retained at ${ordinaryPath}; separate qualification at ${migrationPath}.\n`);
  } catch (error) {
    await writeReport(migrationPath, jsonBytes({ kind: "get-modular:public-api-native-migration-qualification:1", outcome: "rejected", migrationApplied: false, ordinary: retained, reason: error instanceof Error ? error.message : String(error) }));
    process.exitCode = ordinary.exitCode === 0 ? 1 : ordinary.exitCode;
    throw error;
  } finally { if (temporary !== undefined) {await rm(temporary, { recursive: true, force: true });} }
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await nativeMigrationMain(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode ||= 1; }
}
