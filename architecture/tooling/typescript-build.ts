import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

interface CompilerExit {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
}

interface ProjectBuild {
  readonly repositoryRoot: string;
  readonly project: string;
  readonly arguments?: readonly string[];
  readonly failure: (exit: CompilerExit) => Error;
}

// The package builders select policy and cleanup. This function owns only the
// repeated physical-Node invocation of the repository's installed compiler.
export function buildTypeScriptProject(build: ProjectBuild): void {
  const require = createRequire(join(build.repositoryRoot, "package.json"));
  const compiler = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
  const result = spawnSync(process.execPath, [
    compiler, "--project", build.project, ...(build.arguments ?? []),
  ], { cwd: build.repositoryRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw build.failure(result);
}
