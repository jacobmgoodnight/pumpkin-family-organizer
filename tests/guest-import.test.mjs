import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const edge=file("supabase/functions/pumpkin-profile-invites/index.ts");
const guest=file("guest.js"),page=file("guest.html"),css=file("guest.css");

test("search results report the import pause while preserving online ideas",()=>{
 const start=edge.indexOf("const signed=results.map(");
 const end=edge.indexOf("return reply({query:term,provider:",start);
 assert.ok(start>=0&&end>start);
 const render=new Function("results",edge.slice(start,end)+"return signed;");
 const result=render([{title:"Cat",sourceUrl:"https://example.com/cat",originalImageUrl:"https://example.com/cat.jpg"}]);
 assert.equal(result[0].title,"Cat");
 assert.equal(result[0].sourceUrl,"https://example.com/cat");
 assert.equal(result[0].importTicket,null);
 assert.equal(result[0].importUnavailableReason,"temporarily_disabled");
});
test("old import requests fail closed before any download or storage write",()=>{
 const start=edge.indexOf('if(action==="import"){');
 const end=edge.indexOf('if(action==="idea"){',start);
 assert.ok(start>=0&&end>start);
 const handle=new Function("action","fail",edge.slice(start,end));
 const result=handle("import",(message,status)=>({message,status}));
 assert.equal(result.status,503);
 assert.match(result.message,/temporarily unavailable/i);
 assert.match(result.message,/save the idea/i);
 assert.doesNotMatch(edge.slice(start,end),/fetch\(|admin\.|readImageFromRemote/);
 assert.doesNotMatch(edge,/async function readImageFromRemote\(/);
});
test("Original preview URL validation rejects loopback/IP and credentials",()=>{
 const begin=edge.indexOf("function safeRemoteImage("),end=edge.indexOf("Deno.serve(",begin);
 assert.ok(begin>0&&end>begin);
 const fn=new Function("URL",edge.slice(begin,end).replace("value:unknown","value")+"return safeRemoteImage;")(URL);
 for(const url of ["http://example.org/p.png","https://127.0.0.1/p.png","https://169.254.169.254/latest","https://localhost/a.jpg","https://myhost.local/a.jpg","https://user:pass@example.com/a.jpg","https://[::1]/a.jpg"]){
   assert.equal(fn(url),null,url);
 }
 assert.equal(fn("https://example.com/path/photo.png"),"https://example.com/path/photo.png");
});
test("Invited Google result cards offer one-tap import and preserve graceful fallback",()=>{
 assert.match(guest,/async function importOnlineImage\(row\)/);
 assert.match(guest,/action:"import",ticket:row\.importTicket,rightsConfirmed:true/);
 assert.match(guest,/confirm\("Import this original image/);
 assert.match(guest,/function makeImportButton\(row\)/);
 assert.match(guest,/actions\.append\(makeImportButton\(row\),save,compare\)/);
 assert.match(guest,/area\.append\(title,label,makeImportButton\(row\),save,link,share\)/);
 assert.match(guest,/if\(!row\.importTicket\)/);
 assert.match(guest,/saveOnlineIdea\(row/);
 assert.match(page,/id="online-results"/);
});
test("Family visual thumbnails, background sync and compact browsing controls exist",()=>{
 assert.match(guest,/function renderLineup\(\)/);
 assert.match(guest,/className="lineup-visual"/);
 assert.match(guest,/createImage\(item/);
 assert.match(guest,/function familyFingerprint\(data\)/);
 assert.match(guest,/setInterval\(\(\)=>\{if\(me&&!document\.hidden\)void refreshFamily\(\);\},20000\)/);
 assert.match(guest,/if\(familyRefreshing\|\|choiceWrites/);
 assert.match(guest,/function guestSort\(/);
 assert.match(guest,/function updateDiscoveryFilters\(/);
 for(const id of ["guest-advanced","theme","difficulty","sort","surprise","clear-guest-filters","sync-status"])assert.ok(page.includes('id="'+id+'"'),id);
 assert.match(css,/\.lineup-visual/);
 assert.match(css,/\.web-results \.web-import/);
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",fileURLToPath(new URL("../guest.js",import.meta.url))]));
});
