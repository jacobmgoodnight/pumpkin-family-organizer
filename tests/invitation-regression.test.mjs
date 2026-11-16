import test from "node:test";
import assert from "node:assert/strict";
import {createInviteAccess, SESSION_KEY, REMEMBERED_KEY} from "../guest-access.js";

const A="A".repeat(43), B="B".repeat(43), C="C".repeat(43);
const time=Date.UTC(2026, 10, 2), expiry=new Date(time+86400000).toISOString();
function storage(){
 const items=new Map();
 return {getItem:k=>items.get(k)??null,setItem:(k,v)=>items.set(k,String(v)),removeItem:k=>items.delete(k)};
}
function open({token, session=storage(), local=storage()}={}){
 return {session, local, access:createInviteAccess({hash:token===undefined?"":"#invite="+token,
   getSession:()=>session,getPersistent:()=>local,now:()=>time})};
}
const tokens=local=>JSON.parse(local.getItem(REMEMBERED_KEY)||"[]").map(x=>x.token);
const confirm=(env,personId)=>env.access.confirm({personId,name:personId,expiresAt:expiry});

test("an invalid invitation does not open a previously saved family identity",()=>{
 const previous=open({token:A});
 assert.equal(confirm(previous,"charlotte").remembered,true);
 const invalid=open({token:"bad-link",session:previous.session,local:previous.local});
 assert.equal(invalid.access.token,null);
 // A bad link should not destroy the valid invitation on the device.
 assert.equal(open({local:previous.local}).access.token,A);
});

test("a revoked or offline replacement does not erase a remembered invitation",()=>{
 const first=open({token:A});confirm(first,"charlotte");
 const replacement=open({token:B,session:first.session,local:first.local});
 assert.equal(replacement.access.token,B);
 assert.deepEqual(tokens(first.local),[A]);
 // A server rejection clears only the rejected link; a network failure does
 // not call invalidate at all. Either way, the remembered link survives.
 replacement.access.invalidate();
 assert.equal(open({local:first.local}).access.token,A);
});

test("confirming a link never erases another tab's newly remembered person",()=>{
 const first=open({token:A});confirm(first,"charlotte");
 const replacement=open({token:B,local:first.local});
 const newest=open({token:C,local:first.local});confirm(newest,"violet");
 confirm(replacement,"charlotte");
 assert.deepEqual(tokens(first.local).sort(),[B,C]);
});

test("an offline replacement can validate after reload and then replaces the old link",()=>{
 const first=open({token:A});confirm(first,"charlotte");
 const replacement=open({token:B,session:first.session,local:first.local});
 const retry=open({session:replacement.session,local:first.local});
 assert.equal(retry.access.token,B);
 confirm(retry,"charlotte");
 assert.deepEqual(tokens(first.local),[B]);
 assert.equal(open({local:first.local}).access.token,B);
});

for(const action of ["invalidate","forget"]){
 test(`a stale tab cannot ${action} a different person's remembered invitation`,()=>{
   const first=open({token:A});confirm(first,"charlotte");
   const second=open({token:B,local:first.local});
   assert.equal(confirm(second,"violet").remembered,true);
   first.access[action]();
   assert.equal(first.session.getItem(SESSION_KEY),null);
   assert.deepEqual(tokens(first.local),[B]);
   assert.equal(open({local:first.local}).access.token,B);
 });
}
