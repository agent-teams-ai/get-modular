# Критика скетча lifecycle-хуков: корректность async и ошибок

Объект: `scratchpad/hooks-sketch` (без изменений). Атаки: `scratchpad/critic-async-work/src/attack/a02..a17*.ts` (копия скетча, `node src/attack/<file>.ts`, Node v26.9.0; `tsc7 -p tsconfig.json` = 0 вместе с атаками). Контракт: `plans/lifecycle-hooks-research-2026-10-01.md` §"Minimal recommended API", ресурсный план (SHA-256 `46e869ce...0eea7`, совпадает со ссылкой в исследовании).

## Находки

**F1 — P1, уверенность 9, VERIFIED.** `observeOwned` объявляет RELEASED, хотя listener установлен.
`src/features/settings/published/observe-owned.ts:26`: `if (outcome.kind === "failed") return RELEASED; // observe() is atomic: nothing installed`. Но setup = `observe()` + `consumer.attach(observation)` (`:21-22`); если бросает `attach`, observe уже установил регистрацию, и ссылку на неё теряют. Это противоречит ресурсному плану ("Retain ... adapter construction cell before fallible setup", "Setup failure does not prove empty acquisition").
Репро `a03-attach-throws-leak.ts`:
```
cleanup report  [{"kind":"released"}]
listenerCount(priceCurrency) after RELEASED  1
deliveries into failed module after cleanup  ["1:EUR"]
```
Патч (проверен в `a03b`, `observe-owned.patched.ts`: listenerCount 0, `detach` вызван): держать `let cell` до `attach`; cleanup не смотрит на `outcome.kind`, а делает `if (cell === undefined) return RELEASED; cell.unsubscribe(); await consumer.detach(); return cell.isAttached() ? unresolved(...) : RELEASED;`.

**F2 — P1, 9, VERIFIED.** Ошибки в `commit`/`fail` приписываются не тому коду, `fail` вызывается повторно, процесс падает.
`src/shared/latest-derivation.ts:37-41`: `.then((result) => publish(... spec.commit ...), (cause) => publish(... spec.fail ...))` `.catch((cause: unknown) => publish(job, () => spec.fail(job.revision, cause)))`. Если бросает `commit`, срабатывает `fail(rev, commitError)`: модуль видит "провал деривации" после частично применённого commit. Если бросает `fail`, то `fail` зовут ещё раз с его же исключением, а `settled` отклоняется без подписчика, и получается unhandled rejection. `reportError` владельца об этих ошибках не узнаёт (`settings-v1.ts:138-143` его не передаёт).
Репро `a02-throwing-commit-fail.ts`, `a14` п.2:
```
mode=commit-throws calls  ["commit(1,OK)","fail(1,commit-bug)"]
mode=fail-throws calls  ["fail(1,derive-failed)","fail(1,fail-bug#1)"]   -> Error: fail-bug#2, exit=1
2 commit throws -> module sees  [["commit 0:FR","fail 0:commit-bug"],"reportError calls=0"]
```
Патч (проверен, `latest-derivation.patched.ts` + `a15`): добавить `reportError` в spec, обернуть `isCurrent/commit/fail` в `isolated()` (try/catch с проверкой результата `!== undefined`/thenable), убрать хвостовой `.catch`. Результат: `commit-bug` и `fail-bug` уходят в reportError, `fail` вызывается один раз, падения нет.

**F3 — P1, 8, VERIFIED.** Незавершающаяся деривация не даёт `unresolved` и блокирует независимых владельцев.
`host/composition.ts:156`: `for (const created of [...owners].reverse()) report.push({ ... results: await created.cleanup() })`; `kernel/resource-owner.stand-in.ts:67`: `results.push(await release())`; `observe-owned.ts:28` ссылается на "Host deadline reports", но дедлайна нигде нет. Контракт требует: "an unsettled run yields `unresolved`"; ресурсный план: "Safe independent obligations progress despite unresolved peers".
Репро `a04-hung-derive-blocks-shutdown.ts` (tax `load("HANG")` не завершается):
```
shutdown settled after 300ms?  false
price-table listener still attached  1
price-table published AFTER shutdown was requested  {"amount":9,"currency":"EUR"}
```
Патч (ASSUMPTION, не проверен): закрывать admission всех независимых владельцев сразу (`Promise.allSettled` по владельцам без пререквизитов), на каждое обязательство поставить observation budget `Promise.race([raw, budget.then(() => unresolved(new Error("active run unsettled")))])` и сохранить raw promise для последующего наблюдения. Stand-in объявлен как "No ... deadlines", но последовательный `await` в `composeHost.shutdown` относится к самому скетчу.

**F4 — P1, 9, VERIFIED.** Если run провалился, Host теряет custody владельцев.
`host/composition.ts:98` `const owners: StandInOwner[] = [];` и `:148` `if (outcome.status !== "succeeded") throw new Error(JSON.stringify(outcome));`: уже созданные владельцы недостижимы. Ресурсный план: "Failed initialization retains listener custody through construction recovery".
Репро `a11-composition-failure-custody.ts` (вариант `host/composition-fail.ts`, в котором бросает фабрика driver):
```
orphaned listeners (priceCurrency, locale)  [1,0]
rate fetches by the orphaned module after failure  ["USD","EUR"]
```
Патч (не проверен): до `throw` выполнить cleanup владельцев в обратном порядке и вложить отчёт в ошибку (или вернуть `{status:"failed", recover}`).

**F5 — P2, 9, VERIFIED.** `derive` запускается после `close()` и для устаревшего входа.
`latest-derivation.ts:35-36`: `Promise.resolve().then(() => spec.derive(job.input, controller.signal))`. Admission перед стартом не проверяется, а контракт требует: "checks that admission before it starts". Репро `a05-start-after-close.ts`:
```
after offer+close (same tick)  ["derive(A) aborted=true"]
after offer(1)+offer(2) (same tick)  ["derive(A) aborted=true", ...]
```
(`commit(1,A)` в выводе появляется из-за заглушки `isCurrent: () => true`.) Патч (проверен в `a15`: `[]` и `["derive(B)…","commit 2"]`): `.then(() => open && !controller.signal.aborted ? spec.derive(...) : SKIPPED)`.

**F6 — P2, 9, VERIFIED.** Если бросает `reportError`, рвётся весь batch доставки.
`adapters/in-memory-settings-source.ts:93`: `try { recordDesired(current()); } catch (cause) { options.reportError(cause); }`, цикл `:130`. Регистрации, которые идут дальше в batch, уже удалены из `#dirty` и этот коммит не получают, а исключение остаётся неперехваченным. Репро `a09-reporterror-throws.ts`: `independent registration B received []`, без обработчика `exit=1`. Патч: `catch (cause) { try { options.reportError(cause); } catch (e) { queueMicrotask(() => { throw e; }); } }` или try на каждую регистрацию внутри цикла.

**F7 — P2, 8, VERIFIED.** Фасеты полномочий существуют только на уровне типов, а `PriceTable` публикует после unsubscribe.
(a) `observe-owned.ts:22` передаёт модулю (и дальше заёмщикам) тот же объект `SettingsObservation`, у которого во время выполнения есть `unsubscribe`. (b) `price-table.ts:29` `isCurrent: (revision) => this.#view?.current().revision === revision`: admission не проверяется, а после unsubscribe `current()` замораживается, хотя документирован как "Authoritative latest committed state". (c) `host/settings-modules.ts:17,19`: комментарий `features never can`, при этом `"settings/read": source satisfies SettingsReaderV1` отдаёт фичам весь источник вместе с `commit`.
Репро `a07-view-carries-unsubscribe.ts`, `a17`:
```
borrower-visible keys  ["initial","current","unsubscribe","isAttached"]
state after unsubscribe + release (should NOT be EUR)  {"kind":"ready","currency":"EUR",...}
current() after unsubscribe is frozen (source is GBP)  [1,{"priceCurrency":"EUR"},{"priceCurrency":"GBP"}]
1 runtime type of settings/read capability .commit  "function"
```
Патч: `Object.freeze({ initial, current })` для view (так сделано в патче F1); capability собирать как `Object.freeze({ read: (k) => source.read(k) })` и `Object.freeze({ observe: (...a) => source.observe(...a) })`.

**F8 — P2, 7, VERIFIED.** `settingsApplier` сравнивает ревизии разных источников.
`settings-v1.ts:84,86`: `let lastApplied = appliedRevision;` / `if (next.revision <= lastApplied) return undefined;`. `snapshot.source` не проверяется. Слоты `settings/read` и `settings/observation` связываются независимо (`composition.ts:132,137`). Репро `a06-applier-source-mismatch.ts`: `reader revision / port revision [5,3]`, `applied (expected 3 updates de, fr, it) []`. Патч: принимать `initial: SettingsSnapshot<K>` и проверять `next.source !== initial.source` с выводом в `reportError`.

**F9 — P2, 8, VERIFIED.** Async-callback, подсунутый через cast, обходит изоляцию.
`in-memory-settings-source.ts:93` игнорирует возвращаемое значение. Репро `a08-async-callback-cast.ts`: `reportError received []`, затем unhandled rejection и `exit=1`. Скетч сам защищается от "untyped callers" (`:77`), а здесь такой защиты нет. Патч: тот же `isolated()`, что в F2.

**F10 — P2, 8, VERIFIED.** Stand-in owner не проходит отклоняющие тесты ресурсного плана (стр. 138: "held setup publishes; ... reentrancy duplicates actions").
`resource-owner.stand-in.ts:43` `if (outcome === undefined) return unresolved(...)`, `:51-53`, `:64-67`. Репро `a10-standin-owner.ts`:
```
(a) report while setup pending  ["unresolved"]
(a) late setup outcome after owner closed  "published listener#1"   (cleanup так и не вызван: 0)
(b) cleanup callback invocations for ONE obligation  3
(c) malformed result surfaced as  [null]   (undefined, а не unresolved)
```
Обязательства и их замыкания после release не освобождаются (VERIFIED чтением: массив `obligations` никогда не очищается). Патч: хранить состояние на каждое обязательство и мемоизированный cleanup promise; при fulfilment после `closed` запускать cleanup или отклонять с `setup-closed`; не-`CleanupResult` превращать в `unresolved`.

**F11 — P3, 8, VERIFIED.** Microtask-flush с самоподпитывающимся callback не даёт выполниться макрозадачам, в том числе таймеру будущего дедлайна. `in-memory-settings-source.ts:126` `queueMicrotask(`. Репро `a13` п.5: `deliveries before the 0ms timer could fire 200000`. Патч: flush через макрозадачу либо бюджет повторных flush с `reportError`.

**F12 — P3, 9, VERIFIED.** Запись ошибки неполная. `tax-table/index.ts:20` `fail: () => { failures += 1; ... }` не сохраняет ни source, ни revision, ни cause. `price-table.ts:35` не сохраняет source, а `lastFailure` остаётся после более нового успеха (`a14` п.1: состояние EUR rev2, `lastFailure "unknown currency XXX"`). Патч: сбрасывать или квалифицировать запись при `commit` с бо́льшей ревизией.

**F13 — P3, 8, VERIFIED.** Один `SettingsDerivationV1`/applier можно запустить дважды (`settings-v1.ts:136`), и тогда вычисления для одного модуля перекрываются. Репро `a16` п.1: `max concurrent derives for one module [2]`, commits `["0:FR","0:FR"]`. Патч: `let started = false; if (started) throw ...`.

## Расхождения с контрактом и неточности контракта

- **C1 (код против контракта; F1, F3, F4, F10).** Нарушены custody до fallible setup, `unresolved` для незавершённого прогона и прогресс независимых обязательств.
- **C2 (неточность контракта).** Сказано: "module's derivation checks that admission", но в option 2 у модуля есть только `SettingsView`, где нет запроса admission. Скетч подменяет это флагом `open`, который закрывается в `detach`. Нужно либо `isAdmitted()` во view, либо явное правило "owner вызывает detach синхронно после unsubscribe". Кроме того, `current()` после unsubscribe не authoritative.
- **C3 (неточность).** "Independently observed ... settlement of any active derivation run" для option 2 недостижимо: деривация приватна для модуля, owner видит только самоотчёт `detach()`. Надо так и записать.
- **C4 (пробел).** Исключения в `commit`/`fail`/`isCurrent`, а также в самом репортере не специфицированы, правило есть только для `recordDesired`. Канал "reported to the owner" не назван (код добавил `ObserveOptions.reportError` и `isAttached`, которых в API исследования нет).
- **C5 (пробел).** Сравнение ревизий допустимо только в пределах одного `source` (F8). Порядок доставки между регистрациями не задан: на практике он определяется порядком `SETTING_KEYS`, а не регистрации (`a13` п.4: `["Y(registered second, locale)","X(registered first, taxRegion)"]`). Выбор microtask или macrotask для доставки тоже не задан (F11).

## Что выдержало атаки (VERIFIED)

- Атомарность `observe` + `initial`. Commit сразу после observe или внутри `recordDesired` доставляется позже, не реентерабельно (`a13` п.1-2: `"commit returned"` раньше доставки, `REENTRANT` нет).
- Не более одной доставки на коммит на регистрацию, мультиключевой коммит даёт одну доставку (`main`, `a13` п.1).
- 1000 коммитов во время удерживаемого derive: `derives started / max concurrent [1,1]`, pending ограничен, сходимость к `1000:R1000` без промежуточных публикаций (`a12`).
- A→B→A (PASS в `main`). Старая ошибка не понижает новый успех (`a14` п.1). Синхронный throw в derive приходит в `fail` (`a14` п.3).
- `unsubscribe` во время active и pending идемпотентен, `drain` ждёт удерживаемый прогон, после него `isAttached=false`, публикации нет (`a12`).
- Replay в `settingsApplier`: commit между read и attach подхватывается одним apply, replay после unsubscribe не срабатывает (`a13` п.3a/3b).
- Исключение в `recordDesired` изолируется, соседи получают доставку (`a17` п.2). Исключение в cleanup превращается в `unresolved`, а соседние обязательства выполняются (`a16` п.2). Custody-first в stand-in: обязательство регистрируется до `setup`.
- Штатный shutdown: слушателей 0, в `main` всё released.
