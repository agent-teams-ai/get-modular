# Динамические модули: итоговый дизайн (от потребителей и замеров)

Дата: 2026-10-01. Статус: предложение, не ADR. Базы: get-modular `9c722ce`, agent-runtime `b0bcb265`,
orchestrator `d5c38e7`, platform `a3ce96e`, modularity-host-TEST `fcc10b2` (все `origin/main`, кроме TEST).
Эксперименты лежат в `scratchpad/foundation/dyn-final-b/`, как их воспроизвести — в `RESULTS.txt`. Окружение:
Node v26.9.0, `tsc7` 7.0.2, опубликованные core/assembly 0.2.0. Прототипы: Assembly 0.3.0 (`asm/`), resources из
плана (`res/`) и его вариант O(1) (`resfast/`), kernel собран из исходников.

## 1. Какая динамика реально нужна (факты)

| Потребность | Доказательство | Что требуется от GM |
|---|---|---|
| Целый граф на пару tenant/project | AR `default-agent-runtime-host.ts:49-62`: compile → bind → prepare → run на каждую попытку; `ordinary-agent-runtime-host.ts:27` `scope: {tenantId, projectId}`; данные экземпляра приходят замыканиями (`:56-89`) | экземпляр графа, который получает свои данные |
| Ход (turn) | `ordinary-engine.ts:223` `flights = new Map`; бюджет 45 с (`:77`); при dispose flights освобождаются **параллельно** (`:264`) | child scope на операцию, не подграф |
| Darwin-сессия | «Fixed direct factories, outside scoped module adoption» (`darwin-contained-turn-deployment.ts:54`); `acquire` **синхронный** (`:106`) | child на сессию; асинхронный run не подходит |
| Lazy | `await import` внутри адаптеров (`claude-agent-sdk-contained-turn-provider.ts:47`) | ничего |
| Замена | есть только в TEST, заменяется весь Host, prepared «never cached» (`modularity-host-TEST/docs/lifecycle-kernel-l2c1.md:23-24`) | рецепт для Host |
| orchestrator | «Never create a container or long-lived scope per tenant, project, team, task, run, or runtime session» (`composition-and-dependency-injection.md:124-125`); допускаются только время жизни процесса и операции (`:183-186`) | операция = child scope |
| platform | «runtime plugin discovery is forbidden» (`…/06-project-provisioning-binding-state-machine.md:213`) | — |

Подграф на сессию сегодня не нужен никому. Реально нужны три вещи: много экземпляров целого графа, операции
с child scope и замена экземпляра целиком. На масштабе главный риск — цена экземпляра и поведение дерева scope
при тысячах детей, а не отсутствие «живого графа».

## 2. Замеры (медианы)

| Граф | compile | bind | prepare | run | полный путь / run |
|---|---|---|---|---|---|
| DAG, 15 модулей (размер AR) | — | — | — | 0,028 мс | 2,06 мс, ≈74× |
| DAG, 50 модулей (97 связей) | 2,48 | 0,23 | 3,11 | 0,075 | 78× |
| цепочка, 300 | 12,0 | 1,12 | 12,5 | 0,45 | 58× |
| DAG, 300 модулей (590 связей) | 15,0 | 1,37 | 18,6 | 0,48 | 74× |

- Prepare стоит примерно как compile: он повторно компилирует план.
- 1 000 одновременных экземпляров DAG-50 с асинхронными фабриками: prepare один раз, дальше run — 0,10 мс на
  экземпляр; bind + prepare + run на каждый — 3,4–3,7 мс; вместе с compile — 5,9–6,2 мс. Для 1 000 tenant по 300
  модулей это ≈35 с CPU служебной работы GM против ≈0,5 с.
- Вложенный run стоит столько же, сколько верхний. Патч owner + inputs не меняет время.
- Память: prepared — 65 и 279 КиБ (50 и 300 модулей); пустой child scope — 1,95 КиБ; с одной записью — 2,4 КиБ.
  Брошенная ячейка из 4 модулей держит 3,9 КиБ, закрытая — 0.
- **Дерево scope из плана реализации квадратично.** Создание child стоит 14 мкс при 1 тыс. детей, 53 мкс при
  10 тыс. и 430–590 мкс при 40 тыс. Причина: каждый child вызывает `addEventListener` на сигналах родителя, а стоимость
  этого вызова растёт с числом слушателей (с 5,6 до 50 мкс). Если родитель рассылает abort по собственному реестру
  детей, а записи хранит в `Set`, создание стоит 1,6–2,2 мкс, закрытие — 4–5 мкс, и так до 40 тыс. Семантические тесты
  прототипа дают одинаковый результат на обоих вариантах.
- Закрытие tenant с 1 000 сессий, cleanup каждой — 1 мс: строгий LIFO занимает 1,17 с, конкурентное закрытие сессий — 5 мс.
- Kernel: `quiesce` 10 тыс. поколений за один такт — 1,3 мс; `beginCall` + `release` — 0,39 мкс.
- Drain при постоянном трафике (вызов каждую 1 мс, длительность 3–23 мс):

| Рецепт Host | Старое поколение опустело | Отказы |
|---|---|---|
| `activate(new)`, смена route, `quiesce(old)` — в одном такте | за 14–18 мс | 0 |
| `quiesce` → `await` 10 мс → смена route | за 14 мс | 8 |
| заёмщик закреплён за старым поколением, без quiesce | **за 3 с не сошлось** | — |
| то же с quiesce | за 14 мс | 131, все явные |
| 5% вызовов — стримы по 10 с, без дедлайна | **не сошлось** | — |
| те же стримы, дедлайн Host 200 мс → `retire` → close | за 200 мс, complete | 4 отозваны |

## 3. Атаки на варианты

A — без изменений (пересборка на каждый экземпляр, `scoped(parent…)` с защитой от повтора); B — `run({ owner })`;
C — `run({ owner, inputs })` + `bindInput`; D — разделы и фасады внутри GM.

| Атака | Результат |
|---|---|
| Утечка между сессиями | A: одна prepared-сборка, две run; закрытие сессии 1 освободило оба соединения, третья run упала с `factory-threw`. B и C: 1 000 параллельных run изолированы, run без owner падает с `TypeError` до тела фабрики |
| Смешение входов | A и B: через замыкание обе run увидели `s2`. В B обход через `WeakMap<owner>` у Host не типизирован. C: нет поля во входе → `failed/inputs` до первой фабрики, `created = 0` |
| Устаревшая ссылка | Во всех вариантах сырой root после `retire` и close остаётся вызываемым, kernel видит `calls = 0`. Защищает только правило: через границу экземпляра — фасад, внутри — заёмщик в child scope поставщика. D ломает identity и stateful handle |
| Drain не сходится | Решает Host: атомарная смена route, quiesce, одно перечитывание route, дедлайн (раздел 2) |
| Брошенные подграфы | Видны в отчёте родителя; закрытие родителя освободило 20 тыс. ячеек за 155 мс — только на O(1)-дереве |
| Гонка drain и допуска | Закрытие tenant при 200 run в полёте: complete за 12 мс, run возвращают `cancelled`, `child()` бросает `scope-closed` |
| Сбой обновления на середине | Кандидат упал на модуле 7 из 10: освобождено 7..1, route остался на v1, поколение retired |

Оценки (надёжность / уверенность): A 6/8, B 8/8, **C 9/7**, D 5/7.

## 4. Решение: C плюс правки дерева scope; разделы и замена — рецепты Host

**Модель:** неизменяемый план → один prepare на пару (профиль, набор фабрик) → экземпляр = run в своей ячейке
(child scope) с owner и типизированными inputs → замена = новый экземпляр + атомарная смена route + quiesce +
закрытие старого.

Почему C, а не B:
- run дешевле пересборки в 30–78 раз;
- смешение входов исключено структурно;
- родитель передаёт порты вниз объявленными slot'ами. Так же устроен Dagger: subcomponent «can depend on any object
  that is bound in its parent component», а `@BindsInstance` — «binding an instance to some key within the component»
  ([1](https://dagger.dev/dev-guide/subcomponents.html), [2](https://dagger.dev/api/latest/dagger/BindsInstance.html));
- нужен один релиз Assembly вместо двух (каждый стоит AR нового evidence);
- есть реальный первый потребитель — Host AR на tenant/project.

D отвергнут: в GM ушла бы политика, а это противоречит `system-boundary.md:69` и ADR-0029.

**Assembly 0.3.0** (прототип: +91/−29 строк; `tsc7` подтверждает все `@ts-expect-error` в `types-fixture.ts`):

```ts
export type FactoryContext = { readonly signal: AbortSignal; readonly owner: unknown }; // только время жизни
declare const input: unique symbol;
export type InputHandle<C, D extends ModuleDeclaration = ModuleDeclaration> =
  FactoryHandle<C, D, FactoryCapabilities<C, D>> & { readonly [input]: true };
export type InputHandles<C> = Readonly<Record<string, AnyFactoryHandle<C> & { readonly [input]: true }>>;
export type RunInputs<N> = { readonly [K in keyof N]: N[K] extends FactoryHandle<infer _C, infer _D, infer I> ? I : never };
export type RunOptions<N = {}> = { readonly signal?: AbortSignal; readonly owner?: unknown; readonly inputs?: RunInputs<N> };
export type PreparedAssembly<R, N = {}> = { readonly run: (...o: {} extends N ? [options?: RunOptions<N>]
  : [options: RunOptions<N> & { readonly inputs: RunInputs<N> }]) => Promise<AssemblyOutcome<R>> };
// Assembly<C>:
bindInput<const D extends ModuleDeclaration & { readonly slots: readonly [] }>(d: D & ValidDeclaration<C, NoInfer<D>>): InputHandle<C, D>;
prepare<const R extends RootHandles<C>, const N extends InputHandles<C> = {}>(i: AssemblyPrepareInput<C, R, N> /* + inputs?: N */):
  Promise<AssemblyPreparationResult<R, N>>;
// коды: "assembly.prepare.inputs"; "assembly.run.invalid-inputs" (phase "inputs")
```

Input — обычный выбранный модуль без slots. Core его проверяет, поэтому `binding.missing` для портов родителя
пропадает. Значение входа — запись capability. Её точные own data keys проверяются до первой фабрики, сама фабрика
для входа не вызывается. Каждый handle входа получает ровно один alias. `owner` Assembly не читает, не ждёт и не
замораживает: Proxy-ловушки сработали 0 раз.

**resources 0.1.0, до первого релиза:**
1. `scoped(name, factory)`: родитель берётся из `ctx.owner` с проверкой бренда (план, раздел 3.6).
2. Инвариант 15: child не подписывается на сигналы родителя, родитель рассылает abort и escalate по своему реестру,
   записи лежат в `Set`. Attach и detach — O(1). Прототип: +30/−15 строк.
3. `child({ name?, order?: "reverse" | "concurrent" })`. При `"concurrent"` записи scope освобождаются одновременно;
   это для независимых пиров (сессий, ходов, ячеек), остальное остаётся LIFO. В OTP так же: «As a simple_one_for_one
   supervisor can have many children, it shuts them all down asynchronously», а остальные дети — «in reversed start
   order» ([supervisor](https://www.erlang.org/doc/apps/stdlib/supervisor.html)). AR уже делает так
   (`ordinary-engine.ts:264`). Без этой опции перенос flights на resources стал бы регрессией.

**Kernel и Core не меняются.** Рецепт замены для CMS:

```ts
const cell = host.resources.child({ name: `orders:${rev}` });
const gen = kernel.stage(); const custody = value(kernel.retainCustody(gen));
const out = await prepared.run({ signal: cell.resources.signal, owner: cell.resources, inputs });
if (out.status !== "succeeded") { await cell.control.close(); kernel.release(custody); kernel.retire(gen); return; }
kernel.activate(gen); const old = route.current; route.current = { gen, roots: out.roots, cell }; kernel.quiesce(old.gen); // один такт
// фасад: route → beginCall без await; при отказе перечитать route один раз; checkCall после каждого await
// дедлайн → retire(old) → close старой ячейки → при complete release(custody), finishRetirement
```

**Защита от мешка сервисов.** Контекст фабрики описывает только время жизни. `owner` имеет тип `unknown`, поэтому
`ctx.owner.db` не компилируется (это проверяет type-тест). `owner` читает только `scoped`, и только после проверки
бренда. Данные и порты попадают в модуль только через input-декларации, поэтому они видны в плане, проверены Core и
типизированы. Правила CMS: капабилити на входе — узкий порт, а не реестр с `get(key)`; lint запрещает обращаться к
`ctx.owner` вне `scoped`. Generic-контекста нет.

| Часть | src | тесты | docs |
|---|---|---|---|
| Assembly owner + inputs | +91/−29 | ~250 | ~120 (CMS «Dynamic instances», миграция) |
| resources: O(1) + `order` | +30/−15, ~25 | ~100 | ~20 |
| kernel, Core | 0 | 0 | рецепт ~40 |
| TEST Host | 200–300 | — | — |

## 5. Тесты, которые должны падать при регрессии

1. Две параллельные run одной prepared-сборки с чередованием через барьер: каждая фабрика видит только owner и
   inputs своей run. То же на 1 000 run.
2. Закрытие ячейки 1 освобождает только её записи, в обратном порядке зависимостей; ячейка 2 цела; третья run
   работает (регрессия `scoped(parent…)`).
3. Run без owner: `TypeError` до тела фабрики, ресурсов получено 0. Owner-Proxy: ловушек 0.
4. Неверные inputs (alias, ключи, getter) дают `failed/inputs` и 0 вызовов фабрик. Prepare отвергает непривязанный
   или дважды привязанный вход; `bindInput` со slots отвергается.
5. Type-фикстуры.
6. `getEventListeners` на сигналах родителя равен 0 при любом числе детей; 40 тыс. create/close укладываются в
   бюджет; heap после 100 тыс. циклов не растёт.
7. `order: "concurrent"`: пиры закрываются одновременно; abandon и escalate доходят до всех; долги в отчёте.
8. TEST Host:
   - замена под трафиком — 0 отказов;
   - сбой кандидата на модуле k — route остаётся на старом, освобождено k..1;
   - закреплённый заёмщик получает явный отказ;
   - закрытие tenant при run в полёте завершается.

## 6. Миграция AR

```ts
const ordinary = memo(prepareOrdinary); // bindFactory + bindInput + prepare: один раз на процесс и вид композиции
const root = createScope({ name: `ordinary-host:${tenantId}/${projectId}`, signal });
const out = await (await ordinary()).run({ signal, owner: root.resources,
  inputs: { host: { "ordinary/host-options": options, "ordinary/journal": journal } } });
```

- `security`, `providerAccess` и `provider` переходят на `scoped(...)` и берут pool, scope и пути из slot входа;
  `cleanups` и `getCodex` уходят (план, раздел 8.4). Выигрыш по CPU ~2 мс на Host, главное — один путь кода.
- Ход остаётся операцией внутри `ordinary/turn`. Если переводить его на scope, то так:
  `child({ name: "flights", order: "concurrent" })` и по child на операцию.
- Darwin: `sessions` с `order: "concurrent"`, синхронный `acquire` остаётся, хука конца сессии по-прежнему нет
  (раздел 8.5). Lazy-импорты не меняются.

## 7. Сейчас и потом

**Сейчас**, одной поставкой с ADR-0030:
- Assembly 0.3.0;
- resources 0.1.0 (`scoped(name)`, O(1), `order`);
- раздел CMS «Dynamic instances» (рецепты, правила против мешка сервисов);
- TEST-сценарии из раздела 5.

| Отложено | Триггер |
|---|---|
| Хелпер route/фасада в GM | второй Host копирует рецепт |
| Пометка input в схеме Core | инструменты или плагины должны видеть входы; делать вместе со следующим поколением формата Core |
| Ленивый AbortController в scope | больше 100 тыс. живых scope или больше 10% heap |
| Иерархия поколений в kernel | quiesce поддерева выходит за бюджет такта |
| Параллельная сборка внутри run | замер покажет, что время экземпляра определяет IO независимых фабрик |
| Ограничение параллелизма при `concurrent` | больше 1 000 тяжёлых cleanup одновременно |
| Кэш prepared, живой граф, hot reload в процессе | никогда в GM |

## 8. Риски и непроверенное

- `inputs` появляется раньше потребителя с высокой частотой экземпляров. Смягчение: проверка на AR и в TEST;
  на 0.x API можно поправить minor-релизом.
- Через вход-«реестр» можно протащить locator; остаются ревью и правило в CMS.
- Если передать один owner в две run, их времена жизни сольются. Это задокументировано, но ничем не enforced.
- AR придётся поднять Core 0.1 → 0.2 и Assembly 0.1 → 0.3; объём evidence не проверен.
- Kernel пока кандидат (ADR-0029), поэтому рецепт замены проверяется только в TEST.
- Замеры синтетические, без IO. Частота создания Host и ходов в AR не измерена, O(n) у `addEventListener` на
  Node 24.x не проверено.
