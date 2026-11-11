# Get Modular + Effect: proposed integration

**Availability: documentation only.** `@get-modular/effect` is a proposed optional
package. This directory has no package manifest, exports or runtime implementation;
it is not installable and does not change the existing Core/Assembly contract.

## Read before implementing or using the integration

Start with [Effect integration practices](docs/practices.md): one maintained
guide to mistakes, ownership, cancellation, streams, testing and OpenCode lessons.
Repository `AGENTS.md` and `.github/copilot-instructions.md` link to the same guide.
Its native Effect rules apply to explicitly chosen native code today; proposed GM
API examples remain design sketches until their public implementation is qualified.

The [integration plan](https://github.com/agent-teams-ai/get-modular/blob/docs/architecture-guarantees-plan-20261106/research/effect-integration-2026-11/README.md) owns
delivery scope, migration and estimates. [ADR-0043](https://github.com/agent-teams-ai/get-modular/blob/docs/architecture-guarantees-plan-20261106/docs/decisions/0043-plan-optional-native-effect-composition.md)
records the proposed decision. [Spike evidence](https://github.com/agent-teams-ai/get-modular/blob/5131d8789d88816ad458f1bd381727365b962a88/research/effect-integration-2026-11/spikes.md)
separates existing execution results from pending consumer qualification.

## Intended boundary

GM selects modules and exact local bindings. The optional adapter lowers the
verified graph to native Effect Layers. Effect owns native execution/resources;
the application owns the lifetime of using those resources. Ordinary GM remains
independent of Effect.

The first package includes usage recipes for typed live/fake variants, shared
application resources with local sessions, and explicit startup sequencing.
Automatic graph projection, a lifetime-tag language, cache management and a new
Host runtime are not implied by these recipes.

## Documentation delivery

When the package is admitted, include this README and `docs/practices.md` in its
published files. Verify that the relative guide link works in the existing packed
consumer qualification. Source-repository research links are supporting material;
the installed guide must work without a checkout. Keep one source document and
update the agent routes when it moves; do not create a copy/generation pipeline.
