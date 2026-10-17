# Связь модулей в играх, модах и крупных нативных и десктопных проектах (2026-10-16)

Исследование на уровне проектов для Get Modular. Только чтение источников, ни один репозиторий не изменялся.
Каталог `PRACTICES.md` прочитан заранее. Unreal, Lyra, Unity, Bevy, Qt, Prism, Eclipse e4, Linux, Firefox, Mojo,
Android, Flutter и TCA здесь не повторяются.

Правила оформления:
- цитаты даны дословно на английском, в кавычках;
- у каждого источника указаны версия, коммит или дата;
- всё, что не удалось проверить первоисточником, помечено **UNVERIFIED**;
- мои выводы вынесены в блоки «My assessment:» и в раздел 12.

Метод. Где можно, текст брался из исходников по зафиксированному коммиту или тегу через `gh api` и `curl`: RST
документации Godot, Javadoc Forge, Fabric и Paper, IDL LibreOffice, JS GNOME Shell. В остальных случаях использовалась
отрендеренная страница с версией. Для GitLab GNOME и KDE использовался публичный API v4.

---

## 0. Главное за одну минуту

1. **Godot официально формулирует ту же модель, что принята в GM**, только другими словами. Фразы «call down, signal up»
   в официальной документации нет: поиск по `godotengine/godot-docs` 2026-10-16 ничего не нашёл, это фольклор
   сообщества. Официальный текст звучит так: сигнал годится, только чтобы «"respond" to behavior, not start it»; вызов
   метода и инъекция `Callable` нужны, чтобы «start behavior». Про соседей сказано: «Nodes which are siblings should
   only be aware of their own hierarchies while an ancestor mediates their communications and references».
2. **Forge в 2025 году переписал шину событий (EventBus 7) и ушёл от одной глобальной шины к шине на каждый тип
   события.** Причина: «This solves the issue of your event listener silently not being called due to registering it on
   the wrong bus». Отмена события перестала быть изменяемым флагом и стала возвращаемым значением слушателя. Раньше
   отменённое событие можно было «отменить обратно», теперь это запрещено. Слушатель MONITOR при попытке изменить
   событие может получить исключение.
3. **Fabric сознательно спроектировал события как «хуки», а не как уведомления.** Отписки нет: «The event system is
   designed for hooks … They are not meant for notifications». Отмену отделили от уведомления
   (`Allow → Before → action → After`), потому что совмещённое событие «will produce false notifications». Приоритеты
   ведущий разработчик Fabric считает тупиком: «Priorities instead try and ultimately fail to solve…».
4. **Bukkit — живой пример того, к чему приводит модель «много писателей одного исхода».** Любой плагин может отменить
   событие или вернуть его, побеждает последний. `HIGHEST` выполняется последним (в Forge наоборот). Слушатель MONITOR
   обязан ничего не менять: «or it'll break other plugins». Через 10 с лишним лет Paper добавил отдельную систему
   жизненного цикла с проверкой на этапе компиляции, «which events you can register where».
5. **Время жизни подписки.** Если владельца выводить неявно (через `Delegate.Target` в Godot C#) или делать его
   необязательным параметром (`connectObject` в GNOME Shell), подписки тихо утекают. GNOME Shell в сентябре 2026 года,
   через 4 года после введения `connectObject`, добавил предупреждение. Причина: без явного владельца «the signal is
   tracked on `globalThis` and not disconnected automatically».
6. **В LibreOffice UNO прямо записана модель «один владелец»:** «Only the owner of an object is allowed to call dispose
   and there can only be one owner per object». Хранить ссылку можно в двух смыслах: «1st to own the object and 2nd to
   know the object». Подписка на уже уничтоженный объект сразу получает `disposing()` и не падает.
7. **Blender `msgbus`** — готовый пример «наблюдения за чужим значением». Подписка ведётся по ключу свойства с
   владельцем (`owner`) и массовой очисткой через `clear_by_owner`. Уведомления отложены до конца операторов и
   склеиваются: «only triggered once per update cycle». Все подписки сбрасываются при загрузке файла.
8. **Нистром.** Очередь событий нужна только для развязки во времени: «You only need a queue when you want to decouple
   something in time». Центральная очередь — «a global variable». Observer мешает рассуждать о программе: «If you often
   need to think about both sides of some communication … don't use the Observer pattern».

---

## 1. Godot (docs master `f81cf710`, 2026-10-15; class reference 4.7.2-stable, 2026-08-18)

Источники:
- `tutorials/best_practices/scene_organization.rst`, отрендерено на <https://docs.godotengine.org/en/stable/tutorials/best_practices/scene_organization.html> (заголовок «Godot Engine 4.7 documentation»);
- `tutorials/best_practices/autoloads_versus_regular_nodes.rst`;
- `tutorials/scripting/groups.rst`;
- `getting_started/step_by_step/signals.rst`;
- `tutorials/scripting/scene_unique_nodes.rst`;
- `tutorials/scripting/singletons_autoload.rst`;
- `tutorials/scripting/c_sharp/c_sharp_signals.rst`;
- `tutorials/plugins/editor/making_plugins.rst`;
- `doc/classes/Object.xml` на теге `4.7.2-stable`.

### 1.1 Родитель → ребёнок

Сцена не должна зависеть от окружения. Зависимости ей передаёт родитель:

> «**If at all possible, you should design scenes to have no dependencies.** That is, you should create scenes that keep everything they need within themselves.»
>
> «If a scene must interact with an external context, experienced developers recommend the use of Dependency Injection. This technique involves having a high-level API provide the dependencies of the low-level API. Why do this? Because classes which rely on their external environment can inadvertently trigger bugs and unexpected behavior.»
>
> «To do this, you must expose data and then rely on a parent context to initialize it:»

Официальный список из пяти способов приведён дословно:

1. «Connect to a signal. Extremely safe, but should be used only to "respond" to behavior, not start it. By convention, signal names are usually past-tense verbs like "entered", "skill_activated", or "item_collected".»
2. «Call a method. Used to start behavior.»
3. «Initialize a Callable property. Safer than a method as ownership of the method is unnecessary. Used to start behavior.»
4. «Initialize a Node or other Object reference.»
5. «Initialize a NodePath.»

> «These options hide the points of access from the child node. This in turn keeps the child **loosely coupled** to its environment. You can reuse it in another context without any extra changes to its API.»

Предупреждение в том же документе: даже слабая связь остаётся зависимостью, и её следует делать видимой в редакторе,
а не в документации:

> «You should favor keeping data in-house (internal to a scene), though, as placing a dependency on an external context, even a loosely coupled one, still means that the node will expect something in its environment to be true. … Writing code that relies on external documentation to use it safely is error-prone by default.»
>
> «To avoid creating and maintaining such documentation, you convert the dependent node ("child" above) into a tool script that implements `_get_configuration_warnings()`.»

### 1.2 Ребёнок → родитель

Ребёнок испускает сигнал о прошедшем факте, а родитель решает, что делать. Сигналы описаны так:

> «Signals are a delegation mechanism built into Godot that allows one game object to react to a change in another without them referencing one another. Using signals limits coupling and keeps your code flexible.» (`signals.rst`)

Проверка фразы «call down, signal up» (2026-10-16): `gh search code "signal up" --repo godotengine/godot-docs` нашёл
только `class_upnp.rst`, `"call down"` не нашёл ничего. Фраза встречается в Wikibooks («Many Godot users will say to you
"signal up, call down" if you ask for tips with coding», <https://en.wikibooks.org/wiki/Guide_to_the_Godot_game_engine/Signals_and_methods>,
вторичный источник) и в обсуждениях на Reddit. Официальный эквивалент — пункты 1 и 2 выше: сигнал реагирует, метод
запускает.

### 1.3 Соседи и далёкие узлы

> «Although the examples above illustrate parent-child relationships, the same principles apply towards all object relations. Nodes which are siblings should only be aware of their own hierarchies while an ancestor mediates their communications and references.»
>
> «The same principles also apply to non-Node objects that maintain dependencies on other objects. Whichever object owns the other objects should manage the relationships between them.»

Принцип размещения в дереве описан через отношение «существует ли ребёнок без родителя», а не через пространство:

> «You should use parent-child relationships only in cases where nodes are effectively elements of their parents. Does removing the parent reasonably mean that the children should also be removed? If not, then it should have its own place in the hierarchy as a sibling or some other relation.»
>
> «The key to scene organization is to consider the SceneTree in relational terms rather than spatial terms.»

**Группы** — это теги с широковещательным вызовом. Документ хвалит их за развязку, правил использования не даёт:

> «Groups in Godot work like tags in other software. … Call a method on all nodes in a group. … This is a useful feature to organize large scenes and decouple code.» (`groups.rst`)

**Autoload** (глобальные синглтоны) разобраны отдельной статьёй с явными проблемами:

> «Other engines can encourage the use of creating manager classes, singletons that organize a lot of functionality into a globally accessible object. Godot offers many ways to avoid global state thanks to the node tree and signals.»
>
> «1. **Global state**: one object is now responsible for all objects' data. If the `Sound` class has errors or doesn't have an AudioStreamPlayer available, all the nodes calling it can break.
> 2. **Global access**: now that any object can call `Sound.play(sound_path)` from anywhere, there's no longer an easy way to find the source of a bug.
> 3. **Global resource allocation**: with a pool of `AudioStreamPlayer` nodes stored from the start, you can either have too few and face bugs, or too many and use more memory than you need.»
>
> «About global access, the problem is that any code anywhere could pass wrong data to the `Sound` autoload in our example. As a result, the domain to explore to fix the bug spans the entire project.»

Когда autoload допустим (это совпадает с правилом «один владелец значения»):

> «If the autoload is managing its own information and not invading the data of other objects, then it's a great way to create systems that handle broad-scoped tasks. For example, a quest or a dialogue system.»
>
> «If you have systems that modify other systems' data, you should define those as their own scripts or scenes, rather than autoloads.» (`scene_organization.rst`)

**Уникальные имена в сцене** (`%Name`) ограничены границей сцены. Это лексическая область видимости для поиска:

> «A scene unique node can only be retrieved by a node inside the same scene.» (`scene_unique_nodes.rst`)

### 1.4 Плагины (EditorPlugin)

> «It's important to deal with initialization and clean-up of resources. A good practice is to use the virtual function `_enter_tree()` to initialize your plugin and `_exit_tree()` to clean it up.» (`making_plugins.rst`)

Очистка ручная и симметричная: пример вызывает `remove_dock(dock)` и `dock.queue_free()` в `_exit_tree`.

### 1.5 Жизненный цикл, очистка, утечки

Автоматический разрыв связей при освобождении объекта (`Object.xml`, 4.7.2):

> «A signal can only be connected once to the same Callable. If the signal is already connected, this method returns ERR_INVALID_PARAMETER and generates an error, unless the signal is connected with CONNECT_REFERENCE_COUNTED.»
>
> «Note: If the callable's object is freed, the connection will be lost.»
>
> `CONNECT_ONE_SHOT`: «One-shot connections disconnect themselves after emission.»
>
> `CONNECT_DEFERRED`: «Deferred connections trigger their Callables on idle time (at the end of the frame), rather than instantly.»
>
> `CONNECT_PERSIST`: «Connections to lambda functions … cannot be made persistent.»

Документ про C# сигналы описывает, где автоматика **не срабатывает**:

> «Normally, when any `GodotObject` is freed (such as any `Node`), Godot automatically disconnects all connections associated with that object. This happens for both signal emitters and signal receivers.»
>
> «When a signal receiver is freed while the signal emitter is still alive, in some cases automatic disconnection won't happen:
> - The signal is connected to a lambda expression that captures a variable.
> - The signal is a custom signal.»
>
> «If you connect to a lambda expression that captures variables, Godot can't tell that the lambda is associated with the instance that created it.»
>
> «Godot uses Delegate.Target to determine what instance a delegate is associated with. … When a variable is captured, the Target instead points at a generated type that stores the captured variable. This is what breaks the association.»
>
> «Automatic disconnection is totally reliable if a signal emitter is freed before any of its receivers are freed. With a project style that prefers this pattern, the above limits may not be a concern.»

Последствие описано так: на четвёртом тике лямбда обращается к освобождённому узлу, и возникает
`System.ObjectDisposedException`.

My assessment: владелец подписки в Godot выводится из адресата колбэка. Замыкание этот вывод ломает. Это прямой довод
за то, чтобы в GM область видимости (scope) передавалась явно, а не определялась по функции.

### 1.6 Эволюция

- **Сигналы стали типом первого класса в 4.0** вместо строк: «Like methods (Callable), signals are a first-class type since Godot 4.0. This means you can pass them around as method arguments directly without having to pass them as strings, which allows for better autocompletion and is less error-prone.» (`signals.rst`)
- **Статические переменные с 4.1 как замена части autoload**: «Since Godot 4.1, GDScript also supports `static` variables using `static var`. This means you can now share variables across instances of a class without having to create a separate autoload.»
- **Уникальные имена в сцене** появились из-за хрупких путей: «Using `get_node()` to reference nodes from a script can sometimes be fragile. If you move a button in a UI scene from one panel to another, the button's node path changes…»

### 1.7 Лучшие и худшие практики по версии самого Godot

- Лучшие: сцены без зависимостей; внедрение зависимостей родителем; сигнал реагирует, метод запускает; соседей связывает
  предок; «Whichever object owns the other objects should manage the relationships»; зависимости видны в редакторе
  через `_get_configuration_warnings()`.
- Худшие: глобальные менеджеры и autoload, которые меняют чужие данные; жёсткие пути к узлам; знание о связях,
  хранящееся только в документации («development hell»).

---

## 2. Minecraft-моддинг

### 2.1 Forge: EventBus 6 (`@SubscribeEvent`) → EventBus 7 (2025)

Источники:
- MinecraftForge/Documentation `docs/concepts/events.md` и `lifecycle.md` (ветка 1.21.x, коммит `ac05e12`, 2025-08-16);
- MinecraftForge/EventBus README и Javadoc API (коммит `588a6c7`, 2026-09-03; теги `7.0`, `6.2`);
- руководство по миграции на EventBus 7, PaintNinja, <https://gist.github.com/PaintNinja/ad82c224aecee25efac1ea3e2cf19b91> (обновлено 2026-07-01);
- changelog Forge `1.21.6-56.0.0`.

**Модель EventBus 6 (документация Forge 1.21.x).** Есть две шины: главная `MinecraftForge#EVENT_BUS` и шина
жизненного цикла мода.

> «The `MONITOR` priority is a special priority that runs after `LOWEST` but does not affect the result of the event. Attempting to cancel or otherwise mutate the event object during the `MONITOR` phase may cause an exception to be thrown.»
>
> «Event handlers with priority `HIGHEST` are executed first and from there in descending order until `MONITOR` events which are executed last.»
>
> Шина мода: «Many of these events are also ran in parallel so mods can be initialized at the same time. This does mean you can't directly execute code from other mods in these events. Use the `InterModComms` system for that.»

**InterModComms** — двухфазный обмен сообщениями между модами (`lifecycle.md`):

> «During the `InterModEnqueueEvent`, use `InterModComms#sendTo` to send messages to different mods. … Then during the `InterModProcessEvent`, use `InterModComms#getMessages` to get a stream of all received messages.»

**EventBus 7.** Changelog Forge 56.0.0: «New EventBus 7 — A full rewrite and redesign of the library that offers much
better performance, new features and fixes all previous design flaws». Ключевые изменения с причинами приведены по
руководству миграции дословно:

- **Шина на каждый тип события вместо глобальной.** «In EventBus 7, every event has its own bus and the convention is to put the bus field inside the event class. … This solves the issue of your event listener silently not being called due to registering it on the wrong bus.» README: `public static final EventBus<PlayerLoggedInEvent> BUS = EventBus.create(PlayerLoggedInEvent.class);`, «There can only be one EventBus instance per event type per BusGroup.»
- **Групповые операции вынесены в `BusGroup`** с жизненным циклом: `startup()`, `shutdown()` и `dispose()`. Последний описан так: «Warning: This is a destructive operation - this BusGroup should not be used again after calling this method».
- **Отмена через возвращаемое значение.** «Event cancellation is now done through `Predicate` listeners instead of calling a custom `setCanceled` method on the event instance.» `void` означает «never cancel». Это ещё и гарантия эволюции: «This also avoids a breaking change if the event is later changed to no longer be cancellable».
- **Отменённое событие больше нельзя «отменить обратно».** «You can't uncancel an event once it has been cancelled and you can't receive a cancelled event outside of the monitoring priority. This was done to simplify the API, improve performance, reduce internal complexity and make things more predictable.»
- **Проверяемая только-для-чтения природа MONITOR**: «Events that implement the `MonitorAware` interface have stronger immutability guarantees for monitoring listeners. Attempting to mutate an event with this interface in a monitoring listener will throw an exception.» В Javadoc `MonitorAware` помечен как «experimental».
- **Побочные эффекты старой модели отмены**, признанные авторами: «Some events, such as `BlockEvent.BreakEvent` had very strange behaviour where it would sometimes be posted in a pre-cancelled state that could be uncancelled by listeners that are registered in a special way ("receiveCanceled"). Some events like `FurnaceFuelBurnTimeEvent` also had side-effects where calling unrelated methods on the event would implicitly cancel it.»
- **Наследование событий стало явным (opt-in).** «In EventBus 6, all non-final events implicitly supported inheritance, even if they weren't designed for it. In the new system it is opt-in with `InheritableEvent`…» Это решило старую проблему: «This solves the infamous issue of `AttachCapabilitiesEvent<LivingEntity>` not working».
- **Приоритет стал числом типа `byte`; топологическую сортировку отвергли.** «The reasons a number was picked instead of a string with topological sorting are to avoid silent failures from typos, improve performance and reduce complexity. A `byte` was chosen because it's more friendly to Java's future Project Valhalla and because needing more than a couple of hundred priorities is likely a sign of a design flaw in your code.» И далее: «You can still use mod ordering in your mods.toml if you want to add listeners before or after another mod as registration order is still respected.»
- **Проверка на этапе компиляции.** README: «EventBus 7 relies heavily on dev-time static analysis and compile-time validation to ensure correct API usage, reducing the need for runtime checks.»
- **Событие сразу после использования освобождает свою шину** (`SelfDestructing`): «A self-destructing event will dispose of its associated EventBus after it has been posted… This is useful for single-use lifecycle events.»
- **Подсказка о слушателях**: `hasListeners()` позволяет не собирать событие, если его никто не слушает.

### 2.2 NeoForge (форк 2023 года)

Источники:
- блог «Event system changes in NeoForge 20.2», Technici4n, 2023-10-30, <https://neoforged.net/news/20.2eventbus-changes/>;
- блог «The Capability rework», Technici4n, 2023-12-05, <https://neoforged.net/news/20.3capability-rework/>;
- changelog `net.neoforged:bus` 8.0.0;
- neoforged/Documentation `docs/concepts/events.md` (коммит `7bc4d2f`, 2026-10-09; версия документации 26.1).

Изменения шины в 20.2 и их причины:

> «The Forge bus will not allow listeners to events that implement `IModBusEvent` anymore. This should prevent subscribing to the wrong event bus.»
>
> «`abstract` events cannot be listened to anymore. … A number of NeoForge events were made abstract to guard against developer mistakes.»
>
> «The ModLauncher hooks were removed, greatly simplifying the implementation of the event bus.»

Changelog bus 7.0.14 (семантика `@SubscribeEvent`): «Will error if any superclass or superinterface has a declared
method with `@SubscribeEvent`. (Prevents mistake where user would assume that inheritance works).» и «Will error if no
method at all could be found. (Prevents forgetting the `@SubscribeEvent` annotation).»

Changelog bus 7.0.13: «Remove IEventBus#shutdown and throw an exception when posting an event too early.» Затем 7.0.17:
«Go back to silently returning the event if the bus is not started (#26)». Причину отката я не нашёл (**UNVERIFIED**).

Текущая документация (26.1):

> «If you listen to an `abstract` event, your game will crash, as this is never what you want.»
>
> «If an event is cancelled, other event handlers for this event will not run…» и «Event handlers can opt to explicitly receive cancelled events … `receiveCanceled`».
>
> «Note that priorities are ignored for events that are fired in parallel.»

`EventPriority` в NeoForge содержит пять значений, `MONITOR` среди них нет.

**Переработка capabilities (20.3)** — механизм поиска необязательного поведения у чужого объекта:

> «Our initial 20.3 release comes with a fundamental redesign of the capability system, with the goal of fixing all the issues that were found in the previous iteration after years of usage.»
>
> «Data attachments allow adding arbitrary data to block entities, chunks, entities, and item stacks. Capabilities allow querying behavior instances from blocks, entities, and item stacks.»
>
> «Capabilities are designed to separate what a block, entity or item stack can do from how it does it.»
>
> «Creating a capability with the same name multiple times will always return the same object.»
>
> Кэш: «The cache is automatically cleared by the garbage collector, there is no need to unregister it.» С подпиской на изменения кэш создаётся с «A validity check, that is used to determine if the cache is still valid» (в коде есть комментарий «because the cache might outlive the object it belongs to») и «An invalidation listener, that is called when the capability changes.»
>
> «For this system to work, modders must call `level.invalidateCapabilities(pos)` whenever a capability changes, appears, or disappears.»

My assessment: capabilities — близкий аналог «необязательного слота с динамическими экземплярами» в GM. Модель такая:
владелец сам объявляет об изменении (`invalidate`), потребитель держит кэш с проверкой собственной жизни и слушателем
инвалидации. Слабое место модели: владелец должен помнить, что надо вызвать invalidate.

### 2.3 Fabric: колбэки вместо шины

Источники:
- FabricMC/fabric-api (коммит `33b3690`, 2026-10-14): `Event.java`, `EventFactory.java`, `AutoInvokingEvent.java`, `CONTRIBUTING.md`;
- issue #180 (2019-05-13), issue #1121 (2020-10-12, комментарии 2021–2023), PR #5619 (открыт 2026-09-25, на 2026-10-09 не смержен);
- <https://docs.fabricmc.net/develop/events> (версия 26.2).

**Модель.** На каждое событие свой объект `Event<T>`, где `T` — функциональный интерфейс колбэка. Объект лежит в
статическом поле интерфейса или класса-владельца. «Invoker» склеивает слушателей в один экземпляр `T`:

> «An "invoker" is an object which hides multiple registered listeners of type T under one instance of type T, executing them and leaving early as necessary.» (`Event.java`)

API `Event` состоит из `register(T)`, `register(Identifier phase, T)` и `addPhaseOrdering(...)`. **Метода unregister
нет.** Причина записана в issue #180:

> asiekierka (2019-05-13): «I purposefully did not add unregister(T), fearing that mods would abuse it to do something silly like register and unregister themselves once a tick».
>
> Player3324 / sfPlayer1, руководитель Fabric (2019-05-13): «The event system is designed for hooks, i.e. injecting calls that effectively embed subscriber-supplied code at the call site, a bit like dependency injection. They are not meant for notifications or what you'd expect from other kinds of event systems. If you want to the the latter, a distribution layer on top may be advisable.»

Спрос на подписки с ограниченным временем жизни остаётся. Открытый PR #5619 «Scoped Event Listeners» (2026-09-25)
продолжает закрытые #5041 и #5285. Автор пишет: «I really don't think we can do anything about `Event#unregister` being
public unless an `instanceof` check in `ScopedEventListenerImpl` is acceptable. I assume it's not since that falls into
"awful hack" territory which got the original PR rejected.» Мейнтейнер modmuss50 спрашивает (2026-10-09): «What happens
if I registed the same listener as scoped and none scoped? Or the same listener multiple times?»

**Короткое замыкание вместо отмены через флаг** (docs 26.2):

> «Our implementation will call the event listeners in order until one of them does not return `InteractionResult.PASS`.»

**Фазы вместо числовых приоритетов** (`EventFactory.createWithPhases`, `Event.addPhaseOrdering`):

> «An event phase is a named group of listeners, which may be ordered before or after other groups of listeners. … Adding separate events should be considered before making use of multiple event phases.»
>
> «If more phases are necessary, discussion with the author of the Event is encouraged.»
>
> «Incompatible ordering constraints such as cycles will lead to inconsistent behavior: some constraints will be respected and some will be ignored. If this happens, a warning will be logged.»

**Разделение «разрешить, до, после»** (issue #1121 «Discussion: The art of event phases», i509VCB, 2020-10-12):

> «The current PlayerBlockBreakEvents do not meet this standard as the `Allow` and `Before` callbacks are combined, therefore a mod which performs an action before the block is broken due to load order is then later canceled by a later listener, which in turn has a mod perform logic but the block is never broken.»

Ответ Player3324 (2021-06-15):

> «Separating cancellation from notification doesn't create an unbounded dependency chain with potentially recursive relations, but at most 4 distinct events with some being optional: cancelled <- **allow** -> before -> *action* -> after. This is how we are and have been implementing cancellable events lately.»
>
> «Priorities instead try and ultimately fail to solve e.g. before@someModelProvider -> before@someModelLoader -> before@someModelDeduplicator where an attempt is made to condense dependencies into the same before event's one-dimensional listener order.»

Technici4n (2023-06-24): «Documented in the guidelines, imo sufficiently.»

**`CONTRIBUTING.md` (правила для событий):**

> «Events should not be used if there is only one subscriber, like a handler in a registered unique namespace.»
>
> «When an event has parameters that are likely to evolve over time, use a context object. Context objects hold the parameters of an event in an object, and can be evolved over time without necessitating a breaking change to the API.»
>
> «Events should use dedicated callback interfaces.»
>
> «`Event<>` objects should be in the class declaring the event field or getter.»
>
> «Events that may allow or block some action should start with `Allow`.»
>
> «Processes happening in multiple steps should use multiple events. While Fabric provides an event phase system, purpose-driven events should always be preferred. For example, an event that both cancels and notifies of an action will produce false notifications (notified but later canceled). It would be preferable to have an `AllowXxx` event for cancellation, and then a `BeforeXxx` event for notification.»
>
> «Strongly validate inputs to detect misuse. Exceptions should be thrown in the first method that can reasonably detect misuse.»

**Автоматически вызываемые события** (`AutoInvokingEvent`): объект-контекст получает вызов, если сам реализует
интерфейс колбэка. Явная регистрация при этом запрещена: «It shouldn't do any explicit event registration … otherwise it
will see extraneous callback invocations.» Есть пометка «TODO: explore enforcing that auto-invoked listeners don't
register themselves.»

### 2.4 Bukkit и Paper

Источники:
- PaperMC/Paper `paper-api/src/main/java/org/bukkit/event/*` (коммит `09ee222`, 2026-10-16);
- Bukkit wiki «Event API Reference», последняя правка 2019-08-04, получено через API bukkit.fandom.com;
- PaperMC/docs (коммит `630d65d`): `dev/api/event-api/event-listeners.md`, `dev/api/lifecycle/lifecycle.md`, `dev/getting-started/paper-plugins.md` (страницы отрендерены с отметкой «Last updated: Sep 18, 2026»).

**Приоритеты** (`EventPriority.java`):

> «Listeners with lower priority are called first will listeners with higher priority are called last.»
>
> `LOWEST`: «Event call is of very low importance and should be run first, to allow other plugins to further customise the outcome»
>
> `HIGHEST`: «Event call is critical and must have the final say in what happens to the event»
>
> `MONITOR`: «Event is listened to purely for monitoring the outcome of an event. No modifications to the event should be made under this priority»

Отменённое событие продолжает идти по цепочке (`Cancellable.java`): «A cancelled event will not be executed in the
server, but will still pass to other plugins».

Модель подробно изложена в Bukkit wiki:

> «Every plugin gets a say in what happens, and every plugin must get a chance to know the outcome of an event. So, we pass events to plugins even after they've been cancelled. A plugin can actually uncancel an event after another plugin cancelled it. This is where priorities become really important. When changing values of an event the changes of one with the higher priority will override any changes done before by a listener with a lower priority so that in the end the one with the highest priority can have the final say in the actually outcome.»
>
> «If you want to change the outcome of an event, choose very carefully from LOWEST to HIGHEST. Suggested generalized protection plugins on lowest, more specific plugins on normal, and override plugins on high.»
>
> «If you want to act when an event happens, but not change the outcome, use MONITOR. It's really really important that you use MONITOR, or an event might get cancelled after you've acted on it, and it's even more important that you don't change the outcome of the event on MONITOR or it'll break other plugins.»

Paper сам признаёт, что порядок неочевиден (`event-listeners.md`):

> «The order of the priorities is somewhat counter-intuitive. The **higher** the priority, the **later** the event is called.»
>
> «It is important to consider that another plugin could have cancelled or changed the event before your plugin is called. Always check the event before doing anything with it.»

Сравнение (моё наблюдение). В Forge и NeoForge `HIGHEST` выполняется первым. В Bukkit и Paper `HIGHEST` выполняется
последним и получает «final say». В Paper Lifecycle API «The lower the number, the earlier it will be run». Три системы
в одной экосистеме, три разных соглашения.

«Войны приоритетов» в Bukkit как задокументированный случай с конкретными плагинами: **UNVERIFIED**. Первичного отчёта
я не нашёл. Сам механизм (возврат отменённого события, последний писатель выигрывает, опора на порядок по соглашению)
задокументирован выше.

**Очистка по владельцу.** Каждый `RegisteredListener` привязан к `Plugin`. `HandlerList.unregisterAll(Plugin)`
описан как «Unregister a specific plugin's listeners from all handler lists.»

**Lifecycle API (новая параллельная система событий Paper).** Причины записаны дословно:

> «We already have an event system, why do we need another one? … some of these events fire well before `JavaPlugin` instances are created, before the `MinecraftServer` instance is created … The existing Bukkit event system is not designed to exist at this time, and modifying it to support this environment is more trouble than just having a separate system».
>
> «You cannot have generics on Bukkit events because there is 0 compile time checking since they are registered reflectively.»
>
> «Another reason is that the existing system has priorities, but always has them. With the lifecycle events, there may be some events for which we do not want to support priorities (it would be based purely on plugin load order then).»
>
> «A new system lets us enforce, at compile time, which events you can register where based on the context of the registration. So you can't even register a handler for an event in the wrong spot, that will be a compiler error thanks to our implementation using generics.»
>
> Monitor: «Only use this to inspect some state in the event. Do not modify any state in the handler.»
>
> «The reloading plugins functionality … is disabled if plugins register handlers in certain situations. This is due to the plugin reloads having to fully unload the plugin and its classes which is an issue if an event has to run while the plugin is unloaded.»

**Изоляция Paper-плагинов** (`paper-plugins.md`):

> «Paper plugins are not able to access each other unless given explicit access by depending on another plugin, etc. This helps prevent Paper plugins from accidentally accessing each other's dependencies, and in general helps ensure that plugins are only able to access what they explicitly depend on.»
>
> «Unlike Bukkit plugins, Paper plugins will not attempt to resolve cyclic loading issues.»
>
> «Paper plugins do **not** use the `dependencies` field to determine load order.»

---

## 3. Blender: add-ons (документация API 5.2; руководство «Last updated on 2026-10-16»)

Источники:
- <https://docs.blender.org/api/current/bpy.msgbus.html>;
- <https://docs.blender.org/api/current/bpy.app.handlers.html>;
- <https://docs.blender.org/api/current/info_gotchas_crashes.html>;
- <https://docs.blender.org/api/current/info_gotchas_operators.html>;
- <https://docs.blender.org/manual/en/latest/advanced/extensions/addons.html>;
- <https://docs.blender.org/manual/en/latest/advanced/scripting/addon_tutorial.html>.

### 3.1 Родитель → ребёнок и данные

Add-on не получает зависимости явно, данные он читает из контекста (`bpy.context`). Главный задокументированный риск —
хранить ссылки на чужие данные:

> «TL;DR Do not keep direct references to Blender data (of any kind) when modifying the container of that data, and/or when some undo/redo may happen (e.g. during modal operators execution…). Instead, use indices (or other data always stored by value in Python, like string keys…), that allow you to get access to the desired data.»
>
> «Modules or classes that remain active while Blender is used, should not hold references to data the user may remove, instead, fetch data from the context each time the script is activated.»
>
> «For safety, you should assume that undo and redo always invalidates all `bpy.types.ID` instances…»

### 3.2 Операторы как команды

Операторы — это именованные команды (`bl_idname`) с `poll()`, отменой (undo) и вызовом из меню, по горячей клавише или
из Python. Их ограничения как программного API задокументированы:

> «Can't pass data such as objects, meshes or materials to operate on (operators use the context instead).
> The return value from calling an operator is the success (if it finished or was canceled), in some cases it would be more logical from an API perspective to return the result of the operation.
> Operators' poll function can fail where an API function would raise an exception giving details on exactly why.»
>
> «If you're still stuck, unfortunately, the only way to eventually know what is causing the error is to read the source code for the poll function and see what it is checking.»

### 3.3 Наблюдение за чужими значениями: `bpy.msgbus`

> «The message bus system can be used to receive notifications when properties of Blender data-blocks are changed via the data API.»
>
> «The following updates do not trigger message bus notifications: Moving objects in the 3D Viewport. Changes performed by the animation system.»
>
> «Changes done from msgbus callbacks are not included in related undo steps, so users can easily skip their effects by using Undo followed by Redo.»
>
> «Unlike properties update callbacks, message bus update callbacks are postponed until all operators have finished executing. Additionally, for each property the callback is only triggered once per update cycle, even if the property was changed multiple times during that period.»
>
> `subscribe_rna(*, key, owner, args, notify, options=set())`: «Register a message bus subscription. It will be cleared when another blend file is loaded, or can be cleared explicitly via `bpy.msgbus.clear_by_owner()`.» `owner (Any) – Handle for this subscription (compared by identity).` `PERSISTENT when set, the subscriber will be kept when remapping ID data.`
>
> «All subscribers will be cleared on file-load. Subscribers can be re-registered on load, see `bpy.app.handlers.load_post`.»
>
> Ключ подписки: «A property instance. A struct type. A tuple representing a (struct, property name) pair.» То есть подписаться можно и на свойство всех экземпляров типа.

### 3.4 Глобальные хуки: `bpy.app.handlers`

Это списки функций, куда add-on сам добавляет обработчики (`append`):

> «By default handlers are freed when loading new files, in some cases you may want the handler stay running across multiple files (when the handler is part of an add-on for example). For this the `bpy.app.handlers.persistent` decorator needs to be used.»
>
> «Altering data from handlers should be done carefully. While rendering the `frame_change_pre` and `frame_change_post` handlers are called from one thread and the viewport updates from a different thread. If the handler changes data that is accessed by the viewport, this can cause a crash of Blender.»

### 3.5 Регистрация и отмена регистрации

> «register is a function which only runs when enabling the add-on, this means the module can be loaded without activating the add-on. unregister is a function to unload anything setup by register, this is called when the add-on is disabled.» (addon tutorial)

Наблюдение (моё). В том же официальном руководстве пример «Write the Add-on (Simple)» в `register()` выполняет
`bpy.types.VIEW3D_MT_object.append(menu_func)`, а `unregister()` вызывает только
`bpy.utils.unregister_class(ObjectMoveX)`, без `VIEW3D_MT_object.remove(menu_func)`. Ручная симметрия
register/unregister ломается даже в эталонном примере.

### 3.6 Эволюция: расширения в 4.2

> «With the introduction of Extensions in Blender 4.2, the old way of creating add-ons is considered deprecated.»
>
> «The legacy add-ons would use their module name to access the preferences. This could lead to a name clash when extensions with the same name (from different repositories) would be installed. To prevent this conflict, the repository name is now part of the namespace.» (`bl_ext.{repository_module_name}.kitsu`)
>
> «Make sure that both the individual and the combined add-on check for already registered types (Operators, Panels, …).»

---

## 4. GObject, GNOME Shell, KDE KParts

### 4.1 GObject (документация GLib 2.91.0, <https://docs.gtk.org/gobject/>)

`g_signal_connect_object` (<https://docs.gtk.org/gobject/func.signal_connect_object.html>):

> «This is similar to g_signal_connect_data(), but uses a closure which ensures that the `gobject` stays alive during the call to `c_handler` by temporarily adding a reference count to `gobject`. When the `gobject` is destroyed the signal handler will be automatically disconnected. Note that this is not currently threadsafe (ie: emitting a signal while `gobject` is being destroyed in another thread is not safe).»
>
> «No validation is performed on the "detail" string when specified in `detailed_signal`, other than a non-empty check.»

Проблема потокобезопасности открыта с 2012 года. GLib issue #494 «g_signal_connect_object thread safety» (Allison
Lortie, 2012-01-02, на 2026-10-16 открыт):

> «We should probably move the GObject closures over to using the two-pass weak referencing approach: GWeakRef for safety and the callback version (or qdata, as now) for cleaning up afterwards.»

GLib issue #3540 (2024-11-20, закрыт): «`g_signal_connect (object, "notify::non-existant-property")` succeeds without
checking if `object` actually has property `non-existant-property`.»

Двухфазное уничтожение (<https://docs.gtk.org/gobject/concepts.html>):

> «When dispose ends, the object should not hold any reference to any other member object.» «dispose can be executed more than once.» «finalize will be executed only once.» «This two-step destruction process is very useful to break reference counting cycles.»
>
> Слабые ссылки: «Weak references on the object are automatically dropped when the instance is disposed».

Остановка распространения через аккумулятор: «If it returns `FALSE`, signal emission is stopped.»

### 4.2 GNOME Shell: расширения и `connectObject`

Источники:
- gjs.guide «Review Guidelines» (репозиторий World/javascript/gjs-guide, HEAD `e12290ac`, 2026-10-14), <https://gjs.guide/extensions/review-guidelines/review-guidelines.html>;
- «Session Modes», <https://gjs.guide/extensions/topics/session-modes.html>;
- «Port Extensions to GNOME Shell 42», <https://gjs.guide/extensions/upgrading/gnome-shell-42.html>;
- gnome-shell тег `51.1` (2026-10-14), `js/misc/signalTracker.js`;
- MR !1953 (смержен 2022-03-04) и MR !4382 (смержен 2026-09-03).

Правила проверки расширений:

> «There are three basic guidelines for the operation of an extension: Don't create or modify anything before `enable()` is called. Use `enable()` to create objects, connect signals and add main loop sources. Use `disable()` to cleanup anything done in `enable()`»
>
> «Extensions MUST NOT create any objects, connect any signals, add any main loop sources or modify GNOME Shell during initialization.»
>
> «Any objects or widgets created by an extension MUST be destroyed in `disable()`.» «Any signal connections made by an extension MUST be disconnected in `disable()`» «Any main loop sources created MUST be removed in `disable()`.»
>
> «all dynamically stored memory must be cleared or freed in `disable()`»
>
> «Extensions which modify, reload or interact with other extensions or the extension system are generally discouraged.»
>
> «Extensions are reviewed carefully for malicious code, malware and security risks, but not for bugs.»

Причина правила «disable в любой момент» (Session Modes):

> «Be aware that when the session mode changes between user and unlock-dialog, GNOME Shell may call `disable()` and `enable()` on extensions. Extensions should be prepared to handle `disable()` being called at any time.»
>
> «Extensions MUST NOT disable selectively.» (review guidelines)

**Эволюция: от ID обработчиков к подпискам, привязанным к владельцу.** Порт-гайд 42: «GNOME Shell 42 uses
connectObject() and disconnectObject() convenience methods instead of connect() and disconnect() methods.» MR !1953
(Florian Müllner, открыт 2021-08-16):

> «This is a small experiment to make dealing with signals a bit more automatic and convenient.»
>
> «The additional object can be used to disconnect all handlers on the instance that were connected with that object, similar to `g_signal_handlers_disconnect_by_data()` (which cannot be used from introspection). For objects that are subclasses of Clutter.Actor, that will happen automatically when the actor is destroyed, similar to `g_signal_connect_object()`.»

Doc-комментарий в 51.1:

> «Connect one or more signals, and associate the handlers with a tracked object. All handlers for a particular object can be disconnected by calling disconnectObject(). If object is a destroyable type, this is done automatically when the widget is destroyed.»

**Урок через 4 года.** MR !4382 «Always pass tracked object to connectObject()» (2026-09-03):

> «Otherwise, the signal is tracked on `globalThis` and not disconnected automatically. Add a warning to connectObject() when the argument is missing, to catch these issues in the future.»

Сейчас в коде при отсутствии объекта вызывается `logError(new Error('No object to track signals'))`, и подписка
привязывается к `globalThis`. Связанные MR того же автора: !4383 «popupMenu: Don't use connectObject from
PopupMenuManager» и !4385 «brightnessManager: Make BrightnessScale destroyable» (оба сентябрь 2026). Они показывают, что
автоматическая очистка работает только для типов, зарегистрированных как «destroyable»
(`registerDestroyableType`).

### 4.3 KDE KParts (KF6 v6.31.0, 2026-10-02)

- Хост и встроенный компонент (part) общаются через объект-расширение. Хост находит его неявно, по дереву `QObject`:
  «The way to associate the BrowserExtension with the part is to simply create the BrowserExtension as a child of the part (in QObject's terms). The hosting application will look for it automatically.» (`navigationextension.h`)
- Действия связываются по имени слота: «The view defines a slot with the name of the action in order to implement the action. The browser will detect the slot automatically and connect its action to it when appropriate (i.e. when the view is active).»
- Эволюция: `KParts::Plugin` помечен «@deprecated Since 5.90, the concept of KPart plugins is deprecated.» (`plugin.h`, v5.116.0). В v6.31.0 файла `src/plugin.h` нет (HTTP 404). README.KF6: «The `KParts::Event` baseclass was removed in favor of events extending `QEvent` directly.» Метаданные плагина теперь передаются явно в конструктор: «This method was removed in favor of passing the KPluginMetaData object directly into the constructor of the KParts baseclass.»

My assessment: KParts — пример неявного обнаружения по дереву объектов и по строковым именам слотов. Механизм работает,
но контракт виден только из документации. Отказ от «KPart plugins» в KF5.90 не сопровождён в найденных источниках
развёрнутым обоснованием (**UNVERIFIED**, почему именно).

---

## 5. LibreOffice UNO (core master `c06d26a`, 2026-10-16; DevGuide «Professional UNO», правка 2025-08-07)

Источники:
- `udkapi/com/sun/star/lang/XEventListener.idl`, `XComponent.idl`;
- <https://wiki.documentfoundation.org/Documentation/DevGuide/Professional_UNO>, разделы «Lifetime of UNO Objects», «The XComponent Interface», «Children of the XEventListener Interface».

**Владеть и знать — разные вещи** (`XComponent.idl`):

> «Actually the real lifetime of a UNO object is controlled by references kept on interfaces of this object. But there are two distinct meanings in keeping a reference to an interface: 1st to own the object and 2nd to know the object.»
>
> «You are only allowed to keep references of interfaces to UNO objects if you are by definition the owner of that object or your reference is very temporary or you have registered an EventListener at that object and release the reference when "disposing" is called.»

**Один владелец** (DevGuide):

> «UNO uses an *owner/user concept* for this purpose. Only the owner of an object is allowed to call dispose and there can only be one owner per object. The owner is always free to dispose of the object. The user of an object knows that the object may be disposed of at anytime.»
>
> Warning: «One major problem of the owner/user concept is that there always must be someone who calls `dispose()`. This must be considered at the design time of the services and interfaces, and be specified explicitly.»
>
> «The owner/user concept may not always be appropriate, especially when there is more than one possible owner. In these cases, there should be no owner but only users. In a multithreaded scenario, `dispose()` might be called several times.»

**Протокол `disposing`** (`XEventListener.idl`):

> «gets called when the broadcaster is about to be disposed. All listeners and all other objects, which reference the broadcaster should release the reference to the source. No method should be invoked anymore on this object ( including XComponent::removeEventListener() ).»
>
> «This method is called for every listener registration of derived listener interfaced, not only for registrations at XComponent.»

**Подписка после уничтожения и отписка после уничтожения** (`XComponent.idl`):

> «If this XComponent is already disposed when XComponent::addEventListener() is called, the call will not fail with a DisposedException, but the caller will be notified via the XEventListener::disposing() callback. This callback can occur synchronously within the addEventListener() call.»
>
> `removeEventListener`: «It is a "noop" if the specified listener is not registered.» «If this XComponent is already disposed when XComponent::removeEventListener() is called, the call will not fail with a DisposedException, but will rather be ignored silently.»
>
> «It is suggested to allow multiple registration of the same listener, thus for each time a listener is added, it has to be removed.»

**Цепочки** (DevGuide): «In a chain of broadcaster objects where every element is a listener of its predecessor and only
the root object is an `XComponent` that is being disposed, all the other chain links must handle the `disposing()` call
coming from their predecessor and call `disposing()` on their registered listeners.»

**Утечка через цикл и границу процесса** (DevGuide): «However, in the UNO world one never knows, whether object A and
object B really live in the same Java virtual machine. If they do, the ring reference is really garbage collected. If
they do not, the object leaks».

**Известная ловушка: уведомление уже снятого слушателя.** Michael Meeks, patch fdo#47368 (dev list, 2012-07-23,
<https://listarchives.libreoffice.org/global/dev/2012/msg12016.html>): проблема — «an unfortunately outdated copy of
listeners that can be emitted after they are removed», исправление — «This simple patch uses the list copy for safe
iteration, while checking the parent listener is still registered.»

Сводный отчёт об утечках слушателей в расширениях LibreOffice, на который можно сослаться: **UNVERIFIED**. Нашлись
только разрозненные отчёты о падениях при завершении работы (Red Hat Bugzilla 1175027 и другие) без общего вывода от
разработчиков.

---

## 6. Adobe UXP: связь между плагинами (страница без даты, manifest v5)

Источник: <https://developer.adobe.com/uxp/guides/how-to/inter-plugin-comm/>.

> «The Responder exposes a command or panel entrypoint and implements its behavior.»
>
> «The Requester must set the enablePluginCommunication permission to true in its manifest.json file»
>
> «Declare each command or panel that the Requester can use in the Responder's manifest.json file» «The Responder does not need an additional IPC permission.»
>
> «Before sending a request, confirm that responderPlugin exists and that responderPlugin.enabled is true.»
>
> «Inter-plugin communication works only within the same host application.» «showPanel() can show a panel, but it cannot hide one.»

Урок: плагины общаются только через объявленные в манифесте команды. Вызывающий объявляет разрешение и проверяет
доступность адресата. Общей шины и общих объектов нет.

---

## 7. Factorio (дополнительно, Runtime API 2.1.22): даёт отдельный урок

Источники:
- <https://lua-api.factorio.com/latest/classes/LuaBootstrap.html>;
- <https://lua-api.factorio.com/latest/classes/LuaRemote.html>;
- <https://lua-api.factorio.com/latest/auxiliary/data-lifecycle.html>.

- **Изоляция состояния:** «During this step, each mod's control.lua file is loaded and executed in their own Lua state that will be owned by them for the remainder of the play session. It allows a mod to register for events using the script object, register remote interfaces with the remote object, or register custom commands with the commands object.»
- **Один обработчик на событие для каждого мода:** «Each mod can only register once for every event, as any additional registration will overwrite the previous one. This holds true even if different filters are used for subsequent registrations.»
- **Связь между модами через именованные интерфейсы:** «An interface is simply a dictionary mapping names to functions. … after that any script can call the registered functions, provided it knows the interface name and the desired function name.» При совпадении имени: «If the name matches any existing interface, an error is thrown.»
- **Мод не может поднять чужое событие от имени движка:** «Raise an event. Only events generated with LuaBootstrap::generate_event_name and the following can be raised:» (дальше идёт короткий белый список).
- **Раунды вместо приоритетов на этапе данных:** «First, each mod's "stage.lua" file is run according to the usual sequence, then each mod's "stage-updates.lua" is run, after which each mod's "stage-final-fixes.lua" is run. … Changes to prototypes during either stage are tracked and a history of which mod has changed which prototype is recorded by the game.»
- **Детерминизм `on_load`:** «Doing anything other than the following three will lead to desyncs, breaking multiplayer and replay functionality. … The storage table can be accessed and is safe to read from, but not write to, as doing so will lead to an error.»

---

## 8. Литература по архитектуре игр

### 8.1 Robert Nystrom, «Game Programming Patterns» (gameprogrammingpatterns.com, © 2009–2021)

**Observer** (<https://gameprogrammingpatterns.com/observer.html>):

> «In fact, you have to be careful because the Observer pattern is synchronous. The subject invokes its observers directly, which means it doesn't resume its own work until all of the observers have returned from their notification methods. A slow observer can block a subject.»
>
> «If an observer tries to grab a lock that the subject has, you can deadlock the game.»
>
> «It's an observer's job to unregister itself from any subjects when it gets deleted.» / «As is often the case, the hard part isn't doing it, it's remembering to do it.»
>
> «Just have the subject send one final "dying breath" notification right before it gets destroyed.»
>
> «A safer answer is to make observers automatically unregister themselves from every subject when they get destroyed. … It means each observer will need a list of the subjects it's observing. You end up with pointers going in both directions.»
>
> «This is such a common issue in notification systems that it has a name: the lapsed listener problem. Since subjects retain references to their listeners, you can end up with zombie UI objects lingering in memory. The lesson here is to be disciplined about unregistration.»
>
> «But if that coupling happens through an observer list, the only way to tell who will get notified is by seeing which observers happen to be in that list at runtime. Instead of being able to statically reason about the communication structure of the program, you have to reason about its imperative, dynamic behavior.»
>
> «If you often need to think about both sides of some communication in order to understand a part of the program, don't use the Observer pattern to express that linkage. Prefer something more explicit.»
>
> «The observer pattern is a great way to let those mostly unrelated lumps talk to each other without them merging into one big lump. It's less useful within a single lump of code dedicated to one feature or aspect.»
>
> «If I were designing an observer system today, I'd make it function-based instead of class-based.»

**Event Queue** (<https://gameprogrammingpatterns.com/event-queue.html>):

> «If you only want to decouple who receives a message from its sender, patterns like Observer and Command will take care of this with less complexity. You only need a queue when you want to decouple something in time.»
>
> «Queues give control to the code that pulls from it … But queues do this by taking control away from the sender. … This makes queues a poor fit when the sender needs a response.»
>
> «A central event queue is a global variable … This pattern wraps that state in a nice little protocol, but it's still a global, with all of the danger that entails.»
>
> «When you receive an event, you have to be careful not to assume the current state of the world reflects how the world was when the event was raised. This means queued events tend to be more data heavy than events in synchronous systems.»
>
> «When your messaging system is synchronous, you find cycles quickly — they overflow the stack and crash your game. With a queue, the asynchrony unwinds the stack, so the game may keep running even though spurious events are sloshing back and forth in there. A common rule to avoid this is to avoid sending events from within code that's handling one.»
>
> Events и messages: «An "event" or "notification" describes something that already happened … You are likely to allow multiple listeners.» / «A "message" or "request" describes an action that we want to happen in the future … You are more likely to have a single listener.»
>
> «In most broadcast systems, if there are no listeners at the point in time that an event is processed, the event gets discarded.»
>
> «With one writer: … You implicitly know where the event is coming from.» / «With multiple writers: … You have to be more careful of cycles.»

**Service Locator** (<https://gameprogrammingpatterns.com/service-locator.html>):

> «Anytime you make something accessible to every part of your program, you're asking for trouble. … My simplest advice for when to use a service locator is: sparingly.»
>
> «Instead of using a global mechanism to give some code access to an object it needs, first consider passing the object to it instead. That's dead simple, and it makes the coupling completely obvious.»
>
> «The core difficulty with a service locator is that it takes a dependency … and defers wiring it up until runtime. This gives you flexibility, but the price you pay is that it's harder to understand what your dependencies are by reading the code.»
>
> «The service doesn't know who is locating it … So, if a class expects to be used only in a certain context, it's safest to avoid exposing it to the entire world with this pattern.»
>
> Про null service: «The downside is that it may be harder to debug an unintentionally missing service.»

**Component**, раздел «How do components communicate with each other?» (<https://gameprogrammingpatterns.com/component.html>):

> Общее состояние в контейнере: «It makes communication implicit and dependent on the order that components are processed.»
>
> Прямые ссылки: «The two components are tightly coupled. … we're at least restricting the coupling to only the component pairs that need to interact.»
>
> Сообщения через контейнер: «Sibling components are decoupled. By going through the parent container object … The Gang of Four call this the Mediator pattern».
>
> «Unsurprisingly, there's no one best answer here. What you'll likely end up doing is using a bit of all of them. … Messaging is useful for "less important" communication. … As always, I recommend you start simple and then add in additional communication paths if you need them.»

### 8.2 Jason Gregory, «Game Engine Architecture»

**UNVERIFIED.** Дословную цитату о событиях и обмене сообщениями из открытого источника получить не удалось: поиск
2026-10-16 нашёл только карточки изданий, в том числе 4-е издание, том I, 2026-03-17. Книгу не цитирую.

---

## 9. Лучшие практики (с источниками)

| # | Практика | Где сформулировано |
|---|---|---|
| G1 | Модуль не зависит от окружения, зависимости передаёт родитель или владелец (DI) | Godot `scene_organization.rst` «design scenes to have no dependencies» |
| G2 | Сигнал или событие реагирует на прошлое, вызов метода или инъекция `Callable` запускает действие | Godot: «"respond" to behavior, not start it» / «Used to start behavior»; Нистром: events и messages |
| G3 | Соседи знают только свою иерархию, связи держит предок или владелец | Godot «an ancestor mediates»; «Whichever object owns the other objects should manage the relationships»; Нистром, Component (Mediator) |
| G4 | Глобальный объект допустим, только если он владеет своими данными и не лезет в чужие | Godot autoloads «not invading the data of other objects» |
| G5 | Канал или шина на каждый тип события, объявленный рядом с событием; один экземпляр на тип | Forge EventBus 7 «every event has its own bus»; Fabric «`Event<>` objects should be in the class declaring the event» |
| G6 | Ошибки подписки ловятся на этапе компиляции или регистрации, а не тишиной в рантайме | Forge EB7 validator; NeoForge 7.0.14 «Will error if…»; Paper Lifecycle «compiler error»; Fabric «Strongly validate inputs» |
| G7 | Регистрация допустима только в правильной фазе, и это проверяется | Paper Lifecycle «which events you can register where»; GNOME «Don't create or modify anything before `enable()`» |
| G8 | Решение (allow, veto) отделено от уведомления (before, after) | Fabric #1121 и `CONTRIBUTING.md` «false notifications» |
| G9 | Наблюдатель итогового состояния не может менять событие, и это обеспечивается механизмом | Forge EB7 `MonitorAware` (бросает исключение); Bukkit «No modifications … should be made» (только соглашение) |
| G10 | Отмена — результат слушателя, а не изменяемое состояние события; отменённое нельзя вернуть | Forge EB7 «You can't uncancel an event» |
| G11 | Подписка привязана к явному владельцу и снимается вместе с ним | Blender `subscribe_rna(owner)` + `clear_by_owner`; GNOME `connectObject(..., owner)`; Bukkit `unregisterAll(Plugin)` |
| G12 | Плагин обязан отменить всё, что сделал при включении; выключение возможно в любой момент | GNOME review guidelines «MUST … in `disable()`», session modes «at any time» |
| G13 | Один владелец уничтожает объект; пользователи получают уведомление `disposing` и отпускают ссылку | UNO owner/user concept |
| G14 | Подписка на уже уничтоженный источник сразу получает `disposing`, отписка от него — no-op | UNO `XComponent.idl` |
| G15 | Снимок списка слушателей плюс проверка, что слушатель ещё зарегистрирован | LibreOffice fdo#47368 (Meeks 2012) |
| G16 | Наблюдение за чужим значением идёт после завершения операции и склеивается до одного вызова за цикл | Blender msgbus «postponed until all operators have finished», «only triggered once per update cycle» |
| G17 | Между модулями хранить ID или ключи, а не прямые ссылки на чужие данные | Blender «use indices (or other data always stored by value…)» |
| G18 | Порядок расширений: сначала отдельные целевые события, потом фазы, которые объявляет владелец точки расширения, и только потом приоритеты | Fabric `createWithPhases`, «purpose-driven events should always be preferred», «discussion with the author of the Event» |
| G19 | Событие не нужно, если подписчик один | Fabric `CONTRIBUTING.md` |
| G20 | Параметры события собраны в контекст-объект, чтобы контракт мог развиваться без поломки | Fabric `CONTRIBUTING.md` |
| G21 | Межмодульные сообщения в два этапа: отправка в одной фазе, обработка в следующей | Forge и NeoForge InterModComms |
| G22 | Плагины изолированы, доступ к другому плагину только после явной зависимости | Paper classloader isolation; Factorio отдельный Lua state; UXP объявленные entrypoints + разрешение |
| G23 | Кэш чужой возможности проверяет свою валидность и получает уведомления об инвалидации от владельца | NeoForge `BlockCapabilityCache` (validity check + invalidation listener) |
| G24 | Очередь событий только для развязки во времени; события в очереди несут данные, а не ссылки на мир | Нистром, Event Queue |
| G25 | Observer только между слабо связанными «кусками»; внутри одного куска прямые вызовы | Нистром, Observer |
| G26 | Один мод — один обработчик на событие (повторная регистрация заменяет) | Factorio `on_event` |
| G27 | Мод не может поднять событие, принадлежащее движку | Factorio `raise_event` (белый список) |

## 10. Худшие практики (с источниками)

| # | Антипаттерн | Где задокументировано |
|---|---|---|
| W1 | Глобальный менеджер или синглтон, меняющий чужие данные («Global state / access / allocation») | Godot autoloads |
| W2 | Одна глобальная шина на все события: слушатель на «не той» шине тихо не вызывается | Forge EB7 migration «silently not being called»; NeoForge 20.2 «prevent subscribing to the wrong event bus» |
| W3 | Много писателей одного исхода плюс «последний выигрывает» по приоритету, отменённое можно вернуть | Bukkit wiki «A plugin can actually uncancel…»; Forge EB6 `receiveCanceled` / «pre-cancelled state» |
| W4 | MONITOR «только для чтения» лишь по соглашению | Bukkit «or it'll break other plugins»; ответ Forge EB7: `MonitorAware` |
| W5 | Совмещённые «отменить и уведомить» в одном событии дают ложные уведомления | Fabric `CONTRIBUTING.md`, #1121 |
| W6 | Числовые приоритеты как способ выразить зависимости | Fabric (Player3324) «Priorities … ultimately fail»; противоположное мнение — Forge EB7 (см. раздел 11) |
| W7 | Противоположные соглашения о приоритетах в одной экосистеме | Bukkit «somewhat counter-intuitive»; Forge HIGHEST первым; Paper Lifecycle «lower number earlier» |
| W8 | Побочные эффекты на событии (вызов сеттера неявно отменяет) | Forge EB7 о `FurnaceFuelBurnTimeEvent` |
| W9 | Неявное наследование событий: подписка на базовый тип ловит лишнее или ничего | Forge EB7 `InheritableEvent`; NeoForge «abstract events cannot be listened to» |
| W10 | Владелец подписки выводится неявно из колбэка; замыкание его теряет | Godot C# «Godot can't tell that the lambda is associated with the instance» |
| W11 | Владелец подписки — необязательный аргумент; без него подписка «глобальная» и не снимается | GNOME Shell MR !4382 «tracked on `globalThis`» |
| W12 | Строковые ключи сигналов без проверки | GLib #3540 «notify::non-existant-property succeeds»; Factorio `remote.call(name, fn)` |
| W13 | Ручная симметрия register/unregister | Нистром «the hard part isn't doing it, it's remembering»; пример Blender без `remove(menu_func)` |
| W14 | Хранить прямые ссылки на чужие данные между изменениями | Blender «Help! My script crashes Blender» |
| W15 | Уведомлять слушателя, которого уже сняли (устаревший снимок) | LibreOffice fdo#47368 |
| W16 | Цикл ссылок «источник ↔ слушатель» без явного dispose | UNO DevGuide «there always must be someone who calls `dispose()`» |
| W17 | Неявное обнаружение по дереву объектов и по именам слотов | KParts `NavigationExtension` (моя оценка, см. 4.3) |
| W18 | Центральная очередь событий как «Grand Central Station» | Нистром «it's still a global» |
| W19 | Отправлять события из обработчика события (петли) | Нистром «avoid sending events from within code that's handling one» |
| W20 | Service locator вместо передачи зависимости | Нистром «sparingly», «harder to understand what your dependencies are» |
| W21 | Межпоточная доставка в объект, который уничтожается | GLib #494 (открыт с 2012); Blender handlers в рендер-потоке |
| W22 | Глобальные хуки, сбрасываемые неявно (при загрузке файла), с ручным флагом «persistent» | Blender `@persistent`, `subscribe_rna` «cleared when another blend file is loaded» |

---

## 11. Уроки эволюции: что бросили и почему

1. **Forge: глобальная шина → шина на тип события (2025, EventBus 7).**
   - Причина: «your event listener silently not being called due to registering it on the wrong bus».
   - Попутно убрали изменяемую отмену, `receiveCanceled`, неявное наследование, `EventPriority` и `GenericEvent`.
   - Добавили проверку на этапе компиляции и `MonitorAware`.
   - Важно: Forge выбрал **число** вместо топологических ограничений, чтобы избежать тихих опечаток в строковых именах
     фаз. Fabric выбрал **именованные фазы** и признаёт, что противоречивые ограничения дают «inconsistent behavior».
     Это реальное расхождение двух зрелых проектов. Оба сходятся в том, что лучший ответ — разбить событие на
     несколько целевых.
2. **NeoForge (2023): та же цель, другой путь.**
   - Нельзя слушать абстрактные события, шина модов отвергает чужие события, удалены хуки ModLauncher.
   - Переработка capabilities: поведение (capabilities) отделено от данных (attachments); `LazyOptional` заменён
     кэшем с проверкой валидности и слушателем инвалидации.
   - Причина: «issues that were found in the previous iteration after years of usage».
3. **Fabric: с 2019 года нет `unregister` по принципу.** События — это хуки, а не уведомления. Спустя 7 лет открыт PR
   #5619 «Scoped Event Listeners», то есть спрос на подписки с временем жизни так и не исчез. Решения на 2026-10-16
   нет.
4. **Fabric (2020–2023): совмещённое событие `PlayerBlockBreakEvents` признано ошибкой.** Стандартом стала схема
   `Allow → Before → action → After`, она записана в `CONTRIBUTING.md`.
5. **Paper: вторая система событий (Lifecycle API).** Причины: в Bukkit нет обобщённых типов («0 compile time
   checking»), приоритеты есть всегда, регистрация привязана к `Plugin`, который ещё не существует. Paper-плагины
   получили изоляцию classloader и отказ от разрешения циклов.
6. **GNOME Shell 42 (2022): `connect`/`disconnect` по ID → `connectObject` с владельцем.** В 2026 году добавлено
   предупреждение, потому что владелец оказался необязательным и подписки утекали в `globalThis`.
7. **Godot 4.0: строковые сигналы → тип первого класса** («less error-prone»). В 4.1 появились `static var` как способ
   обойтись без autoload. Уникальные имена в сцене ограничены её границей и решают проблему хрупких путей.
8. **Blender 4.2: add-ons → extensions** с пространством имён репозитория из-за конфликтов имён.
9. **KDE KF5.90 → KF6: концепция «KPart plugins» объявлена устаревшей и удалена.** `KParts::Event` заменён на `QEvent`,
   метаданные передаются явно в конструктор.
10. **NeoForge bus 7.0.13 → 7.0.17:** сначала исключение при публикации до старта шины, потом возврат к тихому
    поведению. Причина отката **UNVERIFIED**.

Общий вектор. Все зрелые системы движутся от неявного и строкового к явному и типизированному:
- от одной шины к каналу на тип;
- от изменяемой отмены к результату слушателя;
- от соглашения «не меняй в MONITOR» к исключению;
- от «помни отписаться» к подписке с обязательным владельцем;
- от глобального состояния к явной зависимости с изоляцией.

---

## 12. My assessment: что GM стоит взять и чего избегать

Оговорка о переносимости. Игровые и модовые экосистемы — это открытые миры тысяч независимых модов **без корня
композиции** и часто с жёсткими требованиями к производительности кадра. В GM есть корень композиции с явными строками
привязок, и это снимает целый класс их проблем: порядок и конфликт писателей можно решить в корне, а не приоритетами.
Поэтому уроки про приоритеты и отмену ниже применимы в основном к точкам расширения `many()` для плагинов, а не к
обычным связям. Оценки: надёжность / уверенность по 10-балльной шкале.

### 12.1 Родитель → ребёнок

- **Брать.** Типизированные входы при создании плюс инъекция «порта-команды» (аналог Godot `Callable` property:
  «Safer than a method as ownership of the method is unnecessary»). Ребёнок никогда не ищет зависимость по пути или
  имени, только через слот. Нарушение должно быть видно на этапе сборки, как `_get_configuration_warnings()`, только
  жёстче: ошибка проверки графа. Надёжность 9 / уверенность 9.
- **Избегать.** Поиска по пути или имени и «ambient»-доступа к окружению (аналоги Godot NodePath, KParts «look for it
  automatically»). Надёжность 9 / уверенность 8.

### 12.2 Ребёнок → родитель

- **Брать.** Ребёнок публикует read-only facet своего состояния. Для намерений у него есть собственный исходящий
  типизированный порт, который подключает родитель в строке привязки. Это ровно официальная формула Godot: сигнал
  реагирует, вызов запускает. Ссылки на родителя у ребёнка нет. Надёжность 9 / уверенность 9.
- **Если нужно вето** (родитель или плагины могут запретить действие): отдельный контракт `allow`, а не флаг отмены в
  уведомлении. Уведомление о свершившемся идёт только после решения (Fabric `Allow → Before → After`). Надёжность 8 /
  уверенность 8.

### 12.3 Соседи и далёкие модули

- **Брать.** Соседей связывает общий предок или корень композиции (Godot «an ancestor mediates»; UNO «the owner …
  should manage the relationships»). Общих значений у соседей нет: у каждого значения один писатель, остальные читают
  facet. Это уже принятая модель, и Godot, UNO и Factorio (отдельный storage на мод) её подтверждают. Надёжность 9 /
  уверенность 9.
- **Избегать.** Широковещания по строковым группам (Godot `call_group`) и глобальной шины. Если события появятся
  позже, они должны быть устроены как в Forge EventBus 7: канал принадлежит типу события и объявлен рядом с ним, по
  одному на тип в пределах группы, подписка типобезопасна, отмены и «вето» по умолчанию нет. Надёжность 8 /
  уверенность 8.
- **Observer (watch) только между слабо связанными модулями.** Внутри одного модуля нужны прямые вызовы. Совет
  Нистрома: если для понимания нужно видеть обе стороны, нужна явная связь. Надёжность 8 / уверенность 8.

### 12.4 Плагины и точки расширения (`many()`)

- **Брать.** `many()` — это «хук» в смысле Fabric: вклад регистрируется один раз при сборке и снимается только вместе
  с областью видимости плагина целиком (`unregisterAll(Plugin)` в Bukkit, `disable()` в GNOME). Точечного `unregister`
  в публичном контракте нет. Fabric 7 лет держится без него, но спрос на scoped-подписки показывает, что нужна именно
  привязка к области видимости, а не ручная отписка. Надёжность 8 / уверенность 8.
- **Брать.** Регистрацию в неправильной фазе или в неправильном месте должна ловить проверка типов (Paper Lifecycle:
  «you can't even register a handler for an event in the wrong spot») или проверка графа. Надёжность 8 /
  уверенность 7.
- **Порядок вкладов.** По умолчанию используется порядок строк привязки в корне композиции. Если его не хватает, нужны
  именованные фазы, которые объявляет владелец точки расширения (Fabric `createWithPhases`), без числовых приоритетов.
  Сначала стоит проверить, нельзя ли разбить точку на несколько. Надёжность 7 / уверенность 7: Forge и Fabric здесь
  расходятся, в GM корень композиции снимает большую часть проблемы.
- **Read-only наблюдение.** Если GM даёт плагину facet, неизменяемость должна обеспечиваться механизмом (frozen или
  readonly-вид, ошибка при записи), как `MonitorAware`, а не соглашением, как в Bukkit MONITOR. Надёжность 9 /
  уверенность 8.
- **Изоляция.** Плагин видит только то, от чего явно зависит (Paper classloader isolation, Factorio отдельный Lua state,
  UXP объявленные entrypoints). Плагины не общаются напрямую, только через контракты хоста. Надёжность 8 /
  уверенность 8.

### 12.5 Жизненный цикл и память

- **Область видимости — обязательный параметр подписки (`watch`), а не вывод из колбэка и не необязательный
  аргумент.** Это два независимых реальных провала: Godot C# с замыканиями и GNOME `connectObject` без владельца,
  предупреждение добавлено через 4 года. Надёжность 10 / уверенность 9.
- **Подписка на уже уничтоженный источник** немедленно получает «источник ушёл» (UNO `addEventListener` после
  `dispose`) и не бросает исключение. **Отписка после уничтожения** — no-op. Надёжность 9 / уверенность 8.
- **Доставка по снимку списка подписчиков с проверкой, что подписка ещё жива** (LibreOffice fdo#47368). Отписка во
  время рассылки вступает в силу сразу. Надёжность 9 / уверенность 9.
- **Watch по уровню, со склейкой** (Blender msgbus «once per update cycle», «postponed until all operators have
  finished»). Это совпадает с A5 в `PRACTICES.md`. Надёжность 8 / уверенность 8.
- **Один владелец уничтожает** (UNO «only one owner per object»). Дерево областей видимости GM прямо отвечает на
  предупреждение UNO «there always must be someone who calls dispose()»: этим кем-то всегда становится родительская
  область. Надёжность 9 / уверенность 9.
- **Держать ID и ключи, а не ссылки на чужие данные** (Blender). Для динамических экземпляров потребитель хранит
  handle или ID и разрешает его через facet. Надёжность 8 / уверенность 8.
- **Кэш необязательной зависимости** проверяет собственную валидность (NeoForge «the cache might outlive the object it
  belongs to»). Надёжность 7 / уверенность 7.

### 12.6 События отложены: подтверждение и риски

Нистром прямо поддерживает отсрочку: очередь нужна только для развязки во времени, центральная очередь — глобальная
переменная, события в очереди должны нести данные. Опыт Forge и Bukkit показывает, что основная сложность событийных
систем — отмена, приоритеты, наследование и «не та шина». Модель «facet + watch» её обходит. Надёжность 9 /
уверенность 8.

**Риск, о котором нужно сказать честно.** Fabric отказался от отписки ради «хуков», и через несколько лет сообщество всё
равно пришло с запросом на scoped-подписки. Если GM будет слишком долго откладывать хоть какой-то путь для
факт-событий (например, «игрок вошёл», «документ сохранён»), потребители начнут делать их через watch на счётчик или
через эффекты. Это антипаттерн A-3 из каталога. Рекомендация: заранее зафиксировать форму будущих событий (канал на
тип, принадлежит издателю, без отмены, доставка по снимку, подписка только с областью видимости), даже если реализация
отложена. Надёжность 7 / уверенность 7.

---

## Приложение A. Источники с версиями

- Godot docs, `godotengine/godot-docs` master `f81cf710eade4077ff11bd4eac9d7d9b507b3734` (2026-10-15): <https://github.com/godotengine/godot-docs>; отрендерено «Godot Engine 4.7 documentation»: <https://docs.godotengine.org/en/stable/tutorials/best_practices/scene_organization.html>.
- Godot `doc/classes/Object.xml` @ `4.7.2-stable` (2026-08-18): <https://github.com/godotengine/godot/blob/4.7.2-stable/doc/classes/Object.xml>.
- Wikibooks, «Guide to the Godot game engine/Signals and methods» (вторичный источник): <https://en.wikibooks.org/wiki/Guide_to_the_Godot_game_engine/Signals_and_methods>.
- MinecraftForge/Documentation @ `ac05e12` (2025-08-16): <https://github.com/MinecraftForge/Documentation/blob/1.21.x/docs/concepts/events.md>, `lifecycle.md`.
- MinecraftForge/EventBus @ `588a6c7` (2026-09-03): <https://github.com/MinecraftForge/EventBus>.
- Руководство по миграции на EventBus 7 (обновлено 2026-07-01): <https://gist.github.com/PaintNinja/ad82c224aecee25efac1ea3e2cf19b91>.
- Changelog Forge 1.21.6-56.0.0: <https://maven.minecraftforge.net/net/minecraftforge/forge/1.21.6-56.0.0/forge-1.21.6-56.0.0-changelog.txt>.
- NeoForge, «Event system changes in NeoForge 20.2» (2023-10-30): <https://neoforged.net/news/20.2eventbus-changes/>.
- NeoForge, «The Capability rework» (2023-12-05): <https://neoforged.net/news/20.3capability-rework/>.
- NeoForge bus changelog 8.0.0: <https://maven.neoforged.net/releases/net/neoforged/bus/8.0.0/bus-8.0.0-changelog.txt>.
- neoforged/Documentation @ `7bc4d2f` (2026-10-09): <https://github.com/neoforged/Documentation/blob/main/docs/concepts/events.md>.
- FabricMC/fabric-api @ `33b3690` (2026-10-14): <https://github.com/FabricMC/fabric-api/tree/33b369075baa5ad6c969f44787a18bf2c3ea0a5d/fabric-api-base/src/main/java/net/fabricmc/fabric/api/event>, `CONTRIBUTING.md`.
- Fabric issue #180: <https://github.com/FabricMC/fabric-api/issues/180>; #1121: <https://github.com/FabricMC/fabric-api/issues/1121>; PR #5619: <https://github.com/FabricMC/fabric-api/pull/5619>; #5041, #5285.
- Fabric docs «Events» (26.2): <https://docs.fabricmc.net/develop/events>.
- PaperMC/Paper @ `09ee222` (2026-10-16): `paper-api/src/main/java/org/bukkit/event/EventPriority.java`, `EventHandler.java`, `Cancellable.java`, `HandlerList.java`.
- Bukkit wiki «Event API Reference» (правка 2019-08-04): <https://bukkit.fandom.com/wiki/Event_API_Reference>.
- PaperMC/docs @ `630d65d`: <https://docs.papermc.io/paper/dev/lifecycle/>, <https://docs.papermc.io/paper/dev/event-listeners/>, <https://docs.papermc.io/paper/dev/getting-started/paper-plugins/>.
- Blender Python API 5.2: <https://docs.blender.org/api/current/bpy.msgbus.html>, <https://docs.blender.org/api/current/bpy.app.handlers.html>, <https://docs.blender.org/api/current/info_gotchas_crashes.html>, <https://docs.blender.org/api/current/info_gotchas_operators.html>.
- Руководство Blender (2026-10-16): <https://docs.blender.org/manual/en/latest/advanced/extensions/addons.html>, <https://docs.blender.org/manual/en/latest/advanced/scripting/addon_tutorial.html>.
- GObject (GLib 2.91.0): <https://docs.gtk.org/gobject/func.signal_connect_object.html>, <https://docs.gtk.org/gobject/concepts.html>.
- GLib issues: <https://gitlab.gnome.org/GNOME/glib/-/issues/494>, <https://gitlab.gnome.org/GNOME/glib/-/issues/3540>.
- gjs.guide (HEAD `e12290ac`, 2026-10-14): <https://gjs.guide/extensions/review-guidelines/review-guidelines.html>, <https://gjs.guide/extensions/topics/session-modes.html>, <https://gjs.guide/extensions/upgrading/gnome-shell-42.html>.
- gnome-shell 51.1 `js/misc/signalTracker.js`: <https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/51.1/js/misc/signalTracker.js>.
- gnome-shell MR !1953: <https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/1953>; MR !4382: <https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/4382>.
- KDE KParts v6.31.0: <https://invent.kde.org/frameworks/kparts/-/blob/v6.31.0/src/navigationextension.h>; README.KF6.md (master); v5.116.0 `src/plugin.h`.
- LibreOffice core @ `c06d26a` (2026-10-16): `udkapi/com/sun/star/lang/XEventListener.idl`, `XComponent.idl`.
- LibreOffice DevGuide «Professional UNO» (правка 2025-08-07): <https://wiki.documentfoundation.org/Documentation/DevGuide/Professional_UNO>.
- LibreOffice dev list, 2012-07-23: <https://listarchives.libreoffice.org/global/dev/2012/msg12016.html>.
- Adobe UXP, «Communicate between plugins»: <https://developer.adobe.com/uxp/guides/how-to/inter-plugin-comm/>.
- Factorio Runtime API 2.1.22: <https://lua-api.factorio.com/latest/classes/LuaBootstrap.html>, <https://lua-api.factorio.com/latest/classes/LuaRemote.html>, <https://lua-api.factorio.com/latest/auxiliary/data-lifecycle.html>.
- Robert Nystrom, «Game Programming Patterns» (© 2009–2021): <https://gameprogrammingpatterns.com/observer.html>, <https://gameprogrammingpatterns.com/event-queue.html>, <https://gameprogrammingpatterns.com/service-locator.html>, <https://gameprogrammingpatterns.com/component.html>.
- Jason Gregory, «Game Engine Architecture»: **UNVERIFIED**, не цитируется.
