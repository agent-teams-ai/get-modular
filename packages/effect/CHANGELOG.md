# @get-modular/effect

## 0.1.1

### Patch Changes

- 56b98f8: Document the published package and its qualified Effect peer in the npm README.

## 0.1.0

### Minor Changes

- f311b13: Add optional native Effect construction over Get Modular's verified compositions.
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

### Patch Changes

- Updated dependencies [e6e9746]
- Updated dependencies [28500bb]
- Updated dependencies [f311b13]
- Updated dependencies [558d3fc]
  - @get-modular/core@0.8.0
  - @get-modular/assembly@0.8.0

## Unreleased

- Add native Effect factories and Layer construction over Assembly's authenticated
  neutral preparation, retaining typed construction errors and requirements.
- Preserve exact local bindings, diamond sharing and native resource ownership.
- Add borrowed input capture, typed live/fake recipes and one packaged practices
  guide, qualified against Effect 4.1.4.

This is a source candidate. The coordinated release intent is Effect 0.1.0 with
Core and Assembly 0.8.0; no registry publication is claimed by this changelog.
