<!-- cspell:disable -->

# Хендофф: observation, обычный .ts и точный E2E

Обновлено 2026-10-18 после перевода активных инструментов на обычный `.ts`,
двух волн ревью/исправлений GPT-6.1 xhigh и нового внешнего E2E.
Рабочий пакет находится в `packages/observation/src`: 18 TypeScript-файлов,
включая `createStore`, `watch`, `load` и testing entry. Пакет не опубликован.

- Реализация: [get-modular #195](https://github.com/agent-teams-ai/get-modular/pull/195).
- Точные архивы и внешний consumer: [modularity-host-test #20](https://github.com/agent-teams-ai/modularity-host-test/pull/20).
- Общая политика: [.github #368](https://github.com/agent-teams-ai/.github/pull/368).
- Инструкции инфраструктуры: [platform-infra #484](https://github.com/777genius/platform-infra/pull/484).

Полная запись: [implementation-port.md](implementation-port.md).
План: [implementation-plan.md](implementation-plan.md).
Последнее ревью: [ordinary-ts-review.json](implementation-evidence/ordinary-ts-review.json).
Предыдущие исследования и результаты остаются в git без переписывания.

## Точные субъекты

| Что | Идентичность |
| --- | --- |
| Интегрированный main | `47a02a90a06f121c78086c7c5f72b085c42ee7ea`; при повторной проверке не изменился |
| Проверенный исполняемый код и инструменты | `5102438e70a618a342c93fe003bcfc3f057a1041`, после `ae5036e` |
| Последнее изменение production runtime | `737d842ca7426d6fbc8d1179fb3bca96b1030b3a`; перевод расширений не меняет JS и декларации |
| Подготовленный релиз | `34bb4fae3d6a613f13cdbab9ca50b0bfdf4054e7`, `release/observation-0-1-candidate` |
| Выполненный внешний consumer | `a145931ec4522d3a4a5cd1e06a342814a876801e`, входной коммит создан до запуска |
| Внешний evidence-only successor | `5de8e039cbde6c4277e6220073ab7b57d3718078`; независимое ревью точных входов и результатов без замечаний |
| Внешняя запись | `observation-0.1.0/evidence/accepted-a145931/RECORD.md` и `result.json` в PR #20 |
| Общая политика и guard | `3d0b2be14b1eda315dc71a1bcdfbf1885445cf86`, PR #368 |
| Политика platform-infra | `5589ef8cb20ba620b7e0b071c629d22c5b03fca9`, PR #484 |

## Что исправлено после замечания про .mts

Пять активных файлов Get Modular и новый guard с тестом в центральном
`.github` используют обычный `.ts`. Обновлены импорты, команды, test discovery,
четыре строгих проекта и привязки required identities. ESM задаётся через
`type: module`, в том числе в одноразовых тестовых пакетах.

Три независимых критика получили наше видение и границы: явные typed ports,
один владелец изменяемого состояния, read-only facets, коалесцированный watch,
физически последовательный load/drain, эффекты и lifecycle под управлением Host.
Первый круг нашёл два конкретных P2; оба исправлены и независимо перепроверены:

1. Четыре драйвера создавались из строк и не получали реальный strict typecheck.
   Теперь это отдельные `.ts`-исходники в двух существующих проектах; тесты
   копируют их байты и передают переменные данные отдельно. Исходный контрпример
   `const coverageControl: string = 42;` теперь выдаёт TS2322 для каждого файла.
2. Общий census принимал новый `.ts` helper/test вне точных входов компилятора.
   Существующий checker связывает каждый такой файл с strict inventory.
   Оба контрпримера отвергаются. Добавлены две проверки в существующую таблицу.

Повторные ревью закрыли оба замечания; новых actionable findings нет.
Политика platform/consumer прошла первый круг без замечаний. Нового фреймворка
проверок, ослабления оракулов или изменения public API нет.

## Реальные проверки

Четыре Get Modular strict-проекта проходят на Node 24.21.0 и 26.11.1 с TS7.0.2.
Повторная независимая проверка охватила два исправленных проекта и исходный
TS2322-контрпример для всех четырёх драйверов. Их runtime-проверки проходят.
Полная затронутая выборка harnesses: 21 pass и две прежние Foundation-блокировки
на каждом Node; блокировки не названы успехом.

В организации на точном pnpm 11.18.0 и обоих Node проходят strict TS7, 16
инертных guard-контролей, 44 focused scope-контроля и lint по 32 файлам.
Полная scope-выборка: 44 pass и две Foundation-блокировки на каждом Node.

Новый внешний consumer установлен заново offline с frozen lockfile,
строгими engines и peers. Все десять этапов существующего runner прошли:
TS7 NodeNext/Bundler с `skipLibCheck: false`, emission, по пять runtime-тестов
и 33 writer-задачи на каждом Node, один smoke с 11 точными baseline/injection
строками. Все closes завершены и settled, без долгов. Сохранены 176 installed
file hashes, 78 writer input hashes, 25 source/config hashes и исходные оракулы.

Новый observation SHA-256:
`a0685247e9e00ec02c2abaeab1d4aceb2041468e5317d8bf5e786edf99ec02e5`.
В архиве изменён только `package.json`: test glob `.mts` → `.ts`.
Остальные четыре pinned архива прежние. Для comparison pack conformance
применено только уже принятое исключение порядка peer-ключей; проверенным
субъектом остаются исходные pinned байты. `release:version` не повторялся.
Все три предыдущие записи `accepted-972dc2b`, `accepted-dbb708e` и
`accepted-4d10a1f` сохранены побайтно.

Предыдущий CI на `e5999805`, [run 39122863587](https://github.com/agent-teams-ai/get-modular/actions/runs/39122863587),
прошёл все шесть Core, Assembly и Observation lanes: три OS × два Node.
В каждом Observation lane прошли 157 runtime-тестов без skips, 18 мутаций,
33 writer outcomes и packed check. Windows занял 7:54 / 8:20 при цели 13 минут.
Новый CI после перевода на `.ts` проверяется отдельно на точном опубликованном
head PR #195; эта запись до push не предвосхищает его результат.

## Где действует правило и что остаётся

Локальные AGENTS и маршруты Claude/Copilot задают обычный `.ts` для нового
поддерживаемого JavaScript-runtime кода, тестов и helpers, TS7.0.2+ и фактический
strict typecheck. В platform-infra правило полное локально даже до слияния
центрального PR. Наличие PR не означает, что правило уже находится в main,
автоматически наследуется другими репозиториями или установлено на live hosts.

Generated package JS, неизменяемые архивы и конкретные semantic/host fixtures
сохраняют необходимый формат. В get-modular остались четыре старых lifecycle
qualification `.mts`, не вызываемых текущими командами и ссылающихся на
отсутствующие проекты и старые компиляторы; их не возобновлять и не объявлять
заново frozen. В центральном репозитории также отдельно описаны шесть прежних
authority/qualification `.mts` и оставшаяся legacy JavaScript coverage.
Массовая миграция этих границ не входит в текущую правку.

## Обязательные ограничения

- Foundation/API Extractor содержит TS5.9.3. Текущие metadata-only guards
  останавливают его до инициализации. Нужна поддерживаемая upstream-миграция
  и квалификация provenance; overrides, запуск старого TS и пропуски запрещены.
  [Исследование зависимости](typescript-toolchain-blocker.md).
- У центрального PR #368 на head `3d0b2be` четыре required contexts проходят.
  `check` блокируется TS5.9.3, а `docs-source-successor-v1` требует отдельного
  допуска изменения защищённого `scripts/check-quality-scope.mjs`.
  Эти реальные причины перепроверены по новым CI-логам.
- ADR-0034 / #154 и план #185 остаются открытыми. Их присутствие в рабочей
  ветке не заменяет main-admission.
- Полные/fast/changed/SDK-growth gates обязательны после upstream-исправления.
  Frozen SDK-growth CMS JSON, принятые ADR и опубликованные API baselines
  не менять ради зелёного результата.
- Merge и npm publication не выполнены. Passing package/consumer tests
  не дают автоматического допуска к релизу.

Игнорируется только Codex Review по инструкции владельца. Следующие субагенты —
GPT-6.1 xhigh. Рабочая 0.1.0 реализует наблюдение состояния и явные command-порты;
отдельный durable event bus не входит в принятый план.
