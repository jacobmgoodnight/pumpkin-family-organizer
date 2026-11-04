// A short-lived URL is generated only after the user asks to open an original.
export async function openFamilyOriginal({getOwner,getClient,getRow,openWindow,notify},id){
 const owner=getOwner(),row=getRow(id);
 if(!owner||!row?.original_path){notify('Connect the parent account and check that this original is still in the family library.');return false;}
 let tab;try{tab=openWindow()}catch{}
 if(!tab){notify('Your browser blocked the new tab. Allow pop-ups for this site, then try opening the original again.');return false;}
 try{
  tab.opener=null;
  const {data,error}=await getClient().storage.from('pc-family-imports').createSignedUrl(row.original_path,60);
  if(error||!data?.signedUrl||getOwner()!==owner||getRow(id)?.original_path!==row.original_path)throw new Error('Unable to open original');
  const url=new URL(data.signedUrl);
  if(url.protocol!=='https:')throw new Error('Unable to open original');
  tab.location.replace(url.href);
  return true;
 }catch{
  try{tab.close()}catch{}
  notify('Could not open this original. Check your connection and parent sign-in, then try again. If it was removed, import it again.');
  return false;
 }
}
