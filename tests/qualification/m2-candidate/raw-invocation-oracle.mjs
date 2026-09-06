// Proposed-only, development-only raw invocation preparation oracle.
// Reuses the existing carrier classifier; this is not Core, an accepted
// generation-2 subject, a public entry point, or complete invocation conformance.
// Only the proposed count-overflow diagnostic candidate is recorded here.
// No payload decoding, numeric scanning, schema validation, semantics, general
// diagnostic generation/ordering/top-K, plan, or digest is implemented here.
//
// The returned object is a CLOSED PRIVATE OBSERVATION. Eligible documents expose
// owned bytes so tests can observe independent continuation after carrier failure.
// This is not publication of a partial compiler snapshot or a compiler result.
// Typed arrays remain mutable deliberately, to test ownership independently.
//
// Wrapper/list descriptor operations assume ADR-0018 cooperative Host data.
// Host Proxy execution, intrinsic-reflection allocation, and process heap/time
// guarantees are excluded. No candidate property access or carrier callback is
// used. All work finishes synchronously; no caller reference escapes the frame.
//
// Wrapper policy A maps missing/non-array/accessor declarations, missing/accessor
// profile, and missing/accessor own indices to invalid/not-document-list.
// Index failures use the root declarations path and leave ALL documents
// unavailable. Own data undefined instead reaches independent classification.
// Ordinary-array length impossibilities remain unresolved outside the
// cooperative Host contract; no hostile Proxy behavior is claimed.
//
// Count overflow records one complete proposed diagnostic candidate from the
// admitted own length, before ANY index reflection/classification/allocation.
// The accepted prerequisite row is untouched; proposed generation 2 removes its
// byte prerequisite. All byte facts remain unavailable on this private exit.
// 'documents.state: unavailable' plus unavailableFacts represents ALL documents,
// without allocating one placeholder for each rejected list position.
import { classifyByteCarrier } from './raw-carrier-oracle.mjs';

const OwnDescriptor = Object.getOwnPropertyDescriptor;
const HasOwn = Object.hasOwn;
const IsArray = Array.isArray;
const IsInteger = Number.isInteger;
const OwnedUint8Array = Uint8Array;
const DECLARATIONS_LIMIT = 4096;
const DECLARATION_LIMIT = 1048576;
const PROFILE_LIMIT = 8388608;
const AGGREGATE_LIMIT = 16777216;

function descriptor(value, key) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
  return OwnDescriptor(value, key);
}

function isData(value) {
  return value !== undefined && HasOwn(value, 'value');
}

// Private projection only; accepted index rules and authorities are untouched.
function privatePath(profile, index = null) {
  const path = [{ kind: 'field', value: profile ? 'profile' : 'declarations' }];
  if (!profile && IsInteger(index) && index >= 0 && index <= 65535) {
    path[1] = { kind: 'index', value: index };
  }
  return path;
}

function issue(path, observation, proposedReason) {
  return { path, observation, proposedReason };
}

function stopped(wrapperState, issues, countState, countActual) {
  return {
    scope: 'proposed-only/raw-invocation',
    wrapper: { state: wrapperState, issues },
    count: { state: countState, limit: DECLARATIONS_LIMIT, actual: countActual },
    batch: { state: 'unavailable', limit: AGGREGATE_LIMIT, actual: null },
    documents: {
      state: 'unavailable',
      unavailableFacts: {
        'document.byte-carrier-admitted': 'unavailable',
        'document.raw-bytes-admitted': 'unavailable',
      },
      declarations: [],
      profile: null,
    },
    work: { classifiedCarriers: 0, ownedCopies: 0, ownedBytes: 0 },
  };
}

function countStopped(count) {
  return {
    ...stopped('valid', [], 'invalid', count > DECLARATIONS_LIMIT ? DECLARATIONS_LIMIT + 1 : count),
    countDiagnostic: {
      code: 'input.limit-exceeded',
      phase: 'declaration',
      path: [],
      coordinate: {},
      details: { limitName: 'declarations', limit: DECLARATIONS_LIMIT, actual: DECLARATIONS_LIMIT + 1 },
    },
  };
}

function classifyDocument(value, profile, index) {
  const observed = classifyByteCarrier(value);
  const limitName = profile ? 'profileRawDocumentBytes' : 'declarationRawDocumentBytes';
  const limit = profile ? PROFILE_LIMIT : DECLARATION_LIMIT;
  if (HasOwn(observed, 'reason')) {
    return {
      path: privatePath(profile, index),
      classification: { reason: observed.reason },
      facts: {
        'document.byte-carrier-admitted': 'invalid',
        'document.raw-bytes-admitted': 'unavailable',
      },
      raw: { limitName, limit, actual: null },
      bytes: null,
    };
  }
  const size = observed.visibleLength;
  return {
    path: privatePath(profile, index),
    classification: { visibleLength: size },
    facts: {
      'document.byte-carrier-admitted': 'valid',
      'document.raw-bytes-admitted': size > limit ? 'invalid' : 'valid',
    },
    raw: { limitName, limit, actual: size > limit ? limit + 1 : size },
    bytes: null,
  };
}

function addBytes(total, document) {
  if (document.facts['document.byte-carrier-admitted'] !== 'valid') return total;
  const size = document.classification.visibleLength;
  if (total > AGGREGATE_LIMIT || size > AGGREGATE_LIMIT - total) return AGGREGATE_LIMIT + 1;
  return total + size;
}

function copyEligible(value, document, batchState) {
  if (batchState !== 'valid' || document.facts['document.raw-bytes-admitted'] !== 'valid') return false;
  const bytes = new OwnedUint8Array(value);
  document.bytes = bytes;
  return true;
}

export function observeRawInvocation(input) {
  const declarationsDescriptor = descriptor(input, 'declarations');
  const profileDescriptor = descriptor(input, 'profile');
  const issues = [];
  if (!isData(declarationsDescriptor)) {
    issues[issues.length] = issue(privatePath(false),
      declarationsDescriptor === undefined ? 'missing-own-declarations' : 'accessor-declarations',
      'not-document-list');
  } else if (!IsArray(declarationsDescriptor.value)) {
    issues[issues.length] = issue(privatePath(false), 'non-array-declarations', 'not-document-list');
  }
  if (profileDescriptor === undefined) {
    issues[issues.length] = issue(privatePath(true), 'missing-own-profile', 'not-document-list');
  } else if (!isData(profileDescriptor)) {
    issues[issues.length] = issue(privatePath(true), 'accessor-profile', 'not-document-list');
  }
  if (issues.length !== 0) {
    return stopped('invalid', issues, 'unavailable', null);
  }

  const list = declarationsDescriptor.value;
  const lengthDescriptor = descriptor(list, 'length');
  if (!isData(lengthDescriptor) || !IsInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0 || lengthDescriptor.value > 4294967295) {
    return stopped('unresolved', [issue(privatePath(false), 'list-length-unmapped', null)], 'unavailable', null);
  }
  const count = lengthDescriptor.value;
  if (count > DECLARATIONS_LIMIT) return countStopped(count);

  // Validate the bounded descriptor projection completely before classifying
  // any document; malformed list structure rejects the entire wrapper/list.
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const item = descriptor(list, `${index}`);
    if (!isData(item)) {
      const observation = item === undefined ? 'missing-own-index' : 'accessor-index';
      return stopped('invalid', [issue(privatePath(false), observation, 'not-document-list')], 'valid', count);
    }
    values[index] = item.value;
  }

  const declarations = [];
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const document = classifyDocument(values[index], false, index);
    declarations[index] = document;
    total = addBytes(total, document);
  }
  const profile = classifyDocument(profileDescriptor.value, true, null);
  total = addBytes(total, profile);
  const batchState = total > AGGREGATE_LIMIT ? 'invalid' : 'valid';
  let ownedCopies = 0;
  let ownedBytes = 0;
  for (let index = 0; index < count; index += 1) {
    if (copyEligible(values[index], declarations[index], batchState)) {
      ownedCopies += 1;
      ownedBytes += declarations[index].classification.visibleLength;
    }
    values[index] = null;
  }
  if (copyEligible(profileDescriptor.value, profile, batchState)) {
    ownedCopies += 1;
    ownedBytes += profile.classification.visibleLength;
  }
  return {
    scope: 'proposed-only/raw-invocation',
    wrapper: { state: 'valid', issues: [] },
    count: { state: 'valid', limit: DECLARATIONS_LIMIT, actual: count },
    batch: { state: batchState, limit: AGGREGATE_LIMIT, actual: total },
    documents: { state: 'classified', unavailableFacts: null, declarations, profile },
    work: { classifiedCarriers: count + 1, ownedCopies, ownedBytes },
  };
}
