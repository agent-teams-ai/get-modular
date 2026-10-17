# Тест «агенты пишут модуль только по типам и README», раунд 2

Варианты: `b-snapshot` (кандидат) и `a-keys` (контроль). Вариант C снят после раунда 1 (`archive/round1-c-atomic/`).
Девять заданий по умолчанию, одинаковых для обоих вариантов (`e-sessions` вне списка по умолчанию, запускается по имени):

| Задание | Что проверяет поведенческий сценарий |
| --- | --- |
| `a-logger` | изменение сразу после фабрики не теряется; освобождение при закрытии |
| `b-catalog` | пока грузится новый регион, `loading`, а не старые модели; поздний результат старого региона не показывается; отмена устаревшего fetch; ошибка текущего региона |
| `c-pricing-context` | производный store: одна функция маппинга; сбой обработчика ребёнка доходит до `deps.errors.report`; один commit на одно изменение |
| `d-greeter` | только чтение: нет подписки и нет следования за изменениями |
| `e-async-factory` | реальный `await` в фабрике: изменение во время `await` не теряется |
| `e-sessions` | подписка живёт ровно столько, сколько сессия: `child()` на сессию, 1100 сессий не копятся, `end()` освобождает |
| `f-watch-and-load` | `watch` и `load` одного ключа в одном модуле: разные имена, нет устаревших данных |
| `g-hierarchy` | родитель владеет производным store, ребёнок следит и просит через командный порт; принятая скидка не сбрасывается |
| `h-requests` | `convert()` берёт текущий курс и не добавляет регистраций; регистрации в store растут не больше чем O(открытых тикеров) и после закрытия всех возвращаются к базовому уровню модуля (постоянная подписка модуля разрешена); закрытый экран больше ничего не получает и собирается GC; бросающий экран не останавливает остальные. Подходит и `child()` на тикер, и одна подписка с раздачей по экранам |
| `i-errors` | ошибка обработчика доходит до порта ошибок Host один раз и с именем; `reportError` своего store подключён к `deps.errors.report` |

## Файлы для писателя

Для варианта `<V>` (`b-snapshot` или `a-keys`) и задания `<T>` дать только:

- `<V>/README.md`
- `<V>/api.d.ts`
- `.toolchain/node_modules/@get-modular/resources/README.md` (scope-библиотека за `resources`)
- `tasks/<T>.md`
- `tasks/<T>.types.ts`
- `tasks/<T>.skeleton.ts`

Не давать: `<V>/type-tests.ts`, `reference/`, `tasks/scenarios/`, `tasks/fakes/`, `tasks/*.accept.ts`, `runtime/`,
`runtime-b/`, `GRADING.md`, `runs/`, `archive/`, другой вариант.

## Шаблон промпта писателя

Подставить `<ROOT>` (абсолютный путь к `api-shape`), `<V>`, `<OUT>` (новый пустой каталог на каждый прогон) и
список заданий `<TASKS>`. Режим выбрать один: `check` или `blind`.

```text
You are writing modules for a TypeScript library. Read only the files listed below; do not open any other file
under <ROOT>.

Library documentation:
- <ROOT>/<V>/README.md
- <ROOT>/<V>/api.d.ts
- <ROOT>/.toolchain/node_modules/@get-modular/resources/README.md (the scope library behind `resources`)

Tasks, in this order: <TASKS>. For each task <T>:
- read <ROOT>/tasks/<T>.md, <ROOT>/tasks/<T>.types.ts (fixed types, do not change them) and
  <ROOT>/tasks/<T>.skeleton.ts (start from it);
- write the solution to <OUT>/<T>.ts, keeping the exported function signatures of the skeleton. The solution
  imports "./<T>.types.js", "@get-modular/observation" and "@get-modular/resources".

MODE check: after each task run `<ROOT>/check.sh <V> <OUT> <T>` and fix your file until the task prints PASS.
Do not read check.sh or any file it uses; treat its messages as a reviewer's findings.
MODE blind: do not run any checker. Stop when you believe each module is correct.

When you are done, reply with:
1. the paths of your files;
2. for each task, anything in the documentation that was unclear, missing or contradictory, quoting the line.
```

Удалить из шаблона строку неиспользуемого режима.

## Проверка

```sh
./check.sh <V> <OUT>            # девять заданий по умолчанию
./check.sh <V> <OUT> b-catalog  # одно задание
```

По каждому заданию три шлюза, PASS только при всех трёх:

1. правила (`tools/static-rules.mjs`):
   - нет `any`, `as`-приведений и `@ts-` директив;
   - вызван нужный член API (для `h-requests` только `read` и `watch`, без требования `child()`);
   - `fetchModels` и `fetchHolidays` вызываются только в загрузчике;
2. компиляция типов задания, решения и `tasks/<T>.accept.ts` на `tsc7` и TypeScript 5.8.3;
3. поведение: сценарий `tasks/scenarios/<T>.scenario.mjs` на исправленной runtime-заглушке. Он выводит, какое
   поведение нарушено, но не подсказывает код.

## Что ещё смотреть вручную (смысл, который сценарий не меряет)

- Копия функции маппинга вместо одной общей (`c-pricing-context`, `g-hierarchy`): это риск, а не ошибка, если поведение верно.
- `b-catalog` и `f-watch-and-load`: ручное сравнение ревизий в getter вместо `onLoading` допустимо, если сценарий
  проходит. Это не штраф (пункт раунда 1 о «ручном сравнении» был ошибкой рубрики и удалён).
- Имена подписок не по соглашению `"<module>/<purpose>"`.
- `try/catch` вокруг обработчика, который превращает ошибку в `console.*`: сценарий `i-errors` это ловит, в
  других заданиях отметить вручную.

## Предлагаемый прогон

Одна модель и одни настройки на прогон, новый контекст и новый `<OUT>` на каждый прогон, девять заданий по порядку:
`a-logger b-catalog c-pricing-context d-greeter e-async-factory f-watch-and-load g-hierarchy h-requests i-errors`.
По 3 прогона на пару (модель, вариант) для меньшей и большей модели, в режимах `blind` и `check`.

Метрики:
- доля PASS в `blind`;
- число итераций до PASS в `check`;
- какие шлюзы падают;
- жалобы на документацию.

Эталоны лежат в `reference/<V>/`. Намеренно неверные решения, которые обязаны падать, лежат в `reference/negative/`.
