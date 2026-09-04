import { defineModule } from "./candidate-define.js";
import type { ActivationFactory, } from "./candidate-split.js";
import type { Consumer, Service } from "./factories.js";

const inferred = defineModule({ moduleId: "probe/module", implementationId: "probe/module/default", owner: { authority: "probe", feature: "module" }, provides: [], slots: [] });
const literal: "probe/module" = inferred.moduleId;
void literal;

// @ts-expect-error unknown top-level declaration fields are rejected
defineModule({ moduleId: "probe/bad", implementationId: "probe/bad/default", owner: { authority: "probe", feature: "bad" }, provides: [], slots: [], executable: () => 1 });
// @ts-expect-error a required declaration field cannot be omitted
defineModule({ moduleId: "probe/bad", owner: { authority: "probe", feature: "bad" }, provides: [], slots: [] });

declare const service: Service;
const activate: ActivationFactory<Readonly<{ service: Service }>, Consumer> = (dependencies) => ({ read: () => dependencies.service.value });
activate({ service });
// @ts-expect-error closed dependencies reject absent service
activate({});
// @ts-expect-error closed dependencies reject extra resolver access
activate({ service, resolve: () => service });
