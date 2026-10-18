# Selected flat source research

P4 retains 26 actual-disk observations covering the selected predicates of
A-01 through A-08. The final replay passed its positive and rejecting assertions
with an exact packed Foundation candidate. Its report remains
`kind: research-selected-flat-source`, `source: incomplete`,
`adoption: unchanged`, and `nested: not-selected`.

The [fixture plan](../../../../docs/qualification/module-fixture-plan.md#p4--qualify-source-facts-through-their-existing-owners),
[scenario catalog](../../../../docs/qualification/module-fixture-scenarios.md)
and [Foundation acceptance table](../../../../docs/qualification/module-fixture-handoff.md#foundation-source-fact-handoff)
own the requirements. This directory records bounded research evidence; it does
not supersede their adoption or qualification conditions.

## Installed policy enforcement

The ordinary [Assembly fixture entry](../../../assembly/consumer-fixtures.test.mjs)
also invokes `policy.mjs` against the actual materialized semantic source using
the installed Foundation public CLI. Its checked-in `source-dependencies.yaml`
governs all of `src`, with separate application, adapter, public contract and
composition boundaries. It declares the exact permitted sibling surfaces and
keeps IO and Get Modular imports out of application code. A configuration-only
edit to that YAML selects the existing fast scan.

This route checks a complete independent disk inventory before its positive
baseline, then requires specific Foundation diagnostics from real mutations:
missing targets, forbidden sibling and non-entrypoint imports, unsupported bare
alias/workspace/self-package forms, unknown externals, parse failures, computed
loaders and application dependencies on composition, Get Modular or filesystem
IO. The alias/workspace shapes are deliberately unsupported references; they do
not qualify configured resolution for those mechanisms. Every mutation restores
its source, and the restored tree must pass the installed policy again.

These policy predicates are partial A-row enforcement on the existing installed
Foundation version. They do not establish the remaining released source-fact
chain and scoped CMS/FMS parity. The 26-observation candidate replay below
remains separate research evidence, and overall `source: incomplete`,
`adoption: unchanged` and `nested: not-selected` remain in force.

## Public research route and authority

The adapter independently enumerates actual source files and directories. It
then calls `observeSourceGraph` from the public
`@agent-teams/engineering-foundation/source-graph` entry. Observed files, imports
and empty directories go to the existing public `checkFeatureModule` kernel in
`@agent-teams/feature-module-standard`. Observed imports and complete use-case
runtime export facts go to public `checkModuleLayout` from
`@get-modular/conformance`. The adapter contains no parser or standard evaluator.

`profile.mjs` owns the test's required paths, exact allowed external specifiers,
permitted relations and selected surfaces. These are expectations. The public
graph and independent disk inventory provide the facts compared with them.
`records.mjs` preserves raw parse failures, unresolved references, external
references and runtime export coverage before calling either rule owner.
`scenarios.mjs` mutates real files and restores them; `run-research.mjs` supplies
the isolated public tools and existing semantic consumer materialization.

| Authority or artifact | Identity and status |
| --- | --- |
| GM adopted FMS profile | v1, Git blob `d0bfff2033faf544fe65268c1dcdfd524d093015`, SHA-256 `851653f96643cf0466b67ab22963661976b00de44840fa3144a48a8c054f95fa` |
| Public research FMS package | Exact `@agent-teams/feature-module-standard@0.0.0` archive; its `STANDARD` identifies v1.1, SHA-256 `cfa088ef7396139554fe5e3bcc839271b23299c6b60c569a3a7f1cd7c9f0bc6c` |
| Existing composition-contract reference | Git blob `bd949a9a670862fea851a7791fce772fdef3b4fc`; the flat recipe's A-06 surfaces remain selected |
| Foundation candidate | Source head `dd2d1848102edb96dc615da37ce7c12a11a63b39`; packed from the clean, already built owner checkout |
| Ordinary GM dependency | Published Foundation 1.7.4 remains installed and pinned; that archive has no public `./source-graph` export |

The candidate still has manifest version 1.7.4. Its archive hash identifies
unreleased research bytes, not the published package of that version. The FMS
kernel exposes no v1 selector. Its successful v1.1 predicates do not establish
parity with the adopted v1 profile or authorize v1.1 adoption. This replay makes
no Foundation merge, release or whole-repository migration claim.

## Selected facts and limits

The baseline census observes 21 production TypeScript files and 31 graph edges
under `semantic/src`. The recipe is flat and uses direct static ESM imports,
including explicit type imports. Exact allowlisted external imports remain
external. Missing required files, missing relative targets, unknown externals,
parse failures and computed runtime references cannot become a successful
source observation.

Runtime export facts describe direct syntax, not module execution, inferred
factory return values or complete TypeScript configuration semantics. CMS gets
a use-case export count only when that file's public inventory is complete.
Unknown factory-valued exports in other files remain visible in their raw
coverage records; their presence does not establish complete export counts.

The alias, workspace and self-package cases use bare specifier shapes that the
selected subset rejects as unsupported external references. They do not qualify
a configured alias or workspace resolver. Dynamic imports, CommonJS loads,
direct re-exports and import-then-export forms stay outside this static subset;
their observed provenance or unsupported records are retained. Nested features
and broader republication behavior are not selected. Directory inventory is
supplied, but this replay does not qualify every empty-role or CMS/FMS rule.

An observation's `factCoverage: complete` means the facts needed for that
selected predicate were available. It is separate from the rule result: a
forbidden private edge has complete facts and a rejecting FMS diagnostic.
`factCoverage: incomplete` prevents the adapter from claiming a rule pass when
the selected facts are missing or unsupported. The overall adopted source
qualification remains incomplete even when every research assertion succeeds.

| Row | Observations | Actual evidence and expected result |
| --- | --- | --- |
| A-01 | 3 | Complete actual tree passes; a removed source yields the expected TS2307 diagnostic; a missing required use case retains both missing-file and unresolved-reference facts |
| A-02 | 5 | Public feature edge passes; private relative edge yields `deep-import`; alias, workspace and self-package shapes each yield `fixture.source.unsupported-external` |
| A-03 | 3 | Missing literal target, unknown external and parse failure remain explicit incomplete observations |
| A-04 | 3 | Computed dynamic load and aliased CommonJS loader retain unresolved runtime reference kinds; literal dynamic import is rejected outside the static subset |
| A-05 | 2 | Direct re-export and import-then-export retain their provenance and fail the selected subset's export-form requirement |
| A-06 | 4 | Application-to-composition-contract import rejects; removing `moduleComposition` changes the kernel result; type-only use cycle yields `feature-cycle`; actual runtime file cycle additionally yields `load-cycle` |
| A-07 | 2 | Removing an input declaration's value importer yields CMS `orphan-declaration`; a real input entry in an Assembly group yields `assembly.bind.invalid-group` |
| A-08 | 4 | Extra actual runtime export yields CMS `use-case-export`; an unknown use-case export prevents a count claim; missing root yields `SOURCE_DIRECTORY_UNAVAILABLE`; a 4 MiB plus one byte source yields `SOURCE_FILE_INVALID` |

The final restored tree is checked after the mutations. The source-dependency
policy in ordinary GM checks remains separate evidence; this research does not
replace it with generated expectations or a broad repository profile.

## Replay the exact artifacts

Use the repository's pinned Node and pnpm, ready public outputs for Core,
Assembly, Resources and Conformance, and a new isolated tool consumer. The
delivery evidence retains its `package.json`, `pnpm-workspace.yaml`, exact
`pnpm-lock.yaml`, the two archives below and the report metadata. The manifest
uses only these two relative tool dependency locators:

```json
{
  "@agent-teams/engineering-foundation": "file:./engineering-foundation-dd2d1848.tgz",
  "@agent-teams/feature-module-standard": "file:./fms-0.0.0.tgz"
}
```

From the GM checkout, with `p4_tools` naming that prepared isolated directory:

```sh
p4_tools=/absolute/path/to/isolated-p4-tools
pnpm --dir "$p4_tools" install --offline --frozen-lockfile --ignore-scripts
node tests/qualification/consumer-fixtures/source/run-research.mjs \
  "$p4_tools" "$p4_tools/p4-replay-report.json"
```

The recorded replay used Node 26.11.1, pnpm 11.20.0, current TypeScript 7.0.2,
Node declarations 24.19.1, `NODE_USE_ENV_PROXY=1` and
`TMPDIR=/var/tmp/get-modular-qualification-ziPaKE`. The external temporary root
keeps disposable consumers outside the repository workspaces. Its initial
dependency contents and cache came from the historical isolated consumer. Pnpm
prepared the changed local archive locator and integrity offline, preserving
all transitive resolutions, then installed with the frozen lockfile: one
package replaced and zero downloads. An offline replay needs those locked
dependency contents available; the harness itself performs no installation.

The final Foundation archive was produced with the owner's existing pack
command, using its already built outputs:

```sh
pnpm --filter @agent-teams/engineering-foundation pack \
  --pack-destination .cache/source-facts-candidate/dd2d1848 --json
```

The recorded replay is identified by the retained archive and declaration hashes
below. Its public `source-graph.d.ts` includes the final named fact types. The
harness uses the supplied installed public entrypoints and records their
resolutions; it does not verify those installed bytes against the retained hashes
or independently qualify the declarations with another typed consumer.

## Final recorded evidence

The GM base was `2f1b33069d1942911e16824d658e3582b62da6a7`, with the four source
adapter files identified individually in `p4-final-metadata.json`. The semantic
materialization hash covers 33 files and 37,812 bytes, including test/support
files; its 21 production source files are the A-row census above. The report
records all 26 raw observations, exact public import resolutions, the full tool
lockfile, four GM package output hashes and the source materialization identity.

| Evidence item | SHA-256 |
| --- | --- |
| Final `engineering-foundation-dd2d1848.tgz`, 962,592 bytes | `a94fa95b91994222c23498219f65b1cb8ff68d9593a86929f4dd6029301f6413` |
| Exact `fms-0.0.0.tgz`, 39,361 bytes | `327a5be4faaff7d6fc3fda5f7c524bcfe3fb20c97809a7dbf7fd75eef64a12fe` |
| Final public `source-graph.d.ts` | `c39e827e3ae320fb765b932224751359d1d85325d9c5b1e17f16189c0300bf94` |
| Isolated consumer lockfile | `9bfdba9b94f32143ebde31fda33cffe04601d3c867149fdaf7fbe11eb538eb32` |
| GM root lockfile | `c6471a718ca4f58973b17bec91e69ef59151e67aa95782d4c2dd6f4c7aae532a` |
| Semantic materialization `sourceTree` | `23e1fcc5ad9717b23c9480b57722b19e4819541624cd8bbed09b4de64010f3d7` |
| `p4-final-report.json`, 547,972 bytes | `48f47c222a07d41f1b3099498cf5ca8a423f29508a3be2c8ce8b1a49b304122a` |
| `p4-final-metadata.json` | `155b7fa5e74fbb23965530e2365cca6308eaea8d26cb871e341f1efbf2de32eb` |

Metadata preserves the executed command, source heads, archive integrity values,
installed public resolutions and their entry hashes, compiler/environment
identity and installation logs. Historical c5 evidence remains unchanged:
Foundation source `c5c179b838490ad6feeb8eb77b52740fc9069f1c`, archive SHA-256
`c03e2ad1a2d65a41286a731101b0a097021ba93b3c2d9802cdbb26164384254e`, and report
SHA-256 `183139704ec10d8b3b88fa7c1ac4bbb15f497323fc7a048627ae4cda20981f67`.

The remaining adoption handoff needs an exact released public source-fact
artifact and a public FMS route matching the accepted semantics, or an explicit
separate adoption decision. Its GM owner then pins the admitted artifact and
profile, establishes scoped parity, and integrates the applicable A checks in
the existing Assembly entry with its exact configuration routing. This
directory's installed policy gate covers only the predicates described above;
it does not automate the currently missing admitted FMS/CMS chain.
Runtime fixture work can continue with source qualification incomplete.
