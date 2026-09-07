import { isUtf8 } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, parse, posix, relative, resolve, sep } from "node:path";
import ts from "typescript-minimum";

// Qualification staging only: no builds, candidate execution, packing or installs.
// The caller owns build/source correspondence and subsequent pack-once custody.
const JS = "dist-stage0/self-composition/stage0-entry.js";
const DTS = "dist-stage0/self-composition/stage0-entry.d.ts";
const MAX_FILE = 1024 * 1024;
const MAX_TOTAL = 8 * MAX_FILE;
const MAX_FILES = 512;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

function need(condition, reason) {
  if (!condition) {
    const error = new Error(`Invalid direct staging: ${reason}`);
    error.code = "m3.stage-direct.invalid";
    error.reason = reason;
    throw error;
  }
}

function inside(root, path) {
  const tail = relative(root, path);
  return tail !== "" && !isAbsolute(tail) && tail !== ".." && !tail.startsWith(`..${sep}`);
}

function absolute(path) {
  need(typeof path === "string" && isAbsolute(path) && resolve(path) === path, "absolute-path");
}

function canonicalDirectory(path) {
  absolute(path);
  need(realpathSync(path) === path && lstatSync(path).isDirectory(), "canonical-directory");
}

function git(checkout, args) {
  // Ambient Git routing, alternate indexes and replacement objects cannot
  // substitute a different checkout or source identity.
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
  env.GIT_NO_REPLACE_OBJECTS = "1";
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
  env.GIT_OPTIONAL_LOCKS = "0";
  return execFileSync("git", ["--no-pager", ...args], {
    cwd: checkout, env, encoding: "utf8", timeout: 15_000,
    maxBuffer: MAX_TOTAL, stdio: ["ignore", "pipe", "pipe"],
  });
}

function sourceIdentity(checkout, expectedSha) {
  need(/^[a-f0-9]{40}$/u.test(expectedSha), "full-source-sha");
  canonicalDirectory(checkout);
  need(resolve(git(checkout, ["rev-parse", "--show-toplevel"]).trim()) === checkout, "checkout-root");
  const commit = git(checkout, ["rev-parse", "--verify", "HEAD^{commit}"]).trim();
  need(commit === expectedSha, "source-sha");
  need(git(checkout, [
    "status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none",
  ]) === "", "dirty-source");
  git(checkout, [
    "ls-files", "--error-unmatch", "--",
    "packages/core/package.json", "packages/core/LICENSE", "packages/core/README.md",
  ]);
  const tree = git(checkout, ["rev-parse", "--verify", "HEAD^{tree}"]).trim();
  need(/^[a-f0-9]{40}$/u.test(tree), "source-tree");
  return { checkout, commit, tree };
}

function readRegular(root, path) {
  need(inside(root, path), "file-escape");
  let current = root;
  const parts = relative(root, path).split(sep);
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const stat = lstatSync(current);
    need(!stat.isSymbolicLink(), "symlink");
    if (index < parts.length - 1) need(stat.isDirectory(), "directory");
    else {
      need(stat.isFile() && stat.nlink === 1, "regular-file");
      need(stat.size <= MAX_FILE, "file-budget");
    }
  }
  need(realpathSync(path) === path, "path-alias");
  const bytes = readFileSync(path);
  need(bytes.length <= MAX_FILE, "file-budget");
  return bytes;
}

function dependency(from, literal, declaration, source) {
  need(literal && ts.isStringLiteral(literal), "literal-reference");
  const text = literal.text;
  need(literal.getText(source).slice(1, -1) === text, "escaped-reference");
  need(/^(?:\.\/|\.\.\/)[A-Za-z0-9_./-]+(?:\.js|\.d\.ts)$/u.test(text), "relative-reference");
  need(declaration || text.endsWith(".js"), "javascript-reference");
  const target = posix.normalize(posix.join(posix.dirname(from), text));
  const tail = posix.relative(posix.dirname(from), target);
  need(text === (tail.startsWith(".") ? tail : `./${tail}`), "reference-alias");
  need(target.startsWith("dist-stage0/"), "reference-escape");
  return declaration && target.endsWith(".js") ? `${target.slice(0, -3)}.d.ts` : target;
}

function references(path, bytes, budget) {
  need(isUtf8(bytes), "utf8");
  const declaration = path.endsWith(".d.ts");
  const source = ts.createSourceFile(path, bytes.toString("utf8"),
    ts.ScriptTarget.ESNext, true, declaration ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  need(source.parseDiagnostics.length === 0, "parse");
  need(source.referencedFiles.length === 0 && source.typeReferenceDirectives.length === 0
    && source.libReferenceDirectives.length === 0 && !source.hasNoDefaultLib
    && !source.amdDependencies.length && !source.moduleName, "reference-directive");
  const edges = new Set();
  const add = literal => edges.add(dependency(path, literal, declaration, source));
  const pending = [[source, 0]];
  const visited = new Set();
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (visited.has(node)) continue;
    visited.add(node);
    need(++budget.nodes <= 500_000 && depth <= 256, "syntax-budget");
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      need(!node.attributes && !node.assertClause, "import-attributes");
      if (node.moduleSpecifier) add(node.moduleSpecifier);
    }
    if (ts.isImportTypeNode(node)) {
      need(ts.isLiteralTypeNode(node.argument) && !node.attributes, "import-type");
      add(node.argument.literal);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      need(!declaration && node.arguments.length === 1, "dynamic-loader");
      add(node.arguments[0]);
    }
    need(!ts.isImportEqualsDeclaration(node) && !ts.isExternalModuleReference(node)
      && !ts.isMetaProperty(node) && !ts.isModuleDeclaration(node), "loader-syntax");
    if (ts.isIdentifier(node)) {
      need(!["require", "eval", "Function"].includes(node.text), "dynamic-loader");
    }
    ts.forEachChild(node, child => { pending.push([child, depth + 1]); });
    for (const doc of node.jsDoc ?? []) pending.push([doc, depth + 1]);
  }
  return edges;
}

function allowedFile(path) {
  need(path.length <= 240 && /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/u.test(path), "file-path");
  need(path === JS || path === DTS
    || /^dist-stage0\/src\/features\/[A-Za-z0-9_/-]+\.(?:js|d\.ts)$/u.test(path)
    || /^dist-stage0\/src\/composition\/stage0\.(?:js|d\.ts)$/u.test(path), "file-purpose");
}

/**
 * Stage an already-built direct subject without executing its code.
 * All paths are explicit absolute canonical paths. stagingDir must not exist;
 * its existing parent must be under realpath(tmpdir()), outside sourceCheckout.
 * The returned hashes describe staged bytes, not qualification or build proof.
 */
export function stageDirectSubject({
  sourceCheckout, expectedSha, stagingDir, javascriptEntry, declarationEntry,
}) {
  need(ts.version === "5.8.3", "parser-version");
  const source = sourceIdentity(sourceCheckout, expectedSha);
  const packageRoot = join(sourceCheckout, "packages/core");
  canonicalDirectory(packageRoot);
  const buildRoot = join(packageRoot, "dist-stage0");
  canonicalDirectory(buildRoot);
  absolute(javascriptEntry);
  absolute(declarationEntry);
  need(javascriptEntry === join(packageRoot, JS)
    && declarationEntry === join(packageRoot, DTS), "entry-path");
  absolute(stagingDir);
  const temporaryRoot = realpathSync(tmpdir());
  const parent = dirname(stagingDir);
  canonicalDirectory(parent);
  need(inside(temporaryRoot, stagingDir) && !inside(sourceCheckout, stagingDir)
    && stagingDir !== sourceCheckout && !inside(stagingDir, sourceCheckout)
    && parse(stagingDir).root !== stagingDir, "staging-location");
  try {
    lstatSync(stagingDir);
    need(false, "staging-exists");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const files = new Map();
  const budget = { bytes: 0, nodes: 0 };
  const retain = (path, bytes) => {
    budget.bytes += bytes.length;
    need(files.size < MAX_FILES && budget.bytes <= MAX_TOTAL, "closure-budget");
    files.set(path, bytes);
  };
  const pending = new Set([JS, DTS]);
  for (const path of pending) {
    if (files.has(path)) continue;
    allowedFile(path);
    const bytes = readRegular(packageRoot, join(packageRoot, path));
    retain(path, bytes);
    for (const edge of references(path, bytes, budget)) {
      need(pending.size < MAX_FILES || pending.has(edge), "closure-budget");
      pending.add(edge);
    }
  }
  const metadataBytes = readRegular(packageRoot, join(packageRoot, "package.json"));
  const metadata = JSON.parse(metadataBytes.toString("utf8"));
  need(metadata.name === "@get-modular/core"
    && typeof metadata.version === "string" && /^\d+\.\d+\.\d+$/u.test(metadata.version)
    && typeof metadata.license === "string" && metadata.license.length > 0, "package-identity");
  for (const name of ["LICENSE", "README.md"]) {
    retain(name, readRegular(packageRoot, join(packageRoot, name)));
  }
  const manifest = {
    name: metadata.name, version: metadata.version, license: metadata.license,
    type: "module",
    exports: { ".": { import: { types: `./${DTS}`, default: `./${JS}` }, default: `./${JS}` } },
    files: [...files.keys()].sort(),
  };
  retain("package.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  need(JSON.stringify(sourceIdentity(sourceCheckout, expectedSha)) === JSON.stringify(source), "source-changed");
  const inventory = [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([path, bytes]) => ({ path, size: bytes.length, sha256: hash(bytes) }));
  mkdirSync(stagingDir, { mode: 0o700 });
  try {
    for (const [path, bytes] of files) {
      const destination = join(stagingDir, path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, bytes, { flag: "wx", mode: 0o644 });
    }
    return { stagingDir, source, inventory };
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}
