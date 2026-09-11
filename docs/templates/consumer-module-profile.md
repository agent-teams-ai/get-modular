# Consumer module profile template

Copy this outline into the consumer repository and adapt it to that repository's
accepted decision and existing architecture checks. It is an authoring aid, not
a shared schema or proof of adoption.

```yaml
schemaVersion: 1
status: pending
owner: replace-with-consumer-owner

standard:
  repository: agent-teams-ai/get-modular
  path: docs/architecture/common-assembly.md
  anchor: consumer-module-standard
  commit: replace-with-reviewed-commit
  sha256: replace-with-complete-document-sha256
  acceptedBy: replace-with-local-adr-id

packages:
  core: 0.1.0
  assembly: 0.1.0

scope:
  roots:
    - replace-with-production-root
  compositionOwner: replace-with-owner
  entrypoint: replace-with-materialized-entrypoint
  declarations: replace-with-path
  compositionProfile: replace-with-path
  factories: replace-with-path

boundaries:
  adopted: []
  notAdopted: []
  exceptions: []

verification:
  fast: replace-with-real-fast-command
  full: replace-with-real-full-command
  tests:
    - replace-with-positive-and-rejecting-test
```

Before changing `status` to `active`, inventory existing boundaries, describe
every `notAdopted` entry with its owner and review trigger, and add rejecting
tests for pin drift, unknown boundaries, forbidden layer imports, incomplete
factory mappings, and invalid exceptions. Do not use wildcard exceptions or a
no-op verification command.
