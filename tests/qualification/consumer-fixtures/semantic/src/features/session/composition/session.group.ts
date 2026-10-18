import { group } from "@get-modular/assembly";
import { sessionModule } from "./session.module.js";

export const sessionGroup = group("session", [
  sessionModule,
]);
