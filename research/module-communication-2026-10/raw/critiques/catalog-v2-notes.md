# Каталог v2: заметки синтезатора (2026-10-16)

Автор: независимый критик-синтезатор. Репозитории не менял. Единственные записи: `PRACTICES.v2.md` и этот файл.

Пометки: **VERIFIED** (прочитал сам в файле, коде или первоисточнике), **ASSUMPTION** (мой вывод).
Оценки: надёжность / уверенность, шкала 1–10. Severity P0–P3 только там, где это находка.

## 0. Что прочитано и как проверено

- Все материалы из задания: `PRACTICES.md`, раздел «Module communication vision» в `AGENTS.md`, три новых отчёта
  (`projects-plugin-platforms.md`, `projects-app-backends.md`, `projects-games-native.md`), прежние отчёты и синтезы A и B.
- Get Modular: `git fetch origin`, затем только `git show origin/main:<path>`, `main` = `bcd4c9a` (2026-10-16). Читал
  `docs/architecture/common-assembly.md`, `docs/decisions/README.md`, ADR-0014, ADR-0030, ADR-0036,
  `docs/guides/module-authoring.md`, `docs/open-decisions/OD-007-...md`, `packages/resources/README.md`,
  `packages/conformance/README.md`, `packages/lifecycle-kernel/README.md`, код `packages/assembly/src/features/construction/{run,snapshot,group,derive-profile,prepare}.ts`
  и `packages/core/src/features/composition-semantics/{selected-bindings,binding-record}.ts`.
- Выборочная сверка первоисточников (только чтение, `gh api`, `curl`), 2026-10-16. Подтверждены дословно: Lumino
  `resolveOptionalService`, HA `_MAX_QUEUED_EVENT_DISPATCHES: Final = 10_000`, JSDoc Theia про утечку, заголовки Kibana
  RFC 0007, Fabric `CONTRIBUTING.md`, Magento 4.4/14.1/14.3, GitLab `domain_layer.md`, GNOME MR !4382, гайд Forge EB7,
  темы Discourse 341014 и 343404, статусы PR (Theia #17021, Grafana #83085 и #92343, Lumino #703 и #588, HA #173519 и
  #182763, Kibana #167113, Fabric #5619 открыт).

## 1. Ошибки в отчётах, найденные при сверке

| # | Sev | Увер. | Тип | Находка |
| --- | --- | --- | --- | --- |
| E1 | P2 | 9 | VERIFIED | `raw/projects-plugin-platforms.md:89` пишет: "PR #276240 (влит 2026-07-14)". На деле PR закрыт без слияния (`gh pr view 276240 --repo elastic/kibana`: `CLOSED`, `mergedAt: null`). Слит другой PR, #278396 (2026-08-03), и он только "dev-mode-only `window.__kbnNavDependencies__()` bridge", "No production behavior changes". Принуждение (#278399) открыто. Вывод отчёта в §12 п. 5 («режим отчёта в 2026») тоже неверен; урок «шесть лет и не доделано» от этого только сильнее. В v2 исправлено (C3, раздел G, раздел I). |
| E2 | P3 | 8 | VERIFIED | `raw/projects-app-backends.md:991-994` («`optional` по смыслу равен HA `after_dependencies`») переносит неточно. HA подхватывает зависимость сам, если она установлена. В GM у `optional` всегда явная строка `[]` или провайдер (`common-assembly.md`, раздел API: "An `optional` slot always needs a row: `[]` or one provider"). Общее только одно: при отсутствии провайдера потребитель стартует. |
| E3 | P3 | 8 | VERIFIED | Фраза «call down, signal up» не является официальной формулировкой Godot. Сам отчёт это отмечает (`projects-games-native.md:22-24`). В v2 цитируется только официальный текст «respond» и «start behavior». |
| E4 | — | 8 | VERIFIED | Подозревал расхождение в ссылках на Discourse (341014 и 343404). Проверил: режим `auto` есть в обеих темах. Ошибки нет. |

## 2. Что изменилось от v1 к v2 и почему

1. **Язык и место.** Английский, целевое место `get-modular/docs/guides/module-communication.md`. Каталог не дублирует
   стандарт: в колонке «In GM» стоят ссылки на CMS. Причина: правило AGENTS.md «Do not duplicate the standard».
2. **Структура по заданию.** Разделы A–F: старый раздел E «Сквозное» разделён на E (жизненный цикл, ресурсы, память) и F
   (ошибки, порядок, наблюдаемость). Добавлены разделы «How to use», «What Get Modular gives today», быстрая таблица
   решений, блок «Future events» (только форма), G (уроки эволюции, 25 строк), H (10 расхождений и выбор GM), I
   (проверка и происхождение), J (ссылки).
3. **Колонка «In GM».** У каждой строки статус: `GM`, `CMS`, `Planned`, `Proposed`, `Host`, `Gap`. Это главный способ не
   дать агенту принять предложение за существующий механизм.
4. **Ссылки.** У v1 ссылок не было. В v2 у каждого источника есть ссылка: из отчётов, с закреплённым коммитом или тегом,
   где источник это позволяет. Ссылки оформлены в стиле reference, чтобы таблицы оставались читаемыми.
5. **Слияния v1 → v2:** A8 → F4; A-4 (частичная перепривязка Spring Cloud) → A5 и таблица решений; A-5 → A7 и A8;
   A-7 и E-7 → A-5; B6 → B4; B7 → B1 и B3; B8 → B7; C3 → C4; C5 и E9 → блок Future events; C6 → C2 и E1; C9 → C11;
   C-3 → C-9; C-8 → C-11; D10 и D-4 → D12; D-7 → D-9; D9 → D13; E3 → E8; E5 → H1; E7 и E8 → F8; E10 → F4; E-1 → F-1;
   E-3 → F-10; E-4 и E-8 → F-9; E-5 и E-6 → F-8.
6. **Убрано.** Ссылки на Svelte #11555 и LaunchDarkly #840 (в отчётах без URL, заменены источниками с URL). Ничего
   существенного по смыслу не выброшено.
7. **Новое из проектных исследований** (кратко): A3, A5, A8, B3, B5, C3, C4, C10, D2, D4, D5, D8, D10, D12, D13, E1,
   E4, E6, E7, E9, E10, F2, F3, F5, F9 и почти все строки Worst в D и E.

## 3. Сверка с принятой моделью (2026-10-16)

### 3.1 Что подтверждает модель

| Решение владельца | Подтверждение из новых исследований |
| --- | --- |
| Один владелец и один писатель (`createStore`) | UNO "only one owner per object"; HA запрет мутировать `ConfigEntry`; Godot: autoload допустим, если "managing its own information and not invading the data of other objects"; Medusa: модуль владеет только своими данными |
| Остальные получают `readonly()` через контракт и `required` | Grafana frozen `context`; Forge `MonitorAware`; Bukkit MONITOR как антипример «только по соглашению» |
| `watch` и `load` живут в scope подписчика, `resources` обязателен | GNOME !4382 (владелец был необязательным, подписки утекали в `globalThis`, через 4 года добавили предупреждение); Godot C# (владелец выводился из колбэка, замыкание его теряло); Fabric #5619 (спрос на scoped-подписки не исчез за 7 лет); GitLab: подписки "organized using the bounded context of the worker" |
| Хаба нет | Nystrom: "A central event queue is a global variable"; Forge ушёл от одной шины к шине на тип; HA ушёл от `time_changed` и подписки «на всё» |
| Модуль может владеть store | HA config subentries "owned by a config entry"; Godot "Whichever object owns the other objects should manage the relationships" |
| Свой срез настроек у модуля | Grafana "Only share the minimum amount of data"; GitLab "Strip shared models to identity objects" |
| `many()` только для точек расширения | Medusa: "A hook can have only one handler"; Theia #10877: статические вклады не годятся для того, что живёт меньше приложения |
| Событий пока нет | Fabric "Events should not be used if there is only one subscriber"; GitLab 2026 "Prefer direct dependencies"; Django "opt for directly calling"; Medusa: события только для неинтегрального |

### 3.2 Что требует нового правила, механизма или уточнения

| Кандидат | Решение | Где | Надёжн. / увер. |
| --- | --- | --- | --- |
| `optional` различает «нет» и «упал» (Lumino) | **Уже есть в GM.** Отсутствие решает композиция: у `optional` всегда явная строка `[]` или провайдер. Падение фабрики провайдера даёт `failed` для всего run: "No later factory or library cleanup runs after failure" (`common-assembly.md`, Outcomes). Для экземпляров есть фасад: "refuse with an explicit unavailable result after retirement" (Dynamic instances). Правило: режим «деградировать молча» не добавлять. | VERIFIED; v2 F-3, правило 10 | 9 / 9 |
| Агрегатор `many()` не держит дочерние scope (Theia) | **Уже исключено конструкцией внутри одного run.** `run` идёт последовательно в `dependencyOrder`, `scoped()` открывает scope на каждый вызов фабрики, освобождение идёт в обратном порядке (resources README, ADR-0030), поэтому потребитель `many` закрывается раньше провайдеров. Между run `many` не ходит, а input "must outlive every instance that received it". Риск переезжает в динамические реестры (следующая строка). | VERIFIED; v2 D-6 | 8 / 8 |
| Две строки на `required`-слот считаются ошибкой (Theia rebind) | **Уже есть.** Core: `binding.duplicate-record` (`packages/core/src/features/composition-semantics/selected-bindings.ts:46`), `binding.cardinality` (`binding-record.ts:25`). Assembly: `assembly.prepare.unresolved-binding`, если кандидатов несколько, а строки нет; `assembly.prepare.duplicate-module`. Оговорка: нормативный ADR-0014 о семантике повторной строки до сих пор `proposed` (`docs/decisions/README.md`), хотя код диагностику уже выдаёт. | VERIFIED; v2 D-4 | 9 / 8 |
| Динамические вклады через реестр владельца, `Disposable` в scope вкладчика (Theia, Grafana) | **Правило в стандарт сейчас; механизм — вопрос владельцу (Q1).** Регистрация — это команда владельцу, которая принимает `resources` вкладчика; владелец остаётся единственным писателем списка; запись удаляется при закрытии scope вкладчика. `many()` остаётся статическим. | v2 D10, правило 6 | 8 / 7 |
| Dev-сверка манифеста с фактическими вкладами (Grafana) | **Для модулей уже есть.** Модуль обязан вернуть ровно объявленные ключи capabilities: `snapshotProduct` в `run.ts` вызывает `record(..., keys)`, а `record` в `snapshot.ts:32-41` отклоняет лишние и недостающие ключи. Строки `many` сверяет оракул (ADR-0037). **Для плагинов** запланирован F-1: манифест генерируется из деклараций, есть режим `--check` (`research/module-dx-2026-10/0.5.0-train.md:2469`). Сверку с тем, что плагин реально дал, делает plugin Host. | VERIFIED; v2 D2 | 8 / 7 |
| Основной контракт — `read`, `watch` только для реакции (Kibana) | **Правило в стандарт** при admission observation: store-фасет в контракте только там, где потребитель обязан реагировать на изменение, иначе обычный порт. | v2 A3, правило 5 | 8 / 8 |
| Не заводить событие при одном подписчике (Fabric) | **Правило** (vision 5 и блок Future events). Заодно это довод за отсрочку событий. | v2 Future events | 9 / 8 |
| Наблюдатель не меняет данные (Magento) | **Механизм в observation:** снимки заморожены всегда, а не только в dev (dev-only заморозка делает поведение dev и prod разным, а данные plain и маленькие); у `readonly()` нет `set`. **Правило** для контекста, который владелец передаёт вкладам (D8). Сейчас Assembly замораживает записи зависимостей и массивы `many`, но не значения capabilities. | v2 A8, D8 | 8 / 8 |
| Вложенные события в очередь, а не повторный вход (HA) | **Повторного входа уже нет по замыслу:** доставка отложенная (OD-007, Constraints: "delivery is deferred, coalescing"). **Нового требует предохранитель каскада.** Отложенная доставка прячет циклы: синтез B (4.7) описывает livelock через `setImmediate`, Nystrom пишет то же. Механизм в observation: счётчик глубины каскада от исходного `set`; при превышении предела `reportError` с кодом вида `observation.cascade.limit` и цепочкой имён, после чего цепочка прерывается. Алгоритм зондом не проверен (ASSUMPTION). | v2 F2, правило 7 | 7 / 6 |
| "callbacks hide the coupling", "A dependency that is not declared does not exist" (GitLab) | **Принцип в GM уже есть:** слот и есть ребро; CMS запрещает string lookup и mutable registry. **Новые правила:** (а) мягкие адреса (маршруты, ID команд, ключи хранилища) — константы контракта владельца, их использование считается ребром (сейчас Gap, v2 C3); (б) колбэк через порт передаётся только в примитив подписки, который принимает `resources`. | v2 C1, C2, C3; правило 2 | 8 / 8 |
| Дедлайн и замер на каждую фабрику (Kibana, VS Code, Theia) | **Дедлайн — Host** ("Use one deadline at the root", CMS). **Замер и атрибуция зависшей фабрики — Gap.** `run()` ничего не сообщает до завершения, а "An uncooperative pending factory can keep run pending". Host не может обернуть фабрику: стандарт допускает только адаптер `scoped`. Нужен небольшой механизм в Assembly → Q2. | v2 F5 | 7 / 6 |
| Тестовый помощник «нет утёкших подписок» (VS Code, Obsidian) | **Частично есть:** `isolate` и `smoke` падают на долгах scope. Подписку, оставшуюся живой после закрытия scope, они не видят. **Механизм:** testing entry point пакета observation (число живых `watch` у store), затем интеграция в contract suite из `@get-modular/conformance`. Порог утечки на store (VS Code `leakWarningThreshold`) пока не брать. | v2 E8, правило 16 | 8 / 7 |

Дополнительные кандидаты, которых не было в списке:

| Кандидат | Решение | Надёжн. / увер. |
| --- | --- | --- |
| Отписка во время доставки: Redux (снимок, текущая рассылка не меняется) против Lumino и LibreOffice (снятый не вызывается) | **Механизм observation: семантика Lumino.** Подписка снимается при закрытии scope подписчика; вызвать её после этого значит использовать закрытый объект. Новая подписка ждёт следующей доставки. | 8 / 8 |
| `read` или `watch` на закрытом store: UNO (сразу `disposing`, без исключения) против VS Code (громкая ошибка) | **Механизм observation: кодированная ошибка** (правило 15). В GM порядок гарантирует, что источник живёт дольше подписчиков, поэтому подписка на закрытый store — ошибка проектирования. Отписка после закрытия остаётся no-op. | 8 / 7 |
| `set` без изменений (HA `always_update=False`) | **Механизм observation:** если значения по каждому ключу равны по `Object.is`, коммита нет, ревизия не растёт. Это согласуется с OD-007 ("no per-subscriber equality"): сравнение делает владелец, а не подписчик. Оговорка: ревизия тогда означает «изменился хотя бы один ключ», а не просто номер коммита. | 8 / 7 |
| Один путь на вход (HA listener плюс reload) | **Правило** (v2 A5, правило 4). | 8 / 8 |
| Отдельный run как граница отказа (Kibana RFC 0007, Adobe out-of-process) | **Правило** (v2 E9, правило 9). Внутри run «всё или ничего» правильно; то, что не должно падать вместе с соседом, запускается отдельным run. | 8 / 7 |
| Вето (Fabric `Allow`, Mattermost `Will`) против запрета вето в правиле 8 | **Уточнить правило 8:** вклад не останавливает другой вклад; владелец может задать чистые вопросы `allow` и агрегировать ответы по своей объявленной политике, а уведомлять только после решения (v2 H2, D4). | 7 / 7 |
| Мост-модуль (Odoo `sale_crm`, Medusa links) | **Рецепт в гайде** (v2 C4). | 8 / 8 |
| Уведомление покрывает все пути записи (Django `update()`, Strapi 5) | **Правило:** store выражает доменное изменение владельца, и каждый путь записи идёт через `set` (v2 C-5). | 8 / 7 |
| `many` отдаёт значения без ID провайдеров (`run.ts`, `dependenciesFor`) | **Gap, P3, не сейчас.** Владелец точки не может приписать сбой вклада без поля в контракте. Поле `id` в значении вклада дублирует `implementationId` (это против правила 15 «не повторять согласованную информацию»), а выдача ID механизмом Assembly — breaking change без потребителя. Вернуться при первом плагинном Host. | 6 / 5 |
| Construction awaits network (Kibana RFC 0007) против примеров CMS с `await resources.setup(connect)` | **Не противоречие, а граница:** фабрика ждёт только своих приобретений, без которых модуль не работает, и только под `signal`. Готовность внешних систем (телеметрия, необязательный сервис) выражается состоянием. Записано в E9 и правиле 9. | 7 / 7 |

### 3.3 Что не брать

| Кандидат | Почему | Надёжн. / увер. |
| --- | --- | --- |
| Аварийный выход из циклов как у Kibana (`runtimePluginDependencies`) | Потребителя нет; у GM есть разделение «владелец состояния и потребитель детей» и мост-модуль. Kibana пришла к нему из-за сотен legacy-плагинов. | 8 / 7 |
| Ленивая активация модулей внутри плана (VS Code, Lumino, Grafana) | План готовится один раз; ленивость дают отдельные run экземпляров. | 7 / 6 |
| Версия в ID точки расширения (Grafana `/v1`) | Противоречит CMS: "A capability ID is permanent: do not start a parallel line such as an ID ending in `/v2`". Для плагинов владелец уже выбрал окна ревизий. | 8 / 8 |
| Числовые приоритеты (Forge `byte`) и именованные фазы (Fabric) | Явная строка в корне сильнее обоих; оба проекта сначала советуют разбить точку. | 9 / 8 |
| Порог утечки на store (VS Code `leakWarningThreshold`) | Дёшево, но потребителя нет; тестовый помощник (E8) закрывает главный риск. | 7 / 6 |
| Прокси через границу процессов (VS Code `Proxied<T>`) | Это задача Host, когда плагины выйдут из процесса. Plain data уже делает мост возможным. | 7 / 6 |
| Сохранение подписки на уничтоженный источник в стиле UNO | См. 3.2: в GM это ошибка, а не нормальный случай. | 8 / 7 |

### 3.4 Дрейф документов GM

| # | Sev | Увер. | Тип | Находка |
| --- | --- | --- | --- | --- |
| G1 | P1 | 8 | VERIFIED | Правило 11 в `AGENTS.md` говорит: "Contributions come from the owner's group or from a plugin manifest, never from editing a central list". Сегодня это невыполнимо: "Group-level bindings do not exist." (`get-modular:docs/guides/module-authoring.md:1039` на `origin/main`), F-4 отложен до первой фичи со своей строкой (`research/module-dx-2026-10/0.5.0-train.md:2473`). Агент либо попробует несуществующий механизм, либо нарушит правило, правя корень. В предложенном тексте правило 11 говорит только о плагинах (строки из манифеста), а статус F-4 записан в каталоге. |
| G2 | P2 | 9 | VERIFIED | `docs/open-decisions/OD-007-module-change-observation-package.md` на `origin/main` всё ещё называет хаб направлением владельца: "**Default:** one hub per event family with opaque, data-only participants (`participantsFor<V>().sync(...)`)". Статус в `AGENTS.md` перечисляет к переписыванию только ADR-0034 (#154) и briefs (#153). OD-007 нужно добавить в этот список. |
| G3 | P3 | 8 | VERIFIED | Нормативный ADR-0014 (повторные строки привязки) остаётся `proposed`, хотя Core выдаёт `binding.duplicate-record`. На выводы каталога не влияет; стоит закрыть отдельно. |

## 4. Правки 15 правил в AGENTS.md

### 4.1 Что меняется

- **1:** добавить, что через границу модуля идут только неизменяемые plain data и ID, замороженные механизмом (Magento,
  Forge, Grafana).
- **2:** переформулировать по GitLab: «A dependency that is not declared does not exist». Добавить мягкие адреса
  (Kibana #66682), monkey-patching и override по ID (Discourse, Magento 1, Medusa v1).
- **3:** добавить типизированный результат команды (Temporal Update) и прецедент Godot «signal responds, method starts».
- **4:** добавить «вход либо наблюдается, либо пересобирается, не оба» (HA).
- **5:** добавить «по умолчанию `read`, `watch` только для реакции» (Kibana), «один реагирующий — вызов, не событие»
  (Fabric), мост-модуль (Odoo).
- **6:** добавить «`resources` обязателен, не выводится и не опционален» (GNOME, Godot C#) и динамические вклады через
  реестр владельца (Theia). Последнее предложение зависит от Q1: если владелец выберет вариант C, заменить на
  «изменение набора вкладов пересобирает экземпляр владельца».
- **7:** добавить очередь изменений во время доставки с предохранителем (HA) и «снятая подписка не вызывается даже
  посреди доставки» (Lumino).
- **8:** заменить «no veto» точной формулировкой (H2), добавить «точка на вид вклада, сначала разбить» (Grafana, Fabric) и
  «решение отдельно от уведомления» (Fabric, Mattermost).
- **9:** добавить «фабрика ждёт только своих приобретений под `signal`; готовность — состояние; что должно пережить
  соседа — отдельный run» (Kibana RFC 0007).
- **10:** добавить «упавший провайдер роняет сборку» (контрпример Lumino).
- **11:** убрать невыполнимое «owner's group» (G1); добавить сообщения через границу изоляции (Electron, Chrome).
- **12:** добавить имена вкладов и прецедент GitLab "Avoid chatty domains".
- **13, 14:** сократить без изменения смысла.
- **15:** добавить «эскейп-хэтчи объявлены как долг, списки нарушений только сокращаются» (Kibana, GitLab, hassfest).
- **16 (новое):** утечки и использование после закрытия валят тесты (VS Code).
- Номера 1–15 сохранены, чтобы не сломать ссылки на них в других документах.
- В абзаце статуса: добавить OD-007 к документам на переписывание; указать `PRACTICES.v2.md` как промежуточный каталог.

### 4.2 Предлагаемый текст (английский)

```markdown
## Module communication vision

Owner direction recorded 2026-10-15, extended 2026-10-16 after project-level surveys of plugin platforms, application
backends, games and native desktops. It is mandatory for every design of how Get Modular modules pass data, changes,
requests, events and contributions, including observation, events, extension points and plugins. The goal is a system
that stays predictable and observable at hundreds of modules. Proven patterns come first. Our own idea is allowed only if
it states why it beats them. "Strictly no anti-patterns."

The catalog of best and worst practices, with sources and the status of each practice in Get Modular, is a standing
guide: read it before designing or reviewing module communication. Interim location:
`research/module-communication-2026-10/PRACTICES.v2.md` in this workspace; it moves to get-modular `docs/guides/`.

1. **One owner, one writer per value.** Only the owner calls `set`; everyone else gets `readonly()` through a contract
   and a `required` slot. What crosses a module boundary is immutable plain data or an ID, frozen by the mechanism, not
   by convention. Precedents: React "single source of truth", Kubernetes `spec`/`status`, LibreOffice UNO "one owner
   per object", Forge `MonitorAware`.
2. **A dependency that is not declared does not exist.** Every link is a typed contract plus a slot, visible in the
   composition plan. Routes, command IDs and storage keys of another module are constants of its contract and count as
   edges. Forbidden: a global or string-topic bus, wildcard subscriptions, a mediator or service locator, ambient
   registries, monkey-patching and override by ID. Precedents: GitLab modular monolith, Guava "We recommend against
   using EventBus", Kibana #66682, Discourse `modifyClass` "last resort".
3. **Data goes from provider to consumer; a request goes back as a call.** The child calls the owner's command port,
   the command returns a typed result such as accepted or rejected, and the confirmed change returns as new state. A
   child never writes a parent's state and has no implicit `parent`. Two-way binding is only sugar over that pair. In
   FMS terms, a child that reads its parent's contract uses an upward edge. Precedents: Akka "There is no parent in
   Typed", Godot (a signal responds, a method starts), Temporal Update.
4. **A parent may pass changed data to its children** by owning a store as its only writer. One meaning travels one
   path: no child watches both the raw and the derived value, and no input is both watched and rebuilt. Precedent:
   Home Assistant, "reload twice and/or create a race condition".
5. **Prefer a call; choose the mechanism by the kind of fact.** Read the current value by default; `watch` only when
   you react to the change itself. A coalescable fact is state. A fact that cannot be coalesced and has several
   independent reactors is an event (later). One reactor means a call or a slot, never an event, and a command is never
   disguised as an event. A process that writes to several owners runs in an orchestrator in a common ancestor or in a
   bridge module. Precedents: Kibana RFC 0007, Fabric "only one subscriber", GitLab "callbacks hide the coupling",
   Medusa workflows, Ruecker.
6. **A subscription lives in the subscriber's scope.** `resources` is a required argument, never inferred and never
   optional, and the subscription detaches before drain (CMS rule 5). Contributions that come and go register on the
   owner's registry with the contributor's `resources`; `many()` stays static. Precedents: GNOME `connectObject`, Godot
   C# lambdas, VS Code `Disposable`, Theia #10877.
7. **Delivery is deferred, isolated and bounded.**
   - One listener's failure never stops the others and is reported under that listener's name.
   - Handlers are synchronous and never write what they were notified about, directly or through a command. No echo.
   - Changes made during delivery are queued in order; a runaway cascade fails with a coded error.
   - A removed subscription is never called again, even in the middle of a delivery.
   - Async reactions are latest-only, cancel through `AbortSignal` and never apply stale results.

   Precedents: Home Assistant nested-event queue, Lumino signals, VS Code `fire`, Flux, Angular `resource`.
8. **An extension point is the owner's contract plus `many()` with an explicit ordered row.** The owner declares its
   kind (collect, first, transform, wrap) and its error policy, and keeps decision points apart from notifications. One
   point per kind of contribution: split a point before you order inside it. A contribution never stops another; the
   owner may aggregate pure answers by its declared policy. No numeric priorities. Precedents: Fabric
   Allow/Before/After, Grafana per-kind registries, Linux cpuhp, Drupal `Order`.
9. **The module graph is acyclic and construction does not wait on the world.** A two-way need goes through a common
   ancestor, or the state owner and the consumer of children become separate modules. A factory awaits only its own
   acquisitions under `signal`, reads a snapshot and subscribes; it never awaits another module's future and never
   emits. Readiness is state. What must survive a sibling's failure runs as a separate run. Precedents: Martin's
   Acyclic Dependencies Principle, Kibana RFC 0007, Android's mediating module.
10. **`optional` means "may be absent in this composition", never "failed quietly".** Default to `required`. A failing
    provider fails construction. Precedents: Lumino `resolveOptionalService` (counterexample), AWS Kinesis 2020,
    ADR-0035.
11. **Plugin- and instance-ready.** Plugins and instances receive only read/watch facets, event sources and command
    ports, all through inputs; across an isolation boundary only validated plain-data messages, one method per message.
    Their registrations live in their generation scope. A plugin never edits the Host's list: the plugin Host generates
    rows from the manifest and checks them against what the plugin provides. Precedents: Backstage, Electron, Grafana
    `plugin.json`, Paper plugin isolation.
12. **Observable by construction.** Name every store, event, subscription and contribution, and use the revision as the
    correlation ID. Who watches, listens and contributes must be readable from the plan. Frequent chatter between two
    modules points to a wrong boundary, not to a missing channel. Precedents: Spring Modulith Documenter, GitLab "Avoid
    chatty domains", single-spa "consider merging them".
13. **Names are mainstream and unambiguous:** `createStore`, `read`, `set`, `readonly`, `watch`, `load`, `close`; later
    `createEvent`, `emit`, `subscribe`; "extension point", "contribution", "command port". Avoid "participant", "hub",
    `sync` (two-way binding, synchronous execution or external sync), `derived` or `computed` for side effects, "hook"
    (read as React Hooks) and `seal` (read as the opposite of `Object.seal`).
14. **Libraries give patterns and vocabulary.** One becomes a runtime dependency only if it isolates listener errors,
    cancels stale async work and fits a leaf package. None qualified on 2026-10-15 (mitt, EventEmitter, alien-signals,
    signal-polyfill, RxJS).
15. **Reliability beats brevity, because agents write most of this code.** Every call is explicit and fully typed.
    Misuse must fail to compile or fail fast with a coded error. A caller never repeats information that must stay
    consistent. No magic shortcuts. Every escape hatch is declared, named as debt and listed, and violation lists only
    shrink. Validate API shapes with negative type probes on the minimum and pinned TypeScript, and with a test in
    which agents write modules from the types alone.
16. **Leaks and misuse fail tests.** Every module test closes its scopes and fails on a debt or on a subscription still
    alive; use after close throws a coded error. Precedents: VS Code `ensureNoDisposablesAreLeakedInTestSuite`, VS Code
    "The added object will be leaked!".

Status on 2026-10-16. The owner accepted this model for observation:
- the subscription lives in the subscriber's scope (`watch` with a mandatory `resources`);
- there is no hub and there are no participants;
- any module may own a store as its only writer;
- every module depends on its own settings slice;
- the vocabulary is `createStore`, `read`, `set`, `readonly`, `watch` (with `load`) and `close`; events come later as
  `createEvent`, `emit` and `subscribe`.

The exact signatures are still being validated against rule 15. ADR-0034 (get-modular #154, not merged), the briefs
(#153) and OD-007 on get-modular main still describe the old hub design and will be rewritten before merge. Do not
implement the hub, `participantsFor` or Host-only writes.
```

Длина: 16 пунктов (лимит задания 15–18). Пункты 7 и 15 самые длинные; если нужно короче, первым кандидатом на перенос
в каталог я бы считал прецеденты, а не сами правила.

## 5. Честно

### 5.1 Что осталось UNVERIFIED и влияет на выводы

1. **Алгоритм предохранителя каскада (F2) — моё предложение.** HA делает это для синхронной шины; у отложенной доставки
   со склейкой «глубина каскада» требует точного определения (какой `set` порождён какой доставкой). Нужен зонд до ADR.
   Влияет на правило 7.
2. **Вариантность `out V` для срезов настроек на TypeScript 5.8.3 не проверена** (синтез B, раздел 5). От неё
   зависит, как реализуется «свой срез у каждого модуля» (A6). Вывод каталога от этого не меняется, реализация — да.
3. **Цитаты со страниц, извлечённые инструментом пересказа:** Chrome, Figma, сайт Grafana, документация Paper и Blender.
   В v2 из них опираются D11 и F6 (Paper), A4 и E1 (Blender). Перед переносом в публичный репозиторий эти ссылки нужно
   открыть заново.
4. **Magento: прерывание рассылки на первой ошибке** — вывод исследователя из кода `InvokerDefault` (нет `try`), не
   документированное поведение. В F-1 это третий из трёх источников; вывод держится на Discourse и Django.
5. **Даты и PR после июня 2026** (HA #173519, GNOME !4382, Theia 1.76.0, Kibana #278396) я проверил через GitHub и GitLab
   API, но не всё: остальные факты 2026 года взяты из отчётов без повторной проверки.
6. **Причина отката NeoForge 7.0.13 → 7.0.17** (тихое поведение вместо исключения) неизвестна. Если она серьёзная, это
   контрпример к fail-fast; в v2 это отмечено в H8.

### 5.2 Где исследования противоречат друг другу

| # | Противоречие | Как решено в v2 |
| --- | --- | --- |
| C1 | Подписка на закрытый источник: games 12.5 (UNO, «сразу `disposing`, без исключения») против plugin-platforms 13.5 п. 25 (VS Code, «понятная ошибка») | Ошибка с кодом; отписка после закрытия — no-op (E6) |
| C2 | Заморозка: plugin-platforms 13.1 п. 2 («в dev-сборке») против games 12.4 («механизмом») | Всегда, не только в dev (A8) |
| C3 | Порядок вкладов: games 12.4 допускает именованные фазы Fabric, если строки мало; app-backends 14.4 п. 2 и правило 8 — только строка | Только строка; сначала разбить точку (D5, D6, H3) |
| C4 | Версия контракта: plugin-platforms 13.4 п. 18 (версия в ID, как в Grafana) против CMS ("do not start a parallel line such as an ID ending in `/v2`") | Модель ревизий GM; окна ревизий вместе с плагинами (H7) |
| C5 | `optional`: app-backends 14.1 п. 4 («равен HA `after_dependencies`») против кода GM | См. E2 в разделе 1 |
| C6 | Kibana #276240: «влит» в отчёте против фактического «закрыт без слияния» | См. E1 в разделе 1 |
| C7 | Удаление подписки посреди доставки: Redux против Lumino и LibreOffice (из разных отчётов) | Lumino (E7, H1) |
| C8 | Демонтаж: plugin-platforms 13.5 п. 23 предлагает добавить в GM таймаут и сбор ошибок | Уже есть: долги собирает resources, дедлайн у Host (`escalate`, `abandon`), один дедлайн на корень (CMS) |

### 5.3 Риски

1. **Каталог длинный (около 510 строк).** Агенты не будут читать его целиком. Реально всегда видны только 16 правил,
   поэтому всё, что должно соблюдаться всегда, обязано быть в правилах или в стандарте, а не только в каталоге.
2. **Две версии правды.** Нормативные правила должны попасть в `common-assembly.md` вместе с отвергающими тестами там,
   где их можно проверить (правило Consumer Module Standard maintenance в `AGENTS.md`). Иначе стандарт и каталог
   разойдутся.
3. **`Proposed` легко принять за принятое.** Защита — легенда и колонка «In GM». Риск остаётся, пока предложения не
   приняты или не отклонены.
4. **Публикация.** В каталоге есть ссылки на внутренние документы (`AGENTS.md`, workspace research). Перед переносом в
   get-modular их нужно убрать или заменить, по правилу о редакции перед push в публичный репозиторий.
5. **Отсрочка событий.** Games-отчёт (12.6) честно предупреждает: если событий долго нет, их начнут подделывать через
   ключ-счётчик в store. В v2 это прямо запрещено (блок Future events), но запрет держится только на ревью, пока нет
   проверки.

### 5.4 Вопросы владельцу

**Q1. Как устроены вклады, которые появляются и исчезают во время работы** (виджеты, сессии, вклады плагинов, живущие
меньше приложения)? Сейчас есть только статический `many()`.

| Вариант | Надёжность | Уверенность |
| --- | --- | --- |
| **A (Recommended):** правило и рецепт сейчас. У владельца точки есть порт-реестр `register(resources, item)`: это команда, владелец остаётся единственным писателем списка, запись удаляется при закрытии scope вкладчика, `many()` остаётся статическим. Примитив (например `createRegistry` в observation) — с первым реальным потребителем, скорее всего plugin Host | 8 | 7 |
| B: выпустить такой примитив сразу в observation 0.1 вместе с `createStore`. Единая реализация с первого дня, но без потребителя, то есть спекулятивная поверхность | 7 | 5 |
| C: динамических регистраций нет; любое изменение набора вкладов пересобирает экземпляр владельца с новой строкой (новое поколение). Это уже поддерживается и надёжно, но тяжело для частых изменений, а строки остаются в корне | 7 | 5 |

**Q2. Нужен ли Assembly механизм для замера фабрик и атрибуции зависшей фабрики?** Kibana, VS Code и Theia замеряют
каждый модуль. Сейчас `run()` ничего не сообщает до завершения, зависшая фабрика держит run, а Host не может обернуть
фабрику (стандарт допускает только адаптер `scoped`).

| Вариант | Надёжность | Уверенность |
| --- | --- | --- |
| **A (Recommended):** необязательный синхронный наблюдатель в `run` (например `onFactory({ implementationId, phase: "started" \| "settled" })`), без таймеров в GM; ошибки наблюдателя изолированы. Host сам считает длительность, предупреждает по порогу и называет зависший модуль. Порядок объёма (ASSUMPTION): 40–80 строк кода, тесты и ADR | 8 | 6 |
| B: только длительности в `created` и в исходах после завершения run. Просто, но не помогает в главном случае, когда run завис | 6 | 7 |
| C: ничего в GM; Host восстанавливает картину по порядку плана и путям долгов scope. Фабрика, которая ждёт чужой промис, следов не оставляет | 5 | 6 |

Остальное я решил сам в пределах уже принятых решений: семантика отписки (Lumino), ошибка при использовании закрытого
store, заморозка всегда, no-op `set`, формулировка вето, формулировка правила 11.
