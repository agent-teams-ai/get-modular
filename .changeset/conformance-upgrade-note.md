---
"@get-modular/conformance": patch
---

Upgrade `@get-modular/conformance` to 0.2.0 together with `@get-modular/core` and `@get-modular/assembly` 0.4.0: conformance 0.2.0 declares them as `^0.4.0` peers (`@get-modular/resources` stays `^0.1.0`), and conformance 0.1.0 fails against Assembly 0.4.0 (its peer ranges end at `^0.3.0`, and its `ContractValue` indexes `CapabilitiesOf<T>`, which fails with TS2536 under `skipLibCheck: false`).

Migration:

- Better: one upgrade step keeps the test kit and the packages it checks in agreement.
- Codemod: none. This is a version note.
- By hand: raise `@get-modular/conformance` to `^0.2.0` in the same change that raises `@get-modular/core` and `@get-modular/assembly` to `^0.4.0`.
- Check: typecheck, then the composition smoke tests.

Authoring surface changed: no
