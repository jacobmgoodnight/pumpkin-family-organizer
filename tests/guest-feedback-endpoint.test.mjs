import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as nodeModule from 'node:module';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/pumpkin-profile-invites/index.ts',import.meta.url),'utf8').replace(/^import \{createClient\} from [^;]+;\s*/m,'');
const javascript=nodeModule.stripTypeScriptTypes?.(source);
const supported={skip:!javascript&&'TypeScript stripping requires Node 22.13 or later'};
function endpoint({valid=true,recent=0,total=0}={}){
 let handler;const writes=[];
 const createClient=()=>({async rpc(name,args){
  assert.equal(name,'pc_submit_search_feedback');
  if(recent>=20)return {data:'hourly_limit',error:null};
  if(total>=1000)return {data:'household_limit',error:null};
  writes.push({table:'pc_search_feedback',row:{user_id:args.p_user_id,person_id:args.p_person_id,template_id:args.p_template_id,note:args.p_note}});
  return {data:'ok',error:null};
 },from(table){
  const filters={};
  const q={select(){return this;},eq(k,v){filters[k]=v;return this;},is(){return this;},gt(){return this;},gte(){return this;},
   async maybeSingle(){return {data:valid?{owner_id:'owner-1',person_id:'person-1',expires_at:'2099-01-01T00:00:00Z'}:null,error:null};},
   then(resolve,reject){return Promise.resolve({count:filters.person_id?recent:total,error:null}).then(resolve,reject);},
   async insert(row){writes.push({table,row});return {error:null};}};
  return q;
 }});
 const Deno={env:{get(name){return name==='SUPABASE_URL'?'https://example.invalid':name==='SUPABASE_SERVICE_ROLE_KEY'?'test-key':undefined;}},serve(fn){handler=fn;}};
 runInNewContext(javascript,{Deno,createClient,Response,Request,URL,TextEncoder,TextDecoder,Uint8Array,crypto,console:{error(){}}});
 return {handler,writes};
}
function request(body={}){return new Request('https://example.invalid/functions/v1/pumpkin-profile-invites',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'feedback',token:'A'.repeat(43),templateId:'ccd5c6ea6de81bc1',note:'This is a bat',...body})});}
test('feedback is tied to the verified invitation, not supplied owner or person',supported,async()=>{
 const app=endpoint();const response=await app.handler(request({user_id:'other',person_id:'other'}));
 assert.equal(response.status,200);assert.equal(app.writes.length,1);
 assert.equal(app.writes[0].table,'pc_search_feedback');
 assert.deepEqual(JSON.parse(JSON.stringify(app.writes[0].row)),{user_id:'owner-1',person_id:'person-1',template_id:'ccd5c6ea6de81bc1',note:'This is a bat'});
});
test('invalid invitations, unsupported IDs, oversized or empty notes cannot submit',supported,async()=>{
 const invalid=endpoint({valid:false});assert.equal((await invalid.handler(request())).status,401);assert.equal(invalid.writes.length,0);
 for(const body of [{templateId:'family:fake'},{templateId:'0123456789abcdef'},{templateId:'x'.repeat(200)},{note:' '.repeat(10)},{note:'a'.repeat(501)}]){
  const app=endpoint();assert.equal((await app.handler(request(body))).status,400);assert.equal(app.writes.length,0);
 }
});
test('feedback allowlist covers the current built-in catalog',()=>{
 const ids=JSON.parse(source.match(/const BUILTIN_TEMPLATE_IDS=new Set\((\[[^\n]*\])\);/)[1]);
 const catalog=JSON.parse(readFileSync(new URL('../guest-catalog.json',import.meta.url),'utf8'));
 assert.deepEqual(ids,catalog.map(item=>item.id));
});
test('feedback is limited per person and household',supported,async()=>{
 for(const options of [{recent:20},{total:1000}]){const app=endpoint(options);assert.equal((await app.handler(request())).status,429);assert.equal(app.writes.length,0);}
});
test('feedback limits and insertion run under a service-only transaction lock',()=>{
 const sql=readFileSync(new URL('../supabase/search-feedback.sql',import.meta.url),'utf8');
 assert.match(sql,/security invoker/i);
 assert.match(sql,/pg_advisory_xact_lock/i);
 assert.match(sql,/revoke all on function public\.pc_submit_search_feedback\(uuid,text,text,text\) from public, anon, authenticated/i);
 assert.match(sql,/grant execute on function public\.pc_submit_search_feedback\(uuid,text,text,text\) to service_role/i);
 assert.match(sql,/count\(\*\)[\s\S]*insert into public\.pc_search_feedback/i);
});
