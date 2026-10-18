import { group } from "@get-modular/assembly";
import { runnerAModule } from "./runner-a.module.js";

export const runnerGroup = group("runner", [
  runnerAModule,
]);
