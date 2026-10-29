import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import vm from "node:vm";

const file=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const html=file("index.html"),sync=file("family-sync.js"),features=file("family-features.js");
const inlineStart=html.indexOf("<script>",html.indexOf("const VISUAL_CAPTIONS")-100);
const inline=html.slice(html.indexOf("<script>")+8,html.indexOf("</script>",html.indexOf("<script>")));
function catalog(name){
 const begin=html.indexOf("const "+name+"=[");
 assert.ok(begin>0,"missing "+name);
 const from=html.indexOf("[",begin),end=html.indexOf("];",from);
 assert.ok(end>from,"missing end of "+name);
 return JSON.parse(html.slice(from,end+1));
}
test("JavaScript parses without a build or secrets",()=>{
 assert.doesNotThrow(()=>new vm.Script(inline));
 for(const path of ["family-sync.js","family-features.js","search-suggestions.js","pdf-preview.js","supabase/functions/pumpkin-image-search/index.ts"]){
   if(path.endsWith(".ts"))continue; // Deno types require the Edge runtime
   assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",new URL("../"+path,import.meta.url).pathname]));
 }
});
test("Catalog contains all 2,053 unique original IDs",()=>{
 const z=catalog("zombieCatalog"),a=catalog("BUILT_IN_EXTRAS");
 assert.equal(z.length,661);assert.equal(a.length,1392);
 assert.equal(new Set(z.map(x=>"zombie:"+x.id).concat(a.map(x=>"extra:"+x.id))).size,2053);
 for(const x of [...z,...a]){assert.ok(x.id&&x.name);assert.ok(x.path&&!x.path.startsWith("https://"));}
});
test("Print action distinguishes local, private and preview-only",()=>{
 const a=html.indexOf("function originalAction("),b=html.indexOf("function cardFor(",a);
 assert.ok(a>0&&b>a);
 const stub=(tag,cls,caption)=>({tag,cls,caption,dataset:{}});
 const fn=new Function("createElement",html.slice(a,b)+"; return originalAction;")(stub);
 const local=fn({id:"one",path:"Templates/local.pdf"});
 assert.equal(local.href,"#");assert.equal(local.dataset.originalId,"one");
 const hosted=fn({id:"two",path:"https://example.invalid/private.pdf"});
 assert.equal(hosted.href,"https://example.invalid/private.pdf");
 assert.equal(hosted.dataset.originalId,undefined);
 const preview=fn({id:"three",path:""});
 assert.equal(preview.tag,"span");assert.match(preview.caption,/Preview only/);
 assert.match(sync,/data-original-id/);
});
test("Offline search retains fuzzy and synonym matching",()=>{
 const a=html.indexOf("function normalizeSearch("),b=html.indexOf("function findVisible()",a);
 assert.ok(a>0&&b>a);
 const search=new Function("VISUAL_CAPTIONS",html.slice(a,b)+";return {searchDistance,searchScore};")({});
 assert.equal(search.searchDistance("skeletn","skeleton"),1);
 const x={id:"test",name:"Skeleton Cat",tags:[],keywords:[],category:"Spooky",theme:"Halloween",difficulty:""};
 assert.ok(search.searchScore(x,["kitty"],"kitty")>0);
 assert.ok(search.searchScore(x,["skeleton"],"skeleton")>search.searchScore(x,["skeletn"],"skeletn"));
});
test("Imported design names normalize accents and punctuation",()=>{
 const start=features.indexOf("const normalizeTitle="),end=features.indexOf(";",start);
 assert.ok(start>0);
 const normalize=new Function(features.slice(start,end+1)+"return normalizeTitle;")();
 assert.equal(normalize("Café-De-Ville"),normalize("cafe de ville"));
});
test("No plain browser links to protected original catalog",()=>{
 assert.ok(html.includes("function originalAction("));
 assert.ok(html.includes("details"));
 assert.ok(!html.includes("link.href=fileHref(x.path)"));
 assert.ok(sync.includes("pumpkin-family-outbox-v1:"));
 assert.ok(sync.includes("outbox=loadOutbox(owner)"));
 assert.ok(features.includes("makePdfThumbnail(originalFile)"));
 assert.ok(features.includes("Edit details"));
 assert.ok(!existsSync(new URL("../Templates/",import.meta.url)));
 assert.ok(!existsSync(new URL("../Thumbnails/",import.meta.url)));
});

test("Mobile layout assigns sort and action buttons separate grid cells",()=>{
 const css=readFileSync(new URL("../mobile-polish.css",import.meta.url),"utf8");
 assert.match(html,/href="mobile-polish\.css"/);
 assert.match(css,/\.sort-inline\{grid-column:1\/-1/);
 assert.match(css,/\.toolbar-tail #surprise\{grid-column:1\}/);
 assert.match(css,/\.toolbar-tail #clear-filters\{grid-column:2\}/);
 assert.match(css,/max-width:700px/);
});
test("Email login stays existing-account-only and supports password recovery",()=>{
 assert.match(sync,/shouldCreateUser:false/);
 assert.match(sync,/cloud-reset-password/);
 assert.match(sync,/resetPasswordForEmail/);
 assert.match(sync,/PASSWORD_RECOVERY/);
 assert.match(sync,/signups\? not allowed for otp/);
});
test("Image import clearly separates staging, permission and upload",()=>{
 assert.match(features,/fetchAuthorizedImage\(original\)/);
 assert.match(features,/printable\.click\(\)/);
 assert.match(features,/Nothing has been uploaded/);
 assert.match(features,/Automatic import blocked/);
 assert.match(features,/if\(!check\.checked\)/);
});

test("Guest links use scoped server auth and catalog metadata only",()=>{
 const edge=file("supabase/functions/pumpkin-profile-invites/index.ts");
 const guest=file("guest.js");
 const parent=file("family-invites.js");
 const page=file("guest.html");
 const catalog=JSON.parse(file("guest-catalog.json"));
 assert.equal(catalog.length,2053);
 assert.equal(new Set(catalog.map(x=>x.id)).size,2053);
 assert.ok(catalog.every(x=>x.name&&x.thumbnail&&!x.thumbnail.startsWith("https://")));
 assert.match(edge,/SHA-256/);
 assert.match(edge,/is\("revoked_at",null\)/);
 assert.match(edge,/gt\("expires_at",now\)/);
 assert.match(edge,/eq\("person_id",personId\)/);
 assert.match(edge,/user\.is_anonymous/);
 assert.match(edge,/TOKEN\.test\(token\)/);
 assert.match(guest,/sessionStorage\.setItem/);
 assert.match(guest,/history\.replaceState/);
 assert.match(guest,/"apikey":config\?\.publishableKey/);
 assert.match(page,/cloud-config\.js/);
 assert.match(parent,/navigator\.share/);
 assert.match(parent,/action:"revoke"/);
 assert.match(sync,/family-invites\.js/);
 for(const path of ["guest.js","family-invites.js"])
   assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",new URL("../"+path,import.meta.url).pathname]));
});

test("Search-first layout has one real input and preserves core handlers",()=>{
 const css=file("mobile-polish.css"),searchFirst=file("search-first.js");
 assert.equal((html.match(/id="search"/g)||[]).length,1);
 assert.equal((html.match(/id="settings-open"/g)||[]).length,1);
 assert.ok(html.indexOf('id="search-first"')<html.indexOf('class="profile-panel"'));
 assert.ok(html.indexOf('id="search-first"')<html.indexOf('id="tabs"'));
 assert.ok(html.includes('id="advanced-filters"'));
 assert.match(html,/src="search-first\.js"/);
 assert.match(html,/getElementById\('search-first'\)/);
 assert.match(searchFirst,/details\.open=!details\.open/);
 assert.match(searchFirst,/aria-expanded/);
 assert.match(css,/\.search-hero-search input\{/);
 assert.match(css,/\.profile-panel \.profiles\{display:grid;grid-template-columns:repeat\(4/);
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",new URL("../search-first.js",import.meta.url).pathname]));
});
test("Organizer identity is separate from selected family profile",()=>{
 assert.match(sync,/id="organizer-identity"/);
 assert.match(sync,/id="organizer-links"/);
 assert.match(sync,/session\.user\.email/);
 assert.match(sync,/family-profile-invites/);
 assert.match(sync,/Organizer/);
 assert.match(sync,/parent account|Parent account/i);
});
