import { defineModule } from './api.js';
export const baseline = defineModule({
  moduleId: 'demo/root', provides: ['demo/service'] as const,
  dependencies: [
    { kind: 'required', capability: 'demo/config' },
    { kind: 'optional', capability: 'demo/cache' },
    { kind: 'many', capability: 'demo/plugin', min: 0, max: 4, orderBy: 'implementationId' },
  ], metadata: { label: 'fixture', enabled: true, then: null, constructor: 'safe' },
});
export const hostileKeys = defineModule({
  moduleId: 'demo/hostile', provides: ['__proto__', 'constructor', 'then', 'Ünicode'] as const,
  dependencies: [], metadata: { '__proto__': 'data', constructor: 'data', then: 'data', 'Ünicode': 'data' },
});
export const scenarios = [
  'required', 'optional', 'many', 'missing', 'duplicate', 'ambiguity', 'cycle', 'disabled',
  'unreachable', 'multiple roots', 'deterministic ordering', 'hostile keys', 'unknown fields',
  'no fallback', 'serializability', 'declaration emit', 'no executable import during discovery',
] as const;
