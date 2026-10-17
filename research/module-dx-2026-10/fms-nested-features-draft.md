# Draft: Feature Module Standard v1.1 (sub-features and composition contracts)

Draft of 2026-10-11 for track N1 of the Get Modular 0.5.0 plan (`0.5.0-train.md`, section "Nested features"). It is
not published and is not an authority. Source: owner decision B of 2026-10-11 (features may nest to any depth, a
sub-feature is private to its parent, features connect only through contracts, no cycles; old rules are not dogma).

Revision 2, 2026-10-11, after the second critic pass (findings R2-1 to R2-13, applied in the train plan; the report is
retained outside this repository) and the owner decisions QN1, QN2 and QN4 of the train plan: the composition contract
surface (R2-3) in E2, E3, E7, the new E7b, E9, E10 and E13; the E5 wording (R2-11); cycles count runtime and type-only
references among downward and lateral use edges (QN2); the R2-8 example rows; ADR-0010 item 2 as an explicit owner
decision (R2-11); the publication procedure (QN4, R2-6).

Revision 3, 2026-10-15: the organization took ADR-0009 on 2026-10-12 (`0009-bounded-docs-source-successor.md`), so the
decision record of this draft is ADR-0010 (the next free number on 2026-10-15; N1 rechecks it at its start), and
references to files that are not published are removed. No text of v1.1 changes; the ADR draft changes only its
number.

Base document: `agent-teams-ai/.github` `docs/architecture/feature-module-standard/v1.md`, Git blob
`d0bfff2033faf544fe65268c1dcdfd524d093015`, SHA-256
`851653f96643cf0466b67ab22963661976b00de44840fa3144a48a8c054f95fa`, read at `origin/main` `66d6d3d`; the blob is
unchanged at `f9f4c8a` (2026-10-15).

## Version choice: v1.1, not v2

- ADR-0004 rule 5 of the organization repository: "A published version is byte-immutable. Changed requirements produce
  a new version, while the central registry evolves append-only." The registry checker
  (`tools/feature-module-standard/check.mjs`) admits versions matching `^v[1-9][0-9]*(?:\.[1-9][0-9]*)?$` and paths
  matching `^docs/architecture/feature-module-standard/v[^/]+\.md$`, so `v1.1` and `v2` are both valid. No rule yet
  says what a minor successor means; ADR-0010 below defines it.
- v1.1, because every new requirement applies only to a production module that contains a sub-feature or whose
  profile declares a composition contract, and no v1 requirement changes for any other module. A repository that
  conforms to v1 and declares neither conforms to v1.1 once its profile pins v1.1. A `v2` would announce a break that
  does not exist.
- Adoption stays explicit either way. Agent Runtime (ADR-0013), Get Modular (ADR-0002) and Engineering Foundation
  (ADR-0046) keep their v1 pins until each repository adopts v1.1 through its own profile and decision.
- The independent review of N1 checks the v1.1 claim line by line: if any new MUST binds a module without
  sub-features and without a declared composition contract, the PR publishes `v2` instead and says why.

## Assembling `v1.1.md`

1. Copy the v1 bytes to `docs/architecture/feature-module-standard/v1.1.md`.
2. Apply edits E1 to E13 and E7b below in order. Only the content of the four-backtick blocks is copied; the text
   around them is drafting commentary.
3. Keep plain ASCII and the v1 line width (80 columns).
4. Registry record, appended to `governance/feature-module-standard.json` `versions` in the final commit only (step
   7):

   ```json
   { "version": "v1.1", "status": "published", "published_at": "<publication date>",
     "path": "docs/architecture/feature-module-standard/v1.1.md", "git_blob_sha": "<confirmed>",
     "sha256": "<confirmed>", "profile_contract": "adoption-contract" }
   ```

   The registry checker requires the markers `# Feature Module Standard v1.1`, `Status: Accepted and immutable`,
   `` Standard ID: `agent-teams.feature-module-standard` ``, `` Version: `v1.1` ``, `## Adoption contract` and
   `## Conformance evidence`; E1 keeps all of them. The checker
   validates only registered versions, and it reads every historical version of the registry file through `git log`,
   so once a branch commit holds the record, any later change of `v1.1.md` or `published_at` fails with "Published
   standard v1.1 metadata is immutable." (critic R2-6).
5. Same PR, during review: `docs/decisions/0010-feature-module-standard-v1-1-sub-features.md` (draft at the end of
   this file, `Status: Proposed` until step 7) and its line in `docs/decisions/README.md`; one line for v1.1 in
   `docs/architecture/feature-module-standard/README.md`; the "Feature ownership, layers and dependency mechanisms" row
   of `docs/engineering-quality-standard.md`, which links only v1 today.
6. Gates: `node tools/feature-module-standard/check.mjs`, `node --test tools/feature-module-standard/check.test.mjs`,
   then `pnpm check` with full Git history (org `AGENTS.md`).
7. Publication (QN4, decided by the owner on 2026-10-11). When review and CI are clean, set `Published:` (E1) to the
   planned publication date; the owner then confirms once the Git blob SHA and SHA-256 of `v1.1.md` and the ADR-0010
   text (its status and date lines excepted). After that confirmation one final commit appends the registry record
   with those digests and `published_at` equal to the `Published:` line, and sets ADR-0010 to `Status: Accepted` with
   its date. Verify that the blob of `v1.1.md` at the final head equals the confirmed SHA, run the gates, have the
   critic confirm that the final delta holds only those lines, and merge through `scripts/merge-owner-pr.mjs` with that
   exact head. The confirmed bytes never change; a publication date that has passed by the merge stays as confirmed.

## E1 Header

Replace the lines from the title through `Published: 2026-08-29` with:

````markdown
# Feature Module Standard v1.1

Status: Accepted and immutable

Standard ID: `agent-teams.feature-module-standard`

Version: `v1.1`

Predecessor: `v1`

Owner: Agent Teams organization maintainers

Published: <publication date>
````

The date is set before the owner confirms the bytes (step 7) and never changes afterwards.

## E2 Normative language

Replace the paragraph that begins "Version `v1` is byte-immutable." with:

````markdown
Version `v1.1` is byte-immutable. Corrections or changed requirements are
published as a successor version. Existing adopters continue to reference their
pinned version until they explicitly adopt a successor.

Version `v1.1` is a minor successor of `v1`. It adds sub-features, composition
contracts and the rules they need. Every new requirement applies only to a
production module that contains a sub-feature or whose profile declares a
composition contract; for any other module, every `v1` requirement is
unchanged. A repository that conforms to `v1` and declares neither conforms to
`v1.1` once its profile pins `v1.1`.
````

## E3 Adoption contract

Insert after the bullet "- the repository-specific mapping from the abstract layout in this standard;":

````markdown
- every sub-feature with its parent, every republication edge, and every
  composition contract, where the repository has any;
````

A profile that lists no sub-feature and no composition contract needs no new content, which keeps the v1.1 claim
exact.

## E4 Architecture hierarchy

Replace the hierarchy block with:

````markdown
```text
repository
  -> production module with one architectural role
      -> feature-owned capability slice
          -> optional sub-features, each a feature-owned capability slice
          -> role-appropriate internal layers
              -> operations and behavior
```
````

Insert after the paragraph that ends "Repositories MUST NOT create one module per endpoint or one feature per class.":

````markdown
A sub-feature is a feature inside another feature, its parent. A production
module or package is a unit of reuse and distribution; a feature at any depth
is a unit of meaning and ownership. A sub-feature is not a module, a bounded
context or a package by default.
````

## E5 Abstract repository layout

Replace the layout block with:

````markdown
```text
<production-module>/
  <source-root>/
    features/
      <feature>/
        features/
          <sub-feature>/
    <module-composition>/
    <public-entrypoint>
  <test-root>/
    features/
      <feature>/
        features/
          <sub-feature>/
    module/

<application-root>/
  <composition-root>/
```
````

Insert after the layout block:

````markdown
The nested `features` directories below a feature exist, and a profile maps
them, only when the module contains a sub-feature.
````

v1 says "An adopting profile MUST map its concrete directories to these abstract roles" (v1.md:123). The sentence keeps
the new nested roles out of that MUST for a module without sub-features (critic R2-11).

## E6 Feature layout

In the feature layout block, add after the `composition/` line (indented two spaces):

````markdown
  features/
    <sub-feature>/
````

Insert after the paragraph that ends "without a domain aggregate.":

````markdown
The `features` directory of a feature exists only when the feature has a
sub-feature. Section Sub-features defines it.
````

## E7 New section "Sub-features"

Insert as a new top-level section after "Feature layout" and before "Test ownership":

````markdown
## Sub-features

A feature MAY contain sub-features. A sub-feature keeps a tightly related part
of its parent together with the parent, so the parent and its sub-features move
as one unit, like a subdomain or a sub-assembly. Every rule of this standard
that applies to a feature applies to a sub-feature unless this section says
otherwise. Every requirement in this section applies only to a production
module that contains a sub-feature.

### Terms

- The parent of a sub-feature is the feature that directly contains it. A
  top-level feature has no parent feature; the production module is its scope.
- Ancestors, descendants and subtrees follow the parent relation. The subtree
  of a feature is the feature with all its descendants.
- Depth is 1 for a top-level feature and grows by 1 for each level below it.
- The public entrypoint, the internal API and the composition surface of a
  feature are the curated surfaces this standard already defines: the public
  entrypoint exposes the feature's public contracts, the internal API serves
  other features of the same module, and the composition surface is the
  narrow typed factory or equivalent constructor surface that composition
  wires.
- The composition contract of a feature, where the profile declares one, is a
  curated surface that exposes only the identifiers, descriptors and type
  declarations that composition uses to connect the providers and consumers
  of the feature's capabilities. Section Composition contracts defines it.

### Placement and layout

- A sub-feature root MUST be `<parent root>/features/<name>/`. The `features`
  directory inside a feature root is the sub-feature container. It MUST
  contain only sub-feature directories and MUST exist only when it holds one.
- The feature layout applies unchanged at every depth. Each direct entry of a
  feature root MUST be a role directory of the feature layout, the
  sub-feature container, or a file the profile maps, such as a feature README
  or a curated entrypoint.
- This standard sets no maximum depth. A profile MAY declare a depth at which
  its gate warns.
- A sub-feature MUST be a real capability slice. Repositories MUST NOT create a
  sub-feature merely to isolate a folder, to hold one class, or as scaffolding.

One container name at every level keeps the layout self-similar: a feature
directory moves between levels unchanged, feature names never collide with
role names, and a checker resolves every path below a feature root with one
rule, because the first segment is a role, the container, or a mapped file.

### Identity

- The identity of a top-level feature is its name. The identity of a
  sub-feature is its parent's identity followed by its own name, for example
  `orders/discounts`. Names MUST be unique among the sub-features of one
  parent and among the top-level features of one module.
- Moving a feature changes its identity and its root. Identifiers that a
  repository publishes for other purposes, such as composition, capability or
  module identifiers, are governed by the rules that own them. This standard
  does not require them to change when a feature moves or to match feature
  identities.

### Visibility

- A top-level feature is visible to every feature of its production module. A
  sub-feature is visible only to its parent and to the parent's descendants.
- Code MUST NOT depend on a feature that is not visible to it. Code outside a
  parent's subtree, code in another production module, and module or
  application composition reach a sub-feature only through what an ancestor
  republishes.
- Visibility permits only curated surfaces: the public entrypoint, the
  internal API where this standard allows it, the composition contract from
  composition code, and the composition surface for assembly. Deep imports
  into another feature remain prohibited at every depth.

### Edges

For code of a feature S that depends on a different feature T:

- an upward edge targets an ancestor of S;
- a downward edge targets a sub-feature whose parent is S;
- a lateral edge targets any other feature visible to S.

By purpose, an edge is one of:

- a use edge, which depends on the public entrypoint of T, on the internal
  API of T where this standard allows it, or on the composition contract of T
  from composition code;
- an assembly edge, which wires the composition surface of T;
- a republication edge, which re-exports part of the public entrypoint or of
  the composition contract of T from the same surface of S.

A feature MAY use the public entrypoints of its ancestors, of its direct
sub-features and of every other feature visible to it. Every use edge MUST be
declared in the module's feature dependency graph.

### Assembly

- Only the feature composition of a parent MAY wire the composition surface of
  a sub-feature, and only of its direct sub-features. Module composition and
  application composition MUST wire only top-level features.
- A parent MUST wire, in its feature composition, every direct sub-feature
  that exposes a composition surface. The assembled structure therefore
  mirrors the feature tree.

### Republication

- A parent MAY republish parts of the public entrypoint of a direct
  sub-feature from its own public entrypoint, and parts of the composition
  contract of a direct sub-feature from its own composition contract.
  Republication re-exports without adding behavior, mapping or types. The
  sub-feature remains the semantic owner of what it publishes.
- Every republication edge MUST be declared in the profile. A feature MUST NOT
  republish from a descendant that is not its direct sub-feature; a deeper
  contract reaches outward one level at a time.
- Republication is the only way a contract of a sub-feature becomes visible
  outside the subtree of its parent.

### Dependency graph and cycles

- For cycle detection, the feature dependency graph of a module consists of its
  downward and lateral use edges, whether a dependency is needed at load time
  or only by references that the language removes before execution. That
  graph MUST be acyclic.
- Upward use edges, assembly edges and republication edges are not part of that
  graph. The public contracts of an ancestor are the shared language of its
  subtree, and a parent moves with its sub-features as one unit.
- A load-time dependency cycle between source files of different features MUST
  NOT exist. For this rule, references that the language removes before
  execution, such as type-only imports, do not count.
- A cycle MUST be resolved as section "Aggregate and internal-feature
  ownership" describes, or by moving the shared concept to the ancestor whose
  subtree shares it.

Excluding upward edges admits only cycles that close on an ancestor through an
upward use, such as a parent that uses a sub-feature while the sub-feature uses
the parent's contracts. Every such cycle stays inside the subtree of that
ancestor, because code outside a subtree can reach only the subtree's root
feature. The subtree moves as one unit, and the load-time rule keeps its source
files acyclic.

### Moving and splitting

- A feature moves with its whole subtree as one directory. Moving a feature to
  another parent, promoting a sub-feature, or nesting a feature under a new
  parent stays inside one production module. It is not extraction and needs no
  extraction decision.
- A move MUST update the profile in the same change and MUST leave every rule
  satisfied at the new position. When a move makes a feature invisible to code
  that depends on it, the same change MUST add a republication or move that
  code.
- Code that depends on a moved feature only through public entrypoints or
  republication SHOULD need no change other than its import locations.
- When a feature grows, a part that uses the parent's contracts or shares its
  lifecycle, and that no feature outside the parent uses directly, SHOULD
  become a sub-feature. A part that other features use directly, or that
  changes for its own reasons, SHOULD become a sibling feature.

### Examples

This subsection is informative. Conformance implementations SHOULD include
these cases in their fixtures.

```text
features/
  orders/
    features/
      pricing/
      discounts/
        features/
          coupons/
  billing/
    features/
      coupons/
```

| Code in | Depends on | Result | Reason |
| --- | --- | --- | --- |
| `orders/discounts` | `orders` public entrypoint | allowed | upward use |
| `orders` | `orders/discounts` public entrypoint | allowed | downward use |
| `orders` and `orders/discounts` | each other, by the two edges above | allowed | the upward edge is outside the cycle graph |
| `orders` | `orders/discounts/coupons` public entrypoint | rejected | `coupons` is visible only inside `orders/discounts` |
| `orders/pricing` | `orders/discounts` public entrypoint | allowed | lateral use between siblings |
| `orders/pricing` and `orders/discounts` | each other's public entrypoints | rejected | lateral cycle |
| `orders/pricing` | `orders/discounts` domain | rejected | deep import |
| `orders/discounts/coupons` | `billing` public entrypoint | allowed | lateral use of a top-level feature |
| `billing` | `orders/pricing` public entrypoint | rejected | not visible outside `orders` |
| `billing` | `orders` public entrypoint that republishes `pricing` | allowed | declared republication |
| `orders` public entrypoint | `orders/discounts/coupons` public entrypoint, re-exported | rejected | republication skips a level |
| `orders/discounts` public contracts | `orders` public entrypoint that republishes those same contracts, both at load time | rejected | load-time import cycle between features |
| `orders/discounts` public contracts | `orders` public entrypoint that republishes them, type-only | allowed | upward and republication edges are outside the cycle graph, and type-only references do not count for the load-time rule |
| module composition | `orders/discounts` composition surface | rejected | only `orders` assembles `orders/discounts` |
| `orders` feature composition | `orders/discounts/coupons` composition surface | rejected | only `orders/discounts` assembles `coupons` |
| `orders/discounts/coupons` | `orders/pricing` public entrypoint | allowed | lateral use of a sibling of an ancestor |
| `orders/pricing` | `orders/discounts/coupons` public entrypoint | rejected | `coupons` is visible only inside `orders/discounts` |
| `orders/pricing`, `orders/discounts`, `orders` | the public entrypoints of `orders/discounts`, `orders` and `orders/pricing`, in that order | allowed | the only cycle closes through the upward edge from `orders/discounts` to `orders` |
| `orders/discounts`, `billing`, `orders` | the public entrypoints of `billing`, `orders` and `orders/discounts`, in that order | rejected | a cycle of lateral and downward use edges |
| `orders/pricing` and `orders/discounts` | each other's public entrypoints, through type-only references only | rejected | type-only references count in the feature dependency graph |
| `billing/coupons` and `orders/discounts/coupons` | - | allowed | names are unique only among the sub-features of one parent |
| `orders` public entrypoint | `orders/pricing` public entrypoint, re-exported without a declaration | rejected | undeclared republication |
| a test of `orders/discounts` in the test root of `orders`, outside `features/discounts/` | - | rejected | the tests of a sub-feature live in its own test root |
| a source file directly in `orders/features/` | - | rejected | the container holds only sub-feature directories |
| an empty `features/` directory in `orders/pricing` | - | rejected | the container exists only when it holds a sub-feature |
| a direct entry `orders/helpers/` | - | rejected | not a role directory, the container or a mapped file |
| `billing` feature composition | `orders` composition contract | allowed | lateral use from composition |
| `billing` application code | `orders` composition contract | rejected | only composition code may depend on a composition contract |
| `orders/discounts` feature composition | `orders` composition contract | allowed | upward use from composition |
| module composition | `orders/discounts` composition contract | rejected | not visible outside `orders`; only what `orders` republishes |
| `orders` composition contract | `orders/discounts` composition contract, re-exported and declared | allowed | declared republication from a direct sub-feature |
````

## E7b New section "Composition contracts"

Insert as a new top-level section after "Sub-features" and before "Test ownership". It applies to any module whose
profile declares a composition contract, with or without sub-features (critic R2-3: composition needs a surface for
the identifiers and descriptors that connect a provider feature with its consumers; v1 offers only the public
entrypoint, which carries transport contracts, and the internal API, which serves domain and application code).

````markdown
## Composition contracts

A profile MAY declare a composition contract for a feature. Every requirement
in this section applies only where it does.

- A composition contract exposes only identifiers, descriptors and type
  declarations that composition uses to connect the providers and consumers
  of the feature's capabilities. It MUST NOT expose behavior, factories,
  adapters, aggregates or internal types.
- Only composition code MAY depend on a composition contract: the feature
  composition of a feature to which the owning feature is visible, and module
  or application composition for a top-level feature or for what an ancestor
  republishes. Domain, application, contract and adapter code MUST NOT depend
  on any composition contract, including its own feature's.
- A composition contract MAY depend on the public entrypoint of its own
  feature and on the public entrypoints and composition contracts of features
  visible to its feature.
- A dependency of composition code on the composition contract of another
  feature is a use edge. It is declared and counted like every use edge.
````

## E8 Test ownership

Append to the bullet list of "Test ownership":

````markdown
- In a module that contains sub-features, the test root of a sub-feature is
  `<parent feature test root>/features/<sub-feature>/`. A test belongs to the
  deepest feature whose source root or test root contains it, and tests of a
  sub-feature MUST NOT be placed in its parent's test root. Such a test MAY use
  the public entrypoints and testing surfaces of features visible to its
  owning feature and MUST NOT use their internals.
````

## E9 Growth guardrails

Insert after item 8 of the numbered list:

````markdown
When a production module in scope contains a sub-feature, the deterministic
checks MUST also:

9. derive the parent of every feature from its root, and reject a sub-feature
   root that is not `<parent root>/features/<name>`, a file directly inside a
   sub-feature container, and an unmapped direct entry of a feature root;
10. assign every production and test file to the deepest feature that contains
    it;
11. reject a dependency on a feature that is not visible to the dependent code;
12. reject an assembly edge that does not run from the feature composition of a
    parent to a direct sub-feature, and module or application composition that
    wires a sub-feature;
13. reject an undeclared republication and a republication from anything other
    than the public entrypoint of a direct sub-feature;
14. reject a cycle in the feature dependency graph defined in section
    Sub-features, and a load-time import cycle between files of different
    features.

A gate SHOULD report, without failing, a feature deeper than the depth its
profile declares for warnings.

When the profile declares a composition contract, the deterministic checks
MUST also reject a dependency on a composition contract from code that is not
composition, and a dependency on the composition contract of a feature that
is not visible to the dependent code.
````

## E10 Composition

Replace items 1 and 2 of the numbered list in "Composition" with:

````markdown
1. Optional feature composition wires feature-local handlers from exact typed
   dependencies, may use the composition contracts of features visible to its
   feature where the profile declares them, and, in a parent, wires the
   composition surfaces of its direct sub-features.
2. Module composition wires the factories of top-level features, adapters,
   exports, and migration contributions.
````

## E11 Aggregate and internal-feature ownership

Insert after the paragraph that begins "The module MUST maintain an explicit directed dependency graph":

````markdown
In a module that contains sub-features, section Sub-features defines the edges
of that graph, the visibility of every feature, and which edges form cycles.
````

## E12 Promoting a feature to a module

Append to the section:

````markdown
These conditions apply to a sub-feature as to any feature; an extracted
sub-feature takes its subtree with it. Moving a feature inside its module is
not extraction; section Sub-features governs it.
````

## E13 Conformance evidence

Insert after the bullet list of the minimum gate proofs:

````markdown
A repository whose profile declares a sub-feature MUST additionally prove:

- one valid sub-feature with an upward use edge, a downward use edge from its
  parent, and an assembly edge from its parent;
- acceptance of a parent and a sub-feature that depend on each other only
  through that upward edge and that downward edge;
- rejection of a dependency on a sub-feature from outside its parent's subtree;
- rejection of a sub-feature wired outside the feature composition of its
  parent;
- rejection of an undeclared republication and of a republication that skips a
  level;
- rejection of a downward or lateral cycle, including one formed only by
  type-only references;
- rejection of a load-time import cycle between files of different features.

A repository whose profile declares a composition contract MUST additionally
prove:

- acceptance of feature composition that depends on the composition contract
  of a visible feature over a declared edge;
- rejection of domain, application, contract or adapter code that depends on
  a composition contract;
- rejection of a dependency on the composition contract of a feature that is
  not visible.
````

## Draft ADR-0010 (organization repository)

Path `docs/decisions/0010-feature-module-standard-v1-1-sub-features.md`. On `origin/main` `f9f4c8a` (2026-10-15) the
highest record is ADR-0009 (`0009-bounded-docs-source-successor.md`, `Status: Proposed`, added on 2026-10-12), and the
open PRs #175 and #322 add no decision; N1 takes the next free number at its start and updates every reference here.

````markdown
# ADR-0010: Feature Module Standard v1.1 adds sub-features

Status: Proposed

Date: <set in the final commit>

Decision owner: Organization maintainers

## Context

Feature Module Standard v1 places every feature directly in a module's
features root and defines no nested form. When a feature outgrows its split
signals, v1 offers only a sibling feature, which spreads tightly related parts
across the module and exposes each of them to every other feature. On
2026-10-11 the owner decided that features may nest to any depth: a package is
a unit of reuse and distribution, a feature is a unit of meaning and
ownership, and a feature with its sub-features moves as one folder. Composition
also lacks a surface for the identifiers and descriptors that connect a
provider feature with its consumers, so such a dependency is a deep import
under v1. Version v1 is byte-immutable under ADR-0004.

## Decision

1. Publish Feature Module Standard v1.1. It adds sections Sub-features and
   Composition contracts and the matching adoption, layout, test,
   composition, guardrail and evidence rules: sub-features at
   `<parent root>/features/<name>/`, private to their parent, reachable
   outside it only through declared republication, assembled only by their
   parent, and connected only through public entrypoints and, from
   composition, composition contracts, with an acyclic graph of downward and
   lateral use edges.
2. Version policy, decided by the owner as the documented approval
   authority: a minor successor `vN.M` adds requirements that apply only to a
   capability a profile newly admits and leaves every `vN` requirement
   unchanged for a module that does not use it. A repository that conforms to
   `vN` conforms to `vN.M` once its profile pins `vN.M`. Every other change
   publishes `vN+1`. Version v1.1 is the first minor successor.
3. Version v1 stays published. No repository moves to v1.1 implicitly. Each
   adopts it through its own profile, decision and deterministic gate.
4. The informative examples of section Sub-features are the shared cases that
   conformance implementations should include in their fixtures. An
   implementation may be repository-owned or shared tooling; either validates
   the policy a profile declares and never widens it.

## Consequences

- A repository may nest features and declare composition contracts after its
  profile adopts v1.1. Until then a v1 profile and its checker keep their
  current behavior.
- Agent Runtime needs a scoped checker and profile change, under its own
  decision, before its features nest.
- A repository without a profile may follow the v1.1 rules without claiming
  conformance.
- A later change that alters a v1.1 requirement publishes v2; an additive one
  may publish v1.2.
````

Status note (QN4, decided by the owner on 2026-10-11; critic R2-6, R2-11): the PR carries `Status: Proposed` through
review. The owner confirms once the blob SHA and SHA-256 of `v1.1.md` and this text, status and date lines excepted
(org `GOVERNANCE.md:18-20`: "Architecture decisions begin as proposed. They become accepted only after the
repository's documented approval authority confirms them."; :64-65 excludes tools that propose changes or review
evidence from approval authority). Item 2 is a new version policy for an organization standard, so it is the owner's
own decision, not a routine text approval. Only after that confirmation does the final commit set `Status: Accepted`
and the date, together with the registry record (step 7 of "Assembling `v1.1.md`").
