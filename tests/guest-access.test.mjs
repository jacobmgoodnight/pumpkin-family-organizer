import test from "node:test";
import assert from "node:assert/strict";
import {createInviteAccess,SESSION_KEY,REMEMBER_KEY} from "../guest-access.js";
import {readFileSync} from "node:fs";

const A="A".repeat(43),B="B".repeat(43),now=Date.UTC(2026,9,30);
const base="https://jacobmgoodnight.github.io/pumpkin-family-organizer/guest.html";
function memory(){
 const values=new Map();
 return {getItem:key=>values.get(key)??null,setItem:(key,val)=>values.set(key,String(val)),removeItem:key=>values.delete(key),values};
}
function setup({hash="",session=memory(),local=memory(),time=now}={}){
 let scrubbed=0;
 const access=createInviteAccess({hash,baseUrl:base,clearFragment:()=>scrubbed++,
   getSession:()=>session,getPersistent:()=>local,now:()=>time});
 return {access,session,local,get scrubbed(){return scrubbed;}};
}
test("Private fragment is scrubbed immediately; token is session-only until opt-in",()=>{
 const env=setup({hash:"#invite="+A});
 assert.equal(env.access.token,A);
 assert.equal(env.scrubbed,1);
 assert.equal(env.session.getItem(SESSION_KEY),A);
 assert.equal(env.local.getItem(REMEMBER_KEY),null);
 assert.equal(env.access.link(),base+"#invite="+A);
 assert.equal(env.access.isRemembered(),false);
});
test("Remembering after valid invitation persists only until server expiry",()=>{
 const env=setup({hash:"#invite="+A});
 const date=new Date(now+7*86400000).toISOString();
 assert.deepEqual(env.access.remember(date),{ok:true});
 assert.equal(env.access.isRemembered(),true);
 const reopened=setup({session:memory(),local:env.local,time:now+86400000});
 assert.equal(reopened.access.token,A);
 assert.equal(reopened.access.isRemembered(),true);
 const expired=setup({session:memory(),local:env.local,time:now+8*86400000});
 assert.equal(expired.access.token,null);
 assert.equal(expired.local.getItem(REMEMBER_KEY),null);
});
test("Opening a different person's private link never silently restores a former account",()=>{
 const env=setup({hash:"#invite="+A});env.access.remember(new Date(now+86400000).toISOString());
 const next=setup({hash:"#invite="+B,session:env.session,local:env.local});
 assert.equal(next.access.token,B);
 assert.equal(next.access.isRemembered(),false);
 assert.equal(next.session.getItem(SESSION_KEY),B);
 assert.equal(next.local.getItem(REMEMBER_KEY),null);
});
test("Revoked link cleanup and intentional device sign-out erase local credentials",()=>{
 const env=setup({hash:"#invite="+A});env.access.remember(new Date(now+86400000).toISOString());
 env.access.invalidate();
 assert.equal(env.session.getItem(SESSION_KEY),null);
 assert.equal(env.local.getItem(REMEMBER_KEY),null);
 const second=setup({hash:"#invite="+B});second.access.remember(new Date(now+86400000).toISOString());
 second.access.forget();
 assert.equal(second.local.getItem(REMEMBER_KEY),null);
 assert.equal(second.session.getItem(SESSION_KEY),null);
});
test("Private Safari/storage-blocking mode leaves session usable and offers link-copy fallback",()=>{
 const session=memory(),getPersistent=()=>{throw Error("Storage disabled");};
 const access=createInviteAccess({hash:"#invite="+A,baseUrl:base,getSession:()=>session,getPersistent});
 assert.equal(access.token,A);
 assert.equal(access.remember(new Date(now+3*86400000).toISOString()).ok,false);
 assert.equal(access.link(),base+"#invite="+A);
});
test("Malformed fragments are not accepted; expired invites cannot be remembered",()=>{
 const bad=setup({hash:"#invite=not-a-real-token"});
 assert.equal(bad.access.token,null);assert.equal(bad.scrubbed,1);
 const good=setup({hash:"#invite="+A});
 assert.equal(good.access.remember(new Date(now-1000).toISOString()).ok,false);
 assert.equal(good.local.getItem(REMEMBER_KEY),null);
});
test("Top of private gallery leads with personal identity and shortcuts",()=>{
 const page=readFileSync(new URL("../guest.html",import.meta.url),"utf8");
 const script=readFileSync(new URL("../guest.js",import.meta.url),"utf8");
 assert.ok(page.indexOf('id="identity-heading"')<page.indexOf('id="guest-views"'));
 assert.ok(page.indexOf('id="guest-views"')<page.indexOf('id="family-lineup"'));
 assert.ok(page.indexOf('id="family-lineup"')<page.indexOf('id="view-heading"'));
 assert.match(page,/id="remember-device"/);
 assert.match(page,/id="copy-link"/);
 assert.match(page,/id="share-link"/);
 assert.match(page,/id="access-required"/);
 assert.match(page,/id="access-help"/);
 assert.equal(page.split('id="person-view"').length-1,1);
 assert.match(script,/access\.remember\(me\.expiresAt\)/);
 assert.match(script,/if\(error\.status===401\)/);
 assert.match(script,/access\.invalidate\(\)/);
 assert.match(script,/location\.replace\(location\.pathname\+location\.search\)/);
 assert.match(page,/guest\.js\?v=20261030g/);
});
