import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateInput, electronEnvironment, verifyElectronResults,
} from '../../../../tests/qualification/m3-electron-consumer.mjs';
import { runInNewContext } from 'node:vm';
import { produceDescriptorRuntimeFixtures } from '../../../../tests/qualification/support/m3-descriptor-runtime-fixtures.mjs';
import { executeDescriptorRuntimeFixture } from '../../../../tests/qualification/support/m3-descriptor-runtime-executor.mjs';

const input = {
  absoluteelectronExecutable: '/tools/Electron.app/Contents/MacOS/Electron', archivePath: '/retained/core.tgz',
  expectedSha256: 'a'.repeat(64),
  integrity: `sha512-${Buffer.alloc(64).toString('base64')}`,
  exactSourceSHA: 'b'.repeat(40),
  uniqueOutputDir: '/owned/electron-unique',
  expectedElectronVersion: '44.2.0',
};

test('configuration rejects incomplete identity and implicit launch overrides', () => {
  for (const mutate of [
    value => { delete value.exactSourceSHA; },
    value => { value.exactSourceSHA = 'abcdef0'; },
    value => { value.archivePath = './core.tgz'; },
    value => { value.absoluteelectronExecutable = 'electron'; },
    value => { value.uniqueOutputDir = './output'; },
    value => { value.expectedElectronVersion = 'latest'; },
    value => { value.expectedElectronVersion = '44.2.0 --no-sandbox'; },
    value => { value.expectedSha256 = 'A'.repeat(64); },
    value => { value.integrity = `sha512-${'A'.repeat(85)}B==`; },
    value => { value.noSandbox = true; },
  ]) {
    const candidate = { ...input };
    mutate(candidate);
    assert.throws(() => validateInput(candidate));
  }
  assert.equal(validateInput({ ...input, exactSourceSHA: 'c'.repeat(40), expectedElectronVersion: '45.0.1' }).exactSourceSHA, 'c'.repeat(40));
});

test('environment isolates profile storage without dropping macOS and display launch variables', () => {
  const env = electronEnvironment('/owned/out', {
    HOME: '/real/user', NODE_OPTIONS: '--import=/injected.mjs', ELECTRON_RUN_AS_NODE: '1',
    DYLD_INSERT_LIBRARIES: '/injected.dylib', DISPLAY: ':91', __CF_USER_TEXT_ENCODING: '0x1:0:0',
  });
  assert.equal(env.HOME, join('/owned/out', 'home'));
  assert.equal(env.DISPLAY, ':91');
  assert.equal(env.__CF_USER_TEXT_ENCODING, '0x1:0:0');
  for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'DYLD_INSERT_LIBRARIES']) {
    assert.equal(Object.hasOwn(env, name), false, name);
  }
});

const fixtures = Array.from({ length: 123 }, (_, index) => ({
  id: `synthetic-verifier-contract-${index}`, expected: { ok: false, diagnostics: [] },
}));
const record = fixture => ({
  id: fixture.id, result: structuredClone(fixture.expected),
  observations: { containers: 1, mutationRejections: 3,
    mutatedBuffers: 0, mutatedBytes: 0, callerWrapperMutated: true },
});

function evidence() {
  const versions = { electron: '44.2.0', chrome: '1.2.3.4', node: '24.0.0' };
  const identity = { type: 'renderer', sandboxed: true, contextIsolated: true, versions: { ...versions }, os: process.platform, arch: process.arch, pid: 202 };
  const config = { expectedElectronVersion: '44.2.0', installedRoot: 'file:///owned/app/node_modules/@get-modular/core/dist/index.js', userData: '/owned/userData', sessionData: '/owned/sessionData' };
  const main = {
    realm: 'electron-main', processType: 'browser', versions, os: process.platform, arch: process.arch, pid: 101, resolvedRoot: config.installedRoot, userData: config.userData, sessionData: config.sessionData,
    native: { sharedArrayBuffer: true, webCrypto: true, documentAbsent: true },
    records: fixtures.map(record),
  };
  const renderer = {
    realm: 'electron-sandboxed-renderer', secureContext: true, crossOriginIsolated: true,
    sharedArrayBuffer: true, webCrypto: true, processAbsent: true, requireAbsent: true,
    identity, osProcessId: identity.pid,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
    records: fixtures.map(record),
  };
  return { config, observations: { main, renderer } };
}

test('parent rejects incomplete results, substituted realms, unsafe preferences and identity drift', () => {
  for (const mutate of [
    value => { value.renderer.records.pop(); },
    value => { value.main.records[0].result.ok = true; },
    value => { value.renderer.records[0].observations.callerWrapperMutated = false; },
    value => { value.renderer.realm = 'electron-main'; },
    value => { value.main.versions.electron = '44.1.0'; },
    value => { value.renderer.identity.versions.chrome = '9.8.7.6'; },
    value => { value.renderer.identity.sandboxed = false; },
    value => { value.renderer.processAbsent = false; },
    value => { value.renderer.webPreferences.nodeIntegration = true; },
    value => { value.renderer.osProcessId = value.main.pid; },
    value => { value.main.resolvedRoot = 'file:///workspace/core/dist/index.js'; },
    value => { value.main.userData = '/real/user/profile'; },
  ]) {
    const { config, observations } = evidence();
    verifyElectronResults(observations, fixtures, config);
    mutate(observations);
    assert.throws(() => verifyElectronResults(observations, fixtures, config));
  }
});

test('Electron applies shared semantic verification to both realms', () => {
  const semanticFixtures = Array.from({ length: 818 }, (_, index) => ({
    id: `semantic-${index}`, category: 'synthetic',
    input: { declarations: [], profile: {} },
    expected: { ok: false, diagnostics: [] },
    rawEligibility: { declarationBytes: [], profileBytes: 2, aggregateBytes: 2 },
  }));
  const semanticRecords = semanticFixtures.flatMap(fixture =>
    ['object', 'raw'].map(mode => ({
      id: fixture.id, category: fixture.category, mode,
      result: structuredClone(fixture.expected),
      observations: {
        containers: 2, mutationRejections: 12, mutatedObjects: 5,
        mutatedBuffers: 1, mutatedBytes: 2, callerWrapperMutated: true,
      },
    })));
  for (const realm of ['main', 'renderer']) {
    for (const mutate of [
      value => { delete value.semanticRecords; },
      value => { value.semanticRecords.pop(); },
      value => { value.semanticRecords[1].mode = 'object'; },
      value => { value.semanticRecords[0].result.ok = true; },
      value => { value.semanticRecords[0].observations.mutatedBuffers = 0; },
    ]) {
      const { observations, config } = evidence();
      for (const value of Object.values(observations)) {
        value.semanticRecords = structuredClone(semanticRecords);
      }
      verifyElectronResults(observations, fixtures, config, semanticFixtures);
      mutate(observations[realm]);
      assert.throws(() =>
        verifyElectronResults(observations, fixtures, config, semanticFixtures));
    }
  }
});

test('Electron requires complete descriptor evidence and foreign coverage in each realm', async () => {
  const descriptorFixtures = [...produceDescriptorRuntimeFixtures()];
  const foreignRealmFactory = runInNewContext(`(() => ({
    objectPrototype: Object.prototype, arrayPrototype: Array.prototype,
    record: () => ({}), nullRecord: () => Object.create(null), array: () => [],
  }))`, Object.create(null), { contextCodeGeneration: { strings: false, wasm: false } });
  const freeze = value => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  // Synthetic result producer exercises the verifier, not the installed compiler.
  const records = [];
  for (const fixture of descriptorFixtures) {
    records.push(await executeDescriptorRuntimeFixture({
      compileComposition: () => Promise.resolve(freeze(structuredClone(fixture.expected))),
    }, fixture, { foreignRealmFactory }));
  }
  for (const realm of ['main', 'renderer']) {
    for (const mutate of [
      value => { delete value.descriptors; },
      value => { value.descriptors.records.pop(); },
      value => { value.descriptors.records[0].result.ok = !value.descriptors.records[0].result.ok; },
      value => { value.descriptors.records[0].observations.getterCalls = 1; },
      value => { value.descriptors.records[0].observations.nestedMutations = 0; },
      value => { value.descriptors.records[0].observations.mutationRejections = 0; },
      value => {
        value.descriptors.records.find(row => row.applicability.foreignRealm === 'required')
          .observations.foreignRealm = 'nonapplicable';
      },
      value => {
        value.descriptors.records.find(row => row.applicability.foreignRealm === 'required')
          .applicability.foreignRealm = 'nonapplicable';
      },
      value => {
        const foreign = value.descriptors.records.filter(row =>
          row.applicability.foreignRealm === 'required');
        value.descriptors.records = value.descriptors.records.filter(row => !foreign.includes(row));
        value.descriptors.unmet = foreign.map(row => ({
          id: row.id, capability: 'foreign-realm',
          code: 'descriptor.foreign-realm-unavailable',
        }));
      },
    ]) {
      const { observations, config } = evidence();
      for (const value of Object.values(observations))
        value.descriptors = { records: structuredClone(records), unmet: [] };
      verifyElectronResults(observations, fixtures, config, undefined, descriptorFixtures);
      mutate(observations[realm]);
      assert.throws(() =>
        verifyElectronResults(observations, fixtures, config, undefined, descriptorFixtures));
    }
  }
});
