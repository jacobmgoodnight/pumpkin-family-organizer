import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as nodeModule from 'node:module';
import {runInNewContext} from 'node:vm';

// Runs the real invitation Edge Function against a small in-memory table fake.
// Nothing here contacts Supabase.
const source=readFileSync(new URL('../supabase/functions/pumpkin-invite-renewal/index.ts',import.meta.url),'utf8')
 .replace(/^import \{createClient\} from [^;]+;\s*/m,'');
const javascript=nodeModule.stripTypeScriptTypes?.(source);
const supported={skip:!javascript&&'TypeScript stripping requires Node 22.13 or later'};
const DAY=86400000;
const hash=token=>createHash('sha256').update(token).digest('hex');
const iso=ms=>new Date(ms).toISOString();
const ORGANIZER_JWT='j'.repeat(120);

function fakeDatabase(tables){
 const writes=[];
 const compare=(a,b)=>{const x=Date.parse(a),y=Date.parse(b);return Number.isFinite(x)&&Number.isFinite(y)?x-y:String(a).localeCompare(String(b));};
 function from(table){
  const filters=[];let changes=null,order=null,limit=null,columns=null;
  const rows=()=>tables[table]||(tables[table]=[]);
  const run=()=>{
   let found=rows().filter(row=>filters.every(check=>check(row)));
   if(changes){for(const row of found)Object.assign(row,changes);writes.push({table,changes,count:found.length});}
   if(order)found=[...found].sort((a,b)=>compare(a[order.column],b[order.column])*(order.ascending?1:-1));
   if(limit!==null)found=found.slice(0,limit);
   return found.map(row=>columns?Object.fromEntries(columns.map(column=>[column,row[column]])):{...row});
  };
  const query={
   select(list){if(typeof list==='string'&&list!=='*')columns=list.split(',').map(column=>column.trim());return query;},
   eq(column,value){filters.push(row=>row[column]===value);return query;},
   is(column,value){filters.push(row=>(row[column]??null)===value);return query;},
   gt(column,value){filters.push(row=>compare(row[column],value)>0);return query;},
   order(column,{ascending=true}={}){order={column,ascending};return query;},
   limit(count){limit=count;return query;},
   update(values){changes=values;return query;},
   async upsert(row){rows().push({...row});writes.push({table,upsert:row});return {error:null};},
   async maybeSingle(){return {data:run()[0]||null,error:null};},
   then(resolve,reject){try{resolve({data:run(),error:null});}catch(error){reject(error);}}
  };
  return query;
 }
 const auth={async getUser(jwt){return jwt===ORGANIZER_JWT?{data:{user:{id:'owner',email:'parent@example.test',is_anonymous:false}},error:null}:{data:{user:null},error:{message:'bad jwt'}};}};
 return {from,auth,writes};
}
function endpoint(tables){
 let handler;const db=fakeDatabase(tables);
 const Deno={env:{get(name){return name==='SUPABASE_URL'?'https://example.invalid':name==='SUPABASE_SERVICE_ROLE_KEY'?'test-key':undefined;}},serve(fn){handler=fn;}};
 runInNewContext(javascript,{Deno,createClient:()=>db,Response,Request,URL,TextEncoder,TextDecoder,Uint8Array,crypto,console:{error(){}}});
 return {db,async call(body,organizer=false){
  const response=await handler(new Request('https://example.invalid/functions/v1/pumpkin-invite-renewal',{method:'POST',
   headers:{'content-type':'application/json',...(organizer?{authorization:'Bearer '+ORGANIZER_JWT}:{})},body:JSON.stringify(body)}));
  return {status:response.status,body:await response.json()};
 }};
}
function family(invites){
 return {pc_accounts:[{user_id:'owner'}],
  pc_people:[{user_id:'owner',person_id:'charlotte',display_name:'Charlotte'},{user_id:'owner',person_id:'violet',display_name:'Violet'}],
  pc_profile_invites:invites,pc_choices:[]};
}
const LIVE='L'.repeat(43),EXPIRED='E'.repeat(43),REVOKED='R'.repeat(43);
function invites(now=Date.now()){
 return [
  {id:'11111111-1111-4111-8111-111111111111',owner_id:'owner',person_id:'charlotte',token_hash:hash(LIVE),created_at:iso(now-5*DAY),expires_at:iso(now+3*DAY),revoked_at:null},
  {id:'22222222-2222-4222-8222-222222222222',owner_id:'owner',person_id:'violet',token_hash:hash(EXPIRED),created_at:iso(now-40*DAY),expires_at:iso(now-10*DAY),revoked_at:null},
  {id:'33333333-3333-4333-8333-333333333333',owner_id:'owner',person_id:'violet',token_hash:hash(REVOKED),created_at:iso(now-60*DAY),expires_at:iso(now+DAY),revoked_at:iso(now-41*DAY)}
 ];
}

test('the organizer list includes recently expired links but not revoked ones',supported,async()=>{
 const app=endpoint(family(invites()));
 const listed=await app.call({action:'list'},true);
 assert.equal(listed.status,200);
 assert.deepEqual(listed.body.invites.map(x=>x.id).sort(),['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']);
 assert.ok(listed.body.invites.every(x=>!('token_hash' in x)),'never returns token hashes');
 assert.equal((await app.call({action:'list'})).status,401,'organizer sign-in required');
});

test('extending keeps the same link working, including one that already expired',supported,async()=>{
 const tables=family(invites()),app=endpoint(tables);
 assert.equal((await app.call({action:'status',token:EXPIRED})).body.reason,'expired');
 const before=Date.now();
 const extended=await app.call({action:'extend',id:'22222222-2222-4222-8222-222222222222',days:30},true);
 assert.equal(extended.status,200);
 assert.equal(extended.body.personId,'violet');
 const expiry=Date.parse(extended.body.expiresAt);
 assert.ok(expiry>=before+30*DAY-1000&&expiry<=Date.now()+30*DAY+1000,'thirty days from now');
 const reopened=await app.call({action:'status',token:EXPIRED});
 assert.equal(reopened.body.reason,'active','the same expired link works again after extending');
});

test('extending never shortens a link and cannot revive a replaced one',supported,async()=>{
 const tables=family(invites()),app=endpoint(tables);
 const original=tables.pc_profile_invites[0].expires_at;
 tables.pc_profile_invites[0].expires_at=iso(Date.now()+20*DAY);
 const kept=await app.call({action:'extend',id:'11111111-1111-4111-8111-111111111111',days:7},true);
 assert.equal(kept.status,200);
 assert.equal(kept.body.expiresAt,tables.pc_profile_invites[0].expires_at,'a 7-day extension does not cut 20 days short');
 assert.notEqual(kept.body.expiresAt,original);
 const revoked=await app.call({action:'extend',id:'33333333-3333-4333-8333-333333333333',days:30},true);
 assert.equal(revoked.status,404);
 assert.equal(tables.pc_profile_invites[2].revoked_at!==null,true);
});

test('only the signed-in organizer can extend, and only their own links',supported,async()=>{
 const tables=family(invites());tables.pc_profile_invites[0].owner_id='someone-else';
 const app=endpoint(tables);
 assert.equal((await app.call({action:'extend',id:'11111111-1111-4111-8111-111111111111',days:30})).status,401,'no organizer sign-in');
 assert.equal((await app.call({action:'extend',id:'11111111-1111-4111-8111-111111111111',days:30,token:LIVE})).status,401,'a guest link is not an organizer');
 assert.equal((await app.call({action:'extend',id:'11111111-1111-4111-8111-111111111111',days:30},true)).status,404,'another account\'s link');
 assert.equal((await app.call({action:'extend',id:'not-a-uuid',days:30},true)).status,400);
 assert.equal(app.db.writes.length,0);
});

test('a link holder learns expired versus replaced without naming a revoked holder',supported,async()=>{
 const app=endpoint(family(invites()));
 const expired=(await app.call({action:'status',token:EXPIRED})).body;
 assert.deepEqual(expired,{reason:'expired',name:'Violet',expiredAt:expired.expiredAt});
 assert.ok(Date.parse(expired.expiredAt)<Date.now());
 assert.deepEqual((await app.call({action:'status',token:REVOKED})).body,{reason:'replaced'});
 assert.deepEqual((await app.call({action:'status',token:'U'.repeat(43)})).body,{reason:'unknown'});
 assert.deepEqual((await app.call({action:'status',token:'short'})).body,{reason:'unknown'});
 assert.equal((await app.call({action:'status',token:LIVE})).body.reason,'active');
 assert.equal(app.db.writes.length,0,'status never writes');
});
