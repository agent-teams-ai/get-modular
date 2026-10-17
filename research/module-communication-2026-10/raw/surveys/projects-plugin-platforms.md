# Плагинные платформы: как реальные проекты связывают модули (исследование на уровне проектов, 2026-10-16)

Автор: исследовательский агент по платформам плагинов, по заданию ведущего.
Область: исходный код и проектная документация долгоживущих плагинных платформ: Kibana, JupyterLab/Lumino, Eclipse Theia,
внутреннее устройство VS Code, Grafana, Obsidian, расширения Chrome, Electron, а также Figma, Mattermost и Discourse.
Каталог `PRACTICES.md` прочитан до начала работы. Здесь не повторяется то, что уже покрыто: публичный API расширений VS Code,
Backstage, OSGi, IntelliJ, Tapable и другие. Ссылки на строки каталога даны в виде `PRACTICES A3`, `D-1` и т.п.

## 0. Метод и версии

- Источники: исходный код на конкретном коммите или теге, проектная документация из репозиториев, RFC, issue и PR
  мейнтейнеров, официальные страницы документации. Markdown-исходники скачаны `curl` и `gh api`, цитаты извлечены
  `grep`/`sed` и приведены дословно на английском. Страницы без исходников в git (Chrome, Figma, часть Grafana и Electron)
  прочитаны через WebFetch. Цитаты оттуда тоже дословные, но извлечены моделью-пересказчиком; дату обновления страницы
  указываю, когда она видна.
- Всё, что подтвердить не удалось, помечено **UNVERIFIED**. Мои выводы собраны в разделах **«Моя оценка:»**.
- Персональные данные в запросы не передавались.

| Проект | Версия / коммит | Дата |
|---|---|---|
| Kibana | `elastic/kibana` main `8f43ddb6cba3`; ветки `7.9`, `7.10` для истории миграции | 2026-10-16 |
| JupyterLab | тег `v4.6.4` | 2026-09-21 |
| Lumino | main `44aea979d5d2` (последний релиз `v2026.10.8`) | 2026-10-08 |
| Eclipse Theia | тег `v1.76.0`; сайт `theia-website` `8c24865608715` | 2026-09-24 / 2026-10-15 |
| VS Code | `microsoft/vscode` main `97697835e296`; вики `Source-Code-Organization` (история с 2020-11-25 по 2025-06-07) | 2026-10-16 |
| Grafana | `grafana/grafana` main `d950a0fd98c2`; `grafana/plugin-tools` main `0ab7e32ba1a6` | 2026-10-16 |
| Obsidian | `obsidian-developer-docs` `c56c7e770ba2`; `obsidian-api` `9abd9605ce08` | 2026-08-10 / 2026-10-05 |
| Chrome Extensions | developer.chrome.com (страница messaging обновлена 2025-12-03) | см. по месту |
| Electron | тег `v44.8.0` | 2026-10-16 |
| Figma | developers.figma.com; блог 2019-08-22 | см. по месту |
| Mattermost | `mattermost/mattermost` master `356bdc7d9b42`; dev-docs `508909090d8c` | 2026-10-16 / 2026-09-22 |
| Discourse | `discourse/discourse` main `4bae0436fe7a`; темы meta.discourse.org | 2026-10-16 |

Короткие ссылки ниже: `KIB` = `https://github.com/elastic/kibana/blob/8f43ddb6cba31bb7725047e0dd62ab7d8ade2416`,
`LUM` = `https://github.com/jupyterlab/lumino/blob/44aea979d5d2c77665d651383d27179a63596957`,
`JL` = `https://github.com/jupyterlab/jupyterlab/blob/v4.6.4`, `THW` = `https://github.com/eclipse-theia/theia-website/blob/8c24865608715c26c69853f7e4d2ee5d0a7a201f`,
`TH` = `https://github.com/eclipse-theia/theia/blob/v1.76.0`, `VSC` = `https://github.com/microsoft/vscode/blob/97697835e296c8fe2c29001da426b242cd969a3f`,
`GPT` = `https://github.com/grafana/plugin-tools/blob/0ab7e32ba1a66bc144176b9c4d47763f9c69ec69/docusaurus/docs`,
`GRF` = `https://github.com/grafana/grafana/blob/d950a0fd98c2bf0fe9c5ded8c50cae86d71eabc2`,
`OBS` = `https://github.com/obsidianmd/obsidian-developer-docs/blob/c56c7e770ba25dd0ea392aacf4588f9425970d36/en`,
`EL` = `https://github.com/electron/electron/blob/v44.8.0/docs`, `MM` = `https://github.com/mattermost/mattermost/blob/356bdc7d9b42aece875cc37271877a3e2576f4dc`,
`DSC` = `https://github.com/discourse/discourse/blob/4bae0436fe7a1568b2a67ed1b6ae5039f1b4ebc8`.

---

## 1. Kibana: платформа плагинов с контрактами `setup`/`start`

### 1.0 Исходный замысел (2016)
Основополагающий дизайн-документ: issue «New Kibana platform», elastic/kibana#9675, автор epixa, 2016-12-29
(https://github.com/elastic/kibana/issues/9675). Ключевые цели дословно:
- "State is built and maintained through runtime execution rather than exposed as global singletons in JS modules. In other words, simply importing a module should not have side effects."
- "Plugin dependencies (on other plugins) should be explicit, and dependencies should be able to be optional."
- "Systems must communicate with each other only at runtime and through well defined interfaces. State cannot reliably be shared implicitly through code imports."
- Неявные контракты были названы явно: "An example of an implicit contract is an intentionally placed custom HTML attribute on a UI component with the expectation that other systems would directly access the global DOM element via that attribute."
- "The interface(s) that a system has access to can and will change depending on its current lifecycle event. [...] At the same time, the interface(s) that a system has access to will not change within the context of a single lifecycle event."
- В 2016 году данные предлагалось отдавать как observables: "data should be exposed as observables rather than in their raw current form". В 2019 году от этого частично отказались (см. 1.6).

### 1.1 Родитель → ребёнок
- Ядро передаёт плагину контракты, свои для каждой фазы: "The lifecycle-specific contracts exposed by core services are always passed as the first argument to the equivalent lifecycle function in a plugin." (`KIB/docs/extend/key-concepts/platform-architecture/anatomy-of-a-plugin.md`).
- Конфигурацию и логгер плагин получает в конструкторе через `PluginInitializerContext`. Контракты других плагинов приходят вторым аргументом `setup(core, plugins)` и `start(core, plugins)`.
- Таблица фаз (`plugins-packages-and-the-platform.md`): `setup` — "perform "registration" work to setup environment for runtime"; `start` — "bootstrap runtime logic"; `stop` — "cleanup runtime".
- Конвенции 7.10 (https://github.com/elastic/kibana/blob/7.10/src/core/CONVENTIONS.md): "`setup` is reserved for "registration" work"; "`start` is where any "running" logic for your plugin would live". Образец сервиса собирает регистрации в `setup` и замораживает их в `start` вызовом `this.strings$.complete()`: регистрировать можно только до старта.

### 1.2 Ребёнок → родитель
- Направления «ребёнок пишет в родителя» нет. Есть точки расширения, которые родитель (ядро или плагин) отдаёт в `setup`: "An extension point is a function provided by core, or a plugin's plugin API, that can be used by other plugins to customize the Kibana experience." Примеры из той же страницы: `core.application.register`, `embeddables.registerEmbeddableFactory`, `uiActions.registerActionAsync`, `core.savedObjects.registerType`.
- Состояние плагина ядро наблюдает через status API. RFC 0007 требует, чтобы ядро предоставляло "a global mechanism for core services and plugins to signal their status", а плагины могли "inspect and subscribe to status changes from any of their dependencies" (`KIB/legacy_rfcs/text/0007_lifecycle_unblocked.md`, 2019-09-11).

### 1.3 Соседи и далёкие плагины
- Общение идёт только через объявленный контракт: "Unlike core, capabilities exposed by plugins are not automatically injected into all plugins. Instead, if a plugin wishes to use the public interface provided by another plugin, it must first declare that plugin as a dependency" (anatomy).
- Статический импорт допустим только для чистого кода: "If the code is stateful, it has to be exposed from a plugin's lifecycle methods. Do not statically export stateful code." (`plugins-packages-and-the-platform.md`). Руководство по миграции 7.9 (https://github.com/elastic/kibana/blob/7.9/src/core/MIGRATION.md) объясняет причину: "**Plugins cannot share state by importing each others modules.** [...] because those plugins have copies of the exported module, this assumption will be incorrect." Там же есть контрпример с реестром на уровне модуля `const visTypes = []; export const registerVisType = ...` и исправление: регистрация в контракте `setup`, чтение в контракте `start`.
- Граф плагинов строго ацикличен. Сортировка Кана, при цикле выдаётся ошибка с путями цикла (`KIB/src/core/packages/plugins/server-internal/src/plugins_system.ts`): "Ordering is possible if and only if the plugins graph has no directed cycles [...] If plugins cannot be ordered an error is thrown."
- Видимость между группами: в манифесте есть `group` и `visibility`, где `"private": The plugin is only accessible from plugins that belong to the same group` (anatomy). Правило ESLint `no_group_crossing_imports` выдаёт "Illegal import statement" с советом "Relocate this module to a different group, and/or make sure it has the right 'visibility'." (`KIB/packages/kbn-eslint-plugin-imports/src/rules/no_group_crossing_imports.ts`).

### 1.4 Опциональные зависимости
- "If any of the optional plugins are disabled or not installed, your plugin will still load, however that plugin's API contract will be undefined in the second parameter of the setup and start functions." (anatomy). В типах это поле `thirdPlugin?: ThirdPluginSetup;  // Optional dependency` (CONVENTIONS 7.10).
- Опциональные зависимости участвуют в топологической сортировке, только если плагин присутствует (`plugins_system.ts`: "We exclude optional dependencies that are not present in the plugins graph").

### 1.5 Жизненный цикл, очистка, утечки
- Асинхронный `setup` и `start` устарели. В коде (`plugins_system.ts`) есть предупреждение "Plugin ${pluginName} is using asynchronous setup lifecycle. Asynchronous plugins support will be removed in a later version." и таймаут 10 с: "Setup lifecycle of "${pluginName}" plugin wasn't completed in 10sec. Consider disabling the plugin and re-start."
- `stop` вызывается в обратном порядке зависимостей. Комментарий в коде: "Stop plugin as soon as all the dependant plugins are stopped." Таймаут 15 с с продолжением: `"${pluginName}" plugin didn't stop in 15sec., move on to the next.`, ошибка `stop` логируется (`thrown during stop`), остановка остальных продолжается.
- Ленивый доступ к start-контрактам из `setup` (CONVENTIONS 7.10): "Prefer the pattern shown above, using `core.getStartServices()`, rather than store local references retrieved from `start`." Обоснование: "Having an API that fails sometimes isn't a good API design, and it makes accurately testing this difficult."

### 1.6 Эволюция и причины
1. **Legacy → new platform.** Руководство 7.9 называет корень проблем так: "When a legacy browser plugin needs to access functionality from another plugin [...] it imports a stateful (global singleton) JavaScript module and performs some sort of state mutation." Итог: "We had to invent an unconventional and fragile way of allowing plugins to integrate and communicate with one another, `uiExports`". На сервере: "legacy core and plugin functionality is retrieved from either the hapi.js `server` or `request` god objects. [...] And the worst of it all is, these objects are mutable at any time." Ради чего всё это: "enable plugins to integrate and communicate _at runtime_ rather than at build time".
2. **Появилась фаза `setup` (RFC 0001, 2019-03-05).** Нужно было, чтобы контракт имел "a reliable expiration in the context of the overall lifecycle". В разделе недостатков RFC честно пишет: "Adopting new lifecycle hooks is a slippery slope, and the more we have in the system, the more complicated it is to reason about the capabilities of the system at any given point." (`KIB/legacy_rfcs/text/0001_lifecycle_setup.md`).
3. **От блокирующих async-фаз к синхронным (RFC 0007, 2019-09-11).** Мотивация: "a single plugin with a network error that isn't retried or a dependency on an external host that is down, could block all of Kibana from starting up." Решение: "Lifecycle methods are synchronous functions, they can perform async operations but Core doesn't wait for these to complete." Принцип: "Some problems might go unnoticed, but no single plugin should affect the availability of all other plugins." Отдельно: "The once-off nature of lifecycle methods are incompatible with the real-world dynamic conditions under which plugins run." Внедряли постепенно: сначала устаревание и таймаут, потом удаление. Выше видно, что в коде 2026 года таймаут на 10 с всё ещё стоит.
4. **Разворот по observables (RFC 0007 §3).** "Core should not expose API's as observables [...] exposing these internal state changes as part of the API contract leaks internal implementation details consumers can't do anything useful with and don't care about." Пример: `core.elasticsearch.adminClient$`. Исключение: "When an API consumer is interested in the *state changes itself* it absolutely makes sense to expose this as an Observable. Good examples of this is exposing plugin config".
5. **Аварийный выход из циклов (2023).** PR #167113 «Add dynamic contract resolving» (влит 2023-10-24) и issue #166688 добавили `core.plugins.onSetup/onStart`. Причина: команды тратили "the amount of effort [...] currently spending on splitting their plugins". Ограничитель в PR: "plugins can only perforn dynamic contract resolving against dependencies explicitly defined in their manifest", новое поле манифеста `runtimePluginDependencies`. В текущем API это записано как долг (`KIB/src/core/packages/plugins/contracts-server/src/contracts.ts`): "This API should only be used when trying to address cyclic dependency issues that can't easily be solved otherwise. [...] by using this API, you implicitly agree to: consider it as technical debt and open an issue to track the tech debt resolution". Порядок не гарантирован: "The execution order is not guaranteed to be consistent."
6. **Неявные ребра становятся явными (2020 → 2026).** Issue #66682 (2020-05-15, всё ещё OPEN): "Plugin URLs should be part of the plugin's contract [...] It's easy to miss a plugin's dependency upon another plugin's URL". В 2026 году этим занялись всерьёз: PR #276240 (влит 2026-07-14) "Each plugin's `navigateToApp` / `getUrlForApp` is wrapped so that navigating to an app owned by a plugin the caller does **not** declare as a dependency [...] logs a deduped warning." План стека: "report-mode" → "one-time migration seeding `runtimePluginDependencies`" → "flip report → hard-fail in dev/CI".

### 1.7 Что сам проект называет лучшими и худшими практиками
- Лучшие: явные интерфейсы контрактов ("We highly encourage plugin authors to explicitly declare public interfaces"); `export type` вместо `export` и запрет `export *` в публичных `index.ts`; `getStartServices()` вместо сохранения ссылок из `start`.
- Худшие: статический экспорт кода с состоянием; глобальные синглтоны в модулях; хранение ссылок из `start` в полях класса ("Anti pattern"); асинхронные фазы; ручной обход циклов без пометки долга.

---

## 2. JupyterLab и Lumino: плагины на `Token`, `requires`/`optional`/`provides`, `Signal`

### 2.1 Родитель → ребёнок
- Плагин — объект `{ id, requires, optional, provides, activate, deactivate, autoStart }`. Сервисы приходят аргументами `activate`: "The arguments are, in order, the application object, the services corresponding to the `requires` tokens, then the services corresponding to the `optional` tokens (or `null` if that particular `optional` token is not registered in the system)." (`JL/docs/source/extension/extension_dev.md`).
- Настройки плагина приходят через сервис `ISettingRegistry`, который тоже запрашивается по токену (там же, раздел Plugin Settings).

### 2.2 Ребёнок → родитель
- Ребёнок вкладывает функциональность в реестры владельца: команды ("The application has a single command registry, keyed by string command IDs"), меню, статус-бар, панель запуска (`JL/docs/source/extension/extension_points.md`).
- «Семантические пункты меню» — хороший пример ребёнка, который сообщает родителю о своей способности, а не о действии: "Rather than having a proliferation of similar menu items for this common operation of "closing-and-cleanup", we provide a single command that can adapt itself to this use case". Активность регистрирует `{ id, isEnabled: (w) => tracker.has(w) }` в `mainMenu.fileMenu.closeAndCleaners`.

### 2.3 Соседи и далёкие
- Всё строится на токенах, а не на строках: "JupyterLab uses tokens to identify services (instead of strings, for example) to prevent conflicts between identifiers and to enable type checking when using TypeScript." Токен — это `class Token<T> { name; description; }` (`LUM/packages/coreutils/src/token.ts`).
- Токен выносят в третий пакет: "A pattern in core JupyterLab is to create and export a token from a third package that both the provider and consumer extensions import, rather than defining the token in the provider's package. This enables a user to swap out the provider extension for a different extension that provides the same token". На каждый токен один поставщик: "A token can only be registered with the system once."
- Динамические экземпляры видны соседям через «трекеры» (`WidgetTracker`): "Extensions keep track of instances of their activities in instances of `WidgetTracker` class, which are then provided as tokens so that other extensions may request them. [...] You can also use it to be notified via signals when notebooks are added and removed from the tracker." (extension_points.md).
- Сигналы Lumino (`LUM/packages/signaling/src/index.ts`): "Slots are invoked synchronously in connection order. Exceptions thrown by connected slots will be caught and logged." Подписка во время рассылки получит только следующую рассылку: "A newly connected slot will not be invoked until the next time the signal is emitted, even if the slot is connected while the signal is dispatching." Отписка во время рассылки срабатывает сразу: "A disconnected slot will no longer be invoked, even if the slot is disconnected while the signal is dispatching." Обработчик исключений по умолчанию: "The default exception handler is `console.error`."
- Дедупликация токенов в рантайме обязательна. Если в бандлах окажутся две копии пакета с токеном, провайдер и потребитель не встретятся: "Tokens identifying plugin services also need to be shared across the providers and consumers of the services, so dependencies that export tokens need to be deduplicated." Отсюда настройки `sharedPackages` с `singleton: true` (extension_dev.md).

### 2.4 Опциональные зависимости
- Отсутствие провайдера даёт `null` в соответствующем аргументе `activate`.
- **Сбой провайдера тоже превращается в `null`**, и это легко пропустить. `resolveOptionalService` в `LUM/packages/coreutils/src/plugins.ts`:
  ```ts
  if (!plugin.activated) {
    try { await this.activatePlugin(id); }
    catch (reason) { console.error(reason); return null; }
  }
  ```
  Потребитель не может отличить «не установлен» от «упал при активации».

### 2.5 Жизненный цикл и очистка
- Есть `deactivate`, но он работает каскадно и только при полной поддержке: `deactivatePlugin` "Deactivate the plugin and its downstream dependents if and only if the plugin and its dependents all support `deactivate`." Если у зависимого нет `deactivate`, выбрасывается `TypeError(... "#deactivate() method missing (depends on ${id})")`. Деактивация идёт сверху вниз по зависимым: "Await deactivation so the next plugins only receive active services."
- Сигналы держат связи в `WeakMap` ("A weak mapping of sender to array of receiver connections"), очистку откладывают ("This function should only be invoked asynchronously, when the stack frame is guaranteed to not be on the path of user code"). Для объекта есть `Signal.clearData(object)`.
- Циклы запрещены: `registerPlugin` бросает ошибку, "if the plugin has a circular dependency".

### 2.6 Эволюция
- **Отложенная активация (Lumino PR #588, 2023-06-14):** `autoStart: 'defer'` — "the plugin should be activated only after the application is started" (`LUM/packages/coreutils/src/plugins.ts`).
- **Реестр плагинов отделили от приложения (Lumino PR #703, 2024-05-25):** "Refactor the plugins handling outside of the `Application` class to be able to instantiate and use it independently. Add a allowed/blocked list feature". Реестр переехал в `@lumino/coreutils`, "to avoid bringing the widgets package in the stack dependency". Теперь он работает и на сервере: "has no DOM dependency, so it runs in Node as-is" (`LUM/docs/source/plugin-registry-server.md`).
- **Глобальные синглтоны заменили токенами (JupyterLab 4):** "Global `sessionContextDialogs` is removed; you should request the token `ISessionContextDialogs`" (`JL/docs/source/extension/extension_migration.md`). Там же `defaultContentFactory` заменён токеном `IEditorServices`.
- **Управление плагинами (JupyterLab 4.1):** "Prior to JupyterLab 4.1 there was no mechanisms: - for users to disable/enable individual plugins [...] - for administrators to fully block users from enabling/disabling certain extensions".
- **Замена чужого плагина объявлением:** `jupyterlab.disabledExtensions` в `package.json` отключает переопределяемый плагин. Пример: "if an extension replaces the `@jupyterlab/filebrowser-extension:share-file` plugin [...] it can automatically disable" его.

### 2.7 Лучшие и худшие практики по версии проекта
- Лучшие: токены вместо строк; токен в отдельном пакете; `optional` для некритичных сервисов. Пример из документации: статус-бар как опциональная зависимость, "still make it possible for users running a customized JupyterLab distribution without a status bar to use the consumer plugin". Трекеры вместо ссылок на виджеты.
- Худшие (по самой документации): дублирование пакетов с токенами; source-расширения, которые требуют пересборки ("[DEPRECATED] A _source extension_").

---

## 3. Eclipse Theia: Inversify DI, contribution providers, RPC фронтенд/бэкенд

### 3.1 Родитель → ребёнок
- Расширение — это npm-пакет с `ContainerModule`, которые наполняют общий DI-контейнер: "Technically, an extension is an npm package that exposes any number of DI modules (`ContainerModule`) that contribute to the creation of the DI container." (`THW/src/docs/extensions.md`).
- Зависимости внедряются по символу-интерфейсу: `@inject(MessageService)` (`THW/src/docs/services_and_contributions.md`).

### 3.2 Ребёнок → родитель
- Точки вклада: "Contribution points define hooks, which allow extending something. Contribution points are defined by an interface that the contributor is expected to implement, e.g. a `CommandContribution`." Владелец собирает вклады через `ContributionProvider` / `bindContributionProvider`.
- События жизненного цикла приложения: `FrontendApplicationContribution` с `initialize`, `configure`, `onStart`, `initializeLayout`, `onStop` (`THW/src/docs/frontend_application_contribution.md`). Каждый вызов замеряется, порог предупреждения 100 мс (`TIMER_WARNING_THRESHOLD = 100` в `TH/packages/core/src/browser/frontend-application.ts`). Ошибка одного вклада логируется (`'Could not initialize contribution'`), запуск остальных продолжается.

### 3.3 Соседи и далёкие
- Сервисы находятся через DI и заменяемы целиком: "You can even override the existing default implementation of a service without breaking any service consumers." Для этого документация советует пару «символ + интерфейс», чтобы работал `rebind`: "The additional symbol is worth the boilerplate because it leaves adopters a choice. They can either subclass your default implementation or provide an entirely independent one".
- Между процессами фронтенд и бэкенд общаются по JSON-RPC: "they communicate through JSON-RPC messages over WebSockets or REST APIs over HTTP" (`THW/src/docs/architecture.md`). Сервер объявляет `RpcConnectionHandler<TaskClient>(taskPath, client => ...)`, клиент получает типизированный прокси `connection.createProxy<TaskServer>(taskPath, client)`. Обратный канал (сервер → клиент) — объект-клиент, который передаётся через `setClient` (`RpcServer<Client>`) (`THW/src/docs/json_rpc.md`).
- Платформенные папки как в VS Code: `common`, `browser`, `electron-browser`, `node`, `node-electron` (architecture.md).
- Удалять чужие вклады можно фильтрами: `FilterContribution` + `ContributionFilterRegistry.addFilters([CommandContribution], [contrib => !(contrib instanceof X)])` (`THW/src/docs/contribution_filter.md`).

### 3.4 Опциональные зависимости
- Для Inversify это `@optional()`. Отдельной концепции «опционального плагина» в документации Theia не нашёл (**UNVERIFIED**, что её нет вовсе).

### 3.5 Жизненный цикл, утечки
- **Утечка через захват области в contribution provider.** Подробный JSDoc в `TH/packages/core/src/common/contribution-provider.ts`: "**In most cases, prefer {@link bindRootContributionProvider} instead.** This variant retains a reference to whichever container first resolves the provider. If that container is a short-lived child (e.g. a widget container), the provider will keep the child — and everything cached in it — alive for the lifetime of the application, causing a memory leak." Провайдер ещё и кэширует список при первом вызове `getContributions` (`this.services === undefined`), а ошибки `getAll` глотает через `console.error(error)`.
- **Контейнеры на соединение (1.71.0, 2026-04-30):** "unbound all services in the backend in connection-scoped child containers on close. This allows clean-up methods annotated with `@preDestroy()` to run, releasing resources." Предупреждение там же: экземпляры, которые разделяются между контейнерами, будут уничтожены, пока ими ещё пользуются. Это "already Inversify anti-patterns" (`TH/CHANGELOG.md`).
- **Остановка (1.72.0, 2026-05-28):** `BackendApplicationContribution.onStop()` теперь вызывается "from `gracefulShutdown()` before the root Inversify container is unbound [...] Hooks are dispatched in parallel and may now return `Promise<void>` to participate in the (timeout-bounded) asynchronous shutdown". Предупреждение: "Contributions that somehow relied on a particular synchronous cross-contribution ordering will observe different behaviour".
- В CHANGELOG регулярно встречаются утечки слушателей. Пример из 1.75.0: "fixed a listener leak when streaming rebuilds response content, which leaked one listener per streamed token after a tool call" (#17883).

### 3.6 Эволюция
- **Contribution providers → реестры (issue #10877, 2022-03-11, OPEN):** "anything that is registered with a contribution provided must be known at build time, is typically instantiated at application startup, and is never disposed of. That makes contribution points less open to extension and enforces a less flexible lifecycle on their contributions, and so, where possible, we should favor registries". Пример: `LabelProviderContribution` для виджета-дерева "will be instantiated at startup, and will never be destroyed even when the widget is closed" (https://github.com/eclipse-theia/theia/issues/10877). Комментарий colin-grant-work от 2022-04-22 описал утечку через захват контейнера. Исправили её почти через четыре года: PR #17021 (влит 2026-02-26, вошёл в 1.69.0). По описанию PR, провайдер теперь "drop the reference to the container once services are cached", и появился `bindRootContributionProvider`, который "guarantees that the root container will be used".
- **Свой RPC вместо `vscode-ws-jsonrpc` (1.27.0, 2022):** "replaced `vscode-ws-jsonrpc` with a custom RPC protocol that is better suited for handling binary data and enables message tunneling" (#11228). Позже перешли на `msgpackr` (#11447) (`TH/doc/changelogs/CHANGELOG-2022.md`).
- **Конфликт `rebind` в реальном релизе (1.76.0, 2026-09-24):** "rebound `ScmCommitWidget` to `AiAwareScmCommitWidget` [...] Adopters that rebind `ScmCommitWidget` themselves now override this binding and lose the commit-message button; they should extend `AiAwareScmCommitWidget` instead" (#17669). Модель «перепривязать что угодно» даёт молчаливую конкуренцию за один биндинг.
- **Собственный API плагинов Theia отодвинут:** "Please be aware that the support for Theia Plugins is currently under discussion. We therefore recommend using VS Code extensions or Theia extensions instead of Theia Plugins." (extensions.md). Исходную дискуссию не нашёл, причины **UNVERIFIED**.

### 3.7 Практики по версии проекта
- Лучшие: символ + интерфейс + `rebind` для заменяемых сервисов; `bindRootContributionProvider` по умолчанию; `protected` поля для наследования.
- Худшие: `bindContributionProvider` в краткоживущем контейнере (утечка); общие экземпляры между контейнерами соединений ("Inversify anti-patterns"); опора на порядок синхронных `onStop`.

---

## 4. VS Code изнутри: слои, DI, реестр вкладов, правила линтера

### 4.1 Родитель → ребёнок
- Слои: `base` → `platform` → `editor` → `workbench` → `code`/`server`. Внутри каждого слоя код делится по средам: `common`, `browser`, `node`, `electron-browser`, `electron-utility`, `electron-main`. Для каждой среды указано, из каких можно импортировать: например, `electron-main` — "may use code from: `common`, `node`, `electron-utility`" (вики https://github.com/microsoft/vscode/wiki/Source-Code-Organization).
- Зависимости передаются через конструктор с декораторами: "Services get to its clients via `constructor injection`. [...] a service identifier is a decoration [...] and should have the same name as the service interface." Пример: `constructor(@IModelService modelService: IModelService)`.
- Регистрация сервиса: `registerSingleton(ISymbolNavigationService, SymbolNavigationService, InstantiationType.Delayed)`. Комментарий в коде (`VSC/src/vs/platform/instantiation/common/extensions.ts`): `Eager` — "this is more costly as some upfront work is done that is likely not needed", `Delayed` — "This is the _better_ way of registering a service."
- Дочерние области: `createChild(services)`. Из документации интерфейса: "NOTE that the returned child is `disposable` and should be disposed when not used anymore. This will also dispose all the services that this service has created." (`VSC/src/vs/platform/instantiation/common/instantiation.ts`).

### 4.2 Ребёнок → родитель
- Ядро workbench не зависит от вкладов: "At its core, the workbench does not have direct dependencies to all these contributions. Instead, we use an internal (as opposed to real extension API) mechanism to contribute these contributions to the workbench." У каждого вклада одна точка входа `*.contribution.ts`.
- Вклады регистрируются вызовом `registerWorkbenchContribution2(id, ctor, instantiation)`, где `instantiation` — фаза (`BlockStartup`, `BlockRestore`, `AfterRestored`, `Eventually`), `{ lazy: true }` или `{ editorTypeId }` (`VSC/src/vs/workbench/common/contributions.ts`). Для блокирующих фаз ID обязателен по сигнатуре перегрузки. В комментарии к `BlockStartup`: "doing work in this phase blocks an editor from showing to the user, so please rather consider to use the other types, preferable `Lazy`".
- Ошибка конструктора одного вклада логируется ("Unable to create workbench contribution"), остальные создаются дальше. Время создания каждого вклада замеряется (`mark(...)`), при превышении порога выдаётся предупреждение "Creation of workbench contribution '...' took ...ms."

### 4.3 Соседи и далёкие
- Правила для `vs/workbench/contrib` (вики): "there cannot be any dependency from outside `vs/workbench/contrib` into `vs/workbench/contrib`"; "every contribution should expose its internal API from a single file"; "a contribution should never reach into the internals of another contribution"; "think twice before letting a contribution depend on another contribution: is that really needed and does it make sense? Can the dependency be avoided by using the workbench extensibility story maybe?"
- Сервисы workbench, которые нужны только одному вкладу, не должны лежать в общем слое: `vs/workbench/services` "should NOT include services that are only used in `vs/workbench/contrib`".
- Между процессами (рендерер ↔ extension host) работает типизированный RPC. `createProxyIdentifier<T>(id)` и тип `Proxied<T>` превращают каждый метод в асинхронный с DTO-аргументами: `(...args: { [K in keyof A]: Dto<A[K]> }) => Promise<Dto<Awaited<R>>>`; функции в DTO отбрасываются ("functions are dropped during JSON-stringify") (`VSC/src/vs/workbench/services/extensions/common/proxyIdentifier.ts`). В `extHost.protocol.ts` 169 вызовов `createProxyIdentifier`, по паре `MainContext`/`ExtHostContext`.
- Глобальный реестр `Registry` — это `Map<string, any>` со строковыми ключами и непроверяемым `as<T>(id)` (`VSC/src/vs/platform/registry/common/platform.ts`). Дубликат ID запрещён ("There is already an extension with this id"), но тип не проверяется.

### 4.4 Опциональные зависимости
- Явной концепции нет. `invokeFunction` при неизвестном сервисе вызывает `_throwIfStrict(... unknown service ...)` (`instantiationService.ts`). Для веб- и десктоп-сборки вики предупреждает: "code that runs in the web that requires the service will fail to execute if you do not provide a related service for web."

### 4.5 Жизненный цикл, утечки
- `DisposableStore` назван предпочтительным способом: "This is the preferred way to manage multiple disposables. A `DisposableStore` is safer to work with than an `IDisposable[]`". Добавление в уже освобождённое хранилище даёт предупреждение со стеком: "Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!" (`VSC/src/vs/base/common/lifecycle.ts`).
- Трекер утечек выключен по умолчанию (`TRACK_DISPOSABLES = false`) и в тестах честно описан как грубый: "This tracking is very simple an only works for classes that either extend Disposable or use a DisposableStore. This means there are a lot of false positives."
- Правила линтера для жизненного цикла (`VSC/.eslint-plugin-local/`):
  - `code-ensure-no-disposables-leak-in-test`: "Suites should include a call to `ensureNoDisposablesAreLeakedInTestSuite()`";
  - `code-no-potentially-unsafe-disposables`: "Use const for 'DisposableStore' to avoid leaks by accidental reassignment.";
  - `code-must-use-super-dispose`: "dispose() should call super.dispose()";
  - `code-no-accessor-after-await`: "ServicesAccessor '{{name}}' must not be used after 'await'. The accessor is only valid synchronously." В рантайме то же правило: "service accessor is only valid during the invocation of its target method".
- Использование освобождённого `InstantiationService` выбрасывает ошибку: `'InstantiationService has been disposed'`. Циклы сервисов дают `CyclicDependencyError` ("cyclic dependency between services") с найденным циклом.

### 4.6 Правила линтера для слоёв
- `local/code-layering` (уровень `warn`) с картой `{ common: [], node: ['common'], browser: ['common'], 'electron-browser': ['common','browser'], 'electron-utility': ['common','node'], 'electron-main': ['common','node','electron-utility'] }`. Сообщение: "Bad layering. You are not allowed to access {{from}} from here" (`VSC/eslint.config.js`, `VSC/.eslint-plugin-local/code-layering.ts`).
- `local/code-import-patterns` задаёт для каждой области список разрешённых импортов. Например, `src/vs/platform/*/~` может импортировать только `vs/base/~`, `vs/base/parts/*/~`, `vs/platform/*/~`. Для `src/vs/workbench/contrib/*/~` разрешён `vs/workbench/contrib/*/~` целиком. Значит, правило «только через единственный API-файл вклада» линтером **не** проверяется и остаётся соглашением. Исключение — модули с суффиксом `Internal`: `code-no-deep-import-of-internal` с уровнем `error`, "Internal modules can only be imported by direct parents".
- Уровень `warn` не означает мягкости: блог о песочнице пишет, что "The warning will cause our build to fail and prevent accidentally pushing this code to a release." (https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox, Benjamin Pasero, 2022-11-28).

### 4.7 Эволюция
- **Песочница рендерера (2020–2022).** "We have had security issues in the past where attackers were able to execute arbitrary Node.js code." Ввели новую среду: "we added a new target environment electron-sandbox that does not allow any use of Node.js. By moving code over into this environment, we were able to gradually get the code sandbox-ready." IPC перевели на message ports: "Replacing the Node.js socket communication with message ports allowed us to have a sandbox-compatible IPC solution." Extension host вынесли из рендерера через новый Electron utility process. Сам процесс описан так: "Imagine flying an airplane that is being fundamentally rebuild while it is in the air." (блог 2022-11-28).
- **История имени среды по вики:** `electron-sandbox` добавлен 2020-11-25 (коммит вики `1f6491a`). 2025-06-07 (коммит `2a13408`) он переименован обратно в `electron-browser` с прежним смыслом «DOM без Node». Мотив переименования в вики не указан, **UNVERIFIED**.
- **От фаз к ленивым вкладам (2024).** Issue #203445 (jrieken, 2024-01-25): "workbench contributions are rarely self-contained. For instance, we often have commands to the side [...] This means an action can be invoked _before_ its "partner-contribution" is ready." Предложено: "ask the workbench to ensure the contribution is now ready. That would force-instantiate it". Issue #203947 (bpasero, 2024-02-01): "Today we instantiate more than `70` workbench contributions before an editor has a chance to open". Результат: `registerWorkbenchContribution2`, `Lazy`, `getWorkbenchContribution`. Старый `registerWorkbenchContribution` помечен "@deprecated use `registerWorkbenchContribution2` instead". При обращении к вкладу до фазы `Restored` выдаётся предупреждение: "contribution instantiated before LifecyclePhase.Restored!".

### 4.8 Практики по версии проекта
- Лучшие: `Delayed` по умолчанию; одна точка входа и один API-файл на вклад; `DisposableStore`; проверка утечек в тестах; переносимый код в `common`.
- Худшие: зависимость `contrib` на `contrib` без необходимости; блокирующие фазы; работа с `ServicesAccessor` после `await`.

---

## 5. Grafana: app-плагины и UI extensions

### 5.1 Родитель → ребёнок
- Точка расширения передаёт вкладам `context`, и этот объект заморожен: "Note that the `context{}` object always gets frozen before being passed to the links, so it can't be mutated." (`GPT/how-to-guides/ui-extensions/create-an-extension-point.md`).
- Рекомендация по объёму данных: "Only share the minimum amount of data required with external elements. You can always extend later, which is easier than removing." (`GPT/how-to-guides/ui-extensions/degregate-ui.md`).

### 5.2 Ребёнок → родитель
- Модель «push» (`add`): `addLink`, `addComponent`, `addFunction` с `targets: [extensionPointId]`. Владелец точки "receives all the registered content and decides how to display it" (`GPT/how-to-guides/ui-extensions/ui-extensions-concepts.md`).
- Модель «pull» (`expose`): `exposeComponent({ id: 'myorg-incidents-app/create-incident-form/v1' })`, потребитель вызывает `usePluginComponent(id)`. В таблице сравнения: "One-to-many (one extension point, many contributors)" против "One-to-one (one exposed component, one consumer at a time)".

### 5.3 Соседи и далёкие
- Плагины не импортируют друг друга. Общение идёт через ID точки расширения или выставленного компонента с префиксом владельца: "Plugins must prefix this with their plugin id, while core Grafana extensions points have to use a `"grafana/"` prefix." (`GPT/reference/ui-extensions-reference/extensions-api-deprecated.md`).
- Всё объявляется в `plugin.json`: `extensions.addedLinks/addedComponents/addedFunctions/exposedComponents/extensionPoints` и `dependencies.extensions.exposedComponents`. В справочнике это жёсткое правило: "**Links that are not listed here won't work.**", "**Extension points that are not listed in here won't work.**" (`GPT/reference/metadata.md`).
- Рантайм сверяет регистрацию с манифестом. `validators.ts` логирует "Could not register link extension. Reason:" при `ADDED_LINK_META_INFO_MISSING` или `TARGET_NOT_MATCHING_META_INFO`. Точка расширения без метаданных в dev-режиме вообще не показывает вклады: "Don't show extensions if the extension-point misses meta info (plugin.json) in DEV mode" (`GRF/public/app/features/plugins/extensions/validateExtensionPoint.ts`).
- Владелец ограничивает поставщиков: `limitPerPlugin` ("If a plugin registers more than one links, then the rest will be ignored") и белый список "Restrict plugins: You can decide to only allow certain plugins to provide content for your extension point." (degregate-ui.md).

### 5.4 Опциональные зависимости
- Точка расширения всегда должна работать при нуле вкладов: "The UI doesn't display this section if it doesn't make sense without rendered content. You provide a fallback UI or placeholder message" (degregate-ui.md).
- Выставленный компонент может отсутствовать. Потребитель получает `{ component, isLoading }` и обрабатывает пустой результат (`GPT/reference/ui-extensions-reference/ui-extensions.md`).

### 5.5 Жизненный цикл
- App-плагины по умолчанию инициализируются при первом использовании: `preload` — "By default, the plugin initializes on first use, but when preload is set to true the plugin loads when the Grafana web app loads the first time." (metadata.md).
- Все хуки потребителя реактивны и возвращают `isLoading`, потому что вклады догружаются позже (см. эволюцию).

### 5.6 Эволюция
1. **Реактивный реестр вместо предзагрузки (PR #83085, влит 2024-04-24):** "We currently need to preload all app plugin bundles that register extensions (`preload=true`) during startup, which can cause a significant overhead". Цель: "**only load an app plugin when it is necessary**". Итог: "stop blocking the Grafana app init process with preloading plugins -> **app init is ~10 times faster**". В TODO остался намёк на роль статических метаданных: "once we have static information about what extensions it should wait for".
2. **Один общий API разделён по видам (issue #89473, 2024-06-20):** "When we introduced the UI extensions functionality we made the assumption that extension point authors wanted to be able to fetch both Links and Components at the same time, which seems to be incorrect." PR #92343 заменил `ReactivePluginExtensionsRegistry` "with separate registries for each extension type".
3. **Grafana 12 удалила старые API:** `getPluginExtensions`, `usePluginExtensions`, `configureExtensionLink/Component` — "Using any of these APIs in Grafana 12 will result in an error." Замена: `addLink`/`addComponent` и хуки `usePluginLinks`/`usePluginComponents`, "the new reactive APIs introduced in Grafana 11.4" (`GPT/migration-guides/update-from-grafana-versions/v11.6.x-v12.0.x.md`).
4. **Версия в ID:** "Each extension point ID/component ID should include a suffix indicating the major version of the extension. [...] Breaking changes [...] _must_ introduce a new version suffix." и "When introducing a new major version, the application should serve both the old and new versions for a transition period." (`GPT/how-to-guides/ui-extensions/versioning-extensions.md`).
5. **AngularJS-плагины удалены:** "AngularJS is an old frontend framework whose active development stopped many years ago" и "poses a security risk"; "AngularJS also requires unsafe-eval in the CSP" (https://grafana.com/docs/grafana/latest/developers/angular_deprecation/). Страница описывает удаление в 12 как план, факт удаления там не подтверждён.
6. **Frontend sandbox (public preview, Grafana 11.5+):** "a security feature that isolates plugin frontend code from the main Grafana application"; "Prevents plugins from modifying global browser objects and behaviors"; ограничения: "Plugins developed and signed by Grafana Labs are excluded and cannot be sandboxed." (https://grafana.com/docs/grafana/latest/administration/plugin-management/plugin-frontend-sandbox/).
- Почему `plugin.json` стал обязательным, нигде явно не сказано. Вероятная причина — ленивая загрузка, исходя из PR #83085 и `preload`, но формулировки нет: **UNVERIFIED**.

### 5.7 Практики по версии проекта
- Лучшие: заметить пустую точку расширения и показать запасной UI; минимальный `context`; `useMemo` для `context`, чтобы избежать каскада перерисовок ("could result in a new links{} object, that could trigger a new re-render, and so on"); версия в ID; ленивые выставленные компоненты.
- Худшие: необъявленные в `plugin.json` вклады; изменяемый `context`; общий API «всё сразу» (их собственная ошибка, исправленная в 2024).

---

## 6. Obsidian: API плагинов, `Component`, события

### 6.1 Родитель → ребёнок
- Плагин наследует `Plugin` (это `Component`) и получает `this.app`. Глобальный `app` запрещён: "Avoid using the global app object, `app` (or `window.app`). Instead, use the reference provided by your plugin instance, `this.app`. The global app object is intended for debugging purposes and might be removed in the future." (`OBS/Plugins/Releasing/Plugin%20guidelines.md`).

### 6.2 Ребёнок → родитель
- Регистрации через методы владельца, которые сами снимаются при выгрузке: `registerView`, `addCommand`, `registerEvent`, `registerDomEvent`, `registerInterval` (`OBS/Plugins/Guides/Manage%20plugin%20lifecycle.md`).
- На свои представления нельзя держать ссылки: "Managing references to custom view can cause memory leaks or unintended consequences. **Don't** do this: `this.registerView(MY_VIEW_TYPE, () => this.view = new MyCustomView());`". Вместо этого предлагается искать через `workspace.getActiveLeavesOfType()` (Plugin guidelines).

### 6.3 Соседи и далёкие
- Официального API для связи плагинов нет. В `obsidian.d.ts` у класса `App` объявлены `keymap`, `scope`, `workspace`, `vault` и другие, а `plugins` не объявлен (`https://github.com/obsidianmd/obsidian-api/blob/9abd9605ce081383674aae1ed111c456edde0688/obsidian.d.ts`).
- Де-факто так делает Dataview. `getAPI` читает внутреннее поле или глобал: `if (app) return app.plugins.plugins.dataview?.api; else return window.DataviewAPI;` (`https://github.com/blacksmithgu/obsidian-dataview/blob/5ad0994ff384cbb797de382e7edff2388141b73a/src/index.ts`). События свои, но на чужой шине ядра со строковым префиксом: `plugin.app.metadataCache.on("dataview:index-ready", ...)` (`docs/docs/resources/develop-against-dataview.md`).
- Совместное изменение методов ядра делается обёртками. Библиотека `monkey-around` объясняет, зачем она: "It's not hard to do if you're the only one doing it [...] But it's not quite as easy if multiple independently-written bits of code need to patch the same method(s), and might need to uninstall their patches in arbitrary order." (https://github.com/pjeby/monkey-around, коммит 2024-02-05). Официальной позиции Obsidian о monkey-patching не нашёл, **UNVERIFIED**.

### 6.4 Опциональные зависимости
- Механизма в API нет. Плагин проверяет наличие соседа вручную, как Dataview: `isPluginEnabled = (app) => app.plugins.enabledPlugins.has("dataview")`.

### 6.5 Жизненный цикл, утечки (самая сильная часть документации Obsidian)
- Центральный вопрос: "**“Who owns this resource, and how long should it live?”**"
- Иерархия: "When a parent component unloads, all its children are automatically unloaded as well. [...] children are created _after_ their parents, and destroyed _before_ their parents, preventing orphaned resources and memory leaks."
- Ловушка «сиротского» компонента: "A frequent mistake is creating a `Component`, solely to pass it to an API, without ever unloading it. [...] It becomes a memory leak." Решение — передать владельца с подходящим временем жизни: "`View` is a more appropriate choice since its lifespan matches with the `MarkdownRenderer`".
- Правило: "**Any resource created during `onload` (or later) should be cleaned up in `onunload`.**" Исключение: "You don't need to clean up resources that are guaranteed to be removed when your plugin unloads" (Plugin guidelines).
- Подписка до готовности: "As a part of Obsidian's vault initialization process, it will call `create` for every file. [...] Your vault event registration should be inside an `onLayoutReady` callback" (`OBS/Plugins/Guides/Optimize%20plugin%20load%20time.md`).
- `onload` должен быть дешёвым: "It should not include anything computationally expensive or data fetching."

### 6.6 Эволюция
- Задокументированной истории изменений API связи между плагинами я не нашёл. Видны только предупреждение о будущем удалении глобального `app` и руководство по жизненному циклу. **UNVERIFIED**, были ли крупные замены.

### 6.7 Практики по версии проекта
- Лучшие: `register*` вместо ручной отписки; `Component` на каждую логическую единицу; `onLayoutReady` для работы при старте.
- Худшие: глобальный `app`; ссылки на свои view; сиротские `Component`; `detach` листов в `onunload` ("Don't detach leaves in `onunload`").

---

## 7. Расширения Chrome: обмен сообщениями через границы изоляции

### 7.1 Зачем нужны сообщения
- Content script живёт в изолированном мире: "An isolated world is a private execution environment that isn't accessible to the page or other extensions." Привилегированные API ему недоступны: "Content scripts are unable to access other APIs directly [...] they can access them indirectly by exchanging messages with other parts of your extension." (https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
- Отсюда правило: сообщение пересекает границу доверия и должно проверяться. "Assume that messages from a content script might have been crafted by an attacker"; "Assume any data sent to the content script might leak to the web page." (https://developer.chrome.com/docs/extensions/develop/concepts/messaging, обновлено 2025-12-03).

### 7.2 Родитель → ребёнок и ребёнок → родитель
- Разовый запрос: `runtime.sendMessage` / `tabs.sendMessage`. "Both APIs return a Promise which resolves to the response provided by a recipient." Асинхронный ответ: вернуть `true` или, начиная с Chrome 148, промис из обработчика ("From Chrome 148, you can return a promise from a message listener to respond asynchronously").
- Несколько слушателей: "Only the first listener to respond, reject, or throw an error will affect the sender; all other listeners will run, but their results will be ignored."
- Долгий канал: `runtime.connect` / порт. "Ports are designed as a two-way communication mechanism"; закрытие отслеживается через `runtime.Port.onDisconnect`; "a Port can have multiple receivers connected at any given time."
- Сериализация: "In Chrome, the message passing APIs use JSON serialization." и "`undefined` will be serialized as `null`".

### 7.3 Соседи и далёкие (другие расширения и сайты)
- Между расширениями: "This lets you expose a public API for other extensions to use." С веб-страницами только по белому списку `externally_connectable`: "This exposes the messaging API to any page that matches the match patterns you specify."

### 7.4 Жизненный цикл (Manifest V3)
- Service worker эфемерен: "After 30 seconds of inactivity. Receiving an event or calling an extension API resets this timer."; "Any global variables you set will be lost if the service worker shuts down."; "Instead of using global variables, save values to storage." (https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle, обновлено 2023-05-02). Для портов: "Chrome 114: Sending a message with long-lived messaging keeps the service worker alive. Opening a port no longer resets the timers."
- Слушатели регистрируются синхронно на верхнем уровне: "Registering a listener asynchronously (for example inside a promise or callback) is not guaranteed to work in Manifest V3. Instead, move the event listener registration to the top level of your script." (https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers, обновлено 2023-03-09).

### 7.5 Эволюция
- MV2 → MV3: фоновую страницу заменил service worker, "enables extensions to run only when needed, saving resources". Следствия: состояние живёт в хранилище, слушатели объявляются статически, глобальные переменные ненадёжны (страница миграции выше).

### 7.6 Практики по версии проекта
- Лучшие: проверять и санитизировать входящие сообщения; не использовать `eval`/`innerHTML` с данными из сообщений ("WARNING! Might be evaluating a malicious script!"); хранилище как источник истины.
- Худшие: доверять content script; асинхронная регистрация слушателей; состояние в глобалах service worker.

---

## 8. Electron: IPC, `contextBridge`, типизированные каналы

### 8.1 Родитель (main) → ребёнок (renderer)
- `webContents.send(channel, ...)`, на стороне preload — обёртка над `ipcRenderer.on`. Обёртка обязательна: "don't just pass the callback to `ipcRenderer.on` as this will leak `ipcRenderer` via `event.sender`. Use a custom handler that invokes the `callback` only with the desired arguments." (`EL/tutorial/ipc.md`).

### 8.2 Ребёнок → родитель
- Двусторонний вызов `ipcRenderer.invoke` / `ipcMain.handle`: "We recommend using `ipcRenderer.invoke` whenever possible." `sendSync` под запретом: "we recommend **avoiding this API** for performance reasons. Its synchronous nature means that it'll block the renderer process until a reply is received." (ipc.md).
- Отправителя проверять всегда: "You should be validating the `sender` of **all** IPC messages by default." Пример проверяет `frame.origin` по белому списку, а не URL (`EL/tutorial/security.md`, §17).

### 8.3 Соседи (renderer ↔ renderer)
- "There's no direct way to send messages between renderer processes [...] Use the main process as a message broker [...] Pass a MessagePort from the main process to both renderers." (ipc.md).
- Передаётся только то, что выдерживает Structured Clone. DOM- и C++-объекты не передаются (ipc.md, «Object serialization»).

### 8.4 Изоляция и экспонирование API
- "Context isolation has been enabled by default since Electron 12" (`EL/tutorial/context-isolation.md`).
- Не выставлять сырой IPC: "It directly exposes a powerful API without any kind of argument filtering. [...] The correct way to expose IPC-based APIs would instead be to provide one method per IPC message." (context-isolation.md). В security §20: "Exposing raw APIs like `ipcRenderer.on` is dangerous because it gives renderer processes direct access to the entire IPC event system". Bad/Good-пример: `on: ipcRenderer.on` плохо; `onUpdateCounter: (callback) => ipcRenderer.on('update-counter', (_event, value) => callback(value))` хорошо.

### 8.5 Эволюция
- Модуль `remote` (прозрачные прокси объектов main в renderer) "was deprecated in Electron 12, and will be removed in Electron 14" (`EL/breaking-changes.md`). Наследник `@electron/remote` предупреждает: "This module has many subtle pitfalls. There is almost always a better way to accomplish your task than using this module." и "using `@electron/remote` makes the sandbox much less effective" (https://github.com/electron/remote, README). Исходное эссе Jeremy Rose «Electron's remote module considered harmful» на Medium вернуло 403. Его аргументы (синхронный IPC, жизненный цикл удалённых объектов): **UNVERIFIED** по первоисточнику.
- `<webview>.getWebContents()` устарел по той же причине: "This API is implemented using the `remote` module, which has both performance and security implications." (breaking-changes.md).

---

## 9. Дополнительно: Figma, Mattermost, Discourse

### 9.1 Figma: песочница плюс iframe UI
- Модель: "plugin code runs on the **main thread in a sandbox**"; "The sandbox is a minimal JavaScript environment and **does not expose browser APIs**"; UI живёт в iframe, у которого есть "browser APIs, but not the Figma scene"; две половины "can communicate with each other through message passing" (https://developers.figma.com/docs/plugins/how-plugins-run/).
- История решения (Rudi Chen, 2019-08-22, https://www.figma.com/blog/how-we-built-the-figma-plugin-system/). Только iframe отвергли, потому что "Message-passing is fundamentally an asynchronous operation, and there's no way in JavaScript to make a synchronous, blocking call" и "it took 14 seconds just to serialize the document and send it to the plugin". Shim Realms потом заменили: "We decided to implement this alternative after a security vulnerability in the Realms shim [...] was privately disclosed to us" — перешли на "compiling a JavaScript VM written in C to WebAssembly". Вывод автора: "If not, isolating code via iframes may be sufficient, and simple is always good."

### 9.2 Mattermost: серверные плагины как отдельные процессы с RPC
- "Server plugins are subprocesses invoked by the server that communicate with Mattermost using remote procedure calls (RPC)." Жизненный цикл: `OnActivate` / `OnDeactivate` (`https://github.com/mattermost/mattermost-developer-documentation/blob/508909090d8c471540598db21ae03d997713ab4c/site/content/integrate/plugins/components/server/_index.md`).
- Плагины общаются друг с другом по HTTP через сервер: `PluginHTTP` "allows inter-plugin requests to plugin APIs. Deadlines and cancellation attached to request.Context() are propagated to updated destination plugins." Распространение отмены добавлено только в v12.0: "Calls to older servers retain legacy behavior and may not return promptly after cancellation." (`MM/server/public/plugin/api.go`).
- Хуки разделены по смыслу на «Will» и «Has». `MessageWillBePosted` может отклонить или заменить сообщение: "To reject a post, return an non-empty string [...] To modify the post, return the replacement". Оговорка про эхо: "Note that this method will be called for posts created by plugins, including the plugin that created the post." Совет: "If you don't need to modify or reject posts, use MessageHasBeenPosted instead." (`MM/server/public/plugin/hooks.go`).
- Экземпляры одного плагина в HA-кластере общаются через `PublishPluginClusterEvent` → `OnPluginClusterEvent` ("allow communication between multiple instances of the same plugin").

### 9.3 Discourse: от переопределения виджетов к именованным трансформерам и outlets
- **Конец виджетов:** "we're deprecating the use of widgets in Discourse and will soon deactivate it entirely". Под удаление попадают `createWidget`, `decorateWidget`, `changeWidgetSetting`, `reopenWidget`, `attachWidgetAction`. Замена: Glimmer components и plugin outlets. Инструментарий миграции: "you'll see a warning in the console identifying which plugin or component needs to be upgraded" (https://meta.discourse.org/t/375332, 2025-07-23). То же со списком тем: "Previously, this used a 'raw handlebars' (.hbr) approach, and could be customized via template overrides [...] The new implementation [...] has been built from the ground-up to to be customizable in sustainable ways." Режим `auto` "will detect the compatibility of your current plugins and themes" (https://meta.discourse.org/t/343404).
- **Трансформеры:** value transformers "take an output from Discourse core, and optionally modify it", behavior transformers "can replace a particular piece of logic [...] and optionally call the original implementation" через `next()`. Порядок: "they will be run in order of registration" (https://meta.discourse.org/t/349954, обновлено 2026-08-31).
- **Двухфазный реестр имён** (`DSC/frontend/discourse/app/lib/transformer.js`). Сначала объявляются имена, затем реестр замораживается и открывается для регистраций. Регистрация до заморозки — ошибка: "Move your code to an initializer or a pre-initializer that runs after "freeze-valid-transformers"". Добавление имени после заморозки — тоже ошибка. Неизвестное имя даёт предупреждение и игнорируется: "transformer "${transformerName}" is unknown and will be ignored. Is the name correct?"
- **`modifyClass` — крайняя мера:** "modifyClass should be a last resort, when your customization cannot be made via Discourse's more stable customization APIs (e.g. plugin-api methods, plugin outlets, transformers). Core's code can change at any time." (https://meta.discourse.org/t/262064).
- **Версия API плагинов больше не проверяется:** `withPluginApi("x.y", cb)` теперь игнорирует версию. Комментарий в коде: "Old path. First argument is the version string. Silently ignore." (`DSC/frontend/discourse/app/lib/plugin-api.gjs`). Когда и почему от неё отказались, **UNVERIFIED**.

---

## 10. Таблица лучших практик

| # | Практика | Где сказано и чем подтверждено |
|---|---|---|
| P1 | Разные контракты на разные фазы: регистрация отдельно от работы, реестр замораживается после регистрации | Kibana anatomy и CONVENTIONS 7.10 (`strings$.complete()`); Discourse `freeze-valid-transformers`; Kibana #9675 "will not change within the context of a single lifecycle event" |
| P2 | Фаза сборки синхронна и не ждёт внешнего мира; готовность — это статус, а не блокировка старта | Kibana RFC 0007 "no single plugin should affect the availability of all other plugins"; таймаут 10 с в `plugins_system.ts` |
| P3 | Значение «текущее» по умолчанию; поток изменений только там, где потребителю важно само изменение | Kibana RFC 0007 §3 (`adminClient$` убран, конфигурация оставлена observable) |
| P4 | Состояние никогда не передаётся через статический импорт; общий реестр принадлежит владельцу и отдаётся через контракт | Kibana MIGRATION 7.9 (`visTypes`); Kibana #9675 "importing a module should not have side effects" |
| P5 | Токен или ID контракта типизирован и лежит в отдельном пакете, чтобы провайдера можно было заменить | JupyterLab "third package"; Theia «символ + интерфейс»; Grafana `@grafana/plugin-types` |
| P6 | Все межмодульные ребра объявлены, включая «мягкие» (URL, ID приложений, команды); запуск в режиме отчёта, потом жёсткий отказ в dev и CI | Kibana #66682 → PR #276240 (2026); Grafana dev-mode валидация `plugin.json` |
| P7 | Объявления и рантайм сверяются; расхождение — ошибка в dev | Grafana `validators.ts`; Discourse «unknown and will be ignored» |
| P8 | Владелец точки расширения управляет вкладами: лимит, белый список, запасной UI при нуле вкладов | Grafana `limitPerPlugin`, "Restrict plugins", degregate-ui |
| P9 | Контекст, переданный в чужой код, заморожен и минимален | Grafana "always gets frozen"; "Only share the minimum amount of data required" |
| P10 | Отдельный API на каждый вид вклада (ссылки, компоненты, функции), без «всё сразу» | Grafana #89473, PR #92343 |
| P11 | Регистрация через методы владельца, которые сами снимаются вместе с ним | Obsidian `register*`; VS Code `DisposableStore`; Theia `@preDestroy` в контейнерах соединений |
| P12 | Задать вопрос «кто владеет ресурсом и сколько он живёт», передавать API владельца с тем же временем жизни | Obsidian «Orphaned Components», `MarkdownRenderer.render(..., this)` |
| P13 | Демонтаж в обратном порядке зависимостей, с таймаутом и продолжением при ошибке | Kibana `stopPlugins` (15 с, "move on to the next"); Lumino `deactivatePlugin`; Obsidian иерархия |
| P14 | Ленивое создание по умолчанию, блокирующие фазы — исключение с обоснованием | VS Code `Delayed`, `Lazy`, #203947; Lumino `'defer'`; Grafana PR #83085 |
| P15 | Замер времени каждого модуля при старте с порогом предупреждения | VS Code `mark(...)` + "took ...ms"; Theia `TIMER_WARNING_THRESHOLD = 100` |
| P16 | Ошибка одного вклада изолирована, запуск остальных продолжается | VS Code "Unable to create workbench contribution"; Theia "Could not initialize contribution"; Lumino signals "caught and logged" |
| P17 | Слои и среды проверяются линтером, нарушение роняет сборку | VS Code `code-layering`, `code-import-patterns`, блог 2022 "will cause our build to fail"; Kibana `no_group_crossing_imports` |
| P18 | Проверка утечек в тестах | VS Code `ensureNoDisposablesAreLeakedInTestSuite` (правило линтера) |
| P19 | Временный аварийный выход (обход цикла) объявляется в манифесте и помечается как долг | Kibana `runtimePluginDependencies`, контракт `onSetup/onStart` |
| P20 | Через границу изоляции идут только сообщения: по одному методу на сообщение, DTO-типы, проверка отправителя | Electron context-isolation, security §17 и §20; Chrome "crafted by an attacker"; VS Code `Proxied<T>`/`Dto<T>` |
| P21 | Слушатели объявляются статически и синхронно, чтобы платформа знала их без запуска | Chrome MV3 "move the event listener registration to the top level" |
| P22 | Хук, который может отменить или изменить действие ("Will"), отделён от уведомления ("Has") | Mattermost `MessageWillBePosted` / `MessageHasBeenPosted`; Discourse value и behavior transformers |
| P23 | Динамические экземпляры видны соседям через трекер-сервис, а не через сохранённые ссылки | JupyterLab `WidgetTracker`; Obsidian `getActiveLeavesOfType` вместо `this.view` |
| P24 | Переход крупной системы — постепенный, с режимом `auto`, предупреждениями в консоли с именем виновника и датой выключения | Discourse 375332 и 343404; Kibana RFC 0007 (сначала устаревание и таймаут, потом удаление); VS Code `electron-sandbox` |

## 11. Таблица худших практик

| # | Антипаттерн | Где сказано и чем подтверждено |
|---|---|---|
| W1 | Состояние в глобальном синглтоне модуля, общение импортом и мутацией | Kibana legacy `ui/public`, `uiExports` ("unconventional and fragile") |
| W2 | God object, который передаётся вглубь и изменяем всегда | Kibana legacy hapi `server`/`request` "mutable at any time" |
| W3 | Асинхронная блокирующая фаза старта плагина | Kibana RFC 0007 |
| W4 | Всё API в виде observables «на всякий случай» | Kibana RFC 0007 §3 |
| W5 | Неявные контракты: URL, DOM-атрибуты, строковые ID чужих приложений | Kibana #9675 (HTML attribute), #66682 (URL) |
| W6 | «Перепривязать что угодно»: несколько сторон молча конкурируют за один биндинг | Theia 1.76.0 `ScmCommitWidget` |
| W7 | Сборщик вкладов в долгоживущей области захватывает краткоживущую область | Theia `bindContributionProvider` JSDoc, #10877 |
| W8 | Статические вклады с временем жизни приложения для того, что живёт с виджетом | Theia #10877 `LabelProviderContribution` |
| W9 | Сбой опционального провайдера превращается в «отсутствует» с одной строкой в консоли | Lumino `resolveOptionalService` (`console.error(reason); return null;`) |
| W10 | Строковый глобальный реестр с непроверяемым приведением типа | VS Code `Registry.as<T>(id)` (`Map<string, any>`) |
| W11 | Доступ к соседу через внутреннее поле или глобал | Dataview `app.plugins.plugins.dataview?.api`, `window.DataviewAPI`; Obsidian "global app object [...] might be removed" |
| W12 | Свои события на чужой шине со строковым префиксом | Dataview `metadataCache.on("dataview:index-ready")` |
| W13 | Monkey-patching и `modifyClass` вместо объявленных точек | Discourse "last resort"; виджеты `reopenWidget`/`decorateWidget` удалены; `monkey-around` существует, потому что патчи конфликтуют |
| W14 | Ссылки на свои view или экземпляры в поле плагина | Obsidian "can cause memory leaks or unintended consequences" |
| W15 | Сиротская область или компонент, созданный только чтобы передать в API | Obsidian «Orphaned Components» |
| W16 | Ссылки на контракты из `start`, сохранённые в поля, вместо ленивого доступа | Kibana CONVENTIONS "Anti pattern" |
| W17 | Сырой канал через границу изоляции (`ipcRenderer.send`/`on`), `remote`-прокси | Electron context-isolation, security §20, `remote` удалён в 14 |
| W18 | Синхронный IPC | Electron `sendSync` "**avoiding this API**" |
| W19 | Подписка до готовности источника | Obsidian `vault.on('create')` при инициализации; VS Code #203445 (действие раньше «партнёрского» вклада) |
| W20 | Один общий API выборки для разных видов вкладов | Grafana #89473 "which seems to be incorrect" |
| W21 | Использование accessor/контекста после `await` или после закрытия области | VS Code `code-no-accessor-after-await`; "InstantiationService has been disposed" |
| W22 | Хук-фильтр, который видит собственные действия плагина и не защищён от эха | Mattermost `MessageWillBePosted` "including the plugin that created the post" |

## 12. Уроки эволюции: что бросили и почему

1. **Общение через импорт и глобальное состояние → контракты в рантайме.** По плану Kibana миграция шла через весь цикл 7.x ("migrate the entire repo over to the new platform throughout 7.x"), а legacy-систему плагинов собирались удалить "no later than 8.0". Причины: "fragile" `uiExports`, неработающие синглтоны в SPA, копии модулей в независимых бандлах. JupyterLab 4 заменил глобальные `sessionContextDialogs` и `defaultContentFactory` токенами. Obsidian предупреждает об удалении глобального `app`.
2. **Блокирующий асинхронный старт → синхронная регистрация плюс статус.** Kibana RFC 0007: один зависший плагин клал весь сервер. VS Code в 2024 году пересмотрел больше 70 вкладов, которые создавались до показа редактора (#203947), и добавил ленивые вклады. Grafana сделала реестр расширений реактивным, чтобы не предзагружать app-плагины; по PR #83085 инициализация приложения ускорилась примерно в 10 раз. Chrome MV3 требует синхронно регистрировать слушателей на верхнем уровне.
3. **Всё observable → значение по умолчанию, поток по необходимости.** Kibana развернула решение 2016 года через три года.
4. **Широкая «универсальная» точка расширения → узкие типизированные.** Grafana разделила «ссылки и компоненты сразу» на отдельные реестры. Discourse заменил переопределение виджетов и шаблонов именованными трансформерами с реестром имён, outlets и Glimmer-компонентами.
5. **Неявные ребра → объявленные.** URL и ID приложений в Kibana: шесть лет от issue (2020) до режима отчёта (2026); жёсткий отказ в dev и CI пока только запланирован. Grafana требует `plugin.json` и сверяет его в dev.
6. **Статические вклады с жизнью приложения → реестры с временем жизни вклада.** Theia #10877. Там же утечка из-за захвата контейнера: описана в 2022 году, исправлена PR #17021 только в феврале 2026 года.
7. **Прозрачные удалённые объекты → явные сообщения.** Electron удалил `remote`. VS Code перевёл рендерер в песочницу, на message ports и utility process. Figma отказалась от shim Realms после уязвимости. Theia отказалась от `vscode-ws-jsonrpc` ради своего бинарного протокола.
8. **Аварийный выход вместо фанатизма.** Kibana не стала бороться с циклами бесконечным дроблением плагинов. Она добавила `onSetup/onStart` с объявлением в манифесте и подписью «это долг». Строгость не ослаблена, исключение видно.
9. **Глобальные потоки и порядок → параллельность с таймаутом.** Theia 1.72 перевела `onStop` на параллельный вызов с таймаутом и прямо предупредила, что опора на прежний синхронный порядок между вкладами ломается.
10. **Версии API: проверка бросается или переезжает в ID.** Discourse молча игнорирует строку версии в `withPluginApi`. Grafana кладёт мажорную версию прямо в ID точки (`/v1`) и обслуживает две версии в переходный период.

---

## 13. Моя оценка: что взять в Get Modular (GM) и чего избегать

Оговорка: модель GM я знаю по заданию и по `raw/synthesis-b.md` (слоты `required`/`optional`/`many`, строки привязки в корне,
дерево resource scopes, один писатель и фасет `read`/`watch`, `many()` только для точек расширения, события отложены).
Исходники GM для этого отчёта я не перечитывал. Где рекомендация зависит от деталей реализации (async-фабрики, поле
`revision`), это помечено. Оценки: **надёжность** — насколько подход проверен практикой; **уверенность** — насколько я
уверен, что он подходит именно GM.

### 13.1 Родитель → ребёнок

1. **Оставить «текущее значение» основным контрактом, `watch` выдавать только там, где потребитель реагирует на само изменение.** Это прямой урок Kibana RFC 0007 §3. Он подтверждает решение владельца (`read` плюс `watch` в своей области) и предостерегает от тяги делать `watch` у каждого фасета. Тест для ревью: «что потребитель сделает с изменением, кроме как перечитать значение при следующем вызове?» Надёжность 9, уверенность 8.
2. **Фасет, переданный в чужой модуль или плагин, заморожен и минимален.** Как `context` у Grafana. Для GM: в dev-сборке глубокая заморозка снимка, тип `Readonly`. Это дёшево и ловит мутацию чужого значения (`PRACTICES A-1`). Надёжность 8, уверенность 8.
3. **Сборка не ждёт внешнего мира.** Если фабрики GM асинхронны (в примере синтеза B `createThemePicker` — `async`; я не проверял, как это закреплено в GM), Host должен задавать дедлайн на фабрику и показывать время каждой. Сетевую готовность модуль выражает своим состоянием или статусом, а не удержанием сборки. Прецеденты: Kibana 10 с плюс устаревание async, VS Code и Theia с замером. Надёжность 8, уверенность 7.
4. **API регистрации живёт только в фазе сборки.** У GM это уже следует из статической композиции: строки привязки фиксируются в корне. Но если появятся программные реестры (см. 13.4 п. 13), они должны замораживаться после сборки, как `strings$.complete()` у Kibana и `freeze-valid-transformers` у Discourse. Поздняя регистрация — ошибка с понятным текстом «перенесите в фазу X». Надёжность 8, уверенность 8.

### 13.2 Ребёнок → родитель

5. **Наверх идёт намерение через командный порт владельца, по одному методу на намерение.** Правило Electron "one method per IPC message" переносится и на процесс: никакого `send(type, payload)` (совпадает с `PRACTICES C-9`). Надёжность 9, уверенность 9.
6. **Различать хуки-фильтры и уведомления.** Если `many()` используется для цепочек, которые меняют или отклоняют значение, вид должен быть объявлен на точке расширения. Прецеденты: Mattermost Will/Has, Discourse value/behavior, Tapable из каталога. Отдельно описать эхо: фильтр видит и действия самого модуля. Надёжность 8, уверенность 7.
7. **Наличие вкладов не гарантировано.** Точка расширения GM должна работать при нуле вкладов (у `many({ min: 0 })` это уже так). Документировать это как обязанность владельца точки, как в Grafana degregate-ui. Надёжность 9, уверенность 8.

### 13.3 Соседи и далёкие модули

8. **Объявлять все межмодульные ребра, включая строковые ID (маршруты, команды, ключи хранилища), которые один модуль передаёт другому.** Kibana шесть лет жила с неявными ребрами через URL и только в 2026 году включила режим отчёта с планом жёсткого отказа. Для GM: такие ID — константы контрактного пакета владельца, а использование чужого ID без ребра в графе — ошибка проверки в CI. Вводить сначала в режиме отчёта, если потребителей уже много. Надёжность 9, уверенность 8.
9. **Контракт и его ID — в отдельном маленьком пакете, а не в пакете реализации.** JupyterLab "third package" подтверждает `PRACTICES D1`. Дополнительный урок JupyterLab про дубли пакетов: если плагины станут отдельными бандлами, контрактный пакет должен быть синглтоном, иначе токены перестанут совпадать (уже видно в `PRACTICES D-7`). Надёжность 9, уверенность 9.
10. **Циклы — жёсткая ошибка.** Аварийный выход вводить только при реальной потребности, и только в форме Kibana: объявленное в строке привязки «позднее» ребро с обязательной пометкой долга и без гарантий порядка. Надёжность 8, уверенность 8.
11. **Никакого «перепривязать что угодно».** Замена реализации допускается только явной строкой в корне и только для слота, который владелец объявил заменяемым. Две строки, претендующие на один `required`-слот, — ошибка сборки, а не «последний победил» (Theia 1.76.0). Насколько я понимаю, явные строки GM уже близки к этому. Стоит проверить и закрепить тестом, что дубли ловятся. Надёжность 8, уверенность 8.
12. **`optional` должен отличать «не подключён» от «подключён, но упал».** Lumino сводит оба случая к `null` и `console.error`, и это реальный источник тихой деградации. Для GM: отсутствие — нормальный исход; сбой провайдера — исход сборки с причиной (по умолчанию падение или явная политика «деградировать с отчётом»). Надёжность 8, уверенность 8.
13. **Один `many`-слот на один вид вклада.** Grafana признала ошибкой общий API для ссылок и компонентов. Надёжность 8, уверенность 8.
14. **Глобальный строковый реестр с `as<T>` (VS Code `Registry`) не заводить даже «для удобства».** Надёжность 9, уверенность 9.

### 13.4 Плагины

15. **Манифест плагина — статическое объявление его слотов и вкладов; Host сверяет объявление с тем, что плагин реально предоставил.** Расхождение — ошибка в dev и CI (Grafana `validators.ts`, Discourse «unknown and will be ignored»). Для GM это естественно: если строки вкладов генерируются из манифеста (F-1 в синтезе B), такая сверка почти бесплатна. Надёжность 8, уверенность 7.
16. **Владелец точки расширения может ограничить поставщиков (белый список, лимит).** Это политика продукта, а не механизм GM. В GM достаточно, чтобы владелец видел, кто дал вклад (ID поставщика в элементе `many`). Надёжность 8, уверенность 7.
17. **Плагину за границей изоляции давать типизированный асинхронный прокси с DTO-типами, а не канал.** Модель — `Proxied<T>` и `Dto<T>` VS Code: функции и классы через границу не проходят, каждый метод возвращает `Promise`. Плюс проверка отправителя (Electron §17). Пока плагины в процессе, этого не нужно; если они выйдут в другой процесс или iframe, контракт GM должен уметь порождать такой прокси. Надёжность 9, уверенность 7.
18. **Версия в ID точки расширения нужна только для внешних плагинов.** Правило владельца «ломаем на месте, без версионного зоопарка» для внутренних контрактов остаётся. Когда появятся сторонние плагины, разумно перейти на модель Grafana: мажорная версия в ID и переходный период из двух версий. Это осознанное исключение, а не зоопарк. Не знаю, как поле `revision` в GM соотносится с этим, проверить. Надёжность 7, уверенность 6.
19. **Ленивая активация.** VS Code, Lumino и Grafana пришли к ней ради скорости старта. Для GM «дерево готовится один раз» совместимо с ленивым созданием экземпляров: ребро объявлено статически, экземпляр создаётся при первом обращении. Но потребитель точки расширения тогда видит состояние «загружается» (`isLoading` у Grafana). Сейчас не делать; держать в уме при проектировании плагинного Host. Надёжность 7, уверенность 6.

### 13.5 Жизненный цикл и память

20. **Регистрация только через область-владельца, как `register*` в Obsidian; запись в закрытую область — громкая ошибка.** VS Code в этом случае только предупреждает ("will be leaked!"); для GM лучше бросать в dev. Надёжность 9, уверенность 9.
21. **Агрегатор `many()` и любые кэши в долгоживущей области не должны держать ссылки на краткоживущие области.** Утечка Theia через захват контейнера — точный аналог риска в дереве scopes GM. Правило: вклад из дочерней области подключается к агрегатору владельца как ресурс этой дочерней области и снимается при её закрытии; кэш списка вкладов нельзя держать дольше, чем живёт самый короткий вклад. Надёжность 9, уверенность 8.
22. **Для вкладов с жизнью короче приложения нужен регистрационный порт владельца с `Disposable`, а не статический `many()`.** Это вывод Theia #10877 («реестры вместо contribution providers») и одновременно подтверждение правила владельца «`many()` только для точек расширения»: `many()` годится для статического набора, динамический набор — это реестр, которым владеет модуль, а запись в нём живёт в области вкладчика. Надёжность 8, уверенность 7.
23. **Демонтаж: зависимые раньше зависимостей, таймаут на каждого, ошибка одного не останавливает остальных, итог отчётом.** Kibana `stopPlugins`, Lumino, Obsidian. Если GM уже освобождает ресурсы в обратном `dependencyOrder` (так сказано в синтезе B), остаётся добавить таймаут и сбор ошибок. Надёжность 9, уверенность 8.
24. **Тестовый помощник «нет утёкших подписок и ресурсов после закрытия области»** по образцу `ensureNoDisposablesAreLeakedInTestSuite`. Дешёвый и очень полезный. Надёжность 9, уверенность 9.
25. **Хэндлы и фасеты, выданные модулю, перестают работать после закрытия его области; использование бросает понятную ошибку** (VS Code: "InstantiationService has been disposed", accessor после `await`). Надёжность 8, уверенность 8.
26. **Замер времени создания каждого модуля с порогом предупреждения** (VS Code, Theia 100 мс). Надёжность 8, уверенность 8.

### 13.6 Чего точно избегать
- Monkey-patching и «переопределить класс ядра» как способ расширения (Discourse `modifyClass` "last resort", удалённые виджеты).
- Глобальный доступ к Host или соседям (`window.app`, `app.plugins.plugins.x`), даже как «временный» вход.
- Чужие события на чужой шине по строковому префиксу (Dataview на `metadataCache`).
- Асинхронные блокирующие фазы и «ожидание готовности соседа» вместо статуса.
- Сырой канал через границу изоляции.

---

## 14. Что не удалось проверить (UNVERIFIED)
- Причины перехода Theia от собственного API плагинов: на сайте сказано только "currently under discussion".
- Аргументы эссе «Electron's remote module considered harmful» (Medium вернул 403). Подтверждены лишь факт устаревания в 12, удаление в 14 и предупреждения `@electron/remote`.
- Явная формулировка Grafana, зачем объявления в `plugin.json` обязательны. Связь с ленивой загрузкой — мой вывод из PR #83085.
- Мотив переименования `electron-sandbox` → `electron-browser` в VS Code (2025-06-07). Подтверждён только сам факт в истории вики.
- Есть ли у Theia отдельная концепция опционального расширения помимо Inversify `@optional()`.
- Официальная позиция Obsidian о monkey-patching и конфликтах плагинов.
- Когда и почему Discourse перестал проверять версию в `withPluginApi`.
- Фактическое удаление AngularJS в Grafana 12: страница документации называет это планом.

## 15. Источники (основные)
- Kibana: https://github.com/elastic/kibana/issues/9675 ; `KIB/docs/extend/key-concepts/platform-architecture/anatomy-of-a-plugin.md` ; `KIB/docs/extend/key-concepts/platform-architecture/plugins-packages-and-the-platform.md` ; `KIB/legacy_rfcs/text/0001_lifecycle_setup.md` ; `KIB/legacy_rfcs/text/0007_lifecycle_unblocked.md` ; https://github.com/elastic/kibana/blob/7.9/src/core/MIGRATION.md ; https://github.com/elastic/kibana/blob/7.10/src/core/CONVENTIONS.md ; `KIB/src/core/packages/plugins/server-internal/src/plugins_system.ts` ; `KIB/src/core/packages/plugins/contracts-server/src/contracts.ts` ; `KIB/src/core/packages/plugins/server/src/types.ts` ; `KIB/packages/kbn-eslint-plugin-imports/src/rules/no_group_crossing_imports.ts` ; https://github.com/elastic/kibana/pull/167113 ; https://github.com/elastic/kibana/issues/166688 ; https://github.com/elastic/kibana/issues/66682 ; https://github.com/elastic/kibana/pull/276240
- JupyterLab и Lumino: `JL/docs/source/extension/extension_dev.md` ; `JL/docs/source/extension/extension_points.md` ; `JL/docs/source/extension/extension_migration.md` ; `LUM/packages/coreutils/src/plugins.ts` ; `LUM/packages/coreutils/src/token.ts` ; `LUM/packages/signaling/src/index.ts` ; `LUM/docs/source/plugin-registry-server.md` ; `LUM/CHANGELOG.md` ; https://github.com/jupyterlab/lumino/pull/703 ; https://github.com/jupyterlab/lumino/pull/588
- Theia: `THW/src/docs/{architecture,extensions,services_and_contributions,json_rpc,contribution_filter,frontend_application_contribution}.md` ; `TH/packages/core/src/common/contribution-provider.ts` ; `TH/packages/core/src/browser/frontend-application.ts` ; `TH/CHANGELOG.md` ; `TH/doc/changelogs/CHANGELOG-2022.md` ; https://github.com/eclipse-theia/theia/issues/10877 ; https://github.com/eclipse-theia/theia/pull/17021
- VS Code: https://github.com/microsoft/vscode/wiki/Source-Code-Organization (git-история вики `1f6491a`, `e12f7b4`, `2a13408`) ; `VSC/eslint.config.js` ; `VSC/.eslint-plugin-local/{code-layering,code-no-deep-import-of-internal,code-ensure-no-disposables-leak-in-test,code-no-accessor-after-await,code-no-potentially-unsafe-disposables,code-must-use-super-dispose}.ts` ; `VSC/src/vs/platform/instantiation/common/{instantiation,extensions,instantiationService}.ts` ; `VSC/src/vs/workbench/common/contributions.ts` ; `VSC/src/vs/base/common/lifecycle.ts` ; `VSC/src/vs/platform/registry/common/platform.ts` ; `VSC/src/vs/workbench/services/extensions/common/proxyIdentifier.ts` ; `VSC/src/vs/workbench/api/common/extHost.protocol.ts` ; https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox ; https://github.com/microsoft/vscode/issues/203445 ; https://github.com/microsoft/vscode/issues/203947
- Grafana: `GPT/how-to-guides/ui-extensions/{ui-extensions-concepts,create-an-extension-point,degregate-ui,versioning-extensions,register-an-extension,expose-a-component}.md` ; `GPT/reference/ui-extensions-reference/{ui-extensions,extensions-api-deprecated}.md` ; `GPT/reference/metadata.md` ; `GPT/migration-guides/update-from-grafana-versions/v11.6.x-v12.0.x.md` ; `GRF/public/app/features/plugins/extensions/{validators,validateExtensionPoint,errors}.ts` ; https://github.com/grafana/grafana/pull/83085 ; https://github.com/grafana/grafana/issues/89473 ; https://github.com/grafana/grafana/pull/92343 ; https://grafana.com/docs/grafana/latest/developers/angular_deprecation/ ; https://grafana.com/docs/grafana/latest/administration/plugin-management/plugin-frontend-sandbox/
- Obsidian: `OBS/Plugins/Events.md` ; `OBS/Plugins/Guides/Manage%20plugin%20lifecycle.md` ; `OBS/Plugins/Releasing/Plugin%20guidelines.md` ; `OBS/Plugins/Guides/Optimize%20plugin%20load%20time.md` ; https://github.com/obsidianmd/obsidian-api/blob/9abd9605ce081383674aae1ed111c456edde0688/obsidian.d.ts ; https://github.com/blacksmithgu/obsidian-dataview/blob/5ad0994ff384cbb797de382e7edff2388141b73a/src/index.ts ; https://github.com/blacksmithgu/obsidian-dataview/blob/5ad0994ff384cbb797de382e7edff2388141b73a/docs/docs/resources/develop-against-dataview.md ; https://github.com/pjeby/monkey-around
- Chrome: https://developer.chrome.com/docs/extensions/develop/concepts/messaging ; https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts ; https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle ; https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers
- Electron: `EL/tutorial/ipc.md` ; `EL/tutorial/context-isolation.md` ; `EL/tutorial/security.md` ; `EL/breaking-changes.md` ; https://github.com/electron/remote
- Figma: https://developers.figma.com/docs/plugins/how-plugins-run/ ; https://www.figma.com/blog/how-we-built-the-figma-plugin-system/
- Mattermost: https://github.com/mattermost/mattermost-developer-documentation/blob/508909090d8c471540598db21ae03d997713ab4c/site/content/integrate/plugins/components/server/_index.md ; `MM/server/public/plugin/api.go` ; `MM/server/public/plugin/hooks.go`
- Discourse: https://meta.discourse.org/t/375332 ; https://meta.discourse.org/t/349954 ; https://meta.discourse.org/t/343404 ; https://meta.discourse.org/t/262064 ; `DSC/frontend/discourse/app/lib/transformer.js` ; `DSC/frontend/discourse/app/lib/plugin-api.gjs`
