<!-- cspell:disable -->

# Хендофф: рабочий observation, TypeScript и точный E2E

Обновлено 2026-10-18 после дополнительного ревью GPT-6.1 xhigh, первого CI
и исправлений трёх дефектов проверок. Рабочая реализация находится в
`packages/observation/src`: 18 TypeScript-файлов, включая `createStore`, `watch`,
`load` и testing entry. Пакет ещё не опубликован и не влит в main.

- Реализация: [get-modular #195](https://github.com/agent-teams-ai/get-modular/pull/195).
- Точные архивы и внешний consumer: [modularity-host-test #20](https://github.com/agent-teams-ai/modularity-host-test/pull/20).
- Общее правило TypeScript: [.github #368](https://github.com/agent-teams-ai/.github/pull/368).

Полная запись: [implementation-port.md](implementation-port.md).
План: [implementation-plan.md](implementation-plan.md).
История девяти критиков плана: [plan-review.md](plan-review.md).

## Точные текущие субъекты

| Что | Идентичность |
| --- | --- |
| Последний интегрированный main | `47a02a90a06f121c78086c7c5f72b085c42ee7ea` |
| Реализация и исправления CI | `f0deed0af09915717f93bda11c570a82f456907e`, ветка `feat/observation-0-1-e2e` |
| Последняя runtime-коррекция | `737d842ca7426d6fbc8d1179fb3bca96b1030b3a`; новые исправления не меняют исполняемые JS и публичные декларации |
| TypeScript-тест и Windows-путь | `4b3fa554cc4cb90ed6156dddfbc63b3e9dd7c84a`; меняются команды в manifest observation |
| Счётчики Core/Assembly | `c4db2cb22517034f39bc3dca2e4bf4965d219a5c`; две строки существующих фикстур |
| Подготовленный релиз | `106e3b0adca10e83d7a87ba57cb73baa9ee7ca6d`, `release/observation-0-1-candidate` |
| Выполненный внешний consumer | `4d10a1fb7041e44c61766400d6f1262e84c397e7` |
| Внешний evidence-only commit | `4b33245c2b454e44aac4ea6f3bb241c02f7b9c59` |
| Внешний результат | `observation-0.1.0/evidence/accepted-4d10a1f/RECORD.md` и `result.json` |
| Политика организации | `578f822b36f3623cfee3c29f90510afe7facb131`, `docs/typescript-first-agent-standard` |

## Исправления и проверки

1. Предыдущее runtime-ревью закрыло выход повторного Promise constructor getter
   из loader-контекста. Сам `await`, обработка ошибки, закрытие live token и
   публикация теперь входят в один контекст. 45 guard-тестов и 31 load-тест
   проходят на каждом Node, как и fallback/GC/P17/R7/R17/R23 контроли.
2. Все выявленные текущие Foundation CLI/Node runner/SDK границы защищены
   JSON-only preflight до инициализации TS5.9.3. Старые успешные Foundation логи
   остаются историческими и не считаются выполнением исключительно на TS7.
3. Первый CI проверил head `30ccdf4` через merge checkout `54d1aec`.
   Observation прошёл на Linux/macOS с Node 24 и 26; Node 24 package compatibility
   тоже прошёл. Все 38 failures классифицированы: 18 compiler-floor блокировок,
   6 Core и 6 Assembly счётчиков, 2 Windows пути, 6 корректно упавших агрегатов.
4. Windows использовал `RUNNER~1` для временного каталога, а native compiler
   возвращал canonical path. Тест теперь получает `realpath` до создания проекта
   и написан на `.mts`. Все строгие TS2636/TS2322 и 92 negative-проверки на resolver
   сохранены. Новый файл реально входит в strict typecheck и обычный test gate.
5. Текущие sealed fixtures теперь содержат 272 строки, исторический transport
   остаётся 282. Число packed runtime receipts соответствует одному уникальному
   TS7 compiler и двум resolver. Все четыре removal/no-op контроли сохранены.
   Затронутая выборка Core/Assembly: 24/24 на каждой Node 24.21.0 и 26.11.1.
6. Интегрированный observation typecheck и 157/157 runtime-тестов прошли на Node 26.
   Прежний полный пакетный гейт также прошёл 18 мутаций и 33 writer-задачи.
   Свежий CI после исправлений надо проверять по его реальному head и результатам;
   первые Linux/macOS результаты не подменяют новую Windows проверку.
7. Изменение команд теста меняет архив manifest, поэтому архивы пересобраны,
   consumer установлен заново offline и проверен без изменения оракулов:
   пять реальных runtime-предикатов и 33 writer-задачи на каждом Node,
   один smoke на 11 строках. Проверены 176 installed files, 78 writer inputs,
   25 source/config hashes, оба resolver TS7.0.2 и строгие peers/engines.

Все пять архивов сохраняют версии: Core/Assembly 0.6.0, resources 0.2.0,
conformance 0.4.0, observation 0.1.0. Новый observation SHA-256:
`2a72ad3080ecf72277ab707581633391b6af28cbed36a98f8eff2306563f5c91`.
Остальные четыре SHA прежние. Clean comparison pack допускает только уже
описанный в Phase 3c порядок peer-ключей conformance; публикационным субъектом
остаются сохранённые протестированные байты. Предыдущие `accepted-972dc2b`
и `accepted-dbb708e` не менялись. `release:version` повторно не запускался.

## TypeScript для новых изменений

Владелец требует TypeScript 7.0.2+ для нового поддерживаемого кода, тестов,
CLI и helpers. Правило записано в общем Engineering Quality Standard и
подключено к локальным AGENTS/Claude/Copilot routes. Node type stripping не
заменяет strict typecheck. Generated JS, неизменяемые архивы и конкретные
JS-semantic/host fixtures сохраняют нужный им формат. Две небольшие правки
старых JavaScript-счётчиков не объявляются миграцией их полных harnesses.

В `.github` правило и новый `.mts` guard независимо проверены: strict TS7,
16 инертных контролей на каждом Node, lint/census, 40 focused scope и 11 community
тестов проходят. Полный `pnpm check` честно блокируется Foundation 1.7.2,
который тоже подтягивает TS5.9.3. Общая политика в PR, её merge ещё не выполнен.
Фактический CI общей политики имеет ровно два failing required context:
`check` останавливает старый compiler, а `docs-source-successor-v1` отклоняет
изменение защищённого `scripts/check-quality-scope.mjs`. Второй блок требует
установленного отдельного допуска изменения checker; отключать или переписывать
защиту ради этого PR нельзя. Остальные четыре required context прошли.
Исторические красные transition jobs сейчас не являются required checks main.

## Оставшиеся ограничения

- Foundation/API Extractor требует upstream native compiler migration и явной
  квалификации нового provenance. Исторический SDK registry subject тоже должен
  пройти собственный floor. Нельзя выполнять TS5, делать overrides, пропуски,
  сужать gates или менять sealed baseline ради зелёного статуса.
  [Исследование зависимости](typescript-toolchain-blocker.md).
- ADR-0034 / #154 и план #185 ещё открыты. Их точные байты присутствуют в рабочей
  ветке, но main-admission это не заменяет.
- Полный и fast/changed/SDK-growth aggregate после upstream migration остаются
  обязательными. Таймаут workflow 15 минут и цель Windows observation 13 минут
  сохранены; результат нового CI и время брать только из реального запуска.
- Другие consumers отдельно принимают новый CMS pin. Frozen SDK-growth CMS
  JSON, принятые ADR и опубликованные API baselines не менялись.
- Merge и npm publication не выполнены; публикация остаётся шагом владельца.

Codex Review игнорируется по инструкции владельца. Остальные failures не скрывать.
Далее использовать субагентов GPT-6.1 xhigh. Реализованная 0.1.0 наблюдает состояние
с коалесцированием и использует явные command-порты; отдельный durable event bus
не входил в принятый план.

## Доступ и среда

GitHub CLI авторизован владельцем; PR и push доступны. Использованы Node 24.21.0
и 26.11.1, pnpm 11.20.0 (в центральном `.github` точный 11.18.0), TS7.0.2.
Sandbox EPERM и file-wrapper-only тесты не считать семантическими успехами.
При необходимости вложенного Node runner сохранять реальное выполнение identities.
