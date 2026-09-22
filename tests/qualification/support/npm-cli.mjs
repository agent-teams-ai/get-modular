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
  const candidates = [process.env.npm_execpath];
  if (process.env.PNPM_HOME) {
    candidates.push(join(process.env.PNPM_HOME, "..", "pnpm", "bin", "pnpm.cjs"));
  }
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    try {
      candidates.push(await realpath(join(directory, process.platform === "win32" ? "pnpm.cmd" : "pnpm")));
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
    candidates.push(join(directory, "..", "pnpm", "bin", "pnpm.cjs"));
  }
  for (const candidate of candidates) {
    if (!candidate || !/\.(?:cjs|mjs|js)$/iu.test(candidate)) continue;
    try {
      await access(candidate);
      return await realpath(candidate);
    } catch {}
  }
  throw new Error("The local Node toolchain must provide a pnpm JavaScript CLI; no shell fallback is used.");
}
