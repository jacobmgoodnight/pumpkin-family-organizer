import test from "node:test";
import assert from "node:assert/strict";
import {createInviteAccess, SESSION_KEY, REMEMBER_KEY} from "../guest-access.js";

const A="A".repeat(43), B="B".repeat(43);
const time=Date.UTC(2026, 10, 2), expiry=new Date(time+86400000).toISOString();
function storage(){
 const items=new Map();
 return {getItem:k=>items.get(k)??null,setItem:(k,v)=>items.set(k,String(v)),removeItem:k=>items.delete(k)};
}
function open({token, session=storage(), local=storage()}={}){
 return {session, local, access:createInviteAccess({hash:token===undefined?"":"#invite="+token,
   getSession:()=>session,getPersistent:()=>local,now:()=>time})};
}

test("an invalid invitation does not open a previously saved family identity",()=>{
 const previous=open({token:A});
 assert.equal(previous.access.remember(expiry).ok,true);
 const invalid=open({token:"bad-link",session:previous.session,local:previous.local});
 assert.equal(invalid.access.token,null);
 // A bad link should not destroy the valid invitation on the device.
 assert.equal(open({session:previous.session,local:previous.local}).access.token,A);
});

test("a revoked or offline replacement does not erase a remembered invitation",()=>{
 const first=open({token:A});first.access.remember(expiry);
 const replacement=open({token:B,session:first.session,local:first.local});
 assert.equal(replacement.access.token,B);
 assert.equal(JSON.parse(first.local.getItem(REMEMBER_KEY)).token,A);
 // A server rejection clears only the rejected session; network failure does
 // not call invalidate at all. Either way, the old remembered link survives.
 replacement.access.invalidate();
 assert.equal(open({local:first.local}).access.token,A);
});

test("a confirmed replacement does not erase another tab's newer remembered link",()=>{
 const first=open({token:A});first.access.remember(expiry);
 const replacement=open({token:B,local:first.local});
 const newest=open({token:"C".repeat(43),local:first.local});newest.access.remember(expiry);
 replacement.access.confirm();
 assert.equal(JSON.parse(first.local.getItem(REMEMBER_KEY)).token,"C".repeat(43));
});

test("offline replacement can validate after reload without restoring the old identity",()=>{
 const first=open({token:A});first.access.remember(expiry);
 const replacement=open({token:B,session:first.session,local:first.local});
 const retry=open({session:replacement.session,local:first.local});
 assert.equal(retry.access.token,B);
 retry.access.confirm();
 assert.equal(first.local.getItem(REMEMBER_KEY),null);
 assert.equal(open({session:retry.session,local:first.local}).access.token,B);
});

test("an offline replacement retry does not erase a newer identity saved in another tab",()=>{
 const first=open({token:A});first.access.remember(expiry);
 const replacement=open({token:B,session:first.session,local:first.local});
 const newest=open({token:"C".repeat(43),local:first.local});newest.access.remember(expiry);
 const retry=open({session:replacement.session,local:first.local});
 retry.access.confirm();
 assert.equal(JSON.parse(first.local.getItem(REMEMBER_KEY)).token,"C".repeat(43));
});

for(const action of ["invalidate","forget"]){
 test(`a stale tab cannot ${action} a different person's newly remembered invitation`,()=>{
   const first=open({token:A});
   first.access.remember(expiry);
   const second=open({token:B,local:first.local});
   assert.equal(second.access.remember(expiry).ok,true);
   assert.equal(first.access.isRemembered(),false);
   first.access[action]();
   assert.equal(first.session.getItem(SESSION_KEY),null);
   assert.equal(JSON.parse(first.local.getItem(REMEMBER_KEY)).token,B);
   assert.equal(open({local:first.local}).access.token,B);
 });
}
