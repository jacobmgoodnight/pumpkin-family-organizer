import {mountSmartSuggestions} from "./search-suggestions.js?v=20261030b";
// Invite-only family gallery. The token is a single-person bearer capability,
// not an organizer credential. Only an invited person's choices can be written.
const config=window.PUMPKIN_CLOUD_CONFIG;
const API=(config?.url||"")+"/functions/v1/pumpkin-profile-invites";
const $=id=>document.getElementById(id);
const hashToken=new URLSearchParams(location.hash.slice(1)).get("invite");
if(hashToken&&/^[A-Za-z0-9_-]{43}$/.test(hashToken)){
 sessionStorage.setItem("pumpkin-person-invite",hashToken);
 history.replaceState(null,"",location.pathname+location.search);
}
const token=sessionStorage.getItem("pumpkin-person-invite");
let catalog=[],library=new Map(),me=null,people=[],viewPerson="",familyChoices=new Map();
let matches=[],visible=24,compareIds=new Set(),previewCache=new Map(),loadingImages=false,imagesQueued=false;
let onlineResults=[],onlineShown=0,onlineCache=new Map(),onlinePending=false,onlineQuery="";
let savedIdeas=[];
const notice=value=>{$("alert").textContent=value||"";};
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==="https:"?u.href:"";}catch{return""}};
const button=(label,handler,cls="")=>{
 const b=document.createElement("button");b.type="button";b.textContent=label;
 if(cls)b.className=cls;
 b.addEventListener("click",handler);return b;
};
const api=async body=>{
 const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","apikey":config?.publishableKey||""},
   body:JSON.stringify({...body,token}),referrerPolicy:"no-referrer",cache:"no-store"});
 const data=await response.json().catch(()=>({error:"Connection unavailable"}));
 if(!response.ok||data.error)throw Error(data.error||"Connection unavailable");
 return data;
};
function normalize(v){return String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"");}
function stateFor(id,person=viewPerson){return familyChoices.get(person)?.get(id)||{favorite:false,finalPick:false};}
function selectedIsMe(){return viewPerson===me?.personId;}
function selectionCount(person=viewPerson){
 const states=[...(familyChoices.get(person)?.values()||[])];
 return {favorites:states.filter(x=>x.favorite).length,picks:states.filter(x=>x.finalPick).length};
}
function setFamilyData(data){
 me=data;
 people=Array.isArray(data.people)?data.people:[{id:data.personId,name:data.name}];
 const newMap=new Map(people.map(p=>[p.id,new Map()]));
 for(const c of data.familyChoices||[]){
   if(newMap.has(c.personId))newMap.get(c.personId).set(c.templateId,{favorite:!!c.favorite,finalPick:!!c.finalPick});
 }
 // Backward-compatibility if a partially deployed backend returns only own picks.
 if(!(data.familyChoices||[]).length){
   for(const c of data.choices||[])newMap.get(data.personId)?.set(c.template_id,{favorite:!!c.favorite,finalPick:!!c.final_pick});
 }
 familyChoices=newMap;
 if(!viewPerson||!newMap.has(viewPerson))viewPerson=data.personId;
 const choices=$("person-view");choices.replaceChildren();
 for(const person of people){
   const option=document.createElement("option");option.value=person.id;
   option.textContent=person.name+(person.id===data.personId?" (mine)":" · view only");
   choices.append(option);
 }
 choices.value=viewPerson;
 $("greeting").textContent="Hi, "+data.name+"! 🎃";
 $("subtitle").textContent="Your family pumpkin gallery · link expires "+new Date(data.expiresAt).toLocaleDateString();
 $("guest-app").hidden=false;
}
function prepareImports(rows){
 catalog=catalog.filter(x=>x.source!=="family");
 for(const x of rows||[]){
   catalog.push({id:"family:"+x.id,name:x.name||"Family import",category:x.category||"Family imports",
     source:"family",difficulty:x.difficulty||"",tags:x.tags||[],thumbnail:x.thumbnail_path||x.original_path||"",importId:x.id});
 }
 library=new Map(catalog.map(x=>[x.id,x]));
}
function prepareIdeas(rows){
 savedIdeas=Array.isArray(rows)?rows:[];
 catalog=catalog.filter(x=>x.source!=="web");
 for(const x of savedIdeas){
   const sourceUrl=safeUrl(x.source_url),thumbnail=safeUrl(x.preview_url);
   if(!x.id||!sourceUrl)continue;
   catalog.push({id:"web:"+x.id,name:x.title||"Saved online idea",
     category:"Saved online ideas",source:"web",tags:[],thumbnail:thumbnail||"",
     sourceUrl,sourceName:x.source_name||"Website"});
 }
 library=new Map(catalog.map(x=>[x.id,x]));
}
function guestScore(item,q){
 if(!q)return 0;
 const name=normalize(item.name),category=normalize(item.category),tags=(item.tags||[]).map(normalize);
 if(name===q)return 1000;
 if(name.startsWith(q))return 800;
 if(name.includes(q))return 600;
 if(tags.some(t=>t.includes(q)))return 400;
 if(category.includes(q))return 200;
 return -1;
}
function filter(){
 const q=normalize($("search").value.trim()),kind=$("filter").value;
 matches=catalog.filter(item=>{
   const s=stateFor(item.id);
   if(kind==="zombie"&&item.source!=="zombie")return false;
   if(kind==="family"&&item.source!=="family")return false;
   if(kind==="web"&&item.source!=="web")return false;
   if(kind==="favorite"&&!s.favorite)return false;
   if(kind==="picked"&&!s.finalPick)return false;
   return guestScore(item,q)>=0;
 });
 matches.sort((a,b)=>guestScore(b,q)-guestScore(a,q)||(a.source==="zombie"?0:1)-(b.source==="zombie"?0:1)||a.name.localeCompare(b.name,undefined,{numeric:true}));
 visible=24;render();
}
function selectQuickView(kind){
 // Quick shortcuts always return to your personal list, without retaining a
 // previous search term that could make your favorites seem to disappear.
 if(!me)return;
 viewPerson=me.personId;
 $("person-view").value=viewPerson;
 $("filter").value=kind;
 $("search").value="";
 filter();
}
function updateQuickViews(){
 const selected=$("filter").value,own=selectedIsMe(),counts=selectionCount(me?.personId);
 $("quick-favorites-count").textContent=String(counts.favorites);
 $("quick-picks-count").textContent=String(counts.picks);
 for(const [id,kind] of [["quick-all","all"],["quick-favorites","favorite"],["quick-picks","picked"]]){
   const pressed=selected===kind&&(kind==="all"||own);
   $(id).setAttribute("aria-pressed",String(pressed));
 }
 const who=people.find(x=>x.id===viewPerson)?.name||"Family";
 $("view-heading").textContent=selected==="favorite"?(own?"My favorites":who+"'s favorites")
   :selected==="picked"?(own?"My final picks":who+"'s final picks")
   :selected==="all"?"Find your pumpkin":"Find your pumpkin";
}
function createImage(item,click){
 const control=button("",click,"image-open");control.setAttribute("aria-label","Enlarge "+item.name);
 const img=document.createElement("img");img.loading="lazy";img.alt=item.name+" carving preview";
 img.referrerPolicy="no-referrer";
 img.addEventListener("error",()=>{if(!img.src.endsWith("/app-icon.svg"))img.src="app-icon.svg";});
 if(item.source==="web")img.src=safeUrl(item.thumbnail)||"app-icon.svg";
 else if(item.thumbnail){img.dataset.preview=item.thumbnail;const cached=previewCache.get(item.thumbnail);if(cached&&cached.expires>Date.now())img.src=cached.url;}
 else img.src="app-icon.svg";
 control.append(img);return control;
}
async function saveChoice(item,field){
 if(!selectedIsMe()){notice("This is another person's list. You can view and compare, but not change their picks.");return;}
 const person=me.personId,map=familyChoices.get(person);
 const before=stateFor(item.id,person),next={...before,[field]:!before[field]};
 if(field==="favorite"&&!next.favorite)next.finalPick=false;
 if(field==="finalPick"&&next.finalPick)next.favorite=true;
 map.set(item.id,next);render();renderLineup();refreshModal();
 try{
   const res=await api({action:"choice",templateId:item.id,favorite:next.favorite,finalPick:next.finalPick});
   map.set(item.id,{favorite:!!res.favorite,finalPick:!!res.finalPick});
   notice("");
 }catch(error){map.set(item.id,before);notice("Selection not saved: "+error.message);}
 render();renderLineup();refreshModal();
}
function addCompare(item){
 if(compareIds.has(item.id))compareIds.delete(item.id);
 else if(compareIds.size<3)compareIds.add(item.id);
 else{notice("Compare up to three designs. Remove one first.");return;}
 updateCompare();
 render();
 refreshModal();
}
function updateCompare(){
 $("compare-count").textContent=String(compareIds.size);
 $("compare-open").disabled=compareIds.size<2;
}
function actionButton(item,field){
 const state=stateFor(item.id),own=selectedIsMe();
 const text=field==="favorite"?(state.favorite?"♥ Saved":"♡ Save"):(state.finalPick?"🎃 Picked":"🎃 Pick");
 const b=button(text,()=>saveChoice(item,field));
 b.disabled=!own;b.setAttribute("aria-pressed",String(field==="favorite"?state.favorite:state.finalPick));
 b.title=own?text:"Read-only: "+people.find(x=>x.id===viewPerson)?.name+"'s selections";return b;
}
function itemActions(item){
 const actions=document.createElement("div");actions.className="actions";
 if(selectedIsMe())actions.append(actionButton(item,"favorite"),actionButton(item,"finalPick"));
 else{
   const state=stateFor(item.id),read=document.createElement("small");
   read.textContent=state.finalPick?"✓ Their final pick":state.favorite?"♥ Their favorite":"Read only";
   actions.append(read);
 }
 return actions;
}
function render(){
 const host=$("grid");host.replaceChildren();
 for(const item of matches.slice(0,visible)){
   const card=document.createElement("article");card.className="card";
   card.append(createImage(item,()=>openPreview(item)));
   const area=document.createElement("div");area.className="content";
   const title=document.createElement("strong");title.textContent=item.name;
   const category=document.createElement("small");category.textContent=item.category+(item.difficulty?" · "+item.difficulty:"");
   area.append(title,category,itemActions(item));
   const compare=button(compareIds.has(item.id)?"✓ In comparison":"Compare",()=>addCompare(item),"compare-toggle");
   compare.setAttribute("aria-pressed",String(compareIds.has(item.id)));
   area.append(compare);
   if(item.importId)area.append(button("Open printable ↗",()=>printable(item),"print"));
   if(item.source==="web"&&item.sourceUrl)area.append(sourceLink(item.sourceUrl,"Open source ↗"));
   card.append(area);host.append(card);
 }
 $("more").hidden=matches.length<=visible;
 $("more").textContent="Show more designs ("+Math.min(24,matches.length-visible)+" next)";
 $("count").textContent=matches.length+" matching designs";
 const counts=selectionCount(),person=people.find(x=>x.id===viewPerson);
 $("totals").textContent=(person?.name||"Family")+": "+counts.favorites+" favorites · "+counts.picks+" final picks";
 $("read-only").hidden=selectedIsMe();
 updateQuickViews();
 const empty=$("empty-results");empty.hidden=matches.length!==0;
 void images();
}
function attachDialogClose(dialog,buttonId){
 $(buttonId).addEventListener("click",()=>dialog.close());
 dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
}
let openedItem=null;
function openPreview(item){openedItem=item;
 if($("compare-dialog").open)$("compare-dialog").close();
 if(!$("preview-dialog").open)$("preview-dialog").showModal();
 refreshModal();void images();
}
function refreshModal(){
 if(!openedItem||!$("preview-dialog").open)return;
 const item=openedItem;$("preview-title").textContent=item.name;
 const image=$("preview-image"),cached=previewCache.get(item.thumbnail);
 image.alt="Enlarged "+item.name;
 if(item.thumbnail)image.dataset.preview=item.thumbnail;
 else delete image.dataset.preview;
 image.referrerPolicy="no-referrer";
 image.src=item.source==="web"?(safeUrl(item.thumbnail)||"app-icon.svg"):(cached?.expires>Date.now()&&cached.url?cached.url:"app-icon.svg");
 if(item.thumbnail&&item.source!=="web"&&(!cached||cached.expires<=Date.now()))void images();
 $("preview-description").textContent=[item.category,item.difficulty,item.source==="family"?"Family import":"Built-in design"].filter(Boolean).join(" · ");
 const actions=$("preview-actions");actions.replaceChildren();
 if(selectedIsMe())actions.append(actionButton(item,"favorite"),actionButton(item,"finalPick"));
 actions.append(button(compareIds.has(item.id)?"Remove from comparison":"Add to comparison",()=>addCompare(item)));
 if(item.importId)actions.append(button("Open printable ↗",()=>printable(item)));
 if(item.source==="web"&&item.sourceUrl)actions.append(sourceLink(item.sourceUrl,"Open original source ↗"));
 else{const span=document.createElement("span");span.className="note";span.textContent="Original PDFs remain on the organizer's computer.";actions.append(span);}
}
function showCompare(){
 const host=$("compare-grid");host.replaceChildren();
 for(const id of compareIds){
   const item=library.get(id);if(!item)continue;
   const card=document.createElement("div");card.className="compare-item";
   card.append(createImage(item,()=>openPreview(item)));
   const title=document.createElement("strong");title.textContent=item.name;card.append(title);
   card.append(itemActions(item));
   card.append(button("Remove",()=>{compareIds.delete(id);updateCompare();showCompare();render();}));
   host.append(card);
 }
 if(compareIds.size<2){$("compare-dialog").close();return;}
 if(!$("compare-dialog").open)$("compare-dialog").showModal();
 void images();
}
async function printable(item){
 if(!item.importId)return;
 const popup=window.open("","_blank");
 try{
   const {url}=await api({action:"print",importId:item.importId});
   if(popup)popup.location.href=url;
   else{const link=document.createElement("a");link.href=url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Open authorized printable";$("alert").replaceChildren(link);}
 }catch(error){if(popup)popup.close();notice(error.message);}
}
async function images(){
 if(loadingImages){imagesQueued=true;return;}
 const pictures=[...document.querySelectorAll("img[data-preview]")];
 const now=Date.now();
 for(const image of pictures){
   const value=previewCache.get(image.dataset.preview);
   if(value?.expires>now){if(image.src!==value.url)image.src=value.url;}
 }
 const unknown=[...new Set(pictures.map(image=>image.dataset.preview))]
   .filter(x=>x&&(!previewCache.has(x)||previewCache.get(x).expires<=now)).slice(0,60);
 if(!unknown.length)return;
 loadingImages=true;
 try{
   const {links}=await api({action:"thumbs",paths:unknown});
   const expiry=Date.now()+15*60*1000;
   for(const path of unknown)previewCache.set(path,{url:links?.[path]||"",expires:links?.[path]?expiry:Date.now()+60000});
   for(const image of document.querySelectorAll("img[data-preview]")){
     const value=previewCache.get(image.dataset.preview);
     if(value?.url&&value.expires>Date.now())image.src=value.url;
   }
   if(openedItem&&$("preview-dialog").open)refreshModal();
 }catch(error){notice("Could not load artwork: "+error.message);}
 finally{
   loadingImages=false;
   if(imagesQueued){imagesQueued=false;void images();}
 }
}
function sourceLink(url,label){
 const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener noreferrer";
 a.referrerPolicy="no-referrer";a.textContent=label;a.className="web-card-link";return a;
}
function renderLineup(){
 const wrap=$("lineup-section");wrap.replaceChildren();
 if(wrap.hidden)return;
 const head=document.createElement("div");head.className="lineup-head";
 const title=document.createElement("strong");title.textContent="Family favorites & final picks";
 head.append(title,button("Refresh",()=>refreshFamily()));wrap.append(head);
 for(const person of people){
   const group=document.createElement("section");group.className="lineup-group";
   const name=document.createElement("strong");name.textContent=person.name+(person.id===me.personId?" · You":"");
   group.append(name);
   const all=[...(familyChoices.get(person.id)||new Map())];
   const favorites=all.filter(([,choice])=>choice.favorite);
   const picks=all.filter(([,choice])=>choice.finalPick);
   const line=(label,rows)=>{
     const caption=document.createElement("small");caption.textContent=label+": "+rows.length;
     const row=document.createElement("div");row.className="lineup-row";
     if(!rows.length){const empty=document.createElement("span");empty.className="note";empty.textContent="Nothing selected yet";row.append(empty);}
     for(const [id] of rows.slice(0,50)){
       const item=library.get(id);if(!item)continue;
       row.append(button(item.name,()=>{viewPerson=person.id;$("person-view").value=person.id;filter();openPreview(item);},"lineup-chip"));
     }
     group.append(caption,row);
   };
   line("Final picks",picks);
   line("Favorites",favorites);
   wrap.append(group);
 }
}
async function refreshFamily(){
 try{
   const updated=await api({action:"guest"});
   setFamilyData(updated);prepareImports(updated.imports);prepareIdeas(updated.ideas);
   filter();renderLineup();notice("");
 }catch(error){notice("Could not refresh family selections: "+error.message);}
}
async function saveOnlineIdea(row,{favorite=false,compare=false}={}){
 const sourceUrl=safeUrl(row.sourceUrl);
 if(!sourceUrl)throw Error("This image has no usable source link.");
 const {idea}=await api({action:"idea",title:row.title||"Pumpkin design idea",
   sourceUrl,thumbnail:safeUrl(row.thumbnail),source:row.source||"Website",searchTerm:onlineQuery});
 if(!idea?.id)throw Error("Could not save this idea");
 const index=savedIdeas.findIndex(x=>x.id===idea.id);
 if(index<0)savedIdeas.unshift(idea);else savedIdeas[index]=idea;
 prepareIdeas(savedIdeas);
 const item=library.get("web:"+idea.id);
 if(favorite){
   const prior=stateFor(item.id,me.personId);
   const response=await api({action:"choice",templateId:item.id,favorite:true,finalPick:!!prior.finalPick});
   familyChoices.get(me.personId).set(item.id,{favorite:!!response.favorite,finalPick:!!response.finalPick});
   // Saving your own favorite while viewing a sibling must never edit their selection.
   if(!selectedIsMe()){viewPerson=me.personId;$("person-view").value=me.personId;}
 }
 if(compare)addCompare(item);
 filter();renderLineup();
 notice("Saved to family ideas"+(favorite?" and your favorites":"")+". Ask the organizer to import an authorized printable.");
 return item;
}
function openOnlinePreview(row){
 openedItem=null;
 const dialog=$("preview-dialog");
 if($("compare-dialog").open)$("compare-dialog").close();
 $("preview-title").textContent=row.title||"Pumpkin design idea";
 const image=$("preview-image");
 image.removeAttribute("data-preview");image.referrerPolicy="no-referrer";
 image.alt=row.title||"Online pumpkin design";image.src=safeUrl(row.originalImageUrl)||safeUrl(row.thumbnail)||"app-icon.svg";
 $("preview-description").textContent="Online image · "+(row.source||"External source")+" · Preview only until a printable is imported";
 const actions=$("preview-actions");actions.replaceChildren();
 const save=button("♥ Save & favorite",async()=>{
   save.disabled=true;
   try{const item=await saveOnlineIdea(row,{favorite:true});openPreview(item);}
   catch(error){notice("Could not save idea: "+error.message);}
   finally{save.disabled=false;}
 });
 const compare=button("Save & compare",async()=>{
   compare.disabled=true;
   try{const item=await saveOnlineIdea(row,{compare:true});openPreview(item);}
   catch(error){notice("Could not save idea: "+error.message);}
   finally{compare.disabled=false;}
 });
 actions.append(save,compare);
 if(safeUrl(row.sourceUrl))actions.append(sourceLink(safeUrl(row.sourceUrl),"View original source ↗"));
 if(!dialog.open)dialog.showModal();
}
function renderOnlineBatch(){
 const host=$("online-results");
 for(const row of onlineResults.slice(onlineShown,onlineShown+12)){
   const thumb=safeUrl(row.thumbnail),src=safeUrl(row.sourceUrl);
   if(!thumb||!src)continue;
   const card=document.createElement("article");card.className="card";
   const img=document.createElement("img");img.src=thumb;img.loading="lazy";img.alt=row.title||"Pumpkin design idea";
   img.referrerPolicy="no-referrer";
   const preview=button("",()=>openOnlinePreview(row),"image-open");
   preview.setAttribute("aria-label","Preview "+(row.title||"online pumpkin idea"));
   preview.append(img);
   const area=document.createElement("div");area.className="content";
   const title=document.createElement("strong");title.textContent=row.title||"Printable carving idea";
   const label=document.createElement("small");label.textContent=row.source||"External website";
   const link=sourceLink(src,"Open original source ↗");
   const share=button("Share idea",async()=>{
     try{
       if(navigator.share)await navigator.share({title:row.title||"Pumpkin pattern",url:src});
       else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(src);notice("Source link copied. Send it to the organizer for an authorized import.");}
       else notice("Open the source and copy its address to share.");
     }catch(error){if(error.name!=="AbortError")notice("Sharing unavailable; open the source instead.");}
   });
   const save=button("♥ Save & favorite",async()=>{
     save.disabled=true;
     try{await saveOnlineIdea(row,{favorite:true});save.textContent="✓ Saved & favorited";}
     catch(error){notice("Could not save idea: "+error.message);save.disabled=false;}
   },"web-save");
   area.append(title,label,save,link,share);card.append(preview,area);host.append(card);
 }
 onlineShown=Math.min(onlineResults.length,onlineShown+12);
 $("online-more").hidden=onlineShown>=onlineResults.length;
 $("online-more").textContent="Show more images ("+(onlineResults.length-onlineShown)+" remaining)";
}
async function searchOnline(term,reuse=true){
 const q=term.trim();if(q.length<2){$("online-status").textContent="Enter at least 2 letters.";return;}
 if(onlinePending)return;
 const key=normalize(q);onlineQuery=q;
 const cache=onlineCache.get(key);
 if(reuse&&cache&&Date.now()-cache.time<15*60*1000){
   onlineResults=cache.results;onlineShown=0;$("online-results").replaceChildren();
   $("online-status").textContent=onlineResults.length+" results · Recent search reused without spending credits";
   renderOnlineBatch();return;
 }
 onlinePending=true;$("online-status").textContent="Searching Google Images…";$("online-results").replaceChildren();$("online-more").hidden=true;
 try{
   const data=await api({action:"search",query:q});
   onlineResults=data.results||[];onlineShown=0;onlineCache.set(key,{time:Date.now(),results:onlineResults});
   if(onlineCache.size>12)onlineCache.delete(onlineCache.keys().next().value);
   $("online-status").textContent=onlineResults.length+" image ideas · Original sources may have usage restrictions. Online searches share the family's 15/hour, 40/day limits.";
   renderOnlineBatch();
 }catch(error){$("online-status").textContent="Unable to search: "+error.message+". You can still browse your existing catalog.";}
 finally{onlinePending=false;}
}
function openOnline(){
 const section=$("online-panel");
 section.hidden=false;$("online-search").value=$("search").value.trim()||$("online-search").value;
 section.scrollIntoView({behavior:"smooth",block:"nearest"});
 if($("online-search").value.trim().length>=2)void searchOnline($("online-search").value);
 else $("online-status").textContent="Enter a design or character to find Google Images suggestions.";
}
$("search").addEventListener("input",filter);
for(const [id,kind] of [["quick-all","all"],["quick-favorites","favorite"],["quick-picks","picked"]]){
 $(id).addEventListener("click",()=>selectQuickView(kind));
}
$("empty-reset").addEventListener("click",()=>selectQuickView("all"));
mountSmartSuggestions({inputs:[$("search")],getItems:()=>catalog,id:"guest-search-suggestions"});
$("filter").addEventListener("change",filter);
$("person-view").addEventListener("change",()=>{viewPerson=$("person-view").value;compareIds.clear();updateCompare();filter();refreshModal();});
$("more").addEventListener("click",()=>{visible+=24;render();});
$("compare-open").addEventListener("click",showCompare);
$("family-lineup").addEventListener("click",()=>{
 const section=$("lineup-section");section.hidden=!section.hidden;
 $("family-lineup").textContent=section.hidden?"👨‍👩‍👧‍👧 Show family picks":"👨‍👩‍👧‍👧 Hide family picks";
 $("family-lineup").setAttribute("aria-expanded",String(!section.hidden));
 renderLineup();
});
$("online-open").addEventListener("click",openOnline);
$("online-close").addEventListener("click",()=>{$("online-panel").hidden=true;});
$("online-form").addEventListener("submit",event=>{event.preventDefault();void searchOnline($("online-search").value,false);});
$("online-more").addEventListener("click",renderOnlineBatch);
$("forget").addEventListener("click",()=>{sessionStorage.removeItem("pumpkin-person-invite");location.href="./";});
attachDialogClose($("preview-dialog"),"preview-close");
attachDialogClose($("compare-dialog"),"compare-close");
window.addEventListener("focus",()=>{if(me)void refreshFamily();});
async function start(){
 if(!token){notice("No invitation found. Ask the organizer to share your private link again.");return;}
 if(!config?.url||!config?.publishableKey){notice("Private gallery configuration is unavailable.");return;}
 try{
   notice("Opening your private family gallery…");
   const [items,data]=await Promise.all([
     fetch("guest-catalog.json",{cache:"force-cache"}).then(r=>{if(!r.ok)throw Error("Catalog unavailable");return r.json();}),
     api({action:"guest"})
   ]);
   catalog=items;setFamilyData(data);prepareImports(data.imports);prepareIdeas(data.ideas);notice("");filter();renderLineup();
 }catch(error){notice(error.message+". Ask the organizer for a new link if yours expired or was revoked.");sessionStorage.removeItem("pumpkin-person-invite");}
}
void start();
