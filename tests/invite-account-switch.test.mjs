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
function find(node,text){
 if(node.textContent===text)return node;
 for(const child of node.children||[]){const found=find(child,text);if(found)return found;}
 return null;
}

test("organizer account changes discard cached and in-flight private links",async()=>{
 const old={document:globalThis.document,window:globalThis.window,location:globalThis.location};
 const listeners={};
 globalThis.document={createElement:tag=>new Element(tag)};
 globalThis.window={addEventListener:(name,callback)=>listeners[name]=callback};
 globalThis.location={href:"https://example.test/index.html"};
 try{
   let owner="owner-a", deferred, delay=false, invites=[];
   const settings=new Element("div");
   init({settings,getOwner:()=>owner,bridge:{snapshot:()=>({people:[{id:"person",name:"Charlotte"}]})},
     getClient:()=>({functions:{invoke:async(_name,{body})=>{
       if(body.action==="list")return {data:{invites}};
       if(delay)return new Promise(resolve=>{deferred=resolve;});
       invites=[{id:"first",person_id:"person",expires_at:"2027-01-01"}];
       return {data:{id:"first",token:"first-private-token"}};
     }}})});
   const section=settings.children[0];section.open=true;section.fire("toggle");await settle();
   await find(section,"Create private link").fire("click");
   assert.ok(find(section,"Copy link"));
   invites=[{id:"replacement",person_id:"person",expires_at:"2027-01-01"}];
   listeners["pumpkin:statechange"]();await settle();
   assert.equal(find(section,"Copy link"),null);
   invites=[];
   owner="owner-b";listeners["pumpkin:cloudready"]();await settle();
   assert.equal(find(section,"Copy link"),null);

   owner="owner-a";listeners["pumpkin:cloudready"]();await settle();
   delay=true;
   const pending=find(section,"Create private link").fire("click");
   owner=null;listeners["pumpkin:cloudsignedout"]();
   owner="owner-b";section.open=true;listeners["pumpkin:cloudready"]();
   deferred({data:{token:"late-private-token"}});await pending;await settle();
   assert.ok(find(section,"Create private link"));
   assert.equal(find(section,"Copy link"),null);
 }finally{
   for(const key of Object.keys(old)){
     if(old[key]===undefined)delete globalThis[key];else globalThis[key]=old[key];
   }
 }
});
