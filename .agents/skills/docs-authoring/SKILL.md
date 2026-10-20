---
name: docs-authoring
description: Use when creating, changing, reorganizing, or reviewing governed documentation in this repository.
---

# Documentation Authoring

Protocol: `agent-teams.docs-protocol/v1`.

## Required workflow

Read the current types, owners, placement, metadata, and index policy with `node architecture/tooling/runtime/command.ts tool agent-teams-docs info --consumer . --profile architecture/foundation/docs-protocol.yaml`.
Reuse or relate existing authority instead of creating a competing source.

1. Search first with `node architecture/tooling/runtime/command.ts tool agent-teams-docs find --consumer . --profile architecture/foundation/docs-protocol.yaml --text QUERY`.
2. Preview with `node architecture/tooling/runtime/command.ts tool agent-teams-docs new --consumer . --profile architecture/foundation/docs-protocol.yaml --type TYPE --id ID --title "TITLE" --owner OWNER --summary "SUMMARY" --dry-run`. Review the exact destination, metadata, relations, anchors, and diagnostics.
3. Apply with `node architecture/tooling/runtime/command.ts tool agent-teams-docs new --consumer . --profile architecture/foundation/docs-protocol.yaml --type TYPE --id ID --title "TITLE" --owner OWNER --summary "SUMMARY" --apply --expect sha256:PLAN_DIGEST_FROM_DRY_RUN`. Use the exact digest returned by the reviewed preview.
4. When reachability is `manual-required`, add the exact returned `markdownLink` to its exact `indexPath` before verification.
5. Refresh bounded context with `node architecture/tooling/runtime/command.ts tool agent-teams-docs context --consumer . --profile architecture/foundation/docs-protocol.yaml`.
6. Check with `node architecture/tooling/runtime/command.ts tool agent-teams-docs check --consumer . --profile architecture/foundation/docs-protocol.yaml`, then finish with the full consumer gate `node architecture/tooling/runtime/command.ts run docs:protocol:check`.

## Rules

- Never invent owners, types, statuses, paths, or metadata outside `docs:info`.
- If dependencies are absent, use `node architecture/tooling/runtime/dev.ts install` for the selected runtime profile's frozen installation; never use npx, dlx, or latest tags. Follow the [runtime profiles](../../../docs/architecture/feature-module-standard.md#repository-runtime-profiles) for the isolated Node/pnpm rollback; keep its installation separate from the Bun checkout.
- Use only the installed repository CLI with the explicit consumer profile above; retain the full repository gate.
- Keep preview and apply inputs identical.
- For edits, preserve canonical frontmatter and sidecar ownership; use the repository's governed review flow rather than bypassing the create-only writer.
- For accepted authority, record supersession explicitly instead of silently rewriting history.
- Stop when recovery is required; use `node architecture/tooling/runtime/command.ts tool agent-teams-docs doctor --consumer . --profile architecture/foundation/docs-protocol.yaml` before `node architecture/tooling/runtime/command.ts tool agent-teams-docs recover --consumer . --profile architecture/foundation/docs-protocol.yaml`.
- Resolve required anchors and blockers before apply.
- Do not hand-edit transaction evidence.
