import { access, realpath } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";

export async function resolveNpmCli() {
  const node = await realpath(process.execPath);
  const candidates = [
    join(dirname(node), "node_modules/npm/bin/npm-cli.js"),
    join(dirname(dirname(node)), "lib/node_modules/npm/bin/npm-cli.js"),
  ];
  if (process.env.npm_execpath?.endsWith("npm-cli.js")) candidates.unshift(process.env.npm_execpath);
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    try {
      const target = await realpath(join(directory, "npm"));
      if (target.endsWith("npm-cli.js")) candidates.push(target);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return await realpath(candidate);
    } catch {}
  }
  throw new Error("The local Node toolchain must provide npm-cli.js; no shell fallback is used.");
}

export async function resolvePnpmCli() {
  const candidates = [];
  if (process.env.npm_execpath && /(?:^|[\\/])pnpm\.(?:cjs|mjs|js)$/iu.test(process.env.npm_execpath)) {
    candidates.push(process.env.npm_execpath);
  }
  for (const directory of [process.env.PNPM_HOME, ...(process.env.PATH ?? "").split(delimiter)]) {
    if (!directory) continue;
    try {
      candidates.push(await realpath(join(directory, "pnpm")));
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
    for (const packageDirectory of [join(directory, "node_modules", "pnpm"), join(directory, "..", "pnpm")]) {
      candidates.push(join(packageDirectory, "bin", "pnpm.mjs"));
      candidates.push(join(packageDirectory, "bin", "pnpm.cjs"));
    }
  }
  for (const candidate of candidates) {
    if (!/(?:^|[\\/])pnpm\.(?:cjs|mjs|js)$/iu.test(candidate)) continue;
    try {
      await access(candidate);
      return await realpath(candidate);
    } catch {}
  }
  throw new Error("The local Node toolchain must provide a pnpm JavaScript CLI; no shell fallback is used.");
}
