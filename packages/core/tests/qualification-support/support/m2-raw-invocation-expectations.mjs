// Independent complete results for the original closed invocation recipes.
// Authority: ADR-0021; generation-two contract/catalog. No subject imports.

const field = value => ({ kind: 'field', value });
const d = index => [field('declarations'), { kind: 'index', value: index }];
const p = () => [field('profile')];
const json = path => ({
  code: 'decode.invalid-json', phase: 'decode', path, coordinate: {}, details: { reason: 'invalid-json' },
});
const carrier = (path, reason) => ({
  code: 'input.invalid-byte-carrier', phase: 'decode', path, coordinate: {}, details: { reason },
});
const wrapper = root => carrier([field(root)], 'not-document-list');
const declarationBytes = index => ({
  code: 'input.limit-exceeded', phase: 'decode', path: d(index), coordinate: {},
  details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 },
});
const profileBytes = () => ({
  code: 'input.limit-exceeded', phase: 'decode', path: p(), coordinate: {},
  details: { limitName: 'profileRawDocumentBytes', limit: 8388608, actual: 8388609 },
});
const aggregateBytes = () => ({
  code: 'input.limit-exceeded', phase: 'decode', path: [], coordinate: {},
  details: { limitName: 'aggregateRawBytes', limit: 16777216, actual: 16777217 },
});
const count = () => ({
  code: 'input.limit-exceeded', phase: 'declaration', path: [], coordinate: {},
  details: { limitName: 'declarations', limit: 4096, actual: 4097 },
});

// Each row is already eligible, normalized, deduplicated and in catalog order.
const expected = {
  'dense-offset-buffer': [json(d(0)), json(d(1)), json(p())],
  'empty-batch': [json(p())],
  'frozen-null-wrapper': [json(d(0)), json(p())],
  'foreign-null-frozen-wrapper': [json(d(0)), json(p())],
  'realm-array-cleared': [json(d(0)), json(p())],
  'own-shadows-inherited': [json(d(0)), json(p())],
  'inherited-declarations': [wrapper('declarations')],
  'inherited-profile': [wrapper('profile')],
  'accessor-declarations': [wrapper('declarations')],
  'missing-declarations': [wrapper('declarations')],
  'nonarray-declarations': [wrapper('declarations')],
  'missing-profile': [wrapper('profile')],
  'accessor-profile': [wrapper('profile')],
  'both-fields-missing': [wrapper('declarations'), wrapper('profile')],
  'null-wrapper': [wrapper('declarations'), wrapper('profile')],
  'own-undefined-profile': [carrier(p(), 'not-uint8array'), json(d(0))],
  'own-undefined-index': [carrier(d(0), 'not-uint8array'), json(d(1)), json(p())],
  'sparse-list': [wrapper('declarations')],
  'inherited-index': [wrapper('declarations')],
  'accessor-index': [wrapper('declarations')],
  'late-missing-index': [wrapper('declarations')],
  'late-accessor-index': [wrapper('declarations')],
  'nonenumerable-index-extra-keys': [json(d(0)), json(p())],
  'proto-literal-inherited': [wrapper('declarations'), wrapper('profile')],
  'proto-own-and-symbol-extras': [json(d(0)), json(p())],
  'poisoned-carrier-properties': [json(d(0)), json(d(1)), json(d(2)), json(p())],
  'independent-invalid-carriers': [carrier(d(0), 'not-uint8array'), carrier(d(2), 'not-uint8array'), json(d(1)), json(p())],
  'rab-fixed-inbounds': [json(d(0)), json(p())],
  'rab-tracking-profile-inbounds': [json(d(0)), json(p())],
  'rab-fixed-outofbounds': [carrier(d(0), 'unusable-view'), json(p())],
  'rab-tracking-profile-outofbounds': [carrier(p(), 'unusable-view'), json(d(0))],
  'rab-empty-end-views': [json(d(0)), json(p())],
  'detached-declaration': [carrier(d(0), 'unusable-view'), json(p())],
  'detached-profile': [carrier(p(), 'unusable-view'), json(d(0))],
  'transferred-destination': [json(d(0)), json(p())],
  'shared-declaration': [carrier(d(0), 'shared-storage'), json(d(1)), json(p())],
  'growable-shared-profile': [carrier(p(), 'shared-storage'), json(d(0))],
  'realm-shared-both': [carrier(d(0), 'shared-storage'), carrier(p(), 'shared-storage')],
  'repeated-carrier-owned-separately': [json(d(0)), json(d(1)), json(p())],
  'replace-wrapper-list-profile': [json(d(0)), json(d(1)), json(p())],
  'postcall-detach-both': [json(d(0)), json(p())],
  'declaration-at': [json(d(0)), json(p())],
  'declaration-plus-one': [json(p()), declarationBytes(0)],
  'profile-at': [json(d(0)), json(p())],
  'profile-plus-one': [json(d(0)), profileBytes()],
  'aggregate-at': [json(d(0)), json(d(1)), json(d(2)), json(d(3)), json(d(4)), json(d(5)), json(d(6)), json(d(7)), json(p())],
  'aggregate-plus-one': [aggregateBytes()],
  'aggregate-invalid-zero': [carrier(d(8), 'not-uint8array'), carrier(d(9), 'not-uint8array'), json(d(0)), json(d(1)), json(d(2)), json(d(3)), json(d(4)), json(d(5)), json(d(6)), json(d(7)), json(p())],
  'oversized-still-counts-below-batch': [carrier(d(1), 'not-uint8array'), json(p()), declarationBytes(0)],
  'oversized-contributes-overflow': [aggregateBytes(), declarationBytes(0), declarationBytes(1), declarationBytes(2), declarationBytes(3), declarationBytes(4), declarationBytes(5), declarationBytes(6), declarationBytes(7), declarationBytes(8), declarationBytes(9), declarationBytes(10), declarationBytes(11), declarationBytes(12), declarationBytes(13), declarationBytes(14), declarationBytes(15)],
  'oversized-profile-contributes-overflow': [aggregateBytes(), profileBytes()],
  'far-overflow-saturates': [carrier(d(1), 'not-uint8array'), aggregateBytes(), declarationBytes(0)],
  'declarations-at': [...Array.from({ length: 255 }, (_, index) => json(d(index))), { code: 'diagnostics.truncated', phase: 'output', path: [], coordinate: {}, details: { omitted: 3842 } }],
  'declarations-plus-one': [count()],
  'declarations-overflow-mixed': [count()],
  'declarations-overflow-hole': [count()],
  'declarations-overflow-undefined-profile': [count()],
  'declarations-overflow-missing-profile': [wrapper('profile')],
  'declarations-overflow-accessor-profile': [wrapper('profile')],
  'malformed-overflow-list': [wrapper('declarations')],
  'huge-length-poison-tail': [count()],
  'maximum-array-length-poison-tail': [count()],
};

const ids = Object.freeze(Object.keys(expected));

export function rawInvocationExpectedIds() {
  if (arguments.length !== 0) throw new TypeError('Expected no arguments');
  return ids;
}

export function rawInvocationExpectedResult(id) {
  if (arguments.length !== 1 || typeof id !== 'string'
    || !Object.hasOwn(expected, id)) {
    throw new TypeError('Expected exactly one closed raw invocation ID');
  }
  return structuredClone({ ok: false, diagnostics: expected[id] });
}
