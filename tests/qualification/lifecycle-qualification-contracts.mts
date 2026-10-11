// Root-owned development contracts; never part of a production package export.
import type { acceptedInstallerProvenance } from "./lifecycle-tool-prepare.mts";

export interface PreparedToolEntry { path: string; sha256: string; kind: string; linkTarget?: string }
export interface PackagePayloadProjection {
  schemaVersion: 1; provenance: typeof acceptedInstallerProvenance;
  published: PackagePayloadRow[]; installedPayloadSha256: string;
  witnesses: InstallerWitness[]; witnessesSha256: string;
}

export interface SupportOrigin { id: string; version: string; platform: string; arch: string; status: "verified";
  archiveSha256: string; payloadSha256: string; source: string; method: "package-sri"; sri: string; payloadProjection?: PackagePayloadProjection }
// Finite development evidence for the accepted frozen Linux installation, not a
// general pnpm SPI. The renderer branch below was derived from the SRI-authenticated
// pnpm 11.20.0 bundle (cmd-shim 9.0.6). It never imports that private runtime.
export interface PackagePayloadRow { path: string; sha256: string; linkTarget?: string }

export interface InputIdentity { path: string; realpath: string; sha256: string; linkTarget?: string }
export interface RestoredDependencyGraph {
  readonly roots: Readonly<Record<string, string>>;
  readonly inventories: ReadonlyMap<string, readonly InputIdentity[]>;
  readonly entries: readonly InputIdentity[];
  readonly restored: readonly InputIdentity[];
  readonly sha256: string;
}
export interface ToolOrigin {
  id: string; version: string; platform: string; arch: string; status: "verified";
  payloadSha256: string; archiveSha256: string; source: string;
  verification: { method: "signed-shasums" | "package-sri"; receipt: InputIdentity; policyCommit?: string; signer?: string; sri?: string };
}
export interface InstallerWitness {
  declaringCoordinate: string; declaringManifestSha256: string; dependency: string; version: string;
  edge: string; edgeTarget: string; targetRoot: string; manifestSha256: string;
  binName: string; binDeclaration: string; binSha256: string;
  shimPath: string; shimSha256: string; shimMode: number; originalTarget: string; nodePaths: string[];
}

export interface CompilationSeal {
  runId: string; parentInvocation: string; compiledRoot: string;
  source: string; toolManifest: string; config: InputIdentity; compiler: InputIdentity;
  emission: InputIdentity[]; production: InputIdentity[];
}
