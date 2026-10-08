# Критика плана `module-resource-scopes-implementation-plan-2026-10-01.md`: репозитории и поставка

Дата: 2026-10-01. Только чтение. Проверено: GM `9c722ce` (рабочая копия, чужая правка `AGENTS.md` не тронута), AR `origin/main` `b0bcb265`, TEST `fcc10b2`, npm registry, EF 1.5.1 из `node_modules`.

## CRITICAL

### C1. `system-boundary.md` защищён по байтам, правка из §2.4 ломает `governance:check`

- План: §2.4 и GM-2 (строки 373-420, 1492).
- Что в репозитории:
  - `architecture/authority/accepted-authorities.json:5-9` хранит sha256 байтов файла (`794e2950…`, совпадает с текущим).
  - `governance.mjs:142-148` при любом расхождении падает с «differs from accepted authority».
  - Обновить сам реестр тоже нельзя: его digest зашит в `governance.mjs:72-73` и якорем в принятом неизменяемом ADR-0007 (`0007-…md:43`, проверка в `governance.mjs:153-161`).
  - Прецедент: ADR-0023 (Assembly) и ADR-0029 (kernel) допускали пакеты, не трогая этот документ (`git log` по нему: единственный коммит `c0df3df`).
- Почему важно: правка требует отдельного решения о перепривязке реестра. Такой задачи в плане нет.
- Минимальное исправление: §2.4 убрать. Разграничение «механизм против власти Host» записать только в ADR-0030 и CMS.
- Уверенность: 9.

### C2. Assembly 0.3.0 с `owner` противоречит открытым решениям владельца

- План: §1, §2.2 «Assembly per-run owner», §3.6, GM-3a и R-1 (строки 61-64, 240-251, 1493, 1496).
- Что в источниках:
  - В `foundation-review-2026-10-01/README.md` записано: «Г — ждёт итог исследований по динамике». Файлов `dynamic-modules-final-a/b.md` пока нет.
  - Там же решено выпустить «одним поколением Core/Assembly 0.3.0» ревизию контрактов, `ModuleFactory` и `owner`.
  - ADR-0030 при этом помечен `approved_by: product-owner`, хотя владелец одобрял текст дизайна, где «Core/Assembly не меняются».
- Почему важно:
  - Принятый ADR неизменяем: если по Г выберут другое, понадобится ADR-0031.
  - Номер 0.3.0 уйдёт на одно поле, и пара разойдётся: Core 0.2.0 + Assembly 0.3.0.
  - AR придётся обновляться дважды.
- Минимальное исправление: убрать Assembly из этой поставки.
  - resources 0.1.0 выпускает вариант (a) `scoped(parent, name, factory)` с защитой «обёртка вызывается один раз» или вообще без `scoped`.
  - AR уже делает compile/bind/prepare на каждую попытку (`default-agent-runtime-host.ts:49,54,56`), так что дефект §0 его не задевает.
  - `scoped(name, factory)` выходит как resources 0.2.0 вместе с поколением Core/Assembly 0.3.0. На 0.x это minor-релиз с гайдом миграции (Q8).
- Уверенность: 9.

### C3. GM-3a в текущем виде сделает `pnpm check` красным в четырёх местах

1. **Точная пара версий.** `assembly-admission.mjs:90` требует «exact Core/Assembly pair». Тест `tests/assembly-admission.test.mjs:559-562` явно отвергает смешанные пары и даже `["0.3.0","0.3.0"]`. ADR-0027: «Reject mixed pairs». План пишет «механика не проверена» (строка 967).
2. **`precheck`.** `ownership-checkpoint.test.mjs:133-135` сверяет версию Assembly с `checkpoint.evidence.packages.assembly` = `0.2.0`. Это `const` в `checkpoint.schema.json:120-125`, а файл release-owned (`release-owned-files.mjs:11-14`). В §6.4 этого пункта нет.
3. **EF v1 gate.** Поля `FactoryContext`/`RunOptions` изменены, а изменённый released item классифицируется как `breaking` (`evaluate-public-api-compatibility.js`, `classifyEntrypointPublicApiChange`). Дальше нужны changeset с bump не ниже minor (`missing-changeset`) и `approvedBreakingChanges` с принятым ADR. План ставит версию 0.3.0 руками и changeset не добавляет.
4. **Процесс релиза.**
   - §6.5 (строки 1060-1062) неверно описывает прецедент. Версию 0.2.0 выставил `changeset version` в release-PR `a10f33a` (#112) из minor-changeset `.changeset/intentional-api-release.md` (#111, `f4e6137`); там же через CLI повышен baseline.
   - Ручная 0.3.0 вместе с minor-changeset даст 0.4.0.
   - Без release-PR baseline застрянет на 0.2.0. При его повышении упадёт `sdk-growth.mjs:181`, где жёстко записано `"0.2.0"`.
   - Release-PR в последовательности §9 нет.
- Минимальное исправление: C2 снимает всё это для текущей поставки. В будущем поколении 0.3.0 идти по ADR-0027: changeset → release-PR → promote.
- Тест ownership надо перевести на версии из коммита base, по образцу строки 103 в плане.
- Уверенность: 9.

## HIGH

### H1. AR-1 и AR-2 недооценены, пропущены гейты AR

Основание: §7.2, §8, строки 1263-1272, 1498-1499.

1. **Пин CMS по построению выдерживает один шаг.** Жёстко зашиты `consumer-module-standard-pin.mjs:4-22`, `validate-ar-c0-profile-migrations.mjs:140-162` и `check-sdk-growth-profile.mjs:112-129`. Новые `resources-cms-pin-review.json` эти валидаторы не увидят. Прецедент `b0bcb265` на один такой шаг: 36 файлов, +1315/−135.
2. **C0 заморожен.** `validate-ar-c0-profile-migrations.mjs:152-162` (`nonDelegatedActiveProfile`) требует, чтобы `consumer-profile.json` вне `standard` совпадал с ревизией зачисления. Любая правка `packages` делает workflow `ar-c0` красным.
3. **L0 v2.** `architecture:runtime-setup-l0-evidence` входит в `check` и в `check:fast`. Его входы включают lock, `pnpm-workspace.yaml`, `architecture/get-modular/**` и `accepted-decisions.json`. Каждый AR-PR требует новых парных квитанций linux-x64 и darwin-arm64 (~4,9 МБ JSON).
4. **AST-гейт.** `ordinary-composition-evidence.mjs:62-81` требует передачи `ordinaryOwner`, а §8.4 её убирает.
5. **Жёсткие `0.1.0`.**
   - `assembly-packed-consumer.test.ts:48,93,129,278,287`.
   - `check-get-modular-adoption.test.mjs:38`.
   - `contract.json:408-420` в C0.
   - `runtime-setup-l0-evidence-v2-inputs.mjs:82-83`.
6. **Darwin.** Граница `composition.embedded-runtime.contained-turn-routing` (`source-dependencies.yaml:1204-1268`) в профиле `not-adopted`, ADR-0016 ещё Proposed.
7. **Противоречие внутри плана.** Строка 1299 говорит, что переход на Core/Assembly 0.2.0/0.3.0 «обязателен». Строка 1594 говорит, что обновление AR на 0.2.0 «не входит в поставку».

- Минимальное исправление:
  - отдельный AR-0, который обобщает цепочку пинов CMS и делегирование C0 для `packages`;
  - AR-1 на Core/Assembly 0.1.0 (после C2);
  - бюджет на пересъёмку L0;
  - AR-2 только после классификации границы Darwin.
- Оценка объёма (моя, не измерена): AR-1 ≈ +1 600…2 400, AR-2 ≈ +350…600, то есть примерно вдвое больше плана.
- Уверенность: 8.

### H2. TEST-1 по плану ломает `pnpm evidence`

Основание: строки 1245-1261.

- **Тесты в конце списка.** «Имена в конец `tests`» не работает. `run.mjs:265` берёт slice от `lifecycleStartIndex` до конца массива, `:268-274` переназначает всё с индекса ≥143 на `replacement.test.mjs`, и `:282-284` падает.
- **Архивы не попадут в коммит.** `.gitignore:5-10` игнорирует `*.tgz`, кроме перечисленных. `git status --porcelain` игнорируемые файлы не показывает, поэтому проверка пройдёт локально, а в чистом checkout архивов не будет.
- **`checkPins()`** (`run.mjs:100-117`) рассчитан на одну версию в паре и `engines` строго `>=24.18.0 <25`.
- **Типы.** `tsconfig.json` включает `tests/**/*.ts`, такие файлы скомпилируются против Assembly 0.1.
- **Изоляция.** `TMPDIR` лежит внутри репозитория (`run.mjs:66`), и недостающая зависимость молча разрешится в Core 0.1.
- **Прецедент расхождения байтов.** Пины TEST candidate-0.2 (`DkMbu55…`) не равны байтам в registry (`npn2dAR5…`). Утверждение «замена на registry-байты не понадобится» верно только для точного retained-архива релиз-оператора.
- Минимальное исправление:
  - отдельный диапазон индексов и сопоставление runner'а;
  - `.mjs` вместо `.ts` и tar-распаковка, как в GM packed-root;
  - `!`-строки в `.gitignore`;
  - архивы брать из записи намерения R-1.
- Уверенность: 8.

### H3. В ADR-0030 `related: ADR-0006` ссылается не на тот ADR

- План: строка 144.
- В GM ADR-0006 — это `0006-clarify-v1-compiler-normalization-and-entry-points.md`, а не EF ADR-0006.
- Принятые байты потом не исправить.
- Исправление: убрать из `related`, оставить ссылку на EF в тексте.
- Уверенность: 9.

## MEDIUM

### M1. Эксперименты шли на Node v26.9.0

- План: §0, строка 26.
- Эта версия вне `SUPPORTED_NODE_RANGE` (`>=26.10.0`) и вне `TOOLING_NODE_RANGE` (только 24) (`node-version.mjs:4-5`). Локальный `pnpm check` на ней упадёт в `runtime:preflight`.
- Исправление: повторить прогон на `/opt/homebrew/opt/node@24` (24.18.0) и на 26.10.
- Уверенность: 9.

### M2. `examples/` и адаптеры

- `production-artifacts.mjs:84` считает любой `.mjs` артефактом.
- Проверка в стиле kernel отвергает всё вне `src/` и `tests/` (`lifecycle-candidate-admission.mjs:159-161`).
- Тесты группы процессов и keep-alive на CI с тремя ОС добавляют риск флейков без пользы для библиотеки.
- Исправление: адаптер как фикстура в `tests/`, тест группы процессов только на POSIX, либо адаптеры только в README.
- Уверенность: 7.

### M3. GM-1 (табличный admission)

- Оправдан, если следующим будет `@get-modular/conformance` (решение 4 владельца). Имя уже есть в `ACCEPTED_PACKAGE_NAMES`.
- Сделать его узкой параметризацией существующих проверок, без новых полей «на будущее».
- Уверенность: 6.

### M4. GM-4 правит `AGENTS.md`

- В `AGENTS.md` есть чужая незакоммиченная правка.
- Ссылка на CMS там уже есть (`AGENTS.md:18`).
- Исправление: файл не трогать; при необходимости работать в отдельном worktree.
- Уверенность: 8.

### M5. Первая публикация нового имени

- Не проверено, выставит ли registry `latest` при первом `--tag candidate-0-1-0`. После загрузки нужно прочитать фактические dist-tags.
- Trusted publishing для первой версии невозможен: «The package you're configuring must already exist on the npm registry» ([npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust), [npm/cli#8544](https://github.com/npm/cli/issues/8544)).
- Ручная публикация владельцем, как в 0.2.0, корректна, provenance при ней не заявлять.
- Уверенность: 6.

### Что в плане верно (проверено)

- Отпечаток EF не учитывает `status`/`superseded_by` (`architecture-decision.js:19-25`).
- Байты C0 ADR-0028 = `6edd5c84…`.
- Пины CMS в двух местах GM.
- Вариант A для `sdk-growth` (владелец его принял).
- `0.1.0` + minor-changeset даст 0.2.0 ([increment.ts](https://github.com/changesets/changesets/blob/main/packages/assemble-release-plan/src/increment.ts)).
- У AR root `minimumReleaseAge: 0` (`pnpm-workspace.yaml:35`). Но у одноразового consumer в `assembly-packed-consumer.test.ts:93` exclude-список жёстко на пару 0.1.0, а значение по умолчанию у pnpm 11 мной не перепроверено.

## Сравнение с индустрией (кратко)

- **Effect.** Новый пакет создаётся с `0.0.0` и minor-changeset, а 0.1.0 выпускает release-PR ([пример](https://github.com/Effect-TS/effect/blob/a116aeade97c83d8c96f17cdc5cf3b5a0bd9be74/.changeset/real-news-roll.md)).
- **Effect и TanStack** до релиза дают потребителям снапшоты через pkg.pr.new: «won't publish anything to NPM» ([pkg.pr.new](https://github.com/stackblitz-labs/pkg.pr.new)).
- **Changesets snapshot** — выпуск «for testing without updating the versions» ([docs](https://github.com/changesets/changesets/blob/main/docs/snapshot-releases.md)).
- **Angular** помечает новые API как experimental: «can change at any time» ([angular.dev](https://angular.dev/reference/releases)).
- **Вывод (моё предложение):**
  - новый пакет выпускается отдельно от изменений ядра;
  - до необратимой загрузки потребители проверяют tarball: у нас черновая ветка AR и TEST на retained-архиве, pkg.pr.new не нужен;
  - изменения ядра идут своим поколением.

## Исправленная последовательность

1. **GM-1** (необязательно): узкая параметризация leaf-admission.
2. **GM-2**: ADR-0030 без Assembly и без правки `system-boundary.md`. Плюс supersession ADR-0028 и тест ownership: строки 34, 41-53, 103 и 133-135 перевести на байты base.
3. **GM-3**: resources 0.1.0 с `createScope` и `scoped(parent, …)` с защитой однократного вызова (или без `scoped`). Без `examples/`.
4. **GM-4**: CMS (контракт Assembly не меняется), пины в ownership и `sdk-growth`.
5. **R-1**: только resources. Retained-архив, загрузка под candidate-тегом, read-back фактических тегов.
6. **TEST-1** с исправлениями runner'а; идёт до загрузки, на том же архиве.
7. **AR-0**: обобщить цепочку пинов CMS, делегирование C0, входы L0.
8. **AR-1**: ordinary host на Core/Assembly 0.1.0 плюс resources.
9. **AR-2**: Darwin, после классификации границы.
10. **Позже**: Core/Assembly 0.3.0 (ревизия контрактов, `ModuleFactory`, `run({ owner })`) через changesets и release-PR, затем resources 0.2.0 с `scoped(name, factory)`.

## Вердикт

Семантика библиотеки проработана хорошо. Интеграция в текущем виде не исполнима:

- минимум четыре гейта GM станут красными (C1, C3);
- поставка опирается на нерешённый вопрос Г и тратит номер 0.3.0, отведённый под общее поколение;
- объём работ в AR занижен примерно вдвое.

После того как Assembly и `system-boundary.md` убраны, GM-часть сокращается примерно на 300-400 строк, риск необратимой публикации ограничен одним новым пакетом, а AR-часть честно растёт за счёт гейтов.
