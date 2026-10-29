/* Family sync for the Goodnight pumpkin organizer.
 * Private account-scoped preferences; no licensed PDF files in this public site.
 */
const cfg=window.PUMPKIN_CLOUD_CONFIG;
const bridge=window.PUMPKIN_FAMILY_BRIDGE;
if(!cfg||!bridge||!/^https:\/\//.test(cfg.url)||!/^sb_publishable_/.test(cfg.publishableKey)){
 console.warn('Pumpkin Family: cloud configuration is missing. Local-only mode.');
}else{
 const panel=document.createElement('section');
 panel.id='cloud-family-panel';panel.setAttribute('aria-label','Family sync');
 panel.innerHTML='<div class="cloud-line"><strong>Family sync</strong><span id="cloud-status">Connecting…</span></div>'+
 '<form id="cloud-email-form" hidden><label for="cloud-email">Family email</label><input id="cloud-email" type="email" autocomplete="email" required placeholder="Email address"><button type="submit">Send sign-in link</button></form>'+
 '<div id="cloud-actions" hidden><button id="cloud-import" type="button">Merge favorites from this device</button><button id="cloud-signout" type="button">Sign out</button></div>'+
 '<p id="cloud-help">Sign in with your household email and select Jacob, Shelby, Charlotte or Violet. Choices sync across signed-in devices.</p>';
 document.querySelector('header')?.append(panel);
 const $=id=>document.getElementById(id),clone=v=>JSON.parse(JSON.stringify(v));
 const status=(s,error=false)=>{$('cloud-status').textContent=s;$('cloud-status').style.color=error?'#ffb4a8':'#a4dbc5';};
 const offline=clone(bridge.snapshot());
 let client=null,owner=null,channel=null,applying=false,last=null,writes=Promise.resolve(),pending=0,refreshAgain=false,refreshTimer=null,thumbnailTimer=null;
 const peopleMap=s=>new Map((s.people||[]).map(p=>[p.id,p.name]));
 const choiceMap=s=>{
   const m=new Map();
   for(const p of s.people||[]){
     const f=new Set(s.favorites?.[p.id]||[]),pick=new Set(s.picks?.[p.id]||[]);
     for(const id of new Set([...f,...pick]))m.set(JSON.stringify([p.id,id]),{person_id:p.id,template_id:id,favorite:f.has(id)||pick.has(id),final_pick:pick.has(id)});
   }
   return m;
 };
 const ui=connected=>{$('cloud-email-form').hidden=connected;$('cloud-actions').hidden=!connected;document.body.classList.toggle('cloud-gated',!connected);};
 function enqueue(before,after){
   if(!owner||!client||applying)return;
   const a=peopleMap(before),b=peopleMap(after),ca=choiceMap(before),cb=choiceMap(after);
   const changed=[...new Set([...ca.keys(),...cb.keys()])].filter(k=>JSON.stringify(ca.get(k)||null)!==JSON.stringify(cb.get(k)||null));
   const up=[...b].filter(([id,name])=>a.get(id)!==name);
   const gone=[...a.keys()].filter(id=>!b.has(id));
   if(!changed.length&&!up.length&&!gone.length)return;
   const job=async()=>{
     pending++;
     try{
       if(up.length){
         const {error}=await client.from('pc_people').upsert(up.map(([person_id,display_name])=>({user_id:owner,person_id,display_name})),{onConflict:'user_id,person_id'});
         if(error)throw error;
       }
       for(const k of changed){
         const [person_id,template_id]=JSON.parse(k);
         if(gone.includes(person_id))continue;
         const row=cb.get(k)||{person_id,template_id,favorite:false,final_pick:false};
         const {error}=await client.from('pc_choices').upsert({user_id:owner,...row},{onConflict:'user_id,person_id,template_id'});
         if(error)throw error;
       }
       for(const person_id of gone){
         const {error}=await client.from('pc_people').delete().eq('user_id',owner).eq('person_id',person_id);
         if(error)throw error;
       }
       status('Synced ✓');
     }catch(e){status('Sync error — check connection',true);console.error('Pumpkin sync',e);}
     finally{pending--;if(refreshAgain&&pending===0)requestRefresh();}
   };
   writes=writes.then(job,job);
 }
 window.addEventListener('pumpkin:statechange',()=>{
   if(!owner||applying)return;
   const now=clone(bridge.snapshot());if(last)enqueue(last,now);last=now;
 });
 const combine=(persons,rows)=>{
   const result=clone(bridge.snapshot());
   result.people=persons.map(p=>({id:p.person_id,name:p.display_name}));
   if(!result.people.length)result.people=clone(offline.people);
   result.favorites={};result.picks={};
   for(const row of rows){
     if(row.favorite)(result.favorites[row.person_id]||=[]).push(row.template_id);
     if(row.final_pick)(result.picks[row.person_id]||=[]).push(row.template_id);
   }
   if(!result.people.some(p=>p.id===result.active))result.active=result.people[0]?.id||'';
   return result;
 };
 async function refresh(){
   if(!owner)return;
   if(pending){refreshAgain=true;return;}
   refreshAgain=false;
   const [p,c]=await Promise.all([
     client.from('pc_people').select('person_id,display_name').eq('user_id',owner),
     client.from('pc_choices').select('person_id,template_id,favorite,final_pick').eq('user_id',owner)
   ]);
   if(p.error||c.error){status('Unable to load cloud choices',true);console.error(p.error||c.error);return;}
   applying=true;
   try{bridge.applyRemote(combine(p.data||[],c.data||[]));last=clone(bridge.snapshot());}
   finally{applying=false;}
   status('Synced ✓');schedulePreviews();
 }
 function requestRefresh(){
   clearTimeout(refreshTimer);
   refreshTimer=setTimeout(()=>{if(pending)refreshAgain=true;else refresh();},220);
 }
 async function seed(){
   const {error:e}=await client.from('pc_accounts').upsert({user_id:owner},{onConflict:'user_id'});
   if(e)throw e;
   const {data:existing,error:readErr}=await client.from('pc_people').select('person_id').eq('user_id',owner);
   if(readErr)throw readErr;
   if(!existing?.length){
     const state=bridge.snapshot();
     const {error:p}=await client.from('pc_people').upsert(state.people.map(x=>({user_id:owner,person_id:x.id,display_name:x.name})),{onConflict:'user_id,person_id'});
     if(p)throw p;
     const rows=[...choiceMap(state).values()].map(x=>({...x,user_id:owner}));
     for(let i=0;i<rows.length;i+=150){const {error}=await client.from('pc_choices').upsert(rows.slice(i,i+150),{onConflict:'user_id,person_id,template_id'});if(error)throw error;}
   }else{
     try{localStorage.setItem('pumpkin-pre-cloud-backup',JSON.stringify(offline));}catch{}
   }
 }
 async function merge(){
   if(!owner||!confirm('Merge this device’s old favorites and final picks into the family account? Existing cloud choices will be kept.'))return;
   const persons=[...peopleMap(offline)].map(([person_id,display_name])=>({user_id:owner,person_id,display_name}));
   const {error:pe}=await client.from('pc_people').upsert(persons,{onConflict:'user_id,person_id'});
   if(pe){status(pe.message,true);return;}
   const {data:remote,error:re}=await client.from('pc_choices').select('person_id,template_id,favorite,final_pick').eq('user_id',owner);
   if(re){status(re.message,true);return;}
   const ix=new Map((remote||[]).map(r=>[JSON.stringify([r.person_id,r.template_id]),r]));
   const local=[...choiceMap(offline).values()].map(r=>{
     const old=ix.get(JSON.stringify([r.person_id,r.template_id]));
     return {...r,user_id:owner,favorite:r.favorite||!!old?.favorite,final_pick:r.final_pick||!!old?.final_pick};
   });
   for(let i=0;i<local.length;i+=150){const {error}=await client.from('pc_choices').upsert(local.slice(i,i+150),{onConflict:'user_id,person_id,template_id'});if(error){status(error.message,true);return;}}
   await refresh();alert('Local favorites merged.');
 }
 $('cloud-import').addEventListener('click',merge);
 $('cloud-signout').addEventListener('click',async()=>{
   await client.auth.signOut();owner=null;
   if(channel){await client.removeChannel(channel);channel=null;}
   ui(false);status('Signed out');
 });
 $('cloud-email-form').addEventListener('submit',async event=>{
   event.preventDefault();status('Sending sign-in email…');
   const email=$('cloud-email').value.trim();
   const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
   status(error?'Sign-in email failed: '+error.message:'Check your email for the sign-in link',!!error);
 });
 // Signed image URLs work only after personal-use thumbnails are uploaded to private Storage.
 const urls=new Map();
 async function loadPreviews(){
   if(!owner)return;
   const found=[...document.images].filter(img=>{
     const raw=img.getAttribute('src')||'';
     if(/^(Thumbnails|Additional_Thumbnails)\//.test(raw)&&img.dataset.pumpkinPath!==raw){
       img.dataset.pumpkinPath=raw;img.dataset.pumpkinSigned='';
     }
     return /^(Thumbnails|Additional_Thumbnails)\//.test(img.dataset.pumpkinPath||'')&&img.dataset.pumpkinSigned!=='yes';
   }).slice(0,100);
   const missing=[...new Set(found.map(img=>img.dataset.pumpkinPath))].filter(p=>!urls.has(p));
   for(let i=0;i<missing.length;i+=50){
     const batch=missing.slice(i,i+50);
     const {data,error}=await client.storage.from(cfg.bucket||'pc-previews').createSignedUrls(batch.map(p=>owner+'/'+p),3600);
     if(error){console.info('Private previews not uploaded yet:',error.message);return;}
     batch.forEach((path,j)=>{if(data?.[j]?.signedUrl)urls.set(path,data[j].signedUrl);});
   }
   for(const img of found){const url=urls.get(img.dataset.pumpkinPath);if(url){img.dataset.pumpkinSigned='yes';img.src=url;}}
 }
 function schedulePreviews(){clearTimeout(thumbnailTimer);thumbnailTimer=setTimeout(loadPreviews,160);}
 async function start(){
   ui(false);
   try{
     const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm');
     client=mod.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
     async function onSession(session){
       if(!session?.user){owner=null;ui(false);status('Sign in to share favorites');return;}
       if(owner===session.user.id)return;
       owner=session.user.id;status('Loading family choices…');
       try{
         await seed();await refresh();ui(true);
         new MutationObserver(schedulePreviews).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
         if(channel)await client.removeChannel(channel);
         channel=client.channel('pc-changes-'+owner)
           .on('postgres_changes',{event:'*',schema:'public',table:'pc_choices',filter:'user_id=eq.'+owner},requestRefresh)
           .on('postgres_changes',{event:'*',schema:'public',table:'pc_people',filter:'user_id=eq.'+owner},requestRefresh)
           .subscribe();
         status('Synced ✓');
       }catch(e){status('Cloud setup incomplete: '+e.message,true);console.error(e);ui(false);}
     }
     const {data,error}=await client.auth.getSession();if(error)throw error;
     client.auth.onAuthStateChange((_event,session)=>setTimeout(()=>onSession(session),0));
     await onSession(data?.session);
     addEventListener('online',()=>{if(owner)refresh()});
     addEventListener('focus',()=>{if(owner)refresh()});
   }catch(e){status('Cloud unavailable: '+e.message,true);console.error(e);ui(false);}
 }
 // Web cannot resolve local Windows PDF paths. Never expose licensed originals.
 document.addEventListener('click',event=>{
   const link=event.target.closest('a[href]');
   if(link && /^(Templates|Additional_Templates)\//i.test(decodeURIComponent(link.getAttribute('href')||''))){
     event.preventDefault();
     alert('Original printable files remain in your local organizer. Web printing will be enabled after PDF path and permissions review.');
   }
 },true);
 start();
}
