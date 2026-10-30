import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";

const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const edge=file("supabase/functions/pumpkin-profile-invites/index.ts");
const guest=file("guest.js"),page=file("guest.html"),css=file("guest.css");

test("Google auto-import uses expiring signed result tickets and refuses client-supplied arbitrary URLs",()=>{
 assert.match(edge,/issueImportTicket\(/);
 assert.match(edge,/crypto\.subtle\.sign\("HMAC"/);
 assert.match(edge,/crypto\.subtle\.verify\("HMAC"/);
 assert.match(edge,/exp:Date\.now\(\)\+20\*60000/);
 assert.match(edge,/data\.hash!==tokenHash/);
 assert.match(edge,/data\.uid!==uid/);
 assert.match(edge,/if\(body\.rightsConfirmed!==true\)/);
 assert.match(edge,/const original=safeRemoteImage\(data\.imageUrl\)/);
 assert.doesNotMatch(edge,/fetch\(body\.imageUrl/);
});
test("Image import is bounded and uses private storage; no silent thumbnail fallback",()=>{
 assert.match(edge,/redirect:"manual"/);
 assert.match(edge,/MAX_IMPORT_BYTES=6\*1024\*1024/);
 assert.match(edge,/AbortSignal\.timeout\(12000\)/);
 assert.match(edge,/image\/jpeg","image\/png","image\/webp/);
 assert.match(edge,/if\(total>limit\)/);
 assert.match(edge,/const jpeg=/);
 assert.match(edge,/const png=/);
 assert.match(edge,/const webp=/);
 assert.match(edge,/storage\.from\("pc-family-imports"\)/);
 assert.match(edge,/thumbnail_path:path,original_path:path/);
 assert.match(edge,/source_url:origin/);
 assert.match(edge,/alreadyImported:true/);
 assert.match(edge,/await admin\.storage\.from\("pc-family-imports"\)\.remove\(\[path\]\)/);
 assert.doesNotMatch(edge,/upsert:true/);
});
test("Remote URL validation rejects loopback/IP and credentials before downloads",()=>{
 const begin=edge.indexOf("function safeRemoteImage("),end=edge.indexOf("async function readImageFromRemote(",begin);
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
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",new URL("../guest.js",import.meta.url).pathname]));
});
