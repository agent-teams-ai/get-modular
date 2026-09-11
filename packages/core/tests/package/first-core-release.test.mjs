import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { findRepoRoot } from '../qualification-support/support/load-repo-json.mjs';

const { publishFirstCoreRelease } = await import(
  pathToFileURL(join(findRepoRoot(), 'architecture/tooling/first-core-release.mjs')).href
);

const ARCHIVE = Buffer.from('retained first-core archive fixture\n');
const VERSION = '0.1.0';
const SUCCESS = [
  'readVersion', 'readTags', 'save:upload-intent', 'upload',
  'readVersion', 'download', 'consumer', 'readTags',
  'save:promotion-intent', 'setTag', 'readTags', 'save:promotion-intent',
];

function fixture({ existing = null, intended = '0.0.0', provisional = null } = {}) {
  const identity = {
    name: '@get-modular/core', version: VERSION, archive: Buffer.from(ARCHIVE),
    sha256: createHash('sha256').update(ARCHIVE).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(ARCHIVE).digest('base64')}`,
    provisionalTag: 'first-core-0-1-0', intendedTag: 'latest',
    previousTags: { provisional, intended },
  };
  const calls = [];
  const saved = [];
  const store = { bytes: existing === null ? null : Buffer.from(existing), tags: {} };
  if (intended !== null) store.tags[identity.intendedTag] = intended;
  if (provisional !== null) store.tags[identity.provisionalTag] = provisional;
  const assertTarget = (request) => {
    assert.equal(request.name, identity.name);
    assert.equal(request.version, VERSION);
  };
  const checkpoint = {
    async save(value) {
      calls.push(`save:${value.stage}`);
      await Promise.resolve();
      saved.push(structuredClone(value));
    },
  };
  const effects = {
    async readVersion(request) {
      calls.push('readVersion');
      assertTarget(request);
      return store.bytes === null ? null : {
        name: identity.name, version: VERSION, integrity: identity.integrity,
        tarball: 'fixture:retained-archive',
      };
    },
    async download(request) {
      calls.push('download');
      assertTarget(request);
      assert.equal(request.tarball, 'fixture:retained-archive');
      return Buffer.from(store.bytes);
    },
    async upload(request) {
      calls.push('upload');
      assertTarget(request);
      assert.equal(saved.at(-1)?.stage, 'upload-intent');
      assert.equal(saved.at(-1)?.uploadAttempted, true);
      assert.equal(request.tag, identity.provisionalTag);
      assert.deepEqual(request.archive, ARCHIVE);
      assert.equal(request.sha256, identity.sha256);
      assert.equal(request.integrity, identity.integrity);
      store.bytes = Buffer.from(request.archive);
      store.tags[request.tag] = VERSION;
    },
    async consumer(request) {
      calls.push('consumer');
      assertTarget(request);
      assert.deepEqual(request.archive, ARCHIVE);
      return true;
    },
    async readTags(request) {
      calls.push('readTags');
      assert.equal(request.name, identity.name);
      return { ...store.tags };
    },
    async setTag(request) {
      calls.push('setTag');
      assertTarget(request);
      assert.equal(saved.at(-1)?.stage, 'promotion-intent');
      assert.equal(saved.at(-1)?.promotionAttempted, true);
      assert.ok(saved.at(-1).evidence.some((item) => item.operation === 'registry-identity' && item.matches));
      assert.ok(saved.at(-1).evidence.some((item) => item.operation === 'consumer' && item.ok));
      assert.equal(request.tag, identity.intendedTag);
      store.tags[request.tag] = VERSION;
    },
  };
  return {
    identity, effects, checkpoint, calls, saved, store,
    run: (resume) => publishFirstCoreRelease({
      identity, effects, checkpoint: { ...checkpoint, resume },
    }),
  };
}

const count = (f, operation) => f.calls.filter((value) => value === operation).length;
const expectCalls = (f, expected) => {
  assert.deepEqual(f.calls, expected);
  assert.ok(count(f, 'upload') <= 1);
  assert.ok(count(f, 'setTag') <= 1);
};

test('ADR0019: lost upload response reconciles matching downloaded bytes', async () => {
  const f = fixture();
  const upload = f.effects.upload;
  f.effects.upload = async (request) => {
    await upload(request);
    throw new Error('lost upload response');
  };
  const result = await f.run();
  assert.equal(result.status, 'completed');
  expectCalls(f, SUCCESS);
  assert.ok(result.evidence.some((item) => item.operation === 'upload' && item.outcome === 'unknown'));
  assert.ok(result.evidence.some((item) => item.operation === 'registry-identity'
    && item.sha256 === f.identity.sha256 && item.integrity === f.identity.integrity && item.matches));
  assert.equal(f.saved[0].uploadAttempted, true);
  assert.equal(f.saved[0].promotionAttempted, false);
  assert.equal(f.saved[1].promotionAttempted, true);
});

test('ADR0019: conflicting bytes fail terminally before consumer or promotion', async () => {
  for (const afterUpload of [false, true]) {
    const f = fixture({ existing: afterUpload ? null : Buffer.from('conflicting bytes') });
    if (afterUpload) {
      const upload = f.effects.upload;
      f.effects.upload = async (request) => {
        await upload(request);
        f.store.bytes = Buffer.from('conflicting bytes');
        throw new Error('lost upload response');
      };
    }
    const result = await f.run();
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'registry-archive-mismatch');
    const expected = afterUpload ? SUCCESS.slice(0, 6) : ['readVersion', 'download'];
    expectCalls(f, expected);
    assert.equal(count(f, 'consumer'), 0);
    assert.equal(count(f, 'setTag'), 0);
    assert.equal(result.evidence.at(-1).matches, false);
    const resumed = await f.run(result.checkpoint);
    assert.equal(resumed.reason, 'checkpoint-terminal-failure');
    expectCalls(f, expected);
  }
});

test('ADR0019: delayed read-back is bounded and absent resume cannot upload again', async () => {
  for (const delay of [2, 3]) {
    const f = fixture();
    const readVersion = f.effects.readVersion;
    let remaining = delay;
    f.effects.readVersion = async (request) => {
      if (f.calls.includes('upload') && remaining > 0) {
        remaining -= 1;
        f.calls.push('readVersion');
        return null;
      }
      return readVersion(request);
    };
    const result = await f.run();
    assert.equal(count(f, 'readVersion'), 4);
    if (delay === 2) {
      assert.equal(result.status, 'completed');
      expectCalls(f, [...SUCCESS.slice(0, 4), 'readVersion', 'readVersion', ...SUCCESS.slice(4)]);
    } else {
      assert.equal(result.status, 'incomplete');
      assert.equal(result.reason, 'version-readback-unconfirmed');
      const expected = [...SUCCESS.slice(0, 4), 'readVersion', 'readVersion', 'readVersion'];
      expectCalls(f, expected);
      f.store.bytes = null;
      const resumed = await f.run(result.checkpoint);
      assert.equal(resumed.status, 'incomplete');
      expectCalls(f, [...expected, 'readVersion', 'readVersion', 'readVersion']);
      assert.equal(count(f, 'consumer'), 0);
      assert.equal(count(f, 'setTag'), 0);
    }
  }
});

test('ADR0019: a failed downloaded consumer blocks promotion', async () => {
  for (const throws of [false, true]) {
    const f = fixture();
    const consumer = f.effects.consumer;
    f.effects.consumer = async (request) => {
      await consumer(request);
      if (throws) throw new Error('consumer failed');
      return false;
    };
    const result = await f.run();
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'consumer-failed');
    expectCalls(f, SUCCESS.slice(0, 7));
    assert.equal(f.store.tags.latest, '0.0.0');
    assert.equal(f.saved.length, 1);
    assert.equal(result.checkpoint.promotionAttempted, false);
  }
});

test('ADR0019: lost promotion response only reconciles, including across resume', async () => {
  for (const applied of [true, false]) {
    const f = fixture();
    const setTag = f.effects.setTag;
    f.effects.setTag = async (request) => {
      await setTag(request);
      if (!applied) f.store.tags.latest = '0.0.0';
      throw new Error('lost promotion response');
    };
    const result = await f.run();
    assert.equal(result.status, applied ? 'completed' : 'incomplete');
    const expected = applied ? SUCCESS : [...SUCCESS.slice(0, -1), 'readTags', 'readTags'];
    expectCalls(f, expected);
    assert.ok(result.evidence.some((item) => item.operation === 'setTag' && item.outcome === 'unknown'));
    if (!applied) {
      assert.equal(result.reason, 'tag-readback-unconfirmed');
      const resumed = await f.run(result.checkpoint);
      assert.equal(resumed.status, 'incomplete');
      const resumedCalls = ['readVersion', 'download', 'readTags', 'consumer', 'readTags', 'readTags', 'readTags'];
      expectCalls(f, [...expected, ...resumedCalls]);
      f.store.tags.latest = VERSION;
      const reconciled = await f.run(resumed.checkpoint);
      assert.equal(reconciled.status, 'completed');
      expectCalls(f, [...expected, ...resumedCalls, 'readVersion', 'download', 'readTags', 'save:observing', 'consumer', 'readTags']);
    }
  }
});

test('ADR0019: an existing matching version and correct intended tag are idempotent', async () => {
  const f = fixture({ existing: ARCHIVE });
  f.store.tags.latest = VERSION;
  const result = await f.run();
  assert.equal(result.status, 'completed');
  const expected = ['readVersion', 'download', 'readTags', 'save:observing', 'consumer', 'readTags'];
  expectCalls(f, expected);
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0].intendedObserved, true);
  assert.equal(result.checkpoint.uploadAttempted, false);
  assert.equal(result.checkpoint.promotionAttempted, false);
  const resumed = await f.run(result.checkpoint);
  assert.equal(resumed.status, 'completed');
  expectCalls(f, [...expected, ...expected.filter(value => value !== 'save:observing')]);
});

test('ADR0019: absent previous latest stays explicit null through promotion', async () => {
  const f = fixture({ intended: null });
  f.store.tags.latest = undefined;
  const result = await f.run();
  assert.equal(result.status, 'completed');
  expectCalls(f, SUCCESS);
  for (const record of [...f.saved, result.checkpoint]) {
    assert.deepEqual(record.previousTags, { provisional: null, intended: null });
  }
  assert.equal(f.store.tags.latest, VERSION);
  assert.equal(f.store.tags[f.identity.provisionalTag], VERSION);
});

test('ADR0019: concurrent changes to either selected tag stop without overwriting', async () => {
  for (const role of ['provisional', 'intended']) {
    for (const phase of ['initial', 'before-promotion']) {
      const f = fixture();
      const tag = f.identity[`${role}Tag`];
      if (phase === 'initial') {
        f.store.tags[tag] = '9.9.9';
      } else {
        const consumer = f.effects.consumer;
        f.effects.consumer = async (request) => {
          const passed = await consumer(request);
          f.store.tags[tag] = '9.9.9';
          return passed;
        };
      }
      const result = await f.run();
      assert.equal(result.status, 'failed');
      assert.equal(result.reason, 'concurrent-tag-change');
      expectCalls(f, phase === 'initial' ? SUCCESS.slice(0, 2) : SUCCESS.slice(0, 8));
      assert.equal(f.store.tags[tag], '9.9.9');
      assert.equal(count(f, 'setTag'), 0);
    }
  }
});

test('Retained hashes and registry metadata must match the bound identity', async () => {
  for (const field of ['sha256', 'integrity']) {
    const f = fixture();
    f.identity[field] = field === 'sha256' ? '0'.repeat(64) : 'sha512-wrong';
    const result = await f.run();
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'retained-archive-mismatch');
    expectCalls(f, []);
  }
  const f = fixture({ existing: ARCHIVE });
  const readVersion = f.effects.readVersion;
  f.effects.readVersion = async (request) => ({
    ...await readVersion(request), integrity: 'sha512-wrong',
  });
  const result = await f.run();
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'registry-metadata-conflict');
  expectCalls(f, ['readVersion']);
});

test('Uncertain initial reads and non-durable intents never authorize a mutation', async () => {
  const unreadable = fixture();
  unreadable.effects.readVersion = async () => {
    unreadable.calls.push('readVersion');
    throw new Error('transient registry failure');
  };
  const unknown = await unreadable.run();
  assert.equal(unknown.status, 'incomplete');
  expectCalls(unreadable, ['readVersion', 'readVersion', 'readVersion']);

  for (const stage of ['upload-intent', 'promotion-intent']) {
    const f = fixture();
    const save = f.checkpoint.save;
    f.checkpoint.save = async (value) => {
      if (value.stage !== stage) return save(value);
      f.calls.push(`save:${value.stage}`);
      throw new Error('durable store unavailable');
    };
    const result = await f.run();
    assert.equal(result.status, 'incomplete');
    assert.equal(result.reason, 'checkpoint-not-durable');
    const expected = SUCCESS.slice(0, stage === 'upload-intent' ? 3 : 9);
    expectCalls(f, expected);
    assert.equal(count(f, 'setTag'), 0);
    const mismatched = structuredClone(result.checkpoint);
    mismatched.identity.version = '0.2.0';
    const rejected = await f.run(mismatched);
    assert.equal(rejected.reason, 'checkpoint-identity-mismatch');
    expectCalls(f, expected);
  }
});

 test('ADR0019: an observed intended target cannot regress, including on resume', async () => {
  for (const previous of [null, '0.0.0']) {
    for (const resume of [false, true]) {
      const f = fixture({ existing: ARCHIVE, intended: previous });
      f.store.tags.latest = VERSION;
      const consumer = f.effects.consumer;
      f.effects.consumer = async request => {
        const result = await consumer(request);
        if (!resume) f.store.tags.latest = previous;
        return result;
      };
      let result = await f.run();
      if (resume) {
        assert.equal(result.status, 'completed');
        f.store.tags.latest = previous;
        result = await f.run(f.saved[0]);
      }
      assert.equal(result.status, 'failed');
      assert.equal(result.reason, 'concurrent-tag-change');
      assert.equal(result.checkpoint.intendedObserved, true);
      assert.equal(count(f, 'upload'), 0);
      assert.equal(count(f, 'setTag'), 0);
    }
  }
});
