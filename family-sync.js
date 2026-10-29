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
 '<form id="cloud-email-form" hidden style="display:none;gap:8px;max-width:420px;margin-top:10px"><label for="cloud-email">Parent email</label><input id="cloud-email" type="email" autocomplete="email" required placeholder="Parent email"><label for="cloud-parent-password">Family account password</label><input id="cloud-parent-password" type="password" autocomplete="current-password" placeholder="Only needed for password sign-in" required><button type="submit" id="cloud-password-login">Sign in with password</button><button type="button" id="cloud-email-link" style="background:transparent;border:1px solid #697c6c;color:#e8e7dc">Send email sign-in link</button><button type="button" id="cloud-reset-password" style="background:transparent;border:1px solid #697c6c;color:#e8e7dc">Set up / reset password</button><p id="cloud-auth-hint" role="status" style="font-size:12px;opacity:.9;margin:0">Use the email already registered as the parent account. Email sign-in links do not require a password. New accounts cannot be created here.</p></form>'+
 '<div id="cloud-actions" hidden><button id="cloud-import" type="button">Merge favorites from this device</button><button id="cloud-set-password" type="button">Set/change parent password</button><button id="cloud-signout" type="button">Sign out</button></div>'+
 '<form id="cloud-password-setup" hidden style="display:none;gap:8px;max-width:420px;margin:10px 0"><strong>Set a parent password for other devices</strong><p style="font-size:12px;margin:0;opacity:.9">Do this once on a device where you are already signed in. Future devices can use the parent email and this password without requesting a new sign-in email.</p><label for="cloud-new-password">New password (12+ characters)</label><input id="cloud-new-password" type="password" minlength="12" autocomplete="new-password" required><label for="cloud-confirm-password">Confirm password</label><input id="cloud-confirm-password" type="password" minlength="12" autocomplete="new-password" required><div style="display:flex;gap:8px"><button type="submit">Save password</button><button id="cloud-password-cancel" type="button" style="background:transparent;border:1px solid #697c6c;color:#e8e7dc">Cancel</button></div><p id="cloud-password-feedback" role="status" style="font-size:12px;margin:0"></p></form>'+ 
 '<p id="cloud-help">A parent connects each device once with their email and password. Children never need an email or password; they simply select their name. This device stays connected unless signed out.</p>';
 document.querySelector('header')?.append(panel);
 const $=id=>document.getElementById(id),clone=v=>JSON.parse(JSON.stringify(v));
 const status=(s,error=false)=>{$('cloud-status').textContent=s;$('cloud-status').style.color=error?'#ffb4a8':'#a4dbc5';};
 const accountSettings=document.createElement('details');
 accountSettings.id='cloud-account-settings';accountSettings.hidden=true;
 accountSettings.style.cssText='margin-top:7px;border-top:1px solid #53665c;padding:9px 0';
 const accountSummary=document.createElement('summary');
 accountSummary.textContent='⚙ Family account settings';accountSummary.style.cssText='cursor:pointer;color:#eabb86;font-size:13px';
 accountSettings.append(accountSummary);
 const authActions=$('cloud-actions'),passwordSetup=$('cloud-password-setup');
 accountSettings.append(authActions,passwordSetup);panel.append(accountSettings);
 const parentInfo=document.createElement('div');
 parentInfo.id='cloud-child-setup';
 parentInfo.style.cssText='font-size:13px;line-height:1.5;padding:8px 0;color:#e4ded3';
 parentInfo.textContent='A parent signs in once per device. Each child then chooses their name; no child email or password is needed.';
 panel.append(parentInfo);
 const quickPeople=document.createElement('div');
 quickPeople.id='cloud-quick-people';quickPeople.hidden=true;
 quickPeople.style.cssText='display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:10px 0';
 panel.append(quickPeople);
 function renderQuickPeople(){
   quickPeople.replaceChildren();
   const title=document.createElement('span');title.textContent='Who’s carving?';title.style.cssText='font-size:13px;font-weight:700;margin-right:4px';quickPeople.append(title);
   const state=bridge.snapshot();
   (state.people||[]).forEach((person,index)=>{
     const b=document.createElement('button');b.type='button';b.textContent=person.name;
     b.style.cssText='border-radius:999px;padding:8px 13px;font-weight:650;border:1px solid #647a66;background:#26352b;color:#f0ebdf';
     if(person.id===state.active){b.style.background='#b86f36';b.style.borderColor='#f4b377';}
     b.addEventListener('click',()=>{
       const btn=document.querySelectorAll('#profiles button.profile')[index];
       if(btn){btn.click();renderQuickPeople();}
       document.querySelector('main.workspace')?.scrollIntoView({behavior:'smooth',block:'start'});
     });
     quickPeople.append(b);
   });
 }
 window.addEventListener('pumpkin:statechange',()=>renderQuickPeople());
 const offline=clone(bridge.snapshot());
 let client=null,owner=null,channel=null,applying=false,last=null,refreshAgain=false,refreshTimer=null,thumbnailTimer=null;
 let outbox=[],flushing=false;
 const outboxKey=uid=>'pumpkin-family-outbox-v1:'+uid;
 function saveOutbox(uid){try{localStorage.setItem(outboxKey(uid),JSON.stringify(outbox));}catch(e){status('Changes saved here but offline retry storage is unavailable',true);console.warn('Offline queue storage',e);}}
 function loadOutbox(uid){
   try{
     const data=JSON.parse(localStorage.getItem(outboxKey(uid))||'[]');
     return Array.isArray(data)?data.filter(x=>x&&['person','choice','remove-person'].includes(x.kind)&&x.row&&typeof x.row==='object').slice(0,2500):[];
   }catch{return[];}
 }
 async function flushOutbox(){
   if(flushing||!owner||!client||!outbox.length)return;
   const uid=owner;flushing=true;status('Syncing family changes…');
   try{
     while(owner===uid&&outbox.length){
       const op=outbox[0];let result;
       if(op.kind==='person')result=await client.from('pc_people').upsert({user_id:uid,...op.row},{onConflict:'user_id,person_id'});
       else if(op.kind==='choice')result=await client.from('pc_choices').upsert({user_id:uid,...op.row},{onConflict:'user_id,person_id,template_id'});
       else result=await client.from('pc_people').delete().eq('user_id',uid).eq('person_id',op.row.person_id);
       if(result.error)throw result.error;
       if(owner!==uid)return;
       outbox.shift();saveOutbox(uid);
     }
     if(owner===uid){status('Synced ✓');if(refreshAgain){refreshAgain=false;requestRefresh();}}
   }catch(e){if(owner===uid)status('Changes saved on this device — sync retry needed',true);console.error('Pumpkin sync retry',e);}
   finally{flushing=false;}
 }

 const peopleMap=s=>new Map((s.people||[]).map(p=>[p.id,p.name]));
 const choiceMap=s=>{
   const m=new Map();
   for(const p of s.people||[]){
     const f=new Set(s.favorites?.[p.id]||[]),pick=new Set(s.picks?.[p.id]||[]);
     for(const id of new Set([...f,...pick]))m.set(JSON.stringify([p.id,id]),{person_id:p.id,template_id:id,favorite:f.has(id)||pick.has(id),final_pick:pick.has(id)});
   }
   return m;
 };
 let ui=connected=>{
   $('cloud-email-form').hidden=connected;$('cloud-actions').hidden=!connected;
   // Forms use CSS grid; explicitly hide when HTML 'hidden' competes with display.
   $('cloud-email-form').style.display=connected?'none':'grid';
   $('cloud-password-setup').hidden=!connected || !$('cloud-password-setup').dataset.open;
   $('cloud-password-setup').style.display=$('cloud-password-setup').hidden?'none':'grid';
   if(!connected){$('cloud-password-setup').dataset.open='';}
   document.body.classList.toggle('cloud-gated',!connected);
   quickPeople.hidden=true;quickPeople.style.display='none';parentInfo.hidden=connected;
   $('cloud-help').hidden=connected;
   $('cloud-account-settings').hidden=!connected;
   if(connected)renderQuickPeople();
 };
 function enqueue(before,after){
   if(!owner||!client||applying)return;
   const uid=owner,a=peopleMap(before),b=peopleMap(after),ca=choiceMap(before),cb=choiceMap(after),ops=[];
   for(const [person_id,display_name] of b)if(a.get(person_id)!==display_name)
     ops.push({kind:'person',row:{person_id,display_name}});
   const changed=[...new Set([...ca.keys(),...cb.keys()])]
     .filter(k=>JSON.stringify(ca.get(k)||null)!==JSON.stringify(cb.get(k)||null));
   const removed=[...a.keys()].filter(id=>!b.has(id));
   for(const key of changed){
     const [person_id,template_id]=JSON.parse(key);
     if(removed.includes(person_id))continue;
     ops.push({kind:'choice',row:cb.get(key)||{person_id,template_id,favorite:false,final_pick:false}});
   }
   for(const person_id of removed)ops.push({kind:'remove-person',row:{person_id}});
   if(!ops.length)return;
   outbox.push(...ops);saveOutbox(uid);
   status(navigator.onLine?'Syncing family changes…':'Offline — changes saved on this device',!navigator.onLine);
   void flushOutbox();
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
   const uid=owner;
   if(flushing||outbox.length){refreshAgain=true;void flushOutbox();return;}
   refreshAgain=false;
   const [p,c]=await Promise.all([
     client.from('pc_people').select('person_id,display_name').eq('user_id',owner),
     client.from('pc_choices').select('person_id,template_id,favorite,final_pick').eq('user_id',owner)
   ]);
   if(p.error||c.error){status('Unable to load cloud choices',true);console.error(p.error||c.error);return;}
   if(owner!==uid||flushing||outbox.length){refreshAgain=true;return;}
   applying=true;
   try{bridge.applyRemote(combine(p.data||[],c.data||[]));last=clone(bridge.snapshot());}
   finally{applying=false;}
   status('Synced ✓');renderQuickPeople();schedulePreviews();
 }
 function requestRefresh(){
   clearTimeout(refreshTimer);
   refreshTimer=setTimeout(()=>{if(flushing||outbox.length){refreshAgain=true;void flushOutbox();}else void refresh();},220);
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
   await client.auth.signOut();owner=null;outbox=[];
   if(channel){await client.removeChannel(channel);channel=null;}
   ui(false);status('Signed out');window.dispatchEvent(new Event('pumpkin:cloudsignedout'));
 });
 // Password sign-in does not send email and avoids the project's small email quota.
 let loginPending=false,emailPending=false;
 $('cloud-email-form').addEventListener('submit',async event=>{
   event.preventDefault();
   if(loginPending||!client)return;
   const email=$('cloud-email').value.trim();
   const password=$('cloud-parent-password').value;
   if(!password){status('Enter your parent password, or use Send email sign-in link without a password.',true);return;}
   loginPending=true;$('cloud-password-login').disabled=true;status('Signing in with password…');
   try{
     const {error}=await client.auth.signInWithPassword({email,password});
     $('cloud-parent-password').value='';
     if(error){
       status('Password sign-in failed: '+error.message,true);
       $('cloud-auth-hint').textContent='No password yet? Select Set up / reset password or use an already signed-in device to set one.';
     }else status('Signed in. Loading family profiles…');
   }catch(error){status('Sign-in connection error: '+error.message,true);}
   finally{loginPending=false;$('cloud-password-login').disabled=false;}
 });
 const emailCooldownKey='pumpkin_signin_email_pause_until';
 const emailLink=$('cloud-email-link'),passwordReset=$('cloud-reset-password');
 function checkEmailCooldown(){
   const until=Number(localStorage.getItem(emailCooldownKey)||0);
   if(until>Date.now()){
     emailLink.disabled=true;passwordReset.disabled=true;
     const mins=Math.ceil((until-Date.now())/60000);
     $('cloud-auth-hint').textContent='Email link requests are temporarily paused on this browser ('+mins+' min left). Use a password if available. The built-in Supabase email service has a project-wide 2 emails/hour limit.';
   }else{
     emailLink.disabled=false;passwordReset.disabled=false;
     if(until)localStorage.removeItem(emailCooldownKey);
   }
 }
 checkEmailCooldown();
 emailLink.addEventListener('click',async()=>{
   if(!client||emailPending)return;
   checkEmailCooldown();if(emailLink.disabled)return;
   const input=$('cloud-email');
   if(!input.reportValidity())return;
   const email=input.value.trim();
   // One intentional parent-only email request; prevent accidental account creation.
   emailPending=true;emailLink.disabled=true;status('Requesting a parent email link…');
   try{
     const {error}=await client.auth.signInWithOtp({email,options:{
       emailRedirectTo:location.origin+location.pathname,
       shouldCreateUser:false
     }});
     if(error){
       if(error.code==='over_email_send_rate_limit'||/email rate limit exceeded/i.test(error.message)){
         localStorage.setItem(emailCooldownKey,String(Date.now()+30*60*1000));
         status('Supabase email limit reached (2 per hour). Use the password method, or try email later.',true);
       }else if(error.code==='over_request_rate_limit'||error.status===429){
         localStorage.setItem(emailCooldownKey,String(Date.now()+5*60*1000));
         status('Too many authentication requests. Use your parent password, or try again later.',true);
       }else if(/signups? not allowed for otp|signup.*disabled|otp_disabled/i.test(error.message||'')||error.code==='otp_disabled'){
         status('Email link rejected. This commonly means the entered email is not the existing parent account when new signups are disabled. Check the parent email in Supabase Auth → Users, then retry.',true);
         $('cloud-auth-hint').textContent='Try Set up / reset password with the same existing email. Keep public signups disabled.';
       }else status('Unable to send email link: '+error.message,true);
     }else{
       localStorage.setItem(emailCooldownKey,String(Date.now()+90*1000));
       status('Email link requested. Check the parent inbox and use the most recent link.');
     }
   }catch(error){status('Sign-in email connection failed: '+error.message,true);}
   finally{emailPending=false;checkEmailCooldown();}
 });
 // Use Supabase recovery email for an existing parent, not public signups.
 passwordReset.addEventListener('click',async()=>{
   if(!client||emailPending)return;
   checkEmailCooldown();if(passwordReset.disabled)return;
   const field=$('cloud-email');if(!field.reportValidity())return;
   emailPending=true;passwordReset.disabled=true;emailLink.disabled=true;
   status('Requesting a password setup email…');
   try{
     const {error}=await client.auth.resetPasswordForEmail(field.value.trim(),{
       redirectTo:location.origin+location.pathname
     });
     if(error){
       if(error.code==='over_email_send_rate_limit'||error.code==='over_request_rate_limit'||error.status===429){
         localStorage.setItem(emailCooldownKey,String(Date.now()+30*60*1000));
         status('Email sending is temporarily limited. Use a device already signed in, or try later.',true);
       }else status('Password setup request failed: '+error.message,true);
     }else{
       localStorage.setItem(emailCooldownKey,String(Date.now()+90*1000));
       status('If the email belongs to the existing parent account, a password setup link will arrive. Open it on this device.');
       $('cloud-auth-hint').textContent='The recovery link lets you set a password. It does not create a new family account.';
     }
   }catch(e){status('Could not request password setup: '+e.message,true);}
   finally{emailPending=false;checkEmailCooldown();}
 });
 // A signed-in parent can attach a password to the existing email-link account.
 function togglePasswordSetup(open){
   const form=$('cloud-password-setup');
   form.dataset.open=open?'yes':'';
   form.hidden=!open;form.style.display=open?'grid':'none';
   if(open)$('cloud-new-password').focus();
   if(!open){form.reset();$('cloud-password-feedback').textContent='';}
 }
 $('cloud-set-password').addEventListener('click',()=>togglePasswordSetup(true));
 $('cloud-password-cancel').addEventListener('click',()=>togglePasswordSetup(false));
 $('cloud-password-setup').addEventListener('submit',async event=>{
   event.preventDefault();
   if(!client||!owner)return;
   const password=$('cloud-new-password').value,confirmPassword=$('cloud-confirm-password').value;
   const feedback=$('cloud-password-feedback');
   if(password.length<12){feedback.textContent='Choose at least 12 characters.';return;}
   if(password!==confirmPassword){feedback.textContent='Passwords do not match.';return;}
   if(!window.confirm('Set this password for your existing household account? All family profiles and favorites will stay in the same account.'))return;
   const save=$('cloud-password-setup').querySelector('button[type="submit"]');
   save.disabled=true;feedback.textContent='Saving password securely…';
   try{
     const {error}=await client.auth.updateUser({password});
     if(error){feedback.textContent='Could not set password: '+error.message+'. Supabase may require reauthentication on an older session.';}
     else{
       togglePasswordSetup(false);
       status('Parent password saved ✓. New devices can sign in without email links.');
     }
   }catch(error){feedback.textContent='Password setup error: '+error.message;}
   finally{save.disabled=false;}
 });
 // Signed image URLs work only after personal-use thumbnails are uploaded to private Storage.
 const urls=new Map();let urlsUntil=0,previewObserver=null;
 async function loadPreviews(){
   if(!owner)return;
   if(Date.now()>=urlsUntil){
     urls.clear();urlsUntil=Date.now()+45*60*1000;
     document.querySelectorAll('img[data-pumpkin-path]').forEach(img=>{img.dataset.pumpkinSigned='';});
   }
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
       if(!session?.user){owner=null;outbox=[];last=null;urls.clear();urlsUntil=0;ui(false);status('Sign in to share favorites');window.dispatchEvent(new Event('pumpkin:cloudsignedout'));return;}
       if(owner===session.user.id)return;
       urls.clear();urlsUntil=0;
       owner=session.user.id;last=clone(bridge.snapshot());outbox=loadOutbox(owner);status(outbox.length?'Restoring pending family changes…':'Loading family choices…');
       try{
         await seed();if(outbox.length)await flushOutbox();await refresh();ui(true);
         if(!previewObserver){previewObserver=new MutationObserver(schedulePreviews);previewObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});}
         if(channel)await client.removeChannel(channel);
         channel=client.channel('pc-changes-'+owner)
           .on('postgres_changes',{event:'*',schema:'public',table:'pc_choices',filter:'user_id=eq.'+owner},requestRefresh)
           .on('postgres_changes',{event:'*',schema:'public',table:'pc_people',filter:'user_id=eq.'+owner},requestRefresh)
           .subscribe();
         status(outbox.length?'Changes saved locally — reconnect to sync':'Synced ✓',!!outbox.length);
         window.dispatchEvent(new Event('pumpkin:cloudready'));
       }catch(e){status('Cloud setup incomplete: '+e.message,true);console.error(e);ui(false);}
     }
     const {data,error}=await client.auth.getSession();if(error)throw error;
     client.auth.onAuthStateChange((event,session)=>setTimeout(async()=>{
       await onSession(session);
       if(event==='PASSWORD_RECOVERY'&&session?.user){
         ui(true);togglePasswordSetup(true);
         status('Password recovery confirmed. Choose a new parent password.');
       }
     },0));
     await onSession(data?.session);
     addEventListener('online',()=>{if(owner){void flushOutbox().then(()=>requestRefresh());}});
     addEventListener('focus',()=>{if(owner){void flushOutbox().then(()=>requestRefresh());schedulePreviews();}});
     setInterval(()=>{if(owner)schedulePreviews()},20*60*1000);
   }catch(e){status('Cloud unavailable: '+e.message,true);console.error(e);ui(false);}
 }

 window.addEventListener('pumpkin:cloudrefresh',()=>{if(owner)requestRefresh()});
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
  const link=event.target.closest('a[data-original-id],a.pdf,a#preview-original,a[href]');
  if(!link)return;
  let relative='';try{relative=decodeURIComponent(link.getAttribute('href')||'');}catch{}
  if(!link.dataset.originalId&&!/^(Templates|Additional_Templates)\//i.test(relative))return;
  const catalog=window.allData?.()||[];
  const item=(link.dataset.originalId&&catalog.find(x=>x.id===link.dataset.originalId))||catalog.find(x=>x.path===relative);
  if(!item||!item.path||item.path.startsWith('https://'))return;
  event.preventDefault();
  currentPrintItem=item;printTitle.textContent='Find the original: '+item.name;
  drawPath();printDialog.showModal();
 },true);
 function updateOriginalLabels(){
   document.querySelectorAll('a.pdf').forEach(a=>{if(!/^https:\/\//i.test(a.getAttribute('href')||'')&&a.textContent!=='Find original ↗')a.textContent='Find original ↗'});
   const preview=document.getElementById('preview-original');
   if(preview&&!/^https:\/\//i.test(preview.getAttribute('href')||'')&&preview.textContent.startsWith('Open original'))preview.textContent='Find original file ↗';
   if(preview&&!/^https:\/\//i.test(preview.getAttribute('href')||'')&&preview.textContent.startsWith('Open PDF'))preview.textContent='Find original PDF ↗';
 }
 const labelsObserver=new MutationObserver(()=>updateOriginalLabels());
 labelsObserver.observe(document.body,{subtree:true,childList:true});
 updateOriginalLabels();

 // -- Private folder upload ---------------------------------------------------
 // User chooses which previews they have permission to store. No automatic
 // upload, no original PDFs, no public bucket, no service-role key.
 const galleryState=document.createElement('div');
 galleryState.id='cloud-gallery-state';galleryState.hidden=true;
 galleryState.style.cssText='margin:12px 0 6px;border-radius:12px;border:1px solid #627c6a;background:rgba(32,49,39,.85);padding:12px;display:flex;flex-wrap:wrap;align-items:center;gap:10px';
 const galleryMessage=document.createElement('div');galleryMessage.style.cssText='flex:1;min-width:210px;font-size:13px;line-height:1.5';
 galleryMessage.textContent='Checking shared image availability…';
 const galleryAction=document.createElement('button');galleryAction.type='button';
 galleryAction.textContent='Set up thumbnails for everyone';
 galleryAction.style.cssText='background:#edac74;color:#22170f;border:0;border-radius:9px;padding:10px;font-weight:700';
 galleryState.append(galleryMessage,galleryAction);panel.append(galleryState);
 const expectedImages=2053;
 async function folderCount(folder){
   let count=0,offset=0;
   for(let page=0;page<10;page++){
     const {data,error}=await client.storage.from(cfg.bucket||'pc-previews').list(owner+'/'+folder,{limit:1000,offset});
     if(error)throw error;
     const items=data||[];
     count+=items.filter(x=>x.name&&/\.(jpg|jpeg|png|webp|gif)$/i.test(x.name)).length;
     if(items.length<1000)break;
     offset+=1000;
   }
   return count;
 }
 let countRequest=0;
 async function updateGalleryCount(){
   if(!client||!owner)return;
   const sequence=++countRequest;
   galleryMessage.textContent='Checking shared image availability…';
   galleryState.hidden=false;
   try{
     const [z,a]=await Promise.all([folderCount('Thumbnails'),folderCount('Additional_Thumbnails')]);
     if(sequence!==countRequest)return;
     const number=z+a;
     galleryState.style.display=number>=expectedImages?'none':'flex';
     galleryMessage.textContent=number>=expectedImages
       ?'✓ All '+number.toLocaleString()+' thumbnails are stored privately and available across signed-in family devices.'
       :number
         ?number.toLocaleString()+' of '+expectedImages.toLocaleString()+' thumbnails uploaded. Continue uploading remaining folders from your Mac or PC.'
         :'No thumbnails have been uploaded yet. Use your Mac or PC once to upload both folders; images will then display on every connected family device.';
     galleryAction.textContent=number>=expectedImages?'Manage private thumbnails':'Upload thumbnails for everyone';
     if(number<expectedImages)galleryState.style.borderColor='#c99a57';
     else galleryState.style.borderColor='#5b9368';
   }catch(e){galleryMessage.textContent='Could not check thumbnails: '+(e.message||'network error')+'. You can still try uploading.';}
 }
 const uploadDetails=document.createElement('details');
 uploadDetails.hidden=true;uploadDetails.style.cssText='margin-top:12px;padding:10px;border:1px solid #466158;border-radius:10px';
 const uploadSummary=document.createElement('summary');
 uploadSummary.textContent='📷 Upload photos for all family devices';uploadSummary.style.cursor='pointer';
 const uploadDesc=document.createElement('p');
 uploadDesc.textContent='One-time setup on the Mac or PC that holds your organizer: choose the Thumbnails folder first, then repeat with Additional_Thumbnails. About 2,053 small preview images (~195 MB total) are stored privately for your signed-in household. No PDFs are uploaded. Keep this browser tab open during upload.';
 const rights=document.createElement('label');
 rights.style.cssText='display:block;margin:8px 0;font-size:13px';
 const rightsCheck=document.createElement('input');rightsCheck.type='checkbox';
 rights.append(rightsCheck,document.createTextNode(' I confirm that I have permission to store these selected previews privately for household use.'));
 const folderButton=document.createElement('button');
 folderButton.type='button';folderButton.textContent='Choose Thumbnails or Additional_Thumbnails folder';folderButton.style.cssText='background:#f0ae70;color:#141c18;border:0;padding:10px;border-radius:8px;font-weight:700';
 const folderInput=document.createElement('input');
 folderInput.type='file';folderInput.multiple=true;folderInput.hidden=true;folderInput.setAttribute('webkitdirectory','');folderInput.setAttribute('directory','');
 const uploadProgress=document.createElement('p');uploadProgress.setAttribute('aria-live','polite');
 uploadDetails.append(uploadSummary,uploadDesc,rights,folderButton,folderInput,uploadProgress);
 accountSettings.append(uploadDetails);
 const oldUi=ui;
 ui=connected=>{
   oldUi(connected);uploadDetails.hidden=!connected;galleryState.hidden=!connected;
   galleryState.style.display=connected?'flex':'none';
   if(connected){updateGalleryCount();}else{countRequest++;}
 };
 galleryAction.addEventListener('click',()=>{
   accountSettings.open=true;uploadDetails.open=true;
   uploadDetails.scrollIntoView({behavior:'smooth',block:'center'});
 });
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
   busyUpload=false;folderButton.disabled=false;
   urls.clear();
   document.querySelectorAll('img[data-pumpkin-path]').forEach(img=>{img.dataset.pumpkinSigned='';});
   schedulePreviews();updateGalleryCount();
   uploadProgress.textContent='Finished: '+(complete-failed)+' uploaded / '+complete+' attempted'+(failed?'; '+failed+' errors. '+examples.join(' | '):'. Refresh the gallery if needed to see your images on all signed-in devices.');
   if(!failed)uploadDetails.open=false;
 });
 start();
 import('./family-features.js').then(mod=>mod.init({getClient:()=>client,getOwner:()=>owner,bridge})).catch(e=>console.error('Family library unavailable:',e));
 import('./search-suggestions.js').then(mod=>mod.init()).catch(e=>console.error('Local search suggestions unavailable:',e));
}
