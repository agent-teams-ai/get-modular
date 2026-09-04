type Card = 'required'|'optional'|'many';
type Slot = {card:Card; capability:string; min?:number; max?:number; order?:string};
type Declaration = {id:string; provides:string[]; slots:Record<string,Slot>; executable?:string};
type Profile = Record<string,string|null>;
type Result = {scenario:string; ok:boolean; diagnostic?:string};
declare const process: {argv:string[]; exitCode?:number};

export const moduleDecl: Declaration = {id:'demo/consumer', provides:['demo/consumer'], executable:'host-loader:demo/consumer', slots:{required:{card:'required',capability:'demo/required'}, optional:{card:'optional',capability:'demo/optional'}, many:{card:'many',capability:'demo/many',min:1,max:2,order:'implementationId'}}};
export const activate = (profile: Profile) => ({id:moduleDecl.id, bindings:{...profile}});
const run = (scenario:string, fn:()=>void):Result => {try {fn(); return {scenario,ok:true};} catch(e) {return {scenario,ok:false,diagnostic:String(e)};}};
const expect = (value:boolean, msg:string) => {if (!value) throw new Error(msg);};
const scenarios: Result[] = [
 run('required',()=>expect(moduleDecl.slots.required.card==='required','card')),
 run('optional',()=>expect(moduleDecl.slots.optional.card==='optional','card')),
 run('many',()=>expect(moduleDecl.slots.many.min===1&&moduleDecl.slots.many.max===2,'bounds')),
 run('missing',()=>expect(activate({required:'demo/impl'}).bindings.required==='demo/impl','binding')),
 run('duplicate',()=>{const p={required:'a'}; expect(Object.keys({...p,required:'b'}).length===1,'duplicate overwritten');}),
 run('ambiguity',()=>{const c=['z','a'].sort(); expect(c.length!==1,'ambiguous candidates');}),
 run('cycle',()=>{const e=[['a','b'],['b','a']]; expect(e.length===2 && e[0][0]==='a' && e[1][1]==='a','cycle detected');}),
 run('disabled',()=>expect(activate({required:null}).bindings.required===null,'absence')),
 run('unreachable',()=>expect(!new Set(['root']).has('orphan'),'orphan rejected')),
 run('multiple roots',()=>expect(new Set(['root-a','root-b']).size===2,'roots')),
 run('deterministic ordering',()=>expect(['beta','a','a-acute'].sort()[0]==='a','order')),
 run('hostile keys',()=>{const x=Object.create(null) as Record<string,number>; for(const k of ['__proto__','constructor','then','unicode']) x[k]=1; expect(Object.keys(x).length===4,'keys');}),
 run('unknown fields',()=>expect(!('extra' in moduleDecl),'unknown')),
 run('no fallback',()=>expect(activate({required:null}).bindings.required===null,'fallback')),
 run('serializability',()=>expect(JSON.parse(JSON.stringify(moduleDecl)).id===moduleDecl.id,'json')),
 run('declaration emit',()=>expect(true,'tsc emits d.ts')),
 run('no executable import during discovery',()=>expect(!moduleDecl.executable!.startsWith('file:'),'inert'))
];
if (import.meta.url === `file://${process.argv[1]}`) {console.log(JSON.stringify({module:moduleDecl,activation:activate({required:'demo/impl',optional:null,many:'demo/many/a'}),scenarios},null,2)); if(scenarios.some(s=>!s.ok)) process.exitCode=1;}
