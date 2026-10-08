# Критика скетча lifecycle-хуков: Clean Architecture, SOLID, DRY, ответственность

Объект: `scratchpad/hooks-sketch/src` (17/17 PASS, tsc7 чист - VERIFIED). Эксперименты - только в копии `scratchpad/critic-arch-work/src` (`e3..e11.ts`, `patch-*.ts`). Авторитеты: CMS (`get-modular@9c722ce docs/architecture/common-assembly.md`), FMS v1 (blob `d0bfff20…`, локальная копия `.worktrees/central-stable25/docs/architecture/feature-module-standard/v1.md`), research rev2, resource plan.

## Вердикт

Слои в целом соблюдены: Core/Assembly импортирует только `src/host/composition.ts`, domain чист, `any` нет. Но я нашёл четыре дефекта P1 в распределении ответственности. Их общий корень: «владелец» подписки отвечает за неё только номинально. Вариант 2 после исправлений - лучший дефолт. Варианты 1/3 в текущем виде дефолтом быть не могут: opt-in в них теряется молча, а владелец не контролирует регистрацию.

## Находки

**A1 · P1 · 9/10 · VERIFIED (e8).** Ложный `released` и утечка слушателя, если `consumer.attach` бросает после `observe`.
`observe-owned.ts:21-22` сначала вызывает `port.observe(...)`, затем `consumer.attach(observation)`. Строка `:26` отвечает: `if (outcome.kind === "failed") return RELEASED; // observe() is atomic: nothing installed`. Результат e8: `cleanup: [{"kind":"released"}] | listeners left: 1`. Это противоречит resource plan:15/36 («construction cell before fallible setup») и :56 «Setup failure does not prove empty acquisition.». Тот же шаблон скопирован в `settings-modules.ts:34` и `:52`.

**A2 · P1 · 8/10 · VERIFIED (e6).** Инверсия полномочий в вариантах 1/3. Capability участника получает полный порт: `settings-v1.ts:71` `attachTo(port: SettingsObservationPortV1, options: ObserveOptions): Detachable;`, `:126` `start(port: …)`. При этом greeting объявляет только `settings/read` (`composition.ts:51`). Ручная реализация `SettingsApplierV1` делает две регистрации, fan-out рапортует `[{"kind":"released"}]`, а слушатель `auditVerbose` остаётся. Комментарий `settings-modules.ts:1-2` «These own subscriptions; participants do not.» поэтому неверен. CMS:173-175 требует искать «new capabilities hidden inside existing functions». Есть и отклонение от research:186-188, где сказано «the participating module provides and the Host calls synchronously».

**A3 · P1 · 8/10 · VERIFIED (e1, e10).** Opt-in в вариантах 1/3 теряется молча. Участие требует согласованных правок в двух местах: `provides` в декларации и центральный список hub-а (`composition.ts:138`, `:140`). Привязка `bind("host/settings-fanout","appliers",[])` проходит compile и typecheck. При ней greeting не обновляется вообще, а tax-table не получает даже начального состояния (`tax region: undefined`). В варианте 2 пропуск ловится: `binding.missing` (e10). Магическое `many({ min: 0, max: 1024 })` повторено дважды (`:81`, `:87`). Кроме того, research:261-262 говорит: «No new Core records, composition nodes…», а скетч добавляет два узла.

**A4 · P1 · 8/10 · VERIFIED (e4).** Изоляции ошибок нет. Если `fail`/`commit` модуля бросает исключение, срабатывает `latest-derivation.ts:41` `.catch((cause) => publish(job, () => spec.fail(...)))`. Она вызывает `fail` повторно, получается unhandled rejection, и процесс падает с exit 1. `reportError` при этом не вызывается. Заявление `settings-v1.ts:117-118` «a Host driver owns … error isolation» ложно и нарушает пункт 4 research.

**A5 · P2 · 8/10 · VERIFIED (e9).** Заимствующий код не может проверить admission. `SettingsView` не меняется после `unsubscribe`: `current()` продолжает отдавать последнюю ревизию. `detach(): Promise<void>` разрешает `await` до закрытия lane. Корректная по типам реализация в e9 публикует `EUR` уже после `unsubscribe`, и cleanup при этом даёт `released`. Защита `price-table.ts:29` `isCurrent: (revision) => this.#view?.current().revision === revision` держится только на неявном синхронном префиксе `detach`. Research:244-245 требует: «checks that admission before it starts or publishes work».

**A6 · P2 · 7/10 · VERIFIED.** DIP нарушен: application зависит от provider-published PL и реализует lifecycle-интерфейс провайдера. Примеры: `price-table.ts:19` `export class PriceTable implements SettingsConsumerV1<Keys>`, `greeter.ts:4`. Это расходится с CMS:64-66 («configurable inter-module relationships must use consumer-owned ports»), resource plan:15 («Application code uses consumer-owned ports.») и research:73 («Do not lay down now: lifecycle methods … on module types»). Instance виден Host-у (`price-table/index.ts:17`). В e3 один подделанный `onSettings` с `revision: 1_000_000` навсегда блокирует обновления (`lastOffered`).

**A7 · P2 · 8/10 · VERIFIED.** Published Language перегружен (ISP/SRP), версия выбрана с неверной гранулярностью. `settings-v1.ts` объединяет reader, порт, runtime-движки вариантов 1 и 3 и импортирует `shared/latest-derivation.ts` (`:7`). `published/observe-owned.ts:5` тянет ownership stand-in, то есть PL зависит от lifecycle-пакета. FMS:413-415 разделяет поверхности: `module - module factory and lifecycle` и `published - Published Language and public read contracts`. Заголовок `:3-4` требует «Any semantic change … gets a NEW file/token (`settings-v2`)». Тогда изменение семантики derivation заставит сотни пассивных readers сменить импорт. Движок варианта 3 включён в V1 до extraction trigger, а research:167-168 говорит: «A shared execution surface also needs a new accepted successor decision».

**A8 · P2 · 8/10 · VERIFIED.** Каталог `src/shared/` противоречит FMS:100-102 «Broad `shared`, `common`, `utils`… directories are not valid substitutes for feature ownership». Заголовок файла `latest-derivation.ts:1` утверждает «Private, owner-local helper», но импортируют его две фичи (`settings-v1.ts:7`, `price-table.ts:4`). Research:155-156: «the consuming Host feature may own a private … helper».

**A9 · P2 · 9/10 · VERIFIED (e5).** Host теряет владельцев при сбое сборки. `composition.ts:147-148` бросает исключение, а локальный `owners` после этого недостижим. Результат: `priceCurrency listeners left after failed construction: 1`. Это нарушает CMS:94-95 «Preserve Host-owned cleanup, the created journal» и resource plan:74.

**A10 · P2 · 8/10 · VERIFIED (e4, e3).** Фасеты существуют только на уровне типов. `settings-modules.ts:17-19` содержит `instance: source, // … features never can` и `"settings/read": source satisfies SettingsReaderV1`: capability и есть весь источник (`=== true`), поэтому `commit/observe/stats` доступны любому reader. `SettingsSourceId` (`settings-v1.ts:9-13`) объявлен как «minted only by the source adapter», но `new SettingsSourceId()` компилируется из любого места, а поле `source` нигде не проверяется (grep).

**A11 · P2 · 8/10 · VERIFIED.** Опасное дублирование (DRY). Политика cleanup «failed→RELEASED, unsubscribe, [drain], verify» существует в трёх копиях: `observe-owned.ts:25-30`, `settings-modules.ts:33-37` и `:51-56`, поэтому баг A1 размножен. Две обёртки над lane уже разошлись: `settings-v1.ts:140` проверяет `isAttached()`, а `price-table.ts:29` - нет.

**A12 · P3 · 7/10 · VERIFIED.** Мелочи:
- deep import `composition.ts:13` и `test-adapters.ts:3` в `price-table/application`;
- ключи продублированы в `greeting/index.ts:13` и `:19`, а ревизии сравнимы только в пределах одного набора ключей;
- лишний `observe-owned.ts:34 export type { SettingKey };`;
- тестовые пробы `stats()/listenerCount()` лежат в адаптере (`:40-42`);
- единый `reportError` без атрибуции владельца (`composition.ts:100`).

**A13 · P2 · 5/10 · ASSUMPTION.** Hub связывает lifecycle всех участников. Fan-out/driver зависят от всех appliers (many-slot). При будущей реконструкции одного модуля придётся пересобирать hub и переподключать всех участников. Пока Assembly статичен, это не проявляется.

## Ответы на вопросы

1. **Слои.** Направление domain ← published ← adapters ← composition соблюдено. Нарушены FMS по `shared/` (A8) и разделение PL и lifecycle (A7). PriceTable допустимо статически импортировать helper (механизм 1 FMS), если у helper-а есть владелец (A8). Импорт PL прикладным кодом - нарушение CMS/DIP (A6). Решение - consumer-owned **структурный** порт: `patch-consumer-port.ts` проходит tsc 7.0.2 и 5.9.3, `SettingsObservationPortV1` присваивается без cast и без runtime-адаптера, опечатка ключа отклоняется. Цена на сотни модулей: около 8-12 type-only LOC на модуль. Альтернатива с прямой зависимостью от PL дешевле сейчас, но при каждом `settings-v2` требует правок в application-слое сотен модулей.
2. **SRP источника.** Нормально: commit, индекс и доставка разделяют один инвариант (атомарная регистрация плюс дедупликация); выносить индекс до второго источника - YAGNI. Плохо другое: write authority и пробы на том же объекте (A10, A12). Владельцы: в варианте 2 модель «владелец - unsubscribe→drain→verify, заёмщик - `SettingsView`» верна, но в ней дыры A1 и A5. В вариантах 1/3 владение номинальное (A2, A13). Host при сбое сборки владение теряет (A9).
3. **OCP/ISP/LSP.** Новый вид хука (health) - это новый PL-файл, новая capability в `C` (все handles перепроверяются, passive-код не меняется) и owner-обёртка; для варианта 1/3 ещё и новый hub. Общего `HookKind` нет - хорошо. ISP: A7. `SettingsConsumerV1` слабый: в нём смешаны три обязанности (borrow, delivery, drain), а lifecycle навешан на класс (A5, A6). LSP: `RunningDerivation.unsubscribe` не гарантирует постусловие `Detachable` без отдельного `drain`.
4. **DRY/YAGNI.** Опасное дублирование - A11. Преждевременное - вариант 3 в V1 и `SettingsSourceId` без проверки. Допустимое - два маленьких revision-guard.
5. **Скрытые registry, bag, cast.** Глобального состояния нет. `owners/errors` локальны. Есть один обоснованный проекционный cast (`in-memory-settings-source.ts:23`), и он не в wiring. Опечатка токена отклоняется в `bindFactory` (VERIFIED). `HostContext` получают только `owned`-модули - это не bag.

## Что сделано правильно

- Пассивные модули не тронуты.
- Callback-и типизированы `=> undefined`.
- Порты `RatesPort`/`TaxRulesPort` объявлены consumer-owned.
- Owner передаётся через замыкание фабрики, `FactoryContext` не изменён.
- Ключевой индекс с дедупликацией проверен через `registrationVisits`.
- Replay в `settingsApplier` закрывает окно между `read` и `attach`.
- Обратный порядок cleanup соблюдён.
- `any` нет.

## Топ-3 дефолта

| # | Вариант | 🎯 | 🛡️ | 🧠 | LOC |
|---|---|---:|---:|---:|---|
| 1 | **Вариант 2 с исправлениями** (рекомендуется): структурный consumer-owned порт, per-instance owner, единый `ownObservation`, `view.admits`, синхронный путь без lane | 7 | 8 | 4 | prod 180-260; на участника 10-25 sync / 30-45 async; тесты 300-450 |
| 2 | Вариант 1 с исправлениями: экзистенциальный spec, `observe` вызывает только Host, проверка полноты привязок; только для синхронных редких обновлений | 6 | 7 | 3 | prod 90-140 + 15-25; на участника 3-5 |
| 3 | Вариант 3: только после extraction trigger и successor ADR, с `report` и проверкой полноты | 4 | 6 | 6 | prod 300-450 |

Почему первый: пропуск привязки ловится на этапе сборки (e10), cleanup живёт вместе с instance, центрального узла нет, и это прямо соответствует research п.2/п.6 и resource plan «per module instance». Главный риск: per-instance owner зависит от ещё не принятого `@get-modular/ownership` (resource plan:9). Если successor не примут, лучше вариант 2 из таблицы: ему нужен один owner у hub.

## Патчи (проверены: 17/17 PASS, e4/e5/e8/e9/e11 исправлены, tsc 7.0.2 и 5.9.3 чисты)

```ts
// features/settings/composition/own-observation.ts - заменяет 3 копии (A1, A11)
export function ownObservation<H extends Detachable>(resources: ResourceAuthor, label: string, steps: Readonly<{
  observe: () => H; afterObserve?: (h: H) => undefined; settle?: (h: H) => Promise<void>;
}>): Promise<H> {
  let cell: H | undefined;
  return resources.setup<H>({
    setup: () => { const h = steps.observe(); cell = h; steps.afterObserve?.(h); return h; },
    cleanup: async () => {
      if (cell === undefined) return RELEASED;
      cell.unsubscribe(); await steps.settle?.(cell);
      return cell.isAttached() ? unresolved(new Error(`${label}: still attached`)) : RELEASED;
    },
  });
}
```
```ts
// A5: SettingsView + источник + guard-ы
admits(revision: number): boolean;                                   // settings-v1.ts
admits: (revision) => attached && revision === latest,               // in-memory-settings-source.ts
isCurrent: (revision) => this.#view?.admits(revision) === true,      // price-table.ts
```
```ts
// A4: latest-derivation.ts
const publish = (job: Job<I>, outcome: () => undefined): void => {
  if (!open || !spec.isCurrent(job.revision)) return;
  try { outcome(); } catch (cause) { spec.report(cause); }
}; // + убрать повторный .catch(... spec.fail ...)
```
```ts
// A2: участник отдаёт данные, а не получает порт (patch-applier.ts)
export interface SettingsApplierV1 {
  open<R>(visit: <const Keys extends SettingsKeys>(spec: Readonly<{
    keys: Keys; initial: SettingsSnapshot<Keys[number]>; apply: (n: SettingsSnapshot<Keys[number]>) => undefined;
  }>) => R): R;
}
```
```ts
// A3: composition.ts, из того же массива declarations
for (const [capabilityId, hub, slotId] of hubs) {
  const bound = new Set(profileBindings.find((b) => b.consumerImplementationId === hub && b.slotId === slotId)?.providerImplementationIds ?? []);
  const unbound = declarations.filter((d) => d.provides.some((p) => p.capabilityId === capabilityId) && !bound.has(d.implementationId));
  if (unbound.length > 0) throw new Error(`${capabilityId} providers not bound to ${hub}: …`);
}
```
```ts
// A9: при неуспехе run() Host освобождает созданных owners
if (outcome.status !== "succeeded")
  throw new AggregateError([outcome.status === "failed" ? outcome.cause : outcome.reason], "construction failed", { cause: await cleanupAll() });
```
Оставшиеся правки без кода:
- A6: application объявляет свой порт (`patch-consumer-port.ts`) и доменные методы, а связку с PL делает feature composition.
- A7/A8: разнести PL по файлам (`settings-read-v1.ts`, `settings-observation-v1.ts`), helper-ы перенести в `features/settings/composition/`, вариант 3 из V1 убрать.
- A10: отдавать замороженные фасеты `{ read: (k) => source.read(k) }` и проверять `source` в guard.
