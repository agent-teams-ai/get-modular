// Extracts the ```ts blocks of <variant>/README.md, adds the declarations they assume, and compiles them.
//   node tools/readme-check.mjs <variant>
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const variant = process.argv[2];
const readme = readFileSync(join(root, variant, "README.md"), "utf8");
const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => match[1]);
// The README's first block holds the imports; this prelude declares only what the examples assume.
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
type PrefsFile = { readonly initial: { readonly theme: string; readonly density: "compact" | "comfortable" }; readonly write: (values: object) => Promise<void>; readonly close: () => Promise<void> };
declare function openPrefsFile(): Promise<PrefsFile>;
declare function fetchPage(region: string, cursor: string, options: { readonly signal: AbortSignal }): Promise<{ readonly items: readonly Model[]; readonly next: string | undefined }>;
const pricingKeys: readonly ["currency", "region"] = ["currency", "region"];
void deps.settings.read(pricingKeys);
const sameKeys = ["currency", "region"] as const;
void deps.settings.read(sameKeys);
`;
const dir = join(root, ".build", `readme-${variant}`);
mkdirSync(dir, { recursive: true });
const file = join(dir, "readme-example.ts");
writeFileSync(file, `${blocks[0] ?? ""}\n${prelude}\n${blocks.slice(1).join("\n")}`);
try {
  process.stdout.write(execFileSync("node", [join(root, "tools/tsc-both.mjs"), variant, file], { encoding: "utf8" }));
} catch (error) {
  process.stdout.write(`${error.stdout ?? ""}`);
  process.exit(1);
}
