// Organizer-only link management. Uses the parent's existing authenticated session.
// The database stores only token hashes. A link created on this device is also kept
// in this browser, for this organizer account only, so it can be shared again without
// replacing it (which would stop it working on every remembered device). Signing out
// clears it.
const SAVED_LINKS_KEY="pumpkin-organizer-shared-links-v1";
const DAY=86400000;
export function init({getClient,getOwner,bridge,settings}){
 const section=document.createElement("details");
 section.id="family-profile-invites";
 section.style.cssText="margin-top:14px;border-top:1px solid #526659;padding:12px 0";
 const summary=document.createElement("summary");summary.textContent="🔗 Share, extend or resend private family links";
 summary.style.cssText="cursor:pointer;color:#efbf85;font-size:14px;font-weight:750";
 const intro=document.createElement("p");intro.textContent="Each family member gets their own link. Their phone or tablet remembers it, so they can come back without the message. When a link is about to run out, tap Extend: the same link keeps working everywhere. Use Replace only if a link reached the wrong person, because the old link stops working on every device.";
 intro.style.cssText="font-size:12px;line-height:1.6;color:#c6d3c6";
 const daysBox=document.createElement("label");daysBox.textContent="New and extended links last ";daysBox.style.cssText="font-size:13px;display:block;margin:9px 0";
 const days=document.createElement("select");
 days.style.cssText="padding:8px;background:#122219;color:#fff;border:1px solid #789076;border-radius:8px;min-height:40px";
 for(const [value,label] of [[7,"7 days"],[14,"14 days"],[30,"30 days"]]){
   const option=document.createElement("option");option.value=String(value);option.textContent=label;
   if(value===30)option.selected=true;days.append(option);
 }daysBox.append(days);
 const status=document.createElement("p");status.setAttribute("role","status");
 status.style.cssText="font-size:12px;line-height:1.5;color:#d3e4d7";
 const rows=document.createElement("div");rows.style.cssText="display:grid;gap:10px";
 section.append(summary,intro,daysBox,rows,status);settings.append(section);
 let lastLinks=new Map(),busy=false,activeOwner=null,ownerGeneration=0;
 const storage=()=>{try{return globalThis.window?.localStorage||null;}catch{return null;}};
 function loadLinks(owner){
   const links=new Map();
   if(!owner)return links;
   try{
     const saved=JSON.parse(storage()?.getItem(SAVED_LINKS_KEY)||"null");
     if(saved?.owner===owner&&saved.links&&typeof saved.links==="object"){
       for(const [personId,value] of Object.entries(saved.links)){
         if(typeof value?.id==="string"&&typeof value?.link==="string"&&/#invite=[A-Za-z0-9_-]{43}$/.test(value.link))links.set(personId,{id:value.id,link:value.link});
       }
     }
   }catch{}
   return links;
 }
 function saveLinks(owner){
   try{
     if(!owner)return;
     if(lastLinks.size)storage()?.setItem(SAVED_LINKS_KEY,JSON.stringify({owner,links:Object.fromEntries(lastLinks)}));
     else storage()?.removeItem(SAVED_LINKS_KEY);
   }catch{}
 }
 function forgetSavedLinks(){lastLinks=new Map();try{storage()?.removeItem(SAVED_LINKS_KEY);}catch{}}
 function syncOwner(){
   const current=getOwner();
   if(current!==activeOwner){
     activeOwner=current;ownerGeneration++;lastLinks=loadLinks(current);rows.replaceChildren();
   }
   return current;
 }
 syncOwner();
 function isCurrent(owner,generation){return syncOwner()===owner&&ownerGeneration===generation;}
 function refreshAfterOwnerChange(owner,generation){
   if(!isCurrent(owner,generation)&&section.open&&getOwner())void view();
 }
 // Create and revoke use pumpkin-profile-invites; listing expired links and
 // extending use the small pumpkin-invite-renewal function.
 const api=async(body,fn="pumpkin-profile-invites")=>{
   const {data,error}=await getClient().functions.invoke(fn,{body});
   if(error){
     const detailed=await error.context?.json?.().catch(()=>null);
     throw Error(detailed?.error||error.message||"Invitation service unavailable");
   }
   if(data?.error)throw Error(data.error);
   return data;
 };
 const actionButton=(label,click,primary=false)=>{
   const button=document.createElement("button");button.type="button";button.textContent=label;
   button.style.cssText="padding:8px 11px;min-height:42px;border-radius:8px;cursor:pointer;font-size:13px;color:#fff;"+(primary?"background:#8a5a2b;border:1px solid #e1a865;font-weight:750":"background:#33473a;border:1px solid #71846e");
   button.addEventListener("click",click);return button;
 };
 const linkFor=token=>new URL("guest.html",location.href.split("#")[0]).href+"#invite="+token;
 const chosenDays=()=>[7,14,30].includes(Number(days.value))?Number(days.value):30;
 const dateText=value=>new Date(value).toLocaleDateString(undefined,{month:"short",day:"numeric"});
 function notify(message,error=false){status.textContent=message;status.style.color=error?"#ffb0a4":"#cbe4cf";}
 async function clipboard(value){
   if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}
   const area=document.createElement("textarea");area.value=value;area.style.position="fixed";area.style.opacity="0";
   document.body.append(area);area.select();
   if(!document.execCommand("copy")){area.remove();throw Error("Copy unavailable on this browser");}
   area.remove();
 }
 async function view(){
   const owner=syncOwner(),generation=ownerGeneration;
   if(!owner||!section.open||busy)return;
   busy=true;rows.replaceChildren();notify("Loading invitation status…");
   try{
     // Recently expired links are listed too: extending one revives the same link.
     let invites=[];
     try{({invites=[]}=await api({action:"list"},"pumpkin-invite-renewal"));}
     catch{({invites=[]}=await api({action:"list"}));}
     if(!isCurrent(owner,generation))return;
     const byPerson=new Map(invites.map(item=>[item.person_id,item]));
     for(const person of bridge.snapshot().people||[]){
       const line=document.createElement("div");line.style.cssText="border:1px solid #536958;border-radius:10px;padding:10px;background:#1b2a20;display:grid;gap:8px";
       const label=document.createElement("strong");label.textContent=person.name;line.append(label);
       const existing=byPerson.get(person.id);
       const expiresAt=existing?Date.parse(existing.expires_at):NaN;
       const expired=!!existing&&!(expiresAt>Date.now()),endingSoon=!!existing&&!expired&&expiresAt-Date.now()<=7*DAY;
       const message=document.createElement("small");
       message.textContent=!existing?"No link yet."
         :expired?"Link expired "+dateText(expiresAt)+". Extend it and the same link works again, with nothing new to send."
         :"Link works until "+dateText(expiresAt)+(endingSoon?" · ends soon, tap Extend":"")+".";
       message.style.color=expired||endingSoon?"#ffd29a":"#c4d3c6";line.append(message);
       const buttons=document.createElement("div");buttons.style.cssText="display:flex;flex-wrap:wrap;gap:7px";
       if(existing){
         const extend=actionButton("Extend "+chosenDays()+" days",async()=>{
           if(busy||!isCurrent(owner,generation))return;
           busy=true;extend.disabled=true;notify("Extending "+person.name+"'s link…");
           try{
             const result=await api({action:"extend",id:existing.id,days:chosenDays()},"pumpkin-invite-renewal");
             if(!isCurrent(owner,generation))return;
             const changed=Date.parse(result.expiresAt)!==expiresAt;
             await viewAfter();
             if(isCurrent(owner,generation))notify(changed
               ?person.name+"'s link now works until "+dateText(result.expiresAt)+". Nothing to resend: the same link keeps working."
               :person.name+"'s link already works until "+dateText(result.expiresAt)+".");
           }catch(error){if(isCurrent(owner,generation))notify(error.message,true);}
           finally{busy=false;extend.disabled=false;refreshAfterOwnerChange(owner,generation);}
         },expired||endingSoon);
         buttons.append(extend);
       }
       const create=actionButton(existing?"Replace link":"Create private link",async()=>{
         if(busy||!isCurrent(owner,generation))return;
         if(existing&&!confirm("Replace "+person.name+"'s link? The old link stops working immediately on every device that remembers it. To keep it working longer, use Extend instead."))return;
         busy=true;create.disabled=true;notify("Creating "+person.name+"'s private link…");
         try{
           const created=await api({action:"create",personId:person.id,days:chosenDays()});
           if(!isCurrent(owner,generation))return;
           lastLinks.set(person.id,{id:created.id,link:linkFor(created.token)});saveLinks(owner);
           notify("Private link created for "+person.name+". Share it only with them.");
           await viewAfter();
         }catch(error){if(isCurrent(owner,generation))notify(error.message,true);}finally{busy=false;create.disabled=false;refreshAfterOwnerChange(owner,generation);}
       },!existing);buttons.append(create);
       const savedLink=lastLinks.get(person.id);
       // A second organizer tab can replace or revoke this link. Do not offer
       // a saved link unless it is still the active invitation from the API.
       if(savedLink&&(!existing||savedLink.id!==existing.id)){lastLinks.delete(person.id);saveLinks(owner);}
       const known=savedLink&&existing&&!expired&&savedLink.id===existing.id?savedLink.link:null;
       if(known){
         buttons.append(actionButton("Copy link",async()=>{if(!isCurrent(owner,generation))return;try{await clipboard(known);if(isCurrent(owner,generation))notify("Copied "+person.name+"'s link.");}catch(e){if(isCurrent(owner,generation))notify(e.message,true);}}));
         if(navigator.share)buttons.append(actionButton("Share…",async()=>{if(!isCurrent(owner,generation))return;try{await navigator.share({title:person.name+"'s pumpkin link",text:"Your private Goodnight pumpkin organizer link:",url:known});}catch(e){if(isCurrent(owner,generation)&&e.name!=="AbortError")notify("Sharing unavailable; use Copy link.",true);}}));
       }
       if(existing)buttons.append(actionButton("Revoke",async()=>{
         if(busy||!isCurrent(owner,generation)||!confirm("Turn off "+person.name+"'s link now? It stops working on every device."))return;
         busy=true;try{await api({action:"revoke",id:existing.id});if(!isCurrent(owner,generation))return;lastLinks.delete(person.id);saveLinks(owner);await viewAfter();if(isCurrent(owner,generation))notify(person.name+"'s link revoked.");}
         catch(e){if(isCurrent(owner,generation))notify(e.message,true);}finally{busy=false;refreshAfterOwnerChange(owner,generation);}
       }));
       line.append(buttons);rows.append(line);
     }
     if(!invites.length)notify("No links yet. Create a private link for each person you'd like to invite.");
     else if(!/created|revoked|extended|works until/.test(status.textContent))notify("Copy and Share appear for links created on this device. Extend keeps a link working; Replace and Revoke stop the old link everywhere.");
   }catch(error){if(isCurrent(owner,generation))notify(error.message,true);}
   finally{busy=false;refreshAfterOwnerChange(owner,generation);}
 }
 async function viewAfter(){busy=false;await view();}
 days.addEventListener("change",()=>{if(section.open&&!busy)void view();});
 section.addEventListener("toggle",()=>{if(section.open)void view();});
 window.addEventListener("pumpkin:cloudready",()=>{syncOwner();if(section.open)void view();});
 window.addEventListener("pumpkin:cloudsignedout",()=>{forgetSavedLinks();syncOwner();section.open=false;rows.replaceChildren();});
 window.addEventListener("pumpkin:statechange",()=>{if(section.open&&!busy)void view();});
}
