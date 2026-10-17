# Микрофронтенды, литература об антипаттернах и наблюдаемость межмодульной связи

Дата: 2026-10-15. Это продолжение исследования `industry-research-module-communication.md` (тот же каталог).

Задача владельца: не привязываться к Vue, а посмотреть на индустрию целиком. Нужно понять, как решается связь модулей:
- сначала от родителя к ребёнку;
- затем между соседями и далёкими модулями.

Из этого собрать лучшие и худшие практики и решить, как делать лучше всего.

## 0. Метод

Пункты 1 (микрофронтенды) и 2 (литература об антипаттернах) сделаны отдельными исследовательскими проходами. Их полные отчёты приложены в конце без изменений (приложения M и AP) и лежат рядом:
- `scratchpad/mf-section.md`, сырые источники в `scratchpad/mf-raw/`;
- `scratchpad/ap-section.md`, сырые источники в `scratchpad/ap-raw/`.

Пункт 3 (наблюдаемость) я сделал сам, сырые источники в `scratchpad/obs-raw/`.

Как получены цитаты. Почти всё скачано через `curl` (исходный Markdown, AsciiDoc, HTML или PDF), а цитаты извлечены `grep`, `sed` или `pdftotext`, поэтому они дословные.

Пометки в тексте:
- **UNVERIFIED** — не подтверждено первоисточником;
- **NOT FOUND** — авторитетный источник не найден;
- **source reading** — вывод из чтения кода;
- **My assessment:** — моё мнение.

---

## 1. Коротко: что говорит индустрия

### От родителя к ребёнку

Везде одна модель: **владелец передаёт данные и колбэки вниз, контракт явный**. Примеры:
- single-spa: `customProps`, `parcel.update(props)`;
- Module Federation Bridge: `props`;
- Luigi: `addContextUpdateListener`;
- Lit Context и протокол WCCG Context;
- React, Vue и Angular (см. основной отчёт).

Cam Jackson (martinfowler.com, 2019-06-19) называет "the React model of passing callbacks and data downwards ... a good solution that makes the contract more explicit".

Lit добавляет правило "без эха": события "should generally **not** be dispatched in response to state changes made by the owner of the component via its property or attribute APIs".

### Между соседями и далёкими модулями

Общее правило: **общаться как можно меньше; частое общение — признак неверных границ**.
- single-spa: "If two microfrontends are frequently passing state between each other, consider merging them."
- AWS (Mezzalira): "we recommend revisiting the micro-frontend boundaries".
- Cam Jackson: "communicate as little as possible".

Если общаться всё же нужно, есть три механизма.
1. **Явный импорт публичного API.** single-spa: "single entry file that serves as the "public interface"".
2. **Значение с одним владельцем**, остальные его только читают и получают уведомления.
   - Piral: "the first one writing data will "own" (i.e., have the right to modify) it";
   - AWS: "opt in for read-only sharing";
   - Fowler: "only one source for each bit of data".
3. **Типизированные и документированные события.**
   - AWS: "The contract is the event definition";
   - Piral: "known" события через TypeScript;
   - EIP: Datatype Channel.

### Самые последовательно осуждаемые решения

1. **Глобальное общее хранилище на все модули** — single-spa, AWS, Cam Jackson.
2. **Глобальная in-process шина.** Мейнтейнеры Guava (2021-04-19) прямо пишут "**We recommend against using EventBus.**" и советуют вместо неё "register multiple listeners independently and then request them together as a set". По сути это whiteboard через `many()`.
3. **Поток, не видимый в коде.**
   - Hohpe 2006: "debugging liability";
   - Fowler 2006: "hard to find, understand and debug";
   - Nygard: "hidden, internal dependencies";
   - Azure: "no shared call context".
4. **Циклы в графе зависимостей** — Martin, ADP 1996: "MUST BE A DIRECTED ACYCLIC GRAPH"; Shopify 2020: "lots of circular dependencies".

### Наблюдаемость

Зрелые системы делают граф "кто с кем говорит" **первоклассным артефактом**:
- генерируют диаграммы и документацию из модели: Spring Modulith `Documenter` пишет связи "depends on", "uses", "listens to";
- проверяют граф машинно: Spring Modulith `verify()`, Nx, dependency-cruiser;
- в рантайме создают спаны на входе в модуль (Spring Modulith observability);
- связывают причину и следствие через контекст создания сообщения (OpenTelemetry span links, "message creation context").

Hohpe требует ловить на этапе проектирования подписки без публикаций и циклы в графе событий.

---

## 2. Микрофронтенды (кратко; полностью в приложении M)

**single-spa 6.x** (https://single-spa.js.org/docs/recommended-setup, коммит документации 2025-10-24)
- "A good architecture is one in which microfrontends are decoupled and do not need to frequently communicate."
- Глобальное хранилище: "The single-spa core team cautions against using redux, mobx, and other global state management libraries." Причина: "You cannot independently deploy a microfrontend if it relies on the global store's state to be a specific shape or have specific actions fired by other microfrontends".
- "It is not advisable to make everything a shared dependency, because shared dependencies must be upgraded at once for every microfrontend that uses them."
- Для редких случаев: "an event emitter may be used". Варианты — RxJS Subject, `window.dispatchEvent(CustomEvent)`, любой pub/sub.

**Module Federation** (webpack 5.111.1, `@module-federation/enhanced` 2.9.2, Rspack 2.2.9)
- `singleton` нужен потому, что "Some libraries use a global internal state (e.g. react, react-dom)".
- При несовпадении версий рантайм только предупреждает: "Unsatisfied version ... of shared singleton module". Ошибкой это становится лишь со `strictVersion`.
- Общая область видимости одна на всех: "sibling remotes _do_ share with each other".
- Дубли React ("Invalid hook call"), подпути вида `react-dom/client` обходят `shared`, tree-shaking ломает singleton.
- Официального руководства по общему состоянию между remotes нет (**UNVERIFIED**, что оно существует).

**Cam Jackson, "Micro Frontends"** (https://martinfowler.com/articles/micro-frontends.html, 2019-06-19)
- Custom events "make it harder to determine and enforce the contract".
- "avoid having any shared state. Just like sharing a database across microservices, as soon as we share our data structures and domain models, we create massive amounts of coupling".
- URL как канал: "It's declarative, not imperative". Маршруты — это контракт, "we should have automated tests that check that the contract is being adhered to".
- В общих библиотеках компонентов "no business or domain logic".

**Luca Mezzalira и AWS Prescriptive Guidance** (https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/, 2024-07-12)
- "The contract is the event definition".
- Общий Redux "creates significant coupling between applications".
- Рекомендация: "an event bus that's distributed as a library, orchestrated by the application shell", плюс "a shared wiki page that describes events and documents behaviors".
- Про стратегии зависимостей: "Other approaches are anti-patterns because they violate basic principles of distributed architectures."
- Книгу "Building Micro-Frontends" (2-е издание) прочитать не удалось: **UNVERIFIED**.

**Web Components и Lit**
- MDN: `dispatchEvent()` "invokes all applicable event handlers synchronously before returning". `composed` работает только вместе с `bubbles`.
- Лучшее явное правило против петель — правило Lit "без эха" (цитата в разделе 1).
- Протокол WCCG Context (Candidate, 2025-05-02):
  - "**Context API is not a state management alternative**";
  - провайдер "_MUST NOT_ retain a reference to the `callback`" без подписки, иначе утечка памяти.

**Piral**
- Единственный писатель общих данных.
- Событие доходит только до тех, кто слушает "*right now*". Хранилище данных — для будущих читателей.
- Нетипизированные события дают "typos or wrong assumptions".
- Передача функций между модулями: "it may be available, but different than expected".

**Luigi:** контекст идёт вниз, сообщения наверх, всё через Core ("hub-and-spoke"; это вывод проходящего агента, в документации так не названо).

**Уроки из практики**
- Zalando 2021: "Renderers are not intended to share data with each other that is based on the client side state".
- Spotify 2019: изоляция через iframe "was difficult to maintain". Это урок о чрезмерной изоляции.
- Первоисточники по IKEA и DAZN не найдены: **UNVERIFIED**.

---

## 3. Литература об антипаттернах и уроки (кратко; полностью в приложении AP)

**Hohpe, "Programming Without a Call Stack"** (© 2006, https://www.enterpriseintegrationpatterns.com/docs/EDA.pdf)
- "There is no inherent coordination, continuation or context preservation."
- "The configurability can suddenly turn into a debugging liability."
- "a configuration which prescribes an event subscription that does not match any publication may be considered invalid. Likewise, circular references in the event graph may be undesirable and should be detected at design time."
- Вывод: "employ management and visualizations tools to create a system that is dynamic but not chaotic."

**EIP (Hohpe и Woolf)**
- Разделение типов сообщений: Command Message ("invoke a procedure"), Document Message ("lets the receiver decide"), Event Message ("timing is very important").
- Datatype Channel: "all data on a particular channel is of the same type".
- Message Bus: "a common data model, a common command set, and a messaging infrastructure". То есть шина у Hohpe — это общий **контракт**.
- Для наблюдаемости: Message History, Wire Tap, Control Bus.

**Fowler, "Event Collaboration"** (https://martinfowler.com/eaaDev/EventCollaboration.html, 2006-06-19)
- "The great strength of Event Collaboration is that it affords a very loose coupling between its components; this, of course, is also its great weakness."
- "these interactions are hard to find, understand and debug. It is very helpful here to use automated tools that can display the configuration of components at run time".
- Event Cascade, пример с операционной.
- Один владелец данных: "two kinds of event - requests to update data, which should be ignored by everything but the managing application, and confirmed updates which everyone acts on".

**Fowler, другие статьи**
- Event Sourcing (2005): побочные эффекты наружу при повторном проигрывании событий.
- TellDontAsk (2013): "personally, I don't use tell-dont-ask"; предостерегает от "GetterEradicators".
- Microservices (2014): "smart endpoints and dumb pipes" против ESB.

**Nygard, "Release It!" 2nd ed.** (официальный отрывок https://media.pragprog.com/titles/mnee2/antipatterns.pdf, 2018)
- "hidden, internal dependencies that most operators’ mental models are either incomplete or just plain wrong".
- "Integration points are the number-one killer of systems."
- Остальные антипаттерны известны только по оглавлению, их содержание **UNVERIFIED**.

**Martin, ADP/SDP/SAP** ("Granularity" и "Stability", 1996, архив objectmentor)
- "THERE MUST BE NO CYCLES IN THE DEPENDENCY STRUCTURE."
- "the morning after syndrome".
- Цикл склеивает пакеты: "They have, in effect, become one large package."
- SDP: "Depend in the direction of stability". SAP: "Abstractness increases with stability".

**Law of Demeter и Tell, Don't Ask**
- Northeastern: "Only talk to your immediate friends", "Each unit should have only limited knowledge about other units".
- Hunt и Thomas (IEEE Software, 2003): "you should not make decisions based on the called object’s state and then change the object’s state."

**Guava EventBus** (javadoc, коммит "Discourage usage of EventBus.", 2021-04-19)
- "It makes the cross-references between producer and subscriber harder to find. This can complicate debugging, lead to unintentional reentrant calls, and force apps to eagerly initialize all possible subscribers at startup time."
- "It doesn't propagate exceptions".
- "if an event occurs between when one subscriber is removed and the next subscriber is added, the event is dropped."
- Square Otto, форк Guava EventBus, тоже устарел.

**Shopify**
- 2019: "a cascade of unrelated test failures".
- 2020: "every component depended on over half of all the other components. We also had lots of circular dependencies." Pub/sub (`ActiveSupport::Notifications`) у них — средство инверсии зависимостей.
- 2024, Packwerk Retrospective: "implicit dependencies that Packwerk can’t see".

**Разборы инцидентов**
- AWS Kinesis, 2020-11-25:
  - зависимость "designed to be best effort", но "latent bug ... caused the Cognito webservers to begin to block";
  - панель статуса сама зависела от Cognito.
- AWS, 2021-12-07: клиенты не смогли "adequately backing off".
- Cloudflare, 2025-11-18:
  - файл конфигурации "propagated to all the machines";
  - мера: "Hardening ingestion ... in the same way we would for user-generated input" и kill switches.
- Cloudflare, 2019: "went global in seconds" "without a staged rollout".
- Авторитетных разборов от Uber, Netflix или DoorDash о проблемах событийной архитектуры не найдено: **NOT FOUND**.

**Azure, "Event-driven architecture style"** (ms.date 2026-03-06)
- "no shared call context".
- Correlation ID с самого начала, "because retrofitting observability into a decoupled system is substantially more difficult than building it in."

---

## 4. Наблюдаемость связи при масштабе (мой проход)

### 4.1 Spring Modulith (последний релиз 2.1.1, 2026-08-26; документация в `spring-projects/spring-modulith` main, `src/docs/antora`)

**Документирование графа** (https://docs.spring.io/spring-modulith/reference/documentation.html)
- `Documenter` порождает "C4 and UML component diagrams describing the relationships between the individual application modules".
- И ещё "a so-called __Application Module Canvas__, a tabular overview about the module and the most relevant elements in those (Spring beans, aggregate roots, events published and listened to as well as configuration properties)."
- В примере диаграммы есть типизированные рёбра, например `Rel_D(Modulith.Application.inventory, Modulith.Application.order, "listens to", ...)`, наряду с "depends on" и "uses". Так подписки на события становятся видимыми рёбрами графа.

**Проверка графа** (https://docs.spring.io/spring-modulith/reference/verification.html)
- "_No cycles on the application module level_ -- the dependencies between modules have to form a directed acyclic graph."
- "_Efferent module access via API packages only_ -- all references to types that reside in application module internal packages are rejected."
- "_Explicitly allowed application module dependencies only_ (optional)".
- "`ApplicationModules.verify()` throws an exception in case of any architectural violation being detected."

**Наблюдаемость в рантайме** (https://docs.spring.io/spring-modulith/reference/production-ready.html)
- "The interaction between application modules can be intercepted to create Micrometer spans to ultimately end up in traces you can visualize in tools like Zipkin or Grafana."
- "This will cause all Spring components that are part of the application module's API being decorated with an aspect that will intercept invocations and create Micrometer spans for them."
- Атрибуты спана входа в модуль: `module.identifier`, `module.invocation-type` ("event listener" или "bean"), `module.method`, `module.name`.
- Метрики: `module.events.published` и `module.events.published.$moduleIdentifier.$simpleEventTypeName`.
- Actuator отдаёт структуру модулей по `GET /actuator/modulith`.

**События как основной канал, но наблюдаемый и надёжный** (https://docs.spring.io/spring-modulith/reference/events.html)
- "To keep application modules as decoupled as possible from each other, their primary means of interaction should be event publication and consumption."
- Компромисс синхронной доставки: "more triggered related functionality will widen the transaction boundary and potentially cause the entire transaction to fail, even if the functionality that is causing the error is not crucial."
- Компромисс асинхронной доставки: "if the listener fails for whatever reason, the event publication is lost, unless each listener actually implements its own safety net."
- Ответ — Event Publication Registry:
  - "On event publication, it finds out about the transactional event listeners that will get the event delivered and writes entries for each of them ... into an event publication log as part of the original business transaction."
  - "In case the listener fails, the log entry stays untouched so that retry mechanisms can be deployed".
  - Публикации, которые застряли в `PUBLISHED`, `PROCESSING` или `RESUBMITTED` дольше заданного времени, фоновой задачей помечаются `FAILED`.

**My assessment:** Spring Modulith формально противоречит Guava ("primary means of interaction should be event publication"). Но у Spring Modulith события:
- типизированы классами;
- видны статически (`Documenter`: "listens to", "events published and listened to");
- трассируются спанами;
- имеют журнал доставки.

У Guava EventBus ничего из этого нет. Значит, проблема не в событиях как таковых, а в **невидимых и неучтённых** событиях.

### 4.2 Backstage Software Catalog (v1.55.3, 2026-09-29)

Источник: https://backstage.io/docs/features/software-catalog/well-known-relations

- "Each relation has a _source_ (implicitly: the entity that holds the relation), a _target_ (the entity to which the source has a relation), and a _type_ that tells what relation the source has with the target. The relation is directional; there are commonly pairs of relation types and the entity at the other end will have the opposite relation in the opposite direction".
- `providesApi`/`apiProvidedBy`: "These relations express that a component exposes an API".
- `consumesApi`/`apiConsumedBy`: "These relations express that a component consumes an API - meaning that it depends on endpoints of the API."
- `dependsOn`/`dependencyOf`: "This relation is a general expression of being in need of that other entity for an entity to function."
- Связи обычно генерируются из дескрипторов (`spec.providesApis`, `spec.consumesApis`, `spec.dependsOn`), то есть из **объявлений**, а не из наблюдения за рантаймом.

### 4.3 Декларативная регистрация (VS Code, IntelliJ, Eclipse)

- IntelliJ: "All available listeners/topics are listed on [Extension Point and Listener List] under _Listeners_ sections". Декларативные слушатели "get created lazily — the first time an event is sent to the topic" (https://plugins.jetbrains.com/docs/intellij/plugin-listeners.html). Список топиков и слушателей виден без запуска кода.
- VS Code: "Contribution Points are a set of JSON declarations" в `package.json`; активация описана в `activationEvents` (приложение D основного отчёта).
- Eclipse: "The declarative nature of the platform extension model allows the runtime engine to determine what extension points and extensions are supplied by a plug-in without ever running it."

### 4.4 Контроль графа зависимостей в JS/TS

- Nx, "Enforce Module Boundaries" (https://nx.dev/docs/features/enforce-module-boundaries):
  - "If all of them can depend on each other freely, chaos will ensue, and the workspace will become unmanageable."
  - "You can declaratively define constraints using project tags and enforce them automatically."
- dependency-cruiser 18.6.0 (2026-10-11), README: "_Validate and visualise dependencies. With your rules._" Правила по умолчанию после `--init` включают "detecting **circular dependencies**, dependencies **missing** in package.json, **orphans**".
- Shopify Wedge (2019): "we wrote a tool to hook into Ruby tracepoints during CI to get a full call graph". Packwerk при этом не видит неявные связи (приложение AP).

### 4.5 Контекст причинности для внутрипроцессных событий

**OpenTelemetry JS, Context** (https://opentelemetry.io/docs/languages/js/context/, исходник `open-telemetry/opentelemetry.io` main)
- "The active context is the context which is returned by `api.context.active()`. The context object contains entries which allow tracing components which are tracing a single thread of execution to communicate with each other and ensure the trace is successfully created."
- Механизмы: async_hooks и AsyncLocalStorage в Node, zone.js в браузере.
- Активация: "A context can be made active by use of `api.context.with(ctx, callback)`."

**OpenTelemetry, семантические конвенции messaging** (https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/, статус "Development")
- "A message *creation context* allows correlating producers with consumers of a message and model the dependencies between them, regardless of the underlying messaging transport mechanism and its instrumentation."
- "Consumer traces cannot be directly correlated with producer traces if the message creation context is not attached and propagated with the message."
- "A producer SHOULD attach a message creation context to each message."
- Почему связь через ссылку (link), а не через родителя:
  - "It is the only option to correlate producer and consumer(s) in batch scenarios as a span can only have a single parent."
  - "It is the only option to correlate producer and consumer(s) when message consumption can happen in the scope of another ambient context".

**TC39 AsyncContext** (Stage 2, https://github.com/tc39/proposal-async-context)
- "passing code through the event loop loses _implicit_ information from the call site because we end up replacing the call stack."
- Встроенные планировщики выполняют колбэки в снимке контекста на момент **регистрации**: "built-in schedulers will always run callbacks in the snapshot that was active when the callback was passed to the built-in (i.e. at "registration time")".
- Явно названный минус: для "programmatically-dispatched events whose handlers are installed at application initialization time" и для "tracing execution flow" важнее контекст отправки. Его придётся передавать отдельным каналом: "they can be made available through side channels".

**Node `diagnostics_channel`** (https://nodejs.org/api/diagnostics_channel.html; стабилен с v19.2.0/v18.13.0; `TracingChannel` "Marked as stable" в v26.8.0)
- "The `node:diagnostics_channel` module provides an API to create named channels to report arbitrary message data for diagnostics purposes."
- Дешёвая публикация: `Channel` "exists as a separate object to avoid channel lookups at publish time, enabling very fast publish speeds and allowing for heavy use while incurring very minimal cost."
- `hasSubscribers`: "This is helpful if the message you want to send might be expensive to prepare."
- `TracingChannel`: "a collection of TracingChannel Channels which together express a single traceable action. It is used to formalize and simplify the process of producing events for tracing application flow." События `start`, `end`, `asyncStart`, `asyncEnd`, `error`.
- Ошибки подписчика: "Any errors thrown in the message handler will trigger an `'uncaughtException'`."
- `bindStore` и `runStores` (Experimental) связывают канал с `AsyncLocalStorage`.

**My assessment:**
- Если Get Modular доставляет уведомления в отложенной задаче (как в дизайне OD-007), неявный контекст отправителя (commit) теряется. Это прямо описано в TC39 AsyncContext.
- Чтобы трассировка связывала "кто изменил" с "кто отреагировал", контекст создания нужно захватывать при commit и передавать явно. Это и есть "message creation context" OpenTelemetry. Делать это через `diagnostics_channel` или опциональный адаптер, а не через жёсткую зависимость от OpenTelemetry.

### 4.6 Отладка порядка и причин

- **Redux DevTools** (Redux Style Guide, https://redux.js.org/style-guide/):
  - инструмент показывает "The history log of dispatched actions", "The diff in the state after an action" и "The function stack trace showing the code where the action was actually dispatched";
  - "time-travel debugging";
  - "Redux was specifically designed to enable this kind of debugging".
  - Условия, при которых это работает:
    - "Do Not Put Non-Serializable Values in State or Actions";
    - "Model Actions as Events, Not Setters": "a more meaningful action log history".
- **Angular DevTools, граф сигналов** (https://angular.dev/tools/devtools/signals):
  - "The graph shows how the signals, computeds, effects, and other reactive nodes in that component depend on each other";
  - "Nodes are labeled with the `debugName` of their reactive node."
- **Vue DevTools:** "The Timeline tab shows performance events, including the time spent rendering and updating components." (https://github.com/vuejs/devtools, `docs/getting-started/features.md`).
- **IntelliJ:** "guarantees that all messages sent to particular topic will be delivered at the sending order". Порядок вложенных сообщений задокументирован примером (основной отчёт, C5).
- **VS Code внутри:**
  - `EventProfiling` и `_profName` ("ONLY enable this during development");
  - `leakWarningName` "to help identify which emitter is leaking in telemetry";
  - observables с `DevToolsLogger` и `debugGetObservableGraph` (основной отчёт, A1).
- **Module Federation Observability Plugin** (приложение M): "records runtime loading events, summarizes the final result, prints a stable `traceId` when loading fails".
- **OSGi Event Admin** (основной отчёт, приложение D): `postEvent` доставляет "in the order that they are received". У Kubernetes наоборот — "Random ordering between resources", поэтому систему проектируют так, чтобы от порядка между источниками ничего не зависело.

**My assessment (наблюдаемость):** у зрелых систем три уровня.
1. **Статический граф из объявлений:**
   - Spring Modulith `Documenter`;
   - связи Backstage;
   - декларативные слушатели IntelliJ, VS Code, Eclipse;
   - Nx и dependency-cruiser.

   Его проверяют в CI: циклы, запрещённые рёбра, подписка без публикации (по Hohpe).
2. **Рантайм-трассировка рёбер:**
   - спаны на входе в модуль (Spring Modulith);
   - контекст создания сообщения (OpenTelemetry);
   - дешёвые именованные каналы (Node `diagnostics_channel`).
3. **Журнал событий для отладки порядка:**
   - Redux DevTools;
   - Spring Modulith Event Publication Registry;
   - EIP Message History.

   Работает только если события сериализуемы и названы как факты.

---

## 5. Решение: как лучше сделать в Get Modular (My assessment)

Ниже мой синтез. Факты и источники — в разделах 1–4 и в основном отчёте.

### 5.1 От родителя к ребёнку

1. У каждого значения **один владелец**: React "single source of truth", Fowler "only one source for each bit of data", Piral.
2. Владелец отдаёт детям **capability только для чтения**:
   - снимок плюс ревизия плюс уведомление об изменении;
   - передаётся через `required()` или `optional()`;
   - аналоги: props вниз, `customProps`, Lit Context, Kubernetes `spec`.
3. Дети узнают об изменениях:
   - декларативно — вкладом слушателя в слот `many()` владельца (whiteboard; Guava рекомендует "request them together as a set");
   - или явной регистрацией с `Disposable` как запасной выход.
4. По умолчанию модуль, который не подписался, либо видит только снимок при создании, либо пересоздаётся. Перенастройка на месте включается явно (OSGi DS `modified`, Spring `@RefreshScope`; основной отчёт, A).

### 5.2 От ребёнка к родителю

1. **При композиции:** вклад в слот `many()` родителя — это мейнстрим: extension points, Backstage inputs, OSGi whiteboard.
2. **Во время работы:** ребёнок вызывает **команду** владельца, которую тот явно отдал как capability (Vue provide-функция, React callback). Владелец делает commit, и изменение идёт вниз как подтверждённое: Fowler "requests to update data ... and confirmed updates which everyone acts on"; EIP Command Message против Event Message.
3. **Запрещено:**
   - прямая запись в состояние родителя;
   - запись в источник из колбэка его же доставки (re-entrancy: Guava "unintentional reentrant calls", Flux, IntelliJ);
   - событие-"эхо" в ответ на значение, выставленное владельцем (Lit).

### 5.3 Соседи

Состояние живёт у ближайшего общего владельца (React "lifting state up", Vue "Siblings can communicate via their parent"). Если соседи общаются часто, это сигнал пересмотреть границы, вплоть до слияния модулей (single-spa, AWS).

### 5.4 Далёкие модули

Варианты от лучшего к худшему (надёжность / моя уверенность из 10):

| Вариант | Когда | Надёжность | Уверенность |
|---|---|---|---|
| 1. Типизированная зависимость на capability (`required()`; `optional()`, если модуль может обойтись без неё, и тогда путь действительно неблокирующий, урок AWS Kinesis) | нужен результат или команда | 9 | 8 |
| 2. Whiteboard: источник собирает вклады через `many()` | один ко многим, "все, кому важно X" | 9 | 8 |
| 3. Значение с одним владельцем: capability-источник, которую читают далёкие модули | общее состояние, например настройки | 8 | 8 |
| 4. Типизированный канал событий с владельцем (EIP Datatype Channel; AWS "The contract is the event definition"; Piral known events), объявленный в графе и проверяемый при сборке | действительно независимые части, факты "что-то произошло" | 7 | 6 |
| 5. Глобальная шина со строковыми топиками | — | 3 | 8 |

Вариант 5 — антипаттерн: Guava, Vue 3, single-spa, Fowler, Hohpe.

### 5.5 Наблюдаемость и проверка для сотен модулей

- Граф композиции Get Modular уже явный. В нём нужно сделать видимыми рёбра "provides/consumes" и "contributes listener to", как "listens to" в Spring Modulith, и генерировать из него документацию.
- Проверки при сборке:
  - нет циклов (ADP, Spring Modulith `verify`);
  - нет слушателей без источника и источников без контракта (Hohpe);
  - разрешены только объявленные рёбра (Nx, Spring Modulith `allowedDependencies`).
- Рантайм:
  - имя у каждого источника и слушателя;
  - изоляция и атрибуция ошибок по слушателю;
  - дешёвые именованные диагностические каналы (`diagnostics_channel`) с контекстом создания (OpenTelemetry);
  - пороги утечек (VS Code);
  - журнал ревизий (Message History, Redux DevTools) — опционально, только в dev.
- Настройки — это ввод: проверять до распространения (Cloudflare 2025: "Hardening ingestion ... as ... user-generated input"). Не рассылать непроверенное изменение всем сразу (Cloudflare 2019).

---

## 6. Лучшие практики (каждая с источником)

| # | Практика | Источник |
|---|---|---|
| 1 | Минимизировать межмодульное общение; частое общение означает неверные границы, их надо пересмотреть или модули объединить | single-spa recommended-setup; AWS Prescriptive Guidance (Mezzalira); Cam Jackson, 2019 |
| 2 | Данные и колбэки — вниз от владельца, контракт явный | Cam Jackson, 2019; single-spa `customProps`; Lit Context; React docs |
| 3 | Один владелец значения; остальные читают и получают уведомления | Piral `setData`; AWS "read-only sharing"; Fowler, Event Collaboration, 2006 |
| 4 | Разделять запрос на изменение (команду) и подтверждённое изменение (событие) | Fowler, Event Collaboration, 2006; EIP Command, Event и Document Message |
| 5 | Слушателей собирать через DI multibindings или whiteboard, а не через шину | Guava `EventBus` javadoc, 2021; OSGi whiteboard (основной отчёт) |
| 6 | Типизированные, документированные контракты событий; один тип на канал | AWS "The contract is the event definition"; Piral known events; EIP Datatype Channel |
| 7 | Граф без циклов; зависеть в сторону стабильности | Martin, ADP и SDP, 1996; Spring Modulith `verify()`; Shopify, 2020 |
| 8 | Проверять граф при сборке: подписки без публикаций, циклы, запрещённые рёбра | Hohpe, EDA.pdf, 2006; Nx Enforce Module Boundaries; dependency-cruiser |
| 9 | Генерировать документацию и диаграммы связей, включая "listens to", из модели | Spring Modulith `Documenter`; Backstage catalog relations; Fowler 2006 ("automated tools") |
| 10 | Декларативная регистрация расширений и слушателей, видимая без запуска | IntelliJ declarative listeners; VS Code contribution points; Eclipse extension registry |
| 11 | Спаны на входе в модуль и контекст создания сообщения | Spring Modulith observability; OpenTelemetry messaging conventions |
| 12 | Correlation ID и Message History с первого дня | Azure EDA style, 2026; EIP Message History |
| 13 | Не отправлять события в ответ на значение, выставленное владельцем (без эха) | Lit, "When to dispatch an event" |
| 14 | Идемпотентные получатели; устойчивость к дублям и порядку | Hohpe, Starbucks, 2004; Zalando Guidelines, 2026 |
| 15 | События называть как факты, а не сеттеры; сериализуемые данные | Redux Style Guide |
| 16 | Входящую конфигурацию валидировать как ввод; поэтапная раскатка и kill switch | Cloudflare, 2019 и 2025 |
| 17 | Только явный публичный интерфейс модуля, внутренности закрыты | single-spa "public interface"; Spring Modulith "API packages only" |

## 7. Худшие практики (каждая с источником)

| # | Антипаттерн | Источник |
|---|---|---|
| 1 | Глобальное общее хранилище (Redux или MobX) на все модули | single-spa; AWS (Mezzalira); Cam Jackson |
| 2 | Глобальная in-process шина событий | Guava `EventBus` ("We recommend against using EventBus"); Vue 3 migration guide (основной отчёт) |
| 3 | Поток событий, не видимый в коде, только в рантайме или конфигурации | Fowler, 2006 и 2017; Hohpe, 2006; Nygard, 2018 |
| 4 | Длинные каскады событий из локально разумных реакций | Fowler, Event Collaboration (пример с операционной) |
| 5 | Повторный вход: запись в источник во время его доставки | Guava ("unintentional reentrant calls"); IntelliJ; Flux (основной отчёт) |
| 6 | Потеря событий, когда слушатель ещё не готов или уже переподписывается | Guava ("the event is dropped"); Fastify и Nest (основной отчёт) |
| 7 | Циклы в графе зависимостей | Martin, ADP, 1996; Shopify, 2020 |
| 8 | Неявные зависимости, невидимые инструменту контроля границ | Shopify, Packwerk Retrospective, 2024 |
| 9 | Общие доменные модели или логика в общих библиотеках | Cam Jackson, 2019; Segment, 2018 |
| 10 | Делать общим всё; несколько копий библиотеки с состоянием; молчаливые расхождения версий singleton | single-spa; module-federation.io; webpack runtime |
| 11 | Нетипизированные строковые события; передача функций между модулями во время работы | Piral docs |
| 12 | "Опциональная" зависимость, которая на деле блокирует | AWS Kinesis, 2020-11-25 |
| 13 | Наблюдаемость зависит от наблюдаемой подсистемы | AWS, 2020 и 2021 |
| 14 | Непроверенное изменение настроек мгновенно рассылается всем | Cloudflare, 2019 и 2025 |
| 15 | Ошибки слушателей не изолированы или проглатываются без отчёта | Guava ("doesn't propagate exceptions"); Node EventEmitter (основной отчёт) |
| 16 | Чрезмерная изоляция, мешающая сквозным изменениям | Spotify, 2019 |

## 8. UNVERIFIED и NOT FOUND

- Содержание книги Mezzalira "Building Micro-Frontends" (2-е издание).
- Официальное руководство Module Federation по общему состоянию между remotes.
- Первоисточники разборов от IKEA и DAZN.
- Разборы от Uber, Netflix и DoorDash о проблемах событийной архитектуры (NOT FOUND).
- Содержание разделов Nygard кроме Integration Points (известны только названия по оглавлению).
- Дословная формальная формулировка Law of Demeter из статьи OOPSLA'88 (PDF извлёкся с разрывами).
- Точный номер выпуска C++ Report со статьёй "Granularity".
- Доклад Mezzalira на QCon 2025 известен только по пересказу InfoQ (вторичный источник).


---

# Приложение M (полный отчёт по микрофронтендам, без изменений)

## Micro-frontends: how separately built UI modules communicate (2026-10-15)

## How this was gathered

Almost every source was downloaded with `curl` into `scratchpad/mf-raw/` and the quotes were pulled out with `grep`/`sed`. The quotes are therefore verbatim. For Markdown sources I took the raw files from GitHub (`single-spa/single-spa.js.org`, `webpack/webpack.js.org`, `webpack/webpack`, `module-federation/core`, `web-infra-dev/rspack`, `mdn/content`, `lit/lit.dev`, `webcomponents-cg/community-protocols`, `smapiot/piral`, `SAP/luigi`). Two sources came from elsewhere:
- Mezzalira's 2019 Medium post: the Wayback Machine snapshot `20210507234809`, because Medium answers 403.
- His 2025 QCon talk: InfoQ's report of the talk. This is a secondary source and is labelled as one.

Anything not confirmed by a primary source is marked UNVERIFIED. My own opinions appear only under "My assessment:".

---

## M1. single-spa: official "Inter-app communication" guidance

Source:
- page: https://single-spa.js.org/docs/recommended-setup;
- raw file: `versioned_docs/version-6.x/recommended-setup.md`, last commit 2025-10-24;
- npm `single-spa` 6.0.3.

**What it recommends, from least to most coupling:**
- The ideal is to not communicate: "_A good architecture is one in which microfrontends are decoupled and do not need to frequently communicate. Following the guidelines above about applications versus parcels helps you keep your microfrontends decoupled. Route-based single-spa applications inherently require less inter-app communication._"
- The docs name three kinds of thing that get shared:
  - "1. Functions, components, logic, and environment variables. 2. API data 3. UI state"
- Functions, components and logic go through explicit imports. "We recommend using cross microfrontend imports to share functions, components, logic, and environment variables."
  - "You can import and export functions, components, logic, data, event emitters, and environment variables between your microfrontends ... Each microfrontend should have a single entry file that serves as the "public interface" that controls what is exposed outside of the microfrontend."
- API data goes through a utility module that owns a cache. "An in-memory JavaScript cache of API objects is a solution used by several companies to solve this." The example exports `getLoggedInUser()` from an `@org-name/api` utility module.
- UI state:
  - "_If two microfrontends are frequently passing state between each other, consider merging them. The disadvantages of microfrontends are enhanced when your microfrontends are not isolated modules._"
  - "If you find yourself needing constant sharing of UI state, your microfrontends are likely more coupled than they should be. Consider merging them into a single microfrontend."
  - "Under the rare circumstances where you do need to share UI state between single-spa applications, an event emitter may be used to do so."
  - The listed options are RxJS Observables/Subjects ("It exports the observable to all microfrontends from its in-browser module"), CustomEvents ("Firing the events with `window.dispatchEvent` allows you to subscribe in any other microfrontend with `window.addEventListener`"), and "Any other pub/sub event emitter system."

**What it discourages:**
- A global store across microfrontends: "The single-spa core team cautions against using redux, mobx, and other global state management libraries. However, if you'd like to use a state management library, we recommend keeping the state management tool specific to a single repository / microfrontend instead of a single store for all of your microfrontends."
- The reason given: "You cannot independently deploy a microfrontend if it relies on the global store's state to be a specific shape or have specific actions fired by other microfrontends - to do so you'd have to think really hard about whether your changes to the global store are backwards and forwards compatible with all other microfrontends."
- Sharing every dependency: "It is not advisable to make everything a shared dependency, because shared dependencies must be upgraded at once for every microfrontend that uses them."

**Splitting advice:** "Prefer splitting microfrontends by route, instead of by components within a route ... your single-spa applications on different routes do not need to ever share UI state." The docs also recommend "Many route-based single-spa applications, very few single-spa parcels".

**Data flows down from the root config through props:**
- `registerApplication({ ..., customProps })`. The docs (`single-spa-config.md`, 6.x) say: "The optional `customProps` property provides custom props that are passed to the application's single-spa lifecycle functions. The custom props may be either an object or a function that returns an object. Custom prop functions are called with the application name and current `window.location` as arguments."
- Parcels have the lifecycles `bootstrap`, `mount`, `unmount` and `update(props)` (`parcels-overview.md`). The parent re-renders a parcel through `parcel.update(parcelProps)`.

## M2. Module Federation (webpack 5, module-federation.io / `@module-federation/enhanced`, Rspack)

Sources:
- webpack plugin docs: https://webpack.js.org/plugins/module-federation-plugin/ (raw `src/content/plugins/module-federation-plugin.mdx`, last commit 2026-09-11; npm `webpack` 5.111.1);
- webpack concept docs: https://webpack.js.org/concepts/module-federation/;
- webpack runtime source: `webpack/webpack` main `lib/sharing/ConsumeSharedRuntimeModule.js`;
- module-federation.io:
  - https://module-federation.io/configure/shared;
  - https://module-federation.io/guide/troubleshooting/runtime (last commit 2026-06-16);
  - https://module-federation.io/guide/runtime/runtime-hooks;
  - https://module-federation.io/plugin/plugins/observability-plugin;
  - npm `@module-federation/enhanced` 2.9.2;
- Rspack: https://rspack.dev/plugins/webpack/module-federation-plugin (npm `@rspack/core` 2.2.9).

**`shared` options (webpack docs):**
- `singleton`:
  - "This hint only allows a single version of the shared module in the shared scope (disabled by default). Some libraries use a global internal state (e.g. react, react-dom). Thus, it is critical to have only one instance of the library running at a time."
  - "In cases where there are multiple versions of the same dependency in the shared scope, the highest semantic version is used."
- `requiredVersion` and the trade-off it makes: "A share scope can hold several versions of the same module at once — each build provides the version it has, and a consumer gets the highest one that satisfies its own `requiredVersion`. ... `singleton: true` gives up that guarantee to keep one instance, and warns when the chosen version does not satisfy a consumer."
- `strictVersion`: "This hint allows webpack to reject the shared module if version is not valid ... Throws a runtime error if the required version is not found."
- `eager`: "This hint will allow webpack to include the provided and fallback module directly instead of fetching the library via an asynchronous request. ... Also, be careful that all provided and fallback modules will always be downloaded when this hint is enabled."
- `shareScope`: "Change it to keep groups of builds apart — for example when a page hosts two independent sets of remotes that should each get their own copy of a library".

**The shared scope is one mutable object shared by host and remotes (concept docs):**
- "`init()` does not copy the scope — the container **adopts** the object it is given and then registers its own provided modules into it. So provisions flow in both directions".
- "This is why sibling remotes _do_ share with each other. They are handed the same scope object by their common host".
- "An already-loaded version is never replaced."

**Documented pitfalls:**
- Version mismatch warning, from the runtime source string: `"Unsatisfied version " + version + " from " + ... + " of shared singleton module " + key + " (required " + rangeToString(requiredVersion) + ")"`. Under `singleton` without `strictVersion` this is only a `warn(...)`.
- Eager consumption:
  - error: "`Uncaught Error: Shared module is not available for eager consumption`" (webpack concept docs);
  - advice: "We strongly recommend using an asynchronous boundary."
  - module-federation.io RUNTIME-005: "After Shared is set, the corresponding dependent library will be determined to be an asynchronous module. If the asynchronous entry is not enabled and `eager: true` is not set, then this error will occur."
- Double initialization: "`Container initialization failed as it has already been initialized with a different share scope`"; "It usually means the page initialized sharing more than once".
- Duplicate React copies (module-federation.io troubleshooting, "Common Issues"):
  - the error: "Warning: Invalid hook call. ... You might have more than one copy of React in the same app";
  - the explanation: "This error is a React multi-instance problem, which usually occurs when react does not reuse the same instance. This problem can be avoided by setting `shared` and setting `singleton: true` singleton mode."
  - A subpath variant: "The `shared` config only lists the exact package name ... subpath imports such as `import { createRoot } from 'react-dom/client'` bypass the shared config and are bundled locally." The fix is a trailing slash, as in `'react-dom/': { singleton: true }`.
- Tree-shaking a shared library can break the singleton (`shared-tree-shaking.mdx`): "This can result in two different antd instances on the same page (a minimal one and a full one). That breaks the singleton constraint and may cause style conflicts, non-shared state, or even crashes."

**Runtime plugins and hooks (module-federation.io):**
- "The Module Federation runtime exposes hooks at key stages — loading remote modules, initializing containers, registering and resolving shared dependencies".
- The hook kinds are Tapable-style (`SyncHook`, `AsyncHook`, `SyncWaterfallHook`, `AsyncWaterfallHook`), for example `resolveShare` ("`SyncWaterfallHook` Allows overriding the final shared module selection result."), `errorLoadRemote` and `beforeLoadShare`.
- The Observability Plugin "records runtime loading events, summarizes the final result, prints a stable `traceId` when loading fails". It answers questions such as "Which shared dependency provider and version were selected?" (requires MF 2.5.0+). This also bears on item 3 (observability), which another pass covers.

**Rspack:** "This plugin implements the Module Federation 1.5 specification." It depends on `@module-federation/runtime-tools`.

**Official guidance on sharing application state between remotes:**
- I found none on module-federation.io. Searches of `apps/website-new/docs/en` for "global state", "shared state" and "communicate between" returned nothing relevant.
- What the docs do show is passing data down from host to remote: "Pass props directly (e.g. `userId="123"`) or via the `props` object" (Bridge `createRemoteAppComponent`).
- Status: UNVERIFIED that any official MF guidance on cross-remote state exists.

## M3. Cam Jackson, "Micro Frontends", martinfowler.com, 19 June 2019

Source: https://martinfowler.com/articles/micro-frontends.html

"Cross-application communication" section, verbatim:
- "One of the most common questions regarding micro frontends is how to let them talk to each other. In general, we recommend having them communicate as little as possible, as it often reintroduces the sort of inappropriate coupling that we're seeking to avoid in the first place."
- "Custom events allow micro frontends to communicate indirectly, which is a good way to minimise direct coupling, though it does make it harder to determine and enforce the contract that exists between micro frontends. Alternatively, the React model of passing callbacks and data downwards (in this case downwards from the container application to the micro frontends) is also a good solution that makes the contract more explicit. A third alternative is to use the address bar as a communication mechanism".
- On Redux: "if each micro frontend is supposed to be its own self-contained application, then it makes sense for each one to have its own redux store."
- "Whatever approach we choose, we want our micro frontends to communicate by sending messages or events to each other, and avoid having any shared state. Just like sharing a database across microservices, as soon as we share our data structures and domain models, we create massive amounts of coupling, and it becomes extremely difficult to make changes."
- "The most important thing is to think long and hard about what sort of coupling you're introducing, and how you'll maintain that contract over time. Just as with integration between microservices, you won't be able to make breaking changes to your integrations without having a coordinated upgrade process across different applications and teams."
- "Alternatively you could implement some form of consumer-driven contracts, so that each micro frontend can specify what it requires of other micro frontends, without needing to actually integrate and run them all in a browser together."

"Cross-application communication via routing" section, verbatim. The URL is useful because:
- "Its structure is a well-defined, open standard"
- "It's globally accessible to any code on the page"
- "Its limited size encourages sending only a small amount of data"
- "It's declarative, not imperative. I.e. "this is where we are", rather than "please do this thing""
- "It forces micro frontends to communicate indirectly, and not know about or depend on each other directly"

The same section adds: "When using routing as our mode of communication between micro frontends, the routes that we choose constitute a contract. ... Given the importance of this contract, we should have automated tests that check that the contract is being adhered to."

"Shared component libraries" section: "be careful to ensure that your shared components contain only UI logic, and no business or domain logic. When domain logic is put into a shared library it creates a high degree of coupling across applications, and increases the difficulty of change."

Downsides: "Operational and governance complexity". The question the article raises: "How will you ensure a minimum level of quality, consistency, or governance across your many independent frontend codebases?"

## M4. Luca Mezzalira

**AWS Prescriptive Guidance, "Micro-frontends on AWS"**
- Initial publication July 12, 2024; the contributors include "Luca Mezzalira, Principal Go to Market Specialist Solutions Architect Serverless UK, AWS".
- Root URL: https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/

Routing and communication (`routing-communication.html`):
- "With micro-frontend architectures, we recommend reducing the coupling between frontend components. One approach to reduce coupling is to move away from synchronous function calls to asynchronous messaging."
- "Events can be exchanged between producers and consumers through messages. The events provide a well-defined interface for communication across micro-frontends."
- "The messaging mechanism for events can be native DOM events (CustomEvents), JavaScript event emitters, or reactive stream libraries provided by the platform teams. Micro-frontends publish events and subscribe to events relevant for their bounded context. With this method, the publishers and subscribers don't need to be aware of each other. The contract is the event definition."

Cross-interactivity using events (`cross-interactivity.html`):
- "Technically, a shared state library such as Redux can be used by multiple micro-frontends and coordinated by a shell. However, that creates significant coupling between applications, resulting in code that is harder to test, and it might slow performance during rendering."
- "One common, effective approach is to develop an event bus that's distributed as a library, orchestrated by the application shell, and used by multiple micro-frontends. In this way, each micro-frontend publishes and listens to particular events asynchronously, basing its behavior on its own internal state only. Then, multiple teams can maintain a shared wiki page that describes events and documents behaviors".
- "We recommend using standard APIs implemented natively by modern browsers to improve simplicity and maintainability."

Managing dependencies and shared state (`manage-dependencies.html`):
- "Three viable strategies for mandating dependency maintenance are share nothing, using web standards such as import maps, and module federation. Other approaches are anti-patterns because they violate basic principles of distributed architectures."
- "To reduce the coupling of micro-frontends, it's important to avoid a global state management accessible from all the micro-frontends in the same view, similar to monolithic architectures. For example, having a global Redux store accessible from all micro-frontends increases coupling."
- "A pattern to eliminate shared state is to encapsulate it within micro-frontends, and communicate with asynchronous messages".
- "When absolutely necessary, introduce well-defined interfaces for global state, and opt in for read-only sharing to avoid unexpected behavior".
- "If you need to share several pieces of information across micro-frontends, we recommend revisiting the micro-frontend boundaries. The need to share might be caused by business evolution or a subpar initial design."

Boundaries (`micro-frontend-boundaries.html`):
- "A well-defined bounded context should minimize functional overlap and the need for runtime communication across contexts."
- For portal and dashboard apps: "the hosting application defines the constraints and interfaces that the micro-frontends should implement."

API contracts (`api-contracts.html`): "Wikis curated by humans are a good start. A more scalable approach is to store this information as structured metadata in code." This also bears on item 3.

**Medium, "Micro-frontends decisions framework", Dec 22, 2019**
- URL: https://medium.com/@lucamezzalira/micro-frontends-decisions-framework-ebcd22256513. The text was read from the Wayback snapshot http://web.archive.org/web/20210507234809/https://medium.com/@lucamezzalira/micro-frontends-decisions-framework-ebcd22256513.
- "The final decision is finding a good way of communicating between micro-frontends bearing in mind that are independent units that should be completely decoupled between each other."
- "In this case, we could use custom events or an event emitter library (there are many available) so our micro-frontends just emit/dispatch an event and who is listening reacts to that specific event."
- Between views: "We can decide to use a web-storage solution (local and/or session storage) where every time a new view is loaded looks inside the web-storage to find the information needed or a URL routing where the application request to the backend the user state".

**QCon London 2025 talk** (secondary source: InfoQ, Olimpiu Pop, Apr 30, 2025, https://www.infoq.com/news/2025/04/microfrontend-best-practices/)
- "Communicate: Choosing how microfrontends will communicate with each other (event emitter, custom events, or reactive streams, with event emitter being recommended)".
- The heuristics reported:
  - "Reduce APIs that are exposed to the container (typically having 1-2 APIs or properties maximum)"
  - "Microfrontends are context-aware (the state lives inside the microfrontend, not outside it)"
  - "if you have 25 runtime microfrontends, you're likely dealing with a distributed monolith"
- On the shell: "Changes to microfrontends should never require modifications to the shell, as this indicates poorly defined boundaries where domain knowledge is leaking."

**The book "Building Micro-Frontends"**
- O'Reilly lists a 2nd edition (October 2025).
- I could not read an excerpt of its communication chapter. The O'Reilly page returned no content and no other excerpt was found. Status: UNVERIFIED.

## M5. Web Components: custom events and context

**MDN** (`mdn/content` main, 2026-10-15)
- `CustomEvent`: "The **`CustomEvent`** interface can be used to attach custom data to an event generated by an application." Data travels in `detail`.
- `Event.composed`: indicates "whether or not the event will propagate across the shadow DOM boundary into the standard DOM." and "Propagation only occurs if the `bubbles` property is also `true`." Also: "Most other types of events are not composed ... this includes synthetic events that are created without their `composed` option set to `true`."
- `dispatchEvent()`: "sends an Event to the object, (synchronously) invoking the affected event listeners in the appropriate order" and "Unlike "native" events, which the browser fires by queuing a task on the event loop, `dispatchEvent()` invokes all applicable event handlers synchronously before returning."

**Lit events** (https://lit.dev/docs/components/events/, raw `docs/v3/components/events.md`)
- "The `bubbles` option allows the event to flow up the DOM tree to ancestors of the dispatching element." and "The `composed` option is useful to set to allow the event to be dispatched above the shadow DOM tree in which the element exists."
- "When to dispatch an event": "Events should be dispatched in response to user interaction or asynchronous changes in the component's state. They should generally **not** be dispatched in response to state changes made by the owner of the component via its property or attribute APIs. This is generally how native web platform elements work."
  - The example given: "when a user types a value into an `input` element a `change` event is dispatched, but if code sets the `input`'s `value` property, a `change` event is **not** dispatched."
- Shadow DOM: "By default, an event dispatched inside a shadow root will not be visible outside that shadow root."
- Listeners can talk back to the dispatcher: "a listener can set a property on a custom event's detail property which the dispatching component then uses to customize behavior", or call `preventDefault()`.

**Lit context** (`@lit/context` 1.1.6; https://lit.dev/docs/data/context/)
- "Context is a way of making data available to entire component subtrees without having to manually bind properties to every component. The data is "contextually" available, such that ancestor elements in between a provider of data and consumer of data aren't even aware of it."
- "Lit's context is based on the Context Community Protocol by the W3C's Web Components Community Group."
- "The Context Protocol is based on DOM events. A consumer fires a `context-request` event that carries the context key that it wants, and any element above it can listen for the `context-request` event and provide data for that context key."
- Subscriptions: "When a consumer requests data for a context, it can tell the provider that it wants to _subscribe_ to changes in the context. If the provider has new data, the consumer will be notified and can automatically update."
- Services through context: "An advantage of context over importing from a common module are the late coupling and tree-scoping that context provides. Tests can easily provide mock services, or different parts of the page can be given different service instances."
- HTML plugins: "`<code-editor>` would provide an API for adding language modes via context, and plugin elements would consume that API and add themselves to the editor."

**WCCG Context Protocol** (https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md; "Document status: Candidate", "Last update: 2025-05-02")
- Goals:
  - "Alleviate the problem of *prop drilling*"
  - "Synchronous protocol, while supporting asynchronous patterns"
  - "Support single or multiple delivery of context values"
- Non-goals: "**Context API !== Dependency Injection Framework**" and "**Context API is not a state management alternative**".
- Leak rules:
  - "The provider _MUST NOT_ retain a reference to the `callback` nor pass an `unsubscribe` callback if the `context-request` event's `subscribe` property is not truthy. Doing so may cause a memory leak as the consumer may not ever call the `unsubscribe` callback."
  - "it is recommended that the provider uses WeakRefs to reference subscription callbacks."
- Lifecycle: "custom elements which participate in the Context API should fire their `context-request` events in their `connectedCallback()` method. Likewise in their `disconnectedCallback()` method they should invoke any unsubscribe callbacks they have received."

## M6. Piral and Luigi

**Piral** (npm `piral-core` 1.12.4; docs in `smapiot/piral` `docs/`; https://docs.piral.io)

Shared data with a single writer (`tutorials/12-sharing-between-pilets.md`, `api/05-set-data.md`):
- "The only thing to know is the name of the data item. It should be as unique as possible as overwriting is not allowed. Thus, the first one writing data will "own" (i.e., have the right to modify) it."
- "This data can be accessed from any other pilet, but can only be changed by the current pilet."
- "Using the name occupied by another pilet will result in no change."
- "When the `setData` function is called an event is emitted to notify subscribers about a change in data." The event is named `store-data`.
- Options include an expiration time and a target (`memory`, `local`, `remote`).
- A warning attached to the store: "While this can be also (ab)used to build some pilet-internal store (i.e., state container) we recommend abstractions as provided by plugins such as `piral-containers` or `piral-feeds` instead."

Sharing functions is discouraged: "While sharing functions is possible, we do not necessarily recommend it for multiple reasons. Usually, you do not want to risk not having the function available. Even worse, it may be available, but different than expected." The docs suggest a shared package instead.

Extensions are a producer/consumer slot mechanism:
- "Producers create components and place them in extension container(s)";
- "Consumers reference components in an extension container by specifying an *extension slot*".

Events vs data (`tutorials/17-events.md`, last commit 2022-12-11):
- "If all we want is to distribute a piece of information to anyone listening *right now* then an *event* may be the right thing. ... If we need the information to be available also for future use (i.e., even to interested parties that are not listening right now) then the datastore is a better option. UI fragments are best shared via the extension mechanism."
- The API is `on`, `off` and `emit`. "We recommend only passing on objects, as they are extensible and could be extended in the future without breaking on consumers."
- Typed events: "The event mechanism in Piral is quite flexible and works with *any* name and *any* argument. While this is very dynamic indeed, it also leaves room for error due to typos or wrong assumptions. Ideally, the events are all known by every participant and can thus be hard coded via a TypeScript definition."
- Implementation: "Underneath we use custom events to leverage the browser's native way of distributing events quickly and reliably. We do not serialize the event args."

**Luigi** (SAP; npm `@luigi-project/core` 2.32.0; docs in `SAP/luigi` `docs/`)
- `communication.md`: "Luigi Core and Luigi Client can exchange custom messages in both directions." Client to Core uses `sendCustomMessage`. Core to Client can target "all rendered micro frontends, or ... a specific one". There is also `skipEventsWhenInactive` "to ignore events normally sent from Luigi Client to Luigi Core when an iframe/micro frontend is not currently selected or active".
- Context flows down (`luigi-client-api.md`):
  - `addInitListener`: "Registers a listener called with the context object and the Luigi Core domain as soon as Luigi is instantiated. Defer your application bootstrap if you depend on authentication data coming from Luigi."
  - `addContextUpdateListener`: "Registers a listener called with the context object when the URL is changed."
  - Inactive views: "Once the micro frontend turns back into active state, the `addContextUpdateListener` receives an updated context."
- My reading of these docs, not a statement in them: the documented channel is hub-and-spoke through Luigi Core. I found no documented direct channel between two micro frontends.

## M7. Lessons learned and anti-patterns (primary sources only)

**Zalando** (engineering blog)
- "Micro Frontends: from Fragments to Renderers (Part 1)", Jan Brockmeyer, Mar 11, 2021, https://engineering.zalando.com/posts/2021/03/micro-frontends-part1.html. Pain points of Project Mosaic:
  - "Differences in tech stacks, bundling, and deployment practices across fragments led to inconsistent user experience and cross-team collaboration difficulties"
  - a "high entry barrier", where teams had to "discover and integrate with all the data sources" and "re-implement or adjust tracking & A/B testing".
- "Micro Frontends: Deep Dive into Rendering Engine (Part 2)", Brockmeyer and Shirshin, Sep 09, 2021, https://engineering.zalando.com/posts/2021/09/micro-frontends-part2.html:
  - "Renderers are not intended to share data with each other that is based on the client side state. We want to avoid unwanted data coupling and allow Renderers to be reused in other contexts with minimal risks."
  - "Since all Renderers use the same data schema for their data dependencies, they can subscribe to changes in the schema to limit the need for cross-renderer communication."
  - "each Renderer may "suggest" which entities should be rendered as its children, but has no control over the actual renderer choice. That choice is based exclusively on the Rendering Rules."
  - "Renderers are declarative. They specify their dependencies and behaviour but delegate all implementation to the Rendering Engine".

**Spotify** ("Building Spotify's New Web Player", José M. Pérez, Mar 25, 2019, https://engineering.atspotify.com/2019/3/building-spotifys-new-web-player)
- "The views were isolated from each other using iframes, and this allowed the teams to iterate on and release them without interfering with the rest of the application."
- "In the summer of 2016 ... We realized that the architecture of isolated views was difficult to maintain and was preventing us from building a better product."
- "Giving every team an isolated environment to run their code also resulted in them choosing different client-side stacks to build their views."
- "It was very slow to iterate upon and experiment, especially when it came to making changes across multiple views like updating the visual style."
- This is a lesson about the cost of over-isolation. It is not specifically about communication.

**IKEA and DAZN-specific communication postmortems:** I did not find primary sources. Status: UNVERIFIED. The DAZN evidence above is limited to Mezzalira's own posts and talk reports.

---

## My assessment:

1. **The industry is consistent.** Every source surveyed tells you to minimise communication between micro-frontends and to treat frequent communication as a boundary smell: single-spa ("consider merging them"), AWS ("revisiting the micro-frontend boundaries"), Cam Jackson ("as little as possible"), Zalando ("limit the need for cross-renderer communication").
2. **Parent to child:**
   - Data and callbacks go down from the container: single-spa `customProps` and `parcel.update(props)`, Module Federation Bridge `props`, Luigi context listeners, Lit and WCCG context.
   - Cam Jackson calls passing callbacks and data downwards from the container "a good solution that makes the contract more explicit".
   - Lit adds a no-echo rule: do not fire events in response to the owner setting a property. This prevents parent-child feedback loops.
3. **Siblings and distant parts:**
   - Use events with a documented, typed contract: AWS "The contract is the event definition", Piral "known" events through a TypeScript declaration, the AWS event wiki.
   - Use a single-writer shared value, where the owner writes and others read and get notified: Piral `setData` ownership, AWS "read-only sharing", the single-spa utility-module cache.
   - Use the URL for navigation-level intent.
   - The global store is the most consistently named anti-pattern (single-spa, AWS, Cam Jackson).
4. **Shared runtime singletons** (Module Federation `singleton`) are a coupling point. The failures are silent: the version mismatch is only a warning unless `strictVersion` is set, and duplicate instances come from subpath imports and tree-shaking.
5. **Events vs state** (Piral): an event reaches only current listeners, while a datastore holds a value for future readers. This matches the "notification plus read the current snapshot" model from area A of the main report.

## Best practices (each with a source)

| Practice | Source |
|---|---|
| Minimise cross-module communication; frequent sharing means wrong boundaries, so merge or redraw | single-spa recommended-setup ("consider merging them"); AWS manage-dependencies ("revisiting the micro-frontend boundaries") |
| Pass data and callbacks down from the container; it makes the contract explicit | Cam Jackson, martinfowler.com 2019; single-spa `customProps`; Module Federation Bridge `props` |
| Expose a single public entry and explicit imports for shared functions and logic | single-spa "Cross microfrontend imports" |
| Typed and documented event contracts ("The contract is the event definition") | AWS routing-communication; Piral "Known vs Unknown Events" |
| Single writer for shared data, read-only for everyone else, with change notification | Piral `setData` ("the first one writing data will "own""); AWS "opt in for read-only sharing" |
| Use the URL for navigation intent, and test route contracts | Cam Jackson, "via routing" section |
| Context provider/consumer for data down without prop drilling; release subscriptions on disconnect | Lit context; WCCG Context Protocol |
| Do not emit events when the owner set the value (no echo) | Lit "When to dispatch an event" |
| Prefer standard browser APIs (CustomEvent) | AWS cross-interactivity |
| Consumer-driven contracts instead of full integration runs | Cam Jackson |

## Worst practices (each with a source)

| Anti-pattern | Source |
|---|---|
| A global Redux/MobX store shared by all micro-frontends | single-spa "State management"; AWS manage-dependencies; Cam Jackson |
| Sharing domain models or domain logic through shared libraries | Cam Jackson ("massive amounts of coupling"; "no business or domain logic") |
| Making every dependency shared | single-spa "Shared dependencies" |
| Multiple copies of a stateful singleton library (React), including through subpath imports or tree-shaking | module-federation.io troubleshooting; shared-tree-shaking |
| Silent version mismatches on shared singletons (warn only) | webpack runtime "Unsatisfied version ..."; webpack `singleton` docs |
| Untyped, ad-hoc event names ("typos or wrong assumptions") | Piral events tutorial |
| Sharing functions at runtime ("may be available, but different than expected") | Piral sharing tutorial |
| Over-isolation (iframe per view), which led to divergent stacks and slow cross-view change | Spotify engineering blog 2019 |
| Shell changes needed for micro-frontend changes, meaning domain is leaking | Mezzalira, QCon 2025 (InfoQ report, secondary) |
| Providers retaining callbacks without a subscription contract (leaks) | WCCG Context Protocol |

---

# Приложение AP (полный отчёт по литературе об антипаттернах, без изменений)

## Пункт 2: литература об антипаттернах и уроках межмодульного взаимодействия

Дата сбора: 2026-10-15. Почти все источники скачаны через `curl` в `scratchpad/ap-raw/`. PDF разобраны `pdftotext`, HTML — локальным скриптом. Цитаты извлечены `grep`/`sed` и приведены дословно.

Условные пометки:
- **UNVERIFIED** — не подтверждено первоисточником.
- **NOT FOUND** — авторитетного источника не нашлось.
- **source reading** — вывод из чтения кода.
- **My assessment:** — моё мнение.

---

## 2.1 Gregor Hohpe

### 2.1.1 "Programming Without a Call Stack – Event-driven Architectures"

Источник: https://www.enterpriseintegrationpatterns.com/docs/EDA.pdf, © 2006 Gregor Hohpe, 10 страниц.

**Что теряется без стека вызовов.**
- "An event-based architecture takes away what must be one of the most pervasive and underappreciated constructs in programming – the call stack."
- "This behavior can be summarized as three main features: coordination, continuation and context."
- "The interaction between components in an EDA does not provide any of these functions ... There is no inherent coordination, continuation or context preservation."

**Цена гибкости (раздел "Composition").**
- "the flexibility that the loose coupling affords usually comes at a price. This price amounts to less build-time validation and the fact that a highly composable system allows us to compose it in many ways that do not make a lot of sense or do not do what we had in mind."
- Пример ошибки: "an event source and a listener might accidentally be configured for a different type of event or channel, potentially the result of a trivial typo in the name. As a result the event sink will not receive any events at all. However, we do not find out until we start the system".
- "The configurability can suddenly turn into a debugging liability."

**Композицию нужно проверять при проектировании.**
- "The composition of individual components into a coherent, event-driven application should be viewed as an additional layer of the overall system architecture. This layer should be taken as seriously as the core code layers."
- "All too often is this type of composition information (e.g. the names of published or subscribed event channels) hidden away in cryptic configuration files".
- "a configuration which prescribes an event subscription that does not match any publication may be considered invalid. Likewise, circular references in the event graph may be undesirable and should be detected at design time."

**Визуализация.** Нужно снимать с работающей системы модель "Nodes: A, B / Edges: X(A->B)" и рисовать её как граф (GraphViz): "Such a model and diagram can be invaluable for debugging and analysis."

**Итог статьи.** "Systems that pass up the well-known tenets of a call stack in favor of loosely structured interaction are inherently more difficult to design and debug. Therefore, one should employ management and visualizations tools to create a system that is dynamic but not chaotic."

**О переносе состояния к потребителю.** "In a loosely coupled interaction a source of data should not be required to keep state at the convenience of its communication partners." Обратная сторона: потребители становятся Aggregator'ами и хранят копии данных.

### 2.1.2 Каталог Enterprise Integration Patterns

Источник: https://www.enterpriseintegrationpatterns.com/patterns/messaging/ (книга Hohpe и Woolf, 2003; страницы паттернов скачаны 2026-10-15).

**Publish-Subscribe Channel**
- Решение: "Send the event on a Publish-Subscribe Channel, which delivers a copy of a particular event to each receiver."
- Польза для отладки: "A Publish-Subscribe Channel can be a useful debugging tool. ... Monitoring all traffic on a channel can be tremendously helpful when debugging messaging applications."

**Три типа сообщений** — разделение намерения и факта:
- **Command Message:** "Use a Command Message to reliably invoke a procedure in another application."
- **Document Message:** "Whereas a Command Message tells the receiver to invoke certain behavior, a Document Message just passes data and lets the receiver decide what, if anything, to do with the data."
- **Event Message:**
  - "Use an Event Message for reliable, asynchronous event notification between applications."
  - "The difference between an Event Message and a Document Message is a matter of timing and content. An event’s contents is typically less important. Many events are empty; their mere occurrance tells the observer to react. An event’s timing is very important".
  - "Message Expiration can be very helpful to make sure that an event is processed quickly or not at all."

**Datatype Channel** — типизированные топики: "Use a separate Datatype Channel for each data type, so that all data on a particular channel is of the same type."

**Message Bus:** "A Message Bus is a combination of a common data model, a common command set, and a messaging infrastructure to allow different systems to communicate through a shared set of interfaces." То есть шина у Hohpe — это **общий контракт**, а не нетипизированная труба.

**Message History** — наблюдаемость.
- Проблема: "the same property can make debugging and analyzing dependencies very difficult. If we are not sure where a message goes, how can we assess the impact of a change in the message format? Likewise, if we don't know which application published a message it is difficult to correct a problem with the message."
- Решение: "attach a Message History to the message. The Message History is a list of all applications that the message passed through since its origination."

**Wire Tap:** "Insert a simple Recipient List into the channel that publishes each incoming message to the main channel and a secondary channel. ... we can insert a generic Wire Tap into any channel without any danger of modifying the primary channel behavior."

**Control Bus:** "The Control Bus uses the same messaging mechanism used by the application data, but uses separate channels to transmit data that is relevant to the management of components involved in the message flow."

### 2.1.3 "Starbucks Does Not Use Two-Phase Commit"

Источник: https://www.enterpriseintegrationpatterns.com/ramblings/18_starbucks.html, November 19, 2004. Берём только часть про обработку ошибок.

- "Exception handling in asynchronous messaging scenarios can be difficult."
- Три стратегии: "Write-off", "Retry", "Compensating Action".
- Про повторы: "A special case is a retry with Idempotent Receiver. In this case we can simply retry all operations since the successful receivers will ignore duplicate messages."
- Другие рамблинги Hohpe о подводных камнях событийной архитектуры в этом проходе не просматривались: **UNVERIFIED / not checked**.

---

## 2.2 Martin Fowler (помимо статьи 2017 года)

### 2.2.1 "Event Collaboration" (19 June 2006, черновик Further EAA)

Источник: https://martinfowler.com/eaaDev/EventCollaboration.html

**Суть.** "Instead of components making requests when they need something, components raise events when things change. Other components then listen to events and react appropriately."

**Сила и слабость — одно и то же.** "The great strength of Event Collaboration is that it affords a very loose coupling between its components; this, of course, is also its great weakness."

**Поток не виден в коде.**
- "Although each individual component is simpler, the complexity of the interactions will increase. This is made worse because these interactions are not clear by reading the source code."
- "With Event Collaboration you don't know who is listening to the events until run-time - which in practice means you can only find the links between the components in configuration data - and there may be multiple areas of configuration data. As a result these interactions are hard to find, understand and debug. It is very helpful here to use automated tools that can display the configuration of components at run time so you can see what you have."

**Устаревшие данные.** "A component may continue operating, but it will be working on out of date information if it's not receiving events as things change. It may therefore initiate actions based on out of date information."

**Один владелец данных.**
- "You can still control changes to the data to ensure there's only one source for each bit of data. However instead of doing this by saying only one component stores data, you do it by allowing one component to post update events about that bit of data."
- "if you want central management of data, you'll need two kinds of event - requests to update data, which should be ignored by everything but the managing application, and confirmed updates which everyone acts on."

**Event Cascade.**
- "An event cascade is what happens when you get a sequence of events triggering other events." Цепочка A -> B -> C "may be hard to see because you need to bridge both contexts to see it".
- Пример из больницы: postponed-событие освобождает операционную, а клиницист через несколько минут решает всё-таки оперировать — "in the meantime the room got booked by another operation".
- "Event cascades are good because something happens and as a result of a string of local logical event connections something indirect happens. Event cascades are bad because something happens and as a result of a string of local logical event connections something indirect happens."
- "This is an area where visualization systems that can build a graph of event chains by querying meta-data from the systems themselves could be very handy."

### 2.2.2 "Event Sourcing" (12 December 2005, черновик)

Источник: https://martinfowler.com/eaaDev/EventSourcing.html

- **Внешние эффекты при повторном проигрывании (replay):** "Many of the advantages of Event Sourcing stem from the ability to replay events at will, but if these events cause update messages to be sent to external systems, then things will go wrong because those external systems don't know the difference between real processing and replays." Решение: обернуть внешние системы в Gateway.
- **Внешние запросы:** "If I ask for an exchange rate on December 5th and replay that event on December 20th, I will need the exchange rate on Dec 5 not the later one."
- **Цена подхода:** "Packaging up every change to an application as an event is an interface style that not everyone is comfortable with, and many find to be awkward."

### 2.2.3 "Domain Event" (12 December 2005)

Источник: https://martinfowler.com/eaaDev/DomainEvent.html

- "Captures the memory of something interesting which affects the domain".
- "Often you need to know why a system reacts in the way it did."

### 2.2.4 "TellDontAsk" (bliki, 5 September 2013)

Источник: https://martinfowler.com/bliki/TellDontAsk.html

- Определение: "rather than asking an object for data and acting on that data, we should instead tell an object what to do."
- Оговорки автора:
  - "But personally, I don't use tell-dont-ask. I do look to co-locate data and behavior, which often leads to similar results."
  - "I've seen it encourage people to become GetterEradicators, seeking to get rid of all query methods. But there are times when objects collaborate effectively by providing information."
- Сноска: "even the more fundamental principle of co-locating data and behavior should sometimes be dropped in favor of other concerns - such as layering."

### 2.2.5 "Microservices" (Lewis и Fowler, 25 March 2014)

Источник: https://martinfowler.com/articles/microservices.html

- Против "умной" шины: "A good example of this is the Enterprise Service Bus (ESB), where ESB products often include sophisticated facilities for message routing, choreography, transformation, and applying business rules. ... The microservice community favours an alternative approach: smart endpoints and dumb pipes."
- Про синхронные цепочки: "Any time you have a number of synchronous calls between services you will encounter the multiplicative effect of downtime."

### 2.2.6 "CircuitBreaker" (bliki, 6 March 2014)

Источник: https://martinfowler.com/bliki/CircuitBreaker.html

- "if you have many callers on a unresponsive supplier, then you can run out of critical resources leading to cascading failures across multiple systems."
- "You wrap a protected function call in a circuit breaker object, which monitors for failures. Once the failures reach a certain threshold, the circuit breaker trips".

---

## 2.3 Michael Nygard, "Release It!", 2nd ed. (Pragmatic Bookshelf, © 2018)

Источники:
- официальный отрывок: https://media.pragprog.com/titles/mnee2/antipatterns.pdf;
- оглавление: https://pragprog.com/titles/mnee2/release-it-second-edition/

**Сложность взаимодействий и скрытые связи.**
- "High interactive complexity arises when systems have enough moving parts and hidden, internal dependencies that most operators’ mental models are either incomplete or just plain wrong."
- "These hidden linkages often appear obvious during the postmortem analysis, but are in fact devilishly difficult to anticipate."

**Жёсткая связанность.**
- "Tight coupling allows cracks in one part of the system to propagate themselves —or multiply themselves—across layer or system boundaries."
- "In your systems, tight coupling can appear within application code, in calls between systems, or any place a resource has multiple consumers."

**Integration Points.** "Integration points are the number-one killer of systems. Every single one of those feeds presents a stability risk. Every socket, process, pipe, or remote procedure call can and will hang."

**Оглавление** (дословные названия).
- Stability Antipatterns: Integration Points, Chain Reactions, Cascading Failures, Users, Blocked Threads, Self-Denial Attacks, Scaling Effects, Unbalanced Capacities, Dogpile, Force Multiplier, Slow Responses, Unbounded Result Sets.
- Stability Patterns: Timeouts, Circuit Breaker, Bulkheads, Steady State, Fail Fast, Let It Crash, Handshaking, Test Harnesses.
- Текст разделов Chain Reactions, Cascading Failures, Blocked Threads, Unbounded Result Sets, Bulkheads и Timeouts в открытых отрывках отсутствует, их содержание здесь **UNVERIFIED**.
- Определение Circuit Breaker взято из bliki Фаулера (2.2.6), который ссылается на Nygard.

---

## 2.4 Принципы связности пакетов Роберта Мартина (ADP, SDP, SAP)

Источники:
- "Granularity" (пятая колонка Engineering Notebook для C++ Report, 1996; точный номер журнала **UNVERIFIED**), архив objectmentor: https://web.archive.org/web/2011/http://www.objectmentor.com/resources/articles/granularity.pdf
- "Stability" (шестая колонка): https://web.archive.org/web/2011/http://www.objectmentor.com/resources/articles/stability.pdf
- "Principles of OOD": http://butunclebob.com/ArticleS.UncleBob.PrinciplesOfOod

**Acyclic Dependencies Principle.**
- "THE DEPENDENCY STRUCTURE BETWEEN PACKAGES MUST BE A DIRECTED ACYCLIC GRAPH (DAG). THAT IS, THERE MUST BE NO CYCLES IN THE DEPENDENCY STRUCTURE."
- Краткая формулировка из "Principles of OOD": "The dependency graph of packages must have no cycles."

**Morning after syndrome.** "Have you ever worked all day, gotten some stuff working and then gone home; only to arrive the next morning at to find that your stuff no longer works? Why doesn’t it work? Because somebody stayed later than you! I call this: “the morning after syndrome”."

**Последствия цикла.**
- "MyTasks now depends upon every other package in the system."
- "the cycle has had the effect that MyApplication, MyTasks, and MyDialogs must always be released at the same time. They have, in effect, become one large package."
- "Such cycles make it very difficult to isolate modules. Unit testing and releasing become very difficult and error prone."

**Как разорвать цикл.**
- "Apply the Dependency Inversion Principle (DIP)".
- "Create a new package that both MyDialogs and MyApplication depend upon."

**Stable Dependencies Principle.**
- "THE DEPENDENCIES BETWEEN PACKAGES IN A DESIGN SHOULD BE IN THE DIRECTION OF THE STABILITY OF THE PACKAGES. A PACKAGE SHOULD ONLY DEPEND UPON PACKAGES THAT ARE MORE STABLE THAT IT IS."
- Кратко: "Depend in the direction of stability."

**Stable Abstractions Principle.**
- "PACKAGES THAT ARE MAXIMALLY STABLE SHOULD BE MAXIMALLY ABSTRACT. INSTABLE PACKAGES SHOULD BE CONCRETE. THE ABSTRACTION OF A PACKAGE SHOULD BE IN PROPORTION TO ITS STABILITY."
- Кратко: "Abstractness increases with stability."

---

## 2.5 Law of Demeter и "Tell, Don't Ask"

**Northeastern, общая формулировка.** Источник: https://www2.ccs.neu.edu/research/demeter/demeter-method/LawOfDemeter/general-formulation.html
- "\"Only talk to your immediate friends\" is the motto."
- "Each unit should have only limited knowledge about other units: only units \"closely\" related to the current unit. Or: Each unit should only talk to its friends; Don't talk to strangers."
- "In this general form, the LoD is a more specific case of the Low Coupling Principle".
- "The main motivation for the Law of Demeter is to control information overload".

**Northeastern, страница LoD.** Источник: https://www.ccs.neu.edu/home/lieber/LoD.html
- "The style rule was first proposed at Northeastern University in the fall of 1987 by Ian Holland".
- "The Law of Demeter was refined from \"Only talk to your friends\" to \"Only talk to your friends who share your concerns\"".

**Lieberherr, Holland и Riel, OOPSLA'88**, "Object-Oriented Programming: An Objective Sense of Style" (September 1988). Источник: https://www2.ccs.neu.edu/research/demeter/papers/law-of-demeter/oopsla88-law-of-demeter.pdf
- "The Law of Demeter enforces one kind of information hiding: structure hiding. In general, the Law prevents a method from directly retrieving a subpart of an object which lies deep in that object’s “part-of” hierarchy."
- Формальная формулировка в двухколоночном PDF извлеклась с разрывами, поэтому дословно не приводится: **UNVERIFIED verbatim**.

**Hunt и Thomas, "The Art of Enbugging"** (IEEE Software, January/February 2003). Источник: https://media.pragprog.com/articles/jan_03_enbug.pdf
- "Procedural code tends to get information and then make decisions based on that information. OO code tells objects to do things".
- "As the caller, you should not make decisions based on the called object’s state and then change the object’s state. The logic you are implementing is probably the called-object’s responsibility, not yours."
- "we want to tell objects what to do, not ask them for their state."
- Demeter у них: "an object should only call • Itself • Any parameters that were passed in to the method • Any objects it created • Any directly held component objects".
- Страница https://pragprog.com/articles/tell-dont-ask вернула 404.

---

## 2.6 Реальные разборы и инженерные посты

### 2.6.1 Shopify: модульный монолит

**"Deconstructing the Monolith"**, Kirsten Westeinde, 21 февраля 2019. Источник: https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity
- "The application was extremely fragile with new code having unexpected repercussions. Making a seemingly innocuous change could trigger a cascade of unrelated test failures. For example, if the code that calculates our shipping rate called into the code that calculates tax rates, then making changes to how we calculate tax rates could affect the outcome of shipping rate calculations, but it might not be obvious why."
- Инструмент Wedge: "It highlights any violations of domain boundaries (when another component is accessed through anything but its publicly defined API), and data coupling across boundaries. To achieve this, we wrote a tool to hook into Ruby tracepoints during CI to get a full call graph."

**"Under Deconstruction: The State of Shopify’s Monolith"**, Philip Müller, 16 сентября 2020. Источник: https://shopify.engineering/shopify-monolith
- "When we started analyzing the graph of dependencies between components, it was very dense, to the point that every component depended on over half of all the other components. We also had lots of circular dependencies."
- "Changes to any component in a cycle can break all other components in the cycle. ... A dense, cyclical dependency graph undermines the whole idea of Componentization".
- **Pub/sub как средство инверсии зависимостей:** "Inversion of control means to invert a dependency in such a way that control flow and source code dependency are opposed. This can be done for example through a publish/subscribe mechanism like ActiveSupport::Notifications."
- "When we ignored the dependency graph, in large parts of the codebase the public interface turned out to just be an added layer of indirection in the existing control flows."
- "Total acyclicity is the long term goal".

**"A Packwerk Retrospective"**, Gannon McGibbon, 7 февраля 2024. Источник: https://shopify.engineering/a-packwerk-retrospective
- "circular dependencies tangle up code and make it more difficult to understand and refactor."
- **Неявные зависимости:** "Anything that isn’t referenceable with constants becomes implicit dependencies that Packwerk can’t see. This often causes more problems that are only visible at runtime."
- "a package that is well-defined according to Packwerk (has no violations left to resolve) may actually crash with name errors when its code is executed."
- "running code, more than any metric, will always be the best indicator of real progress."

### 2.6.2 Мейнтейнеры отказываются от in-process шины событий (первоисточник)

**Guava `EventBus`**, javadoc в `google/guava` master. Источник: https://github.com/google/guava/blob/master/guava/src/com/google/common/eventbus/EventBus.java
- Раздел "Avoid EventBus" добавлен коммитом `82a3ecf42c` "Discourage usage of EventBus." от 2021-04-19.
- "**We recommend against using EventBus.** It was designed many years ago, and newer libraries offer better ways to decouple components and react to events."
- **Замена — DI с multibindings, то есть whiteboard:** "To decouple components, we recommend a dependency-injection framework. ... Frameworks typically offer a way to register multiple listeners independently and then request them together as a set".
- Перечисленные недостатки:
  - "It makes the cross-references between producer and subscriber harder to find. This can complicate debugging, lead to unintentional reentrant calls, and force apps to eagerly initialize all possible subscribers at startup time."
  - "It doesn't offer much monitoring."
  - "It doesn't propagate exceptions, so apps don't have a way to react to them."
  - "It imposes requirements on the lifecycle of its subscribers. For example, if an event occurs between when one subscriber is removed and the next subscriber is added, the event is dropped."
  - "It doesn't support backpressure and other features needed for resilience."

**Square Otto** (форк Guava EventBus для Android). Репозиторий в архиве, последний push 2018-12-17. Источник: https://github.com/square/otto
- "Deprecated! ... This project is deprecated in favor of RxJava and RxAndroid. These projects permit the same event-driven programming model as Otto, but they’re more capable and offer better control of threading."

### 2.6.3 Публичные разборы инцидентов (каскады и скрытые зависимости)

**AWS, сбой Kinesis в us-east-1, 25 ноября 2020.** Источник: https://aws.amazon.com/message/11201/
- Рост числа участников: "each front-end server creates operating system threads for each of the other servers in the front-end fleet."
- **"Best effort" зависимость оказалась блокирующей:**
  - "Amazon Cognito uses Kinesis Data Streams to collect and analyze API access patterns. While this information is extremely useful for operating the Cognito service, this information streaming is designed to be best effort."
  - "Unfortunately, the prolonged issue with Kinesis Data Streams triggered a latent bug in this buffering code that caused the Cognito webservers to begin to block on the backlogged Kinesis Data Stream buffers."
- **Цепочка дальше:** CloudWatch, затем Lambda ("Lambda function invocations currently require publishing metric data to CloudWatch as part of invocation"), затем EventBridge, ECS и EKS.
- **Наблюдаемость зависела от упавшего:** "we were unable to update the Service Health Dashboard because the tool we use to post these updates itself uses Cognito, which was impacted by this event."

**AWS, сбой us-east-1, 7 декабря 2021.** Источник: https://aws.amazon.com/message/12721/
- "an automated activity to scale capacity of one of the AWS services hosted in the main AWS network triggered an unexpected behavior from a large number of clients inside the internal network. This resulted in a large surge of connection activity that overwhelmed the networking devices".
- "a latent issue prevented these clients from adequately backing off during this event."
- "This congestion immediately impacted the availability of real-time monitoring data for our internal operations teams, which impaired their ability to find the source of congestion and resolve it."

**Cloudflare, 18 ноября 2025** (Matthew Prince). Источник: https://blog.cloudflare.com/18-november-2025-outage/
- **Распространение изменения конфигурации:** "a change to one of our database systems' permissions which caused the database to output multiple entries into a “feature file” used by our Bot Management system. That feature file, in turn, doubled in size. The larger-than-expected feature file was then propagated to all the machines that make up our network."
- "The software had a limit on the size of the feature file that was below its doubled size. That caused the software to fail."
- "every five minutes there was a chance of either a good or a bad set of configuration files being generated and rapidly propagated across the network".
- Меры:
  - "Hardening ingestion of Cloudflare-generated configuration files in the same way we would for user-generated input";
  - "Enabling more global kill switches for features";
  - "Reviewing failure modes for error conditions across all core proxy modules".

**Cloudflare, 2 июля 2019** (John Graham-Cumming, опубликовано 12 июля 2019). Источник: https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/
- "On average, we hit a p99 of 2.29s for a change to be distributed to every machine worldwide." Однако "in this case, that speed meant that a change to the rules went global in seconds."
- "The SOP allowed a non-emergency rule change to go globally into production without a staged rollout."
- Мера: "Changing the SOP to do staged rollouts of rules in the same manner used for other software at Cloudflare while retaining the ability to do emergency global deployment for active attacks."

### 2.6.4 Segment, "Goodbye Microservices"

Alexandra Noonan, 10 июля 2018. Источник: https://www.twilio.com/en-us/blog/developers/best-practices/goodbye-microservices

Тема — связанность через общие библиотеки, а не шина событий.
- "Testing and deploying changes to these shared libraries impacted all of our destinations."
- "Eventually, all of them were using different versions of these shared libraries."

### 2.6.5 Uber, Netflix, DoorDash, Zalando

- Авторитетных постов от Uber, Netflix или DoorDash о подводных камнях событийной архитектуры (порядок, дубли, отладка цепочек) в этом проходе не нашлось. Поиск вернул только вторичные статьи: **NOT FOUND**.
- Zalando — официальные нормативные правила, а не разбор инцидента. Zalando RESTful API and Event Guidelines, "Last updated 2026-09-29": https://opensource.zalando.com/restful-api-guidelines/
  - Правила: "MUST be robust against duplicates when consuming events", "MUST provide explicit event ordering for data change events", "SHOULD design for idempotent out-of-order processing".
  - "Event consumers must be robust against duplicate events."
  - "Either your events must contain enough information to infer their original order during consumption or your domain must be designed in a way that order becomes irrelevant."

---

## 2.7 Microsoft Azure Architecture Center: "Event-driven architecture style"

Источник: https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/event-driven (ms.date 2026-03-06).

**Broker topology.**
- "No component owns or is aware of the state of any multistep business transaction, and actions are taken asynchronously."
- "You need to carefully consider error handling and manual intervention strategies because this topology can be a source of data inconsistency."

**Mediator topology.** "provides more control, better distributed error handling, and potentially better data consistency. However, this topology introduces increased coupling between components, and the event mediator can become a bottleneck or a reliability concern."

**Когда не применять.** "The workload has simple request-response workflows where synchronous calls meet your latency and throughput requirements."

**Раздел Challenges.**
- Guaranteed delivery: "In some systems, especially in IoT scenarios, it's crucial to guarantee that events are delivered."
- Eventual consistency: "During this window, different parts of the system have a different view of the current state."
- Порядок и однократность: "Running multiple instances can create a challenge if the events must be processed in order within a consumer type or if idempotent message processing logic isn't implemented."
- Error handling: "When you use an error-handler processor, resubmitted events are processed out of sequence."
- Observability:
  - "In synchronous architectures, you can trace a request through a call stack. In event-driven architectures, a single business transaction can span multiple producers, channels, and consumers that run independently and asynchronously. When something fails or behaves unexpectedly, determining which component misbehaved and why is harder because there's no shared call context."
  - "include a correlation ID in every event so that all downstream consumers and logging systems can connect related operations into a single trace. Plan for this instrumentation from the start of the design, because retrofitting observability into a decoupled system is substantially more difficult than building it in."
  - "This same complexity affects testing."

---

## My assessment (только для этого пункта)

1. **Главная проблема событий одна, и её называют все: связь не видна в коде.**
   - Hohpe 2006: "debugging liability".
   - Fowler 2006: "hard to find, understand and debug"; Fowler 2017: "not explicit in any program text".
   - Nygard: "hidden, internal dependencies".
   - Guava: "cross-references between producer and subscriber harder to find".
   - Azure: "no shared call context".

   Все они предлагают одно лекарство: сделать граф композиции первоклассным и проверяемым. Hohpe прямо требует ловить неподходящие подписки и циклы в графе событий "at design time". Fowler и Hohpe предлагают визуализировать граф событий.
2. **Guava официально рекомендует DI multibindings вместо шины** ("register multiple listeners independently and then request them together as a set"). Это сильнейший первоисточник в пользу схемы Get Modular "слушатели как вклад в `many()`", то есть whiteboard, а не шина.
3. **События — хороший инструмент инверсии зависимостей**, чтобы разорвать цикл (Shopify, Martin DIP), но плохой инструмент неявного управления потоком (Fowler, Event Cascade).
   - Отделять намерение (Command) от факта (Event) и от данных (Document) — по EIP.
   - Fowler: "two kinds of event - requests to update data ... and confirmed updates which everyone acts on", при одном владельце данных.
4. **Распространение настроек — отдельный класс риска** (Cloudflare 2019 и 2025). Изменение, разосланное всем модулям сразу и без проверки, валит всех одновременно. Входящую конфигурацию надо валидировать как недоверенный ввод, раскатывать поэтапно и иметь kill switch.
5. **"Опциональная" зависимость должна быть действительно неблокирующей** (AWS Kinesis 2020: "designed to be best effort", но "latent bug ... caused the Cognito webservers to begin to block"). Путь наблюдаемости не должен зависеть от того, что он наблюдает (Service Health Dashboard зависел от Cognito).
6. **Циклы зависимостей** (ADP, Shopify) — антипаттерн. Его надо запрещать инструментально, но инструмент видит только явные связи. Неявные связи (Packwerk: "implicit dependencies that Packwerk can’t see") — главная слепая зона.

---

## Лучшие практики (с источником)

| Практика | Источник |
|---|---|
| Граф композиции — отдельный архитектурный слой; при проектировании ловить подписки без публикаций и циклы | Hohpe, EDA.pdf, 2006 |
| Визуализировать граф событий и связей автоматически по метаданным или работающей системе | Hohpe 2006; Fowler, Event Collaboration, 2006 |
| Слушателей собирать через DI multibindings (whiteboard), а не через шину | Guava `EventBus` javadoc, 2021-04-19 |
| Разделять Command, Event и Document; у каждого типа данных свой типизированный канал | EIP, Command/Document/Event Message, Datatype Channel |
| Один владелец каждой порции данных; запросы на изменение отдельно от подтверждённых изменений | Fowler, Event Collaboration, 2006 |
| Граф зависимостей без циклов; разрывать циклы через DIP или общий пакет | Martin, Granularity, 1996; Shopify, 2020 |
| Зависеть в сторону стабильности; стабильное делать абстрактным | Martin, Stability (SDP, SAP) |
| "Only talk to your immediate friends"; не принимать решений по чужому состоянию с последующим изменением этого состояния | Northeastern LoD; Hunt и Thomas, 2003 |
| Идемпотентные получатели и устойчивость к дублям и нарушенному порядку | Hohpe, Starbucks, 2004; Zalando Guidelines |
| Correlation ID или Message History закладывать с первого дня | Azure EDA, 2026-03-06; EIP Message History |
| Wire Tap или Control Bus: наблюдать, не меняя основной поток | EIP |
| Входящую конфигурацию валидировать как пользовательский ввод; поэтапная раскатка и kill switch | Cloudflare, 2025-11-18 и 2019-07-12 |
| Circuit breaker и таймауты на точках интеграции | Fowler, CircuitBreaker, 2014; Nygard, 2018 (по оглавлению) |

## Худшие практики (с источником)

| Практика | Источник |
|---|---|
| Глобальная in-process шина: связи трудно найти, повторный вход, потеря событий между отпиской и подпиской, нет проброса ошибок | Guava `EventBus` javadoc ("We recommend against using EventBus") |
| Неявный поток событий, видимый только в конфигурации или в рантайме | Fowler, Event Collaboration, 2006; Fowler, 2017 |
| Длинные каскады событий из локально разумных реакций (пример с операционной) | Fowler, Event Collaboration, 2006 |
| Конфигурация подписок в разрозненных "cryptic configuration files" без проверки | Hohpe, 2006 |
| Циклы в графе зависимостей: компоненты фактически сливаются в один пакет | Martin, 1996; Shopify, 2020 и 2024 |
| Неявные зависимости, невидимые для инструмента контроля границ | Shopify, Packwerk Retrospective, 2024 |
| "Best effort" зависимость, которая на деле блокирует | AWS Kinesis, 2020-11-25 |
| Мгновенная глобальная рассылка изменения без поэтапной раскатки и валидации | Cloudflare, 2019 и 2025 |
| Мониторинг или канал статуса зависит от наблюдаемой подсистемы | AWS, 2020 и 2021 |
| Повторы без корректного back-off, рождающие штормы | AWS, 2021-12-07 |
| Побочные эффекты наружу при повторном проигрывании событий | Fowler, Event Sourcing, 2005 |
| Общие библиотеки с расходящимися версиями у потребителей | Segment, 2018 |
| Догматичный Tell-Don't-Ask (избавление от всех query-методов) | Fowler, TellDontAsk, 2013 |
