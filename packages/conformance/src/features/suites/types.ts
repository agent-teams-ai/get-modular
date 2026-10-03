import type { AnyContract, CapabilitiesOf } from "@get-modular/assembly";
import type { ModuleDeclaration } from "@get-modular/core";
import type { ModuleContext } from "@get-modular/resources";

/** Any `(name, body)` registrar: node:test `test`, Vitest `it`, or `(name, body) => t.test(name, body)`; an unbound `t.test` crashes. */
export type TestFn = (name: string, body: () => Promise<void>) => unknown;

export type ContractValue<T extends AnyContract> = CapabilitiesOf<T>[T["id"]]["value"];
/** `{ signal, resources }` of a fresh scope per case. */
export type CaseContext = ModuleContext;
export type ContractCase<V> = (subject: V, context: CaseContext) => void | Promise<void>;
export type ContractSuite<T extends AnyContract> = {
  readonly contract: T;
  readonly cases: Readonly<Record<string, ContractCase<ContractValue<T>>>>;
};
export type ContractSubject<T extends AnyContract> = {
  readonly name: string;
  /** The implementation's declaration: a module or a fake declaration. */
  readonly declaration: ModuleDeclaration;
  /** May open resources (a module through `isolate(..., { within })`). */
  readonly create: (context: CaseContext) => ContractValue<T> | Promise<ContractValue<T>>;
};
