import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { supportedCompilers, testAssemblyTypes } from "../../architecture/tooling/test-assembly-types.mjs";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// Only names the document explicitly assumes are supplied by its consumer are declared here.
const prelude = `import type { ReadonlyStore as Facet } from "@get-modular/observation";
import { defineContract } from "@get-modular/assembly";
void defineContract;
type ThemeSlice = { readonly theme: string };
type ThemePicker = { readonly show: (theme: string) => undefined };
declare function createThemePicker(theme: string): ThemePicker;
declare function createPickerPort(picker: ThemePicker): { readonly pick: (theme: string) => undefined };
type Model = { readonly id: string };
type CatalogState = { readonly status: "loading" }
  | { readonly status: "ready"; readonly region: string; readonly models: readonly Model[] }
  | { readonly status: "failed"; readonly region: string; readonly cause: unknown };
declare function fetchModels(region: string, options: { readonly signal: AbortSignal }): Promise<readonly Model[]>;
type AuditLog = { readonly setRetention: (days: number) => void; readonly close: () => Promise<void> };
declare function openAuditLog(retentionDays: number, options: { readonly signal: AbortSignal }): Promise<AuditLog>;
type Pricing = { readonly currency: string; readonly vatRate: number };
declare function vatRateFor(region: string): number;
type QuietHours = { readonly from: number; readonly to: number };
declare function tryParseQuietHours(text: string): QuietHours | undefined;
declare const notifier: { readonly setQuietHours: (hours: QuietHours) => void };
declare const deps: {
  readonly settings: Facet<{ readonly region: string; readonly currency: string; readonly quietHours: string }>;
  readonly errors: ErrorsPort;
};
declare const resources: Resources;
type PreferencesFile = { readonly initial: { readonly theme: string; readonly density: "compact" | "comfortable" }; readonly write: (values: object) => Promise<void>; readonly close: () => Promise<void> };
declare function openPreferencesFile(): Promise<PreferencesFile>;
declare function fetchPage(region: string, cursor: string, options: { readonly signal: AbortSignal }): Promise<{ readonly items: readonly Model[]; readonly next: string | undefined }>;
const pricingKeys: readonly ["currency", "region"] = ["currency", "region"];
void deps.settings.read(pricingKeys);
const sameKeys = ["currency", "region"] as const;
void deps.settings.read(sameKeys);
`;

test("T19 T22 T23 T24 T75 T117 every observation README TypeScript block compiles on the supported compiler set", async t => {
  const readme = await readFile(join(workspace, "packages/observation/README.md"), "utf8");
  const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/gu)].map(match => match[1]);
  assert.ok(blocks.length >= 10, "The full README recipes must remain covered");
  assert.match(blocks[0], /from "@get-modular\/observation"/u);
  const root = await realpath(await mkdtemp(join(tmpdir(), "get-modular-observation-readme-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "node_modules/@get-modular"), { recursive: true });
  for (const name of ["core", "assembly", "resources", "observation"]) {
    await symlink(join(workspace, "packages", name), join(root, "node_modules/@get-modular", name), "junction");
  }
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "observation-readme", private: true, type: "module" }));
  await writeFile(join(root, "readme.ts"), `${blocks[0]}\n${prelude}\n${blocks.slice(1).join("\n")}`);
  const project = join(root, "tsconfig.json");
  await writeFile(project, JSON.stringify({ compilerOptions: {
    target: "ES2022", lib: ["ES2024", "ESNext.Disposable", "ESNext.Promise", "DOM"], types: [],
    strict: true, exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true, noEmit: true, skipLibCheck: false,
  }, files: ["readme.ts"] }));
  const observations = testAssemblyTypes({ directory: root, project });
  assert.deepEqual(observations, supportedCompilers().flatMap(({ compilerName, version }) =>
    ["NodeNext", "Bundler"].map(resolution => ({ compilerName, version, resolution }))));
  t.diagnostic(`${blocks.length} README blocks: ${observations.map(item => `${item.version} ${item.resolution}`).join(", ")}`);
});
