import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import canonicalize from 'canonicalize';
import { version } from 'typescript';
import { compileComposition as direct } from '../../dist-stage0/self-composition/stage0-entry.js';
import { ownDeclarations } from '../../dist-stage0/self-composition/own-profile.js';
import { compilerFacadeModuleId } from '../../dist-stage0/src/features/compiler-facade/declaration.js';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
const tag = index => String(index).padStart(3, '0');
const implementation = index => `growth/stage-${tag(index)}/default`;
const moduleId = (index, count) => index === count - 1
  ? compilerFacadeModuleId : `growth/stage-${tag(index)}`;
const capabilityId = 'growth/document';
const compatibility = { family: 'exact', familyVersion: 1, token: 'growth/document/v1' };
const ascii = (left, right) => left < right ? -1 : left > right ? 1 : 0;

// Development-only document stages: each consumes its predecessor and, after
// stage one, the shared source document. These are synthetic cohesive nodes,
// not proposed production features. Paths below describe renderer inputs only;
// no corresponding source files or complete construction witness are claimed.
function fixture(count) {
  let factoryCalls = 0;
  const declarations = Array.from({ length: count }, (_, index) => ({
    kind: 'get-modular.module-declaration',
    schemaVersion: 1,
    moduleId: moduleId(index, count),
    implementationId: implementation(index),
    owner: structuredClone(ownDeclarations[0].owner),
    provides: [{ capabilityId, compatibility: { ...compatibility } }],
    slots: (index === 0 ? [] : index === 1 ? ['previous'] : ['base', 'previous'])
      .map(slotId => ({
        slotId, capabilityId, compatibility: { ...compatibility },
        cardinality: { kind: 'required' },
      })),
  }));
  const profile = {
    kind: 'get-modular.composition-profile',
    schemaVersion: 1,
    profileId: `growth/profile-${count}`,
    roots: [compilerFacadeModuleId],
    selections: declarations.map(({ moduleId, implementationId }) => ({
      moduleId, implementationId,
    })),
    bindings: declarations.flatMap((declaration, index) => declaration.slots.map(slot => ({
      consumerImplementationId: declaration.implementationId,
      slotId: slot.slotId,
      providerImplementationIds: [implementation(slot.slotId === 'base' ? 0 : index - 1)],
    }))),
  };
  const handles = new Map(declarations.map((declaration, index) => [
    declaration.implementationId, {
      declaration,
      factory() {
        factoryCalls += 1;
        assert.fail('the emitter invoked a synthetic factory');
      },
      importPath: `../../features/growth-stage-${tag(index)}/factory.js`,
      factoryExport: `createStage${tag(index)}`,
      declarationExport: `stage${tag(index)}Declaration`,
      localName: `stage${tag(index)}`,
    },
  ]));
  return { declarations, profile, handles, factoryCalls: () => factoryCalls };
}

// Closed-form oracle, independent of candidate output and fixture bindings.
// The predecessor chain forces precisely this order; extra base edges cannot
// change it. Each node remains reachable from the single facade root.
function expected(count) {
  const bindings = [];
  const imports = [];
  const factories = [];
  for (let index = 0; index < count; index += 1) {
    imports.push(`import { createStage${tag(index)} } from "../../features/growth-stage-${tag(index)}/factory.js";`);
    const dependencies = index === 0 ? '{}' : index === 1
      ? '{ previous: stage000 }'
      : `{ base: stage000, previous: stage${tag(index - 1)} }`;
    factories.push(`const stage${tag(index)} = createStage${tag(index)}(${dependencies});`);
    for (const [slotId, provider] of index === 0 ? [] : index === 1
      ? [['previous', 0]] : [['base', 0], ['previous', index - 1]]) {
      bindings.push({
        consumerImplementationId: implementation(index),
        slotId,
        providerImplementationIds: [implementation(provider)],
        capabilityId,
        compatibility: { ...compatibility },
      });
    }
  }
  const plan = {
    kind: 'get-modular.composition-plan',
    schemaVersion: 1,
    profileId: `growth/profile-${count}`,
    roots: [compilerFacadeModuleId],
    selections: Array.from({ length: count }, (_, index) => ({
      moduleId: moduleId(index, count), implementationId: implementation(index),
    })).sort((left, right) => ascii(left.moduleId, right.moduleId)),
    bindings,
    dependencyOrder: Array.from({ length: count }, (_, index) => implementation(index)),
  };
  const digest = `gm-plan:v1:sha-256:${createHash('sha256').update(canonicalize({ canonicalization: 'RFC8785', hashAlgorithm: 'SHA-256', kind: 'get-modular.plan-content', plan, protocolVersion: 1 })).digest('hex')}`;
  const source = [
    `// generated by the self-composition emitter from plan digest ${digest}`,
    ...imports,
    'import type { CompilerFacadePort } from "../../features/compiler-facade/ports.js";',
    '', ...factories, '',
    `export const root: CompilerFacadePort = stage${tag(count - 1)};`, '',
  ].join('\n');
  return { result: { ok: true, plan, digest }, source };
}

test('ADR8 private emitter growth at 10, 50 and exactly 100 cohesive nodes', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'gm-emitter-growth-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  for (const path of ['src', 'self-composition']) {
    await cp(join(packageRoot, path), join(temporary, path), { recursive: true });
  }
  await writeFile(join(temporary, 'package.json'), '{"type":"module"}\n');
  await writeFile(join(temporary, 'tsconfig.emitter.json'), JSON.stringify({
    extends: join(packageRoot, 'tsconfig.json'),
    compilerOptions: { rootDir: '.', outDir: 'built-emitter', skipLibCheck: false },
    files: ['self-composition/emit.ts'], include: [],
  }));
  assert.equal(version, '7.0.2');
  const built = spawnSync(process.execPath, [tsc, '-p', join(temporary, 'tsconfig.emitter.json')],
    { encoding: 'utf8', timeout: 60_000 });
  assert.ifError(built.error);
  assert.equal(built.signal, null);
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const { emitComposition } = await import(pathToFileURL(join(temporary,
    'built-emitter/self-composition/emit.js')).href);
  for (const count of [10, 50, 100]) {
    await t.test(`${count} nodes preserve full plan, digest and wiring under permutations`, async () => {
      const input = fixture(count);
      const oracle = expected(count);
      assert.equal(input.declarations.length, count);
      assert.equal(oracle.result.plan.bindings.length, 2 * count - 3);
      if (count === 100) assert.equal(input.handles.size, 100);
      const reverse = values => [...values].reverse();
      const rotate = values => [...values.slice(1), values[0]];
      for (const permute of [values => [...values], reverse, rotate]) {
        const result = await direct({
          declarations: permute(input.declarations),
          profile: { ...input.profile, selections: permute(input.profile.selections),
            bindings: permute(input.profile.bindings) },
        });
        assert.deepEqual(result, oracle.result);
        const source = emitComposition(result, new Map(permute([...input.handles])));
        // Exact complete-source equality proves count and wiring, including the
        // absence of hidden calls or duplicate statements; no regexp proxy.
        assert.equal(source, oracle.source);
        assert.equal(source.split('\n').length, 2 * count + 6);
        assert.ok(Buffer.byteLength(source, 'utf8') <= 256 * count + 512);
        assert.equal(input.factoryCalls(), 0);
      }
      // Only declaration/selection/binding record order is permuted. Singleton
      // required providers make no assertion about ordered-many semantics.
    });
  }
});
