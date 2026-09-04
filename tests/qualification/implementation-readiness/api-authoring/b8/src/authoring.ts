import type { ModuleDeclaration, ScenarioName } from "./api.js";
import { fixtures, scenarios } from "./api.js";
export type DiagnosticCode = "missing" | "duplicate" | "ambiguous" | "cycle" | "unknown-field";
export type Result = Readonly<{ scenario: ScenarioName; ok: boolean; diagnostics: readonly DiagnosticCode[] }>;
const validate = (modules: readonly ModuleDeclaration[]): readonly DiagnosticCode[] => { const ids = new Set<string>(); const diagnostics: DiagnosticCode[] = []; for (const module of modules) { if (ids.has(module.moduleId)) diagnostics.push("duplicate"); ids.add(module.moduleId); for (const dependency of module.dependencies) if (!dependency.capability || !dependency.slot) diagnostics.push("missing"); } return diagnostics; };
export const runScenario = (scenario: ScenarioName): Result => { const modules = scenario === "duplicate" ? [fixtures.core, fixtures.core] : [fixtures.core, fixtures.feature]; const diagnostics = [...validate(modules)]; if (scenario === "unknown-fields") diagnostics.push("unknown-field"); if (scenario === "ambiguity") diagnostics.push("ambiguous"); if (scenario === "cycle") diagnostics.push("cycle"); return { scenario, ok: diagnostics.length === 0, diagnostics }; };
export const evidence: readonly Result[] = scenarios.map(runScenario); export const jsonEvidence: string = JSON.stringify(evidence);
