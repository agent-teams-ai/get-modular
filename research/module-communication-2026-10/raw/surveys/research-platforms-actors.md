# Коммуникация модулей: иерархические рантаймы, акторы, мобильные, десктоп, игры и плагинные платформы

Дата: 2026-10-15. Задача: проверенный обзор индустрии для Get Modular (GM) по вопросу владельца "как модули общаются: родитель -> ребёнок, ребёнок -> родитель, соседи и дальние модули; лучшие и худшие практики".

Метод. Первоисточники (официальная документация, исходный код, сообщения мейнтейнеров) скачивались напрямую (curl, GitHub API, gitiles, drupal.org api-d7) и цитаты брались из сырого текста через grep. Все цитаты ниже короткие и дословные, со ссылкой. Где текст получен только через пересказ поисковика, это помечено как UNVERIFIED. Мои собственные выводы вынесены в блоки "Моя оценка:".

Не повторяю то, что уже покрыто прошлым отчётом (Vue, React, Angular, Fastify, IntelliJ Message Bus, Redux/Flux/Elm, Kubernetes, VS Code events, .NET IOptionsMonitor, Spring Cloud refresh, OSGi, Tapable, Rollup, Backstage, NestJS, MediatR, signals).

Версии на момент сбора:

| Система | Версия / дата источника |
|---|---|
| Erlang/OTP | документация OTP 29.1.2 (kernel 11.0.4) |
| Apache Pekko (форк Akka 2.6) | документация 1.7.1; тексты унаследованы от Akka (в футере "Copyright © 2011-2022 Lightbend") |
| XState | npm `xstate` 5.33.2 (2026-10-14), docs repo `statelyai/docs` main (push 2026-10-12) |
| The Composable Architecture | 1.26.2 (релиз 2026-08-28), DocC в main |
| Riverpod | `flutter_riverpod` 3.4.3 (2026-09-03), docs в `rrousselGit/riverpod` master |
| Flutter | docs.flutter.dev и api.flutter.dev на 2026-10-15 |
| Android | modularization patterns "Last updated 2026-03-05", fragments communicate "Last updated 2026-02-26", Now in Android main |
| Hilt | dagger.dev/hilt на 2026-10-15 |
| Prism | Developer's Guide to Prism Library 5.0 for WPF (learn.microsoft.com) и текущий prismlibrary.github.io |
| Qt | документация Qt 6.12 |
| Eclipse 4 | wiki.eclipse.org Event Model, статьи Vogella |
| Unreal Engine | текущие страницы dev.epicgames.com (версия в тексте страницы не указана); Gameplay Message Subsystem из публичного зеркала кода Lyra |
| Unity | unity.com how-to; Entities 1.4 manual |
| Bevy | 0.20.0 (crates.io, 2026-10-08), исходники по тегу v0.20.0 |
| WordPress | developer.wordpress.org на 2026-10-15 |
| Drupal | change records 11.1.0, 11.2.0, 11.3.0; policy issue #3492506 |
| Chromium | `chromium/src` main на 2026-10-15 |
| Firefox | `mozilla-firefox/firefox` main на 2026-10-15 |
| Linux | `torvalds/linux` master на 2026-10-15; LWN 2013 |

---

## 0. Короткий итог

1. Почти все зрелые иерархические рантаймы пришли к одной схеме: **родитель передаёт ребёнку конфигурацию и зависимости при создании, а ребёнок говорит "наверх" только через явно переданный ему адрес или порт, а не через неявный доступ к родителю**. Самый показательный факт: в Akka Typed `context.parent` убрали намеренно, а XState v5 рекомендует вместо `sendParent` передавать ссылку на родителя через `input`.
2. **Ребёнок не меняет состояние родителя напрямую.** Он сообщает о намерении (delegate actions в TCA, callbacks во Flutter, сигналы в Qt), и решение принимает владелец состояния. Если запись всё же нужна, владелец явно разрешает её (`declareModifiable` в Eclipse 4, `withLock` и `SharedReader` в TCA).
3. **Соседи общаются через типизированный контракт соседа без циклов**, а при двусторонней связи через посредника у общего родителя (Android modularization, Now in Android api/impl, shared ViewModel со scope родителя, "Repositories should never be aware of each other" во Flutter).
4. **Глобальная шина со строковыми топиками и числовыми приоритетами** признана проблемой в каждой долгоживущей экосистеме: Linux (Линус: "Notifiers are a disgrace"), Eclipse 4 ("global bus with no scoping of events"), WordPress (`PHP_INT_MAX`, молчаливые ошибки `remove_action`), Firefox (сильные ссылки по умолчанию и встроенный детектор утечек), Unreal (порядок слушателей "not guaranteed", несовпадение типа payload ловится только в рантайме).
5. **Порядок слушателей**: системы либо прямо говорят "порядок не определён, не полагайтесь" (Unreal, Bevy, Lyra), либо выносят порядок в явный статический список (Linux CPU hotplug state machine, Drupal `Order::First/Last/OrderBefore`). Числовые приоритеты везде описаны как источник проблем.
6. **Время жизни подписки привязано к владельцу**: Qt рвёт соединения при уничтожении объекта, Erlang `pg` и Akka Receptionist удаляют завершившихся участников, `gen_event:add_sup_handler` удаляет обработчик вместе с подписчиком, Bevy удаляет observer вместе с последней целью. Там, где этого нет, появляются утечки (Firefox, .NET events, ScriptableObject-каналы).

---

## 1. Erlang/OTP

### Родитель -> ребёнок
- Супервизор запускает детей по списку child specs в заданном порядке и останавливает в обратном: "The child processes are started in the order specified by this list, and are terminated in the reverse order." ([OTP: Supervisor Behaviour](https://www.erlang.org/doc/system/sup_princ.html))
- Конфигурация передаётся только через аргументы старта: "start defines the function call used to start the child process. It is a module-function-arguments tuple used as apply(M, F, A)." (там же)
- Родитель задаёт и политику перезапуска: `one_for_one`, `one_for_all`, `rest_for_one`. Для `rest_for_one`: "the child processes after the terminated process in start order are terminated. Subsequently, the terminated child process and the remaining child processes are restarted." (там же). Это фактически декларация зависимостей "поздние дети зависят от ранних".

### Ребёнок -> родитель
- Обычные данные идут ответами на запросы (`gen_server:call`) или сообщениями на адрес, который ребёнку передали. Отдельного "доступа к родителю" нет.
- Сбой идёт сигналом выхода по link, а не бизнес-сообщением: "If one of the participants of a link terminates, it will send an exit signal to the other participant." и "Links are bidirectional and there can only be one link between two processes." ([OTP: Processes](https://www.erlang.org/doc/system/ref_man_processes.html))
- Однонаправленное наблюдение через monitor: "Monitors are unidirectional." и при завершении приходит `{'DOWN', Ref, process, Pid2, Reason}` (там же).
- Философия "let it crash" из диссертации Джо Армстронга (2003): "Let some other process do the error recovery.", "If you can't do what you want to do, die.", "Let it crash.", "Do not program defensively." ([Armstrong thesis, раздел 4.3-4.4](https://erlang.org/download/armstrong_thesis_2003.pdf))

### Соседи и дальние процессы
- Локальные имена: "register(Name, Pid) Associates the name Name, an atom, with the process Pid." ([OTP: Processes](https://www.erlang.org/doc/system/ref_man_processes.html)). Это глобальное пространство имён атомов на узле.
- Группы процессов `pg`: "There are no special functions for sending a message to the group. Instead, client functions are to be written with the functions get_members/1 and get_local_members/1..." и "If a member terminates, it is automatically removed from the group." ([kernel: pg](https://www.erlang.org/doc/apps/kernel/pg.html))
- Изоляция пространств: "Process groups can be organised into multiple scopes. Scopes are completely independent of each other." Подписка на изменения состава: `pg:monitor/2` "(since OTP 25.1)". Согласованность: "Process Groups implement strong eventual consistency." (там же)

### Порядок, изоляция, утечки
- Пределы перезапусков перемножаются по уровням дерева: "the total number of restarts (before the top level supervisor gives up and terminates the application) will be the product of the intensity values of all the supervisors above the failing child process." и пример "a crashing child below that level will be restarted 100 times, which is probably excessive." ([sup_princ](https://www.erlang.org/doc/system/sup_princ.html))
- Шина событий `gen_event` изолирует падающий обработчик: "the event manager does not fail. It deletes the event handler ... No other event handler is affected." ([stdlib: gen_event](https://www.erlang.org/doc/apps/stdlib/gen_event.html)). Удаление при этом тихое, если обработчик не добавлен через `add_sup_handler`, который "supervises the connection by linking the event handler and the calling process" и при удалении присылает `{gen_event_EXIT,Handler,Reason}` (там же).

### Уроки
- Поток "вниз" это только аргументы старта. Поток "вверх" это ответы и сигналы жизненного цикла. Состояние не разделяется.
- Порядок старта и остановки задан статически и симметрично.
- Ошибка подписчика не ломает остальных, но тихое удаление обработчика без уведомления является ловушкой. В OTP для этого и добавили supervised handler.

---

## 2. Akka / Apache Pekko

Ссылки ведут на документацию Pekko 1.7.1. Тексты унаследованы от Akka (Pekko является форком Akka 2.6). Отдельной официальной страницы "Akka anti-patterns" на doc.akka.io я не нашёл. Официальные рекомендации разбросаны по "Actor Best Practices", "Style guide" и "Fault Tolerance".

### Родитель -> ребёнок
- Иерархия: "One actor, which is to oversee a certain function in the program might want to split up its task into smaller, more manageable pieces. For this purpose, it starts child actors." ([Actor Systems](https://pekko.apache.org/docs/pekko/current/general/actor-systems.html))
- Данные идут через параметры фабрики `Behavior` при `spawn` и через сообщения на `ActorRef` ребёнка, который родитель получает при создании.
- Время жизни: "The lifecycle of a child actor is tied to the parent – a child can stop itself or be stopped at any time but it can never outlive its parent." ([Actor lifecycle](https://pekko.apache.org/docs/pekko/current/typed/actor-lifecycle.html))

### Ребёнок -> родитель
- **В Typed нет `context.parent`, и это осознанное решение**: "There is no parent in Typed. Instead you have to explicitly include the ActorRef of the parent as a parameter when constructing the Behavior." Причина: "it wouldn't be possible to know the type for the parent ActorRef[T] at compile time ... For testing purposes it's also better to pass in the parent since it can be replaced by a probe or being stubbed out in tests." ([Learning Pekko Typed from Classic](https://pekko.apache.org/docs/pekko/current/typed/from-classic.html))
- Чтобы ребёнок не знал протокол родителя, используются message adapters: "Most often the sending actor does not, and should not, support receiving the response messages of another actor." ([Interaction Patterns: Adapted Response](https://pekko.apache.org/docs/pekko/current/typed/interaction-patterns.html))
- Сбой отделён от протокола: "A validation error means that the data of a command sent to an actor is not valid, this should rather be modelled as a part of the actor protocol than make the actor throw exceptions." и "A failure is instead something unexpected ... it is seldom useful to model failures as part of the protocol" ([Fault Tolerance](https://pekko.apache.org/docs/pekko/current/typed/fault-tolerance.html))
- Всплытие сбоя: "If the child was stopped because of a failure the ChildFailed signal will be received which will contain the cause." и "the original exception that caused the failure will only be available to the immediate parent out of the box (this is most often a good thing, not leaking implementation details)." (там же)

### Соседи и дальние акторы
- Предпочтение явным ссылкам: "There are two general ways to obtain Actor references: by creating actors and by discovery using the Receptionist." Receptionist нужен, "When an actor needs to be discovered by another actor but you are unable to put a reference to it in an incoming message". ([Actor discovery](https://pekko.apache.org/docs/pekko/current/typed/actor-discovery.html))
- Ключи типизированы: `ServiceKey[Ping]("pingService")`. Записи живут вместе с актором: "Entries are removed when registered actors are stopped, manually deregistered or the node they live on is removed from the Cluster." (там же)
- Поиск по пути убрали: "ActorSelection isn't supported in Typed. Instead the Receptionist is supposed to be used for finding actors by a registered key." ([from-classic](https://pekko.apache.org/docs/pekko/current/typed/from-classic.html))
- Глобальная шина существует, но в основном для служебных событий: "The event stream is the main event bus of each actor system: it is used for carrying log messages and Dead Letters and may be used by the user code for other purposes as well." ([Classic Event Bus](https://pekko.apache.org/docs/pekko/current/event-bus.html))

### Порядок, изоляция, утечки
- "Do not pass mutable objects between actors. In order to ensure that, prefer immutable messages." ([Actor Systems](https://pekko.apache.org/docs/pekko/current/general/actor-systems.html))
- "If one actor depends on another actor for carrying out its duty, it should watch that other actor's liveness and act upon receiving a termination notice." (там же)
- Глобальный порядок не обещается: "the exact order in which messages are processed in large systems is not controllable by the application author, but this is also not intended." (там же)
- Корень должен только собирать подсистемы: "The top-level actor of the actor system is the innermost part of your Error Kernel, it should only be responsible for starting the various sub systems of your application" (там же)

### Сторонняя критика (не официальная документация)
- Доклад Manuel Bernhardt "8 Akka anti-patterns you'd better be aware of" (Reactive Summit 2017, Scala Days 2017). По пересказу поисковика: #1 "global mutable state", #2 "flat actor hierarchies". Полный текст слайдов я не открывал, поэтому это UNVERIFIED. ([slides](https://www.slideshare.net/slideshow/8-akka-antipatterns-youd-better-be-aware-of-reactive-summit-austin-2017/81054341))

---

## 3. XState v5

### Родитель -> ребёнок
- Данные ребёнку передаются через `input` при `invoke` или `spawn`. Для invoke: "The invoked actor will start when the state is entered, and stop when the state is exited." ([Invoke](https://stately.ai/docs/invoke), исходник `content/docs/invoke.mdx`)
- Команды ребёнку идут через `sendTo(childId или ref, event)`. Для spawned: "A spawned actor is started in a transition and stopped either with a stop(...) action or when its parent machine is stopped." ([Actors](https://stately.ai/docs/actors))

### Ребёнок -> родитель
- `sendParent` существует и в исходниках не помечен `@deprecated` (проверено в `packages/core/src/actions/send.ts`), но документация советует так не делать: "Prefer sendTo(...): pass actor refs (such as the parent actor ref) to other actors via input or events, then store them in context. This avoids tight coupling and can be more type-safe than sendParent(...)." ([Actions: send-parent](https://stately.ai/docs/actions))
- Promise-, observable- и callback-акторы сообщают о завершении через `onDone` и `onError`, а callback-акторы через `sendBack`. Об ошибках внутри колбэка: "You may choose to use sendBack to report caught errors to the parent actor." ([Actors](https://stately.ai/docs/actors))
- Для внешних слушателей есть `emit` "Since XState version 5.9.0". Подписка `actor.on(...)` "returns a subscription object. You can call .unsubscribe() on it" ([Event emitter](https://stately.ai/docs/event-emitter))

### Соседи и дальние акторы
- Реестр системы: "Actors can be registered with the system so that any other actor in the system can obtain a reference to it." Доступ через `system.get('actorId')`. ([Systems](https://stately.ai/docs/system))
- Ключ `systemId` строковый, дубли падают в рантайме: в `packages/core/src/system.ts` есть `throw new Error(`Actor with system ID '${systemId as string}' already exists.`)`.
- Модель акторов в их формулировке: "Actors do not share state. The only way for an actor to share data is by sending events." и "processing events one at a time." ([Actor model](https://stately.ai/docs/actor-model))
- Остановка: "Stop from root actor: actor.stop()" и "Cannot stop from descendant actors" ([Systems](https://stately.ai/docs/system))

### Уроки
- Тот же вывод, что в Akka Typed: путь наверх передаётся явно. Неявный `sendParent` оставлен для удобства, но официально не рекомендуется.
- Реестр по строковому ID удобен, но это глобальное пространство имён внутри системы, и ошибка обнаруживается только в рантайме.

---

## 4. The Composable Architecture (Swift TCA)

### Родитель -> ребёнок
- Родитель встраивает редьюсер ребёнка через `Scope`: "Scope allows you to transform a parent domain into a child domain, and then run a child reduce on that subset domain." ([Scope.swift](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Reducer/Reducers/Scope.swift))
- **Порядок важен, и библиотека его проверяет**: "It must be combined before the additional logic. In the other order it would be possible for the feature to intercept a child action, switch the state to another case, and then the scoped child reducer would not be able to react to that action. That can cause subtle bugs, and so we show a runtime warning in that case, and cause test failures." (там же)
- Команда ребёнку через action дороже вызова метода: родитель может сделать `return .send(.child(.refresh))`, но "this is not the most efficient way to communicate to a child. If performance is a concern, consider extracting the shared logic to helpers that can be invoked from either domain." ([Performance](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/Performance.md))

### Ребёнок -> родитель: delegate actions
- Официальный туториал называет подглядывание родителя в действия ребёнка нежелательным: родитель, который инспектирует действия ребёнка, "may lead to the parent making assumptions about what logic it should perform when something happens in the child feature." Лучше "so-called "delegate actions" for the child feature to directly tell the parent what it wants done." ([Tutorial: Your first presentation](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Tutorials/MeetTheComposableArchitecture/02-Navigation/01-YourFirstPresentation/02-01-YourFirstPresentation.tutorial))
- Ребёнок не обрабатывает свои delegate-действия: "we should never actually perform any logic in this case. Only the parent should listen for delegate actions and respond accordingly." (там же)
- Статус: "Delegate actions are the most general way of communicating from the child domain back to the parent, but there are other techniques." (там же)

### Общее состояние (`@Shared`) и его оговорки
- Определение: "Sharing state is the process of letting many features have access to the same data so that when any feature makes a change to this data it is instantly visible to every other feature." ([SharingState](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/SharingState.md))
- Ссылочная природа даёт гонки: "shared state is technically a reference deep down ... it's possible to mutate the same piece of shared state from multiple threads, and hence race conditions are possible." Запись идёт через `state.$count.withLock { $0 += 1 }`. (там же)
- Для чтения без записи есть `@SharedReader`: "if you try to mutate the state you will get a compiler error" (там же)
- Отдельный раздел "Gotchas of @Shared" (hashability, codability, tests). Пример: "types containing @Shared properties should not compute their hashes from shared values." (там же)
- Критика "единого источника правды": "applications typically do not have a single source of truth. That is far too simplistic." (там же)

### Анти-паттерны из их документации
- Общая логика через цепочку actions: "This is an inefficient way to share logic." и "this style of sharing logic is not very flexible ... it must always be run after the initial logic." ([Performance](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/Performance.md))
- "Ping-ponging" действий признан как цена модели ([FAQ](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/FAQ.md)).

---

## 5. Flutter: InheritedWidget, InheritedModel, Provider/Riverpod, callbacks

### Родитель -> потомки
- "Base class for widgets that efficiently propagate information down the tree." Потребитель подписывается через `dependOnInheritedWidgetOfExactType` и "will ... rebuild when the inherited widget itself changes state." ([InheritedWidget](https://api.flutter.dev/flutter/widgets/InheritedWidget-class.html))
- Решение об уведомлении принимает провайдер через `updateShouldNotify(old)` (пример `color != oldWidget.color`, там же).
- Узкие подписки через `InheritedModel`: "An inherited widget's dependents are unconditionally rebuilt when the inherited widget changes", а у `InheritedModel` зависимые перестраиваются "only if there was a change in the model that corresponds to the aspect they provided." ([InheritedModel](https://api.flutter.dev/flutter/widgets/InheritedModel-class.html))

### Ребёнок -> родитель
- Официальный базовый путь это поднять состояние наверх и передать callback: "it makes sense to keep the state above the widgets that use it", и "A simple option is to provide a callback that MyListItem can call when it is clicked." ([Simple app state management](https://docs.flutter.dev/data-and-backend/state-mgmt/simple))
- Императивное изменение чужого виджета прямо запрещено: пример помечен "// BAD: DO NOT DO THIS" с `cartWidget.updateWith(item)`. (там же)
- Ограничение callbacks на масштабе: "for an app state that you need to modify from many different places, you'd have to pass around a lot of callbacks—which gets old pretty quickly." (там же)

### Соседи и дальние части (архитектурный гайд Flutter)
- "Repositories should never be aware of each other. If your application has business logic that needs data from two repositories, you should combine the data in the view model or in the domain layer" ([App architecture guide](https://docs.flutter.dev/app-architecture/guide))
- "Use unidirectional data flow." (Strongly recommend) и "Data updates should only flow from the data layer to the UI layer." ([Recommendations](https://docs.flutter.dev/app-architecture/recommendations))
- "Immutable data is crucial in ensuring that any necessary changes occur only in the proper place" (там же)

### Riverpod (Ремi Руссле, автор Provider и Riverpod)
- Декларативная зависимость между провайдерами: "Ref.watch is Riverpod's defining feature. It enables combining providers together seamlessly" и "Using Ref.watch is similar to using an InheritedWidget in Flutter." ([Refs](https://riverpod.dev/docs/concepts2/refs), исходник `website/docs/concepts2/refs.mdx`)
- Побочные эффекты отдельно: `Ref.listen` "is useful when you want to perform a side-effect when a provider's state changes, such as Showing a dialog, Navigating ..." (там же)
- Против "оптимизации" чтением без подписки: "Do not use Ref.read as a mean to "optimize" your code by avoiding Ref.watch. This will make your code more brittle ... Either use Ref.watch anyway (as the difference is negligible) or use select" (там же)
- Очистка: "You do not need to "unregister" these listeners. Riverpod automatically cleans them up when the provider is reset." (там же)
- DO/DON'T ([do_dont](https://riverpod.dev/docs/root/do_dont)):
  - "Providers should initialize themselves. They should not be initialized by an external element such as a widget. Failing to do so could cause possible race conditions and unexpected behaviors."
  - "AVOID using providers for Ephemeral state."
  - "DON'T perform side effects during the initialization of a provider"
  - "PREFER ref.watch/read/listen (and similar APIs) with statically known providers", потому что lint работает только на статически анализируемом коде.
  - "AVOID dynamically creating providers" и "Providers should exclusively be top-level final variables."
- Scoping сам автор называет сложным местом: "The scoping feature is highly complex and will likely be reworked in the future to be more ergonomic. Thread carefully." Scope включается только явно: "By default, Riverpod will not allow you to scope a provider. You need to opt-in to this feature by specifying dependencies on the provider." ([Scoping](https://riverpod.dev/docs/concepts2/scoping))

---

## 6. Android: модуляризация, фрагменты, Hilt

### Межмодульная связь (официальный гайд)
- Низкая связность: "Modules shouldn't have knowledge of the inner workings of other modules." ([Common modularization patterns](https://developer.android.com/topic/modularization/patterns))
- Циклы запрещены, при двусторонней потребности нужен посредник: "Figure 7. A direct, two-way communication between modules is impossible due to cyclic dependencies. A mediating module is necessary to coordinate data flow between two other independent modules." и "the mediator is the module that owns the navigation graph (usually an app module)." (там же)
- Между модулями передавать идентификаторы, а не объекты: "You shouldn't pass objects as navigation arguments. Instead, use simple ids that features can use to access and load desired resources from the data layer." (там же)
- Инверсия зависимостей: "Modules that rely on the behavior defined in the abstraction module should only depend on the abstraction itself, rather than the specific implementations." Реализацию подставляет корень: "These dependencies are then supplied externally, usually in the app module." (там же)

### Now in Android (эталонное приложение Google)
- "A feature's api module should not depend on another feature's api or impl module. A feature's impl should only depend on another feature's api module." ([ModularizationLearningJourney.md](https://github.com/android/nowinandroid/blob/main/docs/ModularizationLearningJourney.md))
- `api` содержит навигационные ключи, чтобы "features ... navigate to other features by using the target feature's navigation keys." (там же)

### Фрагменты (родитель/ребёнок/соседи на экране)
- "To keep fragments self-contained, don't have fragments communicate directly with other fragments or with their host activity." ([Communicate with fragments](https://developer.android.com/guide/fragments/communicate))
- Соседи: прямое общение делает их не самодостаточными, и "both fragments must handle the scenario where the other fragment is not yet created or visible." Решение: общий ViewModel со scope activity (там же).
- Родитель и ребёнок: "use the parent fragment as the ViewModel scope" (там же).
- Разовый результат вверх через Fragment Result API: "a FragmentManager can act as a central store for fragment results ... without requiring those components to have direct references to each other." Для ребёнка к родителю используется `childFragmentManager`. Ключи при этом строковые (`requestKey`). (там же)

### Hilt / Dagger (иерархия компонентов)
- Видимость вверх: "a binding in a child component can have dependencies on any binding in an ancestor component." ([Hilt Components](https://dagger.dev/hilt/components.html))
- Предупреждения о собственных компонентах ([Custom Components](https://dagger.dev/hilt/custom-components.html)):
  - "Each component/scope adds cognitive overhead."
  - "Components can have only one parent. The component hierarchy can't form a diamond. ... there is no good solution to this diamond problem and it can be difficult to predict and avoid."
  - Для простых случаев компонент "only adds complexity where simply passing a couple objects on the call stack is simpler and sufficient."

---

## 7. Десктоп: Prism, Qt, Eclipse 4

### Prism (WPF/.NET MAUI)
Prism 5.0 guide даёт явный порядок выбора механизмов ([Communicating Between Loosely Coupled Components](https://learn.microsoft.com/en-us/previous-versions/msp-n-p/ff921122(v=pandp.40))):
- "Solution commanding. Use when there is an expectation of immediate action from the user interaction."
- "Region context. Use this to provide contextual information between the host and views in the host's region."
- "Shared services. Callers can call a method on the service which raises an event to the receiver of the message. Use this if none of the preceding is applicable."
- "Event aggregation. For communication across view models, presenters, or controllers when there is not a direct action-reaction expectation."

Дополнительно:
- Типизированные события: "Events created with the Prism Library are typed events. This means you can take advantage of compile-time type checking" (там же и [текущие docs](https://prismlibrary.github.io/docs/event-aggregator.html)).
- Утечки при обычных .NET-событиях: "If you do not unsubscribe the subscriber, it will be kept alive by the publisher, and this will prevent the first one from being garbage-collected." (Prism 5.0 guide)
- Компромисс слабых ссылок: "By default, PubSubEvent maintains a weak delegate reference to the subscriber's handler" и "maintaining this weak delegate reference is slower than a corresponding strong reference ... If you do use strong delegate references, your subscriber should unsubscribe" ([текущие docs](https://prismlibrary.github.io/docs/event-aggregator.html))
- Поток доставки: "By default, the subscriber receives the event on the publisher's thread." (там же)

### Qt
- Отправитель не знает получателей: "A class which emits a signal neither knows nor cares which slots receive the signal." ([Signals & Slots](https://doc.qt.io/qt-6/signalsandslots.html))
- Порядок определён: "If several slots are connected to one signal, the slots will be executed one after the other, in the order they have been connected" (там же)
- Синхронность по умолчанию: "When a signal is emitted, the slots connected to it are usually executed immediately, just like a normal function call." (там же)
- Типы соединений ([Qt namespace](https://doc.qt.io/qt-6/qt.html)): `AutoConnection` "If the receiver lives in the thread that emits the signal, Qt::DirectConnection is used. Otherwise, Qt::QueuedConnection is used."; `BlockingQueuedConnection` "must not be used if the receiver lives in the signalling thread, or else the application will deadlock."; `UniqueConnection` защищает от двойной подписки.
- Время жизни: "When either the sender or receiver object is destroyed, the connection is automatically removed". Для лямбд: "provide a context object (usually this) to ensure the lambda is disconnected when the context is destroyed" ([Signals & Slots](https://doc.qt.io/qt-6/signalsandslots.html))
- Остаточный риск: "signals may still be delivered during object destruction after a derived class destructor has finished but before reaching ~QObject." (там же)
- Дерево владения: "When you create a QObject with another object as parent, it's added to the parent's children() list, and is deleted when the parent is." ([Object Trees & Ownership](https://doc.qt.io/qt-6/objecttrees.html))
- **Qt сам помечает знание о другой стороне как нарушение модульности.** У `QObject::sender()`, `senderSignalIndex()`, `receivers()`, `isSignalConnected()`, `connectNotify()` и `disconnectNotify()` стоит предупреждение "Warning: This function violates the object-oriented principle of modularity." ([QObject](https://doc.qt.io/qt-6/qobject.html))

### Eclipse 4 (e4)
- `IEventBroker` построен по OSGi EventAdmin: "IEventBroker is model after the OSGi EventAdmin service" ([Eclipse4/RCP/Event Model](https://wiki.eclipse.org/Eclipse4/RCP/Event_Model)). Доставка через `post` (асинхронно) или `send` (синхронно).
- Топики строковые с иерархией через `/` и wildcard `*` (там же; [Vogella](https://www.vogella.com/tutorials/Eclipse4EventSystem/article.html)). Ограничение: "You also can not use dependency injection if the topic string you are registering is constructed at run time." (wiki)
- **Признанный недостаток** (Ларс Фогель, Vogella): "The IEventBroker is a global event bus and is independent of the IEclipseContext hierarchy." и "The disadvantage is that it is a global bus with no scoping of events. Publishers must ensure they provide enough information in the topic and sent objects to enable subscribers to determine the relevance of each event." ([Vogella: Eclipse 4 event system](https://www.vogella.com/tutorials/Eclipse4EventSystem/article.html))
- Иерархический контекст как альтернатива и явная запись наверх ([Vogella: IEclipseContext](https://www.vogella.com/tutorials/Eclipse4ContextUsage/article.html)): "A context variable is a key which is declared as modifiable via the declareModifiable(key) method call." и "The modify() method searches up the chain to find the IEclipseContext defining the variable." Если ключ уже есть, "then modify() requires that the key has been declared modifiable with the declareModifiable() method, if not, the method will throw an exception." То есть потомок пишет в значение предка только с явного разрешения владельца.

---

## 8. Игровые движки

### Unreal Engine: subsystems и delegates
- Subsystems это автоматически создаваемые классы с управляемым временем жизни, привязанным к Engine, Editor, GameInstance или LocalPlayer: "After UGameInstance is created, an instance called UMyGamesSubsystem is also created." и "When UGameInstance is shut down, Deinitialize() will be called on the subsystem." ([Programming Subsystems](https://dev.epicgames.com/documentation/en-us/unreal-engine/programming-subsystems-in-unreal-engine))
- Ценность для плагинов: "Subsystems are particularly useful when creating plugins. ... you know exactly when the plugin will be instanced and initialized." (там же)
- Multicast delegates: "Multicast delegates can have multiple functions bound that all get called when the delegate fires." **Порядок не определён**: "The execution order of bound functions when calling Broadcast() is not defined. It may not be in the order the functions were added." ([Multi-cast Delegates](https://dev.epicgames.com/documentation/en-us/unreal-engine/multicast-delegates-in-unreal-engine))
- Слабые и сырые ссылки: `AddUObject` "UObject delegates keep a weak reference to your object", а `AddRaw` "Raw pointer does not use any sort of reference, so may be unsafe to call if the object was deleted out from underneath your delegate." (там же)
- Dynamic delegates: "Dynamic delegates can be serialized, their functions can be found by name, and they are slower than regular delegates." ([Dynamic Delegates](https://dev.epicgames.com/documentation/en-us/unreal-engine/dynamic-delegates-in-unreal-engine))

### Gameplay Message Subsystem (Lyra)
Источник: публичный community-форк кода Lyra ([thedodd/GameplayMessageRouter](https://github.com/thedodd/GameplayMessageRouter), форк andresbr92/GameplayMessageRouter, заголовки "Copyright Epic Games, Inc." и "Modified by Broken Rock Studios"). Оригинальный репозиторий Epic требует аккаунта, поэтому совпадение формулировок с текущей Lyra остаётся UNVERIFIED.
- Назначение: "This system allows event raisers and listeners to register for messages without having to know about each other directly, though they must agree on the format of the message (as a USTRUCT() type)." (`GameplayMessageSubsystem.h`)
- **Порядок**: "Note that call order when there are multiple listeners for the same channel is not guaranteed and can change over time!" (там же)
- Каналы это gameplay tags с режимами `ExactMatch` и `PartialMatch`. Пример PartialMatch: "registering for "A.B" will match a broadcast of A.B as well as A.B.C" (`GameplayMessageTypes2.h`)
- Несовпадение типа payload ловится только в рантайме логом: `"Struct type mismatch on channel %s (broadcast type %s, listener at %s was expecting type %s)"` (`GameplayMessageSubsystem.cpp`)

### Unity: ScriptableObject event channels
- Официальная мотивация (Unity): "keep in mind that every time you add a dependency to another object, it carries a small amount of risk." и "The goal is to keep your modules internally cohesive but externally decoupled." ([Use ScriptableObjects as event channels](https://unity.com/how-to/scriptableobjects-event-channels-game-code))
- Unity сам советует дробить статическую шину: "in a real-world production scenario, it's better to break it into smaller, specialized classes by function, such as UIEvents, GameStateEvents, HealthEvents" (там же)
- Отписка ручная: "unsubscribe from the OnEventRaised event in the OnDisable method to prevent errors or memory leaks." (там же)
- Открытый проект Unity объясняет выбор отказом от синглтонов: "They create rigid connections between different systems in the game" ([open-project-1 wiki: Event system](https://github.com/UnityTechnologies/open-project-1/wiki/Event-system))
- **Критика от автора пакета каналов**: "The event channels in this package are all method invocation obfuscation. How and when a method is called is difficult to trace through the usage of an event channel." и "This is the largest drawback of the event channel." ([Incantium/Scriptable-Events README](https://github.com/Incantium/Scriptable-Events)). Это мнение автора стороннего пакета, не Unity.

### ECS как модель коммуникации
**Bevy 0.20.0** (исходники по тегу v0.20.0):
- Буферизованные сообщения (`Message`, бывшие `Event` до 0.17): "Each message can be consumed by multiple systems, in parallel, with consumption tracked by the MessageReader on a per-system basis." Риск: "If no ordering is applied between writing and reading systems, there is a risk of a race condition." и "If messages are not handled by the end of the frame after they are updated, they will be dropped silently." (`crates/bevy_ecs/src/message/messages.rs`)
- Немедленные события и observers: "This causes any Observer watching for that Event to run immediately, as part of the World::trigger call." (`event/mod.rs`)
- Всплытие по иерархии с явным opt-in: `#[entity_event(propagate)]` "will default to using the ChildOf component to propagate the Event "up" the hierarchy (from child to parent)." и "By default, propagation requires observers to opt-in" (там же)
- **Порядок observers**: "Currently, Bevy does not provide a way to specify the relative ordering of observers watching for the same event. Their ordering is considered to be arbitrary. It is recommended to make no assumptions about their execution order." (`observer/distributed_storage.rs`)
- Очистка: "If an EntityEvent Observer targets specific entities, and all of those entities are despawned, the Observer entity will also be despawned. This protects against observer "garbage" building up over time." (там же)
- Утверждение, что разделение Event и Message появилось именно в 0.17, взято из моей памяти. Страницу релиза 0.17 скачать не удалось (JS-рендер), поэтому это UNVERIFIED. Факт верен для 0.20 по исходникам.

**Unity Entities 1.4 (DOTS):** общение идёт через данные: singleton components ("A singleton component is a component that has only one instance in a given world." [Singleton components](https://docs.unity3d.com/Packages/com.unity.entities@1.4/manual/components-singleton.html)) и отложенные структурные изменения через Entity Command Buffer ([ECB overview](https://docs.unity3d.com/Packages/com.unity.entities@1.4/manual/systems-entity-command-buffers.html)). Отсутствие встроенного event API в Entities 1.4 я не проверял исчерпывающе: UNVERIFIED.

---

## 9. Плагинные и hook-системы с длинной историей

### WordPress actions и filters
- Приоритеты это целые числа: "Lower numbers correspond with earlier execution, and functions with the same priority are executed in the order in which they were added to the action." ([add_action](https://developer.wordpress.org/reference/functions/add_action/))
- Удаление хрупкое и молчаливое: "To remove a hook, the $callback and $priority arguments must match when the hook was added. This goes for both filters and actions. No warning will be given on removal failure." ([remove_action](https://developer.wordpress.org/reference/functions/remove_action/)). Из заметок там же: "You cannot successfully remove the action before it has been added." и "You also cannot remove an action after it has been run."
- Глобальные строковые имена: "Naming conflicts ("collisions") occur when two developers use the same hook name for completely different purposes. This leads to difficult to find bugs." ([Custom Hooks](https://developer.wordpress.org/plugins/hooks/custom-hooks/))
- Фильтры обязаны быть чистыми: "filters are meant to work in an isolated manner, and should never have side effects such as affecting global variables and output." ([Filters](https://developer.wordpress.org/plugins/hooks/filters/))
- Пример войны приоритетов (форум поддержки плагина Weglot, 2023): "By setting the priority to PHP_INT_MAX you are preventing developers to customise the weglot menu in the admin bar." и "a plugin developer can't set the priority higher than PHP_INT_MAX" ([wordpress.org support](https://wordpress.org/support/?p=16730959))

### Drupal: hooks и Symfony events (уточнение исходной формулировки)
Исходная формулировка "Drupal переходит с hooks на Symfony events" устарела. С Drupal 8 hooks и Symfony events сосуществовали, но в 11.x ядро пошло в обратную сторону: hooks стали объектными, порядок стал декларативным, а затем hooks отвязали от event dispatcher.
- 11.1.0, change record "Support for object oriented hook implementations using autowired services": hooks теперь методы классов с атрибутом `#[Hook]` вместо "magic function name" ([node/3442349](https://www.drupal.org/node/3442349)).
- 11.2.0: "The functionality of hook_module_implements_alter is replaced with two new attributes and an order parameter on the #[Hook] attribute. Ordering must be done using new functionality." Примеры `order: Order::First`, `Order::Last`, `new OrderBefore(modules: ['layout_builder'])`, а также `#[ReOrderHook]` и `#[RemoveHook]` для чужих модулей. Ограничение: "Dynamic ordering is currently not supported." ([node/3496788](https://www.drupal.org/node/3496788))
- 11.3.0, "Hooks are no longer event listeners": "The module hook system no longer utilizes the event dispatcher for gathering hook implementations" и "This significantly improves performance by reducing the container size and memory required for requests." ([node/3550627](https://www.drupal.org/node/3550627))
- Policy issue (2024-12-09, статус Active) "[policy, no patch] Encourage hooks over event subscribers": "Make the policy to prefer hook implementations again over event dispatcher directly." ([#3492506](https://www.drupal.org/node/3492506)). Аргументы в комментариях: znerol за events, потому что "Introducing an event requires introducing a custom value object class. Introducing a hook doesn't." и "the event class is a good place to document requirements and expectations for an extension point". godotislate про разницу: "events can stop propagation, which the hook system so far can not." el7cosmos: "I can add a listener to the event dispatcher dynamically on runtime." и для hooks "the same thing does not work".

### Chromium: Mojo и servicification
- Зачем сервисы: "Lots of Chromium code is contained in reasonably well-isolated component libraries with some occasionally fuzzy boundaries and often a surprising number of gnarly runtime interdependencies among a complex graph of components. Y implements one of Z's delegate interfaces, while X implements one of Y's delegate interfaces, and now it's possible for some ridiculous bug to creep in where W calls into Z at the wrong time and causes a crash in X." ([docs/servicification.md](https://chromium.googlesource.com/chromium/src/+/main/docs/servicification.md))
- Цель: "services with well-defined public API boundaries and very strong runtime isolation via Mojo interfaces." (там же) и "Because service API boundaries are strictly limited to Mojo interfaces, state owned and managed by each service is strongly isolated from other components in the system." ([services/README.md](https://chromium.googlesource.com/chromium/src/+/main/services/README.md))
- Mojo это IDL плюс кодогенерация: "a message IDL format, and a bindings library with code generation for multiple target languages" ([mojo/README.md](https://chromium.googlesource.com/chromium/src/+/main/mojo/README.md))
- Важные best practices из FAQ (там же):
  - "Same process? Avoid using Mojo for communication that is always within the same process. Prefer standard C++ constructs like direct method calls, callbacks ... or base::ObserverList."
  - "Model interfaces around semantic capabilities ... Do not try to artificially consolidate multiple distinct concepts into a single interface by multiplexing with custom IDs or type enums."
- Жизненный цикл: при разрыве вызывается disconnect handler, который "may only be invoked once as long as the endpoint is bound to the same pipe", и это событие "is itself ordered with respect to any other event (e.g. writing a message) on the pipe." ([C++ bindings README](https://chromium.googlesource.com/chromium/src/+/main/mojo/public/cpp/bindings/README.md))
- Доступ к интерфейсам выдаётся явно через брокер (`BrowserInterfaceBroker`, `BinderMap`, регистрация в `PopulateFrameBinders`), а не через глобальный поиск ([mojo_and_services.md](https://chromium.googlesource.com/chromium/src/+/main/docs/mojo_and_services.md)).

### Mozilla XPCOM `nsIObserverService`
- Строковые топики: "Service allows a client listener (nsIObserver) to register and unregister for notifications of specific string referenced topic." ([nsIObserverService.idl](https://github.com/mozilla-firefox/firefox/blob/main/xpcom/ds/nsIObserverService.idl))
- **Сильная ссылка по умолчанию**: "@param ownsWeak : If set to false, the nsIObserverService will hold a strong reference to |anObserver|." (там же)
- **Встроенный детектор утечек**: в отчёте памяти топики с более чем `kSuspectReferentCount = 100` подписчиками помечаются как "A topic with a suspiciously large number of referents. This may be symptomatic of a leak if the number of referents is high with respect to the number of windows." ([nsObserverService.cpp](https://github.com/mozilla-firefox/firefox/blob/main/xpcom/ds/nsObserverService.cpp), [nsObserverService.h](https://github.com/mozilla-firefox/firefox/blob/main/xpcom/ds/nsObserverService.h))
- **Закон Хайрама на порядке**: наблюдатели вызываются в обратном порядке регистрации, и менять это боятся: "Although there shouldn't be anyone explicitly relying on the order, changing this might cause subtle problems, so we better leave it as it is." ([nsObserverList.cpp](https://github.com/mozilla-firefox/firefox/blob/main/xpcom/ds/nsObserverList.cpp))

### Linux kernel notifier chains
- Зачем появились (Алан Кокс): "We need this instead of hard coded call lists so that modules can poke their nose into the innards." ([include/linux/notifier.h](https://github.com/torvalds/linux/blob/master/include/linux/notifier.h))
- Остановка цепочки и вето кодами `NOTIFY_STOP_MASK` "Don't call further" и `NOTIFY_BAD` "Bad/Veto action". Отписка изнутри цепочки запрещена: "_must not_ be called from within the call chain." (там же)
- Порядок задаётся целым `priority`. Повторная регистрация даёт `WARN(1, "notifier callback %ps already registered", ...)`. Есть вариант `*_register_unique_prio`, который отклоняет одинаковый приоритет (`-EBUSY`) ([kernel/notifier.c](https://github.com/torvalds/linux/blob/master/kernel/notifier.c)). Откат при ошибке (`notifier_call_chain_robust`) требует неизменной цепочки: "It is important the @nl chain doesn't change between the two invocations" (там же).
- **Позиция Линуса Торвальдса** (цитата по LWN, 2013-02-12): "Notifiers are a disgrace, and almost all of them are a major design mistake. They all have locking problems, [they] introduce internal arbitrary API's that are hard to fix later (because you have random people who decided to hook into them, which is the whole *point* of those notifier chains)." Комментарий LWN: "there is no easy way to know what will happen when a notifier chain (which is a run-time construct) is invoked: there could be an arbitrary set of notifiers in the chain, in any order." ([LWN: Rationalizing CPU hotplugging](https://lwn.net/Articles/537562/))
- **Чем заменили** (Томас Гляйкснер, 2013): "The hotplug notifiers are mostly undocumented and the CPU_* actions in lots of implementations seem to be randomly chosen." Решение: "a trivial array based state machine ... This documents clearly the ordering of the callbacks and also makes the asymetric behaviour very obvious." ([LWN: CPU hotplug rework, patch 00/40](https://lwn.net/Articles/535764/))
- До этого обсуждали полноценное отслеживание зависимостей вместо "the priority numbers that are currently being used to provide some sort of ordering between the callbacks" (Srivatsa Bhat). Гляйкснер ответил: "hotplug is a rather linear sequence which does not provide much room for paralell setup/teardown." ([LKML, 2012-07-25](https://lkml.iu.edu/hypermail/linux/kernel/1207.3/00994.html))

---

## 10. Худшие практики с доказательствами

| Анти-паттерн | Доказательство |
|---|---|
| Глобальная шина без scope | Eclipse 4: "The disadvantage is that it is a global bus with no scoping of events." (Vogella). Unity советует дробить статический `GameEvents`. Linux: notifier chains как "run-time construct" с произвольным набором и порядком (LWN). |
| Строковые топики и имена | WordPress: коллизии имён, "difficult to find bugs". Firefox: "string referenced topic". Eclipse: топик, построенный в рантайме, не работает с DI. Lyra: несовпадение struct только в рантайм-логе. XState: дубль `systemId` бросает исключение в рантайме. Riverpod требует статически известных провайдеров ради lint. |
| Числовые приоритеты и войны за порядок | WordPress `PHP_INT_MAX` (Weglot). Linux: приоритеты в hotplug заменили явным массивом состояний. Drupal 11.2 заменил `hook_module_implements_alter` декларативными `Order::*`. |
| Скрытый или неопределённый порядок, на который всё равно полагаются | Unreal Broadcast "not defined", Lyra "not guaranteed and can change over time", Bevy observers "arbitrary". Firefox боится менять обратный порядок: "changing this might cause subtle problems". |
| Ребёнок меняет состояние родителя или чужой виджет напрямую | Flutter "BAD: DO NOT DO THIS". TCA: `@Shared` даёт гонки, нужен `withLock`. Pekko: "Do not pass mutable objects between actors." Eclipse: `modify()` бросает исключение без `declareModifiable`. |
| Неявный доступ к родителю | Akka Typed убрал `parent` ради типизации и тестируемости. XState: "Prefer sendTo(...)" вместо `sendParent`. Qt: `sender()` "violates the object-oriented principle of modularity". |
| Родитель подглядывает в действия ребёнка | TCA туториал: это "may lead to the parent making assumptions". |
| Забытые подписки и утечки | Prism: .NET-события держат подписчика живым. Firefox: сильная ссылка по умолчанию и детектор утечек на порог 100. Unity: ручной `OnDisable`. Unreal `AddRaw` небезопасен после удаления объекта. WordPress: молчаливый провал `remove_action`. |
| Слушатели, меняющие источник или имеющие побочные эффекты | WordPress: фильтры "should never have side effects". Riverpod: "DON'T perform side effects during the initialization of a provider". Linux: отписка изнутри цепочки запрещена. |
| Логика через цепочки сообщений вместо прямого вызова | TCA Performance: "This is an inefficient way to share logic." Mojo: внутри одного процесса предпочитать прямые вызовы. |
| Мультиплексирование разных понятий через один канал с type enum | Mojo FAQ: "Do not try to artificially consolidate multiple distinct concepts into a single interface by multiplexing with custom IDs or type enums." |
| Перемножение политик восстановления по уровням | OTP: "will be the product of the intensity values of all the supervisors above the failing child process". |
| Тихое удаление сломанного подписчика | OTP `gen_event` удаляет обработчик, и только `add_sup_handler` уведомляет подписчика. Bevy: необработанные сообщения "will be dropped silently". |
| Плоская иерархия без владельцев | Pekko: "prefer truly hierarchical systems"; доклад Bernhardt "flat actor hierarchies" (UNVERIFIED, слайды не открывал). |
| Лишние scope и компоненты | Hilt: "Each component/scope adds cognitive overhead", ромбы невозможны. Riverpod: scoping "highly complex ... Thread carefully". |

---

## Таблица лучших практик

| # | Практика | Где проверено (источник) |
|---|---|---|
| B1 | Родитель передаёт ребёнку конфигурацию и зависимости при создании через типизированные аргументы | OTP child spec `{M,F,A}`; Pekko параметры `Behavior`; XState `input`; Hilt ancestor bindings |
| B2 | Путь наверх передаётся ребёнку явно (ref, порт, callback), без неявного `parent` | Pekko from-classic ("There is no parent in Typed"); XState "Prefer sendTo(...)"; Flutter callbacks |
| B3 | Ребёнок сообщает намерение (delegate), решение принимает владелец состояния | TCA delegate actions tutorial |
| B4 | Ребёнок не знает тип или протокол родителя: адаптер или собственный порт ребёнка | Pekko Adapted Response; Android dependency inversion |
| B5 | Сбой идёт сигналом жизненного цикла к непосредственному владельцу, а ошибки валидации являются частью протокола | Pekko Fault Tolerance; OTP links/monitors |
| B6 | Время жизни ребёнка ограничено родителем; старт в заданном порядке, остановка в обратном | Pekko lifecycle; OTP supervisor; Qt object trees |
| B7 | Соседи зависят только от публичного API соседа, без циклов; двусторонняя связь через посредника у общего родителя | Android modularization; Now in Android api/impl |
| B8 | Общее для соседей состояние живёт у общего родителя (lift state up, ViewModel со scope родителя) | Flutter simple state; Android fragments |
| B9 | Сначала общий типизированный сервис, шина событий только без ожидания реакции | Prism 5.0 guide |
| B10 | Межмодульно передавать ID, данные загружать через общий слой | Android modularization |
| B11 | Узкие подписки на часть состояния (aspect, select) вместо полного ребилда | Flutter InheritedModel; Riverpod `select` |
| B12 | Чтение с подпиской по умолчанию; `read` без подписки только в обработчиках действий | Riverpod Refs |
| B13 | Запись в общее состояние только через явное разрешение владельца или lock; иначе read-only | Eclipse `declareModifiable`; TCA `withLock`, `SharedReader` |
| B14 | Подписка удаляется вместе с владельцем | Qt auto-disconnect; OTP `pg`; Pekko Receptionist; `gen_event:add_sup_handler`; Bevy observer cleanup; Riverpod `onDispose` |
| B15 | Сбой одного подписчика не ломает остальных, но факт сбоя виден | OTP `gen_event` + `add_sup_handler` |
| B16 | Порядок либо явно не определён (и это задокументировано), либо задан явным статическим списком; без числовых приоритетов | Unreal, Bevy, Lyra; Linux cpuhp; Drupal `Order::*` |
| B17 | Точки расширения объявляются статически (атрибуты, top-level декларации), чтобы их видели инструменты | Drupal `#[Hook]`; Riverpod "statically known providers" |
| B18 | Одна семантическая возможность на интерфейс, без мультиплексирования type enum | Mojo FAQ |
| B19 | Внутри процесса прямые вызовы; сообщения только через границы изоляции | Mojo FAQ; TCA Performance |
| B20 | Типизированные ключи обнаружения вместо путей и строк | Pekko `ServiceKey[T]`, отказ от ActorSelection |
| B21 | Наблюдаемость подписок: счётчики, трассировка, инспекторы | Firefox suspect-referent reporter; Linux `trace_notifier_register`; Unity custom inspector |
| B22 | Корень только собирает подсистемы и не содержит логики | Pekko "Actor Best Practices" |
| B23 | Пределы восстановления согласованы по уровням дерева | OTP restart intensity |

## Таблица худших практик

| # | Анти-практика | Источник |
|---|---|---|
| W1 | Глобальная шина без scope | Vogella e4; LWN о notifiers |
| W2 | Строковые топики и имена без типов | WordPress Custom Hooks; Firefox IDL; Lyra struct mismatch; XState `systemId` |
| W3 | Числовые приоритеты, `PHP_INT_MAX` | WordPress Weglot thread; LKML 2012; Drupal 11.2 |
| W4 | Полагаться на порядок слушателей, который не обещан | Unreal, Lyra, Bevy; Firefox `nsObserverList.cpp` |
| W5 | Ребёнок мутирует родителя или чужой виджет | Flutter "BAD: DO NOT DO THIS"; TCA `@Shared` races |
| W6 | Неявный `parent` или `sender()` | Pekko from-classic; XState actions; Qt QObject warnings |
| W7 | Родитель интерпретирует внутренние действия ребёнка | TCA tutorial |
| W8 | Подписки без владельца (сильные ссылки, ручная отписка) | Prism 5.0 guide; Firefox IDL; Unity SO guide; Unreal `AddRaw` |
| W9 | Молчаливые провалы (`remove_action`, тихое удаление handler, drop сообщений) | WordPress; OTP `gen_event`; Bevy Messages |
| W10 | Слушатели с побочными эффектами в "чистых" местах | WordPress filters; Riverpod DO/DON'T |
| W11 | Скрытые рантайм-зависимости через цепочки delegate-интерфейсов | Chromium servicification |
| W12 | Мультиплексирование через type enum | Mojo FAQ |
| W13 | Перемножающиеся retry и restart по уровням | OTP supervisor |
| W14 | Динамическое создание провайдеров или точек расширения | Riverpod DO/DON'T; Drupal "Dynamic ordering is currently not supported" |
| W15 | "Method invocation obfuscation" через каналы без инструментов трассировки | Incantium Scriptable-Events README |

---

## Моя оценка: что ложится на примитивы GM

Ниже мои выводы, а не проверенные факты. Исхожу из описания GM в задании: `defineContract`; слоты `required()`, `optional()`, `many()`; явная строка привязки в composition root для каждого `optional` и `many`; граф не мутирует; вложенные фичи с рёбрами вверх к публичным контрактам предков, вниз только к прямым детям, вбок к соседям, без циклов среди рёбер вниз и вбок; resource scopes; dynamic instances; lifecycle kernel; будущий пакет наблюдения.

### Общий вывод
Статическая композиция GM уже даёт то, к чему индустрия шла через боль: явные рёбра, отсутствие рантайм-поиска по строкам, видимость "кто слушает" на этапе сборки. Linux, Drupal и Riverpod пришли к статическим декларациям именно потому, что динамические цепочки нельзя проанализировать. Главный риск для GM в обратном направлении: добавить ради удобства глобальную шину, неявный `parent` или числовые приоритеты и тем самым повторить WordPress, e4 и notifier chains.

### (a) Родитель -> ребёнок
1. **Зависимости и конфигурация при сборке**: родитель связывает `required()` и `optional()` ребёнка в своей строке привязки. Это аналог child spec в OTP, фабрики `Behavior` в Pekko и `input` в XState. (Надёжность 9/10, уверенность 9/10.)
2. **Данные экземпляра**: `inputs` у dynamic instances держать маленькими и идентифицирующими (ID, ключ, режим), а данные загружать через контракты. Прямая аналогия с советом Android передавать ID, а не объекты. (8/10, 8/10.)
3. **Команды во время работы**: вызов метода публичного контракта прямого ребёнка по ребру вниз. Сообщения или события ради команды "обнови себя" не нужны: TCA и Mojo прямо говорят, что внутри процесса прямой вызов лучше. (9/10, 8/10.)
4. **Изменения настроек и состояния родителя во время работы**: ребёнок подписывается на read-only наблюдаемое значение родителя (будущий пакет наблюдения) с узкой выборкой (`select` или aspect). Родитель не должен императивно проталкивать изменения в детей (Flutter "BAD: DO NOT DO THIS"). (8/10, 7/10, потому что API пакета наблюдения ещё не зафиксирован.)
5. **"Окружающие" значения (тема, локаль, текущий пользователь)**: ребро вверх к публичному контракту предка, как InheritedWidget или ancestor binding в Hilt, но разрешённое статически и видимое в графе, а не поиском по типу в рантайме. (8/10, 8/10.)
6. **Время жизни**: scope ребёнка вложен в scope родителя, старт в объявленном порядке, освобождение в обратном (OTP, Qt, Pekko). (9/10, 9/10.)

### (b) Ребёнок -> родитель
Варианты (лучший первым):
1. **(Рекомендую) Собственный исходящий контракт ребёнка ("delegate/events port")**. Ребёнок объявляет контракт, которым владеет сам (например `Events` или `Delegate` фичи), и требует его слотом. Родитель реализует этот контракт и связывает его в строке привязки. Ребёнок не знает тип родителя, остаётся переиспользуемым и тестируемым с заглушкой. Это точная калька Akka Typed (явный ref с адаптером), XState (ref через `input`), TCA (delegate actions) и Android (dependency inversion). Если слот `optional`, явная строка привязки с "нет обработчика" уже требуется правилами GM: это лучше неявного "if it exists" у `sendParent`. Надёжность 9/10, уверенность 8/10.
2. **Ребро вверх к публичному контракту родителя или предка**. Годится для сервисов уровня приложения (shell, навигация, уведомления), но привязывает ребёнка к конкретному предку. Надёжность 7/10, уверенность 8/10.
3. **Всплытие события по дереву (как Bevy `propagate` или DOM bubbling)**. Удобно для UI-подобных случаев, но получатель определяется рантаймом, и анализировать это сложнее. Если когда-то понадобится, то только с opt-in, как в Bevy. Надёжность 6/10, уверенность 6/10. Сейчас не рекомендую.

Правила для любого варианта:
- Ребёнок не получает изменяемую ссылку на состояние родителя. Если запись нужна, это метод-команда на контракте владельца (аналог `declareModifiable` в e4 и `withLock` в TCA), иначе только read-only наблюдение (`SharedReader`).
- Сбой ребёнка не является событием бизнес-протокола. Lifecycle kernel или resource scope сообщает о нём владельцу scope (аналог `ChildFailed` и `DOWN`), а ошибки валидации остаются частью контракта.
- Если появятся политики перезапуска, их пределы по уровням надо согласовать, иначе они перемножатся (OTP).

### (c) Соседи и дальние модули
1. **Сосед**: ребро вбок к публичному контракту соседа, без циклов. Это правило Now in Android: "A feature's impl should only depend on another feature's api module." (9/10, 9/10.)
2. **Двусторонняя потребность между соседями**: не разрешать цикл, а поднять координацию к общему родителю как посреднику или поднять общее состояние в родителя. Так делают Android modularization, shared ViewModel со scope родителя и Flutter lift state up. (9/10, 8/10.)
3. **Дальние модули**: идти через контракт ближайшего общего предка или контракт, опубликованный в корне. Не вводить глобальный реестр по строковым ключам. Статическая композиция делает рантайм-обнаружение (Receptionist, `systemId`, `pg`) ненужным внутри одного приложения; оно оправдано только между процессами или узлами. (8/10, 8/10.)
4. **Широковещание "многим" без ожидания ответа**: слот `many()` у контракта издателя со строками привязки в composition root. Это "whiteboard", но статический и видимый: снимается главная претензия Линуса, что нельзя узнать, кто будет вызван. Порядок: по умолчанию явно не определён (и тесты это проверяют, например перемешиванием), а если порядок важен, то явный упорядоченный список в строке привязки, как массив состояний cpuhp. Числовых приоритетов не вводить. (8/10, 8/10.)
5. **Изоляция в fan-out**: ошибка одного получателя не прерывает остальных, но обязательно сообщается (урок `gen_event`). (8/10, 7/10.)
6. **Шина событий с топиками**: не вводить как общий механизм. Если понадобится, то только типизированные каналы, каждый из которых является контрактом с владельцем и scope, без wildcard по строкам (W1, W2). (Надёжность варианта "без шины" 9/10, уверенность 8/10.)

### (d) Плагины
1. **Точки расширения как контракты хоста со слотами `many()`**, которые плагин заполняет декларативно. Аналоги: Drupal `#[Hook]` (декларация вместо магического имени), Hilt `@InstallIn`, Unreal Subsystems. (8/10, 8/10.)
2. **Одна возможность на интерфейс, без общего `send(type, payload)`** (Mojo). Доступ к возможностям выдаётся хостом явно, как `BinderMap` и брокер в Chromium. (9/10, 8/10.)
3. **Все подписки и привязки плагина принадлежат scope его поколения** и снимаются lifecycle kernel при отзыве поколения. Аналоги: Qt, `pg`, Receptionist, `add_sup_handler`, Bevy. Иначе будут утечки, как в Firefox и ScriptableObject-каналах. Для наблюдаемости стоит иметь счётчики подписок на точку расширения (как suspect-referent reporter в Firefox). (9/10, 8/10.)
4. **Порядок между плагинами**: либо "не определён", либо относительные ограничения по идентификатору плагина (как `OrderBefore(modules: [...])` в Drupal). Последнее слово за composition root владельца (как `#[ReOrderHook]` и `#[RemoveHook]` в Drupal), а не за плагином с самым большим числом. (8/10, 7/10.)
5. **Трансформирующие цепочки (filters, waterfall) только чистые**, без побочных эффектов (WordPress). (9/10, 8/10.)
6. **Сбой плагина изолирован и виден**, без тихого удаления. (8/10, 7/10.)

### Названия, узнаваемые широкой аудитории (моё предложение, не проверенный факт)
- `input` узнаётся по XState и Angular `input()`.
- `events` и `emit` узнаются по XState, Vue и Node.
- "delegate" понятен iOS и TCA-аудитории, но в .NET означает указатель на функцию. Двусмысленно.
- "signal" занят реактивными signals в TS-мире (Angular, Solid, Preact). Для событий его брать не стоит, хотя в Qt это именно события.
- "hook" занят React hooks. Для точек расширения он двусмыслен, хотя в WordPress и Drupal это именно точки расширения.
- "extension point" и "contribution" узнаются по Eclipse и VS Code.
- "mediator" узнаётся по Android и MediatR.
- "scope" узнаётся по Hilt, Riverpod и DI-контейнерам.

### Риски и открытые вопросы
- **Закон Хайрама для порядка `many()`**: если порядок привязок в composition root де-факто стабилен, потребители начнут на него полагаться (пример Firefox). Нужно решить заранее: либо порядок является частью контракта (явный список), либо в тестах и dev-режиме его стоит перемешивать.
- **Ромбы в дереве**: дерево фич с одним родителем не выражает "общий ребёнок двух родителей" (то же ограничение, что у Hilt). Общее нужно поднимать к общему предку или делать соседом. Это стоит явно написать в стандарте, иначе появятся обходы.
- **Scope-механизмы дорого стоят в понимании**: Riverpod и Hilt прямо об этом предупреждают. Новые виды scope в GM стоит добавлять только с чётким временем жизни.
- **Пакет наблюдения**: самый вероятный путь "протащить" глобальную шину. Нужны правила: только read-only значения владельца, узкие выборки, подписка принадлежит scope подписчика.

---

## Ограничения и что не проверено
- Akka: отдельной официальной страницы анти-паттернов не нашёл; содержимое доклада Bernhardt UNVERIFIED.
- Lyra: код взят из community-зеркала; совпадение с актуальным кодом Epic UNVERIFIED.
- Bevy: то, что разделение Event и Message случилось именно в 0.17, UNVERIFIED (по исходникам 0.20 разделение есть).
- Unity Entities 1.4: отсутствие встроенного event API UNVERIFIED.
- Unreal: номер версии движка на страницах документации не отображался.
- WordPress core trac был недоступен (403 и бот-защита), поэтому пример войны приоритетов взят из форума поддержки плагина.
- Исходная формулировка "Drupal переходит на Symfony events" скорректирована по первоисточникам (см. раздел 9).
