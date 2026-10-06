import {
  assertSupportedNodeVersion,
  assertSupportedToolingNodeVersion,
  isSupportedNodeVersion,
  isSupportedToolingNodeVersion,
} from "../architecture/checks/node-version.mjs";

interface BoundaryCase {
  readonly version: string;
  readonly public: boolean;
  readonly tooling: boolean;
}

interface Policy {
  readonly name: "public" | "tooling";
  readonly classify: (version: string) => boolean;
  readonly preflight: (version: string) => void;
}

const policies = {
  public: {
    name: "public",
    classify: isSupportedNodeVersion,
    preflight: assertSupportedNodeVersion,
  },
  tooling: {
    name: "tooling",
    classify: isSupportedToolingNodeVersion,
    preflight: assertSupportedToolingNodeVersion,
  },
} satisfies Readonly<Record<Policy["name"], Policy>>;

// These expected outcomes specify the two independently owned runtime floors.
const boundaries: readonly BoundaryCase[] = [
  { version: "23.99.99", public: false, tooling: false },
  { version: "24.17.99", public: false, tooling: false },
  { version: "24.18.0", public: true, tooling: false },
  { version: "v24.18.0", public: true, tooling: false },
  { version: "24.19.99", public: true, tooling: false },
  { version: "24.20.99", public: true, tooling: false },
  { version: "24.21.0", public: true, tooling: true },
  { version: "v24.21.0", public: true, tooling: true },
  { version: "24.21.9", public: true, tooling: true },
  { version: "24.22.0", public: true, tooling: true },
  { version: "24.99.99", public: true, tooling: true },
  { version: "25.0.0", public: false, tooling: false },
  { version: "25.99.99", public: false, tooling: false },
  { version: "26.0.0", public: false, tooling: false },
  { version: "26.9.99", public: false, tooling: false },
  { version: "v26.9.99", public: false, tooling: false },
  { version: "26.10.0", public: true, tooling: true },
  { version: "v26.10.0", public: true, tooling: true },
  { version: "26.10.9", public: true, tooling: true },
  { version: "26.11.0", public: true, tooling: true },
  { version: "26.99.99", public: true, tooling: true },
  { version: "27.0.0", public: false, tooling: false },
  { version: "27.10.0", public: false, tooling: false },
];

const malformed = [
  "",
  "24",
  "24.21",
  "v",
  "V26.10.0",
  "26.a.0",
  "26.10.-1",
  "26.10.0.1",
  "26.10.0-rc.1",
  "26.10.0+build.1",
  " 26.10.0",
  "26.10.0 ",
  "26.10.0\n",
];

function verify(policy: Policy, version: string, expected: boolean): void {
  const label = `${policy.name} policy for ${JSON.stringify(version)}`;
  if (policy.classify(version) !== expected) {
    throw new Error(`${label}: classification must be ${expected}.`);
  }
  let rejected = false;
  try {
    policy.preflight(version);
  } catch (error: unknown) {
    rejected = true;
    if (expected) {
      throw new Error(`${label}: supported version was rejected.`, { cause: error });
    }
    if (
      !(error instanceof Error) ||
      !error.message.startsWith("NODE_VERSION_PREFLIGHT_FAILED: ") ||
      !error.message.endsWith(`, received ${version}`)
    ) {
      throw new Error(`${label}: rejection did not carry the preflight error.`, { cause: error });
    }
  }
  if (!expected && !rejected) {
    throw new Error(`${label}: unsupported version passed preflight.`);
  }
}

for (const policy of Object.values(policies)) {
  for (const boundary of boundaries) {
    verify(policy, boundary.version, boundary[policy.name]);
  }
  for (const version of malformed) {
    verify(policy, version, false);
  }
}

// Tooling input must also be a canonical version; public parsing is unchanged.
const malformedTooling = [
  "024.21.0", "24.021.0", "24.21.00",
  "026.10.0", "26.010.0", "26.10.00",
];
for (const version of malformedTooling) {
  verify(policies.tooling, version, false);
}

// Default-argument assertions exercise the real runtime used by this test.
assertSupportedNodeVersion();
assertSupportedToolingNodeVersion();
