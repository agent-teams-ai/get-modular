# Динамические модули: синтез индустрии и модель для Get Modular

Дата: 2026-10-01. Статус: предложение для ревью, не ADR. Базы: get-modular `9c722ce`,
agent-runtime `origin/main` `b0bcb265`, modularity-host-TEST `fcc10b2`, extension-foundation
`8907b6d`. Эксперимент: Node v26.9.0, опубликованные `@get-modular/core` и `assembly` 0.2.0
(tarball SHA-256 `dd4cb159…` и `86b26f86…`), `tsc7` 7.0.2, scratchpad `foundation/dyn-industry/`.

## 1. Что есть сейчас (факты)

- Core: один полный профиль → неизменяемый план; провайдер каждой привязки — реализация из того
  же плана (`packages/core/src/features/authoring/wire-types.ts:41-68`); один экземпляр на
  `moduleId` (`profile.duplicate-selection`, `composition-semantics/profile-census.ts:50`).
  Понятия «порт от родителя» нет.
- Assembly: `prepare` повторно компилирует план (`assembly/src/features/construction/prepare.ts:146`),
  `prepared.run` многоразовый (`:158`); повторные, параллельные и вложенные run изолированы
  (`docs/architecture/common-assembly.md:266-271`). На run передаётся только `signal`
  (`types.ts:68,77`). Поколений, hot replacement и disposal нет (`common-assembly.md:24-27`).
- Граница: поколения, routing, drain, recovery — у Host; «No Get Modular API may become a service
  locator or a second lifecycle authority» (`system-boundary.md:60-70`).
- lifecycle-kernel: фазы `staged|active|quiescing|retiring|retired`, call/custody leases,
  синхронно, без callback (`lifecycle-kernel/src/features/lifecycle/types.ts:23,45-57`); новые
  вызовы удержанных потребителей после retirement вне контракта (`ADR-0029:84-88`).
- Resources (дизайн сегодня): `scoped(parent, name, factory)` связывает родителя **в момент
  `bindFactory`** (`plans/module-resource-scopes-design-2026-10-01.md:171-184`); вложенный run —
  `resources.child()` модуля-владельца (`:199`); kernel рядом (`:203-204`).
- XF ADR-0014: enable/disable/replace — новый desired profile, компиляция «complete affected
  dependency closure», новое candidate-поколение; «fenced logical replacement, not arbitrary
  JavaScript unload» (`extension-foundation/docs/decisions/0014-…md:117-134`).
- TEST Host L2c1: замена повторно допускает весь выбранный набор; «Prepared Assembly handles … are
  never cached» (`modularity-host-TEST/docs/lifecycle-kernel-l2c1.md:23-24,37`).
- AR: Host на tenant/project собирается целиком: compile → bind → prepare → run
  (`packages/apps/embedded-runtime/src/composition/default-agent-runtime-host.ts:49-62`); пул БД
  одолжен замыканием, Codex ленив через мемоизированный getter
  (`…/ordinary-session-runtime/composition/ordinary-agent-runtime-host.ts:25-26,44,64-70`).
  Turn — операция фичи, а не модуль (`…/ordinary-runtime-assembly.ts:70-73`).

Эксперимент:

- Подграф на экземпляр полным путём (bind+compile+prepare+run): ≈1.8 мс (10 модулей) и ≈7.9 мс
  (42 модуля); повторный run готового шаблона — ≈0.15 и ≈0.7 мс последовательно (~11–12×).
- Данные на run через замыкание: из 4 параллельных run все получили `s3`, если независимый модуль
  стоит раньше в `dependencyOrder`. `WeakMap` по `ctx.signal` работает, но держится на
  недокументированном тождестве signal (`run.ts:100-102`).
- Прототип `FactoryContext<X> = { signal; context: X }` + `scoped(name, factory)`: `tsc7` выводит
  `deps`, отвергает неизвестный slot и неверный тип capability.

## 2. Индустрия

| Система | Факт (источник) | Вывод для GM |
|---|---|---|
| OSGi DS | static по умолчанию; при замене конфигурация «reactivated and the replacement service is bound to the new component instance»; dynamic обязан обрабатывать изменения «on any thread at any time» ([DS 112.3.7](https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.component.html)); трекинг «surprisingly hard» ([701.2](https://docs.osgi.org/specification/osgi.core/7.0.0/util.tracker.html)) | Пересоздание по умолчанию; rebind дорог каждому потребителю |
| IntelliJ | выгрузка только при ограничениях; «Any unloading problems … will ask the user to restart the IDE» ([docs](https://plugins.jetbrains.com/docs/intellij/dynamic-plugins.html)) | Выгрузка кода — best effort, нужен путь рестарта |
| VS Code | активация по событиям ([docs](https://code.visualstudio.com/api/references/activation-events)); хост «doesn't isolate different extensions from each other» ([wiki](https://github.com/microsoft/vscode/wiki/Explain-extension-causes-high-cpu-load)); после disable/update «Restart Extensions» ([docs](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)) | Ленивость дешёвая; выгрузка = рестарт хоста |
| Erlang/OTP | `rest_for_one`: перезапуск упавшего и всех после него; `simple_one_for_one` для динамических детей одного типа ([supervisor](https://www.erlang.org/doc/apps/stdlib/supervisor.html)); при третьей версии кода «processes lingering in it are terminated» ([code loading](https://www.erlang.org/doc/system/code_loading.html)) | Политика рестарта у супервизора (Host); дети одного типа — базовый примитив |
| Spring | «Definitions in a descendant context will always take priority» ([javadoc](https://docs.spring.io/spring-framework/docs/6.2.12/javadoc-api/org/springframework/context/ApplicationContext.html)); при refresh зависимые «cannot rely on them being updated … unless it is itself in @RefreshScope» ([docs](https://docs.spring.io/spring-cloud-commons/reference/spring-cloud-commons/application-context-services.html)) | Неявная видимость родителя — ошибка; прокси только на явной границе |
| Angular | route-инжекторы не уничтожались до opt-in очистки ([PR #65991](https://github.com/angular/angular/pull/65991), влит 2026-01-05; [`withAutoCleanupInjectors`](https://angular.dev/api/router/withAutoCleanupInjectors) стабилен с v22.2); при смене параметров инжектор переиспользуется ([#70101](https://github.com/angular/angular/issues/70101)) | У подскоупа явный владелец и close; ключ экземпляра явный |
| NestJS | «Lifecycle hook methods are not invoked in lazy loaded modules» ([docs](https://docs.nestjs.com/fundamentals/lazy-loading-modules)) | Ленивое — тем же путём владения |
| Module Federation | singleton: «a higher version will be loaded … A warning will be given» ([docs](https://module-federation.io/configure/shared)) | Совместимость проверять до конструирования |
| Backstage NFS | дерево расширений; «Conditions are evaluated when the app tree is prepared, not continuously» ([docs](https://backstage.io/docs/frontend-system/architecture/extensions)) | Статическое дерево + повторная подготовка |
| Effect | v4: MemoMap «shared between Effect.provide calls (unless … { local: true })» — семантика сменилась с v3 ([migration](https://github.com/Effect-TS/effect-smol/blob/main/migration/layer-memoization.md)) | Разделение экземпляров только явно |
| Kubernetes | контроллер ведёт текущее к желаемому ([docs](https://kubernetes.io/docs/concepts/architecture/controller/)); `Recreate`: «All existing Pods are killed before new ones are created», иначе `RollingUpdate` ([docs](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)) | Desired revision и профиль передачи — политика Host |
| Vite HMR | обновление идёт вверх до модуля-границы, без неё — полная перезагрузка ([docs](https://vite.dev/guide/api-hmr)) | «Рестарт до ближайшей границы» |
| Node ESM | `Module.clearCache` не влит ([PR #61767](https://github.com/nodejs/node/pull/61767), открыт); «every single scenario where I saw HMR in Node.js ends up in memory leaks» | Новый код в том же процессе течёт |
| OpenClaw | reload заново готовит реестр, сохраняя неизменённые записи (`reference/get-modular-openclaw-20260912/sources/openclaw/src/gateway/server-plugin-reload.ts:256,318-326`); forced retirement: «resource cleanup remains pending» (`plans/evidence/module-resource-planning-20261001/openclaw_openclaw__src__plugins__plugin-instance.ts:629`); ≈5.3k строк в 17 файлах reload/instance | Логический отзыв ≠ освобождение; живая замена дорога |

Сквозные выводы (мой синтез): ни одна in-process система не обещает надёжной выгрузки кода;
default лучших — пересоздание с новой идентичностью; rebind переносит сложность на каждого
потребителя; ленивое без общего пути владения течёт; неявное разделение меняет семантику.

## 3. Три варианта

**A. Только полная пересборка.** Единица — весь граф Host. Изменение → новый план → новое
поколение целиком; экземпляр на tenant/сессию — свой полный путь (как AR). Пересоздаются все
заимствующие. В GM — только правила.

**B. Разделы + вложенные run + фасады на границах.** Раздел (partition) = план + prepared-шаблон
+ scope + kernel-поколение. Внутри раздела проводка неизменна; замена = новое поколение раздела
(рестарт поддерева). Заимствующие из других разделов держат Host-фасад конкретной capability:
на каждый вызов он берёт lease текущего поколения, как «fully qualified call» в OTP. Экземпляр —
вложенный run шаблона под `child()` владельца, данные run — через `context`. Ленивость: инертные
compile+prepare всех разделов на старте (ошибки проводки сразу), run по событию активации.

```ts
// assembly, аддитивно
type RunOptions<X> = { readonly signal?: AbortSignal; readonly context: X }; // при X = undefined не нужен
type FactoryContext<X> = { readonly signal: AbortSignal; readonly context: X };
// resources: родитель приходит на каждый run
declare function scoped<D, X extends { readonly resources: Resources }, R>(name: string,
  factory: (deps: D, ctx: { readonly signal: AbortSignal; readonly resources: Resources }) => R,
): (deps: D, ctx: FactoryContext<X>) => R;
// сессия внутри модуля sessions; шаблон подготовлен на старте
const s = resources.child({ name: `session:${id}` });
const out = await sessionTemplate.run({ signal: s.resources.signal, context: { resources: s.resources, sessionId: id } });
// Host-фасад на границе раздела
async list(q) { const cur = route.orders; const lease = cur && kernel.beginCall(cur.generation);
  if (!lease?.ok) return { kind: "unavailable" };
  try { return await cur.roots.orders.list(q); } finally { kernel.release(lease.value); } }
```

Порт родителя входит в подграф через обычный input-модуль, читающий `ctx.context`; зависимость
видна в плане через slot.

**C. Живой граф с заменой одного модуля** (OSGi dynamic, Spring refresh внутри GM):
`replace(implementationId)`, вычисление зависимых, rebind через прокси или `rest_for_one`,
инкрементальная компиляция.

| | 🛡️ надёжность | 🎯 уверенность | 🧠 сложность | LOC src / tests / docs |
|---|---|---|---|---|
| A | 8 | 7 | 2 | 0 / 0 / 80–150 |
| B | 8 | 7 | 4 | 25–60 / 100–200 / 210–370 (+ TEST Host 250–500) |
| C | 4 | 8 (что не подходит) | 9 | 1 500–3 000 / 3 000–6 000 / 400–800 (оценка по OpenClaw) |

A прост, но замена одного плагина перезапускает сотни модулей и все сессии, а команды с разным
циклом релизов не получают независимости. C противоречит `system-boundary.md:69-70`, требует
выгрузки ESM, которой в Node нет, и повторяет признанную в OSGi цену dynamic rebind.

## 4. Рекомендация: B

1. **Новый ADR** (следующий после ADR пакета resources): единица динамики — раздел; внутри
   проводка неизменна; замена — новый экземпляр, rebind на месте запрещён; заимствующие из
   других разделов — только через Host-фасад; вложенный run — под `child()` владельца; ленивость —
   eager inert prepare плюс отложенный run; замена кода в процессе — только logical replacement,
   иначе restart-required или изоляция (XF ADR-0011). GM не решает «когда» и не выдаёт
   продуктовые generation ID. Отклонить C, generic Proxy и реестр сервисов.
2. **Assembly (0.x minor):** `RunOptions.context` и `FactoryContext.context`, непрозрачные (не
   копируются и не замораживаются), ~25–50 строк. Тесты: параллельные run с разными context
   изолированы, регрессия гонки замыкания, type-fixtures.
3. **Resources:** `scoped(name, factory)` берёт родителя из `ctx.context.resources`. Делать в
   той же поставке, что и сам пакет, иначе позже придётся ломать сотни call sites.
4. **Core и lifecycle-kernel без изменений.** Замена раздела (coexist): `stage` +
   `retainCustody` → `host.resources.child()` → `run` → readiness → один синхронный шаг
   `activate(new)` + смена route + `quiesce(old)` → дедлайн Host → `retire(old)` →
   `old.scope.control.close()` → при `complete` `release(custody)` и `finishRetirement`.
   Exclusive: сначала остановить старое (как L2c1).
5. **CMS (`common-assembly.md`), раздел «Dynamic boundaries»:** одолженная capability живёт не
   дольше своего scope; заранее известная кратность — разные `moduleId`, неизвестная —
   вложенный run; per-request работа — операция плюс `child()`, подграф только при различной
   проводке или нескольких модулях со своими ресурсами; capability на границе раздела
   facade-safe (явный `unavailable`, без опоры на `instanceof` и тождество); изменяемое на ходу
   множество — consumer-owned catalog-порт, не `many`; `context` читают только
   composition-обёртки и input-модули.
6. **Проверка:** TEST Host — два параллельных сессионных подграфа, сбой k-го модуля, закрытие
   через `child()`; замена раздела coexist и exclusive. AR передаёт
   `context: { resources: attempt.resources }` при внедрении resources.

Shared-first: helper последовательности замены (~120–200 строк в kernel) не предлагаю. Он
закодировал бы политику передачи и вызывал бы продуктовый код, а это ADR-0029 уже отклонил.
Триггер для выноса: два независимых Host с одинаковой последовательностью.

Если владелец не хочет менять Assembly сейчас: оставить `scoped(parent, …)` и пересобирать
подграф на экземпляр (измерено: 1.8–7.9 мс), позже сделать breaking minor.

## 5. Сейчас, потом, шов

**Сейчас:** ADR, правила CMS, `context` + `scoped(name, …)`, два TEST-сценария.

**Безопасно отложить:** фасад-хелперы и менеджер разделов; частичный рестарт внутри раздела и
инкрементальную компиляцию (крупный раздел лучше разделить); политику рестартов (MaxR/MaxT) и
дедлайны (это Host); горячую замену кода; изоляцию сторонних плагинов (одна запись
`setup`/`cleanup` в scope Host).

**Шов нужен сейчас:** `context` на run и правило «одолженное живёт не дольше своего scope». Сейчас
это почти бесплатно. Без них потом будут гонки через замыкания и миграция всех `scoped()`.

## 6. Риски

- Неверная граница раздела: крупный раздел долго перезапускается, мелкие требуют много фасадов.
  Критерий: раздел — единица независимого релиза и владения.
- Фасады пишутся вручную, возможен TOCTOU после await. Митигация: `checkCall` перед эффектом и
  общие conformance-сценарии.
- `context` может стать мешком сервисов, как `api.runtime` в OpenClaw. Это противоречит
  рекомендации `plans/lifecycle-hooks-research-2026-10-01.md` сохранить `FactoryContext = { signal }`;
  я добавляю непрозрачное значение run, а не hooks. Митигация: узкий тип X, правило CMS, ревью.
- Ребёнок получил сырой объект вместо фасада и держит старое поколение (аналог Angular). Kernel
  покажет удержанные leases, но сам их не освободит.
- Новый код в том же процессе течёт (Node #61767). При частых обновлениях плагинов —
  restart-required или отдельный процесс.
- Exclusive-ресурсы при замене дают простой (stop-before-start, L2c1).
- Не проверено: масштаб Backstage на сотни плагинов и стоимость B при сотнях разделов. LOC —
  оценки с погрешностью ±2×.
