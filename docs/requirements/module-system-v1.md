---
id: GM-REQ-V1
type: requirements
status: accepted
owner: architecture
summary: Normative requirements for the Get Modular pre-1.0 composition core.
related:
  - ADR-0001
  - OD-001
  - OD-002
---

# Module System V1 requirements

The keywords MUST, MUST NOT, SHOULD, and MAY are normative.

## Model

### GM-REQ-001: Distinct portable identities

The model MUST distinguish `ModuleId`, `CapabilityId`, `ImplementationId`, and
profile-local `SlotId`. Runtime handles MAY be branded TypeScript strings, but
their wire values MUST be validated strings. Symbols, enums, constructors, file
paths, and package registration order MUST NOT be persistent identity.

### GM-REQ-002: Inert declarations

A declaration MUST be serializable data and MUST NOT perform I/O, discover
executables, instantiate implementations, mutate registries, or capture ambient
runtime state.

### GM-REQ-003: Dependency cardinality

V1 MUST support `required`, `optional`, and bounded ordered `many` dependencies.
`many` MUST declare minimum and maximum counts plus an explicit deterministic
ordering source. There is no implicit first-provider-wins behavior.

### GM-REQ-004: Explicit implementations and bindings

Profiles MUST bind slots to exact implementation identities or explicit
absence where absence is legal. Capability identity alone MUST NOT select a
provider when more than one implementation is eligible.

### GM-REQ-005: Complete normalized profile

Compilation MUST consume a complete normalized profile. The compiler MUST NOT
read mutable tags, environment variables, filesystem state, installation
state, registration order, or hidden defaults.

## Compilation

### GM-REQ-006: Closed-world validation

The compiler MUST validate the complete selected world before returning a plan.
Missing, ambiguous, duplicate, incompatible, cyclic, out-of-bounds, or unknown
references MUST fail before any implementation factory is invoked.

### GM-REQ-007: Determinism

Equivalent semantic inputs MUST produce byte-identical canonical plans,
digests, and ordered diagnostics regardless of input enumeration or machine.

### GM-REQ-008: Compatibility

V1 compatibility MUST be a closed, versioned algorithm over serializable data.
Declarations MUST NOT provide executable compatibility callbacks. Unsupported
compatibility families and schema versions MUST fail closed.

### GM-REQ-009: Immutable plan and digest

A successful compilation MUST return an immutable plan and a domain-separated
content digest. The plan MUST contain selected identities and dependency edges,
not functions, credentials, absolute paths, authorization decisions, or runtime
generation state.

### GM-REQ-010: Bounded diagnostics and inputs

Failures MUST use stable machine-readable codes, bounded paths, deterministic
ordering, and redacted details. V1 MUST define limits for declarations, slots,
edges, contributions, identifier lengths, diagnostic count, and graph depth.

## Runtime boundary

### GM-REQ-011: Product-owned loading

Get Modular MUST NOT scan a filesystem or dynamically discover executable code.
Target-local literal loader tables and executable imports belong to a product
host. A neutral loader contract MAY describe the handoff without owning the
table.

### GM-REQ-012: Closed dependencies

An implementation factory MUST receive only a closed object containing its
declared dependencies. Generic `resolve`, container access, global context,
ambient registries, and framework-owned decorators are forbidden in the public
contract.

### GM-REQ-013: Single operational authority

Get Modular MUST NOT own admission, authorization, desired state, readiness,
publication, routing, generations, fencing, drain, durable recovery,
quarantine, or retirement. A product host remains the sole operational
authority.

### GM-REQ-014: Construction is not activation

Any optional construction helper MUST be an attempt-scoped leaf invoked only
after the host provides selected, authorized factories. Construction MUST NOT
publish availability, retry unknown external effects, allocate durable
identity, or claim cleanup completion.

## Evolution and evidence

### GM-REQ-015: Framework independence

Public production packages and declarations MUST NOT expose Cordis, Awilix,
Extension Foundation, Engineering Foundation, Docs Protocol, or product types.
Internal adapters MAY use qualified libraries behind conformance tests.

### GM-REQ-016: Stability gate

Synthetic modules MAY qualify `0.x`. Stable 1.0 MUST require two independently
authored production adapters, executable cross-consumer conformance, packed
artifact checks, and an accepted promotion decision referencing immutable
consumer evidence.
