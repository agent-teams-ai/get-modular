---
id: ADR-0012
type: adr
status: accepted
owner: architecture
summary: Selects one ESM-only root package carrier, loadable through import and require(esm), with closed resolution and archive custody.
approved_by: product-owner
accepted_at: 2026-09-04
related:
  - ADR-0003
  - ADR-0007
  - ADR-0009
  - OD-004
  - ADR-0017
---

<!-- cspell:words subpaths -->

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
This decision therefore selects a narrow target and requires new pack-once
evidence against the real archive.

## Decision

This decision is accepted. The packed evidence below is the publication gate
for every archive, not a precondition of the decision itself. Accepted
ADR-0007 forbids publishing a package as conforming before the runtime matrix
executes and makes runtime coverage a publication gate; accepted ADR-0017
narrows that publication gate for pre-1.0 `not-claimed` archives and records
the superseded passages.

### Package manifest

`@get-modular/core` is ESM-only and exposes exactly one package root. The
manifest rules in this section bind that package; `@get-modular/conformance`
carries its own shape, and only the lifecycle-script prohibition below is
common to both. `governance:check` enforces the export map exactly as written
here.

The map is:

```json
{
  "type": "module",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "default": "./dist/index.js"
    }
  }
}
```

The nested `default` is only the fallback target selected after `types` inside
the `import` condition. The sibling top-level `default` points at the same ESM
file so that CommonJS hosts load Core through `require(esm)`; it is a second
resolution path to one implementation and one module instance, never a second
build. Neither `default` authorizes a JavaScript default export. Public runtime
exports remain named exports owned by the accepted public API decision.

The package MUST omit:

- `preinstall`, `install`, `postinstall`, `prepare`, and every other lifecycle
  script that a package manager runs on install or publish; `governance:check`
  rejects such a manifest for any accepted package identity regardless of any
  open decision, because an install script runs code on every consumer;
- `main`, `module`, package-level `types`, `typings`, `typesVersions`, and a
  root `browser` field, which would be a second environment-specific
  implementation;
- a `require` condition and `node`, `browser`, `development`, `production`, or
  other environment-specific export conditions;
- subpath exports, including `./package.json` and `./dist/*`;
- a CommonJS build or a second environment-specific implementation.

### Archive and resolution custody

The publication allowlist contains only files required to execute, typecheck,
license, and minimally document the package. Source, tests, fixtures,
qualification assets, repository configuration, conformance tooling, private
adapter APIs, and source maps whose sources are not admitted by the allowlist
are excluded.

Before each publication, the production package is packed once from a clean
source checkout. Its exact bytes, SHA-256, npm integrity, package manifest,
file inventory, source commit, Node/npm/pnpm/TypeScript identities, and build
command are recorded before consumer tests. Every mandatory consumer installs
that same archive. Repacking per platform or per consumer is forbidden. A
pre-1.0 archive that passes the Node and TypeScript cases below may publish as
`not-claimed`, as accepted ADR-0017 permits; the browser, worker, and Electron
cases are required for the first conformance claim, as ADR-0007 requires.

The supported resolution surface is the package root through ESM `import`, the
same root through CommonJS `require()` on a runtime that supports
`require(esm)`, and the matching TypeScript declaration target. Deep imports,
package-manifest imports, and unknown subpaths are unsupported and MUST fail
rather than find a compatibility fallback. A runtime without `require(esm)`
fails `require()` with `ERR_REQUIRE_ESM`; that is a documented negative case,
not a reason to ship a CommonJS build. Additional runtime condition names
such as
`browser` or `development` MUST NOT select another target: when the ordinary
ESM `import` condition remains active they resolve to the same retained
JavaScript target. The declaration-only `types` condition is the explicit
exception to that
same-target assertion. Running Node ESM `import` with `--conditions=types` is
unsupported and MUST be a negative case: resolution selects `./dist/index.d.ts`,
Node fails before evaluating package JavaScript, and resolution does not fall
through to `./dist/index.js` or any alternate build. `require()` under the same
flag never consults the `import` branch and resolves the sibling `default`
target; that outcome is expected and is not part of the negative case. A
condition-specific JavaScript implementation is forbidden.

The supported TypeScript resolution pairs are `nodenext` and `node16` in an
ESM context (`"type": "module"` or `.mts`), `nodenext` in a CommonJS context
(`.cts` or `"type": "commonjs"`) on TypeScript 5.8 or later, where the
compiler models `require(esm)`, and `bundler`. Unsupported and therefore
negative cases are `node16` in a CommonJS context, which reports TS1479 because
that mode predates `require(esm)`, and `node10` and `classic`, which
TypeScript 7 removed. Node 24 `require()` of the package root resolves the sibling
`default` target and returns the same module instance as `import`; CommonJS
hosts whose module loader delegates to Node's `require(esm)` therefore load
Core directly. Hosts with their own CommonJS runtime, such as Jest without
`--experimental-vm-modules`, and older runtimes without `require(esm)` use
`await import()`.

Browser, dedicated-worker, and Electron qualification may use a product-owned
loader or import-map adapter, but the adapter MUST resolve the public package
root from the retained archive. A test that maps directly to a private `dist`
path does not prove this package contract.

Before publication, the release flow rehashes the retained production
archive, uploads those bytes, downloads the registry tarball, and proves its
SHA-256 is exactly equal to the retained archive SHA-256 before making a release
claim. Registry metadata or an outer envelope cannot substitute for inner
tarball byte identity.

### Precedence

This ADR supplements ADR-0003 only for the package carrier, resolution
surface, archive contents, and packed-artifact custody. ADR-0003 continues to
own package identity and topology. Accepted ADR-0009 exclusively owns public
TypeScript names; this decision creates no public symbol. Accepted ADR-0017
owns which open decisions block the publication surface.

## Publication evidence

Every publication requires a closed machine-readable manifest and independent
checker against the packed production archive covering:

- exact export-map bytes and exhaustive archive allowlist;
- one retained archive identity and full build provenance;
- Node ESM execution, Node 24 CommonJS `require()` returning the same module
  instance as `import`, and the supported TypeScript `nodenext` and `node16`
  ESM-context, `nodenext` CommonJS-context, and `bundler` consumers, plus the
  negative `node16` CommonJS-context consumer;
- a negative `require()` case on a runtime without `require(esm)` failing with
  `ERR_REQUIRE_ESM`, and negative deep-import, package-manifest, and
  unknown-subpath cases;
- runtime condition-injection cases proving that every tested additional
  condition other than `types` resolves the same retained JavaScript target and
  never an alternate build;
- a distinct Node ESM `import` `--conditions=types` negative case proving that
  the declaration target is selected and runtime loading fails before package
  JavaScript evaluation, asserting the exact pre-evaluation failure code rather
  than any failure, plus the matching `require()` case proving that the sibling
  `default` target still loads; both are excluded from same-target assertions;
- browser window, dedicated worker, and required Electron resolution through
  the public root before the first conformance claim;
- declaration and archive leakage mutations;
- a negative manifest case that declares an install-time lifecycle script and
  is rejected by the checker;
- publish-time rehash and registry read-back before publication eligibility.

Every case binds a stable ID, the retained archive hash, exact source tree,
runner/checker identity, exact consumer input, toolchain and platform identity,
command, expected result, and observed result. No disposable archive or direct
`dist` browser mapping satisfies these gates. This decision fixes the carrier
contract; each production archive remains ineligible for publication until it
passes the Node and TypeScript cases and ineligible for a conformance claim
until it passes the full matrix and release custody.

## Consequences

- Consumers get one obvious import path and one semantic implementation.
- Core does not carry a CommonJS build or environment-conditional maintenance
  cost; `require()` reaches the single ESM implementation through
  `require(esm)`.
- Runtimes and TypeScript modes that predate `require(esm)` load Core through
  `await import()`; that limit is documented, not patched with a second build.
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
  Multiple resolution authorities make consumer behavior harder to predict. The
  sibling `default` condition is the one deliberate exception: it names the
  same file as the `import` branch and adds no second implementation.
- Keep the package `import`-only. It excludes every CommonJS host that relies
  on Node's `require(esm)`, even on runtimes that support it.
- Export `dist/**` or `package.json`. That turns internal layout into public API.
- Treat a browser import map to `dist/index.js` as root-export evidence. It
  bypasses the contract being qualified.
