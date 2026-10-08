import { spawnSync } from "node:child_process";

const scripts = (process.env.LANE_SCRIPTS ?? "").trim().split(/\s+/u);
if (!scripts.every(script => /^[A-Za-z0-9][A-Za-z0-9:._-]*$/u.test(script))) {
  console.error("LANE_SCRIPTS must contain nonempty, safe package-script identifiers.");
  process.exit(1);
}

// Keep the platform's native PATH: Git Bash selects GNU tar on Windows.
const windows = process.platform === "win32";
for (const script of scripts) {
  const result = spawnSync(windows ? (process.env.ComSpec || "cmd.exe") : "pnpm",
    windows ? ["/d", "/s", "/c", `pnpm run ${script}`] : ["run", script],
    { stdio: "inherit" });
  if (result.error || result.signal) {
    console.error(result.error?.message ?? `pnpm terminated by ${result.signal}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
