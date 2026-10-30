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
 assert.match(html,/href="mobile-polish\.css(?:\?[^"]*)?"/);
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
 const recovery=file("guest-access.js");
 assert.match(recovery,/store\(getSession,"setItem",SESSION_KEY/);
 assert.match(recovery,/target\.setItem\(REMEMBER_KEY,data\)/);
 assert.match(guest,/history\.replaceState/);
 assert.match(guest,/"apikey":config\?\.publishableKey/);
 assert.match(page,/cloud-config\.js/);
 assert.match(parent,/navigator\.share/);
 assert.match(parent,/action:"revoke"/);
 assert.match(sync,/family-invites\.js/);
 for(const path of ["guest.js","family-invites.js"])
   assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",new URL("../"+path,import.meta.url).pathname]));
});

test("Family-first layout keeps one real search input and original handlers",()=>{
 const css=file("mobile-polish.css"),searchFirst=file("search-first.js");
 assert.equal((html.match(/id="search"/g)||[]).length,1);
 assert.equal((html.match(/id="settings-open"/g)||[]).length,1);
 assert.ok(html.indexOf('class="profile-panel"')<html.indexOf('id="search-first"'));
 assert.ok(html.indexOf('id="search-first"')<html.indexOf('id="tabs"'));
 assert.ok(html.includes('id="advanced-filters"'));
 assert.match(html,/src="search-first\.js(?:\?[^"]*)?"/);
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

test("Carver choice comes first and mobile has one filter disclosure",()=>{
 const css=file("mobile-polish.css");
 const body=html.slice(html.indexOf('<main class="shell workspace">'));
 assert.ok(body.indexOf('class="profile-panel"')<body.indexOf('id="search-first"'));
 assert.equal((html.match(/id="search"/g)||[]).length,1);
 assert.match(html,/id="filter-toggle"/);
 assert.match(css,/\.advanced-filters:not\(\[open\]\)\{display:none!important\}/);
 assert.match(css,/\.advanced-filters>summary\{display:none!important\}/);
 assert.match(css,/\.view-tabs\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/#catalog-area \.toolbar-tail>\.top-actions\{[\s\S]*?grid-template-columns:minmax\(0,1\.3fr\)/);
});
test("Compact organizer identifies the parent and keeps invitation management",()=>{
 assert.match(sync,/class="cloud-main"/);
 assert.match(sync,/id="organizer-identity"/);
 assert.match(sync,/id="organizer-links"/);
 assert.match(sync,/session\.user\.email/);
 assert.match(sync,/family-profile-invites/);
});

test("Guest full preview, compare, family read-only and Google cards",()=>{
 const guest=file("guest.js"),page=file("guest.html"),edge=file("supabase/functions/pumpkin-profile-invites/index.ts");
 assert.match(page,/id="preview-dialog"/);assert.match(page,/id="compare-dialog"/);
 assert.match(page,/id="person-view"/);assert.match(page,/id="lineup-section"/);
 assert.match(page,/id="online-results"/);assert.match(page,/id="online-form"/);
 assert.match(guest,/function openPreview\(item\)/);
 assert.match(guest,/function showCompare\(\)/);
 assert.match(guest,/function renderLineup\(\)/);
 assert.match(guest,/selectedIsMe\(\)/);
 assert.match(guest,/function searchOnline\(/);
 assert.match(guest,/action:"search"/);
 assert.match(edge,/action==="search"/);
 assert.match(edge,/familyChoices:family\.map/);
 assert.match(edge,/\.eq\("user_id",uid\)/);
 assert.match(edge,/person_id:personId,template_id:templateId/);
 assert.match(edge,/SERPAPI_KEY/);
 assert.match(edge,/15 per hour/);assert.match(edge,/40 per day/);
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",new URL("../guest.js",import.meta.url).pathname]));
});
test("Phone-only organizer reduction and versioned assets",()=>{
 const css=file("mobile-polish.css");
 assert.match(css,/body\.family-connected header\.top>\.shell\{display:none!important\}/);
 assert.match(css,/body\.family-connected #cloud-family-panel/);
 assert.match(css,/max-width:700px/);
 assert.match(html,/mobile-polish\.css\?v=/);
 assert.match(html,/family-sync\.js\?v=/);
 assert.match(file("guest.html"),/guest\.js\?v=/);
});

test("Participant web ideas are saved through the scoped invitation API",()=>{
 const guest=file("guest.js"),edge=file("supabase/functions/pumpkin-profile-invites/index.ts"),page=file("guest.html");
 assert.match(edge,/action==="idea"/);
 assert.match(edge,/admin\.from\("pc_web_ideas"\)/);
 assert.match(edge,/user_id:uid,title,source_url:source/);
 assert.match(edge,/ideas:ideas\.data\|\|\[\]/);
 assert.match(edge,/\.eq\("token_hash",tokenHash\)/);
 assert.match(guest,/async function saveOnlineIdea/);
 assert.match(guest,/api\(\{action:"choice",templateId:item\.id,favorite:true,finalPick:!!prior\.finalPick\}\)/);
 assert.match(guest,/function openOnlinePreview/);
 assert.match(guest,/function prepareIdeas/);
 assert.match(guest,/if\(compare\)addCompare\(item\)/);
 assert.match(page,/<option value="web">Saved online ideas<\/option>/);
 assert.ok(page.indexOf('id="lineup-section"')<page.indexOf('class="catalog-heading"'));
 assert.ok(page.indexOf('id="online-panel"')>page.indexOf('id="grid"'));
 assert.match(page,/id="family-lineup"[^>]+aria-expanded="false"/);
});
test("Participant search preserves exact match priority over curated tie preference",()=>{
 const guest=file("guest.js");
 const first=guest.indexOf("function guestScore("),last=guest.indexOf("function filter()",first);
 assert.ok(first>0&&last>first);
 const normalize=v=>String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"");
 const score=new Function("normalize",guest.slice(first,last)+"return guestScore;")(normalize);
 assert.ok(score({name:"Ghost",category:"Other",tags:[]},"ghost")>score({name:"Ghostly Cat",category:"Other",tags:[]},"ghost"));
 assert.ok(score({name:"Ghost",category:"Other",tags:[]},"ghost")>score({name:"Boo",category:"Ghosts",tags:[]},"ghost"));
 assert.match(guest,/a\.source==="zombie"\?0:1/);
});
test("Small phones keep sort, Surprise Me and clear controls in separate cells",()=>{
 const css=file("mobile-polish.css"),guestCss=file("guest.css");
 assert.match(css,/@media screen and \(max-width:430px\)/);
 assert.match(css,/\.toolbar-tail \.sort-inline\{[\s\S]*?grid-column:1\/-1!important/);
 assert.match(css,/\.toolbar-tail #surprise\{[\s\S]*?grid-column:1!important/);
 assert.match(guestCss,/@media\(max-width:600px\)/);
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",new URL("../guest.js",import.meta.url).pathname]));
});

test("Private family gallery starts with collapsed lineup and first-class personal tabs",()=>{
 const guest=file("guest.js"),page=file("guest.html"),css=file("guest.css");
 assert.match(page,/id="family-lineup"[^>]*aria-expanded="false"/);
 assert.match(page,/id="lineup-section"[^>]*hidden/);
 assert.match(page,/id="quick-all"/);
 assert.match(page,/id="quick-favorites"/);
 assert.match(page,/id="quick-picks"/);
 assert.match(page,/id="quick-favorites-count"/);
 assert.match(page,/id="quick-picks-count"/);
 assert.match(guest,/function selectQuickView\(kind\)/);
 assert.match(guest,/viewPerson=me\.personId/);
 assert.match(guest,/\$\("search"\)\.value=""/);
 assert.match(guest,/function updateQuickViews/);
 assert.match(guest,/mountSmartSuggestions\(/);
 assert.match(guest,/getItems:\(\)=>catalog/);
 assert.match(css,/\.guest-views button\[aria-pressed=true\]/);
 assert.ok(page.indexOf('id="lineup-section"')<page.indexOf('id="view-heading"'));
 assert.match(page,/guest\.js\?v=20261030g/);
});

test("Organizer and guest share keyboard-safe offline search suggestions",()=>{
 const smart=file("search-suggestions.js"),guest=file("guest.js");
 assert.match(smart,/export function mountSmartSuggestions/);
 assert.match(smart,/function position\(el\)/);
 assert.match(smart,/panel\.parentElement!==host/);
 assert.match(smart,/window\.visualViewport/);
 assert.match(smart,/if\(room<92\|\|r\.top<visibleTop/);
 assert.match(smart,/const limit=q\.length>=7\?2:1/);
 assert.match(smart,/title\.source==="zombie"\?3:0/);
 assert.doesNotMatch(smart,/position:fixed/);
 assert.match(guest,/import \{mountSmartSuggestions\} from/);
});

test("Other family profile view exposes only that person's favorites or final picks",()=>{
 const guest=file("guest.js"),page=file("guest.html");
 const start=guest.indexOf("function matchesGuestSelection("),end=guest.indexOf("function filter()",start);
 assert.ok(start>0&&end>start);
 const fn=new Function("guestScore",guest.slice(start,end)+"return matchesGuestSelection;")(()=>0);
 const item={name:"Skeleton",source:"zombie"};
 const none={favorite:false,finalPick:false},fav={favorite:true,finalPick:false},picked={favorite:true,finalPick:true};
 assert.equal(fn(item,none,"all","",false),false,"another person's unsaved catalog is hidden");
 assert.equal(fn(item,none,"zombie","",false),false,"collection filter cannot reveal unsaved catalog");
 assert.equal(fn(item,fav,"favorite","",false),true);
 assert.equal(fn(item,fav,"picked","",false),false);
 assert.equal(fn(item,picked,"picked","",false),true);
 assert.equal(fn(item,none,"all","",true),true,"my full catalog remains browsable");
 assert.match(guest,/viewPersonSelection\(\$\("person-view"\)\.value\)/);
 assert.match(guest,/\$\("filter"\)\.value=mine\?"all":"favorite"/);
 assert.match(page,/id="other-person-banner"/);
 assert.match(page,/id="other-favorites"/);
 assert.match(page,/id="other-picks"/);
 assert.match(page,/id="back-to-me"/);
 assert.match(guest,/\$\("browse-toolbar"\)\.hidden=!own/);
});

test("Private Final Pick celebration occurs only following an acknowledged newly saved pick",()=>{
 const guest=file("guest.js"),page=file("guest.html"),css=file("guest.css");
 assert.match(guest,/if\(field==="finalPick"&&!before\.finalPick&&res\.finalPick\)celebratePick\(item\)/);
 assert.match(guest,/function celebratePick\(item\)/);
 assert.match(guest,/panel\.showModal\(\)/);
 assert.match(guest,/3100/);
 assert.match(page,/id="celebrate-dialog"/);
 assert.match(page,/id="celebrate-heading"/);
 assert.match(page,/id="celebrate-design"/);
 assert.match(css,/@keyframes celebrate-fly/);
 assert.match(css,/@keyframes celebrate-pop/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.card\.selected-pick/);
});

test("Google discovery is a one-step inline search with collapsible results",()=>{
 const guest=file("guest.js"),page=file("guest.html"),css=file("guest.css");
 assert.match(page,/<section id="online-panel"/);
 assert.match(page,/<form id="online-form"[^>]*role="search"/);
 assert.match(page,/<details id="online-results-panel"/);
 assert.match(page,/id="browse-online"/);
 assert.match(page,/id="online-search"[^>]+enterkeyhint="search"/);
 assert.match(page,/id="search"[^>]+enterkeyhint="search"/);
 assert.ok(page.indexOf('id="online-panel"')>page.indexOf('id="more"'));
 assert.ok(!page.includes('id="online-open"'));
 assert.ok(!page.includes('id="online-close"'));
 assert.match(guest,/async function requestOnlineSearch\(term\)/);
 assert.match(guest,/\$\("browse-online"\)\.addEventListener\("click"/);
 assert.match(guest,/\$\("online-form"\)\.addEventListener\("submit"/);
 assert.match(guest,/\$\("online-results-panel"\)\.open=true/);
 assert.match(guest,/\$\("online-panel"\)\.hidden=!own/);
 assert.match(css,/\.online-results-panel/);
 assert.match(css,/\.online-discovery a:visited/);
 assert.match(page,/guest\.css\?v=20261030g/);
 assert.match(page,/guest\.js\?v=20261030g/);
});

test("Web ideas are explicitly preview-only, family imports are printable",()=>{
 const guest=file("guest.js"),css=file("guest.css");
 assert.match(guest,/Inspiration link · no printable file yet/);
 assert.match(guest,/Saved online idea · Source link only/);
 assert.match(guest,/Family import · Private image\/PDF/);
 assert.match(css,/\.idea-only-marker/);
});
