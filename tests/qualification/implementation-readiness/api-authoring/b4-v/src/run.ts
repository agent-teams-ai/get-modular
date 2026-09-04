import { scenarios } from "./scenarios.js";
import { diagnose } from "./api.js";
for(const s of scenarios){const ds=diagnose(s.input);const ok=s.expect==="ok"?ds.length===0:ds.some(d=>d.code===s.expect);console.log(`${s.name}: ${ok?"PASS":"FAIL"}${ds.length?` (${ds.map(d=>d.code).join(",")})`:""}`)}
console.log(`serializable-json: ${JSON.stringify(scenarios[0].input).length>0?"PASS":"FAIL"}`);
