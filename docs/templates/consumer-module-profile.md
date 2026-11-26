# Consumer module profile template

Copy this outline into the consumer repository and adapt it to that repository's
accepted decision and existing architecture checks. It is an authoring aid, not
a shared schema or proof of adoption.

The illustrative package cohort below follows the maintained
[consumer quickstart](../guides/consumer-quickstart.md#discover-then-pin-a-compatible-cohort).
Discover and review exact compatible artifacts and peers before copying it;
an existing consumer keeps its accepted pins until its own reviewed migration.
Keep the standard commit/hash and accepting-decision placeholders pending until
that consumer records its actual reviewed adoption.

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
  core: 0.8.0
  assembly: 0.8.0
  resources: 0.2.2 # when the selected profile owns resources
  observation: 0.2.1 # when following replaceable latest state
  conformance: 0.5.2 # development-only module and composition checks

identity:
  namespaces: [] # namespaces this consumer owns; see "Identity and namespaces" in the standard

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

For a native Effect profile, follow the
[Effect package contract](../../packages/effect/README.md) and
[integration practices](../../packages/effect/docs/practices.md) for the actual
adapter and Effect peer cohort, native construction and lifetime evidence.
The ordinary package rows above do not qualify that profile or make Effect a
dependency of every consumer. Do not list the private lifecycle candidate as a
released package; its separate source/adoption route remains with its owner.
