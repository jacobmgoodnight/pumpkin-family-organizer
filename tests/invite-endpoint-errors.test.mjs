import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as nodeModule from 'node:module';
import {runInNewContext} from 'node:vm';

// Run the real Edge Function handler with a fake Supabase client. This never
// contacts a database and exercises the HTTP responses clients depend on.
const source=readFileSync(new URL('../supabase/functions/pumpkin-profile-invites/index.ts',import.meta.url),'utf8')
 .replace(/^import \{createClient\} from [^;]+;\s*/m,'');
// Node 22.0–22.12 does not provide this API. Keep the suite compatible with
// the declared engine range while exercising the real handler on 22.13+.
const javascript=nodeModule.stripTypeScriptTypes?.(source);
const supported={skip:!javascript&&'TypeScript stripping requires Node 22.13 or later'};
function endpoint(lookup){
 let handler,choiceWrites=0;
 const createClient=()=>({from(table){
  if(table==='pc_profile_invites'){
   const query={select(){return this;},eq(){return this;},is(){return this;},gt(){return this;},async maybeSingle(){return lookup;}};
   return query;
  }
  if(table==='pc_choices')return {async upsert(){choiceWrites++;return {error:null};}};
  throw Error('Unexpected table '+table);
 }});
 const Deno={env:{get(name){return name==='SUPABASE_URL'?'https://example.invalid':name==='SUPABASE_SERVICE_ROLE_KEY'?'test-key':undefined;}},serve(fn){handler=fn;}};
 runInNewContext(javascript,{Deno,createClient,Response,Request,URL,TextEncoder,TextDecoder,Uint8Array,crypto,console:{error(){}}});
 return {handler,get choiceWrites(){return choiceWrites;}};
}
function request(){
 return new Request('https://example.invalid/functions/v1/pumpkin-profile-invites',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({action:'choice',token:'A'.repeat(43),templateId:'test',favorite:true,finalPick:false})
 });
}
test('invitation database errors are retryable rather than invalidating remembered access',supported,async()=>{
 const app=endpoint({data:null,error:{message:'database unavailable'}});
 const response=await app.handler(request());
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{error:'Unable to complete this request'});
 assert.equal(app.choiceWrites,0);
});
test('a missing active invitation is rejected and cannot write a choice',supported,async()=>{
 const app=endpoint({data:null,error:null});
 const response=await app.handler(request());
 assert.equal(response.status,401);
 assert.equal((await response.json()).error,'Invitation invalid or expired');
 assert.equal(app.choiceWrites,0);
});
test('a valid invitation can still save its choice',supported,async()=>{
 const app=endpoint({data:{owner_id:'owner',person_id:'person',expires_at:'2099-01-01T00:00:00Z'},error:null});
 const response=await app.handler(request());
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,templateId:'test',favorite:true,finalPick:false});
 assert.equal(app.choiceWrites,1);
});
