
export type Cardinality = { kind: 'required'; capability: string } | { kind: 'optional'; capability: string } | { kind: 'many'; capability: string; min: number; max: number; orderBy: string };
export interface ModuleDeclaration<Id extends string, Provides extends string = never> { readonly moduleId: Id; readonly provides: readonly Provides[]; readonly dependencies: readonly Cardinality[]; readonly metadata?: Readonly<Record<string, string | number | boolean | null>>; }
export function defineModule<const Id extends string, const Provides extends string>(declaration: ModuleDeclaration<Id, Provides>): ModuleDeclaration<Id, Provides> { return declaration; }
