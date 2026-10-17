import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

// Call only after initializing an owned disposable repository. Its cleanup also
// removes this empty directory and the local configuration; machine hooks stay intact.
export async function isolateFixtureHooks(root: string): Promise<void> {
  const hooks = await mkdtemp(join(root, ".git", "fixture-hooks-"));
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.startsWith("GIT_")));
  await execute("git", ["config", "--local", "core.hooksPath", hooks], { cwd: root, env });
}
