# Module communication: best and worst practices (interim catalog)

Owner direction 2026-10-15/16: these practices are a standing guide. Every agent designing or writing module
communication in Get Modular and its consumers reads them. The short rules are in workspace `AGENTS.md`, section
"Module communication vision". This file holds the full catalog with sources. It is interim: a deeper project-level
survey is running, and the canonical version will move to get-modular (`docs/guides/`) once that survey and the owner
decisions are in. The sources and quotes are in `raw/`; synthesis A section 1 is the origin of the tables below.

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

