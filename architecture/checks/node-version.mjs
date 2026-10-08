import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SUPPORTED_NODE_RANGE = ">=24.18.0 <25 || >=26.10.0 <27";
export const TOOLING_NODE_RANGE = ">=24.21.0 <25 || >=26.10.0 <27";

export function isSupportedNodeVersion(version) {
  const match = /^(?:v)?([0-9]+)\.([0-9]+)\.([0-9]+)$/u.exec(version ?? "");
  if (!match) return false;
  const [, major, minor] = match.map(Number);
  return (major === 24 && minor >= 18) || (major === 26 && minor >= 10);
}

export function assertSupportedNodeVersion(version = process.versions.node) {
  if (!isSupportedNodeVersion(version)) {
    throw new Error(
      `NODE_VERSION_PREFLIGHT_FAILED: expected Node ${SUPPORTED_NODE_RANGE}, received ${version}`,
    );
  }
}

export function isSupportedToolingNodeVersion(version) {
  const match = /^(?:v)?(24|26)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.exec(version ?? "");
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return (major === 24 && minor >= 21) || (major === 26 && minor >= 10);
}

export function assertSupportedToolingNodeVersion(version = process.versions.node) {
  if (!isSupportedToolingNodeVersion(version)) {
    throw new Error(
      `NODE_VERSION_PREFLIGHT_FAILED: expected Node ${TOOLING_NODE_RANGE}, received ${version}`,
    );
  }
}

export function isDirectExecution(moduleUrl, entryPath = process.argv[1]) {
  if (!entryPath) return false;
  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isDirectExecution(import.meta.url)) {
  assertSupportedToolingNodeVersion();
  process.stdout.write(`Node ${process.versions.node} satisfies tooling ${TOOLING_NODE_RANGE}.\n`);
}
