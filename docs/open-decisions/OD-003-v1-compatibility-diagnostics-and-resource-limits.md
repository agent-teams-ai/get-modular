---
id: OD-003
type: open-decision
status: open
owner: architecture
summary: Selects the closed V1 compatibility grammar, diagnostic contract, and numeric resource limits required before implementation.
related:
  - ADR-0001
  - GM-REQ-V1
  - OD-002
---

# OD-003: V1 compatibility, diagnostics, and resource limits

## Decision required

Before production code, accept one complete V1 conformance profile that fixes:

- the declaration and plan schema versions;
- the supported compatibility families and exact comparison algorithm;
- identifier grammar and maximum encoded lengths;
- maximum declarations, slots per declaration, total slots, graph edges,
  ordered contributions, graph depth, and emitted diagnostics;
- stable diagnostic codes, primary sort key, path representation, truncation,
  and redaction rules;
- behavior for unknown schema versions, compatibility families, fields, and
  limit overflow.

## Constraints

- Compatibility is deterministic data, never an executable callback.
- Unknown versions and families fail closed.
- Limits apply before unbounded allocation or traversal.
- Diagnostics remain bounded and must not expose credentials, absolute host
  paths, executable factories, or product authorization data.
- The profile must include positive and negative conformance vectors on Linux,
  macOS, and Windows.

## Candidate direction

Start V1 with the smallest exact-match compatibility family and conservative
resource limits measured against synthetic graphs. Add ranges or richer
families only when a real consumer demonstrates the need. This is a proposal,
not an accepted algorithm or numeric profile.

## Resolution evidence

The resolving ADR must include canonical fixtures, boundary tests, deterministic
diagnostic snapshots, complexity measurements, and explicit conditions for
raising any limit without changing semantic compatibility.
