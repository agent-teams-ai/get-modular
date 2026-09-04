export type Cardinality = { kind: "required" } | { kind: "optional" } | { kind: "many"; min: number; max: number };
export type Slot<T, C extends Cardinality = Cardinality> = { readonly type: T; readonly cardinality: C };
export const required = <T>(type: T): Slot<T, {kind:"required"}> => ({type, cardinality:{kind:"required"}});
export const optional = <T>(type: T): Slot<T, {kind:"optional"}> => ({type, cardinality:{kind:"optional"}});
export const many = <T>(type: T, min: number, max: number): Slot<T, {kind:"many";min:number;max:number}> => ({type, cardinality:{kind:"many",min,max}});
export type ModuleSpec = { readonly id: string; readonly provides: readonly string[]; readonly dependencies: Record<string, Slot<unknown>> };
export const defineModule = <const I extends string, const P extends readonly string[], const D extends Record<string, Slot<unknown>>>(spec: {id:I; provides:P; dependencies:D}) => spec;
export const toDeclaration = (m: ModuleSpec) => JSON.stringify({id:m.id, provides:[...m.provides].sort(), dependencies:Object.fromEntries(Object.entries(m.dependencies).sort(([a],[b])=>a.localeCompare(b)))});
