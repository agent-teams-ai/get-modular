import { diagnose, defineModule, many, optional, required, type Module } from "./api.js";
type Scenario = Readonly<{name:string; input:Parameters<typeof diagnose>[0]; expect:string}>;
const provider=(id:string,cap="cap/x"):Module=>defineModule(id,{provides:[cap]});
export const scenarios:readonly Scenario[]=[
{name:"required",input:{modules:[defineModule("a",{needs:[required("cap/x")]}),provider("p")]},expect:"ok"},
{name:"optional",input:{modules:[defineModule("a",{needs:[optional("cap/x")]})]},expect:"ok"},
{name:"many",input:{modules:[defineModule("a",{needs:[many("cap/x",1,2)]}),provider("p"),provider("q")]},expect:"ok"},
{name:"missing",input:{modules:[defineModule("a",{needs:[required("cap/x")]})]},expect:"missing"},
{name:"duplicate",input:{modules:[provider("a"),provider("a")]},expect:"duplicate"},
{name:"ambiguity",input:{modules:[defineModule("a",{needs:[required("cap/x")]}),provider("p"),provider("q")]},expect:"ambiguity"},
{name:"cycle",input:{modules:[defineModule("a",{needs:[required("cap/b")] }),defineModule("b",{needs:[required("cap/a")]})]},expect:"missing"},
{name:"disabled",input:{modules:[defineModule("a",{disabled:true})]},expect:"disabled"},
{name:"unreachable",input:{modules:[provider("orphan")]},expect:"ok"},
{name:"multiple-roots",input:{modules:[provider("r1"),provider("r2")],roots:["r1","r2"]},expect:"ok"},
{name:"deterministic-ordering",input:{modules:[provider("z"),provider("a")]},expect:"ok"},
{name:"hostile-keys",input:{modules:[provider("__proto__"),provider("constructor"),provider("then"),provider("é")]},expect:"ok"},
{name:"unknown-fields",input:{modules:[],unknown:["wat"]},expect:"unknown"},
{name:"no-fallback",input:{modules:[defineModule("a",{needs:[required("cap/no-fallback")]})]},expect:"missing"},
{name:"serializability",input:{modules:[provider("a")]},expect:"ok"},
{name:"declaration-emit",input:{modules:[provider("a")]},expect:"ok"},
{name:"no-executable-import",input:{modules:[provider("a")]},expect:"ok"}];
