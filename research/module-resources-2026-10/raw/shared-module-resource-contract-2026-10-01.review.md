# Ревью плана `shared-module-resource-contract-2026-10-01.md`

Дата: 2026-10-01. Объект: план с фактическим SHA-256 `46e869cefe261dab667f87f6249c63bfb301f3b1581e52f87cf42f270dc0eea7`
(в самом плане на стр. 186 указан устаревший `43a6ac34…`).

Три независимых ревью: (1) соответствие цели, иерархия, масштаб; (2) семантика контракта и конкурентность;
(3) scope, governance и сверка с репозиторием. Отмеченное «проверено» подтверждено по файлам репозитория
или экспериментом на Node v26.9.0 / `tsc7`. Номера строк относятся к плану, если не указан другой файл.

Уровни: **C** критично, **H** серьёзно, **M** средне.

---

## A. Управление собственными ресурсами модуля (стр. 19–99)

### A-C1. Очистку нельзя дождаться, Host вынужден опрашивать
- Где: стр. 28 `seal(): void`, `cleanup(): void`, `recover(): void`, синхронный `observe()`; стр. 44 «Controls return no shutdown Promise»; стр. 78 «Fulfill only after complete owner observation»; стр. 84 «No generic scheduler».
- Сценарий: Host вызвал `cleanup()`, но не может узнать, когда она закончилась. Остаётся только опрос `observe()` по таймеру. В момент «пробуждения» отчёт ещё `incomplete`, `complete` появляется через несколько микротасок, зависит от реализации. Каждый опрос копирует весь отчёт. Это и есть scheduler, который стр. 84 запрещает, только размазанный по всем потребителям.
- Внутренние противоречия: стр. 70 очищает «settled observer closures», которые API нигде не регистрирует; стр. 82 «Recovery joins…» невыполнимо, потому что `recover()` возвращает `void`.
- Следствие для иерархии: модуль, которого нельзя дождаться, нельзя вложить в другой.
- Фикс: `close(): Promise<CleanupReport>` (не отклоняется, честно возвращает `incomplete`) и `[Symbol.asyncDispose]`; либо `settled(): Promise<CleanupReport>` только в Host-фасете.
- Проверено: экспериментом (гонка микротасок).

### A-C2. Порядок очистки внутри одного owner не задан
- Где: стр. 44 «dispatches eligible obligations»; стр. 56 «Safe independent obligations progress despite unresolved peers». Про LIFO или последовательность нет ни слова.
- Сценарий: модуль открыл соединение, затем подписался через него. Параллельный dispatch: закрытие соединения гонится с отпиской, отписка падает, долг `unresolved` навсегда (стр. 60 запрещает повтор). Объединить оба в одну регистрацию нельзя: теряется удержание частичного setup.
- Как у других: Effect «finalizers are executed in reverse order»; .NET `ServiceProviderEngineScope` обходит с конца; OpenClaw `cleanups…toReversed()` (`plugin-instance.ts:698`); `AsyncDisposableStack` LIFO.
- Фикс: последовательный LIFO по умолчанию; если поздняя запись `unresolved`, ранние остаются pending; параллельность только явно.

### A-C3. Контракт cleanup неудобный, а без TypeScript опасный
- Где: стр. 26 `cleanup: (outcome: SetupOutcome<T>) => CleanupResult | Promise<CleanupResult>`; стр. 58 «`void` is malformed»; стр. 52 malformed → `unresolved`; стр. 56 «Setup failure does not prove empty acquisition».
- Сценарий: `cleanup: s => s.unsubscribe()` из исходного предложения (`input-proposal.md:20-23`) даёт TS2339; `cleanup: () => server.close()` даёт TS2322. В чистом JS оба молча становятся вечным долгом, каждый `dispose` отклоняется с `cleanup-incomplete`. Живой `server` попадает в отчёт, который считается инертным.
- Ветка `failed` нечестна в обоих вариантах: `released` противоречит стр. 56, `unresolved` без readback означает вечный долг и вечно заблокированного родителя. Ручной `{kind:"released"}` доказывает не больше, чем успешный `void` (стр. 130 сама признаёт, что «dishonest release assertions» не проверить).
- Фикс: `cleanup(value: T, {signal})` возвращает `void | Promise<void>`: успех означает released, исключение означает unresolved, вызывается только для `ready`. Опциональный `unwind(cause)` для неатомарного setup; без него setup считается атомарным (как в Effect). Расширенный `CleanupResult` с readback оставить для сложных адаптеров.
- Проверено: `tsc7`.

### A-C4. Нет отмены: зависший setup вешает остановку модуля навсегда
- Где: стр. 25 `setup: () => T | Promise<T>` без сигнала; стр. 49 «no cleanup invocation until settlement»; стр. 80 «Deadline/abort neither settles nor cancels raw actions».
- Сценарий: `setup: () => connect(unreachableHost)` или `once(emitter, "ready")`, которое не наступит. Cleanup невозможен, сокет держит event loop, `dispose` кончается только по дедлайну с сохранённым долгом.
- То же для cleanup: `http.Server.close()` с keep-alive висит, а сказать «поторопись» (`closeAllConnections()`, SIGTERM → SIGKILL у дочернего процесса) нечем.
- Уже есть: `FactoryContext = { readonly signal: AbortSignal }` (`get-modular/packages/assembly/src/features/construction/types.ts:68`). План его не использует.
- Фикс: `{signal}` в `setup` и `cleanup`. Abort означает только эскалацию и не отмечает ресурс освобождённым. Это локальная отмена в пределах owner, а не «global cancellation», исключённая в `scope.md`.
- Проверено: по файлу.

### A-C5. Необработанный rejection роняет процесс
- Где: стр. 48 «After seal, fulfillment cannot publish and setup rejects `setup-closed`»; стр. 38.
- Сценарий: фабрика вызвала `resources.setup(...)` без `await` и вернулась. Host делает `seal`, поздний fulfil отклоняет промис автора, обработчика нет. Node по умолчанию завершает процесс с кодом 1, всё удержание теряется. То же при позднем отклонении setup и при `setup-busy` без `await`.
- Фикс: owner сразу вешает на возвращаемый промис `.catch(() => {})` и пишет отказ в отчёт; `await` автора по-прежнему получает ошибку.
- Проверено: экспериментом.

### A-C6. Ресурсы только на этапе конструирования, освобождать по одному нельзя
- Где: стр. 32 «Later runtime acquisition/registration is excluded»; стр. 38 seal при завершении фабрики; стр. 130 «Detached post-settlement acquisition receives no guarantee».
- Сценарий: lazy connect, worker на задачу, повторная подписка после reconnect, временный файл на операцию. Модуль не может ни зарегистрировать их позже, ни освободить ресурс, когда он стал не нужен, не закрывая весь модуль. Рядом неизбежно появится второй, неуправляемый путь очистки; два механизма дают двойные или пропущенные освобождения.
- Расходится с целью «очищать, когда они не нужны».
- Фикс: `resources.child()` возвращает под-scope `{resources, close}`; регистрацию закрывать при запросе cleanup, а не при завершении фабрики (проверку `pendingSetupIds` при публикации оставить).

### A-H1. Cleanup неудачного setup откладывается до остановки модуля
- Где: стр. 48 и 50, cleanup для `setup-failed` только после «Cleanup requested».
- Сценарий: цикл из 5 попыток `connect` или фабрика ловит ошибку и деградирует. Каждый частичный ресурс живёт до shutdown: клиент с auto-reconnect, listener, который получает события в полуинициализированный handler.
- Фикс: при падении setup сразу запускать `unwind`/cleanup; промис автора отклоняется исходной причиной после этого.

### A-H2. Ресурс, который сам является thenable
- Где: стр. 34 «Support ordinary Promises and non-thenable values; exotic thenables are outside coverage».
- Сценарий: `setup: () => execa("server")`. Результат execa одновременно процесс и Promise, ассимиляция ждёт выхода процесса, setup не завершается никогда, процесс не убит. TS молча выводит `T = Result`. Promise из другого realm (`vm`) при проверке `instanceof Promise` классифицируется как готовое значение. Getter `then` читается дважды.
- Фикс: зафиксировать правило `typeof v?.then === "function"` с однократным чтением; явно требовать оборачивать thenable-ресурс (`setup: () => ({ proc: execa(...) })`); type-fixture и тест.
- Проверено: экспериментом.

### A-H3. `setup-busy` ломает `Promise.all`
- Где: стр. 32 и 34.
- Сценарий: `Promise.all([r.setup(a), r.setup(b)])` для независимых ресурсов: второй получает `setup-busy`, фабрика падает. Assembly и так конструирует модули последовательно (`common-assembly.md:266`), план добавляет сериализацию ещё и внутри модуля.
- Фикс: разрешить параллельные setup до seal, у каждого своя запись; `pendingSetupIds` это уже покрывает.

### A-M1. Неограниченное удержание
- Где: стр. 60 «unresolved indefinitely»; стр. 84; `observationFailures` никогда не стираются (стр. 58).
- Сценарий: периодический `recover()` с падающим readback растит массив без предела. Один вечный долг ребёнка держит FileHandle родителя до конца процесса. Списать долг нечем.
- Фикс: Host-only `forfeit(reason)` с терминальным `abandoned` (никогда не `released`); хранить первые и последние N ошибок и счётчик.

### A-M2. Дыры в таблице состояний
- Не сказано, что записанный запрос сам запускает cleanup после завершения setup (стр. 49 → 48).
- `setup-closed` означает две разные вещи: отказ без вызова callback (стр. 34) и поздний результат уже полученного ресурса (стр. 48).
- Причины ошибки setup нет в форме отчёта (стр. 62: только `{id, cleanupCause, observationFailures}`).
- Нет флага `requested`: `incomplete` с пустыми проекциями неотличим от «cleanup ещё не запрошен».
- Фикс: отдельный код `setup-late` с `cause`; `setupCause` и `requested` в отчёте; явная строка таблицы «settled + requested → cleaning».

### A-M3. Стандарт JS-освобождения не используется
- Node 24+ нативно поддерживает `await using`, `AsyncDisposableStack`, `SuppressedError` (проверено на v24.18.0 и v26.9.0). `FileHandle` и `net.Server` реализуют `Symbol.asyncDispose`.
- GM quickstart уже учит `AsyncDisposableStack` (`get-modular/docs/guides/consumer-quickstart.md:90-92`), ADR-0010 его допускает.
- План вводит третий несовместимый протокол очистки; owner нельзя положить в `AsyncDisposableStack` или `await using`.
- Фикс: `resources.use(asyncDisposable)` одной строкой; `control[Symbol.asyncDispose]`.

---

## B. Иерархия и порядок между модулями

### B-C1. Owner нельзя вложить в owner
- Где: стр. 30, 44, 100, 126 «support only this explicit nesting»; стр. 102–127 — рукописный протокол TEST Host для одного родителя и двух детей над FileHandle.
- Сценарий: модуль запускает вложенный assembly run (разрешён, `common-assembly.md:269`) на 20 модулей. Их owners не к чему привязать, родитель закрывает sink, пока внуки ещё чистятся. Для N уровней каждый потребитель пишет свой gate и цикл опроса.
- Как у других: `AsyncDisposableStack.use(child)`; IntelliJ `Disposer.register(parent, child)`; Kotlin structured concurrency.
- Фикс: дочерний scope как одно обязательство родителя (`child()`), awaitable `close()`.

### B-C2. Порядок между модулями запрещено брать из графа, общие ресурсы отвергнуты
- Где: стр. 126 «Reject escaping lifetimes, overlapping external borrowing…»; `round-1-critique.md:61` «Do not infer ordering from Core's construction graph or capability references» (проверено).
- Противоречит принятому направлению: `input-proposal.md:49` «Siblings or external modules share the resource | The owner waits for every dependent use, not only its descendants» (проверено).
- Уже есть: Core выдаёт ацикличный план с `dependencyOrder` и `bindings` (`core/src/features/authoring/wire-types.ts:68`); Assembly конструирует «sequential in dependencyOrder» и пишет журнал `created` (`common-assembly.md:266`, `assembly/.../ports.ts:23`) (проверено).
- Сценарий: один DB pool и 40 потребителей из разных веток. Host закрывает owners в произвольном порядке, pool закрывается, пока repository соседней ветки ещё дренирует запросы.
- Фикс: Host закрывает в обратном порядке `created`; позже параллельно по `bindings` (провайдер ждёт только своих потребителей). Требует решения владельца вопреки пункту 5 из round-1.

### B-H1. Вложенный протокол связывает ребёнка с внутренним форматом родителя
- Где: стр. 104–110: контекст очистки ребёнка хранится в файле родителя, ребёнок читает его по смещениям через приватную closure.
- Мнение: очистка ребёнка зависит от устройства хранилища родителя; протокол нужен только потому, что глобальный shutdown gate (стр. 112–114) сразу закрывает обычный доступ. При упорядоченном закрытии (дети раньше родителя) порт родителя жив во время очистки детей, и приватный канал не нужен.

---

## C. Сверка с репозиторием и governance

### C-C1. Имя `@get-modular/ownership` занято другим контрактом, гейты станут красными
- ADR-0028:28-29 закрепляет `@get-modular/ownership` и `packages/ownership` за синхронным контрактом без callback'ов (`architecture/contracts/ownership/public-contract.d.ts`).
- `tests/ownership-checkpoint.test.mjs:139` проверяет отсутствие `packages/ownership`; `:131` пинит хеш стандарта `33b41d5…`, а план требует обновить стандарт; тест запускается в `precheck`, значит `pnpm check` упадёт.
- `common-assembly.md:96` запрещает «generic lifecycle manager for passive construction».
- ADR-0029:143 уже отклонял «Extend ownership K1 now».
- AR тоже потребляет стандарт (`agent-runtime/architecture/get-modular/consumer-profile.json`), план упоминает только TEST.
- Фикс: отдельное имя (например `@get-modular/resources`) или successor явно снимает C0 `OwnershipScope` с перечнем правок тестов, стандарта и пинов.
- Проверено: по файлам.

### C-C2. Зависимость от закрытой цепочки S3 → G1 → K1
- Стр. 13: «S3 completion is unproven». Фактически `reference/get-modular-openclaw-20260912/research/sdk-owned-lifetime-closure-decision-2026-09-25.md:11-12`: S3 «**не делается**»; `:41` «K1/A1/A2 остаются честными C0 NO-GO».
- Пути от TEST к реальному дереву модулей в плане нет. Прецедент lifecycle-kernel: около 2 тыс. строк в GM и около 5 тыс. в TEST, production-потребителя нет.
- Фикс: отвязать хелпер от S3/G1/K1; следующим шагом записать внедрение в одно реальное дерево модулей AR.
- Проверено: по файлу.

### C-H1. Неверный `engines`
- Стр. 7: `>=24.18.0 <25`. `architecture/checks/node-version.mjs:4` `SUPPORTED_NODE_RANGE = ">=24.18.0 <25 || >=26.10.0 <27"`; `:5` `TOOLING_NODE_RANGE` (только корень). Все `packages/*/package.json` используют SUPPORTED.
- Фикс: SUPPORTED-диапазон; версию `0.1.0`, как у kernel.
- Проверено: по файлам.

### C-H2. Пересечение с lifecycle-kernel, shared-first review не сделан
- ADR-0029: «A custody lease retains pending acquisition…», «A Host must not maintain independently editable copies of either package's facts». Соответствие «pending setup ⇄ custody lease» не описано, одна acquisition будет учтена дважды.
- AGENTS.md требует owner, направление зависимостей, границы, компромиссы и LOC; таблицу альтернатив из round-1 выбросили.

### C-H3. Стоимость занижена
- Стр. 17: 1 150–1 800 LOC. Прецедент kernel: 204 строки исходника обошлись примерно в 1 970 строк в GM и 5 100 в TEST. Около 37% текста плана — governance и provenance.
- Мнение: реалистично 3 500–6 000 LOC. Адаптеры игрушечные (EventEmitter, временный файл, FileHandle); нет ни одного ресурса с эскалацией (`http.Server`, дочерний процесс, pool).

### C-M1. Читаемость
- Не определены: «construction cell», «attempt», «action holders», «authoritative pendingSetupIds», «observation budget», «eligible», формат ID. Стр. 126 «No acknowledgement-append protocol remains» — след удалённого дизайна.

### C-M2. Устаревшая TEST-матрица
- Стр. 168 и 170 требуют сохранить `published-0.1/candidate-0.2`; candidate-архивы 0.2 (engines `<25`) не совпадают с опубликованным 0.2.0 (двойной диапазон). Работа удваивается на неактуальной матрице.

---

## D. Что сохранить

- Удержание записи о ресурсе до начала рискованного setup.
- Запрет публикации модуля, пока setup не завершился.
- Single-flight: повторные вызовы не запускают очистку второй раз.
- Честный `unresolved`-долг; таймаут не считается освобождением.
- Дети получают узкие порты без права закрыть родителя.
