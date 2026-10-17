<!-- cspell:disable -->

# Handoff: доставка `@get-modular/observation` 0.1.0

Обновлено 2026-10-17 после продолжения остановившейся сессии. Исходный хендофф подготовила сессия
Claude Code `c5e49d4a-17d5-423a-81ef-0a305b439ef8`, исчерпавшая лимит до завершения правок плана.
Её исходный отчёт остаётся в истории ветки `docs/observation-impl-plan-handoff` (`e5ea367`, `5dd6287`).

Читай [implementation-plan.md](implementation-plan.md), затем Phase 0. Проверка плана и реализация пакета — разные
результаты: пакет ещё не реализован, admission entry не добавлена, релизные архивы и TEST consumer ещё не созданы.

## 1. Текущий checkpoint

- Проверенный `main`: `a3a079baca2c6af48c9d45bc08992825be1c2bbd`. В него уже вошёл research PR #182.
- Проверенный текст ADR-0034: PR #154, `945e9a151a516ce4ce6e73b6e18893d4e5b27cfe`. PR открыт.
  Пока ADR отсутствует в `main`, Phase 0 останавливает реализацию пакета.
- План продолжен в PR #185, ветка `docs/observation-impl-plan-handoff`. Исправления перечислены ниже;
  независимое ревью и проверенные пути/команды записаны в [plan-review.md](plan-review.md).
- Исправленный research predecessor: PR #183, проверенный head
  `cfdaa18f152aac614194be710a474f4d4b06f59a`. Его изменения учтены как обязательный вход плана;
  сам PR принадлежит другому треку и этим продолжением не изменяется.
- Семантика принятого ADR, frozen SDK-growth evidence, публичные API baselines и чужие чекауты не меняются.

## 2. Закрытие восьми пунктов исходного dry-run

| Пункт | Результат |
| --- | --- |
| Устаревшие ADR digests | Удалены старые digest-константы. Phase 0 вычисляет SHA-256 файла и читает registry digest из одного fetched `origin/main`; сравнивает текст с проверенным ADR head. Отсутствующий файл останавливает команды до хеширования. |
| SDK-growth / `successorReviews` | Противоречие снято по текущему ADR: **весь** `architecture/sdk-growth/evidence/consumer-module-standard.json` сохраняется. Меняется только существующий current CMS pin в ownership test; delta и работа потребителей фиксируются в PR 2. Новый approve для исправления плана под уже выбранный ADR не нужен. |
| Ссылка на «Hand-off» | На приложенном плане такая ссылка не воспроизвелась. Добавлен полезный раздел 18 с точным форматом передачи работы; это не выдаётся за исправление найденной broken link. |
| Сокращённые пути probes | В §9.0 перечислены точные пути; выбран `p5-gm-contracts.b.ts.txt`, вариант A явно исключён. |
| Node и pnpm | §2.1 задаёт абсолютные executable paths, проверку версий, исходные машинные пути как примеры и прямой запуск pnpm через выбранный Node. Добавлены frozen install и build resources перед первым observation compile. |
| `Authoring surface changed` | Найдены реальные changesets в истории: resources `3c28a02`, conformance `a01a129`. Строка сохранена как конвенция release notes, не как выдуманное поле схемы Changesets или новый gate. |
| Общий ownership test | Описан порядок: сначала #154, потом PR 1, затем PR 2 меняет только current CMS successor assertion. ADR assertions и исторические CMS digests сохраняются. |
| Девять store-файлов | Все девять файлов перечислены явно в §11.4, с правилом раскрытия полного пути в YAML. |

## 3. Дополнительные исправления после независимого разбора

План теперь переносит исправления #183, а не только первоначальные 43 шага архива:

- `onResult` и `onError` получают собственную delivery task с полным microtask checkpoint; currentness проверяется
  непосредственно перед callback. Queued publication учитывается testing waits, но не создаёт drain debt уже
  завершившегося loader.
- Часы берутся через builtin `node:perf_hooks`, если он доступен. Есть отдельная fake-clock-before проба;
  ограничение для подмены самого builtin до import остаётся явным.
- `FixedKeys` проверяет каждый constituent key; mixed fixed/open negatives и finite positive controls входят
  в type suite. No-ALS environment probe также проверяет синхронный loader после startup await.
- Все R16/R17 и усиленные close/stale probes из #183 должны быть перенесены. После close тест ждёт `delivered()`
  до утверждения об отсутствии результата; перед конкурирующим commit доказывается queued publication.
- Требование ADR об одной внутренней очереди выполняется настоящей private FIFO в `delivery/context.ts`.
  Каждый callback сразу получает отдельную native task; пара flush/close относится к store flush.
  Batch-draining и serial pump, меняющие microtask checkpoints, не предлагаются. Это T113 матрицы.
- Для общих leaf checks сохранены прежние root-only diagnostics, порядок проверок, независимые literal fixtures
  и отдельный путь проверки Assembly.
- Уточнены oracles для всех четырёх callback hooks, отсутствия resource registrations у watch, exact limits,
  unfrozen patch после rejected guard и detach без зависимости от порядка имён подписчиков.
- Assembly cancellation проверяется как `run()` failed outcome с сохранённой причиной; `run()` не должен
  отклоняться вместо предусмотренного outcome.
- Mutation detection требует семантического провала, а не syntax/import/setup error. Параллелизм ограничен.
- Phase 3a готовит все пять архивов для TEST: Core, Assembly, resources, conformance и observation.
  Это не меняет версии и не разрешает повторную публикацию неизменённых peers.

Проверка плана не заменяет будущую проверку package build на обоих Node и трёх ОС.

## 4. Git hooks и fixture tests

В исходной сессии глобальный `pre-commit` требовал автора `iliya <iliyazelenkog@gmail.com>` и блокировал
fixture-коммиты `Fixture <fixture@example.invalid>`. Четыре отказа были в трёх tracked-workspace integrity cases
и `starting base survives descendant commits`. На новой машине этот hook не установлен, поэтому причина
воспроизведена отдельным hostile global config с реально отказывающим `pre-commit`.

Исправление вынесено в отдельную ветку `fix/isolate-fixture-git-hooks`: один небольшой helper создаёт пустой hooks
directory внутри `.git` каждого disposable fixture и задаёт только его локальный `core.hooksPath`.
Подключены active commit writers governance, private-core-start, SDK-growth и repository-agent-workflow.
Codemod/M3 fixtures уже имели собственную изоляцию. Frozen historical execution fixtures не переписываются.

Новая регрессия сначала доказывает отказ обычного контрольного commit, запускает те же четыре исходных теста,
проверяет неизменность внешнего config и снова доказывает отказ контрольного commit. Наблюдаемый результат:
исходные четыре падения воспроизведены до исправления; после исправления проходят четыре теста и родительская
регрессия. Дополнительный hostile-hook прогон прошёл для repository-agent-workflow (2 tests), SDK-growth admission
(5 surfaces / 4 transitions, статус authority unverified / activation hold сохранён) и codemod commit fixture.
Глобальные hooks и policy рабочего репозитория этим не отключаются.

Не превращать `GIT_CONFIG_GLOBAL=/dev/null pnpm check` в постоянный способ скрыть проблему. Исправленный active
gate должен работать при включённом чужом commit hook; локальные identity и CI requirements сохраняются.
Патч не заявляет полную изоляцию произвольных `GIT_CONFIG_COUNT` overrides, signing policy или всех Git operations.

## 5. PR #154: причина `codex-review`

[Run 39058711688](https://github.com/agent-teams-ai/get-modular/actions/runs/39058711688),
[job 117471998344](https://github.com/agent-teams-ai/get-modular/actions/runs/39058711688/job/117471998344):
`Run ReviewRouter T0` завершился с
`codex_oauth_control_plane_error:503:codex_rotating_oauth_unavailable` до выполненного ревью.
Это недоступность OAuth control plane; лог не доказывает исчерпание квоты или дефект ADR.

Попытка перезапустить failed job через подключённый GitHub plugin получила HTTP 403
`Resource not accessible by integration`. Перезапуск не состоялся. Следующее внешнее действие — восстановить
доступность ReviewRouter и выполнить failed-job rerun субъектом с Actions write. Не менять ADR, workflow или
required checks ради обхода этого сбоя. Проверять live CI на точном head; данные старого run не заменяют новый результат.

## 6. Границы соседней работы и следующий шаг

| PR | Ветка | Действие следующего исполнителя |
| --- | --- | --- |
| #154 | `docs/adr-module-change-observation` | Дождаться нужных checks; merge только при разрешении владельца. Затем пересчитать digests с `main`. |
| #183 | `fix/observation-review-gaps` | Другой трек. Получить его влитый или явно согласованный reviewed predecessor до Phase 1b; не менять самостоятельно. |
| #184 | `docs/fixture-scale-readiness` | Другой трек, самостоятельные consumer/scale fixtures. Не расширять observation delivery этим скоупом. |
| #185 | `docs/observation-impl-plan-handoff` | Этот план, хендофф и review record. Все runtime/test строки матрицы пока являются заданием, а не выполненным package evidence. |
| #186 | `docs/agents-cms-maintenance` | Отдельная доставка навигационного правила CMS. Перечитать актуальные инструкции после её merge. |

Разрешение на merge по V13 отсутствует, пока текущая сессия явно его не дала. Завершённые изменения нужно довести
до проверенных PR и показать владельцу конкретный результат. После разрешённого merge prerequisites следующий
исполнитель проходит Phase 0 → PR 1 → PR 2 → release/TEST; публикация остаётся действием владельца.

Исходный хендофф упоминал чужой незакоммиченный `AGENTS.md` в старом главном чекауте. Этот чекаут не используется.
Не выполнять там `git checkout -- AGENTS.md`: сначала его владелец должен сверить актуальные bytes и свою работу.
