# Критика плана ресурсов: как решения 2026-10-01 живут вместе

Дата: 2026-10-01. Линза: согласованность пакетов, порядок релизов, риск переписывания.
Читал: план реализации (`plan`), дизайн ресурсов (`design`), `README.md` этой папки, 12 ревью,
`lifecycle-hooks-research` (`hooks`), get-modular `9c722ce`. Уверенность по шкале 1-10.

**Коротко.** Механизм ресурсов хороший. Но план выпускает Assembly 0.3.0 отдельно и фиксирует форму
`run()` раньше решения по динамике. Это прямо противоречит решению «одно wire-поколение 0.3.0».

## CRITICAL

**C1. Версия 0.3.0 занимается дважды.** ADR-0030 «admits the public Assembly 0.3.0 manifest with
exactly Core 0.2.0» (`plan:249-250`, `:967-968`), R-1 публикует его первым (`plan:1066-1069`). Решение
владельца: «Одно wire-поколение Core/Assembly 0.3.0» (`README:92,109-111`). Версии npm неизменяемы.
*Сценарий:* после R-1 поколение контрактов становится Core 0.3.0 + Assembly 0.4.0. AR делает две
миграции (`plan:1299-1305`, потом все декларации под `revision`), public-api gate и
квалификационные артефакты оплачиваются дважды, пины CMS у AR/TEST мигрируют дважды.
*Минимальный фикс:* не выпускать GM-3a отдельно. Assembly с `owner` выходит только в общем поезде
0.3.0 с Core 0.3.0 (карта ниже). Уверенность 9.

**C2. Форма run-контракта замораживается до решения Г.** Динамика ещё не решена (`README:95-97,105`),
но в ADR-0030 уже есть раздел «Assembly per-run owner» (`plan:240-251`). Байты ADR пинятся
`fileDigest` (`plan:953-954`), так что принятый ADR можно только заменить новым. Ревью
предлагают три несовместимые формы: `owner: unknown` (`plan:595-598`), `context: X`
(`dynamic-modules-industry:85-90`) и `owner + inputs + bindInput`
(`dynamic-modules-scale:102-110`). `scoped` привязан к первой: `Ctx extends { owner: unknown }`
(`plan:492-495`). *Сценарий:* если выберут `context`, сломаются все вызовы `scoped`, Host-шаблон,
smoke в conformance и текст ADR, нужен ADR-замена и resources 0.2.0. Кроме того, `unknown`
приглашает превратить поле в мешок сервисов (`dynamic-modules-scale:158`).
*Фикс:* убрать раздел Assembly из ADR-0030 в отдельный ADR о run-контракте поколения 0.3.0 и
принять его после final-a/b. В нём зафиксировать: поле означает только родительский scope и
типизировано (`assemblyFor<C, O>`, тогда без owner `run()` не компилируется); `inputs` либо
добавляются сейчас, либо позже отдельным аддитивным полем; общего `context` нет. Уверенность 7.

## HIGH

**H1. Родитель утекает в модуль.** `scoped` передаёт `{ ...context, resources }` (`plan:778`), то есть
и `owner`, корневой `Resources` попытки (в AR это `root.resources`, `plan:1352`). Необёрнутые
pure-фабрики (`plan:825`) получают его напрямую. Это противоречит правилу 3 «ребёнок получает
порты, а не родителя» (`design:26-27`) и строке «не видит родителя» (`plan:70`). *Сценарий:* модуль
регистрирует ресурсы в scope попытки или создаёт соседние scope; после типизации по C2 это
делается одной строкой. Канонический тип `ModuleFactory` с `FactoryContext & X`
(`testing-kit-scale:77-78`) закрепит утечку в сотнях модулей.
*Фикс:* `scoped` отдаёт ровно `{ signal, resources }` (`Omit<Ctx, "owner">`) плюс
`@ts-expect-error ctx.owner` в type-fixture. resources экспортирует `ModuleContext`, Assembly
— `ModuleFactory<C, D, I, X>` поверх `{ signal } & X`. В CMS: owner читают только
composition-обёртки. Уверенность 8.

**H2. conformance рассогласован с ADR-0003 и решениями дня.** ADR-0003 разрешает «conformance to
core only» и задаёт ему цель «fixtures, executable vectors… adapter qualification»
(`0003:35-37,56`). Принятый набросок зависит от core, assembly и resources
(`testing-kit-scale:107`). В нём `smoke({ bind: (api, attempt: Resources) })` снова
захватывает родителя при связывании, а `ContractSuite { token }` опирается на token, который
владелец убрал (`testing-kit-scale:83-86`, `README:91`). Есть и копия пакета: если у conformance
будет своя копия resources, проверка бренда в `scoped` отвергнет owner (`plan:601-605`).
*Фикс:* ADR-замена ADR-0003. conformance — dev-only, core/assembly/resources как
**peerDependencies** (в таблице `LEAF_PACKAGES` GM-1 сразу нужен класс «peer»). smoke делает
prepare один раз и run с новым scope на каждый k, это заодно убирает O(N²) повторных prepare
(`testing-kit-industry:202-205`). Suite ключуется по `capabilityId + revision`. API
проектировать после C2. Уверенность 8.

**H3. Трек hooks/observation устарел относительно решений дня.** Он использует отменённую форму
`scoped(attempt.resources, id, factory)` (`hooks:252`) и token как идентичность контракта
(`hooks:91-92`). Добавляет ребро observation→resources, которого нет в карте пакетов
(`hooks:307-309`, `design:394`). Участников hub собирает автоматически по capability
(`hooks:250`), а это та самая авто-привязка, которую namespace-решение запрещает для плагинов
(`README:42`). *Фикс:* в ревизии 4 переписать на `scoped(name)`, `revision`, peer-ребро и
вывод участников только из гранта Host. Уверенность 8.

**H4. Слово `owner` перегружено.** В wire уже есть `owner: { authority, path }`, навигационная
метка без власти (`core/.../wire-types.ts:8`). В CMS есть «semantic owner» и «resource owner»
(`common-assembly.md:62,307`), у namespace — «владелец контракта». Теперь `run({ owner })`
становится настоящей властью регистрации. Путаница уже случалась: в TEST метку владельца
приняли за аутентификацию (`namespaces-scale:46-47`). *Фикс:* до 0.3.0 назвать поле run по
смыслу (`scope` или `parentScope`) и решить в том же wire-поколении судьбу `owner.authority`
(`namespaces-minimal:77`). Уверенность 7.

## MEDIUM

**M1. Kernel и resources: два автомата состояний и коллизия термина.** У resources «custody с
момента вызова» (`design:117`), у kernel `retainCustody`, и это разные понятия. Синхронизацию
`retired`↔`closed` держит только текстовый рецепт (`plan:1200-1201`). Публичный CMS ссылается на
kernel, но kernel `private: true` (`lifecycle-kernel/package.json:4`), внешний потребитель его
не установит. *Фикс:* в resources переименовать термин в «registration»; сделать один
TEST-сценарий kernel+scope; ссылку на kernel в CMS давать с пометкой «candidate». Уверенность 7.

**M2. Имя модульного scope задаётся руками.** Host пишет `scoped(decl.implementationId, …)`
(`plan:1164,1187`), совпадение имени никто не проверяет. Id содержат `/`, а пути печатают через
`/` (`design:56,294`, `hooks:85-86`), поэтому `attempt/agent-runtime/ordinary/store/conn`
читается неоднозначно. *Фикс:* в Assembly 0.3.0 положить `implementationId` в контекст (Assembly
его знает, см. `CreatedEntry`). Тогда `scoped(factory)` берёт имя сам. `Debt.path` для машин
остаётся массивом, склеивать через `/` запрещено. Если не сделать сейчас, позже это breaking
change всех вызовов. Уверенность 6.

**M3. `checkNamespaces` в Core против будущего grant-checker.** Два пересекающихся API
(`README:41`, `namespaces-scale:126-131`), политика грантов попадает в нейтральный Core
(ADR-0001). *Фикс:* Core экспортирует только предикат границы сегмента; всё, что принимает
гранты, уходит в grant-checker. Уверенность 7.

**M4. Ломающее изменение «на месте» против будущих плагинов.** В декларации одна запись на
`capabilityId` (`declaration-census.ts:72-78`), в Assembly один тип значения на id
(`assembly/.../types.ts:3-7`). Значит, у независимо выпускаемых плагинов нет окна миграции,
только flag day. `compatibleFrom` объявляет провайдер, хотя по namespace-решению это свойство
линии владельца контракта: два провайдера могут разойтись. *Фикс:* `revision` и
`compatibleFrom` держит дескриптор владельца контракта, провайдер объявляет только свою
ревизию; окно для плагинов записать как открытый вопрос в ADR. Уверенность 6.

**M5. Каскад CMS.** Свою правку CMS приносят resources, контракты, namespace, тесты и динамика.
Каждая правка тянет хеш `ownership-checkpoint`, самоссылку `sdk-growth` (`plan:1016-1033`) и
миграцию пинов AR и TEST. *Фикс:* одна ревизия CMS на поколение и одна миграция пинов.
Уверенность 8.

Ниже: экспорт отчёта изолированного плагина. Он сейчас приходит одним непрозрачным `cause`
(Q10). Правило для адаптера: бросать `ScopeCloseError` с десериализованным `report`. API не
меняется.

## Карта пакетов (предложение)

| Пакет | Отвечает | Зависит | Статус |
|---|---|---|---|
| core | декларации, план, digest, предикат revision, граница namespace | — | 0.3.0 |
| assembly | сборка по плану; run-контракт `{signal, scope, implementationId}` | core (exact) | 0.3.0 |
| resources | механизм scope, `scoped` | — | первый релиз в поезде |
| conformance | dev-only kit авторов модулей | peer: core, assembly, resources | после C2 |
| lifecycle-kernel | generation/lease | — | private до dynamic Host |
| observation, grant-checker | позже | peer: resources / типы core | по триггеру |

Циклов нет; «вторая власть» не появляется, пока поле run означает только scope. Все рёбра к
resources только peer: brand, `WeakMap` handles Assembly и токены kernel требуют одной копии.

## Индустрия

| Система | Граница | Вывод для GM |
|---|---|---|
| Effect 4 | «Many previously separate packages have been merged into the core `effect` package» ([MIGRATION](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md)) | Перекос версий между пакетами дорог; нам нужен поезд поколений |
| NestJS | тесты отдельным dev-пакетом: `npm i --save-dev @nestjs/testing` ([docs](https://docs.nestjs.com/fundamentals/testing)); остановкой владеет фреймворк | Разделение как у conformance верное; политику в библиотеку не берём |
| Angular | `TestBed` в entry point `@angular/core/testing` ([API](https://angular.dev/api/core/testing/TestBed)); версии `@angular/*` идут в ногу (не проверено) | Subpath ADR-0003 отверг; выравнивание версий берём |
| OSGi | DS отдельной спецификацией compendium ([DS](https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.component.html)), tracker в core ([tracker](https://docs.osgi.org/specification/osgi.core/7.0.0/util.tracker.html)) | Динамику держит фреймворк; мы сознательно нет |
| Erlang/OTP | `application` в kernel, `supervisor` в stdlib ([supervisor](https://www.erlang.org/doc/apps/stdlib/supervisor.html)); механизм и политика вместе | У нас политику держит Host, это его роль supervisor |
| Backstage | «…available in `@backstage/frontend-test-utils`» ([docs](https://backstage.io/docs/frontend-system/building-plugins/testing)) | Близко к core/assembly/conformance |

Наше разделение «механизм / политика Host» чище, чем у Nest и OTP. Слабее зрелых систем в
двух местах: независимые версии без поезда (Angular, Effect) и хрупкий структурный мост
assembly↔resources.

## Карта релизов

**До кода (только документы):** решение Г; отдельный ADR run-контракта; ADR-0030 без раздела
Assembly; правила namespace; ADR-замена ADR-0003; одна ревизия CMS.

**Поезд 0.3.0 (одна миграция потребителей):**
1. GM-1: таблица admission с классами `public`, `private-candidate`, `peer-deps`.
2. Core 0.3.0: `revision`/`compatibleFrom`, без token, `schemaVersion: 2`, решение по
   `owner.authority`, предикат namespace. Assembly 0.3.0: типы линий, run-контракт, `implementationId`,
   `ModuleFactory`.
3. resources (`scoped(factory)`), conformance, если готов.
4. TEST на упакованных архивах, затем R-1: Core → Assembly → resources → conformance.
5. AR-1 одним PR: версии, переименование namespace, дескрипторы с `revision`, `scoped`, пин CMS.
   Darwin и conformance идут следом, без новых версий GM.

**Позже, аддитивно:** публикация kernel, grant-checker, observation, `inputs`, если Г их отложит.

| Вариант | Надёжность | Уверенность |
|---|---|---|
| **(Рекомендую)** один поезд 0.3.0, resources ждёт wire-поколение | 8 | 7 |
| resources выходит сейчас без правки Assembly (запасной вариант (a), `plan:582`), в поезде resources 0.2.0 ломает около 4 вызовов AR | 7 | 8 |
| план как есть (Assembly 0.3.0 на Core 0.2.0) | 5 | 8 |

## Нужны решения владельца

1. Решение Г до любого кода Assembly: `inputs` сейчас или позже; общий `context` запрещён?
2. Имя и тип поля run (`scope` типизированный вместо `owner: unknown`).
3. Поезд 0.3.0 или вариант (a).
4. Выравнивать ли версии пакетов GM по поколению (первая версия resources = 0.3.0).
5. conformance: peer-зависимости и одна аудитория (авторы модулей или векторы спецификации GM).
6. Кто объявляет `compatibleFrom`: провайдер или владелец контракта.

## Вердикт

Сам механизм resources согласован с остальными решениями. План поставки нет: C1 и C2 приведут к
двум ломающим релизам Assembly и замене ADR-0030. H1 и H4 закрываются за несколько строк, если
сделать их до 0.3.0. После поезда 0.3.0 риск переписывания низкий; без него средний.
