import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import canonicalize from 'canonicalize';
import { compileComposition as direct } from '../../dist-stage0/self-composition/stage0-entry.js';
import { ownDeclarations, ownProfile } from '../../dist-stage0/self-composition/own-profile.js';
import { ownDeclarations as variantDeclarations, ownProfile as variantProfile } from '../../dist-seed/self-composition/own-profile.variant.js';
import { verifyConstruction, verifyGeneratedConstruction } from '../../../../tests/qualification/support/construction-witness.mjs';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const buildRoot = join(packageRoot, 'dist-stage0');
const compositionPath = 'src/composition/stage0.ts';
const allowlistPath = 'self-composition/allowlist.ts';
const invalidCode = 'witness.invalid-construction';
const correspondenceCode = 'witness.allowlist-correspondence';
const canon = 'get-modular/canonicalization/owned-jcs';
const semantics = 'get-modular/composition-semantics/default';
const admission = 'get-modular/input-admission/default';
const output = 'get-modular/plan-output/default';
const scanner = 'get-modular/raw-scanner/owned-iterative';
const facade = 'get-modular/compiler-facade/default';
const canonicalFactory = 'src/features/canonicalization/owned-jcs/factory.js';
const compatibleFactory = 'src/features/canonicalization/compatible/factory.js';

// Literal construction expectations for the accepted six-node M2 scanner graph.
// The subject plan supplies the obligation; it never supplies expected tuples.
const expectedTuples = [
  [canon, 0, []],
  [semantics, 1, [['canonicalizer', canon]]],
  [output, 2, [['canonicalizer', canon]]],
  [scanner, 3, []],
  [admission, 4, [['scanner', scanner]]],
  [facade, 5, [['admission', admission], ['output', output], ['semantics', semantics]]],
];
function expectedWitness(tuples = expectedTuples) {
  return { tuples, digest: `sha256:${createHash('sha256').update(canonicalize(tuples), 'utf8').digest('hex')}` };
}
let planned;
async function ownPlan() {
  planned ??= direct({ declarations: ownDeclarations, profile: ownProfile }).then(result => {
    assert.equal(result.ok, true);
    return result.plan;
  });
  return planned;
}
async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'gm-construction-witness-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  for (const path of ['src', 'self-composition']) {
    await cp(join(packageRoot, path), join(temporary, path), { recursive: true });
  }
  return { packageRoot: temporary, buildRoot, compositionPath, allowlistPath, plan: await ownPlan() };
}
async function write(root, path, source) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, source);
}
async function rewrite(f, path, change) {
  const before = await readFile(join(f.packageRoot, path), 'utf8');
  const after = change(before);
  assert.notEqual(after, before, 'fixture mutation must change source');
  await write(f.packageRoot, path, after);
}
async function rejected(f, code, expectedContext) {
  await assert.rejects(() => verifyConstruction(f), error => {
    assert.equal(error instanceof Error, true);
    assert.equal(error.code, code);
    if (expectedContext) assert.deepEqual(error.context, expectedContext);
    const context = JSON.stringify(error.context);
    assert.equal(context.includes(f.packageRoot), false);
    assert.equal(context.includes(f.buildRoot), false);
    assert.equal(context.includes('do-not-disclose'), false);
    return true;
  });
}
function correspondence(field, actualModule, actualExport, expectedModule = canonicalFactory, expectedExport = 'createOwnedJcs') {
  return {
    implementationId: canon, field,
    expected: { module: expectedModule, export: expectedExport },
    actual: { module: actualModule, export: actualExport },
  };
}

test('real direct own profile yields the exact six construction tuples and independent digest', async () => {
  const result = await verifyConstruction({ packageRoot, buildRoot, compositionPath, allowlistPath, plan: await ownPlan() });
  assert.deepEqual(result, expectedWitness());
});

test('whitespace and ordinary comments preserve the complete witness', async t => {
  const f = await fixture(t);
  for (const path of [compositionPath, allowlistPath]) {
    await rewrite(f, path, source => '// ordinary comment\n' + source.replaceAll('{', '{ /* harmless */ ').replaceAll(';', ' ;\n'));
  }
  assert.deepEqual(await verifyConstruction(f), expectedWitness());
});

test('factory, identity, declaration and provided-port import aliases resolve to original exports', async t => {
  const f = await fixture(t);
  await rewrite(f, compositionPath, source => source
    .replace('{ createOwnedJcs }', '{ createOwnedJcs as buildCanonical }')
    .replace('= createOwnedJcs(', '= buildCanonical(')
    .replace('{ CompilerFacadePort }', '{ CompilerFacadePort as FacadeAlias }')
    .replace('root: CompilerFacadePort', 'root: FacadeAlias'));
  await rewrite(f, allowlistPath, source => source
    .replace('ownedJcsImplementation, ownedJcsDeclaration', 'ownedJcsImplementation as canonicalIdentity, ownedJcsDeclaration as canonicalDeclaration')
    .replace('{ createOwnedJcs }', '{ createOwnedJcs as canonicalFactoryBinding }')
    .replace('[ownedJcsImplementation,', '[canonicalIdentity,')
    .replace('declaration: ownedJcsDeclaration', 'declaration: canonicalDeclaration')
    .replace('factory: createOwnedJcs,', 'factory: canonicalFactoryBinding,'));
  assert.deepEqual(await verifyConstruction(f), expectedWitness());
});

const scannerRootMutations = [
  ['missing required scanner', source => source.replace('createInputAdmission({ scanner })', 'createInputAdmission({})'), 'construction-slots'],
  ['miswired required scanner', source => source.replace('createInputAdmission({ scanner })', 'createInputAdmission({ scanner: output })'), 'construction-provider'],
];
const rootMutations = [
  ['missing factory import', source => source.replace(/^import \{ createOwnedJcs \}[^\n]*\n/mu, '')],
  ['missing scanner import', source => source.replace(/^import \{ createOwnedRawScanner \}[^\n]*\n/mu, ''), 'construction-count'],
  ['extra factory import', source => 'import { createOwnedJcs as spareFactory } from "../features/canonicalization/owned-jcs/factory.js";\n' + source],
  ['extra construction', source => source.replace('export const root', 'const spare = createOwnedJcs({});\nexport const root')],
  ['missing scanner construction', source => source.replace('const scanner = createOwnedRawScanner({});\n', ''), 'construction-count'],
  ['dropped slot', source => source.replace('createCompositionSemantics({ canonicalizer })', 'createCompositionSemantics({})')],
  ...scannerRootMutations,
  ['duplicate slot', source => source.replace('createCompositionSemantics({ canonicalizer })', 'createCompositionSemantics({ canonicalizer, canonicalizer })')],
  ['wrong slot', source => source.replace('createCompositionSemantics({ canonicalizer })', 'createCompositionSemantics({ wrong: canonicalizer })')],
  ['swapped provider', source => source.replace('{ admission, semantics, output }', '{ admission: output, semantics, output }')],
  ['wrong independent const order', source => source.replace('const semantics = createCompositionSemantics({ canonicalizer });\nconst output = createPlanOutput({ canonicalizer });', 'const output = createPlanOutput({ canonicalizer });\nconst semantics = createCompositionSemantics({ canonicalizer });'), 'construction-order'],
  ['wrong root', source => source.replace('root: CompilerFacadePort = compiler', 'root: CompilerFacadePort = output')],
  ['wrong provided port', source => source.replaceAll('CompilerFacadePort', 'OutputPort')],
  ['wrong port module', source => source.replace('../features/compiler-facade/ports.js', '../features/input-admission/ports.js')],
  ['value port import', source => source.replace('import type { CompilerFacadePort }', 'import { CompilerFacadePort }')],
  ['extra type import', source => 'import type { JsonValue } from "../features/canonicalization/ports.js";\n' + source],
  ['root dependency spread', source => source.replace('createCompositionSemantics({ canonicalizer })', 'createCompositionSemantics({ ...{ canonicalizer } })')],
  ['computed property', source => source.replace('createCompositionSemantics({ canonicalizer })', 'createCompositionSemantics({ ["canonicalizer"]: canonicalizer })')],
  ['string property', source => source.replace('createCompositionSemantics({ canonicalizer })', 'createCompositionSemantics({ "canonicalizer": canonicalizer })')],
  ['hidden factory call', source => source.replace('createCompositionSemantics({ canonicalizer })', 'createCompositionSemantics({ canonicalizer: createOwnedJcs({}) })')],
  ['extra argument', source => source.replace('createOwnedJcs({})', 'createOwnedJcs({}, {})')],
  ['non-slot parameter', source => source.replace('createOwnedJcs({})', 'createOwnedJcs({ option: canonicalizer })')],
  ['side effect import', source => 'import "../features/input-admission/factory.js";\n' + source],
  ['extra value expression', source => source + '\ncreateOwnedJcs({});\n'],
  ['destructured construction', source => source.replace('const canonicalizer =', 'const { canonicalizer } =')],
  ['duplicate binding', source => source.replace('const semantics =', 'const canonicalizer =')],
  ['escaped identifier', source => source.replace('= createOwnedJcs(', '= create\\u004fwnedJcs(')],
  ['unterminated comment', source => source + '\n/* unfinished'],
  ['reference directive', source => '/// <reference path="extra.ts" />\n' + source],
];
for (const [name, mutate, reason] of rootMutations) {
  test(`finite root rejects ${name}`, async t => {
    const f = await fixture(t);
    await rewrite(f, compositionPath, mutate);
    await rejected(f, invalidCode, reason ? { reason } : undefined);
  });
}

const firstEntry = /\[ownedJcsImplementation, \{[\s\S]*?localName: "canonicalizer" \}\]/u;
const allowlistMutations = [
  ['duplicate identity', source => source.replace(firstEntry, entry => `${entry},\n${entry}`)],
  ['duplicate field', source => source.replace('factory: createOwnedJcs,', 'factory: createOwnedJcs, factory: createOwnedJcs,')],
  ['duplicate local name', source => source.replace('localName: "semantics"', 'localName: "canonicalizer"')],
  ['duplicate import binding', source => source.replace('ownedJcsImplementation, ownedJcsDeclaration', 'ownedJcsImplementation, ownedJcsDeclaration, ownedJcsDeclaration')],
  ['arbitrary base spread', source => source.replace('>([', '>([...anything,')],
  ['unknown handle field', source => source.replace('factory: createOwnedJcs,', 'unknown: createOwnedJcs, factory: createOwnedJcs,')],
];
for (const [name, mutate] of allowlistMutations) {
  test(`finite allowlist rejects ${name}`, async t => {
    const f = await fixture(t);
    await rewrite(f, allowlistPath, mutate);
    await rejected(f, invalidCode);
  });
}

const correspondenceMutations = [
  ['textual factory export', source => source.replace('factoryExport: "createOwnedJcs"', 'factoryExport: "createCompatible"'),
    correspondence('factoryExport', canonicalFactory, 'createCompatible')],
  ['textual factory path', source => source.replace('importPath: "../../features/canonicalization/owned-jcs/factory.js"', 'importPath: "../../features/plan-output/factory.js"'),
    correspondence('importPath', 'src/features/plan-output/factory.js', 'createOwnedJcs')],
  ['absolute textual path is redacted', source => source.replace('importPath: "../../features/canonicalization/owned-jcs/factory.js"', 'importPath: "/tmp/do-not-disclose.js"'),
    correspondence('importPath', null, 'createOwnedJcs')],
  ['textual declaration export', source => source.replace('declarationExport: "ownedJcsDeclaration"', 'declarationExport: "inputAdmissionDeclaration"'),
    correspondence('declarationExport', 'src/features/canonicalization/owned-jcs/declaration.js', 'inputAdmissionDeclaration', 'src/features/canonicalization/owned-jcs/declaration.js', 'ownedJcsDeclaration')],
  ['declaration binding', source => source.replace('declaration: ownedJcsDeclaration', 'declaration: inputAdmissionDeclaration'),
    correspondence('declaration', 'src/features/input-admission/declaration.js', 'inputAdmissionDeclaration', 'src/features/canonicalization/owned-jcs/declaration.js', 'ownedJcsDeclaration')],
];
for (const [name, mutate, context] of correspondenceMutations) {
  test(`allowlist correspondence rejects ${name} with exact safe context`, async t => {
    const f = await fixture(t);
    await rewrite(f, allowlistPath, mutate);
    await rejected(f, correspondenceCode, context);
  });
}

// A compatible second canonicalizer exists only inside this disposable fixture.
// Copy the original built feature namespace tree, never its roots/allowlists.
// The synthetic source and JavaScript pair below are authored fixture inputs;
// this test does not claim that it ran TypeScript over the temporary source.
async function compatibleFixture(f, id = 'get-modular/canonicalization/compatible', slots = []) {
  f.buildRoot = join(f.packageRoot, 'built');
  await mkdir(join(f.buildRoot, 'src'), { recursive: true });
  await cp(join(buildRoot, 'src/features'), join(f.buildRoot, 'src/features'), { recursive: true });
  await write(f.buildRoot, 'package.json', '{"type":"module"}\n');
  const directory = 'src/features/canonicalization/compatible';
  const original = ownDeclarations.find(declaration => declaration.implementationId === canon);
  const declaration = { ...structuredClone(original), implementationId: id, slots };
  const source = await readFile(join(packageRoot, 'src/features/canonicalization/owned-jcs/declaration.ts'), 'utf8');
  await write(f.packageRoot, `${directory}/declaration.ts`, source.replaceAll('ownedJcs', 'compatible').replaceAll('owned-jcs', 'compatible')
    .replace(/export const compatibleImplementation[^\n]*;/u, `export const compatibleImplementation = ${JSON.stringify(id)};`)
    .replace('slots: Object.freeze([])', `slots: Object.freeze(${JSON.stringify(slots)})`));
  await write(f.packageRoot, `${directory}/factory.ts`, 'import type { CanonicalBytesPort, OwnedJcsDeps } from "../ports.js";\nexport function createCompatible(_deps: OwnedJcsDeps): CanonicalBytesPort { return { canonicalize: () => new Uint8Array([0]) }; }\n');
  await write(f.buildRoot, `${directory}/declaration.js`, `export const compatibleImplementation = ${JSON.stringify(id)};\nexport const compatibleDeclaration = Object.freeze(${JSON.stringify(declaration)});\n`);
  await write(f.buildRoot, `${directory}/factory.js`, 'export function createCompatible(_deps) { return { canonicalize: () => new Uint8Array([0]) }; }\n');
  await write(f.buildRoot, `${directory}/factory.d.ts`, 'import type { CanonicalBytesPort, OwnedJcsDeps } from "../ports.js";\nexport declare function createCompatible(_deps: OwnedJcsDeps): CanonicalBytesPort;\n');
  await rewrite(f, allowlistPath, sourceText => 'import { compatibleImplementation, compatibleDeclaration } from "../src/features/canonicalization/compatible/declaration.js";\nimport { createCompatible } from "../src/features/canonicalization/compatible/factory.js";\n' + sourceText.replace(/\]\);\s*$/u,
    '  [compatibleImplementation, { declaration: compatibleDeclaration, factory: createCompatible, importPath: "../../features/canonicalization/compatible/factory.js", factoryExport: "createCompatible", declarationExport: "compatibleDeclaration", localName: "compatible" }],\n]);\n'));
  return declaration;
}

test('an unused compatible handle is checked; built root and allowlist files are unnecessary', async t => {
  const f = await fixture(t);
  await compatibleFixture(f);
  assert.deepEqual(await verifyConstruction(f), expectedWitness());
  for (const path of ['src/composition/stage0.js', 'self-composition/allowlist.js']) {
    await assert.rejects(readFile(join(f.buildRoot, path)), { code: 'ENOENT' });
  }
});

for (const changeText of [false, true]) {
  test(`compatible factory ${changeText ? 'value and text' : 'value'} swap retaining the declaration fails correspondence`, async t => {
    const f = await fixture(t);
    await compatibleFixture(f);
    assert.deepEqual(await verifyConstruction(f), expectedWitness());
    await rewrite(f, allowlistPath, source => {
      let changed = source.replace('factory: createOwnedJcs,', 'factory: createCompatible,');
      if (changeText) changed = changed
        .replace('importPath: "../../features/canonicalization/owned-jcs/factory.js"', 'importPath: "../../features/canonicalization/compatible/factory.js"')
        .replace('factoryExport: "createOwnedJcs"', 'factoryExport: "createCompatible"');
      return changed;
    });
    await rejected(f, correspondenceCode, correspondence('factory', compatibleFactory, 'createCompatible'));
  });
}

for (const forwarding of ['re-export', 'local alias', 'frozen alias', 'local alias with local ID', 'frozen alias with local ID', 'property alias with local ID', 'regex alias with local ID']) {
  test(`a ${forwarding} cannot move a declaration beside another factory`, async t => {
    const f = await fixture(t);
    await compatibleFixture(f);
    const names = 'ownedJcsImplementation as compatibleImplementation, ownedJcsDeclaration as compatibleDeclaration';
    const original = '../owned-jcs/declaration.js';
    const source = forwarding === 're-export'
      ? `export { ${names} } from '${original}';\n`
      : `import { ownedJcsImplementation, ownedJcsDeclaration } from '${original}';\n`
        + `import type { ModuleDeclaration } from '../../authoring/internal.js';\n`
        + `export const compatibleImplementation: typeof ownedJcsImplementation = ${forwarding.endsWith('local ID') ? JSON.stringify(canon) : 'ownedJcsImplementation'};\n`
        + `export const compatibleDeclaration: ModuleDeclaration = ${forwarding.startsWith('property alias')
          ? 'Object.freeze({ borrowed: ownedJcsDeclaration }.borrowed || {})'
          : forwarding.startsWith('regex alias') ? 'Object.freeze({ opening: /\\{/, borrowed: ownedJcsDeclaration }.borrowed || { closing: /\\}/ })'
          : forwarding.startsWith('frozen alias') ? 'Object.freeze(ownedJcsDeclaration)' : 'ownedJcsDeclaration'};\n`;
    await write(f.packageRoot, 'src/features/canonicalization/compatible/declaration.ts', source);
    await write(f.packageRoot, 'package.json', '{"type":"module"}\n');
    // Compile only the actual feature sources. The mutated root and allowlist
    // remain inert, and cannot supply their own correspondence evidence.
    await write(f.packageRoot, 'tsconfig.origin.json', JSON.stringify({
      extends: join(packageRoot, 'tsconfig.json'),
      compilerOptions: { rootDir: '.', outDir: 'built' },
      files: [],
      include: ['src/features/**/*.ts'],
    }));
    const require = createRequire(import.meta.url);
    const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
    const build = spawnSync(process.execPath, [tsc, '-p', join(f.packageRoot, 'tsconfig.origin.json')],
      { encoding: 'utf8', timeout: 60_000 });
    assert.ifError(build.error);
    assert.equal(build.signal, null);
    assert.equal(build.status, 0, build.stdout + build.stderr);
    // Replace the complete original entry, not merely its textual fields.
    const originalAllowlist = await readFile(join(packageRoot, allowlistPath), 'utf8');
    await write(f.packageRoot, allowlistPath, originalAllowlist
      .replaceAll('ownedJcs', 'compatible').replaceAll('createOwnedJcs', 'createCompatible')
      .replaceAll('/owned-jcs/', '/compatible/'));
    await rewrite(f, compositionPath, text => text.replaceAll('createOwnedJcs', 'createCompatible')
      .replaceAll('/owned-jcs/', '/compatible/'));
    await rejected(f, invalidCode, { reason: 'nonlocal-declaration' });
  });
}

for (const name of [
  'eval', 'arguments', 'await', 'yield', 'implements', 'interface', 'let',
  'package', 'private', 'protected', 'public', 'static', 'enum',
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
  'while', 'with',
]) {
  for (const location of ['import', 'construction', 'handle']) {
    test(`strict ESM rejects ${name} as a ${location} binding`, async t => {
      const f = await fixture(t);
      if (location === 'import') await rewrite(f, compositionPath, source => source
        .replace('{ createOwnedJcs }', `{ createOwnedJcs as ${name} }`)
        .replace('= createOwnedJcs(', `= ${name}(`));
      if (location === 'construction') await rewrite(f, compositionPath, source => source
        .replace('const canonicalizer =', `const ${name} =`)
        .replaceAll('{ canonicalizer }', `{ canonicalizer: ${name} }`));
      if (location === 'handle') await rewrite(f, allowlistPath, source => source
        .replace('localName: "canonicalizer"', `localName: "${name}"`));
      await rejected(f, invalidCode);
    });
  }
}

test('text drift in an unselected handle is rejected', async t => {
  const f = await fixture(t);
  await compatibleFixture(f);
  await rewrite(f, allowlistPath, source => source.replace('factoryExport: "createCompatible"', 'factoryExport: "missingFactory"'));
  await rejected(f, correspondenceCode, {
    implementationId: 'get-modular/canonicalization/compatible', field: 'factoryExport',
    expected: { module: compatibleFactory, export: 'createCompatible' },
    actual: { module: compatibleFactory, export: 'missingFactory' },
  });
});

for (const token of ['constructor', 'prototype', 'then']) {
  test(`selected portable identity x/${token} remains an opaque Map key`, async t => {
    const f = await fixture(t);
    const id = `x/${token}`;
    const replacement = await compatibleFixture(f, id);
    const profile = structuredClone(ownProfile);
    for (const selection of profile.selections) if (selection.implementationId === canon) selection.implementationId = id;
    for (const binding of profile.bindings) binding.providerImplementationIds = binding.providerImplementationIds.map(provider => provider === canon ? id : provider);
    const result = await direct({ declarations: ownDeclarations.map(declaration => declaration.implementationId === canon ? replacement : declaration), profile });
    assert.equal(result.ok, true);
    f.plan = result.plan;
    await rewrite(f, compositionPath, source => source.replaceAll('createOwnedJcs', 'createCompatible')
      .replace('/canonicalization/owned-jcs/factory.js', '/canonicalization/compatible/factory.js')
      .replace('const scanner = createOwnedRawScanner({});\nconst admission = createInputAdmission({ scanner });\n', '')
      .replace('const canonicalizer =', 'const scanner = createOwnedRawScanner({});\nconst admission = createInputAdmission({ scanner });\nconst canonicalizer ='));
    assert.deepEqual(await verifyConstruction(f), expectedWitness([
      [scanner, 0, []],
      [admission, 1, [['scanner', scanner]]],
      [id, 2, []],
      [semantics, 3, [['canonicalizer', id]]],
      [output, 4, [['canonicalizer', id]]],
      [facade, 5, [['admission', admission], ['output', output], ['semantics', semantics]]],
    ]));
  });
  test(`declared slot ${token} is rejected even on an unselected handle`, async t => {
    const f = await fixture(t);
    await compatibleFixture(f, 'get-modular/canonicalization/compatible', [{ slotId: token,
      capabilityId: 'get-modular/canonical-bytes', compatibility: { family: 'exact', familyVersion: 1, token: 'get-modular/canonical-bytes/v1' },
      cardinality: { kind: 'required' } }]);
    await rejected(f, invalidCode);
  });
}

const planMutations = [
  ['duplicate binding records', plan => plan.bindings.push(structuredClone(plan.bindings[0]))],
  ['missing binding', plan => plan.bindings.pop()],
  ['missing required scanner binding', plan => {
    const index = plan.bindings.findIndex(binding => binding.consumerImplementationId === admission && binding.slotId === 'scanner');
    assert.notEqual(index, -1, 'scanner binding must exist before omission');
    plan.bindings.splice(index, 1);
  }, 'missing-plan-binding'],
  ['miswired required scanner binding', plan => {
    const binding = plan.bindings.find(row => row.consumerImplementationId === admission && row.slotId === 'scanner');
    assert.ok(binding, 'scanner binding must exist before miswiring');
    binding.providerImplementationIds = [canon];
  }, 'binding-correspondence'],
  ['multiple providers', plan => plan.bindings[0].providerImplementationIds.push(canon)],
  ['empty required binding', plan => { plan.bindings[0].providerImplementationIds = []; }],
  ['duplicate selection', plan => plan.selections.push(structuredClone(plan.selections[0]))],
  ['unselected root', plan => { plan.roots = ['x/missing']; }],
  ['duplicate order member', plan => { plan.dependencyOrder[1] = plan.dependencyOrder[0]; }],
  ['unknown plan field', plan => { plan.extra = true; }],
];
for (const [name, mutate, reason] of planMutations) {
  test(`finite plan rejects ${name}`, async t => {
    const f = await fixture(t);
    const before = f.plan;
    f.plan = structuredClone(before);
    mutate(f.plan);
    assert.notDeepEqual(f.plan, before, 'fixture mutation must change plan');
    await rejected(f, invalidCode, reason ? { reason } : undefined);
  });
}

for (const cardinality of [{ kind: 'optional' }, { kind: 'many', min: 0, max: 1, order: 'profile' }]) {
  test(`unselected declaration with ${cardinality.kind} cardinality is outside the finite witness`, async t => {
    const f = await fixture(t);
    await compatibleFixture(f, 'get-modular/canonicalization/compatible', [{ slotId: 'canonicalizer',
      capabilityId: 'get-modular/canonical-bytes', compatibility: { family: 'exact', familyVersion: 1, token: 'get-modular/canonical-bytes/v1' }, cardinality }]);
    await rejected(f, invalidCode);
  });
}

const variantId = 'get-modular/canonicalization/witness-variant';
const variantFactory = 'tests/features/canonicalization/witness-variant/factory.js';
async function variantFixture(t) {
  const f = await fixture(t);
  await cp(join(packageRoot, 'tests/features/canonicalization/witness-variant'),
    join(f.packageRoot, 'tests/features/canonicalization/witness-variant'), { recursive: true });
  const result = await direct({ declarations: variantDeclarations, profile: variantProfile });
  assert.equal(result.ok, true);
  return { ...f, buildRoot: join(packageRoot, 'dist-seed'), plan: result.plan,
    compositionPath: 'self-composition/stage0.variant.ts',
    allowlistPath: 'self-composition/allowlist.variant.ts', qualification: true };
}
test('the real qualification variant replaces only canonicalization and retains the scanner edge', async t => {
  const f = await variantFixture(t);
  const tuples = [
    [variantId, 0, []],
    [semantics, 1, [['canonicalizer', variantId]]],
    [output, 2, [['canonicalizer', variantId]]],
    [scanner, 3, []],
    [admission, 4, [['scanner', scanner]]],
    [facade, 5, [['admission', admission], ['output', output], ['semantics', semantics]]],
  ];
  assert.deepEqual(await verifyConstruction(f), expectedWitness(tuples));
});
for (const [name, mutate, reason] of scannerRootMutations) {
  test(`variant root rejects ${name}`, async t => {
    const f = await variantFixture(t);
    await rewrite(f, f.compositionPath, mutate);
    await rejected(f, invalidCode, { reason });
  });
}
test('a test-provider allowlist cannot enter a production witness', async t => {
  const f = await variantFixture(t);
  await rejected({ ...f, qualification: false }, invalidCode);
});
test('variant factory value and text cannot revert to owned while its declaration stays selected', async t => {
  const f = await variantFixture(t);
  await rewrite(f, f.allowlistPath, source =>
    'import { createOwnedJcs } from "../src/features/canonicalization/owned-jcs/factory.js";\n' + source
      .replace('factory: createWitnessVariant', 'factory: createOwnedJcs')
      .replace('importPath: "../../../tests/features/canonicalization/witness-variant/factory.js"',
        'importPath: "../../features/canonicalization/owned-jcs/factory.js"')
      .replace('factoryExport: "createWitnessVariant"', 'factoryExport: "createOwnedJcs"'));
  await rejected(f, correspondenceCode, {
    implementationId: variantId, field: 'factory',
    expected: { module: variantFactory, export: 'createWitnessVariant' },
    actual: { module: canonicalFactory, export: 'createOwnedJcs' },
  });
});
test('a variant root cannot silently keep the owned provider', async t => {
  const f = await variantFixture(t);
  await rewrite(f, f.compositionPath, source => source.replaceAll('createWitnessVariant', 'createOwnedJcs')
    .replace('../tests/features/canonicalization/witness-variant/factory.js', '../src/features/canonicalization/owned-jcs/factory.js'));
  await rejected(f, invalidCode);
});
test('a variant cannot replace its verified base-map import with itself', async t => {
  const f = await variantFixture(t);
  await rewrite(f, f.allowlistPath, source => source.replace('from "./allowlist.js"', 'from "./allowlist.variant.js"'));
  await rejected(f, invalidCode);
});

for (const name of ['constructor', 'async', 'get']) {
  test(`valid contextual construction binding ${name} preserves witness`, async t => {
    const f = await fixture(t);
    await rewrite(f, compositionPath, source => source
      .replace('const canonicalizer =', `const ${name} =`)
      .replaceAll('{ canonicalizer }', `{ canonicalizer: ${name} }`));
    await rewrite(f, allowlistPath, source => source
      .replace('localName: "canonicalizer"', `localName: "${name}"`));
    assert.deepEqual(await verifyConstruction(f), expectedWitness());
  });
}

async function compileIdentifierFixture(f, emit = false) {
  await write(f.packageRoot, 'package.json', '{"type":"module"}\n');
  await write(f.packageRoot, 'tsconfig.identifiers.json', JSON.stringify({
    extends: join(packageRoot, 'tsconfig.json'),
    compilerOptions: { rootDir: '.', noEmit: !emit, outDir: 'built-identifiers' },
    files: [compositionPath, allowlistPath,
      ...(emit ? ['self-composition/own-profile.ts'] : [])],
    include: [],
  }));
  const require = createRequire(import.meta.url);
  const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
  const build = spawnSync(process.execPath,
    [tsc, '-p', join(f.packageRoot, 'tsconfig.identifiers.json')],
    { encoding: 'utf8', timeout: 60_000 });
  assert.ifError(build.error);
  assert.equal(build.signal, null);
  assert.equal(build.status, 0, build.stdout + build.stderr);
}

for (const slot of ['eval', 'default']) {
  test(`explicit ${slot} slot compiles and yields independent construction tuples`, async t => {
    const f = await fixture(t);
    await rewrite(f, 'src/features/composition-semantics/declaration.ts', source => source
      .replace('slotId: "canonicalizer"', `slotId: "${slot}"`));
    await rewrite(f, 'src/features/composition-semantics/ports.ts', source => source
      .replace('readonly canonicalizer: CanonicalBytesPort;', `readonly ${slot}: CanonicalBytesPort;`));
    await rewrite(f, 'src/features/composition-semantics/factory.ts', source => source
      .replace('{ canonicalizer }: CompositionSemanticsDeps', `{ ${slot}: canonicalizer }: CompositionSemanticsDeps`));
    await rewrite(f, compositionPath, source => source
      .replace('createCompositionSemantics({ canonicalizer })', `createCompositionSemantics({ ${slot}: canonicalizer })`));
    await rewrite(f, 'self-composition/own-profile.ts', source => source
      .replace('consumerImplementationId: compositionSemanticsDeclaration.implementationId,\n      slotId: "canonicalizer"',
        `consumerImplementationId: compositionSemanticsDeclaration.implementationId,\n      slotId: "${slot}"`));

    // Compile the isolated package, including its root, allowlist and profile.
    // The witness imports declaration values from buildRoot: the original
    // namespace would still declare canonicalizer and cannot prove this change.
    await compileIdentifierFixture(f, true);
    f.buildRoot = join(f.packageRoot, 'built-identifiers');
    const inputs = await import(pathToFileURL(join(f.buildRoot, 'self-composition/own-profile.js')).href);
    const declarations = structuredClone(inputs.ownDeclarations);
    const profile = structuredClone(inputs.ownProfile);
    const expectedDeclarations = structuredClone(ownDeclarations);
    expectedDeclarations.find(row => row.implementationId === semantics).slots[0].slotId = slot;
    const expectedProfile = structuredClone(ownProfile);
    expectedProfile.bindings.find(row => row.consumerImplementationId === semantics).slotId = slot;
    assert.deepEqual(declarations, expectedDeclarations);
    assert.deepEqual(profile, expectedProfile);
    const result = await direct({ declarations, profile });
    assert.equal(result.ok, true);
    f.plan = result.plan;
    assert.deepEqual(await verifyConstruction(f), expectedWitness([
      [canon, 0, []],
      [semantics, 1, [[slot, canon]]],
      [output, 2, [['canonicalizer', canon]]],
      [scanner, 3, []],
      [admission, 4, [['scanner', scanner]]],
      [facade, 5, [['admission', admission], ['output', output], ['semantics', semantics]]],
    ]));

    // Legal property spelling does not make a shorthand a legal binding.
    await rewrite(f, compositionPath, source => source
      .replace(`{ ${slot}: canonicalizer }`, `{ ${slot} }`));
    await rejected(f, invalidCode, { reason: 'invalid-binding' });
  });
}

for (const slot of [
  ...Object.getOwnPropertyNames(Object.prototype), 'prototype', 'then',
  'Uppercase', 'a_b', '$slot', 'π', '1slot', 'a-b', 'a'.repeat(65),
]) {
  test(`explicit own slot ${JSON.stringify(slot)} is rejected`, async t => {
    const f = await fixture(t);
    await rewrite(f, compositionPath, source => source
      .replace('createCompositionSemantics({ canonicalizer })', `createCompositionSemantics({ ${slot}: canonicalizer })`));
    await rejected(f, invalidCode);
  });
  test(`unselected own declaration rejects slot ${JSON.stringify(slot)}`, async t => {
    const f = await fixture(t);
    await compatibleFixture(f, 'get-modular/canonicalization/compatible', [{ slotId: slot,
      capabilityId: 'get-modular/canonical-bytes',
      compatibility: { family: 'exact', familyVersion: 1, token: "get-modular/canonical-bytes/v1" },
      cardinality: { kind: 'required' } }]);
    await rejected(f, invalidCode, { reason: 'declared-slot' });
  });
}

for (const name of ['eval', 'default', 'arguments', 'await', 'yield', 'let', 'static']) {
  for (const location of ['provider', 'shorthand']) {
    test(`strict binding checks reject ${name} in ${location} position`, async t => {
      const f = await fixture(t);
      await rewrite(f, compositionPath, source => source
        .replace('createCompositionSemantics({ canonicalizer })',
          `createCompositionSemantics({ ${location === 'provider' ? `canonicalizer: ${name}` : name} })`));
      await rejected(f, invalidCode, {
        reason: location === 'provider' ? 'syntax' : 'invalid-binding',
      });
    });
  }
}

for (const name of ['constructor', 'async', 'get', 'π', '𐐀', 'á', 'a\u200cb\u200d']) {
  test(`raw binding ${name} compiles across imports, construction and handle metadata`, async t => {
    const f = await fixture(t);
    // Use the exact spelling in separate module namespaces, avoiding collisions.
    await rewrite(f, compositionPath, source => source
      .replace('const canonicalizer =', `const ${name} =`)
      .replaceAll('{ canonicalizer }', `{ canonicalizer: ${name} }`));
    await rewrite(f, allowlistPath, source => source
      .replace('{ createOwnedJcs }', `{ createOwnedJcs as ${name} }`)
      .replace('factory: createOwnedJcs,', `factory: ${name},`)
      .replace('localName: "canonicalizer"', `localName: "${name}"`));
    await compileIdentifierFixture(f);
    assert.deepEqual(await verifyConstruction(f), expectedWitness());
    // Exercise the root's import and callee positions independently too.
    await write(f.packageRoot, compositionPath,
      (await readFile(join(packageRoot, compositionPath), 'utf8'))
        .replace('{ createOwnedJcs }', `{ createOwnedJcs as ${name} }`)
        .replace('= createOwnedJcs(', `= ${name}(`));
    await compileIdentifierFixture(f);
    assert.deepEqual(await verifyConstruction(f), expectedWitness());
  });
}

for (const name of ['π', 'constructor', 'async', 'get']) {
  test(`safe correspondence retains legal export spelling ${name}`, async t => {
    const f = await fixture(t);
    await rewrite(f, allowlistPath, source => source
      .replace('factoryExport: "createOwnedJcs"', `factoryExport: "${name}"`));
    await rejected(f, correspondenceCode, correspondence('factoryExport', canonicalFactory, name));
  });
}

for (const name of ['\\u03c0', '\\u{3c0}', 'π-name', '́a', 'π\nx']) {
  for (const location of ['import', 'construction', 'handle']) {
    test(`finite spelling rejects ${JSON.stringify(name)} in ${location}`, async t => {
      const f = await fixture(t);
      if (location === 'import') await rewrite(f, compositionPath, source => source
        .replace('{ createOwnedJcs }', `{ createOwnedJcs as ${name} }`)
        .replace('= createOwnedJcs(', `= ${name}(`));
      if (location === 'construction') await rewrite(f, compositionPath, source => source
        .replace('const canonicalizer =', `const ${name} =`)
        .replaceAll('{ canonicalizer }', `{ canonicalizer: ${name} }`));
      if (location === 'handle') await rewrite(f, allowlistPath, source => source
        .replace('localName: "canonicalizer"', `localName: "${name}"`));
      await rejected(f, invalidCode);
    });
  }
}

test('raw Unicode does not widen literal import paths', async t => {
  const f = await fixture(t);
  await rewrite(f, compositionPath, source => source
    .replace('../features/canonicalization/owned-jcs/factory.js',
      '../features/canonicalization/π/factory.js'));
  await rejected(f, invalidCode);
});

test('escaped metadata remains outside the finite string grammar', async t => {
  const f = await fixture(t);
  await rewrite(f, allowlistPath, source => source
    .replace('factoryExport: "createOwnedJcs"', 'factoryExport: "create\\u004fwnedJcs"'));
  await rejected(f, invalidCode);
});

const generatedPath = 'src/composition/generated/stage1.ts';

function generatedInput(f, sourceText) {
  return {
    packageRoot: f.packageRoot, buildRoot: f.buildRoot,
    allowlistPath: f.allowlistPath, plan: f.plan, sourceText,
  };
}

async function generatedSource(f) {
  // A literal root with the emitter's relative import base. Expectations remain
  // the independent tuples above, never tuples serialized by the renderer.
  return (await readFile(join(f.packageRoot, compositionPath), 'utf8'))
    .replaceAll('"../features/', '"../../features/');
}

async function generatedRejected(f, sourceText, code = invalidCode, context) {
  await assert.rejects(() => verifyGeneratedConstruction(generatedInput(f, sourceText)), error => {
    assert.equal(error.code, code);
    if (context) assert.deepEqual(error.context, context);
    assert.equal(JSON.stringify(error.context).includes(f.packageRoot), false);
    assert.equal(JSON.stringify(error.context).includes(f.buildRoot), false);
    return true;
  });
}

test('actual emitted text is verified before publication with absent and poisoned destinations', async t => {
  const f = await fixture(t);
  await rm(join(f.packageRoot, 'src/composition/generated'), { recursive: true, force: true });
  await write(f.packageRoot, 'package.json', '{"type":"module"}\n');
  await write(f.packageRoot, 'tsconfig.witness-emitter.json', JSON.stringify({
    extends: join(packageRoot, 'tsconfig.json'),
    compilerOptions: { rootDir: '.', outDir: 'built-witness-emitter' },
    files: ['self-composition/emit.ts', allowlistPath],
    include: [],
  }));
  const require = createRequire(import.meta.url);
  const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
  const build = spawnSync(process.execPath,
    [tsc, '-p', join(f.packageRoot, 'tsconfig.witness-emitter.json')],
    { encoding: 'utf8', timeout: 60_000 });
  assert.ifError(build.error);
  assert.equal(build.signal, null);
  assert.equal(build.status, 0, build.stdout + build.stderr);
  f.buildRoot = join(f.packageRoot, 'built-witness-emitter');
  const { emitComposition } = await import(pathToFileURL(join(f.buildRoot, 'self-composition/emit.js')).href);
  const { allowlist } = await import(pathToFileURL(join(f.buildRoot, 'self-composition/allowlist.js')).href);
  const result = await direct({ declarations: ownDeclarations, profile: ownProfile });
  assert.equal(result.ok, true);
  const sourceText = emitComposition(result, allowlist);
  const input = generatedInput(f, sourceText);
  assert.deepEqual(await verifyGeneratedConstruction(input), expectedWitness());
  await assert.rejects(readFile(join(f.packageRoot, generatedPath)), { code: 'ENOENT' });

  const poison = Buffer.from([0xff, 0x00, 0xfe]);
  await write(f.packageRoot, generatedPath, poison);
  assert.deepEqual(await verifyGeneratedConstruction(input), expectedWitness());
  assert.deepEqual(await readFile(join(f.packageRoot, generatedPath)), poison);
  await assert.rejects(() => verifyConstruction({ ...f, compositionPath: generatedPath }),
    { code: invalidCode });

  // A directory at the destination also makes any accidental file read fail.
  await rm(join(f.packageRoot, generatedPath));
  await mkdir(join(f.packageRoot, generatedPath));
  assert.deepEqual(await verifyGeneratedConstruction(input), expectedWitness());
});

const generatedMutations = [
  ['wrong provider', source => source.replace('{ admission, semantics, output }',
    '{ admission: output, semantics, output }')],
  ['fallback expression', source => source.replace('= compiler;', '= compiler || output;')],
  ['direct fallback import', source => source.replace(
    'export const root: CompilerFacadePort = compiler;',
    'export { root } from "../stage0.js";')],
  ['unknown factory', source => source.replaceAll('createOwnedJcs', 'createUnknown')],
  ['duplicate factory import', source =>
    'import { createOwnedJcs as extra } from "../../features/canonicalization/owned-jcs/factory.js";\n' + source],
  ['duplicate factory call', source => source.replace('export const root',
    'const extra = createOwnedJcs({});\nexport const root')],
];
for (const [name, mutate] of generatedMutations) {
  test(`in-memory witness rejects ${name} before publication`, async t => {
    const f = await fixture(t);
    await rm(join(f.packageRoot, generatedPath), { force: true });
    const source = await generatedSource(f);
    const changed = mutate(source);
    assert.notEqual(changed, source);
    await generatedRejected(f, changed);
    await assert.rejects(readFile(join(f.packageRoot, generatedPath)), { code: 'ENOENT' });
  });
}

for (const [name, mutate, context] of correspondenceMutations) {
  test(`in-memory witness preserves correspondence rejection: ${name}`, async t => {
    const f = await fixture(t);
    const source = await generatedSource(f);
    await rewrite(f, allowlistPath, mutate);
    await generatedRejected(f, source, correspondenceCode, context);
  });
}

test('coordinated generated text and factory value substitution cannot retain the original declaration', async t => {
  const f = await fixture(t);
  await compatibleFixture(f);
  const source = await generatedSource(f);
  assert.deepEqual(await verifyGeneratedConstruction(generatedInput(f, source)), expectedWitness());
  await rm(join(f.packageRoot, generatedPath), { force: true });
  await rewrite(f, allowlistPath, text => text
    .replace('factory: createOwnedJcs,', 'factory: createCompatible,')
    .replace('importPath: "../../features/canonicalization/owned-jcs/factory.js"',
      'importPath: "../../features/canonicalization/compatible/factory.js"')
    .replace('factoryExport: "createOwnedJcs"', 'factoryExport: "createCompatible"'));
  const substituted = source.replaceAll('createOwnedJcs', 'createCompatible')
    .replaceAll('/owned-jcs/factory.js', '/compatible/factory.js');
  await generatedRejected(f, substituted, correspondenceCode,
    correspondence('factory', compatibleFactory, 'createCompatible'));
  await assert.rejects(readFile(join(f.packageRoot, generatedPath)), { code: 'ENOENT' });
});

test('in-memory witness checks correspondence of unselected handles', async t => {
  const f = await fixture(t);
  await compatibleFixture(f);
  const source = await generatedSource(f);
  await rewrite(f, allowlistPath, text =>
    text.replace('factoryExport: "createCompatible"', 'factoryExport: "missingFactory"'));
  await generatedRejected(f, source, correspondenceCode, {
    implementationId: 'get-modular/canonicalization/compatible', field: 'factoryExport',
    expected: { module: compatibleFactory, export: 'createCompatible' },
    actual: { module: compatibleFactory, export: 'missingFactory' },
  });
});

for (const [name, sourceText, reason] of [
  ['bytes', new Uint8Array(), 'generated-text'],
  ['boxed text', new String(''), 'generated-text'],
  ['oversized text', ' '.repeat(1024 * 1024 + 1), 'generated-text-size'],
  ['oversized UTF-8', 'π'.repeat(524289), 'generated-text-size'],
  ['lone surrogate', '\ud800', 'generated-text-encoding'],
  ['CRLF', '\r\n', 'generated-text-encoding'],
  ['BOM', '\ufeff', 'generated-text-encoding'],
  ['NUL', '\u0000', 'generated-text-encoding'],
]) {
  test(`generated text rejects ${name} before source access`, async () => {
    await assert.rejects(() => verifyGeneratedConstruction({
      sourceText, packageRoot: null, buildRoot: null, allowlistPath, plan: null,
    }), error => error.code === invalidCode && error.context.reason === reason);
  });
}

for (const option of [{ compositionPath }, { qualification: true }, { importPolicy: 'tests' }]) {
  test(`generated witness rejects alternate policy ${Object.keys(option)[0]}`, async () => {
    await assert.rejects(() => verifyGeneratedConstruction({
      sourceText: '', packageRoot: null, buildRoot: null, allowlistPath, plan: null, ...option,
    }), error => error.code === invalidCode && error.context.reason === 'generated-options');
  });
}
