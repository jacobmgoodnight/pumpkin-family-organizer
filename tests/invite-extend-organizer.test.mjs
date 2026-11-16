import test from "node:test";
import assert from "node:assert/strict";
import {init} from "../family-invites.js";

class Element {
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.listeners={};this.open=false;this.textContent="";}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(){}
 addEventListener(name,callback){this.listeners[name]=callback;}
 fire(name){return this.listeners[name]?.();}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function find(node,match){
 if(typeof match==="string"?node.textContent===match:match.test(node.textContent))return node;
 for(const child of node.children||[]){const found=find(child,match);if(found)return found;}
 return null;
}
function memoryStorage(){
 const values=new Map();
 return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),values};
}
function withPage(run){
 const old={document:globalThis.document,window:globalThis.window,location:globalThis.location};
 const listeners={},localStorage=memoryStorage();
 globalThis.document={createElement:tag=>new Element(tag)};
 globalThis.window={addEventListener:(name,callback)=>listeners[name]=callback,localStorage};
 globalThis.location={href:"https://example.test/pumpkin/index.html"};
 return Promise.resolve(run({listeners,localStorage})).finally(()=>{
  for(const key of Object.keys(old)){if(old[key]===undefined)delete globalThis[key];else globalThis[key]=old[key];}
 });
}
function organizer({invites,calls,owner="owner-a"}){
 const settings=new Element("div");
 init({settings,getOwner:()=>owner,bridge:{snapshot:()=>({people:[{id:"violet",name:"Violet"}]})},
  getClient:()=>({functions:{invoke:async(fn,{body})=>{
   calls.push(body);Object.defineProperty(body,"fn",{value:fn});
   if(body.action==="list")return {data:{invites:invites()}};
   if(body.action==="extend")return {data:{id:body.id,personId:"violet",expiresAt:"2099-03-01T12:00:00Z"}};
   if(body.action==="create")return {data:{id:"fresh",token:"T".repeat(43)}};
   return {data:{ok:true}};
  }}})});
 const section=settings.children[0];section.open=true;
 return section;
}

test("an expired link offers Extend, which keeps the same link and reports the new date",()=>withPage(async()=>{
 const calls=[];let current=[{id:"expired-id",person_id:"violet",expires_at:new Date(Date.now()-3*86400000).toISOString()}];
 const section=organizer({invites:()=>current,calls});
 section.fire("toggle");await settle();
 assert.equal(calls[0].action,"list");
 assert.equal(calls[0].fn,"pumpkin-invite-renewal","recently expired links come from the renewal function");
 assert.ok(find(section,/^Link expired .*same link works again/));
 const extend=find(section,"Extend 30 days");
 assert.ok(extend,"Extend is offered for an expired link");
 assert.equal(find(section,"Copy link"),null,"an expired link is not offered for copying");
 current=[{id:"expired-id",person_id:"violet",expires_at:"2099-03-01T12:00:00Z"}];
 await extend.fire("click");await settle();
 const extendCall=calls.find(call=>call.action==="extend");
 assert.deepEqual(extendCall,{action:"extend",id:"expired-id",days:30});
 assert.equal(extendCall.fn,"pumpkin-invite-renewal");
 assert.equal(calls.filter(call=>call.action==="create").length,0,"extending never replaces the link");
 assert.ok(find(section,/^Violet's link now works until .*same link keeps working/));
 assert.ok(find(section,/^Link works until /));
}));

test("a link created on this device can be shared again after a reload, until sign-out",()=>withPage(async({listeners,localStorage})=>{
 const calls=[];let current=[];
 const first=organizer({invites:()=>current,calls});
 first.fire("toggle");await settle();
 current=[{id:"fresh",person_id:"violet",expires_at:"2099-01-01T00:00:00Z"}];
 await find(first,"Create private link").fire("click");await settle();
 assert.ok(find(first,"Copy link"));
 const saved=JSON.parse(localStorage.getItem("pumpkin-organizer-shared-links-v1"));
 assert.equal(saved.owner,"owner-a");
 assert.match(saved.links.violet.link,/guest\.html#invite=T{43}$/);
 // A later visit on the same device can still share the same link.
 const reopened=organizer({invites:()=>current,calls});
 reopened.fire("toggle");await settle();
 assert.ok(find(reopened,"Copy link"),"no need to replace a link just to send it again");
 // Another organizer account never sees these links.
 const other=organizer({invites:()=>current,calls,owner:"owner-b"});
 other.fire("toggle");await settle();
 assert.equal(find(other,"Copy link"),null);
 listeners["pumpkin:cloudsignedout"]();
 assert.equal(localStorage.getItem("pumpkin-organizer-shared-links-v1"),null,"signing out clears saved links");
}));
