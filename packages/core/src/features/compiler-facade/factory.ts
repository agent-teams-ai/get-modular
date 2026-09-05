import type { CompilerFacadeDeps, CompilerFacadePort, ObjectCompilationInput } from "./ports.js";

export function createCompilerFacade({ admission, semantics, output }: CompilerFacadeDeps): CompilerFacadePort {
  return Object.freeze({
    async compileComposition(input: ObjectCompilationInput): ReturnType<CompilerFacadePort["compileComposition"]> {
      const collector = semantics.newCollector();
      // Admission owns caller data synchronously, before the first suspension.
      const admitted = admission.admitObjectInput(input, collector);
      const analyzed = semantics.analyze(admitted, collector);
      if (!analyzed.ok) return analyzed;
      const emitted = await output.emit(analyzed.plan);
      // Primitive failures reject the Promise; no synthetic diagnostic/digest.
      return Object.freeze({ ok: true, plan: emitted.plan, digest: emitted.digest });
    },
  });
}
