# Пространства имён и владение идентичностями: минимально достаточный дизайн

Дата: 2026-10-01. Статус: предложение для ревью основания, не ADR. Линза: минимально достаточно.
Пути указаны относительно `<workspace>/`.

## 1. Что есть сейчас (проверенные факты)

**Get Modular (HEAD 9c722ce)**

- Для всех id действует одна грамматика: сегменты `[a-z][a-z0-9]*(-[a-z0-9]+)*`, разделитель `/`, минимум два сегмента (`get-modular/packages/core/src/features/input-admission/identity-format.ts:5-24`), не длиннее 128 байт (`resource-limits.ts:10`). `slotId` и `owner.authority` — локальные токены без `/`, `owner.path` содержит от 1 до 8 токенов (`document-shape.ts:50-51,74-75`).
- Core ловит только дубликаты внутри одного вызова: повтор `implementationId` (`composition-semantics/declaration-census.ts:56-62`) и повтор `moduleId` в выборе профиля (`profile.duplicate-selection`). Кода `identity.namespace-mismatch` в закрытом каталоге нет (`authoring/diagnostic-types.ts:5-36`). `owner` проверяется только по форме и в план не попадает (`wire-types.ts:48-69`).
- Политика уже записана. Namespace выделяет admission продукта, глобального реестра нет (`docs/architecture/mvp-implementation-roadmap.md:870-874`). Core не аутентифицирует `owner.authority`. Host до компиляции проверяет два гранта: на namespace модуля/реализации и на provision каждой capability. Эти гранты «not inferred from matching string prefixes». Сторонняя реализация владеет своим module id и реализует capability продукта (`:926-943`). Breaking-контракт получает новый `capabilityId` (`:907`). Про `owner.authority` сказано: «not an authenticated principal» (`docs/guides/consumer-quickstart.md:137`).
- Новый код диагностики требует «successor schema, catalog, diagnostic contract, snapshot set, checker, and qualification ledger» (`docs/architecture/current-contract.md:442-446`). Для масштаба: артефакты поколения 2 занимают около 150 КБ JSON (`architecture/qualification/generation-two/*.json` и ledger), а ADR-0013/0014/0021 — около 1100 строк.

**Extension Foundation (main 8907b6d).** `NamespaceId`, `PublisherId` и `ExtensionId` — раздельные identity. Маршрутизация идёт по «longest matching namespace assignment». Tombstones не переиспользуются, передача namespace меняет стюарда, а не identity (`extension-foundation/docs/decisions/0004-deterministic-catalog-federation-and-namespace-authority.md:28-30,38-43`). Module и capability ids названы «stable, authority-qualified strings» (`docs/qualification/universal-module-extension-system/module-graph.md:170-173`). При этом что такое «authority-qualified», в GM нигде не определено.

**Реальные потребители**

| Где | Факт |
| --- | --- |
| agent-runtime `origin/main` b0bcb265 | 16 вызовов `defineModule`. В одной композиции два верхних префикса: `agent-runtime/*` (`packages/apps/embedded-runtime/src/composition/runtime-setup-assembly.ts:47`) и `ordinary/*` (`.../features/ordinary-session-runtime/composition/ordinary-runtime-assembly.ts:23-30`). Типовая карта capability сливает оба набора (`runtime-setup-assembly.ts:35`). В одной декларации стоят `capabilityId: "ordinary/store"` и токен `agent-runtime/ordinary-v1` (`ordinary-runtime-assembly.ts:7,23`). `owner.authority: "agent-teams"` не совпадает ни с одним префиксом (`:22`; `runtime-setup-assembly.ts:48`). Везде `implementationId == moduleId`. Восемь capability делят один токен (`runtime-setup-assembly.ts:34-37`). Типы портов берутся у потребителя-хоста (`:7`). |
| modularity-host-TEST fcc10b2 | Admission проверяет namespace по границе сегмента: `value === namespace \|\| value.startsWith(namespace + "/")` (в коде шаблонная строка) (`src/admission/policy.ts:27-28,81-82`). Provision проверяется точной парой `id\|token` (`:83-85`), получение — отдельным грантом (`:99-100`). Субъект берётся из доверенного inventory, а не из декларации (`:77`). `owner.authority: 'fixture-provider'` при namespace `test/provider` (`src/fixtures/graph.ts:16`, `src/inventory/trusted.ts:41`) никто не читает. Бывают и двухсегментные namespace. |
| GM self | Схема последовательная: `get-modular/plan-output`, `.../default`, токен `<capabilityId>/v1`, authority `get-modular` (`packages/core/src/features/plan-output/declaration.ts:4-7,14`). |
| orchestrator, platform | Деклараций GM нет (проверены локальные checkout'ы). |

**Вывод.** Пробел, записанный 2026-09-04, в коде подтверждается, но архитектурно уже решён в пользу Host. Реально не хватает трёх вещей: нормативного определения namespace и правила вхождения, правила выделения first-party namespace и правила о том, кому принадлежит `capabilityId`. AR от них уже отошёл, и сейчас это ещё дёшево исправить.

## 2. Как это делают другие

| Система | Факт и источник | Урок |
| --- | --- | --- |
| npm scopes | «Each npm user/organization has their own scope, and only you can add packages in your scope.» ([npm](https://docs.npmjs.com/cli/v11/using-npm/scope)) | Namespace — это выделенный префикс. Право на него проверяет registry при публикации, а не сам пакет. |
| Go modules | Путь модуля = корень репозитория + подкаталог + `/vN`. «If an old package and a new package have the same import path, the new package must be backwards compatible with the old package.» ([go.dev/ref/mod](https://go.dev/ref/mod)) | Несовместимость означает новый id, без алиасов. |
| Kubernetes CRD | Имя имеет вид `<plural>.<group>`, group — DNS-поддомен. Для `*.k8s.io` нужна аннотация `api-approved.kubernetes.io`, но она принимает и `"unapproved, experimental-only"`. Цель — «Prevent accidentally claiming reserved named[s]» ([CRD](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/), [KEP-2337](https://github.com/kubernetes/enhancements/tree/master/keps/sig-api-machinery/2337-k8s.io-group-protection)) | Проверка внутри объекта защищает только от случайности. Реальная власть — RBAC на создание. |
| VS Code | «The id of an extension is always `${publisher}.${name}`». Publisher ID «cannot be changed once created». Статус verified подтверждается через DNS TXT ([manifest](https://code.visualstudio.com/api/references/extension-manifest), [publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)) | Publisher плоский и неизменяемый, доверие — отдельный слой. |
| Backstage | ID имеет вид `[<kind>:][<namespace>][/][<name>]`, namespace по умолчанию равен plugin ID. При дубликате установка «will either result in an error or one of the extensions will override the others» ([extensions](https://backstage.io/docs/frontend-system/architecture/extensions)) | Override по id открывает канал перехвата. GM уже fail-closed, и это надо сохранить. |

Общее у всех: namespace — это префикс, который выделяют вне артефакта. Проверка идёт в точке публикации или admission, а самоописание артефакта ничего не доказывает. Глобальная уникальность через DNS, как в Go, нужна, когда нет единой точки admission. У GM такая точка есть в каждом Host и в каталоге XF.

## 3. Три варианта

**A. Namespace — выделенный префикс id; Core не меняется.** Грамматика остаётся прежней. В GM и в Consumer Module Standard добавляется нормативный текст (N1–N6, раздел 4), AR переименовывает `ordinary/*`. Проверки остаются у Host и XF, как уже записано в roadmap.
Надёжность 8/10, уверенность 8/10, сложность 2/10. LOC: в GM src 0, tests 0, docs ~100; в AR ~25 строк id и ~20 строк тестов.

**B. A плюс чистка wire сейчас.** Удалить из схемы `owner.authority` (или весь `owner`) и экспортировать из core чистый предикат `isWithinNamespace(id, namespace)`.
Надёжность 9/10: уходит обманчивое поле и разнобой в реализациях проверки. Уверенность 6/10: польза сейчас мала, а изменение схемы по процессу GM означает successor-поколение. Сложность 5/10. LOC: src ~20 на предикат и ~15 правок схемы (core и snapshot в assembly), tests ~60 плюс перегенерация snapshot и ledger (по аналогии с поколением 2 — десятки КБ; это оценка, не проверено), docs ~200 (ADR и миграционная заметка). У потребителей нужно удалить `owner` примерно в 30 декларациях.

**C. Namespace проверяет Core.** Привязать `owner.authority` или новое поле `namespace` к префиксу id, добавить `identity.namespace-mismatch`, при желании принимать таблицу грантов на входе компиляции. Другой вариант — DNS-ids с точками.
Надёжность 5/10: строка в декларации — самоутверждение (как `unapproved` в Kubernetes), безопасности она не даёт, зато рядом с Host-грантами появляется второй authority. Уверенность 8/10 в том, что этот обмен невыгоден. Сложность 8/10. LOC: src 150–300, tests 300–600, поколение 3 масштаба поколения 2, docs 300+.

## 4. Рекомендация: A сейчас, части B — по триггерам

Правила оформляются как нормативный раздел «Identity namespaces» в `docs/architecture/current-contract.md` и абзац в Consumer Module Standard рядом с `common-assembly.md:88`. Из roadmap (`:926-943`) и quickstart (`:137`) на них ставятся ссылки.

- **N1. Namespace** — один или несколько ведущих целых сегментов id. Их выделяет admission-authority: конфиг Host для first-party, `NamespaceId` каталога XF для третьих сторон. Вхождение определяется только по границе сегмента: `id === ns || id.startsWith(ns + "/")`. Побеждает самое длинное назначение, как в XF ADR-0004. Сырой `startsWith` запрещён: грант `agent` не покрывает `agent-runtime/x`.
- **N2. `moduleId` и `implementationId`** лежат в namespace принципала, который поставляет код. Альтернативные реализации модуля выпускает только владелец его namespace. Третья сторона делает свой модуль в своём namespace.
- **N3. `capabilityId`** лежит в namespace владельца контракта, то есть потребителя или продукта, который определяет порт, а не провайдера. Поставка чужой capability требует отдельного точного гранта `id + token`. Контракт (id, токен, тип порта) живёт в одном типизированном источнике у владельца. Отдельный contract-пакет нужен только тогда, когда этого требует направление зависимостей: плагин не должен импортировать продукт. По умолчанию capability private: нет экспорта и нет внешнего гранта. Public — это экспортированный контракт плюс грант. Поля `visibility` в Core нет.
- **N4. Namespace называет стабильного семантического владельца** — продукт или bounded context, а не команду, репозиторий, пакет или каталог. Для first-party это имя продукта, которое на момент выделения совпадает с именем репозитория в организации. Уникальность гарантирует GitHub, реестр не нужен. При переименовании репозитория id не меняются. Внутри namespace структура такая: `<продукт>/<контекст>/<имя>`.
- **N5. Id неизменяемы и не переиспользуются.** Breaking-контракт получает новый `capabilityId`, по соглашению с суффиксом `/v2`, как в Go. Переименование создаёт новую identity. В MVP оно делается одним PR, потому что id уже живут в одном typed source. После персистентного или стороннего использования нужен новый id и миграция через полные профили (`roadmap:898-922`), а старый id становится tombstone у admission-authority. Алиасов и override по id в Core и Assembly нет.
- **N6. `owner`** — только навигационная метка. Host никогда не использует его для грантов.

В GM меняется только документация: нового кода, диагностик и поколения нет. Проверка на реальном потребителе идёт в той же поставке: AR переименовывает `ordinary/*` в `agent-runtime/ordinary/*` (два файла и тестовые фикстуры). modularity-host-TEST уже соответствует N1–N3 и служит отклоняющим тестом.

Соглашение для токенов — рекомендация, не правило: `<capabilityId>/v<N>`, по одному токену на capability, как в GM self и Host-TEST. Общий токен на восемь capability в AR не даёт отслеживать версию каждого контракта.

## 5. Что сейчас, что потом

**Сейчас.** Позже это обойдётся дорого, потому что id запекаются в сотни деклараций, профили, digest планов и данные Host. Нужно записать N1–N5, переименовать id в AR, пока там 16 деклараций, и закрепить правило «capability принадлежит владельцу порта».

**Шов, который нужно оставить:** семантика вхождения в namespace (N1) и разделение «декларация заявляет, Host выдаёт». Параметр namespace в API Core не нужен, резервировать в коде нечего.

**Можно безопасно отложить:**

| Что | Триггер | Почему безопасно |
| --- | --- | --- |
| `isWithinNamespace` в core (~20 src, ~40 tests) | Первый Host вне TEST или адаптер XF с namespace-грантами | Сейчас реализация одна, она в TEST и корректна |
| Удаление `owner.authority` | Ближайшее successor-изменение схемы по любой причине или вход в Phase 7 | Поле не входит ни в план, ни в id; удаление механическое |
| Dev-time проверка «все id репозитория в его namespace» | Модули второго репозитория попадают в одну композицию | До этого коллизии видны на ревью внутри одного репо |
| DNS-ids с точками | Не ожидается | Расширение грамматики аддитивно |
| Алиасы и редиректы | Никогда в Core; отображаемые имена живут в каталоге XF | XF ADR-0004 уже запрещает алиасы как identity |
| Подписи и доказательство publisher | Остаются в XF (ADR-0002, cosign) | Уже принадлежат XF |
| Identity экземпляров модуля | Реальная потребность в нескольких экземплярах в одном графе | Это отдельное поле профиля, а не сегменты id |

## 6. Риски

1. Соглашение без автоматической проверки дрейфует, и AR уже от него отошёл. Смягчение: правило в CMS, ревью и триггер для dev-time проверки. Остаточный риск средний.
2. Пространство первых сегментов плоское: сторонний каталог может выдать `agent-runtime` другому publisher. Защищают грант в каждом Host и fail-closed маршрутизация XF. Глобальной уникальности между независимыми федерациями нет, и так задумано.
3. Пока `owner.authority` не удалён, он остаётся обманчивым, и кто-то может начать ему доверять. Смягчение — N6 и уже существующие предупреждения.
4. Если Host пропустит admission, защиты нет. Для статической first-party композиции это приемлемо, для плагинов admission обязателен (`roadmap:941`).
5. Процесс поколений делает любой будущий фикс identity в Core дорогим. Это свойство процесса GM, а не задачи; при MVP-политике его стоит пересмотреть отдельно.
6. Не проверено, хранит ли AR id модулей в персистентных данных (аудит, сохранённые планы). Это нужно выяснить до переименования `ordinary/*`.
