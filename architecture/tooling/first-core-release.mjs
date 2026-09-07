import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

const READ_ATTEMPTS = 3;

class ReleaseStop extends Error {
  constructor(status, reason) {
    super(reason);
    this.status = status;
  }
}

function stop(status, reason) {
  throw new ReleaseStop(status, reason);
}

const errorText = (error) => String(error?.message ?? error).slice(0, 400);
const validTarget = (value) => value === null || (typeof value === 'string' && value.length > 0);

/**
 * Execute one owner-authorized attempt against an already qualified retained archive.
 * This private tooling does not grant release authority or a conformance claim.
 *
 * identity: {name: '@get-modular/core', version, archive: Uint8Array,
 * sha256: lowercase 64-digit hex, integrity: 'sha512-<base64>',
 * provisionalTag, intendedTag, previousTags: {provisional, intended}}.
 * Both previous targets must be explicit strings or null (absence). The tags
 * must differ. The caller separately verifies the archive's package metadata.
 *
 * All effects are async, settle within the adapter's time budget, and take objects:
 * readVersion({name, version}) => null or {name, version, integrity, tarball};
 * download({name, version, tarball}) => Uint8Array;
 * upload({name, version, sha256, integrity, provisionalTag, intendedTag, tag, archive});
 * consumer({name, version, sha256, integrity, provisionalTag, intendedTag, archive})
 *   => exactly true on success, using only that downloaded archive;
 * readTags({name}) => a tag-to-version object; missing/undefined targets mean absence;
 * setTag({name, version, tag}). Mutation adapters must never retry internally.
 *
 * checkpoint: {resume?: prior result.checkpoint, save: async (record) => void}.
 * save must durably record its snapshot before resolving. The caller persists
 * the returned result, serializes attempts, and must preserve attempt flags on
 * resume. Only a separately owner-authorized attempt may start without them.
 * Failed checkpoints require owner remediation; they cannot resume.
 * A fresh, successful first absence read permits one upload; resumed attempted
 * writes only reconcile. Reads have at most three attempts per phase. Tag
 * checks detect observed changes; npm does not provide an atomic tag comparison.
 * The intended tag may already target the version; other unexpected changes stop.
 * No operation repacks, builds, changes versions, deletes, or rolls back tags.
 *
 * @param {{identity: object, effects: object, checkpoint: object}} options
 * @returns {Promise<{status: 'completed'|'incomplete'|'failed', reason: string,
 *   checkpoint: object|null, evidence: object[]}>}
 */
export function publishFirstCoreRelease(options) {
  return publishFirstPackageRelease('@get-modular/core', options);
}

// ADR-0025 extends the existing bounded procedure; no caller-selectable package.
export function publishFirstAssemblyRelease(options) {
  return publishFirstPackageRelease('@get-modular/assembly', options);
}

async function publishFirstPackageRelease(packageName, { identity, effects, checkpoint } = {}) {
  let record = null;
  const evidence = [];
  const note = (operation, details) => evidence.push({ operation, ...details });
  const snapshot = () => record === null ? null : structuredClone({ ...record, evidence });
  const finish = (status, reason) => {
    if (record !== null) record.stage = status;
    return { status, reason, checkpoint: snapshot(), evidence: structuredClone(evidence) };
  };

  try {
    const strings = ['version', 'provisionalTag', 'intendedTag'];
    const previous = identity?.previousTags;
    if (identity?.name !== packageName
      || !strings.every((key) => typeof identity[key] === 'string' && identity[key].length > 0)
      || identity.provisionalTag === identity.intendedTag
      || !/^[a-f0-9]{64}$/.test(identity.sha256)
      || typeof identity.integrity !== 'string'
      || !validTarget(previous?.provisional) || !validTarget(previous?.intended)
      || typeof checkpoint?.save !== 'function'
      || !['readVersion', 'download', 'upload', 'consumer', 'readTags', 'setTag']
        .every((key) => typeof effects?.[key] === 'function')) {
      stop('failed', 'invalid-input');
    }
    const subject = Object.freeze(Object.fromEntries(
      ['name', ...strings, 'sha256', 'integrity'].map((key) => [key, identity[key]]),
    ));
    const prior = checkpoint.resume;
    if (prior !== undefined && prior !== null && (
      !Object.keys(subject).every((key) => prior.identity?.[key] === subject[key])
      || prior.previousTags?.provisional !== previous.provisional
      || prior.previousTags?.intended !== previous.intended
      || typeof prior.uploadAttempted !== 'boolean'
      || typeof prior.promotionAttempted !== 'boolean'
      || typeof prior.intendedObserved !== 'boolean'
    )) stop('failed', 'checkpoint-identity-mismatch');
    record = {
      identity: subject,
      previousTags: { provisional: previous.provisional, intended: previous.intended },
      uploadAttempted: prior?.uploadAttempted ?? false,
      promotionAttempted: prior?.promotionAttempted ?? false,
      intendedObserved: prior?.intendedObserved ?? false,
      stage: 'observing',
    };
    if (prior?.stage === 'failed') stop('failed', 'checkpoint-terminal-failure');
    const target = Object.freeze({ name: subject.name, version: subject.version });

    function checkedBytes(value, source) {
      if (!(value instanceof Uint8Array)) stop('failed', `${source}-invalid-bytes`);
      const bytes = Buffer.from(value);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
      const matches = sha256 === subject.sha256 && integrity === subject.integrity;
      note(`${source}-identity`, { sha256, integrity, matches });
      if (!matches) stop('failed', `${source}-archive-mismatch`);
      return bytes;
    }
    const retained = checkedBytes(identity.archive, 'retained');

    async function readArchive(allowInitialAbsence) {
      for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt += 1) {
        let metadata;
        try {
          metadata = await effects.readVersion(target);
        } catch (error) {
          note('read-version', { attempt, error: errorText(error) });
          continue;
        }
        note('read-version', {
          attempt, present: metadata !== null,
          name: metadata?.name ?? null, version: metadata?.version ?? null,
          integrity: metadata?.integrity ?? null,
        });
        if (metadata === null) {
          if (allowInitialAbsence && attempt === 1) return null;
          continue;
        }
        if (metadata?.name !== subject.name || metadata?.version !== subject.version
          || metadata?.integrity !== subject.integrity
          || typeof metadata?.tarball !== 'string' || metadata.tarball.length === 0) {
          stop('failed', 'registry-metadata-conflict');
        }
        let bytes;
        try {
          bytes = await effects.download({ ...target, tarball: metadata.tarball });
        } catch (error) {
          note('download', { attempt, error: errorText(error) });
          continue;
        }
        note('download', { attempt, outcome: 'received' });
        return checkedBytes(bytes, 'registry');
      }
      stop('incomplete', 'version-readback-unconfirmed');
    }

    async function readSelectedTags(requireIntended = false) {
      for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt += 1) {
        let tags;
        try {
          tags = await effects.readTags({ name: subject.name });
        } catch (error) {
          note('read-tags', { attempt, error: errorText(error) });
          continue;
        }
        if (tags === null || typeof tags !== 'object' || Array.isArray(tags)) {
          stop('failed', 'registry-tags-invalid');
        }
        const selected = Object.fromEntries(['provisional', 'intended'].map((role) => {
          const tag = subject[`${role}Tag`];
          return [role, Object.hasOwn(tags, tag) ? tags[tag] ?? null : null];
        }));
        if (!Object.values(selected).every(validTarget)) stop('failed', 'registry-tags-invalid');
        note('read-tags', { attempt, targets: selected });
        const expectedProvisional = record.uploadAttempted
          ? subject.version : record.previousTags.provisional;
        const pendingProvisional = selected.provisional !== expectedProvisional
          && record.uploadAttempted && selected.provisional === record.previousTags.provisional;
        if ((record.intendedObserved && selected.intended !== subject.version)
          || (selected.provisional !== expectedProvisional && !pendingProvisional)
          || (selected.intended !== record.previousTags.intended && selected.intended !== subject.version)) {
          stop('failed', 'concurrent-tag-change');
        }
        if (selected.intended === subject.version && !record.intendedObserved) {
          record.intendedObserved = true;
          try {
            await checkpoint.save(snapshot());
          } catch (error) {
            note('checkpoint', { stage: record.stage, error: errorText(error) });
            stop('incomplete', 'checkpoint-not-durable');
          }
        }
        if (pendingProvisional || (requireIntended && selected.intended !== subject.version)) continue;
        return selected;
      }
      stop('incomplete', 'tag-readback-unconfirmed');
    }

    async function mutate(operation, request, stage, flag) {
      record[flag] = true;
      record.stage = stage;
      try {
        await checkpoint.save(snapshot());
      } catch (error) {
        note('checkpoint', { stage, error: errorText(error) });
        stop('incomplete', 'checkpoint-not-durable');
      }
      note('checkpoint', { stage, outcome: 'durable' });
      try {
        await effects[operation](request);
        note(operation, { outcome: 'acknowledged' });
      } catch (error) {
        note(operation, { outcome: 'unknown', error: errorText(error) });
      }
    }

    let downloaded = await readArchive(!record.uploadAttempted && !record.promotionAttempted);
    const initialTags = await readSelectedTags();
    if (downloaded === null) {
      if (initialTags.intended === subject.version || initialTags.provisional === subject.version) {
        stop('incomplete', 'version-readback-unconfirmed');
      }
      await mutate('upload', {
        ...subject, tag: subject.provisionalTag, archive: Buffer.from(retained),
      }, 'upload-intent', 'uploadAttempted');
      downloaded = await readArchive(false);
    }

    let consumerPassed;
    try {
      consumerPassed = await effects.consumer({ ...subject, archive: Buffer.from(downloaded) });
    } catch (error) {
      note('consumer', { ok: false, error: errorText(error) });
      stop('failed', 'consumer-failed');
    }
    note('consumer', { ok: consumerPassed === true });
    if (consumerPassed !== true) stop('failed', 'consumer-failed');

    const tags = await readSelectedTags(record.promotionAttempted);
    if (tags.intended !== subject.version) {
      await mutate('setTag', {
        ...target, tag: subject.intendedTag,
      }, 'promotion-intent', 'promotionAttempted');
      await readSelectedTags(true);
    }
    return finish('completed', 'publication-completed');
  } catch (error) {
    if (error instanceof ReleaseStop) return finish(error.status, error.message);
    note('orchestration', { error: errorText(error) });
    return finish('incomplete', 'unexpected-error');
  }
}
