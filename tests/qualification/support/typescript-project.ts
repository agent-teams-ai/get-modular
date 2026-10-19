import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { version } from 'typescript';
import { API, type CompilerOptions, type Project } from 'typescript/unstable/async';
import { createVirtualFileSystem } from 'typescript/unstable/fs';

// One TS7 native project over explicit inert inputs. Unknown paths return null,
// never undefined (the API's real-filesystem fallback). No candidate is emitted.
export async function withTypeScriptProject<Result>(files: ReadonlyMap<string, string>, compilerOptions: CompilerOptions, inspect: (project: Project) => Result | Promise<Result>): Promise<Result> {
  assert.equal(version, '7.0.2', 'qualification parser/checker is exactly pinned');
  const directory = resolve(tmpdir(), '__gm_typescript_project').replaceAll('\\', '/');
  const config = `${directory}/tsconfig.json`;
  const contents = Object.fromEntries(files);
  assert(!Object.hasOwn(contents, config));
  contents[config] = JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler',
      types: [], noLib: true, noEmit: true, skipLibCheck: false, ...compilerOptions },
    files: [...files.keys()],
  });
  const fs = createVirtualFileSystem(contents);
  const readFile = fs.readFile!;
  const entries = fs.getAccessibleEntries!;
  fs.readFile = name => readFile(name) ?? null;
  fs.getAccessibleEntries = name => entries(name) ?? { files: [], directories: [] };
  typeScriptPackageRoots(); // Verify the native peer before the API resolves its platform executable.
  const api = new API({ cwd: process.cwd(), fs });
  try {
    const snapshot = await api.updateSnapshot({ openProjects: [config] });
    try {
      const project = snapshot.getProject(config);
      assert(project, 'the explicit compiler project must exist');
      return await inspect(project);
    } finally { await snapshot.dispose(); }
  } finally { await api.close(); }
}

export async function parseTypeScript(name: string, text: string) {
  const path = resolve(tmpdir(), '__gm_typescript_syntax', name.replace(/^[/\\]+/u, '')).replaceAll('\\', '/');
  return withTypeScriptProject(new Map([[path, text]]), { allowJs: true, noResolve: true }, async project => {
    const source = await project.program.getSourceFile(path);
    assert(source, 'the explicit syntax source must exist');
    return { source, diagnostics: await project.program.getSyntacticDiagnostics(path) };
  });
}

export function typeScriptPackageRoots(): readonly [string, string] {
  const require = createRequire(import.meta.url);
  const compiler = require.resolve('typescript/package.json');
  const native = createRequire(compiler).resolve(`@typescript/typescript-${process.platform}-${process.arch}/package.json`);
  const manifest = JSON.parse(readFileSync(native, 'utf8')) as { readonly name?: unknown; readonly version?: unknown };
  assert.equal(manifest.name, `@typescript/typescript-${process.platform}-${process.arch}`);
  assert.equal(manifest.version, version, 'standard libraries belong to the same pinned native compiler');
  return [dirname(compiler), dirname(native)];
}

export function typeScriptLibraryDirectory() {
  return join(typeScriptPackageRoots()[1], 'lib');
}
