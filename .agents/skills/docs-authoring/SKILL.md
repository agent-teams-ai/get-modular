---
name: docs-authoring
description: Use when creating, changing, reorganizing, or reviewing governed documentation in this repository.
---

# Documentation Authoring

Protocol: `agent-teams.docs-protocol/v1`.

## Required workflow

Read the current types, owners, placement, metadata, and index policy with `pnpm docs:info`.
Reuse or relate existing authority instead of creating a competing source.

1. Search first with `pnpm exec docs-protocol find --consumer . --profile architecture/foundation/docs-protocol.yaml --text QUERY`.
2. Preview with `pnpm exec docs-protocol new --consumer . --profile architecture/foundation/docs-protocol.yaml --type TYPE --id ID --title "TITLE" --owner OWNER --summary "SUMMARY" --dry-run`. Review the exact destination, metadata, relations, anchors, and diagnostics.
3. Apply with `pnpm exec docs-protocol new --consumer . --profile architecture/foundation/docs-protocol.yaml --type TYPE --id ID --title "TITLE" --owner OWNER --summary "SUMMARY" --apply --expect sha256:PLAN_DIGEST_FROM_DRY_RUN`. Use the exact digest returned by the reviewed preview.
4. When reachability is `manual-required`, add the exact returned `markdownLink` to its exact `indexPath` before verification.
5. Refresh bounded context with `pnpm exec docs-protocol context --consumer . --profile architecture/foundation/docs-protocol.yaml`.
6. Check with `pnpm exec docs-protocol check --consumer . --profile architecture/foundation/docs-protocol.yaml`, then finish with the full consumer gate `pnpm docs:protocol:check`.

## Rules

- Never invent owners, types, statuses, paths, or metadata outside `docs:info`.
- If dependencies are absent, use only `pnpm install --frozen-lockfile`; never use npx, dlx, or latest tags.
- Use only the installed repository CLI with the explicit consumer profile above; retain the full repository gate.
- Keep preview and apply inputs identical.
- For edits, preserve canonical frontmatter and sidecar ownership; use the repository's governed review flow rather than bypassing the create-only writer.
- For accepted authority, record supersession explicitly instead of silently rewriting history.
- Stop when recovery is required; use `pnpm docs:doctor` before `pnpm docs:recover`.
- Resolve required anchors and blockers before apply.
- Do not hand-edit transaction evidence.
