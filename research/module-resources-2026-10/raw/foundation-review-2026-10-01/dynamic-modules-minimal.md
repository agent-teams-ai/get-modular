# Динамические модули: минимально достаточная модель

Дата: 2026-10-01. Ревью фундамента Get Modular, линза «минимально достаточно». Пути указаны
относительно `<workspace>/`. Разделы 1–2 содержат проверенные факты,
разделы 3–6 — предложения.

## 1. Текущее состояние и реальные потребности (факты)

**GM (HEAD `9c722ce`):**
- Assembly не содержит «generations or hot replacement» (`get-modular/docs/architecture/common-assembly.md:25-27`).
  За один attempt фабрика каждой implementation вызывается ровно один раз. У повторных, конкурентных
  и вложенных run свои карты и журналы (`:266-271`). Цитата: «A new profile does not update previously delivered
  references» (`:317`).
- На модуль в профиле допускается одна selection (`packages/core/src/features/composition-semantics/profile-census.ts:46-51`,
  `profile.duplicate-selection`). Значит, N экземпляров модуля — это N запусков сборки.
- `prepared.run` можно вызывать повторно (`packages/assembly/src/features/construction/prepare.ts:158`), но
  `RunOptions` = `{ signal }` (`types.ts:77`), а `FactoryContext` = `{ signal }` (`types.ts:68`). Данные экземпляра
  попадают в фабрику только через замыкание при `bindFactory`.
- Generations, routing и drain принадлежат Host (`docs/architecture/system-boundary.md:60-70`). lifecycle-kernel —
  только синхронный учёт generation и lease (`packages/lifecycle-kernel/README.md:1-6`, ADR-0029:55-81).
- Дизайн resources: `child()` предназначен для вложенных run и динамических под-scope, а место в LIFO
  занимается в момент создания (`plans/module-resource-scopes-design-2026-10-01.md:103-109, 121, 199-204`).

**Потребители:**

| Потребность | Статус | Доказательство |
|---|---|---|
| Целый граф на каждый экземпляр Host | **реальна** | AR `origin/main`: `packages/apps/embedded-runtime/src/composition/default-agent-runtime-host.ts:49-62` — compile, bind, prepare и run при каждом создании Host. Host создаётся на пару tenant/project (`.../ordinary-session-runtime/composition/ordinary-agent-runtime-host.ts:41`) |
| Per-turn и per-session | реальна, но **внутри модуля** | `packages/contexts/agent-execution/.../application/ordinary-engine.ts:223` (`flights = new Map`), при dispose закрываются все flights (`:260-265`). Сессионные handle — замыкания `bindAccess` (`composition/agent-runtime-host.ts:299-300`) под Host-local `HostCallLedger` (`agent-runtime-host-disposal.ts:397-399`) |
| Lazy | реальна, но **внутри адаптера** | мемоизированный `getCodex` (`ordinary-agent-runtime-host.ts:63-70`, «Auth remains lazy until submit» `:44`); `await import("@anthropic-ai/claude-agent-sdk")` (`.../claude-agent-sdk-contained-turn-provider.ts:47`); `node-contained-turn-workspace-owner.ts:133` |
| Hot replace модуля или плагина | **нет в production** | dynamic plugin scope в AR не допущен (`common-assembly.md:193-194`). Есть только TEST: `modularity-host-TEST`, где `ReplacementSlot` заменяет **весь** Host generation, а старые ссылки «never revive» (`docs/lifecycle-kernel-l2c1.md:4, 24, 37, 43`); в `src/host/` 1 692 строки |
| Сторонний код в процессе | **нет** | EF ADR-0006:100-102: «Only product-built and fully trusted code may run in-process… Third-party code requires a runtime the host can terminate» |
| orchestrator, platform | нет | обе в стадии архитектуры; `git grep @get-modular` по `origin/main` находит 0 файлов |

Принятое направление: EF ADR-0014 (`extension-foundation`, `docs/decisions/0014-…md:117-135`). Замена выглядит
так: новый неизменяемый desired profile → компиляция затронутого замыкания → новый candidate generation →
CAS → закрыть допуск старому → drain → очистка в обратном порядке. Mutable `enabled` в живом registry отвергнут
(`:171`). Исследование hooks пришло к тому же: «Reconstruction with a new identity; no in-place rebinding»
(`plans/lifecycle-hooks-research-2026-10-01.md:122`).

**Вывод.** Сегодня реальны две вещи: много экземпляров целого графа и динамическая работа и lazy **внутри**
модулей. Под-графы на сессию, замена одного модуля, rebinding и lazy-узлы графа пока спекулятивны.

**Замер стоимости одного экземпляра** (scratchpad, Node v26.9.0, тарболы GM 0.2.0, граф-цепочка без IO):

| Модулей | compile+bind+prepare+run | bind+prepare+run | только run |
|---|---|---|---|
| 10 | 1.13 мс | 0.62 мс | 0.02 мс |
| 100 | 8.60 мс | 5.43 мс | 0.15 мс |
| 300 | 26.46 мс | 15.28 мс | 0.46 мс |

Пересобирать граф на каждую сессию дёшево. Пересобирать большой под-граф на каждый запрос — уже нет.

## 2. Как это решают в индустрии (факты)

- **Erlang/OTP** перезапускает процессы, а не перепривязывает ссылки. `rest_for_one`: «the child processes after
  the terminated process in start order are terminated. Subsequently, the terminated child process and the
  remaining child processes are restarted». Остановка идёт «in the reverse order». Если перезапусков больше `MaxR`
  за `MaxT`, супервизор завершает всех детей и себя. https://www.erlang.org/doc/system/sup_princ.html
- **OSGi DS** по умолчанию тоже перезапускает компонент: «The static policy is the most simple policy and is the
  default policy». Цена dynamic policy: «the component implementation must properly handle changes in the set of
  bound services that can occur on any thread at any time» (§112.3.7.1–2).
  https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.component.html
  Ошибка сложных систем именно в этом: rebinding перекладывает конкурентность на каждого автора модуля.
- **VS Code**: lazy через activation events («Your extension becomes activated when the Activation Event happens»).
  Обновление решается перезапуском: «you can now restart extensions instead of having to reload the window» (1.88).
  https://code.visualstudio.com/api/references/activation-events , https://code.visualstudio.com/updates/v1_88
- **Effect**: «converting a configuration layer into a runtime using the `ManagedRuntime.make` constructor»,
  освобождение целиком через `dispose()` (https://effect.website/docs/runtime/). Урок из Effect #8517: при dispose
  ресурсы слоя закрываются параллельно с очисткой запросов, и «A request's finalizer can therefore find its database
  pool already closed» (https://github.com/Effect-TS/effect/issues/8517). Отсюда правило: динамическая работа
  должна быть **ребёнком** того scope, у которого она заимствует.
- **Angular**: у route есть свой `EnvironmentInjector`. Автоматическое уничтожение неактивных injector'ов —
  opt-in `withAutoCleanupInjectors`, «stable since v22.2»
  (https://angular.dev/api/router/withAutoCleanupInjectors). *Мой вывод:* если у lazy-единицы с первого дня нет
  владельца закрытия, это потом приходится долго дорабатывать.
- **Node**: ESM-модуль нельзя выгрузить. PR «module: add clearCache for CJS and ESM» (nodejs/node#61767) на
  2026-10-01 открыт (проверено через `gh`). Замена кода внутри процесса течёт, для кода надёжен только рестарт
  процесса.

## 3. Три варианта (предложение)

**A. «Экземпляры вместо мутации».** План неизменяем. Единица динамики — **экземпляр сборки**: `prepared.run()`
внутри `owner.resources.child()`.

```ts
const scope = resources.child({ name: `session:${id}` });       // место в LIFO занято сейчас
const prepared = await prepareSession(parentPorts, scope.resources); // bridge-модуль + scoped()
const outcome = await prepared.run({ signal: scope.resources.signal });
if (outcome.status !== "succeeded") { await scope.control.close(); throw new SessionFailed(outcome); }
sessions.set(id, { api: outcome.roots.api, control: scope.control }); // указатель владельца
// замена: собрать новый → sessions.set синхронно → retire/drain старого → old.control.close()
```

Заёмщики внутри старого экземпляра закрываются вместе с ним, как поддерево в `rest_for_one`. Снаружи на roots
ссылается только указатель владельца, поэтому rebinding не нужен. Lazy — это экземпляр, который владелец создаёт
при первом использовании; внутри модуля lazy остаётся обычной мемоизацией в адаптере. Порты родителя приходят
в под-план через **bridge-модуль**: это обычный узел без slots, его фабрика возвращает эти порты. Так под-план
остаётся замкнутым и Core его полностью проверяет.
Надёжность 9/10, уверенность 8/10, сложность 2/10. LOC: src 0, tests 80–150, docs 120–200.

**B. Стабильный фасад в GM.** `routed<T>()` или Proxy перенаправляет вызов на текущий generation и берёт
call-lease у kernel. Заёмщики держат фасад, при замене меняется только цель. Для stateless запрос-ответ это
работает. Ломается на stateful handle, stream, callback, identity и синхронных геттерах. Кроме того, GM
становится «second lifecycle authority» (`system-boundary.md:69`).
Надёжность 6/10, уверенность 6/10, сложность 6/10. LOC: src 300–600, tests 400–700, docs 150–250.

**C. Живой граф с generation на модуль** (OSGi dynamic, Spring refresh). Инкрементальная перекомпиляция,
авто-rebind или авто-рестарт зависимых, lazy-узлы в графе. Противоречит `common-assembly.md:25-27` и
EF ADR-0014:171, а конкурентность снова ложится на каждого автора модуля.
Надёжность 4/10, уверенность 5/10, сложность 9/10. LOC: src 2 000–4 000, tests 3 000+, docs 500+.

## 4. Рекомендация: вариант A и что меняется в GM (предложение)

Модель одной строкой: **неизменяемый план → экземпляры в дереве scope → замена = новый экземпляр + переключение
указателя у владельца + закрытие старого.**

| Кто | За что отвечает |
|---|---|
| GM (механизм) | план; последовательная сборка экземпляра; scope-дерево с LIFO и `CloseReport`; kernel — синхронный учёт generation и lease |
| Владелец экземпляра (модуль-родитель или Host) | когда создавать, заменять и закрывать; указатель (route); readiness; дедлайны; handover (coexistence, exclusive или restart) |
| Модуль | видит только `(deps, { signal, resources })`; generation и hooks замены ему не видны |

Всё меняется в поставке `@get-modular/resources` 0.1.0, нового пакета нет, Core и Assembly не трогаются:
1. **ADR resources**: абзац «Dynamic instances». Единица динамики — экземпляр сборки в `child()`. In-place
   rebinding и lazy-узлы графа не поддерживаются. Ссылка на EF ADR-0014.
2. **Consumer Module Standard**, четыре правила:
   - (а) `deps` одолжены на время жизни экземпляра; их и roots нельзя хранить в глобалах или объектах, которые
     живут дольше владельца;
   - (б) регистрация «вверх» возвращает disposer, и он кладётся в scope регистрирующего (это уже правило 4 дизайна);
   - (в) динамический ребёнок заимствует только у своего создателя и его `deps`;
   - (г) состояние, которое должно пережить замену, хранит владелец с более долгой жизнью, а не заменяемый модуль.
3. **Один тест** в resources: под-сборка в `child()` создаётся после конструирования родителя. Сбой экземпляра k
   не трогает родителя и соседей. Закрытие родителя закрывает живые экземпляры раньше старших соседей.
4. **README lifecycle-kernel**, рецепт: `stage` → `retainCustody` → `child()` → `run` → `activate` → … → `retire` →
   `close()` → `release(custody)` только при `complete` → `finishRetirement`.
5. **Проверка**: в TEST — под-сборка на сессию в `modularity-host-TEST`. На реальном потребителе — AR, где
   экземпляр = Host attempt (так уже сейчас). При миграции AR на resources per-turn `flights` переводятся на `child()`.

## 5. Что делать сейчас, а что отложить (предложение)

**Seam, который нужен сейчас.** Он дешёвый, а без него позже пришлось бы переписывать сотни модулей:
- контракт фабрики `(deps, { signal, resources })` — единственное, что видит модуль. Всё, что выше (как Host
  доставляет `resources`, фасады, generation), можно менять только в composition root;
- правила 2(а–г). Именно они делают restart поддерева безопасным: утёкшую ссылку на старый экземпляр JS отозвать
  не может;
- у каждого динамического или lazy экземпляра с первого дня есть scope с владельцем.

**Что можно безопасно отложить:**

| Что | Почему безопасно | Триггер |
|---|---|---|
| `run({ signal, input })` для схемы prepare-once-run-many | изменение аддитивное; меняются только bridge-фабрика и `scoped()` в composition root | bind+prepare занимает больше ~1% бюджета запроса (см. замер в §1) |
| Объявленные входы под-графа в профиле Core | bridge-модуль уже сейчас даёт замкнутый проверяемый план | реальный дефект из-за невидимой зависимости между командами или репозиториями |
| Фасад или rebind | указатель владельца остаётся единственной индирекцией | stateful заёмщик, которого нельзя перезапустить, есть у двух потребителей |
| Handover, readiness, drain | это политика Host; TEST L2c1 уже показал exclusive | первый production dynamic Host (ADR-0029 L4) |
| Hot reload кода внутри процесса | ESM не выгружается | как общая гарантия — никогда; плагинам — рестарт их процесса |
| Инкрементальная компиляция | полная компиляция 300 модулей занимает ≈11 мс | тысячи модулей и частые замены |

## 6. Риски

1. Restart теряет in-memory состояние заёмщиков. Защищает правило 2(г); если команды уже держат состояние
   в заменяемых модулях, исправлять это дорого.
2. Замена провайдера в базовом графе пересобирает всё, что ниже него (как `rest_for_one`). Смягчение — делить
   граф по времени жизни (база → дети). Если такие замены частые, пересмотреть вариант B для одной capability.
3. Утечка ссылок через глобалы или переданные roots приводит к use-after-close. Смягчение: ревью,
   `ScopeClosedError`, `checkCall` kernel на эффектах Host.
4. `scoped()` захватывает родителя при bind, поэтому prepared привязан к одному экземпляру. Будущий `input`
   сломает composition roots. При 0.x это допустимо: minor-релиз и migration guide.
5. Замер сделан на синтетической цепочке без IO. В реальных фабриках доля GM меньше; на AR не измерено
   (не проверено).
6. Модель кооперативная. Недоверенный код — только через изоляцию процесса (EF ADR-0006), иначе ни один вариант
   не надёжен.
