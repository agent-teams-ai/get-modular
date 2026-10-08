# Динамические модули: итоговый дизайн (линза «проверенная индустрией масштабируемая модель»)

Дата: 2026-10-01. Статус: предложение для решения владельца, не ADR. База: get-modular `9c722ce`,
agent-runtime `origin/main` `b0bcb265`. Прототип: scratchpad `foundation/dyn-final-a/` (Assembly 0.2.0 +
изменения ниже, прототип resources из `impl-plan/proto`, Core 0.2.0 из tarball, `tsc7` 7.0.2, Node v26.9.0).
Разделы 1–2 — проверенные факты, 3–8 — предложения.

## 0. Решение коротко

Живого графа нет. Единица динамики — **экземпляр сборки**: один `run` заранее подготовленного шаблона
(`PreparedAssembly`) под scope владельца и со **своими объявленными входами**. Замена = новый экземпляр,
переключение указателя у владельца, закрытие старого. В Assembly 0.3.0 добавляются уже принятый `run({ owner })`
и новое `bindInput` + `inputs`. Core и kernel не меняются. В resources есть обязательная правка масштаба (§3.5).

## 1. Факты

- `FactoryContext = { signal }`, `RunOptions = { signal? }` (`packages/assembly/src/features/construction/types.ts:68,77`).
  Повторные и параллельные run изолированы (`docs/architecture/common-assembly.md:266-270`). Провайдер обязан быть
  выбран в том же профиле (`binding-record.ts:44-46`), иначе `binding.missing` (`selected-bindings.ts:86-87`).
- Текст ADR-0030 (план ресурсов, §2.2; принят, в `docs/decisions/` пока нет) фиксирует `run({ signal, owner })`
  с непрозрачным `owner` и `scoped(name, factory)`. Входов данных там нет (§3.6).
- AR: на каждый tenant/project выполняется compile → bind → prepare → run (`default-agent-runtime-host.ts:48-62`).
  Pool, scope и `ownedHost` попадают в фабрики через замыкания при bind (`:54`;
  `ordinary-agent-runtime-host.ts:45,72-82`). По сути это уже шаблон с экземплярами.
- Прототип (`node --test out/isolation.test.js`): 6/6 зелёные. Три мутации ловятся: без `owner` падают R1, R2,
  R4 и R6; общий входной буфер — R1 и R2; приём лишних ключей — R3. Если в под-плане нет входного модуля, Core
  отвечает `binding.unknown-provider`; со входным модулем план компилируется.
- Стоимость (шаблон из 2 фабрик и 2 входов): prepare 0,65–1,1 мс, run 0,045–0,06 мс (14–21×). Живой экземпляр
  занимает ≈5,5–7,7 КБ.
- **Найден дефект масштаба в прототипе resources.** Каждый `child()` вешает два `addEventListener` на сигналы
  родителя. В Node добавление слушателя стоит O(n): 11 мкс при 5 тыс. слушателей, 73 мкс при 40 тыс. Из-за
  этого run растёт с 0,059 до 1,0 мс при 2 тыс. → 40 тыс. живых соседей, а close на экземпляр — с 0,021 до
  0,25 мс. Если отключить эту связку, run и close не растут (0,052→0,045 и 0,015→0,019 мс).

## 2. Индустрия

| Система | Факт (цитата, источник) | Берём / избегаем |
|---|---|---|
| Erlang/OTP | `simple_one_for_one`: «all child processes are dynamically added instances of the same process type»; `start_child` вызывает «apply(M, F, A++ExtraArgs)»; остановка «in reversed start order» ([supervisor](https://www.erlang.org/doc/apps/stdlib/supervisor.html)) | Шаблон + аргументы на экземпляр = prepare один раз + `inputs`; LIFO |
| Effect | «A `Layer<ROut, E, RIn>` describes how to build one or more services» ([Layer.ts 3.17.3](https://cdn.jsdelivr.net/npm/effect@3.17.3/src/Layer.ts)); `LayerMap` — «dynamically access resources based on a key», `idleTimeToLive` ([LayerMap.ts](https://cdn.jsdelivr.net/npm/effect@3.17.3/src/LayerMap.ts)) | Типизированные требования (`RIn`) = входы; карта экземпляров по ключу — паттерн Host |
| Backstage backend | plugin-scoped: «separate instances … for every plugin»; `createRootContext` «shared and passed as the second argument to each invocation of the `factory`»; root-scoped «can only depend on other root scoped services» ([services](https://backstage.io/docs/backend-system/architecture/services)) | Подготовка один раз, экземпляр на единицу; зависимость только от родителя к ребёнку |
| NestJS | «The REQUEST scope bubbles up the injection chain»; для тенантов — durable-поддеревья через `ContextIdStrategy` ([scopes](https://docs.nestjs.com/fundamentals/injection-scopes)) | Избегаем неявного распространения scope: граница экземпляра явная |
| Angular | «The requests keep forwarding up until Angular finds an injector that can handle the request»; Router создаёт дочерние `EnvironmentInjector` ([DI](https://angular.dev/guide/di/hierarchical-dependency-injection)) | Дочерний scope на ленивую единицу берём; неявный поиск у родителя отвергаем |
| Kubernetes | `pod-template-hash` получают из «hashing the PodTemplate»; rollout «if and only if the Deployment's Pod template … is changed»; Recreate: «All existing Pods are killed before new ones are created» ([Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)); owner references и каскадное удаление ([GC](https://kubernetes.io/docs/concepts/architecture/garbage-collection/)) | Ключ шаблона; режимы coexist и exclusive; дерево владельцев |
| VS Code | «Your extension becomes activated when the Activation Event happens»; `subscriptions`: «asynchronous dispose-functions aren't awaited» ([activation](https://code.visualstudio.com/api/references/activation-events), [API](https://code.visualstudio.com/api/references/vscode-api)) | Ленивая активация берём; async-cleanup без ожидания не допускаем |
| OSGi DS | «The static policy is the most simple policy and is the default policy»; dynamic обязан обрабатывать изменения «on any thread at any time» ([DS 8.1](https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.component.html)) | Без rebind: только новый экземпляр |
| Node | PR «module: add clearCache for CJS and ESM» (#61767) открыт (`gh`, 2026-10-01) | Выгрузку кода в процессе не обещаем |

Синтез: неизменяемый шаблон, экземпляр с явными аргументами, дерево владельцев, замена новым экземпляром.
Ломаются на неявном: поиск у родителя, распространение scope, rebind, async-cleanup без ожидания.

## 3. Модель

### 3.1 Единица и жизненный цикл

API не получает нового существительного: шаблон — это `PreparedAssembly`, экземпляр — его run. «Ячейку» и
«раздел» оставляем словами для группировок Host. Жизненный цикл, весь во власти владельца (модуль или Host):

1. **reserve**: синхронно `owner.child({ name })`, место в LIFO занимается до первого await. Для заменяемого
   экземпляра сначала `stage` + `retainCustody`.
2. **construct**: `template.run({ signal, owner, inputs })`. При отказе или отмене владелец закрывает child,
   частичная сборка закрывается в обратном порядке. Отмена: abort → дождаться run → close.
3. **publish**: владелец кладёт roots в свой указатель (Map по ключу или route).
4. **retire**: снять указатель → (для route: drain по дедлайну Host и `retire`) →
   `close({ escalate, abandon })`. При `complete` ребёнок отцепляется. Долги остаются видны, решает Host.

Вложенность (tenant → session → turn) — тот же цикл внутри модуля экземпляра.

### 3.2 Владелец, входы и провайдеры родителя

- **(a) Scope.** `run({ owner })` → `ctx.owner`, а `scoped(name, f)` открывает child у владельца этого run.
  Захвата при bind нет.
- **(b) Данные на run.** Вход — это модуль-граница: `slots: []`, ровно одна capability, значение приходит из
  `run({ inputs })`. Session id, конфиг тенанта, callback передачи Host — всё это capability со своим
  контрактом и токеном.
- **(c) Провайдеры родителя.** Модуль-владелец получает их своими обычными slots (ребро в плане родителя) и
  передаёт вниз как входы (ребро в плане ребёнка). Core проверяет оба плана, `binding.missing` не возникает.
  Владелец по зависимостям стоит после своих провайдеров, а экземпляры лежат в его scope. Поэтому экземпляр
  структурно не переживает одолженное (R6: `a2:conn, a1:conn, pool`).

### 3.3 Защита от мешка сервисов

1. `FactoryContext` закрыт: `{ signal, owner }`. Type-fixture проверяет точное множество ключей. `owner` имеет
   тип `unknown` и читается только `scoped()` (проверка бренда). Каст в продуктовом коде запрещён CMS.
2. Нет `context: X`, нет `inherit()`, нет поиска по строке. Вход — одна capability, достаётся только модулям,
   у которых slot явно привязан профилем.
3. Входы точные: нет ключа, есть лишний, есть getter — `failed`/`input` до первой фабрики, getter не вызывается.
4. CMS запрещает «bundle»-входы (`ParentServices`). Больше ~8 входов — повод для ревью границы.

### 3.4 Замена

Над одним механизмом два паттерна Host:

- **Экземпляры по ключу** (сессии, тенанты): `Map<key, instance>`, single-flight создание, вытеснение по
  простою решает Host (как `LayerMap`). Kernel не нужен, если все потребители внутри владельца.
- **Заменяемый экземпляр** (фича, плагин): route + поколение kernel на экземпляр. Coexist (как RollingUpdate):
  собрать новый, затем в одном синхронном такте `activate(new)`, `route = new`, `quiesce(old)`. После этого
  drain, `retire`, close, и только при `complete` — `release(custody)` и `finishRetirement`. Exclusive (как
  Recreate): сначала закрыть старый. Новый экземпляр создаётся тогда и только тогда, когда меняется ключ
  шаблона Host: digest плана + идентичность кода + гранты.

Фасад нужен только заёмщикам вне поддерева владельца. Это одна capability на границе: `beginCall` →
вызов → `release`, при отказе явный `unavailable`. Внутри экземпляра ссылки прямые, они пересобираются вместе
с ним. Generic Proxy запрещён: ломает identity, приватные поля и синхронные геттеры. Сменился модуль внутри
экземпляра — пересобирается весь экземпляр (`rest_for_one` на уровне экземпляра). Если это слишком крупно,
экземпляр делится на вложенные, живую мутацию не вводим.

### 3.5 Стоимость и конкурентность

- Объявления компилируются при старте: ошибки проводки видны сразу. Если код фабрик ленивый,
  `import()` + prepare выполняются при первой активации (как activation events). Run — на каждый экземпляр.
- Кэшируется `PreparedAssembly` по ключу шаблона. Он не держит состояния run, поэтому общий для всех
  экземпляров и тенантов. Держать его на самом высоком уровне, который переживает все run.
- Run между собой независимы, внутри run сборка последовательная, блокировок нет. Память — O(живые
  экземпляры × модули). Общее держать в родителе: модуль под-плана без транзитивной зависимости от входа
  поднимается выше.
- **Требование к resources 0.1.0:** abort и escalate распространяются по собственному множеству детей
  родителя, а не через `addEventListener` на каждый child. Attach и detach — O(1). Тест S1 ниже.

## 4. Варианты

| Вариант | Надёжность | Уверенность | LOC src (Assembly) |
|---|---|---|---|
| **(Рекомендую) C: `owner` + объявленные входы (`bindInput`)** | 9 | 8 | 100–160 (прототип +120/−35) |
| A: только `owner` (ADR-0030); данные через prepare на экземпляр или замыкания | 7 | 8 | ~5 |
| B: `owner` + непрозрачный `context: X` | 6 | 7 | ~10 |
| D: живой граф, `replace(module)` | 3 | 9 (что не подходит) | 1 500–3 000 |

B: X видят все фабрики, зависимости не видны в плане, ошибки только на ходу — мешок появляется сам. A
оставляет гонку замыканий, которую AR уже закрепляет. C решает (b) и (c) одним понятием, проверяемым Core.

## 5. API

**Assembly 0.3.0** (minor с migration guide, тот же релиз, что и `owner`):

```ts
export type FactoryContext = { readonly signal: AbortSignal; readonly owner: unknown }; // закрыт
export type InputHandle<C, D extends ModuleDeclaration = ModuleDeclaration>;              // непрозрачный
export type InputHandles<C> = Readonly<Record<string, InputHandle<C>>>;
export type ValidInput<D extends ModuleDeclaration> =
  D["slots"] extends readonly [] ? D["provides"] extends readonly [unknown] ? unknown : never : never;
export type RunInputs<In> = { readonly [K in keyof In]:
  In[K] extends InputHandle<infer C, infer D> ? FactoryCapabilities<C, D>[D["provides"][0]["capabilityId"]] : never };
export type RunOptions<In = {}> = { readonly signal?: AbortSignal; readonly owner?: unknown }
  & ([keyof In] extends [never] ? { readonly inputs?: undefined } : { readonly inputs: RunInputs<In> });
// Assembly<C>
bindInput<const D extends ModuleDeclaration>(d: D & ValidDeclaration<C, NoInfer<D>> & ValidInput<NoInfer<D>>): InputHandle<C, D>;
prepare<const R extends RootHandles<C>, const In extends InputHandles<C> = {}>(
  input: { composition; factories; roots: R; inputs?: In }): Promise<AssemblyPreparationResult<R, In>>;
// PreparedAssembly<R, In>.run: options обязательны, если In не пуст
// новые коды: "assembly.bind.invalid-input", "assembly.run.invalid-input" (phase "input")
```

Входной handle не может быть root или стоять в `factories` (`assembly.prepare.roots`/`handles`). Вход не
попадает в `created`: он одолжен. Значение непрозрачно. Объём: src 100–160, тесты 200–300, docs 150–250.

**Resources 0.1.0:** `scoped(name, factory)` по ADR-0030 плюс требование §3.5, без нового API.
**Kernel, Core:** без изменений. Вход для Core — обычный выбранный модуль без slots.
**CMS** (`common-assembly.md`, раздел «Dynamic instances», ~80–120 строк): правила §3.1–3.5. Фабрики не
захватывают ничего на экземпляр. Время жизни входа ≥ времени жизни экземпляра. Roots не выходят за пределы
владельца, кроме как через фасад. Без rebind. Ключ шаблона.

## 6. Тесты, которые обязаны падать при регрессии

| # | Пакет | Проверка |
|---|---|---|
| R1 | assembly + resources | Один prepared, два параллельных run с разными `owner`. Close run 1 освобождает только его записи, run 2 не тронут, третий run работает |
| R2 | assembly | 64 параллельных run с перемежением: каждый root видит только свой session id |
| R3 | assembly | Нет входа, лишний вход, getter, не-объект → `failed`/`input`, 0 вызовов фабрик, 0 вызовов getter |
| R4 | assembly | Вход не попадает в `created`. Input handle как root или в `factories` отклоняется. `bindInput` с slots бросает ошибку |
| R5 | core-fixture | Без входного модуля под-план отклоняется, со входным компилируется |
| R6 | resources | Вложенные экземпляры закрываются раньше одолженного провайдера владельца |
| T1–T7 | types | Run без `inputs`, без ключа, с неверным типом, с лишним ключом отклоняется. `keyof FactoryContext` = `"signal" \| "owner"`, `ctx.context` — ошибка. `bindInput(decl со slots)` не компилируется |
| S1 | resources | 50 тыс. живых детей одного scope: создание и закрытие child растут не больше 2× от уровня 1 тыс. |

R1–R6 и T1–T7 работают в прототипе, мутации ловятся (§1). S1 на прототипе resources сейчас падает.

## 7. Сейчас, потом, швы

**Сейчас** (одно поколение Assembly 0.3.0 вместе с `owner`, до массового `scoped()` в AR): `bindInput`/`inputs`,
CMS-раздел, исправление S1 в resources. Проверка: AR готовит шаблон Host один раз и запускает его на каждый
tenant/project со входами (pool, scope, параметры исполнения), TEST — 1 000 сессий из одного шаблона.

| Отложено | Триггер | Шов, который делает отсрочку безопасной |
|---|---|---|
| Пометка входов в плане Core (`role: "input"`) | Инструменту или второму Host нужно видеть границы по одному плану | `bindInput` — единственная точка объявления |
| Хелпер route/фасада | Два Host с одинаковым кодом route | Kernel API достаточно |
| Хелпер карты экземпляров (single-flight, простой) | Два Host | Экземпляр = run + child |
| Кэш шаблонов по ключу | Два Host | `PreparedAssembly` можно разделять |
| Параллельная сборка внутри run | Замер: независимые IO-фабрики доминируют | Последовательный контракт |
| Lint на подъём модулей без входа | Проблема памяти экземпляров | Входы видны в bindings |
| Изоляция сторонних плагинов | Первый плагин с кодом | Одна запись setup/cleanup |
| Политики рестарта (MaxR/MaxT), дедлайны | Никогда в GM | Решает Host |
| Живая мутация, инкрементальная компиляция, выгрузка кода | Никогда | Новый экземпляр, процесс |

## 8. Риски (честно)

- Под-графы на сессию сегодня не нужны ни одному production-потребителю. AR получает от входов в основном
  гигиену (нет замыканий), а не скорость.
- Если пометка входов в Core понадобится после Core 0.3.0, это будет ещё одно wire-поколение. Вопрос владельцу:
  включать ли её в 0.3.0 (моя оценка — нет, 7/10).
- Время жизни входа не проверяется типами. Короткоживущий вход в долгоживущем экземпляре — use-after-close.
  Защита только правилом и паттерном R6.
- Фасады пишутся вручную, после await возможен TOCTOU. Нужен `checkCall` перед эффектом.
- Замеры локальные и на игрушечном шаблоне, реальные модули тяжелее (не измерено). LOC ±2×.
