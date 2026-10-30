// Invitation recovery on a device the family member explicitly trusts.
// A private link is a bearer capability. Never persist it without a user tap.
export const SESSION_KEY="pumpkin-person-invite";
export const REMEMBER_KEY="pumpkin-person-invite-remembered-v1";
const VALID=/^[A-Za-z0-9_-]{43}$/;

export function createInviteAccess({hash="",baseUrl="",clearFragment=()=>{},getSession=()=>null,getPersistent=()=>null,now=()=>Date.now()}={}){
 const store=(getter,method,...args)=>{try{const target=getter();return target?.[method]?.(...args)??null;}catch{return null;}};
 const valid=value=>typeof value==="string"&&VALID.test(value);
 const fromHash=new URLSearchParams(hash.startsWith("#")?hash.slice(1):hash).get("invite");
 if(fromHash!==null)clearFragment();
 let remembered=null;
 try{
   const value=store(getPersistent,"getItem",REMEMBER_KEY);
   const saved=value?JSON.parse(value):null;
   if(saved&&valid(saved.token)&&Number.isFinite(saved.expiresAt)&&saved.expiresAt>now())remembered=saved;
 }catch{}
 if(!remembered)store(getPersistent,"removeItem",REMEMBER_KEY);
 const incoming=valid(fromHash)?fromHash:null;
 const session=store(getSession,"getItem",SESSION_KEY);
 const token=incoming||(valid(session)?session:null)||remembered?.token||null;
 if(incoming){
   store(getSession,"setItem",SESSION_KEY,incoming);
   // Opening a different family link must never silently preserve the old person's login.
   if(remembered&&remembered.token!==incoming){
     store(getPersistent,"removeItem",REMEMBER_KEY);
     remembered=null;
   }
 }else if(token){
   store(getSession,"setItem",SESSION_KEY,token);
 }
 function isRemembered(){return !!remembered&&remembered.token===token&&remembered.expiresAt>now();}
 function remember(expiry){
   if(!token)return {ok:false,message:"Open your private invitation first."};
   const expiresAt=Date.parse(expiry);
   if(!Number.isFinite(expiresAt)||expiresAt<=now())return {ok:false,message:"This invitation has expired. Ask the organizer for a new link."};
   const data=JSON.stringify({token,expiresAt});
   try{
     const target=getPersistent();
     if(!target)throw Error("Unavailable");
     target.setItem(REMEMBER_KEY,data);
     if(target.getItem(REMEMBER_KEY)!==data)throw Error("Not saved");
     remembered={token,expiresAt};
     return {ok:true};
   }catch{return {ok:false,message:"This browser cannot remember invitations. Copy your private link instead."};}
 }
 function forget(){
   store(getSession,"removeItem",SESSION_KEY);
   store(getPersistent,"removeItem",REMEMBER_KEY);
   remembered=null;
 }
 function invalidate(){
   if(store(getSession,"getItem",SESSION_KEY)===token)store(getSession,"removeItem",SESSION_KEY);
   if(remembered?.token===token)store(getPersistent,"removeItem",REMEMBER_KEY);
   remembered=null;
 }
 function link(){return token?baseUrl+"#invite="+token:null;}
 return {token,remember,isRemembered,forget,invalidate,link};
}
