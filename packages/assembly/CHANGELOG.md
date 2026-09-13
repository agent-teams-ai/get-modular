# Changelog

## 0.2.0

### Minor Changes

- f4e6137: Establish a new versioned API evidence point for Core and Assembly while retaining
  the historical 0.1.0 baseline erratum. Preserve Assembly's intentional public
  IsUnion and ValidDeclaration type aliases and their existing inference behavior.
  The historical baseline did not describe all released 0.1.0 declarations; the
  new baseline describes only the new release and does not rewrite that history.

### Patch Changes

- Updated dependencies [f4e6137]
  - @get-modular/core@0.2.0

## Unreleased

- Match root handles by their selected module identity when module and
  implementation IDs differ.
- Add an executable consumer example and Host integration guidance.

## 0.1.0

- Prepare first public pre-1.0 publication with exactly Core 0.1.0.

- Add authenticated factory handles and synchronous declaration snapshots.
- Add bounded preparation and complete verification through public Core.
- Add typed sequential construction, cancellation and explicit ownership handoff.
