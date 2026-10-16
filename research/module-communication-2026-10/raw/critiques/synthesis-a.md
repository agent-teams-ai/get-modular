# Синтез A: модель общения модулей Get Modular

Дата: 2026-10-15. Автор: независимый критик-архитектор (только чтение; ни один репозиторий не менялся).

Пометки: **VERIFIED** — прочитал сам (файл:строка или цитата из отчёта исследования с URL); **MEASURED** — проверил запуском;
**ASSUMPTION** — мой вывод. Свои идеи помечены «Моё предложение:». Цитаты индустрии взяты из четырёх отчётов
исследования (пути в конце) и там же снабжены URL; здесь даю короткую ссылку на систему.

---

## 0. Вердикт

1. Индустрия разделяет два разных механизма, и GM должен разделить их так же:
   - **подписка во время работы** (изменения состояния и события) почти везде принадлежит времени жизни подписчика:
     Qt (context object, auto-disconnect), IntelliJ `connect(parentDisposable)`, VS Code `Event(listener, thisArgs, disposables)`,
     Riverpod (`ref.listen` без отписки), Angular `DestroyRef`, Bevy, Erlang `pg`, Akka Receptionist. Подписчик при этом
     зависит от контракта издателя (Spring Modulith `EVENT_LISTENER`);
   - **декларативный сбор вкладов** (whiteboard, extension points, contribution points) нужен там, где владелец
     перечисляет вклады и сам решает порядок и политику: OSGi whiteboard, Eclipse, VS Code contributes, Backstage
     extension points, Tapable/Rollup.
2. **Для изменений состояния и для событий: подписка в scope подписчика, не whiteboard-хаб через `many()`.**
   Решающие факты (VERIFIED):
   - в индустрии whiteboard собирает слушателей **без центрального списка**. Guava: "register multiple listeners
     independently and then request them together as a set". В GM `many` без явной строки в корне валит `prepare`
     (ADR-0035:38-42), а групповых строк нет (`0.5.0-train.md:2202`). Автосбор по capability запрещён GM-REQ-004
     (`module-system-v1.md:41-43`: "Capability identity alone MUST NOT select a provider when more than one
     implementation is eligible"). Хаб в GM берёт у whiteboard цену, но не берёт его главное преимущество;
   - CMS уже предписывает подписку в своём scope: "When subscribing to a provider, register the returned disposer in your
     own scope" и порядок "unsubscribe, drain, close" (`common-assembly.md:186-190`). Хаб — исключение из стандарта, а не
     его продолжение;
   - хаб не дотягивается до dynamic instances и плагинов (у них свой план), упирается в 1024 провайдера на строку
     (`common-assembly.md:756`, `OBS-3-standard.md:145`) и заставляет корень называть приватные ID подфич.
3. **Для точек расширения: `many()` с явной упорядоченной строкой** (whiteboard). Здесь явная строка — достоинство:
   порядок осознанный и закреплён оракулом. Чтобы это масштабировалось на вложенные фичи и плагины, нужен F-4
   (строки на уровне группы-владельца) и генерация строк плагинного Host из манифеста (F-1).
4. Иерархию «родитель передаёт изменённое ребёнку» ADR-0034 в текущей редакции не покрывает: "`commit` and `seal` stay
   with the Host" (ADR-0034:87), а "Module state change … Ordinary module port" (`design.md:249`). Владелец источника
   должен иметь право быть модулем (единственным писателем), иначе требование владельца невыполнимо.
5. Из двух предыдущих критиков по сути прав критик архитектуры (D1–D4). Критик имён прав по именам (`sync`,
   `derived`, `Hub`, `seal`, «participant») и по F6/F7/F10, но его схема «Observer» опирается на хаб, а его собственный
   F5 (P1) показывает, что хаб не масштабируется. Предложенный им фикс `many({ collect: "all" })` противоречит
   GM-REQ-004.
6. Итоговая модель — **одно ребро и одно владение**: каждая связь — типизированный контракт и слот, у каждого значения
   один писатель, каждая подписка живёт в scope подписчика. Поверх этого есть два способа доставки (`watch` для
   состояния, `subscribe` для событий) и один способ перечисления (`many` для точек расширения). Команды и запросы —
   обычные вызовы порта, нового механизма для них не нужно.

---

## 1. Каталог практик

Формат: в каждой строке практика и 1–3 источника из отчётов. «Согласие» означает, что независимые экосистемы говорят
одно и то же; «Расхождение» описывает, где мнения расходятся и почему.

### (A) Родитель → ребёнок: конфигурация при сборке и изменения во время работы

**Лучшие практики**

| # | Практика | Источники |
|---|---|---|
| A1 | Конфигурацию и зависимости передавать при создании типизированными аргументами | OTP child spec `{M,F,A}`; Akka параметры `Behavior`; XState `input`; NestJS `register/forRoot` |
| A2 | Данные вниз только для чтения, у значения один владелец | React "single source of truth"; Vue one-way props; Angular `input()` "read-only"; Kubernetes controllers "read-only access to `spec`" |
| A3 | Изменение во время работы — явная подписка на явный источник. Событие говорит, что изменилось, а значение читается из текущего снимка | VS Code `onDidChangeConfiguration` + `affectsConfiguration`; .NET `IOptionsMonitor.OnChange`; Spring `EnvironmentChangeEvent` (список ключей) |
| A4 | Явный выбор «перенастроиться на месте или пересоздаться». По умолчанию модуль либо не видит изменение, либо пересоздаётся | .NET `IOptions<T>`; OSGi DS без `modified`; Spring `@RefreshScope` |
| A5 | Level-based: доставлять последнее состояние со счётчиком ревизий, промежуточные значения можно склеивать | Kubernetes "level-based rather than edge-based", `observedGeneration`; OSGi `getChangeCount()`; Redux "should not expect to see all state changes" |
| A6 | Узкая подписка на свой срез, а не на всю запись | .NET "depend only on the configuration settings that they use"; Flutter `InheritedModel` aspects; Riverpod `select` |
| A7 | Между модулями передавать ID и простые неизменяемые данные, а не объекты | Android "use simple ids"; Akka "Do not pass mutable objects"; Clean Architecture "isolated, simple, data structures" |
| A8 | Изменения применяются по одному, по порядку | OSGi 112.5.14 "must complete activation, or a previous modification"; Config Admin "delivered in order for each listener" |
| A9 | Входящую конфигурацию проверять как недоверенный ввод, раскатывать поэтапно, иметь kill switch | Cloudflare 2025-11-18 "Hardening ingestion…"; Cloudflare 2019 "without a staged rollout" |

Согласие: A1, A2, A3, A5 подтверждают все исследованные экосистемы (фронтенд, бэкенд, акторы, Kubernetes).
Расхождение: синхронная или отложенная доставка (VS Code `fire` и .NET синхронны; OSGi Config Admin и Angular effects
асинхронны); несёт ли событие значение (.NET — да, VS Code и Kubernetes — нет, только «что изменилось»).
Автотрекинг как механизм распространения сама индустрия держит запасным выходом: Angular "Effects should be the last API
you reach for", Svelte "escape hatch", MobX "should rarely be used".

**Худшие практики**

| # | Антипаттерн | Источники |
|---|---|---|
| A-1 | Ребёнок мутирует пропсы или состояние родителя | Vue props "should **not** attempt to mutate a prop"; Flutter "BAD: DO NOT DO THIS"; Angular NG0100 |
| A-2 | Родитель императивно проталкивает данные в дочерний объект | Flutter `cartWidget.updateWith(item)` с пометкой BAD |
| A-3 | Эффекты как механизм распространения состояния | Angular "Avoid using effects for propagation of state changes"; Svelte "avoid using it to synchronise state"; React "You Might Not Need an Effect" |
| A-4 | Перепривязка «на месте» с промежуточным частично обновлённым состоянием | Spring Cloud "a concurrent reader can observe transient, partially-updated state" |
| A-5 | Передача изменяемых значений: мутация на месте невидима | Akka; StateFlow и Spring #1727 (`design.md`, таблица конкурентов) |
| A-6 | Мгновенная глобальная рассылка непроверенной конфигурации | Cloudflare 2019 и 2025 |
| A-7 | Контекст или ambient для всего подряд, лишние scope | React "doesn't mean you should put that information into context"; Hilt "Each component/scope adds cognitive overhead"; Riverpod "scoping … highly complex" |

### (B) Ребёнок → родитель

**Лучшие практики**

| # | Практика | Источники |
|---|---|---|
| B1 | Наверх идёт намерение (колбэк, событие, команда), решает и записывает владелец | Vue `emit`; React "passing down the event handler"; TCA delegate actions; Flutter callbacks |
| B2 | Путь наверх ребёнку передают явно, неявного `parent` нет | Akka "There is no parent in Typed"; XState "Prefer sendTo(...)"; Qt `sender()` "violates the object-oriented principle of modularity" |
| B3 | Ребёнок владеет своим исходящим портом и не знает тип родителя | Clean Architecture "Use Case Output Port"; Akka message adapters; Android dependency inversion |
| B4 | Запрос на изменение отделён от подтверждённого изменения | Fowler Event Collaboration "two kinds of event"; Kubernetes `spec`/`status` с разными правами записи |
| B5 | Вклад ребёнка в родителя при сборке — мейнстрим, а не антипаттерн | Backstage inputs/`attachTo`; Eclipse и VS Code contribution points; OSGi whiteboard |
| B6 | Сбой — сигнал жизненного цикла ближайшему владельцу, ошибка валидации — часть протокола | Akka Fault Tolerance; OTP links/monitors |
| B7 | Запись в чужое состояние только с явного разрешения владельца | Eclipse `declareModifiable`; TCA `withLock` и `SharedReader` |
| B8 | «Без эха»: не сообщать наверх об изменении, которое выставил сам владелец | Lit "When to dispatch an event" |

Согласие: B1–B4 подтверждают UI-фреймворки, акторы и Clean Architecture.
Расхождение: всплытие событий (DOM всплывает; события Vue и Angular нет; Bevy только по opt-in); двусторонняя привязка
как сахар (Vue `v-model`, Angular `model()`) допустима, а в Elm и Redux её нет вовсе.

**Худшие практики**

| # | Антипаттерн | Источники |
|---|---|---|
| B-1 | Настоящая двусторонняя привязка, ребёнок пишет состояние родителя | Vue 2 `.sync` "can create maintenance issues"; Flux "cascading updates"; NG0100 |
| B-2 | Неявный доступ к родителю | XState `sendParent`; Akka Classic `context.parent`; Qt `sender()` |
| B-3 | Родитель подглядывает во внутренние действия ребёнка | TCA "may lead to the parent making assumptions" |
| B-4 | Запись в источник из его же колбэка доставки (повторный вход) | Flux "Cannot dispatch in the middle of a dispatch"; Guava "unintentional reentrant calls"; IntelliJ "Avoid Shared Data Modification from Subscribers" |
| B-5 | Ребёнок обновляет родителя из эффектов | React "the data flow becomes very difficult to trace" |
| B-6 | Политики перезапуска на разных уровнях перемножаются | OTP "the product of the intensity values" |

### (C) Соседи и далёкие модули: запросы, команды, факты, события

**Лучшие практики**

| # | Практика | Источники |
|---|---|---|
| C1 | Общаться как можно меньше; частое общение — признак неверных границ | single-spa "consider merging them"; AWS "revisiting the micro-frontend boundaries"; Cam Jackson "as little as possible" |
| C2 | Зависеть от публичного контракта соседа; граф ацикличен и проверяется | Now in Android api/impl; Spring Modulith `verify()`; Martin ADP |
| C3 | Двусторонняя потребность решается через посредника или общего предка (lift state up) | Android "A mediating module is necessary"; Flutter "Repositories should never be aware of each other"; React "lifting state up" |
| C4 | Запрос — прямой вызов; команда — явная команда; событие — факт. Команду не маскировать под событие | Fowler "passive-aggressive command"; EIP Command/Event/Document Message; Grzybek "Direct Call and Messaging together" |
| C5 | Событие типизировано, принадлежит издателю и документировано; один тип на канал | AWS "The contract is the event definition"; EIP Datatype Channel; Piral known events |
| C6 | Подписка — это зависимость подписчика от контракта издателя, видимая в графе | Spring Modulith `EVENT_LISTENER`; Documenter "listens to"; Hohpe "subscription that does not match any publication may be considered invalid" |
| C7 | Многошаговый процесс оркестрирует владелец или общий предок, а не цепочка событий | Ruecker "avoid these complex peer-to-peer event chains"; Azure Saga orchestration "Avoids cyclic dependencies"; Richardson |
| C8 | Общие данные: один писатель, остальные читают и получают уведомления | Piral `setData` "first one writing data will own"; AWS "opt in for read-only sharing"; Fowler "only one source for each bit of data" |
| C9 | Внутри процесса — прямые вызовы, сообщения — на границах изоляции | Mojo FAQ "Avoid using Mojo for communication that is always within the same process"; TCA Performance |
| C10 | Типизированные ключи вместо строк и путей | Akka `ServiceKey[T]` и отказ от `ActorSelection` |

Согласие: C1–C4, C7, C8.
Расхождение: Spring Modulith ("primary means of interaction should be event publication") и репозиторий Grzybek (только
асинхронные события) против статьи Grzybek, Shopify 2024 и Ruecker (вызовы и события по назначению). AWS рекомендует для
микрофронтендов шину, которой владеет shell, а Guava и Vue выступают против in-process шины. Примирение: у Spring Modulith
события типизированы, видны в графе, трассируются и журналируются; у шины Guava ничего этого нет (`research-microfrontends-antipatterns.md` §4.1).
Проблема не в событиях, а в невидимых и неучтённых событиях.

**Худшие практики**

| # | Антипаттерн | Источники |
|---|---|---|
| C-1 | Глобальная in-process шина, строковые топики | Guava "We recommend against using EventBus"; Vue 3 "maintenance headache"; Eclipse e4 "global bus with no scoping" |
| C-2 | Цепочки событий для бизнес-процесса | Ruecker "Emerging behavior, hard to change"; Fowler Event Cascade; Azure "risk of cyclic dependency" |
| C-3 | Запросы через pub/sub | CodeOpinion (практик); EIP "reply channel … almost always point-to-point" |
| C-4 | Общее изменяемое состояние или глобальный store на всех | single-spa; Fowler IntegrationDatabase; Shopify "Cross-component associations are always violating" |
| C-5 | Циклы между модулями | Shopify 2020 "lots of circular dependencies"; ADP; Android |
| C-6 | Mediator или service locator, общий «junk drawer» | Shopify 2024 "junk drawer"; NestJS "Making everything global is not a recommended design practice" |
| C-7 | События, потерянные до готовности слушателей | Fastify "the event is lost"; Nest "may be missed"; Guava "the event is dropped" |
| C-8 | Pub/sub только чтобы спрятать нарушение зависимости | Shopify 2024 "introduced indirection … harder to understand" |
| C-9 | Мультиплексирование `send(type, payload)` | Mojo "Do not try to artificially consolidate multiple distinct concepts" |

### (D) Плагины и точки расширения

**Лучшие практики**

| # | Практика | Источники |
|---|---|---|
| D1 | Точкой расширения владеет расширяемый модуль; её контракт лежит в отдельном маленьком пакете | Backstage `-node` "to allow for modules to avoid a direct dependency"; Evans Pluggable Component Framework; JPMS `uses/provides` |
| D2 | Вклады декларативны и видны без запуска | Eclipse "without ever running it"; VS Code contribution points; Drupal `#[Hook]` |
| D3 | Вклады собирает владелец (whiteboard / multibindings) | OSGi whiteboard `List<ContentProvider>`; Guava (DI multibindings); Backstage multiton |
| D4 | Вид хука и политика ошибок объявлены явно | Tapable (Sync/Bail/Waterfall/Series/Parallel); Rollup `first/sequential/parallel`; OSGi Event Admin "continue with the next handlers" |
| D5 | Много узких точек вместо одной большой | Backstage "multiple extension points with few methods"; Mojo "semantic capabilities" |
| D6 | Порядок либо явно не определён, либо задан явным списком или относительными ограничениями; последнее слово у владельца | Linux cpuhp "documents clearly the ordering"; Drupal `Order::First/OrderBefore`, `#[ReOrderHook]`; Bevy и Unreal "not defined" |
| D7 | Регистрации плагина снимаются вместе с плагином | Qt auto-disconnect; Erlang `pg`; Bevy observer cleanup |
| D8 | Сбой плагина изолирован и приписан ему | Backstage `reportModuleStartupFailure`; OSGi deny list; `gen_event:add_sup_handler` |
| D9 | Трансформирующие цепочки чистые | WordPress "filters … should never have side effects" |
| D10 | Дерево готовится один раз; изменение означает новую подготовку | Backstage "Conditions are evaluated when the app tree is prepared"; OSGi static policy |

Согласие: D1–D4, D7, D8.
Расхождение: хуки или события (Drupal 11.3 вернулся к хукам; Symfony использует события); числовые приоритеты
(Symfony, WordPress, Spring `@Order`) или явные списки (Linux, Drupal 11.2); `stopPropagation` существует в Symfony,
Laravel и в Linux `NOTIFY_STOP`.

**Худшие практики**

| # | Антипаттерн | Источники |
|---|---|---|
| D-1 | Числовые приоритеты и войны за порядок | WordPress `PHP_INT_MAX`; LKML 2012; Drupal 11.2 заменил `hook_module_implements_alter` |
| D-2 | Опора на неопределённый порядок | Firefox "changing this might cause subtle problems"; Unreal; Bevy |
| D-3 | Тихий провал отписки или тихое удаление обработчика | WordPress "No warning will be given on removal failure"; OTP `gen_event` |
| D-4 | Динамическое создание точек расширения или провайдеров | Riverpod "AVOID dynamically creating providers"; Drupal "Dynamic ordering is currently not supported" |
| D-5 | Вето и остановка распространения между независимыми плагинами | Linus "Notifiers are a disgrace"; Symfony и Laravel (вред — оценка исследователя) |
| D-6 | Плагины общаются друг с другом напрямую в коде | Backstage "There can be no direct communication between plugins through code" |
| D-7 | Несколько копий библиотеки с состоянием, тихие расхождения singleton | Module Federation "Unsatisfied version"; Vue "different internal storage" |

### (E) Сквозное: порядок, ошибки, жизненный цикл и утечки, наблюдаемость, асинхронность

**Лучшие практики**

| # | Практика | Источники |
|---|---|---|
| E1 | Ошибка слушателя изолирована и сообщена, издатель продолжает | VS Code `fire` "will not fail this function call"; OSGi Event Admin; Rails fanout (собирает и сообщает) |
| E2 | Подписка живёт столько же, сколько её владелец | Qt context object; IntelliJ `connect(disposable)`; Riverpod "You do not need to unregister" |
| E3 | Порог подозрения на утечку | VS Code `leakWarningThreshold`; Firefox `kSuspectReferentCount = 100`; Node 10 слушателей |
| E4 | Асинхронная реакция: отмена устаревшего через `AbortSignal`, в работу идёт только последнее | Angular `resource` "aborts an outstanding loading operation"; TanStack Query; RxJS `switchMap` |
| E5 | Нет повторного входа: снимок подписчиков, отложенная доставка | Redux "subscriptions are snapshotted"; Flux; OSGi `postEvent` |
| E6 | Статический граф из объявлений, проверка в CI | Spring Modulith Documenter и `verify()`; Hohpe "detected at design time"; Nx, dependency-cruiser |
| E7 | Span на входе в модуль и явный контекст создания сообщения | Spring Modulith observability; OpenTelemetry "message creation context" |
| E8 | Correlation ID с первого дня | Azure "retrofitting observability … substantially more difficult"; EIP Message History |
| E9 | Идемпотентные получатели | Zalando "MUST be robust against duplicates"; Hohpe Idempotent Receiver; .NET двойные колбэки |
| E10 | FIFO от одного источника, порядок между источниками не обещается | OSGi `postEvent` "in the order that they are received"; IntelliJ per topic; Kubernetes "Random ordering between resources" |

Согласие в зрелых системах: E1, E2, E4, E6. Расхождение есть только в значениях по умолчанию: Node `EventEmitter`,
Spring `SimpleApplicationEventMulticaster` и MediatR `ForeachAwaitPublisher` прерывают рассылку на первой ошибке,
Nest по умолчанию глотает ошибки.

**Худшие практики**

| # | Антипаттерн | Источники |
|---|---|---|
| E-1 | Ошибка одного слушателя глушит остальных | Svelte #11555; Node `EventEmitter` (MEASURED исследователем); Spring default multicaster |
| E-2 | Ошибки проглатываются без отчёта | Guava "doesn't propagate exceptions"; Nest `suppressErrors: true` |
| E-3 | Устаревший асинхронный результат перезаписывает свежий | React "no guarantee about which order the responses will arrive"; LaunchDarkly #840; Vue stale ID |
| E-4 | Неограниченные буферы | Effect `PubSub.unbounded`, client-go (`design.md`, таблица конкурентов) |
| E-5 | Наблюдаемость зависит от наблюдаемой подсистемы | AWS 2020: Service Health Dashboard зависел от Cognito |
| E-6 | «Best effort» зависимость на деле блокирует | AWS Kinesis 2020 "caused the Cognito webservers to begin to block" |
| E-7 | Автотрекинг и ambient-контекст на границах модулей | Vue "different internal storage"; Angular и Svelte (эффекты) |
| E-8 | Повторы без back-off | AWS 2021 "adequately backing off" |

---

## 2. Модель общения для GM

### 2.0 Одна модель: одно ребро, одно владение, одно время жизни

Опоры уже есть в GM, новых сущностей почти не нужно:

- **Ребро** — типизированный контракт (`defineContract`) и слот (`required`/`optional`/`many`). Других видов связи нет:
  ни шины, ни реестра, ни строковых топиков, ни ambient-контекста (GM-REQ-012).
- **Владение** — у каждого значения один писатель. Остальные получают фасет только для чтения и наблюдения.
- **Время жизни** — каждая подписка живёт в scope подписчика (`@get-modular/resources`) и снимается раньше drain
  (`common-assembly.md:186-190`).

Что использовать (единая таблица решений):

| Нужно | Примитив GM | Прецедент |
|---|---|---|
| Получить ответ сейчас (запрос) | метод порта по слоту `required` (или `optional`, если модуль осмысленно живёт без провайдера) | Rollup `api`; Backstage ApiRef; Grzybek Direct Call |
| Попросить владельца что-то изменить (команда) | командный порт владельца или исходящий порт ребёнка, который реализует владелец | Vue emit; TCA delegate; Akka explicit ref; Clean Architecture output port |
| Следить за текущим значением владельца | `ReadonlyStore` владельца + `watch` в своём scope | VS Code `onDidChange*` + `Disposable`; .NET `IOptionsMonitor`; Riverpod `ref.watch/listen` |
| Узнавать о каждом факте, который нельзя склеить и который опоздавшему не нужен | `EventSource` издателя + `subscribe` в своём scope | Spring Modulith (типизированные события, подписчик зависит от издателя); IntelliJ `Topic`; Qt signal |
| Владелец перечисляет вклады и применяет свой порядок и политику | точка расширения: контракт владельца + слот `many()` с явной строкой | OSGi whiteboard; Backstage extension points; Tapable |
| Данные и порты родителя для инстанса или плагина | `inputs` (ADR-0031) | XState `input`; OTP start args |
| Процесс из нескольких шагов между соседями | модуль-оркестратор в общем предке, рёбра вниз к прямым детям | Ruecker; Azure Saga orchestration; Android mediator |

Сам пакет (сейчас `@get-modular/observation`) после этой модели — **Моё предложение** (минимальная поверхность):

```ts
// Store: one writer. A facet with read + watch goes into contracts; set/close never leave the owner.
export function createStore<V extends Values>(initial: V, options: {
  readonly name: string; readonly resources: Resources; readonly reportError: (report: ListenerError) => undefined;
}): Store<V>;
export type Store<V> = {
  readonly read: <const K extends Keys<V>>(keys: K) => Snapshot<V, K[number]>;
  readonly set: (patch: Partial<V>, options?: { readonly basedOn?: SnapshotRef }) => number;   // returns the new revision
  readonly readonly: <const K extends Keys<V>>(keys?: K) => ReadonlyStore<Pick<V, K[number]>>;  // projection, no write
  readonly close: () => undefined;
};
export type ReadonlyStore<in out V> = {
  readonly read: <const K extends Keys<V>>(keys: K) => Snapshot<V, K[number]>;
  readonly watch: <const K extends Keys<V>>(resources: Resources, spec: WatchSpec<V, K>) => undefined;  // lives in the caller's scope
};
// WatchSpec: { name, keys, since?, onChange }  or  { name, keys, since?, load(values, signal), onResult, onError }
// Later (owner question Q3): createEvent<T>(options) -> { emit, readonly(): EventSource<T>, close }
//                            EventSource<T> = { subscribe(resources, { name, handler }) }
```

Что уходит из ADR-0034: `participantsFor`, `Participant*`, `startHub`, `Hub`, реестр копии пакета, `participantIds`.
`createLatestDerivation` становится внутренностью `watch({ load })` (escape hatch можно оставить). ASSUMPTION: объём
ядра не растёт (хаб и реестр уходят, `watch` и проекция `readonly(keys)` добавляют порядка 100–150 строк).

### 2.1 Решение: whiteboard-хаб через `many()` или подписка в scope модуля

Факты, на которых стоит решение (всё VERIFIED):

| Критерий | Хаб: слушатели в `many()` | Подписка в scope подписчика |
|---|---|---|
| Направление ребра | обратное потоку данных: коллектор зависит от всех слушателей | по потоку данных: слушатель зависит от владельца (как Spring Modulith `EVENT_LISTENER`) |
| Правка корня при новом слушателе | да: строка `many` (ADR-0035:38-42) и строка оракула; групповых строк нет (`0.5.0-train.md:2202`) | нет: слот `required` достраивается сам, когда провайдер один (ADR-0035:38-40) |
| Вложенные фичи | корень называет приватные ID подфич. ASSUMPTION: строка привязки — это «wiring», которое FMS v1.1 разрешает только родителю (`fms-nested-features-draft.md:300-302`) | ребро вверх к контракту предка разрешено правилом 3 (`0.5.0-train.md:481`) |
| Инстансы и плагины | у шаблона свой план, хаб Host их не видит | порт приходит через `inputs` (ADR-0031: "a value may be a port"), план Host не меняется |
| Предел | 1024 провайдера на строку (`common-assembly.md:756`; `many({ max: 1024 })` в `OBS-3-standard.md:145`) | нет |
| Утечки | невозможны по построению | невозможны, если `watch` требует `resources` в сигнатуре (тип не даст забыть) |
| Атрибуция ошибок и долгов | нужны `participantIds`, потому что `many` отдаёт значения без ID (`assembly/.../run.ts:59-60`) | `name` подписки плюс путь scope в `Debt.path` |
| Кто наблюдает завершение async-работы | хаб | пакет: drain-запись в scope модуля, долг виден Host в `CloseReport` |
| Согласие со стандартом | исключение из CMS rule 5–6 | ровно CMS rule 5–6 (`common-assembly.md:186-190`) |
| Индустрия | OSGi и IntelliJ собирают **автоматически**, без ручного списка (Guava: "independently") | Qt, IntelliJ `connect(disposable)`, VS Code `Disposable`, Riverpod, Angular `DestroyRef` |

Как каждый довод «за хаб» переносится на подписку в scope:

- Guava рекомендует DI multibindings как замену **шине**. Подписка на типизированный порт — тоже не шина, и она закрывает
  все пять претензий Guava: связь видна как слот, повторного входа нет (доставка отложена), ошибки идут в
  `reportError` владельца, время жизни у scope, буфер склеивается.
- Spring Modulith считает подписку зависимостью подписчика от издателя. Это как раз направление подписки в scope. В хабе
  ребро перевёрнуто: коллектор зависит от подписчиков.
- Akka Typed, XState и TCA передают ребёнку явную ссылку на владельца. В GM это слот ребёнка на порт владельца, то есть
  тоже подписка в scope.
- ADR-0035 требует строку в корне для каждого `many`. Для слушателей это центральный список, который правит каждая
  команда; для точек расширения это осознанное решение о порядке.

**Решение (три отдельных ответа):**

| Что | Механизм | Надёжность / уверенность |
|---|---|---|
| Изменения состояния | `ReadonlyStore.watch(resources, …)` в scope подписчика; слот `required` на фасет владельца | 8 / 7 |
| События | `EventSource.subscribe(resources, …)` в scope подписчика; слот `required`, а `optional` только для реального варианта продукта | 8 / 6 |
| Точки расширения | `many()` на контракте владельца, явная упорядоченная строка; после F-4 строка живёт в группе владельца; для плагинов строку генерирует plugin Host | 7 / 6 |

Что теряется: хаб собирал первые исходы всех участников в одном месте для readiness. ADR-0034:171-172 уже оставляет
readiness за Host, GM-REQ-013 запрещает GM владеть readiness, а реального потребителя этого сбора нет. Потеря допустима.

### 2.2 (A) Родитель → ребёнок

**Примитив.** При сборке ребёнок получает конфигурацию и порты слотами `required` (или `inputs` для инстанса). Во время
работы владелец значения держит `Store`. Ребёнок зависит от **своего** среза (consumer-owned порт, CMS
`common-assembly.md:72-74`) и следит через `watch` в своём scope. Родительская фича, которая вычисляет новый смысл для
подфич, сама владеет производным store как единственный писатель.

```ts
// features/orders/contracts/orders-settings.ts — the consumer owns its slice (plain TypeScript)
export type OrdersSettingsValues = { readonly currency: string; readonly region: string };

// features/orders/composition/orders.contracts.ts
export const OrdersSettings = defineContract<ReadonlyStore<OrdersSettingsValues>>()({ id: "acme/orders/settings", revision: 1 });

// src/composition/settings.module.ts — the Host's settings module is the only writer of the settings store
export const settings = implement<HostMap>()(settingsDeclaration, async (deps, { resources }) => {
  const store = createStore<AppSettings>(validate(await readSettingsFile()), {
    name: "settings", resources, reportError: deps.errors.report,
  });
  await resources.setup({
    name: "settings-file",
    setup: () => watchSettingsFile((next) => { store.set(validate(next)); }),   // input is validated before it spreads
    cleanup: (watcher) => watcher.close(),
  });
  return { instance: undefined, capabilities: {
    "acme/orders/settings": store.readonly(["currency", "region"]),   // a slice: read + watch, no write
  } };
}, scoped);

// features/orders/composition/checkout.declaration.ts
export const checkoutDeclaration = declareModule({
  moduleId: "acme/orders/checkout", implementationId: "acme/orders/checkout/default",
  owner: { authority: "acme", path: ["orders", "checkout"] },
  provides: [Checkout.provide()], slots: [OrdersSettings.slot("settings", required())],   // completed by prepare: no root row
});

// features/orders/composition/checkout.module.ts
export const checkout = implement<OrdersMap>()(checkoutDeclaration, async (deps, { resources }) => {
  const first = deps.settings.read(["currency"]);
  const pricing = createPricing(first.values.currency);
  deps.settings.watch(resources, {
    name: "checkout/currency", keys: ["currency"], since: first,
    onChange: ({ values }) => { pricing.setCurrency(values.currency); },   // later task, coalesced, idempotent
  });
  return { instance: pricing, capabilities: { "acme/orders/checkout": createCheckoutPort(pricing) } };
}, scoped);
```

Родитель передаёт изменённое подфиче (производный store; `basedOn` — Моё предложение по образцу Kubernetes
`observedGeneration`):

```ts
// features/orders/composition/pricing-context.module.ts — orders computes a new meaning for its sub-features
export const pricingContext = implement<OrdersMap>()(pricingContextDeclaration, async (deps, { resources }) => {
  const first = deps.settings.read(["currency", "region"]);
  const context = createStore<PricingContextValues>(toPricingContext(first.values), {
    name: "pricing-context", resources, reportError: deps.errors.report,
  });
  deps.settings.watch(resources, {
    name: "pricing-context/settings", keys: ["currency", "region"], since: first,
    onChange: (next) => { context.set(toPricingContext(next.values), { basedOn: next }); },   // another store, not the watched one
  });
  return { instance: undefined, capabilities: { "acme/orders/pricing-context": context.readonly() } };
}, scoped);
// features/orders/features/discounts/composition/coupon-rule.declaration.ts
//   slots: [PricingContext.slot("pricing", required())]   — FMS upward use edge; discounts watches only this, never raw settings
```

**Прецедент.** OTP, Akka, XState (A1); React, Vue, Kubernetes `spec` (A2); VS Code, .NET (A3); .NET Options per
section, Flutter `InheritedModel` (A6); Kubernetes `observedGeneration` (`basedOn`); Cloudflare (`validate`).

**Запрещено.**
- Ребёнок получает `set` или `close` (их нет в `ReadonlyStore`).
- Одна продуктовая запись `AppSettings` в типах фич и плагинов: каждый новый ключ меняет тип общего контракта
  (`common-assembly.md:418-419`), а инвариантность (`in out`) не пускает срез.
- Родитель императивно проталкивает значения в порт ребёнка из колбэка.
- Подфича наблюдает один смысл двумя путями (сырой и производный).
- Модуль, который не подписался, получает изменения иначе как через пересоздание Host-ом (правило ADR-0034 остаётся).

### 2.3 (B) Ребёнок → родитель

**Примитив.** Ребёнок объявляет **свой** исходящий порт («что мне нужно от владельца»), родитель его реализует.
Подтверждённое изменение возвращается к ребёнку как новое состояние через `watch`. Вклад при сборке — через точку
расширения родителя (2.5).

```ts
// features/ui/features/theme-picker/contracts/theme-requests.ts — the child owns what it needs from its owner
export type ThemeRequestsPort = { readonly requestTheme: (theme: string) => "accepted" | "rejected" };

// theme-picker.declaration.ts
//   slots: [ThemeRequests.slot("owner", required()), Theme.slot("theme", required())]

// theme-picker.module.ts
export const themePicker = implement<ThemePickerMap>()(themePickerDeclaration, async (deps, { resources }) => {
  const first = deps.theme.read(["theme"]);
  const picker = createThemePicker(first.values.theme);
  deps.theme.watch(resources, {
    name: "theme-picker/theme", keys: ["theme"], since: first,
    onChange: ({ values }) => { picker.show(values.theme); },            // the confirmed value comes back down
  });
  return { instance: picker, capabilities: {
    "acme/ui/theme-picker": { pick: (theme: string) => deps.owner.requestTheme(theme) },   // intent goes up
  } };
}, scoped);

// The owner of the theme state implements the child's port and stays the only writer:
//   "acme/ui/theme-picker/requests": { requestTheme: (theme) => {
//     if (!THEMES.has(theme)) { return "rejected"; }
//     themeStore.set({ theme });
//     return "accepted";
//   } }
```

Важное ограничение графа (VERIFIED по коду Core): любой цикл модулей отклоняется `graph.cycle` до первой фабрики
(`packages/core/src/features/composition-semantics/selected-graph.ts:56-66,154`, `graph-diagnostics.ts:15-16`). Поэтому
модуль, который держит состояние и реализует порт ребёнка, и модуль, который сам потребляет порты ребёнка, — **разные
модули**. Это то же разделение «store не view», что во Flux.

**Прецедент.** Vue `emit` + владелец, React handler, TCA delegate actions (B1); Akka "There is no parent in Typed",
XState "Prefer sendTo" (B2); Clean Architecture output port (B3); Fowler "requests to update data … and confirmed
updates" (B4); Lit «без эха» (B8).

**Запрещено.**
- Неявный доступ к родителю, передача `Resources` предка или `ScopeControl` вниз (CMS rule 4).
- Ребёнок пишет в store владельца или вызывает команду из `onChange` по тем же ключам, о которых его уведомили.
- Функции и колбэки в аргументах команд между модулями: Piral предупреждает, что переданная функция "may be available, but
  different than expected", Clean Architecture требует "simple data structures".
- Родитель разбирает внутренние действия ребёнка.

### 2.4 (C) Соседи и далёкие модули

**Примитив.**
- Запрос и команда — метод порта по слоту `required` (`optional` только для настоящего варианта продукта; ему нужна явная
  строка `[]` или провайдер, ADR-0035, `common-assembly.md:713`).
- Факт, который можно склеить, — это состояние: `Store` + `watch`.
- Несклеиваемый факт — событие, типизированный контракт издателя (`EventSource<T>`), `subscribe` в scope подписчика.
- Двусторонняя потребность и процессы — через общего предка.

```ts
// features/billing/composition/billing.contracts.ts — the publisher owns the event contract
export type InvoicePaid = { readonly invoiceId: string; readonly paidAt: string };   // plain data, ids not objects
export const InvoicePaidEvents = defineContract<EventSource<InvoicePaid>>()({ id: "acme/billing/invoice-paid", revision: 1 });

// features/billing/composition/payments.module.ts
export const payments = implement<BillingMap>()(paymentsDeclaration, async (deps, { resources }) => {
  const invoicePaid = createEvent<InvoicePaid>({ name: "invoice-paid", resources, reportError: deps.errors.report });
  const port = createPaymentsPort({ ledger: deps.ledger, onPaid: (paid) => { invoicePaid.emit(paid); } });   // emits in operation, never in this factory body
  return { instance: port, capabilities: {
    "acme/billing/payments": port, "acme/billing/invoice-paid": invoicePaid.readonly(),
  } };
}, scoped);

// features/orders/composition/settlement.module.ts — a distant module listens; the edge is a slot, visible in the plan
//   slots: [InvoicePaidEvents.slot("invoicePaid", required()), Payments.slot("payments", required())]
export const settlement = implement<OrdersMap>()(settlementDeclaration, async (deps, { resources }) => {
  const orders = createSettlement();
  deps.invoicePaid.subscribe(resources, {
    name: "orders/settlement", handler: (paid) => { orders.markPaid(paid.invoiceId); },
  });
  return { instance: orders, capabilities: { "acme/orders/settlement": orders.port } };
}, scoped);
// A query is a call:   await deps.payments.invoiceStatus(invoiceId)
// A command is a call: await deps.payments.refund(invoiceId)   — never an event that "asks" billing to refund
```

**Прецедент.** C2 (Now in Android), C4 (Fowler, EIP), C5 (AWS "The contract is the event definition", EIP Datatype
Channel), C6 (Spring Modulith `EVENT_LISTENER`), C7 (Ruecker, Azure), C8 (Piral, AWS). Семантика событий:
доставка в более поздней задаче, FIFO от одного издателя (OSGi `postEvent`), ограниченная очередь с явной ошибкой
переполнения (Guava "doesn't support backpressure"), at-most-once в процессе без durable-гарантий (Spring Modulith:
"the event publication is lost").

**Запрещено.** Глобальная шина и строковые топики, wildcard-подписки, mediator `send(query)`, общий изменяемый объект,
событие-запрос, passive-aggressive команда, цепочка событий вместо оркестратора, событие из тела фабрики (подписчики ещё
не готовы, как в Nest и Fastify), ключ store как «сигнал» (`{ ping: n + 1 }` — это скрытая шина), `stopPropagation`
между модулями.

### 2.5 (D) Плагины и точки расширения

**Примитив.** Точка расширения — контракт владельца и слот `many()`. Вид (`sequential`, `first`, `waterfall` по словарю
Tapable и Rollup) и политику ошибок владелец пишет в JSDoc контракта. Порядок задаёт явная строка. Плагин или инстанс —
отдельный план (ADR-0031, lifecycle-kernel). Порты Host он получает через `inputs`: только `ReadonlyStore`,
`EventSource` и командные порты. Его подписки живут в scope поколения.

```ts
// features/orders/composition/orders.contracts.ts — the owner defines the point; its kind and error policy are in the JSDoc
/** Waterfall in row order; each rule is pure; a throwing rule fails the price calculation (owner policy). */
export type PriceRulePort = { readonly id: string; readonly apply: (line: OrderLine, price: Money) => Money };
export const PriceRule = defineContract<PriceRulePort>()({ id: "acme/orders/price-rule", revision: 1 });

// pricing.declaration.ts: slots: [PriceRule.slot("rules", many({ min: 0, max: 64 }))]
// pricing.module.ts
const price = (line: OrderLine) => deps.rules.reduce((current, rule) => rule.apply(line, current), line.basePrice);

// Root today; after F-4 the same explicit row lives in orders.group.ts and orders.wiring.ts:
//   bindings: [{ consumerImplementationId: "acme/orders/pricing/default", slotId: "rules",
//     providerImplementationIds: ["acme/orders/discounts/coupon-rule", "acme/orders/discounts/volume-rule"] }]

// A plugin generation: one prepared template, Host ports as inputs, nothing written into the Host's plan
const generation = plugins.child({ name: "plugin:" + pluginId });
await prepared.run({ signal, scope: generation.resources, inputs: {
  settings: { "acme/orders/settings": settingsStore.readonly(["currency"]) },
  invoicePaid: { "acme/billing/invoice-paid": invoicePaid.readonly() },
} });
```

**Прецедент.** OSGi whiteboard, Backstage extension points и `-node` пакеты (D1, D3); Tapable и Rollup (D4); Linux cpuhp
и Drupal `Order` (D6); Qt и `pg` (D7); Backstage `inputs`, Chromium `BinderMap` (явная выдача возможностей).

**Запрещено.** Числовые приоритеты, вето и `stopPropagation` между вкладами, плагин → плагин напрямую, `set`/`close`/
`ScopeControl` в руках плагина, динамическое создание точек расширения, опора на порядок, которого нет в строке.

### 2.6 (E) Сквозное

| Тема | Правило модели | Прецедент |
|---|---|---|
| Порядок | `watch` и `subscribe`: порядок между подписчиками не входит в контракт (на деле это порядок конструирования); FIFO от одного издателя. `many`: порядок — явная строка, закреплённая оракулом | OSGi, IntelliJ, Kubernetes; Linux cpuhp |
| Ошибки | Колбэк изолирован. Ошибка идёт в `reportError` **владельца** источника (как VS Code `onListenerError`) с `name` подписчика и ревизией. Издатель не видит исключение. Команда возвращает результат или бросает вызывающему | VS Code, OSGi Event Admin, Rails fanout; Akka (валидация в протоколе) |
| Жизненный цикл | Источник создан раньше подписчиков и закрывается после них (порядок зависимостей плюс LIFO). Подписка снимается при `resources.signal` (scope начал закрываться), раньше drain | CMS rule 5–6; Qt; IntelliJ |
| Утечки | Тип `watch`/`subscribe` требует `resources`. Моё предложение: порог подозрения на источник для инстансов | VS Code `leakWarningThreshold`; Firefox 100 |
| Наблюдаемость | Имя у каждого store, event и подписки. `set` возвращает ревизию, ревизия служит correlation ID. В плане видно, кто зависит от `ReadonlyStore`, `EventSource` и `many` | Spring Modulith Documenter; Azure correlation ID; EIP Message History |
| Асинхронность | `watch({ load })`: одна активная работа и один последний ожидающий вход; `AbortSignal`; публикуется только текущая ревизия | Angular `resource`; TanStack Query; LaunchDarkly #840/#842 |
| Конструирование | Фабрика читает снимок сейчас и подписывается. Она не ждёт будущего другого модуля и не эмитит событий | Nest "may be missed"; Assembly: "An uncooperative pending factory can keep run pending" (`common-assembly.md:850`) |

---

## 3. Проверка рисков из исследований

### 3.1 Цикл upward + downward → дедлок инициализации?

**Вердикт: дедлока конструирования графом не бывает. Реальный риск другой: асинхронное ожидание внутри фабрики.**
Уверенность 8.

- VERIFIED. Core ищет сильно связные компоненты на графе провайдер → потребитель по реализациям и при любом цикле выдаёт
  `graph.cycle`, а `dependencyOrder` становится `null` (`selected-graph.ts:56-66, 154`; `graph-diagnostics.ts:15-16`).
  GM-REQ-006: "cyclic … references MUST fail before any implementation factory is invoked" (`module-system-v1.md:55-57`).
  Assembly исполняет фабрики последовательно в `dependencyOrder`, и каждая получает только уже построенные зависимости
  (`common-assembly.md:786-791`). Ленивого разрешения нет, поэтому ждать друг друга нечему.
- VERIFIED. FMS QN2 исключает рёбра вверх из графа циклов фич (`fms-nested-features-draft.md:320-341`,
  `0.5.0-train.md:486-496`). Значит, цикл «родитель ↔ подфича» на уровне фич допустим. Если он превращается в цикл
  модулей (модуль родителя требует порт ребёнка и сам же предоставляет ребёнку порт вверх), `prepare` громко падает с
  `graph.cycle`. Это не дедлок, но это ловушка: проверка фич пропускает дизайн, который Core отвергнет. Нужно правило в
  руководстве (раздел 5) и фикстура: «модуль-владелец состояния и модуль-потребитель детей — разные модули».
- Реальный остаточный риск (ASSUMPTION, по семантике `run`). Фабрика делает `await` на промисе из порта зависимости, а
  промис разрешается только после того, как построится более поздний модуль или Host выполнит шаг после `run()`.
  Тогда `run()` висит до дедлайна Host: "An uncooperative pending factory can keep run pending"
  (`common-assembly.md:850`). Core этого не видит. Правило: фабрика не ждёт будущего другого модуля; она читает снимок
  сейчас и подписывается (level-based).
- Во время работы вместо дедлока возможен livelock: обработчик A пишет в store, на который подписан B, а B пишет в store A.
  Отложенная доставка не даёт переполнить стек, но не останавливает пинг-понг. Правило: «обработчик не пишет в источник,
  о котором его уведомили»; производный store пишет только в свой store.

### 3.2 Закон Хайрама на порядке `many()`

**Вердикт: для точек расширения это управляемый риск, для подписчиков реальный, но малый.** Уверенность 7.

- Для `many` порядок не скрытый: это явная строка (GM-REQ-003 "explicit deterministic ordering source"), которую
  сохраняет инъекция (`common-assembly.md:789-790`), а оракул ADR-0037 сравнивает каждую явную строку целиком
  (`0.5.0-train.md`, ADR-0037: "every listed row equals its plan row"). Перестановка видна в ревью. Остаётся тонкость:
  вклад может молча рассчитывать на соседа. Контрмера: владелец объявляет вид точки (зависит ли результат от порядка) в
  JSDoc контракта.
- Для `watch`/`subscribe` порядок доставки равен порядку подписки, то есть порядку конструирования: топологический
  с тай-брейком по ASCII ID (`ready-queue.ts:1-2`). Порядок детерминирован, но не контрактен. Это ровно ситуация Firefox
  ("changing this might cause subtle problems"). Контрмеры: изоляция; правило VS Code observables "must not get/read the
  value of other observables, as they might not have received this event yet" — обработчик опирается только на свой
  снимок и своё состояние. Остаток риска принимаю, перемешивание в рантайме не предлагаю (ADR-0034 отвергает pluggable
  schedulers).

### 3.3 Observation как скрытая глобальная шина

**Вердикт: риск реален при одном продуктовом сторе с многими писателями или при ключах-сигналах. Модель его закрывает.**
Уверенность 7.

Как именно observation может стать шиной:
- один `AppSettings` на весь продукт, `commit` у нескольких модулей — это глобальный store (single-spa, AWS, Cam Jackson);
- ключ, который используют как событие (`{ lastOrderId }`, счётчик-«пинг») — это шина под видом состояния;
- реестр копии пакета (`participantsFor`, ADR-0034:66-68) — это ambient-состояние, и плагин со своей копией отвергается
  как foreign.

Контрмеры модели:
- один писатель, `set`/`close` никогда не попадают в capability;
- store у каждого владельца, срезы потребителя;
- никаких строковых ключей-топиков и wildcard;
- ребро `ReadonlyStore`/`EventSource` видно в плане;
- правило «несклеиваемое — это событие, а не ключ»;
- реестра копии больше нет.

### 3.4 Потеря контекста трассировки при отложенной доставке

**Вердикт: подтверждено замером.** MEASURED (Node v26.11.0, `scratchpad/probe-synth-a/als.mjs`). Два `commit` в двух
контекстах `AsyncLocalStorage` склеились в одну доставку, и ревизия 2 из `trace-B` пришла в контексте `trace-A`:

```text
v26.11.0 deliver rev=2 ctx=trace-A
```

Это совпадает с TC39 AsyncContext ("registration time" snapshot) и с OpenTelemetry ("Consumer traces cannot be directly
correlated with producer traces if the message creation context is not attached"). ADR-0034 запрещает пакету импорт
встроенных модулей Node (ADR-0034:59-62), поэтому `AsyncResource` и `diagnostics_channel` внутри пакета недоступны.
Минимальный ответ — явная корреляция: `set` возвращает ревизию, ревизия есть в каждом снимке и в каждом отчёте
`reportError`, а Host или адаптер трассировки связывает (source, revision) со span через link. Документировать: «контекст
доставки не равен контексту записи».

### 3.5 «Опциональная» зависимость, которая блокирует (AWS 2020)

**Вердикт: `optional` в GM решает только присутствие в композиции и ничего не говорит о доступности во время работы.**
Уверенность 8.

VERIFIED: для `optional` нужна явная строка `[]` или провайдер (`common-assembly.md:712-714`). Что блокирует в GM:
- `await` на команду или запрос через порт, который «best effort», но завис;
- тяжёлый синхронный обработчик блокирует весь event loop (OSGi: "should not spend too long").

Отложенная доставка с синхронными `=> undefined` обработчиками не даёт подписчику заблокировать издателя.

Правила:
- путь через best-effort порт не ждёт без дедлайна вызывающего;
- обработчик только записывает желаемое, тяжёлая работа идёт в `watch({ load })`;
- отсутствующий провайдер проверяется `isolate` с `undefined`;
- наблюдаемость не зависит от наблюдаемого (Service Health Dashboard зависел от Cognito).

### 3.6 Ромбы и glitch

**Вердикт: внутри одного store glitch нет. Между store возможен кратковременный перекос; лечится правилом и `basedOn`.**
Уверенность 7.

- В одном store снимок атомарен, и каждая регистрация получает одну доставку с последним значением (ADR-0034:90-98).
  Ромб в графе модулей безопасен: "Diamond consumers share capability references" (`common-assembly.md:790`).
- Между store: производный store B обновляется на задачу позже, чем A. Подписчик на A и B увидит A@new вместе с B@old.
  Индустрия даёт glitch-free только внутри одного графа вычислений (TC39, Svelte `derived` pending), а computed graph
  ADR-0034 исключает. Ответ — «один смысл, один путь» и level-based схождение (Kubernetes). Моё предложение: снимок
  производного store несёт `basedOn` (ревизию входа), по образцу Kubernetes `observedGeneration`, чтобы перекос был
  обнаружим.

---

## 4. Нейминг

Требования: узнаваемо широкой JS/TS-аудитории и не только по Vue; нельзя «participant», «hub», `sync`, `derived` для
побочных эффектов, «hook», `seal`.

**Рекомендуемый словарь (A).** Надёжность 7, уверенность 6.

| Понятие | Имя | Где узнают |
|---|---|---|
| Состояние с одним владельцем | `createStore`, `Store` | Redux, Zustand (`createStore`), Svelte, Pinia, Jotai, TanStack Store, Solid |
| Чтение | `read(keys)` → `Snapshot` с `revision` | `getSnapshot` из `useSyncExternalStore`; критик имён оценил 5/5 |
| Запись владельцем | `set(patch)` → ревизия | Zustand `setState(partial)`, Svelte `set`, nanostores `set` |
| Фасет только для чтения и наблюдения | `store.readonly(keys)` → `ReadonlyStore` | Svelte `readonly(store)`, Vue `readonly()` |
| Слежение за состоянием | `watch(resources, { name, keys, since, onChange })` | Vue `watch`, Riverpod `ref.watch`, Flutter `context.watch`, Kubernetes watch, etcd и Consul watch, `fs.watch` |
| Асинхронная реакция | опции `load` / `onResult` / `onError` в том же `watch` | Angular `loader`, React Router и SvelteKit `load` |
| Конец жизни | `close()` | `BroadcastChannel.close()`, потоки |
| Событие (несклеиваемый факт) | `createEvent`, `emit`, `EventSource`, `subscribe(resources, { name, handler })` | Node и mitt `emit`; RxJS, Redux, Svelte `subscribe`; VS Code typed `EventEmitter<T>` |
| Точка расширения | «extension point», вклад — «contribution» (контракт `<Thing>`, слот `many()`) | Eclipse, Backstage, VS Code contribution points |
| Команда | «command port», методы по намерению (`requestTheme`) | CQRS, EIP Command Message, Prism commanding |
| Корреляция | `revision` | OSGi `getChangeCount`, Kubernetes `generation` |

Почему именно так:
- `watch` и `subscribe` разделяют две семантики: последнее состояние со склейкой и каждый факт по порядку. Похоже на
  Riverpod `watch` и `listen`.
- В модели «подписка в scope» `watch()` — действие, а не инертное описание. Поэтому возражение критика имён против глагола
  `watch()` («Vue `watch()` подписывает сразу») здесь превращается в довод за него.
- Есть коллизия: `Store` уже занят доменными портами хранения (в TEST есть контракт `Store` в `storage`). Это разные
  пространства имён, но в документации нужен один абзац о том, что `Store` из пакета — это состояние, а не хранилище.

**Альтернатива B (VS Code / .NET).** Надёжность 6, уверенность 6. `createSource`, `source.onDidChange(resources, keys,
listener)`, `EventEmitter<T>` с `fire`/`event`, «contribution points». Хорошо знакомо авторам расширений VS Code и
.NET-разработчикам, хуже — среднему веб-разработчику.

**Альтернатива C (текущие имена без плохих).** Надёжность 6, уверенность 5. `createKeyedSource`, `commit`, `close`,
`watch`. `commit` понятен по Vuex, но Vuex — наследие (Pinia `commit` не использует).

Отказ от схемы критика имён «Observer» (`observersFor`, `asyncObserver`, `connectObservers`): она описывает инертные
объекты для хаба. Без хаба исчезает и её основа.

---

## 5. Правила видения для всех агентов

### 5.1 Пятнадцать правил (каждое с прецедентом)

1. **Один владелец, один писатель.** Остальные получают фасет только для чтения. *React "single source of truth";
   Kubernetes `spec`/`status`; Piral `setData`.*
2. **Каждая связь — типизированный контракт и слот, видимый в плане.** Нет шины, строковых топиков, wildcard, mediator,
   service locator и ambient-реестров. *Guava "We recommend against using EventBus"; Spring Modulith `verify()`;
   Akka `ServiceKey`.*
3. **Данные идут от провайдера к потребителю; просьба идёт обратно вызовом командного порта владельца по тому же ребру.**
   Подтверждённое изменение возвращается новым состоянием. *Vue props/emit; Fowler "requests … and confirmed updates";
   Kubernetes `spec`/`status`.*
4. **Путь наверх явный.** Ребёнок зависит от своего исходящего порта или от командного порта владельца и не знает
   «родителя». *Akka "There is no parent in Typed"; XState "Prefer sendTo"; Clean Architecture output port.*
5. **Что можно склеить — это состояние (`Store` + `watch`); несклеиваемый факт — событие; запрос — вызов.** Не
   маскировать команду под событие. *Kubernetes level-based; Piral events и datastore; Fowler passive-aggressive command.*
6. **Подписка — зависимость подписчика от контракта владельца и живёт в scope подписчика.** Она снимается раньше drain.
   *Spring Modulith `EVENT_LISTENER`; Qt context object; IntelliJ `connect(disposable)`.*
7. **Доставка отложенная и изолированная, обработчик синхронный и только записывает желаемое.** Асинхронная реакция идёт
   по принципу latest-only с `AbortSignal`. *VS Code `fire`; OSGi Event Admin; Angular `resource`, TanStack Query.*
8. **Обработчик не пишет в источник, о котором его уведомили. Один смысл — один путь.** Производный store несёт ревизию
   входа. *Flux "Cannot dispatch in the middle of a dispatch"; IntelliJ "Avoid Shared Data Modification from
   Subscribers"; Kubernetes `observedGeneration`.*
9. **Точка расширения — контракт владельца и `many()` с явной упорядоченной строкой.** Вид и политику ошибок объявляет
   владелец. Нет числовых приоритетов и `stopPropagation`. *OSGi whiteboard; Tapable/Rollup; Linux cpuhp, Drupal
   `Order`.*
10. **Граф модулей ацикличен (Core `graph.cycle`).** Двусторонняя потребность решается общим предком-оркестратором или
    разделением «владелец состояния» и «потребитель детей» на разные модули. *ADP; Android mediator; Azure Saga
    orchestration.*
11. **Фабрика не ждёт будущего другого модуля и не эмитит событий.** Она читает снимок сейчас и подписывается.
    *Nest "may be missed"; Fastify "the event is lost".*
12. **`optional` — это «может отсутствовать в композиции», а не «best effort в работе».** Путь через необязательный порт
    не блокирует вызывающего без дедлайна. *AWS Kinesis 2020; ADR-0035 (явная строка `[]`).*
13. **Плагины и инстансы получают только `ReadonlyStore`, `EventSource` и командные порты через `inputs`.** Их подписки
    живут в scope поколения, а вклады в точки расширения идут строками из манифеста или группы владельца, а не правкой
    корня. *Backstage; Chromium `BinderMap`; ADR-0031.*
14. **Наблюдаемость встроена.** Имя у каждого store, события и подписки; ревизия служит correlation ID; ошибки
    приписаны подписчику; «кто следит, слушает, вкладывает» читается из плана. *Spring Modulith Documenter; Azure
    correlation ID; VS Code `leakWarningName`.*
15. **Частое общение двух модулей — повод пересмотреть границы, а не добавить канал.** *single-spa "consider merging
    them"; AWS "revisiting the … boundaries"; Cam Jackson.*

### 5.2 Сверка с «Module communication vision» в `<workspace>/AGENTS.md:57-70`

| Пункт AGENTS.md | Оценка | Что поправить |
|---|---|---|
| 1 (`:61`) "Data flows down a declared dependency edge" | **Неточно, P2, уверенность 7.** В FMS «downward edge» значит, что родитель зависит от ребёнка (`fms-nested-features-draft.md:281-283`). Данные родителя к ребёнку идут по **upward** use edge (ребёнок зависит от контракта предка). Агент, прочитавший оба текста, может перевернуть зависимость. Обоснование тоже опирается на Vue. | «Данные идут от провайдера к потребителю по объявленному ребру; просьба — обратно вызовом порта владельца», с прецедентами React, Kubernetes, Akka |
| 2 (`:62`) родитель передаёт изменённое детям | **Верно по смыслу, но противоречит ADR-0034:87** ("`commit` and `seal` stay with the Host"). | Явно: «модуль может владеть store как единственный писатель; store закрывается со scope создателя»; плюс `basedOn` |
| 3 (`:63`) "optional where the module can live without it" | **Неполно.** `optional` требует явную строку в корне (ADR-0035), то есть центральную правку, и не означает runtime best-effort. | По умолчанию `required` (достраивается сам); `optional` только для настоящего варианта продукта; правило 12 |
| 3 (`:63`) whiteboard через `many` | **Верно для точек расширения**, но вместе с пунктом 6 даёт противоречие: `many` требует центральную строку. | Добавить: строки — в группе владельца (F-4) или из манифеста плагина (F-1) |
| 3 — отсутствует | **Нет** различия запрос/команда/событие, оркестрации через общего предка и правила «подписка — это зависимость от издателя». | Правила 3, 5, 6, 10 |
| 4 (`:64`) подписка в scope подписчика | **Верно**, это по сути и решает вопрос хаба. Но фраза "Delivery is deferred and handlers are synchronous" относится к `watch`/`subscribe`, а не к вызову вкладов точки расширения (там владелец сам выбирает вид, в том числе AsyncSeries). | Уточнить область действия; добавить правило 11 (фабрика не ждёт и не эмитит) |
| 5 (`:65`) ничего ambient | **Верно.** | Добавить: никакого реестра копии пакета (сейчас `participantsFor`) |
| 6 (`:66`) plugin-ready без центрального списка | **Верно**, но выполнимо только при подписке в scope и F-4/F-1 для вкладов. | Сослаться на правило 13 |
| 7 (`:67`) имена | **Обоснование `sync` завязано на Vue.** | «`sync` перегружен: двусторонняя привязка, синхронное исполнение, синхронизация с внешней системой»; итоговый словарь из раздела 4 |
| 8 (`:68`) библиотеки | **Верно.** Мелочь: `@preact/signals-core` ошибки изолирует; причина отказа — глобальный активный подписчик и модель «граф значений», а не изоляция. | По желанию |
| Status (`:70`) "ADR-0034 proposed" | **Неточно, P3.** Файл ADR в ветке имеет `status: accepted` (ADR-0034:4), а PR #154 OPEN (VERIFIED `gh pr view`). | «принят в ветке, PR не слит; при смене модели — правка до merge» |
| Не хватает | Ацикличность и разделение модулей (10); порядок (FIFO от издателя, не контрактен между подписчиками, явен в `many`); корреляция по ревизии (14); проверка входящей конфигурации (Cloudflare); «частое общение — запах границ» (15); запрет функций в аргументах команд | Правила 10, 14, 15 и пункт 2.3 |

---

## 6. Вопросы владельцу

Только то, что меняет принятые или почти принятые решения и нормативные тексты.

**Q1. Как модуль следит за изменениями состояния и за событиями?** (Это пересмотр решения 2026-10-01 о хабе. Факты,
появившиеся после него: ADR-0035 от 2026-10-10 со строкой для каждого `many`, вложенные фичи от 2026-10-11, плагинное
направление от 2026-10-08.)

| Вариант | Надёжность | Уверенность |
|---|---|---|
| **A (Recommended):** подписка в scope подписчика: `watch`/`subscribe` с обязательным `resources`, слот `required` на фасет владельца. Хаб, `participantsFor` и реестр копии убрать; `many` оставить только для точек расширения. Правка ADR-0034 до merge #154 в основном вычитающая | 8 | 7 |
| B: оставить хаб и доработать Assembly: групповые строки (F-4) и ID провайдеров в `many`. Плагинам и инстансам всё равно нужен свой хаб на план | 6 | 6 |
| C: хаб плюс `many({ collect: "all" })` по ID. Меняет GM-REQ-004 и GM-REQ-003 (нормативные требования) | 6 | 4 |

**Q2. Кто может владеть store, то есть быть его писателем?**

| Вариант | Надёжность | Уверенность |
|---|---|---|
| **A (Recommended):** любой модуль как единственный писатель. Store живёт в scope создателя; `set`/`close` никогда не попадают в capability, наружу выходят только `readonly()` и командный порт. Это единственный вариант, при котором выполнимо «родитель передаёт изменённое ребёнку» | 8 | 7 |
| B: только Host, как в ADR-0034. Иерархию придётся решать обычным портом с колбэком, а это и есть сценарий F3 критика архитектуры: пересылка значений вниз, задача задержки на каждый уровень, glitch | 6 | 7 |
| C: Host плюс модули с явным признаком владельца в декларации (новое поле и проверка) | 6 | 4 |

**Q3. События (несклеиваемые факты): когда и где?**

| Вариант | Надёжность | Уверенность |
|---|---|---|
| **A (Recommended):** контракт событий описать сейчас в том же ADR (тот же `subscribe` в scope, FIFO от издателя, ограниченная очередь, at-most-once); реализовать вторым примитивом того же пакета при первом реальном потребителе. До этого правило: «можно склеить — это store; нужен результат — команда» | 8 | 6 |
| B: реализовать события сразу в 0.1.0 вместе со store. Потребителя пока нет, есть риск угадать форму | 6 | 6 |
| C: отдельный пакет `@get-modular/events` позже. Два механизма подписки, зоопарк | 4 | 7 |

**Q4. Точки расширения во вложенных фичах и у плагинов** (`many` требует строку в корне, групповых строк нет):

| Вариант | Надёжность | Уверенность |
|---|---|---|
| **A (Recommended):** поднять F-4 (явные строки в группе фичи-владельца, оракул в её `<feature>.wiring.ts`) до первой точки расширения внутри фичи; для плагинов строки генерирует plugin Host из манифеста (F-1). GM-REQ-004 не меняется | 7 | 6 |
| B: строки только в корне до появления плагинов. Работает, но корень называет приватные ID подфич | 6 | 7 |
| C: `many({ collect: "all" })` в порядке ID. Меняет GM-REQ-004/003, порядок перестаёт быть осознанным | 6 | 4 |

**Q5. Словарь API.**

| Вариант | Надёжность | Уверенность |
|---|---|---|
| **A (Recommended):** `createStore` / `read` / `set` / `readonly(keys)` / `watch` (+ `load`) / `close`; `createEvent` / `emit` / `subscribe`; «extension point», «contribution», «command port» | 7 | 6 |
| B: VS Code / .NET: `createSource`, `onDidChange`, `EventEmitter.fire/event`, «contribution point» | 6 | 6 |
| C: текущие без плохих: `createKeyedSource`, `commit`, `close`, `watch` | 6 | 5 |

Срезы настроек вместо одной `AppSettings` в вопросы не выношу. Это прямое следствие уже принятого правила CMS о
consumer-owned портах (`common-assembly.md:72-74`) и реализуется проекцией `readonly(keys)`.

---

## 7. Честно

### 7.1 Самые большие риски

1. **Повторное открытие решения о хабе.** Observation 0.1.0 задерживается (критик архитектуры оценил в 2–4 дня,
   ASSUMPTION). ADR-0034 придётся править до merge #154, а если PR уже слит — нужен successor ADR. Ничего не
   опубликовано (`packages/observation` нет в main `7d6535d`), так что сейчас это дешевле всего.
2. **Модель обоснована, но не доказана.** Потребитель только TEST (исключение владельца в ADR-0034), реального
   продукта нет. Плагинная часть (2.5) — требования, а не проверенный дизайн.
3. **Размножение store.** Владение у модулей может превратиться в много мелких источников, которые следят друг за
   другом цепочками (Fowler Event Cascade). Ограничители — правила 8, 10, 15 и видимость в плане. Автоматической проверки
   глубины цепочек нет.
4. **Событийный примитив может стать шиной**, если его начнут делать «общим». Правило: один `EventSource` = один
   типизированный контракт одного издателя.
5. **F-4 не запланирован.** Без него точки расширения во вложенных фичах протекают в корень.
6. **Асинхронный дедлок в фабрике** (3.1) Core не обнаруживает. Помогают только правило 11 и дедлайн Host.
7. **Трассировка** (3.4): без явной корреляции по ревизии связи «кто изменил — кто отреагировал» не будет, а
   встроенных средств Node пакету нельзя.

### 7.2 Вне скоупа

Durable-события, outbox и журнал публикаций; межпроцессная доставка; транзакции через несколько store; computed graph и
glitch-free между store; протокол readiness и health; сама плагинная система (манифест F-1, загрузка, доверие);
адаптеры к signals, Observable, stores; саги; DSL приоритетов; двусторонняя привязка как сахар.

### 7.3 Где я не уверен

- Типы: что `ReadonlyStore<Pick<AppSettings, K>>` при `in out V` принимается как значение контракта
  `ReadonlyStore<OrdersSettingsValues>` на TS 5.8.3 и 7.0.2 (ASSUMPTION; нужен зонд).
- Эргономика `watch(resources, …)`: требовать `resources` первым аргументом надёжно, но многословно. Проверял только в
  голове.
- `basedOn`, `readonly(keys)` и `name` у подписки — мои предложения, индустриальные аналоги есть, на GM не проверены.
- Нейминг: пользовательского исследования нет; `store` против `source` — вопрос вкуса с коллизией из раздела 4.
- Считается ли строка привязки в корне «wiring» в смысле FMS v1.1 (`fms-nested-features-draft.md:300-302`) — моё
  толкование.
- Нужен ли событийный примитив скоро — не знаю, потребителя не видел.

---

## 8. Находки (кратко)

| # | Sev | Увер. | Тип | Суть | Где |
|---|---|---|---|---|---|
| N1 | P1 | 8 | VERIFIED | `many` в GM — не индустриальный whiteboard: нужна строка в корне, а автосбор запрещён GM-REQ-004. Хаб для состояния берёт цену whiteboard без его выгоды | ADR-0035:38-42; `module-system-v1.md:41-43`; `0.5.0-train.md:2202` |
| N2 | P1 | 7 | VERIFIED | Требование владельца «родитель передаёт изменённое ребёнку» невыполнимо при "`commit` and `seal` stay with the Host" | ADR-0034:87; `design.md:249` |
| N3 | P1 | 8 | VERIFIED | Пункты 3 и 6 видения в AGENTS.md противоречат друг другу без F-4/F-1 (`many` требует центральную строку) | AGENTS.md:63, :66 |
| N4 | P2 | 9 | MEASURED | Отложенная склеенная доставка исполняется в async-контексте первого `commit` | `scratchpad/probe-synth-a/als.mjs` |
| N5 | P2 | 8 | VERIFIED | Цикл фич, который допускает QN2, может стать `graph.cycle` модулей; правило о разделении модулей не записано | `fms-nested-features-draft.md:320-341`; `selected-graph.ts:154` |
| N6 | P2 | 7 | VERIFIED | Пункт 1 видения: «down a dependency edge» сталкивается с терминологией FMS «downward edge» | AGENTS.md:61; `fms-nested-features-draft.md:281-283` |
| N7 | P2 | 7 | VERIFIED | Предел 1024 слушателя на источник у хаба | `common-assembly.md:756`; `OBS-3-standard.md:145` |
| N8 | P2 | 7 | ASSUMPTION | Строка в корне для слушателя-подфичи нарушает FMS v1.1 «Module composition … MUST wire only top-level features» | `fms-nested-features-draft.md:300-302` |
| N9 | P3 | 8 | VERIFIED | Статус ADR-0034 рассогласован: `accepted` в файле, PR #154 OPEN, в AGENTS.md «proposed» | ADR-0034:4; AGENTS.md:70 |

---

## Файлы

Исследования:
- `scratchpad/industry-research-module-communication.md`
- `scratchpad/research-backend-modular.md`
- `scratchpad/research-platforms-actors.md`
- `scratchpad/research-microfrontends-antipatterns.md`
- `scratchpad/critic-architecture-report.md`
- `scratchpad/critic-naming-syntax-report.md`

Замер: `scratchpad/probe-synth-a/als.mjs`

Get Modular:
- `<workspace>/.worktrees/gm-main-readonly-20261015/docs/requirements/module-system-v1.md`
- `<workspace>/.worktrees/gm-main-readonly-20261015/docs/decisions/0035-complete-composition-profiles-in-prepare-and-make-capabilitiesof-linear.md`
- `<workspace>/.worktrees/gm-main-readonly-20261015/docs/decisions/0031-pass-a-per-run-scope-and-declared-inputs-to-assembly-runs.md`
- `<workspace>/.worktrees/gm-main-readonly-20261015/docs/architecture/common-assembly.md`
- `<workspace>/.worktrees/gm-main-readonly-20261015/research/observation-hooks-2026-10/design.md`
- `<workspace>/.worktrees/gm-main-readonly-20261015/packages/core/src/features/composition-semantics/selected-graph.ts`
- `<workspace>/.worktrees/gm-main-readonly-20261015/packages/core/src/features/composition-semantics/ready-queue.ts`
- `<workspace>/.worktrees/gm-main-readonly-20261015/packages/assembly/src/features/construction/run.ts`
- `<workspace>/.worktrees/gm-main-readonly-20261015/packages/resources/src/features/scope/types.ts`
- `<workspace>/.worktrees/get-modular-obs-1-adr/docs/decisions/0034-admit-the-module-change-observation-package.md`
- `<workspace>/.worktrees/get-modular-observation-docs/research/observation-hooks-2026-10/briefs/OBS-3-standard.md`
- `<workspace>/.worktrees/gm-pr172-readonly-20261015/research/module-dx-2026-10/0.5.0-train.md`
- `<workspace>/.worktrees/gm-pr172-readonly-20261015/research/module-dx-2026-10/fms-nested-features-draft.md`
- `<workspace>/AGENTS.md`
