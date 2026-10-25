import { parse } from "yaml";
import { assertProjection, selectedProfile } from "./policy.ts";
import { assertBunWorkspace } from "./admission.ts";

if (selectedProfile() === "node") assertProjection();
else assertBunWorkspace(parse);
