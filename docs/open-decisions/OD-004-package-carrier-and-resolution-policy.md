---
id: OD-004
type: open-decision
status: open
owner: architecture
summary: Selects the exact package carrier and supported resolution surface for the first Core archive.
related:
  - ADR-0003
  - ADR-0007
  - ADR-0009
  - ADR-0012
---

<!-- cspell:words subpaths -->

# OD-004: Package carrier and resolution policy

## Decision required

Close the physical package contract for `@get-modular/core` before creating or
publishing its first production archive. The decision must define the module
format, root export conditions, declaration resolution, allowed archive
contents, supported consumer modes, and negative resolution behavior.

ADR-0003 owns package identity and topology. ADR-0009 proposes the public symbol
names. Neither decision fixes how one packed archive exposes those symbols to
Node, TypeScript, bundlers, browsers, or Electron.

## Constraints

- One archive and one root entry point are authoritative. Package conditions
  MUST NOT select different semantic implementations.
- Core is ESM-only. CommonJS `require`, deep imports, `package.json` imports,
  environment-specific branches, and undeclared subpaths fail closed.
- TypeScript declarations and JavaScript runtime files resolve from the same
  root export. Package-level compatibility aliases MUST NOT create a second
  resolution authority.
- The public archive MUST exclude source, tests, fixtures, qualification data,
  maps that disclose excluded source paths, repository tooling, and private
  framework types unless an accepted publication decision explicitly admits an
  item.
- Browser and worker evidence MUST exercise the packed package's public root
  resolution path. Mapping directly to `dist/index.js` is feasibility evidence,
  not package-resolution conformance.
- Archive identity is computed once. Publication, registry read-back, and every
  mandatory consumer test MUST use that retained byte-identical archive.

## Candidate direction

Use an ESM package with only this root export shape:

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

The nested `default` is a resolver fallback inside `import`; it does not create
a JavaScript default export. Omit `main`, `module`, package-level `types`,
`typings`, `typesVersions`, `require`, outer `default`, `node`, `browser`,
development/production conditions, and subpath exports.

Disposable Node and TypeScript observations support this direction, but one
prototype archive included `src/**` and its browser fixture bypassed package
exports. Those observations prove feasibility only and cannot close this
decision or authorize publication.

## Acceptance criteria

- A governed package manifest fixes the exact export map and an exhaustive
  archive allowlist.
- A pack-once test retains the archive and records its SHA-256, npm integrity,
  manifest bytes, file inventory, toolchain identities, and source commit.
- Fresh consumers execute the public root with Node ESM and typecheck it with
  every supported TypeScript/module-resolution pair.
- Negative consumers prove rejection of CommonJS `require`, deep imports,
  `package.json` access, and unknown subpaths. Condition-injection consumers
  prove that extra conditions never select an alternate target.
- Browser window, dedicated worker, and required Electron evidence import the
  same retained archive through the supported public root carrier.
- Declaration-surface and archive-content audits reject product, Foundation,
  conformance, test, source, and private adapter leakage.
- Publish-time rehash and registry read-back reproduce the retained archive
  identity before any release claim.

## Resolution

Open. ADR-0012 is a proposed resolution. Before acceptance, a private,
non-publishable qualification subject MAY pack the proposed carrier under the
qualification fixture boundary solely to produce reviewable evidence. It is not
a production package, public export authority, conformance claim, or publication
candidate. Production package creation, public exposure, and publication remain
blocked until the decision is accepted with the required packed evidence.
