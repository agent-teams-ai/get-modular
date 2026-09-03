# Exact accepted helper shape - b9

This disposable fixture is a direct runtime probe of the authoring-helper
shape recorded by ADR-0007. It is not a compiler, graph engine, package, or
public API.

The probe checks that `required()` and `optional()` take no arguments and
return fresh mutable plain objects, `many({ min, max })` returns the exact
`order: "profile"` shape, and `defineModule(value) === value`. The fixture
does not validate ranges, normalize declarations, resolve bindings, or emit a
plan; those responsibilities belong to the future private compiler subject.

Run from the repository root with:

```text
node tests/qualification/implementation-readiness/api-authoring/b9/run.mjs
```

The compiler handoff and packed-consumer matrix remain future gates. Existing
candidate measurements stay exploratory and are not replaced by this probe.
