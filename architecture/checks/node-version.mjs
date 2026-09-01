import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SUPPORTED_NODE_RANGE = ">=24.18.0 <25";

export function isSupportedNodeVersion(version) {
  const match = /^(?:v)?([0-9]+)\.([0-9]+)\.([0-9]+)$/u.exec(version ?? "");
  if (!match) return false;
  const [, major, minor] = match.map(Number);
  return major === 24 && minor >= 18;
}

export function assertSupportedNodeVersion(version = process.versions.node) {
  if (!isSupportedNodeVersion(version)) {
    throw new Error(
      `NODE_VERSION_PREFLIGHT_FAILED: expected Node ${SUPPORTED_NODE_RANGE}, received ${version}`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertSupportedNodeVersion();
  process.stdout.write(`Node ${process.versions.node} satisfies ${SUPPORTED_NODE_RANGE}.\n`);
}
