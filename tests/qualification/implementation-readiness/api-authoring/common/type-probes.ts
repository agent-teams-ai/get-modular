import { defineModule, many, optional, required } from "./candidate-define.js";
import type { ActivationFactory } from "./candidate-split.js";
import type { Consumer, Service } from "./factories.js";

const inferred = defineModule({ moduleId: "probe/module", implementationId: "probe/module/default", owner: { authority: "probe", path: ["module"] }, provides: [], slots: [] });
const literal: "probe/module" = inferred.moduleId;
const extraPreserved: "kept" = defineModule({ ...inferred, authorNote: "kept" as const }).authorNote;
const requiredCardinality: "required" = required().kind;
const optionalCardinality: "optional" = optional().kind;
const profileOrder: "profile" = many({ min: 0, max: 3 }).order;
void [literal, extraPreserved, requiredCardinality, optionalCardinality, profileOrder];

// @ts-expect-error a required declaration field cannot be omitted
defineModule({ moduleId: "probe/bad", owner: { authority: "probe", path: ["bad"] }, provides: [], slots: [] });
// @ts-expect-error required accepts no arguments
required({});
// @ts-expect-error many has no positional overload
many(0, 3);

declare const service: Service;
const activate: ActivationFactory<Readonly<{ service: Service }>, Consumer> = (dependencies) => ({ read: () => dependencies.service.value });
activate({ service });
// @ts-expect-error closed dependencies reject absent service
activate({});
// @ts-expect-error closed dependencies reject extra resolver access
activate({ service, resolve: () => service });
