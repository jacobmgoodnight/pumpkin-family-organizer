// Optional, organizer-selected originals for existing collection designs.
const TYPES={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const BUCKET='pc-family-imports';
export function createBuiltinOriginals({getOwner,getClient,makeId=()=>crypto.randomUUID()}){
 let rows=new Map(),rowsOwner=null,generation=0;
 const validId=id=>/^(?:[a-f0-9]{16}|extra:[a-z0-9-]{1,100})$/.test(id);
 const current=()=>{const uid=getOwner();if(uid!==rowsOwner){rowsOwner=uid;rows=new Map();generation++}return uid};
 const same=uid=>{if(current()!==uid)throw Error('The family account changed. Please try again.');};
 const bucket=()=>getClient().storage.from(BUCKET);
 const conflict=()=>Object.assign(Error('The saved original changed in another window. Review it and try again.'),{code:'ORIGINAL_CONFLICT'});
 // Keep these files in a distinct namespace from family imports: deleting an
 // old attachment must never delete an imported design's original.
 const pathOK=(uid,path)=>typeof path==='string'&&path.startsWith(uid+'/imports/builtin-')&&!path.slice((uid+'/imports/').length).includes('/')&&/\/builtin-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-original\.(?:pdf|jpg|png|webp)$/.test(path);
 async function refresh(){
  const uid=current();if(!uid)return;const started=generation;
  const result=[];
  for(let offset=0;offset<5000;offset+=1000){
   const {data,error}=await getClient().from('pc_builtin_originals').select('template_id,original_path').eq('user_id',uid).order('template_id').range(offset,offset+999);
   same(uid);if(error){if(started===generation)rows=new Map();throw error}
   result.push(...(data||[]));if((data||[]).length<1000)break;
  }
  if(started===generation)rows=new Map(result.filter(x=>validId(x.template_id)&&pathOK(uid,x.original_path)).map(x=>[x.template_id,x.original_path]));
 }
 function has(id){current();return rows.has(id)}
 async function save(id,file){
  const uid=current();if(!uid||!validId(id))throw Error('Sign in and select a built-in design first.');
  const ext=TYPES[file?.type];if(!ext||file.size<1||file.size>20*1024*1024)throw Error('Choose a PDF, JPG, PNG or WebP file under 20 MB.');
  const path=uid+'/imports/builtin-'+makeId()+'-original.'+ext,old=rows.get(id);let uploaded=false,writeStarted=false;
  if(!pathOK(uid,path))throw Error('Could not create a safe private filename.');
  try{
   const upload=await bucket().upload(path,file,{contentType:file.type,upsert:false});if(upload.error)throw upload.error;uploaded=true;same(uid);
   writeStarted=true;
   // Do not silently replace a newer file saved in another organizer tab.
   const table=getClient().from('pc_builtin_originals');
   const result=old
    ?await table.update({original_path:path}).eq('user_id',uid).eq('template_id',id).eq('original_path',old).select('template_id')
    :await table.insert({user_id:uid,template_id:id,original_path:path}).select('template_id');
   same(uid);
   if(result.error?.code==='23505'){
    try{await bucket().remove([path])}catch{}
    await refresh();throw conflict();
   }
   if(result.error)throw result.error;
   if(!result.data?.length){
    // A successful conditional UPDATE with zero rows cannot have linked this
    // new object. Discard it and reload the other organizer's mapping.
    try{await bucket().remove([path])}catch{}
    await refresh();throw conflict();
   }
   generation++;rows.set(id,path);
   if(old&&old!==path&&pathOK(uid,old)){try{const cleanup=await bucket().remove([old]);return {cleanupFailed:!!cleanup.error}}catch{return {cleanupFailed:true}}}
   return {cleanupFailed:false};
  }catch(error){
   // Once a database request starts, its outcome can be uncertain. Keep the
   // uploaded object rather than risk deleting a successfully linked original.
   if(uploaded&&!writeStarted&&getOwner()===uid)try{await bucket().remove([path])}catch{}
   throw error;
  }
 }
 async function remove(id){
  const uid=current(),path=rows.get(id);if(!uid||!path)throw Error('No saved original was found.');
  const result=await getClient().from('pc_builtin_originals').delete().eq('user_id',uid).eq('template_id',id).eq('original_path',path).select('original_path');
  if(result.error)throw result.error;same(uid);
  if(!result.data?.length){await refresh();throw conflict()}
  generation++;rows.delete(id);try{const cleanup=await bucket().remove([path]);return {cleanupFailed:!!cleanup.error}}catch{return {cleanupFailed:true}}
 }
 async function open(id,openWindow=()=>window.open('about:blank','_blank')){
  const uid=current(),path=rows.get(id);if(!uid||!path)throw Error('Original unavailable. Refresh and try again.');
  const tab=openWindow();if(!tab)throw Error('Allow pop-ups to open this original.');
  try{
   tab.opener=null;const {data,error}=await bucket().createSignedUrl(path,60);same(uid);
   if(error||!data?.signedUrl||rows.get(id)!==path||new URL(data.signedUrl).protocol!=='https:')throw Error('Original unavailable.');
   tab.location.replace(data.signedUrl);
  }catch(error){try{tab.close()}catch{}throw error}
 }
 return {refresh,has,save,remove,open};
}
