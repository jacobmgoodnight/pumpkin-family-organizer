// Parent-only review of family search feedback and approved visual descriptions.
export function init({getClient,getOwner,bridge}){
 const settings=document.getElementById('settings-dialog');
 const preview=document.querySelector('#preview-dialog .detail-sidebar');
 if(!settings||!preview||!bridge?.setSearchOverrides)return;
 const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const review=make('button','Review search reports','button small quiet');review.type='button';settings.append(review);
 const edit=make('button','Correct search description','button quiet');edit.type='button';preview.append(edit);
 const dialog=make('dialog',undefined,'dialog');dialog.setAttribute('aria-labelledby','search-corrections-title');
 const head=make('div',undefined,'panel-top'),title=make('h2','Search corrections');title.id='search-corrections-title';
 const close=make('button','Close ✕','button small quiet');close.type='button';head.append(title,close);
 const intro=make('p','Review family reports or correct the description and search tags for a design. Approved changes apply to your family.','muted');
 const status=make('p','', 'tiny-note');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const list=make('div');const form=make('form');form.hidden=true;form.setAttribute('style','display:flex;flex-direction:column;align-items:stretch;gap:8px');
 const design=make('h3');const note=make('p','','muted');
 const label=make('label','Description');label.htmlFor='correction-description';
 const description=make('textarea');description.id='correction-description';description.required=true;description.maxLength=500;description.rows=4;description.setAttribute('style','width:100%;min-height:100px;padding:10px;border:1px solid #819887;border-radius:8px;background:#0d1612;color:white;font:inherit;resize:vertical');
 const tagsLabel=make('label','Search tags (separated by commas)');tagsLabel.htmlFor='correction-tags';
 const tags=make('input');tags.id='correction-tags';tags.type='text';tags.maxLength=1000;
 const save=make('button','Save correction','button primary');save.type='submit';
 const cancel=make('button','Back to reports','button quiet');cancel.type='button';
 form.append(design,note,label,description,tagsLabel,tags,save,cancel);
 dialog.append(head,intro,status,list,form);document.body.append(dialog);
 let reports=[],editing=null,editingReport=null,generation=0;
 const current=uid=>!!uid&&getOwner()===uid;
 function open(){if(!dialog.open)dialog.showModal();}
 function resetForm(){editing=null;editingReport=null;form.hidden=true;list.hidden=false;}
 function itemName(id){return (window.allData?.()||[]).find(x=>x.id===id)?.name||'Unavailable design';}
 function editItem(id,report){
  const item=(window.allData?.()||[]).find(x=>x.id===id);
  if(!item||!['zombie','extra'].includes(item.source)){status.textContent='This design is not available in the built-in catalog.';return;}
  editing=id;editingReport=report||null;const visual=bridge.getSearchVisual(id)||{};
  design.textContent=item.name;note.textContent=report?'Family suggestion: '+report.note:'Edit the current description and tags.';
  description.value=visual.description||'';tags.value=(visual.tags||[]).join(', ');
  list.hidden=true;form.hidden=false;status.textContent='';open();description.focus();
 }
 function draw(){
  list.replaceChildren();
  if(!reports.length){list.append(make('p','No search reports waiting. Open a design preview to correct it directly.','muted'));return;}
  for(const report of reports){
   const row=make('div',undefined,'notice');const heading=make('strong',itemName(report.template_id));
   const message=make('p',report.note);const button=make('button','Review and correct','button small');button.type='button';
   button.addEventListener('click',()=>editItem(report.template_id,report));row.append(heading,message,button);list.append(row);
  }
 }
 async function refresh(){
  const uid=getOwner(),client=getClient(),run=++generation;
  if(!uid||!client){bridge.setSearchOverrides([]);reports=[];draw();return false;}
  try{
   const feedbackRequest=client.from('pc_search_feedback').select('id,template_id,note,created_at').eq('user_id',uid).order('created_at',{ascending:false}).limit(1000);
   const loadOverrides=async()=>{
    const rows=[];
    for(let offset=0;offset<3000;offset+=1000){
     const page=await client.from('pc_search_overrides').select('template_id,description,tags').eq('user_id',uid).order('template_id',{ascending:true}).range(offset,offset+999);
     if(!current(uid)||run!==generation)return null;
     if(page.error)throw page.error;
     rows.push(...(page.data||[]));if((page.data||[]).length<1000)break;
    }
    return rows;
   };
   const [feedback,overrides]=await Promise.all([feedbackRequest,loadOverrides()]);
   if(!current(uid)||run!==generation)return false;
   if(feedback.error||!overrides)throw Error('Search corrections could not be loaded.');
   reports=feedback.data||[];
   bridge.setSearchOverrides(overrides.map(x=>({templateId:x.template_id,description:x.description,tags:x.tags})));
   draw();status.textContent='';return true;
  }catch{if(current(uid)&&run===generation)status.textContent='Search corrections could not be loaded. Check your connection and try again.';return false;}
 }
 review.addEventListener('click',()=>{resetForm();open();void refresh();});
 edit.addEventListener('click',async()=>{const id=bridge.getPreviewId?.(),uid=getOwner();if(!id)return;open();status.textContent='Loading current corrections…';if(await refresh()&&current(uid))editItem(id,null);});
 close.addEventListener('click',()=>dialog.close());cancel.addEventListener('click',resetForm);
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 form.addEventListener('submit',async event=>{
  event.preventDefault();const uid=getOwner(),client=getClient(),id=editing,report=editingReport;
  if(!uid||!client||!id){status.textContent='Sign in as organizer to save a correction.';return;}
  const value=description.value.trim(),words=[...new Set(tags.value.split(',').map(x=>x.trim()).filter(Boolean))];
  if(!value||value.length>500||words.length>20||words.some(x=>x.length>40||/[\x00-\x1f\x7f|]/.test(x))||words.join('').length>800){status.textContent='Enter a description and up to 20 tags, each no longer than 40 characters and without vertical bars.';return;}
  save.disabled=true;status.textContent='Saving…';
  try{
   const result=await client.from('pc_search_overrides').upsert({user_id:uid,template_id:id,description:value,tags:words,updated_at:new Date().toISOString()},{onConflict:'user_id,template_id'});
   if(result.error)throw result.error;if(!current(uid))return;
   if(report){const removed=await client.from('pc_search_feedback').delete().eq('user_id',uid).eq('id',report.id);if(removed.error){status.textContent='Correction saved, but the report could not be cleared. Try again.';return;}}
   if(!current(uid))return;resetForm();await refresh();if(current(uid))status.textContent='Correction saved for your family.';
  }catch{if(current(uid))status.textContent='Could not save the correction. Check your connection and try again.';}
  finally{save.disabled=false;}
 });
 const clear=()=>{generation++;reports=[];resetForm();bridge.setSearchOverrides([]);draw();status.textContent='';if(dialog.open)dialog.close();};
 window.addEventListener('pumpkin:cloudready',()=>void refresh());
 window.addEventListener('pumpkin:cloudsignedout',clear);window.addEventListener('pumpkin:cloudownerchange',clear);
 if(getOwner())void refresh();
}
