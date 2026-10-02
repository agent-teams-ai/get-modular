# Глубокое ревью плана ресурсов: реализуемость и детали (2026-10-02)

Объект: `module-resource-scopes-implementation-plan-2026-10-01.md` (ред. 2), дизайн, `README.md`.
База: get-modular `9c722ce`, AR `origin/main` `b0bcb265`, TEST `fcc10b2`. Пробы лежат в
`scratchpad/deep-impl/` (`inputs-probe.mjs`, `host-template.ts`, `at-probe.ts`, `legacy-probe.ts`,
`pkg/`). Прогоны: tsc7 7.0.2, TS 5.8.3 (`typescript-minimum` из GM), Node 24.18.0 и 26.9.0,
oxlint с `.oxlintrc.json` GM. Прототип v2 проходит 20/20 тестов, все 16 мутаций пойманы, GC-проба
даёт 0. Это проверено повторно и ниже не обсуждается.

## CRITICAL

**C1. ADR-0031 и раздел 5 расходятся с прототипом по input handle.**
Где: план 588-589 («an input handle cannot be a root or a listed factory»), 836-837, AS4 (1048),
A3 (1031), таблица 5.2 (841-846).
Факт (`inputs-probe.mjs` на `impl-plan-v2/asm`):
- input только в `inputs`: `assembly.prepare.handles`;
- input в `factories` и в `inputs`: `prepared`. Так написан и тест A3 прототипа
  (`factories: [inputHandle, storeHandle]`);
- input как root: `prepared`, а run возвращает одолженный вход в `roots`.

Причина: `collectMetadata()` и `validateSelections()` строят карту только из `factories`.
CMS (стр. 217-220) требует, чтобы handles покрывали каждую selection ровно один раз.
Байты ADR замораживаются в GM-2, до кода GM-3. После этого противоречие исправит только новый ADR.

Что вписать (рекомендую оставить модель прототипа):
- ADR-0031: «Every input handle is listed once in `factories` and named once in `inputs`; it
  cannot be a root (`assembly.prepare.inputs`)»;
- 5.2: проверка «вход не root» в `bindInputs`;
- AS4: точные случаи: не в `factories` → `handles`; root → `inputs`; не назван или назван
  дважды → `inputs`.

Уверенность 9.

## HIGH

**H1. Текст ADR-0030 не проходит `docs:quality`.**
`markdownlint-cli2` с конфигом GM на извлечённом тексте:
`MD032/blanks-around-lists` на «Admission extends … instead of copying them:» + список
(план 446-447). Нужна пустая строка перед `- exact identity…`. После merge байты неизменяемы.
Уверенность 10. cspell по обоим ADR и разделу CMS: 0 замечаний.

**H2. Host-шаблон CMS не компилируется.**
Где: 9.1, стр. 1362-1367.
tsc7 и 5.8.3: `TS2339: Property 'prepared' does not exist on type 'AssemblyPreparationResult…'`.
Сужение после `if (…) throw` на верхнем уровне не действует внутри поднимаемой
`function construct`. Правка (тот же смысл, компилируется):

```ts
if (preparation.status === "failed") throw new ConstructionFailed(preparation);
const { prepared } = preparation;
// внутри construct: await prepared.run({ signal, scope: attempt.resources })
```

Ошибка в байтах CMS стоит новой ревизии и двух миграций пинов. Уверенность 10.

**H3. Раздел 9.2 пропускает нормы CMS, которые ADR-0031 делает ложными.**
Нужно перечислить и переписать:
- `common-assembly.md:217-220`: `prepare({ composition, factories, roots })`, handles покрывают
  selections (после решения C1);
- `:235-246`: в захватываемый конверт входит карта `inputs`; задать границы алиасов входов (в
  прототипе это `rootKeys`: 128 байт, 1024 записи, отдельно от roots);
- `:266`: «Exactly one invocation per selected implementation» → «per selected non-input
  implementation»;
- `:291-297`: фаза `inputs`, входы не попадают в `created`;
- `:46`: «Host owns permissions, resources…» — указать, какое предложение заменяется («было»);
- `packages/assembly/README.md:14,24-26` (`{ signal }`, `run({ signal })`) — этот README уходит в
  npm-архив, а GM-3 его не упоминает.

Раздел 9.3 «Dynamic instances» (80-100 строк нормативного текста) дан только тезисами. Текст нужно
отревьюить до GM-6. Уверенность 8.

**H4. Шаги релиза расходятся с кодом EF и GM.**
Где: GM-3 dry-run (1167-1178), REL (1232-1242).

а) Нет `pnpm assembly:build` перед `public-api-promote-release`. Экстрактор читает
   `packages/*/dist/index.d.ts` (`public-api-compatibility.yaml`), процедура 0.2.0 его делала
   (`gm02-api-erratum.md:162-167`). Команду нужно звать как
   `pnpm exec agent-teams-foundation public-api-promote-release --consumer . --json`.

б) Проверка `release-owned-files.mjs` срабатывает только при `GITHUB_EVENT_NAME=pull_request`
   (последние строки файла). Ей нужен `origin/main` для `git diff origin/${base}...HEAD`.
   Без этого она no-op. Утверждение «иначе… ожидаемо отвергается» неверно. В окружение
   dry-run добавить `GITHUB_EVENT_NAME=pull_request` и `git fetch origin main`.

в) Dry-run в GM-3 проходит раньше пакета resources. Его нужно повторить на финальном main
   перед REL: переход `0.0.0` → `0.1.0`, `CHANGELOG.md`, правило версии leaf, packed-тесты.

г) Синтаксис `architecture-decisions-promote-baseline [--consumer <path>] [--json]` проверен
   (`cli-arguments.js:76`), пометку «не проверено» снять.

д) В EF 1.5.1 нет диагностики неиспользованных `approvedBreakingChanges`
   (`analyze-public-api-compatibility.js:22-24`). Решить явно: удалить запись в REL.

е) По ADR-0027 перед `release:version` обновить инвентарь registry.

Уверенность 9.

**H5. Последовательность R-1 и TEST-1 замкнута, детали загрузки опущены.**
Где: 1244-1261, 1651-1677, таблица 1698-1699.
- TEST-1 берёт «retained-архивы R-1» и при этом стоит до R-1. Нужно разделить шаги:
  - R-1a: один `pnpm pack` с merged SHA на Node 24, хеши, запись намерения;
  - TEST-1 и черновая ветка AR;
  - ревью владельца;
  - R-1b: загрузки.
- TEST-1 выполняется один раз для тройки, а не «для каждого пакета».
- Загружать ровно retained-файл:
  `npm publish ./get-modular-<name>-<v>.tgz --tag candidate-0-3-0 --access public`.
  Не из каталога: npm не переписывает `workspace:*`.
- `latest` переводить только после всех трёх загрузок и проверок. Иначе `latest` = Core 0.3.0
  при Assembly 0.2.0 даёт вторую копию Core (как в 0.2.0: «latest pending until the pair is
  complete»).
- Не определено, какие команды черновой ветки AR должны пройти до загрузки, пока AR-0 не готов.
  Предлагаю: typecheck, тесты ordinary host, packed consumer на `file:`; гейты C0, L0 и пина
  исключены.
- Где запускается proof на Node 26.10: локально только 26.9.0, нужен hosted worker, как в 0.2.0.

Уверенность 8.

## MEDIUM

**M1. Прототип не проходит `lint:typed` GM.**
Та же команда на исходниках kernel и Assembly: 0 ошибок.
- resources (`pkg/src`): 46 `curly`, 5 `no-confusing-void-expression`, 7
  `no-unnecessary-condition`, 2 `promise/always-return`, 1 `no-floating-promises`
  (`Promise.prototype.then.call`, `scope.ts:373`), 1 `strict-boolean-expressions` (`reason?.aborted`),
  1 `unicorn/no-useless-undefined`. Находки «error type» вне репозитория не проверены.
- Патч Assembly: `runAttempt` complexity 22 > 20 (`run.ts:89`), одно лишнее приведение
  (`bind.ts:20`). Нужно вынести шаг входов в helper.

Строки `mutate.py` после правок не совпадут. В GM-3 и GM-4 записать: «`lint:typed` зелёный;
16 мутаций перепрогнаны на финальном коде, результат в PR». Уверенность 9.

**M2. T не реализуем как написан.**
- «`scoped()` в `bindFactory` Assembly 0.2.0»: в workspace есть только 0.3.0, в packed consumer
  Assembly нет. Алиас npm сломает допуск lock.
- Замена проверена на 7.0.2 и 5.8.3 (`legacy-probe.ts`):
  `declare function bindLegacy<D>(f: (d: D, c: { readonly signal: AbortSignal }) => Promise<unknown>): void;`
  и `// @ts-expect-error` над `bindLegacy(scoped("m", async () => 1))`.
- Вывод `deps` через `scoped` + `bindFactory` на 5.8.3 не покрыт: packed-root без Assembly.
  Добавить в `resources:typecheck` прогон `typescript-minimum`.

Уверенность 9.

**M3. GM-1 и GM-4 не дают точных значений, которые допуск сравнивает побайтно.**
- Не заданы строки `resources:*`. `CHECK_COMMANDS` (`lifecycle-candidate-admission.mjs:41-51`) и
  порядок `ROOT_SCRIPT_COMMANDS` (`feature-module-standard-profile.mjs:91-130`) сравниваются
  точно. Также не заданы `REQUIRED_TESTS` и entrypoints dev-границы.
- Класс `public` не определён. Сейчас `prohibitedFields`, `carrierShapeViolations`, `exportMap`
  и `type` проверяются по имени только для core и kernel (`production-artifacts.mjs:186-201,
  503-507`). Нужно перечислить правила класса: `publishConfig` и `repository` точные, как в
  `assemblyManifestViolations`.
- Список builtins (1196-1197) не совпадает с шаблоном kernel: нужны `node:fs/promises` и
  `node:module` (`source-dependencies.yaml:404-412`).
- A1-A4 требуют собранного Assembly: записать зависимость `resources:check` от `assembly:build`.
- `engines`: добавить resources в `tests/governance.test.mjs:296`, а не импортировать
  `architecture/` в тест пакета.
- `localExtensions.authority` задаётся путём ADR, а не id.

Уверенность 8.

**M4. Неполный список литералов GM-3.**
- `tests/feature-module-standard-profile.test.mjs:899`: случай `{version:"0.3.0"}` и регэксп
  текста `production-artifacts.mjs:249`.
- Места AT и AS не названы. AT должен попасть в `tests/assembly/types.ts` и
  `types-positive.ts`: их гоняет `testAssemblyTypes`, 5.8.3 и 7.0.2 × NodeNext и Bundler. AT
  реализуем: `at-probe.ts`, все `@ts-expect-error` срабатывают в обоих компиляторах.

Уверенность 9.

**M5. Наблюдаемые детали API не записаны.**
- Безымянные записи получают `#<n>`: счётчик на scope, общий для setup, use и child. Корень по
  умолчанию называется `"scope"`. Оба значения видны в `Debt.path`, и на них опираются R10 и R14.
- `setup()` с плохим spec бросает синхронно, а не отклоняет Promise.
- В `scoped` синхронный throw фабрики снимает слушатель; в псевдокоде 6.3 этой ветки нет.

Записать это в README и 6.3. Уверенность 8.

**M6. Экспорт.**
- `export type *` прототипа экспортирует `DebtState`, которого нет в закрытом списке ADR-0030
  (355-358). Нужен явный список, как у kernel.
- У классов ошибок публичные конструкторы (`new ScopeCloseError(report)` в эскизе AR 10.4), а
  объявления 4.2 их не содержат. Добавить сигнатуры.

Уверенность 8.

**M7. Прототип не сохранён в долговременном месте.**
Он лежит только в сессионном `/private/tmp/.../scratchpad`. План ссылается на него как на
источник кода и доказательство мутаций (150-155, 1073). Скопировать в
`plans/evidence/module-resource-scopes-prototype-v2/` с SHA-256. Уверенность 8.

**M8. GM-REQ-012 и `scope`.**
Требование закреплено (`accepted-authorities.json`). План 2.3.6 обосновывает только
`resources`, но не непрозрачный `scope: unknown` у каждой фабрики. Отклонённая альтернатива
ADR-0031 «opaque `context: X` for every factory» читается как противоречие решению. Добавить в
ADR-0031 абзац, почему `scope` не «global context»: значение на run, Assembly его не читает, его
читает только `scoped()`, правило CMS 9. Уверенность 6.

## LOW

- **CMS 1425-1426.** Замена даёт «…or G1 public qualification or G1 public qualification», а
  исходная фраза разорвана переносом после «cannot». Нужен точный текст «было → стало».
- **CMS `:192-197`.** Устаревшая ссылка на пин AR `669a750d`/`e6cd8d…`; фактический пин
  `9c722ce`/`33b41d5`. Исправить в той же ревизии.
- **`README.md` ревью (109-126):** `run({ signal, owner, inputs })`, `run({ owner })`,
  `ModuleFactory`, «одним поколением Core 0.3.0».
- **Дизайн:** тест 6 «`use(x)` освобождает x» (стр. 362) и строка «освободить и бросить» (281)
  противоречат Q14; раздел 13 не содержит Q14.
- **Пути AR:** файлов `ordinary-agent-runtime-host.ts`, `darwin-contained-turn-deployment.ts` и
  `ordinary-runtime-assembly.ts` по два. Цитируемые строки относятся к `src/features/...`; дать
  полные пути.
- **S1:** абсолютные бюджеты (3 с и 2 с) на Windows-раннере могут флапать. Надёжнее сравнивать
  время первой и последней тысячи. Локально: 50 тыс. детей создаются за 80 мс и закрываются за
  163 мс.

## Проверено и верно

- Тест `ownership-checkpoint`:
  - в `ac49bb3` нет ADR-0028;
  - в `ac49bb3` обе версии `0.2.0`;
  - байты ADR-0028 последний раз менялись в `610e595`.
- Отпечаток EF исключает `status` и `superseded_by`.
- Схема метаданных GM допускает `superseded`.
- Флаги `docs:new` и slug ADR-0030 совпадают со ссылкой CMS.
- `binding.unknown-provider` для AS5.
- AS3: все 12 некорректных форм входов дают `invalid-inputs`, getter не вызван ни разу.
- Компиляция пакета под `tsconfig.base.json` GM (`isolatedDeclarations`, `ESNext.Promise`)
  проходит в 7.0.2 и 5.8.3 при спецификаторах `.js`. Прототип использует `.ts`: заменить при
  переносе.

## Чеклист правок плана

1. [ ] C1: решить модель input handle и исправить ADR-0031, 5.1, 5.2, AS4 и CMS 217-220 до GM-2.
2. [ ] H1: пустая строка перед списком в «Admission evidence» ADR-0030.
3. [ ] H2: исправить Host-шаблон CMS; добавить компиляцию шаблона в тесты GM-6.
4. [ ] H3: полный список правок CMS (217-246, 266, 291-297, 46) и `packages/assembly/README.md`
   в GM-3; текст 9.3 на ревью.
5. [ ] H4: в REL и dry-run добавить `assembly:build`, `pnpm exec`, `GITHUB_EVENT_NAME` и fetch,
   повтор dry-run перед REL, обновление registry, решение по approval.
6. [ ] H5: разделить R-1a/R-1b; загрузка retained `.tgz`; `latest` после всех трёх пакетов;
   критерии черновой ветки AR; среда для Node 26.10.
7. [ ] M1: `lint:typed` и complexity в критериях GM-3 и GM-4; перепрогон мутаций.
8. [ ] M2: заменить проверку T для 0.2.0; добавить 5.8.3 в `resources:typecheck`.
9. [ ] M3: точные строки команд, `REQUIRED_TESTS`, правила класса `public`, builtins,
   entrypoints, `governance.test.mjs:296`.
10. [ ] M4: строка 899 FMS-теста и файлы для AT и AS.
11. [ ] M5-M6: авто-имена, имя корня, sync throw, явный список экспорта, конструкторы ошибок.
12. [ ] M7: сохранить прототип с хешами.
13. [ ] M8: абзац ADR-0031 о GM-REQ-012.
14. [ ] LOW: CMS 122 и пин AR, README ревью, дизайн Q14, полные пути AR, S1.
