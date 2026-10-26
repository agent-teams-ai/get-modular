import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSupportedToolingNodeVersion } from "../../checks/node-version.mjs";
import { assertBun, invoke, pnpm } from "./command.ts";
import { verifyRuntimeWorkspace } from "./projection-custody.ts";
import { assertProjection, git, markerPath, project, projectionPaths, repository, selectedProfile } from "./policy.ts";

function capturedBaseline(): { ref: string; oid: string } {
  const base = process.env.GITHUB_BASE_REF || "main";
  const ref = `refs/remotes/origin/${base}`;
  git(repository, "check-ref-format", ref);
  const record = git(repository, "for-each-ref", "--format=%(objectname) %(refname)", ref);
  if (record === "") return { ref, oid: "" };
  const match = /^([a-f0-9]{40}) (.+)$/u.exec(record);
  if (!match || match[2] !== ref || git(repository, "cat-file", "-t", match[1]!) !== "commit") {
    throw new Error("runtime.projection.invalid-source-baseline");
  }
  return { ref, oid: match[1]! };
}

export function prepareNode(destination: string): void {
  if (!isAbsolute(destination) || existsSync(destination)) throw new Error("runtime.projection.destination-must-be-new");
  const root = resolve(destination);
  if (!relative(repository, root).startsWith("..") || git(repository, "status", "--porcelain") !== "") {
    throw new Error("runtime.projection.requires-clean-source-and-external-destination");
  }
  const commit = git(repository, "rev-parse", "HEAD");
  const baseline = capturedBaseline();
  execFileSync("git", ["clone", "--no-hardlinks", "--no-checkout", "--local", repository, root], { stdio: "inherit" });
  execFileSync("git", ["-C", root, "checkout", "--detach", commit], { stdio: "inherit" });
  // A local clone invents origin refs from local branches and omits the source's
  // remote baseline. Preserve only the captured upstream fact, never local HEAD.
  const currentBaseline = capturedBaseline();
  if (currentBaseline.ref !== baseline.ref || currentBaseline.oid !== baseline.oid
    || git(repository, "rev-parse", "HEAD") !== commit) {
    throw new Error("runtime.projection.source-baseline-changed");
  }
  if (baseline.oid) git(root, "update-ref", baseline.ref, baseline.oid);
  else git(root, "update-ref", "-d", baseline.ref);

  for (const path of projectionPaths) {
    writeFileSync(resolve(root, path), project(path, readFileSync(resolve(root, path), "utf8")));
  }
  writeFileSync(resolve(root, markerPath), JSON.stringify({ source: realpathSync(repository), root: realpathSync(root), commit }) + "\n", { flag: "wx" });
  assertProjection(root);
  console.log(`Node profile prepared at ${root}. Run its dev.ts install, then dev.ts run check.`);
}
function assertInstallTree(manager: "bun" | "pnpm"): void {
  const modules = resolve(repository, "node_modules");
  if (!existsSync(modules)) return;
  const other = manager === "bun" ? "pnpm" : "bun";
  if (existsSync(resolve(modules, `.${other}`)) || !existsSync(resolve(modules, `.${manager}`))) {
    throw new Error("runtime.install.mixed-or-unknown-manager");
  }
}
export function install(): number {
  const profile = selectedProfile();
  if (profile === "node") {
    assertProjection();
    assertInstallTree("pnpm");
    return pnpm(["install", "--frozen-lockfile", "--ignore-scripts", "--engine-strict", "--strict-peer-dependencies"]);
  }
  assertInstallTree("bun");
  assertBun();
  // Bun parses YAML natively before dependencies exist; no hand-written YAML
  // parser and no stale installed graph authorizes this projection.
  execFileSync("bun", [resolve(repository, "architecture/tooling/runtime/admission.ts")], { cwd: repository, stdio: "inherit" });
  if (!existsSync(resolve(repository, "bun.lock"))) throw new Error("runtime.install.bun-lock-pending");
  const result = spawnSync("bun", ["install", "--frozen-lockfile", "--ignore-scripts"], { cwd: repository, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`runtime.install.signal:${result.signal}`);
  return result.status ?? 1;
}
export function installNodeQualification(): number {
  // M3's trusted runner scans the real .pnpm compiler/parser closure and
  // requires clean exact Git bytes. Manager projection would violate that
  // contract. This explicit fresh checkout installation preserves source bytes.
  if (selectedProfile() !== "bun" || existsSync(resolve(repository, "node_modules/.bun"))
    || git(repository, "status", "--porcelain") !== "") throw new Error("runtime.qualification.requires-clean-source");
  assertInstallTree("pnpm");
  assertBun();
  execFileSync("bun", [resolve(repository, "architecture/tooling/runtime/admission.ts")], { cwd: repository, stdio: "inherit" });
  return pnpm(["--pm-on-fail=ignore", "install", "--frozen-lockfile", "--ignore-scripts", "--engine-strict", "--strict-peer-dependencies"]);
}
export async function verify(): Promise<void> {
  selectedProfile();
  await verifyRuntimeWorkspace(repository, process.env.EXPECTED_HEAD_SHA);
  console.log("Tracked workspace integrity: passed");
}

export function peers(): number {
  if (selectedProfile() === "node") {
    assertProjection();
    return pnpm(["peers", "check", "--lockfile-only"]);
  }
  // Validate the real retained pnpm graph in a separate manager root. No Bun
  // node_modules, source script, or lifecycle hook enters this temporary root.
  const root = mkdtempSync(resolve(tmpdir(), "gm-pnpm-peers-TEST-"));
  try {
    writeFileSync(resolve(root, "package.json"), project("package.json", readFileSync(resolve(repository, "package.json"), "utf8")));
    for (const path of ["pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc"]) copyFileSync(resolve(repository, path), resolve(root, path));
    for (const name of readdirSync(resolve(repository, "packages"))) {
      const manifest = resolve(repository, "packages", name, "package.json");
      if (!existsSync(manifest)) continue;
      mkdirSync(resolve(root, "packages", name), { recursive: true });
      copyFileSync(manifest, resolve(root, "packages", name, "package.json"));
    }
    return pnpm(["peers", "check", "--lockfile-only"], root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertSupportedToolingNodeVersion();
  const [command, ...args] = process.argv.slice(2);
  if (command === "prepare-node" && args.length === 1 && args[0]) prepareNode(args[0]);
  else if (command === "install" && args.length === 0) process.exitCode = install();
  else if (command === "install-node-qualification" && args.length === 0) process.exitCode = installNodeQualification();
  else if (command === "verify" && args.length === 0) await verify();
  else if (command === "peers" && args.length === 0) process.exitCode = peers();
  else if (command === "run" && args[0]) process.exitCode = invoke("run", args[0], args.slice(1));
  else throw new Error("Usage: dev.ts prepare-node <new-absolute-path> | install | install-node-qualification | verify | peers | run <script>");
}
