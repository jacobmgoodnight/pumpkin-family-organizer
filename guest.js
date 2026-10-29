// One-profile guest portal. The bearer token is received in a URL fragment,
// moved to tab-local sessionStorage, and never sent in a URL or to Google.
const config=window.PUMPKIN_CLOUD_CONFIG;
const API=(config?.url||"")+"/functions/v1/pumpkin-profile-invites";
const $=id=>document.getElementById(id);
const escaped=new URLSearchParams(location.hash.slice(1)).get("invite");
if(escaped&&/^[A-Za-z0-9_-]{43}$/.test(escaped)){
 sessionStorage.setItem("pumpkin-person-invite",escaped);
 history.replaceState(null,"",location.pathname+location.search);
}
const token=sessionStorage.getItem("pumpkin-person-invite");
let catalog=[],info=null,choices=new Map(),matches=[],visible=24,previewCache=new Map(),loadingImages=false;
const notice=s=>{$("alert").textContent=s;};
const api=async body=>{
 const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","apikey":config?.publishableKey||"",},body:JSON.stringify({...body,token}),referrerPolicy:"no-referrer",cache:"no-store"});
 const data=await response.json().catch(()=>({error:"Connection unavailable"}));
 if(!response.ok||data.error)throw Error(data.error||"Connection unavailable");
 return data;
};
// Static catalog metadata contains names and source-path identifiers, NOT artwork.
function normalize(v){return String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"");}
function prepare(){
 const additions=(info.imports||[]).map(x=>({
   id:"family:"+x.id,name:x.name||"Family import",category:x.category||"Family imports",
   source:"family",difficulty:x.difficulty||"",tags:x.tags||[],
   thumbnail:x.thumbnail_path||x.original_path||"",importId:x.id
 }));
 catalog=[...catalog,...additions];
 for(const x of info.choices||[])choices.set(x.template_id,{favorite:!!x.favorite,finalPick:!!x.final_pick});
 $("greeting").textContent="Hi, "+info.name+"! 🎃";
 $("subtitle").textContent="Your private design shortlist · link expires "+new Date(info.expiresAt).toLocaleDateString();
 $("guest-app").hidden=false;filter();
}
function filter(){
 const q=normalize($("search").value.trim());
 const collection=$("filter").value;
 matches=catalog.filter(x=>{
   const state=choices.get(x.id)||{};
   if(collection==="zombie"&&x.source!=="zombie")return false;
   if(collection==="family"&&x.source!=="family")return false;
   if(collection==="favorite"&&!state.favorite)return false;
   if(collection==="picked"&&!state.finalPick)return false;
   return !q||normalize([x.name,x.category,...(x.tags||[])].join(" ")).includes(q);
 });
 matches.sort((a,b)=>(a.source==="zombie"?0:1)-(b.source==="zombie"?0:1)||a.name.localeCompare(b.name,undefined,{numeric:true}));
 visible=24;render();
}
function button(text,pressed,onClick){
 const b=document.createElement("button");b.type="button";b.textContent=text;b.setAttribute("aria-pressed",String(!!pressed));b.addEventListener("click",onClick);return b;
}
async function choose(item,field){
 const current=choices.get(item.id)||{favorite:false,finalPick:false};
 const next={...current};
 next[field]=!next[field];
 if(field==="favorite"&&!next.favorite)next.finalPick=false;
 if(field==="finalPick"&&next.finalPick)next.favorite=true;
 choices.set(item.id,next);render();
 try{
   const result=await api({action:"choice",templateId:item.id,favorite:next.favorite,finalPick:next.finalPick});
   choices.set(item.id,{favorite:result.favorite,finalPick:result.finalPick});notice("");
 }catch(error){choices.set(item.id,current);notice("Selection not saved: "+error.message);}
 render();
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
 if(loadingImages)return;
 const pictures=[...document.querySelectorAll("img[data-preview]")].filter(x=>!x.src||x.dataset.loading!=="yes");
 const unknown=[...new Set(pictures.map(x=>x.dataset.preview))].filter(x=>x&&!previewCache.has(x)).slice(0,60);
 for(const img of pictures){if(previewCache.has(img.dataset.preview)){img.src=previewCache.get(img.dataset.preview);img.dataset.loading="yes";}}
 if(!unknown.length)return;
 loadingImages=true;
 try{
   const {links}=await api({action:"thumbs",paths:unknown});
   for(const [path,url] of Object.entries(links||{}))previewCache.set(path,url);
   for(const img of document.querySelectorAll("img[data-preview]")){
     if(previewCache.has(img.dataset.preview)){img.src=previewCache.get(img.dataset.preview);img.dataset.loading="yes";}
   }
 }catch(error){notice("Artwork previews unavailable: "+error.message);}
 finally{loadingImages=false;}
}
function render(){
 const host=$("grid");host.replaceChildren();
 for(const item of matches.slice(0,visible)){
   const card=document.createElement("article");card.className="card";
   const image=document.createElement("img");image.alt=item.name+" pumpkin preview";image.loading="lazy";image.dataset.preview=item.thumbnail;
   const area=document.createElement("div");area.className="content";
   const title=document.createElement("strong");title.textContent=item.name;
   const category=document.createElement("small");category.textContent=item.category+(item.difficulty?" · "+item.difficulty:"");
   const actions=document.createElement("div");actions.className="actions";
   const state=choices.get(item.id)||{};
   const heart=button(state.favorite?"♥ Saved":"♡ Save",state.favorite,()=>choose(item,"favorite"));
   const pick=button(state.finalPick?"🎃 Picked":"🎃 Pick",state.finalPick,()=>choose(item,"finalPick"));
   actions.append(heart,pick);area.append(title,category,actions);
   if(item.importId){
     const p=button("Open printable ↗",false,()=>printable(item));p.className="print";area.append(p);
   }
   card.append(image,area);host.append(card);
 }
 $("more").hidden=matches.length<=visible;
 $("more").textContent="Show more designs ("+Math.min(24,matches.length-visible)+" next)";
 $("count").textContent=matches.length+" matching designs";
 const states=[...choices.values()];
 $("totals").textContent=states.filter(x=>x.favorite).length+" favorites · "+states.filter(x=>x.finalPick).length+" final picks";
 void images();
}
$("search").addEventListener("input",filter);
$("filter").addEventListener("change",filter);
$("more").addEventListener("click",()=>{visible+=24;render();});
$("forget").addEventListener("click",()=>{sessionStorage.removeItem("pumpkin-person-invite");location.href="./";});
async function start(){
 if(!token){notice("No invitation was found. Ask the organizer to share your private link again.");return;}
 if(!config?.url||!config?.publishableKey){notice("Private gallery configuration is unavailable.");return;}
 try{
   notice("Opening your private invitation…");
   const results=await Promise.all([
     fetch("guest-catalog.json",{cache:"force-cache"}).then(r=>{if(!r.ok)throw Error("Catalog unavailable");return r.json();}),
     api({action:"guest"})
   ]);
   catalog=results[0];info=results[1];notice("");prepare();
 }catch(error){
   notice(error.message+". Ask the organizer for a new link if yours has expired or been revoked.");
   sessionStorage.removeItem("pumpkin-person-invite");
 }
}
void start();
