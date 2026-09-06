import type { AdmissionPort, CompilerFacadeDeps, CompilerFacadePort, ObjectCompilationInput } from "./ports.js";

export function createCompilerFacade({ admission, semantics, output }: CompilerFacadeDeps): CompilerFacadePort {
  async function compile(
    admit: (collector: Parameters<AdmissionPort["admitObjectInput"]>[1]) => ReturnType<AdmissionPort["admitObjectInput"]>,
  ): ReturnType<CompilerFacadePort["compileComposition"]> {
    const collector = semantics.newCollector();
    // Admission owns caller data synchronously, before the first suspension.
    const admitted = admit(collector);
    const analyzed = semantics.analyze(admitted, collector);
    if (!analyzed.ok) return analyzed;
    const emitted = await output.emit(analyzed.plan);
    // Primitive failures reject the Promise; no synthetic diagnostic/digest.
    return Object.freeze({ ok: true, plan: emitted.plan, digest: emitted.digest });
  }

  return Object.freeze({
    async compileComposition(input: ObjectCompilationInput): ReturnType<CompilerFacadePort["compileComposition"]> {
      return compile(collector => admission.admitObjectInput(input, collector));
    },
    async compileCompositionJson(input: unknown): ReturnType<CompilerFacadePort["compileCompositionJson"]> {
      return compile(collector => admission.admitRawInput(input, collector));
    },
  });
}
