import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Project } from "ts-morph";
import factoryHandle from "./0.2-0.3/factory-handle.mjs";

// One entry per breaking minor: `<from>-<to>` runs these transforms in order.
const CODEMODS = { "0.2-0.3": [factoryHandle] };
const CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SKIPPED = new Set(["node_modules", "dist", ".git"]);
const SOURCE = /\.(?:ts|tsx|mts|cts)$/u;

function usage(message) {
  console.error(`${message}\nusage: codemod <from>-<to> <directory> [--dry | --check | --write [--allow-dirty]]\n`
    + `known: ${Object.keys(CODEMODS).join(", ")}`);
  return 2;
}

function sourceFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIPPED.has(entry.name) ? [] : sourceFiles(path);
    return entry.isFile() && SOURCE.test(entry.name) ? [path] : [];
  });
}

function dirtyTree(directory) {
  const result = spawnSync("git", ["-C", directory, "status", "--porcelain"], { encoding: "utf8" });
  if (result.status !== 0) return "not a Git work tree (use --allow-dirty to skip this check)";
  return result.stdout.trim() === "" ? undefined : "the Git tree has uncommitted changes (commit or use --allow-dirty)";
}

export function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { dry: { type: "boolean" }, check: { type: "boolean" }, write: { type: "boolean" }, "allow-dirty": { type: "boolean" } },
  });
  const [name, target] = positionals;
  const modes = ["dry", "check", "write"].filter((mode) => values[mode]);
  if (modes.length > 1) return usage("choose one of --dry, --check, --write");
  if (!Object.hasOwn(CODEMODS, name ?? "")) return usage(`unknown codemod "${name}"`);
  // `pnpm --dir <checkout> codemod` runs with the checkout as cwd; INIT_CWD is where the user typed the command.
  const directory = target ? resolve(process.env.INIT_CWD ?? process.cwd(), target) : undefined;
  if (!directory || !existsSync(directory) || !statSync(directory).isDirectory()) return usage(`not a directory: ${target}`);
  const inside = relative(CHECKOUT, directory);
  if (inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) {
    return usage(`refusing to run inside the Get Modular checkout itself: ${directory}`);
  }
  const mode = modes[0] ?? "dry";
  if (mode === "write" && !values["allow-dirty"]) {
    const reason = dirtyTree(directory);
    if (reason) { console.error(`refusing to write: ${reason}`); return 2; }
  }

  const tsConfigFilePath = join(directory, "tsconfig.json");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    ...(existsSync(tsConfigFilePath) ? { tsConfigFilePath } : {}),
  });
  const files = sourceFiles(directory).map((path) => project.addSourceFileAtPath(path));
  const program = project.getProgram();
  const unparsable = new Set(files.filter((file) => program.getSyntacticDiagnostics(file).length > 0));
  for (const file of unparsable) console.error(`skipped, does not parse: ${relative(directory, file.getFilePath())}`);

  let changed = 0;
  const findings = [];
  for (const file of files) {
    if (unparsable.has(file)) continue;
    const path = relative(directory, file.getFilePath());
    let edits = 0;
    for (const transform of CODEMODS[name]) edits += transform(file, (message) => findings.push(`${path}: ${message}`)) ?? 0;
    if (edits === 0) continue;
    changed += 1;
    console.log(`${path}: ${edits} edit${edits === 1 ? "" : "s"}`);
    if (mode === "write") file.saveSync();
  }
  if (findings.length > 0) console.log(`\nfix by hand:\n${findings.map((line) => `  ${line}`).join("\n")}`);
  console.log(`\n${changed} file${changed === 1 ? "" : "s"} ${mode === "write" ? "written" : "would change"}`
    + (mode === "write" ? "; run your typecheck" : ""));
  if (unparsable.size > 0) return 1;
  return mode === "check" && changed > 0 ? 1 : 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
