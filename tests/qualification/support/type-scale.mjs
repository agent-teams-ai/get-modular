// One deterministic consumer body shared by private and packed type checks.
// The caller imports defineModule and ModuleDeclaration from its actual subject.
export const authoringScale = Array.from({ length: 1000 }, (_, index) => `
const declaration${index} = defineModule({ kind: 'get-modular.module-declaration', schemaVersion: 1,
  moduleId: 'example/module-${index}', implementationId: 'example/module-${index}/default',
  owner: { authority: 'example', path: ['modules'] }, provides: [], slots: [],
});
const identity${index}: 'example/module-${index}' = declaration${index}.moduleId;
`).join("\n") + `\nconst all: readonly ModuleDeclaration[] = [${Array.from({ length: 1000 }, (_, index) => `declaration${index}`).join(",")}];`;
