export type Kind = "required" | "optional" | "many";
export type Dependency = Readonly<{ kind: Kind; target: string; min?: number; max?: number }>;
export type Module = Readonly<{ id: string; provides?: readonly string[]; needs?: readonly Dependency[]; disabled?: boolean }>;
export type Diagnostic = Readonly<{ code: string; path: string }>;
export const required = (target: string): Dependency => ({ kind: "required", target });
export const optional = (target: string): Dependency => ({ kind: "optional", target });
export const many = (target: string, min: number, max: number): Dependency => ({ kind: "many", target, min, max });
export const defineModule = (id: string, spec: Omit<Module, "id"> = {}): Module => ({ id, ...spec });
export function diagnose(input: Readonly<{ modules: readonly Module[]; roots?: readonly string[]; unknown?: readonly string[] }>): readonly Diagnostic[] {
 const out: Diagnostic[]=[]; const ids=new Set<string>(); const providers=new Map<string,string[]>();
 for (const m of input.modules){if(ids.has(m.id))out.push({code:"duplicate",path:m.id});ids.add(m.id);for(const c of m.provides??[])providers.set(c,[...(providers.get(c)??[]),m.id]);if(m.disabled)out.push({code:"disabled",path:m.id});}
 for(const m of input.modules)for(const [i,d] of (m.needs??[]).entries()){const matches=providers.get(d.target)??[];if(d.kind==="required"&&matches.length===0)out.push({code:"missing",path:`${m.id}.needs[${i}]`});if(matches.length>1&&d.kind!=="many")out.push({code:"ambiguity",path:`${m.id}.needs[${i}]`});if(d.kind==="many"&&(matches.length<(d.min??0)||matches.length>(d.max??0)))out.push({code:"many-bounds",path:`${m.id}.needs[${i}]`});}
 for(const key of input.unknown??[])out.push({code:"unknown",path:key}); return out.sort((a,b)=>a.code.localeCompare(b.code)||a.path.localeCompare(b.path));
}
