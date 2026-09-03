export const required = (capability) => ({ capability, cardinality: { kind: 'required' } });
export const optional = (capability) => ({ capability, cardinality: { kind: 'optional' } });
export const many = (capability, min, max) => ({ capability, cardinality: { kind: 'many', min, max } });
export function defineModule(input) { return Object.freeze({ id: input.id, provides: Object.freeze([...input.provides]), requires: Object.freeze(input.requires.map((d) => Object.freeze({ capability: d.capability, cardinality: d.cardinality }))), ...(input.disabled === true ? { disabled: true } : {}) }); }
export function compile(modules) { const diagnostics = []; const active = modules.filter((m) => !m.disabled).toSorted((a, b) => a.id.localeCompare(b.id)); const byCapability = new Map(); for (const module of active)
    for (const capability of module.provides) {
        const providers = byCapability.get(capability) ?? [];
        providers.push(module.id);
        byCapability.set(capability, providers);
    } for (const module of active)
    for (const dependency of module.requires) {
        const providers = (byCapability.get(dependency.capability) ?? []).toSorted();
        const c = dependency.cardinality;
        if (!providers.length && c.kind === 'required')
            diagnostics.push({ code: 'dependency.missing', module: module.id, capability: dependency.capability, path: [module.id, dependency.capability] });
        if (providers.length > 1 && c.kind !== 'many')
            diagnostics.push({ code: 'dependency.ambiguous', module: module.id, capability: dependency.capability, path: [module.id, dependency.capability] });
        if (c.kind === 'many' && (providers.length < c.min || providers.length > c.max))
            diagnostics.push({ code: 'dependency.cardinality', module: module.id, capability: dependency.capability, path: [module.id, dependency.capability] });
    } for (const module of modules.filter((m) => m.disabled).toSorted((a, b) => a.id.localeCompare(b.id)))
    diagnostics.push({ code: 'module.disabled', module: module.id, path: [module.id] }); diagnostics.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); return Object.freeze({ diagnostics: Object.freeze(diagnostics), plan: diagnostics.length ? undefined : Object.freeze({ modules: active.map((m) => m.id), providers: [...byCapability].toSorted(([a], [b]) => a.localeCompare(b)) }) }); }
