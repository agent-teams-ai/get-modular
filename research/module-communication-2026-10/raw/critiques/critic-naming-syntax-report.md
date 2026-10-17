Отчёт критика по неймингу и синтаксису @get-modular/observation (только чтение, ничего не менял).

# 0. Итог

- Механика верная и уже совпадает с моделью владельца «данные вниз, намерения вверх»: писать в источник может только Host (`commit`), модули получают read-only `Reader`. Ломаются слова. `sync`, `derived`, `Hub`, `seal` и «participant» дают Vue-разработчику ассоциации, обратные реальному смыслу.
- Рекомендую схему «Observer». Модель та же, что у DOM `MutationObserver`: создаёшь инертный наблюдатель, потом его подключают. Синтаксис, где модуль отдаёт декларацию как capability (whiteboard), оставить. Но в 0.4/0.5 у него есть неучтённая цена: каждое подключение требует правки корня (F5, P1).
- Сейчас переименование стоит дёшево (VERIFIED `gh pr view` 2026-10-15): PR #153 и #154 OPEN, `packages/observation` на main `7d6535d` нет, ничего не опубликовано. После 0.1.0 и тем более после прихода плагинов это будет breaking minor плюс codemod у каждого потребителя.

# 1. Инвентарь публичных имён

Понятность широкой аудитории по шкале 1-5.

| Имя | 1-5 | Проблема / ложная ассоциация | Вердикт |
|---|---|---|---|
| `@get-modular/observation` | 4 | нет | оставить |
| `participantsFor<V>()` | 2 | «участник» в JS-экосистеме не используется | `observersFor<V>()` (параллель `assemblyFor<C>()`) |
| participant, `Participant<V>`, `ParticipantFactory`, `ParticipantOutcome` | 1 | то же | `Observer<V>`, `ObserverFactory`, `ObserverOutcome` |
| `sync({ initial, apply })` | 1 | Vue `.sync` означает двустороннюю привязку. Vue «sync watcher» срабатывает сразу и без батчинга, у нас доставка позже и со слиянием. Ещё читается как «синхронизировать» | `observer({ since, onChange })` |
| `derived({ keys, derive, apply, fail })` | 2 | Svelte `derived`, Vue и MobX `computed` дают читаемое производное значение. Здесь асинхронный побочный эффект, а возвращается непрозрачный объект | `asyncObserver({ keys, load, onResult, onError })` |
| `apply` | 2 | два смысла: в sync получает снимок (`participants.ts.txt:51`), в derived получает результат (`:57`). Плюс `Function.prototype.apply` | `onChange` / `onResult` |
| `derive` | 3 | звучит как чистое вычисление, а на деле I/O с `signal` | `load` |
| `fail` | 2 | читается как команда «провали» | `onError` |
| `Hub`, `startHub` | 2 | Vue 2 «centralized event hub», которую Vue 3 называет discouraged; Azure Event Hubs, SignalR Hub | `connectObservers()`, возвращает `ConnectedObservers` |
| `Hub.outcomes()` | 3 | отдаёт только первые исходы | `firstOutcomes()` |
| `kind: "ready"` | 3 | спорит с ADR-0034:171-172 («Whether the product is ready stays the Host's decision») | `"ok" \| "failed"` |
| `participantIds` | 2 | массив, параллельный `participants` (F5) | `observerIds` |
| `createKeyedSource`, `KeyedSource` | 3 | жаргон, но точный (подписки по ключам) | оставить |
| `reader`, `Reader`, `read(keys)` | 5 | нет | оставить |
| `Snapshot`, `SnapshotRef` | 5 | `getSnapshot` из `useSyncExternalStore`, ассоциация верная | оставить |
| `revision` | 4 | ждут «значение изменилось», а это номер коммита (ADR-0034:88-89) | оставить и прописать в документации |
| `port`, `ObservationPort`, `observe` | 4 | DOM `observe()`, ассоциация верная | оставить |
| параметр `recordDesired` (`contract.ts.txt:59`) | 1 | непонятно, что это | `onChange` |
| `View.admits(rev)` | 2 | редкое слово | `isCurrent(rev)` (так уже в спеке lane) |
| `commit(patch)` | 4 | Vuex `commit` как единственный путь записи, ассоциация верная | оставить |
| `seal()` | 1 | `Object.seal`: набор ключей фиксирован, «Values of existing properties can still be changed». У источника ключи фиксированы с создания, а `seal()` как раз запрещает запись. Смысл обратный | `close()` (как `BroadcastChannel.close()`) |
| `initial` в sync, `View.initial`, `since` | 2 | три имени на два разных смысла | `since` для «что я уже прочитал» |
| `createLatestDerivation` | 2 | не связано с остальным словарём | `createLatestLoader({ load, isCurrent, onResult, onError, reportError })` |
| коды `observation.participant.*`, `.hub.*`, `.derivation.*` | - | следуют за именами | `observation.observer.*`, `.connect.*`, `.load.*` |

Источники (VERIFIED, загружены сегодня):
- vuejs/v3-migration-guide@0deb640 `src/breaking-changes/v-model.md:15`: «`v-bind`'s `.sync` modifier ... removed». Там же `:77`: «"two-way binding" for a prop».
- vuejs/docs@40aa88a `src/guide/essentials/watchers.md:544`: «a watcher that fires synchronously, before any Vue-managed updates». `:588`: «Sync watchers do not have batching».
- vuejs/v2.vuejs.org@e468cc0 `src/v2/guide/migration.md:793,809`: «use a centralized event hub», `var eventHub = new Vue()`.
- v3-migration-guide `events-api.md:97`: «using a global event bus ... is discouraged».
- sveltejs/svelte@40bb084 `documentation/docs/06-runtime/01-stores.md:142`: «Derives a store from one or more other stores».
- mdn/content@4204940 `object/seal/index.md:10`.

# 2. Схемы нейминга

A. «Observer» (Recommended). Надёжность 8, уверенность 7.
- Словарь: `observersFor<V>()`, `settings.observer({ since, onChange })`, `settings.asyncObserver({ keys, load, onResult, onError })`, `connectObservers()`, `source.close()`. Остальное как в таблице.
- Плюсы:
  - Observer — самый широкий термин: GoF, Java, C#, Android, RxJS, DOM.
  - Модель «создать инертно, потом подключить» один в один повторяет `new MutationObserver(cb)` и `.observe()`.
  - Совпадает с именем пакета и с `observe`.
  - Существительное в имени фабрики подсказывает «это описание», как `z.object()`.
- Минусы:
  - RxJS-разработчик может искать `next/error/complete`.
  - MobX `observer()` в mobx-react делает компонент реактивным. Риск слабый.

B. «Watcher» (Vue-подобная). Надёжность 7, уверенность 6.
- Словарь: `watchersFor`, `watcher({ since, onChange })`, `asyncWatcher(...)`, `startWatchers`.
- Плюсы: самое близкое для владельца. Прямой аналог — опция `watch:` из Options API: «Watchers declared using the `watch` option ... are automatically stopped when the owner component is unmounted» (`watchers.md:615`).
- Минусы:
  - Vue `watch()` подписывает сразу и возвращает stop-функцию, поэтому глагол `watch()` здесь недопустим.
  - Будут искать опции `immediate`, `deep`, `flush`.
  - `derived` ни в коем случае не называть `computed`: `computed` синхронный, чистый и кешируемый.

C. События в стиле VS Code и .NET. Надёжность 6, уверенность 6.
- Словарь: `source.onDidChange(keys, listener, { since }): Disposable`, модуль сам кладёт подписку в `resources`. Хаба нет.
- Плюсы: знакомо по VS Code и `IOptionsMonitor.OnChange`.
- Минусы:
  - Это другой синтаксис, и он отменяет решение владельца 2 (хаб по умолчанию).
  - VS Code типизирует слушатель как `(e: T) => any` (microsoft/vscode@3fb15cb `vscode.d.ts:1766`). Через такой тип проходят async-слушатели, а это проблема API-3.
  - См. F7 про `reportError`.

Нейтральные `listener`/`subscribe` хуже. `listener` ассоциируется с событиями, а не с состоянием. `subscribe()` обещает немедленную подписку.

# 3. Синтаксис: «магия» или предсказуемо

Предсказуемо. Рефлексии нет, неявного контекста нет, opt-in виден в декларации (`SettingsObserver.provide()`), а список наблюдателей виден в строке привязки хаба (`describeWiring`). Это паттерн whiteboard (OSGi, `design.md:233`) и опция `watch:` из Vue Options API. Он снимает проблему, о которой предупреждает сам Vue: watcher, созданный после `await`, «won't be bound to the owner component» (`watchers.md:632`). Фабрики GM асинхронные.

Что новичку действительно непонятно:
1. Имена (раздел 1).
2. От модуля нельзя «перейти к определению» того, кто вызывает callback.
3. Opt-in размазан по 3-5 местам (F5).
4. Callback с телом-выражением, которое возвращает значение, не компилируется (F10).

Моё предложение:
- переименовать по схеме A;
- в JSDoc `observer()` написать: «inert description; nothing subscribes until the Host connects observers; the scope disconnects them»;
- в README добавить раздел «ментальная модель» с тремя аналогиями: Options `watch:`, `MutationObserver`, `IOptionsMonitor.OnChange`;
- в примерах использовать только блочные тела callback;
- на вопрос «кто реагирует на X?» отвечать через `describeWiring`;
- решить F5.

Сравнение с явным `observe()` плюс disposable:

| | Whiteboard (хаб) | Явная подписка |
|---|---|---|
| Строк на модуль | sync ~3, async ~6 | ~8 / ~20 |
| Правка корня и оракула | да, строка `many` (F5) | нет: `required` к единственному провайдеру достраивается сам (ADR-0035:38-39) |
| Утечка при забытом disposer | невозможна | возможна (тип не заставляет) |
| Устаревший async-результат | отсекает пакет | отсекает, только если автор взял `createLatestLoader` |
| Завершение и долги | per-observer, долг назван по id | модуль сообщает о себе сам |
| `reportError` | только у Host | каждому модулю нужен свой слот (F7) |
| Знакомость | средняя (после переименования хорошая) | высокая |

Вывод: whiteboard оставить по умолчанию, явную подписку держать как escape hatch, как владелец и решил 2026-10-01. Надёжность 8, уверенность 7.

# 4. Примеры (схема A, API 0.5.0)

Форма `implement`, `group` и `prepare` взята из `0.5.0-train.md:981-1049`; это ещё не реализовано. Кодом это не компилировал.

```ts
// features/settings/contracts/settings.ts  (чистый TS)
export type AppSettings = { readonly logLevel: "debug" | "info"; readonly region: string; readonly theme: string; readonly auditVerbose: boolean };
export type SettingsCommandsPort = { readonly requestTheme: (theme: string) => "accepted" | "rejected" };

// features/settings/composition/settings.contracts.ts
import { defineContract } from "@get-modular/assembly";
import { observersFor, type ObservationPort, type Observer, type Reader } from "@get-modular/observation";
export const settings = observersFor<AppSettings>();   // типизированный набор без состояния
export const SettingsReader   = defineContract<Reader<AppSettings>>()({ id: "acme/settings/reader", revision: 1 });
export const SettingsPort     = defineContract<ObservationPort<AppSettings>>()({ id: "acme/settings/port", revision: 1 });
export const SettingsObserver = defineContract<Observer<AppSettings>>()({ id: "acme/settings/observer", revision: 1 });
export const SettingsCommands = defineContract<SettingsCommandsPort>()({ id: "acme/settings/commands", revision: 1 });
```

(a) Синхронное применение: логгер меняет уровень.
```ts
// features/logging/composition/logger.declaration.ts
export const loggerDeclaration = declareModule({
  moduleId: "acme/logging/logger", implementationId: "acme/logging/logger/default",
  owner: { authority: "acme", path: ["logging", "logger"] },
  provides: [Logger.provide(), SettingsObserver.provide()],
  slots: [SettingsReader.slot("settings", required())],
});
// features/logging/composition/logger.module.ts
export const logger = implement<LoggingMap>()(loggerDeclaration, async (deps) => {
  const initial = deps.settings.read(["logLevel"]);
  const log = createConsoleLogger(initial.values.logLevel);
  return { instance: log, capabilities: {
    "acme/logging/logger": { write: (line: string) => { log.write(line); } },
    "acme/settings/observer": settings.observer({
      since: initial,                                            // коммит между read и подключением придёт догоняющим
      onChange: ({ values }) => { log.setLevel(values.logLevel); },  // позже, может слить ревизии, идемпотентно
    }),
  } };
});
// features/logging/composition/logging.group.ts
export const logging = group("logging", [logger]);
```

(b) Асинхронный пересчёт с отменой: каталог моделей по региону.
```ts
export const models = implement<CatalogMap>()(modelsDeclaration, async (deps) => {
  const catalog = createModelCatalog();                          // пусто до первого onResult
  return { instance: catalog, capabilities: {
    "acme/catalog/models": { list: () => catalog.list() },
    "acme/settings/observer": settings.asyncObserver({
      keys: ["region"],
      load: ({ region }, signal) => deps.modelsApi.fetchModels(region, signal), // signal срабатывает при замене и при закрытии
      onResult: (list) => { catalog.replace(Object.freeze([...list])); },
      onError: (cause, { revision }) => { catalog.recordFailure(revision, cause); }, // прежний список остаётся
    }),
  } };
});
```

(c) Без реакции на изменения: никакого observer, никакой правки корня.
```ts
export const audit = implement<AuditMap>()(auditDeclaration, async (deps) => {
  const verbose = deps.settings.read(["auditVerbose"]).values.auditVerbose;
  return { instance: undefined, capabilities: { "acme/audit/log": { record: (e: string) => (verbose ? `[v] ${e}` : e) } } };
});
```

(d) Host. Функция адаптера композиции захватывает Host-синглтон (guide 14, `0.5.0-train.md:2212-2215`).
```ts
// composition/settings-host.ts
export function settingsHost(source: KeyedSource<AppSettings>, observerIds: readonly string[], reportError: (c: unknown) => undefined) {
  const sourceEntry = implement<HostMap>()(settingsSourceDeclaration, async () => ({ instance: undefined,
    capabilities: { "acme/settings/reader": source.reader, "acme/settings/port": source.port } }));
  const commands = implement<HostMap>()(settingsCommandsDeclaration, async () => ({ instance: undefined,
    capabilities: { "acme/settings/commands": { requestTheme: (theme: string) => {
      if (!THEMES.has(theme)) return "rejected" as const;        // родитель решает
      source.commit({ theme });                                   // единственный писатель
      return "accepted" as const;
    } } } }));
  const observers = implement<HostMap>()(settingsObserversDeclaration, async (deps, { resources }) => ({
    instance: await connectObservers({ port: deps.port, observers: deps.observers }, { resources, observerIds, reportError }),
    capabilities: {},
  }), scoped);
  return { group: group("settings-host", [sourceEntry, commands, observers]), observers };
}
// composition/app.root.ts
const OBSERVERS = ["acme/catalog/models/default", "acme/logging/logger/default", "acme/ui/theme-picker/default"] as const;
const host = settingsHost(source, OBSERVERS, reportError);
await api.prepare({ profileId: "acme/app", modules: [host.group, logging, catalog, audit, ui], roots: { observers: host.observers },
  bindings: [{ consumerImplementationId: "acme/settings/observers/default", slotId: "observers", providerImplementationIds: OBSERVERS }] });
// жизнь и остановка
source.commit({ logLevel: "debug" });      // наблюдатели получат это в следующей задаче
source.close();                            // было seal()
await closeWithin(attempt.control, 2_000, 2_000);
```

(e) Иерархия: данные вниз, намерения вверх, как Vue `$emit('update:title')` плюс родитель, который «update ... if it wants to» (`v-model.md:77-87`).
```ts
export const themePicker = implement<UiMap>()(themePickerDeclaration, async (deps) => {
  const initial = deps.settings.read(["theme"]);
  const picker = createThemePicker(initial.values.theme);
  return { instance: picker, capabilities: {
    "acme/ui/theme-picker": { pick: (t: string) => deps.commands.requestTheme(t) },              // событие вверх
    "acme/settings/observer": settings.observer({ since: initial, onChange: ({ values }) => { picker.show(values.theme); } }), // данные вниз
  } };
});
```
Как идёт поток: ребёнок вызывает `requestTheme`, родитель проверяет и делает `commit`; в следующей задаче `onChange` получают все наблюдатели, включая самого ребёнка. Пишет только один участник, ревизии монотонны, `commit` нереентерабелен (ADR-0034:145-146). Двусторонней привязки нет.

Вложенные фичи. Та же форма: дочерние фичи импортируют контракты родителя, это восходящие рёбра, они разрешены и не входят в граф циклов (`0.5.0-train.md:486-491`). Но если родитель-модуль сам владеет источником, это расходится с ADR (F9).

События между далёкими модулями (Моё предложение): не делать шину. Использовать тот же whiteboard: контракт `OrderPlacedListener` и слот `many()` у источника события. Альтернатива — общий модуль-посредник, как во Vue: «Siblings can communicate via their parent» (`events-api.md`). Если зависимость опциональна — слот `optional()` с явной строкой `[]` (ADR-0035:53).

# 5. Согласованность: находки

F1. P1, уверенность 9, VERIFIED. Имя `sync` противоречит контракту доставки. ADR-0034:93-94: «Delivery runs in a later task ... may coalesce revisions». У Vue «sync» значит «сразу, без батчинга». Плюс `.sync` как two-way binding. Реакция владельца это подтверждает. Источники: `design.md:50`, ADR-0034:107.

F2. P2, уверенность 8, VERIFIED. У `derived` и `apply` по два значения (`participants.ts.txt:49-59`); подробности в разделе 1.

F3. P2, уверенность 8, VERIFIED. `Hub` вызывает ассоциацию с global event bus. Владелец сам спрашивает про события между далёкими модулями, так что риск злоупотребления реальный.

F4. P2, уверенность 9, VERIFIED. `seal` (`keyed-source.ts.txt:169`) значит обратное `Object.seal`.

F5. P1, уверенность 8 по фактам и 6 по тяжести. Цена opt-in устарела.
- `design.md:212-213` пишет: «sync participant one call plus one `provides` entry».
- Но ADR-0035:40-41 говорит, что слот `many` без строки валит `prepare`. В 0.5.0 строки живут только в корне и оракуле: «group-level bindings do not exist» (`0.5.0-train.md:2199-2202`), F-4 отложен (`:2404-2405`).
- Итог: каждый новый наблюдатель — это `provide()`, capability, строка в `bindings` корня, строка `rows` оракула и пин.
- Это противоречит цели «LEGO» (`:2209-2211`: «a new sub-feature one line to its parent's group»). Корень становится горячей точкой merge-конфликтов при сотнях модулей, а при плагинах тем более.
- Плюс параллельный массив `participantIds`: зависимости `many` приходят голым массивом (`packages/assembly/src/features/construction/types.ts:126-129`), а при несовпадении бросается ошибка (`hub.ts.txt:37-38`).
- Моё предложение: ADR в Assembly о «собирающем» `many`, например `many({ collect: "all" })`, который достраивается всеми привязанными провайдерами в порядке implementation id. Явный выбор не делается, поэтому GM-REQ-003 это не нарушает. Нужна правка правил оракула. Надёжность 7, уверенность 5. Без этого честно записать в документацию, что opt-in = 3 правки + 2 строки оракула.

F6. P2, уверенность 8, VERIFIED и проверено зондом.
- CMS `common-assembly.md:431-438`: «Declare port members as function-typed properties, not methods».
- Но `Reader.read` и `ObservationPort.observe` объявлены как методы (`contract.ts.txt:33-35`, `:56-62`), а OBS-3:111 использует `Reader<AppSettings>` как тип значения контракта. Lint потребителя это не увидит: тип лежит в node_modules.
- Зонд: `type Reader<in out V> = { readonly read: <const S extends Keys<V>>(keys: S) => ... }` сохраняет инвариантность на tsc 7.0.2 и TS 5.9.3. На 5.8.3 не проверял.

F7. P2, уверенность 7, VERIFIED.
- В 0.5.0 допустим только адаптер `scoped`, и «adds anything but `resources`» запрещено (`0.5.0-train.md:1046-1048`). `ModuleContext` = `{ signal, resources }` (`packages/resources/src/features/scope/types.ts:43`).
- Escape hatch в эскизе получал `reportError` через свою Host-обёртку (`host/composition.ts.txt:91,99-106`), а такая обёртка в 0.5.0 запрещена.
- ADR-0034 и OBS-3 не говорят, откуда модулю брать репортёр. Нужен контракт-слот `ErrorReporter`.

F8. P2, уверенность 9, VERIFIED.
- `0.5.0-train.md:2518` утверждает: «OBS-2 states "every value handed to modules has no prototype methods or accessors"». В OBS-2 (ветка `docs/observation-execution-briefs`, c07e816) такого текста нет: grep `prototype` пуст.
- По сути проверка 0C не сработает (VERIFIED по коду): participant — это `Object.freeze({})` (`participants.ts.txt:42`), reader и port — замороженные литералы со стрелками (`keyed-source.ts.txt:146-147`).
- Это правило нужно явно записать в OBS-2/README, иначе переименованный `class Observer` с методами провалит `smoke`.
- Брифы в целом устарели: REL-2 вышел без observation, а OBS-3 написан на API 0.3.0.

F9. P2, уверенность 8, VERIFIED.
- ADR-0034:86-87: «`commit` and `seal` stay with the Host». `design.md:249`: «Module state change ... Ordinary module port».
- Иерархия владельца, где родитель-модуль передаёт своё изменённое состояние детям, пакетом не покрыта.
- Варианты:
  - (A, Recommended) в 0.1 только Host-источник, «вверх» через command-порт, как в примере (e). Надёжность 8, уверенность 7.
  - (B) поправить ADR: commit/close у владельца источника, то есть у Host или у модуля, создавшего источник в своём scope. Надёжность 7, уверенность 5.
  - (C) обычный порт с callback. Надёжность 6.

F10. P3, уверенность 9, проверено зондом. Колбэк `=> undefined` отвергает тело-выражение, которое возвращает значение. `({ values }) => log.setLevel(...)` не компилируется, если `setLevel` что-то возвращает. Примеры `design.md:302-303` и OBS-3:131-134 работают только потому, что `configure` объявлен как `undefined`. Блочное тело проходит на 7.0.2 и 5.9.3, async отвергается.

Решения владельца: переименования совместимы с «контракты ломаем на месте» и library-first. Противоречия только в F7 и F9.

# 6. Риски и неуверенность

- Самый большой риск — F5. Если не решить его до плагинов, whiteboard масштабируется хуже обещанного, и придётся либо менять Assembly, либо откатываться к явным подпискам.
- ADR-0034 на ветке помечен `status: accepted` (f5a2700), но PR #154 открыт. Переименование — это правка текста до merge с повторным ревью. После merge это будет successor ADR.
- ADR-0034:190: «Participants are not a plugin SPI». Если плагины начнут давать наблюдатели, имя станет плагинным контрактом. Ещё один довод переименовать сейчас.
- Observer или Watcher — вопрос вкуса, пользовательского исследования нет. Уверенность 7 против 6.
- Не проверял:
  - выводит ли TS `V` для `observer()` без набора `observersFor` (ASSUMPTION: нет, поэтому набор оставил);
  - зонд на TS 5.8.3;
  - .NET-цитаты: беру из evidence (`errata.md:31-33`), сам не скачивал;
  - точный формат `inputs` и `bindings` в 0.5.0: примеры приблизительные.
- Готовые библиотеки: дизайн отклонил interop в v1 (`design.md:131-134,154-163`). Словарь можно заимствовать без зависимости. Подробности за отраслевым обзором.

Файлы:
- <workspace>/.worktrees/gm-main-readonly-20261015/research/observation-hooks-2026-10/design.md
- <workspace>/.worktrees/gm-main-readonly-20261015/research/observation-hooks-2026-10/raw/evidence/code-sketch/hooks-sketch-v4/src/lib/observation/{participants,contract,keyed-source,hub}.ts.txt
- <workspace>/.worktrees/get-modular-obs-1-adr/docs/decisions/0034-admit-the-module-change-observation-package.md
- <workspace>/.worktrees/get-modular-observation-docs/research/observation-hooks-2026-10/briefs/{OBS-2-package,OBS-3-standard}.md
- <workspace>/.worktrees/gm-pr172-readonly-20261015/research/module-dx-2026-10/0.5.0-train.md
- <workspace>/.worktrees/gm-main-readonly-20261015/docs/decisions/0035-complete-composition-profiles-in-prepare-and-make-capabilitiesof-linear.md
- <workspace>/.worktrees/gm-main-readonly-20261015/docs/architecture/common-assembly.md
