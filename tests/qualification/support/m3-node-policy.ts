import { isSupportedToolingNodeVersion } from "../../../architecture/checks/node-version.mjs";

export function m3NodePinPath(action: string): ".node-version" | ".node-compat-version" {
  if (action === "node") return ".node-compat-version";
  if (["pack", "native", "collect"].includes(action)) return ".node-version";
  throw new Error("m3.node.unknown-action");
}

export function assertM3NodePin(working: string, committed: string, actual: string): string {
  if (working !== committed) throw new Error("m3.node.pin-source-drift");
  const pin = committed.trim();
  if (!isSupportedToolingNodeVersion(pin) || actual !== `v${pin}`) {
    throw new Error("m3.node.runtime-pin-mismatch");
  }
  return pin;
}
