import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import canonicalize from 'canonicalize';
import { compileComposition as direct } from '../../dist-stage0/self-composition/stage0-entry.js';
import { ownDeclarations, ownProfile } from '../../dist-stage0/self-composition/own-profile.js';
import { ownDeclarations as variantDeclarations, ownProfile as variantProfile } from '../../dist-seed/self-composition/own-profile.variant.js';
import { verifyConstruction } from '../../../../tests/qualification/support/construction-witness.mjs';

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
const facade = 'get-modular/compiler-facade/default';
const canonicalFactory = 'src/features/canonicalization/owned-jcs/factory.js';
const compatibleFactory = 'src/features/canonicalization/compatible/factory.js';

// Literal construction expectations from ADR-0016 and the implementation guide.
// The subject plan supplies the obligation; it never supplies expected tuples.
const expectedTuples = [
  [canon, 0, []],
  [semantics, 1, [['canonicalizer', canon]]],
  [admission, 2, []],
  [output, 3, [['canonicalizer', canon]]],
  [facade, 4, [['admission', admission], ['output', output], ['semantics', semantics]]],
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

test('real direct own profile yields the exact five construction tuples and independent digest', async () => {
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

const rootMutations = [
  ['missing factory import', source => source.replace(/^import \{ createOwnedJcs \}[^\n]*\n/mu, '')],
  ['extra factory import', source => 'import { createOwnedJcs as spareFactory } from "../features/canonicalization/owned-jcs/factory.js";\n' + source],
  ['extra construction', source => source.replace('export const root', 'const spare = createOwnedJcs({});\nexport const root')],
  ['dropped slot', source => source.replace('createCompositionSemantics({ canonicalizer })', 'createCompositionSemantics({})')],
  ['duplicate slot', source => source.replace('createCompositionSemantics({ canonicalizer })', 'createCompositionSemantics({ canonicalizer, canonicalizer })')],
  ['wrong slot', source => source.replace('createCompositionSemantics({ canonicalizer })', 'createCompositionSemantics({ wrong: canonicalizer })')],
  ['swapped provider', source => source.replace('{ admission, semantics, output }', '{ admission: output, semantics, output }')],
  ['wrong independent const order', source => source.replace('const semantics = createCompositionSemantics({ canonicalizer });\nconst admission = createInputAdmission({});', 'const admission = createInputAdmission({});\nconst semantics = createCompositionSemantics({ canonicalizer });')],
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
for (const [name, mutate] of rootMutations) {
  test(`finite root rejects ${name}`, async t => {
    const f = await fixture(t);
    await rewrite(f, compositionPath, mutate);
    await rejected(f, invalidCode);
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

for (const forwarding of ['re-export', 'local alias', 'frozen alias', 'local alias with local ID', 'frozen alias with local ID']) {
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
        + `export const compatibleDeclaration: ModuleDeclaration = ${forwarding.startsWith('frozen alias') ? 'Object.freeze(ownedJcsDeclaration)' : 'ownedJcsDeclaration'};\n`;
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

for (const name of ['eval', 'arguments']) {
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
      .replace('const admission = createInputAdmission({});\n', '')
      .replace('const canonicalizer =', 'const admission = createInputAdmission({});\nconst canonicalizer ='));
    assert.deepEqual(await verifyConstruction(f), expectedWitness([
      [admission, 0, []], [id, 1, []], [semantics, 2, [['canonicalizer', id]]],
      [output, 3, [['canonicalizer', id]]],
      [facade, 4, [['admission', admission], ['output', output], ['semantics', semantics]]],
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
  ['multiple providers', plan => plan.bindings[0].providerImplementationIds.push(canon)],
  ['empty required binding', plan => { plan.bindings[0].providerImplementationIds = []; }],
  ['duplicate selection', plan => plan.selections.push(structuredClone(plan.selections[0]))],
  ['unselected root', plan => { plan.roots = ['x/missing']; }],
  ['duplicate order member', plan => { plan.dependencyOrder[1] = plan.dependencyOrder[0]; }],
  ['unknown plan field', plan => { plan.extra = true; }],
];
for (const [name, mutate] of planMutations) {
  test(`finite plan rejects ${name}`, async t => {
    const f = await fixture(t);
    f.plan = structuredClone(f.plan);
    mutate(f.plan);
    await rejected(f, invalidCode);
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
test('the real qualification variant wires the replacement into both consumers', async t => {
  const f = await variantFixture(t);
  const tuples = expectedTuples.map(([id, index, slots]) => [id === canon ? variantId : id, index,
    slots.map(([slot, provider]) => [slot, provider === canon ? variantId : provider])]);
  assert.deepEqual(await verifyConstruction(f), expectedWitness(tuples));
});
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
