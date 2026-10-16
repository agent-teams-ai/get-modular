# Проектный уровень: как общаются модули в больших прикладных платформах (2026-10-16)

Исследование для Get Modular (GM). Область: настоящие долгоживущие прикладные платформы с модулями и плагинами.
Проекты: Medusa v2, Home Assistant, Magento 2 (Adobe Commerce), Odoo, Django signals, GitLab (модульный монолит и
`Gitlab::EventStore`), Node-RED и n8n, Strapi, Discourse, Temporal. Каталог `PRACTICES.md` и уже покрытые проекты
(Spring Modulith, Shopify/Packwerk, DDD, NestJS, Symfony, Laravel, Rails notifications, ABP, WordPress, Drupal) здесь
не повторяются.

## 0. Метод и легенда

- Цитаты дословные, на языке оригинала. Короткие цитаты взяты из сырого markdown в репозиториях документации
  (через `gh api` на закреплённом коммите) или из HTML, который я скачал и из которого извлёк текст. Пересказы
  инструмента WebFetch как цитаты не использовались, кроме двух мест, которые помечены.
- **[ДОК]** означает официальную документацию. **[КОД]** означает моё чтение исходников на указанном теге или коммите,
  и вывод о поведении тоже мой. **[БЛОГ]** означает блог или PR мейнтейнеров. **[СООБЩЕСТВО]** означает форум или
  практика, это не первоисточник. **UNVERIFIED** означает, что онлайн я это не проверил.
- Мои выводы собраны в разделах «My assessment:».
- Сегодня 2026-10-16. Все страницы открывались 2026-10-16.

### Версии и снимки источников

| Проект | Версия или снимок |
|---|---|
| Medusa | релиз `v2.21.2` (2026-09-28); docs.medusajs.com, версия на страницах не указана; блог «Medusa v2.0 Release», 2024-10-23 |
| Home Assistant | core `2026.10.1` (2026-10-10); `home-assistant/developers.home-assistant`, коммит `50b5188` (2026-10-16) |
| Magento / Adobe Commerce | исходники `magento/magento2`, тег `2.4.9`; `AdobeDocs/commerce-php`, коммит `80d81d1` (2026-09-23); `AdobeDocs/commerce-extensibility`, коммит `8062580` (2026-10-09) |
| Odoo | `odoo/documentation`, ветка `19.0`, коммит `9cd92fb` (2026-10-16); исходники `odoo/odoo`, ветка `19.0` |
| Django | `django/django`, docs на ветке `stable/6.1.x` |
| GitLab | `gitlab-org/gitlab`, `master`, коммит `1697a46` (2026-10-16); handbook `gitlab-com/content-sites/handbook`, `main`, design doc обновлён 2026-06-15 |
| Node-RED | `node-red/node-red.github.io`, коммит `9e05681` (2026-10-08); последний релиз Node-RED `5.0.8` |
| n8n | `n8n-io/n8n-docs`, коммит `3c4fb01` (2026-10-16); последний релиз `n8n@2.43.7` |
| Strapi | `strapi/documentation`, коммит `cd39292` (2026-10-16); последний релиз `v5.58.0` |
| Discourse | исходники, тег `v2026.9.0`; темы на meta.discourse.org через JSON API |
| Temporal | `temporalio/documentation`, коммит `e3473e3` (2026-10-16) |

---

## 1. Medusa v2

### 1.1 Родитель → ребёнок

- Конфигурация передаётся при сборке. Опции модуля задаются в `medusa-config.ts` и приходят вторым аргументом
  конструктора главного сервиса. [ДОК] https://docs.medusajs.com/learn/fundamentals/modules/options:
  > "A module can receive options to customize or configure its functionality."
  > "the module's main service receives the module options as a second parameter."
- У каждого модуля свой DI-контейнер. [ДОК] https://docs.medusajs.com/learn/fundamentals/modules/isolation:
  > "A module is unaware of any resources other than its own, such as services or data models."
- Зависимость одного модуля от другого можно внедрить явно через `dependencies` в `medusa-config.ts`, но документация
  разрешает это только как исключение (та же страница):
  > "Warning: Use this approach only when absolutely necessary, where workflows aren't sufficient for your use case.
  > By injecting dependencies, you risk breaking your module if the dependency isn't provided, or if the dependency's
  > API changes."
  > "Note: Only the main service will be injected into the module's container."

### 1.2 Ребёнок → родитель

Модуль не знает, кто его вызывает, и ничего не вызывает наверх. Наверх идут события. Для «встройки» в основной поток
есть workflow hooks, и у каждого хука ровно один обработчик.
[ДОК] https://docs.medusajs.com/learn/fundamentals/workflows/workflow-hooks:
> "A hook can have only one handler. So, you can't consume the same hook multiple times."

Обработчик хука сам является шагом и может иметь компенсацию. Некоторые хуки возвращают значение, которое использует
следующий шаг (например `setTaxLineContext`, доступен с v2.16.0, по пересказу WebFetch той же страницы).

### 1.3 Соседи и далёкие модули

Три механизма с чётким разделением ролей.

1. **Module Links** для связей данных. Связь хранится в отдельной таблице, которой не владеет ни один из двух модулей.
   В таблице только ID, без внешнего ключа.
   [ДОК] https://docs.medusajs.com/learn/fundamentals/module-links:
   > "These columns store only the IDs of the linked records and do not hold a foreign key constraint."
   > "Don't use module links if: You want to create a relationship between data models in the same module."

   Есть read-only links. Они ничего не хранят и разрешают связь по ID в поле, в том числе для внешних систем.
   [ДОК] https://docs.medusajs.com/learn/fundamentals/module-links/read-only:
   > "Consider a scenario where you need to access related records from another module, but don't want the overhead of
   > managing or storing the links between them."
2. **Query** для чтения через несколько модулей (`query.graph`).
3. **Workflows** для операций, которые меняют несколько модулей. Шаг workflow обычно работает с одним модулем.
   [БЛОГ] https://medusajs.com/blog/v2-release (Oliver Juhl, 2024-10-23):
   > "Steps are reusable pieces of logic, typically isolated to a single module, and can be seen as atomic operations.
   > If any steps fail, the entire workflow is rolled back. A rollback triggers compensating actions for each step that
   > reverts the corresponding successful action previously run."
4. **События и subscribers** только для побочных действий.
   [ДОК] https://docs.medusajs.com/learn/fundamentals/events-and-subscribers:
   > "Subscribers are useful to perform actions that aren't integral to the original flow."
   > "Note: If the action you're performing is integral to the main flow of the core commerce feature, use workflow
   > hooks instead."

### 1.4 Как обеспечивается изоляция

На уровне контейнера: модуль физически не может разрешить чужой сервис из своего контейнера. Пример из той же страницы
про изоляцию:
> "For example, your custom module can't resolve the Product Module's main service or have direct relationships from
> its data model to the Product Module's data models."

Статического линтера границ я не нашёл (UNVERIFIED, что его нет). Изоляция обеспечивается тем, что в контейнере модуля
нет чужих ресурсов.

### 1.5 Ошибки и порядок

- Событие из workflow публикуется только после успешного завершения workflow.
  [ДОК] https://docs.medusajs.com/learn/fundamentals/events-and-subscribers/emit-event:
  > "it only emits the event after the workflow has finished successfully."
- [КОД] `packages/modules/event-bus-local/src/services/event-bus-local.ts` на `v2.21.2`. События с `eventGroupId`
  копятся и выпускаются явно:
  > "This is useful in the event of a distributed transaction where you'd want to emit events only once the
  > transaction ends."

  Обработчик subscriber обёрнут в `try/catch`. Ошибка пишется в лог и дальше не идёт:
  `this.logger_.error(\`An error occurred while processing ${event.toString()}:\`)`. Доставка отложена через
  `delay(...).then(...)`, то есть `emit` не ждёт подписчиков. Перед выпуском группа копируется через
  `JSON.parse(JSON.stringify(groupedEvents))`. Мой вывод: в локальной шине ошибка подписчика не влияет на издателя и на
  других подписчиков. Поведение Redis-шины я не проверял (UNVERIFIED).
- Долгие workflow: если асинхронный шаг упал, запускаются компенсации предыдущих шагов (пересказ WebFetch страницы
  https://docs.medusajs.com/learn/fundamentals/workflows/long-running-workflow).

### 1.6 Эволюция v1 → v2 и почему

[БЛОГ] https://medusajs.com/blog/v2-release (2024-10-23), дословно:
> "In Medusa 1.0, services, e.g., Product and Cart, held most cross-domain business logic, and relationships between
> data models were defined via foreign keys in the database. The Cart service strictly depended on the Product service
> for many operations [...] This pattern was applied to all domains in Medusa 1.0, and made it near-impossible to
> partially adopt our feature offering—it was all or nothing—a dealbreaker for some of our users, especially in the
> enterprise segment."

> "These interdependencies between domains significantly constrained the level of extensibility we could offer in the
> service layer. The only way to “extend” services was to override entire methods, which led to nasty upgrade paths
> whenever we upgraded those service methods with additional logic."

> "Medusa 2.0 eliminates all interdependencies between domains. Services are now pure in the sense that they only
> manage resources within their domain. All cross-domain functionality has been moved to extensible workflows [...]
> We’ve also eliminated all database-level dependencies, removing foreign keys between data models in different
> modules."

О цене этого решения:
> "Eliminating database-level dependencies between modules doesn’t come without tradeoffs. Cross-domain references no
> longer leverage traditional database foreign keys, so we’ve introduced our own mechanism, Module Linking"

> "We can no longer expand relations with traditional ORM tooling, as those relations (across domains) no longer exist."

О сервисах после изоляции:
> "So, when you use the Cart service to create a cart, you only create a cart. This sounds obvious, but in monolithic
> architectures, it’s common to carry out cross-domain operations within single service methods."

Предыстория: «Announcing Modules», Carlos Rodrigues, 2023-04-04 (https://medusajs.com/blog/announcing-modules/).
Модули там описаны как заменяемые и переносимые части. Конкретных проблем v1 этот пост не называет.

### 1.7 Лучшие и худшие практики, которые Medusa называет сама

- Лучшие: модуль владеет только своими данными; связи через links, а не через FK; кросс-модульная запись только в
  workflow с компенсацией; встраивание в основной поток через хук с одним обработчиком; побочные действия через
  subscriber.
- Худшие: внедрять чужой модуль в контейнер ("only when absolutely necessary"); расширять сервис переопределением
  целого метода (опыт v1); FK между модулями (опыт v1).

---

## 2. Home Assistant

Тысячи интеграций в одном процессе на asyncio, которые общаются через Event Bus, State Machine и Service Registry
(`docs/dev_101_hass.md`).

### 2.1 Родитель → ребёнок

- **Config entry** хранит данные, которые пользователь создал через UI. У записи есть явный жизненный цикл:
  `not loaded`, `setup in progress`, `loaded`, `setup error`, `setup retry`, `migration error`, `unload in progress`,
  `failed unload` (`docs/config_entries_index.md`).
- Интеграция не может мутировать config entry напрямую. [ДОК] `docs/config_entries_index.md`:
  > "A `ConfigEntry` object, including the data and options, must never be mutated directly by integrations, instead
  > integrations must call `async_update_entry`"
- **Config subentries** появились 2025-02-16. Это дочерние записи, которыми владеет родительская запись.
  [БЛОГ] `blog/2025-02-16-config-subentries.md` (Erik Montnemery):
  > "Config subentries are owned by a config entry and set up as part of `async_setup_entry`."
- Платформы интеграции (`light.py`, `sensor.py`) получают от родителя тот же `entry`. Данные времени выполнения лежат в
  `entry.runtime_data` (подробнее в 2.6).

### 2.2 Ребёнок → родитель

- Сбой при старте является частью протокола, а не исключением «в никуда». [ДОК] `docs/integration_setup_failures.md`:
  > "Raise the `ConfigEntryNotReady` exception from `async_setup_entry` in the integration's `__init__.py`, and Home
  > Assistant will automatically take care of retrying set up later."
  > "To avoid doubt, raising `ConfigEntryNotReady` in a platform's `async_setup_entry` is ineffective because it is too
  > late to be caught by the config entry setup."
  > "The integration should not log any non-debug messages about the retry, and should instead rely on the logic
  > built-in to `ConfigEntryNotReady` to avoid spamming the logs."

  Повтор идёт с растущей паузой ("Time between attempts will automatically increase."), а `retry_after` ограничен
  одним днём.
- Сущность публикует своё состояние сама: `async_write_ha_state()` (`docs/integration_fetching_data.md`).
- События устройства интеграция публикует как `<domain>_event` с `device_id`. Но предпочтение отдано event-сущностям.
  [ДОК] `docs/integration_events.md`:
  > "Rather than emitting events directly on the event bus, integrations are generally encouraged to publish them as
  > event entities instead. This approach enhances the user experience by making it easier for the user to browse and
  > identify all available events."
  > "Entity state should not represent events. For example, you don't want to have a binary sensor that is `on` for 30
  > seconds when an event happens."

### 2.3 Соседи и далёкие модули

- **Явные зависимости в manifest.** Обязательные и необязательные зависимости объявляются по-разному.
  [ДОК] `docs/creating_integration_manifest.md`:
  > "Adding an integration to dependencies will ensure the depending integration is loaded before setup, but it does
  > not guarantee all dependency configuration entries have been set up."
  > "[`after_dependencies`] is used to specify dependencies that might be used by the integration but aren't
  > essential. [...] If `stream` is not configured, `camera` will still load."
- **Service Registry**: вызов `domain.service`. Регистрировать сервис нужно в `async_setup`, а не в
  `async_setup_entry` (см. 2.6, правило `action-setup`).
- **State Machine** открыта всем на чтение. На запись технически тоже. [ДОК] `docs/dev_101_states.md`:
  > "You can make up any combination of domain and object id, even overwriting existing states."
- **Dispatcher** для сигналов внутри процесса. На `2026.10.1` сигналы типизированы через `SignalType[*_Ts]`, строки
  оставлены для совместимости [КОД] `homeassistant/helpers/dispatcher.py`. `SignalType` был перенесён в `util`
  2024-03-27 (коммит `1d2c2d2`, #114236).
- **Платформа как точка расширения.** Хозяин расширения (например `backup`) определяет контракт файла `backup.py`,
  а интеграции его реализуют. Контракт состоит из двух функций: получить текущий список и подписаться на «список
  изменился». [ДОК] `docs/core/platform/backup.md`:
  > "The listener stored in `async_register_backup_agents_listener` should be called every time there is the need to
  > reload backup agents, to remove stale agents and add new ones."

  То есть уведомление ничего не несёт: хозяин после него заново читает список.
- **Один опрос, много читателей.** `DataUpdateCoordinator` опрашивает API один раз и уведомляет сущности.
  [ДОК] `docs/integration_fetching_data.md`:
  > "we will want to have a single periodical poll on this endpoint, and then let entities know as soon as new data is
  > available for them."
  > "set `always_update=False` when creating the DataUpdateCoordinator to avoid unnecessary callbacks and writes to the
  > state machine."

### 2.4 Как обеспечивается изоляция

- **hassfest** во время CI разбирает AST всех интеграций и проверяет, что импортированы только заявленные зависимости.
  [КОД] `script/hassfest/dependencies.py` на `2026.10.1`:
  `"Using component {domain} but it's not in 'dependencies' or 'after_dependencies'"`. Там же проверка циклов
  (`"Found a circular dependency"`) и белый список исключений `IGNORE_VIOLATIONS`. В одном исключении прямо написано,
  во что его надо превратить:
  > `# This should become a helper method that integrations can submit data to`
  > `("websocket_api", "lovelace"),`
- **Integration Quality Scale.** Это набор правил с уровнями bronze, silver, gold и platinum. Часть правил hassfest
  проверяет по AST. Например, для `runtime-data` есть проверка
  `script/hassfest/quality_scale_validation/runtime_data.py`:
  > "Enforce that the integration uses ConfigEntry.runtime_data to store runtime data."

### 2.5 Ошибки и порядок

[КОД] `homeassistant/core.py` на `2026.10.1`, `EventBus`:
- Ошибка каждого слушателя изолирована и пишется в лог, рассылка продолжается:
  `except Exception: _LOGGER.exception("Error running job: %s", job)`. Ошибка фильтра тоже изолирована:
  `_LOGGER.exception("Error in event filter")`.
- Вложенный `fire` из слушателя не вызывает повторный вход. Событие ставится в очередь и выпускается после текущей
  рассылки, с защитой от бесконечного цикла:
  > `# Guard against event listeners firing events in an endless loop: stop queuing further events and raise so the`
  > `# firing listener's error handling kicks in. Events already queued are still dispatched.`

  Константа `_MAX_QUEUED_EVENT_DISPATCHES: Final = 10_000` (`core.py`, строка 1503). Изменение внесено
  PR #173519 (emontnemery, смержен 2026-06-15) с описанием:
  > "Queue nested firing of events to ensure event listeners receive events in the order they are fired"
- Список слушателей на время рассылки снимается копией (`listeners + match_all_listeners` создаёт новый список).
  Это мой вывод из кода.
- Потоки: с 2024.5.0 HA ловит часть нарушений потокобезопасности. [ДОК] `docs/asyncio_thread_safety.md`:
  > "Beginning in version 2024.5.0, Home Assistant can detect, report, and block some non-thread-safe operations to
  > prevent system instability."

### 2.6 Эволюция: что заменили и почему

1. **Глобальный тик `time_changed` раз в секунду удалён в 2022.5.** [БЛОГ] `blog/2022-04-20-saying-goodbye-to-event_time_changed.md`
   (J. Nick Koston):
   > "consumers would subscribe to the `time_changed` event and check the time every time it fired to see if it was a
   > match. This pattern led to many callbacks where most of the time, the callback would reject the event and continue
   > receiving callbacks until the desired time was reached."

   Попутное наблюдение: `docs/architecture/core.md` на коммите `50b5188` всё ещё пишет "Timer: sends a `time_changed`
   event every 1 second on the event bus." Архитектурный документ устарел на четыре года.
2. **`async_track_state_change` заменён на индексированный `async_track_state_change_event`, удалён в 2025.5.**
   [БЛОГ] `blog/2024-04-13-deprecate_async_track_state_change.md`:
   > "`async_track_state_change` always creates a top-level listener for `EVENT_STATE_CHANGED`, which would have to
   > reject all state changes that did not match the desired entities. This design presented a performance problem when
   > there were many integrations using `async_track_state_change`."

   Документация с тех пор направляет к хелперам. [ДОК] `docs/integration_listen_events.md`:
   > "The helpers are highly optimized to minimize the number of callbacks. If there is already a helper for the
   > specific event you need to listen for, it is preferable to use the helper over listening to the event bus
   > directly."
3. **`hass.data[DOMAIN]` заменён на `entry.runtime_data`, 2024-04-30.** [БЛОГ] `blog/2024-04-30-store-runtime-data-inside-config-entry.md`
   (Marc Mueller):
   > "Previously, those were all stored inside `hass.data`, which made tracking them difficult."
   > "The config entry is already available when setting up platforms and gets cleaned up automatically. No more
   > deleting the key from `hass.data` after unloading."

   Это стало bronze-правилом `runtime-data`:
   > "By using `runtime_data`, we maintain consistency for developers to store runtime data in a consistent and typed way."
4. **Типизированные ключи вместо `dict[str, Any]`, 2024-05-01.** [БЛОГ] `blog/2024-05-01-improved-hass-data-typing.md`:
   > "type checkers also basically pretended that the annotation would always be correct. Especially during
   > refactoring, it could easily happen that one instance was missed, and while type-checking still succeeded, the
   > actual code would be broken."

   Решение: `HassKey["MyData"]` и `HassEntryKey`.
5. **Ambient-доступ `hass.helpers` удалён.** Объявлен устаревшим в 2024.5, удалён в 2024.11
   (`blog/2024-03-30-deprecate-hass-helpers.md`); в core его убрали коммитом `199a274` 2025-04-23 (#143514). Замена:
   прямой импорт функции и явная передача `hass`.
6. **Сервисы регистрируются в `async_setup`, а не в каждой записи.** [ДОК] правило `action-setup`:
   > "In the past, they have been frequently registered in the `async_setup_entry` method and removed in the
   > `async_unload_entry` method. The result of this is that the service actions are only available when there is a
   > loaded entry. This is not ideal, since this way we can't validate automations users create that use these service
   > actions, since it is possible that the configuration entry could not be loaded."
   > "We rather prefer integrations to set up their service actions in the `async_setup` method. This way we can let the
   > user know why the service action did not work, if the targeted configuration entry is not loaded."
7. **Подписка в правильный момент жизненного цикла.** [ДОК] правило `entity-event-setup`:
   > "Registering an update callback before this stage will cause errors if the callback, for example, tries to access
   > `self.hass` or write a state update."
   > "To avoid memory leaks, the entities should unsubscribe from the events [...] in the entity method
   > `async_will_remove_from_hass`."

   Короткая форма: `self.async_on_remove(self.client.events.subscribe(...))`.
8. **Выгрузка без перезапуска.** [ДОК] правило `config-entry-unloading` (silver):
   > "Integrations can use `entry.async_on_unload` to register callbacks which will be called when the config entry is
   > unloaded or if it fails to set up."
   > "Note that integrations always need to implement `async_unload_entry` to support config entry unloading, just
   > calling `entry.async_on_unload` is not enough."
9. **Два пути к одному эффекту запрещены.** [БЛОГ] `blog/2026-05-07-config-entry-listener-together-with-reloading-methods.md`
   (G Johansson): с 2026.6 deprecated, с 2026.12 ошибка:
   > "Using a config entry listener together with any reloading methods in a config flow can cause the integration to
   > reload twice and/or create a race condition."
10. **Повторный вход при вложенных событиях заменён очередью, 2026-06-15** (см. 2.5).
11. **Параметр `run_immediately` теперь ошибка, 2026-09-20.** PR #182763:
    > "Previously deprecated use of `run_immediately` parameter for methods `async_listen` and `async_listen_once` now
    > errors instead of logs"
12. **Шум без изменений.** `DataUpdateCoordinator(always_update=False)`, 2023-07-27 (`blog/2023-07-27-...`):
    > "The default behavior is always calling back listeners when the data is updated, even if it does not change."

### 2.7 Чего Home Assistant требует избегать

- Слушать шину напрямую, если есть хелпер (2.6.2).
- Хранить runtime-данные в общем словаре `hass.data` (2.6.3).
- Мутировать `ConfigEntry` напрямую (2.1).
- Подписываться до `async_added_to_hass` и не отписываться (2.6.7).
- Изображать события состоянием сущности (2.2).
- Логировать повторы старта не на уровне debug (2.2).
- Держать одновременно listener и reload для одного изменения (2.6.9).

---

## 3. Magento 2 / Adobe Commerce

### 3.1 Родитель → ребёнок

Конструкторный DI через `di.xml`: `type`/`arguments`, `virtualType` и `preference`. Preference задаёт одну реализацию
интерфейса, и её можно задать отдельно для области (`adminhtml`, `frontend`).
[ДОК] `development/build/dependency-injection-file.md`:
> "This mapping is in `app/code/Magento/Backend/etc/adminhtml/di.xml`, so the object manager injects the
> `Magento\Backend\Model\UrlInterface` implementation class wherever there is a request for the
> `Magento\Framework\UrlInterface` in the admin area."

Есть инструмент интроспекции `bin/magento dev:di:info "<Class>"`. Он показывает итоговую preference, аргументы
конструктора и все плагины на методах.

### 3.2 Ребёнок → родитель и расширение

Три механизма: plugins (interceptors: `before`, `after`, `around`), events/observers и preferences.
Официальное правило выбора между plugin и observer записано в технических правилах.
[ДОК] `coding-standards/technical-guidelines.md`:
> "14.1. All values (including objects) passed to an event MUST NOT be modified in the event observer. Instead,
> plugins SHOULD BE used for modifying the input or output of a function."
> "14.3. Events SHOULD NOT change a state of observable objects."

Комментарий в примере к 14.1:
> "Expecting this value to go back to the original event dispatcher violates this rule. Other observers could change
> the data, or Magento could make architectural changes always sending immutable objects."

Правила для плагинов (раздел 4):
> "4.1. Around-plugins SHOULD only be used when behavior of an original method is supposed to be substituted in certain
> scenarios."
> "4.2. Plugins SHOULD NOT be used within own module."
> "4.4. Plugins MUST be stateless."
> "4.5. Plugins SHOULD NOT change the state of an intercepted object (Intercepted object is `$subject`)."

### 3.3 Соседи и далёкие модули

Через service contracts в отдельных `*Api` модулях.
> "6.4.1.1. Service contract interfaces SHOULD be placed in separate API modules [...] Other modules will depend on the
> API module, and implementations could be easily swapped via `di.xml`."
> "6.4.2.3. Each service interface SHOULD declare a single public method."
> "6.4.4.3. Service implementations and plugins MUST NOT rely on storage-specific integrity features, such as foreign
> key constraints."
> "6.4.3.9. Service contracts SHOULD allow client side generated IDs."

### 3.4 Как обеспечивается изоляция

Через правила в composer.json и маркировку `@api`. Рантайм этого не проверяет.
> "8.3. If component A uses behavior of Component B, such Component B MUST be declared in the `require` section of
> Component A's `composer.json` file"
> "8.4. If component A extends/customizes the behavior of component B through its customization points (layout handles,
> plugins, events, etc.), such Component B MUST be declared in the `suggest` section of Component A."
> "8.5. Only the `@api` code of any module can be referenced by other modules."
> "8.1. The Application Framework (`Magento\Framework\*`) MUST NOT depend on application modules."

### 3.5 Ошибки и порядок

- Порядок observers не гарантирован. [ДОК] `best-practices/extensions/observers.md`:
  > "Your observer should not make assumptions about the order in which it will be invoked nor should it rely on the
  > execution of another observer."
  > "Make sure your observer is not dispatching an event that it immediately listens to or will listen to in the chain
  > of events that follows."
- [КОД] `Magento\Framework\Event\Manager::dispatch` и `InvokerDefault` на теге `2.4.9`: `execute()` вызывается без
  `try/catch` (в `InvokerDefault.php` ноль вхождений `try`). Мой вывод: исключение в одном observer прерывает
  рассылку и уходит к вызывающему.
- Порядок плагинов задаёт `sortOrder`. При равных значениях решает порядок загрузки модулей. `around` меняет порядок
  всех следующих. [ДОК] `development/components/plugins.md`:
  > "If two or more plugins have the same `sortOrder` value or do not specify it, the component load order declared in
  > the `sequence` node from `module.xml` and area will define the merge sequence."
  > "The `around` plugin's method affects the flow of all plugins that are executed after it."
  > "Avoid using around method plugins when they are not required because they increase stack traces and affect
  > performance."
- Исключения входят в контракт:
  > "5.20. Plugin MUST only throw exceptions declared by the method to which the plugin is added or derived exceptions.
  > Observer MUST only throw exceptions declared by the method that triggers an event or derived exceptions."
- События не должны срабатывать в конструкторах:
  > "2.3.2. Events MUST NOT be triggered in constructors."

### 3.6 Эволюция

1. **Magento 1 class rewrites → Magento 2 plugins.** Официально:
   > "This interception approach reduces conflicts among extensions that change the behavior of the same class or
   > method." (plugins.md)

   Практик Alan Storm, 2015-09-02 (https://alanastorm.com/magento_2_object_manager_plugin_system/) [СООБЩЕСТВО]:
   > "each class is only “rewritable” by a single module. Once one module claims a method, that means other modules are
   > out of luck. This creates conflicts between modules that need to be fixed manually by someone with deep knowledge
   > of both Magento and the two conflicting rewrites."
   > "old style rewrites still exist in the form of class preferences and argument replacement"
2. **In-process → out-of-process.** На 2026 год Adobe рекомендует выносить расширения из процесса, где это возможно.
   [ДОК] `AdobeDocs/commerce-extensibility`, `app-development/index.md`:
   > "Adobe recommends using the out-of-process extensibility method where possible due to its ease of maintenance."
   > "Stability. Poorly written extensions can potentially destabilize the entire application."

   В процессе оставлено то, что модифицирует существующие объекты:
   > "Modifying existing objects, such as customers, orders, and products."

### 3.7 Боли, которые признаёт сама документация

- Плагины нельзя повесить на final-методы, конструкторы, не-public методы, virtual types и объекты, созданные до
  bootstrap Interception (раздел Limitations в plugins.md).
- `around` дорог и ломает поток для всех следующих плагинов.
- Observer в области `global` утяжеляет загрузку:
  > "It is `NOT RECOMMENDED` to register everything in the `global` area, as the bootstrapping process will become much
  > heavier."
- Observer не должен содержать бизнес-логику:
  > "Your observer should not contain logic other than what is needed for it to run."

---

## 4. Odoo

### 4.1 Механизм: наследование моделей вместо контрактов

[ДОК] `content/developer/reference/backend/orm.rst`, ветка 19.0:
> "Odoo provides three different mechanisms to extend models in a modular way"

`_inherit` без `_name` расширяет модель на месте:
> "When using `_inherit` but leaving out `_name`, the new model replaces the existing one, essentially extending it
> in-place."

Про делегирование документация пишет прямо:
> "`_inherits` is more or less implemented, avoid it if you can;"
> "chained `_inherits` is essentially not implemented, we cannot guarantee anything on the final behavior."

### 4.2 Как собирается класс и кто решает порядок

[КОД] `odoo/orm/model_classes.py`, функция `add_to_registry`, ветка 19.0: при расширении создаётся
`bases = LastOrderedSet([model_def])`, и к нему добавляются прежние базовые классы модели. Мой вывод: класс
последнего загруженного модуля стоит первым в MRO, и `super()` идёт к модулям, загруженным раньше. Порядок загрузки
задаёт `depends`. [ДОК] `module.rst`:
> "Odoo modules which must be loaded before this one, either because this module uses features they create or because
> it alters resources they define."

Если `depends` не объявлен, порядок не определён. [СООБЩЕСТВО] форум Odoo, тема 159563, лучший ответ (дата на
странице не показана):
> "The short answer is, without explicitly listing dependencies, there is no guarantee of order."
> "And there is no guarantee that the behaviour will be consistent from one install to the next."

### 4.3 Ребёнок → родитель: цепочка `super()`

Связь «наверх» держится на дисциплине. [ДОК] учебник, `server_framework_101/12_inheritance.rst`:
> "It is very important to **always** call `super()` to avoid breaking the flow. There are only a few very specific
> cases where you don't want to call it."
> "Make sure to **always** return data consistent with the parent method."
> "[`ondelete`] avoids some issues that can occur during uninstalling the model's module when `unlink()` is directly
> overridden."

Чтобы переопределение было минимальным, базовый модуль должен заранее выделить маленькие методы-хуки.
[ДОК] `contributing/development/coding_guidelines.rst`:
> "Hardcoding a business logic in a method should be avoided as it prevents to be easily extended by a submodule."

Там же пример с пометкой `# better` и `# minimum override`: домен поиска вынесен в `_get_partner_domain()`.

### 4.4 Соседи: модули-мосты

Двух независимых соседей связывает третий модуль, который зависит от обоих и ставится автоматически.
[ДОК] `module.rst`:
> "It is generally used for "link modules" implementing synergetic integration between two otherwise independent
> modules."
> "For instance `sale_crm` depends on both `sale` and `crm` and is set to `auto_install`. When both `sale` and `crm`
> are installed, it automatically adds CRM campaigns tracking to sale orders without either `sale` or `crm` being aware
> of one another."

### 4.5 Изоляция, ошибки, транзакции

- Изоляции кода нет: модели берутся из общего реестра по строке, `self.env['res.partner']`. Есть ли статическая
  проверка, что модуль не обращается к моделям, которых нет в его `depends`, я не проверил (UNVERIFIED). Нарушение
  `_inherit` на несуществующую модель падает при загрузке:
  `TypeError(f"Model {name!r} inherits from non-existing model {parent_name!r}.")` [КОД].
- Транзакцией владеет фреймворк, а не модуль. [ДОК] `coding_guidelines.rst`:
  > "You should **NEVER** call `cr.commit()` or `cr.rollback()` yourself, **UNLESS** you have explicitly created your
  > own database cursor!"
  > "you will cause partial commits, and thus partial and unclean rollbacks"

### 4.6 Фронтенд Odoo: реестры по умолчанию, patch как запасной выход

[ДОК] `reference/frontend/patching_code.rst`:
> "Many common needs are covered by some supported API. For example, all registries are good extension points"
> "However, there are situations for which it is not sufficient. In those cases, we may need to modify an object or a
> class in place."
> "An unpatch function is returned, so it can be used to remove the patch later if necessary."
> "It is impossible to patch directly the `constructor` of a class!"

### 4.7 Известные проблемы `_inherit`

- Неявный порядок и тихие конфликты, если `depends` не объявлен (4.2).
- Пропущенный `super()` молча выключает логику всех модулей ниже по MRO (4.3).
- `_inherits` недоделан (4.1).
- Проблемы удаления модуля при переопределении `unlink` (4.3).

---

## 5. Django signals

[ДОК] `docs/topics/signals.txt`, `stable/6.1.x`.

- Главное предупреждение:
  > "Signals give the appearance of loose coupling, but they can quickly lead to code that is hard to understand,
  > adjust and debug."
  > "Where possible you should opt for directly calling the handling code, rather than dispatching via a signal."
- Про свои сигналы:
  > "Signals are implicit function calls which make debugging harder. If the sender and receiver of your custom signal
  > are both within your project, you're better off using an explicit function call."
- Слабые ссылки:
  > "Django stores signal receivers as weak references by default. Thus, if your receiver is a local function, it may be
  > garbage collected. To prevent this, pass `weak=False`"
- Дубликаты и `dispatch_uid`:
  > "Bound methods, which take a `self` argument, are different. Their identity is tied to the specific instance, so
  > connecting the same method from a new instance registers it as an additional receiver"
  > "The `ready()` method may be executed more than once during testing"
- Ошибки:
  > "`send()` does *not* catch any exceptions raised by receivers; it simply allows errors to propagate. Thus not all
  > receivers may be notified of a signal in the face of an error."
  > "`send_robust()` catches all errors derived from Python's `Exception` class, and ensures all receivers are notified"
- Порядок при смешении sync и async:
  > "the receivers are grouped by whether or not they are async before being called. This means that an asynchronous
  > receiver registered before a synchronous receiver may be executed after the synchronous receiver."
  > "In older versions, async receivers were executed via `asyncio.gather()`." (6.1 перешёл на `TaskGroup`, тикет #36315)
- Сигналы модели не видят массовые операции. [ДОК] `ref/models/querysets.txt`:
  > "`update()` does an update at the SQL level and, thus, method does not call any `save()` methods on your models, nor
  > does it emit the `pre_save` or `post_save` signals"

  [ДОК] `ref/signals.txt`:
  > "Signals can make your code harder to maintain. Consider implementing a helper method on a custom manager [...] or
  > else overriding model methods before using model signals."

**Эволюция.**
- Тикет #30801 (открыт Aymeric Augustin 2019-09-25, закрыт 2022-11-02):
  > "document the alternatives, which will usually be more robust and maintainable"
- Тикет #31327: `providing_args` объявлен устаревшим 2020-03-05 и удалён 2021-01-14. Причина от Jon Dufresne:
  > "The argument is and always has been purely documentational. It provides no functionality or checking."

  Мой вывод: контракт на полезную нагрузку, который ничем не проверяется, Django просто убрал, а типизировать его так и
  не стал.

---

## 6. GitLab: модульный монолит и `Gitlab::EventStore`

### 6.1 Почему появился EventStore

MR !34042 «Introduce Gitlab::EventStore as simple pub-sub system» (автор fabiopitino, открыт 2020-06-08, смержен
2022-01-01). Текущая документация [ДОК] `doc/development/eventstore/_index.md`:
> "The monolithic GitLab project is becoming larger and more domains are being defined. As a result, these domains are
> becoming entangled with each other due to temporal coupling."
> "An emblematic example is the `PostReceive` worker where a lot happens across multiple domains."
> "Violates domain boundaries. Inside a specific namespace (for example `Git::`) we suddenly see classes from other
> domains chiming in (like `Ci::` or `MergeRequests::`)."
> "The EventStore is only an abstraction that allows us to have Dependency Inversion."
> "With `Gitlab::EventStore` there is still coupling between the subscriber (Sidekiq worker) and the schema of the
> domain event. This level of coupling is much smaller than having the main transaction [...] coupled to: multiple
> subscribers. multiple ways of invoking subscribers (including conditional invocations). multiple ways of passing
> parameters."

### 6.2 Правила событий

- События только для побочных эффектов:
  > "Alternatively, consider not using `EventStore` if the logic needs to be processed as part of the main business
  > transaction, and is not a side-effect."
- Событие является публичным интерфейсом:
  > "Events are a public interface, just like an API or a UI."
  > "**Semantic**: Events should describe what occurred within the bounded context, not the intended action for
  > subscribers."
  > "**Specific**: Events should be narrowly defined without being overly precise."
  > "**Scoped**: Events should be scoped to their bounded context."

  Таблица примеров: `MergeRequest::ApprovedEvent` хорошо, `MergeRequest::NotifyAuthorEvent` плохо;
  `MergeRequest::ChangedEvent` плохо.
- Схема проверяется в момент создания события:
  > "The validation happens immediately when you initialize the event object to ensure that publishers follow the
  > contract with the subscribers."
- Полезная нагрузка минимальна:
  > "Publish only properties that are needed by the subscribers without tailoring the payload to specific subscribers."
  > "It's best to use this technique as a performance optimization."
- Хуки ORM для доменных событий не годятся:
  > "`ActiveRecord` callbacks are too low-level to represent a domain event. They represent more database record changes."
- Подписки фиксируются при загрузке и лежат в контексте подписчика:
  > "Subscriptions are organized using the bounded context of the worker, not the event."
  > "Subscriptions are stored in memory when the Rails app is loaded and they are immediately frozen. It's not possible
  > to modify subscriptions at runtime."
- Условие подписки должно быть дешёвым:
  > "When using conditional dispatch it must contain only cheap conditions because they are executed synchronously
  > every time the given event is published."
- Схему меняют в несколько выкатов (rename, add, remove), потому что в очереди одновременно живут две версии события:
  > "Events get persisted in the Sidekiq queue as job arguments, so we could have 2 versions of the schema during
  > deployments."
- Новые события обязаны наследовать `CloudEvent`. Это проверяет RuboCop cop `Gitlab/EventStoreCloudEventInheritance`,
  а старые события перечислены в todo-файле.
- Надёжность названа честно:
  > "there are instances when a worker exceeds a retry limit and Sidekiq jobs are lost."

### 6.3 Ошибки и порядок

[КОД] `lib/gitlab/event_store/subscription.rb` на `1697a46`:
> `# We rescue and track any exceptions here because we don't want to`
> `# impact other subscribers if one is faulty.`
> `# [...] By raising an exception here we could interrupt the publishing`
> `# process, preventing other subscribers from consuming the event.`

`store.rb`: `@subscriptions.freeze` с комментарием "freeze the subscriptions as safety measure to avoid further
subscriptions after initialization." Подписчик проходит проверку `respond_to?(:perform_async)`, а событие должно быть
подклассом `Event`. Порядок между подписчиками не обещается. Каждый подписчик работает как отдельное задание Sidekiq
с собственными повторами.

### 6.4 Bounded contexts и храповики

[ДОК] `doc/development/software_design.md`:
- Список контекстов лежит в `config/bounded_contexts.yml` и проверяется cop'ом `Gitlab/BoundedContexts`.
- Против god-объектов (`Project`, `User`, `MergeRequest`, `Ci::Pipeline`) работает cop `Gitlab/OmniscientClassMethods`
  с базовым списком, который может только сокращаться:
  > "The cop reports baseline entries for methods that the class no longer defines, so the list only gets shorter."
- Миксины этот запрет не обходят:
  > "Do not move methods out of an omniscient class into a mixin [...] A mixin still uses inheritance: its methods are
  > still part of the omniscient class. It hides the problem and keeps the coupling. Use composition instead"
  > "Try to define behavior in the bounded context where it belongs, not where the data (or some of it) is."

### 6.5 Design document «Rails Monolith Decomposition» (status: proposed)

Документ создан 2023-05-22 и переработан 2026-06-15. Это предложение, а не принятое решение. [ДОК] handbook,
`design-documents/modular_monolith/_index.md`:
> "Make dependencies explicit and enforced. A dependency that is not declared does not exist; coupling cannot be
> re-created through the back door."
> "Boundaries are silent on the database. Even apparently isolated domains share tables, hold cross-boundary foreign
> keys, and keep ORM associations that span the line. Data coupling is what actually blocks extraction."
> "We have attempted to enforce the creation of some modules but have no company-wide strategy on what the functional
> parts of the monolith should be"

`domain_layer.md` (proposed, 2026-06-12):
> "**Prefer direct dependencies over monolith callbacks.** Where a domain needs data from another domain, prefer a
> direct, declared dependency on that domain's public interface over wiring callbacks back into the monolith. Direct
> dependencies are trackable — we can render a cross-domain dependency graph and use it in CI to run only the affected
> tests — whereas callbacks hide the coupling."
> "**Strip shared models to identity objects.** If a cross-domain accessor returns the full `Project` AR object, it
> drags in that object's entire surface and re-couples the domains."
> "**Avoid chatty domains.**"
> "Circular dependencies between domains are common."
> "**This is not decided.** We have not agreed whether domain decomposition uses Ruby gems, Packwerk packages, or a
> combination"
> "An enforceable rule: a library may depend on another library, but **never on a domain**."

### 6.6 Расширение CE классов из EE: `prepend_mod` и защита override

[ДОК] `doc/development/ee_features.md`:
> "you should always `extend ::Gitlab::Utils::Override` and use `override` to guard the `overrider` method to ensure
> that if the method gets renamed in CE, the EE override isn't silently forgotten."
> "when the `overrider` would add a line in the middle of the CE implementation, you should refactor the CE method and
> split it in smaller methods. Or create a "hook" method that is empty in CE"

Проверка `override` выполняется только при `ENV['STATIC_VERIFICATION']` (`utilities.md`).

### 6.7 Плагины против open core

[БЛОГ] Sid Sijbrandij, «Open core is worse than plugins... and that’s why it’s better», 2022-07-14:
> "The fiendishly difficult part of plugin API development is that the very things you need to do to handle the
> difficulties make the task even harder: You need to design more carefully, you need to make interfaces stable, you
> can only iterate them slowly."
> "In short: You face a chicken-and-egg problem of premature abstraction. In order to make a good plugin API, you need
> to see it being used, but in order to see how it is being used, you need to first have it."

---

## 7. Node-RED и n8n

### 7.1 Node-RED

- Узлы общаются только сообщением `msg`, которое идёт по проводам. При ветвлении сообщения клонируются.
  [БЛОГ] «Cloning messages in a flow», 2019-09-13:
  > "Node-RED automatically clones messages before they are passed on in order to prevent this type of cross-branch
  > modification."
  > "When `node.send()` is called it generates a list of send events. The first send event uses the message object given
  > as-is. All of the remaining send events clone their message before passing it on."
- В 1.0 передача сообщений стала асинхронной. [БЛОГ] «Making flows asynchronous by default», 2019-08-16:
  > "In Node-RED 1.0, we are changing the way messages pass between nodes from being synchronous to being
  > asynchronous."
  > "With the current synchronous model, the time it takes a node to handle a message is the time it takes to run its
  > own code, plus the time it takes each subsequent node to handle the message it is passed."
  > "We have always said no assumptions should be made about ordering once a flow branches."
  > "Purely synchronous code is going to be faster, but it does starve the Event Loop."

  Временный флаг `runtimeSyncDelivery`: "Consider its usage as instantly deprecated."
- Завершение обработки явное, через `done()` (с 1.0). Ошибка передаётся в `done(err)`, и её ловит Catch node
  (`docs/creating-nodes/node-js.md`).
- Закрытие узла: `close(removed, done)` с таймаутом:
  > "Prior to Node-RED 0.17, the runtime would wait indefinitely for the `done` function to be called. This would cause
  > the runtime to hang if a node failed to call it."
  > "In 0.17 and later, the runtime will timeout the node if it takes longer than 15 seconds."
- Общее состояние живёт в context трёх уровней: node, flow и global. Подпоток может читать контекст родителя через
  `$parent.` (`docs/user-guide/context.md`).
- Ошибка в подпотоке поднимается к родителю, если внутри нет Catch:
  > "If there are none there, the error will propagate up to the flow containing the subflow instance."

### 7.2 n8n

- Порядок ветвей поменялся в 1.0. [ДОК] `docs/changelog/v10-migration-guide.md`:
  > "Previously, n8n executed the first node of each branch, then the second of each branch, and so on
  > (breadth-first). The new execution order ensures that each branch executes completely before starting the next one
  > (depth-first). Branches execute based on their position on the canvas, from top to bottom."
  > "Nodes are now executed only when they receive data"

  Старые workflow сохранили старый порядок, а режим выбирается в настройках. Порядок определяется положением узлов на
  холсте.
- В 2.0 исправлен результат sub-workflow после ожидания. [ДОК] `v20-breaking-changes.md`:
  > "the parent-execution would receive incorrect results."
  > "n8n 2.0: The parent execution receives the result of the child execution"

---

## 8. Strapi и Discourse

### 8.1 Strapi (v5)

- У плагина три фазы жизненного цикла. [ДОК] `plugins-development/server-lifecycle.md`:
  > "Use `register()` to declare capabilities before the app is fully initialized, `bootstrap()` to run logic once
  > Strapi is initialized, and `destroy()` to clean up resources on shutdown."

  Межплагинные интеграции разрешены только в `bootstrap()`:
  > "Set up cross-plugin integrations that require other plugins to be registered first"

  Повторный вызов фазы является ошибкой:
  > "If a lifecycle is called a second time on the same plugin instance [...] Strapi throws an error."
- Межплагинный доступ идёт через строковые UID, по сути это service locator. [ДОК] `server-getters-usage.md`:
  > "Access plugin resources through top-level getters (`strapi.plugin('my-plugin').service('name')`) or global getters
  > (`strapi.service('plugin::my-plugin.name')`)."
- Хуки уровня базы перестали совпадать с доменными операциями. [ДОК] breaking change
  `lifecycle-hooks-document-service.md`:
  > "In Strapi 5, database lifecycle hooks are triggered differently when using Document Service API methods, varying by
  > operation type and status changes due to the new Draft & Publish system."

  Например, `publish()` вызывает `before(after) Create` и `before(after) Delete`, а `create({ status: 'published' })`
  вызывает Create дважды.
  > "Bulk actions lifecycles (`createMany`, `updateMany`, `deleteMany`) will never be triggered by a Document Service API
  > method."

  [ДОК] `backend-customization/models.md`:
  > "Lifecycles hooks are not triggered when using directly the knex library instead of Strapi functions."

### 8.2 Discourse

- Шина событий глобальная, ключ является символом. По умолчанию первая же ошибка прерывает рассылку.
  [КОД] `lib/discourse_event.rb` на `v2026.9.0`:
  ```ruby
  def self.trigger(event_name, *args, continue_on_error: false, **kwargs)
    events[event_name].each do |event|
      event.call(*args, **kwargs)
    rescue => e
      raise unless continue_on_error
  ```
  События переименовывают через `Discourse.deprecate` прямо в `on`, например `:user_badge_removed` →
  `:user_badge_revoked`.
- Код плагина нельзя выгрузить во время работы, поэтому каждая регистрация обёрнута проверкой «включён ли плагин».
  [КОД] `lib/plugin/instance.rb`:
  > `# A proxy to `DiscourseEvent.on` which does nothing if the plugin is disabled`

  `add_to_class` определяет метод как `public_send(hidden_method_name, ...) if plugin.enabled?`. Модификаторы
  (`apply_modifier`) выполняются цепочкой, где выход одного является входом следующего, и пропускают выключенные
  плагины. Снять модификатор можно только в тестах: `raise "unregister_modifier can only be used in tests"`.
- Патчинг классов допускается только как последнее средство. [ДОК] Meta, «Using modifyClass to change core behavior»
  (создано 2023-04-18, обновлено 2026-08-31):
  > "modifyClass should be a last resort, when your customization cannot be made via Discourse’s more stable
  > customization APIs (e.g. plugin-api methods, plugin outlets, transformers)."
  > "Core’s code can change at any time. And therefore, customizations made via modifyClass could break at any time."
- Точки расширения называются transformers. [ДОК] Meta, «Using Transformers to customize client-side values and
  behavior» (2025-01-31):
  > "Value Transformers take an output from Discourse core, and optionally modify it, or replace it with something else"
  > "Behavior Transformers can replace a particular piece of logic in Discourse core, and optionally call the original
  > implementation."
  > "If multiple transformers are registered against a single name, then they will be run in order of registration."
- Миграцию API расширений Discourse проводит с автоопределением совместимости. Meta, «Upcoming post menu changes»
  (2024-12-12): режим `auto`:
  > "will detect the compatibility of your current plugins and themes. If any are incompatible, it will use the legacy
  > system; otherwise it will use the new menu."

  У каждой миграции есть deprecation ID (`discourse.post-menu-widget-overrides`), предупреждение в консоли с указанием
  виновного плагина и график удаления старого кода.

---

## 9. Temporal: урок про родителя, ребёнка и типы сообщений

- Сообщения бывают трёх видов. [ДОК] `encyclopedia/workflow-message-passing/workflow-message-passing.mdx`:
  > "Queries are read requests. They can read the current state of the Workflow but cannot block in doing so."
  > "Signals are asynchronous write requests. They cause changes in the running Workflow, but you cannot await any
  > response or error."
  > "Updates are synchronous, tracked write requests. The sender of the Update can wait for a response on completion or
  > an error on failure."

  У Update есть необязательный валидатор (`handling-messages.mdx`):
  > "a read operation that's responsible for accepting or rejecting the Update"

  Update стал GA 2024-12-20 (newsletter: "Workflow Update is now Generally Available."). До этого приходилось отправлять
  Signal и затем опрашивать Query. Тот же совет документация даёт и сейчас: "If your request must be asynchronous,
  consider sending a Signal followed by polling with a Query."
- Отдельный жизненный цикл ради организации кода не нужен. [ДОК] `encyclopedia/child-workflows/child-workflows.mdx`:
  > "There is no reason to use Child Workflows only for code organization."
  > "we recommend starting with a single Workflow implementation that uses Activities until there is a clear need for
  > Child Workflows."
- Что происходит с детьми при закрытии родителя, задаётся явно (`parent-close-policy.mdx`): `Abandon`,
  `Request Cancel` и `Terminate (default)`.
- Обработчики дожидаются:
  > "You should generally finish running all handlers before the Workflow run completes or continues as new."

---

## 10. Сводная таблица по направлениям

| Проект | Родитель → ребёнок | Ребёнок → родитель | Соседи и далёкие | Изоляция | Ошибки по умолчанию |
|---|---|---|---|---|---|
| Medusa v2 | опции модуля в конструктор | хук с одним обработчиком; события | links (ID без FK), Query, workflows с компенсацией; subscribers для побочного | отдельный контейнер на модуль | subscriber: лог и продолжение [КОД]; workflow: компенсация |
| Home Assistant | config entry неизменяем, `runtime_data` | `ConfigEntryNotReady` → повтор с backoff; event-сущности | services, state machine, dispatcher, платформы (`backup.py`), coordinator | hassfest AST: импорты = manifest, циклы; quality scale | шина: изоляция каждого слушателя, очередь без повторного входа |
| Magento 2 | DI, preference по области | observers без мутаций; plugins after/around | service contracts (`*Api`, `@api`), events, plugins | правила composer и `@api`, рантайм не проверяет | observer: исключение прерывает [КОД] |
| Odoo | `depends` и данные | `super()` по MRO | `env['model']`, модули-мосты `auto_install` | нет, только порядок загрузки | транзакция фреймворка, откат целиком |
| Django | settings, `AppConfig.ready` | signals | прямые вызовы (рекомендовано), signals | нет | `send` прерывает, `send_robust` собирает |
| GitLab | конструкторы сервисов | события (EventStore) | прямые зависимости от публичного API (рекомендовано), EventStore для побочного | RuboCop: bounded contexts, omniscient baseline; Packwerk не решён | publish изолирует подписчиков [КОД]; Sidekiq повторяет |
| Node-RED / n8n | конфиг узла, context `$parent` | `done(err)`, Catch поднимается в родителя | только сообщения (клон при ветвлении) | процесс общий | Catch-узлы; таймаут close 15 s |
| Strapi | config плагина | lifecycles, middlewares Document Service | `strapi.service('plugin::x.y')` | нет | UNVERIFIED |
| Discourse | site settings | `DiscourseEvent`, modifiers, transformers | глобальная шина событий | проверка `enabled?` в каждой регистрации | `trigger` прерывает, если нет `continue_on_error` |
| Temporal | input workflow | результат child, signals | Query/Signal/Update | процесс и история | `ParentClosePolicy`, повторы activity |

---

## 11. Лучшие практики (подтверждённые проектами)

| # | Практика | Источник |
|---|---|---|
| P1 | Модуль владеет только своими данными; связи между модулями по ID, таблицей связи не владеет ни один из двух модулей | Medusa links "only the IDs [...] do not hold a foreign key constraint"; Magento 6.4.4.3; GitLab "Strip shared models to identity objects" |
| P2 | Кросс-модульная запись является операцией владельца-оркестратора с компенсацией, а не цепочкой вызовов между сервисами | Medusa v2 workflows; блог v2 "rolled back [...] compensating actions" |
| P3 | Для данных и обязательного сотрудничества нужна прямая объявленная зависимость от публичного контракта; события только для побочного | GitLab domain_layer "Prefer direct dependencies over monolith callbacks"; Django "opt for directly calling"; Medusa "aren't integral"; GitLab EventStore "not a side-effect" |
| P4 | Встраивание в основной поток через слот с одним обработчиком, побочные реакции через подписчиков | Medusa "A hook can have only one handler"; Medusa subscribers |
| P5 | Модуль-мост связывает двух соседей, которые друг о друге не знают | Odoo `sale_crm` + `auto_install`; Medusa links в отдельной папке `src/links` |
| P6 | Обязательная и необязательная зависимость объявляются по-разному и проверяются статически | HA `dependencies` / `after_dependencies` + hassfest AST |
| P7 | Недекларированная зависимость считается ошибкой сборки, а исключения перечислены поимённо и с планом | hassfest `IGNORE_VIOLATIONS` ("This should become a helper method..."); GitLab "A dependency that is not declared does not exist" |
| P8 | Контракт регистрируется статически, доступность экземпляра проверяется при вызове с понятной ошибкой | HA правило `action-setup` |
| P9 | Runtime-состояние привязано к времени жизни владельца и убирается вместе с ним | HA `entry.runtime_data` "gets cleaned up automatically"; `entry.async_on_unload` |
| P10 | Ключи и сигналы типизированы | HA `HassKey`, `SignalType`; GitLab JSON-схема события проверяется при создании |
| P11 | Подписка оформляется только после полной готовности подписчика, отписка привязана к его удалению | HA `entity-event-setup`; Magento 2.3.2 "Events MUST NOT be triggered in constructors" |
| P12 | Индексированная подписка на конкретный ключ вместо «слушать всё и фильтровать» | HA отказ от `time_changed` и `async_track_state_change`; GitLab "Specific" events; GitLab cheap conditions |
| P13 | Ошибка каждого слушателя изолирована, приписана и залогирована, издатель продолжает | HA `EventBus`; GitLab `Subscription#consume_event`; Medusa local bus |
| P14 | Вложенные публикации ставятся в очередь (FIFO, без повторного входа), есть предохранитель от бесконечного цикла | HA PR #173519, `_MAX_QUEUED_EVENT_DISPATCHES` |
| P15 | Если данные не изменились, уведомление не рассылается | HA `always_update=False` |
| P16 | Событие публикуется только после успешного завершения операции или транзакции | Medusa `emitEventStep`, grouped events |
| P17 | Событие описывает факт в своём контексте, узко, с минимальной нагрузкой и схемой | GitLab Semantic/Specific/Scoped; GitLab payload guidance |
| P18 | Подписки фиксируются при сборке и лежат в модуле подписчика | GitLab "frozen", "organized using the bounded context of the worker" |
| P19 | Точки расширения именованы и узки (value и behavior transformers, реестры); патчинг только как последнее средство | Discourse transformers + "modifyClass should be a last resort"; Odoo "registries are good extension points" |
| P20 | Каждое переопределение защищено проверкой, что цель существует | GitLab `Gitlab::Utils::Override` |
| P21 | Базовый модуль заранее выделяет маленькие методы-хуки вместо копирования больших методов | Odoo "minimum override"; GitLab "create a "hook" method that is empty in CE" |
| P22 | Регистрации плагина живут столько же, сколько плагин; выключенный плагин молчит везде | Discourse `on` и `add_to_class` с `enabled?`; Odoo `patch` возвращает unpatch |
| P23 | Завершение и закрытие ограничены таймаутом, зависание логируется | Node-RED `close` 15 s с 0.17 |
| P24 | При ветвлении получатели не делят изменяемые данные (клон или неизменяемость) | Node-RED cloning; Magento 14.1 "MUST NOT be modified" |
| P25 | Сбой старта ребёнка является типизированным сигналом владельцу; повтор с backoff делает рантайм, а не модуль | HA `ConfigEntryNotReady`, состояния config entry |
| P26 | Явная политика для детей при закрытии родителя и дожидание обработчиков в полёте | Temporal `ParentClosePolicy`, "finish running all handlers" |
| P27 | Чтение, асинхронная запись и синхронная запись с валидацией разведены по разным типам сообщений | Temporal Query/Signal/Update |
| P28 | Миграция API расширений идёт с deprecation ID, автоопределением совместимости и графиком удаления | Discourse post menu; HA blog-анонсы с версией удаления |
| P29 | Храповики: список нарушений может только сокращаться | GitLab omniscient baseline; RuboCop todo для CloudEvent |

## 12. Худшие практики (подтверждённые проектами)

| # | Антипаттерн | Источник |
|---|---|---|
| W1 | Межмодульная логика внутри сервисов и FK между модулями приводят к принятию «всё или ничего» | Medusa v1, блог v2 "all or nothing" |
| W2 | Расширение через переопределение целого метода или класса ведёт к тяжёлым обновлениям | Medusa v1 "nasty upgrade paths"; Magento 1 rewrites; Discourse modifyClass "could break at any time" |
| W3 | Единственный слот замены на класс, который захватывает первый модуль | Magento 1 "only rewritable by a single module"; Magento preference как остаток (Storm) |
| W4 | Порядок задаётся неявно: порядком загрузки, числами `sortOrder` или положением на холсте | Odoo форум "no guarantee"; Magento равные `sortOrder`; n8n "position on the canvas" |
| W5 | Пропущенный `super()` молча выключает чужую логику | Odoo "always call super()" |
| W6 | Наблюдатель меняет данные события | Magento 14.1 |
| W7 | Глобальный широковещательный тик или подписка «на всё» с фильтром у каждого слушателя | HA `time_changed`, `async_track_state_change` |
| W8 | Общий изменяемый словарь для runtime-данных с ручной очисткой | HA `hass.data` до 2024 |
| W9 | Ambient-объект с доступом ко всему | HA `hass.helpers` удалён |
| W10 | Регистрация контракта только пока жив экземпляр, после чего его нельзя проверить заранее | HA `action-setup` "In the past..." |
| W11 | Два пути к одному эффекту: listener и reload | HA 2026.6 deprecation "reload twice and/or create a race condition" |
| W12 | Синхронный повторный вход при вложенных событиях ломает порядок | HA до PR #173519; Node-RED до 1.0 |
| W13 | Первая ошибка слушателя прерывает рассылку | Magento `InvokerDefault` [КОД]; `DiscourseEvent.trigger` по умолчанию; Django `send()` |
| W14 | Хуки на уровне хранилища выдаются за доменные события | GitLab "ActiveRecord callbacks are too low-level"; Strapi v5 Document Service; Django `update()` без сигналов |
| W15 | Слабые ссылки или GC как механизм отписки | Django `weak=True` по умолчанию, "may be garbage collected" |
| W16 | Повторная регистрация того же обработчика при повторной инициализации | Django bound methods, `ready()` дважды |
| W17 | Контракт полезной нагрузки, который ничем не проверяется | Django `providing_args` "purely documentational" |
| W18 | Глобальное состояние, в которое любой может записать | HA state machine "even overwriting existing states"; Node-RED global context |
| W19 | Строковый service locator между плагинами | Strapi `strapi.service('plugin::x.y')`; Odoo `env['model']` |
| W20 | Миксин, чтобы «разгрузить» god-класс | GitLab "It hides the problem and keeps the coupling" |
| W21 | Отдельный runtime-экземпляр ради организации кода | Temporal "There is no reason to use Child Workflows only for code organization" |
| W22 | Бесконечное ожидание `done` при закрытии | Node-RED до 0.17 "would cause the runtime to hang" |
| W23 | Плагинный API до того, как появилось реальное использование | GitLab 2022 "premature abstraction" |
| W24 | Делегирование, реализованное наполовину | Odoo `_inherits` "more or less implemented, avoid it" |
| W25 | Архитектурный документ, который расходится с кодом | HA `docs/architecture/core.md` про `time_changed` (моё наблюдение) |

---

## 13. Уроки эволюции: что бросили и почему

| Проект, дата | Что бросили | На что заменили | Почему (дословно) |
|---|---|---|---|
| Medusa v2, 2024-10-23 | межмодульная логика в сервисах, FK между модулями | изоляция модулей + links + workflows + Query | "near-impossible to partially adopt our feature offering—it was all or nothing"; "nasty upgrade paths" |
| Home Assistant 2022.5 | `time_changed` каждую секунду | планировщик asyncio, хелперы `async_track_*` | "led to many callbacks where most of the time, the callback would reject the event" |
| Home Assistant 2024.4 → 2025.5 | `async_track_state_change` | `async_track_state_change_event`, индекс по entity_id | "presented a performance problem when there were many integrations" |
| Home Assistant 2024-04-30 | `hass.data[DOMAIN]` | `entry.runtime_data` | "made tracking them difficult"; "No more deleting the key" |
| Home Assistant 2024-05-01 | `hass.data: dict[str, Any]` | `HassKey`, `HassEntryKey` | "type checkers also basically pretended that the annotation would always be correct" |
| Home Assistant 2024.5 → 2024.11 | `hass.helpers` | прямые импорты с явным `hass` | (в посте причина не указана; из контекста: ambient-доступ) |
| Home Assistant (правило action-setup) | сервисы в `async_setup_entry` | сервисы в `async_setup` + проверка загрузки записи | "we can't validate automations users create that use these service actions" |
| Home Assistant 2026-06-15 | повторный вход при вложенных `fire` | очередь + предохранитель 10 000 | "ensure event listeners receive events in the order they are fired" |
| Home Assistant 2026.6 → 2026.12 | listener записи + reload во flow | только один путь | "reload twice and/or create a race condition" |
| Magento 1 → 2 (2015) | class rewrites | plugins (interceptors), DI | "reduces conflicts among extensions"; Storm: "only “rewritable” by a single module" |
| Adobe Commerce (2026 docs) | in-process по умолчанию | out-of-process, где возможно | "due to its ease of maintenance"; "Poorly written extensions can potentially destabilize the entire application" |
| Django 2020-03 → 2021-01 | `Signal(providing_args=...)` | ничего, аргумент удалён | "purely documentational. It provides no functionality or checking" |
| Django 2022-11 (#30801) | сигналы без оговорок | предупреждение и альтернативы | "alternatives, which will usually be more robust and maintainable" |
| Django 6.1 | `asyncio.gather()` для async receivers | `asyncio.TaskGroup` | (тикет #36315; причину я не открывал, UNVERIFIED) |
| GitLab 2020-06 → 2022-01 | кросс-доменный код в `PostReceive` | `Gitlab::EventStore` | "entangled with each other due to temporal coupling" |
| GitLab (сейчас) | legacy `Gitlab::EventStore::Event` | `CloudEvent` + RuboCop cop | соответствие CloudEvents v1.0 |
| GitLab 2026-06 (proposed) | callbacks в монолит | прямые объявленные зависимости | "callbacks hide the coupling" |
| GitLab (правила) | вынос методов god-класса в миксины | композиция в своём контексте | "It hides the problem and keeps the coupling" |
| Node-RED 1.0, 2019 | синхронная передача сообщений | асинхронная (`setImmediate`) | таймауты узлов, подключаемая маршрутизация, "starve the Event Loop" |
| Node-RED 0.17 | бесконечное ожидание `close` | таймаут 15 s | "would cause the runtime to hang" |
| n8n 1.0 | breadth-first по ветвям; неявный запуск второго входа | depth-first; узел запускается только при наличии данных | (упрощение; формулировка "simplifies this behavior") |
| n8n 2.0 | parent получал вход child после ожидания | parent получает результат child | "would receive incorrect results" |
| Strapi v4 → v5 | Entity Service + однозначные lifecycles | Document Service, lifecycles срабатывают иначе | "due to the new Draft & Publish system" |
| Discourse 2024-2025 | widget API, `decorateWidget` и т.п. | Glimmer-компоненты + transformers | модернизация; совместимость через режим `auto` |
| Discourse (2023+) | modifyClass как основной путь | plugin API, outlets, transformers | "could break at any time" |
| Temporal 2024-12 | Signal + опрос через Query для синхронного ответа | Update с валидатором | (newsletter: GA; мотив в документации: результат или ошибка без опроса) |

**Общий рисунок.**
1. Почти все отказываются от **неявного и глобального** в пользу **объявленного и типизированного**: HA (ключи,
   сигналы, хелперы), Django (контракт, который ничего не проверял, удалили), GitLab (схемы событий, cop'ы).
2. От **широковещательных подписок с фильтром** переходят к **индексированным** (HA дважды).
3. От **синхронного повторного входа** переходят к **очереди с порядком** (HA 2026, Node-RED 2019).
4. От **переопределения классов** переходят к **узким именованным точкам** (Magento 1→2, Discourse, Odoo frontend,
   Medusa v1→v2).
5. От **хуков хранилища** переходят к **доменным операциям** (Strapi v5, GitLab, Django-оговорки).
6. От **общих данных и FK** переходят к **ID и связям, которыми владеет третья сторона** (Medusa, GitLab design doc,
   Magento 6.4.4.3).

---

## 14. My assessment: что GM стоит взять и чего избегать

Модель GM, на которую я опираюсь: статическая композиция через типизированные контракты и слоты (`required`,
`optional`, `many`), явные строки связывания в корне композиции, дерево resource scopes, dynamic instances и
lifecycle kernel для плагинных хостов. У значения один владелец и единственный писатель. Потребитель читает read-only
facet и делает `watch` в своём scope. `many()` используется только для точек расширения. События появятся позже.
Оценки даны в формате «надёжность / уверенность» по шкале 1-10.

### 14.1 Родитель → ребёнок

1. **Один путь изменения на каждый вход.** Для конкретного входа владелец выбирает одно: либо экземпляр пересоздаётся,
   либо ребёнок делает `watch` facet. Оба сразу запрещены. Это можно проверять при сборке, если вход помечен способом
   доставки. Основание: HA 2026.6 (W11). **8/8.**
2. **Runtime-состояние экземпляра живёт в его scope, а не в общем реестре по ID.** Это прямо совпадает с переходом HA
   от `hass.data` к `runtime_data` (P9, W8). GM уже идёт этим путём через resource scopes. Нужен запрет или линт на
   «карту по instance ID» в модульном коде. **9/8.**
3. **Слот существует статически, экземпляр может быть недоступен.** Привязка к динамическому экземпляру не должна
   исчезать из графа, когда экземпляра нет. Вызов к недоступному экземпляру завершается типизированной ошибкой
   `not available`, а не `undefined`. Основание: HA `action-setup` (P8, W10). **8/7.**
4. **`optional` по смыслу равен HA `after_dependencies`.** Если провайдер есть, он гарантированно готов раньше
   потребителя. Если его нет, потребитель всё равно стартует. Это стоит записать в семантике `optional` явно, вместе с
   оговоркой HA, что зависимость гарантирует готовность модуля, но не его динамических экземпляров. **7/7.**
5. **Входы неизменяемы и проверяются при создании**, как схема GitLab, которая проверяется в момент создания события
   (P10, P17). Изменяемые объекты во входах запрещены: «мутацию на месте не видно» (Magento 14.1, Node-RED cloning).
   **8/8.**

### 14.2 Ребёнок → родитель

1. **Сбой старта является состоянием жизненного цикла, а не исключением.** Lifecycle kernel должен отдавать владельцу
   состояние экземпляра в духе HA: `not loaded`, `setting up`, `ready`, `setup error`, `retrying`, `unloading`,
   `unload failed`. Повтор с backoff остаётся политикой хоста, а не модуля. При этом модуль не логирует каждую попытку
   сам (P25). **8/7.**
2. **Наверх идёт намерение через порт, который дал владелец.** Опционально к нему добавляется валидатор, который
   принимает или отклоняет запрос до исполнения (Temporal Update validator, P27). Это совпадает с принятым правилом
   «владелец единственный писатель». Отдельно стоит развести «прочитать» (facet), «попросить без ответа» и «попросить
   и дождаться результата или ошибки». **8/7.**
3. **Встраивание в основной поток родителя оформляется как `optional` слот с одним провайдером, а не как `many`.**
   Medusa сознательно ограничила workflow hook одним обработчиком (P4). Это подтверждает правило GM «`many()` только
   для точек расширения» и даёт ему ясную формулировку: интегральный шаг = один провайдер, побочная реакция = много
   подписчиков (когда появятся события). **7/7.**
4. **Явная политика детей при закрытии родительского scope** с поведением по умолчанию «закрыть». Перед закрытием
   экземпляр дожидается или отменяет обработчики в полёте (Temporal, P26). Это прямо ложится на lifecycle kernel,
   который удерживает вызовы в полёте. **8/8.**

### 14.3 Соседи и далёкие модули

1. **По умолчанию прямая объявленная зависимость от контракта соседа**, видимая в графе. Это GitLab 2026, Django и
   Medusa (P3). События и подписки не нужно добавлять ради «развязки». **9/9.**
2. **Модуль-мост как первый класс.** Если двум соседям нужно что-то вместе, появляется третий модуль, который
   зависит от обоих и связывает их строкой в корне композиции. Ни один из двух не знает о другом. Так устроены Odoo
   `sale_crm` и Medusa links (P5). Стоит оформить это как именованный паттерн в гайде GM. **8/8.**
3. **Многомодульная операция, которая пишет в несколько владельцев, принадлежит оркестратору**, общему предку или мосту,
   с явной компенсацией. Цепочка вызовов между соседями для этого не годится. GM не должен становиться движком
   workflow; достаточно правила в гайде и примера (P2). **8/7.**
4. **Между модулями передаются ID и маленькие неизменяемые identity-объекты, а не «живые» объекты** другого модуля
   (P1; GitLab identity objects; Medusa links). **8/8.**
5. **`watch` с проверкой равенства по умолчанию**, то есть одинаковое значение не рассылается повторно (HA
   `always_update=False`, P15). Если у владельца нет надёжного равенства, он явно указывает это в контракте facet.
   **8/7.**
6. **Никаких строковых реестров и общего изменяемого состояния**, куда может записать любой (W18, W19). У GM это уже
   устроено через типизированные контракты и одного писателя; нужно следить, чтобы `many()` и будущие события не
   вернули строковые топики. **9/8.**
7. **Когда появятся события, брать модель GitLab, а не Discourse:** событие принадлежит контексту издателя и
   описывает факт в прошедшем времени, узко, со схемой; подписка является строкой связывания, которой владеет модуль
   подписчика; набор подписок фиксируется при сборке; ошибка подписчика изолирована; условие подписки дешёвое
   (P13, P17, P18). Глобальную шину с ключом-символом и «первая ошибка прерывает всё» не брать (W13). **8/8.**

### 14.4 Плагины и точки расширения

1. **Точки расширения с явным видом.** Вклад в `many()` бывает трёх видов: «собрать список» (HA платформы, backup
   agents), «value transformer» (цепочка, где выход одного является входом следующего) и «behavior transformer»
   (обёртка с `next`). Так устроены Discourse transformers, Magento before/after/around и Discourse modifiers (P19). Вид
   задаёт владелец точки. `around` или behavior надо ограничивать: в Magento это самый дорогой и опасный вид. **8/7.**
2. **Порядок вкладов задают строки связывания в корне композиции.** Числовых приоритетов нет, порядок загрузки и
   положение на холсте ничего не решают (W4). У Discourse порядок равен порядку регистрации, и это хотя бы
   задокументировано. **8/8.**
3. **Патчинг классов не поддерживать вообще.** Если понадобится расширение «на месте», нужна узкая именованная точка,
   которую владелец добавляет заранее (Odoo «minimum override», GitLab «hook method»). Это лучше общего механизма
   переопределения (W2, W3, W5). **9/8.**
4. **Отзыв регистраций по поколению плагина.** У Discourse нет выгрузки, поэтому каждая регистрация проверяет
   `enabled?`. Это работает, но по сути заплатка. В lifecycle kernel GM регистрации нужно привязать к поколению и
   отзывать их при отключении. Регистрация, переживающая плагин, считается ошибкой (P22). **8/7.**
5. **Переименование или удаление точки расширения ломает сборку плагина, а не проходит молча.** Это аналог GitLab
   `override`-guard (P20); в типизированном GM это достигается почти бесплатно. Для будущих публичных плагинов
   пригодятся deprecation ID и режим `auto` по образцу Discourse (P28). На этапе MVP это не нужно: ломать можно.
   **7/6.**
6. **Плагинный API строить после реального использования**, а не заранее (GitLab 2022, W23). Это согласуется с
   решением владельца «плагины позже, но plugin-ready». **7/7.**
7. **Out-of-process для недоверенных расширений** (Adobe 2026). Это не задача GM, но хост-продукт должен иметь
   эту опцию. **6/6.**

### 14.5 Жизненный цикл, порядок и память

1. **Любая подписка возвращает handle и регистрируется в scope владельца.** GC и слабые ссылки не используются (W15).
   Повторная регистрация в том же scope является ошибкой или идемпотентна по идентичности (W16). Основание: HA
   `async_on_remove`, `async_on_unload`; Django. **9/9.**
2. **`watch` нельзя оформить до активации экземпляра и нельзя вызвать из фабрики или конструктора** (P11). **8/8.**
3. **Доставка без повторного входа:** изменения, сделанные внутри обработчика `watch`, ставятся в очередь FIFO и
   применяются после текущей рассылки; есть предохранитель от бесконечного цикла (HA PR #173519, P14). Это прямо
   относится к модели «один писатель», потому что писатель может изменить значение из обработчика `watch` другого
   значения. **8/8.**
4. **Ошибка одного наблюдателя не останавливает остальных** и приписывается конкретной связи в графе (P13). Режим «первая
   ошибка прерывает» как значение по умолчанию не нужен (W13). **9/8.**
5. **Очистка ограничена по времени:** зависшая очистка логируется, хост продолжает работу (Node-RED 0.17, P23).
   **8/7.**
6. **`watch` всегда узкий, по конкретному facet;** API вида «наблюдать всё и фильтровать» не нужен (HA дважды, W7).
   **8/8.**
7. **Динамические экземпляры только ради собственного жизненного цикла**, а не ради организации кода (Temporal, W21).
   Это стоит записать в гайд прямо. **8/8.**
8. **Facet и события должны выражать доменные изменения владельца, а не события адаптера хранилища** (W14). Когда у
   владельца несколько путей записи (массовый и одиночный), уведомление обязано покрывать оба, иначе это ошибка
   контракта. Тут ошиблись Django и Strapi. **8/8.**
9. **Архитектурные доки GM проверяются против кода** тестами или генерацией из графа, чтобы не получить HA
   `core.md` с устаревшим `time_changed` (W25). **7/7.**

### 14.6 Где проекты расходятся и как это читать

- **События или прямые вызовы.** GitLab строит EventStore, но в 2026 пишет «prefer direct dependencies over monolith
  callbacks». Medusa отдаёт события только неинтегральному. Django советует прямые вызовы. Magento использует события
  широко и платит правилами 14.1-14.3. Вывод: события годятся только для побочного, и это совпадает с принятым в GM
  «events later».
- **Изоляция контейнером или линтом.** Medusa изолирует в рантайме (контейнер модуля), HA и GitLab изолируют
  статически (AST, RuboCop), Magento и Odoo почти не изолируют. Типизированные контракты GM дают изоляцию на этапе
  компиляции. Строки связывания стоит дополнительно проверять так же, как hassfest проверяет импорты.
- **Регистрация в рантайме или при сборке.** У GitLab подписки заморожены при загрузке, у Discourse регистрации
  вечные, у HA есть отписка на всё. Для GM: статический граф и отзываемые по поколению регистрации в плагинных хостах.

## 15. Что не проверено и пробелы

- Поведение Redis-шины событий Medusa при ошибке подписчика и повторы (UNVERIFIED).
- Есть ли в Odoo статическая проверка обращений `env['model']` к моделям вне `depends` (UNVERIFIED).
- Обработка ошибок lifecycle hooks в Strapi (UNVERIFIED).
- Мотив перехода Django 6.1 на `TaskGroup` (#36315 не открывал).
- Внутренние обсуждения HA (`home-assistant/architecture` discussions) и Medusa по выбору links не открывал. В блоге
  Medusa обещан отдельный пост с обоснованием переписывания ("We will elaborate on this thinking in a separate blog
  post"), я его не нашёл.

## 16. Первоисточники (все открывались 2026-10-16)

Medusa
- https://medusajs.com/blog/v2-release (2024-10-23)
- https://medusajs.com/blog/announcing-modules/ (2023-04-04)
- https://docs.medusajs.com/learn/fundamentals/modules/isolation
- https://docs.medusajs.com/learn/fundamentals/modules/options
- https://docs.medusajs.com/learn/fundamentals/modules/container
- https://docs.medusajs.com/learn/fundamentals/module-links
- https://docs.medusajs.com/learn/fundamentals/module-links/read-only
- https://docs.medusajs.com/learn/fundamentals/workflows/workflow-hooks
- https://docs.medusajs.com/learn/fundamentals/workflows/compensation-function
- https://docs.medusajs.com/learn/fundamentals/workflows/long-running-workflow
- https://docs.medusajs.com/learn/fundamentals/events-and-subscribers
- https://docs.medusajs.com/learn/fundamentals/events-and-subscribers/emit-event
- https://github.com/medusajs/medusa/blob/v2.21.2/packages/modules/event-bus-local/src/services/event-bus-local.ts

Home Assistant
- https://github.com/home-assistant/developers.home-assistant/tree/50b518898989b67bb76b69827f227aa6f0acd32a
  (`docs/config_entries_index.md`, `docs/integration_setup_failures.md`, `docs/integration_events.md`,
  `docs/integration_listen_events.md`, `docs/dev_101_hass.md`, `docs/dev_101_events.md`, `docs/dev_101_states.md`,
  `docs/architecture/core.md`, `docs/creating_integration_manifest.md`, `docs/integration_fetching_data.md`,
  `docs/asyncio_thread_safety.md`, `docs/core/platform/backup.md`,
  `docs/core/integration-quality-scale/rules/{runtime-data,entity-event-setup,action-setup,config-entry-unloading}.md`,
  блог: `2022-04-20-saying-goodbye-to-event_time_changed.md`, `2023-07-27-avoiding-unnecessary-callbacks-with-dataupdatecoordinator.md`,
  `2024-03-30-deprecate-hass-helpers.md`, `2024-04-13-deprecate_async_track_state_change.md`,
  `2024-04-30-store-runtime-data-inside-config-entry.md`, `2024-05-01-improved-hass-data-typing.md`,
  `2025-02-16-config-subentries.md`, `2026-05-07-config-entry-listener-together-with-reloading-methods.md`)
- https://github.com/home-assistant/core/blob/2026.10.1/homeassistant/core.py
- https://github.com/home-assistant/core/blob/2026.10.1/homeassistant/helpers/dispatcher.py
- https://github.com/home-assistant/core/blob/2026.10.1/script/hassfest/dependencies.py
- https://github.com/home-assistant/core/blob/2026.10.1/script/hassfest/quality_scale_validation/runtime_data.py
- https://github.com/home-assistant/core/pull/173519 (2026-06-15)
- https://github.com/home-assistant/core/pull/182763 (2026-09-20)

Magento / Adobe Commerce
- https://github.com/AdobeDocs/commerce-php/tree/80d81d1922af3e1669a2535370a31138708cadff
  (`src/pages/development/components/plugins.md`, `.../events-and-observers/index.md`,
  `src/pages/best-practices/extensions/observers.md`, `.../architecture.md`,
  `src/pages/coding-standards/technical-guidelines.md`, `src/pages/development/build/dependency-injection-file.md`)
- https://github.com/AdobeDocs/commerce-extensibility/blob/8062580677ba10c581784b521717af6d98a630d4/src/pages/app-development/index.md
- https://github.com/magento/magento2/blob/2.4.9/lib/internal/Magento/Framework/Event/Manager.php
- https://github.com/magento/magento2/blob/2.4.9/lib/internal/Magento/Framework/Event/Invoker/InvokerDefault.php
- https://alanastorm.com/magento_2_object_manager_plugin_system/ (2015-09-02, практик)

Odoo
- https://github.com/odoo/documentation/blob/19.0/content/developer/reference/backend/orm.rst
- https://github.com/odoo/documentation/blob/19.0/content/developer/reference/backend/module.rst
- https://github.com/odoo/documentation/blob/19.0/content/developer/reference/frontend/patching_code.rst
- https://github.com/odoo/documentation/blob/19.0/content/developer/tutorials/server_framework_101/12_inheritance.rst
- https://github.com/odoo/documentation/blob/19.0/content/contributing/development/coding_guidelines.rst
- https://github.com/odoo/odoo/blob/19.0/odoo/orm/model_classes.py
- https://www.odoo.com/forum/help-1/modules-order-of-dependencies-159563 (сообщество)

Django
- https://github.com/django/django/blob/stable/6.1.x/docs/topics/signals.txt
- https://github.com/django/django/blob/stable/6.1.x/docs/ref/signals.txt
- https://github.com/django/django/blob/stable/6.1.x/docs/ref/models/querysets.txt
- https://code.djangoproject.com/ticket/30801
- https://code.djangoproject.com/ticket/31327

GitLab
- https://gitlab.com/gitlab-org/gitlab/-/blob/master/doc/development/eventstore/_index.md
- https://gitlab.com/gitlab-org/gitlab/-/blob/master/doc/development/software_design.md
- https://gitlab.com/gitlab-org/gitlab/-/blob/master/doc/development/ee_features.md
- https://gitlab.com/gitlab-org/gitlab/-/blob/1697a4648d4ffb04bbd961b7936aa584c9b28db8/lib/gitlab/event_store/store.rb
- https://gitlab.com/gitlab-org/gitlab/-/blob/1697a4648d4ffb04bbd961b7936aa584c9b28db8/lib/gitlab/event_store/subscription.rb
- https://gitlab.com/gitlab-org/gitlab/-/merge_requests/34042 (2020-06-08 → 2022-01-01)
- https://handbook.gitlab.com/handbook/engineering/architecture/design-documents/modular_monolith/ (proposed)
  и `domain_layer.md`, `hexagonal_monolith/index.md` в `gitlab-com/content-sites/handbook`
- https://about.gitlab.com/blog/2022/07/14/open-core-is-worse-than-plugins/

Node-RED, n8n
- https://github.com/node-red/node-red.github.io/blob/9e056814e9c53f88e5f6709b9c65fb621e832fc4/docs/creating-nodes/node-js.md
- https://github.com/node-red/node-red.github.io/blob/main/_posts/2019-08-16-going-async.md
- https://github.com/node-red/node-red.github.io/blob/main/_posts/2019-09-13-cloning-messages.md
- https://github.com/node-red/node-red.github.io/blob/main/docs/user-guide/context.md
- https://github.com/node-red/node-red.github.io/blob/main/docs/user-guide/handling-errors.md
- https://github.com/n8n-io/n8n-docs/blob/main/docs/changelog/v10-migration-guide.md
- https://github.com/n8n-io/n8n-docs/blob/main/docs/changelog/v20-breaking-changes.md
- https://github.com/n8n-io/n8n-docs/blob/main/docs/build/flow-logic/understand-execution-order.md

Strapi
- https://github.com/strapi/documentation/blob/cd392928082fd048a31f18d25da97d697ad981bc/docusaurus/docs/cms/plugins-development/server-lifecycle.md
- .../plugins-development/server-getters-usage.md
- .../migration/v4-to-v5/breaking-changes/lifecycle-hooks-document-service.md
- .../backend-customization/models.md

Discourse
- https://github.com/discourse/discourse/blob/v2026.9.0/lib/discourse_event.rb
- https://github.com/discourse/discourse/blob/v2026.9.0/lib/plugin/instance.rb
- https://github.com/discourse/discourse/blob/v2026.9.0/lib/discourse_plugin_registry.rb
- https://meta.discourse.org/t/262064 (modifyClass)
- https://meta.discourse.org/t/349954 (transformers)
- https://meta.discourse.org/t/341014 (post menu migration)

Temporal
- https://github.com/temporalio/documentation/blob/e3473e398babae8e4bad8146a049eb12fe2b1979/docs/encyclopedia/workflow-message-passing/workflow-message-passing.mdx
- .../encyclopedia/workflow-message-passing/handling-messages.mdx
- .../encyclopedia/child-workflows/child-workflows.mdx
- .../encyclopedia/child-workflows/parent-close-policy.mdx
- https://community.temporal.io/t/temporal-community-newsletter-december-2024/15802 (2024-12-20)
