import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../search-suggestions.js",import.meta.url),"utf8");
function createHarness(){
 const listeners={};
 function node(name="div"){
   const obj={name,style:{},hidden:false,children:[],parentElement:null,attrs:{},listeners:{},textContent:"",value:"",
     append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}},
     replaceChildren(...items){this.children=[];this.append(...items);},
     setAttribute(key,val){this.attrs[key]=val;},
     addEventListener(key,callback){this.listeners[key]=callback;},
     querySelectorAll(selector){return selector==="button"?this.children.filter(x=>x.name==="button"):[];},
     getBoundingClientRect(){return this.rect||{top:0,bottom:0,left:0,width:300};},
     dispatchEvent(event){this.listeners[event.type]?.(event);}
   };return obj;
 }
 const document={head:node("head"),activeElement:null,createElement:node,addEventListener(){}};
 const vv={height:700,offsetTop:0,listeners:{},addEventListener(key,fn){this.listeners[key]=fn;}};
 const window={innerHeight:700,visualViewport:vv,addEventListener(key,fn){listeners[key]=fn;}};
 const compiled=source.replace("export function mountSmartSuggestions","function mountSmartSuggestions")
   .replace("export function init","function init");
 const mount=new Function("document","window","getComputedStyle","matchMedia","Event",
   compiled+";return mountSmartSuggestions;")(document,window,host=>({position:host.style.position||"static"}),
     ()=>({matches:true}),class Event{constructor(type,opts){this.type=type;this.bubbles=opts?.bubbles;}});
 const host=node("label"),input=node("input");
 host.rect={top:65,bottom:150,left:20,width:300};
 input.rect={top:80,bottom:129,left:20,width:300};
 input.value="ghost";host.append(input);document.activeElement=input;
 mount({inputs:[input],getItems:()=>[
   {id:"1",name:"Ghostly Cat",source:"zombie",category:"Spooky"},
   {id:"2",name:"Ghostbusters",source:"extra",category:"Movies"},
   {id:"3",name:"Ghost Spider",source:"extra",category:"Costumes"}
 ],id:"test-suggestions"});
 return {document,host,input,vv,window};
}

test("Mobile suggestions stay anchored below their field, not fixed over other sections",()=>{
 const {host,input}=createHarness();
 input.listeners.input();
 const panel=host.children.find(item=>item.id==="test-suggestions");
 assert.ok(panel,"suggestion panel should be attached to input's label");
 assert.equal(panel.hidden,false);
 assert.equal(host.style.position,"relative");
 assert.equal(panel.style.top,"69px"); // 129 - 65 + 5
 assert.equal(panel.style.width,"300px");
 assert.equal(input.attrs["aria-expanded"],"true");
 assert.ok(panel.children.length>0);
 assert.doesNotMatch(source,/position:fixed/);
});

test("iPhone keyboard and off-screen input suppress rather than overlay the suggestions",()=>{
 const {host,input,vv}=createHarness();
 input.listeners.input();
 const panel=host.children.find(item=>item.id==="test-suggestions");
 assert.equal(panel.hidden,false);
 vv.height=180;vv.listeners.resize();
 assert.equal(panel.hidden,true,"keyboard leaves insufficient visible space");
 vv.height=700;input.rect={top:-20,bottom:25,left:20,width:300};
 input.listeners.input();
 assert.equal(panel.hidden,true,"field scrolled above viewport");
});

test("Choosing a suggestion updates the input and collapses the menu",()=>{
 const {host,input}=createHarness();
 input.listeners.input();
 const panel=host.children.find(item=>item.id==="test-suggestions");
 const first=panel.children[0];assert.ok(first);
 first.listeners.click();
 assert.ok(input.value.startsWith("Ghost"));
 assert.equal(panel.hidden,true);
 assert.equal(input.attrs["aria-expanded"],"false");
});
