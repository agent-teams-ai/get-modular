# Динамические модули: модель, которая выдерживает рост и изменения на ходу

Дата: 2026-10-01. Статус: предложение, не ADR. Линза: масштаб и изменения во время работы.
База: get-modular `9c722ce`, agent-runtime `origin/main` `b0bcb265`,
`plans/module-resource-scopes-design-2026-10-01.md` (далее «дизайн»). Эксперименты: scratchpad, Node v26.9.0.

## 1. Текущее состояние (факты)

- **Граф статичен и замкнут.** Профиль выбирает ровно одну реализацию модуля (`profile.duplicate-selection`,
  `packages/core/src/features/composition-semantics/profile-census.ts:47-51`). Провайдер обязан быть выбран в том же
  профиле (`binding-record.ts:44-46`), required-слот без binding даёт `binding.missing` (`selected-bindings.ts:86-87`).
  Проверено: подграф сессии не может сослаться на провайдера родительского графа, оба кода воспроизводятся.
- **Run не принимает данных.** `RunOptions = { signal }` (`packages/assembly/src/features/construction/types.ts:77`),
  `FactoryContext = { signal }` (`:68`). Фабрика захватывается при `bindFactory` (`bind.ts:33-36`), `prepare` заново
  компилирует план (`prepare.ts:146`). Зависимости передаются прямыми ссылками (`run.ts:56-67`), сборка последовательная
  (`run.ts:105-143`). Повторные и параллельные `run` разрешены, журналы раздельные (`docs/architecture/common-assembly.md:266-270`);
  «A new profile does not update previously delivered references» (`:317`); generations и hot replacement исключены (`:24-27`).
- **Kernel плоский и пассивный.** Поколение не знает родителя (`packages/lifecycle-kernel/src/features/lifecycle/kernel.ts:62-68`),
  вызов проверяется только по запросу (`:92-101`), callback и Promise запрещены (ADR-0029:58-60), `finishRetirement`
  отказывает, пока жив хоть один lease (`kernel.ts:118`). Новые вызовы удержанных потребителей после retirement вне контракта (ADR-0029:84-88).
- **Resources (дизайн).** `scoped(parent, name, factory)` захватывает `parent` в момент обёртки (дизайн:171-183);
  `child()` у закрываемого scope бросает `ScopeClosedError` (:122-124).
- **Extension Foundation ADR-0014:117-135** уже задаёт форму замены: новый desired profile, компиляция затронутого
  замыкания, новое candidate generation, CAS; удалить required-провайдера нельзя, пока зависимые не пересобраны или не отключены.
- **Потребители.** Динамики нет ни у кого. AR передаёт состояние попытки замыканием и делает compile, bind и prepare на
  каждую попытку (`agent-runtime: packages/apps/embedded-runtime/src/composition/default-agent-runtime-host.ts:49-62`).
  TEST L2c1 заменяет **граф целиком** (`modularity-host-TEST/src/host/replacement.ts:44,64`).
- **Замер** (локально, порядок величин): цепочка из 50 модулей — compile 1,9 мс, prepare с перекомпиляцией 2,2 мс,
  run 0,08 мс; 200 модулей — 7,6 / 8,7 / 0,30 мс. Prepare дороже run примерно в 27 раз.

## 2. Сценарии роста и где ломается

1. **Тысячи сессий, у каждой свой подграф.** Передать фабрикам `sessionId`, родительский `db` или scope сессии можно
   только замыканием при `bindFactory`, то есть prepare на каждую сессию: при 1 000 сессий/с и 50 модулях это около 4 с CPU
   в секунду против 0,08 с при переиспользовании. Переиспользовать нельзя. **Проверено экспериментом:** с `scoped(attempt.resources, …)`
   из дизайна два `prepared.run()` вешают scope'ы обеих сессий на первую попытку; закрытие сессии 1 закрывает соединение
   сессии 2, третий run падает `assembly.run.factory-threw` / `scope-closed`. Это дефект API, его надо исправить до релиза resources.
2. **Подграф и родитель.** Родительского провайдера нельзя объявить в подграфе. Обходы: дублировать провайдера в каждой
   сессии (лишние пулы) или прятать его в замыкание мимо slot. Второе нарушает правило 2 дизайна (:211-213): план не видит
   зависимость, замыкание для замены не вычислить.
3. **Тенанты с разным выбором модулей.** Профиль на выбор и prepared в кэше Host работают. Но ключ кэша не может быть только
   `PlanDigest`: равный план не значит равные код и grants (`dynamic-plugin-lifecycle-design.md`, «Identity algebra»).
4. **Провайдер заменяют, а 40 заёмщиков держат ссылки.** Ссылки прямые и не обновляются, заёмщики зовут старый экземпляр,
   в том числе после его cleanup. Kernel этого не видит: у заёмщика нет lease. Классический OSGi stale reference.
5. **Обновление плагина падает на середине.** Работает: failed outcome с журналом (`types.ts:92-101`), частичный scope
   закрывается в обратном порядке, старое поколение живёт. У эксклюзивного ресурса будет простой (L2c1).
6. **Утечки подграфов.** Незакрытый scope сессии живёт в родителе вечно; потерянный lease навсегда блокирует `finishRetirement`,
   и GC не соберёт поколение. Кто держит lease, не видно. При связывании сигналов через `AbortSignal.any` на долгоживущем
   родителе Node копит зависимые сигналы: nodejs/node#54614 открыт, фикс observed-composite утечки влит в main 2026-08-06
   (PR #64481); попал ли он в 24.x/26.x — не проверено.
7. **Гонка drain и новых допусков.** LIFO закрывает 1 000 сессий тенанта по одной (инвариант 6 дизайна), а ещё не дошедшие до
   очереди сессии продолжают принимать вызовы. Поколения kernel не связаны, поэтому при непрерывном трафике drain не сходится.
8. **Ленивая загрузка и копии библиотек.** Плагин со своей копией `@get-modular/assembly` регистрирует handles в чужой
   `WeakMap` (`bind.ts:6`) и получает `assembly.prepare.handles` (`prepare.ts:58-59`). Отказ безопасный, но это класс ошибок
   Module Federation. С токенами kernel так же: «valid only in the kernel instance that issued it» (README:59-60).

**Что уже сломалось у других.**
- OSGi DS, §112.3.7: static — «Component configurations are deactivated before any bound service for the static reference
  becomes unavailable»; dynamic — компонент «must properly handle changes … on any thread at any time»
  (https://docs.osgi.org/specification/osgi.cmpn/8.0.0/service.component.html). Stale reference: «A stale reference leads to
  a memory leak and, for an update, to an inconsistency» (Attouchi et al., DSN 2015,
  https://pages.saclay.inria.fr/gael.thomas/research/biblio/2015/attouchi15dsn-incinerator.pdf).
- IntelliJ: «any unloading problems in a production environment will ask the user to restart the IDE»; о ссылках на
  `PluginClassLoader` в heap dump: «Every one of them is a memory leak» (https://plugins.jetbrains.com/docs/intellij/dynamic-plugins.html).
- VS Code: «VS Code loads and runs extensions in a separate process» (зеркало старой документации,
  https://vscode-docs.readthedocs.io/en/stable/extensions/our-approach/); с 1.88 «you can now restart extensions instead of
  having to reload the window» (https://code.visualstudio.com/updates/v1_88). По PowerShell/vscode-powershell#4986 обновление
  любого расширения перезапускает и PowerShell, значит единица рестарта крупная (это вывод из issue).
- Module Federation: `singleton` «warns when the chosen version does not satisfy a consumer», то есть несовпадение по
  умолчанию не ошибка (https://webpack.js.org/plugins/module-federation-plugin/).

Вывод: выживает крупная единица замены (процесс, поколение графа); тонкая выгрузка в процессе ломается на одной забытой ссылке.

## 3. Три варианта

**A. Всё у Host, GM без изменений.** Prepare на каждую сессию, родительские зависимости в замыканиях, свои роутеры. Ломается на сценариях 1, 2, 4, 7.
Надёжность 4/10, уверенность 8/10, сложность 2/10. LOC GM: 0 / 0 / 40-80 docs; в каждом Host 300-600 src (оценка), с повторением.

**B. Ячейка (cell) как единица динамики.** Ячейка — это один `run` заранее подготовленного подграфа со своим scope
(дочерним к scope родителя) и своим поколением kernel. Сессия, тенант, плагин, ленивая фича — всё ячейки. Внутри ячейки
граф статичен; замена — только новое поколение ячейки.
- Входы ячейки объявлены в плане как модули-границы (declaration без slots), значения приходят на каждый `run`.
- Входы берутся только от предков. Scope ячейки — потомок scope поставщика каждого входа, поэтому ячейка структурно не
  переживает свои входы, и stale reference внутри дерева невозможен.
- Вклад «вверх» (например, инструмент в реестр родителя) идёт через порт родителя, disposer лежит в scope ячейки (правило 4 дизайна, :215-217).
- Заёмщики заменяемого провайдера получают политику на каждую capability, как в OSGi. **rebuild** (по умолчанию): затронутые
  ячейки пересобираются. **route**: потомки получают стабильный порт Host, каждый вызов делает `beginCall(current)`, замена
  переключает указатель, старые вызовы дорабатывают.
- Ленивая фича — route-порт, первый вызов которого single-flight запускает `run`; `import()` кода остаётся у Host (`system-boundary.md:64`).
Надёжность 8/10, уверенность 7/10, сложность 4/10. LOC GM: 90-150 src / 190-290 tests / 100-160 docs; TEST-стенд: 200-350 / 250-400 / 30-60.

**C. Живой граф в GM** (hot-swap контейнер, `add/remove/replace(module)`, инкрементальная компиляция, прокси для заёмщиков,
как value views у OpenClaw). GM становится service locator и вторым lifecycle authority (`system-boundary.md:69`), прокси
ломают identity и приватные поля, stale-ссылки остаются.
Надёжность 5/10, уверенность 7/10, сложность 9/10. LOC: 2 500-5 000 src / 3 000-6 000 tests / 300-600 docs (оценка: один
`plugin-instance.ts` у OpenClaw занимает 766 строк, плюс AsyncLocalStorage).

## 4. Рекомендация: B. Что меняется в GM

**Assembly 0.3.0** (breaking change в minor, с migration guide):
```ts
type FactoryContext<O> = { readonly signal: AbortSignal; readonly owner: O };
interface Assembly<C, O = undefined> {
  bindFactory(decl, factory: (deps, ctx: FactoryContext<O>) => Promise<FactoryProduct>): FactoryHandle;
  bindInput<const D extends ModuleDeclaration>(decl: D): InputHandle<C, D>;   // D["slots"] = []
  prepare(input: { composition; factories; roots; inputs: Record<string, InputHandle> }): Promise<...>;
}
// prepared.run({ signal, owner, inputs: { db: { "app/db": value } } }) — алиасы входов симметричны roots
```
Нет входа или есть лишний — `failed` до первой фабрики. Core не меняется: вход — обычный выбранный модуль с обычной проверкой токенов. `owner` — один непрозрачный тип Host, а не мешок
сервисов (`lessons-and-antipatterns.md:55-56`).

**Resources, до 0.1.0.** `scoped(name, factory)` берёт родителя из `ctx.owner`, а не из замыкания. Регрессионный тест —
эксперимент из сценария 1. Abort распространяется по собственному списку детей, без `AbortSignal.any` на долгоживущих
сигналах. Soak-тест: после 100 000 циклов child create/close число слушателей и heap возвращаются к исходным. `scoped()`
нужен только владеющим модулям (в AR это 3 из ~14, дизайн:273).

**Kernel:** без кода. Рецепт для Consumer Module Standard:
```ts
const cell = parent.child({ name: `session:${id}` });
const gen = kernel.stage(), custody = kernel.retainCustody(gen);
const out = await prepared.run({ signal: cell.resources.signal, owner: cell.resources, inputs });
await cell.resources.setup({ name: "admission",        // последняя запись, закрывается первой
  setup: () => { kernel.activate(gen);
    cell.resources.signal.addEventListener("abort", () => kernel.quiesce(gen), { once: true }); },
  cleanup: async (_, { signal }) => { await host.drained(gen, signal); kernel.retire(gen); } });
// после complete-отчёта close(): kernel.release(custody); kernel.finishRetirement(gen)
```
Abort синхронно проходит всё поддерево (инвариант 4), поэтому **quiesce идёт сверху вниз в одном такте**, а drain, retire и
закрытие ресурсов — снизу вверх по LIFO. Это закрывает сценарий 7 без иерархии в kernel: drain всех сессий идёт одновременно.
Замена в route-режиме: `activate(next); route.current = next; quiesce(prev)` в одном синхронном такте, затем close старой ячейки.

**Граница.** GM даёт механизм: компиляцию, prepare один раз и run много раз с `inputs`/`owner`, дерево scope,
учёт generation/lease, рецепт и conformance-тесты. Host решает, когда создавать и закрывать ячейки, и владеет
кэшем prepared, route, дедлайнами, выбором rebuild/route, readiness, загрузкой кода, изоляцией, миграцией состояния и recovery.
Правила CMS: плагин поставляет декларации и фабрики, а не handles или токены kernel; копия GM у Host одна.

## 5. Сейчас или позже

Сейчас (позже это коснётся каждой фабрики и каждого Host):
1. `owner`, `inputs` и `bindInput` в Assembly, `scoped(name, f)` в resources — до первого релиза resources и до массового `scoped(...)` у потребителей.
2. Раздел «Dynamic cells» в CMS: единица динамики, входы только от предков, rebuild/route, рецепт kernel.
3. TEST-стенд (`modularity-host-TEST`): 1 000 ячеек из одного prepared; замена провайдера при 40 заёмщиках в обоих режимах; гонка drain/admission; soak-тест утечек.
4. Реальный потребитель: AR внедряет resources сразу с новой сигнатурой.

Можно отложить, добавится без поломок:
- `inputs` и `policy: "dynamic"` в схеме Core и плана — когда инструментам понадобится видеть границы в плане.
- Общий route-хелпер — когда появится второй Host с route. Пока он у Host, около 60-100 LOC; в kernel не подходит, там нет callbacks (ADR-0029).
- Параллельная сборка внутри ячейки — только по замеру; независимые ячейки уже строятся параллельно.
- Счётчики живых ячеек и атрибуция lease — при первом расследовании утечки.
- Вынос сторонних плагинов в процесс — Host по EF ADR-0011; в ячейке это одна запись setup/cleanup.

Шов, который надо оставить сейчас: **prepared-ячейка — типизированная функция `inputs → roots` с `owner` на каждый run.**
Остальное (схема Core, route-хелпер, диагностика) надстраивается сверху без изменения фабрик.

## 6. Риски

- `owner` может превратиться в мешок сервисов. Защита: один тип, ревью, отрицательный пример в CMS.
- Host'ы могут по-прежнему прятать зависимости в замыкания; библиотека не запретит, только правило и ревью.
- Route требует контракта без состояния между вызовами, иначе одна операция смешает поколения. Поколение закрепляется на операцию: lease передаётся вниз.
- Эксклюзивный ресурс не допускает coexistence: будет простой или restart-required.
- Ячейки с долгами после неполного close держат память до ручного повтора. Host нужен порог, после которого процесс перезапускается.
- Логический отзыв не останавливает уже работающий JS (тест OpenClaw active-call, `lessons-and-antipatterns.md:85-90`), поэтому сторонний код — только вне процесса.
- 500 модулей в ячейке на тысячах сессий дают сотни тысяч scope: сессионные ячейки держать маленькими, общее — в родителе.
  Память на scope не измерена (не проверено), замер времени локальный.
- `drained()` изнутри собственного вызова ячейки — это self-wait, выходят только через `escalate`/`abandon`.
