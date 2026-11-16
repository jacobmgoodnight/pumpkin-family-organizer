// Private-link access on this device. A link is a bearer capability for one
// family member. After the server confirms a link, it is remembered here so the
// family member can come back without finding the original message. A device
// can remember several family members (a shared iPad); with more than one, the
// page asks who is picking instead of guessing.
export const SESSION_KEY="pumpkin-person-invite";
export const REMEMBERED_KEY="pumpkin-person-invites-remembered-v2";
// Earlier versions remembered one link here, only after a "Remember" tap.
export const REMEMBER_KEY="pumpkin-person-invite-remembered-v1";
const PENDING_KEY="pumpkin-person-invite-pending-replacement-v1";
const VALID=/^[A-Za-z0-9_-]{43}$/;
const MAX_PEOPLE=8;
// Keep an expired link for a while: a parent can extend it, and then this same
// link works again. The server enforces expiry and revocation on every request.
const KEEP_AFTER_EXPIRY_MS=30*86400000;

export function createInviteAccess({hash="",baseUrl="",clearFragment=()=>{},getSession=()=>null,getPersistent=()=>null,now=()=>Date.now()}={}){
 const store=(getter,method,...args)=>{try{const target=getter();return target?.[method]?.(...args)??null;}catch{return null;}};
 const valid=value=>typeof value==="string"&&VALID.test(value);
 const fromHash=new URLSearchParams(hash.startsWith("#")?hash.slice(1):hash).get("invite");
 if(fromHash!==null)clearFragment();
 const incoming=valid(fromHash)?fromHash:null;

 function cleanEntry(value){
  if(!value||!valid(value.token))return null;
  const expiresAt=Number.isFinite(value.expiresAt)?value.expiresAt:null;
  if(expiresAt!==null&&expiresAt+KEEP_AFTER_EXPIRY_MS<=now())return null;
  return {token:value.token,personId:typeof value.personId==="string"?value.personId.slice(0,80):null,
   name:typeof value.name==="string"?value.name.slice(0,40):null,expiresAt};
 }
 // Always re-read: another tab may have remembered or forgotten someone.
 function readSaved(){
  let list=[];
  try{const value=JSON.parse(store(getPersistent,"getItem",REMEMBERED_KEY)||"[]");if(Array.isArray(value))list=value;}catch{}
  try{
   const legacy=JSON.parse(store(getPersistent,"getItem",REMEMBER_KEY)||"null");
   if(legacy&&valid(legacy.token)&&!list.some(x=>x?.token===legacy.token))list.push({token:legacy.token,expiresAt:legacy.expiresAt});
  }catch{}
  const seen=new Set();
  return list.map(cleanEntry).filter(x=>x&&!seen.has(x.token)&&seen.add(x.token)).slice(0,MAX_PEOPLE);
 }
 function writeSaved(list){
  const data=JSON.stringify(list.slice(0,MAX_PEOPLE));
  try{
   const target=getPersistent();
   if(!target)return false;
   target.setItem(REMEMBERED_KEY,data);
   if(target.getItem(REMEMBERED_KEY)!==data)return false;
   target.removeItem(REMEMBER_KEY);
   return true;
  }catch{return false;}
 }

 const sessionValue=store(getSession,"getItem",SESSION_KEY);
 const session=valid(sessionValue)?sessionValue:null;
 let saved=readSaved();
 // An explicitly opened link always wins, and a malformed one never silently
 // opens someone else. Otherwise this tab's link, then the only remembered person.
 const token=fromHash!==null?incoming:(session||(saved.length===1?saved[0].token:null));
 if(token)store(getSession,"setItem",SESSION_KEY,token);
 store(getSession,"removeItem",PENDING_KEY);

 // Called with the server's answer for this link: remember it automatically.
 function confirm(data={}){
  if(!token)return {remembered:false};
  const expiresAt=Date.parse(data.expiresAt);
  const entry={token,personId:typeof data.personId==="string"?data.personId:null,
   name:typeof data.name==="string"?data.name:null,expiresAt:Number.isFinite(expiresAt)?expiresAt:null};
  // A newer link for the same person replaces their older, now-revoked link.
  const others=readSaved().filter(x=>x.token!==token&&!(entry.personId&&x.personId===entry.personId));
  const remembered=writeSaved([cleanEntry(entry)||entry,...others]);
  saved=readSaved();
  return {remembered};
 }
 // The server says this link expired. Keep it (a parent can extend it) but
 // remember when, so it is eventually cleared if nobody does.
 function noteExpired(expiredAt){
  const at=Date.parse(expiredAt);if(!token||!Number.isFinite(at))return;
  const list=readSaved(),entry=list.find(x=>x.token===token);
  if(entry&&entry.expiresAt!==at){entry.expiresAt=at;writeSaved(list);}
 }
 function isRemembered(){return !!token&&readSaved().some(x=>x.token===token);}
 // Family members remembered on this device, for a "Who's picking?" chooser.
 function people(){
  saved=readSaved();
  return saved.map((x,index)=>({index,personId:x.personId,name:x.name||"Saved pumpkin link",current:x.token===token}));
 }
 function choose(index){
  const entry=saved[index];
  if(!entry||!readSaved().some(x=>x.token===entry.token))return false;
  store(getSession,"setItem",SESSION_KEY,entry.token);
  return true;
 }
 function clearSession(){store(getSession,"removeItem",SESSION_KEY);}
 // Remove only this tab's link. Other remembered family members stay.
 function clearCurrent(){
  if(store(getSession,"getItem",SESSION_KEY)===token)store(getSession,"removeItem",SESSION_KEY);
  const list=readSaved(),rest=list.filter(x=>x.token!==token);
  if(rest.length!==list.length)writeSaved(rest);
  saved=readSaved();
 }
 function forget(){clearCurrent();}
 function invalidate(){clearCurrent();}
 function link(){return token?baseUrl+"#invite="+token:null;}
 return {token,confirm,noteExpired,isRemembered,people,choose,clearSession,forget,invalidate,link};
}
