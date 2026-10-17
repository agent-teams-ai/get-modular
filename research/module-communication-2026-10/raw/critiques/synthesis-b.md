# Синтез B: независимая модель общения модулей Get Modular и red team

Дата: 2026-10-15. Только чтение, ни один репозиторий не менялся. Зонды лежат в `scratchpad/synth-b-probe/`.

Пометки:
- **VERIFIED** — прочитано в файле или коде;
- **MEASURED** — проверено зондом;
- **ASSUMPTION** — мой вывод;
- «Моё предложение:» — мои идеи.

Severity P0–P3, уверенность 1–10.

Пути:
- GM main: `gm-main-readonly-20261015` (далее `main:`);
- ветка ADR-0034: `get-modular-obs-1-adr` (`adr:`);
- брифы: `get-modular-observation-docs` (`briefs:`);
- 0.5.0: `gm-pr172-readonly-20261015` (`dx:`; PR #172 смержен 2026-10-15 17:11, `gh pr view`).

PR #153 и #154 открыты (VERIFIED, `gh pr view`, 2026-10-15).

---

## 0. Вердикт

1. **Честно нужен один новый примитив**: наблюдаемое состояние с одним владельцем (`read` + `watch` + асинхронная загрузка latest-only). Всё остальное в GM уже есть:
   - контракты и слоты `required`/`optional` покрывают запросы и команды в обе стороны;
   - `many` покрывает точки расширения;
   - inputs и пересборка экземпляра покрывают данные при создании и изменения, требующие перезапуска;
   - scopes из `@get-modular/resources` задают время жизни подписок.
2. **Событийный механизм и пакет сейчас — спекулятивная фича.** Потребителя нет. Кроме того, в GM нет транзакций, а сборка идёт последовательно, поэтому in-process событие — самая слабая форма связи: оно теряется при сбое и может уйти до того, как слушатель подписался.
3. **Спор критиков.**
   - Для состояния по фактам прав критик архитектуры: подписка принадлежит scope подписчика. Модель хаба противоречит уже записанным правилам 4 и 6 видения в `AGENTS.md`.
   - Для перечисляемых вкладов (и будущих событий) правильная форма — whiteboard.
   - Оба критика пропустили два факта:
     - (а) в модели подписок модуль, который только слушает, недостижим из корней и требует центральной правки;
     - (б) при вложенных фичах любая строка `many`/`optional` и любой корень в подфиче противоречат черновику FMS. Поэтому F-4 нужен **обеим** моделям.
4. **Главное «не делать»**:
   - projection API для срезов: тот же результат даёт вариантность типов, MEASURED;
   - `many({ collect: "all" })`;
   - `outcomes()` как вход readiness;
   - пакет событий;
   - трассировку.

---

## 1. Моя модель

### 1.1 Сводная таблица

| Направление | Механизм GM | Новое? | Прецедент |
|---|---|---|---|
| Родитель → ребёнок при сборке | `required`-слот на контракт предка (upward use) или `inputs` экземпляра (ADR-0031) | нет | OTP child spec `{M,F,A}`, NestJS `forRoot`, XState `input` |
| Родитель → ребёнок, состояние во время работы | ребёнок вызывает `watch` на порту состояния владельца в своём scope | **да, единственное** | .NET `IOptionsMonitor.OnChange` → `IDisposable`; VS Code `onDidChangeConfiguration` → `Disposable`; Riverpod `ref.listen` + `onDispose` |
| Родитель → ребёнок, изменение «только с перезапуском» | новый экземпляр с новыми inputs, переключить указатель, закрыть старый (`main:docs/architecture/common-assembly.md:329-331`) | нет | OSGi DS без `modified`, Spring `@RefreshScope`, React `key` |
| Родитель → прямой ребёнок, разовая команда | вызов метода контракта прямого ребёнка (downward edge) | нет | single-spa `parcel.update(props)`; Mojo FAQ и TCA: внутри процесса прямой вызов |
| Ребёнок → родитель, намерение | командный порт владельца: контракт ребёнка (output port, родитель реализует) или контракт предка для сервисов поддерева | нет | Clean Architecture Output Port; Akka Typed без `context.parent`; XState `sendTo` через input; TCA delegate; Vue `emit` |
| Ребёнок → родитель при сборке | `provide` в `many` точки расширения родителя | нет, но нужен F-4 | Backstage extension points, Eclipse/VS Code contributions |
| Соседи и далёкие, запрос или команда | `required`/`optional` на типизированный контракт | нет | Spring Modulith provided/required interface; Now in Android api/impl |
| Соседи и далёкие, склеиваемый факт | состояние владельца + `watch` | то же | Kubernetes level-triggered; Redux `subscribe` |
| «Все, кто вносит X» | `many`; порядок строки входит в контракт (`GM-REQ-003`, `order: "profile"`) | нет | Linux cpuhp (явный массив), Drupal `Order::*`, Tapable |
| Несклеиваемое событие | **сейчас ничего**; см. дерево решения в 2.6 | — | — |
| Плагины | порты чтения/наблюдения/команд как inputs или слоты; вклады — строками, сгенерированными из манифеста (F-1) | нет | VS Code contribution points, Backstage `-node`-пакеты |

### 1.2 Примеры

Рабочие имена, окончательный нейминг за критиком имён и синтаксиса.

```ts
// Контрактный пакет владельца (фича settings)
export type ThemeSlice = { readonly theme: string };
export const ThemeState = defineContract<State<ThemeSlice>>()({ id: "acme/settings/theme-state", revision: 1 });
export const SettingsCommands = defineContract<SettingsCommandsPort>()({ id: "acme/settings/commands", revision: 1 });

// Ребёнок: slots [ThemeState.slot("theme", required()), SettingsCommands.slot("commands", required())]
export const createThemePicker: ModuleFactory<Map, typeof decl, Picker, ModuleContext> = async (deps, { resources }) => {
  const initial = deps.theme.read(["theme"]);
  const picker = createPicker(initial.values.theme);
  // Подписка регистрируется в scope модуля: отписка перед drain, debt-путь называет модуль
  await deps.theme.watch(["theme"], ({ values }) => { picker.show(values.theme); },
    { resources, name: "theme", since: initial });
  return { instance: picker, capabilities: {
    "acme/ui/theme-picker": { pick: (t: string) => deps.commands.requestTheme(t) },   // намерение вверх
  } };
};

// Владелец (Host или модуль-лист): единственный писатель
const settings = createState<AppSettings>(initialSettings, { reportError });     // { state, commit, close }
// capability "acme/settings/theme-state": settings.state — State<AppSettings> присваивается State<ThemeSlice>
// requestTheme(t) { if (!THEMES.has(t)) return "rejected"; settings.commit({ theme: t }); return "accepted"; }
```

Точка расширения (whiteboard):

```ts
// Владелец (фича orders): slots [PriceRule.slot("rules", many({ min: 0, max: 64 }))]
// Строка. Сейчас только в корне (dx:0.5.0-train.md:2202), после F-4 — в group фичи orders:
{ consumerImplementationId: "acme/orders/pricing/default", slotId: "rules",
  providerImplementationIds: ["acme/orders/discounts/coupon-rule", "acme/orders/discounts/volume-rule"] }
```

### 1.3 Правила

Каждое правило с прецедентом.

1. **У значения один владелец и один писатель.** Владельцем может быть Host или модуль; остальные получают только фасет `read`/`watch`. Прецеденты: React single source of truth, Piral, Kubernetes spec/status.
2. **Модуль-владелец состояния — лист относительно своих детей.** Оркестратор, который вызывает детей, — отдельный модуль. Иначе Core выдаёт `graph.cycle` (см. 4.1). Прецедент: Flux/Redux, где store не зависит от view.
3. **Согласованная пара — из одного снимка.** Если ребёнку нужны и сырое значение, и производное от него, владелец производного публикует оба в одном commit, например `{ region, catalog }`. Это конструктивная форма правила 2 видения (`AGENTS.md:62`) без computed graph. Прецедент: Redux selectors поверх одного состояния.
4. **Обработчик не делает эха.** Он не вызывает команду, меняющую то, что он наблюдает, даже косвенно. Прецедент: правило Lit «without echo».
5. **Порядок.**
   - Сборка идёт в `dependencyOrder`, освобождение — в обратном порядке.
   - Доставка внутри одного flush идёт в порядке регистрации.
   - Порядок `many` задаётся строкой и входит в контракт.
   - Опираться на побочные эффекты соседнего обработчика того же flush запрещено.
6. **Ошибки.**
   - Каждый обработчик изолирован; ошибка уходит в `reportError` владельца источника с путём scope подписчика.
   - Отказ домена — это результат команды, а не исключение.
   - Сбой сборки — это outcome Assembly.
7. **Async.** Обработчики синхронные (`=> undefined`). Асинхронная реакция идёт через latest-only lane с `AbortSignal`. Источник никогда не ждёт подписчиков. Дедлайны задаёт Host.

### 1.4 Сколько примитивов на самом деле

Существующих четыре:
- контракт и слот;
- `many`;
- input и пересборка экземпляра;
- resource scope.

Нужен один новый: owned state. Отдельный хаб, participants, реестр `participantsFor`, событийный канал и projection API не нужны.

Кроме того, есть **пробел Assembly, не связанный с observation**: F-4, то есть групповые строки и групповые корни (раздел 3.3).

---

## 2. Red team: где консенсус индустрии не переносится на GM

### 2.1 Статическая композиция без живой мутации графа

**Не переносится: whiteboard в версии OSGi.** Он дёшев только при динамическом реестре.
- В OSGi слушатель регистрирует себя сам, источник перечисляет текущие сервисы, а центрального списка нет.
- В GM `many` разрешается один раз в `prepare`. Строка обязательна: «Any other slot without a row (`optional`, `many` ...) fails» (`main:docs/decisions/0035-...md:40-42`, VERIFIED).
- В 0.5.0 строки живут только в корне: «group-level bindings do not exist» (`dx:research/module-dx-2026-10/0.5.0-train.md:2202`, VERIFIED).

Поэтому главный аргумент OSGi-whitepaper за whiteboard (жизненный цикл слушателей) в GM уже закрыт иначе. Правило CMS: «When subscribing to a provider, register the returned disposer in your own scope» (`main:docs/architecture/common-assembly.md:186-187`). Правило 6 задаёт порядок «unsubscribe, drain, close» (`:188-190`).

Плюс GM-специфики:
- статическая сборка с `since` делает состояние неуязвимым для «пропущенных событий до готовности слушателя» (Fastify и Nest);
- в той же последовательной сборке **события** уязвимы, раздел 2.6.

### 2.2 Явные строки привязки

**Не переносится: «multibinding как замена шины».**
- Отчёт называет цитату Guava «сильнейшим первоисточником в пользу схемы Get Modular "слушатели как вклад в many()"» (`scratchpad/ap-section.md:345`).
- Javadoc Guava говорит иначе: «register multiple listeners independently and then request them together as a set (Dagger, Guice, Spring)» (`scratchpad/ap-raw/guava-EventBus.java:40-43`, VERIFIED).
- Ключевое слово — **independently**. Dagger `@IntoSet`, Guice Multibinder и Spring `List<T>` собирают вклады без центрального списка. GM сознательно отверг неявное собирание: «Completing `optional` slots: presence would become an implicit default» (`ADR-0035:88`).
- Та же цитата дальше говорит: «To react to events, we recommend a reactive-streams framework like RxJava», то есть подписку на поток, которым владеет издатель. Это ближе к модели подписок, чем к хабу.

**Severity: P2, уверенность 8, VERIFIED.**

**Не переносится также «optional = используй, если есть».**
- В Angular (`{optional: true}`) и Rollup («handle this silently if it is optional») это поиск.
- В GM `optional` всегда требует явной строки `[]` или провайдера (`common-assembly.md:713-714`). Идея владельца «события через опциональную зависимость» стоит одну строку в корне на каждый слот.

### 2.3 TypeScript в одном процессе

- **Изоляция ошибок — это только `try/catch`.** Обработчик с бесконечным циклом или тяжёлым CPU замораживает всех; вытеснения нет. Модели акторов и OTP (mailbox, supervision, back-pressure, let it crash) не переносятся. Недоверенный код идёт в отдельный runtime: это ADR-0034 «Trust» (`adr:...0034...md:187-190`) и README resources.
- **Типы стираются.** Для отдельно собранных плагинов «typed topics» дают проверку только при компиляции. Отсюда правило одной копии пакета, и оно уже есть для resources (`resources.scoped.invalid-run-scope`, README) и в CMS: «A Host installs one copy of each Get Modular package» (`common-assembly.md:457-458`).
- Поэтому находка критика R3 (participants из другой копии пакета получают отказ) — **не новая проблема**. Это общее правило GM. Severity её стоит снизить до P3.
- **Цикл промисов (A ждёт B, B ждёт A) — тихое зависание без детектора.** Внутри одного плана Core исключает это для фабрик (4.1). Между планами (Host и экземпляр, плагин) не исключает.
- **Async-контекст при отложенной доставке.** MEASURED на Node 26.11.0 (`synth-b-probe/als.mjs`): склеенный flush выполняется в контексте `AsyncLocalStorage` **первого** commit пачки, вывод «flush for A+B runs in context: trace-A». Контекст не теряется, но приписывается не тому. Это следствие склеивания, а не ошибка, см. 4.4.

### 2.4 Транзакций нет

- **Не переносится «события как основной способ связи» из Spring Modulith.** Spring Modulith сам признаёт: асинхронное событие без журнала «is lost, unless each listener actually implements its own safety net». Его спасают Event Publication Registry и транзакция (`scratchpad/research-backend-modular.md:69,79-81`). В GM этого нет и не будет: GM-REQ-013 запрещает durable recovery (`main:docs/requirements/module-system-v1.md:109-112`). Значит, в GM события не могут быть основным каналом: только best-effort уведомления, а надёжность — outbox продукта.
- **Атомарности между источниками нет.** Это non-goal ADR-0034 «cross-source transactions» (`adr:...md:250`). Значения, которые меняются вместе, должны жить в **одном** источнике: один commit — одна ревизия. Это аргумент **против** отдельного источника на срез: вариант D2-B критика архитектуры теряет атомарность. И **за** срезы как типы над одним источником (2.7, 5).

### 2.5 Будущие плагины

- **Плагин не может править центральный список.** Это правило 6 видения: «without rebuilding the Host's plan or editing a central list» (`AGENTS.md:66`, VERIFIED). Хаб со строкой в корне ему не подходит; строки для плагинов генерирует plugin Host из манифестов (F-1, `dx:0.5.0-train.md:2399-2400`).
- **Поведение должно жить на объектах, которые передаёт Host.** Это метод порта `watch`, а не реестр-бренд в копии пакета (`participantsFor` → `WeakMap`, sketch `participants.ts.txt:33-45`).
- **Плюс GM: значения — plain data.** Ссылка: ADR-0034 «Values are plain data» (`adr:...md:80-84`). Снимок поэтому переносим через structured clone, и будущий мост в worker или отдельный процесс реален. Колбэки и participants так не переносятся.
- **Смена набора плагинов — новый план или поколение** (lifecycle-kernel), а не динамическая политика OSGi.

### 2.6 Нужен ли событийный механизм сейчас

**Нет. P1 против немедленной реализации, уверенность 8.**

1. **Потребителя нет.** Скан Agent Runtime: «Verdict: no fitting consumer now» (`main:research/observation-hooks-2026-10/raw/evidence/code-sketch/critic-reports/agent-runtime-consumer-scan.md:7`, VERIFIED). Скан касался изменений настроек, событий не нашлось тоже. Собственное правило: «a package carries only mechanism with a concrete need ... no speculative features» (`AGENTS.md`, раздел Library-first).
2. **GM-специфичная ловушка.**
   - Если слушатель подписывается на порт издателя (модель подписок), издатель собирается **раньше** слушателя: `run` последовательный, в `dependencyOrder` (`common-assembly.md:786-787`). Событие, выпущенное издателем во время сборки, теряется для всех, кто собирается позже. Это ловушка Nest «may be missed» по построению.
   - Для состояния это не проблема: `since` и снимок дают догоняющую доставку.
   - Поэтому, **если** события понадобятся, правильная форма — whiteboard: издатель собирает слушателей через `many` и собирается последним, как в Backstage «all modules ... initialized before the plugin».
   - Модель подписок — для состояния.
3. **Дерево решения вместо механизма (Моё предложение):**
   - можно склеить → состояние + `watch`;
   - нужно действие → команда владельцу (Fowler: «passive-aggressive command» — антипаттерн);
   - нужна доставка при сбое → outbox продукта, вне GM;
   - источник должен перечислить вкладчиков → `many`;
   - остаток (in-process best-effort факт многим) → whiteboard `many` типизированных listener-контрактов. Первый реальный потребитель — повод добавить канал вторым примитивом в тот же пакет.

### 2.7 Ошибки переноса в самих отчётах

- **Цитата Guava** — 2.2.
- **Аргумент критика имён за whiteboard против явной подписки.** Он ссылается на Vue: watcher после `await` «won't be bound to the owner component». В GM неявного контекста нет: `resources` передаётся явно, и дизайн это сам признаёт: «explicit owner handles survive `await`» (`main:research/observation-hooks-2026-10/design.md:237`). Аргумент к GM не относится. P3, уверенность 8.
- **Таблица критика имён «Утечка при забытом disposer: возможна»** верна только для API, где `watch` не требует `resources`. Если `resources` обязателен в сигнатуре, утечка исключена, как и в хабе. Исключение — накопление подписок на каждый запрос внутри долгоживущего scope (4.3).
- **D2-A критика архитектуры (projection, 80–150 LOC)** не нужен (5, пункт 2).

---

## 3. Спор: хаб через `many()` или подписка в scope модуля

### 3.1 Факты за подписку в scope подписчика (критик архитектуры)

| Факт | Источник | Статус |
|---|---|---|
| Видение от 2026-10-15: «Every subscription is owned by the subscriber's scope» | `AGENTS.md:64` | VERIFIED |
| Хаб регистрирует подписки в **своём** `Resources`: «startHub receives ... a Resources facet ... registers drain entries first and subscriptions second» | `adr:...0034...md:114-118` | VERIFIED; прямое противоречие с `AGENTS.md:64` |
| Видение: «without ... editing a central list» | `AGENTS.md:66` | VERIFIED; хаб требует строку в корне |
| `many` отдаёт значения без ID провайдеров, поэтому `participantIds` дублируется в замыкании | `main:packages/assembly/src/features/construction/run.ts:59-60`; `briefs:OBS-3-standard.md:140,147-151` | VERIFIED |
| Хаб получает источник через замыкание, а не через слот: ребра «хаб → источник» нет в плане | `briefs:OBS-3-standard.md:140,145` (slots только `participants`) | VERIFIED |
| Причина отказа ADR от подписок, «settlement is only self-reported and every module repeats about twenty lines», исчезает, если `watch` сам вызывает `resources.setup`: debt-путь называет scope модуля, имя которого задаёт `scoped(implementationId, …)` | `adr:...md:274-276`; resources README «Names form the debt paths» | VERIFIED + ASSUMPTION о форме API |

### 3.2 Факты за хаб (критик имён), которые критик архитектуры не учёл

| Факт | Источник | Статус |
|---|---|---|
| **Чистый слушатель недостижим.** Модуль, который только наблюдает и ничего не отдаёт потребляемого, не попадает в замыкание корней. Core отвергает его как `profile.unreachable-selection`. В модели подписок такой модуль должен быть корнем, то есть нужна центральная правка. В хабе его делает достижимым сам хаб | `main:packages/core/src/features/composition-semantics/semantic-analysis.ts:28-34`; `selected-graph.ts:104-127` (обход от корней к провайдерам) | VERIFIED; **ни один критик не заметил** |
| Порядок доставки в хабе явный (строка), а в модели подписок неявный: порядок регистрации совпадает с порядком сборки (Kahn + min-heap по ASCII ID). Переименование ID молча меняет порядок | `main:packages/core/src/features/composition-semantics/ready-queue.ts:1-2`; sketch `keyed-source.ts.txt:85,111` | VERIFIED |

### 3.3 Общий пробел обеих моделей: вложенные фичи

- Черновик FMS: «Module composition and application composition MUST wire only top-level features» (`dx:research/module-dx-2026-10/fms-nested-features-draft.md:301-302`, VERIFIED).
- Гайд 0.5.0: строки `many`/`optional` только в корне (`dx:0.5.0-train.md:2202`).

Отсюда:
- **хаб**: каждый участник-подфича — это строка в корне с приватным ID;
- **подписки**: чистый слушатель в подфиче вообще невозможен. Корень не может импортировать entry подфичи, а без корня — `unreachable-selection`.

F-4 отложен (`dx:0.5.0-train.md:2404-2405`) и описан только для строк, без корней. **P1, уверенность 7.** Это противоречие внутри одного поезда, не связанное с observation.

### 3.4 Кто прав

**Для состояния (настройки, производные значения) прав критик архитектуры**, уверенность 7.
- Опт-ин живёт в одном месте, в коде модуля.
- Ребро направлено по данным.
- Нет `participantIds` и реестра.
- Плагины и экземпляры не трогают план Host'а.
- Бонус, который он не назвал (ASSUMPTION с опорой на код). Модуль, зависящий от A, собирается после A, поэтому регистрируется после A и получает доставку в том же flush **после** A (sketch `keyed-source.ts.txt:85`). Ромб «B читает состояние A в своём обработчике» внутри одного источника тогда без glitch. В хабе это зависит от того, правильно ли человек упорядочил строку.

**Критик имён прав в двух частных пунктах:**
- whiteboard — верная форма для перечисляемых вкладов и событий (2.6);
- хаб даёт достижимость чистым слушателям.

### 3.5 Третий вариант (Моё предложение)

1. **`watch` на порту состояния владельца**, с обязательным `resources`. Хаба и participants нет. Срезы задаются типами (`out V`, 5, пункт 2).
2. **Whiteboard `many` только там, где источник должен перечислить вкладчиков** (правило 3 видения), плюс F-4. F-4 — это **групповые строки и групповые корни**, которые лежат в group фичи-владельца и в её части оракула. Тогда чистый слушатель подфичи — корень своей группы, и корень приложения его не называет.
3. **Пересборка экземпляра по умолчанию** для изменений «только с перезапуском». `watch` нужен лишь для тех, кто обязан сохранить состояние.

Надёжность 8, уверенность 6. Цена F-4 нигде не измерена (ASSUMPTION: Assembly + Core-neutral, примерно 150–300 LOC).

---

## 4. Риски, проверенные по коду: что реально

| # | Риск | Вердикт | Severity / уверенность | Доказательство |
|---|---|---|---|---|
| 4.1 | Дедлок или цикл upward + downward | **Внутри плана нереален**: любой SCC даёт `graph.cycle` до первой фабрики. **Реален как ошибка сборки**: QN2 разрешает такие циклы на уровне фич («Upward use edges ... are outside that graph», `dx:0.5.0-train.md:488`), но на уровне модулей Core их отвергает. Пример TEST `sessions`/`storage` (`:499-500`) собирается, только если `Journal` отдаёт отдельный модуль-лист. **Реален между планами** (Host и экземпляр через inputs и roots): цикл промисов зависает тихо. В resources задокументирован свой: «A cleanup that awaits close() of its own or an ancestor scope deadlocks» (README) | P2 / 8 | `main:packages/core/src/features/composition-semantics/graph-diagnostics.ts:15-16`; `selected-graph.ts:154` |
| 4.2 | Закон Хайрама на порядке `many()` | **Для самого `many` нереален**: порядок явный и контрактный (`many()` → `order: "profile"`, `packages/core/src/features/authoring/helpers.ts:16-23`; GM-REQ-003). **Реален для хаба**: ADR называет явную строку «deterministic but not part of the contract» (`adr:...md:97-98`), то есть видимое и стабильное, но формально не обещанное. На это будут опираться. **Реален и для подписок**: порядок зависит от ID | P2 / 7 | см. 3.2 |
| 4.3 | Observation как скрытая шина | **Реален в двух формах.** (а) Host-only источник: «`commit` and `seal` stay with the Host» (`adr:...md:86-88`). Всё наблюдаемое состояние уходит в Host, и получается глобальный store, который осуждают single-spa и AWS. (б) Ключ-«событие» (`lastOrderPlaced`): склеивание теряет вхождения. Плюс накопление `watch` на каждый запрос в долгоживущем scope | P2 / 7 | (а) VERIFIED; (б) ASSUMPTION |
| 4.4 | Потеря контекста трассировки | **Не потеря, а неверная атрибуция** у склеенных commit (MEASURED, 2.3). Ревизия в снимке уже коррелирует. Для пачки OTel и так требует span links, а не parent | P3 / 8 | `synth-b-probe/als.mjs` |
| 4.5 | Блокирующая «опциональная» зависимость | **Реален при сборке для любой зависимости, не только `optional`**: `run` последовательный, «An uncooperative pending factory can keep run pending» (`common-assembly.md:850-851`). Во время работы риск есть, только если потребитель ждёт провайдера в критическом пути. Отложенная доставка observation защищает издателя от подписчиков. В стандарт: «`optional` значит "может отсутствовать в этом профиле", а не "неблокирующая"» | P3 / 8 | VERIFIED |
| 4.6 | Glitch на ромбах | **Внутри одного источника за один flush glitch нет**: значения заменяются до доставки (sketch `keyed-source.ts.txt:153-166`). **Реален** между двумя источниками (сырой S1 и производный S2) и при async-производном: окно не меньше одной задачи. Закрывается правилом 1.3.3 (пара в одном commit). **Реален** при чтении чужого состояния в обработчике, если порядок не следует зависимостям (хаб) | P2 / 7 | VERIFIED + ASSUMPTION |
| 4.7 | Эхо и ping-pong через команды | **Реален.** Формулировка видения «never writes the keys it is being notified about» (`AGENTS.md:64`) не покрывает косвенную запись через команду владельца. A наблюдает S1 и командует S2, B наблюдает S2 и командует S1. Это livelock через `setImmediate`: процесс не виснет, но крутит CPU бесконечно. Сходящиеся значения гасит no-op commit по `Object.is` (`keyed-source.ts.txt:154-155`), расходящиеся — нет | P3 / 7 | VERIFIED |

---

## 5. Что НЕ делать сейчас

1. **Пакет `@get-modular/events` и event channel в observation 0.1.** Потребителя нет, плюс 2.6. Записать правило и дерево решения.
2. **Projection API для срезов (D2-A критика архитектуры).** MEASURED на tsc 7.0.2 и TS 5.9.3 (`synth-b-probe/variance.ts`). С аннотацией `out V` у `Reader`/порта `Reader<AppSettings>` присваивается `Reader<ThemeSlice>`. Отвергаются:
   - несвязанный тип;
   - тот же ключ с другим типом;
   - обратное направление;
   - чтение ключа вне среза.

   Срез становится чистым типом контракта потребителя, а Host отдаёт тот же объект. На 5.8.3 (минимум GM) **не проверено**. Сегодня там стоит `in out` (`adr:...md:131-133`): он был введён против дыры TS7 (`design.md:113-115`), которую `out` тоже закрывает на проверенных формах.
3. **`many({ collect: "all" })` (F5 критика имён).** Это неявное собирание, отвергнутое ADR-0035:88. По духу GM-REQ-004 («Capability identity alone MUST NOT select») оно спорно. Корень проблемы решают модель подписок и F-4.
4. **`Hub.outcomes()` и first outcomes как вход readiness.** Потребителя нет; readiness — политика Host (GM-REQ-013).
5. **Реестр `participantsFor`, хаб, `participantIds`.** Не нужны без хаба.
6. **Трассировка, `diagnostics_channel`, OTel creation context, Message History, журнал как в Redux DevTools** (`research-microfrontends-antipatterns.md`, 5.5). Ревизия уже коррелирует; ждать потребителя.
7. **Dev-перемешивание порядка `many`** (research-platforms). Порядок `many` — контракт; для `watch` хватит правила «не опираться на соседний обработчик».
8. **Слот `ErrorReporter` у каждого модуля (F7 критика имён).** Проще так: репортёр принадлежит источнику и задаётся владельцем в `createState`; атрибуция идёт по `name` или пути scope подписчика.
9. **Event Publication Registry или outbox в GM.** Это продукт (GM-REQ-013); здесь согласен с research-backend.
10. **Новые проверки графа вида «подписка без публикации» (Hohpe).** Для `watch` их уже даёт `required`-слот: без провайдера — `binding.missing`.
11. **Порог утечек как у VS Code `leakWarningThreshold`.** Пока P3: дёшево, но потребителя нет.
12. **Валидация, поэтапная раскатка и kill switch настроек (Cloudflare).** Политика Host перед `commit`, не механизм GM.

---

## 6. Ключевые вопросы владельцу

**В1. Какой механизм по умолчанию для «модуль следит за изменениями»?**
- **A (Recommended):** `watch` на порту владельца, привязанный к `resources` модуля. Хаба и participants нет; whiteboard `many` только для перечисляемых вкладов. Надёжность 8, уверенность 7.
- B: оставить хаб (решение 2026-10-01) и добавить F-4 и хелпер Host, собирающий строку. Надёжность 6, уверенность 6. Противоречит `AGENTS.md:64,66`.
- C: в 0.1 никакого живого наблюдения, только пересборка экземпляра, пока не появится реальный потребитель. Надёжность 8, уверенность 5: слабее отвечает на запрос «родитель передаёт изменённое».

**В2. Кто может владеть источником?**
- **A (Recommended):** владелец значения, будь то Host или модуль-лист. Он создаёт источник в своём scope и один делает commit; запросы идут через его командный порт. Надёжность 8, уверенность 7.
- B: только Host, как в ADR-0034; модули публикуют изменения обычными портами, каждый по-своему. Надёжность 6, уверенность 7: зоопарк и глобальный store.
- C: модульных источников нет; родитель толкает прямому ребёнку `configure(next)`. Надёжность 6, уверенность 5: нет склеивания, latest-only и изоляции.

**В3. F-4: групповые строки и корни.**
- **A (Recommended):** в 0.5.0 или сразу после, до первой подфичи с `many`/`optional` или чистым слушателем. Строки и корни живут в group фичи и в её части оракула. Надёжность 8, уверенность 6.
- B: в гайде запретить подфичам `many`/`optional` и чистых слушателей до F-4. Надёжность 7, уверенность 7.
- C: разрешить корню называть ID подфич, поправив черновик FMS. Надёжность 4, уверенность 6: ломает приватность.

**В4. События между далёкими модулями.**
- **A (Recommended):** сейчас только правило и дерево решения (2.6); канал — вторым примитивом observation при первом реальном потребителе, формой whiteboard. Надёжность 8, уверенность 8.
- B: канал в observation 0.1. Надёжность 6, уверенность 5.
- C: отдельный `@get-modular/events`. Надёжность 4, уверенность 7.

**В5. Типы настроек.**
- **A (Recommended):** контракт-срез на потребителя через `out V`, один источник, без runtime-проекции. Надёжность 8, уверенность 6: 5.8.3 не проверен.
- B: projection API. Надёжность 7, уверенность 6.
- C: один `AppSettings` у всех. Надёжность 6, уверенность 8: ломается на плагинах.

---

## 7. Где я не уверен

- **Достижимость чистого слушателя.** Семантика проверена по коду Core. То, что в 0.5.0 корень не может ссылаться на entry подфичи, я вывожу из правил FMS и lint, а не из кода 0.5.0 (он не написан).
- **Вариантность `out V`.** Проверена на 7.0.2 и 5.9.3 на моих упрощённых типах (`Keys`, `Snapshot`), а не на точных типах sketch v4 и не на 5.8.3. Дыра TS7 из `design.md:113-115` может проявиться в других формах сигнатур.
- **Порядок «провайдеры раньше зависящих».** Он выполняется только для подписок, сделанных во время фабрик. Подписка в рантайме или переподписка уходит в конец. Обещать это контрактом я бы не стал.
- **Форма API `watch(…, { resources, name })` и атрибуция.** Отдаёт ли `Resources` путь scope, я не проверял (ASSUMPTION); иначе понадобится явный `name`.
- **`setImmediate` против microtask.** Для UI-потребителей (своё расписание рендера) не измерял. Для Node Host'ов `setImmediate` безопаснее: ping-pong не блокирует I/O.
- **Нужно ли observation само по себе.** Production-потребителя тоже нет (скан Agent Runtime), есть явное исключение владельца (`design.md:22-28`). Я не оспариваю решение, но предлагаю до публикации 0.1.0 расширить OBS-T:
  - один участник-подфича;
  - один экземпляр, наблюдающий через input;
  - один отдельно собранный модуль.

  У критика архитектуры это P3, я повышаю до P2 (уверенность 7).
- **Стоимость F-4.** Не оценивал по коду.

## Файлы

- `<workspace>/AGENTS.md` (раздел Module communication vision, строки 57-70)
- `<workspace>/.worktrees/gm-main-readonly-20261015/docs/architecture/common-assembly.md`
- `<workspace>/.worktrees/gm-main-readonly-20261015/docs/decisions/0035-complete-composition-profiles-in-prepare-and-make-capabilitiesof-linear.md`
- `<workspace>/.worktrees/gm-main-readonly-20261015/packages/core/src/features/composition-semantics/{semantic-analysis,selected-graph,ready-queue,graph-diagnostics}.ts`
- `<workspace>/.worktrees/gm-main-readonly-20261015/packages/core/src/features/authoring/helpers.ts`
- `<workspace>/.worktrees/gm-main-readonly-20261015/packages/assembly/src/features/construction/run.ts`
- `<workspace>/.worktrees/gm-main-readonly-20261015/research/observation-hooks-2026-10/design.md`
- `<workspace>/.worktrees/gm-main-readonly-20261015/research/observation-hooks-2026-10/raw/evidence/code-sketch/hooks-sketch-v4/src/lib/observation/{keyed-source,hub,participants}.ts.txt`
- `<workspace>/.worktrees/gm-main-readonly-20261015/research/observation-hooks-2026-10/raw/evidence/code-sketch/critic-reports/agent-runtime-consumer-scan.md`
- `<workspace>/.worktrees/get-modular-obs-1-adr/docs/decisions/0034-admit-the-module-change-observation-package.md`
- `<workspace>/.worktrees/get-modular-observation-docs/research/observation-hooks-2026-10/briefs/OBS-3-standard.md`
- `<workspace>/.worktrees/gm-pr172-readonly-20261015/research/module-dx-2026-10/0.5.0-train.md`
- `<workspace>/.worktrees/gm-pr172-readonly-20261015/research/module-dx-2026-10/fms-nested-features-draft.md`
- Зонды: `scratchpad/synth-b-probe/{als.mjs,variance.ts}`
