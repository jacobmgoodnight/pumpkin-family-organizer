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
