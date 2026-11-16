import test from "node:test";
import assert from "node:assert/strict";
import {createInviteAccess,SESSION_KEY,REMEMBERED_KEY,REMEMBER_KEY} from "../guest-access.js";
import {readFileSync} from "node:fs";

const A="A".repeat(43),B="B".repeat(43),C="C".repeat(43),now=Date.UTC(2026,9,30),DAY=86400000;
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
const saved=local=>JSON.parse(local.getItem(REMEMBERED_KEY)||"[]");
const confirmAs=(env,personId,name,days=7)=>env.access.confirm({personId,name,expiresAt:new Date(now+days*DAY).toISOString()});

test("Private fragment is scrubbed immediately and remembered only once the server confirms it",()=>{
 const env=setup({hash:"#invite="+A});
 assert.equal(env.access.token,A);
 assert.equal(env.scrubbed,1);
 assert.equal(env.session.getItem(SESSION_KEY),A);
 assert.equal(env.local.getItem(REMEMBERED_KEY),null,"nothing is saved before the server confirms the link");
 assert.equal(env.access.isRemembered(),false);
 assert.deepEqual(confirmAs(env,"charlotte","Charlotte"),{remembered:true});
 assert.equal(env.access.isRemembered(),true);
 assert.deepEqual(saved(env.local).map(x=>[x.personId,x.name]),[["charlotte","Charlotte"]]);
 assert.equal(env.access.link(),base+"#invite="+A);
});
test("Coming back without the link opens the only remembered person",()=>{
 const env=setup({hash:"#invite="+A});confirmAs(env,"charlotte","Charlotte");
 const back=setup({local:env.local,time:now+DAY});
 assert.equal(back.access.token,A);
 assert.equal(back.session.getItem(SESSION_KEY),A);
});
test("A shared device remembers several people and asks who is picking",()=>{
 const local=memory();
 confirmAs(setup({hash:"#invite="+A,local}),"charlotte","Charlotte");
 confirmAs(setup({hash:"#invite="+B,local}),"violet","Violet");
 const back=setup({local});
 assert.equal(back.access.token,null,"never guesses between family members");
 assert.deepEqual(back.access.people().map(x=>x.name),["Violet","Charlotte"]);
 assert.equal(back.access.choose(1),true);
 assert.equal(back.session.getItem(SESSION_KEY),A);
 assert.equal(setup({session:back.session,local}).access.token,A);
 assert.equal(back.access.choose(5),false);
});
test("A newer link for the same person replaces their older one",()=>{
 const local=memory();
 confirmAs(setup({hash:"#invite="+A,local}),"charlotte","Charlotte");
 confirmAs(setup({hash:"#invite="+C,local}),"violet","Violet");
 confirmAs(setup({hash:"#invite="+B,local}),"charlotte","Charlotte");
 assert.deepEqual(saved(local).map(x=>x.token),[B,C]);
});
test("Revocation and Forget remove only that person",()=>{
 const local=memory();
 const a=setup({hash:"#invite="+A,local});confirmAs(a,"charlotte","Charlotte");
 const b=setup({hash:"#invite="+B,local});confirmAs(b,"violet","Violet");
 a.access.invalidate();
 assert.equal(a.session.getItem(SESSION_KEY),null);
 assert.deepEqual(saved(local).map(x=>x.token),[B]);
 b.access.forget();
 assert.deepEqual(saved(local),[]);
 assert.equal(setup({local}).access.token,null);
});
test("An expired link is kept for a while so a parent can extend it",()=>{
 const env=setup({hash:"#invite="+A});confirmAs(env,"charlotte","Charlotte",7);
 const afterExpiry=setup({local:env.local,time:now+20*DAY});
 assert.equal(afterExpiry.access.token,A,"still tried; the server decides");
 afterExpiry.access.noteExpired(new Date(now+7*DAY).toISOString());
 const muchLater=setup({local:env.local,time:now+38*DAY});
 assert.equal(muchLater.access.token,null);
 assert.deepEqual(muchLater.access.people(),[]);
});
test("Private Safari/storage-blocking mode still opens the link for this visit",()=>{
 const session=memory(),getPersistent=()=>{throw Error("Storage disabled");};
 const access=createInviteAccess({hash:"#invite="+A,baseUrl:base,getSession:()=>session,getPersistent,now:()=>now});
 assert.equal(access.token,A);
 assert.deepEqual(access.confirm({personId:"charlotte",name:"Charlotte",expiresAt:new Date(now+DAY).toISOString()}),{remembered:false});
 assert.equal(access.link(),base+"#invite="+A);
});
test("Malformed fragments are not accepted and never open someone else",()=>{
 const local=memory();
 confirmAs(setup({hash:"#invite="+A,local}),"charlotte","Charlotte");
 const bad=setup({hash:"#invite=not-a-real-token",local});
 assert.equal(bad.access.token,null);assert.equal(bad.scrubbed,1);
 assert.equal(saved(local).length,1,"a bad link does not erase a remembered one");
 assert.equal(bad.access.people().length,1,"the chooser can still offer the remembered person");
});
test("A link remembered by an earlier version keeps working and is upgraded",()=>{
 const local=memory();local.setItem(REMEMBER_KEY,JSON.stringify({token:A,expiresAt:now+DAY}));
 const env=setup({local});
 assert.equal(env.access.token,A);
 confirmAs(env,"charlotte","Charlotte");
 assert.equal(local.getItem(REMEMBER_KEY),null);
 assert.deepEqual(saved(local).map(x=>[x.token,x.name]),[[A,"Charlotte"]]);
});
test("Top of private gallery leads with personal identity and shortcuts",()=>{
 const page=readFileSync(new URL("../guest.html",import.meta.url),"utf8");
 const script=readFileSync(new URL("../guest.js",import.meta.url),"utf8");
 assert.ok(page.indexOf('id="identity-heading"')<page.indexOf('id="guest-views"'));
 assert.ok(page.indexOf('id="guest-views"')<page.indexOf('id="family-lineup"'));
 assert.ok(page.indexOf('id="family-lineup"')<page.indexOf('id="view-heading"'));
 assert.ok(!page.includes('id="remember-device"'),"remembering is automatic; no button to find");
 assert.match(page,/id="switch-person"/);
 assert.match(page,/id="who-is-picking"/);
 assert.match(page,/id="home-screen"/);
 assert.match(page,/rel="apple-touch-icon" href="apple-touch-icon\.png"/);
 const banner=page.indexOf('id="other-person-banner"');
 assert.ok(banner>0&&page.indexOf('id="person-view"')>banner,"the family member picker lives in the family view, not the home row");
 assert.match(page,/id="copy-link"/);
 assert.match(page,/id="share-link"/);
 assert.match(page,/id="access-required"/);
 assert.match(page,/id="access-help"/);
 assert.equal(page.split('id="person-view"').length-1,1);
 assert.match(script,/access\.confirm\(data\)/);
 assert.match(script,/history\.replaceState\(null,"",url\)/);
 assert.match(script,/if\(error\.status===401\)/);
 assert.match(script,/access\.invalidate\(\)/);
 assert.match(script,/location\.replace\(location\.pathname\+location\.search\)/);
 assert.match(page,/guest\.js\?v=[A-Za-z0-9_-]+/);
});
