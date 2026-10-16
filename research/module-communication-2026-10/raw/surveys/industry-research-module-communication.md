# Отраслевое исследование: распространение изменений, иерархии модулей, связь далёких модулей, плагины и имена

Дата: 2026-10-15. Для владельца Get Modular (`@get-modular/core`, `assembly`, `resources`, `conformance`, `lifecycle-kernel`; статическая композиция через типизированные контракты и слоты `required()`, `optional()`, `many()`).

## 0. Метод и пометки

- Источники: официальная документация, спецификации, исходный код на конкретных ветках или тегах, заявления мейнтейнеров. Большинство документов скачано через `curl` в виде исходного Markdown/HTML (репозитории `vuejs/docs`, `reactjs/react.dev`, `angular/angular`, `microsoft/vscode`, `kubernetes/community`, `JetBrains/intellij-sdk-docs`, `nodejs/node`, `mdn/content`, спецификации OSGi 8.1.0). Цитаты извлечены `grep`/`sed` и приведены дословно на английском.
- Области B (реактивные библиотеки) и D (плагинные архитектуры) собрали два отдельных исследовательских прохода. Их полные отчёты с цитатами приложены в конце (приложения B и D, без изменений) и лежат рядом:
  - `scratchpad/area-b-reactive.md`
  - `scratchpad/area-d-plugins.md`
  - сырые копии источников области D: `scratchpad/d-raw/`
- Пометка **UNVERIFIED** ставится на то, что не удалось подтвердить первоисточником.
- **source reading** означает вывод из чтения исходного кода, а не из документации.
- Мои собственные выводы помечены как **«My assessment:»** или **«Моё предложение:»**.
- Локальные эксперименты выполнены на Node 26.11.0.

---

## 1. Короткий ответ на вопросы владельца

1. **Это реактивность?**
   - В строгом смысле нет. Это уведомление об изменениях (паттерн observer). Определение Vue: "Reactivity is a programming paradigm that allows us to adjust to changes in a declarative manner" (https://vuejs.org/guide/extras/reactivity-in-depth.html).
   - Все зрелые системы горячей перенастройки работают через **явную подписку на явный источник**, без автоматического трекинга зависимостей: VS Code, .NET, Spring Cloud, OSGi.
   - Автотрекинг ("сигналы") сама индустрия держит как запасной выход: "Effects should be the last API you reach for" (Angular), "`$effect` is best considered something of an escape hatch" (Svelte).
2. **Родитель передаёт данные детям, а наоборот можно?** Консенсус: данные идут вниз только для чтения, наверх идут события или колбэки, а состоянием владеет родитель.
   - Антипаттерн — ребёнок, который напрямую меняет состояние родителя (Vue, React, Angular NG0100, Flux).
   - Вклад ребёнка в родителя **на этапе сборки** (extension points, contribution points, Backstage inputs, OSGi whiteboard) — мейнстрим, а не антипаттерн.
3. **Связь далёких модулей.** Лестница от лучшего к худшему:
   - типизированная зависимость на capability, опциональная там, где модуль может обойтись без неё;
   - whiteboard через `many()`;
   - шина по топикам — только между по-настоящему независимыми частями и с документированными контрактами событий.

   Глобальная шина событий прямо названа "maintenance headache" в руководстве по миграции на Vue 3.
4. **Плагины.** Подход Get Modular "модуль отдаёт listener-capability, источник собирает её через `many()`" — это почти дословно **OSGi whiteboard pattern**.
5. **Масштаб и предсказуемость.** Главные практики:
   - доставлять последнее состояние (level-based), а не каждое изменение по отдельности;
   - иммутабельный снимок плюс номер ревизии;
   - изоляция ошибок слушателей;
   - отмена устаревшей асинхронной работы через `AbortSignal`;
   - запрет записывать в источник во время доставки;
   - освобождение подписок владельцем;
   - диагностика утечек.
6. **Имена.**
   - `sync` перегружен тремя значениями: двусторонняя привязка в Vue (`.sync`), синхронный вызов (`flush: 'sync'`, `SyncHook`), синхронизация с внешней системой (React Effects).
   - `derived` в Svelte, VS Code и TC39 (`Computed`) означает чистое вычисленное значение без побочного эффекта.
   - `hook` у фронтенд-разработчиков в первую очередь означает React Hooks.

   Подробности и варианты в разделе F.

---

## A. Распространение изменений настроек в работающие компоненты

### A1. VS Code: `workspace.onDidChangeConfiguration`, `Event<T>`, `EventEmitter`, `Disposable`

Источник: https://code.visualstudio.com/api/references/vscode-api (Markdown-версия скачана 2026-10-15; `microsoft/vscode` main `package.json` "version": "1.143.0").

- `onDidChangeConfiguration: Event<ConfigurationChangeEvent>`: "An event that is emitted when the configuration changed."
- `ConfigurationChangeEvent`:
  - "An event describing the change in Configuration".
  - `affectsConfiguration(section: string, scope?: ConfigurationScope): boolean`: "Checks if the given section has changed. If scope is provided, checks if the section has changed for resources under the given scope."
  - Само событие несёт только информацию о том, **что** изменилось. Новое значение слушатель читает сам через `workspace.getConfiguration(...)`.
- `Event<T>`:
  - "A function that represents an event to which you subscribe by calling it with a listener function as argument."
  - Сигнатура: `(listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable`.
  - Возвращает "A disposable which unsubscribes the event listener."
- `EventEmitter<T>`:
  - "An event emitter can be used to create and manage an Event for others to subscribe to. One emitter always owns one event."
  - `fire(data: T)`: "Notify all subscribers of the event. Failure of one or more listener will not fail this function call."
- `Disposable`:
  - "Represents a type which can release resources, such as event listening or a timer."
  - `Disposable.from(...)`: "Combine many disposable-likes into one." и "Note that asynchronous dispose-functions aren't awaited."
- Раздел "API Patterns" той же страницы:
  - "Events in the VS Code API are exposed as functions which you call with a listener-function to subscribe. Calls to subscribe return a `Disposable` which removes the event listener upon dispose."
  - Об именах: "Names of events follow the `on[Will|Did]VerbNoun?` pattern. The name signals if the event is going to happen *(onWill)* or already happened *(onDid)*, what happened *(verb)*, and the context *(noun)* unless obvious from the context."
  - Об отмене: "Often operations are started on volatile state which changes before operations can finish. For instance, computing IntelliSense starts and the user continues to type making the result of that operation obsolete." Такие API получают `CancellationToken`.

Внутренний `Emitter` VS Code (source reading, https://github.com/microsoft/vscode/blob/main/src/vs/base/common/event.ts, main 2026-10-15). Опции `EmitterOptions`:
- `onListenerError`: "Optional function that's called when a listener throws an error. Defaults to {@link onUnexpectedError}". Каждый вызов слушателя обёрнут в `try { listener.value(value) } catch (e) { errorHandler(e) }`.
- `leakWarningThreshold`: "Number of listeners that are allowed before assuming a leak." Текст предупреждения: `potential listener LEAK detected, having ${listenerCount} listeners already.` Если слушателей больше квадрата порога, бросается `ListenerRefusalError`.
- `leakWarningName`: "Human-readable name for the emitter, included in leak warning error messages to help identify which emitter is leaking in telemetry."
- `deliveryQueue`: "Pass in a delivery queue, which is useful for ensuring in order event delivery across multiple emitters."
- Хуки ленивой подписки на источник: `onWillAddFirstListener` и `onDidRemoveLastListener`.

Внутренняя библиотека observables VS Code (source reading, https://github.com/microsoft/vscode/tree/main/src/vs/base/common/observableInternal):
- Экспортирует `observableValue`, `derived`, `autorun`, `transaction`, `derivedWithCancellationToken`, `runOnChange`, `recordChanges`, логгеры и DevTools-граф (`debugGetObservableGraph`).
- **Трекинг явный, через параметр `reader`, без глобального скрытого контекста:**
  - `IReader.readObservable`: "Reads the value of an observable and subscribes to it."
  - `get()`: "Returns the current value." Подписки при этом не создаёт.
  - "Use `derived(reader => ...)` to turn code that needs a reader into an observable value."
- Правило для наблюдателей: "Implementations must not get/read the value of other observables, as they might not have received this event yet!"
- Публикуется как `@vscode/observables` из `microsoft/vscode-packages`. Пока только пре-релизы `0.1.1-x`, последний `0.1.1-50`, изменён 2026-10-15.

### A2. .NET: `IOptions<T>`, `IOptionsSnapshot<T>`, `IOptionsMonitor<T>`, `IChangeToken`

Источники:
- https://learn.microsoft.com/en-us/dotnet/core/extensions/options (ms.date 2025-10-22, updated_at 2026-05-15);
- https://learn.microsoft.com/en-us/dotnet/core/extensions/primitives (ms.date 2026-08-27);
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.options.ioptionsmonitor-1.onchange (net-11.0).

Три уровня интерфейсов:
- `IOptions<TOptions>`:
  - "Does ***not*** support: Reading of configuration data after the app has started." Изменения сюда не доходят никогда.
  - "Is registered as a Singleton and can be injected into any service lifetime."
- `IOptionsSnapshot<TOptions>`: "provides a snapshot of the options at the time the `IOptionsSnapshot<T>` object is constructed".
- `IOptionsMonitor<TOptions>`:
  - "is a singleton service that retrieves current option values at any time". Поддерживает "Change notifications", "Named options", "Reloadable configuration", "Selective options invalidation".
  - `OnChange(Action<TOptions,string?> listener)`: "Registers a listener to be called whenever a named `TOptions` changes." Возвращает `IDisposable`, "that should be disposed to stop listening for changes."

Ограничения:
- "Change notifications are only supported for file-system based configuration providers".
- "Some file systems, such as Docker containers and network shares, may not reliably send change notifications."

`IChangeToken`:
- `HasChanged`: "Gets a value that indicates if a change has occurred."
- `ActiveChangeCallbacks`: "Indicates whether the token proactively raises callbacks. If `false`, the token consumer must poll `HasChanged` to detect changes."
- Токены одноразовые, поэтому `ChangeToken.OnChange(producer, consumer)` принимает фабрику: "After a change, it should return a new token for the next registration."
- Ошибки: "Exceptions from the producer or consumer propagate to the caller that registers or triggers the token."
- Асинхронный потребитель в .NET 11: "`ChangeToken.OnChange` waits for the returned task to complete before the consumer can be invoked again. This behavior prevents concurrent consumer calls, but it can combine multiple changes that occur while the task runs into one later callback." и "Exceptions that occur after the task is returned are left unobserved by `ChangeToken.OnChange`."
- `CompositeChangeToken`: "fires each registered callback exactly one time regardless of the number of times a change is triggered."

Известная ловушка — двойное срабатывание: issue aspnet/Configuration#624 (2017-03-20, закрыт), "ChangeToken.OnChange fires twice when listening for configuration changes" (https://github.com/aspnet/Configuration/issues/624). Воспроизводится ли это в .NET 10/11, я не проверял (**UNVERIFIED**).

### A3. Spring Cloud: `EnvironmentChangeEvent`, `@RefreshScope`

Источник: https://docs.spring.io/spring-cloud-commons/reference/spring-cloud-commons/application-context-services.html (Spring Cloud Commons 5.0.3; цитаты проверены `curl`).

- `EnvironmentChangeEvent`:
  - "When an EnvironmentChangeEvent is observed, it has a list of key values that have changed, and the application uses those to:" перепривязать `@ConfigurationProperties` и обновить уровни логирования.
  - "When a @ConfigurationProperties bean is re-bound, its properties are first reset to their class-level defaults so that values for properties that have been removed from the Environment do not linger."
- Гонка при перепривязке: "Concurrent rebinds of the same bean are serialized internally, but this does not make the bean safe to read from other threads while a rebind is in progress: a concurrent reader can observe transient, partially-updated state (for example, a property briefly reset to its class-level default before the new value is applied)." и "If your application needs a consistent view of a bean’s properties across a refresh, use @RefreshScope instead, which serializes reads against refreshes for beans in that scope."
- Ограничение: "Re-binding @ConfigurationProperties does not cover another large class of use cases, where you need more control over the refresh and where you need a change to be atomic over the whole ApplicationContext."
- `@RefreshScope`:
  - Зачем нужен: "This feature addresses the problem of stateful beans that get their configuration injected only when they are initialized."
  - Как работает: "Refresh scope beans are lazy proxies that initialize when they are used (that is, when a method is called), and the scope acts as a cache of initialized values."
  - Обновление: "The RefreshScope is a bean in the context and has a public refreshAll() method to refresh all beans in the scope by clearing the target cache."
  - Иначе говоря, бин **пересоздаётся**, а не перенастраивается на месте.
- "Objects using constructor binding including Java Records annotated with @ConfigurationProperties cannot be refreshed."

### A4. OSGi Declarative Services (`modified`) и Configuration Admin

Источники:
- Declarative Services: https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.component.html (Compendium 8.1.0, гл. 112);
- Configuration Admin: https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.cm.html (гл. 104).

Цитаты проверены `grep` по тексту спецификации.

- Атрибут `modified` (112.4.4): "Specifies the name of the method to call when the configuration properties for a component configuration is using a Configuration object from the Configuration Admin service and that Configuration object is modified without causing the component configuration to become unsatisfied. If this attribute is not specified, then the component configuration will become unsatisfied if its configuration properties use a Configuration object that is modified in any way."
  - **По умолчанию компонент перезапускается**: деактивируется и активируется заново с новой конфигурацией. Перенастройка на месте включается явно (opt-in).
- 112.5.14: "A component instance must complete activation, or a previous modification, before it can be modified." Изменения применяются строго по очереди.
- 112.5.15: "If the modified method throws an exception, SCR must log an error message containing the exception with the Log Service, if present and continue processing the modification."
- Configuration Admin (104):
  - "The updated(Dictionary) callback from the Configuration Admin service to the Managed Service must take place asynchronously. This requirement allows the Managed Service to finish its initialization in a synchronized method without interference from the Configuration Admin service callback."
  - Счётчик ревизий: "update of the Configuration properties must update a counter in the Configuration object after the data has been persisted but before the target(s) have been updated and any events are sent out. This counter is available from the getChangeCount() method."
  - Слушатели: "ConfigurationListener - The default Configuration Listener receives events asynchronously from the method that initiated the event and on another thread." и "SynchronousConfigurationListener - A Synchronous Configuration Listener is guaranteed to be called on the same thread as the method call that initiated the event." Порядок доставки: "Configuration Events must be delivered in order for each listener as they are generated."
- Кардинальности и политики (подробно в приложении D):
  - `0..1`, `1..1`, `0..n`, `1..n` соответствуют `optional()`, `required()`, `many()`;
  - static policy: "A component instance never sees any of the dynamics of the static reference."

### A5. Kubernetes: level-triggered reconcile вместо edge-triggered событий

- Руководство по контроллерам (https://github.com/kubernetes/community/blob/master/contributors/devel/sig-api-machinery/controllers.md):
  - Базовый цикл `desired := getDesiredState(); current := getCurrentState(); makeChanges(desired, current)` и "Watches, etc, are all merely optimizations of this logic."
  - "Level driven, not edge driven. Just like having a shell script that isn't running all the time, your controller may be off for an indeterminate amount of time before running again."
  - "If an API object appears with a marker value of `true`, you can't count on having seen it turn from `false` to `true`, only that you now observe it being `true`."
  - "Operate on one item at a time." и "Random ordering between resources. When controllers queue off multiple types of resources, there is no guarantee of ordering amongst those resources."
  - Про resync: "If you ever skip requeuing your item on failures, you could fail, not requeue, and then never retry that item again."
- API conventions (https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md#spec-and-status):
  - "For example, if a value is changed from 2 to 5 in one PUT and then back down to 3 in another PUT the system is not required to 'touch base' at 5 before changing the `status` to 3. In other words, the system's behavior is *level-based* rather than *edge-based*. This enables robust behavior in the presence of missed intermediate state changes."
  - Разделение направлений: "Types with both `spec` and `status` stanzas can (and usually should) have distinct authorization scopes for them. This allows users to be granted full write access to `spec` and read-only access to status, while relevant controllers are granted read-only access to `spec` but full write access to status."
  - `observedGeneration`: "the `generation` most recently observed by the component responsible for acting upon changes to the desired state of the resource."
- Концепция (https://kubernetes.io/docs/concepts/architecture/controller/): "It's useful to have simple controllers rather than one, monolithic set of control loops that are interlinked. Controllers can fail, so Kubernetes is designed to allow for that."

### A6. Сводка по области A

| Система | Как подписаться | Что несёт событие | Синхронность | Ошибка слушателя | Освобождение | Если модуль не подписан |
|---|---|---|---|---|---|---|
| VS Code | `onDidChangeConfiguration(listener)` | что изменилось (`affectsConfiguration`), значение читается отдельно | синхронный `fire` | "will not fail this function call" | `Disposable` | старое значение |
| .NET | `IOptionsMonitor.OnChange` | новое значение и имя | синхронный колбэк; в .NET 11 есть async-перегрузка с объединением изменений | пробрасывается вызывающему | `IDisposable` | `IOptions<T>` изменений не видит никогда |
| Spring Cloud | `EnvironmentChangeEvent`, `@RefreshScope` | список изменённых ключей | событие контекста | вне исследования | бин пересоздаётся | без refresh-scope и rebind изменение не видно |
| OSGi DS / Configuration Admin | метод `modified` или перезапуск | новые свойства и счётчик изменений | `updated` асинхронно, по порядку | лог и продолжение | жизненным циклом управляет SCR | перезапуск компонента |
| Kubernetes | reconcile по очереди | только ключ объекта, состояние читается из кеша | асинхронно | повторная постановка в очередь | — | — |

**My assessment:**
- Во всех пяти системах **есть явный выбор "перенастроиться на месте или пересоздаться"**. Перенастройка включается явно, по умолчанию модуль либо ничего не видит, либо пересоздаётся.
- Событие часто несёт только факт изменения или список ключей, а значение потребитель читает из текущего снимка: VS Code, Spring, Redux `getState`, Kubernetes. Это и есть level-based подход: промежуточные значения не важны, важно последнее.

---

## B. Реактивные примитивы и библиотеки (кратко; полностью в приложении B)

Версии на 2026-10-15 (npm):

| Пакет | Версия | Размер min+gzip | Комментарий |
|---|---|---|---|
| `alien-signals` | 3.2.1 | около 1,95 КБ | |
| `@preact/signals-core` | 1.14.4 | около 2,0 КБ | |
| `@vue/reactivity` | 3.5.44 | около 7,4 КБ | Vue 3.6 всё ещё RC (3.6.0-rc.11) |
| `mobx` | 7.0.6 | около 14,9 КБ | |
| `rxjs` | 7.8.2 | около 17,8 КБ (полный бандл) | последняя стабильная от 2025-02-22, есть 9.0.0-beta.1 |
| `signal-polyfill` | 0.2.2 | — | README: "Do not use this in production." |
| Solid | 2.0 в RC | — | |
| Angular | 22.2.3 | — | |

- **TC39 Signals.**
  - Стадия формально "Stage 1", но в README: "It can currently be thought of as "Stage 0"". Продвижения после 2024-06 не нашлось.
  - Эффектов в API нет: "The Signal API does not include any built-in function like `effect`".
  - Вычисления "glitch-free", вычисляемые сигналы ленивые (pull-based).
  - Async сознательно вне рамок: "Signals are always synchronously available".
  - Ошибки из `notify` "sent to the `.set()` call which triggered it, using an AggregateError".
- **alien-signals** — основа реактивности Vue 3.6: "a major refactor of `@vue/reactivity` based on alien-signals" (release notes v3.6.0-rc.1).
  - Source reading: в upstream 3.2.1 исключение одного эффекта прерывает остальные эффекты этого прохода.
  - Во Vue 3.6 это исправлено: "a throwing subscriber must not abort the batch".
- **Preact signals.** Синхронные. Ошибка одного эффекта не останавливает остальные, первая ошибка пробрасывается тому, кто записал значение (source reading).
- **Vue `watch`.**
  - Явный источник против неявного: `watchEffect` "makes its reactive dependencies less explicit".
  - Устаревшие асинхронные результаты: "it will still fire the callback with an ID value that is already stale". Решение — `onWatcherCleanup`, вызывать только синхронно, не после `await`.
  - "Sync watchers do not have batching".
  - В отдельном пакете `@vue/reactivity` у `watch` нет `flush`.
  - Две копии пакета не связаны: "different internal storage for reactivity connections".
- **Svelte stores.**
  - Контракт `subscribe`: синхронный первый вызов с текущим значением и возврат функции отписки.
  - Открытый баг #11555: "If any svelte store subscriber raises an un-handled exception, future calls to `.set()` on any store will not notify subscribers."
  - Про `$effect`: "best considered something of an escape hatch", "avoid using it to synchronise state".
- **Solid 2.0 RC.**
  - "`createResource` - gone. Async flows through ordinary memos."
  - "`createEffect(compute, apply)` - separate tracking from side effects".
- **Angular 22.**
  - `resource`, `rxResource`, `httpResource` стабильны с v22. Загрузчик получает `{params, abortSignal, previous}`. Из документации: "A resource aborts an outstanding loading operation if the `params` computation changes while the resource is loading."
  - "Effects should be the last API you reach for." и "Avoid using effects for propagation of state changes."
- **TanStack Query.**
  - `queryFn` получает `AbortSignal`, который срабатывает, когда запрос "becomes out-of-date or inactive".
  - Ключи: "query keys act as dependencies for your query functions".
- **RxJS.**
  - `switchMap` "stops emitting items from the earlier-emitted inner Observable".
  - Ошибки подписчиков пробрасываются асинхронно и не ломают остальных. Синхронный режим описан так: "producer interference, a nasty bug where a multicast can be broken for all observers by a downstream consumer".
  - RxJS не glitch-free.
- **MobX.**
  - Реакции "should rarely be used".
  - "MobX does not guarantee the order in which reactions will be run".
  - "an exception in one reaction does not prevent the scheduled execution of other ... reactions".
  - `reaction(data, effect)` разделяет "что отслеживать" и "что делать".
- **Первоисточник против автотрекинга** (Ryan Carniato или команда React) не найден, есть только вторичные статьи: **UNVERIFIED**. Против неявных эффектов есть официальные формулировки Angular, Svelte, Vue и MobX.

Мои локальные проверки (Node 26.11.0):
- `node:events` `EventEmitter`: если второй слушатель бросает исключение, третий **не вызывается**, а исключение вылетает из `emit` (вывод: `EventEmitter: a,caught:boom`).
- `EventTarget`: все три слушателя вызваны, ошибка ушла в `uncaughtException` (вывод: `EventTarget: a,c,after-dispatch,uncaught:boom`).
- Это совпадает с документацией Node (https://nodejs.org/api/events.html):
  - EventEmitter: "The `EventEmitter` calls all listeners synchronously in the order in which they were registered."
  - EventTarget: "Throwing within an event listener will _not_ stop the other registered handlers from being invoked." и "uncaught exceptions in `EventTarget`s will terminate the Node.js process by default."

---

## C. Поток данных по иерархии

### C1. Vue (документация из `vuejs/docs` main, 2026-10-15)

- Однонаправленный поток (https://vuejs.org/guide/components/props.html#one-way-data-flow):
  - "All props form a **one-way-down binding** between the child property and the parent one: when the parent property updates, it will flow down to the child, but not the other way around. This prevents child components from accidentally mutating the parent's state, which can make your app's data flow harder to understand."
  - "This means you should **not** attempt to mutate a prop inside a child component."
  - Про мутацию вложенных объектов: "The main drawback of such mutations is that it allows the child component to affect parent state in a way that isn't obvious to the parent component, potentially making it more difficult to reason about the data flow in the future. ... In most cases, the child should emit an event to let the parent perform the mutation."
- События (https://vuejs.org/guide/components/events.html): "Unlike native DOM events, component emitted events do **not** bubble. You can only listen to the events emitted by a direct child component. If there is a need to communicate between sibling or deeply nested components, use an external event bus or a global state management solution."
- provide/inject (https://vuejs.org/guide/components/provide-inject.html):
  - "it is recommended to keep any mutations to reactive state inside of the _provider_ whenever possible".
  - "There may be times when we need to update the data from an injector component. In such cases, we recommend providing a function that is responsible for mutating the state".
  - Плюс `readonly()` и Symbol-ключи "to avoid potential collisions".
- Почему от настоящей двусторонней привязки отказались. Документация Vue 2 о `.sync` (https://v2.vuejs.org/v2/guide/components-custom-events.html#sync-Modifier):
  - "In some cases, we may need "two-way binding" for a prop. Unfortunately, true two-way binding can create maintenance issues, because child components can mutate the parent without the source of that mutation being obvious in both the parent and the child."
  - "That's why instead, we recommend emitting events in the pattern of `update:myPropName`." и "For convenience, we offer a shorthand for this pattern with the `.sync` modifier".
  - **Подтверждено:** `.sync` во Vue означает двустороннюю привязку, реализованную как сахар над prop плюс событие `update:x`.
- Vue 3 (https://v3-migration.vuejs.org/breaking-changes/v-model.html): "**BREAKING:** `v-bind`'s `.sync` modifier and component `model` option are removed and replaced with an argument on `v-model`". В 3.4+ `defineModel` разворачивается в "A prop named `modelValue`" и "An event named `update:modelValue`, which is emitted when the local ref's value is mutated" (https://vuejs.org/guide/components/v-model.html). Сам механизм "prop вниз, событие вверх, состоянием владеет родитель" не изменился.
- Шина событий (https://v3-migration.vuejs.org/breaking-changes/events-api.html):
  - "`$on`, `$off` and `$once` instance methods are removed."
  - "In most circumstances, using a global event bus for communicating between components is discouraged. While it is often the simplest solution in the short term, it almost invariably proves to be a maintenance headache in the long term."
  - Альтернативы оттуда же:
    - "Props and events should be your first choice for parent-child communication. Siblings can communicate via their parent."
    - "Provide / inject can also be used for long-distance communication between components."
    - "Global state management ... such as Pinia".
  - Если шина всё-таки нужна, руководство предлагает внешнюю библиотеку: mitt или tiny-emitter.

### C2. React (`reactjs/react.dev` main, 2026-10-15)

- https://react.dev/learn/thinking-in-react: "This is called _one-way data flow_ because the data flows down from the top-level component to the ones at the bottom of the tree." и "React makes this data flow explicit, but it requires a little more typing than two-way data binding."
- https://react.dev/learn/sharing-state-between-components:
  - "move it to their closest common parent, and then pass it down to them via props. This is known as *lifting state up*".
  - "**For each unique piece of state, you will choose the component that "owns" it.** This principle is also known as having a "single source of truth"."
  - "passing down the event handler to the child allowed the child to change the parent's state."
- https://react.dev/learn/passing-data-deeply-with-context:
  - "**Just because you need to pass some props several levels deep doesn't mean you should put that information into context.**"
  - "Start by passing props. ... The person maintaining your code will be glad you've made the data flow explicit with props."
- https://react.dev/learn/you-might-not-need-an-effect:
  - Передача данных наверх: "In React, data flows from the parent components to their children. When you see something wrong on the screen, you can trace where the information comes from by going up the component chain until you find which component passes the wrong prop or has the wrong state. When child components update the state of their parent components in Effects, the data flow becomes very difficult to trace."
  - Цепочки эффектов: "Such code is often rigid and fragile."
  - Производное значение, хранимое как состояние: "you avoid the extra "cascading" updates" если вычислять его, а не хранить.
  - Синхронизация двух состояний: "Whenever you try to keep two different state variables synchronized, try lifting state up instead!"
  - Гонки: "there is no guarantee about which order the responses will arrive in" и "To fix the race condition, you need to add a cleanup function to ignore stale responses".

### C3. Angular (`angular/angular` main, `package.json` "version": "22.3.0-next.2")

- Outputs (https://angular.dev/guide/components/outputs): "**Angular custom events do not bubble up the DOM**."
- Inputs (https://angular.dev/guide/components/inputs):
  - "Signals created by the `input` function are read-only."
  - Model inputs: "**Model inputs** are a special type of input that enable a component to propagate new values back to its parent component." и "If the property is bound with a two-way binding, the new value propagates to that binding."
- Two-way binding (https://angular.dev/guide/templates/two-way-binding): "**Two way binding** is a shorthand to simultaneously bind a value into an element, while also giving that element the ability to propagate changes back through this binding." Синтаксис `[()]` "combines the syntax from property binding, `[]`, and the syntax from event binding, `()`".
- Иерархическая DI (https://angular.dev/guide/di/hierarchical-dependency-injection):
  - "If the component's injector lacks the provider, it passes the request up to its parent component's `ElementInjector`." и "If you have registered a provider for the same DI token at different levels, the first one Angular encounters is the one it uses".
  - Опциональность: `inject(OptionalService, {optional: true})`.
- NG0100 (приложение D): ошибка бывает и тогда, "if a child component changes values on its parent".

### C4. Fastify (подробнее в приложении D)

- "Each context in the previous example inherits _only_ from its parent contexts. Parent contexts cannot access entities within their descendant contexts."
- "`fastify-plugin` breaks encapsulation only for the plugin it wraps."

### C5. IntelliJ Platform Message Bus

Источники:
- https://plugins.jetbrains.com/docs/intellij/messaging-infrastructure.html (исходник `topics/reference_guide/messaging_infrastructure.md`, © 2000-2025);
- `Topic.java` и `MessageBusImpl.kt` в `JetBrains/intellij-community` master.

- Что это: "IntelliJ Platform's messaging infrastructure is an implementation of Publisher Subscriber Pattern that provides additional features like _broadcasting on hierarchy_ and special _nested events_ processing".
- Топик типизирован бизнес-интерфейсом: "Subscribers register an implementation of this interface at the messaging infrastructure. Publishers later retrieve objects that conform to the interface (IS-A) and call any methods defined on those implementations."
- Иерархия шин: application, project, module.
  - "Broadcast configuration is defined per-topic." Варианты: `TO_CHILDREN` (по умолчанию), `TO_DIRECT_CHILDREN`, `NONE`, `TO_PARENT`.
  - Зачем направление: "The main benefit of broadcasting is managing subscribers that are bound to child buses but interested in parent bus-level events." и "No hard reference to the project-level subscriber will be stored at application-level then, i.e., we just avoided memory leak on project re-opening."
  - `Topic.java`: `TO_PARENT` — "The message send to particular topic at particular bus is dispatched to all subscribers of the same topic within the parent bus."; `TO_DIRECT_CHILDREN` — "Use only for application level publishers. To avoid collection subscribers from modules."
- Порядок: "The IntelliJ Platform's messaging infrastructure guarantees that all messages sent to particular topic will be delivered at the sending order." Для вложенных сообщений handler2 получает message1 раньше, чем handler1 получает message2.
- Предостережение ("Avoid Shared Data Modification from Subscribers"): "We had a problem in a situation when two subscribers tried to modify the same document". Итог: "**The problem** is that document range used by _subscriber1_ for initial modification request is invalid if _subscriber2_ has changed document's range before it."
- Декларативные слушатели (https://plugins.jetbrains.com/docs/intellij/plugin-listeners.html):
  - "Listener implementations must be stateless and may not implement life-cycle (e.g., `Disposable`)."
  - "Declarative registration of listeners allows achieving better performance than registering listeners from code. The advantage is because listener instances get created lazily — the first time an event is sent to the topic — and not during application startup or project opening."
- Ошибки (source reading, `MessageBusImpl.kt`):
  - каждый обработчик вызывается в `try/catch`;
  - ошибка либо логируется (`LOG.error`), либо при включённом распространении ошибок накапливается через `addSuppressed` и бросается после всех обработчиков;
  - комментарий в коде: "CancellationException is rethrown only after executing all handlers".

### C6. Redux, Flux, Elm (подробнее в приложении D)

- Redux `store.subscribe` (https://redux.js.org/api/store#subscribelistener):
  - "The subscriptions are snapshotted just before every `dispatch()` call. If you subscribe or unsubscribe while the listeners are being invoked, this will not have any effect on the `dispatch()` that is currently in progress."
  - "The listener should not expect to see all state changes, as the state might have been updated multiple times during a nested `dispatch()` before the listener is called. It is, however, guaranteed that all subscribers registered before the `dispatch()` started will be called with the latest state by the time it exits."
- Flux: "We found that two-way data bindings led to cascading updates ... very difficult to predict"; в диспетчере "Cannot dispatch in the middle of a dispatch."
- Elm: "Actively trying to make components is a recipe for disaster in Elm."

### C7. Kubernetes `spec`/`status` как модель "вниз и вверх" (см. A5)

- Желаемое состояние (`spec`) пишет владелец, контроллер его только читает.
- Наблюдаемое состояние (`status`) пишет контроллер.
- У направлений разные права записи.

**My assessment (раздел C):**
- Консенсус единый у Vue, React, Angular, Flux/Redux, Elm и Kubernetes. Данные идут вниз только для чтения. Наверх идёт **намерение** (событие, колбэк, вызов команды владельца) или **наблюдение** (status). Решает и записывает только владелец состояния.
- Двусторонние привязки (`v-model`, Angular `model()`) приемлемы как синтаксический сахар, потому что они разворачиваются в prop вниз и событие вверх.
- Антипаттерны:
  - ребёнок пишет в состояние родителя напрямую;
  - ребёнок пишет в тот же источник, который сейчас доставляет ему изменение (каскады, NG0100, `infdig`, "Cannot dispatch in the middle of a dispatch").

---

## D. Связь далёких модулей и плагинные архитектуры (кратко; полностью в приложении D)

- **OSGi whiteboard** (Kriens и Hargrave, ред. 2.0, 2004-08-17; https://docs.osgi.org/whitepaper/whiteboard-pattern/):
  - Определение: "the whiteboard pattern has event listeners register themselves as a service with the OSGi framework. When the event source has an event object to deliver, the event source calls all event listeners currently registered in the service registry."
  - Проблемы listener-подхода: "If the listener goes away, the event source should remove it from the list of listeners. These are the so-called life cycle issues." и "the removal phase is much more difficult to verify and is often not handled at all."
  - Видимость связей: "The event listeners are visible in the registry ... This makes inter-bundle dependencies more visible."
  - Пример из статьи — `@Reference private volatile List<ContentProvider> providers;`. **Схема "модуль отдаёт listener-capability, источник собирает её через `many()`" совпадает с whiteboard.**
- **OSGi Event Admin** (гл. 113):
  - `sendEvent` синхронный, `postEvent` асинхронный и упорядоченный. Спецификация рекомендует: "the asynchronous delivery should be preferred".
  - При исключении: "the event delivery must continue with the next handlers".
  - Зависшие обработчики можно заносить в deny list.
- **Eclipse и VS Code:** декларативные точки расширения и ленивая активация. Eclipse: "none will be activated until a function provided by a plug-in has been requested".
- **Tapable 2.3.3:** Sync, AsyncSeries, AsyncParallel; варианты Bail, Waterfall, Loop; регистрация `tap*`, запуск `call`/`callAsync`/`promise`; порядок через `stage` и `before`; AsyncSeries: "The first error aborts the series."
- **Rollup 4.64.7:**
  - виды хуков `first`, `sequential`, `parallel`, опция `order: pre|post`;
  - для связи плагинов рекомендован прямой `api`, при отсутствии зависимости — "or handle this silently if it is optional".
- **Fastify 5.12.7:** инкапсуляция только сверху вниз. Ловушка: "You have to register a hook before the event is triggered, otherwise, the event is lost."
- **Backstage:**
  - "There can be no direct communication between plugins through code."
  - Модуль "may only use Extension Points that belong to a single plugin". Точки расширения публикуются из `-node`-пакета, "to allow for modules to avoid a direct dependency on the plugin".
  - Порядок: "all modules for each plugin are completely initialized before the plugin itself is initialized."
  - Frontend: "Communication between extensions happens in one direction, from one child extension through the attachment point to its parent". Дерево готовится один раз: "Conditions are evaluated when the app tree is prepared, not continuously".
  - Multiton service ref отдаёт массив, это аналог `many()`.
- **NestJS и MediatR:**
  - Nest event-emitter: по умолчанию `suppressErrors: true`. Ловушка: события до `onApplicationBootstrap` "may be missed".
  - Nest CQRS: ошибки обработчиков уходят в `UnhandledExceptionBus`.
  - MediatR 14.2.0 стал платным (ключ лицензии). `ForeachAwaitPublisher` (source reading) прерывает рассылку на первой ошибке.
- **Антипаттерны:**
  - Fowler, 2017-02-07: "it can be hard to see such a flow as it's not explicit in any program text"; там же ловушка "passive-aggressive command".
  - Vue: глобальная шина — "maintenance headache".
  - Flux: каскады двусторонних привязок.
  - Термин "event soup" в авторитетном источнике не найден: **UNVERIFIED**.
- **Контрпример:** AWS (микрофронтенды) рекомендует шину событий, которой владеет shell, с документированными контрактами событий, потому что общий Redux store "creates significant coupling".

---

## E. Узнаваемость имён для широкой JS/TS-аудитории

### E1. Какие глаголы где используются (проверено в этом исследовании)

| Имя | Где (источник выше) | Что означает там |
|---|---|---|
| `subscribe` (возвращает отписку) | RxJS `Observable.subscribe`; контракт Svelte store; Redux `store.subscribe(listener)`; zustand `subscribe(selector, callback, { equalityFn, fireImmediately })` (https://github.com/pmndrs/zustand README) | зарегистрировать слушателя |
| `watch` | Vue `watch(source, cb)`, `watchEffect` | явный источник плюс колбэк с побочным эффектом |
| `onChange` / `onDidChange*` | .NET `IOptionsMonitor.OnChange`; VS Code `on[Will|Did]VerbNoun`; React-пропсы `onChange` (пример Toggle в "You Might Not Need an Effect") | событие или колбэк |
| `on` / `emit` / `off` | Node `EventEmitter`; mitt и tiny-emitter (рекомендованы Vue для шины); Vue `emit` | pub/sub, события вверх по дереву |
| `listen` / listener | DOM `addEventListener`; Redux "change listener"; IntelliJ Listeners; OSGi listener | чаще существительное ("listener"), чем глагол |
| `observe` / `Observable` | RxJS; MobX `observable`; VS Code `IObservable`; TC39 Observable (Stage 1) | наблюдаемая величина или поток |
| `computed` | Vue, Preact, Angular, MobX; TC39 `Signal.Computed` | **чистое** производное значение |
| `derived` | Svelte `derived`; VS Code `derived` | **чистое** производное значение |
| `effect` | Preact, Angular, Solid `createEffect`, React `useEffect` | побочный эффект; официально "last API you reach for" и "escape hatch" |
| `reaction` / `autorun` | MobX | побочный эффект; у `reaction` явная функция данных |
| `resource` / loader | Angular `resource({params, loader})`; Solid `createResource` (удалён в 2.0) | асинхронная загрузка с отменой |
| `hook` | React Hooks ("*Hooks* let you use different React features from your components", https://react.dev/reference/react/hooks); Tapable, Fastify, Rollup hooks | **перегружено**: у React это `useX`, у сборщиков и серверов это точки расширения |
| `tap` / `call` | Tapable (webpack) | нишевое имя, знакомо авторам плагинов webpack |
| `sync` | Vue 2 `.sync` = двусторонняя привязка (C1); Vue `flush: 'sync'` = синхронно без батчинга; Tapable `SyncHook` = синхронно; React: "Effects let you synchronize a component with some external system" | **перегружено тремя значениями** |
| `dispose` / `Disposable` | VS Code; TC39 Explicit Resource Management (`Symbol.dispose`, `using`) — в списке завершённых предложений, ожидаемый год публикации 2027 (https://github.com/tc39/proposals/blob/main/finished-proposals.md) | освобождение ресурса |
| `AbortSignal` | веб-стандарт: "allows you to communicate with an asynchronous operation (such as a fetch request) and abort it if required" (MDN); `AbortSignal.any()` "returns an `AbortSignal` that aborts when any of the given abort signals abort" | отмена |

### E2. Охват экосистем: скачивания npm за неделю 2026-10-06..2026-10-12 (api.npmjs.org)

Цифры включают транзитивные установки (tapable приходит с webpack, eventemitter3 — со многими пакетами). Это прокси присутствия, а не узнаваемости API.

| Пакет | Скачиваний в неделю |
|---|---|
| eventemitter3 | 155,7 млн |
| tapable | 143,2 млн |
| rxjs | 105,8 млн |
| @tanstack/query-core | 70,6 млн |
| zustand | 62,7 млн |
| emittery | 46,2 млн |
| mitt | 33,4 млн |
| @reduxjs/toolkit | 33,5 млн |
| vue | 17,6 млн |
| @vue/reactivity | 17,4 млн |
| alien-signals | 10,0 млн |
| @preact/signals-core | 9,8 млн |
| solid-js | 7,4 млн |
| svelte | 6,8 млн |
| jotai | 6,7 млн |
| @angular/core | 6,2 млн |
| mobx | 3,9 млн |
| nanoevents | 1,3 млн |

**My assessment (раздел E):**
- Самые узнаваемые:
  - `subscribe` (RxJS, Redux, Svelte, zustand) и `on`/`emit` (Node, mitt) для регистрации слушателя;
  - `watch` (Vue) для явного источника с колбэком;
  - `computed`/`derived` для чистых производных значений;
  - `onDidChange*` для событий в стиле VS Code;
  - `dispose` и `AbortSignal` для освобождения и отмены.
- `sync`, `derived` с побочным эффектом и `hook` как общее название рискуют прочитаться неправильно.

---

## F. Выводы по вопросам владельца

### F1. "Модули реагируют на изменения настроек — это реактивность? Как сделать распространение отслеживаемым и без магии? Есть ли готовые библиотеки?"

Факты:
- Определение Vue (раздел 1) описывает **декларативные** производные значения.
- Системы горячей перенастройки (A1–A5) используют **явное уведомление**:
  - событие сообщает, что изменилось (ключи или секция);
  - значение берётся из текущего снимка;
  - подписка явная и освобождается через `Disposable`/`IDisposable`;
  - модуль, который не подписался, изменений не видит (.NET `IOptions<T>`) или пересоздаётся (OSGi DS без `modified`, Spring `@RefreshScope`).
- Готовых JS-библиотек именно для "конфигурация → модули" я не нашёл. Сигнальные библиотеки решают граф значений, а не жизненный цикл модулей.

**My assessment:**
- Называть фичу лучше "change notification" (уведомление об изменениях), а не "reactivity".
- Предсказуемость обеспечивают:
  - явные ключи;
  - иммутабельные снимки с ревизией (OSGi `getChangeCount()`, Kubernetes `observedGeneration`);
  - level-based доставка последнего состояния с допустимым объединением промежуточных (Kubernetes, Redux, `ChangeToken` в .NET 11);
  - явный выбор "перенастроиться или пересоздаться".

### F2. "Родитель передаёт данные детям; наоборот — антипаттерн? Как это делает индустрия?"

Факты (C1–C7):
- **Вниз:** данные для чтения: props readonly, `InputSignal` read-only, controllers "read-only access to `spec`".
- **Вверх:** события или колбэки, решает владелец. Vue `emit` и "providing a function that is responsible for mutating the state"; React "passing down the event handler"; Angular `output()`; Kubernetes `status` пишется отдельно от `spec`.
- **Двусторонние привязки** (`v-model`, `model()`) — сахар над этой парой. Настоящую двустороннюю привязку Vue 2 убрал: "child components can mutate the parent without the source of that mutation being obvious".
- **Вклад детей в родителя при сборке** — мейнстрим: Backstage inputs "from one child extension through the attachment point to its parent", Eclipse и VS Code contribution points, OSGi whiteboard.

**My assessment (перенос на Get Modular):**
- Вниз: родительский модуль отдаёт детям **capability-источник только для чтения** (снимок плюс уведомления).
- Вверх, два законных пути:
  - (а) при композиции: ребёнок `provides` вклад в слот `many()` родителя (whiteboard);
  - (б) во время работы: ребёнок вызывает **команду владельца**, которую тот явно отдал как capability. Владелец делает commit, изменение снова идёт вниз.
- Запретить (или хотя бы диагностировать):
  - запись в источник из колбэка доставки этого же источника (re-entrancy). Прецеденты: Flux "Cannot dispatch in the middle of a dispatch", IntelliJ "Avoid Shared Data Modification from Subscribers";
  - прямую мутацию родительского состояния.

### F3. "Как передавать события между далёкими модулями (в том числе при опциональной зависимости)?"

Факты (раздел D и C1):
- Vue предлагает:
  - provide/inject "for long-distance communication";
  - глобальный store (Pinia);
  - глобальную шину — только как исключение ("discouraged").
- Rollup рекомендует прямой `api` найденного плагина ("or handle this silently if it is optional").
- Backstage: ApiRef или extension point; опциональное потребление через `useApiHolder`.
- Fowler предупреждает, что поток событий "not explicit in any program text".

**My assessment.** Порядок выбора:
1. Типизированная зависимость на capability (`required()` или `optional()`). Ребро видно в графе.
2. Whiteboard через `many()` для fan-in и fan-out ("все, кто хочет знать о X"). Ребро тоже видно в графе.
3. Шина по топикам — только на границе действительно независимых частей. Нужны владелец шины, типизированные топики (как в IntelliJ: топик = интерфейс), документированные контракты событий и явная политика ошибок.
4. Для данных выбирать "событие-уведомление плюс чтение текущего снимка", а не "событие с полным состоянием". Не делать "passive-aggressive command": если нужно действие, это команда через capability, а не событие.

### F4. "Удобная поддержка плагинов"

Факты (D1, D3–D8):
- whiteboard;
- декларативные и ленивые точки расширения (Eclipse, VS Code, IntelliJ declarative listeners: "created lazily");
- контракт точки расширения в отдельном пакете, принадлежащем расширяемому модулю (Backstage `-node`);
- "multiple extension points with few methods" лучше, чем одна большая;
- явный вид хука и политика ошибок (Tapable, Rollup);
- статическое дерево, подготовленное один раз (Backstage frontend, OSGi static policy).

**My assessment:**
- Текущая статическая композиция Get Modular совпадает с OSGi static policy и Backstage frontend.
- Когда появятся динамические плагины, понадобится аналог OSGi dynamic policy или перезапуск. Это зона `lifecycle-kernel`.

### F5. "Без антипаттернов, сотни модулей, наблюдаемо и предсказуемо": главные ловушки и практики

1. **Ошибка одного слушателя ломает остальных.**
   - Плохие примеры: Node `EventEmitter` (проверено локально), Svelte stores (#11555, открыт), upstream alien-signals (source reading), MediatR `ForeachAwaitPublisher` (source reading).
   - Хорошие примеры: VS Code `fire` ("will not fail this function call"), OSGi Event Admin, IntelliJ (`addSuppressed`), MobX, RxJS (асинхронный проброс), `EventTarget`, Vue 3.5/3.6, Preact.
2. **Устаревшие асинхронные результаты.** Нужен `AbortSignal` на каждое изменение с отменой предыдущего: Angular `resource`, TanStack Query, RxJS `switchMap`, React ignore-флаг, Vue `onWatcherCleanup`.
3. **Утечки подписок.**
   - Whiteboard снимает проблему по построению: подписок в коде модулей нет.
   - Для ручных подписок нужен порог предупреждения: VS Code `leakWarningThreshold`, Node — 10 слушателей по умолчанию ("This is a useful default that helps finding memory leaks").
4. **Каскады и повторный вход** (re-entrancy): Flux, IntelliJ nested messages, Redux snapshot listeners, AngularJS `infdig`.
5. **Порядок.** Детерминированный, но не контрактный (MobX "does not guarantee the order", Kubernetes "Random ordering between resources"). IntelliJ гарантирует порядок только внутри одного топика.
6. **Пропущенные события до готовности слушателей:** Fastify ("the event is lost"), Nest ("may be missed"). Статическая композиция с `many()`, собранным до активации, убирает этот класс ошибок (как Backstage "modules ... initialized before the plugin").
7. **Двойные уведомления от файловых источников** (.NET #624, 2017). Отсюда требование идемпотентного `apply` и сравнения ревизий.
8. **Наблюдаемость:**
   - видимый реестр слушателей (whiteboard "Debugging");
   - имя у каждого источника (`leakWarningName`);
   - журналирование и граф (VS Code observables `DevToolsLogger` и `debugGetObservableGraph`; Vue `onTrack`/`onTrigger` только в dev);
   - тайминги доставки (IntelliJ `messageDeliveryListeners`).
9. **Две копии пакета в процессе** (Vue: "different internal storage for reactivity connections"). Для плагинов из разных пакетов это скрытая связь. Её надо явно детектировать или избегать глобального состояния.

### F6. Готовая библиотека внутри листового пакета или своё решение на ~300–600 строк

Калибровка: замороженный скетч v4 в этом репозитории (`research/observation-hooks-2026-10/raw/evidence/code-sketch/hooks-sketch-v4/src/lib/observation/*.ts.txt`) занимает **664 строки вместе с комментариями** (`wc -l`, 2026-10-15). Оценка в 300–600 строк реалистична, если не раздувать функциональность.

| Вариант | Суть | Надёжность (1–10) | Моя уверенность (1–10) |
|---|---|---|---|
| **1. Своё маленькое ядро (Recommended)** | Явный источник (ключи, иммутабельный снимок, ревизия); слушатели через whiteboard `many()`; синхронная изолированная доставка последнего состояния; async через `AbortSignal` с отменой предыдущего запуска; освобождение через scope из `@get-modular/resources`; конвенции `Event`/`Disposable` как у VS Code. Без глобального трекинга. | 8 | 8 |
| 2. `@preact/signals-core` внутри, без выхода в публичные типы | Около 2 КБ, без зависимостей, около 9,8 млн загрузок в неделю, ошибки изолированы (source reading). Минусы: глобальный активный подписчик, две копии дают два графа, ошибка пробрасывается тому, кто записал значение; это граф значений, а не модель модулей. | 7 | 6 |
| 3. `alien-signals` внутри | Самый лёгкий и быстрый, основа Vue 3.6. Минус: в upstream 3.2.1 исключение прерывает очередь эффектов (source reading), Vue это исправлял у себя. | 6 | 6 |
| 4. RxJS внутри (`BehaviorSubject` + `distinctUntilChanged` + `switchMap`) | Канонически решает "последнее значение плюс отмена устаревшего". Минусы: около 17,8 КБ полного бандла, не glitch-free, высокий порог входа, последняя стабильная 7.8.2 от 2025-02-22, ветка 9 в beta. | 7 | 5 |
| 5. Event-emitter как шина (mitt, eventemitter3, emittery) | Подходит только как внутренний примитив. Как архитектура связи далёких модулей это антипаттерн (Vue, Fowler). У Node `EventEmitter` ошибка прерывает остальных слушателей. | 4 | 7 |

**Моё предложение:**
- Вариант 1 сейчас.
- Вариант 2 рассматривать позже и только если появится реальная потребность в графе производных значений внутри одного пакета.
- TC39 Signals и `signal-polyfill` для продакшена не годятся.

### F7. Имена (вопрос 6) и сверка с текущим дизайном OD-007

В текущем дизайне (`research/observation-hooks-2026-10/design.md`, ревизия 4) участники создаются через `settings.sync({ initial, apply })` и `settings.derived({ keys, derive, apply, fail })`.

**My assessment:**
- **`sync`** перегружен:
  - во Vue это двусторонняя привязка (`.sync`), то есть ровно то, от чего владелец хочет уйти;
  - во Vue `flush: 'sync'` и Tapable `SyncHook` это "синхронно";
  - в React это "синхронизировать с внешней системой" через Effects.

  Читатель с опытом Vue прочитает `settings.sync(...)` как двустороннюю привязку.
- **`derived`** в Svelte, VS Code и TC39 (`Computed`) — чистое производное значение. А в дизайне это асинхронная загрузка плюс побочный `apply`. По смыслу ближе Angular `resource({params, loader})`, MobX `reaction(data, effect)` и Solid 2.0 `createEffect(compute, apply)`.
- **`resource`** занят пакетом `@get-modular/resources`, брать его нельзя.
- **`hook`** как общее название фичи для фронтенд-аудитории означает React Hooks.

Варианты имён:

| Вариант | Надёжность (1–10) | Уверенность (1–10) |
|---|---|---|
| (а) `settings.watch({ keys, apply })` вместо `sync` — узнаваемо по Vue `watch(source, cb)`: явный источник плюс колбэк | 7 | 7 |
| (б) `settings.onChange(...)` — узнаваемо по .NET и React `onChange` | 6 | 6 |
| (в) Для асинхронного варианта `settings.load({ keys, load, apply, fail })` — по аналогии с Angular `loader` | 6 | 5 |

Как называть механизмы:
- Механизм "модуль отдаёт слушателя в `many()`" в документации называть **whiteboard pattern (OSGi)**.
- В API использовать широко узнаваемые "contribution" или "extension point" (VS Code, Eclipse, Backstage), а не "whiteboard".
- Для регистрации вручную (escape hatch) использовать `subscribe` или `onDidChange*` с возвратом `Disposable` либо функции отписки.

---

## G. Что не удалось подтвердить (UNVERIFIED)

- Первоисточник от Ryan Carniato или команды React о минусах автотрекинга на границах модулей (найдены только вторичные статьи).
- Первоисточник от команды Angular о том, почему отказались от двусторонней привязки AngularJS (есть только NG0100 и `infdig`).
- Термин "event soup" в авторитетном источнике.
- Флаг `optional` у зависимостей в Backstage backend: в исходниках не найден, вероятно его нет.
- Поведение Tapable `SyncHook` при исключении: в README не описано.
- Точная формулировка TanStack Query о гонках: вывод сделан из модели ключей.
- Изоляция ошибок в эффектах Angular.
- Размеры `signal-polyfill` и `@tanstack/query-core`: bundlephobia вернул ошибку.
- Двойные уведомления `IOptionsMonitor.OnChange` в .NET 10/11: подтверждено только issue 2017 года для `ChangeToken.OnChange`.
- Что `@vscode/observables` станет стабильным публичным пакетом: на 2026-10-15 есть только пре-релизы.

---

## H. Источники (основные, области A, C, E; источники B и D — в приложениях)

**Область A**
- VS Code API: https://code.visualstudio.com/api/references/vscode-api
- VS Code `event.ts`: https://github.com/microsoft/vscode/blob/main/src/vs/base/common/event.ts
- VS Code observables: https://github.com/microsoft/vscode/tree/main/src/vs/base/common/observableInternal
- .NET options: https://learn.microsoft.com/en-us/dotnet/core/extensions/options
- .NET primitives: https://learn.microsoft.com/en-us/dotnet/core/extensions/primitives
- `IOptionsMonitor.OnChange`: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.options.ioptionsmonitor-1.onchange
- aspnet/Configuration#624: https://github.com/aspnet/Configuration/issues/624
- Spring Cloud Commons: https://docs.spring.io/spring-cloud-commons/reference/spring-cloud-commons/application-context-services.html
- OSGi DS: https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.component.html
- OSGi Configuration Admin: https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.cm.html
- Kubernetes controllers guide: https://github.com/kubernetes/community/blob/master/contributors/devel/sig-api-machinery/controllers.md
- Kubernetes API conventions: https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md
- Kubernetes controller concept: https://kubernetes.io/docs/concepts/architecture/controller/

**Область C: Vue**
- https://vuejs.org/guide/components/props.html
- https://vuejs.org/guide/components/events.html
- https://vuejs.org/guide/components/provide-inject.html
- https://vuejs.org/guide/components/v-model.html
- https://vuejs.org/guide/extras/reactivity-in-depth.html
- https://v2.vuejs.org/v2/guide/components-custom-events.html
- https://v3-migration.vuejs.org/breaking-changes/v-model.html
- https://v3-migration.vuejs.org/breaking-changes/events-api.html

**Область C: React**
- https://react.dev/learn/thinking-in-react
- https://react.dev/learn/sharing-state-between-components
- https://react.dev/learn/passing-data-deeply-with-context
- https://react.dev/learn/you-might-not-need-an-effect
- https://react.dev/reference/react/hooks

**Область C: Angular**
- https://angular.dev/guide/components/outputs
- https://angular.dev/guide/components/inputs
- https://angular.dev/guide/templates/two-way-binding
- https://angular.dev/guide/di/hierarchical-dependency-injection

**Область C: IntelliJ**
- https://plugins.jetbrains.com/docs/intellij/messaging-infrastructure.html
- https://plugins.jetbrains.com/docs/intellij/plugin-listeners.html
- `Topic.java`: https://github.com/JetBrains/intellij-community/blob/master/platform/extensions/src/com/intellij/util/messages/Topic.java
- `MessageBusImpl.kt`: https://github.com/JetBrains/intellij-community/blob/master/platform/core-api/src/com/intellij/util/messages/impl/MessageBusImpl.kt

**Область C: Redux**
- https://redux.js.org/api/store

**Область E**
- Node events: https://nodejs.org/api/events.html
- MDN AbortSignal: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
- TC39 finished proposals: https://github.com/tc39/proposals/blob/main/finished-proposals.md
- zustand: https://github.com/pmndrs/zustand
- npm downloads: https://api.npmjs.org/downloads/point/last-week/<package>


---

# Приложение B (полный отчёт области B, без изменений)

## Area B: reactive primitives and libraries (status on 2026-10-15)

Method: official docs (WebFetch), npm registry (`registry.npmjs.org`, queried 2026-10-15), bundlephobia API (min / min+gzip), and source code read via `gh api` at exact tags. Quotes are verbatim. Statements derived from reading source are labeled "source reading". Anything not confirmed is labeled UNVERIFIED.

## 0. Versions and sizes (npm registry, 2026-10-15)

| Package | Latest stable (date) | Pre-release | min+gzip (bundlephobia) | Deps |
|---|---|---|---|---|
| `alien-signals` | 3.2.1 (2026-05-14) | - | 1950 B (min 5449 B) | none |
| `@preact/signals-core` | 1.14.4 (2026-07-07) | - | 2019 B (min 5500 B) | none |
| `signal-polyfill` | 0.2.2 (2025-01-17) | - | UNVERIFIED (bundlephobia error; unpacked 142 KB) | none |
| `@vue/reactivity` | 3.5.44 (2026-10-13) | 3.6.0-rc.11 (2026-10-10) | 7368 B (min 20106 B) for 3.5.44 | `@vue/shared` |
| `mobx` | 7.0.6 (2026-10-02) | - | 14943 B (min 52594 B) | none |
| `rxjs` | 7.8.2 (2025-02-22) | 9.0.0-beta.1 (2026-10-09) | 17766 B full bundle (tree-shakeable, real cost is lower) | `tslib` |
| `@tanstack/query-core` | 5.104.3 (2026-10-15) | - | UNVERIFIED (bundlephobia error) | none |
| `svelte` | 5.57.2 (2026-10-06) | - | n/a (stores are a subpath) | - |
| `solid-js` | 1.9.17 (2026-10-07) | 2.0.0-rc.15 (2026-10-13), depends on `@solidjs/signals` | n/a | - |
| `@angular/core` | 22.2.3 (2026-10-14) | 22.3.0-next.2 | n/a | - |

MobX 7.0.0 changelog: "MobX 7 is a cleanup release focused on the modern runtime and decorator model." and "Bundle sizes are down: ESM prod 17.02 KiB gzip -> 13.96 KiB gzip" (https://github.com/mobxjs/mobx/blob/main/packages/mobx/CHANGELOG.md).

## 1. TC39 Signals proposal

Source: https://github.com/tc39/proposal-signals README (last README commit 17059df, 2025-08-11).

- Stage: header "Stage 1"; Status section: "This proposal is on the April 2024 TC39 agenda for Stage 1. It can currently be thought of as "Stage 0"." The official tc39/proposals stage-1 table lists Signals with meeting notes only from 2024-04 and 2024-06 (https://github.com/tc39/proposals/blob/main/stage-1-proposals.md). No 2025-2026 advancement found.
- Plan: "We are only interested in standardizing Signals if they are suitable for use in practice in multiple frameworks".
- API: `Signal.State` "A read-write Signal"; `Signal.Computed` "A Signal which is a formula based on other Signals"; `Signal.subtle.Watcher` with a `notify` callback; `Signal.subtle.untrack`, `Signal.subtle.watched` / `unwatched` hooks.
- No effects: "The Signal API does not include any built-in function like `effect`. This is because effect scheduling is subtle and often ties into framework rendering cycles and other high-level framework-specific state or strategies which JS does not have access to."
- Glitch-freedom: "Computation is "glitch-free", meaning no unnecessary calculations are ever performed. This implies that, when an application reads a computed Signal, there is a topological sorting of the potentially dirty parts of the graph to run".
- Pull-based: "Computed Signals are lazy, i.e., pull-based: they are only re-evaluated when they are accessed, even if one of their dependencies changed earlier."
- Sync: "Writes are synchronous and immediately take effect (a framework which batches writes can do that on top)."
- Watcher restriction: "The `notify` callback of a Watcher cannot read or write any signals". And: "Work which is queued by a Watcher's `notify` callback may read or write signals, making it possible to replicate classic React antipatterns in terms of Signals!"
- Async omitted: "Signals are always synchronously available for evaluation, in this model."
- Errors: "If a computed Signal's callback throws, then that error is cached just like another value" and rethrown on read. For Watcher notify: "that exception is sent to the `.set()` call which triggered it, using an AggregateError if multiple exceptions were thrown." Also: "The exceptions do *not* halt execution of this algorithm or leave the graph in a half-processed state."
- untrack: "Soundness risk: allows the creation of computed Signals whose value depends on other Signals, but which aren't updated when those Signals change."
- Leaks: "Any Signals which are watched by a Watcher will be held alive as long as any of the underlying states are reachable ... remember to call `Watcher.prototype.unwatch` to clean up effects."
- `signal-polyfill` README (https://github.com/proposal-signals/signal-polyfill, last commit 2025-02-13): "This polyfill is a preview of an in-progress proposal and could change at any time. Do not use this in production."

## 2. alien-signals

Source: https://github.com/stackblitz/alien-signals (main at c00e639, 2026-06-10; npm 3.2.1).
- Tagline: "The lightest signal library". "This project explores a push-pull based signal algorithm."
- Adoption list: vuejs/core "The core algorithm has been ported to v3.6"; statelyai/xstate "The core algorithm has been ported to implement the atom architecture".
- Exports (source reading, src/index.ts): `signal`, `computed`, `effect`, `effectScope`, `trigger`, `startBatch`, `endBatch`, `getBatchDepth`, `getActiveSub`, `setActiveSub`, `isSignal`, `isComputed`, `isEffect`, `isEffectScope`; `createReactiveSystem()` for custom surfaces.
- Effect ordering: "outer effects always run before their inner effects".
- Error isolation (source reading, v3.2.1 `flush()`): the loop is `try { while (...) run(effect) } finally { ...remaining queued effects get flags reset, queue cleared }` with no `catch`. So an exception in one effect propagates to the writer and the remaining queued effects of that flush are not run. README makes no statement about errors.
- Docs about async: none.

## 3. Vue `@vue/reactivity` and `watch`

- Vue 3.6 status: still pre-release. `vue` latest = 3.5.44 (2026-10-13); 3.6.0-rc.11 (2026-10-10). v3.6.0-rc.1 notes (2026-07-18, https://github.com/vuejs/core/releases/tag/v3.6.0-rc.1): "3.6 also includes a major refactor of `@vue/reactivity` based on alien-signals, which significantly improves the reactivity system's performance and memory usage." The RC vendors the algorithm (no npm dependency on `alien-signals`).
- Vue 3.6-rc.11 `flush()` (source reading, packages/reactivity/src/system.ts) differs from upstream alien-signals: comment "a throwing subscriber must not abort the batch: keep notifying the rest, reset the queue, then rethrow the first error once the batch is drained." Vue 3.5.44 `endBatch()` does the same (collect first error, continue, `throw error` at end).
- Standalone use (packages/reactivity/README.md at v3.5.44): "published as a package that can be used standalone. The standalone build should not be used alongside a pre-bundled build of a user-facing renderer, as they will have different internal storage for reactivity connections." Caveat: "Built-in objects are not observed except for `Array`, `Map`, `WeakMap`, `Set` and `WeakSet`."
- Standalone `watch` exported from `@vue/reactivity` since 3.5 with `onWatcherCleanup`, `getCurrentWatcher`, `WatchErrorCodes`. Source reading (watch.ts at v3.5.44): `WatchOptions` = `immediate`, `deep`, `once`, `scheduler`, `onWarn` (+ internal `augmentJob`, `call`). There is NO `flush` option in the standalone package; without a `scheduler` the job runs synchronously (`effect.scheduler = scheduler ? () => scheduler(job, false) : job`). `flush: 'pre' | 'post' | 'sync'` belongs to `@vue/runtime-core`.
- Vue docs, Watchers (https://vuejs.org/guide/essentials/watchers.html):
  - "there are cases where we need to perform "side effects" in reaction to state changes".
  - Stale results: "But what if `id` changes before the request completes? When the previous request completes, it will still fire the callback with an ID value that is already stale." Fix: "We can use the `onWatcherCleanup()` API to register a cleanup function that will be called when the watcher is invalidated and is about to re-run". Constraint: "`onWatcherCleanup` is only supported in Vue 3.5+ and must be called during the synchronous execution of a `watchEffect` effect function or `watch` callback function: you cannot call it after an `await` statement". Alternative `onCleanup` 3rd argument "is not subject to the synchronous constraint".
  - Flush: default callback "called after parent component updates (if any), and before the owner component's DOM updates"; `flush: 'post'`; sync: "Sync watchers do not have batching and triggers every time a reactive mutation is detected. It's ok to use them to watch simple boolean values, but avoid using them on data sources that might be synchronously mutated many times, e.g. arrays."
  - Explicit vs implicit: "`watch` only tracks the explicitly watched source. It won't track anything accessed inside the callback." vs `watchEffect` "is more convenient and typically results in terser code, but makes its reactive dependencies less explicit."
  - Leaks: "if the watcher is created in an async callback, it won't be bound to the owner component and must be stopped manually to avoid memory leaks."
- Vue docs, Reactivity in Depth (https://vuejs.org/guide/extras/reactivity-in-depth.html): "Effect subscriptions are stored in a global `WeakMap<target, Map<key, Set<effect>>>` data structure." Pitfall: "When you assign or destructure a reactive object's property to a local variable, accessing or assigning to that variable is non-reactive". "Fundamentally, signals are the same kind of reactivity primitive as Vue refs." Debug hooks `onTrack` / `onTrigger` "only work in development mode". External state integration: hold it in a `shallowRef` and "When the external state changes, replace the ref value to trigger updates."

## 4. Preact `@preact/signals-core`

Docs: https://github.com/preactjs/signals/blob/main/packages/core/README.md and https://preactjs.com/guide/v10/signals/
- API: `signal`, `computed`, `effect`, `batch`, `untracked`, `.peek()`; also `Signal.prototype.subscribe` exists in source (implemented as an effect whose callback runs `untracked`), not documented in the guide.
- Sync: "Changing a signal's value synchronously updates every computed and effect that depends on that signal". Lazy: "signals are lazy by default: they only compute new values when their value has been accessed."
- Batch: "Batches can be nested and updates will be flushed when the outermost batch call completes."
- Disposal: "You can destroy an effect and unsubscribe from all signals it was subscribed to, by calling the returned function." Source: dispose also exposed as `Symbol.dispose`.
- Errors (source reading, `endBatch()` in packages/core/src/index.ts, commit 2910fbf 2026-07-05): each effect callback in try/catch; the first error is stored; other effects keep running; after the batch, `throw error` - i.e. the first effect error is rethrown to the code that wrote the signal. Docs say nothing on this.
- Cycles: `throw new Error("Cycle detected")` when a batch iterates >100 times or an effect re-enters itself.
- Changelog 1.14.4: "Fix computeds returning stale values after a batch reverts a signal to its original value."

## 5. Svelte stores and runes

Docs: https://svelte.dev/docs/svelte/stores (svelte 5.57.2)
- Status vs runes: "Prior to Svelte 5, stores were the go-to solution for creating cross-component reactive states or extracting logic." "With runes, these use cases have greatly diminished."
- Start/stop: start fn "will be called when the number of subscribers goes from zero to one (but not from one to two, etc)"; must return "a `stop` function that is called when the subscriber count goes from one to zero."
- Async derived: "The callback can set a value asynchronously by accepting a second argument, `set`." Cleanup "will be called when a) the callback runs again, or b) the last subscriber unsubscribes."
- Store contract: `.subscribe` "must be immediately and synchronously called with the store's current value upon calling `.subscribe`" and "must return an unsubscribe function."
- Ordering/diamonds (source reading, packages/svelte/src/store/shared/index.js): two-phase notify (invalidate all subscribers, then run a module-global `subscriber_queue`); `derived` keeps a `pending` bitmask so it recomputes once after all invalidated inputs settle.
- Error isolation bug: issue #11555 (open since 2024-05-11) "Svelte stores become stuck after unhandled exception in subscriber": "If any svelte store subscriber raises an un-handled exception, future calls to `.set()` on any store will not notify subscribers." Earlier #7618 "Throwing in a store subscriber nukes all stores, globally." closed NOT_PLANNED 2024-11-02. Source at 5.57.2 still has no try/finally around the queue loop.
- `$effect` docs (https://svelte.dev/docs/svelte/$effect): "In general, `$effect` is best considered something of an escape hatch"; "In particular, avoid using it to synchronise state." "Values that are read asynchronously - after an `await` or inside a `setTimeout`, for example - will not be tracked." Teardown "will run immediately before the effect re-runs" and when destroyed.

## 6. Solid

- Solid 1.x `createResource` (https://docs.solidjs.com/reference/basic-reactivity/create-resource): "Creates a reactive resource that manages asynchronous data fetching and loading states"; source "Each change triggers the fetcher again."; states `unresolved`, `pending`, `ready`, `refreshing`, `errored`; `mutate`, `refetch`. Docs do not state stale-response policy (UNVERIFIED from docs).
- Solid 2.0 RC (https://github.com/solidjs/solid/releases/tag/v2.0.0-rc.0, 2026-08-13; npm next = 2.0.0-rc.15): "async is a property of the reactive system itself. It's part of the graph." "`createResource` - gone. Async flows through ordinary memos." "`batch` - gone. Everything batches. Writes apply on a microtask; `flush()` when you need them now." "`on` and `createComputed` - gone. Split effects - `createEffect(compute, apply)` - separate tracking from side effects."
- Migration guide (https://v2.solidjs.com/migration/from-solid-1): "The compute function tracks reactive reads and must remain free of application writes." "The effect function is untracked, may perform imperative work, and may return a cleanup function." "A write to an input of an async computation is held until that computation has its next answer, and everything else in the same update waits with it." Errors: "Replace `catchError` or `onError` with an `Errored` boundary or the effect bundle `error` callback."

## 7. Angular signals, effect, linkedSignal, resource

- Stability (source reading, angular/angular tag v22.2.3): `effect`, `linkedSignal` tagged `@publicApi 20.0`; `resource`, `ResourceLoaderParams`, `rxResource`, `httpResource` tagged `@publicApi 22.0` (stable since v22); `debounced` is `@experimental 22.0`. Secondary articles agree resource APIs became stable in v22 (e.g. https://dev.to/lacolaco/angular-resource-api-family-system-diagram-3bf0).
- `ResourceLoaderParams<R>` = `{ params, abortSignal: AbortSignal, previous: { status } }`.
- `resource()` JSDoc: "Note that `resource` is intended for _read_ operations, not operations which perform mutations. `resource` will cancel in-progress loads via the `AbortSignal` when destroyed or when a new request object becomes available, which could prematurely abort mutations."
- Guide (https://angular.dev/guide/signals/resource): "A resource aborts an outstanding loading operation if the `params` computation changes while the resource is loading." Status values 'idle', 'error', 'loading', 'reloading', 'resolved', 'local'.
- Effects guide (https://angular.dev/guide/signals/effect): "Effects should be the last API you reach for." "Always prefer computed() for derived values and linkedSignal() for values that can be both derived and manually set." "Avoid using effects for propagation of state changes." "Effects always execute asynchronously, during the change detection process."
- `effect()` JSDoc: "Component effects run as a component lifecycle event during Angular's synchronization (change detection) process ... Root effects run as microtasks and have no connection to the component tree or change detection."
- Signals guide (https://angular.dev/guide/signals): "Computed signals are both lazily evaluated and memoized"; "Computed signal dependencies are dynamic"; "The reactive context is only active for synchronous code." "Any signal reads that occur after an asynchronous boundary will not be tracked as dependencies."
- linkedSignal: "lets you create a signal to hold some state that is intrinsically linked to some other state."

## 8. TanStack Query

- Cancellation (https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation): "TanStack Query provides each query function with an AbortSignal instance". "When a query becomes out-of-date or inactive, this `signal` will become aborted." Default: "queries that unmount or become unused before their promises are resolved are _not_ cancelled." Without consuming the signal: "after the promise has resolved, the resulting data will be available in the cache." "Cancelling the query will result in its state being _reverted_ to its previous state." Limitation: "Cancellation does not work when working with `Suspense` hooks".
- Keys (https://tanstack.com/query/latest/docs/framework/react/guides/query-keys): "If your query function depends on a variable, include it in your query key"; "Query Keys are hashed deterministically!"; "query keys act as dependencies for your query functions".
- Stale responses: results are stored per key, so a late response for an old key lands in the old key's cache entry and does not overwrite the current key (my reading of the key model; the docs quote above about data landing "in the cache" supports it, exact wording about races UNVERIFIED).

## 9. RxJS

Source: ReactiveX/rxjs at tag 7.8.2 (latest stable; 9.0.0-beta.1 published 2026-10-09; 8.x never went stable on npm `latest`).
- `BehaviorSubject`: "A variant of Subject that requires an initial value and emits its current value whenever it is subscribed to."; `getValue()` rethrows `thrownError` if errored.
- `switchMap`: "When a new inner Observable is emitted, `switchMap` stops emitting items from the earlier-emitted inner Observable and begins emitting items from the new one."
- `distinctUntilChanged`: "emits all values pushed by the source observable if they are distinct in comparison to the last value the result observable emitted"; default "`===` equality check".
- Contract (guide/observable.md): "In an Observable Execution, zero to infinite Next notifications may be delivered. If either an Error or Complete notification is delivered, then nothing else can be delivered afterwards." "Observables are able to deliver values either synchronously or asynchronously." "Just call `unsubscribe()` to cancel the execution."
- Error isolation (src/internal/config.ts): `onUnhandledError` "will _always_ be called asynchronously on another job in the runtime". `useDeprecatedSynchronousErrorHandling`: "It also enables producer interference, a nasty bug where a multicast can be broken for all observers by a downstream consumer with an unhandled error." `reportUnhandledError` throws via `setTimeout`. So by default one subscriber's throw does not break other subscribers of a Subject.
- Glitches: RxJS is not glitch-free in diamond graphs. Andre Staltz (author of Cycle.js; affiliation not re-verified), "Rx glitches aren't actually a problem", 2015-11-21 (https://staltz.com/rx-glitches-arent-actually-a-problem): "Glitches are temporary inconsistencies emitted by Observables." "`combineLatest` falls short." "There actually isn't any operator that we can use to replace combineLatest in the example above." Conclusion: "The emphasis people put on glitches and their problems is usually exaggerated."

## 10. MobX

Docs: https://mobx.js.org/reactions.html (mobx 7.0.6)
- "The goal of reactions is to model side effects that happen automatically." "it is important to realize that the APIs discussed here should rarely be used."
- Rules: "Reactions should not compute new data, but only cause effects." "MobX does not guarantee the order in which reactions will be run."
- `reaction` "gives more fine grained control on which observables will be tracked." Options: `fireImmediately`, `delay` ("throttle the effect function"), `equals` ("The effect function is only invoked if this function returns false."), `onError`, `scheduler`, `signal` ("An AbortSignal object instance; can be used as an alternative method for disposal.").
- Timing: "Affected reactions run by default immediately (synchronously) if an observable is changed." but "they won't run before the end of the current outermost (trans)action."
- Errors: "By default, any exception thrown inside an reaction will be logged, but not further thrown."; "an exception in one reaction does not prevent the scheduled execution of other, possibly unrelated reactions."; global `onReactionError(handler)` "Attaches a global error listener, which is invoked for every error that is thrown from a _reaction_" (docs/api.md).
- Leaks: reactions "are only garbage collected if all objects they observe are garbage collected themselves." "We strongly recommend to always use the disposer function" ... "Failing to do so can lead to memory leaks."
- Glitch-free claim (docs/README.md): "It implements TFRP in a glitch-free, synchronous, predictable and efficient manner."

## 11. "Magic" / implicit tracking: authoritative statements found

- Vue: `watchEffect` "makes its reactive dependencies less explicit" (watchers guide).
- Angular: "Effects should be the last API you reach for." / "Avoid using effects for propagation of state changes." / reads after `await` not tracked.
- Svelte: `$effect` "escape hatch"; "avoid using it to synchronise state"; async reads not tracked.
- Solid 2.0: split effects "separate tracking from side effects"; compute fn "must remain free of application writes".
- MobX: reactions "should rarely be used"; no ordering guarantee.
- TC39: `untrack` has a "Soundness risk"; notify may enable "classic React antipatterns".
- Vue reactivity README: two copies of the reactivity package have "different internal storage for reactivity connections" (auto-tracking relies on one shared global graph).
- NOT FOUND: a specific Ryan Carniato post or a React-team primary statement on auto-tracking downsides. Searches returned only secondary articles. UNVERIFIED.

## 12. Comparison summary

| | Notify timing | Glitch-free | One listener throws | Async race handling | Disposal |
|---|---|---|---|---|---|
| TC39 Signals | sync notify, lazy pull; effects left to frameworks | yes (spec goal) | notify errors -> `.set()` (AggregateError); computed caches error | not in scope ("Async" omitted) | `Watcher.unwatch` required |
| alien-signals 3.2.1 | sync | push-pull (claim "glitch" not in README) | propagates to writer, rest of queued effects skipped (source reading) | none built in | returned disposer, `effectScope` |
| @preact/signals-core 1.14.4 | sync after outermost batch | lazy computeds (no explicit claim in docs) | others still run, first error rethrown to writer (source reading) | none built in | returned disposer / `Symbol.dispose` |
| @vue/reactivity 3.5 / 3.6-rc | sync (standalone `watch` without scheduler); `flush` only in runtime-core | yes in practice (UNVERIFIED explicit claim) | others still run, first error rethrown (source reading, both 3.5.44 and 3.6-rc.11) | `onWatcherCleanup` / `onCleanup` | `stop()`, `effectScope` |
| Svelte stores | sync, global queue | `derived` waits on pending inputs | queue stuck for ALL stores (open #11555) | user must guard via cleanup | unsubscribe fn; start/stop on 0<->1 subscribers |
| Angular 22 | effects async (CD or microtask) | computed lazy+memoized | UNVERIFIED in this pass | `resource` aborts via `abortSignal` | DestroyRef / injection context |
| Solid 2.0 RC | microtask batch, `flush()` | async held in graph | `Errored` boundary / effect `error` callback | async memos; writes held until answer | owner tree |
| TanStack Query 5 | async | n/a | n/a | key-scoped cache + `signal` abort | observer unsubscribe, gc |
| RxJS 7.8 | sync or async | no (diamond glitches) | async rethrow, other subscribers unaffected | `switchMap` unsubscribes previous | `unsubscribe()` |
| MobX 7 | sync after outermost action | yes (README claim) | logged, others still run, `onReactionError` | none built in (`delay`, `signal` for dispose) | disposer, `signal` |

## My assessment:

- No reactive library is a drop-in fit for module-level change propagation in Get Modular. All signal libraries rely on a module-global "active subscriber" and global queue (Vue README warns about two copies; Svelte shows a single global queue can be poisoned by one throw). Across independently versioned plugin packages this is a hidden coupling point.
- The strongest industry signal in 2025-2026 is convergence on "derive with computed, keep effects rare, separate tracking from side effects" (Angular, Svelte, Solid 2.0, MobX, Vue `watch` vs `watchEffect`). For module boundaries this favors explicit sources (Vue `watch(source, cb)` / MobX `reaction(data, effect)` / Solid 2.0 `createEffect(compute, apply)`) over auto-tracked effects.
- Error isolation varies widely and is mostly undocumented. If Get Modular ships a change-notification primitive, it should define it explicitly: continue notifying other listeners, collect errors, report them (AggregateError or a reporter), never leave shared state half-processed. Vue 3.6 had to add exactly this on top of alien-signals.
- Async: the industry answer is keyed or abortable loads (Angular `resource` with `abortSignal`, TanStack `queryKey` + `signal`, RxJS `switchMap`, Vue `onWatcherCleanup`). A minimal primitive should pass an `AbortSignal` per change and abort the previous one.
- If a dependency is wanted inside a small leaf package: `alien-signals` (about 2 KB gzip, no deps, used by Vue 3.6 and XState) or `@preact/signals-core` (about 2 KB gzip, mature, documented). Preact has better error isolation than upstream alien-signals today; Vue fixed it in its fork. TC39 Signals and `signal-polyfill` are not production options (Stage 1 since 2024, polyfill says "Do not use this in production"). A hand-written explicit-source notifier of a few hundred LOC is a realistic alternative and avoids global tracking state.

---

# Приложение D (полный отчёт области D, без изменений)

## Area D: communication between distant modules and plugin architectures

Retrieved 2026-10-15. All quotes are verbatim from the fetched source text (raw HTML/Markdown/PDF downloaded with curl, extracted locally). Raw copies: `scratchpad/d-raw/`. Anything not confirmed is marked UNVERIFIED. My own opinions are only under "My assessment:".

---

## D1. OSGi whiteboard pattern ("Listeners Considered Harmful")

Source: OSGi Alliance technical whitepaper "Listeners Considered Harmful: The "Whiteboard" Pattern", Revision 2.0, 17 August 2004, authors Peter Kriens (aQute) and BJ Hargrave (IBM).
- PDF: https://vault.opennms.com/docs/minion/branches/develop/sampler/files/whiteboard.pdf (mirror; title page "Revision 2.0 / 17 August 2004 / © 2001, 2004 OSGi Alliance"; "Authors" section lists Peter Kriens and BJ Hargrave)
- Official web version (updated to DS annotations, footer "Copyright © 2023 Eclipse Foundation"): https://docs.osgi.org/whitepaper/whiteboard-pattern/

### Problem statement
- Introduction: "The traditional model with listeners was found to be overly complicated and error prone. This paper analyzes the issues and proposes an easier and inherently more reliable model." (https://docs.osgi.org/whitepaper/whiteboard-pattern/010-introduction.html)

### Listener-pattern problems named (Background, https://docs.osgi.org/whitepaper/whiteboard-pattern/020-background.html)
- Overhead: "In most cases, an event source has only a single listener registered. Still, the event source must take the overhead of correctly delivering an event to many listeners."
- Lifecycle / dangling references: "Another issue that is not obvious is the dependency that is created between the event source and the listener. Designs must correctly manage this dependency. If the event source goes away, the listener must clean up any references it holds. If the listener goes away, the event source should remove it from the list of listeners. These are the so-called life cycle issues."
- Removal is the fragile half: "the removal phase is much more difficult to verify and is often not handled at all."
- Hidden assumption broken by dynamic systems: "Once you have a reference to an object, the object does not go away."
- Complexity: "It turned out that managing these dependencies is not trivial."
- Deadlocks (Comparison page, https://docs.osgi.org/whitepaper/whiteboard-pattern/040-comparison.html): "What is not obvious is the fact that the listener pattern has significantly more deadlock possibilities than the whiteboard pattern."

### Definition of the whiteboard pattern (same Background page)
- "The whiteboard pattern leverages the OSGi framework's service registry instead of implementing a private registry as required by the listener pattern. Instead of having event listeners track event sources and then register themselves with the event source, the whiteboard pattern has event listeners register themselves as a service with the OSGi framework. When the event source has an event object to deliver, the event source calls all event listeners currently registered in the service registry."
- "Remarkably, the event source is not registered with the framework as a service."
- "The inter-bundle dependency between the event source and the event listener is handled by the framework and requires almost no code in the event source and event listener bundles."
- "Both server and application become simpler because they reuse the framework registry."
- Extra registry benefits listed: "Debugging. The event listeners are visible in the registry and any framework support tool can inspect the registry. This makes inter-bundle dependencies more visible." / "Security. ..." / "Properties. The registry supports properties that can be used by the server to select a subset of all listeners."

### Why preferred (Conclusion, https://docs.osgi.org/whitepaper/whiteboard-pattern/050-conclusion.html)
- "It significantly simplifies handling life cycle issues."
- "The listener approach places the programmer of the listener fully in control. He decides the event sources with which to register his listener, and he is in charge of all the dependencies between event source and listener. This philosophy is questionable in the OSGi environment."
- "Bundles should be written to provide a service that can be configured together with other bundles and to provide maximum composability. Often these other bundles are unknown to the designer of the original bundle."
- "All these reasons are compelling reasons to apply the whiteboard pattern whenever there is a design that requires managing inter-bundle dependencies."

### Explicit check: does "listener provided as a capability and collected by the source through a `many()` slot" match the whiteboard?
Yes, the paper's own whiteboard implementation is exactly that shape (https://docs.osgi.org/whitepaper/whiteboard-pattern/030-an-example.html):
- Listener side: `@Component public class Clock implements ContentProvider { ... }` with "The Component annotation causes SCR to register the component under the names of any directly implemented interfaces which is ContentProvider in this case."
- Source side: `@Component(service = {}) public class DisplayManager ... @Reference private volatile List<ContentProvider> providers;` with "The Reference annotation on the providers field tell SCR to track and inject all the ContentProvider services, since the field is a List of ContentProvider." and "The DisplayManager component does not register a service".
- "Another advantage of the whiteboard approach is the requirement for only a single service interface: the ContentProvider."
- Note: in the example the source *pulls* from the collected providers ("ContentProviders are queried for their content when a new screen is needed"), i.e., the collected objects are capabilities the source calls, not subscriptions the source holds.

Declarative Services cardinality vocabulary (OSGi Compendium 8.1.0, ch. 112, https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.component.html):
- "0..1 - Optional and unary. 1..1 - Mandatory and unary (Default) . 0..n - Optional and multiple. 1..n - Mandatory and multiple."
- Multiplicity example that IS the whiteboard: "when the Configuration Admin uses the Configuration Listener services it needs to bind to all target services present in the service registry to dispatch its events correctly."
- Static policy (closest to static composition): "The static policy is the most simple policy and is the default policy. ... A component instance never sees any of the dynamics of the static reference. The bind method is called and/or the field is set before the component instance is activated."
- Dynamic policy: "the component implementation must properly handle changes in the set of bound services that can occur on any thread at any time after the component instance is created."

Whiteboard used across OSGi specs, e.g. Servlet Whiteboard (Compendium 8.1.0 ch. 140, https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.servlet.html): "the Servlet Whiteboard Specification provides a light and convenient way of using servlets, servlet filters, servlet listeners and web resources in an OSGi environment through the use of the [7] Whiteboard Pattern ." Also ch. 151 "Jakarta RESTful Web Services Whiteboard" (table of contents of the same Compendium).

---

## D2. OSGi Event Admin (Compendium 8.1.0, ch. 113)

Source: https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.event.html

- Why it exists: "Dispatching events for a design related to X, usually involves a service of type XListener . However, this model does not scale well for fine grained events that must be dispatched to many different handlers." / "The Event Admin service provides an inter-bundle communication mechanism. It is based on a event publish and subscribe model".
- Event window: "Only event handlers that are active when an event is published must receive this event, handlers that register later must not see the event."
- Handlers are themselves whiteboard services: "Event handlers must be registered as services with the OSGi framework under the object class org.osgi.service.event.EventHandler . Event handlers should be registered with a property (constant from the EventConstants class) EVENT_TOPIC ." Wildcard: "A wildcard asterisk ( '*' ...) may be used as the last token of a topic name, for example com/action/* ."
- Topics: "Topics are arranged in a hierarchical namespace. Each level is defined by a token and levels are separated by solidi ( '/' ...)." and "When a topic is designed, its name should not include any other information, such as the publisher of the event or the data associated with the event, those parts are intended to be stored in the event properties."
- Sync: "Synchronous event delivery is initiated by the sendEvent method. ... all notifications must be completely handled before the sendEvent method returns to the caller. Synchronous event delivery is significantly more expensive than asynchronous delivery. All things considered equal, the asynchronous delivery should be preferred over the synchronous delivery." Also: callers "must not be holding any monitors when they invoke the sendEvent method."
- Async: `postEvent`: "Initiate asynchronous, ordered delivery of an event. This method returns to the caller before delivery of the event is completed. Events are delivered in the order that they are received by this method."
- Ordering: "In the default case, an Event Handler will receive posted (asynchronous) events from a single thread in the same order as they were posted." Handlers may opt out via `DELIVERY_ASYNC_UNORDERED`. Multi-thread posters: "The event delivery system cannot make any guarantees in this case." Re-entrancy: "Thus some handlers may observe the second event before they observe the first one." (nested sendEvent case)
- Snapshot of handlers at post time and liveness check: "only handlers that were registered at the time the event was posted will receive the event notification" and "Before notifying each handler, the event delivery thread must ensure that the handler is still registered in the service registry."
- Error isolation (113.8.1): "If a handler throws an Exception during delivery of an event, it must be caught by the Event Admin service and handled in some implementation specific way. If a Log Service is available the exception should be logged. Once the exception has been caught and dealt with, the event delivery must continue with the next handlers to be notified, if any." Also warns of a loop via Log Service forwarding.
- Stalled handlers (113.8.2): "Event handlers should not spend too long in the handleEvent method. Doing so will prevent other handlers in the system from being notified." ... "Implementations can choose to deny list any handlers that they determine are misbehaving. Deny listed handlers must not be notified of any events." (The 8.1 text says "deny list"; older revisions used "blacklist" - UNVERIFIED for older wording, not re-fetched.)

---

## D3. Eclipse extension points / extension registry

- Runtime model (https://help.eclipse.org/latest/topic/org.eclipse.platform.doc.isv/guide/runtime_model.htm): "Plug-ins can define extension points , well-defined function points that can be extended by other plug-ins." / "These extensions and extension points are declared in the plug-ins's manifest ( plugin.xml ) file." / "Defining an extension point is much like defining any other API. The only difference is that the extension point is declared using XML instead of a code signature."
- Lazy activation: "The declarative nature of the platform extension model allows the runtime engine to determine what extension points and extensions are supplied by a plug-in without ever running it. Thus, many plug-ins can be installed, but none will be activated until a function provided by a plug-in has been requested according to the user's activity. This is an important feature in providing a scalable, robust platform."
- Registry consumption (https://help.eclipse.org/latest/topic/org.eclipse.platform.doc.isv/guide/runtime_registry.htm): the extension-point owner pulls contributions: `IExtensionRegistry registry = Platform.getExtensionRegistry(); IExtensionPoint point = registry.getExtensionPoint("org.eclipse.ui.views"); ... IExtension[] extensions = point.getExtensions();`

## D4. VS Code contribution points, activation events, inter-extension API

Docs repo microsoft/vscode-docs, files show "DateApproved: 10/14/2026".
- Contribution points (https://code.visualstudio.com/api/references/contribution-points): "**Contribution Points** are a set of JSON declarations that you make in the `contributes` field of the `package.json` [Extension Manifest]. Your extension registers **Contribution Points** to extend various functionalities within Visual Studio Code."
- Activation events (https://code.visualstudio.com/api/references/activation-events): meta description "To support lazy activation of Visual Studio Code extensions (plug-ins), your extension controls when it should be loaded through a set of Activation Events."; body: "Your extension becomes activated when the **Activation Event** happens."
- Extension anatomy (https://code.visualstudio.com/api/get-started/extension-anatomy): "**Contribution Points**: static declarations that you make in the `package.json` ... to extend VS Code." / "`deactivate` gives you a chance to clean up before your extension becomes deactivated."
- Extension-to-extension: manifest `extensionDependencies`: "An array with the ids of extensions that this extension depends on." (https://code.visualstudio.com/api/references/extension-manifest); typed API via `Extension<T>.exports` in `vscode.d.ts` (microsoft/vscode main): "The public API exported by this extension (return value of `activate`). It is an invalid action to access this field before this extension has been activated."
- (Adjacent, area A) `vscode.d.ts` `Event<T>`: "A function that represents an event to which you subscribe by calling it with a listener function as argument." example `item.onDidChange(function(event) {...})`.

---

## D5. webpack Tapable (hook kinds)

Source: https://github.com/webpack/tapable README (main); npm `tapable` latest 2.3.3 (registry "modified" 2026-04-21).
- Classes in the README table: SyncHook, SyncBailHook, SyncWaterfallHook, SyncLoopHook, AsyncParallelHook, AsyncParallelBailHook, AsyncSeriesHook, AsyncSeriesBailHook, AsyncSeriesLoopHook, AsyncSeriesWaterfallHook.
- Kinds: "Basic hook (without "Waterfall", "Bail" or "Loop" in its name). This hook simply calls every function it tapped in a row." / "**Waterfall**. ... it passes a return value from each function to the next function." / "**Bail**. A bail hook allows exiting early. When any of the tapped function returns anything, the bail hook will stop executing the remaining ones." / "**Loop**. When a plugin in a loop hook returns a non-undefined value the hook will restart from the first plugin. It will loop until all plugins return undefined."
- Sync/async: "**Sync**. A sync hook can only be tapped with synchronous functions (using `myHook.tap()`)." / "**AsyncSeries**. ... They call each async method in a row." / "**AsyncParallel**. ... However, they run each async method in parallel."
- Registration vs triggering: "**Tap methods** are the `tapX` variants that may be used to register a handler." / "**Call methods** are the ways the owner of the hook can trigger it." (sync: `call`; async: `callAsync`, `promise`).
- Ordering: `stage`: "Defaults to `0`. Taps with a lower stage run before taps with a higher stage. Taps with the same stage run in registration order." `before`: "The tap is inserted before the named tap(s). Unknown names are ignored."
- SyncHook: "Every tapped function is called in registration order with the arguments passed to `call`."
- Errors: AsyncSeriesHook "The first error aborts the series."; AsyncParallelHook "If any tap errors, the error is forwarded and remaining taps still complete but their results are discarded."; AsyncParallelBailHook "an earlier tap's value takes precedence over a later one's, even if the later one finishes first." SyncHook throw behaviour is not stated in the README (UNVERIFIED from docs; my inference: the exception propagates out of `call` and stops remaining taps).
- Interception: "All hooks expose an `intercept(interceptor)` method. ... Interceptors are invoked in registration order before the taps, and are useful for logging, tracing, profiling, or re-mapping tap options." (`call`, `tap`, `loop`, `register`).
- Implementation note: "The Hook will compile a method with the most efficient way of running your plugins."

## D6. Rollup and Vite plugin hooks

Rollup docs (rollup/rollup master `docs/plugin-development/index.md`, https://rollupjs.org/plugin-development/); npm rollup 4.64.7.
- Hook kinds: "`async`: The hook may also return a Promise resolving to the same type of value; otherwise, the hook is marked as `sync`." / "`first`: If several plugins implement this hook, the hooks are run sequentially until a hook returns a value other than `null` or `undefined`." / "`sequential`: ... all of them will be run in the specified plugin order. If a hook is `async`, subsequent hooks of this kind will wait until the current hook is resolved." / "`parallel`: ... If a hook is `async`, subsequent hooks of this kind will be run in parallel and not wait for the current hook."
- Per-hook `order`: "`order: "pre" | "post" | null` If there are several plugins implementing this hook, either run this plugin first (`"pre"`), last (`"post"`), or in the user-specified position (no value or `null`)."
- `sequential: true`: "Do not run this hook in parallel with the same hook of other plugins. Can only be used for `parallel` hooks."
- Inter-plugin communication section: "At some point when using many dedicated plugins, there may be the need for unrelated plugins to be able to exchange information during the build." Recommended "Direct plugin communication": "For any other kind of inter-plugin communication, we recommend the pattern below. Note that `api` will never conflict with any upcoming plugin hooks." The example: a `parent` plugin exposes `api: { doSomething(...) }`; the dependent finds it with `plugins.find(plugin => plugin.name === parentName)` and, if missing, throws `This plugin depends on the "${parentName}" plugin.` with the comment "or handle this silently if it is optional".

Vite (vitejs/vite main `docs/guide/api-plugin.md`; npm vite 8.3.4, 2026-10-08):
- "Vite plugins extends Rolldown's plugin interface with a few extra Vite-specific options."
- "A Vite plugin can additionally specify an `enforce` property (similar to webpack loaders) to adjust its application order. The value of `enforce` can be either `"pre"` or `"post"`." Order: Alias, `enforce: 'pre'`, core, no enforce, build plugins, `enforce: 'post'`, post-build.
- "Note that this is separate from hooks ordering, those are still separately subject to their [`order` attribute] as usual for Rolldown hooks."

## D7. Fastify encapsulation and hooks

Fastify docs (fastify/fastify main); npm fastify 5.12.7.
- Encapsulation (https://fastify.dev/docs/latest/Reference/Encapsulation/): "A fundamental feature of Fastify is the "encapsulation context." It governs which [decorators], registered [hooks], and [plugins] are available to [routes]."
- "Within each _child context_, the _grandchild contexts_ have access to the _child plugins_ registered within the containing _child context_, but the containing _child context_ **does not** have access to the _child plugins_ registered within its _grandchild context_."
- "Each context in the previous example inherits _only_ from its parent contexts. Parent contexts cannot access entities within their descendant contexts."
- "`fastify-plugin` breaks encapsulation only for the plugin it wraps."
- Plugins guide (https://fastify.dev/docs/latest/Guides/Plugins-Guide/): "`register` creates a new Fastify context, which means that if you perform any changes on the Fastify instance, those changes will not be reflected in the context's ancestors. In other words, encapsulation!" / "Do note that encapsulation applies to the ancestors and siblings, but not the children." / "Fastify's plugin model is fully reentrant and graph-based, it handles asynchronous code without any problems and it enforces both the load and close order of plugins." / "Thanks to the encapsulation model, it will completely avoid cross dependencies".
- Escape hatch without the helper (Reference/Plugins.md): "Use the `'skip-override'` hidden property" (`yourPlugin[Symbol.for('skip-override')] = true`).
- Hooks (https://fastify.dev/docs/latest/Reference/Hooks/): "You have to register a hook before the event is triggered, otherwise, the event is lost." / "Except for [onClose], all hooks are encapsulated." / onReady: "Registered hook functions are executed serially." / onClose: "When multiple `onClose` hooks are registered across plugins, child-plugin hooks execute before parent-plugin hooks."

---

## D8. Backstage (new backend system and new frontend system)

Docs from backstage/backstage master (`docs/...`); npm `@backstage/backend-plugin-api` 1.10.1, `@backstage/frontend-plugin-api` 0.18.1 (both 2026-09-15).

Backend (https://backstage.io/docs/backend-system/architecture/index etc.):
- Plugins isolated: "They operate completely independently of each other. If plugins want to communicate with each other, they must do so over the wire. There can be no direct communication between plugins through code. Because of this constraint, each plugin can be considered to be its own microservice." (01-index) and "Plugins must never communicate with each other directly through code, they may only communicate over the network." (04-plugins)
- Extension points: "Extension Points look a little bit like services, since you depended on them just like you would a service. A key difference is that extension points are registered and provided by plugins or modules themselves". "Extension Points are exported separately from the plugin or module instance itself, and it is possible to expose multiple different extension points at once. This makes it easier to evolve and deprecate individual Extension Points over time, rather than dealing with a single large API surface."
- Modules: "Each module may only use Extension Points that belong to a single plugin, and the module must be deployed together with that plugin in the same backend instance. Modules may only communicate with their plugin or other modules through the registered extension points." (01-index); "may only extend a single plugin" (06-modules).
- Init ordering: "all modules for each plugin are completely initialized before the plugin itself is initialized." (06-modules) and "all modules that extend our plugin will be completely initialized before our plugin gets initialized." (05-extension-points)
- Dependency direction: "Plugin extension points should always be exported from a plugin node library package, for example `@backstage/plugin-catalog-node`. This is to allow for modules to avoid a direct dependency on the plugin". "It is however often better to export multiple extension points with few methods, rather than few extension points with many methods, as that tends to be easier to maintain."
- API: `createExtensionPoint<ScaffolderActionsExtensionPoint>({ id: 'scaffolder.actions' })`, `env.registerExtensionPoint(...)`, `createBackendModule({ pluginId: 'catalog', moduleId: ..., register(env) {...} })`.
- Failure attribution: "In some cases, you may want to be able to attribute startup failures to modules that provided an extension, rather than failing the plugin startup entirely. To do this, you can use a variant of `registerExtensionPoint` that ... registers a factory function" (receives `reportModuleStartupFailure`).
- Multiton services (03-services): "For some services, it is desirable to extend the functionality instead of overriding it. For example, some services could have many handlers to address specific events, and you may want to add a new handler instead of overriding the previous one. In this case, you can use the `multiton` option" ... `multiton: true, // this service ref will be an array of instances`.
- Optional dependencies in the backend: I found no `optional` flag on backend `ServiceRef`/deps in `packages/backend-plugin-api/src/services/system/types.ts` or `src/wiring/*.ts` (master, 2026-10-15; grep for "optional" returned 0 hits). So: UNVERIFIED that backend deps support optional; evidence suggests they do not.

Frontend system (https://backstage.io/docs/frontend-system/architecture/extensions):
- "Backstage apps are built up from a tree of extensions."
- Output: "The output of an extension is the data that it provides to its parent extension, and ultimately its contribution to the app."
- Inputs: "The inputs of an extension define the data that it received from its children. ... An extension will only have access to the data that it has explicitly requested from each input."
- Attachment point: "It is defined by the ID of the parent extension, as well as the name of the input to attach to. Through the attachment point the extension will share its own output as inputs to the parent extension." / "Extensions can also only be attached to a single input and parent at a time. This means that the app extension tree can not contain any cycles".
- Direction: "Communication between extensions happens in one direction, from one child extension through the attachment point to its parent. The child extension outputs data which is then passed as inputs to the parent extension."
- Factory order: "it will call the factory function of each extension that is part of the app, starting at leaf nodes and working its way up to the root of the app extension tree." / "Extension factories should be lean and not do any heavy lifting or async work".
- Cardinality: `createExtensionInput([coreExtensionData.reactElement], { singleton: true, optional: true })`; "If the `singleton: true` option is set, only a single extension can be attached at a time, and unless the `optional: true` option is set it will also be required that there is exactly one attached extension." (default input = many). Also `internal: true` restricts to the same plugin.
- Static, not live: "Conditions are evaluated when the app tree is prepared, not continuously while the app is running. If the underlying feature flags or permissions change, the app needs to be prepared again in order for the extension tree to change, which in practice typically means reloading the app."
- Utility APIs (https://backstage.io/docs/frontend-system/architecture/utility-apis): "They are defined by a TypeScript interface as well as a reference (an "API ref") used to access its implementation." `createApiRef<WorkApi>({...})`. Optional consumption: "The `useApi` hook always returns a value, or throws an exception if the API ref could not be resolved to a registered implementation. For advanced use cases, where you explicitly want to optionally request a utility API that may or may not have been provided at runtime, you can use the underlying `useApiHolder` hook instead." (utility-apis/consuming)

---

## D9. NestJS event-emitter, CQRS; MediatR

NestJS `@nestjs/event-emitter` (docs: nestjs/docs.nestjs.com master `content/application/events.md`, https://docs.nestjs.com/techniques/events); npm 12.0.1 (2026-09-14).
- "provides an observer implementation that lets you subscribe to and listen for events ... Events are a good way to decouple different parts of your application, since a single event can have multiple listeners that don't depend on each other."
- "`EventEmitterModule` internally uses the [eventemitter2] package." (npm eventemitter2 latest 6.4.9, published 2022-09-12 - a maintenance signal.)
- Listener options: `suppressErrors` - "If "true", errors thrown by the onEvent callback are logged instead of rethrown. If "false", they are rethrown." `@default true`. `@OnEvent('order.created', { async: true })` for async listeners.
- Pitfall (lost events): "Events emitted before or during the `onApplicationBootstrap` lifecycle hook (for example, from constructors or `onModuleInit()` methods) may be missed, because the listeners might not be registered yet." Mitigation `EventEmitterReadinessWatcher.waitUntilReady()`.
- Wildcards: "A single wildcard matches exactly one segment."

NestJS `@nestjs/cqrs` (docs `content/recipes/cqrs.md`, https://docs.nestjs.com/recipes/cqrs); npm 12.1.0 (2026-09-29).
- "The `CommandBus` represents a **stream** of commands. It dispatches commands to the appropriate handlers. The `execute()` method returns a promise that resolves to the value returned by the handler."
- "Events notify other parts of the application about changes in the application state." / "Each event can have multiple **event handlers**."
- Errors: "Errors thrown in event handlers can't be caught by exception filters, so you have to handle them yourself". Module option `rethrowUnhandled`: "Whether exceptions thrown by event handlers and sagas are rethrown instead of being published to the `UnhandledExceptionBus`." default `false`.
- Default publisher does not wait: "The default in-memory publisher returns nothing, as it doesn't wait for the event handlers."
- Sagas: "A saga is a long-running process that listens to events and may trigger new commands." / "Each saga returns an `Observable` that emits command instances. Each emitted command is then dispatched **asynchronously** by the `CommandBus`."

MediatR (.NET; repo now https://github.com/LuckyPennySoftware/MediatR; NuGet latest 14.2.0; README requires a license key: "You can set the license key when registering MediatR").
- Wiki (https://github.com/LuckyPennySoftware/MediatR/wiki): "MediatR (starting with version 12) supports custom publish strategies" via `INotificationPublisher`. Built-ins: "`ForeachAwaitPublisher` - the default, existing implementation" and "`TaskWhenAllPublisher` - awaits `Task.WhenAll` for all notification handler tasks. Does NOT use `Task.Run`". "Custom notification publishers can also use the handler instance to do custom logic like ordering, skipping handlers, etc."
- Source `ForeachAwaitPublisher.cs`: "Awaits each notification handler in a single foreach loop" with plain `await handler.HandlerCallback(...)` and no try/catch. Inference from source (not stated in docs): a throwing handler stops later handlers and the exception propagates to `Publish`.

---

## D10. Anti-pattern evidence: hidden event flows, global bus, two-way binding

Martin Fowler, "What do you mean by "Event-Driven"?", 07 February 2017, https://martinfowler.com/articles/201701-event-driven.html
- Event Notification: "This happens when a system sends event messages to notify other systems of a change in its domain. A key element of event notification is that the source system doesn't really care much about the response."
- Pitfall: "Event notification is nice because it implies a low level of coupling, and is pretty simple to set up. It can become problematic, however, if there really is a logical flow that runs over various event notifications. The problem is that it can be hard to see such a flow as it's not explicit in any program text. Often the only way to figure out this flow is from monitoring a live system. This can make it hard to debug and modify such a flow."
- "The danger is that it's very easy to make nicely decoupled systems with event notification, without realizing that you're losing sight of that larger-scale flow, and thus set yourself up for trouble in future years."
- Passive-aggressive command: "This happens when the source system expects the recipient to carry out an action, and ought to use a command message to show that intention, but styles the message as an event instead."
- Event-Carried State Transfer: "This pattern shows up when you want to update clients of a system in such a way that they don't need to contact the source system in order to do further work." Downsides: "lots of data schlepped around and lots of copies" and "it does involve more complexity on the receiver, since it has to sort out maintaining all the state".
- Event Sourcing: "whenever we make a change to the state of a system, we record that state change as an event, and we can confidently rebuild the system state by reprocessing the events at any time in the future." / "There's no need for event processing to be asynchronous".
- CQRS: "the notion of having separate data structures for reading and writing information." / "I find many of my colleagues are deeply wary of using CQRS, finding it often misused."
- Async: "lots of asynchronous communications, certainly a known complexity-booster".

Vue 3 migration guide, Events API (https://v3-migration.vuejs.org/breaking-changes/events-api.html):
- "`$on`, `$off` and `$once` instance methods are removed. Component instances no longer implement the event emitter interface."
- "`$emit` is still a part of the existing API as it's used to trigger event handlers declaratively attached by a parent component."
- "In most circumstances, using a global event bus for communicating between components is discouraged. While it is often the simplest solution in the short term, it almost invariably proves to be a maintenance headache in the long term."
- Alternatives listed: "Props and events should be your first choice for parent-child communication. Siblings can communicate via their parent." / "Provide / inject can also be used for long-distance communication between components." / slots / "Global state management ... such as Pinia".

Flux (facebookarchive/flux, archived; https://facebookarchive.github.io/flux/docs/in-depth-overview):
- "Flux eschews MVC in favor of a unidirectional data flow."
- "These dependencies and cascading updates often occur in a large MVC application, leading to a tangled weave of data flow and unpredictable results."
- "We found that two-way data bindings led to cascading updates, where changing one object led to another object changing, which could also trigger more updates. As applications grew, these cascading updates made it very difficult to predict what would change as the result of one user interaction. When updates can only change data within a single round, the system as a whole becomes more predictable."
- "there are no two-way bindings" / "Where dependencies do occur between stores, they are kept in a strict hierarchy, with synchronous updates managed by the dispatcher."
- Enforcement in `src/Dispatcher.js`: `'Dispatch.dispatch(...): Cannot dispatch in the middle of a dispatch.'` and `'Dispatcher.waitFor(...): Circular dependency detected while '`.

Redux Three Principles (https://redux.js.org/understanding/thinking-in-redux/three-principles):
- "Single source of truth"; "State is read-only": "The only way to change the state is to emit an action, an object describing what happened." / "Because all changes are centralized and happen one by one in a strict order, there are no subtle race conditions to watch out for."; "Changes are made with pure functions".

Elm guide (evancz/guide.elm-lang.org master):
- Architecture (https://guide.elm-lang.org/architecture/): "**Model** — the state of your application", "**View** — a way to turn your state into HTML", "**Update** — a way to update your state based on messages".
- Subscriptions (https://guide.elm-lang.org/effects/time.html): `subscriptions : Model -> Sub Msg`; "That is the basic pattern of any subscription. You give some configuration, and you describe how to produce `Msg` values." (subscriptions are a function of the model, i.e. declarative)
- Structure (https://guide.elm-lang.org/webapps/structure.html): "**Actively trying to make components is a recipe for disaster in Elm.** The root issue is that components are objects" / "writing a `viewSidebar` function **does not** mean you need to create a corresponding `update` and `Model` to go with it. Resist this instinct."

Angular / AngularJS (why child-to-parent mutation and two-way cascades were constrained):
- Angular NG0100 (angular/angular main `adev/src/content/reference/errors/NG0100.md`, https://angular.dev/errors/NG0100): "In development mode, Angular performs an additional check after each change detection run, to ensure the bindings haven't changed. ... This can occur, for example, if a method or getter returns a different value each time it is called, or if a child component changes values on its parent. If either of these occurs, this is a sign that change detection is not stabilized."
- AngularJS `$rootScope:infdig` (angular/angular.js master docs): "This error occurs when the application's model becomes unstable and each `$digest` cycle triggers a state change and subsequent `$digest` cycle." Example: "setting up a watch on a path and subsequently updating the same path when the value changes."
- A primary-source statement from the Angular team explaining *why* AngularJS-style two-way binding was abandoned: NOT FOUND in this session (searches returned only third-party blogs: angularindepth.com, angular.love, auth0.com). UNVERIFIED.

"Event soup" as a named anti-pattern from an authoritative source: NOT FOUND (UNVERIFIED). Counterpoint found: AWS Prescriptive Guidance, micro-frontends (https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/cross-interactivity.html): a shared Redux store "creates significant coupling between applications, resulting in code that is harder to test" and "One common, effective approach is to develop an event bus that's distributed as a library, orchestrated by the application shell" with "a shared wiki page that describes events and documents behaviors". I.e., at independently deployed boundaries a documented, shell-owned bus is recommended over shared state.

---

## D11. Comparison table (facts from above)

| System | Registration shape | Who knows whom | Ordering | One listener throws |
|---|---|---|---|---|
| OSGi whiteboard + DS | listener registered as service; source gets `List<Listener>` (0..n) | source knows only the interface | not specified by the pattern | not specified by the pattern |
| OSGi Event Admin | handler service + `EVENT_TOPIC` | publisher knows topic only | async: per-handler in post order (default) | caught, logged, delivery continues; misbehaving handlers may be deny listed |
| Eclipse extension points | XML in plugin.xml; owner reads registry | owner defines point; contributor declares extension | n/a (pull) | n/a |
| VS Code | `contributes` JSON + `activationEvents`; `exports` API | contributor declares `extensionDependencies` | n/a | n/a |
| Tapable | `tap/tapAsync/tapPromise`; owner `call/callAsync/promise` | hook owner exposes hooks | registration order, `stage`, `before` | AsyncSeries: first error aborts; AsyncParallel: error forwarded, others finish |
| Rollup/Vite | plugin object hooks | Rollup core owns hooks; plugins may expose `api` | plugin order + `order: pre/post`; Vite `enforce` | `this.error` aborts the build |
| Fastify | `register`, `addHook`, `decorate` | child sees ancestors; parent never sees descendants | onReady serial; onClose child before parent | n/a (not researched) |
| Backstage backend | extension point (plugin registers impl, modules call it); multiton service refs | module -> one plugin only; plugins never talk in code | all modules init before plugin | factory variant attributes startup failure to a module |
| Backstage frontend | child `attachTo` parent input; inputs singleton/optional/many | data flows child -> parent at build time only | leaf-first factory calls | n/a |
| Nest event-emitter | `@OnEvent` decorator, string topics | topic only | eventemitter2 order (append/prepend) | default `suppressErrors: true` (logged) |
| Nest CQRS | handlers per event class | bus | default publisher does not wait | published to `UnhandledExceptionBus` by default |
| MediatR | `INotificationHandler<T>` via DI | mediator | ForeachAwait sequential | (source-inferred) ForeachAwait: propagates, later handlers skipped |

---

## My assessment:

1. The Get Modular shape "a module provides a listener capability; the source module collects it through a `many()` slot" is the OSGi whiteboard pattern almost literally (the paper's DS example is `@Reference List<ContentProvider>`), and DS cardinalities `1..1 / 0..1 / 0..n` map one-to-one onto `required() / optional() / many()`. Get Modular's static composition corresponds to DS's default static reference policy, so the dynamic-lifecycle benefits are mostly moot, but the remaining benefits still hold: no subscribe/unsubscribe code in modules (no leaks), the source never learns who listens, and listeners are visible in the composition graph (the paper's "Debugging" benefit). Using the name "whiteboard" in docs is accurate; in user-facing API names I would not use it (it is niche outside OSGi).
2. "Child contributes to parent" at composition time is not an anti-pattern; it is the mainstream plugin mechanism (Eclipse extension points, VS Code contribution points, Backstage `attachTo`/inputs, Backstage extension points, OSGi whiteboard). What the industry rejects is runtime mutation of parent state by a child and two-way cascades (Flux cascading updates, Angular NG0100, AngularJS infdig). Backstage's frontend states both halves explicitly: data flows child -> parent through inputs, and the tree is prepared once, not continuously.
3. For distant modules, the evidence ranks: (a) a typed, declared dependency on a capability (Rollup `api`, Backstage ApiRef/extension point, VS Code `exports` + `extensionDependencies`), optional where the consumer can degrade (Rollup comment "or handle this silently if it is optional", Backstage `useApiHolder`); (b) whiteboard/`many()` for one-to-many notification; (c) a topic bus only where the parties are truly independent and the event contracts are documented (AWS micro-frontends guidance, OSGi Event Admin). Fowler's "not explicit in any program text" warning applies to (c) and not to (a) or (b), because in (a)/(b) the edge is in the composition graph.
4. Every surveyed system had to decide hook *kind* explicitly (notify-all, first-wins/bail, waterfall, series vs parallel) and *error policy* explicitly, and they differ (Event Admin catch-log-continue; Tapable series abort; Nest suppress by default; MediatR propagate). A Get Modular contract should declare these per hook/event rather than leaving them implicit. Tapable/Rollup kind names (`first`, `sequential`, `parallel`, `waterfall`, `bail`) are the most recognizable vocabulary in the JS ecosystem.
5. Lost-event pitfalls appear in both Fastify ("otherwise, the event is lost") and Nest ("may be missed, because the listeners might not be registered yet"). Static composition with a `many()` slot resolved before activation avoids this class by construction, similar to Backstage's "all modules ... initialized before the plugin".
6. Backstage's backend rule "modules may only extend a single plugin" plus extension points published from a separate `-node` package is a strong precedent for dependency direction: contributors depend on a small contract package owned by the extended module, never on its implementation.
