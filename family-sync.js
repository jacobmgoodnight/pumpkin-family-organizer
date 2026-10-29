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
 let ui=connected=>{$('cloud-email-form').hidden=connected;$('cloud-actions').hidden=!connected;document.body.classList.toggle('cloud-gated',!connected);};
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

 // -- Original PDF locator ----------------------------------------------------
 // The catalog's source paths refer to actual Zombie Pumpkins folders;
 // the pretty in-organizer category paths are NOT those originals.
 const libraryRootKey='pumpkin_local_library_root';
 let currentPrintItem=null;
 const printDialog=document.createElement('dialog');
 printDialog.id='pumpkin-original-locator';
 printDialog.style.cssText='width:min(92vw,680px);border:1px solid #a7784c;border-radius:16px;background:#16201c;color:#f9f2e6;padding:22px;box-shadow:0 20px 70px #000b';
 const closePrint=document.createElement('button');
 closePrint.textContent='Close';closePrint.type='button';closePrint.style.cssText='padding:9px 16px;border-radius:9px;background:#38463d;color:white;border:1px solid #768578';
 const copyPrint=document.createElement('button');
 copyPrint.textContent='Copy file path';copyPrint.type='button';copyPrint.style.cssText='padding:9px 16px;border-radius:9px;background:#f0ae70;color:#1d1c15;border:0;margin-right:8px;font-weight:700';
 const setRoot=document.createElement('button');
 setRoot.textContent='Set my local library folder';setRoot.type='button';setRoot.style.cssText='display:block;margin:9px 0;background:none;border:0;padding:0;color:#bda8dc;cursor:pointer;text-decoration:underline';
 const printTitle=document.createElement('h3');
 const printHelp=document.createElement('p');
 printHelp.textContent='On your Mac, in Finder choose Go → Go to Folder (Shift + Command + G), then paste the copied path. On Windows, paste it in File Explorer. Web browsers cannot directly open local-drive PDFs.';
 const printPath=document.createElement('div');
 printPath.style.cssText='overflow-wrap:anywhere;font:13px/1.5 ui-monospace,Consolas,monospace;background:#0a100e;border:1px solid #374b41;border-radius:8px;padding:12px;margin:12px 0';
 const printHint=document.createElement('p');
 printHint.style.cssText='font-size:13px;opacity:.75';
 const printControls=document.createElement('div');
 printControls.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center';
 printControls.append(copyPrint,closePrint);
 printDialog.append(printTitle,printHelp,printPath,printHint,setRoot,printControls);
 document.body.append(printDialog);
 function trueRelativePath(item){
   const source=Array.isArray(item?.sources)
     ?item.sources.find(s=>typeof s==='string'&&s.startsWith('Zombie Pumpkins/')&&/\.pdf$/i.test(s)):null;
   return source||(item?.path?'____Pumpkin_Complete_Family_Organizer_HD/'+item.path:'');
 }
 function printPathFor(item){
   const rel=trueRelativePath(item);
   const root=(localStorage.getItem(libraryRootKey)||'').trim().replace(/[/\\]+$/,'');
   if(!root)return rel;
   const sep=root.includes('\\')?'\\':'/';
   return root+sep+rel.split('/').join(sep);
 }
 function drawPath(){
   if(!currentPrintItem)return;
   printPath.textContent=printPathFor(currentPrintItem);
   printHint.textContent=localStorage.getItem(libraryRootKey)
     ?'This original file must be on your own computer or connected drive.'
     :'For a complete absolute path, set the folder containing “Zombie Pumpkins” and “____Pumpkin_Complete_Family_Organizer_HD”. This setting stays on this device.';
 }
 setRoot.addEventListener('click',()=>{
   const previous=localStorage.getItem(libraryRootKey)||'';
   const entered=prompt('Paste the folder path CONTAINING both Zombie Pumpkins and ____Pumpkin_Complete_Family_Organizer_HD:',previous||'/Volumes/SSD2go PKT/Holiday videos/Pumpkin Cutout Templates');
   if(entered===null)return;
   if(entered.trim())localStorage.setItem(libraryRootKey,entered.trim());
   else localStorage.removeItem(libraryRootKey);
   drawPath();
 });
 copyPrint.addEventListener('click',async()=>{
   try{await navigator.clipboard.writeText(printPathFor(currentPrintItem));copyPrint.textContent='Copied ✓';setTimeout(()=>{copyPrint.textContent='Copy file path'},1800)}
   catch{prompt('Copy the original file path:',printPathFor(currentPrintItem))}
 });
 closePrint.addEventListener('click',()=>printDialog.close());
 printDialog.addEventListener('click',e=>{if(e.target===printDialog)printDialog.close()});
 document.addEventListener('click',event=>{
   const link=event.target.closest('a[href]');
   if(!link||!(link.classList.contains('pdf')||link.id==='preview-original'))return;
   const href=decodeURIComponent(link.getAttribute('href')||'');
   if(!/^(Templates|Additional_Templates)\//i.test(href))return;
   event.preventDefault();
   currentPrintItem=window.allData?.().find(x=>x.path===href);
   if(!currentPrintItem)return;
   printTitle.textContent='Find the original: '+currentPrintItem.name;
   drawPath();
   printDialog.showModal();
 },true);
 function updateOriginalLabels(){
   document.querySelectorAll('a.pdf').forEach(a=>{if(a.textContent!=='Find original ↗')a.textContent='Find original ↗'});
   const preview=document.getElementById('preview-original');
   if(preview&&preview.textContent.startsWith('Open original'))preview.textContent='Find original file ↗';
   if(preview&&preview.textContent.startsWith('Open PDF'))preview.textContent='Find original PDF ↗';
 }
 const labelsObserver=new MutationObserver(()=>updateOriginalLabels());
 labelsObserver.observe(document.body,{subtree:true,childList:true});
 updateOriginalLabels();

 // -- Private folder upload ---------------------------------------------------
 // User chooses which previews they have permission to store. No automatic
 // upload, no original PDFs, no public bucket, no service-role key.
 const uploadDetails=document.createElement('details');
 uploadDetails.hidden=true;uploadDetails.style.cssText='margin-top:12px;padding:10px;border:1px solid #466158;border-radius:10px';
 const uploadSummary=document.createElement('summary');
 uploadSummary.textContent='📷 Add private thumbnail folders';uploadSummary.style.cursor='pointer';
 const uploadDesc=document.createElement('p');
 uploadDesc.textContent='From your computer, select the “Thumbnails” folder, then repeat with “Additional_Thumbnails”. Only images are uploaded to private family storage; no printable PDFs. Your browser may take several minutes to upload the full collection.';
 const rights=document.createElement('label');
 rights.style.cssText='display:block;margin:8px 0;font-size:13px';
 const rightsCheck=document.createElement('input');rightsCheck.type='checkbox';
 rights.append(rightsCheck,document.createTextNode(' I confirm that I have permission to store these selected previews privately for household use.'));
 const folderButton=document.createElement('button');
 folderButton.type='button';folderButton.textContent='Choose a thumbnail folder';folderButton.style.cssText='background:#f0ae70;color:#141c18;border:0;padding:10px;border-radius:8px;font-weight:700';
 const folderInput=document.createElement('input');
 folderInput.type='file';folderInput.multiple=true;folderInput.hidden=true;folderInput.setAttribute('webkitdirectory','');folderInput.setAttribute('directory','');
 const uploadProgress=document.createElement('p');uploadProgress.setAttribute('aria-live','polite');
 uploadDetails.append(uploadSummary,uploadDesc,rights,folderButton,folderInput,uploadProgress);
 panel.append(uploadDetails);
 const oldUi=ui;
 ui=connected=>{oldUi(connected);uploadDetails.hidden=!connected;};
 folderButton.addEventListener('click',()=>{
   if(!owner){uploadProgress.textContent='Sign in before uploading.';return;}
   if(!rightsCheck.checked){uploadProgress.textContent='First confirm that you have permission to store these previews.';return;}
   folderInput.value='';folderInput.click();
 });
 let busyUpload=false;
 folderInput.addEventListener('change',async()=>{
   if(busyUpload||!owner||!rightsCheck.checked)return;
   const ownerForUpload=owner;
   const selected=[...folderInput.files];
   const allowed=[];
   for(const file of selected){
     const relative=(file.webkitRelativePath||'').replaceAll('\\','/');
     if(!/^(Thumbnails|Additional_Thumbnails)\/[a-z0-9._-]+\.(jpg|jpeg|png|webp|gif)$/i.test(relative))continue;
     if(file.size>20*1024*1024)continue;
     allowed.push({file,path:relative});
   }
   if(!allowed.length){uploadProgress.textContent='Choose the Thumbnails or Additional_Thumbnails folder itself, not the organizer parent.';return;}
   const totalBytes=allowed.reduce((n,x)=>n+x.file.size,0);
   if(!confirm('Privately upload '+allowed.length+' selected thumbnails ('+(totalBytes/1048576).toFixed(1)+' MB) to your signed-in household account? No PDFs or public images will be published.'))return;
   busyUpload=true;folderButton.disabled=true;
   let next=0,complete=0,failed=0;const examples=[];
   const mime={'jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','webp':'image/webp','gif':'image/gif'};
   async function worker(){
     while(next<allowed.length&&owner===ownerForUpload){
       const j=next++,entry=allowed[j],ext=entry.path.split('.').pop().toLowerCase();
       try{
         const {error}=await client.storage.from(cfg.bucket||'pc-previews').upload(ownerForUpload+'/'+entry.path,entry.file,{
           cacheControl:'3600',upsert:true,contentType:mime[ext]
         });
         if(error)throw error;
       }catch(e){failed++;if(examples.length<4)examples.push(entry.path+': '+e.message);}
       complete++;
       if(complete%10===0||complete===allowed.length)uploadProgress.textContent='Private uploads: '+complete+'/'+allowed.length+(failed?' · '+failed+' failed':'');
     }
   }
   await Promise.all(Array.from({length:Math.min(4,allowed.length)},worker));
   busyUpload=false;folderButton.disabled=false;urls.clear();schedulePreviews();
   uploadProgress.textContent='Finished: '+(complete-failed)+' uploaded / '+complete+' attempted'+(failed?'; '+failed+' errors. '+examples.join(' | '):'. Refresh the gallery to see your images.');
 });
 start();
}
