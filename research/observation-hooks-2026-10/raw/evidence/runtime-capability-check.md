# Hosted runtime research-network capability check

Root inspected the installed hosted runtime (release
`dd1f6f2b1649645dfad9512d45f75769c06e852c`) on 2026-10-01, read-only.

Findings:

- `NetworkAccessMode` is `disabled | restricted | unrestricted`.
- `networkAccess: "unrestricted"` is refused with
  `networkAccess_unrestricted_requires_danger_full_access`; disabling the provider
  sandbox is not allowed by workspace AGENTS, so it was not used.
- The app-server thread config and the workspace-tools profile set
  `web_search: "disabled"`. The thread config spreads `input.toolConfig` after it,
  but the `codex_goal_project_refill_worker` schema exposes no `toolConfig` field
  (its only network-related fields are `networkAccess` and `providerSandboxMode`),
  so operators cannot enable search through the supported job API.
- Conclusion: no admitted research network/tool profile is available; critics
  used `networkAccess: "restricted"` and root-supplied packets.

The runtime repository is private, so the verbatim source excerpts and file
hashes that backed these findings stay in the private original of this note.
