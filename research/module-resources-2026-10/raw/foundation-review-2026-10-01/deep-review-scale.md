# Глубокое ревью: симуляция роста на 3 года

Дата: 2026-10-02. База: get-modular `9c722ce` (Core/Assembly 0.2.0), agent-runtime `origin/main`, принятые решения в
`README.md` этой папки, дизайн и план ресурсов (Q1–Q14), трек hooks (ревизия 4). Повторов уже найденных дефектов нет:
`scoped(parent)`, abandon, утечка scope в модуль, имя `owner`, O(n) слушателей, flag day у плагинов (coherence M4) и
`checkNamespaces` против grant-checker (M3) здесь не разбираются.

Эксперименты: `scratchpad/deep-scale/` (tsc7 7.0.2, Node 26.9.0, опубликованные 0.2.0):
`e1-fragments.ts`, `e2-brand.ts`, `e3-adapter.mjs`, `e4-mixed.ts`. Оценки фикса: надёжность/уверенность из 10.

## CRITICAL

### C1. Типы сборки привязаны к одному глобальному `C`, композицию нельзя разделить между командами и репозиториями

**Сценарий.** 500 модулей, 20 команд, 5 репозиториев. Команда `orders` хочет держать свои `bindFactory` рядом с кодом
и отдавать Host'у готовые handles.

**Где ломается.**
- Brand handle инвариантен по **всей** карте: `readonly [scope]: (capabilities: C) => C`
  (`packages/assembly/src/features/construction/types.ts:12`). TS: при использовании T и на входе, и на выходе
  «`State<Dog>` and `State<Animal>` aren't substitutable».
- `e1`: handle, связанный через `assemblyFor<OrdersCaps>()`, Host с `C = OrdersCaps & Billing` отвергает (TS2322,
  «Property "acme/billing" is missing»). Обобщённый фрагмент `<C extends OrdersCaps>(api: Assembly<C>)` тоже не работает:
  `ValidDeclaration` откладывается, декларация становится `never`, `deps.db.query` не существует. Работает только
  несвязанная фабрика, которую связывает сам Host.
- В production это уже видно. Фича AR импортирует тип Host'а: `ordinary-runtime-assembly.ts:4` берёт
  `RuntimeSetupCapabilities` из `composition/runtime-setup-assembly.ts`, а тот импортирует фичу обратно. Получается
  цикл «фича → корень композиции». Из другого репозитория так не сделать.
- Трек hooks (`evidence/.../scale-dx.md` SD-6, SD-8): корень композиции на 576/1152 модулях занимает 4026/7982 строк,
  TS2590 на ~1156 декларациях в одном литерале, subset-`C` даёт TS2322.

**Какой рефакторинг вызовет.** Предложенные `ModuleFactory<C, D, I, X>` в Assembly 0.3.0 и
`isolate(api: Assembly<C>, …)` в conformance (`testing-kit-scale.md` §3B) закрепят глобальный `C` в типе каждой
экспортируемой фабрики и каждого теста. Когда появится второй репозиторий, придётся переписывать все корни композиции,
все фрагменты и все тесты.

**Минимально сейчас (Assembly 0.3.0, он и так breaking).**
1. Brand handle инвариантен только по capability, которые декларация использует:
   `[uses]: { [K in Used<D> & keyof C]: (c: C[K]) => C[K] }`. `prepare` принимает handle, если каждая общая
   capability имеет **тот же** тип. Набросок `e2`: subset-handle принят, handle со старым типом `acme/db` отвергнут
   по нужной причине. Это ~30–60 строк типов. Стоимость проверки на 500+ handles не проверена.
2. `ModuleFactory` и conformance типизируются собственными контрактами модуля, а не `C` Host'а.
3. В CMS: модульный пакет экспортирует несвязанную единицу `{ declaration, factory }` или фрагмент, связанный своей
   картой. Чужой `C` Host'а модуль не импортирует.

Надёжность 7, уверенность 7.

## HIGH

### H1. Поезд 2 «только wire» не даст ни окна миграции, ни адаптера

**Сценарий.** Capability с 6 реализациями в 3 репозиториях, 10 ревизий, 2 ломающих изменения, независимые релизы.

**Где ломается.**
- `C[capabilityId]` хранит один тип, а `ValidDeclaration` требует взаимного равенства compatibility декларации и
  `C` (`types.ts:22-48`). `e4`: потребитель на старой ревизии и адаптер «slot X@новая → provides X@старая»
  отвергнуты типами. При этом Core тот же адаптер принимает (`e3`: `ok: true`, порядок
  `provider > adapter > old > new`).
- Если поезд 2 поменяет только wire (решение владельца 1 описывает wire, тип не описан; план: «поезд 2 вне плана»),
  проверка `compatibleFrom <= slot <= provider` в совместно компилируемом Host не сработает ни разу. Любая
  декларация с ревизией, отличной от `C`, не скомпилируется.
- Аддитивная ревизия сразу ломает компиляцию всех 6 реализаций в каждом Host, который обновил пакет контракта.
  OSGi формулирует ту же асимметрию так: «the provider of the API must be modified to implement this method»,
  а старые клиенты нового метода не видят.
- После отказа от `/v2` адаптер остаётся **единственным** окном миграции. Без типов по ревизиям его нет.
- Входы run тоже затронуты: декларация входа сама заявляет ревизию, а значение приходит из slot родителя, у
  которого ревизия может быть ниже. Сейчас этого никто не сверяет.

**Рефакторинг.** Переписать все карты `C` во всех репозиториях дважды: при wire-поколении и при исправлении типов.

**Минимально сейчас (в ADR поезда 2, до кода).**
- Контракт описывается как линия ревизий: `{ id, revisions: { 5: V5; 7: V7 } }`.
- `FactoryDependencies` берёт тип по ревизии slot'а.
- `FactoryCapabilities` требует значение, которое удовлетворяет всем ревизиям в `[compatibleFrom, revision]`.
- Адаптер (slot и provides одного id) разрешён и описан в CMS.
- Ревизия входа равна ревизии slot'а родителя.
- `runContractSuite` гоняет набор каждой ревизии окна.

Надёжность 7, уверенность 6.

### H2. Обновление GM требует одновременного перехода всех репозиториев и плагинов

**Сценарий.** 0.3 → 0.4 → 0.5: 500 деклараций в 5 репозиториях и сторонние плагины, собранные под старый GM.

**Где ломается.**
- Формат для автора совпадает с wire. `defineModule` — тождественная функция над wire-типом
  (`core/src/features/authoring/helpers.ts:4`). AR руками пишет `kind`, `schemaVersion: 1` и объект
  `compatibility` в каждой декларации (`ordinary-runtime-assembly.ts:7,23-38`).
- Core принимает только `schemaVersion: 1` (`input-admission/document-shape.ts:72,246-250`). Ревью эволюции
  предлагает `schemaVersion: 2`, «чтобы старые документы падали» (`capability-evolution-industry.md` §4.2).
- Итог: каждое wire-поколение означает правку всех деклараций во всех репозиториях одновременно. Если декларации
  плагинов попадают в Core Host'а, как в сценарии S2 из `namespaces-scale.md`, Host не может обновить GM, пока
  все сторонние авторы не перевыпустят плагины.
- Kubernetes делает иначе: «clients may incrementally migrate… perfectly safe for some clients to use the old version
  while others use the new version» (объекты конвертируются между версиями).

**Минимально сейчас (поезд 2 — последний дешёвый момент).**
- (а) Дескриптор и builder для автора: `capability(id, …)`, `module({ … })` порождают wire. Исходник модуля не
  содержит wire-литералов, поэтому следующие поколения его не трогают.
- (б) Core 0.4 переводит декларации предыдущей схемы во внутреннюю модель на один minor. План всегда выходит в новой
  схеме.
- (в) Механическую миграцию поставлять вместе с релизом, как `ng update` «to adjust their project for a new version of
  your library that introduces breaking changes». Нужна только для того, что не покрывает (а).

Надёжность 7, уверенность 6.

### H3. Пакеты модулей сцеплены с точной парой Core/Assembly и требованием «одна копия»

**Сценарий.** 20 команд публикуют модульные пакеты в npm, Host'ы обновляются в разное время.

**Где ломается.**
- Модуль импортирует runtime `defineModule` из Core и типы из Assembly. Core и Assembly выходят только точной парой
  (`architecture/checks/assembly-admission.mjs:90`), а диапазон `^0.3.0` не включает 0.4.0. Значит, каждый minor GM
  заставляет перевыпустить все модульные пакеты.
- Требование одной копии в процессе есть у brand `scoped()`, у реестра участников observation и у handles Assembly.
  Вторая копия resources из `dependencies` пакета модуля роняет `scoped()`, а `instanceof ScopeClosedError` между
  копиями молча возвращает `false`.
- Схемы кодов ошибок расходятся: `scope-closed`, `assembly.run.*`, `observation.<area>.<reason>`. Трек hooks просил
  решить один раз, план оставил `scope-closed`.

**Минимально сейчас (CMS + README, до публикации resources 0.1.0).**
- GM в модульном пакете только в `peerDependencies`.
- Диапазон перекрывает несколько minor, если поверхность для авторов не менялась. Release notes каждого minor
  явно говорят «authoring surface changed: yes/no».
- Ошибки распознаются по `code`, не через `instanceof`.
- Одна схема кодов `<package>.<area>.<reason>` до первой публикации.
- Позже, когда появится второй репозиторий модулей, можно выделить пакет поверхности для авторов, как у Backstage:
  «All core services are available through the `coreServices` namespace in the `@backstage/backend-plugin-api`
  package».

Надёжность 7, уверенность 6.

## MEDIUM

### M1. Поезд 2 — единственное оплаченное поколение Core, в него надо собрать всё известное

Цена поколения: ADR-0021 — 941 рецепт и ledger на 30 артефактов; коммиты подготовки gen-2 — +948 и +1030 строк.
ADR-0009 требует от Host'ов «total translation maps against `DiagnosticCode`», поэтому любой новый код ломает
компиляцию каждого Host'а. ADR-0031 откладывает пометку входов в план до «a later wire generation», но в поезд 2 её
не включили.

**Сейчас:** в ADR поезда 2 перечислить и закрыть одним поколением:
- ревизии;
- декодер N-1 (H2);
- пометку входов — либо явное «никогда»;
- судьбу `owner.authority`;
- коды ревизий: либо прежний `binding.compatibility-mismatch` с новыми details, либо новые коды.

`checkNamespaces` держать вне Core, в conformance для проверки в CI. Тогда правка правил не тянет пару Core/Assembly
и successor-решение по экспортам. Надёжность 8, уверенность 7.

### M2. Изменчивость по тенантам через профили делает дорогой каждый вариант

При 1 000 тенантов с флагами и плагинами каждый уникальный профиль — это отдельные compile и prepare. Prepare
перекомпилирует план: для DAG из 300 модулей это 15,0 + 18,6 мс и 279 КиБ на заготовку (`dynamic-modules-final-b.md`
§2). Вложенный run не умеет вкладывать вверх. `many`-slot статичен (≤1024 провайдера), участники hub в hooks выводятся
из `many`-slot при компиляции. Позже это превратится в реструктуризацию графов под каждого тенанта.

**Сейчас, в CMS «Dynamic instances»:**
- стабильная базовая заготовка;
- варианты — во вложенных шаблонах со входами или в runtime-реестре, выданном портом;
- ключ кэша Host = digest + идентичность набора фабрик (digest фабрики не покрывает);
- hub hooks живёт по одному на шаблон.

Надёжность 7, уверенность 6.

### M3. Контракты для изолированных плагинов должны переживать RPC

По Q10 плагин живёт в отдельном процессе. Синхронные контракты AR (`RegisterSecrets => boolean`,
`ordinary-runtime-assembly.ts:9`) через процесс не передать. VS Code: параметры «will be 'stringified'
(`JSON.stringify`)… end up as a 'plain old JavaScript object'».

**Сейчас:** правило CMS — контракт, который может стать SPI плагинов, асинхронный, без callbacks и без identity,
данные только plain. В conformance — type-проверка `RemoteSafe<T>`. Иначе при первом плагине такие контракты
придётся переписывать. Надёжность 7, уверенность 5.

## Проверено: можно отложить без рефакторинга

- Параллельная сборка внутри run совместима со `scoped()`: место child занимается при старте, а модуль стартует
  после своих зависимостей. Это вывод, экспериментом не проверено.
- Лимит параллелизма для `order: "concurrent"`, `inspect()` и observer у scope добавляются без поломок.
  Почему висит закрытие, отчёт по abandon уже показывает: `pending` вместе с путём.
- Лимиты Core (4096 деклараций, 1024 roots и элементов `many`) для 500 модулей достаточны.

## Индустрия

| Система | Факт | Вывод |
|---|---|---|
| Effect | при merge слой «requires all the services that both of them require» ([Layers](https://effect.website/docs/requirements-management/layers/)) | части типизированы своими требованиями (C1) |
| TypeScript | инвариантность: «`State<Dog>` and `State<Animal>` aren't substitutable» ([4.7](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html)) | причина C1 |
| OSGi/bnd | провайдер обязан реализовать новый метод, старые клиенты его не видят ([bnd](https://bnd.bndtools.org/chapters/170-versioning.html)) | типы по ревизиям (H1) |
| Kubernetes | несколько версий одновременно с конверсией ([CRD versioning](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definition-versioning/)) | декодер N-1 (H2) |
| Angular | `ng update` для ломающих версий библиотек ([schematics](https://angular.dev/tools/cli/schematics-for-libraries)) | миграции поставляются с релизом (H2) |
| Backstage | плагины берут API из `backend-plugin-api` ([core services](https://backstage.io/docs/backend-system/core-services/index/)) | отдельная поверхность для авторов (H3) |
| VS Code | данные между хостами расширений идут через `JSON.stringify` ([remote](https://code.visualstudio.com/api/advanced-topics/remote-extensions)) | SPI контракты для RPC (M3) |

## Топ-5 изменений сейчас

1. **Assembly 0.3.0:** brand handle по используемым capability; `ModuleFactory` и conformance без глобального `C`;
   правило CMS о несвязанных единицах модулей (C1).
2. **ADR поезда 2 до кода:** типы контрактов по ревизиям, адаптер, ревизия входа от slot родителя, наборы тестов на
   окно ревизий (H1).
3. **Поезд 2:** builder и дескрипторы для авторов плюс декодер схемы N-1 на один minor (H2).
4. **До публикации resources 0.1.0:** правила упаковки модулей (peer-зависимости, диапазоны, флаг «authoring surface
   changed»), коды `<package>.<area>.<reason>`, распознавание по `code` (H3).
5. **Поезд 2 как единственное поколение:** собрать в него всё известное по wire; `checkNamespaces` вынести из Core;
   правила CMS о вариантах тенантов и контрактах SPI (M1–M3).
