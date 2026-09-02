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
contents, supported consumer modes, negative resolution behavior, and whether
any install-time lifecycle script is permitted.

ADR-0003 owns package identity and topology. ADR-0009 proposes the public symbol
names. Neither decision fixes how one packed archive exposes those symbols to
Node, TypeScript, bundlers, browsers, or Electron.

## Constraints

- One archive and one root entry point are authoritative. Package conditions
  MUST NOT select different semantic implementations.
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

Runtime condition injection has one explicit exception to the same-JavaScript-
target rule. Extra runtime conditions such as `browser` and `development` must
still select `./dist/index.js`, but `types` is declaration-only. Node
`--conditions=types` is an unsupported negative case that selects
`./dist/index.d.ts` and must fail before package JavaScript evaluation, without
falling through to `./dist/index.js` or another build. It is excluded from
runtime same-target assertions.

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
  `package.json` access, and unknown subpaths. Runtime condition-injection
  consumers other than `types` prove that extra conditions select the retained
  JavaScript target and never an alternate build. A separate Node
  `--conditions=types` consumer proves declaration-target selection followed by
  failure before package JavaScript evaluation; it is not a same-target case.
- Browser window, dedicated worker, and required Electron evidence import the
  same retained archive through the supported public root carrier.
- Declaration-surface and archive-content audits reject product, Foundation,
  conformance, test, source, and private adapter leakage.
- The accepted manifest policy explicitly permits or rejects `preinstall`,
  `install`, `postinstall`, `prepare` and equivalent executable lifecycle hooks,
  with a negative fixture for the selected rule.
- Publish-time rehash and registry read-back reproduce the retained archive
  identity before any release claim.

## Resolution

Open. ADR-0012 is a proposed resolution. Before acceptance, a private,
non-publishable qualification subject MAY pack the proposed carrier under the
qualification fixture boundary solely to produce reviewable evidence. It is not
a production package, public export authority, conformance claim, or publication
candidate. Production package creation, public exposure, and publication remain
blocked until the decision is accepted with the required packed evidence.
