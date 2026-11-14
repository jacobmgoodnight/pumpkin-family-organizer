import {guestSearchScore} from "./guest-search.js?v=20261106a";
import {mountSmartSuggestions} from "./search-suggestions.js?v=20261103b";
import {createInviteAccess} from "./guest-access.js?v=20261103b";
// Invite-only family gallery. The token is a single-person bearer capability,
// not an organizer credential. Only an invited person's choices can be written.
const config=window.PUMPKIN_CLOUD_CONFIG;
const API=(config?.url||"")+"/functions/v1/pumpkin-profile-invites";
const $=id=>document.getElementById(id);
const plural=(n,one,many)=>n+" "+(n===1?one:many);
const access=createInviteAccess({
 hash:location.hash,
 baseUrl:location.origin+location.pathname+location.search,
 clearFragment:()=>history.replaceState(null,"",location.pathname+location.search),
 getSession:()=>window.sessionStorage,
 getPersistent:()=>window.localStorage
});
const token=access.token;
let catalog=[],library=new Map(),me=null,people=[],viewPerson="",familyChoices=new Map();
let matches=[],visible=24,compareIds=new Set(),previewCache=new Map(),loadingImages=false,imagesQueued=false;
let onlineResults=[],onlineShown=0,onlineCache=new Map(),onlinePending=false,onlineQuery="";
let savedIdeas=[],familyImports=[],sortRandomSeed=0,lastFamilyFingerprint="",familyRefreshing=false,choiceWrites=0,choiceGeneration=0;
let searchMetadata={},searchOverrides=new Map(),builtinOriginals=new Set();
const builtinTemplate=id=>/^(?:[a-f0-9]{16}|extra:[a-z0-9-]{1,100})$/.test(id);
// Keep confirmed imports visible until a household snapshot contains them. A
// refresh may already be in flight when the import completes.
const pendingImports=new Map();
const pendingChoices=new Set();
// A retry keeps the intended state, rather than toggling whatever happens to
// be on screen after a network failure or a household refresh.
const choiceFailures=new Map();
let choiceUndo=null;
let latestChoiceFailure=null;
let celebrateTimer=null;
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
 if(!response.ok||data.error){
   const error=new Error(data.error||"Connection unavailable");
   error.status=response.status;
   throw error;
 }
 return data;
};
function normalize(v){return String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"");}
function updateRememberStatus(){
 const saved=access.isRemembered();
 $("remember-device").hidden=saved;
 $("remember-status").textContent=saved?"✓ Saved on this device until the invitation expires":"";
}
function closeGuestDialogs(){
 for(const id of ["preview-dialog","compare-dialog","celebrate-dialog"]){
   const dialog=$(id);if(dialog?.open)dialog.close();
 }
}
function showAccessHelp(message,retry=false){
 $("guest-app").hidden=true;
 closeGuestDialogs();
 $("access-required").hidden=false;
 $("access-required-message").textContent=message;
 $("retry-access").hidden=!retry;
 notice("");
}
function stateFor(id,person=viewPerson){return familyChoices.get(person)?.get(id)||{favorite:false,finalPick:false};}
function selectedIsMe(){return viewPerson===me?.personId;}
function selectionCount(person=viewPerson){
 const states=[...(familyChoices.get(person)?.values()||[])];
 return {favorites:states.filter(x=>x.favorite).length,picks:states.filter(x=>x.finalPick).length};
}
function setFamilyData(data){
 builtinOriginals=new Set((Array.isArray(data.builtinOriginals)?data.builtinOriginals:[]).filter(builtinTemplate));
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
   option.textContent=person.name+(person.id===data.personId?" · me":" · view only");
   choices.append(option);
 }
 choices.value=viewPerson;
 $("greeting").textContent="Pick your pumpkin 🎃";
 $("subtitle").textContent="Private link expires "+new Date(data.expiresAt).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
 updateRememberStatus();
 $("access-required").hidden=true;
 $("guest-app").hidden=false;
}
function prepareImports(rows){
 familyImports=Array.isArray(rows)?rows:[];
 for(const row of familyImports)pendingImports.delete(row.id);
 const merged=new Map([...pendingImports,...familyImports.map(row=>[row.id,row])]);
 catalog=catalog.filter(x=>x.source!=="family");
 for(const x of merged.values()){
   catalog.push({id:"family:"+x.id,name:x.name||"Family import",category:x.category||"Family imports",
     source:"family",difficulty:x.difficulty||"",tags:x.tags||[],thumbnail:x.thumbnail_path||x.original_path||"",
     importId:x.id,hasOriginal:typeof x.original_path==="string"&&!!x.original_path.trim()});
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
function guestScore(item,q){return guestSearchScore(item,q);}
// Other family profiles are saved shortlists, never a second full catalog.
function matchesGuestSelection(item,choice,kind,q,isOwner){
 if(!isOwner&&!choice.favorite&&!choice.finalPick)return false;
 if(kind==="zombie"&&item.source!=="zombie")return false;
 if(kind==="family"&&item.source!=="family")return false;
 if(kind==="web"&&item.source!=="web")return false;
 if(kind==="favorite"&&!choice.favorite)return false;
 if(kind==="picked"&&!choice.finalPick)return false;
 return guestScore(item,q)>=0;
}
function updateDiscoveryFilters(){
 const theme=$("theme"),difficulty=$("difficulty");
 const oldTheme=theme.value,oldDifficulty=difficulty.value;
 const fill=(select,values,allLabel,selected)=>{
   select.replaceChildren(new Option(allLabel,"all"));
   for(const value of values)select.append(new Option(value,value));
   select.value=values.includes(selected)?selected:"all";
 };
 fill(theme,[...new Set(catalog.map(x=>x.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),"All themes",oldTheme);
 fill(difficulty,[...new Set(catalog.map(x=>x.difficulty).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),"All difficulties and levels",oldDifficulty);
}
const guestNameCollator=new Intl.Collator(undefined,{numeric:true});
function guestSort(items,mode,q,scores){
 if(mode==="az")return items.sort((a,b)=>guestNameCollator.compare(a.name,b.name));
 if(mode==="za")return items.sort((a,b)=>guestNameCollator.compare(b.name,a.name));
 if(mode==="random"){
   const rank=id=>{let h=sortRandomSeed|0;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);return h>>>0;};
   return items.sort((a,b)=>rank(a.id)-rank(b.id));
 }
 return items.sort((a,b)=>(scores?.get(b.id)??guestScore(b,q))-(scores?.get(a.id)??guestScore(a,q))||(a.source==="zombie"?0:1)-(b.source==="zombie"?0:1)||guestNameCollator.compare(a.name,b.name));
}
function updateEmptyResults(){
 const empty=$("empty-results");empty.hidden=matches.length!==0;
 if(empty.hidden)return;
 const search=$("search").value.trim(),q=normalize(search);
 const kind=$("filter").value,theme=$("theme").value,difficulty=$("difficulty").value;
 const own=selectedIsMe(),actions=$("empty-actions");actions.replaceChildren();
 const hasMatch=(candidateKind,candidateTheme,candidateDifficulty)=>catalog.some(item=>
   matchesGuestSelection(item,stateFor(item.id),candidateKind,q,own)
   &&(candidateTheme==="all"||item.category===candidateTheme)
   &&(candidateDifficulty==="all"||item.difficulty===candidateDifficulty));
 const offer=(label,changes)=>{
   const control=document.createElement("button");control.type="button";control.textContent=label;
   control.addEventListener("click",()=>{
     for(const [id,value] of Object.entries(changes))$(id).value=value;
     filter();
   });
   actions.append(control);
 };
 const canBroaden=hasMatch("all","all","all");
 $("empty-message").textContent=search
   ?canBroaden?"No designs match with these filters. Try broadening your view.":"No designs match this search. Try another word or check the spelling."
   :own?"No designs in this view yet.":"No saved designs in this view yet.";
 if(kind!=="all"&&hasMatch("all",theme,difficulty))
   offer(own?(search?"Search all designs":"Browse all designs"):"Show all saved designs",{filter:"all"});
 if(theme!=="all"&&hasMatch(kind,"all",difficulty))offer("Clear theme",{theme:"all"});
 if(difficulty!=="all"&&hasMatch(kind,theme,"all"))offer("Clear difficulty",{difficulty:"all"});
 if(!actions.children.length&&canBroaden&&(kind!=="all"||theme!=="all"||difficulty!=="all"))
   offer(search?"Clear filters and keep search":"Clear filters",{filter:"all",theme:"all",difficulty:"all"});
}
function filter(preserveVisible=false){
 const q=normalize($("search").value.trim()),kind=$("filter").value;
 const explanation=globalThis.PUMPKIN_SEARCH.interpretation($("search").value),hint=$("search-interpretation");
 if(hint.textContent!==explanation)hint.textContent=explanation;
 hint.hidden=!explanation;
 const theme=$("theme").value,difficulty=$("difficulty").value,scores=new Map();
 matches=catalog.filter(item=>{
   if(!matchesGuestSelection(item,stateFor(item.id),kind,"",selectedIsMe())
     ||(theme!=="all"&&item.category!==theme)||(difficulty!=="all"&&item.difficulty!==difficulty))return false;
   const score=guestScore(item,q);scores.set(item.id,score);return score>=0;
 });
 guestSort(matches,$("sort").value,q,scores);
 if(preserveVisible!==true)visible=24;
 render();
}
function selectQuickView(kind){
 // Quick shortcuts return to the complete personal list, including when
 // advanced filters are collapsed and no longer visible.
 if(!me)return;
 viewPerson=me.personId;
 $("person-view").value=viewPerson;
 $("filter").value=kind;
 $("search").value="";
 $("theme").value="all";$("difficulty").value="all";
 filter();
}
function viewPersonSelection(personId){
 if(!me)return;
 const mine=personId===me.personId;
 viewPerson=personId;
 $("person-view").value=personId;
 $("filter").value=mine?"all":"favorite";
 $("search").value="";$("theme").value="all";$("difficulty").value="all";
 filter();
}
function chooseOtherList(kind){
 if(selectedIsMe())return;
 $("filter").value=kind;
 $("search").value="";
 filter();
}
function updateQuickViews(){
 const selected=$("filter").value,own=selectedIsMe(),counts=selectionCount(me?.personId);
 $("quick-favorites-count").textContent=String(counts.favorites);
 $("quick-picks-count").textContent=String(counts.picks);
 // Keep the active view reachable when its last saved item is removed. The
 // shortcut also appears during search so someone can open their shortlist.
 $("quick-favorites").hidden=!(counts.favorites>0||$("search").value.trim()||(own&&selected==="favorite"));
 for(const [id,kind] of [["quick-all","all"],["quick-favorites","favorite"],["quick-picks","picked"]]){
   const pressed=selected===kind&&(kind==="all"||own);
   $(id).setAttribute("aria-pressed",String(pressed));
 }
 const who=people.find(x=>x.id===viewPerson)?.name||"Family";
 $("identity-heading").textContent=own?"Choosing as "+(me?.name||"you"):"Viewing "+who+"'s picks";
 $("totals").hidden=own;
 $("view-heading").textContent=!own?who+"'s saved pumpkins"
   :selected==="favorite"?"My favorites"
   :selected==="picked"?"My final picks":"All designs";
 $("guest-views").hidden=!own;
 $("other-person-banner").hidden=own;
 $("guest-search").hidden=!own;
 $("browse-toolbar").hidden=!own;
 $("online-panel").hidden=!own;
 renderChoiceNotice();
 const term=$("search").value.trim();
 $("browse-online").hidden=!own||term.length<2;
 if(own&&term.length>=2)$("browse-online").textContent="🌐 Find more online for “"+term.slice(0,36)+(term.length>36?"…":"")+"”";
 if(!own){
   const counts=selectionCount(viewPerson);
   $("other-person-title").textContent=who+"'s saved pumpkins";
   $("other-person-description").textContent=plural(counts.favorites,"favorite","favorites")+" · "+plural(counts.picks,"final pick","final picks")+". You can preview and compare, but only "+who+" can change these.";
   for(const [id,kind] of [["other-favorites","favorite"],["other-picks","picked"],["other-saved","all"]]){
     $(id).setAttribute("aria-pressed",String(kind===selected));
   }
 }
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
const sameChoice=(a,b)=>!!a.favorite===!!b.favorite&&!!a.finalPick===!!b.finalPick;
function refreshChoiceViews(){
 filter(true);renderLineup();refreshModal();
 if($("compare-dialog").open)showCompare();
 renderChoiceNotice();
}
function renderChoiceNotice(){
 let host=$("choice-notice");
 if(!host){host=document.createElement("div");host.id="choice-notice";host.className="choice-notice";host.setAttribute("role","status");$("guest-app").append(host);}
 const failure=latestChoiceFailure&&choiceFailures.get(latestChoiceFailure);
 const ownFailure=failure?.person===me?.personId?failure:null;
 const ownUndo=choiceUndo?.person===me?.personId?choiceUndo:null;
 host.replaceChildren();host.hidden=!selectedIsMe()||(!ownFailure&&!ownUndo);
 if(host.hidden)return;
 if(ownFailure){
   const row=document.createElement("div"),text=document.createElement("span");row.className="choice-notice-row";
   text.textContent=ownFailure.stale?ownFailure.item.name+" changed. Review your selection.":"Could not confirm save for "+ownFailure.item.name+".";
   row.append(text,ownFailure.stale?button("Dismiss",()=>dismissChoiceFailure(ownFailure.item.id)):button("Try again",()=>void submitChoice(ownFailure.item,ownFailure.next,ownFailure.before,ownFailure.kind)));host.append(row);
 }
 if(ownUndo){
   const row=document.createElement("div"),text=document.createElement("span");row.className="choice-notice-row";
   text.textContent="Removed "+ownUndo.item.name+" from your favorites and final picks.";
   row.append(text,button("Undo",()=>{const entry=choiceUndo;choiceUndo=null;void submitChoice(entry.item,entry.before,entry.after,"undo");}));
   const dismiss=button("×",()=>{choiceUndo=null;refreshChoiceViews();});dismiss.setAttribute("aria-label","Dismiss undo message");row.append(dismiss);host.append(row);
 }
}
function clearChoiceFailure(id){
 choiceFailures.delete(id);
 if(latestChoiceFailure===id)latestChoiceFailure=[...choiceFailures.keys()].at(-1)||null;
}
function dismissChoiceFailure(id){
 clearChoiceFailure(id);
 notice("");refreshChoiceViews();
}
async function submitChoice(item,next,expected,kind){
 if(!selectedIsMe()){notice("This is another person's list. You can view and compare, but not change their picks.");return;}
 if(pendingChoices.has(item.id))return;
 const person=me.personId,map=familyChoices.get(person);
 const before={...stateFor(item.id,person)};
 if(!sameChoice(before,expected)){
   choiceFailures.set(item.id,{person,item,before:expected,next,kind,stale:true});latestChoiceFailure=item.id;if(choiceUndo?.item.id===item.id)choiceUndo=null;refreshChoiceViews();
   notice("Your selection changed since the last attempt. Please review it before trying again.");return;
 }
 clearChoiceFailure(item.id);if(choiceUndo?.item.id===item.id)choiceUndo=null;
 pendingChoices.add(item.id);choiceWrites++;choiceGeneration++;map.set(item.id,next);refreshChoiceViews();
 try{
   const res=await api({action:"choice",templateId:item.id,favorite:next.favorite,finalPick:next.finalPick});
   map.set(item.id,{favorite:!!res.favorite,finalPick:!!res.finalPick});
   notice("");
   if(kind==="remove-both"&&!res.favorite&&!res.finalPick)choiceUndo={person,item,before,after:{favorite:false,finalPick:false}};
   if(kind==="pick"&&!before.finalPick&&res.finalPick&&selectedIsMe())celebratePick(item);
 }catch(error){
   map.set(item.id,before);
   choiceFailures.set(item.id,{person,item,before,next,kind});
   latestChoiceFailure=item.id;
   notice("Could not confirm your selection. Try again beside "+item.name+".");
 }
 pendingChoices.delete(item.id);choiceWrites=Math.max(0,choiceWrites-1);
 refreshChoiceViews();
}
function saveChoice(item,field){
 if(!selectedIsMe()){notice("This is another person's list. You can view and compare, but not change their picks.");return;}
 if(pendingChoices.has(item.id))return;
 const before={...stateFor(item.id)},next={...before,[field]:!before[field]};
 let kind=field==="finalPick"?"pick":"favorite";
 if(field==="favorite"&&!next.favorite){
   if(before.finalPick&&!window.confirm("Remove "+item.name+" from your favorites? This will also remove it from your final picks."))return;
   if(before.finalPick)kind="remove-both";
   next.finalPick=false;
 }
 if(field==="finalPick"&&next.finalPick)next.favorite=true;
 void submitChoice(item,next,before,kind);
}
// The same pumpkin celebration as the main organizer, after a confirmed save.
function celebratePick(item){
 const panel=$("celebrate-dialog");
 $("celebrate-heading").textContent="🎉 "+(me?.name||"You")+", you found your pumpkin!";
 $("celebrate-design").textContent=item?.name||"Your final design";
 if(celebrateTimer)clearTimeout(celebrateTimer);
 if(panel.open)panel.close();
 panel.showModal();
 celebrateTimer=setTimeout(()=>{if(panel.open)panel.close();celebrateTimer=null;},3100);
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
 b.disabled=!own||pendingChoices.has(item.id);b.setAttribute("aria-pressed",String(field==="favorite"?state.favorite:state.finalPick));
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
 const failure=choiceFailures.get(item.id);
 if(selectedIsMe()&&failure?.person===me?.personId){
   const message=document.createElement("div");message.className="choice-error";message.setAttribute("role","alert");
   const text=document.createElement("span");text.textContent=failure.stale?"Selection changed. Please review it.":"Save not confirmed.";
   const retry=failure.stale?button("Dismiss",()=>dismissChoiceFailure(item.id)):button("Try again",()=>void submitChoice(item,failure.next,failure.before,failure.kind));
   message.append(text,retry);actions.append(message);
 }
 if(selectedIsMe()&&choiceUndo?.person===me?.personId&&choiceUndo.item.id===item.id){
   const undoNotice=document.createElement("div");undoNotice.className="choice-error";undoNotice.setAttribute("role","status");
   const text=document.createElement("span");text.textContent="Removed from your final picks.";
   undoNotice.append(text,button("Undo",()=>{const entry=choiceUndo;choiceUndo=null;void submitChoice(entry.item,entry.before,entry.after,"undo");}));actions.append(undoNotice);
 }
 return actions;
}
function render(){
 const host=$("grid");host.replaceChildren();
 for(const item of matches.slice(0,visible)){
   const card=document.createElement("article");card.className="card";
   if(stateFor(item.id).finalPick)card.classList.add("selected-pick");
   card.append(createImage(item,()=>openPreview(item)));
   const area=document.createElement("div");area.className="content";
   const title=document.createElement("strong");title.textContent=item.name;
   const category=document.createElement("small");category.textContent=item.category+(item.difficulty?" · "+item.difficulty:"");
   if(stateFor(item.id).finalPick){
     const tag=document.createElement("span");tag.className="picked-label";tag.textContent="🎃 Final pick";area.append(tag);
   }
   area.append(title,category);
   if(item.source==="web"){
     const marker=document.createElement("small");marker.className="idea-only-marker";
     marker.textContent="💡 Inspiration link · no printable file yet";area.append(marker);
   }
   if(item.source==="family"&&!item.hasOriginal){
     const marker=document.createElement("small");marker.className="idea-only-marker";
     marker.textContent="Preview only · ask the organizer to add the original";area.append(marker);
   }
   area.append(itemActions(item));
   const compare=button(compareIds.has(item.id)?"✓ In comparison":"Compare",()=>addCompare(item),"compare-toggle");
   compare.setAttribute("aria-pressed",String(compareIds.has(item.id)));
   area.append(compare);
   if((item.importId&&item.hasOriginal)||builtinOriginals.has(item.id))area.append(button(item.importId?"📄 Open / print image":"📄 Open / print original",()=>printable(item),"print"));
   if(item.source==="web"&&item.sourceUrl)area.append(sourceLink(item.sourceUrl,"Open source ↗"));
   card.append(area);host.append(card);
 }
 $("more").hidden=matches.length<=visible;
 $("more").textContent="Show more designs ("+Math.min(24,matches.length-visible)+" next)";
 $("count").textContent=plural(matches.length,"matching design","matching designs");
 const counts=selectionCount(),person=people.find(x=>x.id===viewPerson);
 $("totals").textContent=(person?.name||"Family")+": "+plural(counts.favorites,"favorite","favorites")+" · "+plural(counts.picks,"final pick","final picks");
 $("read-only").hidden=selectedIsMe();
 updateQuickViews();
 updateEmptyResults();
 void images();
}
function attachDialogClose(dialog,buttonId){
 $(buttonId).addEventListener("click",()=>dialog.close());
 dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
}
let openedItem=null;
function openPreview(item){
 if(openedItem?.id!==item.id){$("search-feedback").open=false;$("search-feedback-note").value="";$("search-feedback-status").textContent="";}
 openedItem=item;
 if($("compare-dialog").open)$("compare-dialog").close();
 if(!$("preview-dialog").open)$("preview-dialog").showModal();
 refreshModal();void images();
}
function renderPreviewDetails(item){
 const details=$("preview-details");details.replaceChildren();
 const source=item.source==="web"?(item.sourceName||"Website")
   :item.source==="family"?"Family import"
   :item.source==="zombie"?"Zombie Pumpkins":"Additional collection";
 const difficulty=!item.difficulty?["Difficulty","Not rated"]
   :item.source==="extra"?["Collection level",item.difficulty+" · source folder"]
   :item.source==="family"?["Family-entered difficulty",item.difficulty]
   :item.source==="zombie"?["Catalog difficulty",item.difficulty+" · source not verified"]
   :["Difficulty",item.difficulty];
 const rows=[["Source",source],[item.theme?"Theme":"Category",item.theme||item.category||"Not specified"],
   difficulty,["Technique",item.technique||"Not specified"]];
 for(const [label,value] of rows){
   const term=document.createElement("dt"),description=document.createElement("dd");
   term.textContent=label;description.textContent=value;details.append(term,description);
 }
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
 renderPreviewDetails(item);
 const report=$("search-feedback");report.hidden=!builtinTemplate(item.id);
 const visual=item.visual||{};
 $("search-feedback-current").textContent=(visual.description?"Description: "+visual.description+". ":"")+
   (Array.isArray(visual.tags)&&visual.tags.length?"Search tags: "+visual.tags.join(", ")+".":"") || "No visual description is available yet.";
 $("preview-description").textContent=item.source==="web"
   ?"Saved online idea · Source link only. No printable file has been imported. Ask the organizer to import a permitted image."
   :item.source==="family"
     ?item.hasOriginal?"Family import · Open the original for printing and check its quality."
       :"Family import · Preview only. Ask the organizer to add the original for printing."
     :builtinOriginals.has(item.id)?"Saved family original · Open it for printing and check its quality.":"Ask the organizer to locate the original file for a sharp print.";
 const actions=$("preview-actions");actions.replaceChildren();
 if(selectedIsMe())actions.append(itemActions(item));
 actions.append(button(compareIds.has(item.id)?"Remove from comparison":"Add to comparison",()=>addCompare(item)));
 if((item.importId&&item.hasOriginal)||builtinOriginals.has(item.id))actions.append(button(item.importId?"📄 Open / print image":"📄 Open / print original",()=>printable(item)));
 if(item.source==="web"&&item.sourceUrl)actions.append(sourceLink(item.sourceUrl,"Open original source ↗"));
 else if(item.source!=="family"&&!builtinOriginals.has(item.id)){const span=document.createElement("span");span.className="note";span.textContent="Ask the organizer to open the original file for printing.";actions.append(span);}
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
 if(!(item.importId&&item.hasOriginal)&&!builtinOriginals.has(item.id))return;
 const popup=window.open("","_blank");
 try{
   const {url}=await api(item.importId?{action:"print",importId:item.importId}:{action:"print",templateId:item.id});
   if(popup)popup.location.href=url;
   else{const link=document.createElement("a");link.href=url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Tap to open / print saved image";$("alert").replaceChildren(link);}
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
 const wrap=$("lineup-section");wrap.replaceChildren();if(wrap.hidden)return;
 const heading=document.createElement("div");heading.className="lineup-head";
 const title=document.createElement("strong");title.textContent="Family pumpkin picks";
 heading.append(title,button("Refresh",()=>refreshFamily(true)));wrap.append(heading);
 for(const person of people){
   const group=document.createElement("section");group.className="lineup-group";
   const name=document.createElement("strong");name.textContent=person.name+(person.id===me.personId?" · You":"");
   const all=[...(familyChoices.get(person.id)||new Map())];
   const picks=all.filter(([,v])=>v.finalPick),favs=all.filter(([,v])=>v.favorite&&!v.finalPick);
   const label=document.createElement("p");label.className="lineup-count";
   label.textContent=picks.length+" final picks · "+(picks.length+favs.length)+" favorites";
   group.append(name,label);
   const gallery=document.createElement("div");gallery.className="lineup-visual";
   const ordered=[...picks,...favs].slice(0,8);
   for(const [id,choice] of ordered){
     const item=library.get(id);if(!item)continue;
     const tile=document.createElement("div");tile.className="lineup-visual-item";
     tile.append(createImage(item,()=>{viewPersonSelection(person.id);openPreview(item);}));
     const desc=document.createElement("small");desc.textContent=(choice.finalPick?"🎃 ":"♥ ")+item.name;
     tile.append(desc);gallery.append(tile);
   }
   if(!ordered.length){
     const empty=document.createElement("p");empty.className="note";empty.textContent="No pumpkins chosen yet";gallery.append(empty);
   }
   group.append(gallery);
   const see=button("See "+person.name+"'s saved pumpkins",()=>{viewPersonSelection(person.id);$("view-heading").scrollIntoView({behavior:"smooth",block:"start"});});
   see.className="lineup-view-all";group.append(see);
   wrap.append(group);
 }
 void images();
}
function familyFingerprint(data){
 const choices=[...(data.familyChoices||data.choices||[])].sort((a,b)=>String(a.personId||a.person_id).localeCompare(String(b.personId||b.person_id))||String(a.templateId||a.template_id).localeCompare(String(b.templateId||b.template_id)));
 const imports=[...(data.imports||[])].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 const ideas=[...(data.ideas||[])].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 return JSON.stringify([choices,imports,ideas,data.people||[],data.searchOverrides,data.builtinOriginals||[]]);
}
function loadFamilySnapshot(data){
 lastFamilyFingerprint=familyFingerprint(data);
 setFamilyData(data);prepareImports(data.imports);prepareIdeas(data.ideas);
 if(Array.isArray(data.searchOverrides)){
   searchOverrides=new Map(data.searchOverrides.filter(x=>builtinTemplate(x?.templateId)&&typeof x.description==="string"&&x.description.length<=500&&Array.isArray(x.tags)&&x.tags.length<=20&&x.tags.every(tag=>typeof tag==="string"&&tag.length<=40)).map(x=>[x.templateId,{description:x.description,tags:x.tags}]));
 }
 applySearchCorrections();
 updateDiscoveryFilters();filter();renderLineup();
}
async function refreshFamily(manual=false){
 if(familyRefreshing||choiceWrites||!me||(!manual&&document.hidden))return;
 familyRefreshing=true;
 const generation=choiceGeneration;
 if(manual)$("sync-status").textContent="Checking for updates…";
 try{
   const updated=await api({action:"guest"});
   if(choiceWrites||generation!==choiceGeneration){
     $("sync-status").textContent="Updates may be out of date · tap to refresh";
     return;
   }
   const stamp=familyFingerprint(updated);
   if(stamp!==lastFamilyFingerprint){
     loadFamilySnapshot(updated);
     $("sync-status").textContent="Family updates loaded ✓";
   }else if(manual)$("sync-status").textContent="Up to date ✓";
   else $("sync-status").textContent="Synced · checks every 20s";
 }catch(error){
   if(error.status===401){
     access.invalidate();me=null;
     showAccessHelp("This link has expired or was revoked. Ask the organizer to create and send a new private invitation.");
   }else{
     $("sync-status").textContent="Sync paused · tap to retry";
     if(manual)notice("Could not refresh family selections: "+error.message);
   }
 }finally{familyRefreshing=false;}
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
   pendingChoices.add(item.id);choiceWrites++;choiceGeneration++;
   try{
     const response=await api({action:"choice",templateId:item.id,favorite:true,finalPick:!!prior.finalPick});
     familyChoices.get(me.personId).set(item.id,{favorite:!!response.favorite,finalPick:!!response.finalPick});
   }finally{pendingChoices.delete(item.id);choiceWrites=Math.max(0,choiceWrites-1);}
   // Saving your own favorite while viewing a sibling must never edit their selection.
   if(!selectedIsMe()){viewPerson=me.personId;$("person-view").value=me.personId;}
 }
 if(compare)addCompare(item);
 filter();renderLineup();
 notice("Saved to family ideas"+(favorite?" and your favorites":"")+". Ask the organizer to import an authorized printable.");
 return item;
}
async function importOnlineImage(row){
 if(!row.importTicket)throw Error("This result has no downloadable original image. Save the idea or try another result.");
 if(!selectedIsMe())throw Error("Return to your own pumpkins to import a design.");
 if(!confirm("Import this original image into your private family library? Only continue if you have permission to save it for family use. The image may still need quality checks before printing."))return null;
 $("online-status").textContent="Downloading the original to private family storage…";
 const result=await api({action:"import",ticket:row.importTicket,rightsConfirmed:true});
 if(!result.imported?.id)throw Error("The image was not imported.");
 pendingImports.set(result.imported.id,result.imported);
 // Render directly from the confirmed response. A refresh can be skipped
 // while another request is active and must not gate access to the import.
 const known=familyImports.filter(x=>x.id!==result.imported.id);
 prepareImports(known);
 updateDiscoveryFilters();
 if(selectedIsMe()){
   // Clear controls so the new design is visible, without leaving the online results behind.
   $("filter").value="family";$("theme").value="all";$("difficulty").value="all";$("search").value="";
   filter();
 }
 void refreshFamily(true);
 $("online-status").textContent=(result.alreadyImported?"Already in family library":"Imported into private family library")+" · Open / print the saved image and check quality.";
 notice("🎃 "+(result.alreadyImported?"Already imported":"Imported successfully")+". Your family can now preview and favorite it.");
 return library.get("family:"+result.imported.id)||null;
}
function makeImportButton(row){
 const action=button("⬇ Import to family",async()=>{
   action.disabled=true;action.textContent="Importing…";
   try{
     const item=await importOnlineImage(row);
     if(item){
       action.textContent="✓ In family library";
       if($("preview-dialog").open)openPreview(item);
     }
     else {action.disabled=false;action.textContent="⬇ Import to family";}
   }catch(error){
     action.disabled=false;action.textContent="⬇ Try import again";
     $("online-status").textContent=error.message;
     notice("Automatic import unavailable: "+error.message);
   }
 },"web-import");
 if(!row.importTicket){action.disabled=true;action.title="Search result has no downloadable original image. Save the link instead.";action.textContent="Original unavailable";}
 return action;
}
function openOnlinePreview(row){
 openedItem=null;
 $("search-feedback").hidden=true;
 openedItem=null;
 const dialog=$("preview-dialog");
 if($("compare-dialog").open)$("compare-dialog").close();
 $("preview-title").textContent=row.title||"Pumpkin design idea";
 renderPreviewDetails({source:"web",sourceName:row.source||"Website",category:"Online idea"});
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
 actions.append(makeImportButton(row),save,compare);
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
   area.append(title,label,makeImportButton(row),save,link,share);card.append(preview,area);host.append(card);
 }
 onlineShown=Math.min(onlineResults.length,onlineShown+12);
 $("online-more").hidden=onlineShown>=onlineResults.length;
 $("online-more").textContent="Show more images ("+(onlineResults.length-onlineShown)+" remaining)";
}
function googleImageSearchUrl(term){
 return "https://www.google.com/search?tbm=isch&q="+encodeURIComponent(term+" pumpkin carving stencil printable");
}
function updateGoogleLink(){
 const term=$("online-search").value.trim()||$("search").value.trim();
 $("online-google-link").href=googleImageSearchUrl(term||"pumpkin carving stencil");
}
function dismissSearchKeyboard(input){
 input.blur();
}
function updateOnlineResultSummary(){
 const count=onlineResults.length;
 $("online-results-toggle").textContent=count
   ?"Google Images results ("+count+") · Tap to show or hide"
   :"Online search results and help";
}
async function requestOnlineSearch(term){
 const query=term.trim();
 if(query.length<2){
   $("online-search").focus();
   return;
 }
 $("online-search").value=query;
 dismissSearchKeyboard($("online-search"));
 updateGoogleLink();
 $("online-results-panel").open=true;
 $("online-panel").scrollIntoView({behavior:"smooth",block:"nearest"});
 await searchOnline(query,true);
}
async function searchOnline(term,reuse=true){
 const q=term.trim();if(q.length<2){$("online-status").textContent="Enter at least 2 letters.";return;}
 if(onlinePending)return;
 const key=normalize(q);onlineQuery=q;
 const cache=onlineCache.get(key);
 if(reuse&&cache&&Date.now()-cache.time<15*60*1000){
   onlineResults=cache.results;onlineShown=0;$("online-results").replaceChildren();
   $("online-status").textContent=onlineResults.length+" results · Recent search reused without spending credits";
   updateOnlineResultSummary();renderOnlineBatch();return;
 }
 onlinePending=true;$("online-search-button").disabled=true;$("online-search-button").textContent="Searching…";$("browse-online").disabled=true;
 $("online-status").textContent="Searching Google Images…";$("online-results").replaceChildren();$("online-more").hidden=true;
 try{
   const data=await api({action:"search",query:q});
   onlineResults=data.results||[];onlineShown=0;onlineCache.set(key,{time:Date.now(),results:onlineResults});
   if(onlineCache.size>12)onlineCache.delete(onlineCache.keys().next().value);
   $("online-status").textContent=onlineResults.length+" image ideas · Original sources may have usage restrictions. Online searches share the family's 15/hour, 40/day limits.";
   updateOnlineResultSummary();renderOnlineBatch();
 }catch(error){$("online-status").textContent="Unable to search: "+error.message+". You can still browse your existing catalog.";}
 
 finally{onlinePending=false;$("online-search-button").disabled=false;$("online-search-button").textContent="Search images";$("browse-online").disabled=false;}
}
$("search").addEventListener("input",filter);
for(const [id,kind] of [["quick-all","all"],["quick-favorites","favorite"],["quick-picks","picked"]]){
 $(id).addEventListener("click",()=>selectQuickView(kind));
}
const guestSuggestions=mountSmartSuggestions({inputs:[$("search")],getItems:()=>catalog,id:"guest-search-suggestions",dismissOnChoose:true});
$("search").addEventListener("keydown",event=>{
 if(event.key==="Enter"&&!event.isComposing&&event.keyCode!==229){
   event.preventDefault();
   dismissSearchKeyboard($("search"));
   guestSuggestions.hide();
   filter();
 }
});
$("browse-online").addEventListener("click",()=>void requestOnlineSearch($("search").value));
$("filter").addEventListener("change",filter);
for(const id of ["theme","difficulty","sort"])$(id).addEventListener("change",filter);
$("surprise").addEventListener("click",()=>{
 if(!selectedIsMe())return;
 const list=matches.length?matches:catalog;
 if(!list.length)return;
 const item=list[Math.floor(Math.random()*list.length)];
 openPreview(item);
});
$("clear-guest-filters").addEventListener("click",()=>{
 $("search").value="";$("filter").value="all";$("theme").value="all";
 $("difficulty").value="all";$("sort").value="curated";filter();
});
$("person-view").addEventListener("change",()=>{viewPersonSelection($("person-view").value);refreshModal();});
$("back-to-me").addEventListener("click",()=>viewPersonSelection(me.personId));
for(const [id,kind] of [["other-favorites","favorite"],["other-picks","picked"],["other-saved","all"]]){
 $(id).addEventListener("click",()=>chooseOtherList(kind));
}
$("more").addEventListener("click",()=>{visible+=24;render();});
$("compare-open").addEventListener("click",showCompare);
$("family-lineup").addEventListener("click",()=>{
 const section=$("lineup-section");section.hidden=!section.hidden;
 $("family-lineup").textContent=section.hidden?"👨‍👩‍👧‍👧 Show family picks":"👨‍👩‍👧‍👧 Hide family picks";
 $("family-lineup").setAttribute("aria-expanded",String(!section.hidden));
 renderLineup();
});
$("online-search").addEventListener("input",updateGoogleLink);
$("online-form").addEventListener("submit",event=>{
 event.preventDefault();
 dismissSearchKeyboard($("online-search"));
 void requestOnlineSearch($("online-search").value);
});
$("online-more").addEventListener("click",renderOnlineBatch);
updateGoogleLink();updateOnlineResultSummary();
$("remember-device").addEventListener("click",()=>{
 if(!me)return;
 const result=access.remember(me.expiresAt);
 $("remember-status").textContent=result.ok?"✓ Access saved on this device until the invitation expires":result.message;
 if(result.ok)updateRememberStatus();
});
$("copy-link").addEventListener("click",async()=>{
 const url=access.link();
 if(!url)return;
 try{
   if(!navigator.clipboard?.writeText)throw Error("Clipboard not available");
   await navigator.clipboard.writeText(url);
   $("access-help-status").textContent="Private invitation copied. Keep it somewhere only you can access.";
 }catch{
   $("access-help-status").textContent="Copy unavailable. Ask the organizer to resend the link via Messages.";
 }
});
$("share-link").hidden=!navigator.share;
$("share-link").addEventListener("click",async()=>{
 const url=access.link();
 if(!url||!navigator.share)return;
 try{await navigator.share({title:"My private pumpkin gallery",text:"My private family pumpkin gallery",url});}
 catch(error){if(error.name!=="AbortError")$("access-help-status").textContent="Sharing unavailable; try Copy link.";}
});
$("forget").addEventListener("click",()=>{
 access.forget();
 location.replace(location.pathname+location.search);
});
$("retry-access").addEventListener("click",()=>void start());
attachDialogClose($("preview-dialog"),"preview-close");
attachDialogClose($("compare-dialog"),"compare-close");
$("search-feedback-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const item=openedItem,note=$("search-feedback-note").value.trim();
 if(!item||!builtinTemplate(item.id)||!note)return;
 const submit=$("search-feedback-submit"),status=$("search-feedback-status");
 submit.disabled=true;status.textContent="Sending suggestion…";
 try{
   await api({action:"feedback",templateId:item.id,note});
   if(openedItem?.id===item.id){status.textContent="Sent to the organizer for review. Thank you!";$("search-feedback-note").value="";}
 }catch(error){if(openedItem?.id===item.id)status.textContent=error.message||"Could not send your suggestion. Please try again.";}
 finally{submit.disabled=false;}
});
// Browsers can navigate to another invitation on this same page without a
// document load. Hide the old person's gallery and reinitialize with the new
// fragment. replaceState in createInviteAccess removes the fragment without
// firing hashchange, so this does not loop.
window.addEventListener("hashchange",()=>{
 if(!new URLSearchParams(location.hash.slice(1)).has("invite"))return;
 $("guest-app").hidden=true;
 closeGuestDialogs();
 location.reload();
});
window.addEventListener("focus",()=>{if(me)void refreshFamily();});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&me)void refreshFamily();});
$("sync-status").addEventListener("click",()=>void refreshFamily(true));
// Token-scoped reads, not unauthenticated Realtime subscriptions that bypass RLS.
// Poll only while visible; foreground resumes immediately, keeping private links current.
setInterval(()=>{if(me&&!document.hidden)void refreshFamily();},20000);
async function loadSearchMetadata(){
 // Search enrichment is optional; a slow metadata response must not block access.
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
   const response=await fetch("guest-search-metadata.json?v=20261104b",{cache:"force-cache",signal:controller.signal});
   return response.ok?await response.json():{};
 }catch{return {};}
 finally{clearTimeout(timeout);}
}
async function loadPatternDetails(){
 // Ratings enrich the gallery but never block access to a private invitation.
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
   const response=await fetch("guest-pattern-details.json?v=20261104a",{cache:"force-cache",signal:controller.signal});
   return response.ok?await response.json():{};
 }catch{return {};}
 finally{clearTimeout(timeout);}
}
function applyPatternDetails(metadata){
 if(!me||!metadata||typeof metadata!=="object"||!Object.keys(metadata).length)return;
 catalog=catalog.map(item=>{
   const difficulty=metadata[item.id]?.difficulty,theme=metadata[item.id]?.theme;
   return {...item,...(typeof difficulty==="string"&&difficulty.trim()?{difficulty}:{}),
     ...(typeof theme==="string"&&theme.trim()?{theme}:{})};
 });
 library=new Map(catalog.map(item=>[item.id,item]));
 updateDiscoveryFilters();
 const previousVisible=visible;
 filter();
 if(previousVisible>visible){visible=previousVisible;render();}
 if(openedItem){openedItem=library.get(openedItem.id)||openedItem;refreshModal();}
}
function applySearchMetadata(metadata){
 if(!me||!metadata||typeof metadata!=="object"||!Object.keys(metadata).length)return;
 searchMetadata=metadata;
 applySearchCorrections();
 const previousVisible=visible;
 filter();
 if(previousVisible>visible){visible=previousVisible;render();}
}
function applySearchCorrections(){
 // Replace objects to invalidate the search index and restore published visual
 // metadata if a previously approved household correction is deleted.
 catalog=catalog.map(item=>{
   if(!builtinTemplate(item.id))return item;
   const base=searchMetadata[item.id]||{},override=searchOverrides.get(item.id);
   return {...item,...base,keywords:override?[]:(base.keywords||[]),visual:override||base.visual};
 });
 library=new Map(catalog.map(item=>[item.id,item]));
 guestSuggestions.refresh();
 if(openedItem&&$("preview-dialog").open){openedItem=library.get(openedItem.id)||openedItem;refreshModal();}
}
async function start(){
 if(!token){showAccessHelp("Open your personal link from Messages. If it expired or you're using a new phone, ask the organizer to resend or regenerate your invitation.");return;}
 if(!config?.url||!config?.publishableKey){showAccessHelp("The family gallery is temporarily unavailable. Your private invitation is still saved.",true);return;}
 try{
   notice("Opening your private family gallery…");
   const metadataPromise=loadSearchMetadata();
   const detailsPromise=loadPatternDetails();
   const [items,data]=await Promise.all([
     fetch("guest-catalog.json",{cache:"force-cache"}).then(r=>{if(!r.ok)throw Error("Catalog unavailable");return r.json();}),
     api({action:"guest"})
   ]);
   access.confirm();
   catalog=items;loadFamilySnapshot(data);notice("");
   void metadataPromise.then(applySearchMetadata);
   void detailsPromise.then(applyPatternDetails);
 }catch(error){
   if(error.status===401){
     access.invalidate();
     showAccessHelp("This link has expired or was revoked. Ask the organizer to create and send a new private invitation.");
   }else{
     showAccessHelp("The family gallery could not connect. Your private link has not been cleared. Try again.",true);
   }
 }
}
void start();
