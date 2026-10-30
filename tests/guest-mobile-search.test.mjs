import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const file=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const guest=file("guest.js"),page=file("guest.html"),smart=file("search-suggestions.js");

function requestHarness(){
 const elements={
  "online-search":{value:"",focus(){this.focused=true;},blur(){this.blurred=true;}},
  "online-results-panel":{open:false},
  "online-panel":{scrollIntoView(){this.scrolled=true;}}
 };
 const calls={searched:[],links:0,blurred:0};
 const begin=guest.indexOf("async function requestOnlineSearch(term){");
 const end=guest.indexOf("async function searchOnline(term,reuse=true){",begin);
 assert.ok(begin>=0&&end>begin,"requestOnlineSearch present");
 const request=new Function("$","dismissSearchKeyboard","updateGoogleLink","searchOnline",
   guest.slice(begin,end)+"return requestOnlineSearch;")(
    id=>elements[id],
    element=>{element.blur();calls.blurred++;},
    ()=>calls.links++,
    async(term,reuse)=>{calls.searched.push({term,reuse});}
 );
 return {request,elements,calls};
}

test("One click uses current browse query, opens results and submits one search",async()=>{
 const {request,elements,calls}=requestHarness();
 await request("  spooky ghost ");
 assert.equal(elements["online-search"].value,"spooky ghost");
 assert.equal(elements["online-results-panel"].open,true);
 assert.equal(elements["online-panel"].scrolled,true);
 assert.equal(elements["online-search"].blurred,true);
 assert.deepEqual(calls.searched,[{term:"spooky ghost",reuse:true}]);
 assert.equal(calls.links,1);
});

test("Missing online query focuses search instead of billing or opening empty results",async()=>{
 const {request,elements,calls}=requestHarness();
 await request(" ");
 assert.equal(elements["online-search"].focused,true);
 assert.equal(elements["online-results-panel"].open,false);
 assert.equal(calls.searched.length,0);
});

test("Guest Enter dismisses mobile keyboard, hides suggestions, updates results",()=>{
 assert.match(guest,/\$\("search"\)\.addEventListener\("keydown",event=>\{/);
 assert.match(guest,/if\(event\.key==="Enter"\)/);
 assert.match(guest,/guestSuggestions\.hide\(\)/);
 assert.match(guest,/dismissSearchKeyboard\(\$\("search"\)\)/);
 assert.match(guest,/dismissSearchKeyboard\(\$\("online-search"\)\)/);
 assert.match(smart,/dismissOnChoose=false/);
 assert.match(smart,/if\(dismissOnChoose\)input\.blur\(\)/);
 assert.match(guest,/dismissOnChoose:true/);
 assert.match(page,/id="search"[^>]*enterkeyhint="search"/);
 assert.match(page,/id="online-search"[^>]*enterkeyhint="search"/);
});

test("Google image result list stays optional, not the search form",()=>{
 assert.match(page,/<section id="online-panel"/);
 assert.match(page,/<details id="online-results-panel"/);
 assert.match(page,/<form id="online-form"[^>]*role="search"/);
 assert.match(guest,/\$\("online-results-panel"\)\.open=true/);
 assert.match(guest,/searchOnline\(query,true\)/);
 assert.doesNotMatch(guest,/\$\("online-panel"\)\.addEventListener\("toggle"/);
});
