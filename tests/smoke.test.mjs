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
