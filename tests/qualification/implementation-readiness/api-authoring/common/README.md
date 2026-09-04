# Common API authoring qualification lab

This disposable comparison is non-authoritative, qualification-only, and not
production code. It compares an inert descriptor object, typed `defineModule`,
and a separate inert declaration plus typed activation factory against one
immutable 30-scenario corpus and one independent deterministic oracle.

Run from the repository root:

```sh
node node_modules/typescript/bin/tsc -p tests/qualification/implementation-readiness/api-authoring/common/tsconfig.json
node tests/qualification/implementation-readiness/api-authoring/common/run.mjs
```

The first command emits JavaScript and `.d.ts` files for every candidate plus
compile-time positive and negative probes. The runner executes 90 candidate ×
scenario cells, checks corpus identity, inertness, hostile keys, discovery
imports, fallback and permutation behavior, generates 10/100/1000 declaration
type-scale probes only below the OS temporary directory, and removes them.
Machine-readable JSON is printed and written to `dist/result-summary.json`.

Metrics use the same counting rules for all candidates. LOC is nonblank source
inside the marked authoring/glue regions; declaration measures use emitted
`.d.ts` bytes; files/module counts the declaration and, for the split shape,
its external factory file; binding loci counts the single explicit profile
binding collection; removal edits count selection plus binding deletion;
disable edits count the host-owned selection filter. Compile duration is an
observation from the pinned local TypeScript toolchain, not a threshold.
Tree-shaking and runtime performance are `not-measured` because this lab has no
pinned bundler and no production runtime subject.
