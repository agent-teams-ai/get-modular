// Private diagnostic runner: node m3-chromium-consumer.mjs /absolute/input.json
// Input fields: chromiumExecutable, archivePath, expectedSha256, integrity,
// exactSourceSHA, uniqueOutputDir, expectedBrowserVersion (CDP product string).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, rename, rm, open } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { arch, platform } from 'node:os';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readPackageArchive } from './support/package-archive.mjs';
import { auditM1JavaScriptClosure } from './support/m1-javascript-closure.mjs';
import { produceRuntimeFixtures } from './support/m3-runtime-fixture-producer.mjs';
import { produceSemanticRuntimeFixtures } from './support/m3-semantic-runtime-fixtures.mjs';
import { bounded, connectCDP } from './support/m3-cdp.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const keys = (value, expected) => assert.deepEqual(Object.keys(value), expected);

export function validateInput(input) {
  assert.ok(input && Object.getPrototypeOf(input) === Object.prototype);
  assert.deepEqual(Object.keys(input).sort(), [
    'archivePath', 'chromiumExecutable', 'exactSourceSHA', 'expectedBrowserVersion',
    'expectedSha256', 'integrity', 'uniqueOutputDir',
  ].sort());
  for (const name of ['archivePath', 'chromiumExecutable', 'uniqueOutputDir']) {
    assert.equal(typeof input[name], 'string');
    assert.ok(isAbsolute(input[name]) && !input[name].includes('\0'), name);
  }
  assert.match(input.exactSourceSHA, /^[a-f0-9]{40}$/, 'full source commit required');
  assert.match(input.expectedSha256, /^[a-f0-9]{64}$/);
  assert.match(input.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
  assert.match(input.expectedBrowserVersion, /^(?:HeadlessChrome|Chrome)\/\d+\.\d+\.\d+\.\d+$/);
  return Object.freeze({ ...input });
}

export function publicArchiveRoot(files) {
  const manifest = JSON.parse(files.get('package.json')?.toString('utf8'));
  assert.equal(manifest.name, '@get-modular/core');
  assert.equal(manifest.type, 'module');
  keys(manifest.exports, ['.']);
  const root = manifest.exports['.'];
  keys(root, ['import', 'default']);
  keys(root.import, ['types', 'default']);
  assert.equal(root.default, root.import.default);
  for (const [target, suffix] of [
    [root.default, '.js'], [root.import.types, '.d.ts'],
  ]) {
    assert.equal(typeof target, 'string');
    assert.ok(target.startsWith('./') && target.endsWith(suffix));
    assert.ok(target.slice(2).split('/').every(part =>
      /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part) && !part.endsWith('.')));
    assert.ok(files.has(target.slice(2)), 'export target missing');
  }
  for (const name of [
    'main', 'module', 'types', 'typings', 'typesVersions', 'browser', 'scripts',
  ]) assert.ok(!Object.hasOwn(manifest, name), `forbidden manifest field: ${name}`);
  return `/archive/${root.default.slice(2)}`;
}

export function verifyRecords(records, fixtures) {
  assert.equal(fixtures.length, 123);
  assert.equal(new Set(fixtures.map(row => row.id)).size, 123);
  assert.ok(Array.isArray(records));
  assert.equal(records.length, 123, 'no skipped observations');
  assert.deepEqual(records.map(row => row.id), fixtures.map(row => row.id));
  for (let index = 0; index < fixtures.length; index += 1) {
    const row = records[index];
    keys(row, ['id', 'result', 'observations']);
    assert.deepEqual(row.result, fixtures[index].expected, `${row.id}: full expected result`);
    const observation = row.observations;
    keys(observation, [
      'containers', 'mutationRejections', 'mutatedBuffers', 'mutatedBytes',
      'callerWrapperMutated',
    ]);
    for (const name of ['containers', 'mutationRejections', 'mutatedBuffers', 'mutatedBytes']) {
      assert.ok(Number.isSafeInteger(observation[name]) && observation[name] >= 0);
    }
    assert.ok(observation.containers > 0);
    assert.ok(observation.mutationRejections >= observation.containers * 3);
    assert.equal(observation.callerWrapperMutated, true);
  }
}

export function verifySemanticRecords(records, fixtures) {
  assert.ok(Array.isArray(fixtures));
  assert.equal(fixtures.length, 818, 'complete semantic fixture inventory');
  assert.equal(new Set(fixtures.map(row => row.id)).size, 818, 'unique semantic IDs');
  assert.ok(Array.isArray(records), 'semantic observations required');
  assert.equal(records.length, 1636, 'no skipped semantic observations');
  const measure = value => {
    if (value === null || typeof value !== 'object') {
      return { containers: 0, mutationRejections: 0 };
    }
    const total = {
      containers: 1, mutationRejections: 3 + 2 * Reflect.ownKeys(value).length,
    };
    for (const child of Object.values(value)) {
      const nested = measure(child);
      total.containers += nested.containers;
      total.mutationRejections += nested.mutationRejections;
    }
    return total;
  };
  let index = 0;
  for (const fixture of fixtures) {
    assert.equal(typeof fixture.id, 'string');
    assert.ok(fixture.id.length > 0);
    const resultShape = measure(fixture.expected);
    const mutatedObjects = measure(fixture.input).containers + 2;
    for (const mode of ['object', 'raw']) {
      const row = records[index++];
      keys(row, ['id', 'category', 'mode', 'result', 'observations']);
      assert.equal(row.id, fixture.id, 'semantic ID order');
      assert.equal(row.category, fixture.category, 'semantic category');
      assert.equal(row.mode, mode, 'semantic mode order');
      assert.deepEqual(row.result, fixture.expected,
        `${fixture.id}/${mode}: full expected result`);
      keys(row.observations, [
        'containers', 'mutationRejections', 'mutatedObjects',
        'mutatedBuffers', 'mutatedBytes', 'callerWrapperMutated',
      ]);
      assert.deepEqual(row.observations, {
        ...resultShape,
        mutatedObjects,
        mutatedBuffers: fixture.input.declarations.length + 1,
        mutatedBytes: fixture.rawEligibility.aggregateBytes,
        callerWrapperMutated: true,
      }, `${fixture.id}/${mode}: local observations`);
    }
  }
}

export function routeHandler(inputRoutes) {
  // Copy once; callers cannot mutate served bytes through their original map.
  const routes = new Map([...inputRoutes].map(([path, row]) =>
    [path, { type: row.type, bytes: Buffer.from(row.bytes) }]));
  return (request, response) => {
    const address = request.socket.localPort;
    const allowed = request.method === 'GET' &&
      request.headers.host === `127.0.0.1:${address}` &&
      typeof request.url === 'string' &&
      /^\/[A-Za-z0-9_./-]*$/.test(request.url) &&
      !request.url.split('/').some(part => part === '.' || part === '..');
    const row = allowed ? routes.get(request.url) : undefined;
    response.writeHead(row ? 200 : 404, {
      'Content-Type': row?.type ?? 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(row?.bytes ?? 'unavailable');
  };
}

const realmSource = `
import { executeRuntimeFixtures } from './m3-runtime-executor.mjs';
import { executeSemanticRuntimeFixtures } from './m3-semantic-runtime-executor.mjs';
export async function run(rootURL, realm) {
  if (!isSecureContext || !crossOriginIsolated ||
      typeof SharedArrayBuffer !== 'function' || !crypto.subtle) {
    throw new Error('required secure context / SAB unavailable');
  }
  const root = new URL(rootURL);
  if (root.origin !== location.origin || !root.pathname.startsWith('/archive/') ||
      root.search || root.hash) throw new Error('invalid explicit root URL');
  if ((realm === 'window') !== (typeof document === 'object')) {
    throw new Error('incorrect executing realm');
  }
  const response = await fetch('/dev/fixtures.json');
  if (!response.ok) throw new Error('fixtures unavailable');
  const fixtures = await response.json();
  const semanticResponse = await fetch('/dev/semantic-fixtures.json');
  if (!semanticResponse.ok) throw new Error('semantic fixtures unavailable');
  const semanticFixtures = await semanticResponse.json();
  const namespace = await import(root.href);
  const records = await executeRuntimeFixtures(namespace, fixtures);
  const semanticRecords = await executeSemanticRuntimeFixtures(namespace, semanticFixtures);
  return { realm, secureContext: isSecureContext, crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer === 'function',
    userAgent: navigator.userAgent, records, semanticRecords };
}
`;
const workerSource = `
import { run } from './realm.mjs';
self.onmessage = async event => {
  self.onmessage = null;
  try {
    self.postMessage({ value: await run(event.data.rootURL, 'dedicated-module-worker') });
  } catch (error) {
    self.postMessage({ error: String(error?.stack ?? error) });
  } finally {
    self.close();
  }
};
`;

async function archiveIdentity(input) {
  return readPackageArchive(await readFile(input.archivePath), {
    sha256: input.expectedSha256, integrity: input.integrity,
  });
}

async function stopProcess(child, exited) {
  if (!child?.pid) return;
  const kill = signal => {
    try { process.kill(-child.pid, signal); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  // The detached process group belongs exclusively to this invocation.
  kill('SIGTERM');
  try { await bounded(exited, 5_000, 'Chromium exit'); }
  catch { kill('SIGKILL'); await bounded(exited, 5_000, 'Chromium kill'); }
  kill('SIGKILL');
}

export async function runChromiumConsumer(rawInput) {
  const input = validateInput(rawInput);
  assert.equal(Number(process.versions.node.split('.')[0]), 24, 'Node 24 required');
  assert.ok(['linux', 'darwin'].includes(platform()), 'POSIX process groups required');
  const archive = await archiveIdentity(input);
  const publicRoot = publicArchiveRoot(archive.files);
  const closure = auditM1JavaScriptClosure(archive.files, 'm2-generated');
  const fixtures = produceRuntimeFixtures();
  const semanticFixtures = [...produceSemanticRuntimeFixtures()];
  const out = input.uniqueOutputDir;
  await mkdir(out, { mode: 0o700 }); // Existing output is never reused.
  const profile = join(out, 'profile');
  let server, child, exited, cdp, log;
  let observations;
  try {
    await mkdir(profile, { mode: 0o700 });
    await mkdir(join(out, 'home'), { mode: 0o700 });
    await mkdir(join(out, 'tmp'), { mode: 0o700 });
    const routes = new Map();
    const add = (path, bytes, type = 'text/javascript; charset=utf-8') =>
      routes.set(path, { bytes: Buffer.from(bytes), type });
    for (const path of closure.modules) add(`/archive/${path}`, archive.files.get(path));
    add('/dev/fixtures.json', json(fixtures), 'application/json');
    add('/dev/semantic-fixtures.json', json(semanticFixtures), 'application/json');
    add('/dev/realm.mjs', realmSource);
    add('/dev/worker.mjs', workerSource);
    add('/index.html', '<!doctype html><meta charset="utf-8"><title>M3 diagnostic</title>',
      'text/html; charset=utf-8');
    for (const name of ['m3-runtime-materializers.mjs', 'm3-runtime-executor.mjs', 'm3-semantic-runtime-executor.mjs']) {
      add(`/dev/${name}`, await readFile(new URL(`./support/${name}`, import.meta.url)));
    }
    await writeFile(join(out, 'semantic-fixtures.json'), json(semanticFixtures), { flag: 'wx' });
    await writeFile(join(out, 'semantic-expected.json'), json(semanticFixtures.flatMap(
      ({ id, category, expected }) => ['object', 'raw'].map(mode =>
        ({ id, category, mode, result: expected })))), { flag: 'wx' });
    await writeFile(join(out, 'fixtures.json'), json(fixtures), { flag: 'wx' });
    await writeFile(join(out, 'expected.json'),
      json(fixtures.map(({ id, expected }) => ({ id, result: expected }))), { flag: 'wx' });
    await mkdir(join(out, 'dev'));
    for (const [path, row] of routes) {
      if (path.startsWith('/dev/')) {
        await writeFile(join(out, path.slice(1)), row.bytes, { flag: 'wx' });
      }
    }
    const runnerFiles = [
      new URL(import.meta.url), new URL('./support/m3-cdp.mjs', import.meta.url),
      new URL('./support/m3-runtime-fixture-producer.mjs', import.meta.url),
      new URL('./support/m3-semantic-runtime-fixtures.mjs', import.meta.url),
    ];
    const runnerIdentity = [];
    for (const url of runnerFiles) {
      runnerIdentity.push({ url: url.href, sha256: sha256(await readFile(url)) });
    }
    const metadata = {
      input, status: 'prepared', claim: 'not-claimed', scope: 'PARTIAL raw123 + semantic818/object+raw; excludes all-vectors, P500, descriptors and runtime conformance',
      review: 'pending independent review', purpose: 'diagnostic',
      promotion: 'none; not the six-runtime matrix',
      node: process.version, os: platform(), arch: arch(), publicRoot,
      archiveSha256: archive.sha256, integrity: archive.integrity,
      inventory: archive.inventory, fixtureSha256: sha256(json(fixtures)),
      semanticFixtureSha256: sha256(json(semanticFixtures)),
      runnerIdentity,
      routes: [...routes].map(([path, row]) => ({ path, sha256: sha256(row.bytes) })),
    };
    await writeFile(join(out, 'metadata.json'), json(metadata), { flag: 'wx' });
    server = createServer(routeHandler(routes));
    server.requestTimeout = 10_000;
    server.headersTimeout = 10_000;
    await bounded(new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    }), 10_000, 'HTTP startup');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const args = [
      '--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-component-update', '--disable-sync',
      '--disable-extensions', '--disable-default-apps', '--no-proxy-server',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', 'about:blank',
    ];
    const env = { HOME: join(out, 'home'), TMPDIR: join(out, 'tmp'), LANG: 'C.UTF-8' };
    await writeFile(join(out, 'launch.json'), json({ executable: input.chromiumExecutable, args, env, origin }),
      { flag: 'wx' });
    log = await open(join(out, 'chromium.log'), 'wx');
    child = spawn(input.chromiumExecutable, args, {
      env, cwd: out, detached: true, stdio: ['ignore', log.fd, log.fd],
    });
    exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    exited.catch(() => {});
    let endpoint;
    const deadline = Date.now() + 30_000;
    while (!endpoint && Date.now() < deadline) {
      assert.ok(child.exitCode === null && child.signalCode === null, 'Chromium exited during startup');
      try {
        const lines = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n');
        assert.equal(lines.length, 2);
        assert.match(lines[0], /^[1-9]\d{0,4}$/);
        assert.ok(Number(lines[0]) <= 65535);
        assert.match(lines[1], /^\/devtools\/browser\/[A-Za-z0-9-]+$/);
        endpoint = `ws://127.0.0.1:${lines[0]}${lines[1]}`;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await Promise.race([delay(100), exited.then(() => { throw new Error('Chromium exited'); })]);
      }
    }
    assert.ok(endpoint, 'Chromium startup timeout');
    cdp = await connectCDP(endpoint);
    const version = await cdp.call('Browser.getVersion');
    await writeFile(join(out, 'browser-version.json'), json(version), { flag: 'wx' });
    assert.equal(version.product, input.expectedBrowserVersion, 'exact browser version');
    const { targetId } = await cdp.call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.call('Target.attachToTarget', { targetId, flatten: true });
    await cdp.call('Page.enable', {}, sessionId);
    const loaded = cdp.event('Page.loadEventFired', sessionId);
    const navigation = await cdp.call('Page.navigate', { url: `${origin}/index.html` }, sessionId);
    assert.ok(!navigation.errorText, navigation.errorText);
    await loaded;
    const evaluate = async expression => {
      const result = await cdp.call('Runtime.evaluate', {
        expression, awaitPromise: true, returnByValue: true,
      }, sessionId, 120_000);
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      assert.ok(Object.hasOwn(result.result, 'value'), 'missing complete CDP value');
      return result.result.value;
    };
    const rootURL = JSON.stringify(`${origin}${publicRoot}`);
    const windowResult = await evaluate(`import('/dev/realm.mjs').then(m => m.run(${rootURL}, 'window'))`);
    await writeFile(join(out, 'window.json'), json(windowResult), { flag: 'wx' });
    verifyRecords(windowResult.records, fixtures);
    verifySemanticRecords(windowResult.semanticRecords, semanticFixtures);
    const workerResult = await evaluate(`new Promise((resolve, reject) => {
      const worker = new Worker('/dev/worker.mjs', { type: 'module' });
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('worker timeout')); }, 110000);
      const finish = () => { clearTimeout(timer); worker.terminate(); };
      worker.onmessage = event => { finish(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.value); };
      worker.onerror = event => { finish(); reject(new Error(event.message)); };
      worker.onmessageerror = () => { finish(); reject(new Error('worker transport')); };
      worker.postMessage({ rootURL: ${rootURL} });
    })`);
    await writeFile(join(out, 'worker.json'), json(workerResult), { flag: 'wx' });
    verifyRecords(workerResult.records, fixtures);
    verifySemanticRecords(workerResult.semanticRecords, semanticFixtures);
    observations = { version, window: windowResult, worker: workerResult };
    for (const [name, realm] of [['window', 'window'], ['worker', 'dedicated-module-worker']]) {
      assert.equal(observations[name].realm, realm);
      for (const flag of ['secureContext', 'crossOriginIsolated', 'sharedArrayBuffer']) {
        assert.equal(observations[name][flag], true);
      }
    }
  } finally {
    cdp?.close();
    try { await stopProcess(child, exited); }
    finally {
      if (server) {
        server.closeAllConnections();
        await bounded(new Promise((resolve, reject) => server.close(error =>
          error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve())),
        5_000, 'HTTP teardown');
      }
      await log?.close();
    }
  }
  const after = await archiveIdentity(input);
  assert.equal(after.sha256, archive.sha256, 'unchanged archive after teardown');
  await rm(profile, { recursive: true, force: true });
  const result = { status: 'verified', claim: 'not-claimed', scope: 'PARTIAL raw123 + semantic818/object+raw; excludes all-vectors, P500, descriptors and runtime conformance',
    review: 'pending independent review', promotion: 'none', exactSourceSHA: input.exactSourceSHA,
    archiveSha256: after.sha256, integrity: after.integrity, os: platform(), arch: arch(), observations };
  await writeFile(join(out, 'result.pending.json'), json(result), { flag: 'wx' });
  await rename(join(out, 'result.pending.json'), join(out, 'result.json'));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 3, 'supply one absolute JSON input file');
  assert.ok(isAbsolute(process.argv[2]));
  await runChromiumConsumer(JSON.parse(await readFile(process.argv[2], 'utf8')));
}
