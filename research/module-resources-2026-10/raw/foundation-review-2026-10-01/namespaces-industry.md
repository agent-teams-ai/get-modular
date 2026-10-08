# Пространства имён и владение идентичностями: индустриальный синтез

Дата: 2026-10-01. База: get-modular `9c722ce`, agent-runtime `origin/main` `b0bcb265`.
Пометки: **[факт]** проверено по файлу или источнику, **[предложение]** моё решение, «не проверено» прямо так и написано.

## 1. Текущее состояние

**GM [факт]:**
- Грамматика `portableId`: `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:/[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$`, 3-128 байт, только ASCII, минимум 2 сегмента. Она общая для `moduleId`, `implementationId`, `capabilityId`, `profileId` и token. `owner.authority` и `owner.path` построены на `localToken` без `/` (`architecture/contracts/v1/composition.schema.json:12-53`, ADR-0004:28-35). Unicode-омоглифы исключены грамматикой.
- `owner` описан как «navigation authority and path» (ADR-0004:46). Центральный реестр ID отвергнут (ADR-0004:159-161, ADR-0006:165-167).
- Core проверяет только синтаксис (`identity.invalid`) и дубликаты внутри одного вызова. Это `declaration.duplicate-implementation` по `implementationId` (`composition-semantics/declaration-census.ts:44-61`), дубли capability и slot внутри декларации и `profile.duplicate-selection`. Одинаковый `moduleId` у разных авторов считается легальной альтернативой. Связь префикса ID с `owner.authority` нигде не проверяется.
- Каталог диагностик закрыт. Новый код требует successor-схемы, каталога, контракта, снапшотов, чекера и ledger (`current-contract.md:442-446`, ADR-0007:122-131, ADR-0021: 33 кода).
- Пробел от 2026-09-04 закрыт частично и только в документах (commit `2189b0a`). В roadmap (`mvp-implementation-roadmap.md:926-943`) записано: Core проверяет синтаксис и коллизии, а гранты на namespace и provision - политика Host/EF, «not inferred from matching string prefixes», «Core diagnostics are not an authorization fallback». CMS требует отвергать весь граф при namespace mismatch до импорта (`common-assembly.md:107-109`). Исполняемой проверки и конвенции формата нет ни в GM, ни у потребителей.
- EF ADR-0004:38-44 разделяет `PublisherId`, `NamespaceId` и `ExtensionId`. Tombstone-записи не переиспользуются, передача namespace меняет stewardship, но не identity, а ключи подписи - это credentials, а не identity. EF `extension-model.md:30-34` запрещает выводить отображение в `ImplementationId` из равенства строк. Формата `NamespaceId` в коде EF пока нет.

**Потребители [факт], три разные конвенции:**

| Где | moduleId / implementationId | capabilityId / token | owner.authority |
|---|---|---|---|
| GM self (`compiler-facade/declaration.ts:6-11`, `canonicalization/identity.ts:1-3`) | `get-modular/compiler-facade` / `…/default` | `get-modular/canonical-bytes` / `…/v1` | `get-modular`, совпадает с префиксом |
| AR setup (`runtime-setup-assembly.ts:34,47-114`) | `agent-runtime/setup-security`, implementationId тот же | `agent-runtime/*`, один token `agent-runtime/setup-v1` на 8 capability | `agent-teams`, не совпадает с префиксом |
| AR ordinary (`ordinary-runtime-assembly.ts:7,22-37`) | `ordinary/store` и т. п. | `ordinary/*`, token `agent-runtime/ordinary-v1` | `agent-teams` |
| modularity-host-TEST (`src/fixtures/graph.ts:8-29`) | `test/provider` / `test/provider/a` | `test/resource/read`, `…/v1` | `fixture-provider` и т. п. |

В orchestrator и platform деклараций GM нет (`git grep` по `origin/main`).

**Эксперимент [факт]** (`tsc7` на исходниках Assembly `9c722ce`, только scratchpad): Host объединяет две карты контрактов с одинаковым `capabilityId`. TypeScript молча строит пересечение типов. Ошибка появляется только в `bindFactory` провайдера и выглядит как структурное несовпадение, коллизия в ней не названа. Если формы совпадают, конфликт не виден вовсе (это следствие, отдельно не прогонялось).

## 2. Индустрия

| Система | Формат и владение | Чем доказывается | Урок |
|---|---|---|---|
| Java / JPMS ([JLS 6.1](https://docs.oracle.com/javase/specs/jls/se21/html/jls-6.html#jls-6.1), [Configuration](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/module/Configuration.html)) | reverse-DNS: «reverse this name… use this as a prefix» | только конвенция | разрешение модулей падает, если «Two or more modules… export the same package»: коллизия fail-closed, но без доказательства владения |
| OSGi ([Core 8, 3.3](https://docs.osgi.org/specification/osgi.core/8.0.0/framework.module.html)) | у capability-namespaces свои имена, «OSGi namespaces start with the reserved `osgi.` prefix» | реестр namespace (рекомендация) | имена контрактов отделены от имён бандлов, префикс зарезервирован |
| Maven Central ([namespace](https://central.sonatype.org/register/namespace/)) | groupId = обратный домен | DNS TXT или репозиторий `io.github.*` | MavenGate: 6 170 из 33 938 доменов (около 18 %) истекли или продавались ([THN](https://thehackernews.com/2024/01/hackers-hijack-popular-java-and-android.html), вторичный источник). Доказательство внешним активом со временем протухает |
| npm ([scopes](https://docs.npmjs.com/about-scopes), [moniker](https://blog.npmjs.org/post/168978377570/new-package-moniker-rules.html)) | `@scope/name`, scope необязателен | аккаунт реестра | dependency confusion: более 35 компаний ([CSD](https://www.cybersecuritydive.com/news/dependency-confusion-supply-chain-attack-open-source-security/594838/)); правило «differ… in punctuation only» против тайпсквоттинга. В JSR «all packages are contained within a scope» ([JSR](https://jsr.io/docs/scopes)) |
| Go ([ref/mod](https://go.dev/ref/mod)) | путь модуля = путь репозитория | контроль URL | «same import path → backwards compatible», иначе `/v2`; `Deprecated:` и `retract` вместо удаления |
| VS Code ([publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)) | `${publisher}.${name}` | DNS TXT для verified publisher | удалённое имя «permanently reserved… even by the original publisher» |
| Kubernetes ([KEP PR 1111](https://github.com/kubernetes/enhancements/pull/1111)) | API group = домен | API server | `*.k8s.io` и `*.kubernetes.io` требуют аннотацию `api-approved.kubernetes.io`: резерв обеспечивает admission, а не конвенция |
| Terraform ([requirements](https://developer.hashicorp.com/terraform/language/providers/requirements), [FAQ](https://developer.hashicorp.com/terraform/registry/faq)) | `hostname/namespace/type` | организация на GitHub | неявный `hashicorp/` пришлось чинить при миграции; после переименования «someone else claims your old… name… 'capture'». Редирект-алиасы перехватываются |
| Backstage ([extensions](https://backstage.io/docs/frontend-system/architecture/extensions), [extension points](https://backstage.io/docs/backend-system/architecture/extension-points/)) | `[kind:][namespace/][name]`, namespace = pluginId | отсутствует | один ID на приложение («error or… override»); extension point принадлежит плагину-потребителю и доступен только его модулям, контракт лежит в отдельном library-пакете |
| Docker ([naming](https://docs.docker.com/get-started/docker-concepts/building-images/build-tag-and-publish-an-image/)) | `[host/]namespace/repo` | аккаунт | неявные `docker.io` и `library` скрывают происхождение |
| Chrome ([key](https://developer.chrome.com/docs/extensions/reference/manifest/key)) | ID закреплён ключом из `key` | криптография | самоудостоверяющий ID нечитаем, потеря ключа = потеря ID (не проверено) |
| Rust ([RFC 3243](https://rust-lang.github.io/rfcs/3243-packages-as-optional-namespaces.html), [goals 2026](https://goals.rust-lang.org/2026/open-namespaces.html)) | плоское имя, затем `foo::bar` | «Only the owners of `foo` may create `foo::bar`» | достраивание namespace к живому плоскому реестру идёт годами, Cargo «partially implemented» |
| IntelliJ, Android ([id](https://plugins.jetbrains.com/docs/intellij/plugin-configuration-file.html), [appId](https://developer.android.com/build/configure-app-module)) | reverse-DNS | маркетплейс | «cannot be changed later»; Play считает новый ID новым приложением |
| RFC 6648 ([txt](https://www.rfc-editor.org/rfc/rfc6648)) | префикс `X-` | - | статус в имени «leak[s]», старое имя живёт вечно |

**Синтез.** Лучшее в индустрии - двухуровневое делегирование: реестр ведёт только namespace, а всё под префиксом остаётся свободным у его владельца. Доказательство владения находится снаружи системы имён, а резерв проверяется на admission. Типовые ошибки: плоское пространство имён, неявный namespace по умолчанию, fallback между источниками, алиасы и редиректы, повторное использование имён, статус внутри имени.

## 3. Варианты

**Общие правила формата для B и C [предложение], грамматика не меняется:**
- Namespace = первый сегмент. Владелец namespace владеет всеми ID под ним. Namespace - это продукт или репозиторий либо допущенный издатель, а не команда и не npm-пакет. Команды живут во втором сегменте и в CODEOWNERS.
- `implementationId = <ns реализатора>/<module>[/<variant>]`, `owner.authority ≡ namespace(implementationId)`, `owner.path` нужен для навигации.
- `moduleId = <ns владельца логического модуля>/…`. Чужой moduleId (замена модуля продукта) реализуется только по гранту.
- `capabilityId = <ns владельца контракта>/…`. По умолчанию контракт принадлежит потребителю (порт по DIP). Если владельцев два и больше, контракт выносится в отдельный модуль или пакет с `capabilityId`, token, типом `Value` и без реализации (как library-пакеты Backstage). Token у каждой capability свой; несовместимое изменение означает новый `capabilityId` (правило Go).
- Зарезервированы `get-modular`, а также `test` и `example` (только фикстуры, аналог [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606)).
- Видимость в ID не кодируется: private означает, что контракт не экспортирован и не выдан чужим namespace.
- Алиасов нет. Переименование = новый ID, миграция полными профилями и Host-карта для сохранённых ссылок. Старый ID становится tombstone навсегда. Переезд репозитория или пакета ID не меняет.
- Экземпляры модуля не получают `moduleId`: их имена - runtime-метки scope Host.

**A. Только конвенция в CMS.** Правила выше без исполняемой проверки, AR правится вручную.
Надёжность 5, уверенность 8, сложность 1. LOC: src 0, tests 0, docs ~80, AR ~40.
Против: конвенция уже разошлась в трёх местах при одном реальном потребителе.

**B. Namespace в wire-формате и в Core.** `owner.authority` переименовывается в `namespace`, профиль получает `grants`, Core выдаёт `identity.namespace-mismatch` и `profile.namespace-not-granted`, гранты входят в digest.
Плюс: одна точка проверки и аудит через digest.
Минусы: нужно generation 3. Core начинает участвовать в авторизации вопреки GM-REQ-013 и roadmap:941-943. Источником доказательства всё равно остаётся Host.
Надёжность 6, уверенность 7 (что вариант не окупается), сложность 8. LOC: src ~250, tests ~400, артефакты поколения ~2000+ (оценка по аналогии с ADR-0021, не проверено), docs ~400.

**C. Делегирование и чистая проверка префиксов в GM.** Правила выше плюс функция в Core, которую `compileComposition` никогда не вызывает:

```ts
export type NamespacePolicy = {
  readonly owned: readonly string[];            // выдано проверенному источнику
  readonly foreign: "allow" | {                 // явный выбор, умолчания fail-open нет
    readonly implements: readonly string[];     // чужие moduleId
    readonly provides: readonly string[];       // чужие capabilityId
    readonly consumes: readonly string[];
  };
  readonly retired: readonly string[];
};
export type NamespaceFinding = {
  readonly code: "not-owned" | "authority-mismatch" | "foreign-not-granted" | "retired";
  readonly implementationId: string;
  readonly field: "implementationId" | "moduleId" | "owner" | "provides" | "slots";
  readonly value: string;
};
export function checkNamespaces(
  declarations: readonly ModuleDeclaration[], policy: NamespacePolicy,
): readonly NamespaceFinding[];   // детерминированный порядок, без I/O и реестра
```

Findings не входят в каталог диагностик, поэтому новое поколение не нужно; изменение = обычный minor в 0.x.
Владение доказывается в трёх местах:
- в репозитории - правом записи и CODEOWNERS, а `namespaces` указаны в consumer profile;
- между репозиториями орга - таблицей `namespace → репозиторий, steward, retired`. Она ведётся на уровне namespace, а не отдельных ID, поэтому это не отвергнутый ADR-0004 реестр;
- для третьих сторон - через EF: верификация издателя (DNS TXT или GitHub org), назначение namespace по EF ADR-0004 и подпись. Продуктовый адаптер собирает из этого `NamespacePolicy`.

Надёжность 8, уверенность 7, сложность 3. LOC: src ~80, tests ~150, docs ~150, AR ~60, TEST ~20.

## 4. Рекомендация: C

**Что меняется в GM:**
1. **ADR-0030 (proposed):** правила формата, `owner.authority ≡ namespace(implementationId)`, владелец capability = владелец контракта, резерв namespace, запрет алиасов, tombstone. В ADR фиксируется, что Core никогда не выдаёт диагностики владения: helper - это механизм над политикой Host, а не admission.
2. **CMS** (`common-assembly.md`): раздел «Identity namespaces». В шаблон consumer profile добавляются `namespaces` и `retired`, раздел roadmap 898-943 обновляется. Пины AR и TEST обновляются по правилу AGENTS.md.
3. **Core:** feature-local helper без узла графа, экспорт из root, новый API baseline и changeset minor. Схема, каталог и поколения не меняются.
4. **Assembly, resources, lifecycle-kernel** не меняются.
5. **Потребители:**
   - AR: `ordinary/*` → `agent-runtime/…`, authority `agent-runtime`, отдельный token у каждой capability, вызов `checkNamespaces` в существующем `scripts/architecture/check-get-modular-adoption.mjs`.
   - TEST: authority `test` и rejecting-кейсы на чужой namespace, mismatch, retired и чужой ID без гранта.
   - EF: `NamespaceId` должен быть совместим с сегментом GM либо задан явной инъективной таблицей.

**Оценка shared-first.** Владелец helper - Core, потому что ему принадлежит грамматика. Зависимости идут от Host и EF к Core. Граница: без I/O, без политики по умолчанию, без реестра. Цена - одна функция и два типа в API Core.

## 5. Сейчас, позже и швы

**Сейчас:** ADR, CMS, helper, миграция AR и TEST. Деклараций в AR около 20, дешевле переименовать уже не будет (уроки Android и IntelliJ).

**Позже, без риска:**
- org-таблица namespace - когда второй репозиторий начнёт писать декларации;
- проверка похожих имён в стиле npm moniker - когда namespace начнут выдаваться посторонним;
- верификация издателя и подписи - в EF;
- карты миграции у Host - при первом реальном переименовании.

**Швы, которые нужно оставить сейчас:**
- семантика «первый сегмент = namespace» и привязка authority;
- форма `NamespacePolicy.foreign`, готовая к грантам EF;
- поля `namespaces` и `retired` в consumer profile.

Кодов Core для владения не будет никогда, при любом росте.

## 6. Риски

- Переименование в AR меняет tie-break `dependencyOrder` по `implementationId` (ADR-0006:109). Из-за этого может измениться порядок сборки и LIFO-очистки независимых модулей, а скрытые зависимости могут всплыть. Нужен полный прогон AR.
- Helper в Core размывает границу Core/Host. Защита: формулировка ADR и то, что compile никогда его не вызывает.
- Fail-closed на дубликатах превращает сквоттинг в DoS, если Host компилирует нефильтрованные сторонние декларации. Фильтрация обязательна до compile.
- Плоский уровень namespace переносит сквоттинг на уровень выше (как у Packagist). Это закрывается таблицей и EF.
- Совпадение `owner.authority` ничего не доказывает. Без `owned` от проверенного принципала оно создаёт ложное чувство безопасности.
- Коллизии capability на уровне типов TypeScript видны поздно и неочевидно (см. эксперимент). Против этого работают контракт-пакеты.
- Коды findings становятся новым публичным контрактом и меняются только через changelog.
