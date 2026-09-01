---
id: ADR-0012
type: adr
status: proposed
owner: architecture
summary: Selects one ESM-only root package carrier with closed resolution and archive custody.
related:
  - ADR-0003
  - ADR-0007
  - ADR-0009
  - OD-004
---

# ADR-0012: Select an ESM-only root package carrier

## Context

ADR-0003 selects `@get-modular/core` as the production package and keeps
conformance separate. The repository has no production package yet. A package
manifest can still create accidental public APIs through fallback fields,
conditional branches, deep imports, source maps, or archive contents even when
the TypeScript barrel is curated.

Disposable package probes demonstrated Node ESM, TypeScript NodeNext and Bundler
resolution, and a closed root export. They did not qualify a release: the probe
archive contained source and its browser import map pointed at `dist` directly.
This proposal therefore selects a narrow target and requires new pack-once
evidence against the real archive.

## Decision

This decision is proposed and becomes normative only after its acceptance
evidence is governed.

### Package manifest

`@get-modular/core` is ESM-only and exposes exactly one package root:

```json
{
  "type": "module",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      }
    }
  }
}
```

The nested `default` is only the fallback target selected after `types` inside
the `import` condition. It does not authorize a JavaScript default export.
Public runtime exports remain named exports owned by the accepted public API
decision.

The package MUST omit:

- `main`, `module`, package-level `types`, `typings`, and `typesVersions`;
- `require`, outer `default`, `node`, `browser`, `development`, `production`, or
  other environment-specific export conditions;
- subpath exports, including `./package.json` and `./dist/*`;
- a CommonJS build or a second environment-specific implementation.

### Archive and resolution custody

The publication allowlist contains only files required to execute, typecheck,
license, and minimally document the package. Source, tests, fixtures,
qualification assets, repository configuration, conformance tooling, private
adapter APIs, and source maps whose sources are not admitted by the allowlist
are excluded.

One retained archive is packed once from a hermetic source checkout. Its exact
bytes, SHA-256, npm integrity, package manifest, file inventory, source commit,
Node/npm/pnpm/TypeScript identities, and build command are recorded before
consumer tests. Every mandatory consumer installs that same archive. Repacking
per platform or per consumer is forbidden.

The supported resolution surface is the package root through ESM import and the
matching TypeScript declaration target. CommonJS `require`, deep imports,
package-manifest imports, unknown subpaths, or alternate conditions are
unsupported and MUST fail rather than find a compatibility fallback.

Browser, dedicated-worker, and Electron qualification may use a product-owned
loader or import-map adapter, but the adapter MUST resolve the public package
root from the retained archive. A test that maps directly to a private `dist`
path does not prove this package contract.

Before publication, the release flow rehashes the retained archive, uploads
those bytes, downloads the registry artifact, and proves byte identity or an
explicitly specified registry-envelope identity before making a release claim.

### Precedence

If accepted, this ADR supplements ADR-0003 only for the package carrier,
resolution surface, archive contents, and packed-artifact custody. ADR-0003
continues to own package identity and topology. ADR-0009 or its accepted
successor exclusively owns public TypeScript names. This decision neither
accepts ADR-0009 nor creates a public symbol.

## Acceptance evidence

Acceptance requires a closed machine-readable manifest and independent checker
covering:

- exact export-map bytes and exhaustive archive allowlist;
- one retained archive identity and full build provenance;
- Node ESM execution and supported TypeScript NodeNext/Bundler consumers;
- negative `require`, deep-import, package-manifest, unknown-subpath, and
  forbidden-condition cases;
- browser window, dedicated worker, and required Electron resolution through
  the public root;
- declaration and archive leakage mutations;
- publish-time rehash and registry read-back before publication eligibility.

Every case binds a stable ID, the retained archive hash, exact consumer input,
toolchain identity, command, expected result, and observed result. No current
disposable archive or direct `dist` browser mapping satisfies these gates.

## Consequences

- Consumers get one obvious import path and one semantic implementation.
- Core does not carry CommonJS or environment-conditional maintenance cost.
- Package-internal files remain private and can move without creating accidental
  compatibility obligations.
- Browsers may still need product-owned resolution adapters because bare npm
  specifiers are not resolved by browsers without a loader or import map.
- Supporting a new format, condition, or subpath requires new evidence and a
  successor decision rather than an undocumented fallback.

## Rejected alternatives

- Publish both ESM and CommonJS. It doubles the executable surface and can create
  divergent singleton and identity behavior without a demonstrated consumer.
- Add `main`, `module`, top-level `types`, and `typesVersions` for compatibility.
  Multiple resolution authorities make consumer behavior harder to predict.
- Export `dist/**` or `package.json`. That turns internal layout into public API.
- Treat a browser import map to `dist/index.js` as root-export evidence. It
  bypasses the contract being qualified.
