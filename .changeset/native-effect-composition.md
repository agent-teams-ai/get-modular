---
"@get-modular/core": minor
"@get-modular/assembly": minor
"@get-modular/effect": minor
---

Add optional native Effect construction over Get Modular's verified compositions.
Assembly exposes a neutral preparation boundary shared by its existing Promise
executor and the new Effect package. Ordinary Promise authoring, inference and
execution keep their existing contracts and do not acquire an Effect dependency.
Core receives the coordinated minor version required by the existing exact
Core/Assembly release pair; this is a release metadata change, with no Core API
or runtime change.

The initial Effect package provides native factories, precise local bindings,
typed construction errors and requirements, declared borrowed inputs and native
Layer ownership. Its usage guide ships in the package. Effect owns native resource
execution; the application continues to own admission and the lifetime of work.

Effect is initially qualified against the exact catalog version 4.1.4. Consumers
adopting native construction must install the matching newly released Core,
Assembly and Effect packages together; published Assembly 0.7.1 has no neutral bridge.
Existing Promise consumers require no source migration. Resource ownership changes
for intentional native adoption follow the package's integration guide.
