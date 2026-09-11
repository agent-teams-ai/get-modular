// Native ESM. Only inert recipe data is copied; exotic values are created here.
const define = (object, key, value) => Object.defineProperty(object, key, {
  value, enumerable: true, writable: true, configurable: true,
});

function demand(condition, message) {
  if (!condition) throw new Error(message);
}

function copy(value) {
  if (value === null || typeof value !== 'object') return value;
  const result = Array.isArray(value) ? [] : {};
  for (const key of Object.keys(value)) define(result, key, copy(value[key]));
  return result;
}

// The host must keep the supplying realm alive through execution. This capability
// is synchronous and returns its intrinsic prototypes and fresh allocation methods.
// A missing capability is an execution failure with a distinct machine-readable code.
function foreignRealm(factory) {
  if (typeof factory !== 'function') {
    const error = new Error('foreign realm factory unavailable');
    error.code = 'descriptor.foreign-realm-unavailable';
    throw error;
  }
  const realm = factory();
  demand(realm && realm.objectPrototype !== Object.prototype &&
    realm.arrayPrototype !== Array.prototype &&
    realm.objectPrototype !== null &&
    typeof realm.objectPrototype === 'object' &&
    Array.isArray(realm.arrayPrototype) &&
    Object.getPrototypeOf(realm.objectPrototype) === null &&
    Object.getPrototypeOf(realm.arrayPrototype) === realm.objectPrototype,
  'invalid foreign realm capability');
  for (const name of ['record', 'nullRecord', 'array']) {
    demand(typeof realm[name] === 'function', 'invalid foreign allocator');
  }
  const record = realm.record(), nullRecord = realm.nullRecord(), array = realm.array();
  demand(Object.getPrototypeOf(record) === realm.objectPrototype &&
    Object.getPrototypeOf(nullRecord) === null && Array.isArray(array) &&
    Object.getPrototypeOf(array) === realm.arrayPrototype,
  'foreign allocator prototype mismatch');
  demand(Reflect.ownKeys(record).length === 0 &&
    Reflect.ownKeys(nullRecord).length === 0 &&
    Reflect.ownKeys(array).length === 1 && array.length === 0,
  'foreign allocators must supply fresh empty containers');
  return { record, nullRecord, array };
}

const values = Object.freeze({
  undefined: () => undefined, symbol: () => Symbol('fixture'), bigint: () => 1n,
  function: () => function fixtureValue() {}, nan: () => NaN,
  infinity: () => Infinity, 'negative-infinity': () => -Infinity,
  null: () => null, false: () => false, true: () => true,
  string: () => 'fixture', integer: () => 7, noninteger: () => 0.5,
  'negative-zero': () => -0, 'lone-high': () => '\ud800', 'lone-low': () => '\udc00',
  date: () => new Date(0), map: () => new Map(), set: () => new Set(),
  regexp: () => /fixture/g, 'typed-array': () => new Uint8Array([1]),
  'array-buffer': () => new ArrayBuffer(1), promise: () => Promise.resolve(0),
  error: () => new Error('fixture'), 'wrapper-boolean': () => Object(false),
  'wrapper-number': () => Object(1), 'wrapper-string': () => Object('x'),
  'wrapper-bigint': () => Object(1n), 'wrapper-symbol': () => Object(Symbol('fixture')),
  class: () => new (class FixtureClass {})(),
  arguments: () => (function () { return arguments; })(1),
});

export function materializeDescriptorRuntimeInput(fixture, capabilities = {}) {
  const { recipe, templates } = fixture;
  demand(recipe?.worldId === 'normalization-plus-unselected-descriptor/v1',
    'unknown descriptor world');
  demand(recipe.baselineSha256 ===
    'sha256:64f97efa285f05924305f3b32d6b55f9fc5924950db55c2ed3938bbd11c81b99',
  'unknown descriptor baseline');
  demand(templates?.declarations?.length === 5, 'descriptor baseline size');
  const input = {
    declarations: copy(templates.declarations), profile: copy(templates.profile),
  };
  const document = copy(templates.appendedDeclaration);
  input.declarations.push(document);
  const p = recipe.parameters;
  const needsForeign = ['foreign', 'foreign-null', 'foreign-object'].includes(p.mode);
  demand(fixture.applicability.foreignRealm ===
    (needsForeign ? 'required' : 'nonapplicable'), 'foreign applicability mismatch');
  const foreign = needsForeign ? foreignRealm(capabilities.foreignRealmFactory) : null;
  let parent = input.declarations, key = '5', getterCalls = 0, lengthAttempt = null;
  const getter = () => { getterCalls += 1; return 'fixture'; };
  const arrayFocus = () => { parent = document.owner; key = 'path'; };
  switch (recipe.factoryId) {
    case 'm2/object-descriptor/record/v1': {
      demand(['foreign-null', 'foreign-object', 'local-null', 'custom', 'local-object']
        .includes(p.mode), 'unknown record mode');
      const record = p.mode === 'foreign-null' ? foreign.nullRecord
        : p.mode === 'foreign-object' ? foreign.record
          : p.mode === 'local-null' ? Object.create(null)
            : p.mode === 'custom' ? Object.create({ fixturePrototype: true }) : {};
      Object.defineProperties(record, Object.getOwnPropertyDescriptors(document));
      define(parent, key, record);
      break;
    }
    case 'm2/object-descriptor/array/v1': {
      demand(['foreign', 'custom', 'local'].includes(p.mode), 'unknown array mode');
      arrayFocus();
      const array = p.mode === 'foreign' ? foreign.array : [];
      define(array, '0', 'descriptor');
      if (p.mode === 'custom') Object.setPrototypeOf(array, Object.create(Array.prototype));
      define(parent, key, array);
      break;
    }
    case 'm2/object-descriptor/integrity/v1':
    case 'm2/object-descriptor/attributes/v1':
    case 'm2/object-descriptor/descriptor/v1': {
      demand(p.target === 'record' || p.target === 'array', 'unknown descriptor target');
      if (p.target === 'array') arrayFocus();
      const focus = parent[key], property = p.target === 'array' ? '0' : 'moduleId';
      if (recipe.factoryId === 'm2/object-descriptor/integrity/v1') {
        demand(['frozen', 'sealed', 'nonextensible'].includes(p.state), 'unknown integrity');
        ({ frozen: Object.freeze, sealed: Object.seal,
          nonextensible: Object.preventExtensions })[p.state](focus);
      } else if (recipe.factoryId === 'm2/object-descriptor/attributes/v1') {
        demand(typeof p.writable === 'boolean' && typeof p.configurable === 'boolean',
          'invalid descriptor attributes');
        Object.defineProperty(focus, property, {
          writable: p.writable, configurable: p.configurable,
        });
      } else {
        demand((p.target === 'array'
          ? ['missing', 'hidden', 'accessor', 'symbol', 'extended']
          : ['hidden', 'accessor', 'symbol']).includes(p.kind), 'unknown descriptor kind');
        if (p.kind === 'accessor') {
          Object.defineProperty(focus, property, {
            get: getter, enumerable: true, configurable: true,
          });
        } else if (p.kind === 'hidden') {
          Object.defineProperty(focus, property, { enumerable: false });
        } else if (p.kind === 'missing') delete focus[property];
        else define(focus, p.kind === 'symbol' ? Symbol('fixture') : '01', 0);
      }
      break;
    }
    case 'm2/object-descriptor/value/v1':
      demand(Object.hasOwn(values, p.id), 'unknown value category');
      demand(['min', 'item', 'owner'].includes(p.position), 'unknown value position');
      if (p.position === 'min') { parent = document.slots[0].cardinality; key = 'min'; }
      else if (p.position === 'item') { parent = document.owner.path; key = '0'; }
      else { parent = document; key = 'owner'; }
      define(parent, key, values[p.id]());
      break;
    case 'm2/object-descriptor/proto-data/v1':
      define(document, '__proto__', { marker: 'owned' });
      break;
    case 'm2/object-descriptor/absent/v1':
      parent = document; key = 'privateDescriptor';
      break;
    case 'm2/object-descriptor/unknown-undefined/v1':
      parent = document; key = 'privateDescriptor';
      define(parent, key, undefined);
      break;
    case 'm2/object-descriptor/reprototype/v1': {
      demand(typeof p.populated === 'boolean', 'invalid reprototype parameter');
      const value = Object.setPrototypeOf(new Date(0), Object.prototype);
      if (p.populated) Object.defineProperties(value, Object.getOwnPropertyDescriptors(document.owner));
      parent = document; key = 'owner';
      define(parent, key, value);
      break;
    }
    case 'm2/object-descriptor/length/v1':
      demand(['accessor', 'enumerable'].includes(p.kind), 'unknown length attempt');
      arrayFocus();
      lengthAttempt = Reflect.defineProperty(parent[key], 'length',
        p.kind === 'accessor' ? { get: getter } : { enumerable: true });
      break;
    default: throw new Error('unimplemented descriptor factory');
  }
  return {
    input, parent, key, lengthAttempt, getterCalls: () => getterCalls,
    foreignRealm: needsForeign ? 'supplied' : 'nonapplicable',
  };
}
