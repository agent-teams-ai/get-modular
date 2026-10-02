# Пространства имён и владение идентичностями: стресс-тест на рост и злоупотребления

Дата 2026-10-01. Проверенные ревизии: get-modular `9c722ce`, agent-runtime `origin/main` `b0bcb265`,
modularity-host-TEST `origin/main` `fcc10b2`, extension-foundation (EF) `origin/main` `d375d2c`.
Пути GM указаны относительно `get-modular/`.

## 1. Как устроено сейчас (проверенные факты)

**Core**

- Portable id состоит минимум из двух сегментов `[a-z][a-z0-9-]` через `/`, только ASCII, до 128 байт
  (`architecture/contracts/v1/composition.schema.json:16`, `packages/core/src/features/input-admission/identity-format.ts:5-24`,
  `resource-limits.ts:10`). Unicode-гомоглифы отсекаются уже грамматикой, и у любой id есть первый сегмент.
- У `owner.authority` проверяется только форма (`document-shape.ts:74-75`). В план поле не попадает
  (`authoring/wire-types.ts:48-69`) и с префиксами id никак не связано. ADR-0004:46 называет его «navigation authority».
- Коллизии видны только внутри одного вызова. Повтор `implementationId` даёт `declaration.duplicate-implementation`,
  и отклоняется весь граф (`composition-semantics/declaration-census.ts:56-62,100`). Один `capabilityId` у разных
  реализаций допустим: провайдера выбирает профиль по точному `implementationId` (`binding-record.ts:34-60`;
  GM-REQ-004, `docs/requirements/module-system-v1.md:41-43`).
- Разделение уже принято. Core проверяет синтаксис и коллизии. Host или EF до компиляции проверяют гранты
  «выделить namespace» и «предоставлять capability» (`docs/architecture/mvp-implementation-roadmap.md:926-943`).
  Пробел от 2026-09-04 (захват namespace через `owner.authority`) закрыт именно этим разделением, а не диагностикой
  (`docs/qualification/growth-and-release-readiness-review.md:38`).
- Формат id задан только примерами: `example/greeting`, `example/greeting/default`, token `example/greeting/v1`
  (`packages/assembly/examples/basic-host.mjs:14-27`). CMS требует лишь хранить ID и токены в одном typed source
  (`docs/architecture/common-assembly.md:88`) и формата не задаёт.
- Новый код диагностики стоит дорого. Поколение 2 закреплено ledger'ом на 57 артефактов
  (`architecture/authority/diagnostic-generation-two-ledger.json`). Только подготовительные коммиты `7ad0eff` и
  `bdeabe9` заняли 18 и 19 файлов, +948 и +1030 строк.

**Реальный потребитель: agent-runtime, единственный production-пользователь GM.** Файлы лежат в
`packages/apps/embedded-runtime/src/`.

- В одном графе три разных «корня»: `agent-runtime/...` (`composition/runtime-setup-assembly.ts:47`),
  `ordinary/...` (`features/ordinary-session-runtime/composition/ordinary-runtime-assembly.ts:23-30`) и
  `owner.authority: "agent-teams"` (`runtime-setup-assembly.ts:48`). Ни один не совпадает с другим.
- Один token покрывает 8 capability (`runtime-setup-assembly.ts:34`) и ещё один покрывает 10
  (`ordinary-runtime-assembly.ts:7`).
- `agent-runtime/runtime-host` называет две разные декларации: базовую (`runtime-setup-assembly.ts:101-103`) и
  вариант с добавочным слотом (`:134`).

**TEST Host и EF**

- `modularity-host-TEST/src/admission/policy.ts:81-100` реализует три гранта: namespace с проверкой границы
  сегмента (`:27-28`), provision и receive. В тестах 9 регрессий, 6 из них про identity: метку владельца приняли за
  аутентификацию, дубли потерялись при индексации, сработал префикс-двойник, прошёл поддельный субъект, provision
  прошёл без гранта (`tests/admission/policy.test.mjs:42,49,66,75,84,92`). Два субъекта с одним namespace при этом
  допускаются (`src/inventory/trusted.ts:64`).
- Роадмап перечисляет два гранта, а quickstart требует ещё и права на получение capability
  (`docs/guides/consumer-quickstart.md:161,187`). Каноничные тексты расходятся.
- EF ADR-0004:28-29,41-42 задаёт маршрутизацию по самому длинному namespace и отказ при конфликте равной
  специфичности. Tombstone не переиспользуются, передача namespace меняет stewardship, но не identity. Пример id в EF
  `agent-teams.orchestrator/work-placement-proposal` (`module-graph.md:98`) невалиден в грамматике GM: в нём точка.

## 2. Сценарии роста и злоупотреблений

| # | Сценарий (горизонт 3 года) | Что делает текущий или наивный дизайн | Где ломается |
|---|---|---|---|
| S1 | 5 репозиториев, интегратор собирает их библиотеки в один граф | Два репо независимо назвали модуль `ordinary/store` | Ошибка всплывает только у интегратора, отклоняется весь граф (`declaration-census.ts:56-62`). Имена ему не принадлежат, нужен релиз чужого пакета |
| S2 | Плагин повторяет `implementationId` встроенного модуля | Все декларации идут в общий вход Core | Любой плагин роняет весь Host (DoS). Правила «встроенный побеждает» или «последний установленный побеждает» повторяют source precedence из OpenClaw (`reference/get-modular-openclaw-20260912/research/lessons-and-antipatterns.md:144-153`) и тихо подменяют код |
| S3 | Плагин объявляет `provides: agent-runtime/codex-authorization` с верным токеном | Core его принимает: capability намеренно не привязан к владельцу (`roadmap:936-938`) | Защищает только provision-grant у Host. Плагин со слотом `ordinary/register-secrets` получит функцию регистрации секретов, если Host сам связывает слоты плагинов: в каноничном списке роадмапа receive-гранта нет |
| S4 | Dependency confusion | GM-REQ-004 запрещает выбирать провайдера по capability только «when more than one implementation is eligible» | В опциональном слоте без встроенного провайдера плагин оказывается единственным кандидатом, и по букве требования его можно связать автоматически. Birsan нашёл такую уязвимость в 35 организациях |
| S5 | Опечатка-двойник `agent-runtlme/...` | Грамматика ASCII убирает гомоглифы, но не опечатки | Пользователь выбирает по отображаемому имени. В VS Code подделка `pretier-vscode` от `espenp` набрала больше 1000 установок за 48 часов |
| S6 | Реорганизация 20 команд, переезд модулей между репо | Корнем служит команда, репо или домен | Каждая реорганизация превращается в переименование. В Go смена org на GitHub ломает всех потребителей, у logrus было `Sirupsen`→`sirupsen`, в Maven истекли 18,18% доменов groupId (MavenGate) |
| S7 | Переименовать или разделить capability | Один token на 8 capability | Одну capability нельзя версионировать без массового bump. Путь dual-provide (`roadmap:905-917`) требует отдельного токена на каждую capability |
| S8 | Каталог, inventory или сохранённое состояние, ключ которых `implementationId` | Одна id описывает две формы (`runtime-setup-assembly.ts:101,134`) | Core этого не видит, потому что проверяет один вызов. Всё, что живёт дольше вызова, получает неоднозначную id |

## 3. Три варианта

**A. Правила в CMS, корни в профиле потребителя, три гранта у Host. Core не меняется.**
Формат: `moduleId = <root>/<path>`, `implementationId = <moduleId>/<variant>`,
`capabilityId = <root владельца контракта>/<path>`, `token = <capabilityId>/v<N>`. Корень обозначает продукт или
библиотеку, а не команду, репозиторий или домен. Как проверять: тест потребителя (корень, префикс токена, одна id
на одно содержимое) и исключительные гранты у Host.
Надёжность 8, уверенность 8, сложность 3. Объём: в src GM 0 строк; тест потребителя около 40; правка TEST около 20;
документация около 120.

**B. Core проверяет, что `owner.authority` совпадает с корнем, плюс новый код `identity.namespace-mismatch` и поле
`visibility` в `provides`.**
Злоумышленник сам пишет и authority, и id, поэтому проверка ловит только небрежность. В Kubernetes KEP-2337 про
аналогичную аннотацию сказано прямо: «doesn't actively prevent bad actors… but it does prevent accidentally claiming
an inappropriate name». Visibility по корню запрещает законный случай, когда сторонний модуль реализует продуктовую
capability. Вдобавок политика доверия попадает в нейтральный Core (ADR-0001).
Надёжность 5, уверенность 8, сложность 7. Объём: src 60–120; tests и evidence 1000–2000 (поколение 3);
документация 200–400 (ADR-преемник).

**C. Подписанные идентичности: декларация несёт attestation издателя, Core или Assembly её проверяет.**
Повторяет EF (OCI и cosign в ADR-0002, гранты в ADR-0008), втягивает криптографию и корни доверия в Core и без
реестра ключей не работает.
Надёжность 9 в теории, уверенность 4, сложность 9. Объём: src 800–1500; tests от 1000; документация от 400.

## 4. Рекомендация: вариант A

Изменения в GM:

1. **В CMS (`common-assembly.md`) появляется раздел «Identity and namespaces», около 70 строк:**
   - формат из варианта A. `owner.authority` равен корню и служит только навигации, а не доказательством владения;
   - один `implementationId` означает одно содержимое декларации, другой набор слотов требует другой id;
   - capability принадлежит владельцу контракта (порта), а не провайдеру. ID, token и тип определяются один раз в
     contract-модуле владельца. Отдельный пакет нужен только для Published Language (EF ADR-0012:109-112);
   - token `/vN` повышается только при атомарной смене внутри одного репо. Если ломающая смена задевает несколько
     репо, нужна новая `capabilityId` и dual-provide, потому что повтор одной id в декларации запрещён
     (`declaration-census.ts:72-78`);
   - public против private: публичная поверхность задаётся явным allowlist Host'а, всё остальное приватно по
     умолчанию. Статус не кодируется в имени (`internal/`, `x-`): RFC 6648 показал, что такие имена утекают в
     защищённое пространство и потом требуют вечной миграции;
   - переименование создаёт новую identity и проходит через профиль, без алиасов в Core. Старая id становится
     tombstone и не переиспользуется;
   - id сессий и тенантов в `moduleId` не попадают: это имена resource scope'ов, а не узлы графа.
2. **Роадмап, строки 926-943.** Три гранта: allocate, provide и receive. Гранты исключительные: побеждает самый
   длинный префикс, делегировать можно подпрефикс (как в NuGet `Microsoft.AspNet.*`), при равной специфичности отказ.
   Автосвязывание допускается только среди кандидатов с грантами, даже если кандидат один. Requirements закреплены
   по digest (`current-contract.md:475`), поэтому лазейку GM-REQ-004 закрывает этот текст для Host, а не правка
   требования. Admission выполняется для каждого артефакта до того, как его декларации попадут во вход Core. Это
   закрывает S2.
3. **Core и каталог диагностик не меняются.** Отказы по namespace остаются кодами Host (`namespace`,
   `provision-grant`, как в TEST) и не требуют нового поколения диагностик GM.
4. **В той же поставке**, как требует правило workspace про CMS:
   - agent-runtime: `ordinary/*` становится `agent-runtime/ordinary/*`, у каждой capability свой token, у двух
     вариантов runtime-host разные id, тест на правила, поле `identityRoots` в профиле потребителя, затем
     обновляется pin CMS;
   - шаблон профиля (`docs/templates/consumer-module-profile.md`) получает поле `identityRoots`;
   - в TEST появляется отказ на перекрывающиеся гранты;
   - в EF исправляется пример в `module-graph.md:98`.

**Общий вариант (shared-first).** Узкий кандидат: чистая функция
`checkIdentityGrants(declarations, profile, grants) → refusals`. Владелец GM, потому что функция работает с
wire-форматом GM. Зависимости направлены Host/EF → checker → типы Core. Объём: src 150–250, tests и conformance
около 300, фикстурами станут 9 регрессий TEST. Плюс: Host'ам не придётся заново наступать на 6 уже найденных
ошибок. Минус: production-потребителя динамического admission пока нет, а модель грантов EF с ревизиями и поколениями
(ADR-0008:117-125) ещё не совпадает с моделью TEST. Начинать вместе с первым production dynamic Host, не раньше.

## 5. Что делать сейчас и что отложить

**Сейчас: пункты 1–4.** Сегодня переименование затрагивает около 15 деклараций в одном репозитории. Когда появятся
сторонние плагины, резерв задним числом уже не вытеснит тех, кто занял имя: NuGet прямо оставляет «previously
existing packages… unchanged».

**Можно отложить без риска переписывания:**

- центральный реестр корней в org-github, пока декларации не появятся во втором репозитории. До тех пор
  уникальность проверяется по полям `identityRoots` в профилях;
- общий checker, до первого production dynamic Host;
- модерацию похожих корней у плагинов: это задача каталога EF (ADR-0005);
- удаление `owner` из wire-схемы, только вместе со следующим преемником схемы.

**Шов, который нужно оставить сейчас:**

- корень всегда первый сегмент id (грамматика уже гарантирует минимум два сегмента);
- admission для каждого артефакта до входа в Core;
- поле `identityRoots` в профиле потребителя;
- семантика гранта `{subject, namespace, provides, receives}`, записанная в CMS.

## 6. Риски

- Пока правила не проверяет Core, новый репозиторий может их проигнорировать. Защищают тест потребителя и ревью
  профиля, остаточный риск средний.
- Исключительные гранты могут противоречить сценарию замены в TEST (`trusted.ts:57-67`), где два субъекта временно
  делят namespace. Нужно ли это пересечение самому сценарию, не проверено.
- Переименование в agent-runtime меняет plan digest и, видимо, сохранённые evidence с закреплёнными id. Сколько
  придётся перезахватывать, не проверено.
- Пока общий checker отложен, каждый Host пишет свою проверку. Если не выдержать триггер (первый production dynamic
  Host), ошибки из TEST повторятся.
- Как выдавать корни сторонним издателям (кому, на каком основании, что делать с похожими именами), ещё не
  спроектировано. Это задача EF.

## Источники

- Dependency confusion: <https://appleinsider.com/articles/21/02/10/researcher-breaches-apple-microsoft-and-others-with-installer-attack>
  («dependency confusion vulnerabilities inside 35 organizations»)
- Подделка расширения VS Code: <https://www.aquasec.com/blog/can-you-trust-your-vscode-extensions/>
- Kubernetes KEP-2337: <https://github.com/kubernetes/enhancements/blob/master/keps/sig-api-machinery/2337-k8s.io-group-protection/README.md>
- NuGet ID prefix reservation: <https://learn.microsoft.com/en-us/nuget/nuget-org/id-prefix-reservation>
- RFC 6648: <https://www.rfc-editor.org/rfc/rfc6648.html> («unstandardized parameters have a tendency to leak into the
  protected space»)
- logrus: <https://github.com/sirupsen/logrus> («The organization's name was changed to lower-case»)
- Go и пространства имён пакетных менеджеров: <https://nesbitt.io/2026/02/14/package-management-namespaces.html>
  («a GitHub org rename breaks every downstream consumer»)
- MavenGate: <https://oversecured.com/blog/introducing-mavengate-a-supply-chain-attack-method-for-java-and-android-applications>
  («Number of vulnerable: 6,170 or 18.18%»)
