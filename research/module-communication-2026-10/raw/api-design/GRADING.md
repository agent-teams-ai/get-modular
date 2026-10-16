# Смысловая оценка 12 решений меньшей модели по API `@get-modular/observation` (A / B / C)

Автор: независимый критик (только чтение). Дата: 2026-10-16.
Базовый каталог: `scratchpad/api-shape/`. Мои эксперименты лежат отдельно, в `scratchpad/grading-probe/`
(копии решений и снимок стаба `runtime/`; в `api-shape/` я ничего не менял, кроме записи этого файла).

## 0. Оговорки о данных (читать первыми)

1. **Пока я ревьюил, `api-shape/` менялся.** Прогоны `runs/*` сделаны в 21:14–21:15. После них изменились
   `a-keys/api.d.ts` (21:18:02), `b-snapshot/api.d.ts` (21:17:42), `c-atomic/api.d.ts` (21:18:18),
   `a-keys/type-tests.ts` (21:18:33), `results/*.type-tests.txt`, и появился `runtime/` (21:21 и позже).
   `*/README.md` (21:05) и `tasks/*` (21:02–21:10) после прогонов не менялись.
   Решения я оценивал по той версии, которую видели агенты: README без изменений, `api.d.ts` в том виде,
   в каком я прочитал его в начале сессии. Для A это `since?` (опциональный), что совпадает с README и с решениями.
2. **Текущий A уже другой:** `a-keys/api.d.ts:1` теперь «`since` renamed and required», а `a-keys/api.d.ts:55`
   содержит `readonly changesAfter: ReadSnapshot<NoInfer<K>>;`. При этом README по-прежнему пишет про `since`
   (`a-keys/README.md:11`, `:18-19`, `:39`). Это рассинхрон. На текущем стабе решение
   `runs/a-keys-small-1/a-logger.ts` как есть бросает `observation.snapshot.foreign` (VERIFIED, `grading-probe/logger-scenario.mjs`).
   Значит, прогон A описывает **старый** A.
3. Стаб `runtime/core.ts` тоже менялся во время ревью (md5 менялся, появился переключатель `mutation === "publish-stale"`).
   Номера строк стаба ниже даны по моему снимку `grading-probe/runtime/core.ts` (исходные md5 лежат в `grading-probe/runtime/SOURCE-MD5.txt`).

Обозначения: VERIFIED значит, что я прочитал текст или запустил сценарий и увидел результат. ASSUMPTION значит мой вывод.

## 1. Оценка 12 решений по рубрике

### a-logger

| Пункт | A (`runs/a-keys-small-1/a-logger.ts`) | B (`runs/b-snapshot-small-1/a-logger.ts`) | C (`runs/c-atomic-small-1/a-logger.ts`) |
| --- | --- | --- | --- |
| Изменение между `read` и подпиской не теряется, в том числе при `await` | PASS: `:5` `const first = deps.settings.read(["logLevel"]);`, `:10` `since: first,` | PASS: `:8` `deps.settings.watch(settings, {` | PASS для текущего кода: `:6` `const initial = deps.settings.watch({` атомарен, `await` нет. **Скрытый риск**: см. ниже |
| `resources` передан | PASS `:7` `deps.settings.watch(resources, {` | PASS `:9` `resources,` | PASS `:7` `resources,` |
| Нет записи в наблюдаемый store | PASS (у `ReadonlyStore` нет `set`) | PASS | PASS |
| Обработчик синхронный и идемпотентный | PASS `:12` `sink.setThreshold(values.logLevel);` | PASS `:12` | PASS `:10` |
| Нет TDZ и `x?.`-костылей | PASS | PASS | **FAIL** `:5` `let sink: ConsoleSink \| undefined;`, `:10` `sink?.setThreshold(values.logLevel);`, `:14` `sink = consoleSink;` |

Скрытый риск C я проверил мутацией (VERIFIED, `grading-probe/logger-scenario.mjs`). Добавил одну строку
`await new Promise((r) => setTimeout(r, 10));` между `watch` и `createConsoleSink` и изменил `logLevel` во время этого `await`.
Результат: `[c/a-logger-await] store=error sink=info => LOST UPDATE; reportError=0`. Изменение молча потерялось: `?.` проглотил доставку.
Та же мутация в B (`await` между `read` и `watch`) дала `OK`. В A с `changesAfter` тоже `OK`.
A без `since` на текущем стабе бросает `observation.snapshot.foreign`; на старом A, где `since` был опциональным, это была бы та же молчаливая потеря.

### b-catalog

| Пункт | A | B | C |
| --- | --- | --- | --- |
| Нет своих `AbortController`, `Promise.race` и ручного сравнения | `AbortController` и `race` нет. Есть ручное сравнение регионов: `:23` `const { values } = deps.settings.read(["region"]);`, `:24` `return state.status !== "loading" && state.region === values.region ? state : { status: "loading" };`. **RISK (обоснованный)**: это единственный способ выполнить п. 2 задания на текущем API | PASS | PASS |
| `fetchModels` только в loader | PASS `:9` | PASS `:10` | PASS `:9` |
| «never shows models of an older region…», в том числе пока идёт новый fetch | **PASS** (VERIFIED) | **FAIL** `:22` `current: () => state,` (VERIFIED) | **FAIL** `:21` `current: () => state,` (VERIFIED) |
| Первый запуск не дублируется | PASS | PASS | PASS |
| Фабрика не ждёт fetch | PASS | PASS | PASS |

Сценарий (VERIFIED, `grading-probe/catalog-scenario.mjs`, стаб `runtime/` на ~21:22):
```
[a] us fetch in flight: loading                          [b]/[c] us fetch in flight: ready eu models=eu-1
[a] br chosen, jp resolved late, br in flight: loading   [b]/[c] ... : ready jp models=jp-1
```
Второе окно (jp) создаёт сам стаб: `grading-probe/runtime/core.ts:309`
`open && !controller.signal.aborted && job.revision === lastOffered;`. Он сравнивает результат с последней
**предложенной** задачей, а не с последней ревизией ключей в store. Поэтому результат jp, пришедший после `set({ region: "br" })`,
но до задачи доставки, публикуется. Сравнение с ревизией store его бы отбросило.

### c-pricing-context

| Пункт | A | B | C |
| --- | --- | --- | --- |
| Свой store со своим `resources` и `reportError` | PASS `:9` `{ name: "pricing-context", resources, reportError: deps.errors.report },` | PASS `:15-16` | PASS `:16` |
| Наружу только `readonly()` | PASS `:21` | PASS `:32` | PASS `:21` |
| Нет записи в наблюдаемый store | PASS | PASS | PASS |
| Одна функция маппинга, без расхождения | **RISK**: копия в `:8` и `:16`, сейчас одинаковые | **RISK**: копии `:10-11` и `:24-25` | **RISK**: копии `:15` и `:11` |
| Нет потерянного изменения между чтением и подпиской | PASS `:14` `since: first,` | PASS `:19` `deps.settings.watch(settings, {` | PASS для текущего кода |
| Ручная проверка из `tasks/README.md:50` (`let x \| undefined` и `x?.`) | n/a | n/a | **FAIL** `:6` `let store: Store<PricingContext> \| undefined;`, `:11` `store?.set(...)` |

На стабе (VERIFIED, `grading-probe/pricing-scenario.mjs`) все три дают `currency=EUR vatRate=0.2`. У фасета нет `set` (`writable=false`).
Сбой дочернего подписчика уходит в `deps.errors.report`, а не в `reportError` Host. Эталоны во всех трёх вариантах используют `derive`
(`reference/*/c-pricing-context.ts`), меньшая модель ни в одном варианте этого не сделала.

### d-greeter

A `:5-6`, B `:6-7`, C `:5,9`: только `read`, нет `watch` и `load`, есть `"acme/greeter"`. Во всех трёх **PASS / PASS**.

### Итоги по вариантам

| Вариант | FAIL | RISK | Из них из-за формы API |
| --- | --- | --- | --- |
| A | 0 | 2 (обоснованное ручное сравнение в b-catalog; копия маппинга) | 0 проявилось; скрытый риск в забытом `since` |
| B | 1 (b-catalog: окно со старым регионом) | 1 (копия маппинга) | 0 |
| C | 3 (a-logger `x?.`; b-catalog: окно; c-pricing `store?.`) | 1 (копия маппинга) + `name` опущен в 3 из 3 подписок | 2 FAIL с `?.` + опущенные имена |

Ошибка b-catalog и копия маппинга от варианта **не зависят**. Абзац про `load` в README почти дословно одинаков во всех
трёх вариантах (`a-keys/README.md:25-33`, `b-snapshot/README.md:25-33`, `c-atomic/README.md:26-34`).
То, что агент A заметил окно, а агенты B и C нет, я считаю шумом одного прогона, а не заслугой формы A.

## 2. Что спровоцировала форма API, а что пробелы README

**Форма API**
- C, `let x | undefined` и `x?.`: README прямо предписывает этот приём, `c-atomic/README.md:8`
  `let picker: ThemePicker | undefined;                         // the handler exists before the picker` и `:11` `picker?.show(...)`.
  Типы этого не ловят (`c-atomic/type-tests.ts:49-52`, «NOT CAUGHT»). Одна строка `await` превращает код в молчаливую потерю обновления (VERIFIED).
- C, опциональный `name`: агент опустил его во всех трёх подписках (a-logger `:6-12`, b-catalog `:6-16`, c-pricing `:7-13`).
  На текущем стабе имя по умолчанию равно `keys.join("+")` (`runtime/c-atomic.ts:22,27`), а повтор имени в одном scope бросает
  `observation.watch.duplicate-name`. VERIFIED (`grading-probe/c-default-name.mjs`): `load` и `watch` по `region` в одном модуле
  дают `second default-named subscription threw observation.watch.duplicate-name`. Это ровно та комбинация, которая нужна,
  чтобы обойти пробел с «loading».
- A, опциональный `since` (старый A): в этом прогоне не проявился. Но тест измерял его нечестно: `tools/static-rules.mjs:30`
  регуляркой требует `since:` только для A, а в продакшене такого lint не будет. В текущем A поле стало обязательным
  (`changesAfter`), и риск закрыт.
- B: ошибок из-за формы не нашёл.

**Пробелы README и API, общие для всех вариантов**
- Нет сигнала «начался новый запуск» у `load`, а рецепт README сам содержит ошибку окна. Ту же ошибку содержат все три эталона:
  `reference/a-keys/b-catalog.ts:12`, `reference/b-snapshot/b-catalog.ts:12`, `reference/c-atomic/b-catalog.ts:12` (`current: () => state`).
- Нет рецепта производного store, отсюда копии маппинга во всех вариантах.
- Нет строк импорта, не объяснён `ModuleContext`, туманно сказано про «block body».

**Жалобы агентов, проверка**
- A, «README противоречив насчёт `since`»: **VERIFIED**. `a-keys/README.md:18-19` «Without `since`, such a commit is lost»,
  а пример `load` в `:28-33` идёт без `since`. В старом `api.d.ts` у `LoadSpec` было `since?` с отсылкой «see `WatchSpec.since`»,
  смысл которой для `load` не определён. Текущий A убрал поле из `load` (`a-keys/type-tests.ts:96-97`), а README не обновил.
- A, «не сказано, сбрасывать ли состояние при смене региона в `load`»: **VERIFIED**, и это самая ценная находка прогона.
  Ни в одном README такого текста нет.
- B, «нет импорта `createStore`», «не объяснён `ModuleContext`», «block body против `=> undefined`»: все три **VERIFIED**,
  но относятся ко всем вариантам одинаково (`*/README.md:7` и `:12`, `:21`). Против B они не говорят.
- C, `let x | undefined` и `x?.`: **VERIFIED**, вызвано формой. «Начальное значение считается дважды»: подтверждаю только
  дублирование маппинга, а оно есть во всех трёх вариантах. Отдельного двойного вычисления, специфичного для C, я не нашёл.
  Что именно имел в виду агент, **не знаю**.

## 3. Пробел API у `load`: как показать «loading» вместо моделей старого региона

Факты (VERIFIED):
- В `LoadSpec` всех вариантов есть только `loader`, `onResult` и `onError`. Модуль никак не узнаёт, что запуск устарел.
- Angular, `packages/core/src/resource/api.ts`
  (https://github.com/angular/angular/blob/main/packages/core/src/resource/api.ts):
  «`loading` - The resource is currently loading a new value as a result of a change in its reactive dependencies. `value()` will be `undefined`.»
  и «`reloading` - The resource is currently reloading a fresh value for the same reactive dependencies. `value()` will continue to return
  the previously fetched value during the reloading operation.»
- TanStack Query (https://github.com/TanStack/query/blob/main/docs/framework/react/guides/paginated-queries.md):
  «each new page is treated like a brand new query», то есть по умолчанию данных нет и статус `pending`. Старые данные
  показываются только по явному `placeholderData: keepPreviousData`, и тогда виден флаг `isPlaceholderData`. Из `guides/queries.md`:
  «`isFetching` - In any state, if the query is fetching at any time (including background refetching) `isFetching` will be `true`.»
- Вывод: в индустрии по умолчанию при смене ключа старое значение не показывают. Показ старого значения включают явно и с флагом.

Варианты исправления:

1. **(Recommended) Обязательный `onLoading(snapshot)` в `LoadSpec` плюс отбрасывание результата по ревизии store.**
   Надёжность 8/10, уверенность 7/10.
   Я проверил это на пропатченной копии стаба (VERIFIED, `grading-probe/runtime-patched/`, `catalog-scenario-patched.mjs`):
   окно на время fetch закрылось (`us fetch in flight: loading`, `br … in flight: loading`).
   Остался лаг в одну задачу (`right after set(us), same task: ready eu`). Такой же лаг есть у любого `watch` в этой
   библиотеке, так что он согласован с её моделью.
   Важная деталь: `onLoading` должен вызываться, когда новый запуск **поставлен в очередь**, а не когда стартует `loader`.
   Причина в том, что новый запуск ждёт, пока завершится прерванный (`grading-probe/runtime/core.ts:334`
   `if (open && next !== undefined) start(next);`). Если fetch игнорирует abort, старые модели висели бы всё это время.
   Одно только отбрасывание по ревизии store без `onLoading` не помогает: проверка `catalog-scenario-patched-drop.mjs`
   показывает `ready eu` во время fetch.
   Обязательность нужна по критерию владельца: `() => undefined` для сценария «держать старые данные» пишут явно,
   а забыть поле не даст компилятор.
2. **Состояние ведёт библиотека: `load` возвращает handle с синхронным `current()`, статус считается от ревизии store,
   как `status` у Angular.** Надёжность 9/10, уверенность 5/10. Закрывает даже лаг в одну задачу и убирает ручную
   машину состояний в модуле. Но это заметно больше поверхности (push-уведомления, режим «keep previous») и риск
   превратиться в библиотеку запросов. Пока это не доказано.
3. **Только рецепт в README**: в getter сравнивать `from.revision` с `read(keys).revision`, как по сути сделал агент A.
   Надёжность 5/10, уверенность 8/10. Работает, но рецепт пропустили 2 из 3 агентов меньшей модели и 3 из 3 эталонов.

## 4. Рекомендация

1. **B `b-snapshot` (Recommended): надёжность 8/10, уверенность 7/10.** Ошибок из-за формы нет. Ключи и стартовая ревизия
   не могут разойтись с прочитанным. Естественный порядок «прочитал, создал объект, подписался» без костылей.
   `await` между `read` и `watch` безопасен (VERIFIED мутацией).
2. A в текущей ревизии (`changesAfter` обязателен): надёжность 7/10, уверенность 6/10. По потере обновлений почти так же
   безопасен, но ключи пишутся дважды, есть лишний инвариант «снимок покрывает `keys`», и README сейчас рассинхронизирован.
   Меньшая модель эту ревизию не проверяла.
3. C: надёжность 5/10, уверенность 8/10. Костыль `x?.` предписан README и детерминирован. Одна строка `await` даёт
   молчаливую потерю (VERIFIED). Имена по умолчанию сталкиваются (VERIFIED).

**Точный список правок для B**

API:
1. `LoadSpec`: добавить обязательный `readonly onLoading: (snapshot: S) => undefined`. Контракт: вызывается в задаче
   доставки, когда запуск для более новой ревизии поставлен в очередь, в том числе для первого запуска. Всегда раньше
   `onResult` и `onError` этого запуска, никогда после результата более нового. Имя обсуждаемо (`onLoading`, `onPending`, `onStale`).
2. Семантика `onResult` и `onError`: результат доставляется, только если с ревизии его снимка ни один коммит не трогал ключи.
   Сравнивать с последней ревизией ключей в store (в стабе `latest(keys)`), а не с последней предложенной задачей. Обновить
   `b-snapshot/api.d.ts:71` и `runtime/core.ts` (`isCurrent`).
3. Задокументировать в `watch` и `load`: подписка следует за **всеми** ключами снимка. Читайте ровно те ключи, за которыми
   следите. Тип не меняется.
4. Оставить `name` обязательным. Опыт C в этом прогоне аргумент против опциональности.

README:
5. Добавить строки импорта: `import { createStore, type ReadonlyStore } from "@get-modular/observation";` и
   `import type { ModuleContext } from "@get-modular/resources";`.
6. Одна фраза: `ModuleContext` это `{ signal, resources }`, их даёт Assembly; `resources` это scope модуля.
7. Переписать рецепт `load`: с `onLoading`, плюс фраза «состояние отстаёт от store на одну задачу, как у любого подписчика».
8. Рецепт производного store: одна `derive` для начального значения и `set`, `createStore(..., { name, resources, reportError: deps.errors.report })`,
   наружу `readonly()`.
9. Про обработчик написать прямо: `(n) => { f(n); }` и `() => undefined` компилируются, `(n) => f(n)` нет.
10. Соглашение об именах `"<module>/<purpose>"` и правило уникальности (`observation.watch.duplicate-name`).
11. Для `load(read([...]), …)`: снимок здесь только несёт ключи, первый запуск всегда берёт самые новые значения.

Сам тест:
12. Переписать `tasks/README.md:53` («сравнение регионов вручную означают, что агент не понял `load`»). Сейчас этот пункт
    штрафует единственное решение, которое выполняет `tasks/b-catalog.md:10-11`. Исправить `reference/*/b-catalog.ts`.
    Добавить в `check.sh` сценарный runtime-тест вроде `grading-probe/catalog-scenario.mjs`: компиляция смысловые ошибки не ловит.

## 5. Где одного прогона меньшей модели мало

- По одному агенту на пару (вариант, задание), хотя `tasks/README.md:58` планирует три. Разница A и B на b-catalog это шум:
  текст `load` одинаковый.
- Ни одно задание не требует `await` в фабрике. Поэтому главные риски форм (забытый `since` в A, `await` после `watch` в C)
  агенты не задели, я проверял их мутациями. Нужны задание с асинхронным созданием объекта (`await openSink(level)`)
  и задание, где `watch` и `load` идут по одному ключу в одном модуле (столкновение имён в C).
- Для A `check.sh` подсказывает `since:` регуляркой (`tools/static-rules.mjs:30`). Частоту «забыл `since`» этот прогон измерить не может.
- После прогона API изменился, особенно A, так что этот прогон к текущему A не относится.
- Меньшая модель слабее моделей, которые будут писать продакшен-код. Профиль ошибок может отличаться. Это ASSUMPTION.

## 6. Находки с severity и уверенностью

| # | Severity | Уверенность | Находка | Где |
| --- | --- | --- | --- | --- |
| F1 | P1 | 9 | Рецепт `load` в README и все три эталона показывают модели старого региона, пока идёт новый fetch (VERIFIED на стабе) | `*/README.md` (рецепт `load`), `reference/*/b-catalog.ts:12` |
| F2 | P1 | 8 | В API `load` нет сигнала «новый запуск в очереди»; без ручной проверки в getter требование не выполнить | `b-snapshot/api.d.ts` `LoadSpec` |
| F3 | P1 | 8 | C: костыль `let x \| undefined` и `x?.` предписан README; одна строка `await` даёт молчаливую потерю обновления (VERIFIED) | `c-atomic/README.md:8,11`, `runs/c-atomic-small-1/a-logger.ts:5,10`, `c-pricing-context.ts:6,11` |
| F4 | P2 | 7 | Стаб публикует результат, устаревший относительно store (сравнивает с `lastOffered`) | `grading-probe/runtime/core.ts:309` (снимок) |
| F5 | P2 | 7 | C: `name` опущен в 3 из 3 подписок; имена по умолчанию сталкиваются (`duplicate-name`, VERIFIED) | `runtime/c-atomic.ts:22,27` |
| F6 | P2 | 8 | Пункт рубрики `tasks/README.md:53` штрафует единственное верное решение b-catalog | `tasks/README.md:53` |
| F7 | P2 | 9 | README и `api.d.ts` варианта A разошлись (`since` против `changesAfter`); решения A на текущем стабе бросают ошибку | `a-keys/README.md:11,18-19`, `a-keys/api.d.ts:55` |
| F8 | P3 | 9 | Копия маппинга во всех трёх c-pricing, от варианта не зависит | см. таблицу c-pricing |
| F9 | P3 | 6 | B c-pricing: у store и подписки одно имя `"pricing-context"`, отчёты читать труднее | `runs/b-snapshot-small-1/c-pricing-context.ts:14,21` |
