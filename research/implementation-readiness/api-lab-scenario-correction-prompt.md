# Exact 30-scenario API lab correction

Work from exact commit `7d85a51bcfdf1a2e54490ccb6c4ed8126aef3fa7` in a clean standalone workspace.

You own only:

`tests/qualification/implementation-readiness/api-authoring/common/**`

The existing common lab executes 30 cases, but it substituted a different semantic matrix. Correct that P1. The corpus must use exactly these 30 goal scenarios, one unique ID each, in this order:

1. one provider;
2. one consumer;
3. required dependency;
4. missing required dependency;
5. missing optional dependency;
6. zero many;
7. one many;
8. multiple many;
9. duplicate provider;
10. ambiguous binding;
11. incompatible capability;
12. dependency cycle;
13. disabled root;
14. disabled required provider;
15. disabled optional provider;
16. unreachable provider;
17. multiple roots;
18. deterministic reorder;
19. hostile slot names: own `__proto__`, `constructor`, `then`, composed and decomposed Unicode;
20. unknown declaration fields;
21. duplicate module IDs;
22. duplicate implementation IDs;
23. invalid owner path;
24. profile with unknown module;
25. hidden fallback attempt;
26. discovery without executable imports;
27. literal loader table for selected modules only;
28. direct Pure DI parity;
29. declaration serializability;
30. TypeScript declaration emit.

Rules:

- All A/B/C adapters execute the identical frozen corpus: exactly 90 cells and one digest.
- Do not replace any required case with below/above cardinality, resource limit, cascade suppression, unknown binding consumer/provider, or a different compiler scenario. Those may be extra non-counted assertions only if needed.
- Model disabled modules as qualification-only host desired-profile input/impact. Do not claim runtime unload, lifecycle, generation, cleanup, or Core ownership.
- `ambiguous binding` must be distinct from an exact duplicate provider ID.
- Duplicate module and implementation IDs are separate cases.
- Unknown declaration fields must occur inside a declaration, not only at world root.
- Invalid owner path and unknown profile module need explicit deterministic diagnostics.
- Hidden fallback must prove the oracle ignores/rejects the fallback and returns missing dependency.
- Scenario 27 must call/import only selected literal loaders and prove an unselected loader counter stays zero.
- Scenario 28 must compare the candidate host factory result with direct handwritten Pure DI output.
- Scenario 30 must be backed by actual TypeScript declaration emit for every candidate, not a name-only pass.
- Preserve inert JSON-compatible declarations, no executable discovery imports, safe own-property handling, deterministic output, no registration-order semantics and no production imports.
- Keep generated files out of source control and use OS-temporary output where practical.
- The runner must fail if titles/IDs differ from the exact closed list or if a required case is only a sentinel/name.

Run the exact TypeScript compiler and runner with Node 24.18 when available. Return a minimal patch, exact commands/output, and do not edit documentation, manifest, package scripts, accepted ADRs, production source or existing candidate directories.
