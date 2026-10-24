import { declareModule, defineContract, implement } from "@get-modular/assembly";
import type { CapabilitiesOf, CapabilityContract } from "@get-modular/assembly";

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;

interface ChildPort { readonly read: () => number }
interface TeamPort { readonly run: () => string }
const Seed = defineContract<number>()({ id: "aggregate/seed", revision: 2 });
const Child = defineContract<ChildPort>()({ id: "aggregate/private-child", revision: 1 });
const Team = defineContract<TeamPort>()({ id: "aggregate/team", revision: 3 });

// A private child advertises its complete dependency closure to its parent.
type ChildContracts = typeof Seed | typeof Child;
interface ChildCapabilities extends CapabilitiesOf<typeof Seed>, CapabilitiesOf<typeof Child> {}
export type TeamContracts = ChildContracts | typeof Team;
export interface TeamCapabilities extends CapabilitiesOf<ChildContracts>, CapabilitiesOf<typeof Team> {}
// Another branch can share identical ancestors without ambiguity.
type SiblingContracts = typeof Seed | typeof Team;
interface HostCapabilities extends CapabilitiesOf<TeamContracts>, CapabilitiesOf<SiblingContracts> {}

type AllKeys = Assert<Equal<keyof TeamCapabilities, "aggregate/seed" | "aggregate/private-child" | "aggregate/team">>;
type ChildParity = Assert<Equal<ChildCapabilities, CapabilitiesOf<ChildContracts>>>;
type TeamParity = Assert<Equal<TeamCapabilities, CapabilitiesOf<TeamContracts>>>;
type HostParity = Assert<Equal<HostCapabilities, TeamCapabilities>>;
type SeedToken = Assert<Equal<TeamCapabilities["aggregate/seed"], CapabilityContract<number, "aggregate/seed/r2">>>;
type ChildValue = Assert<Equal<TeamCapabilities["aggregate/private-child"]["value"], ChildPort>>;

declare const team: TeamCapabilities;
declare const seed: TeamCapabilities["aggregate/seed"];
// @ts-expect-error Aggregation retains the readonly capability property.
team["aggregate/seed"] = seed;
// @ts-expect-error Aggregation retains readonly value metadata.
seed.value = 5;
// @ts-expect-error Aggregation retains readonly compatibility metadata.
seed.compatibility.token = "aggregate/seed/r2";
// @ts-expect-error The descriptor value type is retained.
const wrongValue: TeamCapabilities["aggregate/seed"]["value"] = "seed";
// @ts-expect-error The exact revision token is retained.
const wrongToken: TeamCapabilities["aggregate/seed"]["compatibility"]["token"] = "aggregate/seed/r1";

// A team may implement its own entry standalone without using its child's seed.
// That unused transitive entry must still be checked when team maps meet.
const entry = implement<TeamCapabilities>()(declareModule({
  moduleId: "aggregate/team", implementationId: "aggregate/team/default",
  owner: { authority: "aggregate", path: ["team"] }, provides: [Team.provide()], slots: [],
}), async () => ({ instance: 1, capabilities: { "aggregate/team": { run: () => "ready" } } }));
void entry;
const WrongSeed = defineContract<string>()({ id: "aggregate/seed", revision: 2 });
const OldSeed = defineContract<number>()({ id: "aggregate/seed", revision: 1 });
// @ts-expect-error An unused transitive value collision fails before binding factories.
interface WrongTeam extends CapabilitiesOf<TeamContracts>, CapabilitiesOf<typeof WrongSeed> {}
// @ts-expect-error An unused transitive revision collision fails too.
interface StaleTeam extends CapabilitiesOf<TeamContracts>, CapabilitiesOf<typeof OldSeed> {}
// @ts-expect-error A private child's conflicting descriptor cannot be hidden by a parent map.
interface WrongPrivateChild extends CapabilitiesOf<ChildContracts>, CapabilitiesOf<typeof WrongSeed> {}

// Port-local polymorphic this remains on the value, not the capability map.
interface Port { readonly self: () => this }
interface SpecializedPort extends Port { readonly label: "specialized" }
const Self = defineContract<SpecializedPort>()({ id: "aggregate/self", revision: 1 });
interface SelfCapabilities extends CapabilitiesOf<TeamContracts>, CapabilitiesOf<typeof Self> {}
declare const port: SelfCapabilities["aggregate/self"]["value"];
const label: "specialized" = port.self().label;
type SelfValue = Assert<Equal<ReturnType<typeof port.self>, SpecializedPort>>;
void label;

// Keep the compile-only assertions visible to noUnusedLocals configurations.
export type DescriptorAggregateAssertions = AllKeys | ChildParity | TeamParity | HostParity | SeedToken | ChildValue | SelfValue;
void wrongValue; void wrongToken;
