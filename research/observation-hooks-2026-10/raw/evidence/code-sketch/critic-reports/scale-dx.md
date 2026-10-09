# Критика скетча хуков: масштаб и DX (2026-10-01)

Скетч: `scratchpad/hooks-sketch/` (далее `S/`). Эксперименты лежат в `.../scratchpad/critic-scale-work/`: генератор `gen.py`, драйвер `scale-main.ts`, варианты `s96`, `s576*`, `s1152*`, `s2304*`, `s3840*`, `e1-*`, `e3-*`, `e4-health`, `e5-owned`, `base/cycle-check.mjs`. Генератор строит модули на настоящих Core/Assembly: 4 вида по кругу (opt1/opt2/opt3/passive), общий `adapter/shared` (diamond), цепочки глубиной D и cross-branch ребро у каждого 7-го модуля.

## Сильные стороны (VERIFIED)

- **Стоимость доставки не зависит от N и глубины.** Коммит одного ключа: 12 visits/12 deliveries при 96 и 576 модулях, в трёх топологиях 576 (12×48, 2×288, 48×12). +10 000 регистраций на постороннем ключе: по-прежнему 12. Коммит ключа без подписчиков: 0. При 1152/2304 visits ровно равны числу подписчиков ключа (24/48). Fail-условие исследования выполнено.
- **Пассивные модули не трогаются.** Новый ключ `health/probe` в `Capabilities` не даёт ни одной ошибки в остальных `bindFactory` (`e4-health`).
- **Порядок cleanup выводится из графа.** Assembly строит последовательно в `dependencyOrder` (`run.ts:105`), Host пушит owner до запуска фабрики. При 576 модулях `adapter/shared` закрывается последним, `inflightAtSharedClose=0`, `derivesAfterSharedClosed=0`.
- **Вариант 2 fail-closed.** Если забыть binding, Core отвечает `binding.missing`. Если забыть `owned(...)`, будет TS2345 (`e5-owned`).
- compile+prepare растут линейно: 576 → 62+72 мс, 2304 → 218+241 мс.

## Находки

### SD-1 · P1 · уверенность 8 · VERIFIED: вариант 1/3 fail-open при забытом участнике
`S/src/host/composition.ts:138` `bind("host/settings-fanout", "appliers", ["feature/greeting"]),` и `:140` (то же для driver). Слоты объявлены `many({ min: 0, max: 1024 })` (`:81`, `:87`). Я заменил списки на `[]` (`e1-forgotten-binding`): Core принимает, tsc7 проходит чисто, 5 проверок падают молча. `tax.region()` остаётся `undefined` навсегда, `host.errors` пуст. При сотнях участников центральную строку правит каждая команда, поэтому это самая вероятная регрессия. Модуль вида «provides, но не привязан» ничем не отличается от корректного.
Исправление (rejecting-проверка в composition root/тесте; binding остаётся явным):
```ts
const APPLIERS = ["feature/greeting"] as const;      // единый источник для bind() и атрибуции
const providersOf = (cap: string) => declarations
  .filter((d) => d.provides.some((p) => p.capabilityId === cap)).map((d) => d.implementationId);
const unbound = providersOf("settings/applier").filter((id) => !new Set<string>(APPLIERS).has(id));
if (unbound.length > 0) throw new Error(`settings/applier provided but not bound: ${unbound.join(", ")}`);
```

### SD-2 · P1 · уверенность 9 · VERIFIED: при неудачной сборке owner-обязательства утекают
`S/src/host/composition.ts:148` `if (outcome.status !== "succeeded") throw new Error(JSON.stringify(outcome));`. `owners` уже содержат подписки, а `shutdown` вызывающему не возвращается. Опыт `e3-attribution`: applier бросает в `attachTo`. После этого `listeners after failed run: priceCurrency=1 taxRegion=1`, то есть регистрации price и in-flight lane tax живут, а очистить их некому. Fan-out/driver стоят почти в конце `dependencyOrder` (575/580 и 578/580), поэтому сбой там случается, когда все opt2/opt3 уже подписаны. Утечка получается максимальной. Стандарт требует «Host-owned cleanup after failure». Ещё одна деталь: `JSON.stringify` всего `created` на 600 модулях даёт мегабайты.
```ts
const outcome = await ready.prepared.run();
if (outcome.status !== "succeeded") {
  const cleanup = await cleanupOwners();               // тот же reverse-обход, что в shutdown
  throw new Error(`assembly ${outcome.status}`, { cause: { outcome, cleanup } });
}
```

### SD-3 · P2 · уверенность 8 · VERIFIED: shutdown без quiesce стоит O(N × latency) и начинает новую работу
`S/src/kernel/resource-owner.stand-in.ts:67` `for (const release of [...obligations].reverse()) results.push(await release());`, driver `S/src/host/settings-modules.ts:48-58`: на каждую деривацию отдельное обязательство. Пока чистится #k, остальные k−1 подписаны и стартуют derive на каждый коммит.

| Сценарий (I/O 10 мс без учёта abort, коммит каждые 3 мс) | shutdown | derive после начала shutdown |
|---|---:|---:|
| 576 смешанных | 2453 мс | 35 918 |
| 96 смешанных | 403 мс | 917 |
| 576 opt3, текущий driver | 6393 мс | 161 280 |
| 576 opt3, двухфазный driver | 11 мс | 0 |
| 576 смешанных, без коммитов (quiesce) | 11 мс | 0 |

Исправления: (а) Host запечатывает источник до cleanup:
```ts
seal(): undefined { this.#sealed = true; return undefined; }   // в commit(): if (this.#sealed) throw ...
```
(б) driver делает одно обязательство и работает в две фазы. Код проверен tsc7 в `s576opt3b`. Cleanup срабатывает и после частичного сбоя setup:
```ts
cleanup: async () => {
  for (const r of running) r.unsubscribe();
  await Promise.all(running.map((r) => r.drain()));
  const left = running.filter((r) => r.isAttached()).length;
  return left === 0 ? RELEASED : unresolved(new Error(`${left} derivations still attached`));
},
```
У варианта 2 двух фаз нет: каждый модуль сам себе owner. Поэтому для него остаётся только (а).

### SD-4 · P2 · уверенность 8 · VERIFIED: при сотнях участников теряется атрибуция ошибок
`S/src/host/settings-modules.ts:32` `setup: () => applier.attachTo(deps.settings, { reportError: context.reportError }),`. Падение одного applier Assembly репортит как `failed host/settings-fanout` (`e3`), а не `feature/greeting`. `many` отдаёт `readonly V[]` без id (`types.ts:56-59`). Порядок при этом гарантирован стандартом («Many injection preserves providerImplementationIds order»). `reportError` один на всех (`composition.ts:100`, `:107`), хотя `owned(label, …)` знает `label`. Ошибки `derive` Host вообще не видит: при 6 внедрённых сбоях `errors: 0`.
```ts
// owned(): reportError: (cause) => reportError(new Error(label, { cause })),
// fan-out/driver: получают ids из того же APPLIERS (SD-1), проверяют length и оборачивают:
setup: () => { try { return applier.attachTo(port, { reportError: (c) => report(new Error(ids[i], { cause: c })) }); }
               catch (c) { throw new Error(`applier ${ids[i]} failed to attach`, { cause: c }); } },
```

### SD-5 · P2 · уверенность 7 · VERIFIED (механизм) + ASSUMPTION (влияние): готовность асинхронного состояния не агрегируется
`S/src/shared/latest-derivation.ts:3` `No acquisition, retry, health, readiness or disposal.`. `S/src/main.ts:11` ждёт 20 microtask-тиков, и это работает только с тестовыми адаптерами. Что измерено на 576: 288 участников стартуют `pending`, и все 288 derive идут одновременно. Если внедрить 6 сбоев первичной деривации, `stillPendingAfterSettle: 6`. После коммитов k000..k004 два модуля так и остались `pending`: retry нет, а их ключи не менялись. Host ничего не видит. ASSUMPTION: `pending`/`undefined` будет протекать по графу в API потребителей. Ограничение тоже VERIFIED (`base/cycle-check.mjs`): readiness нельзя выдать capability-ей от fan-out, потому что участник или его upstream получит `graph.cycle [feature/catalog, feature/greeting, host/settings-fanout]`. Значит, Host читает готовность только через root-instance driver-а. Это совпадает со стандартом: readiness принадлежит Host. Для варианта 3 это дёшево:
```ts
export interface RunningDerivation extends Detachable {
  drain(): Promise<void>;
  readonly firstOutcome: Promise<Readonly<{ kind: "committed" | "failed"; revision: number; cause?: unknown }>>;
}
// driver instance: initialOutcomes: () => Promise.all(running.map((r, i) => r.firstOutcome.then((o) => ({ id: ids[i], ...o }))))
```
Retry и дедлайн остаются продуктовой политикой Host. Сюда же относится лимит одновременных derive, и только у driver-а есть точка, где его можно ввести.

### SD-6 · P2 · уверенность 9 · VERIFIED: TS-потолок около 1000 деклараций
`S/src/host/composition.ts:122` `const declarations = [settingsDecl, ...]`. Начиная с 1156 деклараций оба компилятора дают `TS2590: Expression produces a union type that is too complex to represent`. Аннотация `readonly ModuleDeclaration[]` не помогает. Помогают `declarations.push(...)` или конкатенация чанков. Время check в TS 5.8.3 (минимальная поддерживаемая версия) растёт как O(N·|C|):

| модулей | TS 5.8.3 check | память | tsc7 wall |
|---:|---:|---:|---:|
| 96 | 0.46 с | 143 МБ | 0.25 с |
| 576 | 2.7 с | 334 МБ | 0.8–1.1 с |
| 1152 | 8.3 с | 568 МБ | 1.6 с |
| 2304 | 30.5 с | 993 МБ | 3.8 с |
| 3840 | 79 с | 1.4 ГБ | 8.2 с |

Если `C` содержит 6 ключей, 1152/2304 дают 3.0/6.8 с, то есть рост линейный. По trace почти всё время уходит в объектный литерал `handles` с N вызовами `bindFactory`. Для сотен модулей этого хватает. Около 1000 появляется жёсткая ошибка, хотя предел Assembly 4096 handles. Второй вид хука добавляет один ключ, и это незаметно.

### SD-7 · P3 · уверенность 9 · VERIFIED: потолок 1024 на строку и 1024 roots
Строка с 1025 провайдерами даёт Core `input.limit-exceeded providersPerManySlot 1024`, а `many({max: 4096})` получает `schema.invalid-value`. Строка `composition.ts:129` `roots: declarations.map(...)` упирается в предел 1024 roots. Для сотен модулей это не проблема. Дальше нужно шардить слоты (`appliers0..3`) и делать roots только из настоящих корней. Fan-out/driver обязаны оставаться roots, потому что сами ничего не provide.

### SD-8 · P3 · уверенность 7 · VERIFIED: мелочи DX у варианта 2 и центральной строки
- Каждый opt2-модуль заново объявляет тип контекста: `S/src/features/price-table/index.ts:10` `export type OwnedContext = ...` дублирует `HostContext` (`settings-modules.ts:12`). На сотнях модулей это сотни копий. Тип стоит публиковать один раз рядом с ownership-кандидатом.
- Код на модуль (подсчёт по `S/`):
  - opt1: около 7 строк, плюс 1 provides и токен в центральной строке;
  - opt3: около 7 строк, плюс 1 provides и токен в центральной строке;
  - opt2: около 28 строк (attach/onSettings/detach + lane), плюс slot, своя строка binding и обёртка `owned`;
  - passive: 0.
- composition root на 576 модулях вырос до 4026 строк, на 1152 до 7982. Из-за инвариантности `C` фрагменты по фичам обязаны импортировать единый `Capabilities`: subset-`C` даёт TS2322 (`e4-health`). `Capabilities` и центральные строки opt1/opt3 становятся точками merge-конфликтов. Предложение: фрагменты `{declaration, bind(api), rows}` по фичам при одном глобальном `C`.

## Порядок при diamond и вопрос «участник зависит от модуля, который зависит от fan-out»
Fan-out/driver **не** строятся последними глобально: после них встречаются tails (`last: ["m/b9d46","host/settings-driver","m/b9d47"]`). Чистятся они раньше всех своих участников и всего, что те транзитивно используют. Этого достаточно, и это гарантировано топологией при последовательном run и регистрации owner до фабрики (VERIFIED). ASSUMPTION: если Host когда-нибудь станет строить параллельно или регистрировать owner после фабрики, гарантия пропадёт. Зависеть от fan-out нельзя, потому что он ничего не provide. Как только он начнёт что-то provide участникам, Core отвергнет граф как цикл (VERIFIED).

## Итог: что масштабируется лучше

Для асинхронных деривов лучше всего масштабируется вариант 3. Модуль пишет около 7 строк, а одна точка Host закрывает двухфазный shutdown, readiness, атрибуцию и лимит параллелизма. Для этого нужны SD-1 и SD-2. Вариант 2 безопаснее по составу (fail-closed), но эти свойства в нём размазаны по сотням модулей. Вариант 1 годится для синхронного apply.

| # | Вариант | 🎯 | 🛡️ | 🧠 | LOC (prod / tests) |
|---|---|---:|---:|---:|---|
| 1 | **opt3 как дефолт для async**: driver + SD-1 check + двухфазный cleanup + `firstOutcome` + атрибуция + SD-2 | 7 | 8 | 5 | +90–140 / +150–220 |
| 2 | opt2 + `seal()` + per-owner `reportError` + SD-2 | 7 | 8 | 4 | +30–50 / +80–120, плюс около 28 строк на модуль |
| 3 | opt1 для sync + SD-1 check + SD-2 | 8 | 7 | 2 | +25–40 / +60–90 |

ASSUMPTION: LOC оценены вручную с погрешностью ×1.5. Независимо от варианта обязательны SD-1, SD-2 и `seal()`.
