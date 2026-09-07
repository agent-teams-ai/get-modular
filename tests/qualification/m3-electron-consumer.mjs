// Partial retained-archive diagnostic: raw123, semantic818/both carriers, descriptor68/object.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, rename, open, readdir, lstat, realpath }
  from 'node:fs/promises';
import { isAbsolute, join, dirname } from 'node:path';
import { arch, platform } from 'node:os';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readPackageArchive } from './support/package-archive.mjs';
import { auditM1JavaScriptClosure } from './support/m1-javascript-closure.mjs';
import { produceRuntimeFixtures } from './support/m3-runtime-fixture-producer.mjs';
import { produceSemanticRuntimeFixtures } from './support/m3-semantic-runtime-fixtures.mjs';
import { produceDescriptorRuntimeFixtures } from './support/m3-descriptor-runtime-fixtures.mjs';
import { produceInvocationRuntimeFixtures } from './support/m3-invocation-runtime-fixtures.mjs';
import { bounded } from './support/m3-cdp.mjs';
import {
  publicArchiveRoot, routeHandler, verifyRecords, verifySemanticRecords,
  verifyDescriptorRecords, descriptorBrowserSource, descriptorHelperNames,
  prepareInvocationEvidence, verifyInvocationRecords, invocationBrowserSource,
  invocationHelperNames, invocationForeignSource,
} from './m3-chromium-consumer.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;

export function validateInput(input) {
  assert.ok(input && Object.getPrototypeOf(input) === Object.prototype);
  const names = [
    'absoluteelectronExecutable', 'archivePath', 'expectedSha256', 'integrity',
    'exactSourceSHA', 'uniqueOutputDir', 'expectedElectronVersion',
  ];
  assert.deepEqual(Reflect.ownKeys(input).sort(), names.sort());
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(input))) {
    assert.ok(Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string');
  }
  for (const name of ['absoluteelectronExecutable', 'archivePath', 'uniqueOutputDir']) {
    assert.ok(isAbsolute(input[name]) && !input[name].includes('\0'), name);
  }
  assert.match(input.exactSourceSHA, /^[a-f0-9]{40}$/, 'full caller-bound source commit');
  assert.match(input.expectedSha256, /^[a-f0-9]{64}$/);
  assert.match(input.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
  assert.equal(Buffer.from(input.integrity.slice(7), 'base64').toString('base64'), input.integrity.slice(7));
  assert.match(input.expectedElectronVersion, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
  return Object.freeze({ ...input });
}

export function electronEnvironment(out, inherited = process.env) {
  const env = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8' };
  for (const name of [
    'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ',
    'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS',
    '__CF_USER_TEXT_ENCODING', '__CFBundleIdentifier', 'SECURITYSESSIONID', 'COMMAND_MODE',
  ]) if (typeof inherited[name] === 'string') env[name] = inherited[name];
  Object.assign(env, {
    HOME: join(out, 'home'), CFFIXED_USER_HOME: join(out, 'home'),
    TMPDIR: join(out, 'tmp'), TMP: join(out, 'tmp'), TEMP: join(out, 'tmp'),
    XDG_CONFIG_HOME: join(out, 'config'),
    XDG_CACHE_HOME: join(out, 'cache'),
    XDG_DATA_HOME: join(out, 'data'),
  });
  return env;
}

const rendererSource = `
import { executeRuntimeFixtures } from './m3-runtime-executor.mjs';
import { executeSemanticRuntimeFixtures } from './m3-semantic-runtime-executor.mjs';
import { runDescriptors } from './descriptor-browser.mjs';
import { runInvocations } from './invocation-browser.mjs';
export async function run(rootURL) {
  const identity = globalThis.electronIdentity;
  const local = {
    realm: 'electron-sandboxed-renderer', identity,
    secureContext: isSecureContext, crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer === 'function', webCrypto: !!crypto.subtle,
    processAbsent: typeof process === 'undefined', requireAbsent: typeof require === 'undefined',
  };
  if (!local.secureContext || !local.crossOriginIsolated || !local.sharedArrayBuffer ||
      !local.webCrypto || !local.processAbsent || !local.requireAbsent || typeof document !== 'object') throw new Error('renderer prerequisites');
  const root = new URL(rootURL);
  if (root.origin !== location.origin || !root.pathname.startsWith('/archive/') || root.search || root.hash)
    throw new Error('invalid archive root');
  const response = await fetch('/dev/fixtures.json');
  if (!response.ok) throw new Error('fixtures unavailable');
  const fixtures = await response.json();
  const semanticResponse = await fetch('/dev/semantic-fixtures.json');
  if (!semanticResponse.ok) throw new Error('semantic fixtures unavailable');
  const semanticFixtures = await semanticResponse.json();
  const invocationResponse = await fetch('/dev/invocation-fixtures.json');
  if (!invocationResponse.ok) throw new Error('invocation fixtures unavailable');
  const invocationFixtures = await invocationResponse.json();
  const namespace = await import(root.href);
  const invocations = await runInvocations(namespace, invocationFixtures);
  const records = await executeRuntimeFixtures(namespace, fixtures);
  const semanticRecords = await executeSemanticRuntimeFixtures(namespace, semanticFixtures);
  const descriptors = await runDescriptors(namespace);
  return { ...local, records, semanticRecords, descriptors, invocations };
}
`;

const preloadSource = `
const { contextBridge } = require('electron');
const identity = {
  type: process.type, sandboxed: process.sandboxed,
  contextIsolated: process.contextIsolated, versions: { ...process.versions },
  os: process.platform, arch: process.arch, pid: process.pid,
};
contextBridge.exposeInMainWorld('electronIdentity', identity);
`;

const mainSource = `
import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeRuntimeFixtures } from './m3-runtime-executor.mjs';
import { executeSemanticRuntimeFixtures } from './m3-semantic-runtime-executor.mjs';
import { executeDescriptorRuntimeFixtures } from './m3-descriptor-runtime-executor.mjs';
import { runInNewContext } from 'node:vm';
import { Buffer } from 'node:buffer';
import { executeInvocationRuntimeFixtures } from './m3-invocation-runtime-executor.mjs';
const invocationForeignRealmFactory = runInNewContext(${JSON.stringify(invocationForeignSource)},
  Object.create(null), { contextCodeGeneration: { strings: false, wasm: false } });
const foreignRealmFactory = runInNewContext(\`(() => ({
  objectPrototype: Object.prototype,
  arrayPrototype: Array.prototype,
  record: () => ({}),
  nullRecord: () => Object.create(null),
  array: () => [],
}))\`, Object.create(null), { contextCodeGeneration: { strings: false, wasm: false } });
const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const save = (name, value) => {
  const temporary = join(config.uniqueOutputDir, name + '.pending');
  writeFileSync(temporary, JSON.stringify(value), { flag: 'wx' });
  renameSync(temporary, join(config.uniqueOutputDir, name));
};
assert.equal(app.isReady(), false, 'profile paths must precede readiness');
app.setPath('userData', config.userData);
app.setPath('sessionData', config.sessionData);
app.enableSandbox();
app.commandLine.appendSwitch('disable-background-networking');
async function execute() {
const watchdog = setTimeout(() => app.exit(1), 170000);
let window;
try {
  assert.equal(process.type, 'browser');
  assert.equal(process.versions.electron, config.expectedElectronVersion);
  assert.ok(typeof SharedArrayBuffer === 'function' && globalThis.crypto?.subtle && typeof document === 'undefined');
  await app.whenReady();
  save('ready.json', { pid: process.pid });
  const main = {
    realm: 'electron-main', processType: process.type,
    versions: { ...process.versions }, os: process.platform, arch: process.arch, pid: process.pid,
    userData: app.getPath('userData'), sessionData: app.getPath('sessionData'),
    resolvedRoot: import.meta.resolve('@get-modular/core'), native: { sharedArrayBuffer: typeof SharedArrayBuffer === 'function', webCrypto: !!globalThis.crypto?.subtle, documentAbsent: typeof document === 'undefined' },
  };
  assert.equal(main.resolvedRoot, config.installedRoot);
  const invocationFixtures = JSON.parse(readFileSync(join(config.uniqueOutputDir, 'invocation-fixtures.json'), 'utf8'));
  const namespace = await import('@get-modular/core');
  main.invocations = { records: await executeInvocationRuntimeFixtures(namespace, invocationFixtures,
    { nodeBuffer: Buffer, foreignRealmFactory: invocationForeignRealmFactory }), unmet: [] };
  main.records = await executeRuntimeFixtures(namespace, JSON.parse(readFileSync(join(config.uniqueOutputDir, 'fixtures.json'), 'utf8')));
  main.semanticRecords = await executeSemanticRuntimeFixtures(namespace, JSON.parse(readFileSync(join(config.uniqueOutputDir, 'semantic-fixtures.json'), 'utf8')));
  main.descriptors = {
    records: await executeDescriptorRuntimeFixtures(namespace,
      JSON.parse(readFileSync(join(config.uniqueOutputDir, 'descriptor-fixtures.json'), 'utf8')),
      { foreignRealmFactory }),
    unmet: [],
  };
  save('main.json', main);
  window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)) },
  });
  const preferences = window.webContents.getLastWebPreferences();
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.contextIsolation, true);
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  await window.loadURL(config.origin + '/index.html');
  const renderer = await window.webContents.executeJavaScript(
    "import('/dev/renderer.mjs').then(m => m.run(" + JSON.stringify(config.origin + config.runtimeRoot) + "))");
  renderer.webPreferences = { sandbox: preferences.sandbox,
    nodeIntegration: preferences.nodeIntegration, contextIsolation: preferences.contextIsolation };
  renderer.osProcessId = window.webContents.getOSProcessId();
  save('renderer.json', renderer);
  window.destroy();
  clearTimeout(watchdog);
  app.exit(0);
} catch (error) {
  save('failure.json', { error: String(error?.stack ?? error) });
  window?.destroy();
  clearTimeout(watchdog);
  app.exit(1);
}
}
// Let the entry module finish so Electron can emit ready.
void execute();
`;

export function verifyElectronResults(observations, fixtures, config, semanticFixtures, descriptorFixtures, invocationFixtures, invocationExpected) {
  const { main, renderer } = observations;
  assert.equal(main.realm, 'electron-main');
  assert.equal(main.processType, 'browser');
  assert.equal(main.resolvedRoot, config.installedRoot);
  assert.equal(main.userData, config.userData);
  assert.equal(main.sessionData, config.sessionData);
  assert.deepEqual(main.native, { sharedArrayBuffer: true, webCrypto: true, documentAbsent: true });
  assert.equal(renderer.realm, 'electron-sandboxed-renderer');
  for (const flag of ['secureContext', 'crossOriginIsolated', 'sharedArrayBuffer', 'webCrypto']) {
    assert.equal(renderer[flag], true, flag);
  }
  assert.equal(renderer.processAbsent, true);
  assert.equal(renderer.requireAbsent, true);
  const identity = renderer.identity;
  assert.equal(identity.type, 'renderer');
  assert.equal(identity.sandboxed, true);
  assert.equal(identity.contextIsolated, true);
  assert.equal(renderer.osProcessId, identity.pid);
  assert.ok(Number.isSafeInteger(identity.pid) && identity.pid > 0);
  assert.ok(Number.isSafeInteger(main.pid) && main.pid > 0 && main.pid !== identity.pid);
  assert.deepEqual(renderer.webPreferences, { sandbox: true, nodeIntegration: false, contextIsolation: true });
  for (const runtime of [main, identity]) {
    assert.equal(runtime.versions.electron, config.expectedElectronVersion, 'exact Electron version');
    for (const name of ['electron', 'chrome', 'node']) {
      assert.match(runtime.versions[name], name === 'chrome' ? /^\d+\.\d+\.\d+\.\d+$/ : /^\d+\.\d+\.\d+$/);
    }
    assert.equal(runtime.os, platform());
    assert.equal(runtime.arch, arch());
  }
  for (const realm of [main, renderer]) verifyRecords(realm.records, fixtures);
  // Preserve legacy raw-only verifier callers; retained runs always supply fixtures.
  if (semanticFixtures !== undefined ||
      Object.hasOwn(main, 'semanticRecords') || Object.hasOwn(renderer, 'semanticRecords')) {
    const expected = semanticFixtures ?? [...produceSemanticRuntimeFixtures()];
    for (const realm of [main, renderer]) {
      verifySemanticRecords(realm.semanticRecords, expected);
    }
  }
  // Legacy raw-only callers remain supported; retained runs require both realms.
  if (descriptorFixtures !== undefined ||
      Object.hasOwn(main, 'descriptors') || Object.hasOwn(renderer, 'descriptors')) {
    const expected = descriptorFixtures ?? [...produceDescriptorRuntimeFixtures()];
    for (const realm of [main, renderer]) {
      verifyDescriptorRecords(realm.descriptors, expected);
    }
  }
  if (invocationFixtures !== undefined ||
      Object.hasOwn(main, 'invocations') || Object.hasOwn(renderer, 'invocations')) {
    assert.ok(invocationFixtures && invocationExpected, 'precomputed invocation evidence required');
    verifyInvocationRecords(main.invocations, invocationFixtures, invocationExpected, 'main');
    verifyInvocationRecords(renderer.invocations, invocationFixtures, invocationExpected, 'window');
  }
  for (const name of ['electron', 'chrome', 'node']) assert.equal(main.versions[name], identity.versions[name]);
}

async function archiveIdentity(input) {
  return readPackageArchive(await readFile(input.archivePath), {
    sha256: input.expectedSha256, integrity: input.integrity,
  });
}

async function verifyInstalled(root, files) {
  const observed = [];
  async function walk(directory, prefix = '') {
    assert.ok((await lstat(directory)).isDirectory(), 'ordinary installed directory');
    for (const name of await readdir(directory)) {
      const relative = prefix ? `${prefix}/${name}` : name;
      const absolute = join(directory, name);
      const stat = await lstat(absolute);
      if (stat.isDirectory()) await walk(absolute, relative);
      else {
        assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'ordinary installed file');
        observed.push(relative);
        assert.ok(files.has(relative), `unexpected installed file: ${relative}`);
        assert.deepEqual(await readFile(absolute), files.get(relative), relative);
      }
    }
  }
  await walk(root);
  assert.deepEqual(observed.sort(), [...files.keys()].sort(), 'exact installed inventory');
}

async function stopOwned(child, exited) {
  if (!child?.pid) return;
  const signal = name => {
    try { process.kill(-child.pid, name); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  signal('SIGTERM');
  try { await bounded(exited, 5_000, 'Electron exit'); }
  catch { signal('SIGKILL'); await bounded(exited, 5_000, 'Electron kill'); }
  signal('SIGKILL');
  const deadline = performance.now() + 5_000;
  for (;;) {
    try { process.kill(-child.pid, 0); }
    catch (error) { if (error.code === 'ESRCH') return; throw error; }
    assert.ok(performance.now() < deadline, 'owned Electron process group teardown timed out');
    await delay(Math.min(50, Math.max(1, deadline - performance.now())));
  }
}

export async function runElectronConsumer(rawInput) {
  const input = validateInput(rawInput);
  assert.equal(Number(process.versions.node.split('.')[0]), 24, 'Node 24 parent required');
  assert.ok(['linux', 'darwin'].includes(platform()), 'POSIX process groups required');
  const archive = await archiveIdentity(input);
  const runtimeRoot = publicArchiveRoot(archive.files);
  const closure = auditM1JavaScriptClosure(archive.files, 'm2-generated');
  const fixtures = produceRuntimeFixtures();
  const semanticFixtures = [...produceSemanticRuntimeFixtures()];
  const descriptorFixtures = [...produceDescriptorRuntimeFixtures()];
  const invocationFixtures = [...produceInvocationRuntimeFixtures()];
  const invocationExpected = await prepareInvocationEvidence(invocationFixtures);
  const out = input.uniqueOutputDir;
  assert.equal(await realpath(dirname(out)), dirname(out), 'canonical output parent required');
  await mkdir(out, { mode: 0o700 });
  const appDir = join(out, 'app'), packageRoot = join(appDir, 'node_modules', '@get-modular', 'core');
  for (const directory of [packageRoot, ...['home', 'tmp', 'config', 'cache', 'data', 'userData', 'sessionData'].map(name => join(out, name))]) await mkdir(directory, { recursive: true, mode: 0o700 });
  const installedRoot = pathToFileURL(join(packageRoot, runtimeRoot.slice('/archive/'.length))).href;
  for (const [path, bytes] of archive.files) {
    await mkdir(dirname(join(packageRoot, path)), { recursive: true, mode: 0o700 });
    await writeFile(join(packageRoot, path), bytes, { flag: 'wx', mode: 0o600 });
  }
  await verifyInstalled(packageRoot, archive.files);
  const routes = new Map();
  const add = (path, bytes, type = 'text/javascript; charset=utf-8') => routes.set(path, { bytes: Buffer.from(bytes), type });
  for (const path of closure.modules) add(`/archive/${path}`, archive.files.get(path));
  add('/dev/fixtures.json', json(fixtures), 'application/json');
  add('/dev/semantic-fixtures.json', json(semanticFixtures), 'application/json');
  add('/dev/descriptor-fixtures.json', json(descriptorFixtures), 'application/json');
  add('/dev/descriptor-browser.mjs', descriptorBrowserSource);
  add('/dev/invocation-browser.mjs', invocationBrowserSource);
  add('/dev/invocation-fixtures.json', json(invocationFixtures), 'application/json');
  add('/dev/descriptor-blank.html', '<!doctype html><title>Owned descriptor realm</title>',
    'text/html; charset=utf-8');
  add('/dev/renderer.mjs', rendererSource);
  add('/index.html', '<!doctype html><meta charset="utf-8"><title>ElectronDesktopSmoke: raw123 + semantic818</title>', 'text/html; charset=utf-8');
  for (const name of ['m3-runtime-executor.mjs', 'm3-runtime-materializers.mjs', 'm3-semantic-runtime-executor.mjs', ...descriptorHelperNames, ...invocationHelperNames]) {
    const bytes = await readFile(new URL(`./support/${name}`, import.meta.url));
    add(`/dev/${name}`, bytes);
    await writeFile(join(appDir, name), bytes, { flag: 'wx' });
  }
  await writeFile(join(appDir, 'preload.cjs'), preloadSource, { flag: 'wx' });
  await writeFile(join(appDir, 'main.mjs'), mainSource, { flag: 'wx' });
  const toolURLs = [
    import.meta.url, './m3-chromium-consumer.mjs',
    './support/package-archive.mjs', './support/m1-javascript-closure.mjs',
    './support/m3-runtime-fixture-producer.mjs', './m2-candidate/raw-document-cases.mjs',
    './support/m3-semantic-runtime-fixtures.mjs', './support/m3-semantic-runtime-executor.mjs',
    './support/m3-descriptor-runtime-fixtures.mjs',
    './support/m3-invocation-runtime-fixtures.mjs',
    ...invocationHelperNames.map(name => `./support/${name}`),
    './m2-candidate/object-descriptor-cases.mjs',
    ...descriptorHelperNames.map(name => `./support/${name}`),
    './support/m3-cdp.mjs', './support/m3-runtime-executor.mjs', './support/m3-runtime-materializers.mjs', import.meta.resolve('tar'), import.meta.resolve('typescript-minimum'),
  ].map(path => new URL(path, import.meta.url));
  const toolIdentity = [];
  for (const url of toolURLs) toolIdentity.push({ url: url.href, sha256: sha256(await readFile(url)) });
  const executableHash = sha256(await readFile(input.absoluteelectronExecutable));
  const env = electronEnvironment(out);
  const args = ['--no-first-run', '--no-proxy-server', '--disable-component-update', join(appDir, 'main.mjs')];
  await writeFile(join(out, 'expected.json'), json(fixtures.map(({ id, expected }) => ({ id, result: expected }))), { flag: 'wx' });
  await writeFile(join(out, 'fixtures.json'), json(fixtures), { flag: 'wx' });
  await writeFile(join(out, 'semantic-fixtures.json'), json(semanticFixtures), { flag: 'wx' });
  await writeFile(join(out, 'descriptor-fixtures.json'), json(descriptorFixtures), { flag: 'wx' });
  await writeFile(join(out, 'invocation-fixtures.json'), json(invocationFixtures), { flag: 'wx' });
  await writeFile(join(out, 'invocation-expected.json'), json(invocationExpected), { flag: 'wx' });
  await writeFile(join(out, 'descriptor-expected.json'), json(descriptorFixtures.map(
    ({ id, category, applicability, expected }) =>
      ({ id, category, mode: 'object', applicability, result: expected }))), { flag: 'wx' });
  await writeFile(join(out, 'semantic-expected.json'), json(semanticFixtures.flatMap(
    ({ id, category, expected }) => ['object', 'raw'].map(mode =>
      ({ id, category, mode, result: expected })))), { flag: 'wx' });
  const metadata = {
    input, status: 'prepared', claim: 'not-claimed', scope: 'ElectronDesktopSmoke/PARTIAL raw123 + semantic818/object+raw + descriptor68/object in main and renderer; excludes all-vectors, P500 and runtime conformance', promotion: 'none; not the six-runtime matrix',
    descriptorFixtureSha256: sha256(json(descriptorFixtures)),
    invocationFixtureSha256: sha256(json(invocationFixtures)),
    invocationExpectedSha256: sha256(json(invocationExpected)),
    invocationCoverage: 'main62; renderer61; explicit unmet dense-offset-buffer Node Buffer ID',
    semanticFixtureSha256: sha256(json(semanticFixtures)),
    runtimeRoot, installedRoot, closure, parent: { versions: process.versions, os: platform(), arch: arch() },
    archiveSha256: archive.sha256, integrity: archive.integrity, inventory: archive.inventory, fixtureSha256: sha256(json(fixtures)),
    toolIdentity, executableHash, appTools: { main: sha256(mainSource), preload: sha256(preloadSource) },
    routes: [...routes].map(([path, row]) => ({ path, type: row.type, sha256: sha256(row.bytes) })),
    environmentAllowlist: Object.keys(env).sort(), env,
  };
  await writeFile(join(out, 'metadata.json'), json(metadata), { flag: 'wx' });
  let server, child, exited, log, observations;
  try {
    server = createServer(routeHandler(routes));
    server.requestTimeout = 10_000; server.headersTimeout = 10_000;
    await bounded(new Promise((resolve, reject) => { server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve); }), 10_000, 'HTTP startup');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const config = { ...input, origin, runtimeRoot, installedRoot, userData: join(out, 'userData'), sessionData: join(out, 'sessionData') };
    await writeFile(join(appDir, 'config.json'), json(config), { flag: 'wx' });
    await writeFile(join(out, 'launch.json'), json({ executable: input.absoluteelectronExecutable, args, env, cwd: appDir, config }), { flag: 'wx' });
    log = await open(join(out, 'electron.log'), 'wx');
    child = spawn(input.absoluteelectronExecutable, args, { env, cwd: appDir, detached: true, stdio: ['ignore', log.fd, log.fd] });
    exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    exited.catch(() => {});
    await writeFile(join(out, 'process.json'), json({ pid: child.pid, ownedPosixGroup: child.pid }), { flag: 'wx' });
    await bounded((async () => {
      for (;;) {
        try { const ready = JSON.parse(await readFile(join(out, 'ready.json'), 'utf8')); assert.equal(ready.pid, child.pid); return; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        assert.ok(child.exitCode === null && child.signalCode === null, 'Electron exited before readiness');
        await Promise.race([delay(50), exited.then(() => { throw new Error('Electron exited before readiness'); })]);
      }
    })(), 30_000, 'Electron startup');
    const exit = await bounded(exited, 180_000, 'Electron main and renderer execution');
    await writeFile(join(out, 'exit.json'), json(exit), { flag: 'wx' });
    assert.deepEqual(exit, { code: 0, signal: null }, 'Electron execution failed; inspect retained log and failure.json');
    observations = { main: JSON.parse(await readFile(join(out, 'main.json'), 'utf8')), renderer: JSON.parse(await readFile(join(out, 'renderer.json'), 'utf8')) };
    verifyElectronResults(observations, fixtures, config, semanticFixtures, descriptorFixtures, invocationFixtures, invocationExpected); assert.equal(observations.main.pid, child.pid);
  } finally {
    try { await stopOwned(child, exited); }
    finally {
      try { if (server) { server.closeAllConnections();
        await bounded(new Promise((resolve, reject) => server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve())), 5_000, 'HTTP teardown'); } }
      finally { await log?.close(); }
    }
  }
  await verifyInstalled(packageRoot, archive.files);
  const after = await archiveIdentity(input);
  assert.equal(after.sha256, archive.sha256); assert.equal(sha256(await readFile(input.absoluteelectronExecutable)), executableHash);
  assert.equal(after.integrity, archive.integrity);
  const result = { status: 'verified', claim: 'not-claimed', scope: metadata.scope, promotion: metadata.promotion, review: 'pending independent review', exactSourceSHA: input.exactSourceSHA, archiveSha256: after.sha256, integrity: after.integrity, expectedElectronVersion: input.expectedElectronVersion, executableHash, teardown: { ownedProcessGroupGone: true, serverClosed: true }, observations };
  await writeFile(join(out, 'result.pending.json'), json(result), { flag: 'wx' });
  await rename(join(out, 'result.pending.json'), join(out, 'result.json'));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 3, 'supply one absolute JSON configuration path');
  assert.ok(isAbsolute(process.argv[2]));
  await runElectronConsumer(JSON.parse(await readFile(process.argv[2], 'utf8')));
}
