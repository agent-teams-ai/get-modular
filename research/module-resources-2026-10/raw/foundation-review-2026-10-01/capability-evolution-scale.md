# Эволюция capability-контрактов под ростом: стресс-тест

Дата: 2026-10-01. Линза: scale adversary. База: get-modular `9c722ce` (Core/Assembly 0.2.0), agent-runtime `origin/main` `b0bcb265`.
Эксперименты: Node v26.9.0, tsc7 7.0.2, опубликованные tarball 0.2.0; файлы `scratchpad/foundation/capevo-scale/exp1-4.ts`.

## 1. Что есть сейчас (проверено)

- Wire: `compatibility = {family:"exact", familyVersion:1, token}` в provides, slots и строках плана (`packages/core/src/features/authoring/wire-types.ts:11-15,18-23,62-66`). Схема допускает только эти константы (`input-admission/document-shape.ts:52-54`, `architecture/contracts/v1/composition.schema.json:33-37`).
- Предикат: провайдер ищется по `capabilityId` (`composition-semantics/binding-record.ts:48`), затем только равенство token (`:56`). Одна запись на `capabilityId` в декларации (`declaration-census.ts:72-78`). Один implementation на `moduleId` в профиле (ADR-0004:62).
- Типы: `CapabilityContract<V, Token>` с зашитым `family:"exact"` (`packages/assembly/src/features/construction/types.ts:3-7`). `C` индексируется по `capabilityId`, поэтому на один id приходится один token и один тип значения. Декларация сверяется с `C` взаимной присваиваемостью (`types.ts:37-38`). Фабрика обязана вернуть каждый объявленный ключ (`run.ts:46-49`).
- Форма compatibility повторена ещё в деталях диагностики (`diagnostic-types.ts:105-115`), Assembly snapshot (`snapshot.ts:64-67`), сравнении плана (`prepare.ts:29`) и 6 внутренних декларациях self-composition. Смена семейства означает новое «поколение» артефактов по образцу ADR-0021 (ledger из 30 артефактов, `architecture/qualification/generation-two` весит 3,4 МБ).
- Заметка от 2026-09-04 частично устарела. Путь миграции **задокументирован** (коммит `2189b0a`, `mvp-implementation-roadmap.md:898-943`): новый `capabilityId` и token, провайдер может объявить оба id, отдельный модуль, если их нельзя совместить, удаление после инвентаризации Host; на этот раздел ссылается `consumer-quickstart.md:140`. Но в Consumer Module Standard правил эволюции нет. Там есть только «IDs и tokens в одном локальном typed source» (`common-assembly.md:88`), то есть у каждого потребителя своя копия token.
- Реальный потребитель: agent-runtime использует **общий token на группу**. Это `agent-runtime/setup-v1` на 8 capability (`embedded-runtime/src/composition/runtime-setup-assembly.ts:34-43`) и `agent-runtime/ordinary-v1` на 10 (`.../ordinary-runtime-assembly.ts:7-40`). По сути это host-wide версия, которую наш же анализ называет антипаттерном (`reference/get-modular-openclaw-20260912/research/lessons-and-antipatterns.md:39`).

Эксперимент `exp1.ts` на реальных пакетах:
- двойное предоставление (`acme/logger/v1` и `acme/logger/v2` в одной декларации, старый и новый потребитель) даёт `ok: true`, run `succeeded`, tsc7 без ошибок;
- смена token на месте даёт `binding.compatibility-mismatch` каждому старому потребителю;
- аддитивное изменение без смены token: Core возвращает `ok: true` даже для провайдера без нового метода.

## 2. Три года роста: где ломается

500 модулей, 20 команд, 5+ репозиториев с независимыми релизами, сторонние плагины.

| # | Сценарий | Текущий GM | Где ломается |
|---|---|---|---|
| 1 | Logger добавляет `child()`. 120 потребителей в 4 репо, новый метод нужен пятерым | Без смены token Core старый провайдер не отличит. Совместно компилируемый Host поймает ошибку через TS, а предкомпилированный плагин упадёт с `TypeError` в рантайме. Со сменой token 120 mismatch, то есть flag day. Новый id на каждую ревизию (COM-стиль) копит N записей provides и N ключей в каждом провайдере | Нельзя выразить «ревизия не ниже N» |
| 2 | Ломающее изменение, провайдер год обслуживает и старых, и новых | Работает: два id в одной декларации | Нет сигнала, кто ещё сидит на старом id |
| 3 | Одна команда ломает 1 из 10 контрактов под общим token | Либо bump всех 10 (flag day для 9 непричастных), либо token перестаёт что-либо значить | Общий token |
| 4 | Пять репо держат свои копии token одного контракта | Расхождение всплывает, только когда копии встретятся в одном профиле | У descriptor нет владельца |
| 5 | `storage` разделяется на `blob` и `kv` | Новые id. Провайдер отдаёт старый и новые id, либо работает adapter-модуль: slot на новый id, provides старого. Это обычный модуль, GM менять не нужно | Накопление legacy, если удаление никто не принуждает |
| 6 | Контракт `http` раскрывает в сигнатурах тип logger, logger ломается | Каскад: ломаются все контракты, встроившие тип (аналог OSGi `uses`) | Связность типов |
| 7 | Плагин объявляет ревизию, которую не реализует | Декларация — это данные, Core проверить их не может | Нужны Host admission и поведенческие тесты |
| 8 | Депрекация | В Core нет warning: любой диагностик блокирует план (ADR-0005) | Сигнал должен жить вне Core |

Как с этим не справились другие (факты):
- **OSGi**: для сборки против 2.1.4 диапазон провайдера `[2.1,2.2)`, потребителя `[2.1,3)` ([whitepaper](https://docs.osgi.org/whitepaper/semantic-versioning/060-importer-policy.html)). В bnd это значения по умолчанию `-provider-policy: ${range;[==,=+)}` и `-consumer-policy: ${range;[==,+)}` ([bnd](https://bnd.bndtools.org/chapters/170-versioning.html)). Цена диапазонов и раскрытия типов — `uses`: «introduced so that OSGi could diagnose the above kinds of type mismatches during bundle resolution» ([Spring](https://spring.io/blog/2008/10/20/understanding-the-osgi-uses-directive/)).
- **Go**: «If an old package and a new package have the same import path, the new package must be backwards compatible with the old package» ([rsc](https://research.swtch.com/vgo-import)). Там же: «the version selection problem is NP-complete», выход из этого — «a dependency can only specify a minimum version» ([rsc](https://research.swtch.com/version-sat)).
- **npm**: «accidentally end up with two copies of the react package» ломает идентичность по объекту ([React](https://react.dev/warnings/invalid-hook-call-warning)).
- **Module Federation**: при `singleton` «the highest semantic version is used» и система только «warns when the chosen version does not satisfy a consumer» ([webpack](https://webpack.js.org/plugins/module-federation-plugin/)).
- **Kubernetes**: «API elements may only be removed by incrementing the version of the API group». Deprecated-запросы получают `Warning` и метрику `apiserver_requested_deprecated_apis` ([policy](https://kubernetes.io/docs/reference/using-api/deprecation-policy/)). Ingress `extensions/v1beta1` перестал обслуживаться в v1.22, а `networking.k8s.io/v1` был доступен с v1.19 ([guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/)).
- **COM**: «They must be immutable. Once they are created and published, no part of their definition may change» ([Microsoft](https://learn.microsoft.com/en-us/windows/win32/com/interface-design-rules)).

Вывод: GM **проверяет** явные bindings, а **не подбирает** провайдеров. Поэтому NP-полнота и `uses`-ад GM не грозят, и предикат «не ниже» стоит O(1) на ребро. Дорогое у других — подбор, верхние границы и warning вместо отказа. Это и не нужно копировать.

## 3. Три варианта

### A. Только exact плюс дисциплина (COM-стиль)

Wire не меняется. Добавляется descriptor `defineCapability({ id, token })`, token означает линию (major), у каждого контракта свой. Внутри линии допустимы только изменения, совместимые для потребителя, а их проверку берёт на себя TS Host'а. Для плагинов заводится отдельный id на каждую ревизию.

Надёжность 6/10, уверенность 8/10, сложность 2/10. LOC: src ~40, tests ~60, docs ~120.
Ломается на сценарии 1: у плагинов либо молча, либо через накопление id. Каскад из сценария 6 не решает.

### B. Монотонная ревизия внутри линии (рекомендуется)

```ts
// provides:
{ capabilityId: "acme/logger", compatibility: { family: "revision", familyVersion: 1, revision: 3 } }
// slots:
{ slotId: "log", capabilityId: "acme/logger",
  compatibility: { family: "revision", familyVersion: 1, minimum: 2 }, cardinality }
// Core: provider.revision >= slot.minimum. Одна проверка на ребро, без подбора и без верхних границ.

export const Logger = defineCapability<{ 1: R1; 2: R2; 3: R3 }>()({ id: "acme/logger", revision: 3 });
provides: [Logger.provided()]                              // фабрика обязана вернуть R3
slots: [Logger.slot("log", required())]                    // minimum = 3: «против чего собран», как в bnd
slots: [Logger.slot("log", required(), { minimum: 1 })]    // явное ослабление, deps получает R1
type _ = MonotonicRevisions<{ 1: R1; 2: R2; 3: R3 }>;      // R(n+1) обязан присваиваться R(n)
```

- Идентичность линии — `capabilityId`. Ломающее изменение заводит новый id (`acme/logger/v2`), это правило Go. B **заменяет** exact, параллельного семейства не будет.
- План хранит требование слота (`minimum`). Реальная ревизия провайдера перепроверяется в prepare (`prepare.ts:146`). Digest остаётся идентичностью графа.
- Диагностика: код `binding.compatibility-mismatch` прежний, меняется форма деталей (`expected.minimum`, `actual.revision`). Неизвестное семейство уже покрыто `schema.invalid-value`. **Новых кодов нет.**
- Проверено в tsc7 (`exp2`, `exp4`): descriptor компилируется, default `minimum` выводится литералом, несуществующая ревизия отклоняется. Сужение параметра внутри линии ловится, причём и в callback'ах, которые реализует потребитель (контравариантность). **Дыра** (`exp3`): при синтаксисе методов TS бивариантен и пропускает ломающее изменение. Поэтому контракты пишутся только через property-функции, это обеспечивает lint `@typescript-eslint/method-signature-style: property` в Foundation.

Надёжность 8/10, уверенность 7/10, сложность 4/10. LOC: src ~130 (Core ~70, Assembly с descriptor ~60), tests ~220, docs/ADR ~220. Основная цена — поколение артефактов (schema, snapshots, vectors, ledger), а не код.

### C. SemVer-диапазоны, подбор и авто-адаптеры (npm/OSGi/MF/K8s conversion)

Слот требует `"^2.1"`, Core сам выбирает провайдера или вставляет зарегистрированный конвертер.

Надёжность 4/10, уверенность 8/10 (в том, что GM это не подходит), сложность 9/10. LOC (оценка, не проверено): src 800-1500, tests 1000+, docs ~400.
Подбор NP-полон. Скрытый выбор нарушает GM-REQ-004/005. Prerelease-семантику уже отверг ADR-0005. Конверсия означает машинерию масштаба apiserver. Отказ.

## 4. Рекомендация: B плюс шов descriptor

Что меняется в GM:
- **ADR**: «Capability lines with monotonic revisions». Заменяет часть ADR-0005 про exact-only и поле compatibility из ADR-0004, всё остальное остаётся в силе.
- **Core**: `wire-types` (3 места), `document-shape` (две формы), `document-snapshot`, предикат `binding-record.ts:56`, детали диагностики, `plan-output`. 6 внутренних деклараций переходят на `revision: 1`. Нужно поколение 3. В authoring добавляется `defineCapability`: только plain data, без брендов `unique symbol`, чтобы дубли пакета контракта не ломали типы (урок npm).
- **Assembly**: `CapabilityContract` становится линией ревизий. `FactoryCapabilities` берётся по объявленной ревизии, `FactoryDependencies` по `minimum` слота. Плюс `snapshot.ts:64-67`, `prepare.ts:29` и type-only `MonotonicRevisions`.
- **Consumer Module Standard**: вместо `common-assembly.md:88` появляется раздел «Capability evolution»:
  1. descriptor принадлежит владельцу контракта и экспортируется из его пакета, Host'ы token не копируют;
  2. каждый контракт ведёт свою линию, общих tokens нет;
  3. внутри линии допустимы только совместимые для потребителя изменения, property-функции и `MonotonicRevisions`;
  4. ломающее изменение означает новый id, миграция через двойное предоставление или adapter-модуль;
  5. контракт не раскрывает value-тип чужого контракта: зависимость оформляется своим slot'ом (против каскада);
  6. депрекация оформляется `@deprecated` на descriptor плюс lint `no-deprecated`, удаление — когда инвентаризация планов показывает ноль bindings;
  7. порядок обновления: сначала провайдеры, потом потребители (как version skew в K8s).
- **Host** отвечает за профили, порядок раскатки, инвентаризацию по репо, сроки удаления, admission плагинов с grants на capability (`roadmap:927-943`) и поведенческую conformance владельца контракта.

## 5. Сейчас и потом

**Сейчас (wire не трогаем):**
1. ADR фиксирует семантику B как единственное будущее семейство, чтобы никто не изобрёл диапазоны.
2. `defineCapability` в нынешней exact-форме, но с API, уже готовым к B (`provided()`/`slot()`), плюс раздел стандарта и lint.
3. agent-runtime: 18 capability под двумя общими tokens переходят на descriptor'ы по контрактам.

**Wire B**: в ближайшее пакетное поколение. Срабатывает первым из трёх триггеров:
- (a) принята любая другая wire-правка (собираем пачку, поколение оплачиваем один раз);
- (b) появился провайдер, собранный отдельно или загружаемый в рантайме без совместной TS-проверки;
- (c) аддитивное изменение контракта, у которого ≥2 независимо релизящихся потребителя.

Откладывать безопасно: благодаря descriptor'ам переход затрагивает только descriptor'ы и GM, а codemod сводится к `token` → `revision: 1` / `minimum: 1`.

**Не делать или отложить:** верхние границы, авто-адаптеры и конверсию, warning в Core, ревизии провайдеров в плане, межрепозиторный инструмент инвентаризации (это Host, когда один контракт собирают ≥2 репо).

**Шов, который нужно оставить сейчас:** декларации никогда не пишут `compatibility` руками, только через descriptor.

## 6. Риски

- **Цена поколения** (главный риск): ритуал вокруг правки больше самого кода. Смягчение — пакетирование правок.
- **Честность**: ревизия — это заявление, плагин может солгать. Защита — Host admission и conformance; GM это не проверит.
- **Бивариантность TS**: без lint ломающие изменения внутри линии проходят молча.
- Консервативный default `minimum` требует обновлять провайдеров раньше потребителей. При нарушении порядка отказ закрытый и с точной диагностикой, но трение будет.
- Двойное предоставление может застрять навсегда. GM делает его видимым, а принуждает к удалению только Host.
- Типы старых ревизий копятся в пакете контракта. Ревизии ниже минимального используемого `minimum` можно удалять, Core это не волнует.
- Если плагины придут раньше триггера, аддитивный разрыв из сценария 1 будет молчаливым.
- Обновление GM меняет digest всех планов. Для 0.x это допустимо, но Host'ам, которые хранят digest как evidence, придётся заново зафиксировать baseline.
