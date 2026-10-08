# Research round 4 (2026-10-01)

Three independent xhigh read-only researchers (online primary sources pinned to
tags or commits via curl and `gh`, plus probes on sketch v3). Their final messages
are saved here by root (their rules forbid writing report files):

- [topic-a-config-flags.md](topic-a-config-flags.md) - configuration and feature-flag
  change propagation (OpenFeature, LaunchDarkly, Unleash, ConfigCat, GrowthBook,
  Flagsmith, .NET, Spring Cloud, Kubernetes, etcd, Consul, Kotlin StateFlow).
- [topic-b-reactive.md](topic-b-reactive.md) - reactive primitives and interop
  (TC39 Signals, Observable, Svelte, RxJS, useSyncExternalStore, Zustand, Jotai,
  Valtio, MobX, Preact, Angular, Effect).
- [topic-c-api-consistency.md](topic-c-api-consistency.md) - public API, consistency
  with `@get-modular/resources`, 0.x evolution, GM publication requirements.

All confirmed defects were fixed in `../code-sketch/hooks-sketch-v4/` and recorded
as R4-1..R4-13 in the research document; R4-14 records removals, not defects.
Defects found later are in `../../../sketch-v4-known-defects.md`.
