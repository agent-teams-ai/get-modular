# Исследование: коммуникация модулей в backend-модульных монолитах, DDD и серверных фреймворках

Дата: 2026-10-15. Только исследование, ни один репозиторий не менялся.

## Методика и легенда

- Цитаты в кавычках взяты дословно из первоисточников. Документация и код загружались сырыми (raw `.adoc`/`.md`/`.java`/`.rb`/`.ex` из GitHub через `curl`/`gh`) либо как HTML со страниц авторов. Затем совпадение текста проверялось через `grep`. WebFetch (с суммаризацией) использовался только для ориентирования, его пересказ в цитаты не попал.
- Версии указаны по состоянию на 2026-10-15: Spring Modulith 2.1.1 (релиз 2026-08-26, тексты сверены по тегу `2.1.1`), Spring Framework `main` (последний стабильный релиз v7.0.9 от 2026-08-20), Packwerk v3.3.1 (2026-08-26), packwerk-extensions v0.4.0 (2026-09-25), ABP ветка `dev` (последний релиз 10.6.2 от 2026-10-12), NestJS docs `master` (nest v12.1.3), Laravel docs `13.x` (framework v13.36.0), Symfony docs `8.1`, Rails `main`/v8.1.4, Elixir `main`, Java SE 25.
- В цитатах из PDF (Evans, Vernon) нормализованы только артефакты извлечения текста: мягкие переносы и двойные дефисы вида `-‐`. Слова не менялись. Пропуски внутри цитат помечены `[...]`.
- **UNVERIFIED**: факт не удалось подтвердить первоисточником онлайн.
- **Практик (не первоисточник)**: блог практика; в лучших практиках используется только как подкрепление.
- **My assessment:** мнение автора отчёта, не факт.

---

## 1. Spring Modulith 2.1.1

Источник: https://docs.spring.io/spring-modulith/reference/ (исходники: `spring-projects/spring-modulith`, `src/docs/antora/modules/ROOT/pages/*.adoc`, тег `2.1.1`).

### 1.1 Что такое модуль: provided и required interface

fundamentals.adoc:
> "An API exposed to other modules implemented by Spring bean instances and application events published by the module, usually referred to as _provided interface_."
> "Internal implementation components that are not supposed to be accessed by other modules."
> "References to API exposed by other modules in the form of Spring bean dependencies, application events listened to and configuration properties exposed, usually referred to as _required interface_."

Важно: события входят и в provided, и в required interface. Модуль общается и через бины (прямые вызовы), и через события.

### 1.2 Границы: API-пакет, internal, named interfaces, allowedDependencies, open modules

- По умолчанию наружу открыт только базовый пакет модуля. Дополнительные поверхности открываются через `@NamedInterface` (например `"spi"`), ссылка оформляется как `"order :: spi"`.
- Модуль может объявить белый список: `@ApplicationModule(allowedDependencies = "order")`.
- Open modules разрешают доступ к internals. Сама документация называет это режимом миграции:
> "This feature is intended to be primarily used with code bases of existing projects gradually moving to the Spring Modulith recommended packaging structure. In a fully-modularized application, using open application modules usually hints at sub-optimal modularization and packaging structures."

### 1.3 Вложенные модули (с версии 1.3): самый близкий аналог nested features в GM

fundamentals.adoc, раздел "Nested Application Modules":
> "As of version 1.3, Spring Modulith application modules can contain nested modules."
> "The code in _Nested_ is only available from _Inventory_ or any types exposed by sibling application modules nested inside _Inventory_."
> "Any code in the _Nested_ module can access code in parent modules, even internal."
> "Code from nested modules can also access exposed types by top-level application modules."

Сравнение с GM:
- В Spring вложенный модуль видят только родитель и братья (siblings). Это совпадает с GM: вниз ходит только родитель, вбок ходят братья.
- Вверх Spring разрешает доступ **даже к internals родителя**. В GM вверх доступны только public contracts предков, то есть GM строже.
- Ребёнок в Spring видит exposed types всех top-level модулей. Это эквивалент "upward + lateral at top level".

### 1.4 Верификация

verification.adoc:
> "_No cycles on the application module level_ -- the dependencies between modules have to form a directed acyclic graph."
> "_Efferent module access via API packages only_ -- all references to types that reside in application module internal packages are rejected."
> "_Explicitly allowed application module dependencies only_ (optional) -- an application module can optionally define allowed dependencies via `@ApplicationModule(allowedDependencies = …)`. If those are configured, dependencies to other application modules are rejected."

### 1.5 Правило коммуникации: события как основной способ

events.adoc (начало):
> "To keep application modules as decoupled as possible from each other, their primary means of interaction should be event publication and consumption. This avoids the originating module to know about all potentially interested parties, which is a key aspect to enable application module integration testing"

Аргумент против прямого вызова:
> "The `complete(…)` method creates functional gravity in the sense that it attracts related functionality and thus interaction with Spring beans defined in other application modules."
> "It also means that we will have to touch the class whenever we would like to integrate further functionality with the business event order completion."

Цена синхронных слушателей:
> "As event publication happens synchronously by default, the transactional semantics of the overall arrangement stay the same as in the example above. Both for the good, as we get to a very simple consistency model (either both the status change of the order _and_ the inventory update succeed or none of them does), but also for the bad as more triggered related functionality will widen the transaction boundary and potentially cause the entire transaction to fail, even if the functionality that is causing the error is not crucial."

Цена асинхронных слушателей без журнала:
> "While this avoids the expansion of the original business transaction, it also creates a risk: if the listener fails for whatever reason, the event publication is lost, unless each listener actually implements its own safety net. Even worse, that doesn't even fully work, as the system might fail before the method is even invoked."

### 1.6 `@ApplicationModuleListener`

Исходник `ApplicationModuleListener.java`. Аннотация мета-аннотирована `@Async`, `@Transactional(propagation = Propagation.REQUIRES_NEW)` и `@TransactionalEventListener`. Javadoc:
> "An {@link ApplicationModuleListener} is an {@link Async} Spring {@link TransactionalEventListener} that runs in a transaction itself. Thus, the annotation serves as syntactic sugar for the generally recommend setup to integrate application modules via events."
> "It is advisable that you use these integration listeners in combination with the Spring Modulith Event Publication Registry to make sure that the event publication does not get lost in case of an application or listener failure."

### 1.7 Event Publication Registry: по сути встроенный outbox на каждого слушателя

> "On event publication, it finds out about the transactional event listeners that will get the event delivered and writes entries for each of them (dark blue) into an event publication log as part of the original business transaction."
> "In case the listener fails, the log entry stays untouched so that retry mechanisms can be deployed depending on the application's needs."
> "Automatic re-publication of the events can be enabled via the [...] `spring.modulith.events.republish-outstanding-events-on-restart` property."
> "Spring Modulith 2.0 introduces a dedicated lifecycle for event publications so that you can distinguish publications that are about to be processed, currently in progress, completed, or failed."
> "[...] the persistent abstraction of them, for example a relational database table, will grow unbounded and the interaction with the store creating and completing new `EventPublication` might slow down." (без периодической очистки завершённых записей)

Ключевая деталь: запись создаётся **на каждого слушателя отдельно**. Поэтому сбой одного слушателя не затрагивает остальных, а повтор нужен только ему.

### 1.8 Externalization: сам автор признаёт, что это не полноценный outbox, и называет проблему порядка

> "While this is a pragmatic, simple solution, it lacks critical features developers might expect from actual outbox pattern implementations. Spring Modulith 2.1 introduced support event externalization through the Namastack Outbox and JobRunr."
> "As the broker might see a sudden spike in interactions, some interactions might take a bit longer so that the externalization of later events might overtake former ones."

### 1.9 Подписка на событие тоже считается зависимостью

Исходник `DependencyType.java` (автор Oliver Drotbohm):
> `USES_COMPONENT`: "Indicates that the module depends on the other one by a component dependency, i.e. that other module needs to be bootstrapped to run the source module."
> `EVENT_LISTENER`: "Indicates that the module depends on the other by declaring an event listener for an event exposed by the other module. Thus, the target module does not have to be bootstrapped to run the source one."

Вывод: в Spring Modulith подписчик **зависит от модуля-публикатора**, потому что тип события принадлежит публикатору. События убирают runtime-зависимость при старте, но не зависимость по контракту.

### 1.10 Документация, наблюдаемость, порядок инициализации, тестирование

- Documenter: "C4 and UML component diagrams" и "Application Module Canvas" с колонками "events published and listened to as well as configuration properties" (documentation.adoc).
- Observability (production-ready.adoc):
> "This will cause all Spring components that are part of the application module's API being decorated with an aspect that will intercept invocations and create Micrometer spans for them."
Тег span `module.invocation-type`: "Type of invocation ("event listener" or "bean")."
- Порядок инициализации (runtime.adoc):
> "If a module B depends on module A, the initialization code of A has to run before the one for B, even if the initializers do not directly depend on another."
> "The execution order of those beans will automatically follow the application module dependency structure."
Начиная с 2.0 есть Flyway-миграции в пределах модуля: "Application modules are encouraged to define migrations for their own persistent data only".
- Тесты (testing.adoc): режимы `STANDALONE` (по умолчанию), `DIRECT_DEPENDENCIES` и `ALL_DEPENDENCIES`. Модуль поднимается один или вместе со своими зависимостями.

---

## 2. События Spring Framework: известные ловушки

Источник: `spring-framework` main, `framework-docs/.../context-introduction.adoc`, javadoc `SimpleApplicationEventMulticaster`, `TransactionalEventListener`, `TransactionSynchronization`.

- Синхронность по умолчанию:
> "by default, event listeners receive events synchronously. This means that the `publishEvent()` method blocks until all listeners have finished processing the event."
- Ошибка одного слушателя по умолчанию прерывает рассылку остальным (`SimpleApplicationEventMulticaster.setErrorHandler`):
> "Default is none, with a listener exception stopping the current multicast and getting propagated to the publisher of the current event."
> "By default, all listeners are invoked in the calling thread. This allows the danger of a rogue listener blocking the entire application, but adds minimal overhead."
- Async-слушатели:
> "If an asynchronous event listener throws an `Exception`, it is not propagated to the caller."
> "ThreadLocals and logging context are not propagated by default for the event processing."
- Порядок задаётся через `@Order` ("If you need one listener to be invoked before another one, you can add the `@Order` annotation").
- `@TransactionalEventListener`:
> "If the event is not published within an active transaction, the event is discarded unless the {@link #fallbackExecution} flag is explicitly set."
> "WARNING: if the {@code TransactionPhase} is set to AFTER_COMMIT (the default), AFTER_ROLLBACK, or AFTER_COMPLETION, the transaction will have been committed or rolled back already, but the transactional resources might still be active and accessible. As a consequence, any data access code triggered at this point will still "participate" in the original transaction, but changes will not be committed to the transactional resource."
И в `TransactionSynchronization.afterCompletion`: "Use {@code PROPAGATION_REQUIRES_NEW} for any transactional operation that is called from here." Именно поэтому `@ApplicationModuleListener` включает `REQUIRES_NEW`.

---

## 3. Shopify: модульный монолит, Wedge и Packwerk

### 3.1 2019: "Deconstructing the Monolith" (Kirsten Westeinde, 2019-02-21)
https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity
> "Each component defined a clean dedicated interface with domain boundaries expressed through a public API and took exclusive ownership of its associated data."
> "It highlights any violations of domain boundaries (when another component is accessed through anything but its publicly defined API), and data coupling across boundaries."
> "Cross-component associations are always violating componentization"
> "Calls are ok only to things that are explicitly public"
> "no architecture is often the best architecture in the early days of a system."

### 3.2 2020: "Under Deconstruction: The State of Shopify's Monolith" (Philip Müller, 2020-09-16)
https://shopify.engineering/shopify-monolith
- Плотный граф с циклами:
> "When we started analyzing the graph of dependencies between components, it was very dense, to the point that every component depended on over half of all the other components. We also had lots of circular dependencies."
> "Changes to any component in a cycle can break all other components in the cycle. [...] A dense, cyclical dependency graph undermines the whole idea of Componentization—it blocks us from making the system feel smaller."
- Публичный интерфейс без управления графом зависимостей бесполезен:
> "When we ignored the dependency graph, in large parts of the codebase the public interface turned out to just be an added layer of indirection in the existing control flows."
- Инверсия через pub/sub:
> "We can make arrows point in different directions, by either moving responsibilities into the component that depends on them or applying inversion of control. [...] This can be done for example through a publish/subscribe mechanism like ActiveSupport::Notifications."
> "We want to encourage inversion of control and more generally dependency inversion, which will probably lead us to use a publish/subscribe mechanism instead of straightforward method calls in many cases."
- Навязанные паттерны интерфейсов дали обратный эффект:
> "Again and again we pondered: How should components call each other? We then pushed developers to use these patterns everywhere. In hindsight, this strategy didn't increase developer ability or motivation. [...] In other cases, they lead developers to redefine their problem to fit the solution we provided, which degraded the overall state of the monolith."
> "One of the most problematic outdated assumptions is that all Active Record models are OK to access everywhere"
- Провал динамического анализа (Wedge):
> "We found the results produced were often not useful. [...] it took over an hour to run, which doesn't make for a useful feedback cycle."
> "In some cases, we reinforced a broken state."

### 3.3 2024: "A Packwerk Retrospective" (Gannon McGibbon и Chris Salzberg, 2024-02-07)
https://shopify.engineering/a-packwerk-retrospective
- Почему убрали privacy checks:
> "Yet there was a deeper problem, namely that privacy checks had transformed Packwerk into something it was never intended to be: an API design tool. [...] Package A using package B's code (even its public API) is not acceptable if package A doesn't depend on B, yet we found developers were focusing on the design of their APIs over the dependencies in their code."
> "Given these issues, privacy checks were removed from Packwerk with the release of version 3.0."
- Слепые зоны статического анализа:
> "As a result, a package that is well-defined according to Packwerk (has no violations left to resolve) may actually crash with name errors when its code is executed."
> "Anything that isn't referenceable with constants becomes implicit dependencies that Packwerk can't see."
- Todo-файлы и реальная скорость исправлений:
> "This confirmed our suspicion that the rate at which Packwerk was identifying problems to its users vastly outpaced their capacity to actually fix them (or interest in doing so)."
- Инверсия управления как костыль:
> "We relied heavily on inversion of control, for example, to extract package references out of base layer code. These changes introduced indirection that, while resolving the violations, often made code harder to understand."
- "Junk drawer" и функциональные границы:
> "This "junk drawer" of code utilities, named "Platform", holds the low-level glue code that other packages use."
> "Even for this relatively simple case of a package with no dependencies, our effort to reach full isolation had taken many months of hard work."
> "Actually running packages in isolation requires them to be defined strictly on a functional basis, but most of our components are defined around domains. Recently, our solution to this has been to use components as top-level organizational tools for grouping one or more packages, rather than a singular code unit."
- Главный урок:
> "What turned this situation around for us was the realization that running code, more than any metric, will always be the best indicator of real progress."
> "Always ask yourself if the violation is an error at the developer level, or at the dependency graph level. If it is at the graph level, consider adjusting your package layout to better match the dependencies of your code."
> "We have discussed removing Packwerk from our monolith, given the costs it incurs and the weaknesses and blind spots described earlier."

### 3.4 Packwerk и packwerk-extensions (README/USAGE)
- USAGE.md: "The dependency graph within the package system also has to be acyclic."
- README: privacy вынесен в https://github.com/rubyatscale/packwerk-extensions ("This was originally extracted from `packwerk` itself.").
- packwerk-extensions v0.4.0. `folder_privacy`: "allows packages to be private to their sibling packs and parent pack". Пример из README для защищённого `packs/b/packs/e`:
```
.                         OK (parent of parent)
packs/a                   VIOLATION
packs/b                   OK (parent)
packs/b/packs/d           OK (sibling)
packs/b/packs/e/packs/f   VIOLATION
packs/c                   VIOLATION
```
То есть защищённый пакет могут использовать предки и братья, но **не его собственные дети** и не чужие ветки. Есть также `visible_to` (явный белый список потребителей) и `layer` ("Dependencies are only allowed to packages in or below the same layer.").

---

## 4. Литература о модульном монолите

### 4.1 Kamil Grzybek

"Modular Monolith: Integration Styles" (2020-07-26), https://www.kamilgrzybek.com/blog/posts/modular-monolith-integration-styles
- Четыре стиля по главе 2 EIP: File Transfer, Shared Database Data, Direct Call, Messaging.
- Shared data:
> "However, its biggest disadvantage is a very high coupling. By sharing data, modules share their state which couples them together. [...] one little change to database structure or even data itself can break another module without notice."
- Direct call:
> "It means no constrains between tables from separate modules and no transactions between them."
> "Both the caller and the callee should treat each other as external. [...] Therefore, the Anti-Corruption Layer (ACL) should be applied. On the caller side, it could just be a gateway, on the callee side a facade."
> "As the call is always synchronous, we are dealing with temporal coupling."
- Messaging:
> "However, these are not Domain Events because a domain event is local and should be encapsulated in a given Bounded Context. Integration Events contain only as much as needed to avoid the so-called Fat Events. [...] the smaller the contract, the more stable it is"
- Итог:
> "choose Direct Call if you must have strong consistency, don't need maximum level of modules autonomy or Data Timeliness is the primary factor."
> "Most often, when we are talking about modular architecture, it is best to use Direct Call and Messaging together. Some modules can communicate synchronously and some asynchronously, depending on the need."

Репозиторий `kgrzybek/modular-monolith-with-ddd` (14k звёзд, последний push 2024-06-04) строже статьи:
> "**Modules communicate each other only asynchronously using Events Bus** - direct method calls are not allowed"
> "Modules can only have a dependency on the integration events assembly of other Module"
> "**Modules don't share data** so it is not possible nor desirable to create a transaction which spans more than one module. To ensure maximum reliability, the Outbox / Inbox pattern is used."

"Modular Monolith: Architecture Enforcement" (2020-03-22):
> "The first main sin is the everything is public principle."
> "to enforce architecture we should use the computer as much as possible and treat code-review as the last line of defense."

"Modular Monolith: A Primer" (2019-12-02), цитата из Wikipedia, которую он принимает как определение:
> "A module interface expresses the elements that are provided and required by the module."

### 4.2 Simon Brown, "Distributed big balls of mud" (2014-07-06)
http://www.codingthearchitecture.com/2014/07/06/distributed_big_balls_of_mud.html (текст проверен через архив Wayback)
> "If you can't build a monolith, what makes you think microservices are the answer?"
> "We can build monolithic systems that are made up of in-process components, each of which has an explicit well-defined interface and set of responsibilities."
> "Sure, the physical separation of services will force you to not take some shortcuts, but you can achieve the same separation between components in a monolith."

### 4.3 Sam Newman
"Building Microservices", 2-е изд., 2021. Официальное превью издателя (pageplace), глава 1:
> "If the module boundaries are well defined, it can allow for a high degree of parallel work, while avoiding the challenges of the more distributed microservice architecture by having a much simpler deployment topology. Shopify is a great example of an organization that has used this technique"
> "One of the challenges of a modular monolith is that the database tends to lack the decomposition we find in the code level"
> "A distributed monolith is a system that consists of multiple services, but for whatever reason, the entire system must be deployed together."
> "Instead, highly coupled architectures cause changes to ripple across service boundaries, and seemingly innocent changes that appear to be local in scope break other parts of the system."

InfoQ, пересказ доклада (2020-05), вторичный источник: "One indicator that you have a distributed monolith is if someone in your organization has a full-time job as a "release coordination manager."" https://www.infoq.com/news/2020/05/monolith-decomposition-newman/

**UNVERIFIED:** собственная формулировка Ньюмана о choreography и orchestration (глава "Workflow" 2-го издания). Легального полного текста онлайн не нашёл, есть только неофициальные конспекты. Ниже вместо неё используются Azure Architecture Center и Chris Richardson.

### 4.4 Microsoft и AWS
**UNVERIFIED (отсутствие):** поиск не нашёл отдельного руководства Microsoft или AWS о том, как общаться модулям внутри модульного монолита. У Microsoft есть материал по domain и integration events (раздел 5.3), у ABP есть руководство для .NET (раздел 6.5).

### 4.5 Practitioner postmortem: Milan Jovanović, "The Modular Monolith Boundary I Couldn't Take Back" (2026-06-20). Практик, не первоисточник
https://www.milanjovanovic.tech/blog/the-modular-monolith-boundary-i-couldnt-take-back
> "You can't bolt immediate consistency onto an asynchronous boundary."
> "We kept adding event handlers just to keep the two in sync. It passed for good event-driven design, and it was actually the coupling I wanted to avoid, wearing a disguise."
> "If two things have to be correct at the same instant, they belong on the same side of the boundary, inside one module."

### 4.6 Phoenix contexts (Elixir): прагматичный контрпример
`guides/data_modelling/cross_context_boundaries.md`:
> "One is to expose APIs on the `Catalog` context that allows us to efficiently fetch product data for use in the `ShoppingCart` system, which we would manually stitch together. Or we can use database joins to fetch the dependent data. Both are valid options given your tradeoffs and application size"

---

## 5. DDD

### 5.1 Eric Evans, "Domain-Driven Design Reference" (2015, CC BY 4.0)
https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
- Bounded Context: "Explicitly define the context within which a model applies."
- Context Map: "Describe the points of contact between the models, outlining explicit translation for any communication, highlighting any sharing, isolation mechanisms, and levels of influence."
- Взаимная зависимость: "(When two systems each rely on information or functionality of the other -- something we would generally try to avoid -- naturally we see the projects that build them as interdependent.)"
- Upstream-downstream: "The upstream team may succeed independently of the fate of the downstream team."
- Partnership: "Where development failure in either of two contexts would result in delivery failure for both, forge a partnership between the teams in charge of the two contexts."
- Shared Kernel: "Designate with an explicit boundary some subset of the domain model that the teams agree to share. Keep this kernel small. [...] This explicitly shared stuff has special status, and shouldn't be changed without consultation with the other team."
- Customer/Supplier: "Establish a clear customer/supplier relationship between the two teams, meaning downstream priorities factor into upstream planning. [...] Jointly developed automated acceptance tests can validate the expected interface from the upstream."
- Conformist: "Eliminate the complexity of translation between bounded contexts by slavishly adhering to the model of the upstream team."
- Anticorruption Layer: "As a downstream client, create an isolating layer to provide your system with functionality of the upstream system in terms of your own domain model. This layer talks to the other system through its existing interface, requiring little or no modification to the other system."
- Open-host Service: "Define a protocol that gives access to your subsystem as a set of services. Open the protocol so that all who need to integrate with you can use it. Enhance and expand the protocol to handle new integration requirements, except when a single team has idiosyncratic needs. Then, use a one-off translator to augment the protocol for that special case so that the shared protocol can stay simple and coherent."
- Published Language: "Use a well-documented shared language that can express the necessary domain information as a common medium of communication [...] Published language is often combined with open-host service." Предостережение: "If one is used as a data interchange language, it essentially becomes frozen and cannot respond to new development needs." (речь о прямом использовании внутренней модели как языка обмена)
- Separate Ways: "Declare a bounded context to have no connection to the others at all".
- Domain Events: "Model information about activity in the domain as a series of discrete events. Represent each event as a domain object." "Domain events are ordinarily immutable, as they are a record of something in the past."
- Modules: "Choose modules that tell the story of the system and contain a cohesive set of concepts."
- Responsibility Layers: "Look at the conceptual dependencies in your model and the varying rates and sources of change of different parts of your domain."
- Pluggable Component Framework (паттерн DDD для плагинов): "Distill an abstract core of interfaces and interactions and create a framework that allows diverse implementations of those interfaces to be freely substituted. Likewise, allow any application to use those components, so long as it operates strictly through the interfaces of the abstract core." Условие применимости: "A pluggable component framework usually only comes into play after a few applications have already been implemented in the same domain."

### 5.2 Vaughn Vernon, "Effective Aggregate Design, Part II" (2011)
https://dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_2.pdf
> "Rule: Reference Other Aggregates By Identity"
> "Thus, if executing a command on one aggregate instance requires that additional business rules execute on one or more other aggregates, use eventual consistency."
> "Discussing this with Eric Evans revealed a very simple and sound guideline. When examining the use case (or story), ask whether it's the job of the user executing the use case to make the data consistent. If it is, try to make it transactionally consistent, but only by adhering to the other rules of aggregate. If it is another user's job, or the job of the system, allow it to be eventually consistent."

Evans (DDD, с. 128), цитата по Microsoft: "Any rule that spans Aggregates will not be expected to be up-to-date at all times."

### 5.3 Domain events и integration events (Microsoft, ".NET Microservices Architecture", ms.date 2018-10-08)
https://learn.microsoft.com/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation
> "Semantically, domain and integration events are the same thing: notifications about something that just happened. However, their implementation must be different."
> "the purpose of integration events is to propagate committed transactions and updates to additional subsystems [...] Hence, they should occur only if the entity is successfully persisted, otherwise it's as if the entire operation never happened."
> "The important difference is that a command should be processed only once. A domain event could be processed zero or *n* times"
> "However, when the domain events class is static, it also dispatches to handlers immediately. This makes testing and debugging more difficult"
> "Consider that if you commit changes to the original aggregate and afterwards, when the events are being dispatched, if there's an issue and the event handlers cannot commit their side effects, you'll have inconsistencies between aggregates."

### 5.4 Transactional outbox (Chris Richardson, microservices.io)
https://microservices.io/patterns/data/transactional-outbox.html
> "But without using 2PC, sending a message in the middle of a transaction is not reliable. There's no guarantee that the transaction will commit. Similarly, if a service sends a message after committing the transaction there's no guarantee that it won't crash before sending the message."
> "The solution is for the service that sends the message to first store the message in the database as part of the transaction that updates the business entities. A separate process then sends the messages to the message broker."
> "Messages are guaranteed to be sent if and only if the database transaction commits"
> "The Message relay might publish a message more than once. [...] As a result, a message consumer must be idempotent"

### 5.5 Sagas: choreography и orchestration
Richardson, https://microservices.io/patterns/data/saga.html:
> "A saga is a reliably coordinated sequence of local transactions."
> "Choreography - each local transaction publishes domain events that trigger local transactions in other services"
> "Orchestration - an orchestrator (object) tells the participants what local transactions to execute"
> "Lack of automatic rollback [...] Lack of isolation (the "I" in ACID)"
Richardson, блог (2019-08-15): "the implementation of the saga is scattered around the participating services, which can make more complex sagas difficult to understand."

Azure Architecture Center, "Saga distributed transactions pattern" (ms.date 2025-02-25), `MicrosoftDocs/architecture-center/docs/patterns/saga-content.md`:
- Choreography, минусы: "Workflow can be confusing when you add new steps. It's difficult to track which commands each saga participant responds to." "There's a risk of cyclic dependency between saga participants because they have to consume each other's commands." "Integration testing is difficult because all services must run to simulate a transaction."
- Orchestration, плюсы: "Better suited for complex workflows or when you add new services." "Avoids cyclic dependencies because the orchestrator manages the flow." Минус: "Introduces a point of failure because the orchestrator manages the complete workflow."

### 5.6 Bernd Ruecker, QCon London 2019 (InfoQ, записано 2019-04-03)
https://www.infoq.com/presentations/event-flow-systems/
> "But I would avoid these complex peer-to-peer event chains because they are hard to understand. Emerging behavior, hard to change."
> "And what you can see is that you have to change three services down there. [...] I have to coordinate the deployment because I probably have ongoing orders in my system"
> "In this example, what I would see is you could extract, in this case, the end-to-end responsibility of fulfilling an order to an owned microservice."
> "And that's an important concept. Actually, if you look at DDD for example, domain events are there. Domain commands are not a concept there and I think they should [be]."
> "every time I have two services communicating, you will have some kind of coupling. [...] you're coupling on the receiving side because then you know which event you're listening to [...] or you could say the order sends out a command, then you're coupling on the sending side"

---

## 6. Событийные системы серверных фреймворков

### 6.1 Spring: см. раздел 2.

### 6.2 Symfony EventDispatcher (docs, ветка 8.1)
`symfony-docs/event_dispatcher.rst` (в 7.3 также `components/event_dispatcher.rst`)
- Назначение: компонент "implements the `Mediator`_ and `Observer`_ design patterns". Мотивация в 7.3 сформулирована явно через плагины: "Consider the real-world example where you want to provide a plugin system for your project. A plugin should be able to add methods, or do something before or after a method is executed, without interfering with other plugins."
- Приоритеты:
> "`priority`, which is a positive or negative integer that defaults to `0` and it controls the order in which listeners are executed (the higher the number, the earlier a listener is executed). [...] If two listeners have the same priority, they are executed in the order that they were registered."
> "**Priority is aggregated for all listeners and subscribers**, so your methods could be called before or after the methods defined in other listeners and subscribers."
- Остановка распространения:
> "In some cases, it may make sense for a listener to prevent any other listeners from being called. [...] Now, any listeners to `OrderPlacedEvent::class` that have not yet been called will *not* be called."
- Наблюдаемость: `php bin/console debug:event-dispatcher` "To show all events and their listeners".

### 6.3 Laravel Events (docs 13.x)
- "Events serve as a great way to decouple various aspects of your application, since a single event can have multiple listeners that do not depend on each other."
- "Sometimes, you may wish to stop the propagation of an event to other listeners. You may do so by returning `false` from your listener's `handle` method."
- Гонка с транзакцией:
> "When queued listeners are dispatched within database transactions, they may be processed by the queue before the database transaction has committed. [...] any models or database records created within the transaction may not exist in the database."
> `ShouldDispatchAfterCommit`: "This interface instructs Laravel to not dispatch the event until the current database transaction is committed. If the transaction fails, the event will be discarded."
- Наблюдаемость: "The `event:list` command may be used to list all of the listeners registered within your application".

### 6.4 Rails: `ActiveSupport::Notifications` и `EventReporter`
- `notifications.rb`: "`ActiveSupport::Notifications` provides an instrumentation API for Ruby." То есть это API инструментирования, а не шина доменных событий. Shopify в 2020 всё равно предлагал использовать его для инверсии зависимостей (раздел 3.2).
- `notifications/fanout.rb`: `iterate_guarding_exceptions` вызывает **всех** подписчиков, собирает исключения и только потом бросает одно исключение или `InstrumentationSubscriberError` с сообщением "Exception(s) occurred within instrumentation subscribers". Сбой одного подписчика не мешает остальным, но publisher всё равно узнаёт о сбое.
- Rails 8.1 добавил `ActiveSupport::EventReporter` (`Rails.event`): "provides an interface for reporting structured events to subscribers". Это механизм структурной наблюдаемости, а не межмодульной интеграции.

### 6.5 ABP Framework (docs `dev`, релиз 10.6.2)
- Модульный монолит и шины событий (`event-bus/index.md`):
> "If you are building a modular monolith application, use the distributed event bus for **inter-module communication**. Since the distributed event bus works in-process by default [...] if you migrate to a microservice system later, these inter-module communication can become a inter-microservice communication without any code change"
> "The local event bus is always transactional in the database level. For distributed event bus, you should enable inbox/outbox pattern to ensure data consistency once you use a real distributed event bus provider."
- Локальная шина (`event-bus/local/index.md`):
> "Event handlers are always executed in the same unit of work scope, that means in the same database transaction with the code that published the event. If an event handler throws an exception, the unit of work (database transaction) is rolled back."
> "`LocalEventHandlerOrder` attribute can be used to set the execution order for the event handlers"
- Зависимости модулей (`modularity/basics.md`):
> "An ABP module must declare a `[DependsOn]` attribute if it does have a dependency upon another module"
> "ABP investigates the dependency graph for the application at startup and initializes/shutdowns modules in the correct order."
> "Initialization follows module dependency order, while shutdown processes modules in reverse order."
- Как родитель или хост конфигурирует модули (`fundamentals/options.md`):
> "ABP follows this option pattern and defines options classes to configure the framework and the modules"
> "If you are developing a reusable module, you may need to define an options class to allow developers to configure your module."
Есть `PreConfigure<TOptions>`: "any module class depends on your module can use the `PreConfigure<TOptions>` method in its `PreConfigureServices` method."
- Синхронные вызовы между модулями (`api-development/integration-services.md`):
> "The *Integration Service* concept was created to distinguish the application services that are built for inter-module (or inter-microservice) communication from the application services that are intended to be consumed from a UI or a client application."
- Учебник Modular CRM, часть 8:
> "These modules communicate with each other through well-defined integration services and events."
Отчётный модуль, которому разрешён JOIN по чужим таблицам, приходит с оговорками: "When you change a module's database structure, you should also update your reporting code." Аналог `LocalEventHandlerOrder` в ABP показывает, что упорядочивание слушателей востребовано на практике.

### 6.6 NestJS (docs `master`, nest v12.1.3): передача конфигурации от родителя к модулю
- `modules.md`: "A module **encapsulates** its providers by default [...] A module's exported providers form its public interface, or API."
- "Making everything global is not a recommended design practice. [...] avoids unnecessary coupling between unrelated parts of the application."
- `dynamic-modules.md`:
> "With static module binding, the consuming module has no way to **influence** how the providers of the host module are configured. This matters for general-purpose modules that need to behave differently for each consumer, much like a "plugin" that requires some configuration before it can be used."
> "`register()` configures a dynamic module for use only by the calling module"
> "`forRoot()` configures a dynamic module once and reuses that configuration in multiple places"
> "`forFeature()` uses the configuration set up by `forRoot()`, but modifies some of it for the needs of the calling module"
- `circular-dependency.md`: "Avoid circular dependencies where possible, but you can't always do so." Для TypeScript важно: "A circular dependency can also be caused by using "barrel files" (`index.ts` files) to group imports. Avoid barrel files for module and provider classes."

### 6.7 Erlang/OTP через Elixir `Supervisor`: дерево с жизненным циклом
`lib/elixir/lib/supervisor.ex` (main):
- Родитель передаёт аргумент ребёнку при старте: `start: {Counter, :start_link, [arg]}`, "Then the supervisor will call `Counter.start_link(arg)` to start the child process."
- "When the supervisor starts, it traverses all child specifications and then starts each child in the order they are defined." "The shutdown process happens in reverse order."
- Стратегии изоляции сбоев: `:one_for_one`, `:one_for_all`, `:rest_for_one`. "To efficiently supervise children started dynamically, see `DynamicSupervisor`."
- Для pub/sub между процессами есть `Registry` с dispatch: "`Registry` has a dispatch mechanism that allows developers to implement custom dispatch logic triggered from the caller."

### 6.8 Java Platform Module System (Java SE 25)
- JLS 7.7: `exports com.example.foo.internal to com.example.foo.probe;` (qualified export, то есть видимость только для указанных модулей), `uses`/`provides` (ServiceLoader как точка расширения): "The uses directive specifies a service for which code in the current module may discover providers via java.util.ServiceLoader."
- `java.lang.module` (описание разрешения графа): "The algorithm in this step enumerates the same module name twice. This indicates a cycle in the 'requires' directives". В этом случае разрешение завершается ошибкой.

---

## 7. Архитектурные принципы

- Alistair Cockburn, "Hexagonal architecture" (HaT Technical Report 2005.02, 2005-09-04), https://alistair.cockburn.us/hexagonal-architecture/
> "Allow an application to equally be driven by users, programs, automated test or batch scripts, and to be developed and tested in isolation from its eventual run-time devices and databases."
> "A port identifies a purposeful conversation. There will typically be multiple adapters for any one port"
- Robert C. Martin, "The Clean Architecture" (2012-08-13), https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
> "This rule says that source code dependencies can only point inwards. Nothing in an inner circle can know anything at all about something in an outer circle."
> "So we have the use case call an interface (Shown here as Use Case Output Port) in the inner circle, and have the presenter in the outer circle implement it."
> "We take advantage of dynamic polymorphism to create source code dependencies that oppose the flow of control so that we can conform to The Dependency Rule no matter what direction the flow of control is going in."
> "The important thing is that isolated, simple, data structures are passed across the boundaries. We don't want to cheat and pass Entities or Database rows."
- Принципы пакетов (butunclebob.com, "Principles of OOD"):
> ADP: "The dependency graph of packages must have no cycles."
> SDP: "Depend in the direction of stability."
> SAP: "Abstractness increases with stability."

---

## 8. Enterprise Integration Patterns и Fowler

- Hohpe/Woolf, https://www.enterpriseintegrationpatterns.com/
  - Command Message: "Use a Command Message to reliably invoke a procedure in another application."
  - Event Message: "Use an Event Message for reliable, asynchronous event notification between applications." "An event's contents is typically less important. Many events are empty; their mere occurrance tells the observer to react."
  - Document Message: "Whereas a Command Message tells the receiver to invoke certain behavior, a Document Message just passes data and lets the receiver decide what, if anything, to do with the data."
  - Request-Reply: "Send a pair of Request-Reply messages, each on its own channel." "The reply channel, on the other hand, is almost always point-to-point, because it usually makes no sense to broadcast replies"
  - Shared Database: "Coming up with a unified schema that can meet the needs of multiple applications is a very difficult exercise, often resulting in a schema that application programmers find difficult to work with. If the technical difficulties of designing a unified schema aren't enough, there are also severe political difficulties."
- Martin Fowler, "What do you mean by "Event-Driven"?" (2017) (уже в прошлом отчёте, здесь только ловушки):
> "It can become problematic, however, if there really is a logical flow that runs over various event notifications. The problem is that it can be hard to see such a flow as it's not explicit in any program text. Often the only way to figure out this flow is from monitoring a live system."
> "A simple example of this trap is when an event is used as a passive-aggressive command. This happens when the source system expects the recipient to carry out an action, and ought to use a command message to show that intention, but styles the message as an event instead."
- Fowler, "IntegrationDatabase" (bliki, обновлено 2015-07-01):
> "On the whole integration databases lead to serious problems becaue the database becomes a point of coupling between the applications that access it. [...] As a result most software architects that I respect take the view that integration databases should be avoided."
- Derek Comartin, CodeOpinion, "Beware! Anti-patterns in Event-Driven Architecture" (2024-06-06). Практик:
> "Queries are naturally request-response. You want to know right now and get a response. Using events and publish-subscribe does not fit this at all."
> "Leaking those internal data schemas is no different than having another service interact with your private database and understanding its schema. You're coupled at the database level, just with events."

---

## 9. Худшие практики: что подтверждено

1. **Общие изменяемые таблицы или общее состояние между модулями.** Подтверждено: Grzybek, Richardson ("Development time coupling", "Runtime coupling"), EIP, Fowler IntegrationDatabase, Shopify Wedge ("Cross-component associations are always violating componentization"), Shopify 2020 ("all Active Record models are OK to access everywhere" как устаревшее допущение). Newman: в главе 1 есть проблема неразделённой базы. Фраза "should always be avoided" принадлежит пересказу InfoQ, а не Ньюману дословно.
2. **Цепочки событий для бизнес-процесса.** Подтверждено: Ruecker ("complex peer-to-peer event chains [...] hard to understand. Emerging behavior, hard to change"), Fowler ("hard to see such a flow"), Azure (choreography: "risk of cyclic dependency"), Richardson ("scattered"). Сам термин "event spaghetti" авторитетным первоисточником **UNVERIFIED**. Термин "Pinball Machine Architecture" поиск приписывает Phil Calçado (QCon NYC 2019), это тоже **UNVERIFIED**.
3. **События для запросов (query через pub/sub).** Есть только практик (CodeOpinion). Утверждение авторитетного первоисточника **UNVERIFIED**. Косвенно поддерживает EIP: ответ почти всегда point-to-point.
4. **Passive-aggressive events.** Подтверждено: Fowler.
5. **Temporal coupling через синхронные вызовы.** Подтверждено: Grzybek и Ruecker. Внутри одного процесса это касается доступности и времени жизни, а не сети.
6. **Циклические зависимости модулей.** Подтверждено: Shopify 2020, ADP, Packwerk ("has to be acyclic"), Spring Modulith verify, JPMS, NestJS ("Avoid circular dependencies where possible"), Evans ("something we would generally try to avoid").
7. **Божественный общий модуль ("common", "junk drawer").** Подтверждено: Shopify 2024 (изоляция одного базового пакета заняла "many months"), Evans ("Keep this kernel small"), NestJS ("Making everything global is not a recommended design practice").
8. **Потеря событий без outbox или журнала публикаций.** Подтверждено: Spring Modulith, Richardson, Microsoft.
9. **Расчёт на порядок слушателей.** Подтверждено: Symfony ("Priority is aggregated for all listeners and subscribers"), Spring Modulith ("later events might overtake former ones"). Фреймворки дают ручки порядка (`@Order`, `priority`, `LocalEventHandlerOrder`), но кросс-модульный порядок оказывается неявной глобальной связью (My assessment).
10. **Синхронные слушатели расширяют транзакцию публикатора.** Подтверждено: Spring Modulith, ABP (откат всего unit of work при сбое слушателя).
11. **Первый упавший слушатель отменяет остальных.** Подтверждено: поведение Spring по умолчанию.
12. **Тихая потеря события вне транзакции и запись после commit без новой транзакции.** Подтверждено: javadoc Spring.
13. **Очередь обрабатывает событие до commit.** Подтверждено: Laravel.
14. **Статический глобальный диспетчер с немедленными side effects.** Подтверждено: Microsoft.
15. **Жирные и "CRUD"-события, утечка внутренней схемы.** Подтверждено: Grzybek ("Fat Events"), Martin ("don't [...] pass Entities or Database rows"). CodeOpinion как практик.
16. **IoC или pub/sub только чтобы заглушить нарушение зависимости.** Подтверждено: Shopify 2024 ("introduced indirection that [...] often made code harder to understand").
17. **Навязанные единообразные паттерны интерфейсов.** Подтверждено: Shopify 2020.
18. **Ставка на public/private без контроля графа зависимостей.** Подтверждено: Packwerk retrospective, Shopify 2020 ("public interface turned out to just be an added layer of indirection").
19. **Статический анализ как единственный источник правды.** Подтверждено: Packwerk retrospective.
20. **Eventual consistency через границу по умолчанию.** Подтверждено: Vernon/Evans ("whose job"), практик Jovanović.
21. **Distributed monolith.** Подтверждено: Newman, Grzybek ("Distributed Monolith anti-pattern").
22. **Open modules, доступ к internals.** Подтверждено: Spring Modulith ("usually hints at sub-optimal modularization").
23. **Barrel-файлы, порождающие циклы (TypeScript).** Подтверждено: NestJS.
24. **`stopPropagation` или `return false` между независимыми модулями.** Факт: механизм есть в Symfony и Laravel. Что это анти-паттерн между модулями и плагинами, это My assessment: один модуль молча отключает другие, и ни одна из найденных документаций не ограничивает механизм границами модуля.

---

## 10. Таблица "лучшие практики"

| # | Практика | Источник |
|---|---|---|
| 1 | Модуль = provided interface + required interface (явные входы и выходы) | Spring Modulith fundamentals; Grzybek Primer |
| 2 | Наружу только явный API, internals закрыты; дополнительные поверхности именуются (named interfaces / SPI) | Spring Modulith; Grzybek "everything is public" sin |
| 3 | Явные разрешённые зависимости и ациклический граф с проверкой в CI | Spring Modulith verify; Packwerk USAGE; ADP; JPMS |
| 4 | Граф зависимостей важнее, чем public/private | Packwerk retrospective (privacy убран в 3.0) |
| 5 | Зависеть в сторону стабильности; внутреннее не знает о внешнем | SDP; Clean Architecture Dependency Rule |
| 6 | Обратный поток управления через output port, который определяет внутренний и реализует внешний | Martin (Use Case Output Port); Cockburn ports |
| 7 | Через границу передавать простые неизменяемые данные, не сущности | Martin; Evans (domain events immutable) |
| 8 | Смешивать прямые вызовы и события по задаче: вызов для запросов и строгой согласованности, событие для уведомлений | Grzybek Integration Styles; ABP integration services + events |
| 9 | Выбор согласованности по правилу "чья это работа" | Vernon/Evans 2011 |
| 10 | Событие сообщает факт, команда выражает намерение; не маскировать команду под событие | Fowler; EIP Command/Event Message; Ruecker |
| 11 | Integration events маленькие и отделены от внутренних domain events | Grzybek; Microsoft |
| 12 | Журнал публикаций на каждого слушателя или outbox, если нужна надёжность; идемпотентные потребители | Spring Modulith registry; Richardson outbox |
| 13 | Многошаговый процесс оркестрирует владелец, а не цепочка событий | Ruecker; Azure Saga (orchestration "Avoids cyclic dependencies") |
| 14 | Востребованный модуль публикует Open Host Service + Published Language; потребитель с другой моделью ставит ACL | Evans DDD Reference; Grzybek (ACL на вызовах) |
| 15 | Shared kernel минимальный и меняется только по согласованию | Evans |
| 16 | Порядок инициализации по графу зависимостей, остановка в обратном порядке | Spring Modulith ApplicationModuleInitializer; ABP; OTP Supervisor |
| 17 | Генерируемая документация модулей, включая события published/listened | Spring Modulith Documenter |
| 18 | Span на входе в модуль с типом входа (bean / event listener) | Spring Modulith observability |
| 19 | Тест модуля изолированно или с прямыми зависимостями | Spring Modulith bootstrap modes |
| 20 | Реальный запуск модуля в изоляции надёжнее метрик статического анализа | Shopify Packwerk retrospective |
| 21 | Конфигурация дочернему модулю передаётся явно на каждого потребителя (`register` / `forRoot` / `forFeature`) | NestJS dynamic modules; ABP options; OTP start args |
| 22 | Исключительное владение данными у модуля | Shopify 2019; Grzybek repo |
| 23 | Модули группируются в организационные компоненты, а единицей зависимостей остаётся мелкий пакет | Shopify 2024; packwerk-extensions folder_privacy |
| 24 | Плагины работают только через абстрактное ядро интерфейсов | Evans Pluggable Component Framework; JPMS uses/provides |
| 25 | Ошибка одного подписчика не блокирует остальных, но publisher о ней узнаёт | Rails fanout (aggregated errors); Spring Modulith per-listener entries |

## 11. Таблица "худшие практики"

| # | Анти-паттерн | Источник |
|---|---|---|
| 1 | Общие изменяемые таблицы или состояние между модулями | Grzybek; Richardson Shared Database; EIP; Fowler IntegrationDatabase; Shopify Wedge |
| 2 | Сложные peer-to-peer цепочки событий для бизнес-процесса ("event spaghetti", термин UNVERIFIED) | Ruecker 2019; Fowler 2017; Azure Saga; Richardson |
| 3 | Запросы через события и pub/sub | CodeOpinion (практик); авторитетный первоисточник UNVERIFIED |
| 4 | Passive-aggressive command | Fowler 2017 |
| 5 | Циклы между модулями | Shopify 2020; ADP; Packwerk; Spring Modulith; JPMS; NestJS; Evans |
| 6 | "Junk drawer" / global common module | Shopify 2024; Evans (shared kernel small); NestJS (global not recommended) |
| 7 | Async-события без журнала или outbox: тихая потеря | Spring Modulith events; Richardson |
| 8 | Зависимость от порядка или приоритета слушателей разных модулей | Symfony ("Priority is aggregated"); Spring Modulith (overtake) |
| 9 | Синхронный слушатель расширяет транзакцию и роняет некритичное | Spring Modulith; ABP local bus |
| 10 | Сбой первого слушателя отменяет остальных | Spring SimpleApplicationEventMulticaster (default) |
| 11 | Событие отбрасывается вне транзакции; запись после commit без REQUIRES_NEW | Spring TransactionalEventListener javadoc |
| 12 | Обработка события из очереди до commit | Laravel docs |
| 13 | Статический глобальный диспетчер событий | Microsoft domain events |
| 14 | Жирные события, утечка внутренней схемы и сущностей | Grzybek; Martin; CodeOpinion (практик) |
| 15 | Инверсия или pub/sub только ради закрытия нарушения зависимости | Shopify 2024 |
| 16 | Навязанные паттерны интерфейсов вместо решения настоящей проблемы | Shopify 2020 |
| 17 | Только privacy-проверки без графа зависимостей | Packwerk retrospective |
| 18 | Вера статическому анализу без запуска | Packwerk retrospective |
| 19 | Eventual consistency через границу по умолчанию | Vernon/Evans; Jovanović (практик) |
| 20 | Distributed monolith | Newman 2021; Grzybek |
| 21 | Open modules / доступ к internals | Spring Modulith |
| 22 | Barrel-файлы, создающие циклы (TS) | NestJS docs |
| 23 | `stopPropagation` между независимыми модулями и плагинами | механизм: Symfony, Laravel; оценка вреда: My assessment |

---

## 12. My assessment: перенос на примитивы GM

Ниже моё мнение, не факты. Оценки: **Надёжность** (насколько решение устойчиво при сотнях модулей и плагинах) и **Уверенность** (насколько я уверен в рекомендации), обе по шкале 1-10.

### Общий вывод по индустрии
1. Индустрия качнулась от "только события" (репозиторий Grzybek 2019-2020, Shopify 2020: "publish/subscribe mechanism instead of straightforward method calls") к "вызовы и события по назначению". Это видно по Shopify 2024 ("indirection [...] harder to understand"), Ruecker 2019, Jovanović 2026, а Grzybek в статье прямо советует смешивать. Spring Modulith декларирует события как "primary means", но сам включает бины в provided interface и признаёт цену синхронных и асинхронных событий.
2. Сильнейшее общее правило всех источников: **ациклический граф явных зависимостей важнее приватности API** (Packwerk 3.0, Shopify 2020, ADP, Spring Modulith, JPMS). Подписка на событие тоже является зависимостью: подписчик зависит от контракта публикатора (Spring Modulith `EVENT_LISTENER`).
3. Главная слабость событий в индустрии в том, что поток невидим в коде (Fowler). У GM здесь реальное преимущество: каждая связь проходит явной строкой привязки в composition root, поэтому граф событий можно показать статически, не "monitoring a live system". Spring Modulith умеет это только частично, выводя тот же граф из байткода и аннотаций.
4. Shopify 2024 говорит, что запуск сильнее метрик. В GM композиция исполняется по-настоящему, поэтому границы подтверждаются запуском, а не только статическим анализом. Это стоит явно сделать преимуществом в документации.

### (a) Родитель → ребёнок
- **Рекомендуемый вариант (Recommended): конфигурация и возможности родителя передаются как типизированный контракт, привязанный строкой к `required()` или `optional()` слоту ребёнка, либо как inputs динамического экземпляра.** Это аналог `register(options)` в NestJS, init args в OTP и options в ABP, но без глобального multi-writer. Вызовы родителя к ребёнку идут только через public contract прямого ребёнка (downward edge), как у вложенных модулей Spring Modulith. GM строже Spring и packwerk folder privacy (там разрешён и "parent of parent"). Для сотен модулей это плюс: внуки скрыты за ребёнком. Надёжность 9, Уверенность 8.
- Для изменений настроек во время работы: родитель публикует read-only контракт состояния (снимок + уведомление), ребёнок подписывается через планируемый пакет наблюдения. Данные через границу передаются только неизменяемыми снимками (Martin, Evans). Надёжность 8, Уверенность 7.
- Не рекомендую ABP-стиль, где любой зависящий модуль может `Configure<Options>` чужой модуль: появляется несколько писателей, и итог зависит от порядка. Надёжность 4, Уверенность 7.

### (b) Ребёнок → родитель
- **Recommended: output port, принадлежащий ребёнку.** Ребёнок объявляет контракт-слот ("что мне нужно от владельца" или "кому сообщить"), родитель привязывает реализацию. Зависимость по исходному коду направлена родитель → контракт ребёнка, поток управления идёт ребёнок → родитель. Это ровно Use Case Output Port у Martin и driven port у Cockburn, граф остаётся ацикличным. Надёжность 9, Уверенность 8.
- **Событие ребёнка (контракт принадлежит ребёнку), родитель подписан строкой привязки.** Подходит, когда ребёнку всё равно, кто реагирует (Fowler event notification). Надёжность 8, Уверенность 8.
- **Upward edge к public contract предка** оставить для сервисов, которые предок предоставляет поддереву (окружение scope: настройки, ресурсы, логирование). Это не канал "ребёнок просит родителя что-то сделать". Надёжность 7, Уверенность 6.
- **Риск, который нужно проверить в GM:** правило "нет циклов среди downward и lateral" не исключает цикл upward + downward на уровне экземпляров. Например, ребёнок требует контракт предка, а реализация этого контракта у предка требует ребёнка, и получается дедлок порядка инициализации. Источники единогласны против циклов (ADP, Evans, Shopify). Рекомендую проверять ацикличность на графе фактических провайдеров в composition root, включая upward edges, либо документально доказать, почему upward edges безопасны. Уверенность в наличии риска 6, потому что точную семантику upward edges в GM я не проверял по коду.

### (c) Братья и далёкие модули
- **Recommended (братья): два явных способа, оба через контракты.** (1) Прямой вызов provided contract брата через `required()` для запросов, команд с результатом и случаев, где "это работа текущего пользователя" (Vernon/Evans). (2) Событие с контрактом публикатора и строкой подписки через `many()` для фактов, которые публикатору не нужно подтверждать. Запрещать события-запросы и passive-aggressive команды как правило ревью и документации. Надёжность 9, Уверенность 8.
- **Многошаговые процессы между братьями оркестрирует общий родитель** (downward edges к прямым детям), а дети сообщают о результатах через события или output ports. Дерево GM делает это естественным: оркестратор уже существует, и это ближайший общий предок. Источники: Ruecker ("extract the end-to-end responsibility"), Azure ("Avoids cyclic dependencies"). Надёжность 9, Уверенность 8.
- **Далёкие модули:** прямых рёбер нет. Контракт поднимается до уровня ближайшего общего предка: группа публикует Open Host Service + Published Language, потребитель с другой моделью ставит ACL. Это аналог Shopify 2024 (компонент как группа пакетов) и packwerk folder_privacy. Надёжность 8, Уверенность 6. Масштабирование такого подхода на сотни модулей не подтверждено ни одним найденным источником (**UNVERIFIED**).
- **Семантика доставки событий в GM (in-process):** изоляция ошибок по слушателю, все слушатели получают событие, ошибки собираются и сообщаются (модель Rails fanout и Spring Modulith per-listener). Без приоритетов и `stopPropagation` между модулями. Если порядок важен, это процесс, и его нужно оркестрировать. Надёжность 8, Уверенность 7.
- **Надёжность и транзакции не обещать в ядре GM.** In-memory событие без журнала теряется при сбое (Spring Modulith, Richardson). Outbox и журнал публикаций относятся к хосту продукта или к отдельному адаптеру. Документация GM должна прямо называть гарантию доставки. Надёжность 8, Уверенность 7.
- **Общие данные:** никакого общего изменяемого состояния между модулями. Чтение чужих данных только через контракт владельца (Shopify Wedge, Fowler, EIP). Надёжность 9, Уверенность 9.

### (d) Плагины
- **Recommended: хост публикует абстрактное ядро контрактов** (Evans: Pluggable Component Framework, Open Host Service + Published Language). Плагин реализует точки расширения хоста (`many()`, аналог JPMS `uses`/`provides`) и подписывается только на события, которые хост объявил. Рёбер плагин → плагин напрямую нет, только через контракты хоста. Надёжность 9, Уверенность 7.
- Сбой плагина-слушателя изолирован, приписан конкретному плагину и виден хосту (span на входе в модуль по типу входа, как в Spring Modulith). Плагин не может останавливать распространение и не задаёт глобальный приоритет. Если хосту нужен порядок, он объявляет явные фазы, как PreConfigure/Configure/PostConfigure в ABP. Надёжность 8, Уверенность 7.
- Через границу плагина передаются только неизменяемые данные Published Language, без внутренних объектов хоста (Martin: "We don't want to cheat and pass Entities"). Надёжность 9, Уверенность 8.
- Evans предупреждает, что Pluggable Component Framework оправдан, когда "a few applications have already been implemented in the same domain". Это совпадает с правилом второго потребителя в AGENTS.md: стабильный SPI для плагинов не объявлять преждевременно. Уверенность 7.

### Узнаваемые имена (только словарь индустрии, решение за критиком имён и синтаксиса)
- Событие: event (Spring, Laravel, Symfony, ABP, NestJS). Публикация: `publishEvent` (Spring), `PublishAsync` (ABP), `dispatch` (Symfony, Laravel), `emit` (NestJS EventEmitter), `instrument`/`notify` (Rails).
- Подписчик: listener (Spring, Symfony, Laravel), handler (ABP, MediatR), subscriber (Symfony, Rails).
- Команда, запрос: command / query (EIP, CQRS, Ruecker).
- Порт и контракт: port (Cockburn), provided / required interface (Spring Modulith), integration service (ABP), published language / open host service (Evans).
- Надёжность: outbox (Richardson), event publication registry (Spring Modulith).

### Что осталось непроверенным
- Формулировки Sam Newman о choreography и orchestration (вторичные конспекты есть, первоисточник недоступен легально).
- Авторитетный первоисточник термина "event spaghetti" и анти-паттерна "events for queries".
- Отдельное руководство Microsoft или AWS по коммуникации модулей внутри модульного монолита (не найдено).
- Точная семантика upward edges в коде GM (в рамках этого исследования не читался).

## Первоисточники (все открывались 2026-10-15)
- Spring Modulith: https://docs.spring.io/spring-modulith/reference/ ; https://github.com/spring-projects/spring-modulith (тег 2.1.1)
- Spring Framework: https://github.com/spring-projects/spring-framework (main)
- Shopify: https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity ; https://shopify.engineering/shopify-monolith ; https://shopify.engineering/a-packwerk-retrospective
- Packwerk: https://github.com/Shopify/packwerk ; https://github.com/rubyatscale/packwerk-extensions
- Kamil Grzybek: https://www.kamilgrzybek.com/blog/posts/modular-monolith-integration-styles ; https://www.kamilgrzybek.com/blog/posts/modular-monolith-architecture-enforcement ; https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer ; https://github.com/kgrzybek/modular-monolith-with-ddd
- Simon Brown: http://www.codingthearchitecture.com/2014/07/06/distributed_big_balls_of_mud.html
- Sam Newman: превью "Building Microservices" 2e https://api.pageplace.de/preview/DT0400.9781492033998_A49444743/preview-9781492033998_A49444743.pdf ; InfoQ https://www.infoq.com/news/2020/05/monolith-decomposition-newman/
- Evans DDD Reference: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
- Vernon: https://dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_2.pdf
- Microsoft domain events: https://learn.microsoft.com/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation
- Azure Saga: https://learn.microsoft.com/azure/architecture/patterns/saga
- Richardson: https://microservices.io/patterns/data/transactional-outbox.html ; https://microservices.io/patterns/data/saga.html ; https://microservices.io/patterns/data/shared-database.html ; https://microservices.io/post/sagas/2019/08/15/developing-sagas-part-3.html
- Ruecker: https://www.infoq.com/presentations/event-flow-systems/
- Symfony: https://github.com/symfony/symfony-docs (8.1, 7.3)
- Laravel: https://github.com/laravel/docs (13.x)
- Rails: https://github.com/rails/rails (activesupport/lib/active_support/notifications.rb, notifications/fanout.rb, event_reporter.rb)
- ABP: https://github.com/abpframework/abp (docs/en, ветка dev)
- NestJS: https://github.com/nestjs/docs.nestjs.com (content/modules.md, fundamentals/dynamic-modules.md, fundamentals/circular-dependency.md)
- Elixir: https://github.com/elixir-lang/elixir (lib/elixir/lib/supervisor.ex, registry.ex)
- Phoenix: https://github.com/phoenixframework/phoenix (guides/data_modelling/cross_context_boundaries.md)
- Java: https://docs.oracle.com/javase/specs/jls/se25/html/jls-7.html ; https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/module/package-summary.html
- Cockburn: https://alistair.cockburn.us/hexagonal-architecture/
- Martin: https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html ; http://butunclebob.com/ArticleS.UncleBob.PrinciplesOfOod
- EIP: https://www.enterpriseintegrationpatterns.com/patterns/messaging/ (CommandMessage, EventMessage, DocumentMessage, RequestReply, SharedDataBaseIntegration)
- Fowler: https://martinfowler.com/articles/201701-event-driven.html ; https://martinfowler.com/bliki/IntegrationDatabase.html
- Практики: https://codeopinion.com/beware-anti-patterns-in-event-driven-architecture/ ; https://www.milanjovanovic.tech/blog/the-modular-monolith-boundary-i-couldnt-take-back
