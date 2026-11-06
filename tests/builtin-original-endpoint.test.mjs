import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as nodeModule from 'node:module';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../supabase/functions/pumpkin-profile-invites/index.ts',import.meta.url),'utf8').replace(/^import \{createClient\} from [^;]+;\s*/m,'');
const javascript=nodeModule.stripTypeScriptTypes?.(source);
const supported={skip:!javascript&&'TypeScript stripping requires Node 22.13 or later'};
function endpoint({valid=true,mappingOwner='owner-1',path='owner-1/imports/builtin-00000000-0000-4000-8000-000000000001-original.pdf',importOwner='owner-1',importPath=null}={}){
 let handler;const signed=[];
 const createClient=()=>({from(table){
  const filter={};return {select(){return this},eq(k,v){filter[k]=v;return this},is(){return this},gt(){return this},async maybeSingle(){
   if(table==='pc_profile_invites')return{data:valid?{owner_id:'owner-1',person_id:'person-1',expires_at:'2099-01-01T00:00:00Z'}:null};
   if(table==='pc_builtin_originals')return{data:filter.user_id===mappingOwner?{original_path:path}:null};
   if(table==='pc_imports')return{data:filter.user_id===importOwner&&importPath?{original_path:importPath}:null};throw Error('unexpected table '+table);
  }};
 },storage:{from(bucket){assert.equal(bucket,'pc-family-imports');return{createSignedUrl:async(path,seconds)=>{signed.push({path,seconds});return{data:{signedUrl:'https://storage.example/signed'}}}}}}});
 const Deno={env:{get(name){return name==='SUPABASE_URL'?'https://example.invalid':name==='SUPABASE_SERVICE_ROLE_KEY'?'test-key':undefined}},serve(fn){handler=fn}};
 runInNewContext(javascript,{Deno,createClient,Response,Request,URL,TextEncoder,TextDecoder,Uint8Array,crypto,console:{error(){}}});
 return{handler,signed};
}
function request(extra={}){return new Request('https://example.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'print',token:'A'.repeat(43),templateId:'ccd5c6ea6de81bc1',user_id:'other',...extra})})}
test('guest built-in originals are signed only for the invitation owner',supported,async()=>{
 const app=endpoint();const response=await app.handler(request());assert.equal(response.status,200);assert.deepEqual(app.signed,[{path:'owner-1/imports/builtin-00000000-0000-4000-8000-000000000001-original.pdf',seconds:120}]);
});
test('existing family imports remain printable without the built-in filename convention',supported,async()=>{
 const importPath='owner-1/imports/00000000-0000-4000-8000-000000000001-original.pdf';
 const app=endpoint({importPath});const response=await app.handler(request({templateId:undefined,importId:'00000000-0000-4000-8000-000000000001'}));
 assert.equal(response.status,200);assert.deepEqual(app.signed,[{path:importPath,seconds:120}]);
});
test('invalid invites, other families, unknown IDs and foreign paths cannot sign',supported,async()=>{
 for(const [opts,body,status] of [[{valid:false},{},401],[{mappingOwner:'other'},{},404],[{}, {templateId:'0123456789abcdef'},400],[{path:'other/imports/file.pdf'},{},404],[{path:'owner-1/imports/../file.pdf'},{},404],[{path:'owner-1/imports/00000000-0000-4000-8000-000000000001-original.pdf'},{},404],[{path:'owner-1/imports/builtin-extra/builtin-00000000-0000-4000-8000-000000000001-original.pdf'},{},404]]){
  const app=endpoint(opts);const response=await app.handler(request(body));assert.equal(response.status,status);assert.equal(app.signed.length,0);
 }
});
