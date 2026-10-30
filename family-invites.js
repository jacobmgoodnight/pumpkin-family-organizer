// Organizer-only link creation. Uses the parent's existing authenticated session.
// Raw invite tokens are shown only once in memory; DB stores only their hashes.
export function init({getClient,getOwner,bridge,settings}){
 const section=document.createElement("details");
 section.id="family-profile-invites";
 section.style.cssText="margin-top:14px;border-top:1px solid #526659;padding:12px 0";
 const summary=document.createElement("summary");summary.textContent="🔗 Share or resend private family links";
 summary.style.cssText="cursor:pointer;color:#efbf85;font-size:14px;font-weight:750";
 const intro=document.createElement("p");intro.textContent="Create an expiring personal link for each family member. If someone loses theirs, choose Resend / replace link to make a fresh one. The old link will stop working immediately. Share with Messages or Copy; anyone holding a link can use it until it expires or is revoked.";
 intro.style.cssText="font-size:12px;line-height:1.6;color:#c6d3c6";
 const daysBox=document.createElement("label");daysBox.textContent="Link expires after ";daysBox.style.cssText="font-size:13px;display:block;margin:9px 0";
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
 const lastLinks=new Map();let busy=false;
 const api=async body=>{
   const {data,error}=await getClient().functions.invoke("pumpkin-profile-invites",{body});
   if(error){
     const detailed=await error.context?.json?.().catch(()=>null);
     throw Error(detailed?.error||error.message||"Invitation service unavailable");
   }
   if(data?.error)throw Error(data.error);
   return data;
 };
 const actionButton=(label,click)=>{
   const button=document.createElement("button");button.type="button";button.textContent=label;
   button.style.cssText="padding:8px 11px;min-height:42px;background:#33473a;border:1px solid #71846e;color:#fff;border-radius:8px;cursor:pointer;font-size:13px";
   button.addEventListener("click",click);return button;
 };
 const linkFor=token=>new URL("guest.html",location.href.split("#")[0]).href+"#invite="+token;
 function notify(message,error=false){status.textContent=message;status.style.color=error?"#ffb0a4":"#cbe4cf";}
 async function clipboard(value){
   if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}
   const area=document.createElement("textarea");area.value=value;area.style.position="fixed";area.style.opacity="0";
   document.body.append(area);area.select();
   if(!document.execCommand("copy")){area.remove();throw Error("Copy unavailable on this browser");}
   area.remove();
 }
 async function view(){
   if(!getOwner()||!section.open||busy)return;
   busy=true;rows.replaceChildren();notify("Loading invitation status…");
   try{
     const {invites=[]}=await api({action:"list"});
     const byPerson=new Map(invites.map(item=>[item.person_id,item]));
     for(const person of bridge.snapshot().people||[]){
       const line=document.createElement("div");line.style.cssText="border:1px solid #536958;border-radius:10px;padding:10px;background:#1b2a20;display:grid;gap:8px";
       const label=document.createElement("strong");label.textContent=person.name;line.append(label);
       const existing=byPerson.get(person.id);
       if(existing){
         const message=document.createElement("small");
         message.textContent="Active link · expires "+new Date(existing.expires_at).toLocaleDateString();
         message.style.color="#c4d3c6";line.append(message);
       }
       const buttons=document.createElement("div");buttons.style.cssText="display:flex;flex-wrap:wrap;gap:7px";
       const create=actionButton(existing?"Resend / replace link":"Create private link",async()=>{
         if(busy||!getOwner())return;
         if(existing&&!confirm("Create a fresh link for "+person.name+"? Their old link will stop working immediately, including any remembered devices. Share the new link with them."))return;
         busy=true;create.disabled=true;notify("Creating "+person.name+"'s private link…");
         try{
           const created=await api({action:"create",personId:person.id,days:Number(days.value)});
           lastLinks.set(person.id,linkFor(created.token));
           notify("Private link created for "+person.name+". Share it only with the intended person.");
           await viewAfter();
         }catch(error){notify(error.message,true);}finally{busy=false;create.disabled=false;}
       });buttons.append(create);
       const known=lastLinks.get(person.id);
       if(known){
         buttons.append(actionButton("Copy link",async()=>{try{await clipboard(known);notify("Copied "+person.name+"'s link.");}catch(e){notify(e.message,true);}}));
         if(navigator.share)buttons.append(actionButton("Share…",async()=>{try{await navigator.share({title:person.name+"'s pumpkin link",text:"Your private Goodnight pumpkin organizer link:",url:known});}catch(e){if(e.name!=="AbortError")notify("Sharing unavailable; use Copy link.",true);}}));
       }
       if(existing)buttons.append(actionButton("Revoke",async()=>{
         if(busy||!confirm("Revoke "+person.name+"'s link now?"))return;
         busy=true;try{await api({action:"revoke",id:existing.id});lastLinks.delete(person.id);await viewAfter();notify(person.name+"'s link revoked.");}
         catch(e){notify(e.message,true);}finally{busy=false;}
       }));
       line.append(buttons);rows.append(line);
     }
     if(!invites.length)notify("No active links yet. Create a private link for the person you'd like to invite.");
     else if(!status.textContent.includes("created")&&!status.textContent.includes("revoked"))notify("Links are unique to each person. Replacing or revoking immediately disables the previous link.");
   }catch(error){notify(error.message,true);}
   finally{busy=false;}
 }
 async function viewAfter(){busy=false;await view();}
 section.addEventListener("toggle",()=>{if(section.open)void view();});
 window.addEventListener("pumpkin:cloudready",()=>{if(section.open)void view();});
 window.addEventListener("pumpkin:cloudsignedout",()=>{lastLinks.clear();section.open=false;rows.replaceChildren();});
 window.addEventListener("pumpkin:statechange",()=>{if(section.open&&!busy)void view();});
}
